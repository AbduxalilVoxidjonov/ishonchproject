using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using IshonchDesktop.Models;

namespace IshonchDesktop.Marking;

/// <summary>
/// Tovar markirovkalimi yoki yo'qmi. Bitta skladda ikkala tur bo'lsa ham bitta chekda faqat bir tur sotiladi.
/// 1C nomenklaturasida bunday belgi yo'q, shuning uchun:
/// 1) markirovkali chek paneli Подбор da o'rganadi (kodlari chiqsa — 'm', chiqmasa — 'u'), panel holati saqlanganda shu yerga
///    yoziladi (%APPDATA%\Ishonch\goods-kind.json, baza bo'yicha);
/// 2) hali o'rganilmagan tovar — IKPU (MXIK) yoki nomi bo'yicha taxmin: maishiy texnika, televizor, kompyuter, mebel
/// (telefonlar markirovkasiz — ular IMEI bilan ro'yxatdan o'tadi).
/// Markirovkasiz chek markirovkali tovarni olmaydi: o'rganilgan tur ustun, o'rganilmagan bo'lsa taxmin bo'yicha.
/// </summary>
public static class GoodsKind
{
    static readonly object Gate = new();
    static Dictionary<string, Dictionary<string, string>>? map;

    public static string FilePath { get; set; } = Path.Combine(Paths.AppData, "goods-kind.json");

    /// <summary>Panel bilan bir xil kalit: NFKC, bo'shliqlar bittaga, kichik harf.</summary>
    public static string Key(string name) =>
        Regex.Replace((name ?? "").Normalize(NormalizationForm.FormKC), @"\s+", " ").Trim().ToLower(CultureInfo.InvariantCulture);

    static string BaseKey(BaseEntry b) => b.Inn + "|" + b.Db;

    // Markirovkasi majburiy tovarlar guruhlari (MXIK = «0» + TN VED ning 4 xonasi): telefon, kompyuter, televizor/monitor,
    // muzlatgich, kir yuvish/quritish, isitgich/mikroto'lqinli/elektr pech, oshxona texnikasi, changyutgich, konditsioner,
    // idish yuvish, mebel
    // Telefonlar (8517) markirovkasiz — IMEI bilan ro'yxatdan o'tadi, «Asl belgisi» kodi yo'q
    static readonly string[] MarkedHs4 = { "8471", "8528", "8418", "8450", "8451", "8516", "8509", "8508", "8415", "8422", "9401", "9403" };

    static readonly string[] MarkedWords =
    {
        "ноутбук", "компьютер", "моноблок", "планшет", "монитор", "телевизор",
        "холодильник", "морозильн", "стиральн", "сушильн", "посудомоечн", "кондиционер", "сплит-систем", "сплит систем",
        "пылесос", "микроволнов", "духовк", "плита", "варочн", "водонагревател", "электрочайник", "мультиварк", "блендер", "миксер",
        "мебель", "диван", "кресло", "шкаф", "кровать", "матрас", "комод",
        "notebook", "televizor", "muzlatgich", "konditsioner", "changyutgich", "kir yuvish",
        "macbook", "imac",
    };

    /// <summary>IKPU yoki nomi bo'yicha taxmin: markirovkali tovarga o'xshaydimi.</summary>
    public static bool LooksMarked(string name, string? ikpu = null)
    {
        var digits = Regex.Match(ikpu ?? "", @"\d{17}").Value;
        if (digits.Length == 17 && MarkedHs4.Contains(digits.Substring(1, 4))) return true;
        var key = Key(name);
        return MarkedWords.Any(key.Contains);
    }

    /// <summary>Panel o'rgangan tur: 'm', 'u' yoki null (hali noma'lum).</summary>
    public static string? Learned(BaseEntry b, string name)
    {
        lock (Gate) return Load().TryGetValue(BaseKey(b), out var m) && m.TryGetValue(Key(name), out var k) ? k : null;
    }

    /// <summary>
    /// Markirovkasiz chekka olib bo'lmaydi. Подбор da o'rganilgani taxmindan ustun (masalan, markirovkasiz stul — mebel bo'lsa ham
    /// markirovkasiz chekka olinadi); hali o'rganilmagan bo'lsa — IKPU/nom bo'yicha taxmin.
    /// </summary>
    public static bool IsMarked(BaseEntry b, string name, string? ikpu = null) => Learned(b, name) switch
    {
        "m" => true,
        "u" => false,
        _ => LooksMarked(name, ikpu),
    };

    /// <summary>Panel holatidagi (mk1c_*) goodsKind ni o'qib, yangi/o'zgargan yozuvlarni saqlaydi.</summary>
    public static void AddFromPanelState(JsonElement obj, BaseEntry b)
    {
        if (obj.ValueKind != JsonValueKind.Object) return;
        var changed = 0;
        lock (Gate)
        {
            var all = Load();
            if (!all.TryGetValue(BaseKey(b), out var m)) all[BaseKey(b)] = m = new();
            foreach (var p in obj.EnumerateObject())
            {
                if (!p.Name.StartsWith("mk1c_", StringComparison.Ordinal) || p.Value.ValueKind != JsonValueKind.Object) continue;
                if (!p.Value.TryGetProperty("goodsKind", out var kinds) || kinds.ValueKind != JsonValueKind.Object) continue;
                foreach (var k in kinds.EnumerateObject())
                {
                    var v = k.Value.ValueKind == JsonValueKind.String ? k.Value.GetString() : null;
                    if (v is not ("m" or "u") || (m.TryGetValue(k.Name, out var old) && old == v)) continue;
                    m[k.Name] = v;
                    changed++;
                }
            }
            if (changed == 0) return;
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!);
                File.WriteAllText(FilePath, JsonSerializer.Serialize(all));
            }
            catch (Exception e) { Log.Error("goods-kind.json yozish", e); }
        }
    }

    static Dictionary<string, Dictionary<string, string>> Load()
    {
        if (map is not null) return map;
        try { map = JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, string>>>(File.ReadAllText(FilePath)) ?? new(); }
        catch { map = new(); }
        return map;
    }
}
