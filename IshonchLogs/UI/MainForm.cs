using System.Net.NetworkInformation;
using System.Net.Sockets;
using IshonchLogs.Core;

namespace IshonchLogs.UI;

/// <summary>
/// Chapda: firmalar va ulardagi muammo guruhlari (necha marta, oxirgisi qachon). O'ngda: tanlangan firma/guruh yozuvlari.
/// Ikki marta bosilsa — to'liq ma'lumot (stack trace, oldingi app.log qatorlari).
/// </summary>
public sealed class MainForm : Form
{
    readonly ProblemStore store = new(ProblemStore.DefaultFolder);
    CollectorSettings settings;
    CollectorServer? server;
    string serverState = "";

    readonly DateTimePicker from = new() { Format = DateTimePickerFormat.Short, Width = 110 };
    readonly DateTimePicker to = new() { Format = DateTimePickerFormat.Short, Width = 110 };
    readonly ComboBox firm = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 240 };
    readonly ComboBox feature = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 150 };
    readonly ComboBox level = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 120 };
    readonly TextBox search = new() { Width = 200, PlaceholderText = "Qidiruv…" };
    readonly TreeView tree = new() { Dock = DockStyle.Fill, HideSelection = false, FullRowSelect = true };
    readonly ListView list = new() { Dock = DockStyle.Fill, View = View.Details, FullRowSelect = true, GridLines = true };
    readonly ToolStripStatusLabel status = new() { Spring = true, TextAlign = ContentAlignment.MiddleLeft };
    readonly System.Windows.Forms.Timer refreshSoon = new() { Interval = 800 };
    List<Problem> shown = new();
    bool filling;

    public MainForm()
    {
        Text = "Ishonch — log yig'uvchi";
        Font = new Font("Segoe UI", 9.5f);
        Size = new Size(1400, 820);
        StartPosition = FormStartPosition.CenterScreen;
        settings = CollectorSettings.Load(store.Folder);

        from.Value = DateTime.Today.AddDays(-7);
        to.Value = DateTime.Today;
        level.Items.AddRange(new object[] { "Hammasi", "Faqat xato", "Faqat ogohlantirish" });
        level.SelectedIndex = 0;

        var import = new Button { Text = "Fayl qo'shish…", AutoSize = true };
        var folder = new Button { Text = "Papkani ochish", AutoSize = true };
        var options = new Button { Text = "Sozlamalar…", AutoSize = true };
        var bar = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true, Padding = new Padding(6), WrapContents = true };
        bar.Controls.AddRange(new Control[]
        {
            Caption("Sana:"), from, Caption("—"), to, Caption("Firma:"), firm, Caption("Bo'lim:"), feature, Caption("Daraja:"), level, search,
            import, folder, options,
        });

        foreach (var (name, w) in new[] { ("Vaqt", 130), ("Firma", 230), ("Bo'lim", 120), ("Daraja", 70), ("Xabar", 520), ("Kompyuter", 110), ("Versiya", 60), ("Manba", 120) })
            list.Columns.Add(name, w);

        var split = new SplitContainer { Dock = DockStyle.Fill, SplitterDistance = 430 };
        split.Panel1.Controls.Add(tree);
        split.Panel2.Controls.Add(list);
        var strip = new StatusStrip();
        strip.Items.Add(status);
        Controls.Add(split);
        Controls.Add(bar);
        Controls.Add(strip);

        foreach (var c in new Control[] { from, to }) ((DateTimePicker)c).ValueChanged += (_, _) => Refill();
        foreach (var c in new[] { firm, feature, level }) c.SelectedIndexChanged += (_, _) => { if (!filling) Refill(); };
        search.TextChanged += (_, _) => Refill();
        tree.AfterSelect += (_, _) => ShowList();
        list.DoubleClick += (_, _) => OpenSelected();
        list.KeyDown += (_, e) => { if (e.KeyCode == Keys.Enter) OpenSelected(); };
        import.Click += (_, _) => ImportFiles();
        folder.Click += (_, _) => System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("explorer.exe", $"\"{store.Folder}\"") { UseShellExecute = true });
        options.Click += async (_, _) => await EditSettingsAsync();
        refreshSoon.Tick += (_, _) => { refreshSoon.Stop(); Refill(); };
        store.Added += _ => { try { BeginInvoke(() => { refreshSoon.Stop(); refreshSoon.Start(); }); } catch { /* oyna yopilmoqda */ } };

        Shown += async (_, _) =>
        {
            store.Load();
            Refill();
            await StartServerAsync();
        };
        FormClosing += async (_, _) => { if (server is not null) await server.DisposeAsync(); };
    }

    static Label Caption(string text) => new() { Text = text, AutoSize = true, Padding = new Padding(0, 6, 0, 0) };

    async Task StartServerAsync()
    {
        if (server is not null) { await server.DisposeAsync(); server = null; }
        try
        {
            var s = new CollectorServer(store, settings.Port, settings.Key);
            await s.StartAsync();
            server = s;
            var ips = LocalIps();
            serverState = $"Qabul qilinmoqda: {string.Join(", ", ips.Select(ip => $"http://{ip}:{settings.Port}"))}"
                + (settings.Key.Length > 0 ? " · kalit bor" : " · KALITSIZ (Sozlamalarda kalit qo'ying)");
        }
        catch (Exception e)
        {
            serverState = $"Port {settings.Port} ochilmadi: {e.Message}";
        }
        UpdateStatus();
    }

    static List<string> LocalIps() =>
        NetworkInterface.GetAllNetworkInterfaces()
            .Where(n => n.OperationalStatus == OperationalStatus.Up && n.NetworkInterfaceType != NetworkInterfaceType.Loopback)
            .SelectMany(n => n.GetIPProperties().UnicastAddresses)
            .Where(a => a.Address.AddressFamily == AddressFamily.InterNetwork)
            .Select(a => a.Address.ToString())
            .DefaultIfEmpty("127.0.0.1")
            .ToList();

    void UpdateStatus() => status.Text = $"{serverState}   |   Jami: {store.Count} ta, ko'rsatilgan: {shown.Count} ta   |   Papka: {store.Folder}";

    ProblemFilter Filter()
    {
        var map = ProblemGrouper.InnByDb(store.Snapshot());
        return new ProblemFilter(
            from.Value, to.Value,
            firm.SelectedItem is FirmItem f ? f.Key : null,
            feature.SelectedIndex > 0 ? feature.SelectedItem as string : null,
            level.SelectedIndex switch { 1 => "err", 2 => "warn", _ => null },
            search.Text) { KeyOf = p => ProblemGrouper.KeyOf(p, map) };
    }

    /// <summary>Filtr o'zgardi yoki yangi yozuv keldi: ro'yxatlar va daraxt qayta quriladi (tanlov saqlanadi).</summary>
    void Refill()
    {
        var all = store.Snapshot();
        var byDate = all.Where(new ProblemFilter(from.Value, to.Value).Match).ToList();

        filling = true;
        var keepFirm = (firm.SelectedItem as FirmItem)?.Key;
        var keepFeature = feature.SelectedItem as string;
        firm.Items.Clear();
        firm.Items.Add("Hammasi");
        foreach (var g in ProblemGrouper.Group(byDate).OrderBy(g => g.Title))
            firm.Items.Add(new FirmItem(g.Key, $"{g.Title} ({g.Count})"));
        firm.SelectedItem = firm.Items.OfType<FirmItem>().FirstOrDefault(i => i.Key == keepFirm) ?? (object)"Hammasi";
        feature.Items.Clear();
        feature.Items.Add("Hammasi");
        foreach (var f in byDate.Select(p => p.Feature).Distinct().Order()) feature.Items.Add(f);
        feature.SelectedItem = keepFeature is not null && feature.Items.Contains(keepFeature) ? keepFeature : "Hammasi";
        filling = false;

        var selected = tree.SelectedNode?.Tag switch { FirmGroup f => f.Key, ProblemGroup g => g.Feature + "|" + g.Pattern, _ => null };
        tree.BeginUpdate();
        tree.Nodes.Clear();
        var rootAll = tree.Nodes.Add("Hamma firmalar");
        var filter = Filter();
        foreach (var fg in ProblemGrouper.Group(all.Where(filter.Match)))
        {
            var node = rootAll.Nodes.Add($"{fg.Title} — {fg.Count} ta, oxirgisi {fg.Last.LocalDateTime:dd.MM HH:mm}");
            node.Tag = fg;
            if (fg.Problems.Any(p => p.Level == "err")) node.ForeColor = Color.Firebrick;
            foreach (var pg in fg.Problems)
            {
                var child = node.Nodes.Add($"[{pg.Feature}] {pg.Pattern} — {pg.Count} marta, {pg.Last.LocalDateTime:dd.MM HH:mm}");
                child.Tag = pg;
                child.ForeColor = pg.Level == "err" ? Color.Firebrick : Color.DarkOrange;
                if (selected == pg.Feature + "|" + pg.Pattern) tree.SelectedNode = child;
            }
            if (selected == fg.Key) tree.SelectedNode = node;
        }
        rootAll.Expand();
        tree.SelectedNode ??= rootAll;
        tree.EndUpdate();
        ShowList();
    }

    void ShowList()
    {
        var filter = Filter();
        shown = tree.SelectedNode?.Tag switch
        {
            FirmGroup f => f.Problems.SelectMany(p => p.Items).ToList(),
            ProblemGroup g => g.Items.ToList(),
            _ => store.Snapshot().Where(filter.Match).ToList(),
        };
        shown = shown.Where(filter.Match).OrderByDescending(p => p.Time).Take(5000).ToList();
        list.BeginUpdate();
        list.Items.Clear();
        foreach (var p in shown)
        {
            var item = new ListViewItem(new[]
            {
                p.Time.LocalDateTime.ToString("dd.MM.yyyy HH:mm:ss"), p.FirmTitle, p.Feature, p.Level == "err" ? "xato" : "ogoh.",
                p.Message.Split('\n')[0], p.Pc ?? "", p.App ?? "", p.Source ?? "",
            }) { Tag = p, ForeColor = p.Level == "err" ? Color.Firebrick : Color.DarkOrange };
            list.Items.Add(item);
        }
        list.EndUpdate();
        UpdateStatus();
    }

    void OpenSelected()
    {
        if (list.SelectedItems.Count == 0 || list.SelectedItems[0].Tag is not Problem p) return;
        using var d = new DetailForm(p);
        d.ShowDialog(this);
    }

    void ImportFiles()
    {
        using var dlg = new OpenFileDialog
        {
            Title = "Ishonch jurnal fayllari (problems.jsonl yoki eski app.log)",
            Filter = "Ishonch jurnallari|*.jsonl;*.log;*.old;*.txt|Hamma fayllar|*.*",
            Multiselect = true,
        };
        if (dlg.ShowDialog(this) != DialogResult.OK) return;
        var added = 0;
        var errors = new List<string>();
        foreach (var f in dlg.FileNames)
        {
            try { added += store.Import(f); }
            catch (Exception e) { errors.Add($"{Path.GetFileName(f)}: {e.Message}"); }
        }
        Refill();
        MessageBox.Show(this, $"Qo'shildi: {added} ta yangi yozuv." + (errors.Count > 0 ? "\n\nO'qilmadi:\n" + string.Join("\n", errors) : ""), Text);
    }

    async Task EditSettingsAsync()
    {
        using var dlg = new Form
        {
            Text = "Sozlamalar", FormBorderStyle = FormBorderStyle.FixedDialog, StartPosition = FormStartPosition.CenterParent,
            MaximizeBox = false, MinimizeBox = false, ClientSize = new Size(470, 210), Font = Font,
        };
        var port = new NumericUpDown { Minimum = 1024, Maximum = 65535, Value = settings.Port, Left = 16, Top = 36, Width = 100 };
        var key = new TextBox { Text = settings.Key, Left = 16, Top = 96, Width = 330 };
        var gen = new Button { Text = "Yangi kalit", Left = 356, Top = 95, Width = 98 };
        gen.Click += (_, _) => key.Text = CollectorSettings.NewKey();
        var hint = new Label
        {
            Left = 16, Top = 128, Width = 440, Height = 40, ForeColor = Color.DimGray,
            Text = "Har bir Ishonch da: Yordam → «Xatolar jurnali (yig'uvchi)…» — shu kompyuter manzili (pastdagi holat satrida) va shu kalit.",
        };
        var ok = new Button { Text = "Saqlash", Left = 274, Top = 172, Width = 85, DialogResult = DialogResult.OK };
        var cancel = new Button { Text = "Bekor", Left = 369, Top = 172, Width = 85, DialogResult = DialogResult.Cancel };
        dlg.Controls.AddRange(new Control[]
        {
            new Label { Text = "Port:", Left = 16, Top = 14, AutoSize = true }, port,
            new Label { Text = "Kalit (Ishonch dasturlari shu kalit bilan yuboradi):", Left = 16, Top = 74, AutoSize = true }, key, gen,
            hint, ok, cancel,
        });
        dlg.AcceptButton = ok;
        dlg.CancelButton = cancel;
        if (dlg.ShowDialog(this) != DialogResult.OK) return;
        settings = new CollectorSettings { Port = (int)port.Value, Key = key.Text.Trim() };
        settings.Save(store.Folder);
        await StartServerAsync();
    }

    sealed record FirmItem(string Key, string Text)
    {
        public override string ToString() => Text;
    }
}
