using System.Text.Json;
using IshonchDesktop.Models;

namespace IshonchDesktop.Marking;

/// <summary>Sotib bo'lmaydigan bitta markirovka kodi (my.soliq.uz rad etgan: sotilgan, boshqa STIR, topilmadi).</summary>
public sealed class UnsellableCode
{
    public string Code { get; set; } = "";
    public string Firm { get; set; } = "";
    public string Inn { get; set; } = "";
    public string Db { get; set; } = "";
    public string Warehouse { get; set; } = "";
    /// <summary>1C dagi tovar nomi.</summary>
    public string Name { get; set; } = "";
    /// <summary>my.soliq.uz dagi mahsulot nomi (bo'lsa).</summary>
    public string Product { get; set; } = "";
    public string Reason { get; set; } = "";
    public DateTime Time { get; set; }
}

/// <summary>
/// Barcha bazalardagi sotib bo'lmaydigan markirovkalar bitta faylga yig'iladi (%APPDATA%\Ishonch\unsellable.json).
/// Panel o'z xato bazasini (badDb) saqlaganda yangi kodlar shu yerga qo'shiladi; panel bazasini tozalasa ham bu yerda qoladi.
/// </summary>
public static class UnsellableStore
{
    static readonly object Gate = new();
    static readonly JsonSerializerOptions Json = new() { WriteIndented = false };
    static Dictionary<string, UnsellableCode>? items;

    public static string FilePath { get; set; } = Path.Combine(Paths.AppData, "unsellable.json");

    /// <summary>Ro'yxat o'zgarganda (bosh sahifadagi jadval yangilanishi uchun; istalgan oqimdan chaqiriladi).</summary>
    public static event Action? Changed;

    static string Key(string inn, string db, string code) => inn + "|" + db + "|" + code;

    static Dictionary<string, UnsellableCode> Items()
    {
        if (items is not null) return items;
        try
        {
            var list = JsonSerializer.Deserialize<List<UnsellableCode>>(File.ReadAllText(FilePath)) ?? new();
            items = list.GroupBy(c => Key(c.Inn, c.Db, c.Code)).ToDictionary(g => g.Key, g => g.Last());
        }
        catch { items = new(); }
        return items;
    }

    public static List<UnsellableCode> All()
    {
        lock (Gate) return Items().Values.OrderByDescending(c => c.Time).ToList();
    }

    /// <summary>
    /// Panel holatidagi (mk1c_*) xato bazasidan yangi kodlarni qo'shadi. Avval ko'rilgan kodlar o'zgartirilmaydi
    /// (sklad — kod birinchi topilgandagi sklad).
    /// </summary>
    public static void AddFromPanelState(JsonElement obj, BaseEntry baseEntry, string warehouse)
    {
        if (obj.ValueKind != JsonValueKind.Object) return;
        var added = 0;
        lock (Gate)
        {
            var map = Items();
            foreach (var p in obj.EnumerateObject())
            {
                if (!p.Name.StartsWith("mk1c_", StringComparison.Ordinal) || p.Value.ValueKind != JsonValueKind.Object) continue;
                if (!p.Value.TryGetProperty("badDb", out var db) || db.ValueKind != JsonValueKind.Object) continue;
                foreach (var c in db.EnumerateObject())
                {
                    var key = Key(baseEntry.Inn, baseEntry.Db, c.Name);
                    if (map.ContainsKey(key) || c.Value.ValueKind != JsonValueKind.Object) continue;
                    map[key] = new UnsellableCode
                    {
                        Code = c.Name, Firm = baseEntry.Firm, Inn = baseEntry.Inn, Db = baseEntry.Db, Warehouse = warehouse,
                        Name = Str(c.Value, "name"), Product = Str(c.Value, "product"), Reason = Str(c.Value, "reason"),
                        Time = DateTime.Now,
                    };
                    added++;
                }
            }
            if (added == 0) return;
            Save(map);
        }
        Log.Write($"Sotib bo'lmaydigan markirovkalar: +{added} ({baseEntry.Db})");
        Changed?.Invoke();
    }

    /// <summary>Tanlangan kodlarni ro'yxatdan o'chiradi (masalan, qayta tekshirilib sotilgani ma'lum bo'lsa).</summary>
    public static void Remove(IEnumerable<UnsellableCode> codes)
    {
        lock (Gate)
        {
            var map = Items();
            foreach (var c in codes) map.Remove(Key(c.Inn, c.Db, c.Code));
            Save(map);
        }
        Changed?.Invoke();
    }

    static void Save(Dictionary<string, UnsellableCode> map)
    {
        try
        {
            var tmp = FilePath + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(map.Values.ToList(), Json));
            File.Move(tmp, FilePath, true);
        }
        catch (Exception e) { Log.Error("UnsellableStore", e); }
    }

    static string Str(JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
}
