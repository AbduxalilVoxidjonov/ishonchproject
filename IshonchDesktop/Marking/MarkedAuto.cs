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
            const q = (n) => document.querySelector('#ishAuto [data-x="' + n + '"], #ishCount [data-x="' + n + '"]');
            window.chrome?.webview?.postMessage({ kind: 'ishAuto', action,
              warehouse: q('wh')?.value || '', count: Number(q('count')?.value) || 1, post: !!q('post')?.checked, invDate: q('inv')?.value || '',
              markup: Number(String(q('markup')?.value || '0').replace(',', '.')) || 0 });
          };
          window.__ishAutoApply = (s) => {
            window.__ishAutoState = s;
            const box = document.getElementById('ishAuto'); if (!box || !s) return;
            // Sozlamalar (#ishAuto) va tugmalar (#ishAutoAct) alohida bloklarda
            const q = (n) => document.querySelector('#ishAuto [data-x="' + n + '"], #ishAutoAct [data-x="' + n + '"], #ishCount [data-x="' + n + '"]') || { };
            if (s.init) { q('inv').value = s.invDate || ''; q('wh').value = s.warehouse || ''; q('count').value = s.count || 1; q('post').checked = !!s.post; q('markup').value = s.markup ?? 0; s.init = false; }
            q('inv').disabled = q('wh').disabled = q('count').disabled = q('post').disabled = q('markup').disabled = q('go').disabled = !!s.running;
            q('stop').disabled = !s.running;
            q('sellDoc').disabled = !!s.running;
            q('pause').disabled = !s.running;
            q('pause').textContent = s.paused ? '▶ Davom' : '⏸ Pauza';
            const st = document.getElementById('ishAutoStatus');
            if (st) { st.textContent = s.status || ''; st.className = 'ish-st ' + (s.level || ''); }
          };
          const build = () => {
            // Sarlavhadagi «✕» — panelni yopadi (1C hujjati ochiq qoladi)
            const head = document.querySelector('#app .head');
            if (head && !head.querySelector('.ish-x')) {
              const x = document.createElement('button');
              x.className = 'ish-x'; x.textContent = '✕'; x.title = 'Panelni yopish';
              x.style.cssText = 'flex:0 0 auto;margin-left:10px;width:26px;height:26px;border:0;border-radius:6px;background:rgba(255,255,255,.18);color:#fff;font-size:14px;line-height:1;cursor:pointer';
              x.onmouseenter = () => { x.style.background = 'rgba(255,255,255,.35)'; };
              x.onmouseleave = () => { x.style.background = 'rgba(255,255,255,.18)'; };
              x.onclick = () => send('close');
              head.appendChild(x);
            }
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
              '<div class="row"><label style="align-self:flex-end;padding-bottom:6px"><input type="checkbox" data-x="post"> Provesti qilish</label></div>' +
              (inSlots ? '' : '<div class="muted">Umumiy summa — pastdagi «Maqsad summa» maydoniga (hamma cheklar uchun).</div>');
            const act = document.createElement('div');
            act.id = 'ishAutoAct'; act.className = inSlots ? 'ish-in' : 'ish-auto';
            act.innerHTML = '<div class="row"><button class="b primary ish-go" data-x="go">▶ Avto boshlash</button><button class="b small" data-x="pause" disabled>⏸ Pauza</button><button class="b small" data-x="stop" disabled title="Joriy tovar tugagach chek terilgani bilan yopiladi va provesti qilinadi, terilmagan summa maydonga qaytadi. Chekni yopmasdan to‘xtatish — «⏸ Pauza» (shu joyidan davom etadi)">■ To‘xtatish</button></div>' +
              '<div class="row"><button class="b small" data-x="sellDoc" title="1C da hozir ochiq turgan Реализация hujjatini (dastur yaratmagan bo‘lsa ham) markirovka kodlari bilan E-POS orqali sotish">📄 Ochiq 1C hujjatini E-POS orqali sotish</button></div>' +
              '<div class="row"><button class="b small" data-x="reset" title="Jarayonni to‘xtatadi, joriy chekni tozalaydi va keyingi «Avto boshlash» da inventarizatsiyani qaytadan yangilaydi. Ishlatilgan kodlar va xato bazasi saqlanadi">⟲ Boshiga qaytarish va inventarizatsiyani yangilash</button></div>' +
              '<div class="ish-st" id="ishAutoStatus"></div>';
            // «Nechta chek» — «Maqsad summa» bilan bir qatorda, uning yonida
            const cnt = document.createElement('label');
            cnt.id = 'ishCount'; cnt.className = 'field'; cnt.style.flex = '0 1 96px';
            cnt.title = '«Maqsad summa» shuncha chekka bo‘linadi (har xil summalar bilan), cheklar ketma-ket teriladi';
            cnt.innerHTML = '<span>Nechta chek</span><input class="inp" data-x="count" type="number" min="1" max="200" step="1" value="1">';
            const targetField = target.closest('label') || target;
            targetField.parentNode.insertBefore(cnt, targetField.nextSibling);
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
            act.querySelector('[data-x="sellDoc"]').onclick = () => send('sellDoc');
            act.querySelector('[data-x="pause"]').onclick = () => send('pause');
            act.querySelector('[data-x="reset"]').onclick = () => { if (confirm('Joriy chek tozalanib, inventarizatsiya keyingi «Avto boshlash» da qaytadan yangilansinmi? (ishlatilgan kodlar va xato bazasi saqlanadi)')) send('reset'); };
            box.querySelector('[data-x="inv"]').onchange = () => send('save');
            box.querySelector('[data-x="wh"]').onchange = () => send('save');
            cnt.querySelector('[data-x="count"]').onchange = () => send('save');
            box.querySelector('[data-x="post"]').onchange = () => send('save');
            const s = window.__ishAutoState; if (s) window.__ishAutoApply({ ...s, init: true });
          };
          setInterval(build, 500);
        })();
        """;

    /// <summary>Panel sahifasi tayyor bo'lganda (va qayta yuklanganda) bo'limga saqlangan qiymatlarni beradi.</summary>
    public void Push(bool init = false)
    {
        var state = new { init, invDate = inventoryDate.ToString("yyyy-MM-dd'T'HH:mm:ss", CultureInfo.InvariantCulture), warehouse = prefs.Warehouse, count = Math.Clamp(prefs.Count, 1, 200), post = prefs.Post, markup = prefs.Markup, running = Running, paused, status = statusText, level = statusLevel };
        try { _ = panel.CoreWebView2?.ExecuteScriptAsync("window.__ishAutoApply && window.__ishAutoApply(" + JsonSerializer.Serialize(state) + ")"); }
        catch { /* panel yopilgan */ }
    }

    /// <summary>Paneldagi bo'limdan kelgan xabar: go / stop / save.</summary>
    public void OnMessage(JsonElement m)
    {
        var action = m.TryGetProperty("action", out var a) ? a.GetString() : "";
        if (action == "stop") { _ = StopAsync(); return; }
        if (action == "close") { _ = CloseAsync(); return; }
        if (action == "reset") { _ = ResetAsync(); return; }
        if (action == "pause") { _ = TogglePauseAsync(); return; }
        if (action == "sellDoc") { if (!Running) _ = SellOpenDocumentAsync(); return; }
        if (Running) return;
        if (m.TryGetProperty("warehouse", out var w)) prefs.Warehouse = (w.GetString() ?? "").Trim();
        if (m.TryGetProperty("count", out var c) && c.ValueKind == JsonValueKind.Number) prefs.Count = Math.Clamp(c.GetInt32(), 1, 200);
        if (m.TryGetProperty("post", out var p)) prefs.Post = p.ValueKind == JsonValueKind.True;
        if (m.TryGetProperty("markup", out var mk) && mk.ValueKind == JsonValueKind.Number) prefs.Markup = Math.Clamp(mk.GetDecimal(), 0m, 1000m);
        if (m.TryGetProperty("invDate", out var inv) && UnmarkedOptions.ParseInventoryDate(inv.GetString()) is { } when) inventoryDate = when;
        settings.Save();
        if (action == "go") _ = RunAsync();
    }

    /// <summary>Panel hozir chek teryaptimi (Подбор bosqichi): shu paytda «To'xtatish» chekni yopib o'tkazadi.</summary>
    bool collecting;
    /// <summary>«To'xtatish» bosilgan: joriy tovar tugagach chek terilgani bilan yopiladi (yana bosilsa ham — yakunlanishi kutiladi).</summary>
    bool finishing;

    /// <summary>
    /// «■ To'xtatish»: chek terilayotgan bo'lsa va kamida bitta tovar o'tkazilgan bo'lsa — joriy tovar tugagach chek shu yerda
    /// yopiladi va (belgi yoqilgan bo'lsa) provesti qilinadi, qolgan summa keyingi chekka qoladi; ikkinchi bosish buni bekor
    /// qilmaydi. Boshqa bosqichda (hali tovar terilmagan) — to'xtaydi (panel pauzaga olinadi, keyin davom ettirish mumkin).
    /// </summary>
    /// <summary>Paneldagi «✕»: panelni yashiradi (jarayon ketayotgan bo'lsa avval to'xtatiladi). Qayta ochish — «Markirovkali chek» tugmasi.</summary>
    async Task CloseAsync()
    {
        if (Running)
        {
            if (MessageBox.Show(oneC.FindForm(), "Jarayon ketmoqda. To'xtatilsinmi?", AppInfo.DisplayName, MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            await StopAsync(hard: true);
        }
        oneC.HideSidePanel();
    }

    /// <param name="hard">Darhol to'xtatish (panel yopilayotganda): chek yopilmaydi, keyin davom ettirish mumkin.</param>
    async Task StopAsync(bool hard = false)
    {
        if (!Running) return;
        // «To'xtatish» chekni yakunlaydi: ikkinchi bosish ham chekni tashlab ketmaydi — yakunlanishi kutiladi
        // (darhol, chekni yopmasdan to'xtatish kerak bo'lsa — «⏸ Pauza»; u shu joyidan davom etadi)
        if (finishing && !hard)
        {
            Status("Chek yakunlanmoqda — joriy tovar tugashini kuting (provesti qilinadi). Darhol to'xtatish uchun «⏸ Pauza» ni bosing.", "warn", report: false);
            return;
        }
        try
        {
            var s = await PanelStateAsync(CancellationToken.None);
            var start = Str(s, "start");
            if (!hard && !finishing && collecting && start is "Pauza" or "Davom" && int.TryParse(Str(s, "placed"), out var placed) && placed > 0)
            {
                finishing = true;
                if (paused) { paused = false; gate?.Resume(); }
                await PanelClickAsync("finish", CancellationToken.None);
                Status("To'xtatilmoqda: joriy tovar tugagach chek shu yerda yopiladi" + (prefs.Post ? " va provesti qilinadi" : "") +
                       "; terilmagan summa «Maqsad summa» ga yoziladi. (Chekni yopmasdan to'xtatish kerak bo'lsa — «⏸ Pauza».)", "warn", report: false);
                return;
            }
            if (start == "Pauza") await PanelClickAsync("start", CancellationToken.None); // panel ham to'xtaydi (pauza)
        }
        catch (Exception e) { Log.Write("MarkedAuto to'xtatish: " + e.Message); }
        cts?.Cancel();
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

    /// <summary>1C «Основная цена продажи (НДС сверху)»: narx ustiga qo'shiladigan QQS stavkasi.</summary>
    const decimal VatRate = 12m;

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
            " full: q('[data-el=\"fullSource\"]')?.textContent?.trim() || '', placed: q('[data-el=\"placedKinds\"]')?.textContent?.trim() || ''," +
            " inflight: q('[data-el=\"inflight\"]')?.textContent?.trim() || '', doneTotal: q('[data-el=\"doneTotal\"]')?.textContent?.trim() || '', doneLocal: q('[data-el=\"doneLocal\"]')?.textContent?.trim() || '', message: q('[data-el=\"message\"]')?.textContent?.trim() || '' }; })()", ct);
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
            else Status("Boshiga qaytarildi: joriy chek tozalandi. Inventarizatsiya keyingi «▶ Avto boshlash» da qaytadan yangilanadi.", "ok");
            // Bitta tugma: boshiga qaytarish inventarizatsiyani ham yangilashga qo'yadi (ishlatilgan markirovkalar saqlanadi)
            prefs.CapturedOn = null;
            settings.Save();
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
            collecting = true;
            var stoppedSince = (DateTime?)null;
            await WaitAsync(async () =>
            {
                var s = Str(await PanelStateAsync(ct), "start");
                if (s == "Yangi chekni boshlash") return true;
                if (s == "Davom" && !paused) { stoppedSince ??= DateTime.UtcNow; if (DateTime.UtcNow - stoppedSince > TimeSpan.FromSeconds(15)) throw new OneCException("Chek yana to'xtab qoldi — panel jurnalini ko'ring (1C dagi Реализация hujjati ochiqmi?)."); }
                else stoppedSince = null;
                return false;
            }, TimeSpan.FromHours(2), "chek yig'ilishi", ct);
            collecting = false;
            if (!prefs.Post) { Status("Chek yig'ildi. Provesti belgisi o'chiq — tekshirib o'zingiz provesti qiling.", "ok"); return; }
            Status("Chek: provesti…");
            var r = await runner.PostCurrentAsync();
            if (!r.Ok) throw new OneCException("Chekni provesti qilib bo'lmadi: " + string.Join(" | ", r.Messages.Take(2)));
            done = true;
            Status(finishing ? "To'xtatildi: terilgan qismi bilan chek yopildi va provesti qilindi ✓ Qolgani uchun summani kiritib «▶ Avto boshlash» ni bosing." : "Chek davom ettirildi va provesti qilindi ✓", "ok");
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
            collecting = false;
            finishing = false;
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
        var n = Math.Clamp(prefs.Count, 1, 200);
        if (sum is not > 0)
        {
            cts.Dispose(); cts = null;
            Status("«Maqsad summa» maydoniga umumiy summani kiriting (hamma cheklar uchun).", "err");
            return;
        }
        var targets = Planner.SplitTotal(sum.Value, n, 0.25m, new Random());
        var msg = $"Markirovkali chek: {sum:N0} so'm ({n} ta chek" + (n > 1 ? ", summa cheklarga bo'linadi" : "") + $"), sklad «{prefs.Warehouse}». Natsenkani o'zingiz qo'yasiz.\n" +
                  (prefs.Post ? "Cheklar PROVESTI QILINADI.\n" : "Cheklar faqat yoziladi («Записать») — «Провести и закрыть» bosilmaydi.\n") + "\nBoshlansinmi?";
        if (MessageBox.Show(owner, msg, AppInfo.DisplayName, MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes)
        {
            cts.Dispose(); cts = null;
            Push();
            return;
        }

        var done = 0;
        var unposted = false;
        var stopped = false;
        decimal? closedTotal = null, rest = null;
        // Ish tugagach «Maqsad summa» ga qaytariladigan summa: odatda kiritilgani; chek erta yopilgan bo'lsa — qolgani
        var restore = sum.Value;
        finishing = false;
        Status("Boshlanmoqda…");
        try
        {
            // Markirovka kodlari my.soliq.uz da tekshiriladi: ERI kalit bilan kirilmagan bo'lsa boshlanmaydi
            if (getSoliqTab is not null)
            {
                Status("my.soliq.uz ga kirilganligi tekshirilmoqda…");
                // Kirilmagan bo'lsa — soliq tabi oldinga chiqadi, firma kaliti o'zi tanlanadi, parolni kiritish kutiladi (3 daqiqa)
                if (!await SoliqBridge.EnsureLoggedInAsync(getSoliqTab, TimeSpan.FromMinutes(3), t => Status(t, "warn"), ct))
                    throw new OneCException(SoliqBridge.NotLoggedInMessage + ".");
                oneC.Activate(); // kirilgach 1C tabiga qaytiladi
                Status("my.soliq.uz ga kirildi ✓");
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
            // «To'xtatish» chekni erta yopsa, qolgan summa uchun yangi chek shu yerning o'zida boshlanadi
            // (qolgan summa navbatga keyingi chek bo'lib qo'shiladi; undan keyingi cheklar o'z summasi bilan qoladi)
            var goals = targets.ToList();
            var emptyRetries = 0;
            var dropRetries = 0;
            string? stuckWhy = null;
            for (var k = 0; k < goals.Count; k++)
            {
                var goal = goals[k];
                restore = goals.Skip(k).Sum(); // shu yerda butunlay to'xtatilsa — terilmagan summa maydonga qaytadi
                Status($"{k + 1}-chek: yangi Реализация…");
                await runner.CreateMarkedDocumentAsync();
                // Panel tovarlarni inventarizatsiya narxi (QQS'siz, natsenkasiz) bo'yicha tanlaydi; 1C da «Сумма» ga natsenka
                // qo'shiladi va QQS ustiga («НДС сверху») — chek jami maqsadga teng chiqishi uchun panelga ikkalasisiz summa beriladi
                await PanelSetTargetAsync(Math.Round(goal / (1 + VatRate / 100m)), ct); // natsenkani foydalanuvchi o'zi qo'yadi — dastur hisobga olmaydi
                await Task.Delay(800, ct);
                Status($"{k + 1}-chek: Подбор (≈{goal:N0} so'm)…");
                await StartPanelAsync(k, ct);
                collecting = true;

                // Panel jarayoni tugashini kutamiz: «Yangi chekni boshlash» — tayyor; «Davom» — to'xtab qoldi
                var stoppedSince = (DateTime?)null;
                var reactivated = false;
                var closedEarly = false;
                var soliqAsked = false;
                for (var finishTry = 0; ; finishTry++)
                {
                await WaitAsync(async () =>
                {
                    var ps = await PanelStateAsync(ct);
                    var s = Str(ps, "start");
                    if (s == "Yangi chekni boshlash") return true;
                    // Hujjat tabi orqaga o'tib qolgan (1C sekin bo'lganda kechikkan bosish): bir marta oldinga chiqarib davom ettiriladi
                    if (s == "Davom" && !paused && !reactivated && Str(ps, "message").Contains("hujjatini tanlang") && await runner.ActivateNewDocumentTabAsync())
                    {
                        reactivated = true;
                        Status($"{k + 1}-chek: Реализация hujjati oldinga chiqarildi, davom ettirilmoqda…", "warn");
                        await PanelClickAsync("start", ct);
                        return false;
                    }
                    // my.soliq.uz seansi tugagan: chek yopilmaydi — foydalanuvchi qayta kirib «Davom» ni bosguncha kutiladi
                    if (s == "Davom" && !paused && Str(ps, "message").Contains("my.soliq.uz"))
                    {
                        stoppedSince = null;
                        if (soliqAsked) return false;
                        soliqAsked = true;
                        // Soliq tabi oldinga chiqadi, firma kaliti tanlanadi, parol kutiladi; kirilgach chek o'zi davom etadi
                        Status($"{k + 1}-chek: my.soliq.uz seansi tugagan — E-IMZO oynasida parolni kiriting (chek kutib turadi).", "warn");
                        if (getSoliqTab is not null && await SoliqBridge.EnsureLoggedInAsync(getSoliqTab, TimeSpan.FromMinutes(5), t => Status(t, "warn"), ct))
                        {
                            oneC.Activate();
                            Status($"{k + 1}-chek: my.soliq.uz ga kirildi ✓ — davom etilmoqda");
                            await PanelClickAsync("start", ct);
                        }
                        return false;
                    }
                    soliqAsked = false;
                    if (s == "Davom" && !paused)
                    {
                        stoppedSince ??= DateTime.UtcNow;
                        if (DateTime.UtcNow - stoppedSince > TimeSpan.FromSeconds(15)) { stuckWhy = Str(ps, "message"); return true; }
                    }
                    else stoppedSince = null;
                    return false;
                }, TimeSpan.FromHours(2), $"{k + 1}-chek yig'ilishi", ct);
                // To'xtab qolgan chekda tovar terilgan bo'lsa — u bekor qilinmaydi: terilgani bilan yakunlanib provesti qilinadi
                // (noaniq o'tkazish bo'lsa avval 1C hujjatidan tekshirilib tasdiqlanadi). Bir marta urinib ko'riladi.
                if (stuckWhy is null || finishTry > 0 || !await FinishStuckAsync(k, stuckWhy, runner, ct)) break;
                stuckWhy = null;
                stoppedSince = null;
                closedEarly = true;
                }
                collecting = false;
                // Chek to'xtab qoldi (1C xatosi, tovar topilmadi…): chek bekor qilinadi — panel terilganlarni qaytaradi, hujjat
                // saqlanmasdan yopiladi — va shu summa uchun yangi chek qolgan tovarlardan boshlanadi (muammo tashlab ketiladi)
                if (stuckWhy is not null)
                {
                    var why = stuckWhy.Length > 0 ? stuckWhy : "sabab panel jurnalida";
                    stuckWhy = null;
                    if (++dropRetries > 2)
                        throw new OneCException($"{k + 1}-chek ketma-ket 3 marta to'xtab qoldi ({why}) — panel jurnalini ko'ring. {done} ta chek tayyor.");
                    Status($"{k + 1}-chek to'xtab qoldi ({why}) — chek bekor qilinib, keyingi tovarlardan yangisi boshlanmoqda…", "warn");
                    await PanelClickAsync("dropReceipt", ct);
                    await WaitAsync(async () => Str(await PanelStateAsync(ct), "start") is not ("Davom" or "Pauza" or ""), TimeSpan.FromMinutes(2), "chekni bekor qilish", ct);
                    await runner.DiscardCurrentAsync();
                    if (finishing)
                    {
                        // «To'xtatish» bosilgan edi: yangi chek boshlanmaydi
                        restore = goals.Skip(k).Sum();
                        stopped = true;
                        break;
                    }
                    k--;
                    continue;
                }
                dropRetries = 0;
                // Chekka birorta tovar tushmagan (barcha markirovkalar xato chiqqan): bo'sh hujjatni 1C provesti qilmaydi
                // («Не введено ни одной строки…») — hujjat saqlanmasdan yopiladi va ish to'xtaydi
                if (Str(await PanelStateAsync(ct), "placed") == "0")
                {
                    await runner.DiscardCurrentAsync();
                    // Xato kodlar endi xato bazasida — panel keyingi rejada ularni hisobga olmaydi: shu chek bir marta qayta quriladi
                    if (++emptyRetries <= 1)
                    {
                        Status($"{k + 1}-chekka birorta tovar tushmadi (markirovkalar xato chiqdi) — bo'sh hujjat yopildi, chek qayta rejalanmoqda…", "warn");
                        k--;
                        continue;
                    }
                    throw new OneCException($"{k + 1}-chekka birorta tovar tushmadi — markirovkalar xato chiqdi yoki yetmadi (panelda «Xato markirovkalar» ni ko'ring). Bo'sh hujjat saqlanmasdan yopildi; {done} ta chek tayyor.");
                }
                emptyRetries = 0;
                // Muammo sabab erta yopilgan chek: maqsadning terilmagan qismi keyingi chekka qo'shiladi (jami summa saqlanadi)
                if (closedEarly && !finishing && await ClosedTotalAsync(runner, ct) is { } early && early > 0 && goal - early > 0)
                {
                    var left = Math.Round(goal - early);
                    if (k + 1 < goals.Count) goals[k + 1] += left; else goals.Add(left);
                    Status($"{k + 1}-chek terilgani bilan yopildi ({early:N0} so'm) — qolgan {left:N0} so'm keyingi chekka qo'shildi.", "warn");
                }
                // «To'xtatish» bilan erta yopilgan chek: 1C dagi jami (QQS bilan) — qolgan summa keyingi chekka qoladi
                // (jami 1C hujjatining o'zidan o'qiladi; o'qilmasa — panel hisoblagan 1C jami)
                if (finishing && await ClosedTotalAsync(runner, ct) is { } closed && closed > 0)
                {
                    closedTotal = closed;
                    rest = Math.Max(0, Math.Round(goal - closed));
                }

                if (!prefs.Post)
                {
                    // Belgi o'chiq: «Провести и закрыть» bosilmaydi — hujjat «Записать» qilinib yopiladi va keyingi chekka o'tiladi
                    Status($"{k + 1}-chek: yozilmoqda («Записать»)…");
                    await runner.SaveAndCloseCurrentAsync();
                    done++;
                    Status($"{k + 1}-chek yozildi va yopildi ✓", "ok");
                    if (!finishing) continue;
                    restore = (rest ?? 0) + goals.Skip(k + 1).Sum();
                    stopped = true;
                    break;
                }
                Status($"{k + 1}-chek: provesti…");
                var r = await runner.PostCurrentAsync();
                if (!r.Ok) throw new OneCException($"{k + 1}-chekni provesti qilib bo'lmadi: " + string.Join(" | ", r.Messages.Take(2)));
                done++;
                Status($"{k + 1}-chek provesti qilindi ✓", "ok");
                if (!finishing) continue;
                // «To'xtatish»: chek terilgani bilan yopildi va o'tkazildi — ish shu yerda to'xtaydi; terilmagan summa maydonga qaytadi
                restore = (rest ?? 0) + goals.Skip(k + 1).Sum();
                stopped = true;
                break;
            }
            if (unposted) { /* holat yuqorida yozildi */ }
            else if (stopped) Status($"To'xtatildi: {done} ta chek tayyor ✓" + RestNote(closedTotal, restore), "ok");
            else { restore = sum.Value; Status($"Tugadi: {done} ta chek " + (prefs.Post ? "provesti qilindi." : "yozildi («Записать»)."), "ok"); }
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
            collecting = false;
            finishing = false;
            // Erta yopilgan chekdan keyin «Maqsad summa» da qolgan summa turadi: «Avto boshlash» uni yangi chekka teradi
            try { await PanelSetTargetAsync(restore > 0 ? restore : sum.Value, CancellationToken.None); } catch { /* panel yopilgan */ }
            Push();
        }
    }

    /// <summary>
    /// To'xtab qolgan chekni terilgan tovarlari bilan yakunlashga urinadi: noaniq o'tkazish bo'lsa 1C hujjatidagi miqdor bo'yicha
    /// tasdiqlanadi (aniqlab bo'lmasa — false), so'ng panelda «Chekni shu yerda yakunlash» bosiladi. Terilgan tovar yo'q — false.
    /// </summary>
    async Task<bool> FinishStuckAsync(int k, string why, UnmarkedRunner runner, CancellationToken ct)
    {
        var st = await PanelStateAsync(ct);
        var flight = Str(st, "inflight");
        if (flight.Length > 0)
        {
            try
            {
                using var j = JsonDocument.Parse(flight);
                var name = j.RootElement.GetProperty("name").GetString() ?? "";
                var placed = j.RootElement.GetProperty("placed").GetDecimal();
                var confirmed = j.RootElement.GetProperty("confirmed").GetDecimal();
                var have = (await runner.ReadDocQuantitiesAsync()).GetValueOrDefault(GoodsKind.Key(name));
                var action = have >= confirmed ? "confirmAdded" : have <= placed ? "confirmNotAdded" : null;
                if (action is null) { Status($"{k + 1}-chek: «{name}» hujjatda {have} ta — o'tkazilgani aniqlanmadi.", "warn"); return false; }
                Status($"{k + 1}-chek: «{name}» 1C hujjatida {have} ta — o'tkazish {(action == "confirmAdded" ? "bo'lgan" : "bo'lmagan")} deb tasdiqlandi.", "warn");
                await PanelClickAsync(action, ct);
                await Task.Delay(1000, ct);
                st = await PanelStateAsync(ct);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                Log.Write("MarkedAuto noaniq o'tkazish: " + e.Message);
                return false;
            }
        }
        if (!int.TryParse(Str(st, "placed"), out var kinds) || kinds == 0) return false;
        Status($"{k + 1}-chek to'xtab qoldi ({(why.Length > 0 ? why : "sabab panel jurnalida")}) — terilgan {kinds} xil tovar bilan yakunlanib provesti qilinadi…", "warn");
        await PanelClickAsync("finish", ct);
        return true;
    }

    /// <summary>
    /// Erta yopilgan chekning jami summasi (QQS bilan): 1C hujjatidagi «Всего» (1C uni bir oz kechikib hisoblaydi — bir necha
    /// soniya kutiladi), bo'lmasa panelning 1C jami, u ham bo'lmasa panelning lokal hisobi + natsenka + QQS (taxminan).
    /// </summary>
    async Task<decimal?> ClosedTotalAsync(UnmarkedRunner runner, CancellationToken ct)
    {
        for (var i = 0; i < 16; i++)
        {
            if (Parse(await runner.DocumentTotalTextAsync()) is > 0 and var fromDoc) return fromDoc;
            await Task.Delay(500, ct);
        }
        var s = await PanelStateAsync(ct);
        if (Parse(Str(s, "doneTotal")) is > 0 and var fromPanel) return fromPanel;
        return Parse(Str(s, "doneLocal")) is > 0 and var local ? Math.Round(local * (1 + VatRate / 100m)) : null;
    }

    static string RestNote(decimal? closed, decimal? rest) => closed is null ? "" :
        $" Chek jami: {closed:N0} so'm." + (rest is > 0 ? $" Qolgan {rest:N0} so'm «Maqsad summa» ga yozildi — «▶ Avto boshlash» bosilsa yangi chekka teriladi." : "");

    bool sellingDoc;

    /// <summary>
    /// «📄 Ochiq 1C hujjatini E-POS orqali sotish»: 1C da ochiq turgan Реализация (dastur yaratmagan bo'lsa ham) o'qiladi —
    /// narx, QQS, jami, MXIK va har qatorning markirovka kodlari hujjatdan — va E-POS sotish oynasi ochiladi.
    /// </summary>
    async Task SellOpenDocumentAsync()
    {
        if (sellingDoc || oneC.Core is not { } core || baseEntry is null || getSoliqTab is null) return;
        sellingDoc = true;
        try
        {
            Status("Ochiq 1C hujjati o'qilmoqda (markirovka kodlari bilan)…");
            var reader = new UnmarkedRunner(core, new UnmarkedOptions(0, 1, 1, 0, "", false), (t, l) => Log.Write("Hujjat o'qish: " + t), CancellationToken.None);
            await reader.InitAsync();
            var open = await reader.ReadOpenDocumentAsync();
            if (open is null) { Status("1C da Реализация hujjati ochiq emas: sotiladigan hujjatni oching (tovarlar jadvali ko'rinib tursin).", "warn"); return; }
            if (open.Warning.Length > 0)
                MessageBox.Show(oneC.FindForm(), open.Warning + " E-POS oynasida tovarlar va kodlar sonini tekshiring.", AppInfo.DisplayName, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            Status($"1C hujjati № {open.Number}: {open.Receipt.Lines.Count} ta tovar, {open.Receipt.Lines.Sum(l => l.Codes.Count)} ta kod — E-POS oynasi ochildi." +
                   (open.Warning.Length > 0 ? " DIQQAT: " + open.Warning : ""), open.Warning.Length > 0 ? "warn" : "info");
            using var dialog = new SaleDialog(baseEntry, getSoliqTab, open.Receipt);
            await dialog.ShowAsync(); // modal emas: asosiy oynadagi my.soliq.uz tabiga o'tib kirish mumkin
            if (dialog.Result is { } sold) Status($"№ {open.Number} E-POS orqali sotildi: chek № {sold.ReceiptSeq}, fiskal belgi {sold.FiscalSign}.", "ok");
        }
        catch (Exception e) { Status("Hujjatni o'qib bo'lmadi: " + e.Message, "err", e.ToString()); }
        finally { sellingDoc = false; Push(); }
    }

    public void Dispose() => cts?.Cancel();
}
