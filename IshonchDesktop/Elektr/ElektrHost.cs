using System.Net;
using System.Text;
using System.Text.Json;
using IshonchDesktop.Models;

namespace IshonchDesktop.Elektr;

/// <summary>
/// Elektr sahifasining (WebView2 ichidagi interfeys) C# tomoni: akkauntlarni shifrlab saqlash, fayl tanlash/saqlash,
/// cabinet-api.het.uz ga so'rovlarni yuborish (brauzerdagi CORS to'siqsiz) va cabinet.het.uz ni ochish.
/// </summary>
public sealed class ElektrHost
{
    public const string ApiHost = "cabinet-api.het.uz";
    const long MaxFileBytes = 60L * 1024 * 1024;

    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    static readonly HttpClient Http = CreateHttp();

    readonly ElektrStore store;
    readonly ElektrHistoryStore history;
    readonly Control owner;
    readonly Func<string, string, Task<string?>> openCabinet;
    readonly string? devApi;
    ElektrData data;

    public ElektrHost(ElektrStore store, Control owner, Func<string, string, Task<string?>> openCabinet, ElektrHistoryStore? history = null)
    {
        this.store = store;
        this.history = history ?? new ElektrHistoryStore();
        this.owner = owner;
        this.openCabinet = openCabinet;
        data = store.Load();
        // Faqat sinov uchun: soxta HET serveri (faqat mahalliy 127.0.0.1)
        var dev = Environment.GetEnvironmentVariable("ISHONCH_ELEKTR_API");
        devApi = dev is not null && dev.StartsWith("http://127.0.0.1:", StringComparison.Ordinal) ? dev : null;
    }

    static HttpClient CreateHttp()
    {
        var handler = new SocketsHttpHandler
        {
            MaxConnectionsPerServer = 16,
            PooledConnectionLifetime = TimeSpan.FromMinutes(5),
            AutomaticDecompression = DecompressionMethods.All,
        };
        return new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(60) };
    }

    /// <summary>Sahifa faqat cabinet-api.het.uz (https) ga murojaat qila oladi; sinov rejimida mahalliy soxta server ham.</summary>
    public static bool IsAllowedUrl(Uri uri, string? devApi = null)
    {
        if (uri.Scheme == Uri.UriSchemeHttps && uri.Host.Equals(ApiHost, StringComparison.OrdinalIgnoreCase)) return true;
        return devApi is not null && uri.Scheme == Uri.UriSchemeHttp && uri.Host == "127.0.0.1"
            && uri.ToString().StartsWith(devApi.TrimEnd('/'), StringComparison.Ordinal);
    }

    public async Task<object?> HandleAsync(JsonElement msg)
    {
        var type = msg.TryGetProperty("type", out var t) ? t.GetString() : "";
        switch (type)
        {
            case "state.load":
                return new
                {
                    accounts = data.Accounts, tablePath = data.TablePath, concurrency = data.Concurrency,
                    warning = store.Warning, apiBase = devApi,
                };
            case "state.save": return SaveState(msg);
            case "history.load": return new { json = history.Load() };
            case "history.save":
                try { history.Save(Str(msg, "json")); return new { ok = true }; }
                catch (Exception e) { Log.Error("elektr.history", e); return new { ok = false, error = e.Message }; }
            case "file.pick": return PickFile(msg);
            case "file.readPath": return ReadPath(Str(msg, "path"));
            case "file.info": return FileMeta(Str(msg, "path"));
            case "file.saveResult": return SaveResult(msg);
            case "shell.showFile": return ShowFile(Str(msg, "path"));
            case "cabinet.open": return await OpenCabinetAsync(Str(msg, "login"));
            case "http": return await ProxyHttpAsync(msg);
            default: return new { error = "noma'lum so'rov" };
        }
    }

    // ---- saqlash -----------------------------------------------------------------------------

    object SaveState(JsonElement msg)
    {
        try
        {
            var accounts = new List<ElektrAccount>();
            if (msg.TryGetProperty("accounts", out var arr) && arr.ValueKind == JsonValueKind.Array)
                foreach (var a in arr.EnumerateArray())
                    accounts.Add(JsonSerializer.Deserialize<ElektrAccount>(a.GetRawText(), Json) ?? new ElektrAccount());
            data.Accounts = accounts;
            data.TablePath = msg.TryGetProperty("tablePath", out var tp) && tp.ValueKind == JsonValueKind.String ? tp.GetString() : null;
            data.Concurrency = msg.TryGetProperty("concurrency", out var c) && c.ValueKind == JsonValueKind.Number ? Math.Clamp(c.GetInt32(), 1, 10) : 4;
            store.Save(data);
            return new { ok = true };
        }
        catch (Exception e)
        {
            Log.Error("elektr.save", e);
            return new { ok = false, error = e.Message };
        }
    }

    // ---- fayllar -----------------------------------------------------------------------------

    object PickFile(JsonElement msg)
    {
        using var dlg = new OpenFileDialog
        {
            Title = Str(msg, "title") is { Length: > 0 } t ? t : "Excel faylini tanlang",
            Filter = "Excel jadvali (*.xlsx)|*.xlsx|Barcha fayllar (*.*)|*.*",
            CheckFileExists = true,
        };
        if (data.TablePath is { Length: > 0 } last && Directory.Exists(Path.GetDirectoryName(last)))
            dlg.InitialDirectory = Path.GetDirectoryName(last)!;
        if (dlg.ShowDialog(owner) != DialogResult.OK) return new { canceled = true };

        try
        {
            var withData = msg.TryGetProperty("withData", out var w) && w.ValueKind == JsonValueKind.True;
            var info = new FileInfo(dlg.FileName);
            if (info.Length > MaxFileBytes) return new { error = "Fayl juda katta (60 MB dan oshmasin)." };
            return new
            {
                name = info.Name, path = info.FullName,
                base64 = withData ? Convert.ToBase64String(ReadShared(info.FullName)) : null,
            };
        }
        catch (Exception e) { return new { error = "Faylni o'qib bo'lmadi: " + e.Message }; }
    }

    object ReadPath(string path)
    {
        try
        {
            if (path.Length == 0 || !File.Exists(path)) return new { error = "Fayl topilmadi: " + path };
            if (new FileInfo(path).Length > MaxFileBytes) return new { error = "Fayl juda katta." };
            return new { base64 = Convert.ToBase64String(ReadShared(path)), name = Path.GetFileName(path) };
        }
        catch (Exception e) { return new { error = e.Message }; }
    }

    object FileMeta(string path)
    {
        var exists = path.Length > 0 && File.Exists(path);
        return new { exists, name = Path.GetFileName(path), modified = exists ? File.GetLastWriteTime(path).ToString("s") : null };
    }

    /// <summary>Excel da ochiq turgan fayl ham o'qiladi (boshqa jarayon yozish uchun ochgan bo'lsa ham).</summary>
    static byte[] ReadShared(string path)
    {
        using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        using var ms = new MemoryStream();
        fs.CopyTo(ms);
        return ms.ToArray();
    }

    /// <summary>
    /// Natijani jadval yonidagi papkaga yozadi; shu nomli fayl bor bo'lsa vaqt qo'shiladi (hech narsa ustiga yozilmaydi);
    /// papka yozishga yopiq bo'lsa Hujjatlar\Ishonch ga yoziladi.
    /// </summary>
    object SaveResult(JsonElement msg)
    {
        try
        {
            var dir = Str(msg, "dir");
            var name = SafeName(Str(msg, "name"));
            var bytes = Convert.FromBase64String(Str(msg, "base64"));
            if (name.Length == 0) name = "natija.xlsx";
            return new { path = WriteUnique(dir, name, bytes) };
        }
        catch (Exception e)
        {
            Log.Error("elektr.saveResult", e);
            return new { error = e.Message };
        }
    }

    public static string WriteUnique(string dir, string name, byte[] bytes)
    {
        string Try(string folder)
        {
            Directory.CreateDirectory(folder);
            var target = Path.Combine(folder, name);
            if (File.Exists(target))
                target = Path.Combine(folder, $"{Path.GetFileNameWithoutExtension(name)}_{DateTime.Now:yyyyMMdd-HHmmss}{Path.GetExtension(name)}");
            File.WriteAllBytes(target, bytes);
            return target;
        }
        try { return Try(dir.Length > 0 ? dir : Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments)); }
        catch (Exception e) when (e is UnauthorizedAccessException or IOException or DirectoryNotFoundException)
        {
            return Try(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "Ishonch"));
        }
    }

    static string SafeName(string name) => string.Concat(name.Select(c => Path.GetInvalidFileNameChars().Contains(c) ? '_' : c)).Trim();

    object ShowFile(string path)
    {
        try
        {
            if (!File.Exists(path)) return new { error = "Fayl topilmadi." };
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("explorer.exe", $"/select,\"{path}\"") { UseShellExecute = true });
            return new { ok = true };
        }
        catch (Exception e) { return new { error = e.Message }; }
    }

    // ---- cabinet.het.uz ----------------------------------------------------------------------

    async Task<object> OpenCabinetAsync(string login)
    {
        var acc = data.Accounts.FirstOrDefault(a => a.Login.Trim() == login);
        if (acc is null || acc.Password.Length == 0) return new { error = "Akkaunt topilmadi yoki paroli bo'sh." };
        var error = await openCabinet(acc.Login.Trim(), acc.Password);
        return error is null ? new { ok = true } : new { error };
    }

    // ---- HTTP ko'prigi -----------------------------------------------------------------------

    async Task<object> ProxyHttpAsync(JsonElement msg)
    {
        Uri uri;
        try { uri = new Uri(Str(msg, "url")); }
        catch { return new { status = 0, error = "Noto'g'ri manzil" }; }
        if (!IsAllowedUrl(uri, devApi)) return new { status = 0, error = "Bu manzilga so'rov yuborish taqiqlangan: " + uri.Host };

        try
        {
            using var req = new HttpRequestMessage(new HttpMethod(Str(msg, "method") is { Length: > 0 } m ? m : "GET"), uri);
            string? contentType = null;
            if (msg.TryGetProperty("headers", out var h) && h.ValueKind == JsonValueKind.Object)
                foreach (var p in h.EnumerateObject())
                {
                    var value = p.Value.ToString();
                    if (p.Name.Equals("Content-Type", StringComparison.OrdinalIgnoreCase)) contentType = value;
                    else req.Headers.TryAddWithoutValidation(p.Name, value);
                }
            if (msg.TryGetProperty("body", out var b) && b.ValueKind == JsonValueKind.String)
                req.Content = new StringContent(b.GetString()!, Encoding.UTF8, contentType ?? "application/json");

            using var resp = await Http.SendAsync(req);
            return new { status = (int)resp.StatusCode, text = await resp.Content.ReadAsStringAsync() };
        }
        catch (TaskCanceledException) { return new { status = 0, error = "Javob kutish vaqti tugadi" }; }
        catch (HttpRequestException e) { return new { status = 0, error = "Tarmoq xatosi: " + e.Message }; }
    }

    static string Str(JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
}
