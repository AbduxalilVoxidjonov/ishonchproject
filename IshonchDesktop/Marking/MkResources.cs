using System.Reflection;
using System.Text;
using System.Text.Json;

namespace IshonchDesktop.Marking;

/// <summary>
/// Kengaytma fayllari (content.js, sidepanel.js, ...) dastur ichiga qurish vaqtida o'zgarishsiz joylanadi
/// (csproj dagi EmbeddedResource), shuning uchun mantiq bitta joyda — kengaytma papkasida — qoladi.
/// </summary>
public static class MkResources
{
    static readonly Assembly Asm = typeof(MkResources).Assembly;

    // Ishlash tartibi manifest.json dagi content_scripts bilan bir xil
    static readonly string[] ContentFiles =
    {
        "receipt-math.js", "stock-ledger.js", "receipt-pair.js", "markup-driver.js",
        "state-migration.js", "work-clock.js", "content.js",
    };

    public static string Text(string name)
    {
        using var s = Asm.GetManifestResourceStream(name) ?? throw new FileNotFoundException("Resurs topilmadi: " + name);
        using var r = new StreamReader(s, Encoding.UTF8);
        return r.ReadToEnd();
    }

    public static byte[]? Bytes(string name)
    {
        using var s = Asm.GetManifestResourceStream(name);
        if (s is null) return null;
        using var ms = new MemoryStream();
        s.CopyTo(ms);
        return ms.ToArray();
    }

    public static string Version { get; } = ReadVersion();

    static string ReadVersion()
    {
        try
        {
            using var doc = JsonDocument.Parse(Text("mk/manifest.json"));
            return doc.RootElement.GetProperty("version").GetString() ?? "1.0.0";
        }
        catch { return "1.0.0"; }
    }

    static string Shim(string mode) =>
        $"const __MODE__ = '{mode}'; const __VERSION__ = {JsonSerializer.Serialize(Version)};\n{Text("shim.js")}";

    /// <summary>1C sahifasiga: ko'rinib turish + ko'prik + kengaytmaning barcha content skriptlari.</summary>
    public static string OneCPageScript()
    {
        var files = string.Join("\n;\n", ContentFiles.Select(f => Text("mk/" + f)));
        return $@"(() => {{
  if (window.top !== window || window.__mkAppInstalled) return;
  window.__mkAppInstalled = true;
  {Text("keepactive.js")}
  (() => {{ {Shim("page")} }})();
  const run = () => {{
    {files}
    ;window.chrome.webview.postMessage({{ kind: 'ready' }});
  }};
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', run, {{ once: true }}); else run();
}})();";
    }

    /// <summary>Yon panel sahifasiga (sidepanel.js dan oldin ishlaydi).</summary>
    public static string PanelScript() => $"(() => {{ {Shim("panel")} }})();";

    /// <summary>my.soliq.uz sahifasiga: ko'rinib turish + ko'prik + MXIK qidiruv skripti.</summary>
    public static string SoliqScript() => $@"(() => {{
  if (window.top !== window || window.__mxikAppInstalled) return;
  window.__mxikAppInstalled = true;
  {Text("soliq/page-active.js")}
  (() => {{ {Shim("soliq")} }})();
  const run = () => {{ {Text("soliq/content.js")} }};
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', run, {{ once: true }}); else run();
}})();";
}
