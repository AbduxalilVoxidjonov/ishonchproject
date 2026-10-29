using System.Text;
using System.Text.Json;

namespace IshonchLogs.Core;

/// <summary>
/// Kelgan yozuvlar: &lt;papka&gt;\inbox\yyyy-MM.jsonl (oy bo'yicha). Bir xil Id ikkinchi marta qo'shilmaydi —
/// Ishonch tarmoq uzilganda qayta yuborsa ham, faylni qayta import qilsangiz ham takrorlanmaydi.
/// </summary>
public sealed class ProblemStore
{
    readonly object gate = new();
    readonly List<Problem> all = new();
    readonly HashSet<string> ids = new();

    public string Folder { get; }
    public string Inbox => Path.Combine(Folder, "inbox");

    /// <summary>Yangi yozuvlar qo'shildi (boshqa oqimdan chaqirilishi mumkin).</summary>
    public event Action<int>? Added;

    public ProblemStore(string folder)
    {
        Folder = folder;
        Directory.CreateDirectory(Inbox);
    }

    /// <summary>%LOCALAPPDATA%\IshonchLogs (ISHONCH_LOGS_DIR berilsa — o'sha papka).</summary>
    public static string DefaultFolder =>
        Environment.GetEnvironmentVariable("ISHONCH_LOGS_DIR") is { Length: > 0 } d ? d
        : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "IshonchLogs");

    public int Count { get { lock (gate) return all.Count; } }

    public List<Problem> Snapshot() { lock (gate) return all.ToList(); }

    public void Load()
    {
        lock (gate)
        {
            all.Clear();
            ids.Clear();
            foreach (var f in Directory.GetFiles(Inbox, "*.jsonl").Order())
                foreach (var p in ProblemParser.ParseJsonLines(File.ReadAllText(f, Encoding.UTF8), Path.GetFileName(f)))
                    if (ids.Add(p.Id)) all.Add(p);
        }
    }

    /// <summary>Yangilarini xotiraga va diskka qo'shadi; natija — nechtasi yangi edi.</summary>
    public int Add(IEnumerable<Problem> items)
    {
        var fresh = new List<Problem>();
        lock (gate)
        {
            var now = DateTimeOffset.Now;
            foreach (var p in items)
            {
                if (!ids.Add(p.Id)) continue;
                if (p.Received == default) p.Received = now;
                all.Add(p);
                fresh.Add(p);
            }
            foreach (var month in fresh.GroupBy(p => p.Received.ToString("yyyy-MM")))
                File.AppendAllText(Path.Combine(Inbox, month.Key + ".jsonl"),
                    string.Concat(month.Select(p => JsonSerializer.Serialize(p, ProblemParser.Json) + "\n")), new UTF8Encoding(false));
        }
        if (fresh.Count > 0) Added?.Invoke(fresh.Count);
        return fresh.Count;
    }

    /// <summary>Qo'lda olingan fayl: problems.jsonl (yoki .old) yoki eski versiyaning app.log fayli.</summary>
    public int Import(string path)
    {
        var text = File.ReadAllText(path, Encoding.UTF8);
        var name = Path.GetFileName(path);
        var looksJson = text.TrimStart().StartsWith('{');
        var items = looksJson
            ? ProblemParser.ParseJsonLines(text, "fayl " + name)
            : ProblemParser.ParseAppLog(text, name, File.GetLastWriteTime(path));
        return Add(items);
    }
}
