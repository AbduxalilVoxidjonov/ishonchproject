using System.Text.Json;
using IshonchDesktop.Epos;
using IshonchDesktop.Models;
using IshonchDesktop.UI;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace IshonchDesktop.Marking;

/// <summary>
/// Bitta 1C tabiga "Markirovkali chek" panelini ulaydi: kengaytma skriptlari 1C sahifasida ishlaydi,
/// panel (sidepanel.html) tabning o'ng tomonida alohida WebView2 da ko'rinadi, ular orasidagi
/// aloqa, ishonchli klaviatura/sichqoncha, saqlash va soliq tekshiruvini bu klass bajaradi.
/// </summary>
public sealed class MarkingSession : IDisposable
{
    const string PanelOrigin = "https://ishonch.panel/";
    const int PanelWidth = 450;

    readonly WebTab oneC;
    readonly BaseEntry baseEntry;
    readonly Func<Task<WebTab>> getSoliqTab;
    readonly StateStore store;
    readonly HashSet<long> panelPorts = new();
    readonly string pageOrigin;

    PageChannel? page;
    PageChannel? panel;
    WebView2? panelView;
    MarkedAuto? auto;
    TaskCompletionSource ready = NewReady();
    bool started;

    static TaskCompletionSource NewReady() => new(TaskCreationOptions.RunContinuationsAsynchronously);

    public MarkingSession(WebTab oneC, BaseEntry baseEntry, Func<Task<WebTab>> getSoliqTab)
    {
        this.oneC = oneC;
        this.baseEntry = baseEntry;
        this.getSoliqTab = getSoliqTab;
        store = new StateStore(baseEntry.ProfileKey);
        pageOrigin = new Uri(baseEntry.Url).GetLeftPart(UriPartial.Authority) + "/";
    }

    public async Task StartAsync()
    {
        Log.Write("Markirovka sessiyasi: " + baseEntry.Db);
        if (started) { oneC.ShowSidePanel(PanelWidth); return; }
        started = true;

        await oneC.Ready;
        var core = oneC.Core ?? throw new InvalidOperationException("1C tabi tayyor emas");

        // 1C sahifasi: skriptlar har bir yangi hujjatga qo'shiladi, ochiq turgan sahifaga darhol yuboriladi
        page = new PageChannel(core, pageOrigin) { Rpc = HandlePageRpc, Event = OnPageEvent };
        await CdpInput.PrepareAsync(core);
        var script = MkResources.OneCPageScript();
        await core.AddScriptToExecuteOnDocumentCreatedAsync(script);
        if (!string.IsNullOrEmpty(core.Source) && core.Source.StartsWith(pageOrigin, StringComparison.OrdinalIgnoreCase))
            await core.ExecuteScriptAsync(script);
        core.NavigationStarting += (_, e) =>
        {
            if (!e.IsRedirected && !e.Uri.StartsWith("data:")) ResetPage();
        };

        // Panel: dastur ichidagi sidepanel.html (kengaytmadagi bilan bir xil)
        Log.Write("1C sahifasi ulandi, panel yaratilmoqda");
        panelView = new WebView2 { Dock = DockStyle.Fill };
        oneC.AttachSidePanel(panelView, PanelWidth);
        // «Avtomatik cheklar» bo'limi panelning o'zida chiziladi (umumiy summa → cheklar)
        if (ZoomStore.Settings is { } st) auto = new MarkedAuto(oneC, panelView, st, baseEntry.ProfileKey);
        var env = await WebTab.GetEnvironmentAsync("panel");
        await panelView.EnsureCoreWebView2Async(env);
        var pcore = panelView.CoreWebView2;
        pcore.Settings.IsZoomControlEnabled = true; // panel masshtabi Ctrl + g'ildirak bilan o'zgaradi va eslab qolinadi
        panelView.ZoomFactor = ZoomStore.Get("panel");
        panelView.ZoomFactorChanged += (_, _) => ZoomStore.Set("panel", panelView.ZoomFactor);
        pcore.AddWebResourceRequestedFilter(PanelOrigin + "*", CoreWebView2WebResourceContext.All);
        pcore.WebResourceRequested += ServePanelFile;
        panel = new PageChannel(pcore, PanelOrigin) { Rpc = HandlePanelRpc, Event = OnPanelEvent };
        await pcore.AddScriptToExecuteOnDocumentCreatedAsync(MkResources.PanelScript());
        if (auto is not null)
        {
            await pcore.AddScriptToExecuteOnDocumentCreatedAsync(MarkedAuto.PanelScript);
            pcore.NavigationCompleted += (_, _) => auto.Push(init: true);
        }
        pcore.Navigate(PanelOrigin + "sidepanel.html");
        Log.Write("Panel ochildi");
    }

    /// <summary>1C sahifasi qayta yuklanganda panel aloqasi uziladi; panel o'zi qayta ulanadi.</summary>
    void ResetPage()
    {
        ready = NewReady();
        foreach (var id in panelPorts.ToArray()) panel?.Send(new { kind = "portClose", portId = id });
        panelPorts.Clear();
    }

    // ---- 1C sahifasidan keladigan so'rovlar (content.js) ---------------------------------

    async Task<object?> HandlePageRpc(JsonElement msg)
    {
        var type = msg.TryGetProperty("type", out var t) ? t.GetString() : "";
        switch (type)
        {
            case "sleep":
                await Task.Delay(Math.Clamp(Int(msg, "ms"), 0, 60000));
                return new { ok = true };
            case "cdp":
                await CdpInput.RunAsync(oneC.Core!, msg.GetProperty("action"));
                return new { ok = true };
            case "restartContent":
                oneC.Core!.Reload();
                return new { ok = true };
            case "mxik-check-marking":
                return await SoliqBridge.CheckAsync(getSoliqTab,
                    msg.TryGetProperty("code", out var c) ? c.GetString() : null,
                    msg.TryGetProperty("stir", out var s) ? s.GetString() : null,
                    baseEntry.Inn);
            case "eposSale":
                return await ShowSaleDialogAsync(msg.TryGetProperty("receipt", out var rc) ? rc : default);
            case "storageGet":
                return store.Get(msg.TryGetProperty("keys", out var k) ? k : default);
            case "storageSet":
                if (msg.TryGetProperty("obj", out var o)) store.Set(o);
                return new { ok = true };
            default:
                return new { ok = false, error = "noma'lum so'rov" };
        }
    }

    bool saleOpen;

    /// <summary>1C paneldagi "E-POS orqali sotish" bosilganda: sotish oynasini ochadi va natijani paneliga qaytaradi.</summary>
    async Task<object> ShowSaleDialogAsync(JsonElement receiptJson)
    {
        Log.Write("eposSale so'rovi keldi");
        if (saleOpen) return new { ok = false, error = "sotish oynasi allaqachon ochiq" };
        var receipt = MarkingReceipt.FromJson(receiptJson);
        if (receipt is null) return new { ok = false, error = "chekda tovar yo'q" };
        saleOpen = true;
        try
        {
            await Task.Yield(); // so'rovga javob oqimi bloklanmasin
            using var dialog = new SaleDialog(baseEntry, getSoliqTab, receipt);
            Log.Write("sotish oynasi ochilmoqda: " + receipt.Lines.Count + " qator");
            dialog.ShowDialog(oneC.FindForm());
            Log.Write("sotish oynasi yopildi, sotildi=" + (dialog.Result is not null));
            return dialog.Result is { } r
                ? new { ok = true, sold = true, receiptSeq = r.ReceiptSeq, fiscalSign = r.FiscalSign, qrCodeUrl = r.QrCodeUrl, dateTime = r.DateTime }
                : new { ok = true, sold = false, receiptSeq = "", fiscalSign = "", qrCodeUrl = "", dateTime = "" };
        }
        finally { saleOpen = false; }
    }

    static int Int(JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetInt32() : 0;

    void OnPageEvent(string kind, JsonElement m)
    {
        switch (kind)
        {
            case "ready":
                ready.TrySetResult();
                _ = FillStirAsync();
                break;
            case "port":
                panel?.Send(new { kind = "port", portId = m.GetProperty("portId").GetInt64(), data = m.GetProperty("data") });
                break;
            case "portClose":
                var id = m.GetProperty("portId").GetInt64();
                panelPorts.Remove(id);
                panel?.Send(new { kind = "portClose", portId = id });
                break;
        }
    }

    /// <summary>
    /// Panelning "Bizning STIR" maydoni bo'sh bo'lsa, tanlangan bazaning STIR (INN) i yoziladi.
    /// Qo'lda yozilgan STIR o'zgartirilmaydi. Holat tiklanishini kutish uchun bir necha marta urinadi.
    /// </summary>
    async Task FillStirAsync()
    {
        var inn = new string(baseEntry.Inn.Where(char.IsDigit).ToArray());
        if (inn.Length == 0) return;
        // Maydon panel sahifasida; 'input' hodisasi 1C sahifasidagi holatga STIR ni yozadi
        var script = "(() => { const i = document.querySelector('#app [data-el=\"stir\"]');"
            + " if (!i) return 'none'; if (i.value) return 'has'; i.value = '" + inn + "';"
            + " i.dispatchEvent(new Event('input', { bubbles: true })); return 'set'; })()";
        for (var attempt = 0; attempt < 8; attempt++)
        {
            await Task.Delay(1500);
            try
            {
                if (panelView?.CoreWebView2 is not { } pcore) continue;
                var result = await pcore.ExecuteScriptAsync(script);
                if (result.Contains("set") || result.Contains("has")) { Log.Write("STIR: " + result.Trim('"')); return; }
            }
            catch { return; }
        }
    }

    // ---- panel so'rovlari (sidepanel.js) -------------------------------------------------

    async Task<object?> HandlePanelRpc(JsonElement msg)
    {
        var type = msg.TryGetProperty("type", out var t) ? t.GetString() : "";
        if (type != "ensureContent") return new { ok = false, error = "noma'lum so'rov" };
        var done = await Task.WhenAny(ready.Task, Task.Delay(TimeSpan.FromSeconds(60)));
        return done == ready.Task ? new { ok = true } : new { ok = false, error = "1C sahifasi yuklanmadi" };
    }

    void OnPanelEvent(string kind, JsonElement m)
    {
        var id = m.TryGetProperty("portId", out var p) ? p.GetInt64() : 0;
        switch (kind)
        {
            case "connectRequest":
                panelPorts.Add(id);
                page?.Send(new { kind = "connect", portId = id, name = m.GetProperty("name").GetString() });
                break;
            case "port":
                if (panelPorts.Contains(id)) page?.Send(new { kind = "port", portId = id, data = m.GetProperty("data") });
                break;
            case "portClose":
                if (panelPorts.Remove(id)) page?.Send(new { kind = "portClose", portId = id });
                break;
            case "ishAuto":
                auto?.OnMessage(m);
                break;
        }
    }

    // ---- panel fayllari (exe ichidan) ----------------------------------------------------

    void ServePanelFile(object? sender, CoreWebView2WebResourceRequestedEventArgs e)
    {
        var path = new Uri(e.Request.Uri).AbsolutePath.TrimStart('/');
        if (path is not ("sidepanel.html" or "sidepanel.js" or "work-clock.js")) return;
        var bytes = MkResources.Bytes("mk/" + path);
        if (bytes is null) return;
        var type = path.EndsWith(".html") ? "text/html; charset=utf-8" : "text/javascript; charset=utf-8";
        var env = panelView!.CoreWebView2.Environment;
        e.Response = env.CreateWebResourceResponse(new MemoryStream(bytes), 200, "OK", "Content-Type: " + type);
    }

    public void Dispose()
    {
        auto?.Dispose();
        store.Dispose();
    }
}
