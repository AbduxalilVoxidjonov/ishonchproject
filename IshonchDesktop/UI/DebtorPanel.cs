using System.Globalization;
using IshonchDesktop.Debtors;
using IshonchDesktop.Models;

namespace IshonchDesktop.UI;

/// <summary>
/// «Debitor / kreditor» yon paneli: davr tanlanadi, dastur 1C da «Оборотно-сальдовая ведомость» ni (4010, 4310, 6010, 6310 hisoblari,
/// kontragentlar bo'yicha) o'zi sozlab shakllantiradi va oxirgi qoldiq bo'yicha kontragentni debitor yoki kreditor deb ko'rsatadi.
/// Natijani Excelga saqlash mumkin. 1C dagi sozlamalar saqlanmaydi.
/// </summary>
public sealed class DebtorPanel : UserControl
{
    readonly WebTab tab;
    readonly DateTimePicker from = new() { Format = DateTimePickerFormat.Custom, CustomFormat = "dd.MM.yyyy", Width = 110 };
    readonly DateTimePicker to = new() { Format = DateTimePickerFormat.Custom, CustomFormat = "dd.MM.yyyy", Width = 110 };
    readonly Button run = PanelStyle.Primary(new Button { Text = "▶  Hisobotni olish", Height = 34, Width = 190 });
    readonly Button stop = PanelStyle.Secondary(new Button { Text = "■  To'xtatish", Height = 34, Width = 120, Enabled = false }, danger: true);
    readonly Button save = PanelStyle.Secondary(new Button { Text = "💾  Excelga saqlash", Height = 34, Width = 170, Enabled = false });
    readonly ComboBox kind = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 120 };
    readonly TextBox search = new() { Width = 200, PlaceholderText = "Kontragent qidirish…" };
    readonly Label total = new() { AutoSize = false, Height = 40, Dock = DockStyle.Fill, ForeColor = PanelStyle.Muted };
    readonly Button close = PanelStyle.Secondary(new Button { Text = "✕", Width = 32, Dock = DockStyle.Right });
    readonly DataGridView grid = new()
    {
        Dock = DockStyle.Fill, AllowUserToAddRows = false, AllowUserToDeleteRows = false, ReadOnly = true, RowHeadersVisible = false,
        BackgroundColor = Color.White, BorderStyle = BorderStyle.None, SelectionMode = DataGridViewSelectionMode.FullRowSelect,
        AutoSizeRowsMode = DataGridViewAutoSizeRowsMode.None,
    };
    readonly RichTextBox logBox = new() { ReadOnly = true, Dock = DockStyle.Fill, BackColor = Color.White, Font = new Font("Consolas", 9f), BorderStyle = BorderStyle.None };
    List<PartyBalance> all = new();
    CancellationTokenSource? cts;
    bool busy;
    static readonly CultureInfo Ru = CultureInfo.GetCultureInfo("ru-RU");

    public DebtorPanel(WebTab tab)
    {
        this.tab = tab;
        Font = PanelStyle.Base;
        BackColor = PanelStyle.Back;
        Padding = new Padding(8);

        var today = DateTime.Today;
        from.Value = new DateTime(today.Year, 1, 1);
        to.Value = today;
        kind.Items.AddRange(new object[] { "Hammasi", "Debitor", "Kreditor" });
        kind.SelectedIndex = 0;

        var header = new Panel { Dock = DockStyle.Top, Height = 34 };
        header.Controls.Add(new Label { Text = "Debitor / kreditor", Dock = DockStyle.Fill, Font = PanelStyle.Title, ForeColor = Color.FromArgb(15, 23, 42), TextAlign = ContentAlignment.MiddleLeft });
        header.Controls.Add(close);

        var period = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 44, Padding = new Padding(0, 6, 0, 0) };
        period.Controls.Add(new Label { Text = "Davr:", AutoSize = true, Margin = new Padding(0, 6, 4, 0) });
        period.Controls.Add(from);
        period.Controls.Add(new Label { Text = "–", AutoSize = true, Margin = new Padding(4, 6, 4, 0) });
        period.Controls.Add(to);

        var buttons = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 44, Padding = new Padding(0, 4, 0, 0) };
        buttons.Controls.AddRange(new Control[] { run, stop, save });

        var filters = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 40, Padding = new Padding(0, 4, 0, 0) };
        filters.Controls.AddRange(new Control[] { kind, search });

        grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "party", HeaderText = "Kontragent", Width = 260 });
        grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "debit", HeaderText = "Debitor (Dt)", Width = 130 });
        grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "credit", HeaderText = "Kreditor (Kt)", Width = 130 });
        grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "net", HeaderText = "Qoldiq (Dt − Kt)", Width = 140 });
        grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "kind", HeaderText = "Holat", Width = 90 });
        foreach (var n in new[] { "debit", "credit", "net" }) grid.Columns[n]!.DefaultCellStyle.Alignment = DataGridViewContentAlignment.MiddleRight;

        var table = new TableLayoutPanel { Dock = DockStyle.Top, ColumnCount = 1, Height = 44 + 44 + 40 + 360 + 40 + 150 + 24, Margin = Padding.Empty, Padding = Padding.Empty };
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        void Add(Control c, int h) { c.Dock = DockStyle.Fill; c.Margin = new Padding(0, 0, 0, 4); table.RowStyles.Add(new RowStyle(SizeType.Absolute, h)); table.Controls.Add(c); }
        Add(period, 44); Add(buttons, 44); Add(filters, 40); Add(grid, 360); Add(total, 40); Add(logBox, 150);
        var scroller = new Panel { Dock = DockStyle.Fill, AutoScroll = true };
        scroller.Controls.Add(table);
        Controls.Add(scroller);
        Controls.Add(header);

        run.Click += async (_, _) => await RunAsync();
        stop.Click += (_, _) => cts?.Cancel();
        save.Click += (_, _) => SaveExcel();
        kind.SelectedIndexChanged += (_, _) => Fill();
        search.TextChanged += (_, _) => Fill();
        close.Click += (_, _) =>
        {
            if (busy && MessageBox.Show(this, "Jarayon ketmoqda. To'xtatib yopilsinmi?", AppInfo.DisplayName, MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            cts?.Cancel();
            tab.HideSidePanel();
        };
    }

    void Log(string text, string kind = "info")
    {
        if (InvokeRequired) { BeginInvoke(() => Log(text, kind)); return; }
        IshonchDesktop.Models.Log.Write("Debitor: " + text);
        logBox.SelectionColor = kind switch { "warn" => Color.FromArgb(180, 83, 9), "error" => PanelStyle.Danger, "ok" => Color.FromArgb(21, 128, 61), _ => Color.FromArgb(51, 65, 85) };
        logBox.AppendText($"{DateTime.Now:HH:mm:ss}  {text}\n");
        logBox.ScrollToCaret();
    }

    void SetBusy(bool on)
    {
        busy = on;
        run.Enabled = from.Enabled = to.Enabled = !on;
        stop.Enabled = on;
        save.Enabled = !on && all.Count > 0;
    }

    async Task RunAsync()
    {
        if (busy) return;
        var f = DateOnly.FromDateTime(from.Value.Date);
        var t = DateOnly.FromDateTime(to.Value.Date);
        if (t < f) { MessageBox.Show(this, "Davr oxiri boshidan oldin bo'lishi mumkin emas.", AppInfo.DisplayName); return; }
        cts = new CancellationTokenSource();
        SetBusy(true);
        try
        {
            await tab.Ready;
            var core = tab.Core ?? throw new InvalidOperationException("1C tabi tayyor emas");
            var runner = new DebtorRunner(core, Log, cts.Token);
            await runner.InitAsync();
            all = await runner.RunAsync(f, t);
            Fill();
        }
        catch (OperationCanceledException) { Log("To'xtatildi", "warn"); }
        catch (Exception e) { Log("Xato: " + e.Message, "error"); }
        finally { SetBusy(false); }
    }

    IEnumerable<PartyBalance> Filtered()
    {
        var q = search.Text.Trim();
        return all.Where(p => (kind.SelectedIndex == 0 || p.Kind == (string)kind.SelectedItem!)
            && (q.Length == 0 || p.Party.Contains(q, StringComparison.OrdinalIgnoreCase)));
    }

    void Fill()
    {
        grid.Rows.Clear();
        var list = Filtered().OrderByDescending(p => Math.Abs(p.Net)).ToList();
        foreach (var p in list)
            grid.Rows.Add(p.Party, p.Debit.ToString("N2", Ru), p.Credit.ToString("N2", Ru), p.Net.ToString("N2", Ru), p.Kind);
        var dt = list.Where(p => p.Net > 0).Sum(p => p.Net);
        var kt = list.Where(p => p.Net < 0).Sum(p => -p.Net);
        total.Text = $"Kontragentlar: {list.Count}   •   Debitor jami: {dt.ToString("N2", Ru)}   •   Kreditor jami: {kt.ToString("N2", Ru)}";
        save.Enabled = !busy && all.Count > 0;
    }

    void SaveExcel()
    {
        using var dlg = new SaveFileDialog { Filter = "Excel (*.xlsx)|*.xlsx", FileName = $"debitor-kreditor {from.Value:dd.MM.yyyy}-{to.Value:dd.MM.yyyy}.xlsx" };
        if (dlg.ShowDialog(this) != DialogResult.OK) return;
        try
        {
            var rows = new List<object?[]> { new object?[] { "Kontragent", "Debitor (Dt)", "Kreditor (Kt)", "Qoldiq (Dt − Kt)", "Holat", "Hisoblar" } };
            foreach (var p in Filtered().OrderByDescending(p => Math.Abs(p.Net)))
                rows.Add(new object?[] { p.Party, p.Debit, p.Credit, p.Net, p.Kind, string.Join(", ", p.Accounts.Select(a => a.Account)) });
            XlsxWriter.Save(dlg.FileName, "Debitor-kreditor", rows);
            Log("Excelga saqlandi: " + dlg.FileName, "ok");
        }
        catch (Exception e) { Log("Saqlab bo'lmadi: " + e.Message, "error"); }
    }
}
