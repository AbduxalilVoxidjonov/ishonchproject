using System.Text.Json;

namespace IshonchDesktop.Models;

public sealed class BaseStore
{
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    public List<BaseEntry> Bases { get; private set; } = new();

    /// <summary>Birinchi ishga tushishda Excel'dan olingan ro'yxat foydalanuvchi papkasiga nusxalanadi.</summary>
    public void Load()
    {
        if (!File.Exists(Paths.BasesFile))
        {
            // Exe ichiga joylangan boshlang'ich ro'yxat (Excel'dan) foydalanuvchi papkasiga yoziladi
            using var res = typeof(BaseStore).Assembly.GetManifestResourceStream("bases.json");
            if (res is not null)
            {
                using var fs = File.Create(Paths.BasesFile);
                res.CopyTo(fs);
            }
        }
        if (!File.Exists(Paths.BasesFile)) { Bases = new(); return; }
        Bases = JsonSerializer.Deserialize<List<BaseEntry>>(File.ReadAllText(Paths.BasesFile), Json) ?? new();
    }

    public void Save() => File.WriteAllText(Paths.BasesFile, JsonSerializer.Serialize(Bases, Json));
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

    /// <summary>Oxirgi yopilganda ochiq bo'lgan tablar: "base:&lt;profil&gt;", "soliq", "elektr".</summary>
    public List<string> OpenTabs { get; set; } = new();
    public bool RestoreTabs { get; set; } = true;

    /// <summary>«Markirovkasiz sotish» qiymatlari — har baza (ProfileKey) uchun alohida.</summary>
    public Dictionary<string, UnmarkedPrefs> UnmarkedByBase { get; set; } = new();

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
