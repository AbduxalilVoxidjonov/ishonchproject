using IshonchDesktop.Models;

namespace IshonchDesktop.Debtors;

/// <summary>Debitor/kreditor hisobotini Excelga saqlash: papka (bir marta aytiladi, eslab qolinadi) va baza nomli fayl nomi.</summary>
public static class DebtorSettings
{
    static string FolderFile => Path.Combine(Paths.AppData, "debtor-folder.txt");

    public static string DefaultFolder() =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "Ishonch", "debitor-kreditor " + DateTime.Today.ToString("yyyy-MM-dd"));

    public static string Folder
    {
        get
        {
            try { if (File.Exists(FolderFile) && File.ReadAllText(FolderFile).Trim() is { Length: > 0 } f && !IsDatedDefault(f)) return f; } catch { /* standart papka */ }
            return DefaultFolder();
        }
        set
        {
            // Sanali standart papka eslab qolinmaydi: aks holda keyingi kunlar ham eski sanali papkaga yozilardi
            try { if (IsDatedDefault(value.Trim())) File.Delete(FolderFile); else File.WriteAllText(FolderFile, value.Trim()); }
            catch { /* eslab qolinmasa ham ishlayveradi */ }
        }
    }

    static bool IsDatedDefault(string folder)
    {
        var parent = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "Ishonch");
        return string.Equals(Path.GetDirectoryName(Path.TrimEndingDirectorySeparator(folder)), parent, StringComparison.OrdinalIgnoreCase)
            && System.Text.RegularExpressions.Regex.IsMatch(Path.GetFileName(Path.TrimEndingDirectorySeparator(folder)), @"^debitor-kreditor \d{4}-\d{2}-\d{2}$");
    }

    /// <summary>«baza3 THE MILLENNIUM RETAIL (BALIKCHI RETAIL).xls»</summary>
    public static string FileName(BaseEntry b) =>
        string.Concat($"{b.Db} {b.Firm}".Select(c => Path.GetInvalidFileNameChars().Contains(c) ? '_' : c)).Trim() + ".xls";
}
