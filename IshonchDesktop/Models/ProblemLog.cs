using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace IshonchDesktop.Models;

/// <summary>Muammo qaysi bo'limda chiqqani (yig'uvchi dasturda shu bo'yicha filtrlanadi).</summary>
public static class Feature
{
    public const string Marked = "Markirovkali avto";
    public const string Unmarked = "Markirovkasiz";
    public const string Epos = "E-POS";
    public const string Soliq = "Soliq";
    public const string Elektr = "Elektr";
    public const string Marking = "Markirovka panel";
    public const string Update = "Yangilanish";
    public const string App = "Dastur";

    /// <summary>Log.Error dagi «where» dan bo'lim: "elektr.save" → Elektr, "MarkedAuto" → Markirovkali avto.</summary>
    public static string FromWhere(string where)
    {
        var w = where.ToLowerInvariant();
        if (w.StartsWith("elektr") || w.StartsWith("opencabinet")) return Elektr;
        if (w.StartsWith("markedauto")) return Marked;
        if (w.StartsWith("unmarked")) return Unmarked;
        if (w.StartsWith("update")) return Update;
        if (w.StartsWith("rpc") || w.StartsWith("openmarking")) return Marking;
        if (w.StartsWith("soliq")) return Soliq;
        return App;
    }
}

/// <summary>Bitta muammo yozuvi (problems.jsonl dagi bitta qator). Yig'uvchi dastur (IshonchLogs) shu maydonlarni o'qiydi.</summary>
public sealed class ProblemEntry
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public DateTimeOffset Time { get; set; } = DateTimeOffset.Now;
    /// <summary>"warn" yoki "err".</summary>
    public string Level { get; set; } = "err";
    public string Feature { get; set; } = Models.Feature.App;
    public string? Db { get; set; }
    public string? Firm { get; set; }
    public string? Inn { get; set; }
    public string? Server { get; set; }
    public string Pc { get; set; } = Environment.MachineName;
    public string User { get; set; } = Environment.UserName;
    public string App { get; set; } = AppInfo.Text;
    public string Message { get; set; } = "";
    /// <summary>Istisno (stack trace) va shu kabi qo'shimcha.</summary>
    public string? Details { get; set; }
    /// <summary>Muammodan oldingi app.log qatorlari — yig'uvchida to'liq vaziyatni ko'rish uchun.</summary>
    public string? Context { get; set; }
}

/// <summary>
/// Tuzilgan muammolar jurnali: %APPDATA%\Ishonch\problems.jsonl (har qatorda bitta JSON).
/// Har bir ogohlantirish/xato shu yerga vaqt, baza/firma/INN, bo'lim va matn bilan yoziladi;
/// <see cref="ProblemSender"/> ularni sozlamada ko'rsatilgan yig'uvchiga (egasining kompyuteri) yuboradi.
/// </summary>
public static class ProblemLog
{
    internal static readonly object Gate = new();
    static readonly Dictionary<string, DateTime> LastSeen = new();
    static readonly System.Text.RegularExpressions.Regex Digits = new(@"\d+");
    static readonly UTF8Encoding NoBom = new(false);
    internal static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    /// <summary>Jurnal fayli (testlarda boshqa papkaga o'zgartiriladi).</summary>
    public static string FilePath { get; set; } = Path.Combine(Paths.AppData, "problems.jsonl");
    /// <summary>Yig'uvchiga qaysi baytgacha yuborilgani.</summary>
    public static string SentFile => FilePath + ".sent";

    /// <summary>Bir xil muammo (bo'lim + baza + matn) shu vaqt ichida takrorlansa yozilmaydi.</summary>
    public static TimeSpan RepeatWindow { get; set; } = TimeSpan.FromSeconds(60);

    /// <summary>Yangi yozuv qo'shildi (yuboruvchi tezroq yuborishi uchun).</summary>
    public static event Action? Reported;

    public static void Report(string feature, string level, string message, BaseEntry? b = null, string? details = null,
        string? baseTitle = null, string? inn = null)
    {
        var e = new ProblemEntry
        {
            Level = level == "warn" ? "warn" : "err",
            Feature = feature,
            Message = message.Trim(),
            Details = details,
            Db = b?.Db ?? baseTitle,
            Firm = b?.Firm,
            Inn = b?.Inn is { Length: > 0 } i ? i : inn,
            Server = b?.Server,
        };
        Write(e);
    }

    public static void Write(ProblemEntry e)
    {
        try
        {
            // Raqamlar hisobga olinmaydi: «kutilmoqda (12 s)» va «(15 s)» bir xil muammo
            var key = $"{e.Feature}|{e.Db}|{e.Inn}|{Digits.Replace(e.Message, "#")}";
            lock (Gate)
            {
                var now = DateTime.UtcNow;
                if (LastSeen.TryGetValue(key, out var last) && now - last < RepeatWindow) return;
                LastSeen[key] = now;
                if (LastSeen.Count > 500) LastSeen.Clear();

                e.Context ??= Log.Tail(40);
                Rotate();
                File.AppendAllText(FilePath, JsonSerializer.Serialize(e, Json) + "\n", NoBom);
            }
            Reported?.Invoke();
        }
        catch { /* jurnal yozilmasa ham ish davom etadi */ }
    }

    /// <summary>Fayl katta bo'lsa: hammasi yuborilgan bo'lsa o'chiriladi, aks holda 5 MB dan keyin eski nusxaga o'tkaziladi.</summary>
    static void Rotate()
    {
        var f = new FileInfo(FilePath);
        if (!f.Exists || f.Length < 2_000_000) return;
        if (ReadSent() >= f.Length || f.Length > 5_000_000)
        {
            File.Copy(FilePath, FilePath + ".old", overwrite: true);
            File.Delete(FilePath);
            WriteSent(0);
        }
    }

    internal static long ReadSent()
    {
        try { return long.TryParse(File.ReadAllText(SentFile).Trim(), out var v) ? v : 0; }
        catch { return 0; }
    }

    internal static void WriteSent(long offset) => File.WriteAllText(SentFile, offset.ToString());
}
