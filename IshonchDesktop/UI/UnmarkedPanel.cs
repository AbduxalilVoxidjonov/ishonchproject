using System.Globalization;
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
    readonly Settings settings;
    readonly UnmarkedPrefs prefs;
    readonly TextBox target = new() { Dock = DockStyle.Fill };
    readonly NumericUpDown count = new() { Minimum = 1, Maximum = 500, Dock = DockStyle.Left, Width = 90 };
    readonly NumericUpDown lines = new() { Minimum = 1, Maximum = 500, Dock = DockStyle.Left, Width = 90 };
    readonly TextBox percent = new() { Dock = DockStyle.Left, Width = 90 };
    readonly TextBox warehouse = new() { Dock = DockStyle.Fill };
    readonly CheckBox post = new() { Text = "Hujjatlarni provesti qilish", AutoSize = true };
    readonly CheckBox refresh = new() { Text = "Boshlashdan oldin inventarizatsiyani yangilash (sklad qoldig'i bo'yicha)", AutoSize = true };
    readonly Button start = new() { Text = "▶ Boshlash", Height = 34, Dock = DockStyle.Fill };
    readonly Button stop = new() { Text = "■ To'xtatish", Height = 34, Dock = DockStyle.Fill, Enabled = false };
    readonly Button close = new() { Text = "✕", Width = 30, Dock = DockStyle.Right };
    readonly RichTextBox logBox = new() { ReadOnly = true, Dock = DockStyle.Fill, BackColor = Color.White, Font = new Font("Consolas", 9f), BorderStyle = BorderStyle.None };
    CancellationTokenSource? cts;

    public string BaseTitle { get; }
    public bool Running { get; private set; }

    public UnmarkedPanel(WebTab tab, Settings settings, string baseKey, string baseTitle)
    {
        this.tab = tab;
        this.settings = settings;
        BaseTitle = baseTitle;
        prefs = settings.GetUnmarked(baseKey);
        Font = new Font("Segoe UI", 9.5f);
        BackColor = SystemColors.Control;

        var ru = CultureInfo.GetCultureInfo("ru-RU");
        target.Text = prefs.Target.ToString("0.##", CultureInfo.InvariantCulture);
        ThousandsInput.Attach(target);
        count.Value = Math.Clamp(prefs.Count, 1, 500);
        lines.Value = Math.Clamp(prefs.Lines, 1, 500);
        percent.Text = prefs.Percent.ToString("0.##", ru);
        warehouse.Text = prefs.Warehouse;
        post.Checked = prefs.Post;
        refresh.Checked = prefs.RefreshInventory;

        var title = new Label
        {
            Text = "Markirovkasiz sotish", Dock = DockStyle.Fill, Font = new Font("Segoe UI", 12f, FontStyle.Bold),
            TextAlign = ContentAlignment.MiddleLeft, Padding = new Padding(10, 0, 0, 0),
        };
        var header = new Panel { Dock = DockStyle.Top, Height = 36 };
        header.Controls.Add(title);
        header.Controls.Add(close);
        var baseLabel = new Label { Text = baseTitle, Dock = DockStyle.Top, Height = 22, Padding = new Padding(10, 0, 10, 0), ForeColor = Color.DimGray };

        var form = new TableLayoutPanel { Dock = DockStyle.Top, AutoSize = true, ColumnCount = 1, Padding = new Padding(10, 2, 10, 0) };
        void Row(string label, Control c)
        {
            form.Controls.Add(new Label { Text = label, AutoSize = true, Padding = new Padding(0, 6, 0, 2) });
            var cell = new Panel { Height = 28, Dock = DockStyle.Top };
            cell.Controls.Add(c);
            form.Controls.Add(cell);
        }
        Row("Umumiy summa — hamma cheklar uchun (NDS bilan, so'm):", target);
        Row("Cheklar soni:", count);
        Row("Har chekda tovar qatorlari soni (tepadan):", lines);
        Row("Narxga qo'shiladigan foiz (%):", percent);
        Row("Sklad (1C dagi nomi; bo'sh — o'zgartirilmaydi):", warehouse);
        form.Controls.Add(new Label { Height = 4 });
        form.Controls.Add(post);
        form.Controls.Add(refresh);
        foreach (Control c in form.Controls) c.Dock = DockStyle.Top;

        var buttons = new TableLayoutPanel { Dock = DockStyle.Top, Height = 46, ColumnCount = 2, Padding = new Padding(10, 8, 10, 4) };
        buttons.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        buttons.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        buttons.Controls.Add(start, 0, 0);
        buttons.Controls.Add(stop, 1, 0);

        var hint = new Label
        {
            Dock = DockStyle.Top, Height = 62, Padding = new Padding(10, 2, 10, 0), ForeColor = Color.DimGray,
            Text = "Inventarizatsiyadan tovarlar olinadi, Без НДС → foiz → NDS 12%, tepadan N ta qator qoldirilib (qolgani o'chiriladi) " +
                   "miqdorlar summaga moslanadi va provesti qilinadi. Ish paytida 1C oynasiga tegmang.",
        };

        Controls.Add(logBox);
        Controls.Add(hint);
        Controls.Add(buttons);
        Controls.Add(form);
        Controls.Add(baseLabel);
        Controls.Add(header);

        close.Click += (_, _) =>
        {
            if (Running && MessageBox.Show(FindForm(), "Jarayon ketmoqda. To'xtatilsinmi?", "Ishonch", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            Stop();
            tab.HideSidePanel();
        };
        start.Click += async (_, _) => await StartAsync(confirm: true);
        stop.Click += (_, _) => Stop();
    }

    public void Stop()
    {
        cts?.Cancel();
        stop.Enabled = false;
    }

    void Log(string text, string level)
    {
        IshonchDesktop.Models.Log.Write($"Markirovkasiz [{BaseTitle}]: {text}");
        if (IsDisposed || logBox.IsDisposed) return;
        if (InvokeRequired) { try { BeginInvoke(() => Log(text, level)); } catch { /* panel yopilgan */ } return; }
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
        $"{BaseTitle}: jami {Parse(target.Text):N0} so'm = {count.Value} ta chek × ≈{Parse(target.Text) / count.Value:N0} so'm, {lines.Value} ta qatordan, +{percent.Text}%" +
        (post.Checked ? ", provesti" : ", provesti qilinmaydi");

    public async Task StartAsync(bool confirm)
    {
        if (Running) return;
        var owner = FindForm();
        if (ValidateInput() is { } problem) { Log(problem, "err"); if (confirm) MessageBox.Show(owner, problem, "Ishonch"); return; }
        var sum = Parse(target.Text)!.Value;
        var pct = Parse(percent.Text)!.Value;
        if (confirm)
        {
            var msg = Describe() + "\n\n" + (post.Checked ? "Hujjatlar PROVESTI QILINADI (omborda va hisobda aks etadi).\n" : "") + "Davom etilsinmi?";
            if (MessageBox.Show(owner, msg, "Ishonch", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
        }

        prefs.Target = sum;
        prefs.Count = (int)count.Value;
        prefs.Lines = (int)lines.Value;
        prefs.Percent = pct;
        prefs.Warehouse = warehouse.Text.Trim();
        prefs.Post = post.Checked;
        prefs.RefreshInventory = refresh.Checked;
        settings.Save();

        Running = true;
        start.Enabled = false;
        stop.Enabled = true;
        cts = new CancellationTokenSource();
        logBox.Clear();
        try
        {
            if (prefs.RefreshInventory && prefs.Warehouse.Length == 0)
                Log("Inventarizatsiyani yangilash uchun sklad nomini kiriting (hozir yangilanmaydi).", "warn");
            var options = new UnmarkedOptions(Math.Round(sum / prefs.Count, 2), prefs.Count, prefs.Lines, pct, prefs.Warehouse, prefs.Post) { RefreshInventory = prefs.RefreshInventory, InventoryNumber = prefs.InventoryNumber };
            var runner = new UnmarkedRunner(tab.Core!, options, Log, cts.Token);
            var r = await runner.RunAsync();
            if (runner.InventoryNumber is { } inv && inv != prefs.InventoryNumber) { prefs.InventoryNumber = inv; settings.Save(); }
            Log($"Natija: {r.Created} / {r.Requested} ta chek, jami ≈ {r.Sum:N0}" + (r.Error is null ? "" : " — xato bilan to'xtadi"),
                r.Error is null && !r.Stopped ? "ok" : "warn");
        }
        catch (Exception e)
        {
            IshonchDesktop.Models.Log.Error("Unmarked", e);
            Log("Kutilmagan xato: " + e.Message, "err");
        }
        finally
        {
            Running = false;
            if (!IsDisposed)
            {
                start.Enabled = true;
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
