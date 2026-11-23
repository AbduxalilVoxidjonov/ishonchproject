using System.Globalization;

namespace IshonchDesktop.Unmarked;

/// <summary>
/// 1C sana maydoniga yozish va o'qish — interfeys tili ru («23.11.2026 23:59:59») yoki en_US
/// («11/23/2026 11:59:59 PM») bo'lishidan qat'i nazar. Maska raqamlarni o'zi joylaydi: faqat raqamlar maydon shakli
/// tartibida yoziladi, en_US da oxirida AM/PM harfi.
/// </summary>
public static class OneCDate
{
    /// <summary>Maydondagi qiymatga qarab: en_US shakli (oy/kun/yil)mi.</summary>
    public static bool IsUs(string? fieldValue) => (fieldValue ?? "").Contains('/');

    /// <summary>Yoziladigan raqamlar (maydon shakli tartibida).</summary>
    public static string Digits(DateTime when, bool withTime, bool us) =>
        when.ToString(us ? (withTime ? "MMddyyyyhhmmss" : "MMddyyyy") : (withTime ? "ddMMyyyyHHmmss" : "ddMMyyyy"), CultureInfo.InvariantCulture);

    /// <summary>en_US da vaqtli maydon uchun AM/PM harfi («A» yoki «P»), aks holda null.</summary>
    public static string? AmPm(DateTime when, bool withTime, bool us) => us && withTime ? (when.Hour < 12 ? "A" : "P") : null;

    static readonly string[] Formats =
    {
        "dd.MM.yyyy H:mm:ss", "dd.MM.yyyy HH:mm:ss", "dd.MM.yyyy",
        "M/d/yyyy h:mm:ss tt", "MM/dd/yyyy hh:mm:ss tt", "M/d/yyyy H:mm:ss", "MM/dd/yyyy HH:mm:ss", "M/d/yyyy", "MM/dd/yyyy",
    };

    /// <summary>1C maydonidagi sana (ru yoki en_US); bo'lmasa null.</summary>
    public static DateTime? Parse(string? s) =>
        DateTime.TryParseExact(string.Join(' ', (s ?? "").Split(' ', StringSplitOptions.RemoveEmptyEntries)), Formats,
            CultureInfo.InvariantCulture, DateTimeStyles.None, out var d) ? d : null;
}
