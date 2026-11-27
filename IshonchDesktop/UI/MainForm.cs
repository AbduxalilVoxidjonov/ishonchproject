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
    readonly BaseStore store = new();
    /// <summary>Haqiqiy chiqish (tray menyusidagi «Chiqish»): ✕ dagi kabi tray'ga yashirilmaydi.</summary>
    public bool ExitRequested { get; set; }
    readonly Settings settings = Settings.Load();
    // Sahifalar shu yerda, sarlavhalarni (Chrome'dagidek tablar) BrowserTabStrip chizadi
    readonly HeaderlessTabControl tabs = new() { Dock = DockStyle.Fill };
    readonly BrowserTabStrip strip;
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
        var homePage = new TabPage("Bosh sahifa") { Padding = new Padding(0) };
        homePage.Controls.Add(home);
        tabs.TabPages.Add(homePage);
        strip = new BrowserTabStrip(tabs);
        strip.CloseRequested += CloseTab;
        strip.NewTabRequested += () => tabs.SelectedIndex = 0;
        BackColor = BrowserTabStrip.StripBack;
        Controls.Add(tabs);
        Controls.Add(strip);
        // Pastda: ulangan fiskal modul va uning holati
        Controls.Add(new FiscalStatusBar());

        home.OpenOneC += b => OpenBase(b);
        home.OpenSoliq += b => OpenSoliqTab(b);
        home.OpenMarking += async b => await OpenMarkingAsync(b);
        home.OpenUnmarked += b => OpenUnmarked(b);
        home.OpenDoverennost += b => OpenDoverennost(b);
        home.OpenDebtor += b => OpenDebtor(b);
        home.OpenBatchDebtor += OpenBatchDebtor;
        home.Open4790 += async b => await Open4790Async(b);
        home.OpenUnsellable += OpenUnsellable;
        home.OpenMarkCheck += OpenMarkCheck;
        home.OpenElektr += () => OpenElektrTab();
        home.OpenSolishtiruv += () => OpenSolishtiruvTab();
        home.OpenCrm += () => OpenCrmTab();
        home.SelectionChanged += b => settings.LastBaseId = b.Id;

        updater = new UpdateCoordinator(this, settings, home);
        problems = new ProblemSender(settings.Collector);
        problems.Start();
        BuildMenu();
        UpdateInstaller.CleanupOld(Environment.ProcessPath ?? "");

        FormClosing += (_, e) =>
        {
            SaveOpenTabs(); SaveWindow(); settings.Save();
            // Main Ishonch kuzatuvi ochiq bo'lsa — ✕ bosilganda dastur yopilmaydi, tray'da (soat yonida) ishlashda davom etadi.
            // Chiqish: tray menyusidagi «Chiqish». Yangilanish va Windows o'chishi bunga kirmaydi.
            if (!ExitRequested && e.CloseReason == CloseReason.UserClosing && updater.PendingRestart is null
                && FindTab(CrmKey) is not null && Crm.CrmWatcher.Current is { } w)
            {
                e.Cancel = true;
                Hide();
                w.ShowHiddenTip();
            }
        };
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
                else if (key == SolishtiruvTab.Key) OpenSolishtiruvTab(select: false);
                else if (key == UnsellableKey) OpenUnsellableTab(select: false);
                else if (key == CrmKey) OpenCrmTab(select: false);
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

    void OpenBatchDebtor()
    {
        new BatchDebtorForm(store.Bases, b => OpenBase(b, select: false),
            web => { if (tabs.TabPages.Cast<TabPage>().FirstOrDefault(p => p.Controls.Contains(web)) is { } page) tabs.SelectedTab = page; }).Show(this);
    }

    void OpenDebtor(BaseEntry b)
    {
        var tab = OpenBase(b);
        if (tab.HasSidePanel("debtor")) { tab.ShowSidePanel(640, "debtor"); return; }
        tab.AttachSidePanel(new DebtorPanel(tab, b), 640, "debtor");
    }

    void OpenDoverennost(BaseEntry b)
    {
        var tab = OpenBase(b);
        if (tab.HasSidePanel("doverennost")) { tab.ShowSidePanel(640, "doverennost"); return; }
        tab.AttachSidePanel(new DoverennostPanel(tab), 640, "doverennost");
    }

    void OpenUnmarked(BaseEntry b)
    {
        var tab = OpenBase(b);
        if (tab.HasSidePanel("unmarked")) { tab.ShowSidePanel(450, "unmarked"); return; }
        tab.AttachSidePanel(new UnmarkedPanel(tab, settings, b.ProfileKey, b.Db + " — " + b.Firm, b, SoliqTabFor(b)), 450, "unmarked");
    }

    // ---- Solishtiruv ---------------------------------------------------------------------------

    void OpenSolishtiruvTab(bool select = true)
    {
        if (FindTab(SolishtiruvTab.Key) is { } existing)
        {
            if (select) tabs.SelectedTab = existing;
            return;
        }
        var page = new TabPage("Solishtiruv") { Tag = SolishtiruvTab.Key, Padding = new Padding(0) };
        page.Controls.Add(new SolishtiruvTab());
        tabs.TabPages.Add(page);
        if (select) tabs.SelectedTab = page;
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

    const string CrmKey = "crm";

    /// <summary>Main Ishonch (main.ishonchsale.uz): «Шартнома яратиш» oynasini Didox'dagi eng yangi shartnoma bilan to'ldirish.</summary>
    WebTab OpenCrmTab(bool select = true)
    {
        if (FindTab(CrmKey) is { } existing)
        {
            if (select) tabs.SelectedTab = existing;
            return existing.Controls.OfType<WebTab>().First();
        }
        var tab = new WebTab("Main Ishonch", CrmKey, "https://main.ishonchsale.uz/mf2/new-payments");
        tab.BeforeNavigate = t => Crm.ContractFiller.AttachAsync(t, () => store.Bases);
        return AddWebTab(tab, CrmKey, select);
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

    const string UnsellableKey = "unsellable";

    /// <summary>Barcha bazalardan yig'ilgan sotib bo'lmaydigan markirovkalar jadvali — asosiy oynadagi alohida tab.</summary>
    void OpenUnsellable() => OpenUnsellableTab();

    void OpenUnsellableTab(bool select = true)
    {
        if (FindTab(UnsellableKey) is { } existing)
        {
            if (select) tabs.SelectedTab = existing;
            return;
        }
        var page = new TabPage("Sotib bo'lmaydigan markirovkalar") { Tag = UnsellableKey, Padding = new Padding(0) };
        page.Controls.Add(new UnsellableTab());
        tabs.TabPages.Add(page);
        if (select) tabs.SelectedTab = page;
    }

    /// <summary>
    /// «Markirovka tekshirish» bo'limi: kodlar ro'yxati my.soliq.uz da tekshiriladi (chek va 1C ga aloqasi yo'q). Har firma
    /// uchun alohida tab — tekshiruv shu firmaning my.soliq.uz tabi (sessiyasi) orqali bajariladi.
    /// </summary>
    void OpenMarkCheck(BaseEntry? b)
    {
        var key = "markcheck-" + (b is { Inn.Length: > 0 } ? b.Inn : "umumiy");
        if (FindTab(key) is { } existing) { tabs.SelectedTab = existing; return; }
        var page = new TabPage("Markirovka tekshirish" + (b is null ? "" : " — " + b.Firm)) { Tag = key, Padding = new Padding(0) };
        page.Controls.Add(new MarkingCheckTab(b,
            async () => { var soliq = OpenSoliqTab(b, select: false); await soliq.Ready; return soliq; },
            () => OpenSoliqTab(b, select: true)));
        tabs.TabPages.Add(page);
        tabs.SelectedTab = page;
    }

    /// <summary>Tanlangan baza 1C tabida «4790 to'ldiruvchi» panelini ochadi/yopadi (hujjatni saqlamaydi).</summary>
    async Task Open4790Async(BaseEntry b)
    {
        try
        {
            var tab = OpenBase(b);
            tab.U4790 ??= new Marking.U4790Session(tab, b);
            await tab.U4790.ToggleAsync();
        }
        catch (Exception e)
        {
            Log.Error("Open4790", e, b);
            MessageBox.Show(this, "4790 panelini ochib bo'lmadi: " + e.Message, AppInfo.DisplayName, MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    TabPage? FindTab(string key) => tabs.TabPages.Cast<TabPage>().FirstOrDefault(p => (string?)p.Tag == key);

    WebTab AddWebTab(WebTab web, string key, bool select = true)
    {
        var page = new TabPage(Short(web.Title)) { Tag = key, Padding = new Padding(0) };
        page.Controls.Add(web);
        tabs.TabPages.Add(page);
        if (select) tabs.SelectedTab = page;

        page.ToolTipText = web.Title;
        web.TitleChanged += w => { if (key != CrmKey) page.Text = Short(w.Title); page.ToolTipText = w.Title; strip.Invalidate(); };
        web.OpenRequested += (w, url) =>
        {
            // Yangi oyna so'ralsa — o'sha profil bilan yangi tab (login saqlanadi)
            var child = new WebTab(url, w.ProfileKey, url);
            var childPage = new TabPage(Short(url)) { Tag = w.ProfileKey + "#" + Guid.NewGuid(), Padding = new Padding(0) };
            childPage.Controls.Add(child);
            tabs.TabPages.Add(childPage);
            tabs.SelectedTab = childPage;
            child.TitleChanged += c => { childPage.Text = Short(c.Title); childPage.ToolTipText = c.Title; strip.Invalidate(); };
            child.OpenRequested += (_, u) => child.Navigate(u);
            _ = child.InitAsync();
        };
        _ = web.InitAsync();
        return web;
    }

    static string Short(string s) => s.Length > 40 ? s[..39] + "…" : s;

    // ---- tablarni yopish va klaviatura ------------------------------------------------------

    void CloseTab(int index)
    {
        if (index <= 0 || index >= tabs.TabPages.Count) return;
        var page = tabs.TabPages[index];
        tabs.TabPages.Remove(page);
        page.Dispose();
        tabs.SelectedIndex = Math.Min(index, tabs.TabPages.Count - 1);
    }

    /// <summary>
    /// Brauzerdagidek tugmalar: Ctrl+Tab / Ctrl+PageDown — keyingi tab, Ctrl+Shift+Tab / Ctrl+PageUp — oldingi, Ctrl+1…8 — shu
    /// raqamli tab, Ctrl+9 — oxirgi, Ctrl+W / Ctrl+F4 — yopish, Ctrl+T — Bosh sahifa, Ctrl+L / F6 — manzil qatori, F5 — yangilash.
    /// (WebView2 ichida bosilganda ham ishlaydi: boshqaruvchi tezkor tugmalarni oynaga uzatadi.)
    /// </summary>
    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        var n = tabs.TabPages.Count;
        if ((keyData & Keys.Modifiers) == Keys.Control && (keyData & Keys.KeyCode) is >= Keys.D1 and <= Keys.D9)
        {
            var k = (keyData & Keys.KeyCode) - Keys.D1;
            tabs.SelectedIndex = k == 8 ? n - 1 : Math.Min(k, n - 1);
            return true;
        }
        switch (keyData)
        {
            case Keys.Control | Keys.W:
            case Keys.Control | Keys.F4:
                CloseTab(tabs.SelectedIndex);
                return true;
            case Keys.Control | Keys.Tab:
            case Keys.Control | Keys.PageDown:
                tabs.SelectedIndex = (tabs.SelectedIndex + 1) % n;
                return true;
            case Keys.Control | Keys.Shift | Keys.Tab:
            case Keys.Control | Keys.PageUp:
                tabs.SelectedIndex = (tabs.SelectedIndex - 1 + n) % n;
                return true;
            case Keys.Control | Keys.T:
                tabs.SelectedIndex = 0;
                return true;
            case Keys.Control | Keys.L:
            case Keys.F6:
                if (tabs.SelectedTab?.Controls.OfType<WebTab>().FirstOrDefault() is { } wt) { wt.FocusAddress(); return true; }
                break;
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
