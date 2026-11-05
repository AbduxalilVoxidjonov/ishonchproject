using System.Globalization;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using IshonchDesktop.Unmarked;

namespace IshonchDesktop.Doverennost;

public enum CreateOutcome { Created, CounterpartyNotFound }

/// <summary>
/// 1C «Покупки → Доверенности» ro'yxatini o'qiydi va yangi dovernislarni yaratadi: oxirgi hujjatdan nusxa (F9),
/// raqam, sana, kontragent, tovar nomi, miqdor (= summa) yoziladi va «Записать» bosiladi (provesti qilinmaydi).
/// </summary>
public sealed class DoverennostRunner
{
    const string ListTitle = "Доверенности";
    readonly CoreWebView2 core;
    readonly Action<string, string> log;
    readonly CancellationToken ct;
    OneCDriver d = null!;

    public DoverennostRunner(CoreWebView2 core, Action<string, string> log, CancellationToken ct)
    {
        this.core = core;
        this.log = log;
        this.ct = ct;
    }

    static readonly System.Runtime.CompilerServices.ConditionalWeakTable<CoreWebView2, object> DialogHooked = new();

    /// <summary>
    /// «Номер заполняется при записи автоматически. Продолжить редактирование?» — bu 1C ning emas, brauzerning o'z oynasi
    /// (JavaScript confirm), shuning uchun DOM orqali ko'rinmaydi: shu savolga «OK» deb javob beriladi (nomer qo'lda yoziladi).
    /// </summary>
    static void HookNumberPrompt(CoreWebView2 core)
    {
        if (DialogHooked.TryGetValue(core, out _)) return;
        DialogHooked.Add(core, new object());
        core.ScriptDialogOpening += (_, e) =>
        {
            if (e.Kind == CoreWebView2ScriptDialogKind.Confirm && e.Message.Contains("Номер заполняется", StringComparison.OrdinalIgnoreCase))
                e.Accept();
        };
    }

    public async Task InitAsync()
    {
        HookNumberPrompt(core);
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

    async Task WaitNoModalAsync()
    {
        if (await d.ModalTextAsync() is { } text)
            throw new OneCException("1C da ochiq oyna bor, avval uni yoping: " + text);
    }

    // ---- ro'yxat ---------------------------------------------------------------------------------

    /// <summary>«Доверенности» ro'yxatini oldinga chiqaradi (kerak bo'lsa bo'limdan ochadi).</summary>
    async Task OpenListAsync()
    {
        await WaitNoModalAsync();
        var list = (await TabsAsync()).FirstOrDefault(t => t.Text.StartsWith(ListTitle));
        if (list is null)
        {
            log("«Доверенности» ro'yxati ochilmoqda", "info");
            var lastClick = 0L;
            var item = await d.WaitAsync(async () =>
            {
                if (await d.PosLeafAsync(ListTitle) is { } p) return p;
                if (d.Now - lastClick > 4000 && await d.ModalTextAsync() is null)
                {
                    lastClick = d.Now;
                    if (await d.PosSectionAsync("Покупки") is { } sec) await d.ClickAsync(sec);
                }
                return (Pt?)null;
            }, 20000, "«Покупки» → «Доверенности»", 200);
            await d.ClickAsync(item);
        }
        else if (!list.Selected)
        {
            await d.ClickAsync(list.Pos);
        }
        await d.WaitTrueAsync(async () => (await TabsAsync()).Any(t => t.Text.StartsWith(ListTitle) && t.Selected) && await d.GridAsync("Список") is { Rows.Count: > 0 }, 30000, "Доверенности ro'yxati");
        await d.DelayAsync(500);
    }

    /// <summary>Ro'yxatdagi hamma hujjatlarning raqami, sanasi va kontragentini o'qiydi (pastga surib).</summary>
    public async Task<List<ExistingDoc>> ReadExistingAsync()
    {
        await OpenListAsync();
        var seen = new List<ExistingDoc>();
        var keys = new HashSet<string>();
        var g = await d.GridAsync("Список") ?? throw new OneCException("Доверенности jadvali topilmadi");
        await d.ClickAsync(g.Rows[0].Cells.Values.First().At);
        await d.KeyAsync("Home", 2); // Ctrl+Home
        await d.DelayAsync(400);
        for (var page = 0; page < 400; page++)
        {
            g = await d.GridAsync("Список") ?? throw new OneCException("Доверенности jadvali topilmadi");
            var added = 0;
            foreach (var r in g.Rows)
            {
                var number = g.Cell(r, "Номер")?.Text ?? "";
                var date = BankStatement.ParseDate(g.Cell(r, "Дата")?.Text);
                var party = g.Cell(r, "Контрагент")?.Text ?? "";
                if (number.Length == 0 || date is null) continue;
                if (keys.Add(number + "|" + date + "|" + party)) { seen.Add(new ExistingDoc(number, date.Value, party)); added++; }
            }
            if (added == 0) break;
            if (!await d.ScrollRowsAsync("Список", g, Math.Max(1, g.Rows.Count - 1))) break;
        }
        log($"Ro'yxatdan {seen.Count} ta mavjud dovernis o'qildi", "info");
        return seen;
    }

    /// <summary>
    /// Berilgan dovernislarni (raqam + sana) 1C ro'yxatida belgilaydi: birinchisi oddiy bosish, qolganlari Ctrl+bosish.
    /// Ro'yxat tepadan pastga o'qiladi (belgilash surishda saqlanadi). Belgilanganlar soni qaytariladi.
    /// </summary>
    public async Task<int> SelectAsync(IReadOnlyCollection<(string Number, DateOnly Date)> wanted)
    {
        if (wanted.Count == 0) return 0;
        await OpenListAsync();
        var left = wanted.ToHashSet();
        var marked = 0;
        var g = await d.GridAsync("Список") ?? throw new OneCException("Доверенности jadvali topilmadi");
        await d.ClickAsync(g.Rows[0].Cells.Values.First().At);
        await d.KeyAsync("Home", 2);
        await d.DelayAsync(400);
        var seenPages = new HashSet<string>();
        for (var page = 0; page < 400 && left.Count > 0; page++)
        {
            g = await d.GridAsync("Список") ?? throw new OneCException("Доверенности jadvali topilmadi");
            var sig = string.Join("|", g.Rows.Select(r => g.Cell(r, "Номер")?.Text));
            if (!seenPages.Add(sig)) break;
            foreach (var r in g.Rows)
            {
                var number = g.Cell(r, "Номер")?.Text ?? "";
                var date = BankStatement.ParseDate(g.Cell(r, "Дата")?.Text);
                if (date is null || !left.Contains((number, date.Value))) continue;
                var at = g.Cell(r, "Номер")!.Value.At;
                await d.ClickAsync(at, 1, marked == 0 ? 0 : 2); // Ctrl
                await d.DelayAsync(150);
                left.Remove((number, date.Value));
                marked++;
            }
            if (left.Count == 0) break;
            if (!await d.ScrollRowsAsync("Список", g, Math.Max(1, g.Rows.Count - 1))) break;
        }
        if (left.Count > 0) log("Ro'yxatda topilmadi: " + string.Join(", ", left.Select(x => $"№{x.Number} ({x.Date:dd.MM.yyyy})")), "warn");
        log($"1C ro'yxatida {marked} ta dovernis belgilandi — ЭДО tugmasi orqali yuborishingiz mumkin", "ok");
        return marked;
    }

    // ---- yaratish --------------------------------------------------------------------------------

    /// <summary>Bitta dovernis: oxirgi hujjatdan F9 nusxa, maydonlar, «Записать». Kontragent topilmasa saqlamasdan yopadi.</summary>
    public async Task<CreateOutcome> CreateAsync(PlanItem p)
    {
        await OpenListAsync();
        var g = await d.GridAsync("Список") ?? throw new OneCException("Доверенности jadvali topilmadi");
        await d.ClickAsync(g.Rows[0].Cells.Values.First().At);
        await d.KeyAsync("End", 2); // Ctrl+End — eng oxirgi hujjat
        await d.DelayAsync(600);
        var before = (await TabsAsync()).Count;
        await d.KeyAsync("F9");
        await d.WaitTrueAsync(async () => await d.HasAsync("_ДатаДействия_i0") && (await TabsAsync()).Count > before, 40000, "nusxa formasi");
        await d.DelayAsync(500);

        try
        {
            await SetTextAsync("_Номер_i0", p.Number, "Номер");
            await SetDateAsync(new DateTime(p.Date.Year, p.Date.Month, p.Date.Day, 12, 0, 0));
            if (!await SetCounterpartyAsync(p.Counterparty))
            {
                log($"«{p.Counterparty}» 1C da topilmadi — o'tkazib yuborildi", "warn");
                await DiscardAsync();
                return CreateOutcome.CounterpartyNotFound;
            }
            await SetContractAsync(p.Contract);
            await SetGoodsAsync(p.GoodsName, p.Amount);
            await SaveAsync(p.Number);
            await CloseFormAsync();
            log($"№{p.Number} — {p.Date:dd.MM.yyyy} — {p.Counterparty} — {p.Amount:N0} yaratildi", "info");
            return CreateOutcome.Created;
        }
        catch
        {
            try { await DiscardAsync(); } catch { /* asosiy xato muhimroq */ }
            throw;
        }
    }

    async Task SetTextAsync(string suffix, string text, string what)
    {
        for (var attempt = 1; attempt <= 3; attempt++)
        {
            await d.ClickSuffixAsync(suffix, what, "input");
            await d.DelayAsync(150);
            await d.SelectAllAsync();
            await d.TypeAsync(text);
            await d.KeyAsync("Tab");
            await d.DelayAsync(400);
            await AnswerEditNumberAsync();
            if ((await d.ValueAsync(suffix))?.Trim() == text) return;
        }
        throw new OneCException($"«{what}» maydoniga «{text}» yozilmadi (1C: «{await d.ValueAsync(suffix)}»)");
    }

    /// <summary>1C raqamni o'zgartirishni tasdiqlashni so'rasa — «Да».</summary>
    async Task AnswerEditNumberAsync()
    {
        var until = d.Now + 1500;
        while (d.Now < until)
        {
            if (await d.ModalTextAsync() is { } q)
            {
                // «Номер заполняется при записи автоматически. Продолжить редактирование?» — «ОК»; boshqa so'rovlarda «Да»
                var yes = q.Contains("Номер заполняется", StringComparison.OrdinalIgnoreCase)
                    ? await d.ModalButtonAsync("ОК") ?? await d.ModalButtonAsync("OK")
                    : await d.ModalButtonAsync("Да");
                if (yes is { } yesPt) { await d.ClickAsync(yesPt); await d.DelayAsync(300); return; }
                throw new OneCException("1C kutilmagan oyna ko'rsatdi: " + q);
            }
            await d.DelayAsync(150);
        }
    }

    async Task SetDateAsync(DateTime when)
    {
        var digits = when.ToString("ddMMyyyyHHmmss", CultureInfo.InvariantCulture);
        bool Same(string? v) => UnmarkedOptions.ParseOneCDate(v) == when;
        for (var attempt = 1; attempt <= 4; attempt++)
        {
            if (Same(await d.ValueAsync("_Дата_i0"))) return;
            await d.ClickSuffixAsync("_Дата_i0", "Sana maydoni", "input");
            await d.DelayAsync(200);
            await d.SelectAllAsync();
            for (var i = 0; i < digits.Length; i += 2)
            {
                await d.TypeAsync(digits.Substring(i, Math.Min(2, digits.Length - i)));
                await d.DelayAsync(80);
            }
            await d.DelayAsync(300);
            await d.KeyAsync("Tab");
            await d.DelayAsync(600);
            await AnswerEditNumberAsync();
            await d.DelayAsync(200);
            if (Same(await d.ValueAsync("_Дата_i0"))) return;
        }
        throw new OneCException($"Sanani «{when:dd.MM.yyyy HH:mm:ss}» qilib bo'lmadi (1C: «{await d.ValueAsync("_Дата_i0")}»)");
    }

    static string Norm(string? s) => DoverennostPlanner.NormParty(s ?? "");

    /// <summary>Kontragentni yozib, ochilgan ro'yxatdan mosini tanlaydi. Topilmasa false (maydon o'zgarmagan holatda qoladi).</summary>
    async Task<bool> SetCounterpartyAsync(string name)
    {
        var want = Norm(name);
        if (Norm(await d.ValueAsync("_Контрагент_i0")) == want) return true;
        await d.ClickSuffixAsync("_Контрагент_i0", "Контрагент maydoni", "input");
        await d.DelayAsync(150);
        await d.SelectAllAsync();
        // Qo'shtirnoq va apostrof qidiruvga xalaqit bermasin: nomning eng uzun so'zlaridan boshlanadi
        var query = string.Join(' ', name.Replace("\"", " ").Replace("`", "'").Split(' ', StringSplitOptions.RemoveEmptyEntries).Take(4));
        await d.TypeAsync(query);
        Pt? item = null;
        var until = d.Now + 6000;
        while (item is null && d.Now < until)
        {
            await d.DelayAsync(300);
            var e = await d.EvalAsync("window.__ish.listItems()");
            if (e.ValueKind != JsonValueKind.Array) continue;
            foreach (var li in e.EnumerateArray())
                if (Norm(li.GetProperty("t").GetString()) == want)
                    item = new Pt(li.GetProperty("x").GetDouble(), li.GetProperty("y").GetDouble());
        }
        if (item is { } it)
        {
            await d.ClickAsync(it);
            await d.DelayAsync(600);
            if (Norm(await d.ValueAsync("_Контрагент_i0")) == want) return true;
        }
        await d.KeyAsync("Escape");
        return false;
    }

    /// <summary>
    /// Договор: shartnoma raqami bo'yicha qidiriladi; topilmasa 1C o'zi qo'ygan (odatda «Основной договор») qoladi.
    /// </summary>
    async Task SetContractAsync(string number)
    {
        const string field = "_ДоговорКонтрагента_i0";
        var current = (await d.ValueAsync(field))?.Trim() ?? "";
        if (number.Length == 0) return;
        var want = Norm(number);
        if (Norm(current).Contains(want)) return;
        await d.ClickSuffixAsync(field, "Договор maydoni", "input");
        await d.DelayAsync(150);
        await d.SelectAllAsync();
        await d.TypeAsync(number);
        Pt? item = null;
        var until = d.Now + 5000;
        while (item is null && d.Now < until)
        {
            await d.DelayAsync(300);
            var e = await d.EvalAsync("window.__ish.listItems()");
            if (e.ValueKind != JsonValueKind.Array) continue;
            foreach (var li in e.EnumerateArray())
                if (Norm(li.GetProperty("t").GetString()).Contains(want))
                    item = new Pt(li.GetProperty("x").GetDouble(), li.GetProperty("y").GetDouble());
        }
        if (item is { } it)
        {
            await d.ClickAsync(it);
            await d.DelayAsync(600);
            if (Norm(await d.ValueAsync(field)).Contains(want)) { log($"Договор: {await d.ValueAsync(field)}", "info"); return; }
        }
        // Topilmadi: oldingi qiymatga (Основной договор) qaytamiz
        await d.KeyAsync("Escape");
        await d.SelectAllAsync();
        await d.TypeAsync(current.Length > 0 ? current : "Основной договор");
        await d.KeyAsync("Tab");
        await d.DelayAsync(500);
        log($"Договор №{number} topilmadi — «{await d.ValueAsync(field)}» qoldi", "warn");
    }

    async Task SetGoodsAsync(string goodsName, decimal amount)
    {
        var g = await d.GridAsync("Товары") ?? throw new OneCException("Товары jadvali topilmadi");
        var row = g.Rows.FirstOrDefault() ?? throw new OneCException("Товары jadvalida qator yo'q");
        var nameCell = g.Cell(row, "Наименование товара") ?? throw new OneCException("«Наименование товара» ustuni topilmadi");
        await d.ClickAsync(nameCell.At, 2);
        await d.DelayAsync(300);
        await d.SelectAllAsync();
        await d.TypeAsync(goodsName);
        await d.KeyAsync("Tab");
        await d.DelayAsync(400);

        g = await d.GridAsync("Товары") ?? throw new OneCException("Товары jadvali topilmadi");
        var qty = g.Cell(g.Rows[0], "Количество") ?? throw new OneCException("«Количество» ustuni topilmadi");
        await d.ClickAsync(qty.At, 2);
        await d.DelayAsync(300);
        await d.SelectAllAsync();
        await d.TypeAsync(amount.ToString("0.##", CultureInfo.GetCultureInfo("ru-RU")));
        await d.KeyAsync("Enter");
        await d.DelayAsync(500);

        g = await d.GridAsync("Товары") ?? throw new OneCException("Товары jadvali topilmadi");
        var got = OneCDriver.ParseNumber(g.Cell(g.Rows[0], "Количество")?.Text);
        if (got != amount) throw new OneCException($"Miqdor {amount:N0} bo'lmadi (1C: {g.Cell(g.Rows[0], "Количество")?.Text})");
        var nameNow = g.Cell(g.Rows[0], "Наименование товара")?.Text ?? "";
        if (!nameNow.StartsWith(goodsName.Length > 20 ? goodsName[..20] : goodsName, StringComparison.Ordinal))
            throw new OneCException($"Tovar nomi yozilmadi (1C: «{nameNow}»)");
    }

    async Task SaveAsync(string number)
    {
        await d.ClickSuffixAsync("_ФормаЗаписать", "Записать");
        var until = d.Now + 60000;
        while (d.Now < until)
        {
            await d.DelayAsync(300);
            if (await d.ModalTextAsync() is { } q)
            {
                var ok = await d.ModalButtonAsync("ОК") ?? await d.ModalButtonAsync("OK");
                if (ok is { } okPt) await d.ClickAsync(okPt);
                throw new OneCException("1C saqlashda xato berdi: " + q);
            }
            var tabs = await TabsAsync();
            // Saqlangach tab nomi «Доверенность <raqam> от …» bo'ladi («(создание)» yo'qoladi)
            if (tabs.Any(t => t.Selected && !t.Text.Contains("создание") && t.Text.StartsWith("Доверенность"))) return;
        }
        throw new OneCException($"№{number} saqlanmadi (vaqt tugadi)");
    }

    async Task CloseFormAsync()
    {
        var tabs = await TabsAsync();
        var active = tabs.FirstOrDefault(t => t.Selected && t.Text.StartsWith("Доверенность") && t.Close is not null);
        if (active?.Close is not { } close) return;
        await d.ClickAsync(close);
        await d.DelayAsync(400);
        if (await d.ModalButtonAsync("Нет") is { } no) { await d.ClickAsync(no); await d.DelayAsync(300); }
    }

    /// <summary>Saqlanmagan hujjatni yopadi.</summary>
    async Task DiscardAsync()
    {
        var tabs = await TabsAsync();
        var active = tabs.FirstOrDefault(t => t.Selected && t.Text.StartsWith("Доверенность") && t.Close is not null);
        if (active?.Close is not { } close) return;
        await d.ClickAsync(close);
        await d.DelayAsync(400);
        if (await d.ModalButtonAsync("Нет") is { } no) { await d.ClickAsync(no); await d.DelayAsync(300); }
    }
}
