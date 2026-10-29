using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace IshonchLogs.Core;

/// <summary>Yig'uvchi sozlamalari: &lt;papka&gt;\settings.json.</summary>
public sealed class CollectorSettings
{
    public int Port { get; set; } = 5077;
    /// <summary>Ishonch dasturlari yuboradigan kalit (bo'sh bo'lsa kalit tekshirilmaydi).</summary>
    public string Key { get; set; } = "";

    public static CollectorSettings Load(string folder)
    {
        try { return JsonSerializer.Deserialize<CollectorSettings>(File.ReadAllText(Path.Combine(folder, "settings.json"))) ?? new(); }
        catch { return new(); }
    }

    public void Save(string folder) =>
        File.WriteAllText(Path.Combine(folder, "settings.json"), JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true }));

    public static string NewKey() => Convert.ToHexString(RandomNumberGenerator.GetBytes(12)).ToLowerInvariant();
}

/// <summary>
/// HTTP qabul qiluvchi: Ishonch dasturlari POST /api/problems ga JSON massiv yuboradi; GET /api/ping — ulanishni sinash.
/// Kalit "X-Ishonch-Key" sarlavhasida keladi. Faqat shu ikki manzil bor, boshqa hech narsa ochilmaydi.
/// </summary>
public sealed class CollectorServer : IAsyncDisposable
{
    public const string KeyHeader = "X-Ishonch-Key";
    const long MaxBody = 4_000_000;

    readonly ProblemStore store;
    readonly string key;
    WebApplication? app;

    public int Port { get; }

    public CollectorServer(ProblemStore store, int port, string key)
    {
        this.store = store;
        Port = port;
        this.key = key;
    }

    public async Task StartAsync()
    {
        var builder = WebApplication.CreateSlimBuilder();
        builder.Logging.ClearProviders();
        builder.WebHost.UseKestrel(o =>
        {
            o.Limits.MaxRequestBodySize = MaxBody;
            o.Listen(IPAddress.Any, Port);
        });
        var web = builder.Build();
        web.MapGet("/api/ping", (HttpRequest req) => KeyOk(req) ? Results.Text("ok") : Results.StatusCode(401));
        web.MapPost("/api/problems", async (HttpRequest req) =>
        {
            if (!KeyOk(req)) return Results.StatusCode(401);
            string body;
            using (var reader = new StreamReader(req.Body, Encoding.UTF8)) body = await reader.ReadToEndAsync();
            List<Problem> items;
            var from = "http " + (req.HttpContext.Connection.RemoteIpAddress?.MapToIPv4().ToString() ?? "?");
            try { items = ProblemParser.ParseBody(body, from); }
            catch (FormatException e) { return Results.BadRequest(e.Message); }
            foreach (var p in items) p.Source = from;
            var added = store.Add(items);
            return Results.Json(new { received = items.Count, added });
        });
        await web.StartAsync();
        app = web;
    }

    bool KeyOk(HttpRequest req)
    {
        if (key.Length == 0) return true;
        var got = req.Headers[KeyHeader].ToString();
        return CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(got), Encoding.UTF8.GetBytes(key));
    }

    public async ValueTask DisposeAsync()
    {
        if (app is null) return;
        await app.StopAsync();
        await app.DisposeAsync();
        app = null;
    }
}
