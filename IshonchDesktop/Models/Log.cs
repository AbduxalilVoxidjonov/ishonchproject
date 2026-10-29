using System.Text;

namespace IshonchDesktop.Models;

/// <summary>Oddiy fayl jurnali (%APPDATA%\Ishonch\app.log): sahifa yoki panel ishlamasa sababini ko'rish uchun.</summary>
public static class Log
{
    static readonly object Gate = new();
    /// <summary>Jurnal fayli (testlarda boshqa papkaga o'zgartiriladi).</summary>
    public static string FilePath { get; set; } = Path.Combine(Paths.AppData, "app.log");

    public static void Write(string text)
    {
        try
        {
            lock (Gate)
            {
                var f = new FileInfo(FilePath);
                if (f.Exists && f.Length > 1_000_000) f.Delete();
                File.AppendAllText(FilePath, $"{DateTime.Now:HH:mm:ss.fff} {text}{Environment.NewLine}");
            }
        }
        catch { /* jurnal yozilmasa ham ish davom etadi */ }
    }

    /// <summary>Xato: app.log ga va muammolar jurnaliga (bo'lim «where» dan aniqlanadi).</summary>
    public static void Error(string where, Exception e, BaseEntry? b = null)
    {
        Write($"XATO {where}: {e}");
        ProblemLog.Report(Feature.FromWhere(where), "err", $"{where}: {e.Message}", b, e.ToString());
    }

    /// <summary>app.log ning oxirgi qatorlari (muammo yozuviga kontekst sifatida).</summary>
    public static string? Tail(int lines)
    {
        try
        {
            lock (Gate)
            {
                using var s = new FileStream(FilePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
                var take = (int)Math.Min(s.Length, 16_000);
                s.Seek(-take, SeekOrigin.End);
                var buf = new byte[take];
                s.ReadExactly(buf);
                // Fayl kesib o'qilgan bo'lsa birinchi qator chala — tashlanadi
                var all = Encoding.UTF8.GetString(buf).Replace("\r", "").Split('\n', StringSplitOptions.RemoveEmptyEntries)
                    .Skip(take < s.Length ? 1 : 0).ToArray();
                return string.Join("\n", all.Skip(Math.Max(0, all.Length - lines)));
            }
        }
        catch { return null; }
    }
}
