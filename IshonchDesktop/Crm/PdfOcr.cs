using System.Runtime.InteropServices.WindowsRuntime;
using Windows.Data.Pdf;
using Windows.Globalization;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;
using Windows.Storage.Streams;

namespace IshonchDesktop.Crm;

/// <summary>OCR qilingan so'z: matni va sahifadagi joyi (sahifa o'lchamiga nisbatan 0..1).</summary>
public sealed record OcrWord(string Text, double X, double Y, double W, double H);
public sealed record OcrLine(string Text, List<OcrWord> Words);
/// <summary>Sahifa: rasm (PNG), piksel o'lchami va qatorlar.</summary>
public sealed record OcrPage(byte[] Png, int Width, int Height, List<OcrLine> Lines);

/// <summary>
/// PDF matnini Windows'ning o'z vositalari bilan o'qiydi: sahifalar rasmga aylantiriladi (Windows.Data.Pdf) va
/// OCR qilinadi (Windows.Media.Ocr). Skanerlangan (rasm) PDF ham, matnli PDF ham bir xil o'qiladi.
/// So'zlarning joyi ham qaytadi — ko'rish oynasida maqsad manbasini sariq bilan belgilash uchun.
/// Tashqi kutubxona va internet kerak emas. Kirill uchun Windows'da rus OCR tili o'rnatilgan bo'lishi kerak.
/// </summary>
public static class PdfOcr
{
    /// <summary>OCR tili: rus (kirill) bo'lsa o'sha, bo'lmasa foydalanuvchi tillaridan biri.</summary>
    static OcrEngine? Engine()
    {
        foreach (var tag in new[] { "ru", "ru-RU", "uz-Cyrl", "uz-Latn" })
        {
            try
            {
                var lang = new Language(tag);
                if (OcrEngine.IsLanguageSupported(lang)) return OcrEngine.TryCreateFromLanguage(lang);
            }
            catch { /* til yo'q */ }
        }
        return OcrEngine.TryCreateFromUserProfileLanguages();
    }

    public static bool HasCyrillic => OcrEngine.AvailableRecognizerLanguages.Any(l => l.LanguageTag.StartsWith("ru") || l.LanguageTag.StartsWith("uz-Cyrl"));

    /// <summary>PDF ning birinchi <paramref name="maxPages"/> sahifasi matni (sahifalar orasida bo'sh qator).</summary>
    public static async Task<string> ReadAsync(byte[] pdf, int maxPages = 6, CancellationToken ct = default) =>
        TextOf(await ReadLayoutAsync(pdf, maxPages, ct));

    public static string TextOf(IEnumerable<OcrPage> pages)
    {
        var sb = new System.Text.StringBuilder();
        foreach (var p in pages)
        {
            foreach (var line in p.Lines) sb.AppendLine(line.Text);
            sb.AppendLine();
        }
        return sb.ToString();
    }

    /// <summary>Sahifalar rasmi va OCR qatorlari (so'z joylari bilan).</summary>
    public static async Task<List<OcrPage>> ReadLayoutAsync(byte[] pdf, int maxPages = 6, CancellationToken ct = default)
    {
        var engine = Engine() ?? throw new InvalidOperationException("Windows OCR tili topilmadi (rus tilini o'rnating).");
        using var mem = new InMemoryRandomAccessStream();
        await mem.WriteAsync(pdf.AsBuffer());
        mem.Seek(0);
        var doc = await PdfDocument.LoadFromStreamAsync(mem);
        var pages = new List<OcrPage>();
        for (uint i = 0; i < Math.Min(doc.PageCount, (uint)maxPages); i++)
        {
            ct.ThrowIfCancellationRequested();
            using var page = doc.GetPage(i);
            // ~200 dpi: kichik shrift ham o'qiladi, OCR chegarasidan (MaxImageDimension) oshmaydi
            var scale = Math.Min(200.0 / 96.0, (OcrEngine.MaxImageDimension - 10) / Math.Max(page.Size.Width, page.Size.Height));
            var w = (uint)(page.Size.Width * scale);
            var h = (uint)(page.Size.Height * scale);
            using var img = new InMemoryRandomAccessStream();
            await page.RenderToStreamAsync(img, new PdfPageRenderOptions { DestinationWidth = w, DestinationHeight = h, BitmapEncoderId = BitmapEncoder.PngEncoderId });
            // PNG nusxasi (ko'rish oynasi uchun)
            var png = new byte[img.Size];
            img.Seek(0);
            await img.ReadAsync(png.AsBuffer(), (uint)png.Length, InputStreamOptions.None);
            img.Seek(0);
            var decoder = await BitmapDecoder.CreateAsync(img);
            using var bmp = await decoder.GetSoftwareBitmapAsync(BitmapPixelFormat.Bgra8, BitmapAlphaMode.Premultiplied);
            var res = await engine.RecognizeAsync(bmp);
            var lines = res.Lines.Select(l => new OcrLine(l.Text, l.Words.Select(x => new OcrWord(x.Text,
                x.BoundingRect.X / w, x.BoundingRect.Y / h, x.BoundingRect.Width / w, x.BoundingRect.Height / h)).ToList())).ToList();
            pages.Add(new OcrPage(png, (int)w, (int)h, lines));
        }
        return pages;
    }
}
