using System.Text;

namespace IshonchDesktop.Models;

/// <summary>
/// problems.jsonl dagi hali yuborilmagan yozuvlarni egasining yig'uvchi dasturiga (IshonchLogs) HTTP POST bilan yuboradi.
/// Manzil sozlamada (Yordam → «Xatolar jurnali…»); berilmagan bo'lsa hech narsa yuborilmaydi.
/// Tarmoq bo'lmasa yozuvlar faylda qoladi va keyinroq yuboriladi.
/// </summary>
public sealed class ProblemSender : IDisposable
{
    public const string KeyHeader = "X-Ishonch-Key";
    const int MaxBatchBytes = 512_000;

    readonly Func<(string? Url, string? Key)> config;
    readonly HttpClient http;
    readonly SemaphoreSlim busy = new(1, 1);
    System.Threading.Timer? timer;

    public ProblemSender(Func<(string? Url, string? Key)> config, HttpMessageHandler? handler = null)
    {
        this.config = config;
        http = handler is null ? new HttpClient() : new HttpClient(handler);
        http.Timeout = TimeSpan.FromSeconds(20);
    }

    /// <summary>Har daqiqada va yangi muammo yozilgandan ~5 soniya keyin yuboradi.</summary>
    public void Start()
    {
        timer = new System.Threading.Timer(_ => _ = SendPendingAsync(), null, TimeSpan.FromSeconds(10), TimeSpan.FromMinutes(1));
        ProblemLog.Reported += OnReported;
    }

    void OnReported() => timer?.Change(TimeSpan.FromSeconds(5), TimeSpan.FromMinutes(1));

    /// <summary>"http://192.168.1.10:5077" → ".../api/problems". Faqat http/https.</summary>
    public static Uri? Endpoint(string? baseUrl, string path = "api/problems")
    {
        if (string.IsNullOrWhiteSpace(baseUrl)) return null;
        if (!Uri.TryCreate(baseUrl.Trim().TrimEnd('/') + "/", UriKind.Absolute, out var u) || (u.Scheme != "http" && u.Scheme != "https")) return null;
        return new Uri(u, path);
    }

    /// <summary>Yuborilmagan yozuvlar soni (sozlama oynasida ko'rsatish uchun).</summary>
    public static int PendingCount()
    {
        try
        {
            lock (ProblemLog.Gate)
            {
                if (!File.Exists(ProblemLog.FilePath)) return 0;
                using var s = new FileStream(ProblemLog.FilePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
                s.Seek(Math.Min(ProblemLog.ReadSent(), s.Length), SeekOrigin.Begin);
                var n = 0;
                int b;
                while ((b = s.ReadByte()) >= 0) if (b == '\n') n++;
                return n;
            }
        }
        catch { return 0; }
    }

    /// <summary>Yig'uvchi ishlayaptimi (GET /api/ping).</summary>
    public async Task<string> PingAsync(string? url, string? key)
    {
        var ep = Endpoint(url, "api/ping");
        if (ep is null) return "Manzil noto'g'ri (masalan http://192.168.1.10:5077).";
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, ep);
            if (!string.IsNullOrEmpty(key)) req.Headers.Add(KeyHeader, key);
            using var r = await http.SendAsync(req);
            return r.IsSuccessStatusCode ? "Ulandi" : $"Javob: {(int)r.StatusCode} {r.ReasonPhrase}";
        }
        catch (Exception e) { return "Ulanib bo'lmadi: " + e.Message; }
    }

    /// <summary>Yuborilmaganlarni partiyalab yuboradi. Natija: yuborilgan yozuvlar soni, xato bo'lsa -1.</summary>
    public async Task<int> SendPendingAsync(CancellationToken ct = default)
    {
        var (url, key) = config();
        var ep = Endpoint(url);
        if (ep is null) return 0;
        if (!await busy.WaitAsync(0, ct)) return 0;
        try
        {
            var total = 0;
            while (true)
            {
                var (lines, start, end) = ReadBatch();
                if (end == start) return total;
                if (lines.Count == 0) { Advance(start, end); continue; }
                var body = "[" + string.Join(",", lines) + "]";
                using var req = new HttpRequestMessage(HttpMethod.Post, ep) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
                if (!string.IsNullOrEmpty(key)) req.Headers.Add(KeyHeader, key);
                using var r = await http.SendAsync(req, ct);
                if (!r.IsSuccessStatusCode)
                {
                    Log.Write($"problems: yig'uvchi javobi {(int)r.StatusCode}");
                    return -1;
                }
                Advance(start, end);
                total += lines.Count;
            }
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or IOException)
        {
            return -1; // tarmoq yo'q — keyinroq qayta urinadi (jurnalni to'ldirmaslik uchun yozilmaydi)
        }
        finally { busy.Release(); }
    }

    /// <summary>Belgidan keyingi to'liq qatorlar (oxiri \n bilan tugaganlari), ko'pi bilan ~0.5 MB.</summary>
    static (List<string> Lines, long Start, long End) ReadBatch()
    {
        lock (ProblemLog.Gate)
        {
            var lines = new List<string>();
            if (!File.Exists(ProblemLog.FilePath)) return (lines, 0, 0);
            using var s = new FileStream(ProblemLog.FilePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            var start = ProblemLog.ReadSent();
            if (start > s.Length) { start = 0; ProblemLog.WriteSent(0); }
            s.Seek(start, SeekOrigin.Begin);
            var buf = new byte[Math.Min(s.Length - start, MaxBatchBytes)];
            var read = s.Read(buf, 0, buf.Length);
            var last = Array.LastIndexOf(buf, (byte)'\n', Math.Max(0, read - 1));
            if (last < 0)
            {
                // Bitta qator partiyadan katta bo'lsa — o'tkazib yuboriladi, aks holda yuborish to'xtab qoladi
                if (read == MaxBatchBytes) ProblemLog.WriteSent(start + read);
                return (lines, start, start);
            }
            foreach (var l in Encoding.UTF8.GetString(buf, 0, last + 1).Split('\n'))
                if (l.Trim().TrimStart('﻿') is var t && IsJsonObject(t)) lines.Add(t); // buzilgan qator butun partiyani to'xtatmasin
            return (lines, start, start + last + 1);
        }
    }

    static void Advance(long start, long end)
    {
        lock (ProblemLog.Gate)
        {
            // Shu orada fayl almashtirilgan bo'lsa (rotatsiya) belgini surmaymiz
            if (ProblemLog.ReadSent() == start) ProblemLog.WriteSent(end);
        }
    }

    static bool IsJsonObject(string s)
    {
        if (!s.StartsWith('{')) return false;
        try { using var d = System.Text.Json.JsonDocument.Parse(s); return d.RootElement.ValueKind == System.Text.Json.JsonValueKind.Object; }
        catch (System.Text.Json.JsonException) { return false; }
    }

    public void Dispose()
    {
        ProblemLog.Reported -= OnReported;
        timer?.Dispose();
        http.Dispose();
    }
}
