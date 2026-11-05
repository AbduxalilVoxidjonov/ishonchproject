using System.Globalization;
using IshonchDesktop.Doverennost;
using IshonchDesktop.Models;
using IshonchDesktop.Unmarked;

namespace IshonchDesktop.UI;

/// <summary>
/// «Dovernis yaratish» yon paneli (1C tabining o'ng tomonida): bank ko'chirmasi (Excel) o'qiladi, kerakli to'lovlar belgilanadi, reja (raqam, sana, summa, tovar nomi)
/// ko'rsatiladi va tasdiqlangach 1C da Доверенности hujjatlari yaratiladi (faqat «Записать», provesti qilinmaydi).
/// </summary>
public sealed class DoverennostPanel : UserControl
{
    readonly WebTab tab;
    readonly Button pick = PanelStyle.Secondary(new Button { Text = "📂  Excel faylni tanlash", Height = 34, Width = 200 });
    readonly CheckBox hideFees = new() { Text = "Bank komissiyasini yashirish", Checked = true, AutoSize = true, Margin = new Padding(12, 8, 0, 0) };
    readonly Button all = PanelStyle.Secondary(new Button { Text = "Hammasini belgilash", Height = 34, Width = 160 });
    readonly Button none = PanelStyle.Secondary(new Button { Text = "Belgini olish", Height = 34, Width = 120 });
    readonly Button makePlan = PanelStyle.Primary(new Button { Text = "📋  Reja tuzish (1C ni o'qiydi)", Height = 34, Width = 300, Enabled = false });
    readonly Button create = PanelStyle.Primary(new Button { Text = "▶  Dovernislarni yaratish", Height = 34, Width = 220, Enabled = false });
    readonly Button mark = PanelStyle.Secondary(new Button { Text = "☑  Yaratilganlarni 1C da belgilash", Height = 34, Width = 300 });
    readonly Button stop = PanelStyle.Secondary(new Button { Text = "■  To'xtatish", Height = 34, Width = 120, Enabled = false }, danger: true);
    readonly CheckedListBox partyList = new() { Dock = DockStyle.Top, Height = 110, CheckOnClick = true, IntegralHeight = false, BorderStyle = BorderStyle.FixedSingle };
    readonly CheckBox onlyParties = new() { Text = "Faqat tanlangan kontragentlar", Checked = true, AutoSize = true, Margin = new Padding(12, 8, 0, 0) };
    readonly DataGridView rowsGrid = Grid();
    readonly DataGridView planGrid = Grid();
    readonly RichTextBox logBox = new() { ReadOnly = true, Dock = DockStyle.Fill, BackColor = Color.White, Font = new Font("Consolas", 9f), BorderStyle = BorderStyle.None };
    readonly Button close = PanelStyle.Secondary(new Button { Text = "✕", Width = 32, Dock = DockStyle.Right });
    readonly Label fileLabel = new() { AutoSize = true, ForeColor = PanelStyle.Muted, Margin = new Padding(12, 10, 0, 0) };

    readonly DoverennostStore store;
    List<BankRow> loaded = new();
    List<PlanItem> plan = new();
    CancellationTokenSource? cts;
    bool busy;

    static DataGridView Grid() => new()
    {
        Dock = DockStyle.Fill, AllowUserToAddRows = false, AllowUserToDeleteRows = false, RowHeadersVisible = false,
        BackgroundColor = Color.White, BorderStyle = BorderStyle.None, SelectionMode = DataGridViewSelectionMode.FullRowSelect,
        AutoSizeRowsMode = DataGridViewAutoSizeRowsMode.None, EditMode = DataGridViewEditMode.EditOnEnter,
    };

    public DoverennostPanel(WebTab tab)
    {
        this.tab = tab;
        store = new DoverennostStore(tab.ProfileKey);
        Font = PanelStyle.Base;
        BackColor = PanelStyle.Back;
        Padding = new Padding(8);

        var header = new Panel { Dock = DockStyle.Top, Height = 34 };
        header.Controls.Add(new Label { Text = "Dovernis yaratish (Excel)", Dock = DockStyle.Fill, Font = PanelStyle.Title, ForeColor = Color.FromArgb(15, 23, 42), TextAlign = ContentAlignment.MiddleLeft });
        header.Controls.Add(close);
        var top = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 78, Padding = new Padding(0, 4, 0, 0) };
        top.Controls.AddRange(new Control[] { pick, hideFees, onlyParties, fileLabel });
        var bar1 = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 84, Padding = new Padding(0, 4, 0, 0) };
        bar1.Controls.AddRange(new Control[] { all, none, makePlan });
        var bar2 = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 46, Padding = new Padding(0, 4, 0, 0) };
        bar2.Controls.AddRange(new Control[] { create, stop, mark });
        bar2.Height = 88;

        rowsGrid.Columns.Add(new DataGridViewCheckBoxColumn { Name = "pick", HeaderText = "✓", Width = 36 });
        foreach (var (n, h, w, ro) in new[] { ("date", "Sana", 80, true), ("party", "Kontragent", 200, true), ("sum", "Summa", 100, true), ("purpose", "To'lov maqsadi", 500, true) })
            rowsGrid.Columns.Add(new DataGridViewTextBoxColumn { Name = n, HeaderText = h, Width = w, ReadOnly = ro });
        rowsGrid.Columns["sum"]!.DefaultCellStyle.Alignment = DataGridViewContentAlignment.MiddleRight;

        planGrid.Columns.Add(new DataGridViewCheckBoxColumn { Name = "go", HeaderText = "✓", Width = 36 });
        foreach (var (n, h, w, ro) in new[] { ("num", "Raqam", 64, false), ("date", "Sana", 80, true), ("party", "Kontragent", 180, true), ("sum", "Summa", 100, true), ("contract", "Shartnoma №", 90, false), ("goods", "Tovar nomi (tahrirlash mumkin)", 300, false), ("state", "Holat", 130, true) })
            planGrid.Columns.Add(new DataGridViewTextBoxColumn { Name = n, HeaderText = h, Width = w, ReadOnly = ro });
        planGrid.Columns["sum"]!.DefaultCellStyle.Alignment = DataGridViewContentAlignment.MiddleRight;

        var split = new SplitContainer { Dock = DockStyle.Fill, Orientation = Orientation.Horizontal, SplitterDistance = 260 };
        var rowsHost = new Panel { Dock = DockStyle.Fill };
        rowsHost.Controls.Add(rowsGrid);
        rowsHost.Controls.Add(partyList);
        rowsHost.Controls.Add(bar1);
        var planHost = new Panel { Dock = DockStyle.Fill };
        var lower = new SplitContainer { Dock = DockStyle.Fill, Orientation = Orientation.Horizontal, SplitterDistance = 200 };
        lower.Panel1.Controls.Add(planGrid);
        lower.Panel1.Controls.Add(bar2);
        lower.Panel2.Controls.Add(logBox);
        planHost.Controls.Add(lower);
        split.Panel1.Controls.Add(rowsHost);
        split.Panel2.Controls.Add(planHost);
        Controls.Add(split);
        Controls.Add(top);
        Controls.Add(header);

        pick.Click += (_, _) => PickFile();
        hideFees.CheckedChanged += (_, _) => { FillParties(); FillRows(); };
        onlyParties.CheckedChanged += (_, _) => FillRows();
        partyList.ItemCheck += (_, _) => BeginInvoke(FillRows);
        all.Click += (_, _) => { foreach (DataGridViewRow r in rowsGrid.Rows) r.Cells["pick"].Value = true; };
        none.Click += (_, _) => { foreach (DataGridViewRow r in rowsGrid.Rows) r.Cells["pick"].Value = false; };
        makePlan.Click += async (_, _) => await MakePlanAsync();
        create.Click += async (_, _) => await CreateAsync();
        stop.Click += (_, _) => cts?.Cancel();
        mark.Click += async (_, _) => await MarkAsync();
        UpdateMark();
        rowsGrid.CurrentCellDirtyStateChanged += (_, _) => { if (rowsGrid.IsCurrentCellDirty) rowsGrid.CommitEdit(DataGridViewDataErrorContexts.Commit); };
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
        logBox.SelectionColor = kind switch { "warn" => Color.FromArgb(180, 83, 9), "error" => PanelStyle.Danger, "ok" => Color.FromArgb(21, 128, 61), _ => Color.FromArgb(51, 65, 85) };
        logBox.AppendText($"{DateTime.Now:HH:mm:ss}  {text}\n");
        logBox.ScrollToCaret();
    }

    void PickFile()
    {
        using var dlg = new OpenFileDialog { Filter = "Excel (*.xls;*.xlsx)|*.xls;*.xlsx", Title = "Bank ko'chirmasi (Список.xls)" };
        if (dlg.ShowDialog(this) != DialogResult.OK) return;
        try
        {
            loaded = BankStatement.Load(dlg.FileName);
            fileLabel.Text = Path.GetFileName(dlg.FileName) + $" — {loaded.Count} ta chiqim";
            partyList.Items.Clear();
            FillParties();
            FillRows();
            plan.Clear();
            planGrid.Rows.Clear();
            create.Enabled = false;
            Log($"{Path.GetFileName(dlg.FileName)}: {loaded.Count} ta chiqim qatori o'qildi. Dovernis kerak bo'lganlarini belgilang.");
        }
        catch (Exception e)
        {
            Log("Faylni o'qib bo'lmadi: " + e.Message, "error");
            MessageBox.Show(this, "Faylni o'qib bo'lmadi: " + e.Message, AppInfo.DisplayName, MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    /// <summary>Kontragentlar ro'yxati (nechta to'lov borligi bilan); belgilanganlari saqlanib qoladi.</summary>
    void FillParties()
    {
        var checkedNames = partyList.CheckedItems.Cast<string>().Select(x => x.Split('	')[0]).ToHashSet(StringComparer.OrdinalIgnoreCase);
        partyList.Items.Clear();
        foreach (var g in loaded.Where(r => !(hideFees.Checked && r.LooksLikeBankFee)).GroupBy(r => r.Counterparty).OrderBy(g => g.Key, StringComparer.OrdinalIgnoreCase))
            partyList.Items.Add($"{g.Key}	({g.Count()})", checkedNames.Contains(g.Key));
    }

    void FillRows()
    {
        var parties = partyList.CheckedItems.Cast<string>().Select(x => x.Split('	')[0]).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var filter = onlyParties.Checked && parties.Count > 0;
        var picked = rowsGrid.Rows.Cast<DataGridViewRow>().Where(r => r.Cells["pick"].Value is true).Select(r => (int)r.Tag!).ToHashSet();
        rowsGrid.Rows.Clear();
        foreach (var r in loaded.Where(r => !(hideFees.Checked && r.LooksLikeBankFee) && (!filter || parties.Contains(r.Counterparty))))
        {
            var i = rowsGrid.Rows.Add(picked.Contains(r.Line), r.Date.ToString("dd.MM.yyyy"), r.Counterparty, r.Amount.ToString("N0", CultureInfo.GetCultureInfo("ru-RU")), r.Purpose);
            rowsGrid.Rows[i].Tag = r.Line;
        }
        makePlan.Enabled = rowsGrid.Rows.Count > 0;
    }

    async Task<DoverennostRunner> StartRunnerAsync(CancellationToken ct)
    {
        await tab.Ready;
        var core = tab.Core ?? throw new InvalidOperationException("1C tabi tayyor emas");
        var runner = new DoverennostRunner(core, Log, ct);
        await runner.InitAsync();
        return runner;
    }

    void SetBusy(bool on)
    {
        busy = on;
        pick.Enabled = all.Enabled = none.Enabled = hideFees.Enabled = !on;
        makePlan.Enabled = !on && rowsGrid.Rows.Count > 0;
        create.Enabled = !on && plan.Count > 0;
        stop.Enabled = on;
    }

    async Task MakePlanAsync()
    {
        var pickedLines = rowsGrid.Rows.Cast<DataGridViewRow>().Where(r => r.Cells["pick"].Value is true).Select(r => (int)r.Tag!).ToHashSet();
        if (pickedLines.Count == 0) { MessageBox.Show(this, "Avval kerakli to'lovlarni belgilang.", AppInfo.DisplayName); return; }
        cts = new CancellationTokenSource();
        SetBusy(true);
        try
        {
            var runner = await StartRunnerAsync(cts.Token);
            var existing = await runner.ReadExistingAsync();
            plan = DoverennostPlanner.Build(loaded.Where(r => pickedLines.Contains(r.Line)), existing);
            planGrid.Rows.Clear();
            foreach (var p in plan)
            {
                var state = p.Status switch { PlanStatus.Exists => $"allaqachon bor (№{p.ExistingNumber})", PlanStatus.NoNumber => "raqam aniqlanmadi", _ => "yangi" };
                var i = planGrid.Rows.Add(p.Status == PlanStatus.New, p.Number, p.Date.ToString("dd.MM.yyyy"), p.Counterparty,
                    p.Amount.ToString("N0", CultureInfo.GetCultureInfo("ru-RU")), p.Contract, p.GoodsName, state);
                planGrid.Rows[i].Tag = p;
                if (p.Status != PlanStatus.New) planGrid.Rows[i].DefaultCellStyle.ForeColor = PanelStyle.Muted;
            }
            Log($"Reja: {plan.Count} ta dovernis, shundan yangisi {plan.Count(p => p.Status == PlanStatus.New)}. Raqam va tovar nomini tekshirib, «Yaratish» ni bosing.", "ok");
        }
        catch (OperationCanceledException) { Log("To'xtatildi", "warn"); }
        catch (Exception e) { Log("Reja tuzib bo'lmadi: " + e.Message, "error"); }
        finally { SetBusy(false); }
    }

    void UpdateMark() => mark.Text = store.Items.Count > 0
        ? $"☑  Yaratilganlarni 1C da belgilash ({store.Items.Count})" : "☑  Yaratilganlarni 1C da belgilash";

    /// <summary>Dastur yaratgan (eslab qolingan) dovernislarni 1C ro'yxatida belgilaydi; «Yo'q» — ro'yxatni tozalaydi.</summary>
    async Task MarkAsync()
    {
        if (store.Items.Count == 0) { MessageBox.Show(this, "Hali dastur yaratgan dovernis yo'q.", AppInfo.DisplayName); return; }
        var ask = MessageBox.Show(this, $"Dastur yaratgan {store.Items.Count} ta dovernis 1C ro'yxatida belgilansinmi?\n\n«Yo'q» — eslab qolingan ro'yxatni tozalaydi.",
            AppInfo.DisplayName, MessageBoxButtons.YesNoCancel, MessageBoxIcon.Question);
        if (ask == DialogResult.No) { store.Clear(); UpdateMark(); Log("Eslab qolingan ro'yxat tozalandi"); return; }
        if (ask != DialogResult.Yes) return;
        cts = new CancellationTokenSource();
        SetBusy(true);
        try
        {
            var runner = await StartRunnerAsync(cts.Token);
            await runner.SelectAsync(store.Items.Select(e => (e.Number, e.Date)).ToList());
        }
        catch (OperationCanceledException) { Log("To'xtatildi", "warn"); }
        catch (Exception e) { Log("Belgilab bo'lmadi: " + e.Message, "error"); }
        finally { SetBusy(false); }
    }

    async Task CreateAsync()
    {
        var todo = planGrid.Rows.Cast<DataGridViewRow>().Where(r => r.Cells["go"].Value is true).ToList();
        if (todo.Count == 0) { MessageBox.Show(this, "Yaratiladigan dovernis belgilanmagan.", AppInfo.DisplayName); return; }
        if (MessageBox.Show(this, $"{todo.Count} ta dovernis 1C da yaratiladi (faqat saqlanadi, provesti qilinmaydi). 1C ga tegmang. Davom etilsinmi?",
                AppInfo.DisplayName, MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
        cts = new CancellationTokenSource();
        SetBusy(true);
        var createdNow = new List<PlanItem>();
        try
        {
            var runner = await StartRunnerAsync(cts.Token);
            foreach (var row in todo)
            {
                cts.Token.ThrowIfCancellationRequested();
                var p = (PlanItem)row.Tag!;
                // Jadvalda tahrirlangan raqam va tovar nomi olinadi
                p.Number = (row.Cells["num"].Value?.ToString() ?? "").Trim();
                p.GoodsName = (row.Cells["goods"].Value?.ToString() ?? "").Trim();
                p.Contract = (row.Cells["contract"].Value?.ToString() ?? "").Trim();
                if (p.Number.Length == 0 || p.GoodsName.Length == 0) { row.Cells["state"].Value = "raqam/nom yo'q"; continue; }
                try
                {
                    var outcome = await runner.CreateAsync(p);
                    if (outcome == CreateOutcome.Created) { store.Add(p); createdNow.Add(p); UpdateMark(); }
                    row.Cells["state"].Value = outcome == CreateOutcome.Created ? "✔ yaratildi" : "kontragent topilmadi";
                    row.Cells["go"].Value = false;
                }
                catch (OperationCanceledException) { throw; }
                catch (Exception e)
                {
                    row.Cells["state"].Value = "xato";
                    Log($"№{p.Number} {p.Counterparty}: {e.Message}", "error");
                    break; // keyingi raqamlar bu hujjatga bog'liq — to'xtaymiz
                }
            }
            Log("Tugadi", "ok");
            if (createdNow.Count > 0) await runner.SelectAsync(createdNow.Select(p => (p.Number, p.Date)).ToList());
        }
        catch (OperationCanceledException) { Log("To'xtatildi", "warn"); }
        catch (Exception e) { Log("Xato: " + e.Message, "error"); }
        finally { SetBusy(false); }
    }
}
