namespace IshonchDesktop.Models;

public static class Paths
{
    /// <summary>
    /// Sinov/portativ rejim: ISHONCH_DATA_DIR berilsa barcha ma'lumotlar shu papkada (oddiy ishlatishda ishlatilmaydi).
    /// </summary>
    static readonly string? Override = Environment.GetEnvironmentVariable("ISHONCH_DATA_DIR") is { Length: > 0 } d ? d : null;

    public static string AppData { get; } = Directory.CreateDirectory(Override is not null
        ? Path.Combine(Override, "roaming")
        : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Ishonch")).FullName;

    /// <summary>Foydalanuvchi tahrirlaydigan baza ro'yxati.</summary>
    public static string BasesFile => Path.Combine(AppData, "bases.json");


    public static string SettingsFile => Path.Combine(AppData, "settings.json");

    /// <summary>Yuklab olingan yangilanishlar (vaqtincha).</summary>
    public static string Updates { get; } = Directory.CreateDirectory(Override is not null
        ? Path.Combine(Override, "local", "updates")
        : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Ishonch", "updates")).FullName;

    /// <summary>WebView2 profillari (cookie, login) — bazalar bo'yicha alohida.</summary>
    public static string Profiles { get; } = Directory.CreateDirectory(Override is not null
        ? Path.Combine(Override, "local", "profiles")
        : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Ishonch", "profiles")).FullName;
}
