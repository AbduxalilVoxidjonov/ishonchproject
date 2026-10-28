using System.Text.Json;
using Microsoft.Web.WebView2.Core;

namespace IshonchDesktop.Marking;

/// <summary>
/// Bitta WebView2 sahifasi bilan ikki tomonlama aloqa (shim.js ning C# tomoni).
/// Faqat kutilgan manzildan (originPrefix) kelgan xabarlar qabul qilinadi.
/// </summary>
public sealed class PageChannel
{
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    readonly CoreWebView2 core;
    readonly string originPrefix;
    readonly Dictionary<long, TaskCompletionSource<JsonElement?>> dispatches = new();
    long dispatchSeq;

    /// <summary>"rpc" so'rovlari (chrome.runtime.sendMessage). Qaytgan qiymat sahifaga javob bo'ladi.</summary>
    public Func<JsonElement, Task<object?>>? Rpc { get; set; }

    /// <summary>connectRequest / port / portClose / ready kabi oddiy xabarlar.</summary>
    public Action<string, JsonElement>? Event { get; set; }

    public PageChannel(CoreWebView2 core, string originPrefix)
    {
        this.core = core;
        this.originPrefix = originPrefix;
        core.WebMessageReceived += OnMessage;
    }

    void OnMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (!e.Source.StartsWith(originPrefix, StringComparison.OrdinalIgnoreCase)) return;
        JsonElement root;
        try { root = JsonDocument.Parse(e.WebMessageAsJson).RootElement.Clone(); } catch { return; }
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("kind", out var k)) return;
        var kind = k.GetString() ?? "";

        switch (kind)
        {
            case "rpc":
                _ = HandleRpc(root);
                break;
            case "dispatchReply":
                if (root.TryGetProperty("id", out var idEl) && dispatches.Remove(idEl.GetInt64(), out var tcs))
                    tcs.TrySetResult(root.TryGetProperty("data", out var d) ? d.Clone() : null);
                break;
            default:
                Event?.Invoke(kind, root);
                break;
        }
    }

    async Task HandleRpc(JsonElement root)
    {
        var id = root.GetProperty("id").GetInt64();
        object? data;
        try
        {
            data = Rpc is null ? new { ok = false, error = "ishlov berilmadi" } : await Rpc(root.GetProperty("msg"));
        }
        catch (Exception ex)
        {
            IshonchDesktop.Models.Log.Error("rpc", ex);
            data = new { ok = false, error = ex.Message };
        }
        Send(new { kind = "rpcReply", id, data });
    }

    public void Send(object message)
    {
        try { core.PostWebMessageAsJson(JsonSerializer.Serialize(message, Json)); } catch { /* sahifa yopilgan */ }
    }

    /// <summary>Sahifadagi onMessage tinglovchisiga xabar yuboradi va javobini kutadi (null — javob kelmadi).</summary>
    public async Task<JsonElement?> DispatchAsync(object msg, TimeSpan timeout)
    {
        var id = Interlocked.Increment(ref dispatchSeq);
        var tcs = new TaskCompletionSource<JsonElement?>(TaskCreationOptions.RunContinuationsAsynchronously);
        dispatches[id] = tcs;
        Send(new { kind = "dispatch", id, msg });
        var done = await Task.WhenAny(tcs.Task, Task.Delay(timeout));
        if (done != tcs.Task) { dispatches.Remove(id); return null; }
        return await tcs.Task;
    }
}
