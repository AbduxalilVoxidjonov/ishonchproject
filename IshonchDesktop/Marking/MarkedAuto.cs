using System.Globalization;
using System.Text.Json;
using IshonchDesktop.Models;
using IshonchDesktop.UI;
using IshonchDesktop.Unmarked;
using Microsoft.Web.WebView2.WinForms;

namespace IshonchDesktop.Marking;

/// <summary>
/// Markirovkali chek panelidagi «Avtomatik cheklar» bo'limi: umumiy summa cheklar soniga (har xil) bo'linadi va har chek uchun
/// avtomatik — sklad inventarizatsiyasi (boshida bir marta) → «Olish» → yangi Реализация (sklad + «Товар маркирован») →
/// panelning o'z «Boshlash» jarayoni (Подбор, kodlar) → provesti → keyingi chek.
/// Bo'lim panel sahifasining ichida chiziladi (<see cref="PanelScript"/>), bu klass uning tugmalarini bajaradi.
/// </summary>
public sealed class MarkedAuto : IDisposable
{
    readonly WebTab oneC;
    readonly WebView2 panel;
    readonly Settings settings;
    readonly MarkedPrefs prefs;
    CancellationTokenSource? cts;
    string statusText = "Umumiy summa — «Maqsad summa» maydonidan olinadi.";
    string statusLevel = "info";

    public MarkedAuto(WebTab oneC, WebView2 panel, Settings settings, string baseKey)
    {
        this.oneC = oneC;
        this.panel = panel;
        this.settings = settings;
        prefs = settings.GetMarked(baseKey);
    }

    bool Running => cts is not null;

    /// <summary>Panel sahifasiga qo'shiladigan skript: «Maqsad summa» atrofiga avtomatika bo'limini chizadi va qayta chizilsa tiklaydi.</summary>
    public const string PanelScript = """
        (() => {
          if (window.__ishAutoInstalled) return; window.__ishAutoInstalled = true;
          const css = `
            .ish-auto { border:1px solid #c7d2fe; background:#eef2ff; border-radius:10px; padding:8px 10px; display:flex; flex-direction:column; gap:6px; }
            .ish-auto .ish-h { font-weight:700; color:#3730a3; }
            .ish-auto .row { margin:0; }
            .ish-auto .ish-st { font-size:12px; color:#475569; } .ish-auto .ish-st.err { color:#b91c1c; } .ish-auto .ish-st.ok { color:#15803d; } .ish-auto .ish-st.warn { color:#b45309; }
            .ish-auto input.ish-bad { border-color:#ef4444; outline:2px solid #fecaca; }`;
          const send = (action) => {
            const q = (n) => document.querySelector('#ishAuto [data-x="' + n + '"]');
            window.chrome?.webview?.postMessage({ kind: 'ishAuto', action,
              warehouse: q('wh')?.value || '', count: Number(q('count')?.value) || 1, post: !!q('post')?.checked });
          };
          window.__ishAutoApply = (s) => {
            window.__ishAutoState = s;
            const box = document.getElementById('ishAuto'); if (!box || !s) return;
            const q = (n) => box.querySelector('[data-x="' + n + '"]');
            if (s.init) { q('wh').value = s.warehouse || ''; q('count').value = s.count || 1; q('post').checked = !!s.post; s.init = false; }
            q('wh').disabled = q('count').disabled = q('post').disabled = q('go').disabled = !!s.running;
            q('stop').disabled = !s.running;
            const st = document.getElementById('ishAutoStatus');
            if (st) { st.textContent = s.status || ''; st.className = 'ish-st ' + (s.level || ''); }
          };
          const build = () => {
            const target = document.querySelector('#app [data-el="target"]');
            if (!target || document.getElementById('ishAuto')) return;
            const row = target.closest('.row'); if (!row) return;
            if (!document.getElementById('ishAutoCss')) { const st = document.createElement('style'); st.id = 'ishAutoCss'; st.textContent = css; document.head.appendChild(st); }
            const box = document.createElement('div');
            box.id = 'ishAuto'; box.className = 'ish-auto';
            box.innerHTML = '<div class="ish-h">⚡ Avtomatik cheklar</div>' +
              '<div class="row"><label class="field" style="flex:1 1 100%"><span>1) Sklad (1C dagi nomi)</span><input class="inp" data-x="wh" type="text" placeholder="masalan: Основной склад"></label></div>' +
              '<div class="row"><label class="field"><span>2) Cheklar soni</span><input class="inp" data-x="count" type="number" min="1" max="200" step="1"></label>' +
              '<label style="align-self:flex-end;padding-bottom:6px"><input type="checkbox" data-x="post"> Provesti qilish</label></div>' +
              '<div class="muted">3) Umumiy summa — pastdagi «Maqsad summa» maydoniga (hamma cheklar uchun).</div>';
            row.parentNode.insertBefore(box, row);
            const act = document.createElement('div');
            act.id = 'ishAutoAct'; act.className = 'ish-auto';
            act.innerHTML = '<div class="row"><button class="b primary" data-x="go">▶ Avto boshlash</button><button class="b small" data-x="stop" disabled>■ To‘xtatish</button></div>' +
              '<div class="ish-st" id="ishAutoStatus"></div>';
            row.parentNode.insertBefore(act, row.nextSibling);
            act.querySelector('[data-x="go"]').onclick = () => {
              const wh = box.querySelector('[data-x="wh"]');
              if (!wh.value.trim()) { wh.classList.add('ish-bad'); wh.focus(); window.__ishAutoApply({ ...(window.__ishAutoState || {}), init: false, status: 'Avval skladni kiriting.', level: 'err' }); return; }
              wh.classList.remove('ish-bad'); send('go');
            };
            act.querySelector('[data-x="stop"]').onclick = () => send('stop');
            box.querySelector('[data-x="wh"]').onchange = () => send('save');
            box.querySelector('[data-x="count"]').onchange = () => send('save');
            box.querySelector('[data-x="post"]').onchange = () => send('save');
            const s = window.__ishAutoState; if (s) window.__ishAutoApply({ ...s, init: true });
          };
          setInterval(build, 500);
        })();
        """;

    /// <summary>Panel sahifasi tayyor bo'lganda (va qayta yuklanganda) bo'limga saqlangan qiymatlarni beradi.</summary>
    public void Push(bool init = false)
    {
        var state = new { init, warehouse = prefs.Warehouse, count = Math.Clamp(prefs.Count, 1, 200), post = prefs.Post, running = Running, status = statusText, level = statusLevel };
        try { _ = panel.CoreWebView2?.ExecuteScriptAsync("window.__ishAutoApply && window.__ishAutoApply(" + JsonSerializer.Serialize(state) + ")"); }
        catch { /* panel yopilgan */ }
    }

    /// <summary>Paneldagi bo'limdan kelgan xabar: go / stop / save.</summary>
    public void OnMessage(JsonElement m)
    {
        var action = m.TryGetProperty("action", out var a) ? a.GetString() : "";
        if (action == "stop") { cts?.Cancel(); return; }
        if (Running) return;
        if (m.TryGetProperty("warehouse", out var w)) prefs.Warehouse = (w.GetString() ?? "").Trim();
        if (m.TryGetProperty("count", out var c) && c.ValueKind == JsonValueKind.Number) prefs.Count = Math.Clamp(c.GetInt32(), 1, 200);
        if (m.TryGetProperty("post", out var p)) prefs.Post = p.ValueKind == JsonValueKind.True;
        settings.Save();
        if (action == "go") _ = RunAsync();
    }

    void Status(string text, string level = "info")
    {
        Log.Write("Markirovkali avto: " + text);
        statusText = text;
        statusLevel = level;
        if (panel.IsDisposed) return;
        if (panel.InvokeRequired) { try { panel.BeginInvoke(() => Push()); } catch { } return; }
        Push();
    }

    static decimal? Parse(string s) =>
        decimal.TryParse(s.Replace(" ", "").Replace(" ", "").Replace(',', '.'), NumberStyles.Any, CultureInfo.InvariantCulture, out var v) ? v : null;

    // ---- panel (sidepanel.html) bilan ishlash ----------------------------------------------------

    /// <summary>
    /// Panelda skript bajaradi. Panel sahifasi shu payt qayta chizilsa/yuklansa WebView2 bajarishni bekor qiladi —
    /// bu foydalanuvchining «To'xtatish»i emas, shuning uchun bir oz kutib qayta urinamiz.
    /// </summary>
    async Task<string> PanelEvalAsync(string js, CancellationToken ct)
    {
        for (var attempt = 0; ; attempt++)
        {
            ct.ThrowIfCancellationRequested();
            try { return await panel.CoreWebView2.ExecuteScriptAsync(js); }
            catch (Exception) when (!ct.IsCancellationRequested && attempt < 20 && !panel.IsDisposed)
            {
                await Task.Delay(500, ct);
            }
        }
    }

    async Task<JsonElement> PanelStateAsync(CancellationToken ct)
    {
        var raw = await PanelEvalAsync(
            "(() => { const q = s => document.querySelector('#app ' + s); const b = n => q('[data-a=\"' + n + '\"]');" +
            " return { start: b('start')?.textContent?.trim() || '', startDisabled: !!b('start')?.disabled," +
            " capture: b('capture')?.textContent?.trim() || '', source: q('[data-el=\"source\"]')?.textContent?.trim() || '' }; })()", ct);
        using var doc = JsonDocument.Parse(raw);
        return doc.RootElement.Clone();
    }

    async Task<string> PanelTargetAsync(CancellationToken ct)
    {
        var raw = await PanelEvalAsync("document.querySelector('#app [data-el=\"target\"]')?.value || ''", ct);
        return JsonSerializer.Deserialize<string>(raw) ?? "";
    }

    Task PanelClickAsync(string action, CancellationToken ct) =>
        PanelEvalAsync($"document.querySelector('#app [data-a=\"{action}\"]')?.click()", ct);

    Task PanelSetTargetAsync(decimal value, CancellationToken ct) =>
        PanelEvalAsync(
            "(() => { const i = document.querySelector('#app [data-el=\"target\"]'); if (!i) return;" +
            $" i.value = {JsonSerializer.Serialize(value.ToString("N0", CultureInfo.GetCultureInfo("ru-RU")).Replace(' ', ' '))};" +
            " i.dispatchEvent(new Event('input', { bubbles: true })); })()", ct);

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
        var owner = oneC.FindForm();
        if (string.IsNullOrWhiteSpace(prefs.Warehouse)) { Status("Avval skladni kiriting.", "err"); return; }
        if (oneC.Core is not { } core) { Status("1C tabi tayyor emas.", "err"); return; }
        cts = new CancellationTokenSource();
        var ct = cts.Token;
        var sum = Parse(await PanelTargetAsync(ct));
        var n = prefs.Count;
        if (sum is not > 0)
        {
            cts.Dispose(); cts = null;
            Status("«Maqsad summa» maydoniga umumiy summani kiriting (hamma cheklar uchun).", "err");
            return;
        }
        var targets = Planner.SplitTotal(sum.Value, n, 0.25m, new Random());
        var msg = $"Markirovkali: jami {sum:N0} so'm, {n} ta chek ({string.Join("; ", targets.Select(t => t.ToString("N0")))}), sklad «{prefs.Warehouse}».\n" +
                  (prefs.Post ? "Har chek PROVESTI QILINADI.\n" : "Cheklar provesti qilinmaydi (har chekdan keyin to'xtaydi).\n") + "\nBoshlansinmi?";
        if (MessageBox.Show(owner, msg, "Ishonch", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes)
        {
            cts.Dispose(); cts = null;
            Push();
            return;
        }

        var done = 0;
        Status("Boshlanmoqda…");
        try
        {
            var runner = new UnmarkedRunner(core, new UnmarkedOptions(0, 1, 1, 0, prefs.Warehouse, false), (t, l) => Status(t, l), ct);
            await runner.InitAsync();

            // 1) Boshida bir marta: inventarizatsiya → «Olish»
            Status("Inventarizatsiya yangilanmoqda…");
            await runner.RefreshInventoryKeepOpenAsync();
            Status("«Olish»: inventarizatsiya o'qilmoqda…");
            await PanelClickAsync("capture", ct);
            var sawCapture = false;
            var started = DateTime.UtcNow;
            await WaitAsync(async () =>
            {
                var s = await PanelStateAsync(ct);
                var cap = Str(s, "capture");
                if (cap.StartsWith("Pauza") || cap.StartsWith("Davom")) sawCapture = true;
                return cap == "Olish" && (sawCapture || DateTime.UtcNow - started > TimeSpan.FromSeconds(5)) && !Str(s, "source").StartsWith("0 ");
            }, TimeSpan.FromMinutes(30), "«Olish» tugashi", ct);
            Status("Olindi: " + Str(await PanelStateAsync(ct), "source"));

            // 2) Har chek
            for (var k = 0; k < n; k++)
            {
                Status($"{k + 1}/{n}-chek: yangi Реализация…");
                await runner.CreateMarkedDocumentAsync();
                await PanelSetTargetAsync(targets[k], ct);
                await Task.Delay(800, ct);
                await PanelClickAsync("start", ct);
                Status($"{k + 1}/{n}-chek: Подбор (≈{targets[k]:N0} so'm)…");

                // Oldingi chekning «tayyor» holatidan chiqib, jarayon boshlanganini kutamiz (aks holda darhol «tayyor» deb o'qilardi)
                await WaitAsync(async () => Str(await PanelStateAsync(ct), "start") != "Yangi chekni boshlash", TimeSpan.FromMinutes(2), $"{k + 1}-chek boshlanishi", ct);

                // Panel jarayoni tugashini kutamiz: «Yangi chekni boshlash» — tayyor; «Davom» — to'xtab qoldi
                var stoppedSince = (DateTime?)null;
                await WaitAsync(async () =>
                {
                    var s = Str(await PanelStateAsync(ct), "start");
                    if (s == "Yangi chekni boshlash") return true;
                    if (s == "Davom") { stoppedSince ??= DateTime.UtcNow; if (DateTime.UtcNow - stoppedSince > TimeSpan.FromSeconds(15)) throw new OneCException($"{k + 1}-chek to'xtab qoldi — panel jurnalini ko'ring, «Davom» bilan davom ettirib, keyin «▶ Avto boshlash» ni qayta bosing."); }
                    else stoppedSince = null;
                    return false;
                }, TimeSpan.FromHours(2), $"{k + 1}-chek yig'ilishi", ct);

                if (!prefs.Post)
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
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { Status($"To'xtatildi ({done} ta chek tayyor).", "warn"); }
        catch (OneCException e) { Status(e.Message, "err"); }
        catch (Exception e) { Log.Error("MarkedAuto", e); Status($"Kutilmagan xato ({done} ta chek tayyor): " + e.Message, "err"); }
        finally
        {
            cts?.Dispose();
            cts = null;
            try { await PanelSetTargetAsync(sum.Value, CancellationToken.None); } catch { /* panel yopilgan */ }
            Push();
        }
    }

    public void Dispose() => cts?.Cancel();
}
