using System.Text.RegularExpressions;

namespace IshonchLogs.Core;

/// <summary>Bitta firmadagi bir xil muammo (bo'lim + matn namunasi) — necha marta, birinchi va oxirgi marta qachon.</summary>
public sealed class ProblemGroup
{
    public required string Feature { get; init; }
    public required string Pattern { get; init; }
    public List<Problem> Items { get; } = new();
    public int Count => Items.Count;
    public string Level => Items.Any(p => p.Level == "err") ? "err" : "warn";
    public DateTimeOffset First => Items.Min(p => p.Time);
    public DateTimeOffset Last => Items.Max(p => p.Time);
    /// <summary>Qaysi kompyuterlarda (bitta firma bir nechta buxgalterda ochilishi mumkin).</summary>
    public IEnumerable<string> Pcs => Items.Select(p => p.Pc ?? "?").Distinct();
}

/// <summary>Bitta firma va uning muammolari (eng so'nggisi tepada).</summary>
public sealed class FirmGroup
{
    public required string Key { get; init; }
    public required string Title { get; init; }
    public List<ProblemGroup> Problems { get; } = new();
    public int Count => Problems.Sum(g => g.Count);
    public DateTimeOffset Last => Problems.Max(g => g.Last);
}

public static class ProblemGrouper
{
    static readonly Regex Quoted = new("«[^»]*»|\"[^\"]*\"|'[^'\\s]{2,}'", RegexOptions.Compiled);
    static readonly Regex Hex = new(@"\b[0-9a-fA-F]{8,}\b", RegexOptions.Compiled);
    static readonly Regex Number = new(@"\d+([.,]\d+)*", RegexOptions.Compiled);
    static readonly Regex Space = new(@"\s+", RegexOptions.Compiled);

    /// <summary>
    /// Matn namunasi: raqamlar → #, «…»/"…" ichidagi qiymatlar → «…», uzun hex/GUID → #.
    /// Shunda «2-chek: panel javob bermadi» va «3-chek: panel javob bermadi» bitta muammo bo'ladi.
    /// </summary>
    public static string Normalize(string message)
    {
        var m = message.Split('\n')[0];
        m = Quoted.Replace(m, x => x.Value[0] == '«' ? "«…»" : x.Value[0] + "…" + x.Value[0]);
        m = Hex.Replace(m, "#");
        m = Number.Replace(m, "#");
        m = Space.Replace(m, " ").Trim();
        return m.Length > 200 ? m[..200] + "…" : m;
    }

    /// <summary>
    /// Firma bo'yicha guruhlar. INN siz yozuv (masalan eski app.log dan) shu baza nomi INN bilan ham kelgan bo'lsa — o'sha firmaga qo'shiladi.
    /// </summary>
    public static List<FirmGroup> Group(IEnumerable<Problem> problems)
    {
        var items = problems as IReadOnlyCollection<Problem> ?? problems.ToList();
        var innByDb = InnByDb(items);
        return items
            .GroupBy(p => KeyOf(p, innByDb))
            .Select(f =>
            {
                var best = f.OrderByDescending(p => p.TitleQuality).ThenByDescending(p => p.Time).First();
                var firm = new FirmGroup { Key = f.Key, Title = best.FirmTitle };
                foreach (var g in f.GroupBy(p => (p.Feature, Pattern: Normalize(p.Message))))
                {
                    var pg = new ProblemGroup { Feature = g.Key.Feature, Pattern = g.Key.Pattern };
                    pg.Items.AddRange(g.OrderByDescending(p => p.Time));
                    firm.Problems.Add(pg);
                }
                firm.Problems.Sort((a, b) => b.Last.CompareTo(a.Last));
                return firm;
            })
            .OrderByDescending(f => f.Last)
            .ToList();
    }

    /// <summary>Baza nomi → shu baza INN bilan kelgan yozuvdagi firma kaliti.</summary>
    public static Dictionary<string, string> InnByDb(IEnumerable<Problem> items) =>
        items
            .Where(p => !string.IsNullOrWhiteSpace(p.Inn) && !string.IsNullOrWhiteSpace(p.Db))
            .GroupBy(p => p.Db!.Trim().ToLowerInvariant())
            .ToDictionary(g => g.Key, g => g.First().FirmKey);

    /// <summary>Guruh kaliti (filtrda ham shu ishlatiladi, aks holda eski log yozuvlari firma filtridan tushib qoladi).</summary>
    public static string KeyOf(Problem p, IReadOnlyDictionary<string, string> innByDb) =>
        string.IsNullOrWhiteSpace(p.Inn) && !string.IsNullOrWhiteSpace(p.Db) && innByDb.TryGetValue(p.Db.Trim().ToLowerInvariant(), out var k)
            ? k : p.FirmKey;
}

/// <summary>Ro'yxat filtri (sana, firma, bo'lim, daraja, matn).</summary>
public sealed record ProblemFilter(DateTime? From = null, DateTime? To = null, string? FirmKey = null, string? Feature = null, string? Level = null, string? Text = null)
{
    /// <summary>Firma kaliti qanday olinadi (guruhlashdagi bilan bir xil bo'lishi uchun); berilmasa — Problem.FirmKey.</summary>
    public Func<Problem, string>? KeyOf { get; init; }

    public bool Match(Problem p)
    {
        var local = p.Time.LocalDateTime;
        if (From is { } f && local < f.Date) return false;
        if (To is { } t && local >= t.Date.AddDays(1)) return false;
        if (!string.IsNullOrEmpty(FirmKey) && (KeyOf?.Invoke(p) ?? p.FirmKey) != FirmKey) return false;
        if (!string.IsNullOrEmpty(Feature) && p.Feature != Feature) return false;
        if (!string.IsNullOrEmpty(Level) && p.Level != Level) return false;
        if (!string.IsNullOrWhiteSpace(Text))
            foreach (var word in Text.Split(' ', StringSplitOptions.RemoveEmptyEntries))
                if (!Contains(p.Message, word) && !Contains(p.FirmTitle, word) && !Contains(p.Inn, word)
                    && !Contains(p.Pc, word) && !Contains(p.Details, word))
                    return false;
        return true;
    }

    static bool Contains(string? s, string word) => s is not null && s.Contains(word, StringComparison.OrdinalIgnoreCase);
}
