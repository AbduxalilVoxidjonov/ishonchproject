using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace IshonchDesktop.Crm;

/// <summary>Fakturadagi bitta tovar qatori (Didox faktura JSON'idan).</summary>
public sealed record InvoiceLine(string Name, string CatalogCode, string CatalogName, decimal Sum, bool Marked);

/// <summary>Didox ro'yxatidagi faktura (eng oxirgisini tanlash uchun).</summary>
public sealed record InvoiceRef(string DocId, int Owner, string ContractNo, string Date, string Created);

/// <summary>
/// CRM «Шартнома яратиш» oynasi uchun summa va maqsad qoidalari (Didox ma'lumotidan, 1C ishlatilmaydi):
/// <list type="bullet">
/// <item>Summa — shartnomada YOZILGAN summa (tovar qatoridagi narx emas: u ko'pincha shartnoma summasi bo'lmaydi).
/// Shartnomada summa yo'q bo'lsa — 1 000 000 000 va eslatma.</item>
/// <item>Maqsad — shu shartnoma raqami bo'yicha eng oxirgi fakturadagi tovarlardan: markirovkali tovar bo'lsa uning
/// guruhi (masalan «Maishiy texnika»), markirovkasiz bo'lsa — tovar turi (MXIK guruhi yoki katalog nomi).</item>
/// </list>
/// Tarmoq so'rovlari yo'q — faqat JSON'ni tahlil qiladi, shuning uchun to'liq tekshiriladi.
/// </summary>
public static class ContractTerms
{
    public const decimal DefaultSum = 1_000_000_000m;
    public const string NoSumNote = "Shartnomada summa ko'rsatilmagan — 1 000 000 000 so'm kiritildi, tekshiring";

    // ---- summa ----------------------------------------------------------------------------------

    /// <summary>Shartnoma summasi: topilsa o'zi (eslatmasiz), topilmasa 1 mlrd va eslatma.</summary>
    public static (decimal Sum, string Note) SumOrDefault(decimal? stated) =>
        stated is > 0 ? (stated.Value, "") : (DefaultSum, NoSumNote);

    static readonly string[] SumKeys = { "contractsum", "totalsum", "summa", "sum", "amount", "contractamount" };

    /// <summary>
    /// Didox shartnoma JSON'idan (data.json) shartnomada yozilgan summa: avval alohida summa maydoni
    /// (contractdoc yoki ildizda), bo'lmasa shartnoma bandlari matnidan («Шартноманинг умумий суммаси … сўм»).
    /// Tovar qatorlaridagi narx hisobga OLINMAYDI. Topilmasa null.
    /// </summary>
    public static decimal? StatedSum(JsonNode? contractJson)
    {
        if (contractJson is null) return null;
        foreach (var holder in new[] { contractJson["contractdoc"] as JsonObject, contractJson as JsonObject })
            foreach (var k in SumKeys)
                if (holder?[k] is JsonValue v && Dec(v) is > 0 and var d) return d;
        var texts = new List<string>();
        Collect(contractJson["parts"], texts);
        Collect(contractJson["contractdoc"]?["contractname"], texts);
        foreach (var t in texts)
            if (SumFromText(t) is { } s) return s;
        return null;
    }

    static readonly Regex SumPhrase = new(
        @"(?:умумий\s+(?:сумма(?:си)?|қиймат(?:и)?|киймат(?:и)?)|umumiy\s+(?:summa(?:si)?|qiymat(?:i)?)|общая\s+сумма|сумма\s+(?:настоящего\s+)?договора|шартнома(?:нинг)?\s+(?:умумий\s+)?(?:сумма(?:си)?|қиймати)|shartnoma(?:ning)?\s+(?:umumiy\s+)?(?:summa(?:si)?|qiymati))[^\d]{0,60}?(\d{1,3}(?:[  .,]\d{3})+(?:[.,]\d{1,2})?|\d{4,}(?:[.,]\d{1,2})?)",
        RegexOptions.IgnoreCase);

    /// <summary>Matndan shartnoma summasini oladi («… умумий суммаси 150 000 000 (бир юз эллик миллион) сўм …»).</summary>
    public static decimal? SumFromText(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var m = SumPhrase.Match(text);
        return m.Success && ParseAmount(m.Groups[1].Value) is > 0 and var d ? d : null;
    }

    /// <summary>«150 000 000», «150.000.000,00», «1,500,000.50», «150000000» → son.</summary>
    public static decimal? ParseAmount(string s)
    {
        s = Regex.Replace(s ?? "", @"[\s ]", "");
        // Oxirgi ajratkichdan keyin 1–2 raqam — kasr qismi; qolgan ajratkichlar — minglik
        var frac = Regex.Match(s, @"[.,](\d{1,2})$");
        var whole = frac.Success ? s[..frac.Index] : s;
        whole = Regex.Replace(whole, @"[.,]", "");
        var text = whole + (frac.Success ? "." + frac.Groups[1].Value : "");
        return decimal.TryParse(text, NumberStyles.Number, CultureInfo.InvariantCulture, out var v) ? v : null;
    }

    static void Collect(JsonNode? n, List<string> into)
    {
        switch (n)
        {
            case JsonValue v when v.GetValueKind() == JsonValueKind.String: into.Add(v.GetValue<string>()); break;
            case JsonArray a: foreach (var x in a) Collect(x, into); break;
            case JsonObject o: foreach (var (_, x) in o) Collect(x, into); break;
        }
    }

    // ---- eng oxirgi faktura -----------------------------------------------------------------------

    /// <summary>Shartnoma raqamini taqqoslash uchun: «№ 12/A-2025» → «12A2025».</summary>
    public static string NormContractNo(string? s) =>
        Regex.Replace((s ?? "").ToUpperInvariant().Replace("№", ""), @"[^\p{L}\p{Nd}]", "");

    /// <summary>Shu shartnoma raqamidagi fakturalardan eng oxirgisi (sana, keyin yaratilgan vaqt bo'yicha). Yo'q bo'lsa null.</summary>
    public static InvoiceRef? LatestFor(IEnumerable<InvoiceRef> invoices, string contractNo)
    {
        var want = NormContractNo(contractNo);
        if (want.Length == 0) return null;
        return invoices.Where(i => NormContractNo(i.ContractNo) == want)
            .OrderByDescending(i => DateKey(i.Date)).ThenByDescending(i => i.Created, StringComparer.Ordinal).FirstOrDefault();
    }

    static string DateKey(string d)
    {
        var m = Regex.Match(d ?? "", @"(\d{2})\.(\d{2})\.(\d{4})");
        return m.Success ? $"{m.Groups[3]}-{m.Groups[2]}-{m.Groups[1]}" : (d ?? "");
    }

    /// <summary>Didox faktura JSON'idan (data.json) shartnoma raqami.</summary>
    public static string InvoiceContractNo(JsonNode? invoiceJson) => Str(invoiceJson?["contractdoc"]?["contractno"]).Trim();

    /// <summary>Didox faktura JSON'idagi tovar qatorlari (productlist.products yoki products).</summary>
    public static List<InvoiceLine> InvoiceLines(JsonNode? invoiceJson)
    {
        var arr = invoiceJson?["productlist"]?["products"] as JsonArray ?? invoiceJson?["products"] as JsonArray ?? new JsonArray();
        var res = new List<InvoiceLine>();
        foreach (var p in arr)
        {
            if (p is null) continue;
            var sum = Dec(p["deliverysumwithvat"]) is > 0 and var a ? a : Dec(p["deliverysum"]) is > 0 and var b ? b : Dec(p["summa"]) * Math.Max(1, Dec(p["count"]));
            res.Add(new InvoiceLine(Str(p["name"]).Trim(), Regex.Replace(Str(p["catalogcode"]), @"\D", ""), Str(p["catalogname"]).Trim(), sum, IsMarked(p["marks"])));
        }
        return res;
    }

    /// <summary>Qatorda markirovka kodlari bor (kiz / nomupak / identtransupak) — markirovkali tovar.</summary>
    static bool IsMarked(JsonNode? marks)
    {
        if (marks is not JsonObject o) return false;
        foreach (var k in new[] { "kiz", "nomupak", "identtransupak" })
            if (o[k] is JsonArray a && a.Any(x => Str(x).Trim().Length > 0)) return true;
        return false;
    }

    // ---- maqsad -----------------------------------------------------------------------------------

    /// <summary>
    /// MXIK (IKPU) kodining boshidagi 3 raqam — tovar guruhi (TIF TN bo'limi). Markirovka qilinadigan va keng tarqalgan
    /// guruhlar uchun o'qiladigan nom; qolganlari uchun katalog nomi ishlatiladi.
    /// </summary>
    static readonly (string Prefix, string Name)[] Groups =
    {
        ("084", "Maishiy texnika"), ("085", "Maishiy texnika"),
        ("024", "Tamaki mahsulotlari"),
        ("022", "Ichimliklar"),
        ("030", "Dori vositalari"),
        ("033", "Parfyumeriya va kosmetika mahsulotlari"),
        ("034", "Maishiy kimyo mahsulotlari"),
        ("040", "Shinalar va rezina mahsulotlari"),
        ("061", "Kiyim-kechak"), ("062", "Kiyim-kechak"), ("063", "To'qimachilik mahsulotlari"),
        ("064", "Poyabzal"),
        ("094", "Mebel"),
        ("095", "O'yinchoqlar va sport anjomlari"),
        ("087", "Avtomobil ehtiyot qismlari"),
        ("090", "Optika va o'lchov asboblari"),
        ("091", "Soatlar"),
        ("073", "Metall buyumlar"),
        ("039", "Plastmassa buyumlar"),
        ("048", "Qog'oz mahsulotlari"),
    };

    /// <summary>Bitta qatorning tovar turi: ma'lum MXIK guruhi nomi, bo'lmasa katalog nomi, bo'lmasa tovar nomi.</summary>
    public static string KindOf(InvoiceLine l)
    {
        var code = l.CatalogCode.PadLeft(17, '0');
        if (l.CatalogCode.Length >= 3)
            foreach (var (prefix, name) in Groups)
                if (code.StartsWith(prefix, StringComparison.Ordinal)) return name;
        return l.CatalogName.Length > 0 ? l.CatalogName : l.Name;
    }

    /// <summary>
    /// Fakturadan shartnoma maqsadi. Markirovkali qatorlar bo'lsa — faqat ular hisobga olinadi (masalan maishiy texnika),
    /// bo'lmasa hamma qatorlar. Turlar summasi bo'yicha kamayish tartibida, ko'pi bilan 3 tasi: «Maishiy texnika; Mebel».
    /// Qator bo'lmasa bo'sh satr.
    /// </summary>
    public static string PurposeFrom(IReadOnlyCollection<InvoiceLine> lines)
    {
        var use = lines.Any(l => l.Marked) ? lines.Where(l => l.Marked).ToList() : lines.ToList();
        var kinds = use.Select(l => (kind: KindOf(l).Trim(), l.Sum)).Where(x => x.kind.Length > 0)
            .GroupBy(x => x.kind, StringComparer.OrdinalIgnoreCase)
            .Select(g => (kind: g.First().kind, sum: g.Sum(x => x.Sum), n: g.Count()))
            .OrderByDescending(x => x.sum).ThenByDescending(x => x.n).Select(x => x.kind).Take(3).ToList();
        return kinds.Count == 0 ? "" : string.Join("; ", kinds);
    }

    // ---- yordamchilar -------------------------------------------------------------------------------

    static string Str(JsonNode? n)
    {
        if (n is null) return "";
        try { return n.GetValueKind() == JsonValueKind.String ? n.GetValue<string>() : n.ToJsonString().Trim('"'); }
        catch { return ""; }
    }

    static decimal Dec(JsonNode? n) =>
        decimal.TryParse(Str(n).Replace(" ", "").Replace(',', '.'), NumberStyles.Number, CultureInfo.InvariantCulture, out var v) ? v : 0;
}
