using System.Globalization;
using System.Text.RegularExpressions;

namespace IshonchDesktop.Crm;

/// <summary>PDF (OCR) matnidan shablon bo'yicha topilgan shartnoma maydonlari. Topilmagani null.</summary>
public sealed record PdfContractFields(decimal? Sum, string? ExpireDate, string? PartnerAccount, string? PartnerMfo);

/// <summary>
/// Shartnoma PDF matnidan (OCR natijasi) shablon asosida maydonlarni ajratadi: umumiy summa, amal qilish muddati,
/// hamkorning hisob raqami (р/с) va MFO. Rus va o'zbek (kirill/lotin) shartnomalarining odatiy iboralari bo'yicha.
/// OCR xatolari (raqam o'rnida О/З/l, «№» o'rnida «N2») hisobga olinadi. Tarmoqsiz — to'liq testlanadi.
/// </summary>
public static class ContractPdfTemplate
{
    public static PdfContractFields Parse(string text, string? firmAccount = null, string? firmMfo = null)
    {
        var t = Normalize(text);
        var (acc, mfo) = Bank(t, firmAccount, firmMfo);
        return new PdfContractFields(Sum(t), Expire(t), acc, mfo);
    }

    // ---- OCR matnini tozalash ----------------------------------------------------------------------

    /// <summary>Bo'shliqlar bitta; raqamlar orasidagi OCR xatolari tuzatiladi («2()26» → «2026», «О1О71» → «01071»).</summary>
    public static string Normalize(string s)
    {
        s = (s ?? "").Replace(' ', ' ').Replace(' ', ' ');
        s = s.Replace("()", "0");
        // Raqamlar ketma-ketligi ichida (yoki yonida) kelgan harf-raqam chalkashliklari
        // Ketma-ket: avval raqamlar orasidagisi («1О71» → «1071»), keyin boshidagisi («:О1071» → «:01071»)
        for (var i = 0; i < 2; i++) s = Regex.Replace(s, @"(?<=\d)[ОOоo](?=[ОOоo]?\d)", "0");
        s = Regex.Replace(s, @"(?<=[:\s№])[ОOоo](?=\d{3,})", "0");
        s = Regex.Replace(s, @"(?<=\d)[З](?=\d)", "3");
        s = Regex.Replace(s, @"(?<=\d)[lI|](?=\d)", "1");
        s = Regex.Replace(s, @"[ \t]+", " ");
        return s;
    }

    // «3000 000 000» (OCR birinchi guruhni 4 raqam qilib qo'yadi) ham olinadi
    static readonly string Num = @"(\d{1,4}(?:[ .,]\d{3})+(?:[.,]\d{1,2})?|\d{4,}(?:[.,]\d{1,2})?)";

    // ---- summa ----------------------------------------------------------------------------------------

    static readonly Regex SumRe = new(
        @"(?:общая\s+(?:стоимость|сумма)|сумма\s+(?:настоящего\s+)?договора|стоимость\s+(?:настоящего\s+)?договора|цена\s+договора|" +
        @"умумий\s+(?:сумма(?:си)?|қиймат(?:и)?|киймат(?:и)?|нарх(?:и)?)|шартнома(?:нинг)?\s+(?:умумий\s+)?(?:сумма(?:си)?|қиймати|киймати)|" +
        @"umumiy\s+(?:summa(?:si)?|qiymat(?:i)?)|shartnoma(?:ning)?\s+(?:umumiy\s+)?(?:summa(?:si)?|qiymati))" +
        @"[^\d]{0,90}?" + Num, RegexOptions.IgnoreCase);

    public static decimal? Sum(string t)
    {
        foreach (Match m in SumRe.Matches(t))
            if (ContractTerms.ParseAmount(m.Groups[1].Value) is > 1000 and var d) return d;
        return null;
    }

    // ---- amal qilish muddati ------------------------------------------------------------------------------

    static readonly Regex ExpireRe = new(
        @"(?:срок\s+действия(?:\s+настоящего)?(?:\s+договора)?|договор\s+действует|действует\s+до|вступает\s+в\s+силу[^.]{0,80}?действует|" +
        @"амал\s+қилиш\s+муддати|амал\s+килиш\s+муддати|амал\s+қилади|амал\s+килади|amal\s+qilish\s+muddati|amal\s+qiladi)" +
        @"[^\d]{0,60}?(\d{1,2}[./]\d{1,2}[./]\d{2,4}|\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}|[«""]?\d{1,2}[»""]?\s+[а-яёa-zʻ'ўқғҳ]+\s+\d{4})",
        RegexOptions.IgnoreCase);

    static readonly Regex ExpireUzRe = new(
        @"(\d{1,2}[./]\d{1,2}[./]\d{4}|\d{4}[.\-]\d{1,2}[.\-]\d{1,2}|[«""]?\d{1,2}[»""]?\s+[а-яёa-zʻ'ўқғҳ]+\s+\d{4})\s*(?:й(?:ил)?\.?\s*|yil\s*|г(?:ода)?\.?\s*)?(?:га\s+қадар|гача|ga\s+qadar|gacha)[^.]{0,40}?(?:амал|amal|кучда|kuchda)",
        RegexOptions.IgnoreCase);

    public static string? Expire(string t)
    {
        var m = ExpireRe.Match(t);
        if (m.Success && ParseDate(m.Groups[1].Value) is { } d) return d;
        m = ExpireUzRe.Match(t);
        return m.Success ? ParseDate(m.Groups[1].Value) : null;
    }

    static readonly (string Stem, int Month)[] Months =
    {
        ("январ", 1), ("феврал", 2), ("март", 3), ("апрел", 4), ("ма", 5), ("июн", 6), ("июл", 7), ("август", 8), ("сентябр", 9),
        ("октябр", 10), ("ноябр", 11), ("декабр", 12),
        ("yanvar", 1), ("fevral", 2), ("mart", 3), ("aprel", 4), ("may", 5), ("iyun", 6), ("iyul", 7), ("avgust", 8), ("sentabr", 9),
        ("oktabr", 10), ("noyabr", 11), ("dekabr", 12),
    };

    /// <summary>«31.12.2026», «2026-12-31», «31 декабря 2026», ««31» dekabr 2026» → «2026-12-31».</summary>
    public static string? ParseDate(string s)
    {
        s = s.Trim().Trim('«', '»', '"');
        var m = Regex.Match(s, @"^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$");
        if (m.Success) return Iso(Year(m.Groups[3].Value), int.Parse(m.Groups[2].Value), int.Parse(m.Groups[1].Value));
        m = Regex.Match(s, @"^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$");
        if (m.Success) return Iso(int.Parse(m.Groups[1].Value), int.Parse(m.Groups[2].Value), int.Parse(m.Groups[3].Value));
        m = Regex.Match(s, @"^(\d{1,2})[»""]?\s+(\S+)\s+(\d{4})$");
        if (!m.Success) return null;
        var word = m.Groups[2].Value.ToLowerInvariant();
        // «ма» (май/мая) eng qisqa o'zak — «март» dan keyin tekshiriladi
        foreach (var (stem, month) in Months.OrderByDescending(x => x.Stem.Length))
            if (word.StartsWith(stem)) return Iso(int.Parse(m.Groups[3].Value), month, int.Parse(m.Groups[1].Value));
        return null;
    }

    static int Year(string y) => y.Length == 2 ? 2000 + int.Parse(y) : int.Parse(y);

    static string? Iso(int y, int mo, int d) =>
        y is >= 2000 and <= 2100 && DateTime.TryParseExact($"{y:D4}-{mo:D2}-{d:D2}", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _)
            ? $"{y:D4}-{mo:D2}-{d:D2}" : null;

    // ---- rekvizitlar ---------------------------------------------------------------------------------------

    static readonly Regex AccountRe = new(@"(?<!\d)(2\d{3}[ ]?\d{4}[ ]?\d{4}[ ]?\d{4}[ ]?\d{4})(?!\d)");
    static readonly Regex MfoRe = new(@"(?:МФО|MFO|МФУ|Код\s+банка|Банк\s+коди|Bank\s+kodi)\s*[:№N]?\s*(\d{5})(?!\d)", RegexOptions.IgnoreCase);

    /// <summary>
    /// Hamkorning hisob raqami: matndagi 20 xonali hisoblardan firmaning o'z hisobidan boshqasi (birinchisi).
    /// MFO: «МФО / Код банка» yonidagi 5 raqamdan firmaning o'z MFO sidan boshqasi; bir nechta bo'lsa — hamkor hisobiga eng yaqini.
    /// </summary>
    public static (string? account, string? mfo) Bank(string t, string? firmAccount, string? firmMfo)
    {
        var accs = AccountRe.Matches(t).Select(m => (v: m.Groups[1].Value.Replace(" ", ""), at: m.Index))
            .Where(a => a.v.StartsWith("2020") || a.v.StartsWith("2021") || a.v.StartsWith("2310") || a.v.StartsWith("2"))
            .ToList();
        var partner = accs.FirstOrDefault(a => a.v != (firmAccount ?? ""));
        var mfos = MfoRe.Matches(t).Select(m => (v: m.Groups[1].Value, at: m.Index))
            .Where(m => m.v != (firmMfo ?? "")).ToList();
        string? mfo = null;
        if (mfos.Count == 1) mfo = mfos[0].v;
        else if (mfos.Count > 1)
        {
            // Firma hisobiga yaqin turgan MFO lar firmaniki bo'lishi ehtimoli katta: hamkor hisobiga eng yaqini olinadi
            var firm = accs.FirstOrDefault(a => a.v == (firmAccount ?? ""));
            mfo = partner.v is null ? mfos[0].v
                : mfos.OrderBy(m => Math.Abs(m.at - partner.at) - (firm.v is null ? 0 : Math.Min(Math.Abs(m.at - firm.at), 400) / 4)).First().v;
        }
        return (partner.v, mfo);
    }
}
