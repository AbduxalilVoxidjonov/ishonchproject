using IshonchDesktop.Elektr;
using IshonchDesktop.Marking;
using IshonchDesktop.Models;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace IshonchDesktop.UI;

/// <summary>
/// "Elektr" bo'limi: akkauntlar ro'yxati (login/parol, saqlanadi) va Kamunalka jadvalini parallel to'ldirish.
/// Interfeys WebView2 ichida (dastur ichiga joylangan fayllardan), C# bilan ElektrHost orqali gaplashadi.
/// </summary>
public sealed class ElektrTab : UserControl
{
    const string Origin = "https://ishonch.elektr/";

    // Sahifa faqat shu fayllarni oladi (exe ichidagi resurslar)
    static readonly Dictionary<string, string> Files = new(StringComparer.OrdinalIgnoreCase)
    {
        ["index.html"] = "text/html; charset=utf-8",
        ["app.js"] = "text/javascript; charset=utf-8",
        ["boot.js"] = "text/javascript; charset=utf-8",
        ["xlsx.full.min.js"] = "text/javascript; charset=utf-8",
        ["jadval.js"] = "text/javascript; charset=utf-8",
        ["batchlib.js"] = "text/javascript; charset=utf-8",
        ["het.js"] = "text/javascript; charset=utf-8",
        ["convert.js"] = "text/javascript; charset=utf-8",
        ["engine.js"] = "text/javascript; charset=utf-8",
    };

    readonly WebView2 view = new() { Dock = DockStyle.Fill };
    readonly Func<string, string, Task<string?>> openCabinet;
    ElektrHost? host;
    PageChannel? channel;

    public ElektrTab(Func<string, string, Task<string?>> openCabinet)
    {
        this.openCabinet = openCabinet;
        Dock = DockStyle.Fill;
        Controls.Add(view);
        Load += async (_, _) => await InitAsync();
    }

    async Task InitAsync()
    {
        try
        {
            _ = Handle;
            await view.EnsureCoreWebView2Async(await WebTab.GetEnvironmentAsync("elektr"));
        }
        catch (Exception e)
        {
            Log.Error("ElektrTab.Init", e);
            MessageBox.Show(this, "WebView2 ishga tushmadi: " + e.Message, "Ishonch", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        var core = view.CoreWebView2;
        core.Settings.AreDevToolsEnabled = true;
        core.Settings.AreDefaultContextMenusEnabled = true;
        core.Settings.IsZoomControlEnabled = true;
        view.ZoomFactor = ZoomStore.Get("elektr");
        view.ZoomFactorChanged += (_, _) => ZoomStore.Set("elektr", view.ZoomFactor);

        core.AddWebResourceRequestedFilter(Origin + "*", CoreWebView2WebResourceContext.All);
        core.WebResourceRequested += Serve;
        // Interfeys faqat o'z sahifasida qoladi, boshqa manzilga o'tmaydi va yangi oyna ochmaydi
        core.NavigationStarting += (_, e) => { if (!e.Uri.StartsWith(Origin, StringComparison.OrdinalIgnoreCase)) e.Cancel = true; };
        core.NewWindowRequested += (_, e) => e.Handled = true;

        host = new ElektrHost(new ElektrStore(), this, openCabinet);
        channel = new PageChannel(core, Origin) { Rpc = host.HandleAsync };
        core.Navigate(Origin + "index.html");
    }

    void Serve(object? sender, CoreWebView2WebResourceRequestedEventArgs e)
    {
        var name = new Uri(e.Request.Uri).AbsolutePath.TrimStart('/');
        if (name.Length == 0) name = "index.html";
        if (!Files.TryGetValue(name, out var type)) return;
        var bytes = MkResources.Bytes("elektr/" + name);
        if (bytes is null) return;
        var env = view.CoreWebView2.Environment;
        e.Response = env.CreateWebResourceResponse(new MemoryStream(bytes), 200, "OK",
            $"Content-Type: {type}\r\nCache-Control: no-store");
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) view.Dispose();
        base.Dispose(disposing);
    }
}
