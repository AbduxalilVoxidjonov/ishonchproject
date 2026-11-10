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
            try { if (File.Exists(FolderFile) && File.ReadAllText(FolderFile).Trim() is { Length: > 0 } f) return f; } catch { /* standart papka */ }
            return DefaultFolder();
        }
        set { try { File.WriteAllText(FolderFile, value.Trim()); } catch { /* eslab qolinmasa ham ishlayveradi */ } }
    }

    /// <summary>«baza3 THE MILLENNIUM RETAIL (BALIKCHI RETAIL).xls»</summary>
    public static string FileName(BaseEntry b) =>
        string.Concat($"{b.Db} {b.Firm}".Select(c => Path.GetInvalidFileNameChars().Contains(c) ? '_' : c)).Trim() + ".xls";
}
