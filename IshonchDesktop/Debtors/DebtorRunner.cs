using System.Globalization;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using IshonchDesktop.Unmarked;

namespace IshonchDesktop.Debtors;

/// <summary>
/// 1C «Оборотно-сальдовая ведомость» ni ochadi, har safar sozlamalarni o'zi to'g'rilaydi (saqlamaydi): 4010, 4310, 6010, 6310 hisoblari
/// kontragentlar bo'yicha guruhlanadi, davr qo'yiladi, hisobot shakllantiriladi va natija (moxel) qatorlari o'qiladi.
/// </summary>
public sealed class DebtorRunner
{
    const string ReportTitle = "Оборотно-сальдовая ведомость";
    readonly CoreWebView2 core;
    readonly Action<string, string> log;
    readonly CancellationToken ct;
    OneCDriver d = null!;

    public DebtorRunner(CoreWebView2 core, Action<string, string> log, CancellationToken ct)
    {
        this.core = core;
        this.log = log;
        this.ct = ct;
    }

    public async Task InitAsync()
    {
        d = new OneCDriver(core, ct) { Waiting = m => log(m, "warn") };
        await d.InitAsync();
    }

    sealed record TabInfo(string Text, bool Selected, Pt Pos, Pt? Close);

    async Task<List<TabInfo>> TabsAsync()
    {
        var e = await d.EvalAsync("window.__ish.openTabs()");
        var list = new List<TabInfo>();
        if (e.ValueKind != JsonValueKind.Array) return list;
        foreach (var t in e.EnumerateArray())
        {
            var p = t.GetProperty("pos");
            Pt? close = t.TryGetProperty("close", out var c) && c.ValueKind == JsonValueKind.Object
                ? new Pt(c.GetProperty("x").GetDouble(), c.GetProperty("y").GetDouble()) : null;
            list.Add(new TabInfo(t.GetProperty("text").GetString() ?? "", t.GetProperty("selected").GetBoolean(),
                new Pt(p.GetProperty("x").GetDouble(), p.GetProperty("y").GetDouble()), close));
        }
        return list;
    }

    async Task TypeSlowAsync(string text)
    {
        foreach (var ch in text)
        {
            await d.TypeAsync(ch.ToString());
            await d.DelayAsync(120);
        }
    }

    // ---- hisobotni ochish va sozlash -------------------------------------------------------------

    async Task OpenReportAsync()
    {
        if (await d.ModalTextAsync() is { } m) throw new OneCException("1C da ochiq oyna bor, avval uni yoping: " + m);
        var tab = (await TabsAsync()).FirstOrDefault(t => t.Text.StartsWith(ReportTitle));
        if (tab is null)
        {
            log("«Оборотно-сальдовая ведомость» ochilmoqda", "info");
            var lastClick = 0L;
            var link = await d.WaitAsync(async () =>
            {
                if (await d.PosLeafAsync(ReportTitle) is { } p) return p;
                if (d.Now - lastClick > 4000 && await d.ModalTextAsync() is null)
                {
                    lastClick = d.Now;
                    if (await d.PosSectionAsync("Отчеты") is { } sec) await d.ClickAsync(sec);
                }
                return (Pt?)null;
            }, 20000, "«Отчеты» → «Оборотно-сальдовая ведомость»", 250);
            await d.ClickAsync(link);
        }
        else if (!tab.Selected) await d.ClickAsync(tab.Pos);
        await d.WaitTrueAsync(async () => await d.HasAsync("_НачалоПериода_i0"), 40000, "hisobot oynasi");
        await d.DelayAsync(600);
    }

    async Task ShowSettingsAsync()
    {
        if (await d.HasAsync("_ПрименитьНастройки")) return;
        await d.ClickSuffixAsync("_ПоказатьНастройки", "Показать настройки");
        await d.WaitTrueAsync(async () => await d.HasAsync("_ПрименитьНастройки"), 20000, "sozlamalar paneli");
        await d.DelayAsync(500);
    }

    /// <summary>Guruhlash qatorlaridagi hisoblar (bo'sh qator — "").</summary>
    async Task<List<string>> GroupingAccountsAsync()
    {
        var g = await d.GridAsync("Группировка");
        if (g is null) return new();
        return g.Rows.Select(r => (g.Cell(r, "Счет")?.Text ?? "").Split(' ')[0].Trim()).ToList();
    }

    async Task PickAccountAsync(string acc)
    {
        await d.WaitTrueAsync(async () => await d.HasAsync("_ГруппировкаСчет_i0"), 10000, "hisob maydoni");
        await d.DelayAsync(600);
        await d.SelectAllAsync();
        await TypeSlowAsync(acc);
        var item = await d.WaitAsync(async () =>
        {
            var e = await d.EvalAsync("window.__ish.listItems()");
            if (e.ValueKind != JsonValueKind.Array) return (Pt?)null;
            foreach (var li in e.EnumerateArray())
                if (li.GetProperty("t").GetString() is { } t && t.StartsWith(acc + " ", StringComparison.Ordinal))
                    return new Pt(li.GetProperty("x").GetDouble(), li.GetProperty("y").GetDouble());
            return null;
        }, 12000, $"«{acc}» hisobi ro'yxatda");
        await d.ClickAsync(item);
        await d.DelayAsync(1500);
    }

    async Task EnsureGroupingAsync()
    {
        foreach (var acc in OsvParser.Accounts)
        {
            var accounts = await GroupingAccountsAsync();
            if (accounts.Contains(acc)) continue;
            var emptyIdx = accounts.IndexOf("");
            if (emptyIdx >= 0)
            {
                var g = (await d.GridAsync("Группировка"))!;
                var cell = g.Cell(g.Rows[emptyIdx], "Счет") ?? throw new OneCException("«Счет» ustuni topilmadi");
                await d.ClickAsync(cell.At, 2);
            }
            else
            {
                var before = accounts.Count;
                await d.ClickSuffixAsync("_ГруппировкаДобавить", "Добавить");
                await d.WaitTrueAsync(async () => (await GroupingAccountsAsync()).Count > before, 15000, "yangi guruhlash qatori");
                await d.DelayAsync(800);
            }
            await PickAccountAsync(acc);
            if (!(await GroupingAccountsAsync()).Contains(acc)) throw new OneCException($"«{acc}» hisobi guruhlashga qo'shilmadi (bu bazada bunday hisob bo'lmasligi mumkin)");
            log($"Guruhlash: {acc} qo'shildi", "info");
        }
    }

    async Task SetDateAsync(string suffix, DateOnly date)
    {
        var want = date.ToString("dd.MM.yyyy", CultureInfo.InvariantCulture);
        var digits = date.ToString("ddMMyyyy", CultureInfo.InvariantCulture);
        for (var attempt = 1; attempt <= 4; attempt++)
        {
            if ((await d.ValueAsync(suffix))?.Trim() == want) return;
            await d.ClickSuffixAsync(suffix, "Sana maydoni", "input");
            await d.DelayAsync(250);
            await d.SelectAllAsync();
            for (var i = 0; i < digits.Length; i += 2) { await d.TypeAsync(digits.Substring(i, 2)); await d.DelayAsync(100); }
            await d.DelayAsync(300);
            await d.KeyAsync("Tab");
            await d.DelayAsync(1200);
        }
        if ((await d.ValueAsync(suffix))?.Trim() != want) throw new OneCException($"Sana «{want}» yozilmadi (1C: «{await d.ValueAsync(suffix)}»)");
    }

    // ---- natijani o'qish -------------------------------------------------------------------------

    const string ReadRowsJs = """
        (() => {
          const mx = [...document.querySelectorAll('div[id^="moxelform"][id$="_Результат"]')].filter(e => e.offsetParent && e.getBoundingClientRect().x >= 0 && e.getBoundingClientRect().x < innerWidth)[0];
          const box = [...document.querySelectorAll('div.moxelContainer')].filter(e => e.offsetParent).pop() || mx;
          const f = mx && mx.querySelector('iframe'); const doc = f && f.contentDocument; const w = f && f.contentWindow;
          if (!doc) return null;
          const b = box.getBoundingClientRect();
          const rows = [...doc.querySelectorAll('div[y]')].map(r => {
            const cells = {}; let pad = 0;
            r.querySelectorAll('div[x]').forEach(c => { const t = c.textContent.trim(); if (!t) return; cells[c.getAttribute('x')] = t;
              if (c.getAttribute('x') === '0') pad = parseInt(w.getComputedStyle(c).paddingLeft) || 0; });
            return { y: +r.getAttribute('y'), pad, cells };
          }).filter(r => Object.keys(r.cells).length);
          return { cx: Math.round(b.x + b.width / 2), cy: Math.round(b.y + b.height / 2), top: (doc.body.firstChild && doc.body.firstChild.firstChild ? doc.body.firstChild.firstChild.style.top : '') + '|' + (doc.body.firstChild && doc.body.firstChild.firstChild ? doc.body.firstChild.firstChild.style.height : ''), rows };
        })()
        """;

    sealed record Snapshot(double Cx, double Cy, string Top, List<OsvRow> Rows);

    async Task<Snapshot?> SnapshotAsync()
    {
        var e = await d.EvalAsync(ReadRowsJs);
        if (e.ValueKind != JsonValueKind.Object) return null;
        var rows = new List<OsvRow>();
        foreach (var r in e.GetProperty("rows").EnumerateArray())
        {
            var cells = new Dictionary<int, string>();
            foreach (var c in r.GetProperty("cells").EnumerateObject()) cells[int.Parse(c.Name)] = c.Value.GetString() ?? "";
            rows.Add(new OsvRow(r.GetProperty("y").GetInt32(), r.GetProperty("pad").GetInt32(), cells));
        }
        return new Snapshot(e.GetProperty("cx").GetDouble(), e.GetProperty("cy").GetDouble(), e.GetProperty("top").GetString() ?? "", rows);
    }

    static string Sig(Snapshot? s) => s is null ? "" : s.Rows.Count + ":" + s.Rows.FirstOrDefault()?.Y + "-" + s.Rows.LastOrDefault()?.Y + ":" + s.Rows.FirstOrDefault()?.Name;

    /// <summary>
    /// 1C hisobotni faqat ko'rinib turgan qismigina chizadi. Shuning uchun oyna balandligi vaqtincha juda katta qilinadi
    /// (DevTools emulyatsiyasi) — hamma qator bir yo'la chiziladi; qatorlar soni o'zgarmay qolguncha balandlik oshiriladi.
    /// </summary>
    async Task<List<OsvRow>> ReadAllRowsAsync()
    {
        var width = (int)(await d.EvalAsync("innerWidth")).GetDouble();
        var rows = new List<OsvRow>();
        var prev = -1;
        try
        {
            foreach (var height in new[] { 12000, 24000, 48000 })
            {
                await core.CallDevToolsProtocolMethodAsync("Emulation.setDeviceMetricsOverride",
                    JsonSerializer.Serialize(new { width, height, deviceScaleFactor = 1, mobile = false }));
                var count = -1;
                var stable = 0;
                var until = d.Now + 90000;
                while (stable < 2 && d.Now < until)
                {
                    await d.DelayAsync(1500);
                    var s = await SnapshotAsync();
                    if (s is { Rows.Count: > 0 } && s.Rows.Count == count) stable++;
                    else { stable = 0; count = s?.Rows.Count ?? -1; if (s is { Rows.Count: > 0 }) rows = s.Rows; }
                }
                log($"Hisobot o'qilmoqda: {rows.Count} qator", "info");
                if (rows.Count == prev) break;
                prev = rows.Count;
            }
        }
        finally
        {
            try { await core.CallDevToolsProtocolMethodAsync("Emulation.clearDeviceMetricsOverride", "{}"); } catch { /* sahifa yopilgan */ }
        }
        return rows.OrderBy(r => r.Y).ToList();
    }

    // ---- asosiy -----------------------------------------------------------------------------------

    /// <summary>Davr bo'yicha hisobotni sozlab shakllantiradi va kontragentlar qoldig'ini qaytaradi.</summary>
    public async Task<List<PartyBalance>> RunAsync(DateOnly from, DateOnly to)
    {
        await OpenReportAsync();
        await ShowSettingsAsync();
        await EnsureGroupingAsync();
        await SetDateAsync("_НачалоПериода_i0", from);
        await SetDateAsync("_КонецПериода_i0", to);
        log($"Hisobot shakllantirilmoqda ({from:dd.MM.yyyy} – {to:dd.MM.yyyy})", "info");
        await d.ClickSuffixAsync("_ПрименитьНастройки", "Сформировать");
        // Shakllanish tugashini kutamiz: natija paydo bo'ladi va barqaror bo'ladi
        await d.DelayAsync(3000);
        string prev = "";
        var stable = 0;
        await d.WaitTrueAsync(async () =>
        {
            var s = await SnapshotAsync();
            var sig = Sig(s);
            if (s is { Rows.Count: > 0 } && sig == prev) stable++; else { stable = 0; prev = sig; }
            return stable >= 3;
        }, 240000, "hisobot shakllanishi", 700);
        var rows = await ReadAllRowsAsync();
        log($"Hisobotdan {rows.Count} qator o'qildi", "info");
        var parties = OsvParser.Parse(rows);
        log($"Kontragentlar: {parties.Count} ta", "ok");
        return parties;
    }
}
