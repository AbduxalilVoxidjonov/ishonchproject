using System.Globalization;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;

namespace IshonchDesktop.Unmarked;

/// <param name="Target">Bitta chek summasi (Всего, NDS bilan) — umumiy summa / cheklar soni.</param>
/// <param name="Count">Cheklar soni.</param>
/// <param name="Lines">Har chekdagi tovar qatorlari soni (jadvalning tepasidan olinadi).</param>
public sealed record UnmarkedOptions(decimal Target, int Count, int Lines, decimal Percent, string Warehouse, bool Post, decimal VatRate = 12m)
{
    /// <summary>Boshlashdan oldin «Инвентаризация товаров» ni sklad qoldig'i bo'yicha (bir marta) yangilash.</summary>
    public bool RefreshInventory { get; init; } = true;

    /// <summary>Oldingi ishga tushirishda yaratilgan inventarizatsiya raqami (shu hujjat qayta to'ldiriladi, yangisi yaratilmaydi).</summary>
    public string? InventoryNumber { get; init; }

    /// <summary>Cheklar summasi o'rtachadan qancha farq qilishi mumkin (0,25 = ±25%); 0 — hammasi teng.</summary>
    public decimal Variation { get; init; } = 0.25m;

    /// <summary>Bitta chekda bir tovardan ko'pi bilan necha dona (0 — cheklovsiz).</summary>
    public int MaxPerItem { get; init; }
}

public sealed record RunSummary(int Created, int Requested, decimal Sum, bool Stopped, string? Error);

/// <summary>
/// «Markirovkasiz sotish»: 1C da Реализация товаров (накладная) hujjatlarini ketma-ket yaratadi.
/// Boshida (bir marta): inventarizatsiya sklad qoldig'i bo'yicha yangilanadi, tovarlar (nomi, qoldig'i, narxi) o'qiladi va
/// hamma cheklar uchun reja tuziladi (umumiy summa cheklarga bo'linadi, tepadan N ta qatordan, qoldiqdan oshmasdan).
/// Har chek: «Изменить» → «Добавить из документа» → Без НДС → foiz → NDS 12% → rejadagi qatorlar qoldiriladi
/// (qolgani bloklab o'chiriladi) → miqdorlar → «Перенести» → provesti. 1C «Остаток: N» desa, reja qayta tuziladi.
/// </summary>
public sealed class UnmarkedRunner
{
    const string TargetListTitle = "Реализация (акты, накладные)";
    const string InventoryType = "Инвентаризация товаров";
    const int MaxAttempts = 3;

    readonly CoreWebView2 core;
    readonly UnmarkedOptions opt;
    readonly Action<string, string> log;
    readonly CancellationToken ct;
    OneCDriver d = null!;

    string docPrefix = "";
    string editPrefix = "";
    /// <summary>Shu jarayonda yangilangan inventarizatsiya raqami.</summary>
    string? invNumber;

    /// <summary>Yangilangan inventarizatsiya raqami — keyingi safar ham shu hujjat ishlatilishi uchun saqlanadi.</summary>
    public string? InventoryNumber => invNumber;

    /// <summary>Inventarizatsiyadagi hamma tovarlar (narx — foiz qo'shilgandan keyin), bir marta o'qiladi.</summary>
    List<Row>? full;
    /// <summary>Hozir «Изменение таблицы товаров» jadvalidagi qatorlar (o'chirilganlari chiqariladi).</summary>
    List<Row> table = new();
    /// <summary>Cheklar rejasi: har chek uchun qatorlar (full dagi indeks) va miqdorlar.</summary>
    readonly List<(List<int> Idx, ReceiptPlan Plan)> plans = new();
    /// <summary>Provesti qilingan cheklarda sotilgan miqdor (full indeksi bo'yicha).</summary>
    readonly Dictionary<int, decimal> used = new();
    /// <summary>1C «Остаток» xatosidan bilingan haqiqiy qoldiq.</summary>
    readonly Dictionary<int, decimal> stockCap = new();

    public UnmarkedRunner(CoreWebView2 core, UnmarkedOptions opt, Action<string, string> log, CancellationToken ct)
    {
        this.core = core;
        this.opt = opt;
        this.log = log;
        this.ct = ct;
        invNumber = opt.InventoryNumber;
    }

    static string Fmt(decimal v) => v.ToString("N2", CultureInfo.GetCultureInfo("ru-RU"));
    decimal Unit(int i) => full![i].Price * (1 + opt.VatRate / 100m);

    decimal Left(int i)
    {
        var left = full![i].Qty - used.GetValueOrDefault(i);
        if (stockCap.TryGetValue(i, out var cap)) left = Math.Min(left, cap);
        return Math.Max(0, Math.Floor(left));
    }

    /// <summary>`from`-chekdan boshlab qolgan cheklar rejasini tuzadi (tepadan N ta qoldig'i bor qator, summaga moslab).</summary>
    /// <summary>Har chekning maqsad summasi (umumiy summa har xil bo'lib taqsimlangan), bir marta hisoblanadi.</summary>
    List<decimal>? targets;

    void PlanFrom(int from)
    {
        targets ??= Planner.SplitTotal(opt.Target * opt.Count, opt.Count, opt.Variation, new Random());
        if (plans.Count > from) plans.RemoveRange(from, plans.Count - from);
        var left = Enumerable.Range(0, full!.Count).ToDictionary(i => i, Left);
        // Har chek oldingisidan keyingi qatordan boshlab oladi (har xil tovarlar); oxiriga yetsa — yana tepadan
        var start = from > 0 && plans.Count >= from ? (plans[from - 1].Idx.Max() + 1) % full.Count : 0;
        for (var k = from; k < opt.Count; k++)
        {
            var idx = new List<int>();
            for (var step = 0; step < full.Count && idx.Count < Math.Max(1, opt.Lines); step++)
            {
                var i = (start + step) % full.Count;
                if (left[i] >= 1) idx.Add(i);
            }
            idx.Sort(); // jadval tartibida (o'chirish shunga tayanadi)
            var plan = Planner.Distribute(idx.Select((i, j) => new StockItem(j, full[i].Name, opt.MaxPerItem > 0 ? Math.Min(left[i], opt.MaxPerItem) : left[i], Unit(i))).ToList(), targets[k]);
            if (plan.Lines.Count == 0) break; // qoldiq tugadi
            var chosen = plan.Lines.Select(l => idx[l.Index]).ToList();
            for (var j = 0; j < chosen.Count; j++) left[chosen[j]] -= plan.Lines[j].Qty;
            plans.Add((chosen, new ReceiptPlan(plan.Lines.Select((l, j) => new PlanLine(j, l.Qty)).ToList(), plan.Total)));
            start = (chosen.Max() + 1) % full.Count;
        }
    }

    public async Task<RunSummary> RunAsync()
    {
        var created = 0;
        decimal sum = 0;
        try
        {
            d = new OneCDriver(core, ct) { Waiting = m => log(m, "warn") };
            await d.InitAsync();

            // Boshida bir marta: inventarizatsiya sklad qoldig'i bo'yicha yangilanadi
            if (opt.RefreshInventory && !string.IsNullOrWhiteSpace(opt.Warehouse))
                await RefreshInventoryAsync();

            for (var k = 0; k < opt.Count; k++)
            {
                log($"— {k + 1}/{opt.Count}-chek —", "head");
                var posted = false;
                for (var attempt = 1; attempt <= MaxAttempts && !posted; attempt++)
                {
                    if (attempt > 1) log($"{attempt}-urinish (qoldiq hisobga olinib qayta quriladi)", "warn");
                    await CreateDocumentAsync();
                    await SetWarehouseAsync();
                    await OpenEditFormAsync();
                    await LoadInventoryAsync();
                    await ApplyPricingAsync();

                    if (full is null)
                    {
                        // Bir marta: hamma tovarlar o'qiladi va hamma cheklar rejasi tuziladi
                        full = await ReadAllAsync();
                        PlanFrom(0);
                        var qty = plans.Sum(p => p.Plan.Lines.Sum(l => l.Qty));
                        log($"Reja: {plans.Count} ta chek ({string.Join("; ", plans.Select(p => Fmt(p.Plan.Total)))}), jami {qty:N0} dona, ≈{Fmt(plans.Sum(p => p.Plan.Total))}", "info");
                        if (plans.Count < opt.Count) log($"Diqqat: qoldiq faqat {plans.Count} ta chekka yetadi.", "warn");
                    }
                    else await VerifyTableAsync();

                    if (k >= plans.Count)
                    {
                        log("Sotish uchun qoldiq tugadi — keyingi chek yaratilmaydi.", "warn");
                        await CancelEditFormAsync();
                        await DiscardDocumentAsync();
                        return new RunSummary(created, opt.Count, sum, false, null);
                    }
                    var (idx, plan) = plans[k];
                    table = full.ToList();
                    await KeepOnlyAsync(idx);
                    var kept = idx.Select(i => full[i]).ToList();
                    await WriteQuantitiesAsync(kept, plan);
                    var total = await TotalTextAsync();
                    log($"{kept.Count} ta tovar, jami {total} so'm (maqsad ≈{Fmt(targets![k])})", "info");
                    await TransferAsync();

                    if (!opt.Post)
                    {
                        log("Hujjat to'ldirildi va provesti QILINMADI (sinov rejimi). O'zingiz tekshirib provesti qiling.", "ok");
                        return new RunSummary(created, opt.Count, sum, true, null);
                    }

                    // Hujjatdagi qatorlar (rejadagi tartibda); qoldiq yetmagan qatorlar o'chirilsa shu ro'yxatdan ham chiqariladi
                    var docRows = Enumerable.Range(0, idx.Count).ToList();
                    var result = await PostAsync();
                    for (var round = 0; !result.Ok && round < 3; round++)
                    {
                        // Qoldiq yetmadi (1C «Остаток: N»): o'sha qatorlar hujjatdan o'chiriladi va qolgani bilan qayta provesti qilinadi
                        var bad = new List<int>();
                        foreach (var msg in result.Messages)
                        {
                            if (Planner.ParseStockError(msg) is not { } e || e.Row < 1 || e.Row > docRows.Count || bad.Contains(e.Row)) continue;
                            var j = docRows[e.Row - 1];
                            log($"«{full[idx[j]].Name}»: omborda {e.Stock} ta, chekda {plan.Lines[j].Qty} ta — qator chekdan o'chiriladi", "warn");
                            stockCap[idx[j]] = used.GetValueOrDefault(idx[j]) + e.Stock;
                            bad.Add(e.Row);
                        }
                        if (bad.Count == 0 || bad.Count >= docRows.Count) break;
                        if (!await RemoveDocRowsAsync(bad)) break;
                        foreach (var r in bad.OrderByDescending(x => x)) docRows.RemoveAt(r - 1);
                        result = await PostAsync();
                    }
                    if (result.Ok)
                    {
                        posted = true;
                        created++;
                        var realTotal = docRows.Sum(j => plan.Lines[j].Qty * Unit(idx[j]));
                        sum += realTotal;
                        foreach (var j in docRows) used[idx[j]] = used.GetValueOrDefault(idx[j]) + plan.Lines[j].Qty;
                        log($"{k + 1}-chek provesti qilindi ✓ ({docRows.Count} ta tovar, ≈{Fmt(realTotal)} so'm)", "ok");
                        if (docRows.Count < idx.Count) PlanFrom(k + 1); // o'chirilgan qatorlar qoldig'i bilan keyingilar qayta rejalanadi
                        break;
                    }

                    // Qatorni o'chirib ham bo'lmadi — hujjat saqlanmasdan yopiladi va reja qayta tuziladi
                    var fixedAny = false;
                    foreach (var msg in result.Messages)
                        if (Planner.ParseStockError(msg) is { } e && e.Row >= 1 && e.Row <= docRows.Count)
                        {
                            stockCap[idx[docRows[e.Row - 1]]] = used.GetValueOrDefault(idx[docRows[e.Row - 1]]) + e.Stock;
                            fixedAny = true;
                        }
                    await DiscardDocumentAsync();
                    if (!fixedAny)
                        throw new OneCException("Hujjatni provesti qilib bo'lmadi: " + string.Join(" | ", result.Messages.Take(3)));
                    PlanFrom(k);
                }
                if (!posted) throw new OneCException($"{k + 1}-chekni {MaxAttempts} urinishda ham provesti qilib bo'lmadi (qoldiq yetishmaydi).");
            }
            log($"Tugadi: {created} ta chek, jami ≈ {Fmt(sum)}", "ok");
            return new RunSummary(created, opt.Count, sum, false, null);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            log("To'xtatildi. Ochiq hujjat (agar bo'lsa) provesti qilinmagan holda qoldi.", "warn");
            return new RunSummary(created, opt.Count, sum, true, null);
        }
        catch (OneCException e)
        {
            log(e.Message, "err");
            return new RunSummary(created, opt.Count, sum, true, e.Message);
        }
    }

    // ---- 1: hujjat yaratish ---------------------------------------------------------------------

    async Task CreateDocumentAsync()
    {
        // «Реализация (акты, накладные)» ro'yxatini ochamiz (ochiq bo'lsa shu tabga o'tamiz)
        await WaitNoModalAsync();
        var tabs = await TabsAsync();
        var list = tabs.FirstOrDefault(t => t.Text.StartsWith(TargetListTitle));
        if (list is null)
        {
            log("«Реализация (акты, накладные)» ro'yxati ochilmoqda", "info");
            await d.ClickAsync(await OpenSectionItemAsync("Продажи", TargetListTitle));
            await d.WaitTrueAsync(async () => (await TabsAsync()).Any(t => t.Text.StartsWith(TargetListTitle) && t.Selected), 30000, "Реализация ro'yxati");
        }
        else if (!list.Selected)
        {
            await d.ClickAsync(list.Pos);
            await d.DelayAsync(700);
        }

        await d.WaitTrueAsync(async () => await d.HasAsync("_ПодменюСоздать"), 20000, "«Реализация» tugmasi");
        await d.ClickSuffixAsync("_ПодменюСоздать", "Реализация tugmasi");
        await d.WaitTrueAsync(async () => await d.HasAsync("_ФормаСоздатьРеализацияТовары"), 10000, "«Товары (накладная)» menyusi");
        await d.ClickSuffixAsync("_ФормаСоздатьРеализацияТовары", "Товары (накладная)");
        await d.WaitTrueAsync(async () => await d.HasAsync("_ТоварыИзменитьТовары"), 40000, "yangi hujjat formasi");
        docPrefix = await d.PrefixAsync("_ТоварыИзменитьТовары") ?? throw new OneCException("hujjat formasi aniqlanmadi");
        log("Yangi hujjat ochildi", "info");
    }

    async Task SetWarehouseAsync()
    {
        if (string.IsNullOrWhiteSpace(opt.Warehouse)) return;
        string Norm(string? s) => (s ?? "").Trim().ToLowerInvariant();
        if (Norm(await d.ValueAsync("_Склад_i0")) == Norm(opt.Warehouse)) return;

        await d.ClickSuffixAsync("_Склад_i0", "Склад maydoni", "input");
        await d.SelectAllAsync();
        await d.TypeAsync(opt.Warehouse);
        // 1C mos keladigan skladlarni ro'yxat qilib ko'rsatadi
        // Odatda 1C mos skladlarni ro'yxat qilib ko'rsatadi; 4 soniyada chiqmasa Tab — 1C yozilgan nomni o'zi tanlaydi
        Pt? item = null;
        var until = Environment.TickCount64 + 4000;
        while (item is null && Environment.TickCount64 < until)
        {
            await d.DelayAsync(200);
            var e = await d.EvalAsync("window.__ish.listItems()");
            if (e.ValueKind != JsonValueKind.Array) continue;
            foreach (var li in e.EnumerateArray())
                if (Norm(li.GetProperty("t").GetString()) is var t && (t == Norm(opt.Warehouse) || t.StartsWith(Norm(opt.Warehouse) + " (")))
                    item = new Pt(li.GetProperty("x").GetDouble(), li.GetProperty("y").GetDouble());
        }
        if (item is { } it) await d.ClickAsync(it);
        else await d.KeyAsync("Tab");
        await d.WaitTrueAsync(async () => Norm(await d.ValueAsync("_Склад_i0")) == Norm(opt.Warehouse), 8000, "sklad qiymati");
        await d.DelayAsync(250);
        log($"Sklad: {opt.Warehouse}", "info");
    }

    /// <summary>Chap bo'limni ochib, undagi bandning joyini qaytaradi; bosish yutilsa (1C hali yuklanayotgan bo'lsa) qayta bosadi.</summary>
    async Task<Pt> OpenSectionItemAsync(string section, string item)
    {
        var lastClick = 0L;
        return await d.WaitAsync(async () =>
        {
            if (await d.PosLeafAsync(item) is { } p) return p;
            if (Environment.TickCount64 - lastClick > 4000 && await d.ModalTextAsync() is null)
            {
                lastClick = Environment.TickCount64;
                if (await d.PosSectionAsync(section) is { } sec) await d.ClickAsync(sec);
            }
            return (Pt?)null;
        }, 20000, $"«{section}» → «{item}»", 200);
    }

    // ---- 0: inventarizatsiyani sklad qoldig'i bo'yicha yangilash ---------------------------------

    const string InventoryListTitle = "Инвентаризация товаров";

    async Task RefreshInventoryAsync()
    {
        await WaitNoModalAsync();
        var tabs = await TabsAsync();
        var list = tabs.FirstOrDefault(t => t.Text == InventoryListTitle);
        if (list is null)
        {
            await d.ClickAsync(await OpenSectionItemAsync("Склад", InventoryListTitle));
            await d.WaitTrueAsync(async () => (await TabsAsync()).Any(t => t.Text == InventoryListTitle && t.Selected), 30000, "inventarizatsiya ro'yxati");
        }
        else if (!list.Selected)
        {
            await d.ClickAsync(list.Pos);
            await d.DelayAsync(300);
        }
        await d.WaitTrueAsync(async () => await d.HasAsync("_ФормаСоздать") && await d.HasAsync("_Список"), 20000, "inventarizatsiya ro'yxati");

        // Yangi hujjat yaratilmaydi: shu skladning oxirgi inventarizatsiyasi ochiladi (yo'q bo'lsagina yangisi yaratiladi)
        await d.DelayAsync(500);
        var g = await d.GridAsync("Список");
        var row = g is null ? null : LatestFor(g, opt.Warehouse);
        if (row is not null)
            await d.ClickAsync(row.Cells.Values.Skip(1).First().At, 2);
        else
        {
            log($"«{opt.Warehouse}» uchun inventarizatsiya topilmadi — yangisi yaratiladi", "warn");
            await d.ClickSuffixAsync("_ФормаСоздать", "Создать");
        }
        await d.WaitTrueAsync(async () => await d.HasAsync("_ТоварыПодменюЗаполнить"), 40000, "inventarizatsiya hujjati");

        await SetWarehouseAsync();
        // Sklad maydonidan fokus chiqishi bilan birinchi bosish yutilib ketishi mumkin: menyu ochilguncha qayta bosiladi
        var lastClick = 0L;
        var fillItem = await d.WaitAsync(async () =>
        {
            if (await d.MenuItemAsync("Заполнить по остаткам на складе") is { } p) return p;
            if (Environment.TickCount64 - lastClick > 3000 && !await d.HasAsync("_ТоварыПодменюЗаполнить_submenu") && await d.ModalTextAsync() is null)
            {
                lastClick = Environment.TickCount64;
                await d.ClickSuffixAsync("_ТоварыПодменюЗаполнить", "Заполнить");
            }
            return (Pt?)null;
        }, 20000, "«Заполнить» menyusi", 150);
        await d.ClickAsync(fillItem);
        // Jadval bo'sh bo'lmasa 1C «табличная часть будет очищена» deb so'raydi
        var end = Environment.TickCount64 + 60000;
        var asked = false;
        while (Environment.TickCount64 < end)
        {
            await d.DelayAsync(250);
            if (!asked && await d.ModalTextAsync() is { } q && q.Contains("очищена", StringComparison.OrdinalIgnoreCase) && await d.ModalButtonAsync("Да") is { } yes)
            {
                await d.ClickAsync(yes);
                asked = true;
                continue;
            }
            if (await d.ModalTextAsync() is null && (await d.GridAsync("Товары")) is { Rows.Count: > 0 }) break;
        }
        await d.DelayAsync(500);
        var sumText = await d.ValueAsync("_ТоварыИтогСумма_i0") ?? "";

        // Provesti qilinadi (sklad qoldig'i bo'yicha bo'lgani uchun farq chiqmaydi)
        var msgsBefore = (await d.MessagesAsync()).Count;
        await d.ClickSuffixAsync("_ФормаПровести", "Провести");
        await d.WaitTrueAsync(async () =>
        {
            if (await d.ModalTextAsync() is { } m)
            {
                if (m.Contains("Не удалось", StringComparison.OrdinalIgnoreCase) || m.Contains("Ошибка", StringComparison.OrdinalIgnoreCase))
                {
                    var ok = await d.ModalButtonAsync("ОК") ?? await d.ModalButtonAsync("OK");
                    if (ok is { } okPt) await d.ClickAsync(okPt);
                    var msgs = await d.MessagesAsync();
                    throw new OneCException("Inventarizatsiyani provesti qilib bo'lmadi: " + (msgs.Count > msgsBefore ? msgs[^1] : m));
                }
                if (await d.ModalButtonAsync("Да") is { } yes) await d.ClickAsync(yes);
                return false;
            }
            return !string.IsNullOrWhiteSpace(await d.ValueAsync("_Номер_i0"))
                && (await TabsAsync()).Any(t => t.Selected && t.Text.StartsWith(InventoryListTitle + " ") && !t.Text.Contains("(создание)") && !t.Text.Contains(" *"));
        }, 30000, "inventarizatsiyani provesti qilish");
        await d.DelayAsync(300);
        invNumber = (await d.ValueAsync("_Номер_i0"))?.Trim();
        log($"Inventarizatsiya № {invNumber} sklad qoldig'i bo'yicha to'ldirildi va provesti qilindi (summa {sumText})", "info");

        // Hujjat tabini yopamiz (saqlangan)
        var active = (await TabsAsync()).FirstOrDefault(t => t.Selected && t.Text.StartsWith(InventoryListTitle + " ") && t.Close is not null);
        if (active?.Close is { } close)
        {
            await d.ClickAsync(close);
            await d.DelayAsync(400);
            if (await d.ModalButtonAsync("Нет") is { } no) await d.ClickAsync(no);
        }
    }

    /// <summary>Ro'yxatdagi (ko'rinib turgan) inventarizatsiyalardan shu skladning eng oxirgisi.</summary>
    static OneCDriver.GridRow? LatestFor(OneCDriver.GridView g, string warehouse)
    {
        var dateCol = g.ColIndex("Дата");
        var whCol = g.ColIndex("Склад");
        var numCol = g.ColIndex("Номер");
        OneCDriver.GridRow? best = null;
        (DateTime, string) bestKey = (DateTime.MinValue, "");
        foreach (var r in g.Rows)
        {
            var wh = whCol is not null && r.Cells.TryGetValue(whCol, out var wc) ? wc.Text.Trim() : "";
            if (!string.Equals(wh, warehouse.Trim(), StringComparison.OrdinalIgnoreCase)) continue;
            var dt = dateCol is not null && r.Cells.TryGetValue(dateCol, out var dc)
                && DateTime.TryParse(dc.Text, CultureInfo.GetCultureInfo("ru-RU"), DateTimeStyles.None, out var p) ? p : DateTime.MinValue;
            var num = numCol is not null && r.Cells.TryGetValue(numCol, out var nc) ? nc.Text : "";
            if (best is null || dt > bestKey.Item1 || (dt == bestKey.Item1 && string.CompareOrdinal(num, bestKey.Item2) > 0))
            {
                best = r;
                bestKey = (dt, num);
            }
        }
        return best;
    }

    // ---- 2: «Изменить» → inventarizatsiyadan yuklash --------------------------------------------

    async Task OpenEditFormAsync()
    {
        // Sklad tanlangandan keyin birinchi bosish yutilib ketishi mumkin: oyna ochilguncha har 6 soniyada qayta bosiladi
        var lastClick = 0L;
        await d.WaitTrueAsync(async () =>
        {
            if (await d.HasAsync("_ДобавитьИзДокумента")) return true;
            if (Environment.TickCount64 - lastClick > 6000 && await d.ModalTextAsync() is null && !await d.HasAsync("_ФормаПеренестиВДокумент"))
            {
                lastClick = Environment.TickCount64;
                await d.ClickSuffixAsync("_ТоварыИзменитьТовары", "Изменить tugmasi");
            }
            return false;
        }, 40000, "«Изменение таблицы товаров» oynasi", 200);
        editPrefix = await d.PrefixAsync("_ДобавитьИзДокумента") ?? "";
    }

    async Task LoadInventoryAsync()
    {
        await d.ClickSuffixAsync("_ДобавитьИзДокумента", "Добавить из документа");
        await d.WaitTrueAsync(async () => await d.HasAsync("_ValueList"), 20000, "«Выбор типа данных» oynasi");
        var prefix = await d.PrefixAsync("_ValueList");

        // Ro'yxatda «Инвентаризация товаров» ko'rinmaguncha pastga aylantiramiz
        for (var i = 0; ; i++)
        {
            var rows = await d.EvalAsync($"window.__ish.valueListRows({OneCDriver.Q(prefix + "_ValueList")})");
            var found = rows.ValueKind == JsonValueKind.Array
                ? rows.EnumerateArray().FirstOrDefault(r => r.GetProperty("t").GetString() == InventoryType) : default;
            if (found.ValueKind == JsonValueKind.Object)
            {
                await d.ClickAsync(new Pt(found.GetProperty("x").GetDouble(), found.GetProperty("y").GetDouble()));
                break;
            }
            if (i > 40 || rows.ValueKind != JsonValueKind.Array || rows.GetArrayLength() == 0)
                throw new OneCException($"«{InventoryType}» turi ro'yxatda topilmadi");
            var last = rows.EnumerateArray().Last();
            await d.WheelAsync(new Pt(last.GetProperty("x").GetDouble(), last.GetProperty("y").GetDouble()), 100);
        }
        await d.DelayAsync(100);
        await d.ClickSuffixAsync("_OK", "OK");

        // Inventarizatsiya hujjatlari ro'yxati: skladga mos eng yangisi
        await d.WaitTrueAsync(async () => await d.HasAsync("_ФормаВыбрать"), 30000, "inventarizatsiya ro'yxati");
        await d.DelayAsync(100);
        var grid = await d.WaitRefAsync(async () => (await d.GridAsync("Список")) is { Rows.Count: > 0 } g ? g : null, 20000, "inventarizatsiya hujjatlari");
        var dateCol = grid.ColIndex("Дата");
        var whCol = grid.ColIndex("Склад");
        var numCol = grid.ColIndex("Номер");
        OneCDriver.GridRow? pick = !string.IsNullOrWhiteSpace(opt.Warehouse) ? LatestFor(grid, opt.Warehouse) : null;
        DateTime best = DateTime.MinValue;
        foreach (var r in pick is null ? grid.Rows : new())
        {
            var dt = DateTime.MinValue;
            if (dateCol is not null && r.Cells.TryGetValue(dateCol, out var dc)
                && DateTime.TryParse(dc.Text, CultureInfo.GetCultureInfo("ru-RU"), DateTimeStyles.None, out var parsed)) dt = parsed;
            var wh = whCol is not null && r.Cells.TryGetValue(whCol, out var wc) ? wc.Text : "";
            var matches = string.IsNullOrWhiteSpace(opt.Warehouse) || string.Equals(wh.Trim(), opt.Warehouse.Trim(), StringComparison.OrdinalIgnoreCase);
            if (matches && dt >= best) { best = dt; pick = r; }
        }
        if (pick is null)
        {
            log($"«{opt.Warehouse}» skladi uchun inventarizatsiya topilmadi — eng oxirgisi olinadi", "warn");
            pick = grid.Rows.Last();
        }
        var anyCell = pick!.Cells.Values.First();
        await d.ClickAsync(anyCell.At);
        await d.DelayAsync(100);
        await d.ClickSuffixAsync("_ФормаВыбрать", "Выбрать");

        await d.WaitTrueAsync(async () => (await d.GridAsync("Товары")) is { Rows.Count: > 0 }, 60000, "inventarizatsiya qatorlari yuklanishi");
        await d.DelayAsync(200);
        log("Inventarizatsiya qatorlari yuklandi", "info");
    }

    // ---- 3: NDS va foiz -------------------------------------------------------------------------

    async Task ApplyPricingAsync()
    {
        // Tartib: Без НДС → foizga o'zgartirish → NDS 12% qaytariladi
        await SetActionAsync("Установить ставку НДС");
        await SetVatAsync("Без НДС");
        await ExecuteAsync();
        if (opt.Percent != 0)
        {
            await SetActionAsync("Изменить цены на процент");
            await SetPercentAsync(opt.Percent);
            await ExecuteAsync();
        }
        await SetActionAsync("Установить ставку НДС");
        await SetVatAsync(opt.VatRate.ToString("0", CultureInfo.InvariantCulture) + "%");
        await ExecuteAsync();
        log($"Narx: +{opt.Percent}% va NDS {opt.VatRate:0}% qo'yildi", "info");
    }

    async Task PickFromComboAsync(string dropButtonSuffix, string valueSuffix, string text)
    {
        if ((await d.ValueAsync(valueSuffix))?.Trim() == text) return;
        await d.ClickSuffixAsync(dropButtonSuffix, text + " ro'yxati");
        var item = await d.WaitAsync(async () =>
        {
            var e = await d.EvalAsync("window.__ish.listItems()");
            if (e.ValueKind != JsonValueKind.Array) return (Pt?)null;
            foreach (var li in e.EnumerateArray())
                if (li.GetProperty("t").GetString() == text)
                    return new Pt(li.GetProperty("x").GetDouble(), li.GetProperty("y").GetDouble());
            return null;
        }, 8000, $"«{text}» bandi");
        await d.ClickAsync(item);
        await d.WaitTrueAsync(async () => (await d.ValueAsync(valueSuffix))?.Trim() == text, 8000, $"«{text}» tanlanishi");
        await d.DelayAsync(200);
    }

    Task SetActionAsync(string text) => PickFromComboAsync("_ТекущееДействие_DLB", "_ТекущееДействие_i0", text);
    Task SetVatAsync(string text) => PickFromComboAsync("_ВариантЗначенияСтавкаНДС_DLB", "_ВариантЗначенияСтавкаНДС_i0", text);

    async Task SetPercentAsync(decimal percent)
    {
        await d.ClickSuffixAsync("_ВариантЗначенияЧислоПроцент_i0", "Процент maydoni", "input");
        await d.SelectAllAsync();
        await d.KeyAsync("Delete");
        await d.TypeAsync(percent.ToString("0.##", CultureInfo.GetCultureInfo("ru-RU")));
        // Maydon fokusdan chiqqanda 1C qiymatni qabul qiladi (Tab kalkulyatorni ochib yuboradi)
        await d.ClickAsync(await d.PosSuffixAsync("_ТекущееДействиеExtendedTooltip") ?? throw new OneCException("bo'sh joy topilmadi"));
        await d.DelayAsync(200);
        var v = OneCDriver.ParseNumber(await d.ValueAsync("_ВариантЗначенияЧислоПроцент_i0"));
        if (v != percent) throw new OneCException($"Foiz maydoniga {percent} yozilmadi (1C: {v})");
    }

    async Task ExecuteAsync()
    {
        var before = await TotalTextAsync();
        var msgs = (await d.MessagesAsync()).Count;
        await d.ClickSuffixAsync("_Выполнить", "Выполнить");
        // Jadval qayta hisoblanishini kutamiz (jami o'zgaradi yoki 4 soniya)
        // Odatda jami o'zgaradi; o'zgarmasa ham (masalan qiymat allaqachon shunday bo'lsa) 8 soniyadan keyin davom etiladi
        var end = Environment.TickCount64 + 8000;
        while (Environment.TickCount64 < end)
        {
            await d.DelayAsync(150);
            if (await TotalTextAsync() != before) break;
        }
        await d.DelayAsync(250);
        var now = await d.MessagesAsync();
        if (now.Count > msgs) throw new OneCException("1C xabari: " + now[0]);
    }

    async Task<string> TotalTextAsync() => await d.ValueAsync("_ИтогиВсего_i0") ?? "";

    // ---- 4: jadvalni o'qish, keraksiz qatorlarni o'chirish, miqdorlar ----------------------------------

    sealed record Row(string Name, decimal Qty, decimal Price);

    List<Row> WindowOf(OneCDriver.GridView g) => g.Rows.Select(r => new Row(g.Cell(r, "Номенклатура")?.Text ?? "",
        OneCDriver.ParseNumber(g.Cell(r, "Количество")?.Text) ?? 0, OneCDriver.ParseNumber(g.Cell(r, "Цена")?.Text) ?? 0)).ToList();

    static bool SameItem(Row a, Row b) => a.Name == b.Name && a.Price == b.Price;

    /// <summary>
    /// Ketma-ket ikki oynada jadval necha qatorga surilganini aniqlaydi (oldingi oynaning s-qatordan keyingi qismi yangisining boshi bilan mos).
    /// 0 — o'zgarmagan (pastga yetildi), -1 — mos kelmadi.
    /// </summary>
    static int ShiftBetween(List<Row> prev, List<Row> next)
    {
        var n = Math.Min(prev.Count, next.Count);
        for (var s = n - 1; s >= 1; s--)
            if (Enumerable.Range(0, prev.Count - s).All(j => j < next.Count && SameItem(prev[s + j], next[j]))) return s;
        return prev.Count == next.Count && prev.Zip(next).All(p => SameItem(p.First, p.Second)) ? 0 : -1;
    }

    async Task<OneCDriver.GridView> GridAsync()
    {
        // Jarayon paytida «Изменение таблицы товаров» yopilib qolsa (masalan 1C ga qo'lda tegilsa) — aniq xabar bilan to'xtaymiz
        if (!await d.HasAsync("_ФормаПеренестиВДокумент"))
            throw new OneCException("«Изменение таблицы товаров» oynasi yopilib qoldi. Jarayon paytida 1C oynasiga tegmang.");
        return await d.GridAsync("Товары") ?? throw new OneCException("Tovarlar jadvali topilmadi");
    }

    /// <summary>Jadvalni bosib fokuslaydi va Ctrl+Home bilan birinchi qatorga o'tadi (tahrirlanmaydigan «Всего» ustunida).</summary>
    async Task FocusFirstRowAsync()
    {
        var g = await GridAsync();
        if (g.Rows.Count == 0) throw new OneCException("Jadvalda qator yo'q");
        var cell = g.VisibleCell(g.Rows[0], "Всего", "НДС", "% НДС", "Сумма") ?? g.Cell(g.Rows[0], "Номенклатура")
            ?? throw new OneCException("jadval ustunlari topilmadi");
        // Bosish yutilib ketsa (1C band bo'lsa) har 2,5 soniyada qayta bosiladi
        var lastClick = 0L;
        await d.WaitTrueAsync(async () =>
        {
            var now = await GridAsync();
            if (lastClick != 0 && now.Rows is { Count: > 0 } r && r[0].Selected && WindowOf(now)[0] is var w0 && table.Count > 0 && SameItem(w0, table[0])) return true;
            if (Environment.TickCount64 - lastClick > 2500)
            {
                lastClick = Environment.TickCount64;
                if (now.Rows.Count > 0) cell = now.VisibleCell(now.Rows[0], "Всего", "НДС", "% НДС", "Сумма") ?? cell;
                await d.ClickAsync(cell.At);
                await d.KeyAsync("Home", 2); // Ctrl+Home
            }
            return false;
        }, 20000, "jadvalning birinchi qatori", 150);
    }

    /// <summary>Hamma qatorlarni tepadan pastga o'qiydi (oynama-oyna aylantirib).</summary>
    async Task<List<Row>> ReadAllAsync()
    {
        var g = await GridAsync();
        await d.ClickAsync((g.VisibleCell(g.Rows[0], "Всего", "НДС", "% НДС", "Сумма") ?? g.Cell(g.Rows[0], "Номенклатура"))!.Value.At);
        await d.KeyAsync("Home", 2);
        await d.DelayAsync(300);
        var all = new List<Row>();
        List<Row>? prev = null;
        for (var page = 0; page < 5000; page++)
        {
            g = await GridAsync();
            var win = WindowOf(g);
            if (win.Count == 0) break;
            if (prev is null) all.AddRange(win);
            else
            {
                var s = ShiftBetween(prev, win);
                if (s == 0) break;
                if (s < 0) throw new OneCException("Jadvalni o'qishda joy yo'qoldi (aylantirish mos kelmadi)");
                all.AddRange(win.Skip(win.Count - s));
            }
            prev = win;
            if (!await d.ScrollRowsAsync("Товары", g, Math.Max(1, win.Count - 1))) break;
        }
        if (all.Count == 0) throw new OneCException("Jadvalda tovar topilmadi");
        log($"Tovarlar o'qildi: {all.Count} ta qator, jami qoldiq {all.Sum(r => r.Qty):N0} dona", "info");
        return all;
    }

    /// <summary>Keyingi cheklarda: yuklangan jadval birinchi o'qilgani bilan bir xilmi (tepadagi oyna).</summary>
    async Task VerifyTableAsync()
    {
        table = full!.ToList();
        await FocusFirstRowAsync();
        var win = WindowOf(await GridAsync());
        if (win.Count == 0 || win.Select((r, j) => j < full!.Count && SameItem(r, full[j])).Any(ok => !ok))
            throw new OneCException("Inventarizatsiyadagi tovarlar o'zgargan — jarayon to'xtatildi (qaytadan boshlang).");
    }

    /// <summary>Oynadagi qatorlarning `table` dagi o'rni (nom+narx ketma-ketligi bo'yicha, `hint` ga eng yaqini); topilmasa -1.</summary>
    int Locate(List<Row> win, int hint)
    {
        var best = -1;
        for (var p = 0; p + win.Count <= table.Count; p++)
        {
            var ok = true;
            for (var j = 0; j < win.Count && ok; j++) ok = SameItem(win[j], table[p + j]);
            if (ok && (best < 0 || Math.Abs(p - hint) < Math.Abs(best - hint))) best = p;
        }
        return best;
    }

    /// <summary>Tanlangan qatorni `target` (table indeksi) ga ↑/↓ bilan olib boradi; tugma yo'qolsa ham o'zini tuzatadi.</summary>
    async Task MoveToRowAsync(int target)
    {
        var hint = target;
        var lastPress = 0L;
        await d.WaitTrueAsync(async () =>
        {
            var g = await GridAsync();
            var j = g.Rows.FindIndex(r => r.Selected);
            if (j < 0) { await FocusFirstRowAsync(); return false; }
            var top = Locate(WindowOf(g), hint);
            if (top < 0) return false;
            var cur = top + j;
            hint = top;
            if (cur == target) return true;
            if (Environment.TickCount64 - lastPress < 400) return false; // oldingi tugmalar ishlanishini kutamiz
            var diff = target - cur;
            for (var i = 0; i < Math.Min(Math.Abs(diff), 40); i++) await d.KeyAsync(diff > 0 ? "ArrowDown" : "ArrowUp");
            lastPress = Environment.TickCount64;
            return false;
        }, 20000, $"«{table[target].Name}» qatoriga o'tish", 120);
    }

    async Task DeleteSelectionAsync(string what)
    {
        var before = string.Join("|", WindowOf(await GridAsync()).Select(r => r.Name + r.Price));
        await d.KeyAsync("Delete");
        await d.WaitTrueAsync(async () => string.Join("|", WindowOf(await GridAsync()).Select(r => r.Name + r.Price)) != before, 8000, what);
        await d.DelayAsync(150);
    }

    /// <summary>
    /// Jadvalda faqat `keep` (full indekslari, o'sish tartibida) qatorlarini qoldiradi: pastdagi blok Ctrl+Shift+End, tepadagi blok
    /// Ctrl+Shift+Home bilan bitta harakatda, oradagilar bittalab o'chiriladi.
    /// </summary>
    async Task KeepOnlyAsync(List<int> keep)
    {
        await FocusFirstRowAsync();
        var first = keep[0];
        var last = keep[^1];
        // 1) pastki blok
        if (last + 1 < table.Count)
        {
            await MoveToRowAsync(last + 1);
            await d.KeyAsync("End", 2 | 8);
            await d.DelayAsync(250);
            await DeleteSelectionAsync("pastdagi ortiqcha qatorlarni o'chirish");
            table.RemoveRange(last + 1, table.Count - last - 1);
        }
        // 2) oradagi bo'shliqlar (pastdan tepaga): har bo'shliq Shift+↓ bilan belgilanib bitta harakatda o'chiriladi
        for (var k = keep.Count - 1; k > 0; k--)
        {
            int a = keep[k - 1] + 1, b = keep[k]; // [a, b) — o'chiriladigan
            if (b <= a) continue;
            await MoveToRowAsync(a);
            for (var j = 0; j < b - a - 1; j++) await d.KeyAsync("ArrowDown", 8); // Shift+↓
            await d.DelayAsync(250);
            await DeleteSelectionAsync(b - a == 1 ? $"«{table[a].Name}» qatorini o'chirish" : $"{b - a} ta oradagi qatorni o'chirish");
            table.RemoveRange(a, b - a);
        }
        // 3) tepadagi blok
        if (first > 0)
        {
            await MoveToRowAsync(first - 1);
            await d.KeyAsync("Home", 2 | 8);
            await d.DelayAsync(250);
            await DeleteSelectionAsync("tepadagi ortiqcha qatorlarni o'chirish");
            table.RemoveRange(0, first);
        }
        // Tekshiruv: jadvalda aynan rejadagi qatorlar
        await FocusFirstRowAsync();
        var rows = await ReadTopAsync(keep.Count + 1);
        if (rows.Count != keep.Count || !rows.Zip(keep).All(p => SameItem(p.First, full![p.Second])))
            throw new OneCException($"Qatorlarni qoldirish natijasi kutilganidek emas (jadvalda {rows.Count} ta, kerak {keep.Count})");
    }

    /// <summary>Tepadan `max` tagacha qatorni o'qiydi.</summary>
    async Task<List<Row>> ReadTopAsync(int max)
    {
        var all = new List<Row>();
        List<Row>? prev = null;
        for (var page = 0; page < 500 && all.Count < max; page++)
        {
            var g = await GridAsync();
            var win = WindowOf(g);
            if (win.Count == 0) break;
            if (prev is null) all.AddRange(win);
            else
            {
                var s = ShiftBetween(prev, win);
                if (s <= 0) break;
                all.AddRange(win.Skip(win.Count - s));
            }
            prev = win;
            if (all.Count >= max || !await d.ScrollRowsAsync("Товары", g, Math.Max(1, win.Count - 1))) break;
        }
        return all;
    }

    /// <summary>Miqdorlarni yozadi: «Количество» ustuni faollashtiriladi, har qatorga ↑/↓ bilan borib raqam + Enter.</summary>
    async Task WriteQuantitiesAsync(List<Row> kept, ReceiptPlan plan)
    {
        table = kept.ToList();
        await FocusFirstRowAsync();
        var g = await GridAsync();
        var qtyCell = g.Cell(g.Rows[0], "Количество") ?? throw new OneCException("«Количество» ustuni topilmadi");
        await d.ClickAsync(qtyCell.At); // faol ustun — «Количество» (qator tanlangan, katak hali tahrirlanmayapti)
        await d.DelayAsync(150);
        for (var i = 0; i < kept.Count; i++)
        {
            if (i > 0) await MoveToRowAsync(i);
            var want = plan.Lines[i].Qty;
            await d.TypeAsync(want.ToString("0", CultureInfo.InvariantCulture));
            await d.KeyAsync("Enter");
            var name = kept[i].Name;
            await d.WaitTrueAsync(async () =>
            {
                var gv = await GridAsync();
                var r = gv.Rows.FirstOrDefault(x => x.Selected);
                return r is not null && OneCDriver.ParseNumber(gv.Cell(r, "Количество")?.Text) == want;
            }, 6000, $"«{name}» miqdori {want}");
        }
        // Yakuniy tekshiruv
        await FocusFirstRowAsync();
        var rows = await ReadTopAsync(kept.Count + 1);
        for (var i = 0; i < kept.Count; i++)
            if (i >= rows.Count || rows[i].Qty != plan.Lines[i].Qty)
                throw new OneCException($"«{kept[i].Name}» miqdori {plan.Lines[i].Qty} bo'lmadi (1C: {(i < rows.Count ? rows[i].Qty : 0)})");
    }

    // ---- 5: hujjatga o'tkazish va provesti ------------------------------------------------------

    async Task TransferAsync()
    {
        await d.ClickSuffixAsync("_ФормаПеренестиВДокумент", "Перенести в документ");
        await d.WaitTrueAsync(async () => !await d.HasAsync("_ФормаПеренестиВДокумент") && await d.HasAsync("_ТоварыИзменитьТовары"), 60000, "hujjatga o'tkazish");
        await d.DelayAsync(800);
        docPrefix = await d.PrefixAsync("_ТоварыИзменитьТовары") ?? docPrefix;
    }

    async Task CancelEditFormAsync()
    {
        if (await d.HasAsync("_ФормаЗакрытьБезПереноса"))
        {
            await d.ClickSuffixAsync("_ФормаЗакрытьБезПереноса", "Отмена");
            await d.DelayAsync(800);
            if (await d.ModalButtonAsync("Нет") is { } no) await d.ClickAsync(no);
            await d.DelayAsync(250);
        }
    }

    sealed record PostResult(bool Ok, List<string> Messages);

    async Task<PostResult> PostAsync()
    {
        var before = (await d.MessagesAsync()).Count;
        await d.ClickSuffixAsync("_ФормаПровестиИЗакрыть", "Провести и закрыть");
        var end = Environment.TickCount64 + 120000;
        while (Environment.TickCount64 < end)
        {
            await d.DelayAsync(200);
            var text = await d.ModalTextAsync();
            if (text is not null)
            {
                if (text.Contains("пустым количеством", StringComparison.OrdinalIgnoreCase) && await d.ModalButtonAsync("Да") is { } yes)
                {
                    await d.ClickAsync(yes);
                    continue;
                }
                if (text.Contains("Не удалось", StringComparison.OrdinalIgnoreCase) || text.Contains("Ошибка", StringComparison.OrdinalIgnoreCase))
                {
                    var ok = await d.ModalButtonAsync("ОК") ?? await d.ModalButtonAsync("OK");
                    if (ok is { } okPt) await d.ClickAsync(okPt);
                    await d.DelayAsync(800);
                    var msgs = await d.MessagesAsync();
                    if (msgs.Count == 0) msgs.Add(text);
                    return new PostResult(false, msgs);
                }
                throw new OneCException("1C kutilmagan savol berdi: " + text);
            }
            if (!await d.HasAsync("_ФормаПровестиИЗакрыть")) { await d.DelayAsync(800); return new PostResult(true, new()); }
        }
        throw new OneCException("Provesti qilish javobi kelmadi (vaqt tugadi)");
    }

    /// <summary>
    /// Ochiq Реализация hujjatining «Товары» jadvalidan berilgan qatorlarni (N ustuni, 1 dan) o'chiradi: pastdan tepaga,
    /// har biriga Ctrl+Home → ↓ bilan borib (N tekshiriladi) → Delete. Muvaffaqiyatli bo'lsa true.
    /// </summary>
    async Task<bool> RemoveDocRowsAsync(List<int> rowNumbers)
    {
        try
        {
            foreach (var n in rowNumbers.OrderByDescending(x => x))
            {
                var g = await d.GridAsync("Товары") ?? throw new OneCException("hujjat jadvali topilmadi");
                if (g.Rows.Count == 0) return false;
                var cell = g.VisibleCell(g.Rows[0], "Всего", "НДС", "Сумма", "Цена", "Номенклатура") ?? throw new OneCException("jadval ustunlari topilmadi");
                await d.ClickAsync(cell.At);
                await d.KeyAsync("Home", 2);
                await d.DelayAsync(300);
                int? Current(OneCDriver.GridView v) => v.Rows.FirstOrDefault(r => r.Selected) is { } r && int.TryParse(v.Cell(r, "N")?.Text, out var x) ? x : null;
                var lastPress = 0L;
                await d.WaitTrueAsync(async () =>
                {
                    var v = await d.GridAsync("Товары");
                    if (v is null || Current(v) is not { } cur) return false;
                    if (cur == n) return true;
                    if (Environment.TickCount64 - lastPress < 400) return false;
                    for (var i = 0; i < Math.Min(Math.Abs(n - cur), 40); i++) await d.KeyAsync(n > cur ? "ArrowDown" : "ArrowUp");
                    lastPress = Environment.TickCount64;
                    return false;
                }, 15000, $"hujjatdagi {n}-qatorga o'tish", 150);
                var sig = string.Join("|", (await d.GridAsync("Товары"))!.Rows.Select(r => r.Cells.Values.Select(c => c.Text).FirstOrDefault(t => t.Length > 3)));
                await d.KeyAsync("Delete");
                await d.WaitTrueAsync(async () =>
                    string.Join("|", (await d.GridAsync("Товары"))!.Rows.Select(r => r.Cells.Values.Select(c => c.Text).FirstOrDefault(t => t.Length > 3))) != sig,
                    8000, $"hujjatdagi {n}-qatorni o'chirish");
                await d.DelayAsync(200);
            }
            return true;
        }
        catch (OneCException e)
        {
            log("Qatorni o'chirib bo'lmadi: " + e.Message, "warn");
            return false;
        }
    }

    /// <summary>Provesti bo'lmagan hujjatni saqlamasdan yopadi.</summary>
    async Task DiscardDocumentAsync()
    {
        var tabs = await TabsAsync();
        var active = tabs.FirstOrDefault(t => t.Selected && !t.Text.StartsWith(TargetListTitle) && t.Close is not null);
        if (active?.Close is not { } close) return;
        await d.ClickAsync(close);
        await d.DelayAsync(100);
        if (await d.ModalButtonAsync("Нет") is { } no) { await d.ClickAsync(no); await d.DelayAsync(300); }
    }

    // ---- yordamchilar ---------------------------------------------------------------------------

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
}
