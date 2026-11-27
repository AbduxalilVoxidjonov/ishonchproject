using IshonchDesktop.Marking;
using IshonchDesktop.Models;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace IshonchDesktop.UI;

/// <summary>
/// Bitta tab: yuqorida navigatsiya paneli, pastda WebView2. Har bir profil (baza / soliq) alohida
/// cookie va login saqlaydi, shuning uchun bir nechta baza yonma-yon ochiq tura oladi.
/// O'ng tomonda ixtiyoriy yon panel (markirovka paneli) ko'rsatilishi mumkin.
/// </summary>
public sealed class WebTab : UserControl
{
    static readonly Dictionary<string, Task<CoreWebView2Environment>> Environments = new();

    readonly WebView2 view = new() { Dock = DockStyle.Fill };
    readonly SplitContainer split = new()
    {
        Dock = DockStyle.Fill, FixedPanel = FixedPanel.Panel2, Panel2Collapsed = true, SplitterWidth = 5,
    };
    // Brauzerdagidek: dumaloq tugmalar (Segoe MDL2 Assets belgilari) va yumaloq manzil maydoni
    readonly TextBox address = new() { BorderStyle = BorderStyle.None, Font = new Font("Segoe UI", 10f) };
    readonly NavButton back = new("\uE72B", "Orqaga (Alt+←)");
    readonly NavButton forward = new("\uE72A", "Oldinga (Alt+→)");
    readonly NavButton reload = new("\uE72C", "Yangilash (F5)");
    readonly NavButton zoomPlus = new("\uE710", "Kattalashtirish (Ctrl +)");
    readonly NavButton zoomReset = new("100%", "Asl masshtab (Ctrl 0)", text: true);
    readonly NavButton zoomMinus = new("\uE738", "Kichraytirish (Ctrl −)");

    // Brauzerdagi kabi qadamlar
    static readonly double[] ZoomSteps = { 0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0, 5.0 };
    readonly string startUrl;
    readonly TaskCompletionSource ready = new(TaskCreationOptions.RunContinuationsAsynchronously);
    Task? initTask;
    TaskCompletionSource? navigated;

    public string Title { get; private set; }
    public string ProfileKey { get; }
    public WebView2 View => view;
    public CoreWebView2? Core => view.CoreWebView2;

    /// <summary>WebView2 tayyor bo'lganda tugaydi (xato bo'lsa ham tugaydi, Core null bo'ladi).</summary>
    public Task Ready => ready.Task;

    /// <summary>Birinchi sahifa yuklanishidan oldin chaqiriladi (skriptlarni ulash uchun).</summary>
    public Func<WebTab, Task>? BeforeNavigate { get; set; }

    public MarkingSession? Marking { get; set; }
    public U4790Session? U4790 { get; set; }

    /// <summary>Sarlavha o'zgarganda tab nomini yangilash uchun.</summary>
    public event Action<WebTab>? TitleChanged;

    /// <summary>Tabni oldinga chiqarish so'raldi (masalan, my.soliq.uz ga kirish kerak).</summary>
    public event Action<WebTab>? ActivateRequested;

    public void Activate()
    {
        if (IsDisposed) return;
        if (InvokeRequired) { try { BeginInvoke(() => ActivateRequested?.Invoke(this)); } catch { } return; }
        ActivateRequested?.Invoke(this);
    }

    /// <summary>Sahifa yangi oyna ochmoqchi bo'lsa — dastur uni yangi tab qilib ochadi.</summary>
    public event Action<WebTab, string>? OpenRequested;

    public WebTab(string title, string profileKey, string url)
    {
        Title = title;
        ProfileKey = profileKey;
        startUrl = url;
        Dock = DockStyle.Fill;

        var bar = new Panel { Dock = DockStyle.Top, Height = LogicalToDeviceUnits(42), Padding = new Padding(LogicalToDeviceUnits(6), LogicalToDeviceUnits(5), LogicalToDeviceUnits(8), LogicalToDeviceUnits(5)), BackColor = BrowserTabStrip.ActiveBack };
        bar.Paint += (_, e) => { using var pen = new Pen(Color.FromArgb(218, 224, 232)); e.Graphics.DrawLine(pen, 0, bar.Height - 1, bar.Width, bar.Height - 1); };
        var pill = new AddressPill(address) { Dock = DockStyle.Fill };
        // Dock tartibi: oxirgi qo'shilgan birinchi joylashadi
        zoomMinus.Dock = zoomReset.Dock = zoomPlus.Dock = DockStyle.Right;
        bar.Controls.Add(pill);
        bar.Controls.Add(Gap(6, DockStyle.Right));
        bar.Controls.Add(zoomMinus);
        bar.Controls.Add(zoomReset);
        bar.Controls.Add(zoomPlus);
        bar.Controls.Add(Gap(8, DockStyle.Left));
        // my.soliq.uz tabida: bir bosishda «Markirovka kodini tekshirish» bo'limiga o'tadi
        if (profileKey == "soliq" || profileKey.StartsWith("soliq-"))
        {
            var check = PanelStyle.Secondary(new Button { Text = "Markirovkani tekshirish", Width = LogicalToDeviceUnits(170), Dock = DockStyle.Left });
            check.Click += (_, _) => Navigate("https://my.soliq.uz/remotes-services/markirovka/product_markirovka");
            bar.Controls.Add(check);
            bar.Controls.Add(Gap(8, DockStyle.Left));
        }
        bar.Controls.Add(reload);
        bar.Controls.Add(forward);
        bar.Controls.Add(back);
        zoomReset.Width = LogicalToDeviceUnits(52);
        split.Panel1.Controls.Add(view);
        Controls.Add(split);
        Controls.Add(bar);

        back.Click += (_, _) => { if (view.CanGoBack) view.GoBack(); };
        forward.Click += (_, _) => { if (view.CanGoForward) view.GoForward(); };
        reload.Click += (_, _) => { if (view.CoreWebView2 is not null) view.Reload(); }; // tab hali ochilib ulgurmagan bo'lsa — hech narsa
        zoomPlus.Click += (_, _) => ZoomBy(+1);
        zoomMinus.Click += (_, _) => ZoomBy(-1);
        zoomReset.Click += (_, _) => SetZoom(1.0);
        address.KeyDown += (_, e) =>
        {
            if (e.KeyCode == Keys.Escape) { e.SuppressKeyPress = true; address.Text = view.CoreWebView2?.Source ?? address.Text; view.Focus(); return; }
            if (e.KeyCode != Keys.Enter) return;
            e.SuppressKeyPress = true;
            Navigate(address.Text.Trim());
            view.Focus();
        };
        // Brauzerdagidek: manzil maydoniga kirilganda hammasi belgilanadi
        address.Enter += (_, _) => BeginInvoke(address.SelectAll);
        back.Enabled = forward.Enabled = false;
    }

    Control Gap(int width, DockStyle dock) => new Panel { Width = LogicalToDeviceUnits(width), Dock = dock, BackColor = Color.Transparent };

    /// <summary>Manzil qatoriga o'tadi (Ctrl+L / F6), matn belgilanadi.</summary>
    public void FocusAddress()
    {
        address.Focus();
        address.SelectAll();
    }

    public static Task<CoreWebView2Environment> GetEnvironmentAsync(string key)
    {
        if (!Environments.TryGetValue(key, out var task))
        {
            var folder = Path.Combine(Paths.Profiles, key);
            // Faqat sinov uchun: ISHONCH_DEBUG_PORT berilsa har bir muhit o'z debug portini oladi (asos + tartib raqami)
            CoreWebView2EnvironmentOptions? options = null;
            if (int.TryParse(Environment.GetEnvironmentVariable("ISHONCH_DEBUG_PORT"), out var basePort) && basePort > 0)
            {
                var port = basePort + Environments.Count;
                options = new CoreWebView2EnvironmentOptions($"--remote-debugging-port={port}");
                Log.Write($"Debug port: {key} → {port}");
            }
            // 1C bazalari rus tilida (sana «dd.MM.yyyy HH:mm:ss», sonlar «1 602 514,85») — Windows tili inglizcha bo'lsa ham
            if (key.StartsWith("1c-", StringComparison.OrdinalIgnoreCase))
            {
                options ??= new CoreWebView2EnvironmentOptions();
                options.Language = "ru-RU";
            }
            Environments[key] = task = CoreWebView2Environment.CreateAsync(null, folder, options);
        }
        return task;
    }

    public Task InitAsync() => initTask ??= InitSafeAsync();

    async Task InitSafeAsync()
    {
        try { await InitCoreAsync(); }
        catch (Exception e)
        {
            Log.Error("WebTab.Init " + ProfileKey, e);
            ready.TrySetResult();
        }
    }

    async Task InitCoreAsync()
    {
        Log.Write("Init boshlandi: " + ProfileKey);
        try
        {
            _ = Handle; // tanlanmagan tabda ham WebView2 yaratilishi uchun
            await view.EnsureCoreWebView2Async(await GetEnvironmentAsync(ProfileKey));
        }
        catch (Exception e)
        {
            Log.Error("WebView2 yaratish " + ProfileKey, e);
            ready.TrySetResult();
            MessageBox.Show(this, "WebView2 ishga tushmadi: " + e.Message, AppInfo.DisplayName, MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        var core = view.CoreWebView2;
        core.Settings.AreDevToolsEnabled = true;
        core.Settings.IsZoomControlEnabled = true; // Ctrl + g'ildirak / "+" / "-" / 0 ham ishlaydi
        view.ZoomFactor = ZoomStore.Get(ProfileKey);
        UpdateZoomLabel();
        view.ZoomFactorChanged += (_, _) =>
        {
            UpdateZoomLabel();
            ZoomStore.Set(ProfileKey, view.ZoomFactor);
            _ = Unmarked.OneCRoom.OnResizedAsync(core);
        };
        // 1C avtomatikasi uchun sahifaning haqiqiy joyi (CSS piksel): boshqaruvchi o'lchami / (DPI × masshtab).
        // Oyna yoki panel o'lchami o'zgarsa 1C sahifasi qayta moslanadi (kerak bo'lsa kichraytirib sig'diriladi)
        Unmarked.OneCRoom.Register(core, () =>
        {
            if (IsDisposed || view.ClientSize.Width <= 0 || view.ClientSize.Height <= 0) return null;
            var k = view.DeviceDpi / 96.0 * view.ZoomFactor;
            return (view.ClientSize.Width / k, view.ClientSize.Height / k);
        });
        view.Resize += (_, _) => _ = Unmarked.OneCRoom.OnResizedAsync(core);
        core.NewWindowRequested += (_, e) => { e.Handled = true; OpenRequested?.Invoke(this, e.Uri); };
        core.SourceChanged += (_, _) => address.Text = core.Source;
        core.DocumentTitleChanged += (_, _) =>
        {
            if (!string.IsNullOrWhiteSpace(core.DocumentTitle)) Title = core.DocumentTitle;
            TitleChanged?.Invoke(this);
        };
        core.HistoryChanged += (_, _) => { back.Enabled = view.CanGoBack; forward.Enabled = view.CanGoForward; };
        core.NavigationCompleted += (_, _) => navigated?.TrySetResult();
        back.Enabled = forward.Enabled = false;

        if (BeforeNavigate is { } hook) await hook(this);
        ready.TrySetResult();
        Log.Write("Navigate: " + startUrl);
        Navigate(startUrl);
    }

    public void Navigate(string url)
    {
        if (string.IsNullOrWhiteSpace(url)) return;
        if (!url.Contains("://")) url = "https://" + url;
        if (view.CoreWebView2 is null) return;
        try { view.CoreWebView2.Navigate(url); } catch { /* noto'g'ri manzil */ }
    }

    // ---- masshtab -------------------------------------------------------------------------

    void UpdateZoomLabel() { zoomReset.Text = Math.Round(view.ZoomFactor * 100) + "%"; zoomReset.Invalidate(); }

    public void SetZoom(double z) => view.ZoomFactor = Math.Clamp(z, 0.25, 5.0);

    /// <summary>Keyingi (+1) yoki oldingi (-1) masshtab qadamiga o'tadi.</summary>
    public void ZoomBy(int direction)
    {
        var current = view.ZoomFactor;
        var next = direction > 0
            ? ZoomSteps.FirstOrDefault(s => s > current + 0.001, ZoomSteps[^1])
            : ZoomSteps.LastOrDefault(s => s < current - 0.001, ZoomSteps[0]);
        SetZoom(next);
    }

    /// <summary>Navigate dan keyin sahifa yuklanishini kutadi (ko'pi bilan 30 soniya).</summary>
    public async Task WaitNavigatedAsync()
    {
        navigated = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var wait = navigated.Task;
        await Task.WhenAny(wait, Task.Delay(TimeSpan.FromSeconds(30)));
    }

    // ---- o'ng tomondagi yon panel --------------------------------------------------------

    readonly Dictionary<string, Control> sidePanels = new();

    public bool HasSidePanel(string key) => sidePanels.TryGetValue(key, out var p) && !p.IsDisposed;

    public Control? GetSidePanel(string key) => sidePanels.TryGetValue(key, out var p) && !p.IsDisposed ? p : null;

    /// <summary>Yon panel qo'shadi (kalit bo'yicha: "marking", "unmarked"); bir vaqtda bittasi ko'rinadi.</summary>
    public void AttachSidePanel(Control panel, int width, string key = "marking")
    {
        panel.Dock = DockStyle.Fill;
        sidePanels[key] = panel;
        ShowSidePanel(width, key);
    }

    System.Windows.Forms.Timer? fixTimer;

    async Task FixWhenReadyAsync()
    {
        try
        {
            await Ready;
            if (IsDisposed || split.Panel2Collapsed || view.CoreWebView2 is not { } core) return;
            await Unmarked.OneCRoom.FixAsync(core, true);
            // 1C sahifasi hali yuklanmagan bo'lsa (kirish oynasi) moslash qo'llanmay qoladi — panel ochiq ekan har 3 soniyada
            // tekshiriladi (qo'llangan bo'lsa hech narsa qilmaydi)
            if (fixTimer is null)
            {
                fixTimer = new System.Windows.Forms.Timer { Interval = 3000 };
                fixTimer.Tick += async (_, _) =>
                {
                    if (IsDisposed || split.Panel2Collapsed || view.CoreWebView2 is not { } c) return;
                    await Unmarked.OneCRoom.EnsureAsync(c);
                };
            }
            fixTimer.Start();
        }
        catch (Exception e) { Log.Error("1C oynasini moslash (panel)", e); }
    }

    public void HideSidePanel()
    {
        split.Panel2Collapsed = true;
        fixTimer?.Stop();
        if (view.CoreWebView2 is { } core) _ = Unmarked.OneCRoom.FixAsync(core, false);
    }

    /// <summary>Panel kengligi oyna kengligiga mos: 1/3 ga yaqin, lekin 340-560 px (DPI ga moslanadi) oralig'ida.</summary>
    public void ShowSidePanel(int width, string key = "marking")
    {
        if (sidePanels.TryGetValue(key, out var panel) && !split.Panel2.Controls.Contains(panel))
        {
            split.Panel2.Controls.Clear();
            split.Panel2.Controls.Add(panel);
        }
        split.Panel2Collapsed = false;
        BeginInvoke(() =>
        {
            try
            {
                var min = LogicalToDeviceUnits(340);
                var max = LogicalToDeviceUnits(560);
                var wanted = Math.Clamp((int)(split.Width * 0.34), min, max);
                // Juda tor oynada asosiy sahifa uchun joy qolsin
                wanted = Math.Min(wanted, Math.Max(LogicalToDeviceUnits(240), split.Width - LogicalToDeviceUnits(260)));
                split.SplitterDistance = Math.Max(LogicalToDeviceUnits(200), split.Width - wanted - split.SplitterWidth);
            }
            catch { /* o'lcham hali yo'q */ }
            // Panel ochiq ekan 1C sahifasi bir xil kenglikda chizilib oynaga sig'diriladi (qotiriladi). Tab hali tayyor
            // bo'lmasa (panel dastur ochilishi bilan ochilgan) — tayyor bo'lgach qo'llanadi
            _ = FixWhenReadyAsync();
        });
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            Marking?.Dispose();
            fixTimer?.Dispose();
            view.Dispose();
        }
        base.Dispose(disposing);
    }
}

/// <summary>Brauzerdagidek dumaloq tugma: belgi (Segoe MDL2 Assets) yoki qisqa matn, ustiga kelinganda kulrang doira.</summary>
sealed class NavButton : Control
{
    readonly bool text;
    bool hover, down;
    readonly ToolTip tip = new();

    public NavButton(string glyph, string hint, bool text = false)
    {
        this.text = text;
        Text = glyph;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.SupportsTransparentBackColor, true);
        BackColor = Color.Transparent;
        Dock = DockStyle.Left;
        Width = LogicalToDeviceUnits(34);
        Cursor = Cursors.Hand;
        Font = text ? new Font("Segoe UI", 8.5f) : new Font("Segoe MDL2 Assets", 10.5f);
        tip.SetToolTip(this, hint);
        EnabledChanged += (_, _) => Invalidate();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        var d = Math.Min(Height, LogicalToDeviceUnits(32));
        var r = text ? new Rectangle(1, (Height - d) / 2, Width - 2, d) : new Rectangle((Width - d) / 2, (Height - d) / 2, d, d);
        if (Enabled && (hover || down))
        {
            using var b = new SolidBrush(down ? Color.FromArgb(203, 213, 225) : Color.FromArgb(226, 232, 240));
            if (text) { using var p = Rounded(r, d / 2); g.FillPath(b, p); } else g.FillEllipse(b, r);
        }
        TextRenderer.DrawText(g, Text, Font, r, Enabled ? Color.FromArgb(51, 65, 85) : Color.FromArgb(176, 186, 200),
            TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
    }

    internal static System.Drawing.Drawing2D.GraphicsPath Rounded(Rectangle r, int radius)
    {
        var p = new System.Drawing.Drawing2D.GraphicsPath();
        var dd = Math.Max(1, radius * 2);
        p.AddArc(r.Left, r.Top, dd, dd, 180, 90);
        p.AddArc(r.Right - dd, r.Top, dd, dd, 270, 90);
        p.AddArc(r.Right - dd, r.Bottom - dd, dd, dd, 0, 90);
        p.AddArc(r.Left, r.Bottom - dd, dd, dd, 90, 90);
        p.CloseFigure();
        return p;
    }

    protected override void OnMouseEnter(EventArgs e) { base.OnMouseEnter(e); hover = true; Invalidate(); }
    protected override void OnMouseLeave(EventArgs e) { base.OnMouseLeave(e); hover = down = false; Invalidate(); }
    protected override void OnMouseDown(MouseEventArgs e) { base.OnMouseDown(e); down = true; Invalidate(); }
    protected override void OnMouseUp(MouseEventArgs e) { base.OnMouseUp(e); down = false; Invalidate(); }
    protected override void OnTextChanged(EventArgs e) { base.OnTextChanged(e); Invalidate(); }
}

/// <summary>Yumaloq (pill) manzil maydoni: ichida chegarasiz TextBox; fokusda ko'k chegara.</summary>
sealed class AddressPill : Panel
{
    readonly TextBox box;

    public AddressPill(TextBox box)
    {
        this.box = box;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw | ControlStyles.SupportsTransparentBackColor, true);
        BackColor = Color.Transparent;
        box.BackColor = Color.FromArgb(237, 241, 246);
        box.ForeColor = Color.FromArgb(30, 41, 59);
        Controls.Add(box);
        box.GotFocus += (_, _) => { box.BackColor = Color.White; Invalidate(); };
        box.LostFocus += (_, _) => { box.BackColor = Color.FromArgb(237, 241, 246); Invalidate(); };
        Click += (_, _) => box.Focus();
    }

    protected override void OnLayout(LayoutEventArgs levent)
    {
        base.OnLayout(levent);
        var pad = LogicalToDeviceUnits(14);
        box.SetBounds(pad, (Height - box.PreferredHeight) / 2 + 1, Math.Max(10, Width - pad * 2), box.PreferredHeight);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        var r = new Rectangle(0, 0, Width - 1, Height - 1);
        using var path = NavButton.Rounded(r, r.Height / 2);
        using var b = new SolidBrush(box.BackColor);
        g.FillPath(b, path);
        if (box.Focused) { using var pen = new Pen(Color.FromArgb(37, 99, 235), 1.6f); g.DrawPath(pen, path); }
    }
}
