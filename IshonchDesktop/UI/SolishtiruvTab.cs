using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using IshonchDesktop.Models;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace IshonchDesktop.UI;

/// <summary>
/// «Solishtiruv» bo'limi: o'rnatilgan Solishtiruv dasturini (Solishtiruv.exe --embed) orqa fonda yoqadi
/// va uning sahifasini shu tab ichida WebView2 da ko'rsatadi. Kirish/rollar Solishtiruv serveri tomonidan hal qilinadi:
/// buxgalter o'z firmalarini, admin esa admin bo'limlarini ko'radi.
/// </summary>
public sealed class SolishtiruvTab : UserControl
{
    public const string Key = "solishtiruv";
    const int PreferredPort = 5058;

    readonly WebView2 view = new() { Dock = DockStyle.Fill };
    readonly Label status = new()
    {
        Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleCenter,
        Font = new Font("Segoe UI", 11f), Text = "Solishtiruv ishga tushmoqda…",
    };
    Process? proc;
    int port;
    string origin = "";

    public SolishtiruvTab()
    {
        Dock = DockStyle.Fill;
        Controls.Add(view);
        Controls.Add(status);
        status.BringToFront();
        Load += async (_, _) => await InitAsync();
    }

    /// <summary>Solishtiruv.exe ni qidiradi: SOLISHTIRUV_EXE, o'rnatilgan papka, Ishonch yonida, Desktop.</summary>
    static string? FindExe()
    {
        var env = Environment.GetEnvironmentVariable("SOLISHTIRUV_EXE");
        var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var cands = new[]
        {
            env,
            Path.Combine(local, "Programs", "Solishtiruv", "Solishtiruv.exe"),
            Path.Combine(AppContext.BaseDirectory, "Solishtiruv.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Solishtiruv.exe"),
        };
        return cands.FirstOrDefault(p => !string.IsNullOrWhiteSpace(p) && File.Exists(p));
    }

    static int FreePort(int prefer)
    {
        foreach (var p in new[] { prefer, 0 })
        {
            try
            {
                var l = new TcpListener(IPAddress.Loopback, p);
                l.Start();
                var got = ((IPEndPoint)l.LocalEndpoint).Port;
                l.Stop();
                return got;
            }
            catch (SocketException) { }
        }
        return prefer;
    }

    static async Task<bool> WaitUpAsync(int port, Process? p, int seconds = 60)
    {
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
        var until = DateTime.UtcNow.AddSeconds(seconds);
        while (DateTime.UtcNow < until)
        {
            if (p is { HasExited: true }) return false;
            try
            {
                using var r = await http.GetAsync($"http://127.0.0.1:{port}/kirish");
                return true;
            }
            catch { await Task.Delay(500); }
        }
        return false;
    }

    async Task InitAsync()
    {
        var exe = FindExe();
        if (exe is null)
        {
            status.Text = "Solishtiruv dasturi topilmadi.\n\nUni o'rnating (Solishtiruv-ornatuvchi.exe) yoki Solishtiruv.exe ni Ishonch.exe yoniga qo'ying,\nkeyin bu bo'limni qayta oching.";
            return;
        }
        try
        {
            port = FreePort(PreferredPort);
            origin = $"http://127.0.0.1:{port}/";
            proc = Process.Start(new ProcessStartInfo(exe, $"--embed --port {port}")
            {
                UseShellExecute = false, CreateNoWindow = true,
                WorkingDirectory = Path.GetDirectoryName(exe)!,
            });
            if (!await WaitUpAsync(port, proc))
            {
                status.Text = "Solishtiruv ishga tushmadi. Yordam uchun: " + AppInfo.SupportPhone;
                Log.Write("SolishtiruvTab: server ko'tarilmadi " + exe);
                return;
            }

            _ = Handle;
            await view.EnsureCoreWebView2Async(await WebTab.GetEnvironmentAsync("solishtiruv"));
            var core = view.CoreWebView2;
            core.Settings.AreDevToolsEnabled = true;
            core.Settings.IsZoomControlEnabled = true;
            view.ZoomFactor = ZoomStore.Get("solishtiruv");
            view.ZoomFactorChanged += (_, _) => ZoomStore.Set("solishtiruv", view.ZoomFactor);
            // Tashqi havolalar (http/https) oddiy brauzerda ochiladi, tab faqat Solishtiruv sahifasida qoladi
            core.NewWindowRequested += (_, e) =>
            {
                e.Handled = true;
                if (e.Uri.StartsWith("http", StringComparison.OrdinalIgnoreCase))
                    try { Process.Start(new ProcessStartInfo(e.Uri) { UseShellExecute = true }); } catch { }
            };
            core.NavigationStarting += (_, e) =>
            {
                if (!e.Uri.StartsWith(origin, StringComparison.OrdinalIgnoreCase) && e.Uri.StartsWith("http", StringComparison.OrdinalIgnoreCase))
                {
                    e.Cancel = true;
                    try { Process.Start(new ProcessStartInfo(e.Uri) { UseShellExecute = true }); } catch { }
                }
            };
            status.Visible = false;
            core.Navigate(origin);
        }
        catch (Exception e)
        {
            Log.Error("SolishtiruvTab.Init", e);
            status.Text = "Solishtiruv bo'limi ochilmadi: " + e.Message;
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            try { view.Dispose(); } catch { }
            try { if (proc is { HasExited: false }) proc.Kill(entireProcessTree: true); } catch { }
            proc?.Dispose();
        }
        base.Dispose(disposing);
    }
}
