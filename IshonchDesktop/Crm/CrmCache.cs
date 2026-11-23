using System.Text.Json;
using System.Text.Json.Nodes;
using IshonchDesktop.Models;

namespace IshonchDesktop.Crm;

/// <summary>
/// CRM shartnoma to'ldirish keshi (%APPDATA%\Ishonch\crm-kesh): bir marta olingan ma'lumot qayta so'ralmaydi.
/// <list type="bullet">
/// <item>Shartnoma (Didox + OCR + Gemini natijasi) va uning PDF i — hujjat ID si bo'yicha, muddatsiz (imzolangan hujjat o'zgarmaydi).</item>
/// <item>Firma–hamkor shartnomalar ro'yxati — 1 kun (yangi shartnoma qo'shilishi mumkin).</item>
/// </list>
/// «Didox'dan to'ldirish» tugmasi qo'lda bosilsa kesh chetlab o'tiladi va yangilanadi.
/// </summary>
public static class CrmCache
{
    public static string Dir { get; set; } = Path.Combine(Paths.AppData, "crm-kesh");
    public static readonly TimeSpan ListTtl = TimeSpan.FromDays(1);
    static readonly JsonSerializerOptions Json = new() { WriteIndented = false };

    static string Safe(string s) => string.Concat(s.Select(ch => char.IsLetterOrDigit(ch) || ch is '-' or '_' ? ch : '_'));

    static void WriteAtomic(string path, byte[] bytes)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var tmp = path + ".tmp";
        File.WriteAllBytes(tmp, bytes);
        File.Move(tmp, path, overwrite: true);
    }

    // ---- ro'yxat ---------------------------------------------------------------------------------

    static string ListPath(string firmTin, string partnerTin) => Path.Combine(Dir, "royxat", Safe(firmTin + "_" + partnerTin) + ".json");

    public static List<JsonObject>? GetList(string firmTin, string partnerTin)
    {
        try
        {
            var p = ListPath(firmTin, partnerTin);
            if (!File.Exists(p) || DateTime.UtcNow - File.GetLastWriteTimeUtc(p) > ListTtl) return null;
            return (JsonNode.Parse(File.ReadAllText(p)) as JsonArray)?.OfType<JsonObject>().Select(x => (JsonObject)x.DeepClone()).ToList();
        }
        catch { return null; }
    }

    public static void PutList(string firmTin, string partnerTin, List<JsonObject> items)
    {
        try { WriteAtomic(ListPath(firmTin, partnerTin), JsonSerializer.SerializeToUtf8Bytes(new JsonArray(items.Select(x => (JsonNode)x.DeepClone()).ToArray()), Json)); }
        catch (Exception e) { Log.Error("CRM kesh (ro'yxat)", e); }
    }

    // ---- shartnoma -----------------------------------------------------------------------------------

    static string DocPath(string docId) => Path.Combine(Dir, "shartnoma", Safe(docId) + ".json");
    public static string PdfPath(string docId) => Path.Combine(Dir, "shartnoma", Safe(docId) + ".pdf");

    /// <summary>Saqlangan shartnoma, saqlangan izoh va PDF (bo'lsa).</summary>
    public static (DidoxContract c, string note, byte[]? pdf)? GetDoc(string docId)
    {
        try
        {
            var p = DocPath(docId);
            if (!File.Exists(p)) return null;
            var e = JsonSerializer.Deserialize<Entry>(File.ReadAllText(p));
            if (e?.Contract is null || e.V < Version) return null;
            var pdf = File.Exists(PdfPath(docId)) ? File.ReadAllBytes(PdfPath(docId)) : null;
            return (e.Contract, e.Note ?? "", pdf);
        }
        catch { return null; }
    }

    // ---- OCR natijasi (sahifa rasmlari + so'z joylari) va ko'rish sahifasi ---------------------------

    public static string ViewDir(string docId) => Path.Combine(Dir, "korish", Safe(docId));

    sealed record PageMeta(int Width, int Height, List<OcrLine> Lines);

    /// <summary>Saqlangan OCR natijasi (bo'lmasa null): sahifa rasmlari p1.png… va ocr.json.</summary>
    public static List<OcrPage>? GetLayout(string docId)
    {
        try
        {
            var dir = ViewDir(docId);
            var meta = Path.Combine(dir, "ocr.json");
            if (!File.Exists(meta)) return null;
            var pages = JsonSerializer.Deserialize<List<PageMeta>>(File.ReadAllText(meta));
            if (pages is null) return null;
            return pages.Select((p, i) => new OcrPage(File.ReadAllBytes(Path.Combine(dir, $"p{i + 1}.png")), p.Width, p.Height, p.Lines)).ToList();
        }
        catch { return null; }
    }

    public static void PutLayout(string docId, List<OcrPage> pages)
    {
        try
        {
            var dir = ViewDir(docId);
            for (var i = 0; i < pages.Count; i++) WriteAtomic(Path.Combine(dir, $"p{i + 1}.png"), pages[i].Png);
            WriteAtomic(Path.Combine(dir, "ocr.json"),
                JsonSerializer.SerializeToUtf8Bytes(pages.Select(p => new PageMeta(p.Width, p.Height, p.Lines)).ToList(), Json));
        }
        catch (Exception e) { Log.Error("CRM kesh (OCR)", e); }
    }

    /// <summary>Ko'rish sahifasini yozadi va uning yo'lini qaytaradi.</summary>
    public static string PutViewHtml(string docId, string html)
    {
        var p = Path.Combine(ViewDir(docId), "index.html");
        WriteAtomic(p, System.Text.Encoding.UTF8.GetBytes(html));
        return p;
    }

    /// <summary>Faqat PDF (ko'rish uchun yuklangan, shartnoma hali tanlanmagan bo'lishi mumkin).</summary>
    public static byte[]? GetPdf(string docId)
    {
        try { return File.Exists(PdfPath(docId)) ? File.ReadAllBytes(PdfPath(docId)) : null; }
        catch { return null; }
    }

    public static void PutPdf(string docId, byte[] pdf)
    {
        try { WriteAtomic(PdfPath(docId), pdf); }
        catch (Exception e) { Log.Error("CRM kesh (PDF)", e); }
    }

    public static void PutDoc(DidoxContract c, string note, byte[]? pdf)
    {
        try
        {
            if (pdf is not null) WriteAtomic(PdfPath(c.DocId), pdf);
            WriteAtomic(DocPath(c.DocId), JsonSerializer.SerializeToUtf8Bytes(new Entry(c, note, DateTime.Now, Version), Json));
        }
        catch (Exception e) { Log.Error("CRM kesh (shartnoma)", e); }
    }

    // V — kesh tuzilishi versiyasi: eski yozuvlar (maqsad manbasisiz) bir marta qayta o'qiladi
    const int Version = 2;
    sealed record Entry(DidoxContract Contract, string? Note, DateTime Saved, int V = 0);
}
