namespace IshonchDesktop.Models;

/// <summary>Oddiy fayl jurnali (%APPDATA%\Ishonch\app.log): sahifa yoki panel ishlamasa sababini ko'rish uchun.</summary>
public static class Log
{
    static readonly object Gate = new();
    static string File_ => Path.Combine(Paths.AppData, "app.log");

    public static void Write(string text)
    {
        try
        {
            lock (Gate)
            {
                var f = new FileInfo(File_);
                if (f.Exists && f.Length > 1_000_000) f.Delete();
                File.AppendAllText(File_, $"{DateTime.Now:HH:mm:ss.fff} {text}{Environment.NewLine}");
            }
        }
        catch { /* jurnal yozilmasa ham ish davom etadi */ }
    }

    public static void Error(string where, Exception e) => Write($"XATO {where}: {e}");
}
