using IshonchDesktop.Marking;
using IshonchDesktop.Models;

namespace IshonchDesktop.UI;

/// <summary>
/// Bosh sahifa → «Sotib bo'lmaydigan markirovkalar» (asosiy oynada alohida tab): barcha bazalardan yig'ilgan kodlar firma, sklad va mahsulot nomi
/// bo'yicha guruhlangan jadvalda; firma bo'yicha tanlash va matn bo'yicha qidirish; pastda tanlangan guruhning kodlari.
/// </summary>
public sealed class UnsellableTab : UserControl
{
    const string AllFirms = "— Barcha firmalar —";

    readonly ComboBox firm = new() { DropDownStyle = ComboBoxStyle.DropDown, Width = 320, AutoCompleteMode = AutoCompleteMode.SuggestAppend, AutoCompleteSource = AutoCompleteSource.ListItems };
    readonly TextBox search = new() { Width = 300, PlaceholderText = "Qidirish: firma, INN, sklad, mahsulot yoki kod" };
    readonly DataGridView groups = Grid();
    readonly DataGridView codes = Grid();
    readonly Label total = new() { AutoSize = true, ForeColor = PanelStyle.Muted, Padding = new Padding(0, 8, 0, 0) };
    readonly Button copy = PanelStyle.Secondary(new Button { Text = "📋 Kodlarni nusxalash", Width = 180, Height = 30 });
    readonly Button remove = PanelStyle.Secondary(new Button { Text = "🗑 Tanlanganlarni o'chirish", Width = 200, Height = 30 }, danger: true);

    sealed record Group(string Firm, string Inn, string Warehouse, string Name, List<UnsellableCode> Codes);

    List<UnsellableCode> all = new();
    List<Group> shown = new();

    public UnsellableTab()
    {
        Dock = DockStyle.Fill;
        Font = PanelStyle.Base;
        BackColor = PanelStyle.Back;

        var top = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 44, Padding = new Padding(10, 8, 10, 0), WrapContents = false };
        top.Controls.Add(new Label { Text = "Firma:", AutoSize = true, Padding = new Padding(0, 6, 0, 0) });
        top.Controls.Add(firm);
        top.Controls.Add(search);
        top.Controls.Add(total);

        groups.Columns.Add("firm", "Firma");
        groups.Columns.Add("wh", "Sklad");
        groups.Columns.Add("name", "Mahsulot nomi");
        groups.Columns.Add("count", "Soni");
        groups.Columns.Add("last", "Oxirgi");
        groups.Columns["firm"]!.FillWeight = 22;
        groups.Columns["wh"]!.FillWeight = 16;
        groups.Columns["name"]!.FillWeight = 44;
        groups.Columns["count"]!.FillWeight = 6;
        groups.Columns["last"]!.FillWeight = 12;
        groups.Columns["count"]!.DefaultCellStyle.Alignment = DataGridViewContentAlignment.MiddleRight;

        codes.Columns.Add("code", "Markirovka kodi");
        codes.Columns.Add("reason", "Sabab");
        codes.Columns.Add("product", "my.soliq.uz dagi nomi");
        codes.Columns.Add("db", "Baza");
        codes.Columns.Add("time", "Qachon");
        codes.Columns["code"]!.FillWeight = 34;
        codes.Columns["reason"]!.FillWeight = 22;
        codes.Columns["product"]!.FillWeight = 24;
        codes.Columns["db"]!.FillWeight = 8;
        codes.Columns["time"]!.FillWeight = 12;
        codes.MultiSelect = true;
        // Rows map to backing lists by index; sorting must keep that mapping intact.
        foreach (DataGridViewColumn column in groups.Columns) column.SortMode = DataGridViewColumnSortMode.NotSortable;
        foreach (DataGridViewColumn column in codes.Columns) column.SortMode = DataGridViewColumnSortMode.NotSortable;

        var split = new SplitContainer { Dock = DockStyle.Fill, Orientation = Orientation.Horizontal, SplitterDistance = 380 };
        split.Panel1.Controls.Add(groups);
        split.Panel2.Controls.Add(codes);
        split.Panel1.Padding = split.Panel2.Padding = new Padding(10, 4, 10, 4);

        var bottom = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 44, Padding = new Padding(10, 6, 10, 0) };
        bottom.Controls.Add(copy);
        bottom.Controls.Add(remove);

        Controls.Add(split);
        Controls.Add(bottom);
        Controls.Add(top);

        firm.TextChanged += (_, _) => Fill();
        search.TextChanged += (_, _) => Fill();
        groups.SelectionChanged += (_, _) => FillCodes();
        copy.Click += (_, _) => CopyCodes();
        remove.Click += (_, _) => RemoveSelected();
        UnsellableStore.Changed += OnStoreChanged;
        Disposed += (_, _) => UnsellableStore.Changed -= OnStoreChanged;
        Reload();
    }

    static DataGridView Grid() => new()
    {
        Dock = DockStyle.Fill, ReadOnly = true, AllowUserToAddRows = false, AllowUserToDeleteRows = false, AllowUserToResizeRows = false,
        RowHeadersVisible = false, SelectionMode = DataGridViewSelectionMode.FullRowSelect, MultiSelect = false,
        AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill, BackgroundColor = Color.White, BorderStyle = BorderStyle.FixedSingle,
        AlternatingRowsDefaultCellStyle = { BackColor = Color.FromArgb(248, 250, 252) },
    };

    void OnStoreChanged()
    {
        if (IsDisposed || !IsHandleCreated) return;
        try { BeginInvoke(Reload); } catch { /* yopilgan */ }
    }

    void Reload()
    {
        all = UnsellableStore.All();
        var keep = firm.Text;
        firm.Items.Clear();
        firm.Items.Add(AllFirms);
        foreach (var f in all.Select(c => c.Firm).Where(f => f.Length > 0).Distinct().OrderBy(f => f)) firm.Items.Add(f);
        firm.Text = string.IsNullOrEmpty(keep) ? AllFirms : keep;
        Fill();
    }

    void Fill()
    {
        var f = firm.Text.Trim();
        var q = search.Text.Trim();
        IEnumerable<UnsellableCode> list = all;
        if (f.Length > 0 && f != AllFirms) list = list.Where(c => c.Firm.Contains(f, StringComparison.OrdinalIgnoreCase) || c.Inn.Contains(f));
        if (q.Length > 0)
            list = list.Where(c => new[] { c.Firm, c.Inn, c.Warehouse, c.Name, c.Product, c.Code, c.Db }
                .Any(v => v.Contains(q, StringComparison.OrdinalIgnoreCase)));
        shown = list.GroupBy(c => (c.Firm, c.Inn, c.Warehouse, c.Name))
            .Select(g => new Group(g.Key.Firm, g.Key.Inn, g.Key.Warehouse, g.Key.Name, g.OrderByDescending(c => c.Time).ToList()))
            .OrderBy(g => g.Firm).ThenBy(g => g.Warehouse).ThenBy(g => g.Name).ToList();
        groups.Rows.Clear();
        foreach (var g in shown)
            groups.Rows.Add(g.Firm, g.Warehouse, g.Name, g.Codes.Count, g.Codes[0].Time.ToString("dd.MM.yyyy HH:mm"));
        total.Text = $"Jami: {shown.Sum(g => g.Codes.Count)} ta kod, {shown.Count} ta mahsulot (bazada {all.Count} ta)";
        FillCodes();
    }

    Group? Selected => groups.CurrentRow is { Index: >= 0 } r && r.Index < shown.Count ? shown[r.Index] : null;

    void FillCodes()
    {
        codes.Rows.Clear();
        if (Selected is not { } g) return;
        foreach (var c in g.Codes)
            codes.Rows.Add(c.Code, c.Reason, c.Product, c.Db, c.Time.ToString("dd.MM.yyyy HH:mm"));
    }

    List<UnsellableCode> SelectedCodes()
    {
        if (Selected is not { } g) return new();
        var picked = codes.SelectedRows.Cast<DataGridViewRow>().Select(r => r.Index).Where(i => i >= 0 && i < g.Codes.Count).ToList();
        return picked.Count > 0 ? picked.Select(i => g.Codes[i]).ToList() : g.Codes;
    }

    void CopyCodes()
    {
        var list = SelectedCodes();
        if (list.Count == 0) return;
        Clipboard.SetText(string.Join(Environment.NewLine, list.Select(c => c.Code)));
        total.Text = $"{list.Count} ta kod nusxalandi.";
    }

    void RemoveSelected()
    {
        var list = SelectedCodes();
        if (list.Count == 0) return;
        if (MessageBox.Show(this, $"{list.Count} ta kod ro'yxatdan o'chirilsinmi?\n(Panelning o'z xato bazasiga ta'sir qilmaydi.)",
                AppInfo.DisplayName, MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
        UnsellableStore.Remove(list);
    }
}
