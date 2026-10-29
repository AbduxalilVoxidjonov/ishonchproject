using IshonchDesktop.Models;
using UpdateInstaller = IshonchDesktop.Update.UpdateInstaller;
using IshonchDesktop.Update;

namespace IshonchDesktop.UI;

/// <summary>
/// Asosiy oyna: tepada tablar (Bosh sahifa + ochilgan bazalar/saytlar), pastda tanlangan tab.
/// Har bir tab alohida WebView2, shuning uchun bir nechta bazani bir vaqtda ochiq ushlash mumkin.
/// </summary>
public sealed class MainForm : Form
{
    int CloseSize => LogicalToDeviceUnits(14);

    readonly BaseStore store = new();
    readonly Settings settings = Settings.Load();
    readonly TabControl tabs = new()
    {
        Dock = DockStyle.Fill, DrawMode = TabDrawMode.OwnerDrawFixed,
        SizeMode = TabSizeMode.Fixed, ItemSize = new Size(190, 30), Padding = new Point(14, 4),
    };
    readonly HomeControl home;

    public MainForm()
    {
        Text = AppInfo.DisplayName;
        // Oyna va vazifalar paneli belgisi — exe ga joylangan belgi (Resources\app.ico)
        if (AppIcon.ForWindow() is { } appIcon) Icon = appIcon;
        KeyPreview = true;
        ZoomStore.Settings = settings;
        MinimumSize = new Size(820, 560);
        RestoreWindow();

        store.Load();
        home = new HomeControl(store);
        home.ApplyZoom(settings.GetZoom("home"));
        home.ZoomChanged += z => ZoomStore.Set("home", z);
        ApplyTabMetrics();
        DpiChanged += (_, _) => ApplyTabMetrics();

        var homePage = new TabPage("Bosh sahifa") { Padding = new Padding(0) };
        homePage.Controls.Add(home);
        tabs.TabPages.Add(homePage);
        Controls.Add(tabs);
        // Pastda: ulangan fiskal modul va uning holati
        Controls.Add(new FiscalStatusBar());

        home.OpenOneC += b => OpenBase(b);
        home.OpenSoliq += b => OpenSoliqTab(b);
        home.OpenMarking += async b => await OpenMarkingAsync(b);
        home.OpenUnmarked += b => OpenUnmarked(b);
        home.OpenElektr += () => OpenElektrTab();
        home.SelectionChanged += b => settings.LastBaseId = b.Id;

        updater = new UpdateCoordinator(this, settings, home);
        problems = new ProblemSender(() => (settings.LogCollectorUrl, settings.LogCollectorKey));
        problems.Start();
        BuildMenu();
        UpdateInstaller.CleanupOld(Environment.ProcessPath ?? "");

        tabs.DrawItem += DrawTab;
        tabs.MouseDown += TabMouseDown;
        FormClosing += (_, _) => { SaveOpenTabs(); SaveWindow(); settings.Save(); };
        // Yangilanishdan keyin yangi nusxa ishga tushadi (ma'lumotlar saqlangandan so'ng)
        FormClosed += (_, _) =>
        {
            problems.Dispose();
            if (updater.PendingRestart is { } exe)
                try { UpdateInstaller.Launch(exe); } catch (Exception e) { Log.Error("restart", e); }
        };
        Shown += async (_, _) =>
        {
            if (settings.LastBaseId is int id) home.Select(id);
            RestoreOpenTabs();
            await updater.CheckOnStartupAsync();
        };
    }

    readonly UpdateCoordinator updater;
    readonly ProblemSender problems;

    void BuildMenu()
    {
        // «Yordam» — bosh sahifada «Elektr» ostidagi tugma; bosilganda shu menyu ochiladi (tepada menyu satri yo'q)
        var help = new ContextMenuStrip { Font = new Font("Segoe UI", 10f) };
        help.Items.Add($"📞  Telefon: {AppInfo.SupportPhone}  (nusxalash)", null, (_, _) =>
        {
            try { Clipboard.SetText(AppInfo.SupportPhone); } catch { /* buferga yozilmadi */ }
        });
        help.Items.Add($"✈  Telegram: @{AppInfo.SupportTelegram}", null, (_, _) =>
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("https://t.me/" + AppInfo.SupportTelegram) { UseShellExecute = true }));
        help.Items.Add(new ToolStripSeparator());
        help.Items.Add("Yangilanishni tekshirish", null, async (_, _) => await updater.CheckAsync(manual: true));
        help.Items.Add("Yangilanish sozlamalari…", null, (_, _) => updater.ShowSettings());
        help.Items.Add("Xatolar jurnali (yig'uvchi)…", null, (_, _) => ProblemLogDialog.Show(this, settings, problems));
        help.Items.Add(new ToolStripSeparator());
        help.Items.Add("Ma'lumotlar papkasini ochish", null, (_, _) =>
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("explorer.exe", $"\"{Paths.AppData}\"") { UseShellExecute = true }));
        help.Items.Add("Dastur haqida", null, (_, _) =>
            MessageBox.Show(this, $"Versiya: {AppInfo.Text}\n\nYordam uchun:\nTelefon: {AppInfo.SupportPhone}\nTelegram: @{AppInfo.SupportTelegram}\n\nMa'lumotlar: {Paths.AppData}",
                "Dastur haqida", MessageBoxButtons.OK, MessageBoxIcon.Information));
        home.HelpClicked += anchor => help.Show(anchor, new Point(0, anchor.Height));
    }

    // ---- ochiq tablarni saqlash/tiklash --------------------------------------------------------

    void SaveOpenTabs()
    {
        var list = new List<string>();
        foreach (TabPage p in tabs.TabPages.Cast<TabPage>().Skip(1))
        {
            var key = p.Tag as string;
            if (key is null || key.Contains('#') || key.StartsWith("het-")) continue;
            list.Add(key);
        }
        settings.OpenTabs = list;
    }

    void RestoreOpenTabs()
    {
        if (!settings.RestoreTabs) return;
        try
        {
            foreach (var key in settings.OpenTabs.ToList())
            {
                if (FindTab(key) is not null) continue;
                if (key == ElektrKey) OpenElektrTab(select: false);
                else if (key == "soliq") OpenSoliqTab(null, select: false);
                else if (key.StartsWith("soliq-") && store.Bases.FirstOrDefault(b => "soliq-" + b.Inn == key) is { } sb) OpenSoliqTab(sb, select: false);
                else if (store.Bases.FirstOrDefault(b => b.ProfileKey == key) is { } bb) OpenBase(bb, select: false);
            }
        }
        catch (Exception e) { Log.Error("RestoreOpenTabs", e); }
    }

    // ---- Markirovkasiz sotish ---------------------------------------------------------------

    IEnumerable<UnmarkedPanel> UnmarkedPanels() => tabs.TabPages.Cast<TabPage>()
        .Select(p => p.Controls.OfType<WebTab>().FirstOrDefault()?.GetSidePanel("unmarked") as UnmarkedPanel)
        .Where(p => p is not null)!;

    /// <summary>Ochiq bazalarning hammasida (har biri o'z paneli qiymatlari bilan) bir vaqtda ishga tushiradi.</summary>
    async Task StartAllUnmarkedAsync()
    {
        var panels = UnmarkedPanels().Where(p => !p.Running).ToList();
        if (panels.Count == 0)
        {
            MessageBox.Show(this, "Ochiq «Markirovkasiz sotish» paneli yo'q. Bosh sahifada bazani tanlab panelni oching.", AppInfo.DisplayName);
            return;
        }
        var bad = panels.Select(p => (p, err: p.ValidateInput())).Where(x => x.err is not null).ToList();
        if (bad.Count > 0)
        {
            MessageBox.Show(this, string.Join("\n", bad.Select(x => x.p.BaseTitle + ": " + x.err)), AppInfo.DisplayName, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        var text = string.Join("\n", panels.Select(p => "• " + p.Describe()));
        if (MessageBox.Show(this, text + "\n\nHammasi bir vaqtda boshlansinmi?", AppInfo.DisplayName, MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
        await Task.WhenAll(panels.Select(p => p.StartAsync(confirm: false)));
    }

    /// <summary>Shu firma INN dagi my.soliq.uz tabi (orqa fonda ochiladi): markirovka tekshiruvi va E-POS sotuvi uchun.</summary>
    Func<Task<WebTab>> SoliqTabFor(BaseEntry b) => async () =>
    {
        var soliq = OpenSoliqTab(b, select: false);
        await soliq.Ready;
        return soliq;
    };

    void OpenUnmarked(BaseEntry b)
    {
        var tab = OpenBase(b);
        if (tab.HasSidePanel("unmarked")) { tab.ShowSidePanel(450, "unmarked"); return; }
        tab.AttachSidePanel(new UnmarkedPanel(tab, settings, b.ProfileKey, b.Db + " — " + b.Firm, b, SoliqTabFor(b)), 450, "unmarked");
    }

    // ---- Elektr -------------------------------------------------------------------------------

    const string ElektrKey = "elektr";

    void OpenElektrTab(bool select = true)
    {
        if (FindTab(ElektrKey) is { } existing)
        {
            if (select) tabs.SelectedTab = existing;
            return;
        }
        var page = new TabPage("Elektr") { Tag = ElektrKey, Padding = new Padding(0) };
        page.Controls.Add(new ElektrTab(OpenCabinetAsync));
        tabs.TabPages.Add(page);
        if (select) tabs.SelectedTab = page;
    }

    static readonly string CabinetFillScript = LoadCabinetScript();

    static string LoadCabinetScript() => System.Text.Encoding.UTF8.GetString(Marking.MkResources.Bytes("elektr/cabinet-fill.js") ?? Array.Empty<byte>());

    /// <summary>
    /// cabinet.het.uz ni shu akkaunt uchun alohida profilda ochadi va kirish formasini to'ldirib yuboradi.
    /// Qaytaradi: xato matni yoki null.
    /// </summary>
    async Task<string?> OpenCabinetAsync(string login, string password)
    {
        try
        {
            var safe = string.Concat(login.Select(c => char.IsLetterOrDigit(c) ? c : '_'));
            var key = "het-" + safe;
            if (FindTab(key) is { } existing) { tabs.SelectedTab = existing; return null; }

            var web = AddWebTab(new WebTab("Elektr — " + login, key, "https://cabinet.het.uz/"), key, select: true);
            await web.Ready;
            var core = web.Core;
            if (core is null) return "Brauzer ishga tushmadi.";

            var runs = 0;
            void OnDone(object? s, Microsoft.Web.WebView2.Core.CoreWebView2NavigationCompletedEventArgs e)
            {
                // Kirish formasi bir-ikki marta to'ldiriladi (sahifa qayta yuklansa); noto'g'ri parol bilan takror urinilmaydi
                if (++runs >= 2) core.NavigationCompleted -= OnDone;
                if (!e.IsSuccess) return;
                if (!Uri.TryCreate(core.Source, UriKind.Absolute, out var u) || !u.Host.Equals("cabinet.het.uz", StringComparison.OrdinalIgnoreCase)) return;
                var script = CabinetFillScript
                    .Replace("__LOGIN__", System.Text.Json.JsonSerializer.Serialize(login))
                    .Replace("__PASS__", System.Text.Json.JsonSerializer.Serialize(password));
                _ = core.ExecuteScriptAsync(script);
            }
            core.NavigationCompleted += OnDone;
            return null;
        }
        catch (Exception e)
        {
            Log.Error("OpenCabinet", e);
            return e.Message;
        }
    }

    // ---- oyna o'lchami va DPI ---------------------------------------------------------------

    /// <summary>Tab sarlavhalari DPI ga moslanadi (125%, 150% ekranlarda ham o'qiladigan bo'lsin).</summary>
    void ApplyTabMetrics()
    {
        tabs.ItemSize = new Size(LogicalToDeviceUnits(190), LogicalToDeviceUnits(30));
        tabs.Invalidate();
    }

    /// <summary>
    /// Oyna oxirgi o'lcham/joyda ochiladi; hozirgi ekranlarda ko'rinmasa (masalan monitor ajratilgan)
    /// yoki birinchi ishga tushishda ekran ish maydonining 90% ida o'rtada ochiladi.
    /// </summary>
    void RestoreWindow()
    {
        var area = Screen.FromPoint(Cursor.Position).WorkingArea;
        StartPosition = FormStartPosition.CenterScreen;
        Size = new Size(Math.Min(1400, (int)(area.Width * 0.9)), Math.Min(900, (int)(area.Height * 0.9)));

        if (settings is { WindowWidth: int w, WindowHeight: int h, WindowX: int x, WindowY: int y })
        {
            var saved = new Rectangle(x, y, w, h);
            var titleBar = new Rectangle(saved.X, saved.Y, saved.Width, 40);
            if (Screen.AllScreens.Any(s => s.WorkingArea.IntersectsWith(titleBar)))
            {
                var wa = Screen.FromRectangle(saved).WorkingArea;
                saved.Width = Math.Min(Math.Max(saved.Width, MinimumSize.Width), wa.Width);
                saved.Height = Math.Min(Math.Max(saved.Height, MinimumSize.Height), wa.Height);
                StartPosition = FormStartPosition.Manual;
                Bounds = saved;
            }
        }
        if (settings.WindowMaximized) WindowState = FormWindowState.Maximized;
    }

    void SaveWindow()
    {
        var b = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
        settings.WindowX = b.X;
        settings.WindowY = b.Y;
        settings.WindowWidth = b.Width;
        settings.WindowHeight = b.Height;
        settings.WindowMaximized = WindowState == FormWindowState.Maximized;
    }

    // ---- tablar ochish -------------------------------------------------------------------

    WebTab OpenBase(BaseEntry b, bool select = true)
    {
        var key = b.ProfileKey;
        if (FindTab(key) is { } existing)
        {
            if (select) tabs.SelectedTab = existing;
            return existing.Controls.OfType<WebTab>().First();
        }
        return AddWebTab(new WebTab(b.Db + " — " + b.Firm, key, b.Url), key, select);
    }

    WebTab OpenSoliqTab(BaseEntry? b, bool select = true)
    {
        // Soliq kabineti firma INN bo'yicha alohida profilda: bir nechta firma yonma-yon kira oladi
        var key = b is { Inn.Length: > 0 } ? "soliq-" + b.Inn : "soliq";
        if (FindTab(key) is { } existing)
        {
            if (select) tabs.SelectedTab = existing;
            return existing.Controls.OfType<WebTab>().First();
        }
        return AddWebTab(new WebTab("soliq — " + (b?.Firm ?? "umumiy"), key, "https://my.soliq.uz/login?type=legal"), key, select);
    }

    /// <summary>Tanlangan baza uchun 1C tabini ochadi va o'ng tomonda Markirovkali chek panelini ulaydi.</summary>
    async Task OpenMarkingAsync(BaseEntry b)
    {
        try
        {
            var tab = OpenBase(b);
            tab.Marking ??= new Marking.MarkingSession(tab, b, SoliqTabFor(b));
            await tab.Marking.StartAsync();
        }
        catch (Exception e)
        {
            Log.Error("OpenMarking", e, b);
            MessageBox.Show(this, "Markirovka panelini ochib bo'lmadi: " + e.Message, AppInfo.DisplayName, MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    TabPage? FindTab(string key) => tabs.TabPages.Cast<TabPage>().FirstOrDefault(p => (string?)p.Tag == key);

    WebTab AddWebTab(WebTab web, string key, bool select = true)
    {
        var page = new TabPage(Short(web.Title)) { Tag = key, Padding = new Padding(0) };
        page.Controls.Add(web);
        tabs.TabPages.Add(page);
        if (select) tabs.SelectedTab = page;

        web.TitleChanged += w => { page.Text = Short(w.Title); tabs.Invalidate(); };
        web.OpenRequested += (w, url) =>
        {
            // Yangi oyna so'ralsa — o'sha profil bilan yangi tab (login saqlanadi)
            var child = new WebTab(url, w.ProfileKey, url);
            var childPage = new TabPage(Short(url)) { Tag = w.ProfileKey + "#" + Guid.NewGuid(), Padding = new Padding(0) };
            childPage.Controls.Add(child);
            tabs.TabPages.Add(childPage);
            tabs.SelectedTab = childPage;
            child.TitleChanged += c => { childPage.Text = Short(c.Title); tabs.Invalidate(); };
            child.OpenRequested += (_, u) => child.Navigate(u);
            _ = child.InitAsync();
        };
        _ = web.InitAsync();
        return web;
    }

    static string Short(string s) => s.Length > 24 ? s[..23] + "…" : s;

    // ---- tab sarlavhasi va yopish tugmasi ------------------------------------------------

    Rectangle CloseRect(Rectangle tab) =>
        new(tab.Right - CloseSize - 8, tab.Top + (tab.Height - CloseSize) / 2, CloseSize, CloseSize);

    void DrawTab(object? sender, DrawItemEventArgs e)
    {
        var page = tabs.TabPages[e.Index];
        var rect = tabs.GetTabRect(e.Index);
        var selected = e.Index == tabs.SelectedIndex;
        using (var back = new SolidBrush(selected ? SystemColors.Window : SystemColors.ControlLight))
            e.Graphics.FillRectangle(back, rect);
        var textRect = new Rectangle(rect.X + 8, rect.Y, rect.Width - (e.Index == 0 ? 16 : CloseSize + 22), rect.Height);
        TextRenderer.DrawText(e.Graphics, page.Text, Font, textRect, SystemColors.ControlText,
            TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis | TextFormatFlags.Left);
        if (e.Index == 0) return; // Bosh sahifa yopilmaydi
        var c = CloseRect(rect);
        using var pen = new Pen(SystemColors.GrayText, 1.6f);
        e.Graphics.DrawLine(pen, c.Left + 3, c.Top + 3, c.Right - 3, c.Bottom - 3);
        e.Graphics.DrawLine(pen, c.Right - 3, c.Top + 3, c.Left + 3, c.Bottom - 3);
    }

    void TabMouseDown(object? sender, MouseEventArgs e)
    {
        for (var i = 1; i < tabs.TabPages.Count; i++)
        {
            var rect = tabs.GetTabRect(i);
            if (!rect.Contains(e.Location)) continue;
            if (e.Button == MouseButtons.Middle || (e.Button == MouseButtons.Left && CloseRect(rect).Contains(e.Location)))
                CloseTab(i);
            return;
        }
    }

    void CloseTab(int index)
    {
        if (index <= 0 || index >= tabs.TabPages.Count) return;
        var page = tabs.TabPages[index];
        tabs.TabPages.Remove(page);
        page.Dispose();
        tabs.SelectedIndex = Math.Min(index, tabs.TabPages.Count - 1);
    }

    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        switch (keyData)
        {
            case Keys.Control | Keys.W:
                CloseTab(tabs.SelectedIndex);
                return true;
            case Keys.Control | Keys.Tab:
                tabs.SelectedIndex = (tabs.SelectedIndex + 1) % tabs.TabPages.Count;
                return true;
            case Keys.Control | Keys.Shift | Keys.Tab:
                tabs.SelectedIndex = (tabs.SelectedIndex - 1 + tabs.TabPages.Count) % tabs.TabPages.Count;
                return true;
            // Bosh sahifa masshtabi (veb tablarda WebView2 ning o'z masshtabi ishlaydi)
            case Keys.Control | Keys.Oemplus:
            case Keys.Control | Keys.Add:
                if (tabs.SelectedIndex == 0) { home.SetZoom(home.Zoom + 0.1); return true; }
                break;
            case Keys.Control | Keys.OemMinus:
            case Keys.Control | Keys.Subtract:
                if (tabs.SelectedIndex == 0) { home.SetZoom(home.Zoom - 0.1); return true; }
                break;
            case Keys.Control | Keys.D0:
            case Keys.Control | Keys.NumPad0:
                if (tabs.SelectedIndex == 0) { home.SetZoom(1.0); return true; }
                break;
            case Keys.F5 when tabs.SelectedTab?.Controls.OfType<WebTab>().FirstOrDefault() is { } w:
                w.View.Reload();
                return true;
        }
        return base.ProcessCmdKey(ref msg, keyData);
    }
}
