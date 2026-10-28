using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.RegularExpressions;
using IshonchDesktop.Models;

namespace IshonchDesktop.Update;

public sealed record UpdateInfo(Version Version, string Tag, string Notes, string PageUrl, string AssetName,
    string AssetApiUrl, string AssetDownloadUrl, long Size, string? Sha256);

public enum UpdateCheckState { UpToDate, Available, Failed }

public sealed record CheckResult(UpdateCheckState State, UpdateInfo? Update, string Message);

/// <summary>
/// GitHub Releases dan so'nggi versiyani tekshiradi: GET /repos/{egasi}/{repo}/releases/latest.
/// Release da <see cref="AppInfo.AssetName"/> nomli exe bo'lishi kerak; SHA-256 asset "digest" maydonidan yoki
/// "Ishonch.exe.sha256" faylidan olinadi.
/// </summary>
public sealed class UpdateChecker
{
    public const string DefaultApiBase = "https://api.github.com";
    public const string HashAssetName = AppInfo.AssetName + ".sha256";

    static readonly Regex RepoPattern = new(@"^[A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-]+$", RegexOptions.Compiled);

    readonly string apiBase;
    readonly HttpClient http;

    public UpdateChecker(string apiBase = DefaultApiBase, HttpClient? http = null)
    {
        this.apiBase = apiBase.TrimEnd('/');
        this.http = http ?? new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
    }

    public static bool IsValidRepo(string? repo) => repo is not null && RepoPattern.IsMatch(repo);

    public async Task<CheckResult> CheckAsync(string repo, string? token, Version current, CancellationToken ct = default)
    {
        if (!IsValidRepo(repo))
            return new CheckResult(UpdateCheckState.Failed, null, "Repozitoriy nomi noto'g'ri (egasi/nomi ko'rinishida bo'lishi kerak).");

        try
        {
            using var req = NewRequest($"{apiBase}/repos/{repo}/releases/latest", token, "application/vnd.github+json");
            using var resp = await http.SendAsync(req, ct);
            switch (resp.StatusCode)
            {
                case HttpStatusCode.NotFound:
                    return Fail("Release topilmadi. Repozitoriy yopiq (private) bo'lsa yangilanish tokeni kerak, yoki hali birorta release chiqarilmagan.");
                case HttpStatusCode.Unauthorized:
                    return Fail("GitHub tokenni qabul qilmadi (noto'g'ri yoki muddati tugagan).");
                case HttpStatusCode.Forbidden or HttpStatusCode.TooManyRequests:
                    return Fail("GitHub so'rovlar limitiga yetildi yoki ruxsat yo'q. Birozdan keyin qayta urinib ko'ring (yoki token qo'shing).");
            }
            if (!resp.IsSuccessStatusCode) return Fail($"GitHub javobi: {(int)resp.StatusCode} {resp.ReasonPhrase}");

            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(ct));
            return await ParseAsync(doc.RootElement, repo, token, current, ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch (TaskCanceledException) { return Fail("GitHub javob bermadi (vaqt tugadi). Internetni tekshiring."); }
        catch (HttpRequestException e) { return Fail("GitHub ga ulanib bo'lmadi: " + e.Message); }
        catch (JsonException) { return Fail("GitHub javobi tushunarsiz."); }
    }

    async Task<CheckResult> ParseAsync(JsonElement root, string repo, string? token, Version current, CancellationToken ct)
    {
        var tag = Str(root, "tag_name");
        var version = AppInfo.ParseVersion(tag);
        if (version is null) return Fail($"Release tegi versiya emas: «{tag}» (masalan v1.2.3 bo'lishi kerak).");
        if (version <= current)
            return new CheckResult(UpdateCheckState.UpToDate, null, $"Sizda so'nggi versiya o'rnatilgan ({AppInfo.Format(current)}).");

        if (!root.TryGetProperty("assets", out var assets) || assets.ValueKind != JsonValueKind.Array)
            return Fail($"{tag} release da fayllar yo'q.");
        JsonElement? exe = null, hashAsset = null;
        foreach (var a in assets.EnumerateArray())
        {
            if (Str(a, "state") is { Length: > 0 } st && st != "uploaded") continue;
            var name = Str(a, "name");
            if (name.Equals(AppInfo.AssetName, StringComparison.OrdinalIgnoreCase)) exe = a;
            else if (name.Equals(HashAssetName, StringComparison.OrdinalIgnoreCase)) hashAsset = a;
        }
        if (exe is not { } e)
            return Fail($"{tag} release da «{AppInfo.AssetName}» fayli topilmadi.");

        var sha = ParseDigest(Str(e, "digest"));
        if (sha is null && hashAsset is { } h)
        {
            try { sha = ParseHashFile(await FetchTextAsync(Str(h, "browser_download_url"), Str(h, "url"), token, ct)); }
            catch (Exception ex) when (ex is not OperationCanceledException) { /* kontrol yig'indisi olinmadi: yuklashda ogohlantiriladi */ }
        }

        var info = new UpdateInfo(version, tag, Str(root, "body"), Str(root, "html_url"), Str(e, "name"),
            Str(e, "url"), Str(e, "browser_download_url"), e.TryGetProperty("size", out var sz) && sz.ValueKind == JsonValueKind.Number ? sz.GetInt64() : 0, sha);
        return new CheckResult(UpdateCheckState.Available, info, $"Yangi versiya mavjud: {AppInfo.Format(version)} (hozirgi {AppInfo.Format(current)}).");
    }

    async Task<string> FetchTextAsync(string publicUrl, string apiUrl, string? token, CancellationToken ct)
    {
        var url = token is not null && apiUrl.Length > 0 ? apiUrl : publicUrl;
        using var resp = await UpdateInstaller.GetFollowingAsync(http, url, token, "application/octet-stream", allowLocal: IsLocal(apiBase), ct);
        resp.EnsureSuccessStatusCode();
        var text = await resp.Content.ReadAsStringAsync(ct);
        return text.Length > 4096 ? text[..4096] : text;
    }

    static bool IsLocal(string url) => url.StartsWith("http://127.0.0.1", StringComparison.Ordinal) || url.StartsWith("http://localhost", StringComparison.Ordinal);

    // ---- yordamchilar ----------------------------------------------------------------------

    /// <summary>"sha256:ABCD…" (GitHub asset digest) → kichik harfli hex.</summary>
    public static string? ParseDigest(string? digest)
    {
        if (digest is null || !digest.StartsWith("sha256:", StringComparison.OrdinalIgnoreCase)) return null;
        var hex = digest[7..].Trim();
        return Regex.IsMatch(hex, "^[0-9a-fA-F]{64}$") ? hex.ToLowerInvariant() : null;
    }

    /// <summary>"&lt;64 hex&gt;  Ishonch.exe" (sha256sum / Get-FileHash chiqishi) dan hex ni oladi.</summary>
    public static string? ParseHashFile(string? text)
    {
        if (text is null) return null;
        var m = Regex.Match(text, "(?<![0-9a-fA-F])[0-9a-fA-F]{64}(?![0-9a-fA-F])");
        return m.Success ? m.Value.ToLowerInvariant() : null;
    }

    HttpRequestMessage NewRequest(string url, string? token, string accept)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, url);
        req.Headers.UserAgent.ParseAdd($"Ishonch/{AppInfo.Text}");
        req.Headers.Accept.ParseAdd(accept);
        req.Headers.TryAddWithoutValidation("X-GitHub-Api-Version", "2022-11-28");
        if (!string.IsNullOrWhiteSpace(token)) req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return req;
    }

    static CheckResult Fail(string message) => new(UpdateCheckState.Failed, null, message);

    static string Str(JsonElement e, string name) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
}
