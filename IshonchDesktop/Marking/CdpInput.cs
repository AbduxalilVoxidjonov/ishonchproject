using System.Text.Json;
using Microsoft.Web.WebView2.Core;

namespace IshonchDesktop.Marking;

/// <summary>
/// Ishonchli (trusted) sichqoncha va klaviatura 1C uchun: 1C sahifa skriptlaridan kelgan sintetik
/// hodisalarni e'tiborga olmaydi, shuning uchun DevTools Protocol orqali haqiqiy hodisalar yuboriladi
/// (Chrome kengaytmasidagi background.js ning C# varianti).
/// </summary>
public static class CdpInput
{
    sealed record Key(string Name, string Code, int KeyCode, string? Text = null);

    static readonly Dictionary<string, Key> Keys = new[]
    {
        new Key("Enter", "Enter", 13, "\r"), new Key("Tab", "Tab", 9), new Key("Escape", "Escape", 27),
        new Key("Backspace", "Backspace", 8), new Key("Delete", "Delete", 46),
        new Key("ArrowDown", "ArrowDown", 40), new Key("ArrowUp", "ArrowUp", 38),
        new Key("ArrowRight", "ArrowRight", 39), new Key("ArrowLeft", "ArrowLeft", 37),
        new Key("PageDown", "PageDown", 34), new Key("PageUp", "PageUp", 33),
        new Key("Home", "Home", 36), new Key("End", "End", 35), new Key("F2", "F2", 113),
        new Key("a", "KeyA", 65),
    }.ToDictionary(k => k.Name);

    static Task Send(CoreWebView2 core, string method, Dictionary<string, object?> p) =>
        core.CallDevToolsProtocolMethodAsync(method, JsonSerializer.Serialize(p));

    /// <summary>Tab boshqa tabga o'tganda ham 1C "fokusda" qolishi uchun bir marta chaqiriladi.</summary>
    public static async Task PrepareAsync(CoreWebView2 core)
    {
        try { await core.CallDevToolsProtocolMethodAsync("Emulation.setFocusEmulationEnabled", "{\"enabled\":true}"); }
        catch { /* ixtiyoriy */ }
    }

    public static async Task RunAsync(CoreWebView2 core, JsonElement a)
    {
        var type = a.GetProperty("type").GetString();
        switch (type)
        {
            case "click":
                await Click(core, a.GetProperty("x").GetDouble(), a.GetProperty("y").GetDouble(),
                    a.TryGetProperty("count", out var c) && c.ValueKind == JsonValueKind.Number ? Math.Max(1, c.GetInt32()) : 1);
                break;
            case "move":
                await Send(core, "Input.dispatchMouseEvent", new()
                    { ["type"] = "mouseMoved", ["x"] = a.GetProperty("x").GetDouble(), ["y"] = a.GetProperty("y").GetDouble() });
                break;
            case "text":
                await TypeChars(core, a.GetProperty("text").GetString() ?? "");
                break;
            case "key":
                await PressKey(core, a.GetProperty("key").GetString() ?? "",
                    a.TryGetProperty("modifiers", out var m) && m.ValueKind == JsonValueKind.Number ? m.GetInt32() : 0);
                break;
            case "selectAll":
                await PressKey(core, "a", 2); // Ctrl+A
                break;
            case "detach":
                break; // WebView2 da debugger paneli yo'q, ajratish shart emas
            default:
                throw new InvalidOperationException("Noma'lum buyruq: " + type);
        }
    }

    // CDP modifikatorlari: Alt=1, Ctrl=2, Meta=4, Shift=8
    static async Task PressKey(CoreWebView2 core, string name, int modifiers)
    {
        if (!Keys.TryGetValue(name, out var k)) throw new InvalidOperationException("Noma'lum tugma: " + name);
        var withText = k.Text is not null && modifiers == 0;
        Dictionary<string, object?> Base(string t)
        {
            var d = new Dictionary<string, object?>
            {
                ["type"] = t, ["key"] = k.Name, ["code"] = k.Code,
                ["windowsVirtualKeyCode"] = k.KeyCode, ["nativeVirtualKeyCode"] = k.KeyCode, ["modifiers"] = modifiers,
            };
            return d;
        }
        var down = Base(withText ? "keyDown" : "rawKeyDown");
        if (withText) { down["text"] = k.Text; down["unmodifiedText"] = k.Text; }
        await Send(core, "Input.dispatchKeyEvent", down);
        await Send(core, "Input.dispatchKeyEvent", Base("keyUp"));
    }

    // 1C matnni keypress hodisalaridan kuzatadi, shuning uchun belgilar birma-bir yoziladi
    static async Task TypeChars(CoreWebView2 core, string text)
    {
        foreach (var rune in text.EnumerateRunes())
        {
            var ch = rune.ToString();
            var isDigit = ch.Length == 1 && ch[0] is >= '0' and <= '9';
            var code = ch == " " ? "Space" : isDigit ? "Digit" + ch : "";
            var keyCode = isDigit ? 48 + (ch[0] - '0') : ch == " " ? 32 : 0;
            await Send(core, "Input.dispatchKeyEvent", new()
            {
                ["type"] = "keyDown", ["text"] = ch, ["unmodifiedText"] = ch, ["key"] = ch, ["code"] = code,
                ["windowsVirtualKeyCode"] = keyCode, ["nativeVirtualKeyCode"] = keyCode,
            });
            await Send(core, "Input.dispatchKeyEvent", new()
            {
                ["type"] = "keyUp", ["key"] = ch, ["code"] = code,
                ["windowsVirtualKeyCode"] = keyCode, ["nativeVirtualKeyCode"] = keyCode,
            });
        }
    }

    static async Task Click(CoreWebView2 core, double x, double y, int count)
    {
        await Send(core, "Input.dispatchMouseEvent", new() { ["type"] = "mouseMoved", ["x"] = x, ["y"] = y });
        for (var i = 1; i <= count; i++)
        {
            await Send(core, "Input.dispatchMouseEvent", new()
                { ["type"] = "mousePressed", ["x"] = x, ["y"] = y, ["button"] = "left", ["clickCount"] = i });
            await Send(core, "Input.dispatchMouseEvent", new()
                { ["type"] = "mouseReleased", ["x"] = x, ["y"] = y, ["button"] = "left", ["clickCount"] = i });
        }
    }
}
