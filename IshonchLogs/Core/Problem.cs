using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace IshonchLogs.Core;

/// <summary>
/// Bitta muammo yozuvi. Maydonlar Ishonch dasturidagi ProblemEntry (problems.jsonl) bilan bir xil;
/// <see cref="Source"/> va <see cref="Received"/> — yig'uvchining o'zi qo'shadi.
/// </summary>
public sealed class Problem
{
    public string Id { get; set; } = "";
    public DateTimeOffset Time { get; set; }
    /// <summary>"warn" yoki "err".</summary>
    public string Level { get; set; } = "err";
    public string Feature { get; set; } = "Dastur";
    public string? Db { get; set; }
    public string? Firm { get; set; }
    public string? Inn { get; set; }
    public string? Server { get; set; }
    public string? Pc { get; set; }
    public string? User { get; set; }
    public string? App { get; set; }
    public string Message { get; set; } = "";
    public string? Details { get; set; }
    public string? Context { get; set; }

    /// <summary>Qayerdan keldi: "http 192.168.1.20" yoki import qilingan fayl nomi.</summary>
    public string? Source { get; set; }
    public DateTimeOffset Received { get; set; }

    /// <summary>
    /// Firma bo'yicha guruhlash kaliti: INN (bo'lsa) — shunda faqat INN bilan kelgan soliq xatolari ham shu firmaga tushadi;
    /// bo'lmasa baza nomi, firma nomi yoki kompyuter.
    /// </summary>
    [JsonIgnore]
    public string FirmKey =>
        !string.IsNullOrWhiteSpace(Inn) ? "inn:" + Inn.Trim()
        : !string.IsNullOrWhiteSpace(Db) ? "db:" + Db.Trim().ToLowerInvariant()
        : !string.IsNullOrWhiteSpace(Firm) ? "firm:" + Firm.Trim().ToLowerInvariant()
        : "pc:" + (Pc ?? "?");

    /// <summary>Ekranda: "Firma (baza)" yoki bori.</summary>
    [JsonIgnore]
    public string FirmTitle =>
        !string.IsNullOrWhiteSpace(Firm) ? (string.IsNullOrWhiteSpace(Db) || Db == Firm ? Firm : $"{Firm} ({Db})")
        : !string.IsNullOrWhiteSpace(Db) ? Db
        : !string.IsNullOrWhiteSpace(Inn) ? "INN " + Inn
        : "Kompyuter " + (Pc ?? "?");

    /// <summary>Firma nomi qanchalik to'liq (guruh sarlavhasi uchun eng to'liq yozuv tanlanadi).</summary>
    [JsonIgnore]
    internal int TitleQuality => (string.IsNullOrWhiteSpace(Firm) ? 0 : 2) + (string.IsNullOrWhiteSpace(Db) ? 0 : 1);
}

/// <summary>Yozuvlarni o'qish: problems.jsonl, HTTP dan kelgan JSON massiv va eski versiyalarning app.log fayli.</summary>
public static class ProblemParser
{
    public static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    /// <summary>Har qatorda bitta JSON; buzilgan qatorlar tashlanadi.</summary>
    public static List<Problem> ParseJsonLines(string text, string source)
    {
        var list = new List<Problem>();
        foreach (var raw in text.Split('\n'))
        {
            var line = raw.Trim().TrimStart('﻿');
            if (line.Length == 0 || line[0] != '{') continue;
            if (FromJson(line, source) is { } p) list.Add(p);
        }
        return list;
    }

    /// <summary>HTTP so'rov tanasi: JSON massiv yoki bitta obyekt. Noto'g'ri bo'lsa — FormatException.</summary>
    public static List<Problem> ParseBody(string body, string source)
    {
        var list = new List<Problem>();
        JsonDocument doc;
        try { doc = JsonDocument.Parse(body); }
        catch (JsonException e) { throw new FormatException("JSON emas: " + e.Message); }
        using (doc)
        {
            var items = doc.RootElement.ValueKind switch
            {
                JsonValueKind.Array => doc.RootElement.EnumerateArray().ToList(),
                JsonValueKind.Object => new List<JsonElement> { doc.RootElement },
                _ => throw new FormatException("JSON massiv yoki obyekt kutilgan edi"),
            };
            foreach (var el in items)
                if (el.ValueKind == JsonValueKind.Object && FromJson(el.GetRawText(), source) is { } p) list.Add(p);
        }
        return list;
    }

    static Problem? FromJson(string json, string source)
    {
        try
        {
            var p = JsonSerializer.Deserialize<Problem>(json, Json);
            if (p is null || string.IsNullOrWhiteSpace(p.Message)) return null;
            p.Level = p.Level == "warn" ? "warn" : "err";
            if (string.IsNullOrWhiteSpace(p.Feature)) p.Feature = "Dastur";
            if (string.IsNullOrWhiteSpace(p.Id)) p.Id = Hash($"{p.Time:O}|{p.Pc}|{p.Db}|{p.Message}");
            p.Source ??= source;
            return p;
        }
        catch (JsonException) { return null; }
    }

    /// <summary>
    /// Eski Ishonch (0.7.6 va oldingi) app.log fayli: muammolar jurnali hali yo'q bo'lgan kompyuterlardan.
    /// Qatorda faqat vaqt bor — sana sifatida <paramref name="day"/> (odatda faylning o'zgargan kuni) olinadi.
    /// Xato deb: "XATO …", "✗", «xato», «Kutilmagan», «ISHLAMAYAPTI»; ogohlantirish deb: «bo'lmadi», «topilmadi», «Diqqat».
    /// </summary>
    public static List<Problem> ParseAppLog(string text, string source, DateTime day)
    {
        var list = new List<Problem>();
        var lines = text.Replace("\r", "").Split('\n');
        var recent = new Queue<string>();
        Problem? open = null; // stack trace davomi shu yozuvga qo'shiladi
        for (var i = 0; i < lines.Length; i++)
        {
            var line = lines[i];
            if (line.Length == 0) continue;
            if (!TryTime(line, out var time))
            {
                if (open is not null) open.Details = (open.Details is null ? "" : open.Details + "\n") + line;
                continue;
            }
            open = null;
            var body = line[13..];
            var p = Classify(body);
            if (p is not null)
            {
                p.Time = new DateTimeOffset(day.Date + time);
                p.Context = string.Join("\n", recent.Append(line));
                p.Source = source;
                p.Pc = Path.GetFileNameWithoutExtension(source);
                p.Id = Hash($"{source}|{p.Time:O}|{body}");
                list.Add(p);
                if (body.StartsWith("XATO ")) open = p;
            }
            recent.Enqueue(line);
            if (recent.Count > 20) recent.Dequeue();
        }
        return list;
    }

    static bool TryTime(string line, out TimeSpan time)
    {
        time = default;
        return line.Length > 13 && line[12] == ' '
            && TimeSpan.TryParseExact(line[..12], @"hh\:mm\:ss\.fff", System.Globalization.CultureInfo.InvariantCulture, out time);
    }

    static Problem? Classify(string body)
    {
        string feature = "Dastur", msg = body;
        string? db = null, firm = null;
        if (body.StartsWith("XATO "))
        {
            // "XATO where: System.Exception: matn"
            var colon = body.IndexOf(':', 5);
            var where = colon > 5 ? body[5..colon] : "";
            return new Problem { Level = "err", Feature = FeatureFromWhere(where), Message = body[5..].Split('\n')[0], Details = body };
        }
        if (body.StartsWith("Markirovkali avto: ")) { feature = "Markirovkali avto"; msg = body[19..]; }
        else if (body.StartsWith("Markirovkasiz [") && body.IndexOf("]: ", StringComparison.Ordinal) is var end and > 15)
        {
            feature = "Markirovkasiz";
            msg = body[(end + 3)..];
            var title = body[15..end]; // "baza — firma"
            var dash = title.IndexOf(" — ", StringComparison.Ordinal);
            if (dash > 0) { db = title[..dash]; firm = title[(dash + 3)..]; } else db = title;
        }
        else if (body.StartsWith("soliq-api")) feature = "Soliq";

        var low = msg.ToLowerInvariant();
        string? level =
            low.Contains("xato") || msg.Contains('✗') || low.Contains("kutilmagan") || msg.Contains("ISHLAMAYAPTI") ? "err"
            : low.Contains("bo'lmadi") || low.Contains("topilmadi") || low.Contains("diqqat") || (feature == "Soliq" && !msg.StartsWith("soliq-api 200")) ? "warn"
            : null;
        if (level is null) return null;
        return new Problem { Level = level, Feature = feature, Message = msg, Db = db, Firm = firm };
    }

    /// <summary>Ishonch dagi Feature.FromWhere bilan bir xil.</summary>
    public static string FeatureFromWhere(string where)
    {
        var w = where.ToLowerInvariant();
        if (w.StartsWith("elektr") || w.StartsWith("opencabinet")) return "Elektr";
        if (w.StartsWith("markedauto")) return "Markirovkali avto";
        if (w.StartsWith("unmarked")) return "Markirovkasiz";
        if (w.StartsWith("update")) return "Yangilanish";
        if (w.StartsWith("rpc") || w.StartsWith("openmarking")) return "Markirovka panel";
        if (w.StartsWith("soliq")) return "Soliq";
        return "Dastur";
    }

    static string Hash(string s) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(s)))[..32].ToLowerInvariant();
}
