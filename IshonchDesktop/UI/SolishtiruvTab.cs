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
    const string ServerUrl = "http://169.58.207.222:8770";   // Solishtiruv markaziy serveri (dasturni shu yerdan oladi)
    static readonly Version MinVersion = new(2, 4, 0);         // --embed rejimi shu versiyadan boshlab bor
    static string ManagedDir => Path.Combine(Paths.AppData, "solishtiruv");

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

    /// <summary>Solishtiruv.exe ni qidiradi: topilganlardan eng yangi versiyasini oladi (eski o'rnatma yangisini to'sib qo'ymasin).</summary>
    static string? FindExe()
    {
        var env = Environment.GetEnvironmentVariable("SOLISHTIRUV_EXE");
        var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var desk = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        var managed = Directory.Exists(ManagedDir)
            ? Directory.GetFiles(ManagedDir, "Solishtiruv*.exe") : Array.Empty<string>();
        var cands = managed.Concat(new[]
        {
            env,
            Path.Combine(local, "Programs", "Solishtiruv", "Solishtiruv.exe"),
            Path.Combine(AppContext.BaseDirectory, "Solishtiruv.exe"),
            Path.Combine(desk, "Solishtiruv", "Solishtiruv.exe"),
            Path.Combine(desk, "Solishtiruv.exe"),
        });
        if (!string.IsNullOrWhiteSpace(env) && File.Exists(env)) return env; // qo'lda berilgan - o'sha
        return cands.Where(p => !string.IsNullOrWhiteSpace(p) && File.Exists(p))
            .OrderByDescending(Ver).FirstOrDefault();
    }

    /// <summary>Solishtiruv dasturi yo'q yoki eski bo'lsa, uni serverdan Ishonch papkasiga yuklaydi (alohida o'rnatish shart emas).</summary>
    async Task<string?> EnsureExeAsync()
    {
        var exe = FindExe();
        if (exe is not null && (Ver(exe) >= MinVersion || !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("SOLISHTIRUV_EXE"))))
            return exe;
        try
        {
            status.Text = "Solishtiruv dasturi serverdan yuklanmoqda (bir marta, ~35 MB)…";
            Directory.CreateDirectory(ManagedDir);
            var part = Path.Combine(ManagedDir, "Solishtiruv.exe.part");
            using (var http = new HttpClient { Timeout = TimeSpan.FromMinutes(10) })
            using (var resp = await http.GetAsync(ServerUrl + "/yuklab-olish", HttpCompletionOption.ResponseHeadersRead))
            {
                resp.EnsureSuccessStatusCode();
                await using var src = await resp.Content.ReadAsStreamAsync();
                await using var dst = File.Create(part);
                await src.CopyToAsync(dst);
            }
            if (Ver(part) < MinVersion) throw new InvalidDataException("serverdagi Solishtiruv eski versiya");
            var target = Path.Combine(ManagedDir, "Solishtiruv.exe");
            File.Move(part, target, overwrite: true);
            return target;
        }
        catch (Exception e)
        {
            Log.Error("SolishtiruvTab.Download", e);
            return exe; // yuklab bo'lmasa, bor eskisi bilan urinib ko'riladi (--web zaxirasi)
        }
    }

    static Version Ver(string? p)
    {
        try { return Version.Parse(FileVersionInfo.GetVersionInfo(p!).FileVersion ?? "0.0"); } catch { return new Version(0, 0); }
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
        var exe = await EnsureExeAsync();
        if (exe is null)
        {
            status.Text = "Solishtiruv dasturi topilmadi va serverdan yuklab bo'lmadi.\n\nInternet va server (169.58.207.222) ochiqligini tekshirib, bo'limni qayta oching.";
            return;
        }
        try
        {
            port = FreePort(PreferredPort);
            origin = $"http://127.0.0.1:{port}/";
            Process? Start(string args) => Process.Start(new ProcessStartInfo(exe, args)
            {
                UseShellExecute = false, CreateNoWindow = true,
                WorkingDirectory = Path.GetDirectoryName(exe)!,
            });
            proc = Start($"--embed --port {port}");
            var up = await WaitUpAsync(port, proc);
            if (!up && proc is { HasExited: true })
            {
                // Eski Solishtiruv (--embed ni bilmaydi): oddiy veb rejim
                Log.Write("SolishtiruvTab: --embed ishlamadi, --web bilan urinilmoqda");
                proc.Dispose();
                proc = Start($"--web --no-open --port {port}");
                up = await WaitUpAsync(port, proc);
            }
            if (!up)
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
