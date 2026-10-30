using System.Text.Json;
using IshonchDesktop.Models;
using IshonchDesktop.UI;
using Microsoft.Web.WebView2.Core;

namespace IshonchDesktop.Marking;

/// <summary>
/// «4790 to'ldiruvchi» (1c-4790-extension) ni 1C tabiga ulaydi: kengaytmaning content.js va panel.css i
/// o'zgarishsiz sahifaga qo'yiladi, uning fon skriptiga (background.js) yuboradigan buyruqlari —
/// click / key / type / insert — bu yerda CdpInput orqali bajariladi. Hujjatni hech qachon saqlamaydi.
/// </summary>
public sealed class U4790Session
{
    readonly WebTab oneC;
    readonly BaseEntry baseEntry;
    readonly string pageOrigin;
    bool started;

    public U4790Session(WebTab oneC, BaseEntry baseEntry)
    {
        this.oneC = oneC;
        this.baseEntry = baseEntry;
        pageOrigin = new Uri(baseEntry.Url).GetLeftPart(UriPartial.Authority) + "/";
    }

    /// <summary>Birinchi marta — skriptni ulab panelni ochadi; keyingi safar panelni ochadi/yopadi.</summary>
    public async Task ToggleAsync()
    {
        await oneC.Ready;
        var core = oneC.Core ?? throw new InvalidOperationException("1C tabi tayyor emas");
        if (!started)
        {
            started = true;
            Log.Write("4790 to'ldiruvchi: " + baseEntry.Db);
            core.WebMessageReceived += OnMessage;
            await CdpInput.PrepareAsync(core);
            var script = PageScript();
            await core.AddScriptToExecuteOnDocumentCreatedAsync(script);
            if (!string.IsNullOrEmpty(core.Source) && core.Source.StartsWith(pageOrigin, StringComparison.OrdinalIgnoreCase))
                await core.ExecuteScriptAsync(script);
        }
        // Sahifa hali yuklanayotgan bo'lsa skript keyinroq tayyor bo'ladi — bir necha marta urinamiz
        for (var attempt = 0; attempt < 20; attempt++)
        {
            var r = await core.ExecuteScriptAsync("window.__u4790Toggle ? (window.__u4790Toggle(), 'ok') : 'wait'");
            if (r.Contains("ok")) return;
            await Task.Delay(500);
        }
        throw new InvalidOperationException("1C sahifasi hali yuklanmadi — biroz kutib qayta bosing");
    }

    static string PageScript() => $@"(() => {{
  if (window.top !== window || window.__u4790Installed) return;
  window.__u4790Installed = true;
  const wv = window.chrome && window.chrome.webview;
  if (!wv) return;
  // Kengaytmadagi chrome.* o'rniga: faqat shu skript ichida ko'rinadi (markirovka paneliga xalal bermaydi)
  let seq = 0;
  const pending = new Map();
  const listeners = new Set();
  wv.addEventListener('message', (e) => {{
    const m = e.data;
    if (!m || m.kind !== 'u4790Reply') return;
    const cb = pending.get(m.id);
    pending.delete(m.id);
    if (cb) cb(m.data);
  }});
  const KEY = 'ishonch.u4790';
  const chrome = {{
    runtime: {{
      id: 'ishonch-desktop',
      lastError: undefined,
      sendMessage: (msg, cb) => {{ const id = ++seq; pending.set(id, (d) => cb && cb(d)); wv.postMessage({{ kind: 'u4790', id, msg }}); }},
      onMessage: {{ addListener: (f) => listeners.add(f) }},
    }},
    storage: {{ local: {{
      get: async () => {{ try {{ const v = localStorage.getItem(KEY); return v ? {{ u4790: JSON.parse(v) }} : {{}}; }} catch (e) {{ return {{}}; }} }},
      set: async (o) => {{ try {{ localStorage.setItem(KEY, JSON.stringify(o.u4790)); }} catch (e) {{}} }},
    }} }},
  }};
  const run = () => {{
    // 1C login'dan keyin <head> ni qayta quradi — uslub yo'qolsa qayta qo'yiladi (Chrome'dagi insertCSS o'rniga)
    const ensureCss = () => {{
      if (document.getElementById('u4790-css')) return;
      const st = document.createElement('style');
      st.id = 'u4790-css';
      st.textContent = {JsonSerializer.Serialize(MkResources.Text("u4790/panel.css") + DockCss)};
      (document.head || document.documentElement).appendChild(st);
    }};
    ensureCss();
    setInterval(ensureCss, 1000);
    {MkResources.Text("u4790/content.js")}
    // content.js tinglovchisi ulangandan keyingina — C# shundan bilib panelni ochadi
    const toggle = () => listeners.forEach((f) => f({{ cmd: 'togglePanel' }}));
    // Panel ochiqligi sahifa qayta yuklansa ham saqlanadi (1C kirishda sahifani bir necha bor yangilaydi)
    const OPEN = 'ishonch.u4790.open';
    window.__u4790Toggle = () => {{
      toggle();
      dock();
      const p = document.getElementById('u4790-panel');
      try {{ sessionStorage.setItem(OPEN, p && p.style.display !== 'none' ? '1' : '0'); }} catch (e) {{}}
    }};
    try {{ if (sessionStorage.getItem(OPEN) === '1') toggle(); }} catch (e) {{}}
    // Panel o'ng tomonga yopishadi, 1C esa qolgan joyga siqiladi (1C o'lchamni 'resize' da qayta hisoblaydi).
    // Panel o'zining × tugmasi bilan yopilsa — 1C to'liq kenglikka qaytadi va qayta yuklanganda ochilmaydi.
    let docked = false;
    const dock = () => {{
      const p = document.getElementById('u4790-panel');
      const open = !!(p && p.isConnected && p.style.display !== 'none');
      if (p && !open) try {{ sessionStorage.setItem(OPEN, '0'); }} catch (e) {{}}
      const cls = document.documentElement.classList;
      if (open === docked && cls.contains('ishonch-u4790-dock') === open) return;
      docked = open;
      cls.toggle('ishonch-u4790-dock', open);
      window.dispatchEvent(new Event('resize'));
    }};
    dock();
    setInterval(dock, 300);
  }};
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', run, {{ once: true }}); else run();
}})();";

    const string DockCss = @"
html.ishonch-u4790-dock, html.ishonch-u4790-dock body { width: calc(100% - 460px) !important; }
html.ishonch-u4790-dock #u4790-panel { top: 0; right: 0; bottom: 0; width: 460px; max-height: none;
  border-radius: 0; border-width: 0 0 0 1px; box-shadow: none; }
html.ishonch-u4790-dock #u4790-panel .u4790-head { border-radius: 0; }
html.ishonch-u4790-dock #u4790-panel .u4790-body { flex: 1; }
html.ishonch-u4790-dock #u4790-panel .u4790-log { height: 35vh; min-height: 140px; }
";

    async void OnMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (!e.Source.StartsWith(pageOrigin, StringComparison.OrdinalIgnoreCase)) return;
        JsonElement root;
        try { root = JsonDocument.Parse(e.WebMessageAsJson).RootElement.Clone(); } catch { return; }
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("kind", out var k) || k.GetString() != "u4790") return;
        var id = root.TryGetProperty("id", out var i) ? i.GetInt64() : 0;
        object data;
        try
        {
            await RunAsync(root.GetProperty("msg"));
            data = new { ok = true };
        }
        catch (Exception ex)
        {
            Log.Error("u4790", ex, baseEntry);
            data = new { ok = false, error = ex.Message };
        }
        try { oneC.Core?.PostWebMessageAsJson(JsonSerializer.Serialize(new { kind = "u4790Reply", id, data })); } catch { /* sahifa yopilgan */ }
    }

    async Task RunAsync(JsonElement msg)
    {
        var core = oneC.Core ?? throw new InvalidOperationException("1C tabi yopilgan");
        var cmd = msg.TryGetProperty("cmd", out var c) ? c.GetString() : "";
        switch (cmd)
        {
            case "attach":
            case "detach":
                break; // WebView2 da DevTools doim ulangan
            case "click":
                await CdpInput.ClickAsync(core, Num(msg, "x"), Num(msg, "y"), (int)Num(msg, "count", 1));
                break;
            case "key":
                await CdpInput.KeyAsync(core, Str(msg, "key"), (int)Num(msg, "modifiers"));
                break;
            case "type":
                await CdpInput.TypeAsync(core, Str(msg, "text"), (int)Num(msg, "delay"));
                break;
            case "insert":
                await CdpInput.InsertAsync(core, Str(msg, "text"));
                break;
            default:
                throw new InvalidOperationException("Noma'lum buyruq: " + cmd);
        }
    }

    static double Num(JsonElement e, string name, double fallback = 0) =>
        e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDouble() : fallback;

    static string Str(JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
}
