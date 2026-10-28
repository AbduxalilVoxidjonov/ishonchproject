using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.RegularExpressions;
using IshonchDesktop.UI;

namespace IshonchDesktop.Marking;

/// <summary>
/// my.soliq.uz tabi orqali markirovka kodining tarixini tekshiradi (kengaytmadagi MXIK Qidiruv o'rnida).
/// Tekshiruv sahifaning o'z skripti bilan bajariladi, shuning uchun foydalanuvchi my.soliq.uz ga kirgan bo'lishi kerak.
/// </summary>
public static class SoliqBridge
{
    const string Origin = "https://my.soliq.uz/";
    const string MarkUrl = "https://my.soliq.uz/remotes-services/markirovka/product_markirovka";

    static readonly ConditionalWeakTable<WebTab, PageChannel> Channels = new();
    static readonly SemaphoreSlim OneAtATime = new(1, 1); // sahifada bitta qidiruv maydoni bor

    static string Clean(string? s) => Regex.Replace(s ?? "", @"[\x00-\x1f\x1d\s]", "");
    static string Digits(string? s) => Regex.Replace(s ?? "", @"\D", "");

    // Faqat ulgurji holatdagi (va STIR bizniki bo'lgan) kod sotishga yaroqli
    static string VerdictOf(JsonElement? last, string stir)
    {
        if (last is not { ValueKind: JsonValueKind.Object } l) return "unknown";
        var lastStir = l.TryGetProperty("stir", out var s) ? s.GetString() : "";
        var op = l.TryGetProperty("operation", out var o) ? o.GetString() ?? "" : "";
        if (stir.Length > 0 && Digits(lastStir) != stir) return "sold";
        if (Regex.IsMatch(op, "ulgurji|улгуржи|оптов", RegexOptions.IgnoreCase)) return "available";
        if (Regex.IsMatch(op, "chakana|чакана|розн", RegexOptions.IgnoreCase)) return "sold";
        return "unknown";
    }

    static async Task<PageChannel> EnsureChannelAsync(WebTab tab)
    {
        await tab.Ready;
        var core = tab.Core ?? throw new InvalidOperationException("my.soliq.uz tabi tayyor emas");
        if (Channels.TryGetValue(tab, out var existing)) return existing;
        var channel = new PageChannel(core, Origin);
        channel.Rpc = async msg =>
        {
            var type = msg.TryGetProperty("type", out var t) ? t.GetString() : "";
            if (type is "mxik-sleep" or "sleep")
            {
                var ms = msg.TryGetProperty("ms", out var m) && m.ValueKind == JsonValueKind.Number ? m.GetInt32() : 0;
                await Task.Delay(Math.Clamp(ms, 0, 10000));
                return true;
            }
            return new { ok = false };
        };
        Channels.Add(tab, channel);
        var script = MkResources.SoliqScript();
        await core.AddScriptToExecuteOnDocumentCreatedAsync(script);
        if (core.Source.StartsWith(Origin, StringComparison.OrdinalIgnoreCase)) await core.ExecuteScriptAsync(script);
        return channel;
    }

    /// <param name="defaultStir">Panelda STIR bo'sh bo'lsa, tanlangan bazaning STIR (INN) i ishlatiladi.</param>
    public sealed record ProductInfo(string Mxik, string Barcode, string Product, string Reason);

    /// <summary>Markirovka kodining soliq tarixidan mahsulot ma'lumotlari: MXIK (IKPU), shtrix-kod, nomi.</summary>
    public static async Task<ProductInfo> LookupProductAsync(Func<Task<WebTab>> getTab, string code)
    {
        var raw = await CheckAsync(getTab, code, null, null);
        var json = System.Text.Json.JsonSerializer.SerializeToElement(raw);
        if (json.TryGetProperty("history", out var h) && h.ValueKind == JsonValueKind.Object)
        {
            string F(string n) => h.TryGetProperty(n, out var v) ? Regex.Replace(v.GetString() ?? "", @"\D", "") : "";
            string T(string n) => h.TryGetProperty(n, out var v) ? v.GetString() ?? "" : "";
            return new ProductInfo(F("mxik"), F("barcode"), T("product"), "");
        }
        var reason = json.TryGetProperty("reason", out var r) ? r.GetString() ?? "" : json.TryGetProperty("error", out var e) ? e.GetString() ?? "" : "noma'lum";
        return new ProductInfo("", "", "", reason);
    }

    public static async Task<object> CheckAsync(Func<Task<WebTab>> getTab, string? code, string? stir, string? defaultStir = null)
    {
        var value = Clean(code);
        if (value.Length == 0) return new { ok = false, verdict = "unknown", error = "Markirovka kodi bo'sh" };
        var ours = Digits(stir);
        if (ours.Length == 0) ours = Digits(defaultStir);

        await OneAtATime.WaitAsync();
        try
        {
            var tab = await getTab();
            var channel = await EnsureChannelAsync(tab);
            if (!(tab.Core!.Source ?? "").StartsWith(MarkUrl, StringComparison.OrdinalIgnoreCase))
            {
                tab.Navigate(MarkUrl);
                await tab.WaitNavigatedAsync();
                await Task.Delay(1500);
            }

            for (var i = 0; i < 40; i++)
            {
                var r = await channel.DispatchAsync(new { type = "mxik-search", code = value }, TimeSpan.FromSeconds(30));
                if (r is not { ValueKind: JsonValueKind.Object } result) { await Task.Delay(500); continue; }

                if (result.TryGetProperty("loggedIn", out var li) && li.ValueKind == JsonValueKind.False)
                    return new { ok = true, verdict = "unknown", reason = "my.soliq.uz ga kirilmagan" };

                var found = result.TryGetProperty("found", out var f) && f.ValueKind == JsonValueKind.True;
                result.TryGetProperty("history", out var history);
                var historyOk = found && history.ValueKind == JsonValueKind.Object
                    && history.TryGetProperty("code", out var hc) && Clean(hc.GetString()) == value
                    && history.TryGetProperty("steps", out var steps) && steps.ValueKind == JsonValueKind.Array && steps.GetArrayLength() > 0;
                if (!historyOk)
                {
                    var reason = result.TryGetProperty("reason", out var rs) ? rs.GetString() : null;
                    return new { ok = true, verdict = "unknown", reason = string.IsNullOrEmpty(reason) ? "markirovka topilmadi" : reason };
                }

                JsonElement? last = history.TryGetProperty("last", out var lastEl) && lastEl.ValueKind == JsonValueKind.Object ? lastEl : null;
                var lastStir = last is { } l && l.TryGetProperty("stir", out var ls) ? ls.GetString() ?? "" : "";
                var operation = last is { } l2 && l2.TryGetProperty("operation", out var lo) ? lo.GetString() ?? "" : "";
                return new
                {
                    ok = true,
                    verdict = VerdictOf(last, ours),
                    operation,
                    lastStir,
                    stir = ours,
                    stirMatch = ours.Length > 0 ? (bool?)(Digits(lastStir) == ours) : null,
                    history,
                };
            }
            return new { ok = false, verdict = "unknown", error = "my.soliq.uz sahifasi javob bermadi" };
        }
        catch (Exception ex)
        {
            return new { ok = false, verdict = "unknown", error = ex.Message };
        }
        finally
        {
            OneAtATime.Release();
        }
    }
}
