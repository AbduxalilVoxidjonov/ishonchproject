using System.Text.RegularExpressions;

namespace IshonchDesktop.Doverennost;

/// <summary>1C Доверенности ro'yxatidagi mavjud hujjat (raqam, sana, kontragent).</summary>
public sealed record ExistingDoc(string Number, DateOnly Date, string Counterparty, TimeOnly? Time = null);

public enum PlanStatus { New, Exists, NoNumber }

/// <summary>Yaratiladigan bitta dovernis: kontragent, birinchi sana, yig'ilgan summa, tovar nomi va raqam.</summary>
public sealed class PlanItem
{
    public string Counterparty { get; init; } = "";
    public DateOnly Date { get; init; }
    /// <summary>Hujjat vaqti: odatda 12:00:00; shu kunda boshqa hujjat bor bo'lsa soniya oshiriladi (12:00:01, …), haqiqiy bazadagidek.</summary>
    public TimeOnly Time { get; set; } = new(12, 0, 0);
    public decimal Amount { get; init; }
    public string GoodsName { get; set; } = "";
    /// <summary>Shartnoma raqami (to'lov ma'lumotidan): 1C da Договор shu raqam bo'yicha qidiriladi; topilmasa — «Основной договор».</summary>
    public string Contract { get; set; } = "";
    /// <summary>Excelning «Договор» katagi («№348 от 01.02.2025») — bir xil raqamli shartnomalarni sanasi bilan ajratish uchun.</summary>
    public string ContractText { get; init; } = "";
    public string Number { get; set; } = "";
    public PlanStatus Status { get; set; } = PlanStatus.New;
    /// <summary>Allaqachon bo'lsa — mavjud hujjat raqami.</summary>
    public string ExistingNumber { get; set; } = "";
    public List<BankRow> Rows { get; init; } = new();
}

public static class DoverennostPlanner
{
    public static string NormParty(string s) =>
        Regex.Replace((s ?? "").ToLowerInvariant(), @"[""'`’‘“”«»\s]+", "").Trim();

    /// <summary>Raqamning asosiy qismi: «455/2» → 455. Raqam bo'lmasa null.</summary>
    public static int? BaseNumber(string number)
    {
        // «0000-000033» (1C avtomatik raqami) → 33; «25/1» → 25; «31» → 31
        var m = Regex.Match(number ?? "", @"^\s*\d{4}-0*(\d+)");
        if (!m.Success) m = Regex.Match(number ?? "", @"^\s*(\d+)");
        return m.Success ? int.Parse(m.Groups[1].Value) : null;
    }

    /// <summary>
    /// To'lov maqsadidan tovar nomi: «…шартномага асосан <tovar> учун тулов» → tovar; ruscha «… за <tovar>» → tovar.
    /// Boshidagi hujjat raqami, #kod# va oy/yil ko'rsatkichi olib tashlanadi.
    /// </summary>
    public static string GoodsNameFrom(string purpose)
    {
        var s = Regex.Replace(purpose ?? "", @"#[^#]*#", " ");
        s = Regex.Replace(s, @"\s+", " ").Trim();
        var m = Regex.Match(s, @"асосан\s+(.+)$", RegexOptions.IgnoreCase);
        var russian = false;
        if (!m.Success) { m = Regex.Match(s, @"(?:^|\s)(за\s+.+)$", RegexOptions.IgnoreCase); russian = m.Success; }
        var t = m.Success ? m.Groups[1].Value : s;
        if (!m.Success)
        {
            t = Regex.Replace(t, @"^\s*\d{3,6}\s+", "");
            t = Regex.Replace(t, @"\d{1,2}\.\d{1,2}\.\d{2,4}\s*(йил\s*кунги|даги|года|г\.?)?", " ", RegexOptions.IgnoreCase);
            t = Regex.Replace(t, @"[\w/\-]+\s*-?\s*сонли\s*шартномага", " ", RegexOptions.IgnoreCase);
        }
        t = t.Trim(' ', ',', '.', ';', '-');
        t = Regex.Replace(t, @"^(олинадиган|олинган|олган|олинувчи)\s+", "", RegexOptions.IgnoreCase);
        t = Regex.Replace(t, @"^\d{4}\s*(йил|йилги)?\s*\S+\s+ойи\s+(учун\s+)?", "", RegexOptions.IgnoreCase);
        t = Regex.Replace(t, @"\s+(учун)?\s*(тулов|тўлов)(и)?(\s+(утказилди|ўтказилди|килинди))?\s*$", "", RegexOptions.IgnoreCase);
        t = Regex.Replace(t, @"\s+(утказилди|ўтказилди)\s*$", "", RegexOptions.IgnoreCase);
        t = Regex.Replace(t, @"\s+учун\s*$", "", RegexOptions.IgnoreCase);
        t = Regex.Replace(t, @"\s+", " ").Trim(' ', ',', '.', ';', '-');
        // Ruscha to'lovda hujjatdagi nom «за …» bilan boshlanadi (haqiqiy bazada shunday)
        return t.Length > 0 ? t : (purpose ?? "").Trim();
    }

    /// <summary>
    /// Shartnoma raqami: avval Excelning «Договор» ustunidan («№348 от 01.02.2025» → 348), bo'lmasa to'lov maqsadidan
    /// («№20/01-2 сонли шартномага», «348-сонли шартномага»). Topilmasa bo'sh.
    /// </summary>
    public static string ContractNumberFrom(string? contractCell, string? purpose)
    {
        var m = Regex.Match(contractCell ?? "", @"№\s*(.+?)\s+от", RegexOptions.IgnoreCase);
        if (m.Success && !Regex.IsMatch(m.Groups[1].Value, @"Bank|оферта", RegexOptions.IgnoreCase)) return m.Groups[1].Value.Trim();
        var p = purpose ?? "";
        m = Regex.Match(p, @"№\s*([^\s]+?)(?:\s*-?\s*сонли|\s+от|\s+шартном|\s|$)", RegexOptions.IgnoreCase);
        if (m.Success) return m.Groups[1].Value.Trim('-', ' ');
        m = Regex.Match(p, @"([\w/\-]+?)\s*-?\s*сонли\s*шартномага", RegexOptions.IgnoreCase);
        return m.Success ? m.Groups[1].Value.Trim('-', ' ') : "";
    }

    /// <summary>
    /// Tanlangan qatorlardan reja tuzadi: bir kontragentning hamma to'lovlari bitta dovernisga (eng birinchi sana, summalar yig'indisi).
    /// Raqam: sana oxirgi hujjatdan keyin bo'lsa — keyingi raqam; oldingi sanaga — undan oldingi hujjat raqami + «/k».
    /// Kontragent bilan bir sanada hujjat bor bo'lsa — qayta yaratilmaydi.
    /// </summary>
    public static List<PlanItem> Build(IEnumerable<BankRow> selected, IReadOnlyList<ExistingDoc> existing)
    {
        var items = selected.GroupBy(r => NormParty(r.Counterparty)).Select(g =>
        {
            var rows = g.OrderBy(r => r.Date).ThenBy(r => r.Line).ToList();
            return new PlanItem
            {
                Counterparty = rows[0].Counterparty,
                Date = rows[0].Date,
                Amount = rows.Sum(r => r.Amount),
                GoodsName = GoodsNameFrom(rows[0].Purpose),
                ContractText = rows.Select(r => r.Contract).FirstOrDefault(c => c.Length > 0) ?? "",
                Contract = rows.Select(r => ContractNumberFrom(r.Contract, r.Purpose)).FirstOrDefault(c => c.Length > 0) ?? "",
                Rows = rows,
            };
        }).OrderBy(p => p.Date).ThenBy(p => p.Counterparty, StringComparer.OrdinalIgnoreCase).ToList();

        var docs = existing.ToList();
        foreach (var p in items)
        {
            var key = NormParty(p.Counterparty);
            var dup = docs.FirstOrDefault(d => d.Date == p.Date && NormParty(d.Counterparty) is { Length: > 0 } c && (c == key || (Math.Min(c.Length, key.Length) >= 6 && (c.StartsWith(key) || key.StartsWith(c)))));
            if (dup is not null) { p.Status = PlanStatus.Exists; p.ExistingNumber = dup.Number; continue; }
            var number = NextNumber(docs, p.Date);
            if (number is null) { p.Status = PlanStatus.NoNumber; continue; }
            p.Number = number;
            // Shu kunda 12:00:SS vaqtli hujjatlar bor bo'lsa — birinchi bo'sh soniya
            var used = docs.Where(d => d.Date == p.Date && d.Time is { Hour: 12, Minute: 0 }).Select(d => d.Time!.Value.Second).ToHashSet();
            var sec = 0;
            while (used.Contains(sec) && sec < 59) sec++;
            p.Time = new TimeOnly(12, 0, sec);
            docs.Add(new ExistingDoc(number, p.Date, p.Counterparty, p.Time));
        }
        return items;
    }

    /// <summary>Yangi hujjat raqami (docs ichida yangi hujjatlar ham bor deb hisoblanadi).</summary>
    public static string? NextNumber(IReadOnlyList<ExistingDoc> docs, DateOnly date)
    {
        var numbered = docs.Select(d => (d, n: BaseNumber(d.Number))).Where(x => x.n is not null).ToList();
        if (numbered.Count == 0) return null;
        var last = numbered.Max(x => x.d.Date);
        if (date >= last)
        {
            // Oxirgi raqam qaysi ko'rinishda bo'lsa shunday davom etadi: «0000-000033» → «0000-000034», «31» → «32»
            var top = numbered.OrderByDescending(x => x.n).First();
            var next = top.n!.Value + 1;
            var style = Regex.Match(top.d.Number, @"^\s*(\d{4})-(\d+)");
            return style.Success ? style.Groups[1].Value + "-" + next.ToString().PadLeft(style.Groups[2].Length, '0') : next.ToString();
        }
        // Oldingi sana: shu sanadan oldin yoki shu sanadagi eng yaqin hujjat raqamiga /k qo'shiladi
        var prev = numbered.Where(x => x.d.Date <= date).OrderByDescending(x => x.d.Date).ThenByDescending(x => x.n).FirstOrDefault();
        if (prev.d is null) return null;
        var b = prev.n!.Value;
        var used = numbered.Where(x => x.n == b).Select(x => Regex.Match(x.d.Number, @"/\s*(\d+)")).Where(m => m.Success)
            .Select(m => int.Parse(m.Groups[1].Value)).DefaultIfEmpty(0).Max();
        return b + "/" + (used + 1);
    }
}
