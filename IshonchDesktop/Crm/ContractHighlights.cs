using System.Globalization;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;

namespace IshonchDesktop.Crm;

/// <summary>Ko'rish oynasidagi belgi: sahifa, joy (0..1) va qaysi maydon.</summary>
public sealed record Mark(int Page, double X, double Y, double W, double H, string Field);

/// <summary>Belgilanadigan maydon: nomi, qiymati (oynada ko'rsatiladi), rangi va qidiruv usuli.</summary>
public sealed record HighlightTarget(string Field, string Label, string Value, string Color, string? Quote = null, string? Digits = null, string? Date = null);

/// <summary>
/// Shartnoma PDF ining OCR natijasidan maydonlar manbasini topadi va ko'rish sahifasini (HTML) yasaydi:
/// maqsad manbasi — sariq, boshqa maydonlar (summa, muddat, hisob raqam, MFO) — boshqa ranglarda.
/// Tarmoqsiz — to'liq testlanadi.
/// </summary>
public static class ContractHighlights
{
    // ---- matnni taqqoslash ---------------------------------------------------------------------

    static string Tok(string s) => Regex.Replace((s ?? "").ToLowerInvariant().Replace('ё', 'е'), @"[^\p{L}\p{Nd}]", "");

    static IEnumerable<string> Tokens(string s) => Regex.Split(s ?? "", @"\s+").Select(Tok).Where(t => t.Length > 0);

    static bool Similar(string a, string b)
    {
        if (a == b) return true;
        if (a.Length >= 5 && b.Length >= 5 && a[..5] == b[..5]) return true; // qo'shimchalar (-лари, -ов) farqi
        return a.Length >= 4 && b.Length >= 4 && Lev(a, b) <= Math.Max(1, Math.Min(a.Length, b.Length) / 5); // OCR xatosi
    }

    static int Lev(string a, string b)
    {
        var d = new int[b.Length + 1];
        for (var j = 0; j <= b.Length; j++) d[j] = j;
        for (var i = 1; i <= a.Length; i++)
        {
            var prev = d[0]; d[0] = i;
            for (var j = 1; j <= b.Length; j++)
            {
                var cur = d[j];
                d[j] = Math.Min(Math.Min(d[j] + 1, d[j - 1] + 1), prev + (a[i - 1] == b[j - 1] ? 0 : 1));
                prev = cur;
            }
        }
        return d[b.Length];
    }

    sealed record W(int Page, OcrWord Word, string Tok, int LineId);

    static List<W> Flatten(IReadOnlyList<OcrPage> pages)
    {
        var res = new List<W>();
        var line = 0;
        for (var p = 0; p < pages.Count; p++)
            foreach (var l in pages[p].Lines)
            {
                foreach (var w in l.Words) res.Add(new W(p, w, Tok(w.Text), line));
                line++;
            }
        return res;
    }

    static Mark ToMark(W w, string field) => new(w.Page, w.Word.X, w.Word.Y, w.Word.W, w.Word.H, field);

    /// <summary>Iqtibosga (so'zma-so'z parcha) eng mos keladigan ketma-ket so'zlar. Topilmasa bo'sh.</summary>
    public static List<Mark> FindQuote(IReadOnlyList<OcrPage> pages, string quote, string field)
    {
        var q = Tokens(quote).ToList();
        if (q.Count == 0) return new();
        var words = Flatten(pages).Where(w => w.Tok.Length > 0).ToList();
        int bestStart = -1, bestLen = 0; double bestScore = 0;
        var span = q.Count + Math.Max(2, q.Count / 3); // OCR qo'shimcha/bo'lingan so'zlar uchun zaxira
        for (var i = 0; i < words.Count; i++)
        {
            if (!q.Any(t => Similar(t, words[i].Tok))) continue;
            // Tartib bo'yicha moslash: iqtibos so'zlari oynada ketma-ket kelishi kerak
            int qi = 0, matched = 0, last = i;
            for (var k = i; k < Math.Min(words.Count, i + span) && qi < q.Count; k++)
            {
                var found = false;
                for (var look = qi; look < Math.Min(q.Count, qi + 3); look++)
                    if (Similar(q[look], words[k].Tok)) { qi = look + 1; matched++; last = k; found = true; break; }
                if (!found && k - last > 3) break;
            }
            var score = (double)matched / q.Count;
            if (score > bestScore) { bestScore = score; bestStart = i; bestLen = last - i + 1; }
        }
        if (bestStart < 0 || bestScore < (q.Count <= 3 ? 0.99 : 0.6)) return new();
        return words.Skip(bestStart).Take(bestLen).Select(w => ToMark(w, field)).ToList();
    }

    /// <summary>Raqamlar ketma-ketligi (hisob raqam, MFO, summa) — qatordagi raqamlar ichida. Har uchragan joy belgilanadi (ko'pi bilan 3).</summary>
    public static List<Mark> FindDigits(IReadOnlyList<OcrPage> pages, string digits, string field)
    {
        digits = Regex.Replace(ContractPdfTemplate.Normalize(digits ?? ""), @"\D", "");
        if (digits.Length < 4) return new();
        var res = new List<Mark>();
        foreach (var g in Flatten(pages).GroupBy(w => w.LineId))
        {
            var ws = g.ToList();
            // Har so'zning raqamlari va ularning qatordagi o'rni
            var sb = new StringBuilder();
            var owner = new List<int>();
            for (var k = 0; k < ws.Count; k++)
                foreach (var ch in Regex.Replace(ContractPdfTemplate.Normalize(ws[k].Word.Text), @"\D", ""))
                { sb.Append(ch); owner.Add(k); }
            var all = sb.ToString();
            for (var at = all.IndexOf(digits, StringComparison.Ordinal); at >= 0 && res.Count < 30; at = all.IndexOf(digits, at + 1, StringComparison.Ordinal))
            {
                // Uzunroq raqamning bir bo'lagi bo'lmasin (MFO 00401 hisob raqam ichida emas, sana boshqa raqam ichida emas).
                // Faqat keyingi kasr nollari (summa «9 811 200.00») ruxsat.
                var before = at > 0 && owner[at - 1] == owner[at];
                var end = at + digits.Length;
                var after = false;
                if (end < all.Length && owner[end] == owner[end - 1])
                {
                    var k2 = end;
                    while (k2 < all.Length && owner[k2] == owner[end - 1]) k2++;
                    after = all[end..k2].Trim('0').Length > 0;
                }
                if (before || after) continue;
                foreach (var k in owner.Skip(at).Take(digits.Length).Distinct()) res.Add(ToMark(ws[k], field));
                if (res.Select(m => m.Page + ":" + m.Y).Distinct().Count() >= 3) return res;
            }
        }
        return res;
    }

    static readonly string[] RuMonths = { "январ", "феврал", "март", "апрел", "ма", "июн", "июл", "август", "сентябр", "октябр", "ноябр", "декабр" };

    /// <summary>Sana: «31.12.2026», «2026.12.31» yoki «31 декабря 2026» ko'rinishida.</summary>
    public static List<Mark> FindDate(IReadOnlyList<OcrPage> pages, string iso, string field)
    {
        if (!DateTime.TryParseExact(iso ?? "", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)) return new();
        var res = new List<Mark>();
        foreach (var dig in new[] { d.ToString("ddMMyyyy"), d.ToString("yyyyMMdd") })
            res.AddRange(FindDigits(pages, dig, field));
        if (res.Count > 0) return res;
        // «31 декабря 2026»
        var words = Flatten(pages);
        for (var i = 0; i + 2 < words.Count; i++)
        {
            var day = Regex.Replace(ContractPdfTemplate.Normalize(words[i].Word.Text), @"\D", "");
            if (day.Length == 0 || int.Parse(day) != d.Day) continue;
            if (!words[i + 1].Tok.StartsWith(RuMonths[d.Month - 1])) continue;
            if (!Regex.Replace(ContractPdfTemplate.Normalize(words[i + 2].Word.Text), @"\D", "").StartsWith(d.Year.ToString())) continue;
            res.AddRange(words.Skip(i).Take(3).Select(w => ToMark(w, field)));
        }
        return res;
    }

    public static List<Mark> Find(IReadOnlyList<OcrPage> pages, HighlightTarget t) =>
        t.Quote is { Length: > 0 } q ? FindQuote(pages, q, t.Field)
        : t.Date is { Length: > 0 } dt ? FindDate(pages, dt, t.Field)
        : t.Digits is { Length: > 0 } dg ? FindDigits(pages, dg, t.Field)
        : new();

    // ---- ko'rish sahifasi ------------------------------------------------------------------------------

    static string H(string s) => WebUtility.HtmlEncode(s ?? "");
    static string F(double v) => (v * 100).ToString("0.###", CultureInfo.InvariantCulture);

    /// <summary>
    /// Sahifalar rasmlari (p1.png, p2.png…) ustiga belgilar chizilgan HTML. Tepada maydonlar ro'yxati: bosilsa o'sha joyga o'tadi.
    /// </summary>
    public static string Html(string title, IReadOnlyList<OcrPage> pages, IReadOnlyList<(HighlightTarget Target, List<Mark> Marks)> found, string? purposeNote, string? pdfHref = null)
    {
        var sb = new StringBuilder();
        sb.Append("<!doctype html><html><head><meta charset='utf-8'><title>").Append(H(title)).Append("</title><style>")
          .Append("body{margin:0;background:#525659;font:14px 'Segoe UI',sans-serif}")
          .Append("#legend{position:sticky;top:0;z-index:5;background:#f0fdf4;border-bottom:1px solid #86efac;padding:8px 12px;display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center}")
          .Append(".lg{display:flex;align-items:center;gap:6px;cursor:pointer;padding:2px 6px;border-radius:6px}.lg:hover{background:#dcfce7}")
          .Append(".sw{width:14px;height:14px;border-radius:3px;border:1px solid #0003}.nf{color:#b91c1c}")
          .Append(".note{flex-basis:100%;color:#374151;font-size:13px}")
          .Append(".page{position:relative;margin:14px auto;background:#fff;box-shadow:0 2px 8px #0006;width:min(96vw,1000px)}")
          .Append(".page img{display:block;width:100%}.mk{position:absolute;border-radius:2px;mix-blend-mode:multiply}")
          .Append(".box{position:absolute;border:3px solid #dc2626;border-radius:4px;pointer-events:none;box-shadow:0 0 0 2px #fff8}")
          .Append(".mk.flash{outline:3px solid #dc2626}</style></head><body><div id='legend'>");
        foreach (var (t, marks) in found)
        {
            sb.Append("<span class='lg' data-f='").Append(H(t.Field)).Append("'><span class='sw' style='background:").Append(t.Color).Append("'></span><b>")
              .Append(H(t.Label)).Append(":</b> ").Append(H(t.Value));
            if (marks.Count == 0) sb.Append(" <span class='nf'>(PDF da topilmadi)</span>");
            sb.Append("</span>");
        }
        if (!string.IsNullOrEmpty(pdfHref)) sb.Append("<a class='lg' style='margin-left:auto' href='").Append(H(pdfHref)).Append("'>📄 Asl PDF</a>");
        if (!string.IsNullOrEmpty(purposeNote)) sb.Append("<div class='note'>").Append(H(purposeNote)).Append("</div>");
        sb.Append("</div>");
        for (var p = 0; p < pages.Count; p++)
        {
            sb.Append("<div class='page'><img src='p").Append(p + 1).Append(".png'>");
            // Maqsad manbasi atrofida qizil to'rtburchak — sariq joy darhol ko'zga tashlansin
            var pm = found.Where(f => f.Target.Field == "maqsad").SelectMany(f => f.Marks).Where(m => m.Page == p).ToList();
            if (pm.Count > 0)
            {
                double x1 = pm.Min(m => m.X), y1 = pm.Min(m => m.Y), x2 = pm.Max(m => m.X + m.W), y2 = pm.Max(m => m.Y + m.H);
                sb.Append("<div class='box' data-f='maqsad' style='left:").Append(F(x1 - 0.008)).Append("%;top:").Append(F(y1 - 0.006))
                  .Append("%;width:").Append(F(x2 - x1 + 0.016)).Append("%;height:").Append(F(y2 - y1 + 0.012)).Append("%'></div>");
            }
            foreach (var (t, marks) in found)
                foreach (var m in marks.Where(m => m.Page == p))
                    sb.Append("<div class='mk' data-f='").Append(H(t.Field)).Append("' style='left:").Append(F(m.X - 0.002)).Append("%;top:").Append(F(m.Y - 0.002))
                      .Append("%;width:").Append(F(m.W + 0.004)).Append("%;height:").Append(F(m.H + 0.004)).Append("%;background:").Append(t.Color).Append("'></div>");
            sb.Append("</div>");
        }
        sb.Append("<script>")
          .Append("function go(f){const m=[...document.querySelectorAll('.mk[data-f=\"'+f+'\"]')];if(!m.length)return;")
          .Append("(document.querySelector('.box[data-f=\"'+f+'\"]')||m[0]).scrollIntoView({block:'center',behavior:'smooth'});m.forEach(x=>{x.classList.add('flash');setTimeout(()=>x.classList.remove('flash'),1500)});}")
          .Append("document.querySelectorAll('.lg').forEach(l=>l.onclick=()=>go(l.dataset.f));")
          .Append("addEventListener('load',()=>go('maqsad'));</script></body></html>");
        return sb.ToString();
    }
}
