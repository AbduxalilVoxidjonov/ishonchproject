using System.Diagnostics;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using IshonchDesktop.Models;

namespace IshonchDesktop.Update;

/// <summary>Yuklab olingan fayl dastur uchun yaroqsiz (xato hash, boshqa dastur, buzilgan).</summary>
public sealed class UpdateVerificationException : Exception
{
    public UpdateVerificationException(string message) : base(message) { }
}

/// <summary>
/// Yangilanishni yuklaydi, tekshiradi va ishlayotgan exe ni almashtiradi.
/// Almashtirish: ishlayotgan exe nomi o'zgartiriladi (Windows buni ruxsat etadi), yangisi o'rniga qo'yiladi, dastur qayta
/// ishga tushadi; eski nusxa keyingi ishga tushishda o'chiriladi. Foydalanuvchi ma'lumotlari (%APPDATA%\Ishonch,
/// brauzer profillari) exe dan alohida turadi, shuning uchun yangilanishda saqlanib qoladi; baribir zaxira olinadi.
/// </summary>
public static class UpdateInstaller
{
    public static string UpdatesDir => Paths.Updates;

    // ---- yuklash ---------------------------------------------------------------------------

    static bool HostAllowed(Uri u, bool allowLocal)
    {
        if (allowLocal && u.Scheme == Uri.UriSchemeHttp && (u.Host == "127.0.0.1" || u.Host == "localhost")) return true;
        if (u.Scheme != Uri.UriSchemeHttps) return false;
        var h = u.Host.ToLowerInvariant();
        return h == "github.com" || h.EndsWith(".github.com") || h.EndsWith(".githubusercontent.com");
    }

    /// <summary>
    /// GET, yo'naltirishlarni qo'lda kuzatib (faqat GitHub manzillari). Token faqat GitHub ning o'zidagi birinchi
    /// so'rovga qo'shiladi, yuklash CDN iga (boshqa host) o'tkazilmaydi.
    /// </summary>
    public static async Task<HttpResponseMessage> GetFollowingAsync(HttpClient http, string url, string? token, string accept,
        bool allowLocal, CancellationToken ct)
    {
        var current = new Uri(url);
        var first = true;
        for (var hop = 0; hop < 6; hop++)
        {
            if (!HostAllowed(current, allowLocal)) throw new IOException("Ruxsat etilmagan yuklash manzili: " + current.Host);
            using var req = new HttpRequestMessage(HttpMethod.Get, current);
            req.Headers.UserAgent.ParseAdd($"Ishonch/{AppInfo.Text}");
            req.Headers.Accept.ParseAdd(accept);
            if (first && !string.IsNullOrWhiteSpace(token)) req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            first = false;

            // Avto-yo'naltirish o'chirilgan mijoz kerak; umumiy http ga teng sozlama bilan ishlaydi
            var resp = await SendNoRedirectAsync(http, req, ct);
            if ((int)resp.StatusCode is 301 or 302 or 303 or 307 or 308 && resp.Headers.Location is { } loc)
            {
                resp.Dispose();
                current = loc.IsAbsoluteUri ? loc : new Uri(current, loc);
                continue;
            }
            return resp;
        }
        throw new IOException("Juda ko'p yo'naltirish.");
    }

    static readonly HttpClient NoRedirect = new(new SocketsHttpHandler { AllowAutoRedirect = false, PooledConnectionLifetime = TimeSpan.FromMinutes(2) })
    { Timeout = Timeout.InfiniteTimeSpan };

    static Task<HttpResponseMessage> SendNoRedirectAsync(HttpClient _, HttpRequestMessage req, CancellationToken ct) =>
        NoRedirect.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);

    /// <summary>
    /// Yangi exe ni yuklaydi (.part fayliga), o'lcham va SHA-256 ni tekshiradi, so'ng validator (PE / mahsulot / versiya)
    /// dan o'tkazadi. Muvaffaqiyatli bo'lsa to'liq yo'lni qaytaradi; aks holda yarim fayl o'chiriladi.
    /// </summary>
    public static async Task<string> DownloadAsync(UpdateInfo info, string? token, IProgress<double>? progress, CancellationToken ct,
        string? destDir = null, bool allowLocal = false, Func<string, UpdateInfo, string?>? validator = null)
    {
        var dir = destDir ?? UpdatesDir;
        Directory.CreateDirectory(dir);
        var final = Path.Combine(dir, $"Ishonch-{AppInfo.Format(info.Version)}.exe");
        var part = final + ".part";
        if (File.Exists(part)) File.Delete(part);

        var useApi = !string.IsNullOrWhiteSpace(token) && info.AssetApiUrl.Length > 0;
        var url = useApi ? info.AssetApiUrl : info.AssetDownloadUrl;
        if (url.Length == 0) throw new IOException("Yuklash manzili yo'q.");

        try
        {
            using var resp = await GetFollowingAsync(new HttpClient(), url, token, "application/octet-stream", allowLocal, ct);
            if (!resp.IsSuccessStatusCode) throw new IOException($"Yuklab bo'lmadi: {(int)resp.StatusCode} {resp.ReasonPhrase}");
            var total = resp.Content.Headers.ContentLength ?? info.Size;

            using var sha = SHA256.Create();
            await using (var src = await resp.Content.ReadAsStreamAsync(ct))
            await using (var dst = new FileStream(part, FileMode.Create, FileAccess.Write, FileShare.None, 1 << 16, useAsync: true))
            {
                var buf = new byte[1 << 16];
                long done = 0;
                int n;
                while ((n = await src.ReadAsync(buf, ct)) > 0)
                {
                    await dst.WriteAsync(buf.AsMemory(0, n), ct);
                    sha.TransformBlock(buf, 0, n, null, 0);
                    done += n;
                    if (total > 0) progress?.Report(Math.Min(1.0, (double)done / total));
                }
                sha.TransformFinalBlock(Array.Empty<byte>(), 0, 0);
                if (info.Size > 0 && done != info.Size)
                    throw new UpdateVerificationException($"Fayl to'liq yuklanmadi ({done} / {info.Size} bayt).");
            }

            var actual = Convert.ToHexString(sha.Hash!).ToLowerInvariant();
            if (info.Sha256 is not null && !actual.Equals(info.Sha256, StringComparison.OrdinalIgnoreCase))
                throw new UpdateVerificationException("Yuklangan fayl kontrol yig'indisi (SHA-256) release dagi bilan mos kelmadi. Fayl buzilgan yoki almashtirilgan bo'lishi mumkin.");

            var problem = (validator ?? ExeCheck.Verify)(part, info);
            if (problem is not null) throw new UpdateVerificationException(problem);

            if (File.Exists(final)) File.Delete(final);
            File.Move(part, final);
            progress?.Report(1.0);
            return final;
        }
        catch
        {
            try { if (File.Exists(part)) File.Delete(part); } catch { /* keyingi urinishda o'chadi */ }
            throw;
        }
    }

    // ---- almashtirish ------------------------------------------------------------------------

    public static string OldName(string currentExe) => currentExe + ".old";

    /// <summary>
    /// Ishlayotgan exe ni yangisi bilan almashtiradi. Xato bo'lsa hammasi qaytariladi (eski exe joyida qoladi).
    /// </summary>
    public static void Replace(string currentExe, string newExe)
    {
        var old = OldName(currentExe);
        if (File.Exists(old)) { try { File.Delete(old); } catch { old = currentExe + $".{DateTime.Now:HHmmss}.old"; } }

        File.Move(currentExe, old);
        try { File.Move(newExe, currentExe); }
        catch
        {
            try { File.Move(old, currentExe, true); } catch { /* eng yomon holat: foydalanuvchiga xabar beriladi */ }
            throw;
        }
    }

    /// <summary>Oldingi yangilanishdan qolgan *.old nusxalarni o'chiradi (ishlab turgan eski jarayon bo'lsa o'tkazib yuboradi).</summary>
    public static void CleanupOld(string currentExe)
    {
        try
        {
            var dir = Path.GetDirectoryName(currentExe);
            if (dir is null) return;
            foreach (var f in Directory.EnumerateFiles(dir, Path.GetFileName(currentExe) + "*.old"))
            {
                try { File.Delete(f); } catch { /* hali ishlayapti */ }
            }
            // Yuklab olingan, lekin o'rnatilgan fayllarni ham tozalaymiz (so'nggi 2 tasidan boshqa)
            foreach (var f in new DirectoryInfo(UpdatesDir).EnumerateFiles("Ishonch-*.exe*").OrderByDescending(x => x.LastWriteTimeUtc).Skip(2))
            {
                try { f.Delete(); } catch { /* ahamiyatsiz */ }
            }
        }
        catch { /* tozalash ixtiyoriy */ }
    }

    // ---- ma'lumotlar zaxirasi ----------------------------------------------------------------

    /// <summary>
    /// Yangilanishdan oldin foydalanuvchi ma'lumotlarining kichik fayllarini (*.json, *.dat, marking\*.json) zaxiraga nusxalaydi.
    /// Oxirgi 5 ta zaxira saqlanadi. Qaytaradi: zaxira papkasi.
    /// </summary>
    public static string BackupUserData(string dataDir, Version from, Version to, int keep = 5)
    {
        var root = Path.Combine(dataDir, "backups");
        var dest = Path.Combine(root, $"{DateTime.Now:yyyyMMdd-HHmmss}_v{AppInfo.Format(from)}-to-v{AppInfo.Format(to)}");
        Directory.CreateDirectory(dest);

        void CopyFiles(string srcDir, string dstDir, params string[] patterns)
        {
            if (!Directory.Exists(srcDir)) return;
            Directory.CreateDirectory(dstDir);
            foreach (var pattern in patterns)
                foreach (var f in Directory.EnumerateFiles(srcDir, pattern, SearchOption.TopDirectoryOnly))
                {
                    try { File.Copy(f, Path.Combine(dstDir, Path.GetFileName(f)), true); } catch { /* ochiq fayl: o'tkazib yuboriladi */ }
                }
        }

        CopyFiles(dataDir, dest, "*.json", "*.dat", "*.bak");
        CopyFiles(Path.Combine(dataDir, "marking"), Path.Combine(dest, "marking"), "*.json");

        try
        {
            foreach (var d in new DirectoryInfo(root).EnumerateDirectories().OrderByDescending(x => x.Name).Skip(keep))
                try { d.Delete(true); } catch { /* ahamiyatsiz */ }
        }
        catch { /* ahamiyatsiz */ }
        return dest;
    }

    /// <summary>Yangi nusxani ishga tushiradi (qayta ishga tushish).</summary>
    public static void Launch(string exe)
    {
        var psi = new ProcessStartInfo(exe) { UseShellExecute = false, WorkingDirectory = Path.GetDirectoryName(exe)! };
        psi.ArgumentList.Add("--after-update");
        Process.Start(psi);
    }
}

/// <summary>Yuklangan faylning dasturga mosligini tekshiradi.</summary>
public static class ExeCheck
{
    public const string ProductName = "Ishonch";

    public static string? Verify(string path, UpdateInfo info)
    {
        try
        {
            using (var fs = File.OpenRead(path))
            {
                var head = new byte[2];
                if (fs.Read(head, 0, 2) != 2 || head[0] != (byte)'M' || head[1] != (byte)'Z')
                    return "Yuklangan fayl Windows dasturi emas (exe sarlavhasi yo'q).";
            }
            var vi = FileVersionInfo.GetVersionInfo(path);
            if (!string.Equals(vi.ProductName?.Trim(), ProductName, StringComparison.OrdinalIgnoreCase))
                return $"Yuklangan fayl «{ProductName}» dasturi emas (mahsulot: «{vi.ProductName}»).";
            var fileVersion = AppInfo.ParseVersion(vi.ProductVersion ?? vi.FileVersion);
            if (fileVersion is null || fileVersion != info.Version)
                return $"Yuklangan fayl versiyasi ({vi.ProductVersion}) release versiyasiga ({AppInfo.Format(info.Version)}) mos emas.";
            return null;
        }
        catch (Exception e) { return "Faylni tekshirib bo'lmadi: " + e.Message; }
    }
}
