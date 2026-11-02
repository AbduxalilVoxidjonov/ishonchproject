using System.Text.Json;
using IshonchDesktop.Models;

namespace IshonchDesktop.Epos;

/// <summary>1C chekidagi qator + chek uchun kerak bo'lgan IKPU (MXIK) va qadoq kodi.</summary>
public sealed class SaleLine
{
    public required ReceiptLine Source { get; init; }
    public string ClassCode { get; set; } = "";
    public string PackageCode { get; set; } = "";
    public string? Barcode { get; set; }
    public int VatPercent { get; set; } = 12;

    public string Name => Source.Name;
    public bool IsMarked => Source.Codes.Count > 0;

    /// <summary>Har bir kodning my.soliq.uz dagi MXIK i (kod → 17 xonali; noma'lumi yo'q).</summary>
    public Dictionary<string, string> CodeMxik { get; } = new();

    /// <summary>MXIK i qatorning IKPU sidan farq qiladigan kodlar: bunday kod shu qator bilan sotilmaydi.</summary>
    public IEnumerable<string> WrongIkpuCodes() =>
        Source.Codes.Where(c => CodeMxik.TryGetValue(c, out var m) && m.Length == 17 && ClassCode.Length == 17 && m != ClassCode);

    /// <summary>Qator jami QQS bilan (1C dagi «Всего»; bo'lmasa narx × miqdor).</summary>
    public decimal Total => Source.LineTotal ?? Source.UnitPrice * Source.Quantity;

    /// <summary>QQS summasi (1C dagi «НДС»; bo'lmasa jami ichidan hisoblanadi).</summary>
    public decimal VatSum => Source.VatSum ?? Math.Round(Total * VatPercent / (100m + VatPercent), 2, MidpointRounding.AwayFromZero);

    /// <summary>Summa QQS'siz (1C dagi «Сумма»).</summary>
    public decimal NetSum => Source.NetSum ?? Total - VatSum;

    /// <summary>Bir dona narxi QQS'siz (1C dagi «Цена»).</summary>
    public decimal NetPrice => Source.NetPrice ?? (Source.Quantity > 0 ? Math.Round(NetSum / Source.Quantity, 2, MidpointRounding.AwayFromZero) : 0);

    /// <summary>Qator chek uchun tayyor emasligining sababi (tayyor bo'lsa null).</summary>
    public string? Problem()
    {
        if (ClassCode.Length != 17 || !ClassCode.All(char.IsDigit)) return "IKPU (MXIK) kodi 17 ta raqam bo'lishi kerak";
        if (PackageCode.Length == 0) return "qadoq kodi yo'q";
        if (Source.UnitPrice <= 0) return "narx yo'q";
        if (IsMarked && Source.Codes.Count < Source.Quantity) return $"{Source.Quantity} dona uchun {Source.Codes.Count} ta kod bor";
        if (WrongIkpuCodes().Count() is > 0 and var wrong) return $"{wrong} ta kod boshqa IKPU da (soliq.uz) — bu kodlarni sotib bo'lmaydi";
        return null;
    }
}

/// <summary>Chek qatorlarini UzPOS shakliga o'giradi. Hisob-kitob Communicator ning QQS tekshiruvi (xato ≤ 10 tiyin) bilan mos.</summary>
public static class SaleBuilder
{
    /// <summary>Miqdor mingdan bir ulushda: 1 dona = 1000.</summary>
    public const long PieceAmount = 1000;

    public static long ToTiyin(decimal sum) => (long)Math.Round(sum * 100m, MidpointRounding.AwayFromZero);

    /// <summary>Narx ichiga kiritilgan QQS: narx × stavka / (100 + stavka).</summary>
    public static long VatIncluded(long priceTiyin, int vatPercent) =>
        vatPercent == 0 ? 0 : (long)Math.Round(priceTiyin * (decimal)vatPercent / (100 + vatPercent), MidpointRounding.AwayFromZero);

    /// <summary>
    /// Markirovkali tovar: har bir kod uchun alohida qator (1 dona, o'z kodi bilan). Markirovkasiz tovar:
    /// bitta qator, miqdori dona × 1000. Narx — 1C dagi birlik narxi (ustamasiz).
    /// </summary>
    public static List<SaleItem> Build(IEnumerable<SaleLine> lines)
    {
        var items = new List<SaleItem>();
        foreach (var l in lines)
        {
            if (l.Problem() is { } problem) throw new ArgumentException($"{l.Name}: {problem}");
            var unit = ToTiyin(l.Source.UnitPrice);
            if (l.IsMarked)
            {
                // 1C qator jami bo'lsa — donalarga tiyingacha aniq bo'linadi (qoldiq tiyinlar birinchi donalarga), shunda chek
                // jami 1C dagidan farq qilmaydi; bo'lmasa har dona birlik narxida
                var count = (int)l.Source.Quantity;
                var total = l.Source.LineTotal is { } lt ? ToTiyin(lt) : unit * count;
                var each = total / count;
                var extra = total - each * count;
                for (var i = 0; i < count; i++)
                {
                    var price = each + (i < extra ? 1 : 0);
                    items.Add(new SaleItem(l.ClassCode, l.PackageCode, l.Name, price, PieceAmount,
                        VatIncluded(price, l.VatPercent), l.VatPercent, l.Source.Codes[i], l.Barcode));
                }
            }
            else
            {
                // Gramm tovarda miqdor kasr: miqdor mingdan bir ulushda (8,33 g = 8330), summa tiyingacha yaxlitlanadi
                var price = l.Source.LineTotal is { } lt ? ToTiyin(lt) : (long)Math.Round(unit * l.Source.Quantity, MidpointRounding.AwayFromZero);
                items.Add(new SaleItem(l.ClassCode, l.PackageCode, l.Name, price, (long)Math.Round(PieceAmount * l.Source.Quantity, MidpointRounding.AwayFromZero),
                    VatIncluded(price, l.VatPercent), l.VatPercent, null, l.Barcode));
            }
        }
        return items;
    }

    public static long Total(IEnumerable<SaleItem> items) => items.Sum(i => i.PriceTiyin);
}

/// <summary>1C tovar nomi → IKPU va qadoq kodi. Bir marta aniqlansa eslab qolinadi (baza bo'yicha alohida).</summary>
public sealed class ProductMap
{
    sealed record Entry(string ClassCode, string PackageCode, string? Barcode);

    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    readonly string path;
    readonly Dictionary<string, Entry> map;

    public ProductMap(BaseEntry b)
    {
        path = Path.Combine(Paths.AppData, "uzpos-map-" + b.ProfileKey + ".json");
        try { map = JsonSerializer.Deserialize<Dictionary<string, Entry>>(File.ReadAllText(path), Json) ?? new(); }
        catch { map = new(); }
    }

    static string Key(string name) => string.Join(' ', name.ToLowerInvariant().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));

    public void Apply(SaleLine line)
    {
        if (!map.TryGetValue(Key(line.Name), out var e)) return;
        line.ClassCode = e.ClassCode;
        line.PackageCode = e.PackageCode;
        line.Barcode ??= e.Barcode;
    }

    public void Save(SaleLine line)
    {
        if (line.ClassCode.Length == 0) return;
        map[Key(line.Name)] = new Entry(line.ClassCode, line.PackageCode, line.Barcode);
        File.WriteAllText(path, JsonSerializer.Serialize(map, Json));
    }
}

/// <summary>Qaysi 1C cheklari sotilgani: bir chekni ikki marta fiskallashdan saqlaydi.</summary>
public sealed class SoldLog
{
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    readonly string path;
    readonly Dictionary<string, string> sold;

    public SoldLog(BaseEntry b)
    {
        path = Path.Combine(Paths.AppData, "uzpos-sold-" + b.ProfileKey + ".json");
        try { sold = JsonSerializer.Deserialize<Dictionary<string, string>>(File.ReadAllText(path), Json) ?? new(); }
        catch { sold = new(); }
    }

    public string? WhenSold(string receiptId) => receiptId.Length > 0 && sold.TryGetValue(receiptId, out var t) ? t : null;

    public void Mark(string receiptId, string info)
    {
        if (receiptId.Length == 0) return;
        sold[receiptId] = $"{DateTime.Now:yyyy-MM-dd HH:mm} ({info})";
        File.WriteAllText(path, JsonSerializer.Serialize(sold, Json));
    }
}
