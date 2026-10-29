using System.Text.Json;

namespace IshonchDesktop.Models;

public sealed class BaseStore
{
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    public List<BaseEntry> Bases { get; private set; } = new();

    /// <summary>
    /// Boshlang'ich ro'yxatga keyinroq qo'shilgan bazalar ("server/db"). Ro'yxati allaqachon bor kompyuterlarga ular
    /// bir marta qo'shiladi; foydalanuvchi keyin o'chirsa qayta qo'shilmaydi.
    /// </summary>
    static readonly string[] AddedLater = { "tas-1cbuxapp-01/TestDB11" };

    static string Key(BaseEntry b) => $"{b.Server}/{b.Db}".ToLowerInvariant();

    string basesFile = Paths.BasesFile;
    string seededFile = Paths.SeededBasesFile;

    /// <summary>Birinchi ishga tushishda Excel'dan olingan ro'yxat foydalanuvchi papkasiga nusxalanadi.</summary>
    public void Load() => Load(Paths.BasesFile, Paths.SeededBasesFile);

    /// <summary>Berilgan fayllar bilan yuklaydi (sinovlar uchun).</summary>
    public void Load(string basesFile, string seededFile)
    {
        this.basesFile = basesFile;
        this.seededFile = seededFile;
        if (!File.Exists(basesFile))
        {
            // Exe ichiga joylangan boshlang'ich ro'yxat (Excel'dan) foydalanuvchi papkasiga yoziladi
            using var res = typeof(BaseStore).Assembly.GetManifestResourceStream("bases.json");
            if (res is not null)
            {
                using var fs = File.Create(basesFile);
                res.CopyTo(fs);
            }
        }
        if (!File.Exists(basesFile)) { Bases = new(); return; }
        Bases = JsonSerializer.Deserialize<List<BaseEntry>>(File.ReadAllText(basesFile), Json) ?? new();
        try { AddLaterBases(); } catch (Exception e) { Log.Error("bases-seed", e); }
    }

    void AddLaterBases()
    {
        var seeded = File.Exists(seededFile)
            ? new HashSet<string>(File.ReadAllLines(seededFile).Select(l => l.Trim().ToLowerInvariant()).Where(l => l.Length > 0))
            : new HashSet<string>();
        var pending = AddedLater.Select(k => k.ToLowerInvariant()).Where(k => !seeded.Contains(k)).ToList();
        if (pending.Count == 0) return;

        using var res = typeof(BaseStore).Assembly.GetManifestResourceStream("bases.json");
        var embedded = res is null ? new() : JsonSerializer.Deserialize<List<BaseEntry>>(res, Json) ?? new();
        var have = Bases.Select(Key).ToHashSet();
        var added = false;
        foreach (var key in pending)
        {
            if (!have.Contains(key) && embedded.FirstOrDefault(b => Key(b) == key) is { } entry)
            {
                entry.Id = Bases.Count == 0 ? 1 : Bases.Max(b => b.Id) + 1;
                Bases.Add(entry);
                added = true;
            }
            seeded.Add(key);
        }
        if (added) Save();
        File.WriteAllLines(seededFile, seeded.OrderBy(s => s));
    }

    public void Save() => File.WriteAllText(basesFile, JsonSerializer.Serialize(Bases, Json));
}

public sealed class Settings
{
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    public int? LastBaseId { get; set; }

    /// <summary>Tepaga qadalgan bazalar (BaseEntry.ProfileKey), qadalgan tartibda.</summary>
    public List<string> PinnedBases { get; set; } = new();

    public bool IsPinned(BaseEntry b) => PinnedBases.Contains(b.ProfileKey);

    public void SetPinned(BaseEntry b, bool pinned)
    {
        PinnedBases.Remove(b.ProfileKey);
        if (pinned) PinnedBases.Add(b.ProfileKey);
    }

    /// <summary>Tab (profil) bo'yicha masshtab: kalit — profil nomi yoki "home".</summary>
    public Dictionary<string, double> Zoom { get; set; } = new();

    /// <summary>Yangilanishlar chiqadigan GitHub repozitoriy ("egasi/nomi").</summary>
    public string UpdateRepo { get; set; } = IshonchDesktop.Models.AppInfo.DefaultRepo;
    public bool AutoCheckUpdates { get; set; } = true;
    public DateTime? LastUpdateCheckUtc { get; set; }
    /// <summary>Foydalanuvchi "bu versiyani o'tkazib yubor" degan versiya.</summary>
    public string? SkippedVersion { get; set; }
    /// <summary>Yopiq repozitoriy uchun GitHub tokeni (DPAPI bilan shifrlangan, base64).</summary>
    public string? UpdateTokenProtected { get; set; }

    /// <summary>Xatolar yig'uvchisi (IshonchLogs) manzili, masalan http://192.168.1.10:5077 — bo'sh bo'lsa hech narsa yuborilmaydi.</summary>
    public string? LogCollectorUrl { get; set; }
    /// <summary>Yig'uvchi kaliti (yig'uvchi sozlamasidagi bilan bir xil bo'lishi kerak).</summary>
    public string? LogCollectorKey { get; set; }

    /// <summary>Oxirgi yopilganda ochiq bo'lgan tablar: "base:&lt;profil&gt;", "soliq", "elektr".</summary>
    public List<string> OpenTabs { get; set; } = new();
    public bool RestoreTabs { get; set; } = true;

    /// <summary>«Markirovkasiz sotish» qiymatlari — har baza (ProfileKey) uchun alohida.</summary>
    public Dictionary<string, UnmarkedPrefs> UnmarkedByBase { get; set; } = new();

    public Dictionary<string, MarkedPrefs> MarkedByBase { get; set; } = new();

    public MarkedPrefs GetMarked(string baseKey) =>
        MarkedByBase.TryGetValue(baseKey, out var p) ? p : MarkedByBase[baseKey] = new MarkedPrefs();

    public UnmarkedPrefs GetUnmarked(string baseKey) =>
        UnmarkedByBase.TryGetValue(baseKey, out var p) ? p : UnmarkedByBase[baseKey] = new UnmarkedPrefs();

    public bool WindowMaximized { get; set; }
    public int? WindowX { get; set; }
    public int? WindowY { get; set; }
    public int? WindowWidth { get; set; }
    public int? WindowHeight { get; set; }

    public double GetZoom(string key) => Zoom.TryGetValue(key, out var z) && z is >= 0.25 and <= 5 ? z : 1.0;
    public void SetZoom(string key, double z) { if (Math.Abs(z - 1.0) < 0.001) Zoom.Remove(key); else Zoom[key] = z; }

    public static Settings Load()
    {
        try { return JsonSerializer.Deserialize<Settings>(File.ReadAllText(Paths.SettingsFile), Json) ?? new(); }
        catch { return new(); }
    }

    public void Save()
    {
        try { File.WriteAllText(Paths.SettingsFile, JsonSerializer.Serialize(this, Json)); } catch { /* sozlama yozilmasa ham ish davom etadi */ }
    }
}

/// <summary>Bitta baza uchun «Markirovkasiz sotish» sozlamalari.</summary>
public sealed class UnmarkedPrefs
{
    /// <summary>Umumiy summa (hamma cheklar uchun); har chek = Target / Count.</summary>
    public decimal Target { get; set; } = 300_000_000m;
    public int Count { get; set; } = 3;
    public int Lines { get; set; } = 10;
    /// <summary>Bitta chekda bir tovardan ko'pi bilan necha dona (0 — cheklovsiz).</summary>
    public int MaxPerItem { get; set; }
    public decimal Percent { get; set; } = 10m;
    public string Warehouse { get; set; } = "";
    public bool Post { get; set; } = true;
    public bool RefreshInventory { get; set; } = true;
    /// <summary>Dastur yangilab turadigan «Инвентаризация товаров» hujjati raqami.</summary>
    public string? InventoryNumber { get; set; }
}

/// <summary>Bitta baza uchun markirovkali chek avtomatikasi sozlamalari.</summary>
public sealed class MarkedPrefs
{
    public decimal Total { get; set; } = 300_000_000m;
    public int Count { get; set; } = 3;
    public string Warehouse { get; set; } = "";
    public bool Post { get; set; } = true;
}
