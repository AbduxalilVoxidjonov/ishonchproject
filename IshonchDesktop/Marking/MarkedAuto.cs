using System.Globalization;
using System.Text.Json;
using IshonchDesktop.Models;
using IshonchDesktop.UI;
using IshonchDesktop.Unmarked;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace IshonchDesktop.Marking;

/// <summary>
/// Markirovkali chek panelidagi «Avtomatik cheklar» bo'limi: umumiy summa cheklar soniga (har xil) bo'linadi va har chek uchun
/// avtomatik — sklad inventarizatsiyasi (bir marta; faqat yangilash so‘ralganda qayta) → «Olish» → yangi Реализация (sklad + «Товар маркирован») →
/// panelning o'z «Boshlash» jarayoni (Подбор, kodlar) → provesti → keyingi chek.
/// Bo'lim panel sahifasining ichida chiziladi (<see cref="PanelScript"/>), bu klass uning tugmalarini bajaradi.
/// </summary>
public sealed class MarkedAuto : IDisposable
{
    readonly WebTab oneC;
    readonly WebView2 panel;
    readonly Settings settings;
    readonly MarkedPrefs prefs;
    /// <summary>Shu firmaning my.soliq.uz tabi (markirovka kodlari shu yerda tekshiriladi).</summary>
    readonly Func<Task<WebTab>>? getSoliqTab;
    /// <summary>Muammolar jurnalida qaysi baza/firma ekanini ko'rsatish uchun.</summary>
    readonly BaseEntry? baseEntry;
    CancellationTokenSource? cts;
    string statusText = "Umumiy summa — «Maqsad summa» maydonidan olinadi.";
    string statusLevel = "info";
    /// <summary>Inventarizatsiya hujjatiga yoziladigan sana va vaqt (panel tepasida so'raladi; har ochilganda — bugun 23:59:59).</summary>
    DateTime inventoryDate = UnmarkedOptions.DefaultInventoryDate();

    public MarkedAuto(WebTab oneC, WebView2 panel, Settings settings, string baseKey, Func<Task<WebTab>>? getSoliqTab = null, BaseEntry? baseEntry = null)
    {
        this.getSoliqTab = getSoliqTab;
        this.baseEntry = baseEntry;
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
            .ish-in { display:flex; flex-direction:column; gap:8px; }
            .ish-in .row { margin:0; }
            .ish-in .ish-st { font-size:12px; color:#475569; } .ish-in .ish-st.err { color:#b91c1c; } .ish-in .ish-st.ok { color:#15803d; } .ish-in .ish-st.warn { color:#b45309; }
            .ish-go { flex:3 1 auto; padding:10px 8px; font-size:13px; }
            #ishAuto input.ish-bad { border-color:#ef4444; outline:2px solid #fecaca; }`;
          const send = (action) => {
            const q = (n) => document.querySelector('#ishAuto [data-x="' + n + '"]');
            window.chrome?.webview?.postMessage({ kind: 'ishAuto', action,
              warehouse: q('wh')?.value || '', count: Number(q('count')?.value) || 1, post: !!q('post')?.checked, invDate: q('inv')?.value || '' });
          };
          window.__ishAutoApply = (s) => {
            window.__ishAutoState = s;
            const box = document.getElementById('ishAuto'); if (!box || !s) return;
            // Sozlamalar (#ishAuto) va tugmalar (#ishAutoAct) alohida bloklarda
            const q = (n) => document.querySelector('#ishAuto [data-x="' + n + '"], #ishAutoAct [data-x="' + n + '"]') || { };
            if (s.init) { q('inv').value = s.invDate || ''; q('wh').value = s.warehouse || ''; q('count').value = s.count || 1; q('post').checked = !!s.post; s.init = false; }
            q('inv').disabled = q('wh').disabled = q('count').disabled = q('post').disabled = q('go').disabled = !!s.running;
            q('refresh').disabled = !!s.running;
            q('stop').disabled = !s.running;
            q('pause').disabled = !s.running;
            q('pause').textContent = s.paused ? '▶ Davom' : '⏸ Pauza';
            const st = document.getElementById('ishAutoStatus');
            if (st) { st.textContent = s.status || ''; st.className = 'ish-st ' + (s.level || ''); }
          };
          const build = () => {
            const target = document.querySelector('#app [data-el="target"]');
            if (!target || document.getElementById('ishAuto')) return;
            const row = target.closest('.row'); if (!row) return;
            if (!document.getElementById('ishAutoCss')) { const st = document.createElement('style'); st.id = 'ishAutoCss'; st.textContent = css; document.head.appendChild(st); }
            // Yangi panelda bo'sh joylar bor: ① Sozlamalar va ② Ishga tushirish; eski panelda — «Maqsad summa» atrofiga
            const setSlot = document.getElementById('ishAutoSettingsSlot');
            const actSlot = document.getElementById('ishAutoActionsSlot');
            const inSlots = !!(setSlot && actSlot);
            const box = document.createElement('div');
            box.id = 'ishAuto'; box.className = inSlots ? 'ish-in' : 'ish-auto';
            box.innerHTML = (inSlots ? '' : '<div class="ish-h">⚡ Avtomatik cheklar</div>') +
              '<div class="row"><label class="field" style="flex:1 1 100%"><span>Inventarizatsiya sanasi va vaqti</span><input class="inp" data-x="inv" type="datetime-local" step="1"></label></div>' +
              '<div class="row"><label class="field" style="flex:1 1 100%"><span>Sklad (1C dagi nomi)</span><input class="inp" data-x="wh" type="text" placeholder="masalan: МАРКИРОВАН (EPOS)"></label></div>' +
              '<div class="row"><input type="hidden" data-x="count" value="1">' +
              '<label style="align-self:flex-end;padding-bottom:6px"><input type="checkbox" data-x="post"> Provesti qilish</label></div>' +
              (inSlots ? '' : '<div class="muted">Umumiy summa — pastdagi «Maqsad summa» maydoniga (hamma cheklar uchun).</div>');
            const act = document.createElement('div');
            act.id = 'ishAutoAct'; act.className = inSlots ? 'ish-in' : 'ish-auto';
            act.innerHTML = '<div class="row"><button class="b primary ish-go" data-x="go">▶ Avto boshlash</button><button class="b small" data-x="pause" disabled>⏸ Pauza</button><button class="b small" data-x="stop" disabled>■ To‘xtatish</button></div>' +
              '<div class="row"><button class="b small" data-x="reset" title="Qotib qolsa: jarayonni majburan to‘xtatadi, joriy chekni tozalaydi. Ombor qoldig‘i saqlanadi. Ishlatilgan kodlar va xato bazasi saqlanadi">⟲ Boshiga qaytarish</button></div>' +
              '<div class="row"><button class="b small" data-x="refresh">↻ Inventarizatsiyani yangilash</button></div>' +
              '<div class="ish-st" id="ishAutoStatus"></div>';
            if (inSlots) { setSlot.appendChild(box); actSlot.appendChild(act); }
            else { row.parentNode.insertBefore(box, row); row.parentNode.insertBefore(act, row.nextSibling); }
            act.querySelector('[data-x="go"]').onclick = () => {
              const wh = box.querySelector('[data-x="wh"]');
              if (!wh.value.trim()) { wh.classList.add('ish-bad'); wh.focus(); window.__ishAutoApply({ ...(window.__ishAutoState || {}), init: false, status: 'Avval skladni kiriting.', level: 'err' }); return; }
              wh.classList.remove('ish-bad');
              const inv = box.querySelector('[data-x="inv"]');
              if (!inv.value) { inv.classList.add('ish-bad'); inv.focus(); window.__ishAutoApply({ ...(window.__ishAutoState || {}), init: false, status: 'Inventarizatsiya sanasini kiriting.', level: 'err' }); return; }
              inv.classList.remove('ish-bad'); send('go');
            };
            act.querySelector('[data-x="stop"]').onclick = () => send('stop');
            act.querySelector('[data-x="pause"]').onclick = () => send('pause');
            act.querySelector('[data-x="reset"]').onclick = () => { if (confirm('Joriy chek tozalansinmi? Ombor qoldig‘i saqlanadi. (ishlatilgan kodlar va xato bazasi saqlanadi)')) send('reset'); };
            act.querySelector('[data-x="refresh"]').onclick = () => send('refresh');
            box.querySelector('[data-x="inv"]').onchange = () => send('save');
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
        var state = new { init, invDate = inventoryDate.ToString("yyyy-MM-dd'T'HH:mm:ss", CultureInfo.InvariantCulture), warehouse = prefs.Warehouse, count = Math.Clamp(prefs.Count, 1, 200), post = prefs.Post, running = Running, paused, status = statusText, level = statusLevel };
        try { _ = panel.CoreWebView2?.ExecuteScriptAsync("window.__ishAutoApply && window.__ishAutoApply(" + JsonSerializer.Serialize(state) + ")"); }
        catch { /* panel yopilgan */ }
    }

    /// <summary>Paneldagi bo'limdan kelgan xabar: go / stop / save.</summary>
    public void OnMessage(JsonElement m)
    {
        var action = m.TryGetProperty("action", out var a) ? a.GetString() : "";
        if (action == "stop") { cts?.Cancel(); return; }
        if (action == "reset") { _ = ResetAsync(); return; }
        if (action == "pause") { _ = TogglePauseAsync(); return; }
        if (Running) return;
        if (m.TryGetProperty("warehouse", out var w)) prefs.Warehouse = (w.GetString() ?? "").Trim();
        if (m.TryGetProperty("count", out var c) && c.ValueKind == JsonValueKind.Number) prefs.Count = Math.Clamp(c.GetInt32(), 1, 200);
        if (m.TryGetProperty("post", out var p)) prefs.Post = p.ValueKind == JsonValueKind.True;
        if (m.TryGetProperty("invDate", out var inv) && UnmarkedOptions.ParseInventoryDate(inv.GetString()) is { } when) inventoryDate = when;
        settings.Save();
        if (action == "refresh")
        {
            prefs.CapturedOn = null;
            settings.Save();
            Status("Inventarizatsiya keyingi «Avto boshlash» da yangilanadi. Ishlatilgan markirovkalar saqlanadi.", "warn");
        }
        if (action == "go") _ = RunAsync();
    }

    /// <param name="details">Istisno matni (muammolar jurnaliga).</param>
    /// <param name="report">Ogohlantirish/xato muammolar jurnaliga yozilsinmi (foydalanuvchi o'zi to'xtatgani — yo'q).</param>
    void Status(string text, string level = "info", string? details = null, bool report = true)
    {
        Log.Write("Markirovkali avto: " + text);
        if (report && level is "warn" or "err") ProblemLog.Report(Feature.Marked, level, text, baseEntry, details);
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
            " capture: b('capture')?.textContent?.trim() || '', source: q('[data-el=\"source\"]')?.textContent?.trim() || ''," +
            " full: q('[data-el=\"fullSource\"]')?.textContent?.trim() || '', message: q('[data-el=\"message\"]')?.textContent?.trim() || '' }; })()", ct);
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

    /// <summary>
    /// «⟲ Boshiga qaytarish»: avtomatika bekor qilinadi, panelda joriy chek tozalanadi («Tozalash»); panel qotib qolgan
    /// (band) bo'lsa «To'liq to'xtatish» bilan majburan to'xtatiladi. Ombor qoldig‘i, ishlatilgan kodlar va xato bazasi saqlanadi.
    /// </summary>
    async Task ResetAsync()
    {
        Status("Boshiga qaytarilmoqda…", "warn");
        cts?.Cancel();
        for (var i = 0; i < 40 && Running; i++) await Task.Delay(250);
        try
        {
            await PanelClickAsync("clear", CancellationToken.None);
            await Task.Delay(1500);
            var state = Str(await PanelStateAsync(CancellationToken.None), "start");
            if (state is "Davom" or "Pauza")
            {
                // Panel band yoki chek o'tkazilgan qismi bilan qolgan — majburan to'xtatiladi (sahifa qayta yuklanadi)
                await PanelClickAsync("abort", CancellationToken.None);
                await Task.Delay(400);
                await PanelClickAsync("abort", CancellationToken.None);
                Status("Majburan to'xtatildi va joriy chek tozalandi (1C sahifasi qayta yuklanadi). Ombor qoldig‘i saqlandi.", "warn");
            }
            else Status("Boshiga qaytarildi: joriy chek tozalandi, ombor qoldig‘i saqlandi — «▶ Avto boshlash» ni bosing.", "ok");
        }
        catch (Exception e) { Status("Boshiga qaytarib bo'lmadi: " + e.Message, "err"); }
    }

    Task PanelSetTargetAsync(decimal value, CancellationToken ct) =>
        PanelEvalAsync(
            "(() => { const i = document.querySelector('#app [data-el=\"target\"]'); if (!i) return;" +
            $" i.value = {JsonSerializer.Serialize(value.ToString("N0", CultureInfo.GetCultureInfo("ru-RU")).Replace(' ', ' '))};" +
            " i.dispatchEvent(new Event('input', { bubbles: true })); })()", ct);

    static string Str(JsonElement e, string n) => e.TryGetProperty(n, out var v) ? v.GetString() ?? "" : "";

    /// <summary>Pauzadami (foydalanuvchi «⏸ Pauza» bosgan): kutishlar to'xtab turadi, muddatlar hisoblanmaydi.</summary>
    bool paused;
    /// <summary>Joriy jarayonning 1C amallari darvozasi (pauzada keyingi amaldan oldin to'xtaydi).</summary>
    PauseGate? gate;

    /// <summary>
    /// «⏸ Pauza» / «▶ Davom»: 1C amallari keyingi qadamdan oldin to'xtaydi, panel Podbor qilayotgan bo'lsa u ham pauza qilinadi;
    /// davom etganda hammasi shu joyidan davom etadi.
    /// </summary>
    async Task TogglePauseAsync()
    {
        if (!Running) return;
        try
        {
            var start = Str(await PanelStateAsync(CancellationToken.None), "start");
            if (!paused)
            {
                paused = true;
                gate?.Pause();
                if (start == "Pauza") await PanelClickAsync("start", CancellationToken.None); // panel ham pauzaga
                Status("⏸ Pauza — «▶ Davom» bosilsa shu joyidan davom etadi (pauzada 1C ga tegmang).", "warn");
            }
            else
            {
                paused = false;
                gate?.Resume();
                if (start == "Davom") await PanelClickAsync("start", CancellationToken.None); // panel ham davom etadi
                Status("Davom etilmoqda…");
            }
        }
        catch (Exception e) { Status("Pauza/davom xatosi: " + e.Message, "err"); }
    }

    async Task WaitAsync(Func<Task<bool>> cond, TimeSpan max, string what, CancellationToken ct)
    {
        var end = DateTime.UtcNow + max;
        var note = DateTime.UtcNow.AddSeconds(30);
        while (!await cond())
        {
            ct.ThrowIfCancellationRequested();
            // Pauzada kutiladi; o'tgan vaqt muddatga qo'shilmaydi
            while (paused) { await Task.Delay(500, ct); end = end.AddMilliseconds(500); note = DateTime.UtcNow.AddSeconds(30); }
            if (DateTime.UtcNow > end) throw new OneCException("Kutish vaqti tugadi: " + what);
            if (DateTime.UtcNow > note) { Status("Kutilmoqda: " + what); note = DateTime.UtcNow.AddSeconds(30); }
            await Task.Delay(700, ct);
        }
    }

    /// <summary>
    /// Panelning «Boshlash» tugmasini bosadi va jarayon haqiqatan boshlanganini tekshiradi. «Olish» endigina tugagan bo'lsa
    /// tugma bir lahza o'chiq turadi va bosish e'tiborsiz qoladi — shuning uchun avval faol bo'lishi kutiladi, boshlanmasa
    /// (tugma «Pauza» ga aylanmasa) qayta bosiladi.
    /// </summary>
    async Task StartPanelAsync(int k, CancellationToken ct)
    {
        // Panel «Boshlash» dan keyin avval chek rejasini hisoblaydi (1C sahifasida) — bu paytda sahifa band bo'lib, tugma
        // yangilanmaydi. Shuning uchun bir marta bosib sabr bilan kutiladi; qayta bosish hisobni navbatga qo'shib sekinlashtiradi.
        var before = await PanelStateAsync(ct);
        var beforeStart = Str(before, "start");
        var beforeMsg = Str(before, "message");
        for (var attempt = 1; attempt <= 2; attempt++)
        {
            await WaitAsync(async () => (await PanelStateAsync(ct)).TryGetProperty("startDisabled", out var dis) && dis.ValueKind == JsonValueKind.False,
                TimeSpan.FromMinutes(2), $"{k + 1}-chek uchun «Boshlash» tugmasi", ct);
            await PanelClickAsync("start", ct);
            var until = DateTime.UtcNow.AddMinutes(3);
            var note = DateTime.UtcNow.AddSeconds(20);
            while (DateTime.UtcNow < until)
            {
                await Task.Delay(700, ct);
                var s = await PanelStateAsync(ct);
                var now = Str(s, "start");
                // «Pauza» — ishlayapti; boshqa matn (oldingi «Yangi chekni boshlash» dan farqli) — holat o'zgardi
                if (now == "Pauza" || (now != beforeStart && now != "Boshlash")) return;
                var msg = Str(s, "message");
                if (msg.Length > 0 && msg != beforeMsg) throw new OneCException($"{k + 1}-chek: panel boshlamadi — {msg}");
                if (DateTime.UtcNow > note) { Status($"{k + 1}-chek: panel reja tuzmoqda…"); note = DateTime.UtcNow.AddSeconds(30); }
            }
            Status($"{k + 1}-chek: panel javob bermadi, «Boshlash» qayta bosilmoqda…", "warn");
        }
        throw new OneCException($"{k + 1}-chek: panelning «Boshlash» tugmasi ishga tushmadi — panel jurnalini ko'ring.");
    }

    /// <summary>
    /// To'xtatilgan chekni qolgan joyidan davom ettiradi: inventarizatsiya, «Olish» va yangi hujjat qilinmaydi — panel o'sha
    /// Реализация hujjatidagi Podbor'ni davom ettiradi, tugagach provesti qilinadi.
    /// </summary>
    async Task ContinueReceiptAsync(CoreWebView2 core, decimal sum, CancellationToken ct)
    {
        paused = false;
        var done = false;
        try
        {
            var runner = new UnmarkedRunner(core, new UnmarkedOptions(0, 1, 1, 0, prefs.Warehouse, false), (t, l) => Status(t, l), ct);
            gate = runner.Gate;
            await runner.InitAsync();
            Status("Tugallanmagan chek davom ettirilmoqda…");
            await StartPanelAsync(0, ct);
            var stoppedSince = (DateTime?)null;
            await WaitAsync(async () =>
            {
                var s = Str(await PanelStateAsync(ct), "start");
                if (s == "Yangi chekni boshlash") return true;
                if (s == "Davom" && !paused) { stoppedSince ??= DateTime.UtcNow; if (DateTime.UtcNow - stoppedSince > TimeSpan.FromSeconds(15)) throw new OneCException("Chek yana to'xtab qoldi — panel jurnalini ko'ring (1C dagi Реализация hujjati ochiqmi?)."); }
                else stoppedSince = null;
                return false;
            }, TimeSpan.FromHours(2), "chek yig'ilishi", ct);
            if (!prefs.Post) { Status("Chek yig'ildi. Provesti belgisi o'chiq — tekshirib o'zingiz provesti qiling.", "ok"); return; }
            Status("Chek: provesti…");
            var r = await runner.PostCurrentAsync();
            if (!r.Ok) throw new OneCException("Chekni provesti qilib bo'lmadi: " + string.Join(" | ", r.Messages.Take(2)));
            done = true;
            Status("Chek davom ettirildi va provesti qilindi ✓", "ok");
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { Status("To'xtatildi — «▶ Avto boshlash» bosilsa yana qolgan joyidan davom ettirish taklif qilinadi.", "warn"); }
        catch (OneCException e) { Status(e.Message, "err"); }
        catch (Exception e) { Log.Error("MarkedAuto", e); Status("Kutilmagan xato: " + e.Message, "err"); }
        finally
        {
            cts?.Dispose();
            cts = null;
            paused = false;
            gate = null;
            if (sum > 0 && done) { try { await PanelSetTargetAsync(sum, CancellationToken.None); } catch { } }
            Push();
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
        // Panel qayta chizilsa ham tugmalar va holat to'g'ri tursin: ish davomida har 2 soniyada qayta yuboriladi
        using var keepAlive = new System.Windows.Forms.Timer { Interval = 2000 };
        keepAlive.Tick += (_, _) => { if (Running) Push(); };
        keepAlive.Start();
        // Panelda oldingi (masalan dastur yopilgan paytdagi) tugallanmagan chek qolgan bo'lsa — «Davom» turadi, summa maydoni
        // qulflangan va eski summa olinardi. Uni «To'liq to'xtatish» bilan bekor qilamiz va summani qayta kiritishni so'raymiz.
        var resumeReceipt = false;
        if (Str(await PanelStateAsync(ct), "start") == "Davom")
        {
            var ans = MessageBox.Show(owner,
                "Panelda tugallanmagan chek bor.\n\nHa — qolgan joyidan davom ettirish (1C dagi shu Реализация hujjati ochiq bo'lishi kerak).\nYo'q — uni tozalab, yangi chek boshlash.",
                AppInfo.DisplayName, MessageBoxButtons.YesNoCancel, MessageBoxIcon.Question);
            if (ans == DialogResult.Cancel) { cts.Dispose(); cts = null; Push(); return; }
            resumeReceipt = ans == DialogResult.Yes;
        }
        if (!resumeReceipt && Str(await PanelStateAsync(ct), "start") == "Davom")
        {
            await PanelClickAsync("clear", ct);
            await Task.Delay(1500, ct);
            var cleared = Str(await PanelStateAsync(ct), "start") != "Davom";
            cts.Dispose(); cts = null;
            Status(cleared
                ? "Panelda oldingi tugallanmagan chek bor edi — u tozalandi. «Maqsad summa» ni kiriting va «▶ Avto boshlash» ni qayta bosing."
                : "Panelda tugallanmagan chek bor va uni tozalab bo'lmadi: «③ Qo'lda boshqarish» → «⛔ To'liq to'xtatish» ni ikki marta bosing, keyin qayta boshlang.", cleared ? "warn" : "err");
            return;
        }
        var sum = Parse(await PanelTargetAsync(ct));
        if (resumeReceipt) { await ContinueReceiptAsync(core, sum ?? 0, ct); return; }
        // Har «Avto boshlash» — bitta chek: «Maqsad summa» shu chekning summasi, tovarlar summaga qarab istalgancha olinadi
        // (bir tovardan nechta — panelning «Bir tovardan, dona» maydonida)
        var n = 1;
        if (sum is not > 0)
        {
            cts.Dispose(); cts = null;
            Status("«Maqsad summa» maydoniga umumiy summani kiriting (hamma cheklar uchun).", "err");
            return;
        }
        var targets = Planner.SplitTotal(sum.Value, n, 0.25m, new Random());
        var msg = $"Markirovkali chek: {sum:N0} so'm (1 ta chek), sklad «{prefs.Warehouse}».\n" +
                  (prefs.Post ? "Chek PROVESTI QILINADI.\n" : "Chek provesti qilinmaydi (tekshirib o'zingiz provesti qilasiz).\n") + "\nBoshlansinmi?";
        if (MessageBox.Show(owner, msg, AppInfo.DisplayName, MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes)
        {
            cts.Dispose(); cts = null;
            Push();
            return;
        }

        var done = 0;
        Status("Boshlanmoqda…");
        try
        {
            // Markirovka kodlari my.soliq.uz da tekshiriladi: ERI kalit bilan kirilmagan bo'lsa boshlanmaydi
            if (getSoliqTab is not null)
            {
                Status("my.soliq.uz ga kirilganligi tekshirilmoqda…");
                if (!await SoliqBridge.IsLoggedInAsync(getSoliqTab))
                    throw new OneCException(SoliqBridge.NotLoggedInMessage + ".");
            }
            var runner = new UnmarkedRunner(core, new UnmarkedOptions(0, 1, 1, 0, prefs.Warehouse, false) { InventoryDate = inventoryDate }, (t, l) => Status(t, l), ct);
            gate = runner.Gate;
            paused = false;
            await runner.InitAsync();

            // 1) Ombor bir marta o'qiladi: shu sklad uchun panelda ma'lumot bo'lsa — inventarizatsiya va «Olish»
            // qaytarilmaydi, panel oldingi cheklarda sotilgan sonni va ishlatilgan markirovkalarni o'zi ayirib boradi;
            // bo'lmasa (yoki inventarizatsiyani yangilash so‘ralganda) inventarizatsiya → «Olish»
            var have = await PanelStateAsync(ct);
            var reuse = prefs.CapturedOn is not null && string.Equals(prefs.CapturedWarehouse, prefs.Warehouse, StringComparison.OrdinalIgnoreCase)
                && Str(have, "source").Length > 0;
            if (reuse) Status("Ombor avval o'qilgan — qayta o'qilmaydi (" + Str(have, "source") + ")");
            else
            {
                Status($"Inventarizatsiya yangilanmoqda ({inventoryDate:dd.MM.yyyy HH:mm:ss})…");
                await runner.RefreshInventoryKeepOpenAsync();
                // «Olish» haqiqatan yangi ma'lumot o'qiganini tekshiramiz (o'qilgan vaqti o'zgaradi); xato bo'lsa — eski ma'lumot
                // bilan davom etilmaydi: inventarizatsiya tabi qayta ochilib bir marta yana urinadi
                var beforeFull = Str(await PanelStateAsync(ct), "full");
                for (var attempt = 1; ; attempt++)
                {
                    Status("«Olish»: inventarizatsiya o'qilmoqda…");
                    await PanelClickAsync("capture", ct);
                    var sawCapture = false;
                    var started = DateTime.UtcNow;
                    await WaitAsync(async () =>
                    {
                        var s = await PanelStateAsync(ct);
                        var cap = Str(s, "capture");
                        if (cap.StartsWith("Pauza") || cap.StartsWith("Davom")) sawCapture = true;
                        return cap == "Olish" && (sawCapture || DateTime.UtcNow - started > TimeSpan.FromSeconds(5));
                    }, TimeSpan.FromMinutes(30), "«Olish» tugashi", ct);
                    var after = await PanelStateAsync(ct);
                    if (Str(after, "full") != beforeFull && !Str(after, "source").StartsWith("0 ")) break;
                    var why = Str(after, "message");
                    if (attempt >= 2) throw new OneCException("«Olish» inventarizatsiyani o'qiy olmadi" + (why.Length > 0 ? ": " + why : "."));
                    Status("«Olish» o'qiy olmadi" + (why.Length > 0 ? $" ({why})" : "") + " — inventarizatsiya qayta ochilib, yana urinilmoqda…", "warn");
                    await runner.ActivateInventoryTabAsync();
                }
                Status("Olindi: " + Str(await PanelStateAsync(ct), "source"));
                prefs.CapturedWarehouse = prefs.Warehouse;
                prefs.CapturedOn = DateTime.Today;
                prefs.CapturedInventoryDate = inventoryDate;
                settings.Save();
            }

            // 2) Har chek
            for (var k = 0; k < n; k++)
            {
                Status($"{k + 1}/{n}-chek: yangi Реализация…");
                await runner.CreateMarkedDocumentAsync();
                await PanelSetTargetAsync(targets[k], ct);
                await Task.Delay(800, ct);
                Status($"{k + 1}/{n}-chek: Подбор (≈{targets[k]:N0} so'm)…");
                await StartPanelAsync(k, ct);

                // Panel jarayoni tugashini kutamiz: «Yangi chekni boshlash» — tayyor; «Davom» — to'xtab qoldi
                var stoppedSince = (DateTime?)null;
                await WaitAsync(async () =>
                {
                    var s = Str(await PanelStateAsync(ct), "start");
                    if (s == "Yangi chekni boshlash") return true;
                    if (s == "Davom" && !paused) { stoppedSince ??= DateTime.UtcNow; if (DateTime.UtcNow - stoppedSince > TimeSpan.FromSeconds(15)) throw new OneCException($"{k + 1}-chek to'xtab qoldi — panel jurnalini ko'ring, «Davom» bilan davom ettirib, keyin «▶ Avto boshlash» ni qayta bosing."); }
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
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { Status($"To'xtatildi ({done} ta chek tayyor).", "warn", report: false); }
        catch (OneCException e) { Status(e.Message, "err"); }
        catch (Exception e) { Log.Write("XATO MarkedAuto: " + e); Status($"Kutilmagan xato ({done} ta chek tayyor): " + e.Message, "err", e.ToString()); }
        finally
        {
            cts?.Dispose();
            cts = null;
            paused = false;
            gate = null;
            try { await PanelSetTargetAsync(sum.Value, CancellationToken.None); } catch { /* panel yopilgan */ }
            Push();
        }
    }

    public void Dispose() => cts?.Cancel();
}
