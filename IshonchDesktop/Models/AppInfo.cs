using System.Reflection;

namespace IshonchDesktop.Models;

/// <summary>Dastur versiyasi va yangilanish manbasi.</summary>
public static class AppInfo
{
    /// <summary>Yangilanish uchun GitHub repozitoriy (egasi/nomi). Sozlamalarda o'zgartirish mumkin.</summary>
    public const string DefaultRepo = "AbduxalilVoxidjonov/ishonchproject";

    /// <summary>Release dagi fayl nomi: har bir release da aynan shu nomli bitta exe bo'lishi kerak.</summary>
    public const string AssetName = "Ishonch.exe";

    /// <summary>
    /// Ekranda ko'rinadigan nom (oyna sarlavhasi, xabarlar). Ichki nom «Ishonch» (mahsulot nomi, exe, ma'lumotlar papkasi)
    /// o'zgarmaydi — eski versiyalar yangilanishni shu nom bo'yicha tekshiradi.
    /// </summary>
    public const string DisplayName = "Ishonch-Abduxalil";

    /// <summary>Yordam uchun aloqa (Yordam menyusida).</summary>
    public const string SupportPhone = "+998 95 313 44 47";
    public const string SupportTelegram = "ishonchabduxalil";

    public static Version Current { get; } = ReadVersion();

    /// <summary>"0.6.0" ko'rinishida (to'rtinchi raqamsiz).</summary>
    public static string Text => Format(Current);

    public static string Format(Version v) => $"{v.Major}.{Math.Max(v.Minor, 0)}.{Math.Max(v.Build, 0)}";

    /// <summary>"v1.2.3", "1.2.3+abc" yoki "1.2.3-beta" dan Version oladi (noto'g'ri bo'lsa null).</summary>
    public static Version? ParseVersion(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var t = text.Trim().TrimStart('v', 'V');
        var cut = t.IndexOfAny(new[] { '+', '-', ' ' });
        if (cut >= 0) t = t[..cut];
        if (!Version.TryParse(t, out var v)) return null;
        return new Version(v.Major, Math.Max(v.Minor, 0), Math.Max(v.Build, 0));
    }

    static Version ReadVersion()
    {
        var asm = Assembly.GetEntryAssembly() ?? Assembly.GetExecutingAssembly();
        var info = asm.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion;
        return ParseVersion(info) ?? asm.GetName().Version ?? new Version(0, 0, 0);
    }

    /// <summary>Bitta faylli (single-file) exe sifatida ishlayaptimi; dasturni ishlab chiqish rejimida avto-almashtirish o'chiriladi.</summary>
    public static bool IsSingleFile => string.IsNullOrEmpty((Assembly.GetEntryAssembly() ?? Assembly.GetExecutingAssembly()).Location);
}
