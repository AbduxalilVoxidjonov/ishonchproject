using System.Globalization;
using IshonchDesktop.Epos;
using IshonchDesktop.Models;
using IshonchDesktop.Unmarked;

namespace IshonchDesktop.UI;

/// <summary>
/// «Markirovkasiz sotish» yon paneli (1C tabining o'ng tomonida, markirovka paneli kabi): chek summasi, cheklar soni,
/// har chekdagi tovar qatorlari soni, narx foizi va sklad kiritiladi; dastur 1C da hujjatlarni o'zi yaratadi (UnmarkedRunner).
/// Qiymatlar har baza uchun alohida saqlanadi.
/// </summary>
public sealed class UnmarkedPanel : UserControl
{
    readonly WebTab tab;
    readonly BaseEntry? baseEntry;
    readonly Func<Task<WebTab>>? getSoliqTab;
    /// <summary>«E-POS orqali sotish» — avtomatik bosilmaydi: faqat foydalanuvchi bosganda provesti qilingan chekni sotadi.</summary>
    readonly Button epos = PanelStyle.Secondary(new Button { Text = "🧾  E-POS orqali sotish", Height = 36, Dock = DockStyle.Fill, Enabled = false });
    /// <summary>Provesti qilingan cheklar va ular E-POS orqali sotilganmi.</summary>
    readonly List<(MarkingReceipt Receipt, bool Sold)> posted = new();
    readonly Settings settings;
    readonly UnmarkedPrefs prefs;
    readonly TextBox target = new() { Dock = DockStyle.Fill, BorderStyle = BorderStyle.FixedSingle, TextAlign = HorizontalAlignment.Right };
    readonly NumericUpDown count = new() { Minimum = 1, Maximum = 500, Width = 80, TextAlign = HorizontalAlignment.Right };
    readonly NumericUpDown lines = new() { Minimum = 1, Maximum = 500, Width = 80, TextAlign = HorizontalAlignment.Right };
    readonly NumericUpDown maxPerItem = new() { Minimum = 0, Maximum = 100000, Width = 80, TextAlign = HorizontalAlignment.Right };
    readonly TextBox percent = new() { Width = 80, BorderStyle = BorderStyle.FixedSingle, TextAlign = HorizontalAlignment.Right };
    /// <summary>Inventarizatsiya hujjatiga yoziladigan sana va vaqt (soniyasigacha); har ochilganda — bugun 23:59:59.</summary>
    readonly DateTimePicker inventoryDate = new()
    {
        Format = DateTimePickerFormat.Custom, CustomFormat = "dd.MM.yyyy  HH:mm:ss", Value = UnmarkedOptions.DefaultInventoryDate(),
    };
    readonly TextBox warehouse = new() { Dock = DockStyle.Fill, BorderStyle = BorderStyle.FixedSingle };
    readonly CheckBox post = new() { Text = "Hujjatlarni provesti qilish", AutoSize = true, Dock = DockStyle.Top };
    readonly CheckBox refresh = new() { Text = "Boshlashdan oldin inventarizatsiyani yangilash", AutoSize = true, Dock = DockStyle.Top };
    readonly Button start = PanelStyle.Primary(new Button { Text = "▶  Boshlash", Height = 36, Dock = DockStyle.Fill, Margin = new Padding(0, 0, 4, 0) });
    readonly Button pause = PanelStyle.Secondary(new Button { Text = "⏸  Pauza", Height = 36, Dock = DockStyle.Fill, Enabled = false, Margin = new Padding(4, 0, 4, 0) });
    readonly Button stop = PanelStyle.Secondary(new Button { Text = "■  To'xtatish", Height = 36, Dock = DockStyle.Fill, Enabled = false, Margin = new Padding(4, 0, 0, 0) }, danger: true);
    /// <summary>Hozir ishlayotgan jarayon (pauza shu orqali).</summary>
    UnmarkedRunner? runner;
    /// <summary>To'xtatilgan yoki xato bilan tugagan jarayon — «Boshlash» uni qolgan cheklardan davom ettiradi.</summary>
    UnmarkedRunner? resumable;
    readonly Button close = PanelStyle.Secondary(new Button { Text = "✕", Width = 32, Dock = DockStyle.Right });
    readonly RichTextBox logBox = new() { ReadOnly = true, Dock = DockStyle.Fill, BackColor = Color.White, Font = new Font("Consolas", 9f), BorderStyle = BorderStyle.None };
    CancellationTokenSource? cts;

    public string BaseTitle { get; }
    public bool Running { get; private set; }

    public UnmarkedPanel(WebTab tab, Settings settings, string baseKey, string baseTitle, BaseEntry? baseEntry = null, Func<Task<WebTab>>? getSoliqTab = null)
    {
        this.tab = tab;
        this.baseEntry = baseEntry;
        this.getSoliqTab = getSoliqTab;
        this.settings = settings;
        BaseTitle = baseTitle;
        prefs = settings.GetUnmarked(baseKey);

        var ru = CultureInfo.GetCultureInfo("ru-RU");
        target.Text = prefs.Target.ToString("0.##", CultureInfo.InvariantCulture);
        ThousandsInput.Attach(target);
        count.Value = Math.Clamp(prefs.Count, 1, 500);
        lines.Value = Math.Clamp(prefs.Lines, 1, 500);
        maxPerItem.Value = Math.Clamp(prefs.MaxPerItem, 0, 100000);
        percent.Text = prefs.Percent.ToString("0.##", ru);
        warehouse.Text = prefs.Warehouse;
        post.Checked = prefs.Post;
        refresh.Checked = prefs.RefreshInventory;

        BackColor = PanelStyle.Back;
        Font = PanelStyle.Base;
        Padding = new Padding(8);

        // Sarlavha
        var header = new Panel { Dock = DockStyle.Top, Height = 46 };
        var title = new Label { Text = "Markirovkasiz sotish", Dock = DockStyle.Top, Height = 24, Font = PanelStyle.Title, ForeColor = Color.FromArgb(15, 23, 42) };
        var baseLabel = new Label { Text = baseTitle, Dock = DockStyle.Top, Height = 18, ForeColor = PanelStyle.Muted, AutoEllipsis = true };
        header.Controls.Add(baseLabel);
        header.Controls.Add(title);
        header.Controls.Add(close);

        // Parametrlar kartasi: chapda nom, o'ngda maydon
        var card = PanelStyle.CardPanel(new Padding(12, 10, 12, 10));
        card.Dock = DockStyle.Top;
        var grid = new TableLayoutPanel { Dock = DockStyle.Top, AutoSize = true, ColumnCount = 2, BackColor = PanelStyle.Card };
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 58));
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 42));
        void Row(string label, Control c, bool wide = false)
        {
            var l = new Label { Text = label, AutoSize = false, Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft, ForeColor = Color.FromArgb(51, 65, 85), Height = 28 };
            if (wide)
            {
                grid.Controls.Add(l);
                grid.SetColumnSpan(l, 2);
                c.Dock = DockStyle.Fill;
                grid.Controls.Add(c);
                grid.SetColumnSpan(c, 2);
                return;
            }
            c.Anchor = AnchorStyles.Left | AnchorStyles.Right;
            grid.Controls.Add(l);
            grid.Controls.Add(c);
        }
        Row("Inventarizatsiya sanasi va vaqti", inventoryDate, wide: true);
        Row("Umumiy summa (NDS bilan, so'm)", target, wide: true);
        Row("Cheklar soni", count);
        Row("Qatorlar soni (har chekda)", lines);
        Row("Bir tovardan ko'pi bilan, dona", maxPerItem);
        Row("Narxga foiz, %", percent);
        Row("Sklad (1C dagi nomi)", warehouse, wide: true);
        var checks = new Panel { Dock = DockStyle.Top, Height = 50, Padding = new Padding(0, 6, 0, 0), BackColor = PanelStyle.Card };
        checks.Controls.Add(refresh);
        checks.Controls.Add(post);
        card.Controls.Add(checks);
        card.Controls.Add(grid);
        card.Height = 386;

        var buttons = new TableLayoutPanel { Dock = DockStyle.Top, Height = 48, ColumnCount = 3, Padding = new Padding(0, 8, 0, 4) };
        buttons.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 42));
        buttons.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 29));
        buttons.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 29));
        buttons.Controls.Add(start, 0, 0);
        buttons.Controls.Add(pause, 1, 0);
        buttons.Controls.Add(stop, 2, 0);

        var hint = new Label
        {
            Dock = DockStyle.Top, Height = 48, Padding = new Padding(2, 0, 2, 4), ForeColor = PanelStyle.Muted,
            Text = "Summa cheklarga har xil bo'linadi. Inventarizatsiya → Без НДС → foiz → 12% → tepadan N qator → miqdorlar → provesti. Ish paytida 1C ga tegmang.",
        };

        // Jurnal kartasi
        var logCard = PanelStyle.CardPanel(new Padding(8));
        logCard.Dock = DockStyle.Fill;
        logCard.Controls.Add(logBox);
        logCard.Controls.Add(new Label { Text = "Jurnal", Dock = DockStyle.Top, Height = 20, Font = PanelStyle.Bold, ForeColor = Color.FromArgb(51, 65, 85) });

        Controls.Add(logCard);
        Controls.Add(hint);
        var eposRow = new Panel { Dock = DockStyle.Top, Height = 42, Padding = new Padding(0, 0, 0, 6) };
        eposRow.Controls.Add(epos);
        eposRow.Visible = baseEntry is not null && getSoliqTab is not null;
        epos.Click += (_, _) => ChooseReceiptToSell();
        Controls.Add(eposRow);
        Controls.Add(buttons);
        Controls.Add(new Panel { Dock = DockStyle.Top, Height = 8 });
        Controls.Add(card);
        Controls.Add(header);

        // Kartaning balandligi ichidagiga moslanadi
        Load += (_, _) => card.Height = grid.PreferredSize.Height + checks.Height + card.Padding.Vertical + 4;

        close.Click += (_, _) =>
        {
            if (Running && MessageBox.Show(FindForm(), "Jarayon ketmoqda. To'xtatilsinmi?", AppInfo.DisplayName, MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            Stop();
            tab.HideSidePanel();
        };
        start.Click += async (_, _) =>
        {
            // Pauzada «Boshlash» — shu joydan davom etish
            if (Running && runner?.Gate.Paused == true) { runner.Gate.Resume(); return; }
            await StartAsync(confirm: true);
        };
        pause.Click += (_, _) => runner?.Gate.Pause();
        stop.Click += (_, _) => Stop();
    }

    void UpdateEposButton()
    {
        if (IsDisposed) return;
        var left = posted.Count(p => !p.Sold);
        epos.Enabled = left > 0 && !Running;
        epos.Text = left > 0 ? $"🧾  E-POS orqali sotish ({left} ta chek)" : "🧾  E-POS orqali sotish";
    }

    /// <summary>Sotilmagan chekni tanlaydi (bittasi bo'lsa — o'zi) va E-POS sotish oynasini ochadi.</summary>
    void ChooseReceiptToSell()
    {
        var unsold = posted.Where(p => !p.Sold).Select(p => p.Receipt).ToList();
        if (unsold.Count == 0 || Running) return;
        if (unsold.Count == 1) { Sell(unsold[0]); return; }
        var menu = new ContextMenuStrip { Font = new Font("Segoe UI", 10f) };
        foreach (var r in unsold)
        {
            var sum = r.Lines.Sum(l => l.UnitPrice * l.Quantity);
            menu.Items.Add($"{r.ReceiptId} — {sum:N0} so'm ({r.Lines.Count} ta tovar)", null, (_, _) => Sell(r));
        }
        menu.Show(epos, new Point(0, epos.Height));
    }

    void Sell(MarkingReceipt receipt)
    {
        if (baseEntry is null || getSoliqTab is null) return;
        using var dialog = new SaleDialog(baseEntry, getSoliqTab, receipt);
        dialog.ShowDialog(FindForm());
        if (dialog.Result is { } sold)
        {
            var i = posted.FindIndex(p => ReferenceEquals(p.Receipt, receipt));
            if (i >= 0) posted[i] = (receipt, true);
            Log($"{receipt.ReceiptId} E-POS orqali sotildi: fiskal belgi {sold.FiscalSign}, chek № {sold.ReceiptSeq}", "ok");
        }
        UpdateEposButton();
    }

    public void Stop()
    {
        cts?.Cancel();
        stop.Enabled = false;
        pause.Enabled = false;
    }

    /// <summary>Pauza holati o'zgarganda tugmalar: pauzada «Boshlash» — «Davom etish».</summary>
    void OnPauseChanged(bool paused)
    {
        if (IsDisposed) return;
        if (InvokeRequired) { try { BeginInvoke(() => OnPauseChanged(paused)); } catch { } return; }
        start.Text = paused ? "▶  Davom etish" : "▶  Boshlash";
        start.Enabled = paused;
        pause.Enabled = !paused;
        Log(paused ? "Pauza — keyingi 1C amalidan oldin to'xtab turadi. Davom etish uchun «▶ Davom etish» ni bosing (pauzada 1C ga tegmang)." : "Davom etilmoqda…", "warn", null, report: false);
    }

    void Log(string text, string level) => Log(text, level, null);

    /// <param name="report">Ogohlantirish/xato muammolar jurnaliga yozilsinmi (pauza, foydalanuvchi to'xtatgani — yo'q).</param>
    void Log(string text, string level, string? details, bool report = true)
    {
        if (report && level is "warn" or "err") ProblemLog.Report(Feature.Unmarked, level, text, baseEntry, details, BaseTitle);
        IshonchDesktop.Models.Log.Write($"Markirovkasiz [{BaseTitle}]: {text}");
        if (IsDisposed || logBox.IsDisposed) return;
        if (InvokeRequired) { try { BeginInvoke(() => Log(text, level, details, report: false)); } catch { /* panel yopilgan */ } return; }
        var color = level switch { "err" => Color.Firebrick, "warn" => Color.DarkOrange, "ok" => Color.SeaGreen, "head" => Color.RoyalBlue, _ => Color.Black };
        logBox.SelectionStart = logBox.TextLength;
        logBox.SelectionColor = color;
        logBox.AppendText($"{DateTime.Now:HH:mm:ss}  {text}\n");
        logBox.ScrollToCaret();
    }

    static decimal? Parse(string s) =>
        decimal.TryParse(s.Replace(" ", "").Replace(" ", "").Replace(',', '.'), NumberStyles.Any, CultureInfo.InvariantCulture, out var v) ? v : null;

    /// <summary>Kiritilgan qiymatlarni tekshiradi; xato bo'lsa matnini qaytaradi.</summary>
    public string? ValidateInput()
    {
        if (Parse(target.Text) is not (> 0)) return "Chek summasini to'g'ri kiriting.";
        if (Parse(percent.Text) is not (>= 0 and <= 500)) return "Foizni to'g'ri kiriting (0–500).";
        if (tab.Core is null) return "1C tabi hali tayyor emas.";
        return null;
    }

    public string Describe() =>
        $"{BaseTitle}: jami {Parse(target.Text):N0} so'm = {count.Value} ta chek × ≈{Parse(target.Text) / count.Value:N0} so'm, {lines.Value} ta qatordan" + (maxPerItem.Value > 0 ? $", bir tovardan ≤{maxPerItem.Value} dona" : "") + $", +{percent.Text}%" +
        (post.Checked ? ", provesti" : ", provesti qilinmaydi") +
        (refresh.Checked ? $", inventarizatsiya {inventoryDate.Value:dd.MM.yyyy HH:mm:ss}" : "");

    public async Task StartAsync(bool confirm)
    {
        if (Running) return;
        var owner = FindForm();
        if (ValidateInput() is { } problem) { Log(problem, "err"); if (confirm) MessageBox.Show(owner, problem, AppInfo.DisplayName); return; }
        var sum = Parse(target.Text)!.Value;
        var pct = Parse(percent.Text)!.Value;
        var options = new UnmarkedOptions(Math.Round(sum / (int)count.Value, 2), (int)count.Value, (int)lines.Value, pct, warehouse.Text.Trim(), post.Checked)
            { RefreshInventory = refresh.Checked, InventoryNumber = prefs.InventoryNumber, MaxPerItem = (int)maxPerItem.Value, InventoryDate = inventoryDate.Value };

        // Oldingi to'xtatilgan jarayon (sozlamalar o'zgarmagan bo'lsa) qolgan cheklardan davom ettiriladi
        var resume = resumable is { CanResume: true } prev && prev.Options with { InventoryNumber = null } == options with { InventoryNumber = null };
        if (resume && confirm)
        {
            var ans = MessageBox.Show(owner,
                $"Oldingi ish {resumable!.Done} / {options.Count} ta chekda to'xtagan.\n\nHa — qolgan cheklardan davom etish (inventarizatsiya qayta yangilanmaydi).\nYo'q — hammasini boshidan boshlash.",
                AppInfo.DisplayName, MessageBoxButtons.YesNoCancel, MessageBoxIcon.Question);
            if (ans == DialogResult.Cancel) return;
            resume = ans == DialogResult.Yes;
        }
        else if (confirm)
        {
            var msg = Describe() + "\n\n" + (post.Checked ? "Hujjatlar PROVESTI QILINADI (omborda va hisobda aks etadi).\n" : "") + "Davom etilsinmi?";
            if (MessageBox.Show(owner, msg, AppInfo.DisplayName, MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
        }

        prefs.Target = sum;
        prefs.Count = (int)count.Value;
        prefs.Lines = (int)lines.Value;
        prefs.MaxPerItem = (int)maxPerItem.Value;
        prefs.Percent = pct;
        prefs.Warehouse = warehouse.Text.Trim();
        prefs.Post = post.Checked;
        prefs.RefreshInventory = refresh.Checked;
        settings.Save();

        Running = true;
        start.Enabled = false;
        pause.Enabled = true;
        stop.Enabled = true;
        cts = new CancellationTokenSource();
        if (!resume) logBox.Clear();
        try
        {
            if (prefs.RefreshInventory && prefs.Warehouse.Length == 0)
                Log("Inventarizatsiyani yangilash uchun sklad nomini kiriting (hozir yangilanmaydi).", "warn");
            runner = resume ? resumable! : new UnmarkedRunner(tab.Core!, options, Log, cts.Token);
            resumable = null;
            runner.Gate.Changed += OnPauseChanged;
            var r = await runner.RunAsync(cts.Token);
            runner.Gate.Changed -= OnPauseChanged;
            if (runner.InventoryNumber is { } inv && inv != prefs.InventoryNumber) { prefs.InventoryNumber = inv; settings.Save(); }
            Log($"Natija: {r.Created} / {r.Requested} ta chek, jami ≈ {r.Sum:N0}" + (r.Error is null ? "" : " — xato bilan to'xtadi"),
                r.Error is null && !r.Stopped ? "ok" : "warn", null, report: false); // xatoning o'zi yuqorida yozilgan
            // To'xtatilgan yoki xato bilan tugagan bo'lsa — keyingi «Boshlash» qolgan cheklardan davom ettira oladi
            // Provesti qilingan cheklar «E-POS orqali sotish» uchun eslab qolinadi (o'zi sotilmaydi)
            foreach (var receipt in runner.Posted)
                if (!posted.Any(p => ReferenceEquals(p.Receipt, receipt))) posted.Add((receipt, false));
            UpdateEposButton();
            if (options.Post && (r.Error is not null || cts.IsCancellationRequested) && runner.CanResume)
            {
                resumable = runner;
                Log($"Qayta «▶ Boshlash» bosilsa {runner.Done + 1}-chekdan davom etadi.", "info");
            }
        }
        catch (Exception e)
        {
            IshonchDesktop.Models.Log.Write("XATO Unmarked: " + e);
            Log("Kutilmagan xato: " + e.Message, "err", e.ToString());
        }
        finally
        {
            Running = false;
            if (runner is not null) runner.Gate.Changed -= OnPauseChanged;
            runner = null;
            if (!IsDisposed)
            {
                start.Text = "▶  Boshlash";
                start.Enabled = true;
                UpdateEposButton();
                pause.Enabled = false;
                stop.Enabled = false;
            }
            cts?.Dispose();
            cts = null;
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) cts?.Cancel();
        base.Dispose(disposing);
    }
}
