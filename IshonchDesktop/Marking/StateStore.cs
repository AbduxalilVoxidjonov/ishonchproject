using System.Text.Json;
using System.Text.Json.Nodes;
using IshonchDesktop.Models;

namespace IshonchDesktop.Marking;

/// <summary>
/// chrome.storage.local o'rnini bosadi: har bir baza uchun alohida fayl (%APPDATA%\Ishonch\marking\...).
/// Sahifa holatni har logda saqlaydi, shuning uchun xotirada ushlanadi va faylga kechiktirib yoziladi.
/// </summary>
public sealed class StateStore : IDisposable
{
    readonly string path;
    readonly JsonObject data;
    readonly object gate = new();
    readonly System.Threading.Timer timer;
    bool dirty;

    // Faqat markirovka holati kaliti ruxsat etiladi: 1C sahifasi boshqa narsa yoza olmasin
    static bool Allowed(string key) => key.StartsWith("mk1c_", StringComparison.Ordinal);

    public StateStore(string profileKey)
    {
        var dir = Directory.CreateDirectory(Path.Combine(Paths.AppData, "marking")).FullName;
        path = Path.Combine(dir, profileKey + ".json");
        try { data = JsonNode.Parse(File.ReadAllText(path)) as JsonObject ?? new JsonObject(); }
        catch { data = new JsonObject(); }
        timer = new System.Threading.Timer(_ => Flush(), null, Timeout.Infinite, Timeout.Infinite);
    }

    public JsonObject Get(JsonElement keys)
    {
        var result = new JsonObject();
        IEnumerable<string> names = keys.ValueKind switch
        {
            JsonValueKind.String => new[] { keys.GetString()! },
            JsonValueKind.Array => keys.EnumerateArray().Select(k => k.GetString() ?? ""),
            _ => Array.Empty<string>(),
        };
        lock (gate)
            foreach (var n in names)
                if (Allowed(n) && data[n] is { } v) result[n] = v.DeepClone();
        return result;
    }

    public void Set(JsonElement obj)
    {
        if (obj.ValueKind != JsonValueKind.Object) return;
        lock (gate)
        {
            foreach (var p in obj.EnumerateObject())
                if (Allowed(p.Name)) data[p.Name] = JsonNode.Parse(p.Value.GetRawText());
            dirty = true;
            timer.Change(700, Timeout.Infinite);
        }
    }

    public void Flush()
    {
        string text;
        lock (gate)
        {
            if (!dirty) return;
            dirty = false;
            text = data.ToJsonString();
        }
        try
        {
            var tmp = path + ".tmp";
            File.WriteAllText(tmp, text);
            File.Move(tmp, path, true);
        }
        catch { /* keyingi saqlashda qayta uriniladi */ lock (gate) dirty = true; }
    }

    public void Dispose()
    {
        timer.Dispose();
        Flush();
    }
}
