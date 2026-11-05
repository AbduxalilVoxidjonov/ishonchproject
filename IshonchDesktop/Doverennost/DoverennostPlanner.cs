using System.Text.RegularExpressions;

namespace IshonchDesktop.Doverennost;

/// <summary>1C Доверенности ro'yxatidagi mavjud hujjat (raqam, sana, kontragent).</summary>
public sealed record ExistingDoc(string Number, DateOnly Date, string Counterparty);

public enum PlanStatus { New, Exists, NoNumber }

/// <summary>Yaratiladigan bitta dovernis: kontragent, birinchi sana, yig'ilgan summa, tovar nomi va raqam.</summary>
public sealed class PlanItem
{
    public string Counterparty { get; init; } = "";
    public DateOnly Date { get; init; }
    public decimal Amount { get; init; }
    public string GoodsName { get; set; } = "";
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
        var m = Regex.Match(number ?? "", @"^\s*(\d+)");
        return m.Success ? int.Parse(m.Groups[1].Value) : null;
    }

    /// <summary>To'lov maqsadidan qisqa tovar nomi: boshidagi hujjat raqami, shartnoma ma'lumoti va #kod# olib tashlanadi.</summary>
    public static string GoodsNameFrom(string purpose)
    {
        var s = purpose ?? "";
        s = Regex.Replace(s, @"#[^#]*#", " ");
        s = Regex.Replace(s, @"^\s*\d{3,6}\s+", "");
        s = Regex.Replace(s, @"\d{1,2}\.\d{1,2}\.\d{2,4}\s*(йил\s*кунги|даги|года|г\.?)?", " ", RegexOptions.IgnoreCase);
        s = Regex.Replace(s, @"№\s*[\w/\-]+\s*(-?\s*сонли)?\s*(шартномага|договор\w*)?\s*(асосан|основании)?", " ", RegexOptions.IgnoreCase);
        s = Regex.Replace(s, @"[\w/\-]+\s*-?\s*сонли\s*шартномага\s*асосан", " ", RegexOptions.IgnoreCase);
        s = Regex.Replace(s, @"\s+", " ").Trim(' ', ',', '.', ';', '-');
        return s.Length > 0 ? s : (purpose ?? "").Trim();
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
            docs.Add(new ExistingDoc(number, p.Date, p.Counterparty));
        }
        return items;
    }

    /// <summary>Yangi hujjat raqami (docs ichida yangi hujjatlar ham bor deb hisoblanadi).</summary>
    public static string? NextNumber(IReadOnlyList<ExistingDoc> docs, DateOnly date)
    {
        var numbered = docs.Select(d => (d, n: BaseNumber(d.Number))).Where(x => x.n is not null).ToList();
        if (numbered.Count == 0) return null;
        var last = numbered.Max(x => x.d.Date);
        if (date >= last) return (numbered.Max(x => x.n!.Value) + 1).ToString();
        // Oldingi sana: shu sanadan oldin yoki shu sanadagi eng yaqin hujjat raqamiga /k qo'shiladi
        var prev = numbered.Where(x => x.d.Date <= date).OrderByDescending(x => x.d.Date).ThenByDescending(x => x.n).FirstOrDefault();
        if (prev.d is null) return null;
        var b = prev.n!.Value;
        var used = numbered.Where(x => x.n == b).Select(x => Regex.Match(x.d.Number, @"/\s*(\d+)")).Where(m => m.Success)
            .Select(m => int.Parse(m.Groups[1].Value)).DefaultIfEmpty(0).Max();
        return b + "/" + (used + 1);
    }
}
