namespace IshonchDesktop.Models;

/// <summary>Bitta 1C bazasi (Excel ro'yxatidagi bitta qator).</summary>
public sealed class BaseEntry
{
    public int Id { get; set; }
    public int? No { get; set; }
    public string Sector { get; set; } = "";
    public string Firm { get; set; } = "";
    public string Inn { get; set; } = "";
    public string Accountant { get; set; } = "";
    public string Server { get; set; } = "";
    public string Db { get; set; } = "";

    /// <summary>1C web-mijoz manzili, masalan http://tas-1cbuxapp-01/baza99/</summary>
    public string Url => $"http://{Server}/{Db}/";

    /// <summary>Har bir baza o'z brauzer profiliga ega (login/cookie aralashmaydi).</summary>
    public string ProfileKey => string.Concat($"1c-{Server}-{Db}".ToLowerInvariant().Select(c => Path.GetInvalidFileNameChars().Contains(c) ? '_' : c));

    public override string ToString() => $"{Firm} ({Db})";
}
