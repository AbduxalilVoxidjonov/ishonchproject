using System.Globalization;
using System.Text.Json;
using IshonchDesktop.Models;
using IshonchDesktop.UI;
using IshonchDesktop.Unmarked;
using Microsoft.Web.WebView2.WinForms;

namespace IshonchDesktop.Marking;

/// <summary>
/// Markirovkali chek paneli ustidagi avtomatika qatori: umumiy summa cheklar soniga (har xil) bo'linadi va har chek uchun
/// avtomatik — sklad inventarizatsiyasi (boshida bir marta) → «Olish» → yangi Реализация (sklad + «Товар маркирован») →
/// panelning o'z «Boshlash» jarayoni (Подбор, kodlar) → provesti → keyingi chek.
/// </summary>
public sealed class MarkedAutoBar : UserControl
{
    readonly WebTab oneC;
    readonly WebView2 panel;
    readonly Settings settings;
    readonly MarkedPrefs prefs;
    readonly NumericUpDown count = new() { Minimum = 1, Maximum = 200, Width = 56, Dock = DockStyle.Left };
    readonly TextBox warehouse = new() { Dock = DockStyle.Fill, BorderStyle = BorderStyle.FixedSingle };
    readonly CheckBox post = new() { Text = "Provesti", AutoSize = true, Dock = DockStyle.Left, Padding = new Padding(10, 3, 0, 0) };
    readonly Button start = PanelStyle.Primary(new Button { Text = "▶ Avto", Width = 84, Dock = DockStyle.Right });
    readonly Button stop = PanelStyle.Secondary(new Button { Text = "■", Width = 34, Dock = DockStyle.Right, Enabled = false }, danger: true);
    readonly Label status = new() { Dock = DockStyle.Top, Height = 18, ForeColor = PanelStyle.Muted, AutoEllipsis = true,
        Text = "Umumiy summa — pastdagi «Maqsad summa» maydonidan olinadi." };
    CancellationTokenSource? cts;

    public MarkedAutoBar(WebTab oneC, WebView2 panel, Settings settings, string baseKey)
    {
        this.oneC = oneC;
        this.panel = panel;
        this.settings = settings;
        prefs = settings.GetMarked(baseKey);
        Dock = DockStyle.Top;
        Height = 104;
        Padding = new Padding(8, 6, 8, 6);
        BackColor = PanelStyle.Back;
        Font = PanelStyle.Base;

        count.Value = Math.Clamp(prefs.Count, 1, 200);
        warehouse.Text = prefs.Warehouse;
        post.Checked = prefs.Post;

        var card = PanelStyle.CardPanel(new Padding(10, 6, 10, 6));
        card.Dock = DockStyle.Fill;

        var title = new Label { Text = "⚡ Avtomatik cheklar", Dock = DockStyle.Top, Height = 20, Font = PanelStyle.Bold, ForeColor = PanelStyle.AccentDark };
        var whRow = new Panel { Dock = DockStyle.Top, Height = 26, Padding = new Padding(0, 2, 0, 2) };
        whRow.Controls.Add(warehouse);
        whRow.Controls.Add(new Label { Text = "Sklad", Width = 56, Dock = DockStyle.Left, TextAlign = ContentAlignment.MiddleLeft, ForeColor = PanelStyle.Muted });
        var actRow = new Panel { Dock = DockStyle.Top, Height = 28, Padding = new Padding(0, 2, 0, 0) };
        actRow.Controls.Add(post);
        actRow.Controls.Add(count);
        actRow.Controls.Add(new Label { Text = "Cheklar", Width = 56, Dock = DockStyle.Left, TextAlign = ContentAlignment.MiddleLeft, ForeColor = PanelStyle.Muted });
        actRow.Controls.Add(stop);
        actRow.Controls.Add(new Panel { Width = 6, Dock = DockStyle.Right });
        actRow.Controls.Add(start);

        card.Controls.Add(status);
        card.Controls.Add(actRow);
        card.Controls.Add(whRow);
        card.Controls.Add(title);
        Controls.Add(card);

        start.Click += async (_, _) => await RunAsync();
        stop.Click += (_, _) => { cts?.Cancel(); stop.Enabled = false; };
    }

    void Status(string text, string level = "info")
    {
        Log.Write("Markirovkali avto: " + text);
        if (IsDisposed) return;
        if (InvokeRequired) { try { BeginInvoke(() => Status(text, level)); } catch { } return; }
        status.ForeColor = level switch { "err" => Color.Firebrick, "warn" => Color.DarkOrange, "ok" => Color.SeaGreen, _ => Color.DimGray };
        status.Text = text;
    }

    static decimal? Parse(string s) =>
        decimal.TryParse(s.Replace(" ", "").Replace(" ", "").Replace(',', '.'), NumberStyles.Any, CultureInfo.InvariantCulture, out var v) ? v : null;

    // ---- panel (sidepanel.html) bilan ishlash ----------------------------------------------------

    async Task<JsonElement> PanelStateAsync()
    {
        var raw = await panel.CoreWebView2.ExecuteScriptAsync(
            "(() => { const q = s => document.querySelector('#app ' + s); const b = n => q('[data-a=\"' + n + '\"]');" +
            " return { start: b('start')?.textContent?.trim() || '', startDisabled: !!b('start')?.disabled," +
            " capture: b('capture')?.textContent?.trim() || '', source: q('[data-el=\"source\"]')?.textContent?.trim() || '' }; })()");
        using var doc = JsonDocument.Parse(raw);
        return doc.RootElement.Clone();
    }

    async Task<string> PanelTargetAsync()
    {
        var raw = await panel.CoreWebView2.ExecuteScriptAsync("document.querySelector('#app [data-el=\"target\"]')?.value || ''");
        return JsonSerializer.Deserialize<string>(raw) ?? "";
    }

    Task PanelClickAsync(string action) =>
        panel.CoreWebView2.ExecuteScriptAsync($"document.querySelector('#app [data-a=\"{action}\"]')?.click()");

    Task PanelSetTargetAsync(decimal value) =>
        panel.CoreWebView2.ExecuteScriptAsync(
            "(() => { const i = document.querySelector('#app [data-el=\"target\"]'); if (!i) return;" +
            $" i.value = {JsonSerializer.Serialize(value.ToString("N0", CultureInfo.GetCultureInfo("ru-RU")).Replace(' ', ' '))};" +
            " i.dispatchEvent(new Event('input', { bubbles: true })); })()");

    static string Str(JsonElement e, string n) => e.TryGetProperty(n, out var v) ? v.GetString() ?? "" : "";

    async Task WaitAsync(Func<Task<bool>> cond, TimeSpan max, string what, CancellationToken ct)
    {
        var end = DateTime.UtcNow + max;
        var note = DateTime.UtcNow.AddSeconds(30);
        while (!await cond())
        {
            ct.ThrowIfCancellationRequested();
            if (DateTime.UtcNow > end) throw new OneCException("Kutish vaqti tugadi: " + what);
            if (DateTime.UtcNow > note) { Status("Kutilmoqda: " + what); note = DateTime.UtcNow.AddSeconds(30); }
            await Task.Delay(700, ct);
        }
    }

    // ---- asosiy jarayon ---------------------------------------------------------------------------

    async Task RunAsync()
    {
        var sum = Parse(await PanelTargetAsync());
        var n = (int)count.Value;
        if (sum is not > 0) { MessageBox.Show(FindForm(), "Pastdagi «Maqsad summa» maydoniga umumiy summani kiriting (hamma cheklar uchun).", "Ishonch"); return; }
        if (string.IsNullOrWhiteSpace(warehouse.Text)) { MessageBox.Show(FindForm(), "Sklad nomini kiriting.", "Ishonch"); return; }
        if (oneC.Core is not { } core) { MessageBox.Show(FindForm(), "1C tabi tayyor emas.", "Ishonch"); return; }
        var targets = Planner.SplitTotal(sum.Value, n, 0.25m, new Random());
        var msg = $"Markirovkali: jami {sum:N0} so'm, {n} ta chek ({string.Join("; ", targets.Select(t => t.ToString("N0")))}), sklad «{warehouse.Text.Trim()}».\n" +
                  (post.Checked ? "Har chek PROVESTI QILINADI.\n" : "Cheklar provesti qilinmaydi (har chekdan keyin to'xtaydi).\n") + "\nBoshlansinmi?";
        if (MessageBox.Show(FindForm(), msg, "Ishonch", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;

        prefs.Count = n;
        prefs.Warehouse = warehouse.Text.Trim();
        prefs.Post = post.Checked;
        settings.Save();

        cts = new CancellationTokenSource();
        var ct = cts.Token;
        start.Enabled = false;
        stop.Enabled = true;
        var done = 0;
        try
        {
            var runner = new UnmarkedRunner(core, new UnmarkedOptions(0, 1, 1, 0, prefs.Warehouse, false), (t, l) => Status(t, l), ct);
            await runner.InitAsync();

            // 1) Boshida bir marta: inventarizatsiya → «Olish»
            Status("Inventarizatsiya yangilanmoqda…");
            await runner.RefreshInventoryKeepOpenAsync();
            Status("«Olish»: inventarizatsiya o'qilmoqda…");
            await PanelClickAsync("capture");
            var sawCapture = false;
            var started = DateTime.UtcNow;
            await WaitAsync(async () =>
            {
                var s = await PanelStateAsync();
                var cap = Str(s, "capture");
                if (cap.StartsWith("Pauza") || cap.StartsWith("Davom")) sawCapture = true;
                return cap == "Olish" && (sawCapture || DateTime.UtcNow - started > TimeSpan.FromSeconds(5)) && !Str(s, "source").StartsWith("0 ");
            }, TimeSpan.FromMinutes(30), "«Olish» tugashi", ct);
            Status("Olindi: " + Str(await PanelStateAsync(), "source"));

            // 2) Har chek
            for (var k = 0; k < n; k++)
            {
                Status($"{k + 1}/{n}-chek: yangi Реализация…");
                await runner.CreateMarkedDocumentAsync();
                await PanelSetTargetAsync(targets[k]);
                await Task.Delay(800, ct);
                await PanelClickAsync("start");
                Status($"{k + 1}/{n}-chek: Подбор (≈{targets[k]:N0} so'm)…");

                // Panel jarayoni tugashini kutamiz: «Yangi chekni boshlash» — tayyor; «Davom» — to'xtab qoldi
                var stoppedSince = (DateTime?)null;
                await WaitAsync(async () =>
                {
                    var s = Str(await PanelStateAsync(), "start");
                    if (s == "Yangi chekni boshlash") return true;
                    if (s == "Davom") { stoppedSince ??= DateTime.UtcNow; if (DateTime.UtcNow - stoppedSince > TimeSpan.FromSeconds(15)) throw new OneCException($"{k + 1}-chek to'xtab qoldi — panel jurnalini ko'ring, «Davom» bilan davom ettirib, keyin «▶ Avto» ni qayta bosing."); }
                    else stoppedSince = null;
                    return false;
                }, TimeSpan.FromHours(2), $"{k + 1}-chek yig'ilishi", ct);

                if (!post.Checked)
                {
                    Status($"{k + 1}-chek yig'ildi. Provesti belgisi o'chiq — tekshirib o'zingiz provesti qiling.", "ok");
                    done++;
                    break;
                }
                Status($"{k + 1}/{n}-chek: provesti…");
                var r = await runner.PostCurrentAsync();
                if (!r.Ok) throw new OneCException($"{k + 1}-chekni provesti qilib bo'lmadi: " + string.Join(" | ", r.Messages.Take(2)));
                done++;
                Status($"{k + 1}/{n}-chek provesti qilindi ✓", "ok");
            }
            Status($"Tugadi: {done} ta chek.", "ok");
        }
        catch (OperationCanceledException) { Status($"To'xtatildi ({done} ta chek tayyor).", "warn"); }
        catch (OneCException e) { Status(e.Message, "err"); }
        catch (Exception e) { Log.Error("MarkedAuto", e); Status("Kutilmagan xato: " + e.Message, "err"); }
        finally
        {
            try { await PanelSetTargetAsync(sum.Value); } catch { /* panel yopilgan */ }
            if (!IsDisposed) { start.Enabled = true; stop.Enabled = false; }
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
