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
    // Har my.soliq.uz tabi (firma) o'z navbatiga ega: bir firmaning tekshiruvi boshqasini kutmaydi
    static readonly ConditionalWeakTable<WebTab, SemaphoreSlim> PageLocks = new();   // sahifada bitta qidiruv maydoni bor
    static readonly ConditionalWeakTable<WebTab, SemaphoreSlim> ApiLocks = new();    // API: tab bo'yicha 6 tagacha parallel
    static SemaphoreSlim PageLock(WebTab t) => PageLocks.GetValue(t, _ => new SemaphoreSlim(1, 1));
    static SemaphoreSlim ApiLock(WebTab t) => ApiLocks.GetValue(t, _ => new SemaphoreSlim(6, 6));

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

    // ---- tezkor tekshiruv (API) -----------------------------------------------------------------

    const string ApiUrl = "https://my.soliq.uz/api/mark-personal-cabinet/turnover-marking/marking-code";
    static int apiLogged;

    /// <summary>
    /// Markirovka tarixini sahifaning o'z API si orqali oladi (sahifa ichidan, foydalanuvchi sessiyasi bilan).
    /// null — bu yo'l ishlamadi (kirilmagan, sahifa boshqa joyda, javob tushunarsiz): eski usul ishlatiladi.
    /// </summary>
    static async Task<object?> FastCheckAsync(Func<Task<WebTab>> getTab, string code, string ours)
    {
        var tab = await getTab();
        var gate = ApiLock(tab);
        await gate.WaitAsync();
        try
        {
            await tab.Ready;
            if (tab.Core is not { } core || !(core.Source ?? "").StartsWith(Origin, StringComparison.OrdinalIgnoreCase)
                || (core.Source ?? "").Contains("/login", StringComparison.OrdinalIgnoreCase))
                return null;

            var expr = "(async()=>{const t=localStorage.getItem('token');if(!t)return JSON.stringify({noToken:true});"
                + "const r=await fetch(" + JsonSerializer.Serialize(ApiUrl) + ",{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},"
                + "body:JSON.stringify({lang:'uz_latn',language:'uz_latn',cis:" + JsonSerializer.Serialize(code) + "})});"
                + "return JSON.stringify({status:r.status,body:await r.text()});})()";
            var raw = await core.CallDevToolsProtocolMethodAsync("Runtime.evaluate",
                JsonSerializer.Serialize(new { expression = expr, awaitPromise = true, returnByValue = true }));
            using var outer = JsonDocument.Parse(raw);
            if (!outer.RootElement.TryGetProperty("result", out var res) || !res.TryGetProperty("value", out var v) || v.ValueKind != JsonValueKind.String)
                return null;
            using var wrap = JsonDocument.Parse(v.GetString()!);
            var w = wrap.RootElement;
            if (w.TryGetProperty("noToken", out _)) return null;
            var status = w.GetProperty("status").GetInt32();
            var body = w.GetProperty("body").GetString() ?? "";
            if (Interlocked.Increment(ref apiLogged) <= 3)
                IshonchDesktop.Models.Log.Write($"soliq-api {status}: {(body.Length > 1500 ? body[..1500] : body)}");
            if (status is 401 or 403) return null;

            using var doc = JsonDocument.Parse(body);
            var data = doc.RootElement.TryGetProperty("data", out var d1) ? d1 : default;
            if (data.ValueKind == JsonValueKind.Object && data.TryGetProperty("data", out var d2) && d2.ValueKind == JsonValueKind.Object) data = d2;
            if (status != 200 || data.ValueKind != JsonValueKind.Object)
            {
                var msg = doc.RootElement.TryGetProperty("message", out var m) ? m.ToString() : "";
                return status == 200 || status == 400 || status == 404
                    ? new { ok = true, verdict = "unknown", reason = string.IsNullOrWhiteSpace(msg) ? "markirovka topilmadi" : msg }
                    : null;
            }

            string S(JsonElement e, string n) => e.ValueKind == JsonValueKind.Object && e.TryGetProperty(n, out var x) && x.ValueKind != JsonValueKind.Null ? x.ToString() : "";
            var steps = new List<Dictionary<string, string>>();
            if (data.TryGetProperty("details", out var det) && det.ValueKind == JsonValueKind.Array)
                foreach (var s in det.EnumerateArray())
                    steps.Add(new()
                    {
                        ["company"] = S(s, "companyName"),
                        ["operation"] = S(s, "type") is { Length: > 0 } t ? t : S(s, "operationType"),
                        ["operationType"] = S(s, "operationType"),
                        ["stir"] = Digits(S(s, "companyTin")),
                        ["date"] = S(s, "operationDate"),
                        ["address"] = S(s, "address"),
                    });
            if (steps.Count == 0) return new { ok = true, verdict = "unknown", reason = "markirovka tarixi bo'sh" };

            // eng so'nggi operatsiya — sana bo'yicha (teng bo'lsa ro'yxatdagi keyingisi)
            Dictionary<string, string>? last = null;
            var best = DateTime.MinValue;
            foreach (var s in steps)
            {
                var ok = DateTime.TryParse(s["date"], System.Globalization.CultureInfo.GetCultureInfo("ru-RU"), System.Globalization.DateTimeStyles.None, out var dt)
                    || DateTime.TryParse(s["date"], System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out dt);
                if (!ok) { last = steps[^1]; break; }
                if (dt >= best) { best = dt; last = s; }
            }
            last ??= steps[^1];

            var history = new Dictionary<string, object?>
            {
                ["product"] = S(data, "name"), ["size"] = S(data, "volume"), ["code"] = S(data, "cis") is { Length: > 0 } c ? c : code,
                ["importer"] = S(data, "manufacturerName"), ["stir"] = S(data, "manufacturerTin"), ["mxik"] = S(data, "mxik"),
                ["barcode"] = S(data, "barCode"), ["steps"] = steps, ["last"] = last,
            };
            var lastEl = JsonSerializer.SerializeToElement(last);
            var verdict = VerdictOf(lastEl, ours);
            // Tekst noma'lum bo'lsa, operatsiya turi kodidan: muomaladan chiqarilgan (chakana sotilgan) — sotilgan
            if (verdict == "unknown" && last["operationType"].Contains("WITHDRAWAL", StringComparison.OrdinalIgnoreCase)) verdict = "sold";
            return new
            {
                ok = true,
                verdict,
                operation = last["operation"],
                lastStir = last["stir"],
                stir = ours,
                stirMatch = ours.Length > 0 ? (bool?)(last["stir"] == ours) : null,
                history = JsonSerializer.SerializeToElement(history),
                fast = true,
            };
        }
        finally
        {
            gate.Release();
        }
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

        // Tezkor yo'l: my.soliq.uz ning o'z API si (sahifadagi qidiruvsiz, bir nechtasi parallel). Ishlamasa — eski usul.
        try
        {
            var fast = await FastCheckAsync(getTab, value, ours);
            if (fast is not null) return fast;
        }
        catch (Exception ex) { IshonchDesktop.Models.Log.Write("soliq-api: " + ex.Message); }

        var pageTab = await getTab();
        var pageGate = PageLock(pageTab);
        await pageGate.WaitAsync();
        try
        {
            var tab = pageTab;
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
            pageGate.Release();
        }
    }
}
