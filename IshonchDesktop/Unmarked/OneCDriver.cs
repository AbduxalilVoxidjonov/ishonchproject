using System.Globalization;
using System.Text;
using System.Text.Json;
using IshonchDesktop.Marking;
using Microsoft.Web.WebView2.Core;

namespace IshonchDesktop.Unmarked;

public readonly record struct Pt(double X, double Y);

/// <summary>1C da kutilgan holat yuz bermadi yoki kutilmagan oyna chiqdi: jarayon to'xtatiladi.</summary>
public sealed class OneCException : Exception
{
    public OneCException(string message) : base(message) { }
}

/// <summary>
/// 1C veb-mijozini boshqarish: sahifadagi o'qiydigan yordamchi (driver.js) + DevTools orqali haqiqiy sichqoncha/klaviatura.
/// 1C sintetik hodisalarga (ayniqsa matn yozish va ba'zi tugmalarga) javob bermaydi, shuning uchun hammasi "ishonchli".
/// </summary>
public sealed class OneCDriver
{
    static readonly string Helper = Encoding.UTF8.GetString(MkResources.Bytes("unmarked/driver.js") ?? Array.Empty<byte>());

    readonly CoreWebView2 core;
    readonly CancellationToken ct;
    double scale = 1;

    public OneCDriver(CoreWebView2 core, CancellationToken ct)
    {
        this.core = core;
        this.ct = ct;
    }

    public static string Q(string s) => JsonSerializer.Serialize(s);

    // ---- sahifa bilan ishlash ------------------------------------------------------------------

    public async Task InitAsync()
    {
        if (Helper.Length == 0) throw new OneCException("driver.js dastur ichida topilmadi");
        await CdpInput.PrepareAsync(core); // orqa fondagi tabda ham klaviatura 1C ga yetib borsin
        await core.ExecuteScriptAsync(Helper);
        await core.ExecuteScriptAsync("window.__ish.watchMove()");
        await EnsureScaleAsync();
    }

    string zoomSig = "";

    /// <summary>
    /// Masshtab (Ctrl + g'ildirak, oyna o'lchami) o'zgarsa DevTools koordinatalari siljiydi: har bosishdan oldin tekshiriladi va
    /// o'zgargan bo'lsa haqiqiy sichqoncha harakati bilan qayta o'lchanadi. Shuning uchun ish paytida zoom qilish mumkin.
    /// </summary>
    async Task EnsureScaleAsync()
    {
        var sig = (await EvalAsync("devicePixelRatio + '|' + innerWidth + '|' + innerHeight + '|' + (window.__ish ? 1 : 0)")).ToString();
        if (sig == zoomSig) return;
        if (!sig.EndsWith("|1"))
        {
            // Sahifa qayta yuklangan: yordamchi qayta o'rnatiladi
            await core.ExecuteScriptAsync(Helper);
            await core.ExecuteScriptAsync("window.__ish.watchMove()");
        }
        await core.ExecuteScriptAsync("window.__moved = null");
        await RunInput("{\"type\":\"move\",\"x\":200,\"y\":200}");
        JsonElement seen = default;
        for (var i = 0; i < 10; i++)
        {
            await Task.Delay(30, ct);
            seen = await EvalAsync("window.__ish.moved()");
            if (seen.ValueKind == JsonValueKind.Object) break;
        }
        scale = seen.ValueKind == JsonValueKind.Object && seen.GetProperty("x").GetDouble() > 0
            ? seen.GetProperty("x").GetDouble() / 200.0 : 1;
        if (Math.Abs(scale - 1) < 0.02) scale = 1;
        zoomSig = (await EvalAsync("devicePixelRatio + '|' + innerWidth + '|' + innerHeight + '|' + (window.__ish ? 1 : 0)")).ToString();
    }

    public async Task<JsonElement> EvalAsync(string expr)
    {
        ct.ThrowIfCancellationRequested();
        var raw = await core.ExecuteScriptAsync(expr);
        if (string.IsNullOrWhiteSpace(raw) || raw == "undefined") return default;
        using var doc = JsonDocument.Parse(raw);
        return doc.RootElement.Clone();
    }

    public async Task<Pt?> PosAsync(string expr)
    {
        var e = await EvalAsync(expr);
        return e.ValueKind == JsonValueKind.Object ? new Pt(e.GetProperty("x").GetDouble(), e.GetProperty("y").GetDouble()) : null;
    }

    public Task<Pt?> PosSuffixAsync(string suffix, string tag = "") => PosAsync($"window.__ish.pos({Q(suffix)},{Q(tag)})");
    public Task<Pt?> MenuItemAsync(string text) => PosAsync($"window.__ish.menuItem({Q(text)})");
    public Task<Pt?> PosSectionAsync(string text) => PosAsync($"window.__ish.posSection({Q(text)})");
    public Task<Pt?> PosLeafAsync(string text) => PosAsync($"window.__ish.posLeaf({Q(text)})");
    public Task<Pt?> ModalButtonAsync(string text) => PosAsync($"window.__ish.modalButton({Q(text)})");

    public async Task<bool> HasAsync(string suffix) => (await EvalAsync($"window.__ish.has({Q(suffix)})")).ValueKind == JsonValueKind.True;
    public async Task<string?> ValueAsync(string suffix) => Str(await EvalAsync($"window.__ish.value({Q(suffix)})"));
    public async Task<string?> PrefixAsync(string suffix) => Str(await EvalAsync($"window.__ish.prefix({Q(suffix)})"));
    public async Task<string?> ModalTextAsync() => Str(await EvalAsync("window.__ish.modalText()"));

    public async Task<List<string>> MessagesAsync()
    {
        var e = await EvalAsync("window.__ish.messages()");
        return e.ValueKind == JsonValueKind.Array ? e.EnumerateArray().Select(x => x.GetString() ?? "").ToList() : new();
    }

    static string? Str(JsonElement e) => e.ValueKind == JsonValueKind.String ? e.GetString() : null;

    // ---- kutish ---------------------------------------------------------------------------------

    public Task DelayAsync(int ms) => Task.Delay(ms, ct);

    /// <summary>Uzoq kutilganda (1C sekin javob bersa) jurnalga xabar berish uchun.</summary>
    public Action<string>? Waiting { get; set; }

    /// <summary>
    /// 1C sekin bo'lishi mumkin: berilgan vaqt — "odatdagi" kutish; undan keyin ham kutishda davom etiladi (jurnalga
    /// "kutilmoqda" yoziladi) va faqat 5 daqiqadan keyin to'xtatiladi. To'xtatish tugmasi har doim ishlaydi.
    /// </summary>
    async Task<bool> PatientAsync(Func<Task<bool>> probe, int timeoutMs, string what, int pollMs)
    {
        var start = Environment.TickCount64;
        var hard = start + Math.Max(timeoutMs, 300_000);
        var nextNote = start + Math.Max(timeoutMs, 10_000);
        while (true)
        {
            ct.ThrowIfCancellationRequested();
            if (await probe()) return true;
            var now = Environment.TickCount64;
            if (now > hard) throw new OneCException("1C 5 daqiqa ichida javob bermadi: " + what);
            if (now > nextNote)
            {
                Waiting?.Invoke($"1C javobi kutilmoqda: {what} ({(now - start) / 1000} s)");
                nextNote = now + 15_000;
            }
            await Task.Delay(pollMs, ct);
        }
    }

    public async Task<T> WaitAsync<T>(Func<Task<T?>> probe, int timeoutMs, string what, int pollMs = 250) where T : struct
    {
        T? found = null;
        await PatientAsync(async () => (found = await probe()) is not null, timeoutMs, what, pollMs);
        return found!.Value;
    }

    public async Task<T> WaitRefAsync<T>(Func<Task<T?>> probe, int timeoutMs, string what, int pollMs = 250) where T : class
    {
        T? found = null;
        await PatientAsync(async () => (found = await probe()) is not null, timeoutMs, what, pollMs);
        return found!;
    }

    public Task WaitTrueAsync(Func<Task<bool>> probe, int timeoutMs, string what, int pollMs = 250) =>
        PatientAsync(probe, timeoutMs, what, pollMs);

    // ---- haqiqiy kiritish -----------------------------------------------------------------------

    async Task RunInput(string json)
    {
        ct.ThrowIfCancellationRequested();
        using var doc = JsonDocument.Parse(json);
        await CdpInput.RunAsync(core, doc.RootElement);
    }

    public async Task ClickAsync(Pt p, int count = 1)
    {
        await EnsureScaleAsync();
        var x = (int)Math.Round(p.X / scale);
        var y = (int)Math.Round(p.Y / scale);
        await RunInput($"{{\"type\":\"click\",\"x\":{x},\"y\":{y},\"count\":{count}}}");
        await Task.Delay(60, ct);
    }

    public async Task ClickSuffixAsync(string suffix, string what, string tag = "")
    {
        var p = await PosSuffixAsync(suffix, tag) ?? throw new OneCException($"«{what}» topilmadi ({suffix})");
        await ClickAsync(p);
    }

    public Task KeyAsync(string key, int modifiers = 0) => RunInput($"{{\"type\":\"key\",\"key\":{Q(key)},\"modifiers\":{modifiers}}}");
    public Task TypeAsync(string text) => RunInput($"{{\"type\":\"text\",\"text\":{Q(text)}}}");
    public Task SelectAllAsync() => RunInput("{\"type\":\"selectAll\"}");

    public async Task WheelAsync(Pt at, double deltaY)
    {
        ct.ThrowIfCancellationRequested();
        var p = new Dictionary<string, object?>
        {
            ["type"] = "mouseWheel", ["x"] = Math.Round(at.X / scale), ["y"] = Math.Round(at.Y / scale), ["deltaX"] = 0, ["deltaY"] = deltaY,
        };
        await core.CallDevToolsProtocolMethodAsync("Input.dispatchMouseEvent", JsonSerializer.Serialize(p));
    }

    /// <summary>
    /// 1C jadvali bitta g'ildirak hodisasida bitta qator suradi (deltaY ahamiyatsiz), shuning uchun `rows` ta hodisa ketma-ket
    /// yuboriladi (manfiy — tepaga) va jadval o'zgarguncha (eng ko'pi ~0,6 s) kutiladi. O'zgargan bo'lsa true.
    /// </summary>
    public async Task<bool> ScrollRowsAsync(string gridSuffix, GridView g, int rows)
    {
        await EnsureScaleAsync();
        string Sig(GridView? v) => v is { Rows.Count: > 0 } ? string.Join("|", v.Rows.Select(r => string.Join("/", r.Cells.Values.Select(c => c.Text)))) : "";
        var before = Sig(g);
        var dy = rows < 0 ? -120 : 120;
        for (var i = 0; i < Math.Abs(rows); i++)
        {
            ct.ThrowIfCancellationRequested();
            var p = new Dictionary<string, object?> { ["type"] = "mouseWheel", ["x"] = Math.Round(g.Center.X / scale), ["y"] = Math.Round(g.Center.Y / scale), ["deltaX"] = 0, ["deltaY"] = dy };
            await core.CallDevToolsProtocolMethodAsync("Input.dispatchMouseEvent", JsonSerializer.Serialize(p));
        }
        for (var i = 0; i < 50; i++) // 1C sekin bo'lsa ham ~2 soniyagacha kutiladi
        {
            await Task.Delay(40, ct);
            if (Sig(await GridAsync(gridSuffix)) != before) { await Task.Delay(60, ct); return true; }
        }
        return false;
    }

    // ---- jadval ---------------------------------------------------------------------------------

    public sealed record GridRow(double Y, bool Selected, Dictionary<string, (string Text, Pt At)> Cells);
    public sealed record GridView(Dictionary<string, string> Head, List<GridRow> Rows, Pt Center, double RowHeight, double Left = 0, double Right = double.MaxValue)
    {
        public string? ColIndex(string name) => Head.FirstOrDefault(h => h.Value == name).Key;

        /// <summary>Ekranda ko'rinib turgan birinchi ustun katagi (tor oynada «Всего» o'ng tomonda yashirin qolishi mumkin).</summary>
        public (string Text, Pt At)? VisibleCell(GridRow row, params string[] columns) =>
            columns.Select(c => Cell(row, c)).FirstOrDefault(c => c is { } v && v.At.X > Left + 5 && v.At.X < Right);
        public (string Text, Pt At)? Cell(GridRow row, string column) =>
            ColIndex(column) is { } ci && row.Cells.TryGetValue(ci, out var c) ? c : null;
    }

    public async Task<GridView?> GridAsync(string gridSuffix)
    {
        // Jadval elementi id si "formN_<nom>"; eng yuqori formadagisi olinadi (bitta so'rov bilan)
        var e = await EvalAsync($"window.__ish.grid({Q(gridSuffix)},true)");
        if (e.ValueKind != JsonValueKind.Object) return null;
        var head = e.GetProperty("head").EnumerateObject().ToDictionary(p => p.Name, p => p.Value.GetString() ?? "");
        var rows = e.GetProperty("rows").EnumerateArray().Select(r => new GridRow(r.GetProperty("y").GetDouble(), r.TryGetProperty("sel", out var sel) && sel.ValueKind == JsonValueKind.True,
            r.GetProperty("cells").EnumerateObject().ToDictionary(c => c.Name,
                c => (c.Value.GetProperty("t").GetString() ?? "", new Pt(c.Value.GetProperty("x").GetDouble(), c.Value.GetProperty("y").GetDouble()))))).ToList();
        return new GridView(head, rows, new Pt(e.GetProperty("cx").GetDouble(), e.GetProperty("cy").GetDouble()), e.GetProperty("rowH").GetDouble(),
            e.TryGetProperty("left", out var l) ? l.GetDouble() : 0, e.TryGetProperty("right", out var rr) ? rr.GetDouble() : double.MaxValue);
    }

    /// <summary>"1 602 514,85" → 1602514.85 (bo'sh bo'lsa null).</summary>
    public static decimal? ParseNumber(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var t = text.Replace(" ", "").Replace(" ", "").Replace(',', '.');
        return decimal.TryParse(t, NumberStyles.Any, CultureInfo.InvariantCulture, out var v) ? v : null;
    }
}
