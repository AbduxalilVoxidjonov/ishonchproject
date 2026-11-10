using System.Globalization;
using IshonchDesktop.Debtors;
using IshonchDesktop.Models;

namespace IshonchDesktop.UI;

/// <summary>
/// «Hamma bazalar: debitor/kreditor (xls)» oynasi: bir nechta baza belgilanadi, bitta foydalanuvchi va parol kiritiladi.
/// Dastur hamma bazaga kiradi (parol faqat shu oyna ochiq turganda xotirada, hech qayerga yozilmaydi), so'ng har bazada
/// «Оборотно-сальдовая ведомость» ni o'zi sozlab, 1C ning «Сохранить» tugmasi bilan baza nomli .xls fayliga saqlaydi.
/// </summary>
public sealed class BatchDebtorForm : Form
{
    readonly Func<BaseEntry, WebTab> open;
    readonly Action<WebTab> select;
    readonly List<BaseEntry> bases;
    readonly TextBox filter = new() { PlaceholderText = "Qidirish: firma, INN, baza…", Dock = DockStyle.Top };
    readonly CheckedListBox list = new() { Dock = DockStyle.Fill, CheckOnClick = true, IntegralHeight = false };
    readonly TextBox user = new() { Width = 260 };
    readonly TextBox password = new() { Width = 260, UseSystemPasswordChar = true };
    readonly DateTimePicker from = new() { Format = DateTimePickerFormat.Custom, CustomFormat = "dd.MM.yyyy", Width = 110 };
    readonly DateTimePicker to = new() { Format = DateTimePickerFormat.Custom, CustomFormat = "dd.MM.yyyy", Width = 110 };
    readonly TextBox folder = new() { Width = 360 };
    readonly Button browse = new() { Text = "…", Width = 36 };
    readonly Button start = PanelStyle.Primary(new Button { Text = "▶  Boshlash", Height = 36, Width = 160 });
    readonly Button stop = PanelStyle.Secondary(new Button { Text = "■  To'xtatish", Height = 36, Width = 120, Enabled = false }, danger: true);
    readonly Label count = new() { AutoSize = true, ForeColor = PanelStyle.Muted };
    readonly DataGridView grid = new()
    {
        Dock = DockStyle.Fill, AllowUserToAddRows = false, ReadOnly = true, RowHeadersVisible = false, BackgroundColor = Color.White,
        BorderStyle = BorderStyle.None, SelectionMode = DataGridViewSelectionMode.FullRowSelect,
    };
    readonly RichTextBox logBox = new() { ReadOnly = true, Dock = DockStyle.Fill, BackColor = Color.White, Font = new Font("Consolas", 9f), BorderStyle = BorderStyle.None };
    CancellationTokenSource? cts;
    bool busy;

    public BatchDebtorForm(IEnumerable<BaseEntry> allBases, Func<BaseEntry, WebTab> open, Action<WebTab> select)
    {
        this.open = open;
        this.select = select;
        bases = allBases.OrderBy(b => b.No ?? int.MaxValue).ThenBy(b => b.Db, StringComparer.OrdinalIgnoreCase).ToList();
        Text = "Hamma bazalar: debitor / kreditor (xls)";
        Size = new Size(1080, 760);
        StartPosition = FormStartPosition.CenterParent;
        Font = PanelStyle.Base;
        BackColor = PanelStyle.Back;

        var today = DateTime.Today;
        from.Value = new DateTime(today.Year, 1, 1);
        to.Value = today;
        folder.Text = DebtorSettings.Folder;

        // Chap: bazalar ro'yxati
        var left = new Panel { Dock = DockStyle.Left, Width = 380, Padding = new Padding(8) };
        var leftBtns = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 40 };
        var all = PanelStyle.Secondary(new Button { Text = "Hammasini belgilash", Height = 30, Width = 150 });
        var none = PanelStyle.Secondary(new Button { Text = "Belgini olish", Height = 30, Width = 110 });
        leftBtns.Controls.AddRange(new Control[] { all, none });
        left.Controls.Add(list);
        left.Controls.Add(leftBtns);
        left.Controls.Add(filter);

        // O'ng: sozlamalar, holat, jurnal
        var form = new TableLayoutPanel { Dock = DockStyle.Top, ColumnCount = 2, AutoSize = true, Padding = new Padding(8) };
        form.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 150));
        form.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        void Row(string label, Control c)
        {
            form.Controls.Add(new Label { Text = label, AutoSize = true, Margin = new Padding(0, 8, 0, 0) });
            form.Controls.Add(c);
        }
        Row("1C foydalanuvchisi", user);
        Row("Parol", password);
        var period = new FlowLayoutPanel { AutoSize = true, Margin = Padding.Empty };
        period.Controls.AddRange(new Control[] { from, new Label { Text = "–", AutoSize = true, Margin = new Padding(6, 6, 6, 0) }, to });
        Row("Davr", period);
        var fold = new FlowLayoutPanel { AutoSize = true, Margin = Padding.Empty };
        fold.Controls.AddRange(new Control[] { folder, browse });
        Row("Saqlash papkasi", fold);
        var btns = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 48, Padding = new Padding(8, 4, 8, 0) };
        btns.Controls.AddRange(new Control[] { start, stop, count });
        var hint = new Label
        {
            Dock = DockStyle.Top, Height = 54, Padding = new Padding(10, 0, 10, 0), ForeColor = PanelStyle.Muted,
            Text = "Avval hamma bazaga kiriladi (bazalar tab bo'lib ochiladi), keyin har birida hisobot sozlanib saqlanadi. Ish paytida 1C va oynalarga tegmang. Login yoki parol mos kelmagan bazalar o'tkazib yuboriladi, qolganlari davom etadi.",
        };

        grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "base", HeaderText = "Baza", Width = 260 });
        grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "state", HeaderText = "Holat", AutoSizeMode = DataGridViewAutoSizeColumnMode.Fill });
        var right = new SplitContainer { Dock = DockStyle.Fill, Orientation = Orientation.Horizontal, SplitterDistance = 230 };
        right.Panel1.Controls.Add(grid);
        right.Panel2.Controls.Add(logBox);

        var rightHost = new Panel { Dock = DockStyle.Fill };
        rightHost.Controls.Add(right);
        rightHost.Controls.Add(btns);
        rightHost.Controls.Add(hint);
        rightHost.Controls.Add(form);
        Controls.Add(rightHost);
        Controls.Add(left);

        FillList();
        filter.TextChanged += (_, _) => FillList();
        all.Click += (_, _) => { for (var i = 0; i < list.Items.Count; i++) list.SetItemChecked(i, true); };
        none.Click += (_, _) => { for (var i = 0; i < list.Items.Count; i++) list.SetItemChecked(i, false); };
        list.ItemCheck += (_, _) => BeginInvoke(UpdateCount);
        browse.Click += (_, _) =>
        {
            using var dlg = new FolderBrowserDialog { SelectedPath = folder.Text };
            if (dlg.ShowDialog(this) == DialogResult.OK) folder.Text = dlg.SelectedPath;
        };
        start.Click += async (_, _) => await RunAsync();
        stop.Click += (_, _) => cts?.Cancel();
        FormClosing += (_, e) =>
        {
            if (busy && MessageBox.Show(this, "Jarayon ketmoqda. To'xtatib yopilsinmi?", AppInfo.DisplayName, MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) { e.Cancel = true; return; }
            cts?.Cancel();
            password.Text = "";
        };
    }

    readonly HashSet<int> checkedIds = new();

    void FillList()
    {
        var q = filter.Text.Trim();
        // Belgilanganlar saqlanib qoladi
        for (var i = 0; i < list.Items.Count; i++)
            if (list.Items[i] is Item it) { if (list.GetItemChecked(i)) checkedIds.Add(it.Base.Id); else checkedIds.Remove(it.Base.Id); }
        list.Items.Clear();
        foreach (var b in bases.Where(b => q.Length == 0 || $"{b.Firm} {b.Inn} {b.Db} {b.Accountant}".Contains(q, StringComparison.OrdinalIgnoreCase)))
            list.Items.Add(new Item(b), checkedIds.Contains(b.Id));
        UpdateCount();
    }

    sealed record Item(BaseEntry Base)
    {
        public override string ToString() => $"{Base.Db} — {Base.Firm}";
    }

    List<BaseEntry> Selected()
    {
        for (var i = 0; i < list.Items.Count; i++)
            if (list.Items[i] is Item it) { if (list.GetItemChecked(i)) checkedIds.Add(it.Base.Id); else checkedIds.Remove(it.Base.Id); }
        return bases.Where(b => checkedIds.Contains(b.Id)).ToList();
    }

    void UpdateCount() => count.Text = $"Belgilangan: {Selected().Count}";

    void Log(string text, string kind = "info")
    {
        if (InvokeRequired) { BeginInvoke(() => Log(text, kind)); return; }
        IshonchDesktop.Models.Log.Write("Hamma bazalar: " + text);
        logBox.SelectionColor = kind switch { "warn" => Color.FromArgb(180, 83, 9), "error" => PanelStyle.Danger, "ok" => Color.FromArgb(21, 128, 61), _ => Color.FromArgb(51, 65, 85) };
        logBox.AppendText($"{DateTime.Now:HH:mm:ss}  {text}\n");
        logBox.ScrollToCaret();
    }

    void SetState(Dictionary<int, int> rows, BaseEntry b, string state)
    {
        if (InvokeRequired) { BeginInvoke(() => SetState(rows, b, state)); return; }
        if (rows.TryGetValue(b.Id, out var i)) grid.Rows[i].Cells["state"].Value = state;
    }

    async Task RunAsync()
    {
        if (busy) return;
        var chosen = Selected();
        if (chosen.Count == 0) { MessageBox.Show(this, "Avval bazalarni belgilang.", AppInfo.DisplayName); return; }
        if (user.Text.Trim().Length == 0 || password.Text.Length == 0) { MessageBox.Show(this, "Foydalanuvchi va parolni kiriting.", AppInfo.DisplayName); return; }
        var f = DateOnly.FromDateTime(from.Value.Date);
        var t = DateOnly.FromDateTime(to.Value.Date);
        if (t < f) { MessageBox.Show(this, "Davr oxiri boshidan oldin bo'lishi mumkin emas.", AppInfo.DisplayName); return; }
        if (MessageBox.Show(this, $"{chosen.Count} ta bazaga kirilib, hisobot .xls ga saqlanadi. Davom etilsinmi?", AppInfo.DisplayName, MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;

        cts = new CancellationTokenSource();
        busy = true;
        start.Enabled = false; stop.Enabled = true;
        grid.Rows.Clear();
        var rows = new Dictionary<int, int>();
        foreach (var b in chosen) rows[b.Id] = grid.Rows.Add($"{b.Db} — {b.Firm}", "navbatda");
        var tabs = new Dictionary<int, WebTab>();
        var pass = password.Text;
        try
        {
            // 1-bosqich: hamma bazaga kirish
            foreach (var b in chosen)
            {
                cts.Token.ThrowIfCancellationRequested();
                SetState(rows, b, "ochilmoqda…");
                try
                {
                    var tab = open(b);
                    select(tab);
                    var res = await OneCLogin.EnsureAsync(tab, user.Text, pass, cts.Token);
                    tabs[b.Id] = tab;
                    SetState(rows, b, res == LoginResult.AlreadyIn ? "kirilgan" : "kirildi");
                    Log($"{b.Db}: " + (res == LoginResult.AlreadyIn ? "allaqachon kirilgan" : "kirildi"), "ok");
                }
                catch (OperationCanceledException) { throw; }
                catch (Exception e)
                {
                    SetState(rows, b, "kirish xato: " + e.Message);
                    Log($"{b.Db}: {e.Message}", "error");
                    // Login yoki parol mos kelmagan bazalar o'tkazib yuboriladi, qolganlariga kirish davom etadi
                }
            }
            password.Text = "";
            pass = "";
            if (tabs.Count == 0) { Log("Hech bir bazaga kirilmadi — login/parolni tekshiring.", "error"); return; }
            Log($"Kirildi: {tabs.Count} / {chosen.Count}. Kirilmaganlari o'tkazib yuboriladi.", tabs.Count == chosen.Count ? "ok" : "warn");

            // 2-bosqich: har bazada hisobot va saqlash
            Directory.CreateDirectory(folder.Text); DebtorSettings.Folder = folder.Text;
            var ok = 0;
            foreach (var b in chosen.Where(b => tabs.ContainsKey(b.Id)))
            {
                cts.Token.ThrowIfCancellationRequested();
                SetState(rows, b, "hisobot…");
                try
                {
                    var tab = tabs[b.Id];
                    select(tab);
                    await tab.Ready;
                    var runner = new DebtorRunner(tab.Core!, (m, k) => Log($"{b.Db}: {m}", k), cts.Token);
                    await runner.InitAsync();
                    await runner.PrepareAsync(f, t);
                    var path = Path.Combine(folder.Text, DebtorSettings.FileName(b));
                    SetState(rows, b, "saqlanmoqda…");
                    await runner.ExportXlsAsync(path);
                    SetState(rows, b, "✔ " + Path.GetFileName(path));
                    ok++;
                }
                catch (OperationCanceledException) { throw; }
                catch (Exception e)
                {
                    SetState(rows, b, "xato: " + e.Message);
                    Log($"{b.Db}: {e.Message}", "error");
                }
            }
            Log($"Tugadi: {ok} / {chosen.Count} ta fayl saqlandi → {folder.Text}", ok == chosen.Count ? "ok" : "warn");
        }
        catch (OperationCanceledException) { Log("To'xtatildi", "warn"); }
        catch (Exception e) { Log("Xato: " + e.Message, "error"); }
        finally
        {
            password.Text = "";
            busy = false;
            start.Enabled = true; stop.Enabled = false;
        }
    }
}
