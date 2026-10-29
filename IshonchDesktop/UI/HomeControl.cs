using IshonchDesktop.Models;

namespace IshonchDesktop.UI;

/// <summary>Bosh sahifa: baza tanlash (qidiruv bilan) va kategoriyalar.</summary>
public sealed class HomeControl : UserControl
{
    readonly BaseStore store;
    readonly TextBox search = new() { Dock = DockStyle.Top, PlaceholderText = "Qidirish: firma, INN, buxgalter, baza… (bir nechta so'z — hammasi mos kelsin)" };
    readonly ListView list = new()
    {
        Dock = DockStyle.Fill, View = View.Details, FullRowSelect = true, HideSelection = false,
        MultiSelect = false, GridLines = false, BorderStyle = BorderStyle.None, BackColor = Color.White,
    };
    /// <summary>Qator balandligi uchun (ListView qatorni shu rasm balandligidan past qilmaydi).</summary>
    readonly ImageList rowHeight = new() { ImageSize = new Size(1, 28) };
    readonly Label info = new() { Width = 300, Height = 104, Margin = new Padding(0, 0, 0, 14), BackColor = Color.White, Padding = new Padding(16, 12, 12, 10) };
    readonly Button openOneC = Big("🗄   1C bazani ochish", primary: true);
    readonly Button openSoliq = Big("🌐   my.soliq.uz ochish");
    readonly Button openMarking = Big("🏷   Markirovkali chek tayyorlash");
    readonly Button openUnmarked = Big("📦   Markirovkasiz sotish");
    readonly Button openElektr = Big("⚡   Elektr (HET kabinetlari)");
    readonly Button openHelp = Big("❓   Yordam");

    public event Action<BaseEntry>? OpenOneC;
    public event Action<BaseEntry?>? OpenSoliq;
    public event Action<BaseEntry>? OpenMarking;
    public event Action<BaseEntry>? OpenUnmarked;
    public event Action? OpenElektr;
    /// <summary>«Yordam» tugmasi bosildi (tugmaning o'zi — menyuni uning ostida ochish uchun).</summary>
    public event Action<Control>? HelpClicked;
    public event Action? CheckUpdatesClicked;
    public event Action? InstallUpdateClicked;
    public event Action<BaseEntry>? SelectionChanged;
    public event Action<double>? ZoomChanged;

    // Masshtablanadigan elementlar
    readonly HeaderBar title = new();
    readonly FlowLayoutPanel right = new();
    readonly FlowLayoutPanel foot = new();
    readonly Button reloadBtn = new() { Text = "Ro'yxatni qayta yuklash" };
    readonly Button fileBtn = new() { Text = "Ro'yxat faylini ochish" };
    readonly Button updateBtn = new() { Text = "Yangilanishni tekshirish" };
    readonly Label versionLabel = new() { AutoSize = true, Padding = new Padding(8, 8, 0, 0), ForeColor = Color.DimGray };
    readonly Button banner = new()
    {
        Dock = DockStyle.Top, Height = 38, Visible = false, FlatStyle = FlatStyle.Flat, Cursor = Cursors.Hand,
        BackColor = Color.FromArgb(220, 252, 231), ForeColor = Color.FromArgb(22, 101, 52), TextAlign = ContentAlignment.MiddleLeft,
        Font = new Font("Segoe UI", 10f, FontStyle.Bold),
    };
    static readonly int[] BaseColumns = { 62, 250, 90, 170, 80 };
    const string PinMark = "★ ";
    const string UnpinMark = "☆ ";
    static readonly string[] ColumnNames = { "№", "Firma", "INN", "Buxgalter", "Baza" };

    // Ro'yxatdagi qiymatni bosib filtrlash (Ctrl + bosish yoki o'ng tugma)
    readonly FlowLayoutPanel chip = new() { Dock = DockStyle.Top, AutoSize = true, Visible = false, WrapContents = false };
    readonly Label chipLabel = new() { AutoSize = true, Padding = new Padding(6, 6, 6, 4), BackColor = Color.FromArgb(224, 231, 255) };
    readonly Button chipClear = new() { Text = "✕ Filtrni olib tashlash", AutoSize = true };
    readonly Label countLabel = new() { AutoSize = true, Padding = new Padding(12, 8, 0, 0) };
    readonly ContextMenuStrip cellMenu = new();
    int? filterColumn;
    string? filterValue;
    double zoom = 1.0;
    public double Zoom => zoom;

    public BaseEntry? Selected => list.SelectedItems.Count == 1 ? (BaseEntry)list.SelectedItems[0].Tag! : null;

    static readonly Color Indigo = Color.FromArgb(79, 70, 229);

    /// <summary>O'ng tomondagi katta «plitka» tugma: oq karta, kursor ustida och binafsha; asosiysi — to'liq rangli.</summary>
    static Button Big(string text, bool primary = false)
    {
        var b = new Button
        {
            Text = text, Width = 300, Height = 58, Margin = new Padding(0, 0, 0, 10), Padding = new Padding(12, 0, 0, 0),
            Font = new Font("Segoe UI", 11f, FontStyle.Bold), TextAlign = ContentAlignment.MiddleLeft,
            FlatStyle = FlatStyle.Flat, Cursor = Cursors.Hand, UseVisualStyleBackColor = false,
        };
        if (primary)
        {
            b.FlatAppearance.BorderSize = 0;
            b.BackColor = Indigo;
            b.ForeColor = Color.White;
            b.FlatAppearance.MouseOverBackColor = Color.FromArgb(67, 56, 202);
            b.FlatAppearance.MouseDownBackColor = Color.FromArgb(55, 48, 163);
            b.EnabledChanged += (_, _) => b.BackColor = b.Enabled ? Indigo : Color.FromArgb(165, 180, 252);
        }
        else
        {
            b.BackColor = Color.White;
            b.ForeColor = Color.FromArgb(30, 41, 59);
            b.FlatAppearance.BorderColor = PanelStyle.Border;
            b.FlatAppearance.MouseOverBackColor = Color.FromArgb(238, 242, 255);
            b.FlatAppearance.MouseDownBackColor = Color.FromArgb(224, 231, 255);
        }
        return b;
    }

    public HomeControl(BaseStore store)
    {
        this.store = store;
        Dock = DockStyle.Fill;
        Padding = new Padding(20);
        Font = new Font("Segoe UI", 9.5f);
        BackColor = PanelStyle.Back;

        // Lentada dastur nomi yozilmaydi (u oyna sarlavhasida bor) — faqat belgi va vazifasi
        title.Text = "1C va my.soliq.uz boshqaruv paneli";
        title.Subtitle = "Bazani tanlang va kerakli bo'limni oching";
        title.Version = "v" + AppInfo.Text;
        title.Dock = DockStyle.Top;
        title.Height = 76;
        title.Font = new Font("Segoe UI", 18f, FontStyle.Bold);

        search.Font = new Font("Segoe UI", 11f);
        list.SmallImageList = rowHeight;
        list.Font = new Font("Segoe UI", 10f);
        // Tanlangan firma kartasi: chap tomonda rangli chiziq va ingichka chegara
        info.Paint += (_, e) =>
        {
            using var pen = new Pen(PanelStyle.Border);
            e.Graphics.DrawRectangle(pen, 0, 0, info.Width - 1, info.Height - 1);
            using var bar = new SolidBrush(Indigo);
            e.Graphics.FillRectangle(bar, 0, 0, Math.Max(4, info.Width / 75), info.Height);
        };

        list.Columns.Add("№", 62);
        list.Columns.Add("Firma", 250);
        list.Columns.Add("INN", 90);
        list.Columns.Add("Buxgalter", 170);
        list.Columns.Add("Baza", 80);

        var left = new Panel { Dock = DockStyle.Fill, Padding = new Padding(0, 0, 20, 0) };
        chip.Controls.Add(chipLabel);
        chip.Controls.Add(chipClear);
        // Jadval oq kartada (1 piksel chegara)
        var listCard = PanelStyle.CardPanel(new Padding(1));
        listCard.Dock = DockStyle.Fill;
        listCard.Controls.Add(list);
        left.Controls.Add(listCard);
        left.Controls.Add(chip);
        left.Controls.Add(new Panel { Dock = DockStyle.Top, Height = 10 });
        left.Controls.Add(search);

        right.Dock = DockStyle.Right;
        right.Width = 330;
        right.FlowDirection = FlowDirection.TopDown;
        right.WrapContents = false;
        right.Controls.Add(info);
        right.Controls.Add(openOneC);
        right.Controls.Add(openSoliq);
        right.Controls.Add(openMarking);
        right.Controls.Add(openUnmarked);
        right.Controls.Add(openElektr);
        right.Controls.Add(openHelp);

        reloadBtn.Size = new Size(190, 30);
        fileBtn.Size = new Size(190, 30);
        foot.Dock = DockStyle.Bottom;
        foot.Height = 40;
        foot.FlowDirection = FlowDirection.LeftToRight;
        foot.Controls.Add(reloadBtn);
        foot.Controls.Add(fileBtn);
        foot.Controls.Add(updateBtn);
        foot.Controls.Add(countLabel);
        foot.Controls.Add(versionLabel);
        updateBtn.Size = new Size(210, 30);
        versionLabel.Text = AppInfo.DisplayName + " " + AppInfo.Text;
        updateBtn.Click += (_, _) => CheckUpdatesClicked?.Invoke();
        banner.Click += (_, _) => InstallUpdateClicked?.Invoke();

        foreach (var b in new[] { reloadBtn, fileBtn, updateBtn }) PanelStyle.Secondary(b);

        Controls.Add(left);
        Controls.Add(right);
        Controls.Add(foot);
        Controls.Add(banner);
        Controls.Add(new Panel { Dock = DockStyle.Top, Height = 16 });
        Controls.Add(title);

        search.TextChanged += (_, _) => Fill(Selected?.Id);
        search.KeyDown += (_, e) =>
        {
            if (e.KeyCode == Keys.Escape) { e.SuppressKeyPress = true; ClearSearch(); }
            else if ((e.KeyCode is Keys.Down or Keys.Enter) && list.Items.Count > 0)
            {
                // Yozib turib: pastga yoki Enter — birinchi natijani tanlab, ro'yxatga o'tadi
                e.SuppressKeyPress = true;
                if (list.SelectedItems.Count == 0) list.Items[0].Selected = true;
                list.Focus();
            }
        };
        chipClear.Click += (_, _) => ClearFilter();
        list.MouseUp += OnListMouseUp;
        list.Resize += (_, _) => FitColumns();
        list.SelectedIndexChanged += (_, _) => UpdateInfo();
        list.DoubleClick += (_, _) => { if (Selected is { } b) OpenOneC?.Invoke(b); };
        list.KeyDown += (_, e) =>
        {
            if (e.KeyCode == Keys.Enter && Selected is { } b) OpenOneC?.Invoke(b);
            else if (e.Control && e.KeyCode == Keys.P && Selected is { } p) { e.SuppressKeyPress = true; TogglePin(p); }
        };
        openOneC.Click += (_, _) => { if (Selected is { } b) OpenOneC?.Invoke(b); };
        openSoliq.Click += (_, _) => OpenSoliq?.Invoke(Selected);
        openMarking.Click += (_, _) => { if (Selected is { } b) OpenMarking?.Invoke(b); };
        openUnmarked.Click += (_, _) => { if (Selected is { } b) OpenUnmarked?.Invoke(b); };
        openElektr.Click += (_, _) => OpenElektr?.Invoke();
        openHelp.Click += (_, _) => HelpClicked?.Invoke(openHelp);
        reloadBtn.Click += (_, _) => { store.Load(); Fill(Selected?.Id); };
        fileBtn.Click += (_, _) =>
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("notepad.exe", $"\"{Paths.BasesFile}\"") { UseShellExecute = true });

        // Kichik oynada elementlar kesilib qolmasin: kerak bo'lsa aylantirish chizig'i chiqadi
        AutoScroll = true;
        // O'lchamlar oyna ko'ringandan keyin (DPI masshtablash tugagach) bir marta qo'llanadi: aks holda ikki marta ko'payadi
        VisibleChanged += (_, _) =>
        {
            if (!Visible || laidOut) return;
            laidOut = true;
            LayoutForZoom();
        };

        // Ctrl + g'ildirak / Ctrl + "+" / "-" / 0
        MouseWheel += (_, e) => { if (ModifierKeys.HasFlag(Keys.Control)) SetZoom(zoom + (e.Delta > 0 ? 0.1 : -0.1)); };
        list.MouseWheel += (_, e) => { if (ModifierKeys.HasFlag(Keys.Control)) SetZoom(zoom + (e.Delta > 0 ? 0.1 : -0.1)); };

        Fill(null);
        UpdateInfo();
    }

    /// <summary>Bosh sahifa masshtabi (0.7–2.0): shrift va elementlar o'lchami birga o'zgaradi.</summary>
    public void SetZoom(double z)
    {
        z = Math.Round(Math.Clamp(z, 0.7, 2.0), 2);
        if (Math.Abs(z - zoom) < 0.001) return;
        ApplyZoom(z);
        ZoomChanged?.Invoke(zoom);
    }

    bool laidOut;

    public void ApplyZoom(double z)
    {
        zoom = Math.Clamp(z, 0.7, 2.0);
        if (laidOut) LayoutForZoom();
    }

    // Birinchi ko'ringandagi (DPI ga allaqachon moslangan) o'lchamlar; masshtab shularga nisbatan hisoblanadi
    sealed record Metrics(float Font, float TitleFont, float ButtonFont, int TitleH, int RightW, Size Info, Size Big,
        Size Small, int FootH, int[] Columns, Size Scroll, int RowH);
    Metrics? baseMetrics;

    void LayoutForZoom()
    {
        baseMetrics ??= new Metrics(Font.SizeInPoints, title.Font.SizeInPoints, openOneC.Font.SizeInPoints, title.Height,
            right.Width, info.Size, openOneC.Size, reloadBtn.Size, foot.Height,
            Enumerable.Range(0, list.Columns.Count).Select(i => list.Columns[i].Width).ToArray(),
            new Size(Math.Max(1, (int)(ClientSize.Width * 0.62)), Math.Max(1, (int)(ClientSize.Height * 0.62))),
            LogicalToDeviceUnits(28));
        var m = baseMetrics;
        var f = (float)zoom;
        int S(int v) => Math.Max(1, (int)Math.Round(v * zoom));
        Size S2(Size v) => new(S(v.Width), S(v.Height));

        SuspendLayout();
        Font = new Font(Font.FontFamily, m.Font * f);
        title.Font = new Font(title.Font.FontFamily, m.TitleFont * f, FontStyle.Bold);
        title.Height = S(m.TitleH);
        right.Width = S(m.RightW);
        info.Size = S2(m.Info);
        foreach (var b in new[] { openOneC, openSoliq, openMarking, openUnmarked, openElektr, openHelp })
        {
            b.Font = new Font(b.Font.FontFamily, m.ButtonFont * f, FontStyle.Bold);
            b.Size = S2(m.Big);
        }
        reloadBtn.Size = fileBtn.Size = S2(m.Small);
        updateBtn.Size = new Size(S(m.Small.Width + 20), S(m.Small.Height));
        banner.Height = S(m.Small.Height + 8);
        foot.Height = S(m.FootH);
        for (var i = 0; i < list.Columns.Count; i++) list.Columns[i].Width = S(m.Columns[i]);
        rowHeight.ImageSize = new Size(1, Math.Min(256, S(m.RowH)));
        firmaMin = list.Columns[1].Width;
        FitColumns();
        // Kichik oynada kesilib qolmasin: kontent shundan torayganda aylantirish chizig'i chiqadi
        AutoScrollMinSize = S2(new Size((int)(m.Columns.Sum() * 0.55) + m.RightW + 60, m.TitleH + m.FootH + 320));
        ResumeLayout(true);
    }

    /// <summary>«Firma» ustunining eng kichik kengligi (masshtabga moslangan).</summary>
    int firmaMin = 250;

    /// <summary>«Firma» ustuni jadvalning qolgan bo'sh kengligini egallaydi (o'ng tomonda bo'sh joy qolmasin).</summary>
    void FitColumns()
    {
        if (list.Columns.Count < 2 || list.ClientSize.Width <= 0) return;
        var others = 0;
        for (var i = 0; i < list.Columns.Count; i++) if (i != 1) others += list.Columns[i].Width;
        var width = Math.Max(firmaMin, list.ClientSize.Width - others - 4);
        if (list.Columns[1].Width != width) list.Columns[1].Width = width;
    }

    public void Fill(int? keepId)
    {
        var words = search.Text.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
        bool Contains(string hay, string needle) => hay.Contains(needle, StringComparison.CurrentCultureIgnoreCase);
        bool Match(BaseEntry b)
        {
            if (filterColumn is int c && !string.Equals(ColumnValue(b, c), filterValue, StringComparison.CurrentCultureIgnoreCase))
                return false;
            var fields = new[] { b.Firm, b.Inn, b.Accountant, b.Db, b.Server, b.Sector, b.No?.ToString() ?? "" };
            return words.All(w => fields.Any(f => Contains(f, w)));
        }

        var pins = ZoomStore.Settings?.PinnedBases ?? new List<string>();
        var shown = store.Bases.Where(Match)
            .OrderBy(b => pins.IndexOf(b.ProfileKey) is var i && i >= 0 ? i : int.MaxValue)
            .ThenBy(b => b.No ?? int.MaxValue)   // qadalmaganlar № bo'yicha o'sish tartibida
            .ThenBy(b => b.Firm, StringComparer.CurrentCultureIgnoreCase)
            .ToList();

        list.BeginUpdate();
        list.Items.Clear();
        foreach (var b in shown)
        {
            var pinned = pins.Contains(b.ProfileKey);
            var item = new ListViewItem(new[] { (pinned ? PinMark : UnpinMark) + (b.No?.ToString() ?? ""), b.Firm, b.Inn, b.Accountant, b.Db })
            {
                Tag = b,
            };
            item.BackColor = pinned ? Color.FromArgb(255, 248, 220) : list.Items.Count % 2 == 1 ? Color.FromArgb(248, 250, 252) : Color.White;
            list.Items.Add(item);
            if (b.Id == keepId) { item.Selected = true; item.EnsureVisible(); }
        }
        list.EndUpdate();
        // Tanlangan baza yo'q bo'lsa ro'yxat tepadan (qadalganlardan) boshlansin
        if (list.SelectedItems.Count == 0 && list.Items.Count > 0) list.TopItem = list.Items[0];
        countLabel.Text = $"Topildi: {list.Items.Count} / {store.Bases.Count}";
        UpdateInfo();
    }

    static string ColumnValue(BaseEntry b, int column) => column switch
    {
        0 => b.No?.ToString() ?? "",
        1 => b.Firm,
        2 => b.Inn,
        3 => b.Accountant,
        _ => b.Db,
    };

    void ClearSearch()
    {
        search.Clear();
        ClearFilter();
        search.Focus();
    }

    void ClearFilter()
    {
        filterColumn = null;
        filterValue = null;
        chip.Visible = false;
        Fill(Selected?.Id);
    }

    /// <summary>Ro'yxatdagi bitta qiymat (masalan buxgalter yoki INN) bo'yicha filtr.</summary>
    void ApplyColumnFilter(int column, string value)
    {
        if (string.IsNullOrWhiteSpace(value)) return;
        filterColumn = column;
        filterValue = value;
        chipLabel.Text = $"Filtr: {ColumnNames[column]} = {value}";
        chip.Visible = true;
        Fill(Selected?.Id);
    }

    // Ctrl + bosish — shu qiymat bo'yicha filtr; o'ng tugma — menyu
    void OnListMouseUp(object? sender, MouseEventArgs e)
    {
        var hit = list.HitTest(e.Location);
        if (hit.Item is null || hit.SubItem is null) return;
        var column = hit.Item.SubItems.IndexOf(hit.SubItem);
        var value = column == 0 ? hit.SubItem.Text.Replace(PinMark, "").Replace(UnpinMark, "").Trim() : hit.SubItem.Text;

        // Raqam yonidagi yulduzchani bosish — qadash / qadashni olib tashlash
        if (e.Button == MouseButtons.Left && column == 0 && hit.Item.Tag is BaseEntry starred
            && e.X <= hit.SubItem.Bounds.Left + (int)(30 * zoom) + LogicalToDeviceUnits(0))
        {
            TogglePin(starred);
            return;
        }
        if (e.Button == MouseButtons.Left && ModifierKeys.HasFlag(Keys.Control))
        {
            ApplyColumnFilter(column, value);
        }
        else if (e.Button == MouseButtons.Right)
        {
            hit.Item.Selected = true;
            cellMenu.Items.Clear();
            if (hit.Item.Tag is BaseEntry clicked)
            {
                var pinned = ZoomStore.Settings?.IsPinned(clicked) == true;
                cellMenu.Items.Add(pinned ? "☆ Qadashni olib tashlash" : "★ Tepaga qadash", null, (_, _) => TogglePin(clicked));
                cellMenu.Items.Add(new ToolStripSeparator());
            }
            cellMenu.Items.Add($"«{value}» bo'yicha filtr ({ColumnNames[column]})", null, (_, _) => ApplyColumnFilter(column, value));
            cellMenu.Items.Add("Qidiruv maydoniga qo'yish", null, (_, _) => { search.Text = value; search.Focus(); search.SelectionStart = search.TextLength; });
            cellMenu.Items.Add("Nusxalash", null, (_, _) => { try { Clipboard.SetText(value); } catch { /* buferga yozilmadi */ } });
            cellMenu.Items.Add(new ToolStripSeparator());
            cellMenu.Items.Add("Filtr va qidiruvni tozalash", null, (_, _) => ClearSearch()).Enabled = filterColumn is not null || search.TextLength > 0;
            cellMenu.Show(list, e.Location);
        }
    }

    /// <summary>Bazani ro'yxat tepasiga qadaydi yoki qadashni olib tashlaydi; sozlama darhol saqlanadi.</summary>
    void TogglePin(BaseEntry b)
    {
        var s = ZoomStore.Settings;
        if (s is null) return;
        s.SetPinned(b, !s.IsPinned(b));
        s.Save();
        Fill(b.Id);
    }

    public void Select(int id)
    {
        foreach (ListViewItem item in list.Items)
            if (((BaseEntry)item.Tag!).Id == id) { item.Selected = true; item.EnsureVisible(); return; }
    }

    void UpdateInfo()
    {
        var b = Selected;
        openOneC.Enabled = openMarking.Enabled = openUnmarked.Enabled = b is not null;
        if (b is null) { info.Text = "Ro'yxatdan bazani tanlang (yoki ikki marta bosing).\nRaqam yonidagi ☆ ni bosing — baza tepaga qadaladi."; return; }
        info.Text = $"{b.Firm}\nINN: {b.Inn}   Buxgalter: {b.Accountant}\n{b.Url}";
        SelectionChanged?.Invoke(b);
    }

    /// <summary>Yangi versiya haqida yashil chiziq (null — yashiradi).</summary>
    public void ShowUpdateBanner(string? text)
    {
        banner.Visible = text is not null;
        if (text is not null) banner.Text = "  ⬆  " + text;
    }

    public void SetCheckingUpdates(bool busy)
    {
        updateBtn.Enabled = !busy;
        updateBtn.Text = busy ? "Tekshirilmoqda…" : "Yangilanishni tekshirish";
    }
}
