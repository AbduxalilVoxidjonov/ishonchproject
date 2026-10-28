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
    readonly TextBox address = new() { Dock = DockStyle.Fill };
    readonly Button back = new() { Text = "◀", Width = 36, Dock = DockStyle.Left };
    readonly Button forward = new() { Text = "▶", Width = 36, Dock = DockStyle.Left };
    readonly Button reload = new() { Text = "⟳", Width = 36, Dock = DockStyle.Left };
    readonly Button zoomPlus = new() { Text = "+", Width = 32, Dock = DockStyle.Right };
    readonly Button zoomReset = new() { Text = "100%", Width = 56, Dock = DockStyle.Right };
    readonly Button zoomMinus = new() { Text = "−", Width = 32, Dock = DockStyle.Right };

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

    /// <summary>Sarlavha o'zgarganda tab nomini yangilash uchun.</summary>
    public event Action<WebTab>? TitleChanged;

    /// <summary>Sahifa yangi oyna ochmoqchi bo'lsa — dastur uni yangi tab qilib ochadi.</summary>
    public event Action<WebTab, string>? OpenRequested;

    public WebTab(string title, string profileKey, string url)
    {
        Title = title;
        ProfileKey = profileKey;
        startUrl = url;
        Dock = DockStyle.Fill;

        var bar = new Panel { Dock = DockStyle.Top, Height = LogicalToDeviceUnits(32), Padding = new Padding(4, 3, 4, 3) };
        // Dock tartibi: oxirgi qo'shilgan birinchi joylashadi
        bar.Controls.Add(address);
        bar.Controls.Add(zoomMinus);
        bar.Controls.Add(zoomReset);
        bar.Controls.Add(zoomPlus);
        bar.Controls.Add(reload);
        bar.Controls.Add(forward);
        bar.Controls.Add(back);
        split.Panel1.Controls.Add(view);
        Controls.Add(split);
        Controls.Add(bar);

        back.Click += (_, _) => { if (view.CanGoBack) view.GoBack(); };
        forward.Click += (_, _) => { if (view.CanGoForward) view.GoForward(); };
        reload.Click += (_, _) => view.Reload();
        zoomPlus.Click += (_, _) => ZoomBy(+1);
        zoomMinus.Click += (_, _) => ZoomBy(-1);
        zoomReset.Click += (_, _) => SetZoom(1.0);
        address.KeyDown += (_, e) =>
        {
            if (e.KeyCode != Keys.Enter) return;
            e.SuppressKeyPress = true;
            Navigate(address.Text.Trim());
        };
    }

    public static Task<CoreWebView2Environment> GetEnvironmentAsync(string key)
    {
        if (!Environments.TryGetValue(key, out var task))
        {
            var folder = Path.Combine(Paths.Profiles, key);
            Environments[key] = task = CoreWebView2Environment.CreateAsync(null, folder);
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
            MessageBox.Show(this, "WebView2 ishga tushmadi: " + e.Message, "Ishonch", MessageBoxButtons.OK, MessageBoxIcon.Error);
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
        };
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

    void UpdateZoomLabel() => zoomReset.Text = Math.Round(view.ZoomFactor * 100) + "%";

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

    public void AttachSidePanel(Control panel, int width)
    {
        panel.Dock = DockStyle.Fill;
        split.Panel2.Controls.Clear();
        split.Panel2.Controls.Add(panel);
        ShowSidePanel(width);
    }

    /// <summary>Panel kengligi oyna kengligiga mos: 1/3 ga yaqin, lekin 340-560 px (DPI ga moslanadi) oralig'ida.</summary>
    public void ShowSidePanel(int width)
    {
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
        });
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            Marking?.Dispose();
            view.Dispose();
        }
        base.Dispose(disposing);
    }
}
