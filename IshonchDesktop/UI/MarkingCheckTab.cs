using System.Text.Json;
using IshonchDesktop.Debtors;
using IshonchDesktop.Marking;
using IshonchDesktop.Models;

namespace IshonchDesktop.UI;

/// <summary>
/// «Markirovka tekshirish» bo'limi: kodlar ro'yxati (matn yoki .xlsx / .txt fayl) my.soliq.uz da tekshiriladi — oxirgi operatsiya
/// ulgurji va oxirgi olgan STIR bizniki bo'lsa «Sotsa bo'ladi». Chekka ham, 1C ga ham bog'liq emas; natija .xlsx qilib saqlanadi.
/// (Ilgari bu alohida brauzer kengaytmasi edi — «Excel (ommaviy tekshiruv)».)
/// </summary>
public sealed class MarkingCheckTab : UserControl
{
    readonly Func<Task<WebTab>> getSoliqTab;
    readonly Action showSoliqTab;
    readonly TextBox stir = new() { Width = 180, BorderStyle = BorderStyle.FixedSingle, PlaceholderText = "masalan 123456789" };
    readonly TextBox codes = new()
    {
        Multiline = true, ScrollBars = ScrollBars.Vertical, Dock = DockStyle.Fill, Font = new Font("Consolas", 9.5f), BorderStyle = BorderStyle.FixedSingle,
        PlaceholderText = "Kodlarni shu yerga qo'ying — har qatorda bitta markirovka kodi", MaxLength = 0, AcceptsReturn = true, WordWrap = false,
    };
    readonly CheckBox tasnif = new() { Text = "tasnif.soliq.uz dan MXIK ni ham tekshirish", AutoSize = true, Checked = true };
    readonly Button runText = PanelStyle.Primary(new Button { Text = "▶  Matndagi kodlarni tekshirish", Width = 250, Height = 34 });
    readonly Button pickFile = PanelStyle.Secondary(new Button { Text = "📂  Fayldan (.xlsx / .txt)…", Width = 200, Height = 34 });
    readonly Button stop = PanelStyle.Secondary(new Button { Text = "■  To'xtatish", Width = 120, Height = 34, Enabled = false }, danger: true);
    readonly Button save = PanelStyle.Secondary(new Button { Text = "💾  Natijani yuklash (.xlsx)", Width = 210, Height = 34, Enabled = false });
    readonly Button copyOk = PanelStyle.Secondary(new Button { Text = "📋  Sotsa bo'ladiganlarni nusxalash", Width = 250, Height = 34, Enabled = false });
    readonly Label status = new() { AutoSize = true, ForeColor = PanelStyle.Muted, Padding = new Padding(0, 8, 0, 4) };
    readonly DataGridView grid = new()
    {
        Dock = DockStyle.Fill, ReadOnly = true, AllowUserToAddRows = false, AllowUserToDeleteRows = false, AllowUserToResizeRows = false,
        RowHeadersVisible = false, SelectionMode = DataGridViewSelectionMode.FullRowSelect, BackgroundColor = Color.White,
        BorderStyle = BorderStyle.FixedSingle, AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
    };
    readonly List<MarkingCheckRow> results = new();
    readonly HttpClient http = new() { Timeout = TimeSpan.FromSeconds(20) };
    readonly Dictionary<string, Task<(string Status, string Mxik, string Name)>> tasnifCache = new();
    CancellationTokenSource? cts;
    string resultName = "markirovka";

    static readonly Color OkBack = Color.FromArgb(230, 244, 234), OkFore = Color.FromArgb(30, 123, 52);
    static readonly Color BadBack = Color.FromArgb(253, 233, 233), BadFore = Color.FromArgb(192, 0, 0);

    /// <param name="firm">Qaysi firmaning my.soliq.uz tabi orqali tekshirilishi (tanlangan baza; yo'q bo'lsa umumiy tab).</param>
    public MarkingCheckTab(BaseEntry? firm, Func<Task<WebTab>> getSoliqTab, Action showSoliqTab)
    {
        this.getSoliqTab = getSoliqTab;
        this.showSoliqTab = showSoliqTab;
        Dock = DockStyle.Fill;
        BackColor = PanelStyle.Back;
        Font = PanelStyle.Base;
        Padding = new Padding(12);
        stir.Text = firm?.Inn ?? "";

        var title = new Label { Text = "Markirovka tekshirish (my.soliq.uz)", Dock = DockStyle.Top, Height = 28, Font = PanelStyle.Title, ForeColor = Color.FromArgb(15, 23, 42) };
        var sub = new Label
        {
            Dock = DockStyle.Top, Height = 38, ForeColor = PanelStyle.Muted,
            Text = "Kod sotsa bo'ladi, agar oxirgi operatsiyasi ulgurji va oxirgi olgan STIR bizniki bo'lsa. " +
                   (firm is null ? "Tekshiruv umumiy my.soliq.uz tabi orqali bajariladi." : $"Tekshiruv «{firm.Firm}» ning my.soliq.uz tabi orqali bajariladi.") +
                   " Unga ERI kalit bilan kirilgan bo'lishi kerak.",
        };

        var stirRow = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 34, WrapContents = false };
        stirRow.Controls.Add(new Label { Text = "Bizning STIR:", AutoSize = true, Padding = new Padding(0, 6, 6, 0) });
        stirRow.Controls.Add(stir);
        stirRow.Controls.Add(new Label { Text = "(bo'sh qoldirilsa faqat operatsiya turi tekshiriladi)", AutoSize = true, ForeColor = PanelStyle.Muted, Padding = new Padding(8, 6, 16, 0) });
        stirRow.Controls.Add(tasnif);

        var codesBox = new Panel { Dock = DockStyle.Top, Height = 150, Padding = new Padding(0, 4, 0, 4) };
        codesBox.Controls.Add(codes);

        var buttons = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 44, WrapContents = false, Padding = new Padding(0, 4, 0, 0) };
        foreach (var b in new[] { runText, pickFile, stop, save, copyOk }) { b.Margin = new Padding(0, 0, 8, 0); buttons.Controls.Add(b); }

        var statusRow = new Panel { Dock = DockStyle.Top, Height = 30 };
        statusRow.Controls.Add(status);

        grid.Columns.Add("n", "№");
        grid.Columns.Add("code", "Markirovka kodi");
        grid.Columns.Add("verdict", "Natija");
        grid.Columns.Add("note", "Izoh");
        grid.Columns.Add("product", "Mahsulot");
        grid.Columns.Add("op", "Oxirgi operatsiya");
        grid.Columns.Add("date", "Sana");
        grid.Columns.Add("stir", "Oxirgi egasi STIR");
        grid.Columns.Add("company", "Oxirgi egasi");
        grid.Columns.Add("mxik", "MXIK");
        grid.Columns.Add("match", "Tasnif");
        grid.Columns["n"]!.FillWeight = 22;
        grid.Columns["code"]!.FillWeight = 150;
        grid.Columns["verdict"]!.FillWeight = 70;
        grid.Columns["product"]!.FillWeight = 140;
        grid.Columns["date"]!.FillWeight = 60;
        grid.Columns["stir"]!.FillWeight = 60;
        grid.Columns["match"]!.FillWeight = 55;

        Controls.Add(grid);
        Controls.Add(statusRow);
        Controls.Add(buttons);
        Controls.Add(codesBox);
        Controls.Add(stirRow);
        Controls.Add(sub);
        Controls.Add(title);

        status.Text = "Kodlarni qo'ying yoki fayl tanlang.";
        runText.Click += async (_, _) =>
        {
            var list = MarkingCodeList.FromText(codes.Text);
            if (list.Count == 0) { SetStatus("Kodlarni maydonga qo'ying (har qatorda bittadan).", error: true); return; }
            await RunAsync(list, "markirovka_" + DateTime.Now.ToString("yyyyMMdd_HHmm"));
        };
        pickFile.Click += async (_, _) =>
        {
            using var dlg = new OpenFileDialog { Filter = "Kodlar (*.xlsx;*.xls;*.txt;*.csv)|*.xlsx;*.xls;*.txt;*.csv|Barcha fayllar (*.*)|*.*", Title = "Markirovka kodlari bor fayl" };
            if (dlg.ShowDialog(FindForm()) != DialogResult.OK) return;
            List<string> list;
            try { list = MarkingCodeList.FromFile(dlg.FileName); }
            catch (Exception e) { SetStatus("Faylni o'qib bo'lmadi: " + e.Message, error: true); return; }
            if (list.Count == 0) { SetStatus("Faylda markirovka kodlari topilmadi (01… bilan boshlanadigan kodlar kerak).", error: true); return; }
            await RunAsync(list, Path.GetFileNameWithoutExtension(dlg.FileName));
        };
        stop.Click += (_, _) => cts?.Cancel();
        save.Click += (_, _) => Save();
        copyOk.Click += (_, _) =>
        {
            var ok = results.Where(r => r.Verdict == "available").Select(r => r.Code).ToList();
            if (ok.Count == 0) return;
            try { Clipboard.SetText(string.Join(Environment.NewLine, ok)); SetStatus($"{ok.Count} ta sotsa bo'ladigan kod nusxalandi."); }
            catch (Exception e) { SetStatus("Nusxalab bo'lmadi: " + e.Message, error: true); }
        };
    }

    void SetStatus(string text, bool error = false)
    {
        status.Text = text;
        status.ForeColor = error ? PanelStyle.Danger : PanelStyle.Muted;
    }

    void SetBusy(bool busy)
    {
        runText.Enabled = pickFile.Enabled = stir.Enabled = tasnif.Enabled = !busy;
        stop.Enabled = busy;
        save.Enabled = !busy && results.Count > 0;
        copyOk.Enabled = !busy && results.Any(r => r.Verdict == "available");
    }

    async Task RunAsync(List<string> list, string name)
    {
        if (cts is not null) return;
        cts = new CancellationTokenSource();
        var ct = cts.Token;
        resultName = name;
        results.Clear();
        grid.Rows.Clear();
        SetBusy(true);
        var started = DateTime.UtcNow;
        try
        {
            SetStatus("my.soliq.uz ga kirilganligi tekshirilmoqda…");
            if (!await SoliqBridge.IsLoggedInAsync(getSoliqTab))
            {
                SetStatus(SoliqBridge.NotLoggedInMessage + ". my.soliq.uz tabi ochildi — kirgach tekshirishni qayta boshlang.", error: true);
                showSoliqTab();
                return;
            }
            var ours = stir.Text;
            var withTasnif = tasnif.Checked;
            // Bir vaqtda bir nechta so'rov: my.soliq.uz ning o'z API si parallel ishlaydi (navbatni SoliqBridge o'zi cheklaydi)
            using var gate = new SemaphoreSlim(4);
            var done = 0;
            var tasks = list.Select(async (code, index) =>
            {
                await gate.WaitAsync(ct);
                try
                {
                    ct.ThrowIfCancellationRequested();
                    var tasnifTask = withTasnif ? TasnifAsync(MarkingCodeList.BarcodeOf(code)) : null;
                    MarkingCheckRow row;
                    if (!MarkingCodeList.LooksLikeCode(code)) row = new MarkingCheckRow(code, "unknown", "", "", "", "", "kod noto'g'ri (01… bilan boshlanishi kerak)", false);
                    else row = MarkingCodeList.ToRow(code, JsonSerializer.SerializeToElement(await SoliqBridge.CheckAsync(getSoliqTab, code, ours)));
                    if (tasnifTask is not null)
                    {
                        var t = await tasnifTask;
                        row = row with { TasnifStatus = t.Status, TasnifMxik = t.Mxik, TasnifName = t.Name };
                    }
                    return (index, row);
                }
                finally { gate.Release(); }
            }).ToList();

            var pending = new HashSet<Task<(int index, MarkingCheckRow row)>>(tasks);
            var byIndex = new MarkingCheckRow?[list.Count];
            var loggedOut = false;
            while (pending.Count > 0)
            {
                var finished = await Task.WhenAny(pending);
                pending.Remove(finished);
                if (finished.IsCanceled) continue;
                if (finished.IsFaulted) { done++; continue; }
                var (index, row) = finished.Result;
                byIndex[index] = row;
                done++;
                AddRow(index + 1, row);
                if (row.NotLoggedIn && !loggedOut) { loggedOut = true; cts.Cancel(); } // sessiya tugagan: qolganlari so'ralmaydi
                var per = (DateTime.UtcNow - started).TotalSeconds / done;
                var left = TimeSpan.FromSeconds(per * (list.Count - done));
                SetStatus($"Tekshirilmoqda: {done} / {list.Count}" + (done < list.Count ? $" • taxminan {(left.TotalMinutes < 1 ? "1 daqiqadan kam" : Math.Round(left.TotalMinutes) + " daqiqa")} qoldi" : ""));
            }
            results.AddRange(byIndex.Where(r => r is not null)!);
            var ok = results.Count(r => r.Verdict == "available");
            var bad = results.Count(r => r.Verdict == "sold");
            var summary = $"{results.Count} / {list.Count} ta kod tekshirildi: ✓ sotsa bo'ladi — {ok}, ✗ sotib bo'lmaydi — {bad}, aniqlanmadi — {results.Count - ok - bad}.";
            if (loggedOut) { SetStatus("my.soliq.uz sessiyasi tugadi — qayta kirib, tekshirishni yana boshlang. " + summary, error: true); showSoliqTab(); }
            else SetStatus((ct.IsCancellationRequested ? "To'xtatildi. " : "Tugadi. ") + summary);
        }
        catch (OperationCanceledException) { SetStatus("To'xtatildi."); }
        catch (Exception e) { Log.Error("MarkingCheck", e); SetStatus("Xato: " + e.Message, error: true); }
        finally
        {
            cts.Dispose();
            cts = null;
            if (!IsDisposed) SetBusy(false);
        }
    }

    void AddRow(int n, MarkingCheckRow r)
    {
        if (IsDisposed) return;
        var i = grid.Rows.Add(n, r.Code, (r.Verdict == "available" ? "✓ " : r.Verdict == "sold" ? "✗ " : "") + r.VerdictText, r.Note, r.Product, r.Operation, r.Date,
            r.LastStir, r.Company, r.Mxik, r.TasnifStatus.Length == 0 ? "" : r.MxikMatch.Length > 0 ? r.MxikMatch : r.TasnifStatus);
        var row = grid.Rows[i];
        if (r.Verdict == "available") { row.DefaultCellStyle.BackColor = OkBack; row.DefaultCellStyle.ForeColor = OkFore; }
        else if (r.Verdict == "sold") { row.DefaultCellStyle.BackColor = BadBack; row.DefaultCellStyle.ForeColor = BadFore; }
    }

    /// <summary>tasnif.soliq.uz: shtrix-kod (GTIN) bo'yicha MXIK. Bir xil shtrix-kod bir marta so'raladi.</summary>
    Task<(string Status, string Mxik, string Name)> TasnifAsync(string barcode)
    {
        if (barcode.Length == 0) return Task.FromResult(("", "", ""));
        lock (tasnifCache)
        {
            if (tasnifCache.TryGetValue(barcode, out var cached)) return cached;
            return tasnifCache[barcode] = Fetch();
        }

        async Task<(string, string, string)> Fetch()
        {
            try
            {
                foreach (var gtin in new[] { barcode, barcode.PadLeft(14, '0') })
                {
                    var text = await http.GetStringAsync($"https://tasnif.soliq.uz/api/cls-api/mxik/search/by-params?gtin={Uri.EscapeDataString(gtin)}&size=20&lang=uz_latn");
                    var parsed = MarkingCodeList.ParseTasnif(JsonDocument.Parse(text).RootElement);
                    if (parsed.Status == "Bor") return parsed;
                }
                return ("Topilmadi", "", "");
            }
            catch (Exception e) { lock (tasnifCache) tasnifCache.Remove(barcode); return ("Xato: " + e.Message, "", ""); }
        }
    }

    void Save()
    {
        if (results.Count == 0) return;
        using var dlg = new SaveFileDialog { Filter = "Excel jadvali (*.xlsx)|*.xlsx", FileName = resultName + "_natija.xlsx", Title = "Natijani saqlash" };
        if (dlg.ShowDialog(FindForm()) != DialogResult.OK) return;
        try
        {
            XlsxWriter.Save(dlg.FileName, "Markirovka", MarkingCodeList.ToSheet(results));
            SetStatus("Saqlandi: " + dlg.FileName);
        }
        catch (Exception e) { SetStatus("Saqlab bo'lmadi: " + e.Message, error: true); }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) { cts?.Cancel(); http.Dispose(); }
        base.Dispose(disposing);
    }
}
