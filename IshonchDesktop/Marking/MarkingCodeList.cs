using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using ExcelDataReader;

namespace IshonchDesktop.Marking;

/// <summary>Bitta markirovka kodining my.soliq.uz dagi tekshiruv natijasi («Markirovka tekshirish» bo'limi uchun).</summary>
/// <param name="Verdict">available — sotsa bo'ladi; sold — sotilgan yoki boshqa STIR da; unknown — aniqlanmadi.</param>
public sealed record MarkingCheckRow(string Code, string Verdict, string Operation, string LastStir, string Product, string Mxik, string Note, bool NotLoggedIn)
{
    /// <summary>Mahsulot hajmi, importyor, shtrix-kod, oxirgi egasi va operatsiya sanasi (my.soliq.uz tarixidan).</summary>
    public string Size { get; init; } = "";
    public string Importer { get; init; } = "";
    public string Barcode { get; init; } = "";
    public string Company { get; init; } = "";
    public string Date { get; init; } = "";
    /// <summary>tasnif.soliq.uz: shu shtrix-kod (GTIN) bo'yicha MXIK lar va ularning nomi; bo'sh — so'ralmagan.</summary>
    public string TasnifStatus { get; init; } = "";
    public string TasnifMxik { get; init; } = "";
    public string TasnifName { get; init; } = "";

    /// <summary>my.soliq.uz dagi MXIK tasnifdagilar orasida bormi.</summary>
    public string MxikMatch => TasnifMxik.Length == 0 || Mxik.Length == 0 ? "" : TasnifMxik.Split(", ").Contains(Mxik) ? "✓ Mos" : "✗ Mos emas";

    public string VerdictText => Verdict switch
    {
        "available" => "Sotsa bo'ladi",
        "sold" => "Sotib bo'lmaydi",
        _ => "Aniqlanmadi",
    };
}

/// <summary>
/// «Markirovka tekshirish» bo'limining 1C ga va chekka bog'liq bo'lmagan qismi: matn yoki fayldan kodlarni ajratish va
/// my.soliq.uz javobini jadval qatoriga aylantirish.
/// </summary>
public static class MarkingCodeList
{
    /// <summary>GS1 markirovka kodi: «01» + 14 raqamli GTIN bilan boshlanadi (keyin «21» + seriya).</summary>
    static readonly Regex CodeStart = new(@"^01\d{14}", RegexOptions.Compiled);

    public static bool LooksLikeCode(string? s) => s is not null && s.Length >= 18 && CodeStart.IsMatch(s);

    /// <summary>Ko'rinmas belgilar (jumladan skaner qo'yadigan GS, 0x1D) va chetdagi bo'shliqlar olib tashlanadi.</summary>
    public static string Clean(string? s) => Regex.Replace(s ?? "", @"[\x00-\x1f]", "").Trim();

    /// <summary>
    /// Matndan kodlar: har qatorda bitta kod. Qatorda bir nechta ustun bo'lsa (Excel dan nusxalangan — tab) ulardan
    /// markirovka kodiga o'xshaganlari olinadi; hech biri o'xshamasa qatorning o'zi olinadi (foydalanuvchi nima qo'ygan bo'lsa).
    /// Kod ichida «;», «,» va tirnoq bo'lishi mumkin — ular ajratuvchi emas. Takrorlar bir marta, tartib saqlanadi.
    /// </summary>
    public static List<string> FromText(string? text)
    {
        var result = new List<string>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var raw in (text ?? "").Split('\n'))
        {
            var cells = raw.Split('\t').Select(Clean).Where(c => c.Length > 0).ToList();
            if (cells.Count == 0) continue;
            var codes = cells.Where(LooksLikeCode).ToList();
            if (codes.Count == 0 && cells.Count == 1 && cells[0].Length >= 10 && !cells[0].Contains(' ')) codes.Add(cells[0]);
            foreach (var c in codes) if (seen.Add(c)) result.Add(c);
        }
        return result;
    }

    /// <summary>Jadval kataklaridan (Excel) markirovka kodiga o'xshaganlari: qaysi ustunda turgani ahamiyatsiz.</summary>
    public static List<string> FromCells(IEnumerable<object?[]> rows)
    {
        var result = new List<string>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var row in rows)
            foreach (var cell in row)
            {
                var s = Clean(cell?.ToString());
                if (LooksLikeCode(s) && seen.Add(s)) result.Add(s);
            }
        return result;
    }

    /// <summary>.txt / .csv — matn sifatida, .xls / .xlsx — hamma varaqlarning hamma kataklari.</summary>
    public static List<string> FromFile(string path)
    {
        var ext = Path.GetExtension(path).ToLowerInvariant();
        if (ext is not (".xls" or ".xlsx")) return FromText(File.ReadAllText(path));
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        using var reader = ExcelReaderFactory.CreateReader(stream);
        var rows = new List<object?[]>();
        do
        {
            while (reader.Read())
            {
                var cells = new object?[reader.FieldCount];
                for (var i = 0; i < cells.Length; i++) cells[i] = reader.GetValue(i);
                rows.Add(cells);
            }
        } while (reader.NextResult());
        return FromCells(rows);
    }

    /// <summary><see cref="SoliqBridge.CheckAsync"/> javobidan jadval qatori.</summary>
    public static MarkingCheckRow ToRow(string code, JsonElement r)
    {
        static string S(JsonElement e, string n) => e.ValueKind == JsonValueKind.Object && e.TryGetProperty(n, out var v)
            ? v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : v.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined ? "" : v.ToString() : "";
        static string D(string s) => Regex.Replace(s, @"\D", "");
        var verdict = S(r, "verdict") is { Length: > 0 } v0 ? v0 : "unknown";
        var history = r.ValueKind == JsonValueKind.Object && r.TryGetProperty("history", out var h) ? h : default;
        var last = history.ValueKind == JsonValueKind.Object && history.TryGetProperty("last", out var l) ? l : default;
        var notLoggedIn = r.ValueKind == JsonValueKind.Object && r.TryGetProperty("notLoggedIn", out var nl) && nl.ValueKind == JsonValueKind.True;
        var note = S(r, "reason");
        if (note.Length == 0) note = S(r, "error");
        if (note.Length == 0 && verdict == "sold")
            note = r.TryGetProperty("stirMatch", out var sm) && sm.ValueKind == JsonValueKind.False ? "oxirgi egasi boshqa STIR" : "sotilgan yoki muomaladan chiqqan";
        return new MarkingCheckRow(code, verdict, S(r, "operation"), D(S(r, "lastStir")), S(history, "product"), D(S(history, "mxik")), note, notLoggedIn)
        {
            Size = S(history, "size"), Importer = S(history, "importer"), Barcode = D(S(history, "barcode")),
            Company = S(last, "company"), Date = S(last, "date"),
        };
    }

    /// <summary>Markirovka kodidagi GTIN dan shtrix-kod: 01 + 14 raqam → boshidagi nollarsiz (0104780074206916… → 4780074206916).</summary>
    public static string BarcodeOf(string code)
    {
        var m = Regex.Match(Clean(code), @"^01(\d{14})");
        return m.Success ? m.Groups[1].Value.TrimStart('0') : "";
    }

    /// <summary>tasnif.soliq.uz javobidan (data.content[]) MXIK kodlari va nomlari.</summary>
    public static (string Status, string Mxik, string Name) ParseTasnif(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("data", out var d) || d.ValueKind != JsonValueKind.Object
            || !d.TryGetProperty("content", out var list) || list.ValueKind != JsonValueKind.Array || list.GetArrayLength() == 0)
            return ("Topilmadi", "", "");
        static string F(JsonElement e, string n) => e.TryGetProperty(n, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
        var items = list.EnumerateArray().Where(e => e.ValueKind == JsonValueKind.Object).ToList();
        return ("Bor", string.Join(", ", items.Select(e => F(e, "mxikCode")).Where(x => x.Length > 0)),
            string.Join(" | ", items.Select(e => F(e, "mxikName")).Where(x => x.Length > 0)));
    }

    /// <summary>Natija jadvali (.xlsx ga): birinchi qator — sarlavha.</summary>
    public static List<object?[]> ToSheet(IEnumerable<MarkingCheckRow> rows)
    {
        var sheet = new List<object?[]>
        {
            new object?[] { "№", "Markirovka kodi", "Natija", "Izoh", "Mahsulot nomi", "Hajmi", "Importyor nomi", "MXIK", "Shtrix kodi", "Oxirgi operatsiya",
                "Sana", "Oxirgi egasi STIR", "Oxirgi egasi", "Tasnifda", "Tasnif: MXIK", "Tasnif: MXIK nomi", "MXIK mosligi" },
        };
        var n = 0;
        foreach (var r in rows)
            sheet.Add(new object?[] { ++n, r.Code, (r.Verdict == "available" ? "✓ " : r.Verdict == "sold" ? "✗ " : "") + r.VerdictText, r.Note, r.Product, r.Size,
                r.Importer, r.Mxik, r.Barcode, r.Operation, r.Date, r.LastStir, r.Company, r.TasnifStatus, r.TasnifMxik, r.TasnifName, r.MxikMatch });
        return sheet;
    }
}
