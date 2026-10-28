using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using IshonchDesktop.Models;

namespace IshonchDesktop.Elektr;

/// <summary>Elektr bo'limidagi bitta akkaunt (cabinet.het.uz login/paroli) va oxirgi natijasi.</summary>
public sealed class ElektrAccount
{
    public string Login { get; set; } = "";
    public string Password { get; set; } = "";
    public string Note { get; set; } = "";

    /// <summary>Yig'ishda ishtirok etadimi (belgi).</summary>
    public bool Enabled { get; set; } = true;

    public string? LastStatus { get; set; }   // "ok" | "error"
    public string? LastMessage { get; set; }
    public DateTime? LastTime { get; set; }
}

public sealed class ElektrData
{
    public List<ElektrAccount> Accounts { get; set; } = new();

    /// <summary>Oxirgi tanlangan Kamunalka jadvali (to'liq yo'l): dastur ochilganda o'zi yuklanadi.</summary>
    public string? TablePath { get; set; }

    public int Concurrency { get; set; } = 4;
}

/// <summary>
/// Elektr bo'limi ma'lumotlari: %APPDATA%\Ishonch\elektr.dat. Butun fayl Windows hisobi bilan shifrlanadi (DPAPI),
/// parollar ochiq matnda diskka yozilmaydi. Fayl dastur yangilanganda ham joyida qoladi. Har yozishdan oldin
/// oldingi holat .bak sifatida saqlanadi; fayl buzilsa .bak dan tiklanadi.
/// </summary>
public sealed class ElektrStore
{
    static readonly byte[] Magic = Encoding.ASCII.GetBytes("ISE1");
    static readonly byte[] Entropy = Encoding.UTF8.GetBytes("Ishonch.Elektr.v1");
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = false };

    readonly string path;

    public ElektrStore(string? path = null) => this.path = path ?? Path.Combine(Paths.AppData, "elektr.dat");

    public string FilePath => path;

    /// <summary>Ogohlantirish matni (masalan fayl buzilib, zaxiradan tiklangan bo'lsa); aks holda null.</summary>
    public string? Warning { get; private set; }

    public ElektrData Load()
    {
        Warning = null;
        if (!File.Exists(path) && !File.Exists(path + ".bak")) return new ElektrData();

        if (TryRead(path, out var data)) return data;
        if (TryRead(path + ".bak", out var backup))
        {
            Warning = "Asosiy fayl o'qilmadi (boshqa Windows hisobi yoki fayl buzilgan). Zaxira nusxadan tiklandi.";
            return backup;
        }
        Warning = "Saqlangan akkauntlarni o'qib bo'lmadi (boshqa Windows hisobi yoki fayl buzilgan). Eski fayl o'zgartirilmadi; yangi ro'yxat boshlandi.";
        return new ElektrData();
    }

    public void Save(ElektrData data)
    {
        var plain = JsonSerializer.SerializeToUtf8Bytes(data, Json);
        var protectedBytes = ProtectedData.Protect(plain, Entropy, DataProtectionScope.CurrentUser);
        CryptographicOperations.ZeroMemory(plain);
        var file = Magic.Concat(protectedBytes).ToArray();

        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        // Faqat o'qiladigan bo'lsa zaxiraga olinadi (buzilgan faylni yaxshi zaxira ustiga yozmaymiz)
        if (File.Exists(path) && TryRead(path, out _)) File.Copy(path, path + ".bak", true);
        var tmp = path + ".tmp";
        File.WriteAllBytes(tmp, file);
        File.Move(tmp, path, true);
    }

    static bool TryRead(string file, out ElektrData data)
    {
        data = new ElektrData();
        try
        {
            if (!File.Exists(file)) return false;
            var bytes = File.ReadAllBytes(file);
            if (bytes.Length <= Magic.Length || !bytes.AsSpan(0, Magic.Length).SequenceEqual(Magic)) return false;
            var plain = ProtectedData.Unprotect(bytes[Magic.Length..], Entropy, DataProtectionScope.CurrentUser);
            try { data = JsonSerializer.Deserialize<ElektrData>(plain, Json) ?? new ElektrData(); }
            finally { CryptographicOperations.ZeroMemory(plain); }
            return true;
        }
        catch { return false; }
    }
}

/// <summary>
/// Oylar bo'yicha yig'ilgan ma'lumotlar tarixi (%APPDATA%\Ishonch\elektr-history.dat): har oyda har login uchun
/// olingan hisob-kitob. Akkauntlar bilan bir xil usulda shifrlanadi, .bak zaxirasi bor va yangilanishda saqlanadi.
/// Mazmuni sahifa (JS) tomonidan boshqariladi, bu yerda faqat xavfsiz saqlash.
/// </summary>
public sealed class ElektrHistoryStore
{
    static readonly byte[] Magic = Encoding.ASCII.GetBytes("ISH1");
    static readonly byte[] Entropy = Encoding.UTF8.GetBytes("Ishonch.ElektrHistory.v1");
    const int MaxBytes = 200 * 1024 * 1024;

    readonly string path;

    public ElektrHistoryStore(string? path = null) => this.path = path ?? Path.Combine(Paths.AppData, "elektr-history.dat");

    public string FilePath => path;

    /// <summary>Saqlangan JSON matn ("{}" — hali hech narsa yo'q).</summary>
    public string Load() => TryRead(path) ?? TryRead(path + ".bak") ?? "{}";

    public void Save(string json)
    {
        var plain = Encoding.UTF8.GetBytes(json);
        if (plain.Length > MaxBytes) throw new IOException("Tarix hajmi juda katta.");
        var file = Magic.Concat(ProtectedData.Protect(plain, Entropy, DataProtectionScope.CurrentUser)).ToArray();
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        if (File.Exists(path) && TryRead(path) is not null) File.Copy(path, path + ".bak", true);
        var tmp = path + ".tmp";
        File.WriteAllBytes(tmp, file);
        File.Move(tmp, path, true);
    }

    static string? TryRead(string file)
    {
        try
        {
            if (!File.Exists(file)) return null;
            var bytes = File.ReadAllBytes(file);
            if (bytes.Length <= Magic.Length || !bytes.AsSpan(0, Magic.Length).SequenceEqual(Magic)) return null;
            return Encoding.UTF8.GetString(ProtectedData.Unprotect(bytes[Magic.Length..], Entropy, DataProtectionScope.CurrentUser));
        }
        catch { return null; }
    }
}
