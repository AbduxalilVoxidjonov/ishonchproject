using System.Text.Json;
using System.Text.Json.Nodes;
using IshonchDesktop.Models;
using IshonchDesktop.UI;
using Microsoft.Web.WebView2.Core;

namespace IshonchDesktop.Crm;

/// <summary>
/// Ishonch CRM sahifasiga «Didox'dan to'ldirish» tugmasini ulaydi (crm.js). Tugma bosilganda firma Didox'idan
/// hamkor STIRi bo'yicha eng yangi shartnoma olinadi va oyna maydonlari to'ldiriladi. «Яратиш» bosilmaydi.
/// </summary>
public static class ContractFiller
{
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static async Task AttachAsync(WebTab tab, Func<IEnumerable<BaseEntry>> bases)
    {
        var core = tab.Core;
        if (core is null) return;
        // Login/parolni brauzerning o'zi taklif qilib saqlaydi (keyingi safar o'zi to'ldiradi). Ishonch parolni ko'rmaydi.
        core.Settings.IsPasswordAutosaveEnabled = true;
        core.Settings.IsGeneralAutofillEnabled = true;
        using (var s = typeof(ContractFiller).Assembly.GetManifestResourceStream("crm/crm.js")!)
        using (var r = new StreamReader(s))
            await core.AddScriptToExecuteOnDocumentCreatedAsync(await r.ReadToEndAsync());
        // Бухгалтерия arizalari kuzatuvi: holat o'zgarsa Windows bildirishnomasi, tab nomida son, sahifa tepasida ro'yxat
        // Didox paroli (hamma firmalar uchun bir xil) kerak bo'lsa — bir marta so'raladi, shifrlab saqlanadi
        DidoxContracts.PasswordPrompt = note => DidoxPasswordForm.AskAsync(tab.FindForm(), note);
        var watcher = new CrmWatcher(tab);
        watcher.UnseenChanged += n =>
        {
            if (tab.Parent is TabPage page)
            {
                page.Text = n > 0 ? $"Main Ishonch ({n})" : "Main Ishonch";
                page.Parent?.Invalidate();
            }
        };
        tab.Disposed += (_, _) => watcher.Dispose();
        watcher.Refresh(); // oldingi ishga tushishdan qolgan xabarlar (holati o'zgarmaganlari qizil ramkada qoladi)
        core.NavigationCompleted += (_, _) => watcher.Post();
        core.WebMessageReceived += (_, e) =>
        {
            try
            {
                var kind = JsonNode.Parse(e.WebMessageAsJson)?["kind"]?.ToString();
                if (kind == "crmSeen") watcher.MarkSeen();
                else if (kind == "crmCheckNow") _ = watcher.CheckAsync();
                else if (kind == "crmReady") watcher.Post();
            }
            catch { /* boshqa xabar */ }
        };
        core.WebMessageReceived += async (_, e) =>
        {
            Req? req;
            try { req = JsonSerializer.Deserialize<Req>(e.WebMessageAsJson, Json); } catch { return; }
            if (req?.Kind == "crmFill") await HandleAsync(core, req, bases());
            else if (req?.Kind == "crmPick") await PickAsync(core, req);
            else if (req?.Kind == "crmPreview") await PreviewAsync(core, req, tab);
            else if (req?.Kind == "crmClick")
            {
                // Sahifa so'ragan nuqtaga haqiqiy sichqoncha bosishi (bank ro'yxati oddiy JS bosishini qabul qilmaydi)
                try { await Marking.CdpInput.ClickAsync(core, req.X, req.Y); } catch (Exception ex) { Log.Error("CRM bosish", ex); }
                Post(core, new { kind = "crmClicked", id = req.Id });
            }
        };
    }

    sealed record Req(string Kind, string Inn, string Firm, string Account, string? DocId = null, int Id = 0, double X = 0, double Y = 0, bool Force = false, string? Key = null);

    /// <summary>Joriy so'rov qaysi oyna (hamkor STIRi + firma hisobi) uchun: javoblarga qo'shiladi, sahifa boshqa oynanikini tashlab yuboradi.</summary>
    static readonly AsyncLocal<string?> CurrentKey = new();

    /// <summary>Hamkorda bir nechta shartnoma bo'lsa: ro'yxat sahifaga yuboriladi, tanlangach shu yerdan olinadi (docId -> firma, token, hujjat).</summary>
    sealed record Pending(DidoxContracts.Firm Firm, string? Token, JsonObject Item, int Total, bool Force = false, bool AmbiguousFirm = false);
    static readonly Dictionary<string, Pending> Choices = new();

    static void Post(CoreWebView2 core, object msg)
    {
        try
        {
            var node = JsonSerializer.SerializeToNode(msg, Json)!.AsObject();
            if (CurrentKey.Value is { } k && !node.ContainsKey("key")) node["key"] = k;
            core.PostWebMessageAsJson(node.ToJsonString());
        }
        catch { /* sahifa yopilgan */ }
    }

    static void Status(CoreWebView2 core, string text, string level = "", bool done = false) =>
        Post(core, new { kind = "crmStatus", text, level, done });

    static async Task HandleAsync(CoreWebView2 core, Req req, IEnumerable<BaseEntry> bases)
    {
        CurrentKey.Value = req.Key;
        await HandleCoreAsync(core, req, bases);
    }

    static async Task HandleCoreAsync(CoreWebView2 core, Req req, IEnumerable<BaseEntry> bases)
    {
        Log.Write($"CRM shartnoma: firma «{req.Firm}», hamkor {req.Inn}");
        try
        {
            var firms = DidoxContracts.FindFirm(req.Firm, bases);
            if (firms.Count == 0)
            {
                Status(core, $"«{req.Firm}» firmasining STIRi topilmadi (Solishtiruv firmalari va bazalar ro'yxatida yo'q).", "err", true);
                return;
            }
            var didox = new DidoxContracts();
            Exception? last = null;
            foreach (var firm in firms)
            {
                try
                {
                    Status(core, $"{firm.Name} ({firm.Tin}) Didox'i: shartnomalar qidirilmoqda…");
                    // Kesh: ro'yxat 1 kun saqlanadi (tugma qo'lda bosilsa — Didox'dan yangidan)
                    string? token = null;
                    var list = req.Force ? null : CrmCache.GetList(firm.Tin, req.Inn);
                    if (list is null)
                    {
                        token = await didox.TokenAsync(firm, t => Status(core, t));
                        list = await didox.CandidatesAsync(token, req.Inn);
                        if (list.Count > 0) CrmCache.PutList(firm.Tin, req.Inn, list);
                    }
                    if (list.Count == 0) { last = new InvalidOperationException(NotFoundText(firm, req.Inn)); continue; }
                    if (firms.Count > 1) Log.Write($"CRM shartnoma: «{req.Firm}» nomiga {firms.Count} ta STIR mos keldi ({string.Join(", ", firms.Select(f => f.Tin))}) — hozir {firm.Tin}");
                    if (list.Count == 1) { await FillAsync(core, didox, firm, token, list[0], 1, req, firms.Count > 1); return; }
                    // Bir nechta shartnoma: sahifada ro'yxat chiqadi, foydalanuvchi birini tanlaydi
                    Choices.Clear();
                    foreach (var x in list) Choices[x["doc_id"]?.ToString() ?? ""] = new Pending(firm, token, x, list.Count, req.Force, firms.Count > 1);
                    Post(core, new
                    {
                        kind = "crmList",
                        items = list.Select(x =>
                        {
                            var d = DidoxContracts.Describe(x);
                            return new { docId = x["doc_id"]?.ToString() ?? "", d.number, d.date, d.status, d.type };
                        }).ToList(),
                    });
                    return;
                }
                catch (Exception e) { last = e; Log.Error("CRM shartnoma " + firm.Tin, e); }
            }
            Status(core, last?.Message ?? "Shartnoma topilmadi.", "err", true);
        }
        catch (Exception e)
        {
            Log.Error("CRM shartnoma", e);
            Status(core, "Xato: " + e.Message, "err", true);
        }
    }


    /// <summary>Shartnoma topilmaganda tushunarli izoh: STIR firmaning o'ziniki bo'lsa yoki shartnoma boshqa firmalarda bo'lsa.</summary>
    static string NotFoundText(DidoxContracts.Firm firm, string partnerInn)
    {
        if (firm.Tin == partnerInn)
            return $"Hamkor STIRi ({partnerInn}) firmaning o'z STIRi bilan bir xil — CRM'dagi hamkor STIRini tekshiring.";
        var text = $"{firm.Name} Didox'ida {partnerInn} bilan shartnoma topilmadi.";
        var other = DidoxContracts.CachedContractsWith(partnerInn).Where(x => x.FirmTin != firm.Tin).Take(4).ToList();
        if (other.Count > 0)
            text += " Bu hamkorning shartnomasi boshqa firmalarda bor: " + string.Join(", ", other.Select(o => $"{o.Firm} (№{o.Number}, {o.Date})")) + ".";
        return text;
    }
    static async Task FillAsync(CoreWebView2 core, DidoxContracts didox, DidoxContracts.Firm firm, string? token, JsonObject item, int total, Req req,
        bool ambiguousFirm = false)
    {
        var docId = item["doc_id"]?.ToString() ?? "";
        DidoxContract c;
        byte[]? pdf;
        string pdfNote;
        // Kesh: shu shartnoma avval to'liq o'qilgan bo'lsa (Didox + OCR + Gemini) — qayta so'rov yuborilmaydi
        if (!req.Force && CachedSigned(docId) is { } cached)
        {
            (c, pdfNote, pdf) = cached;
            pdfNote = string.Join("; ", new[] { pdfNote, "saqlangan ma'lumotdan (qayta so'rov yuborilmadi; yangilash uchun tugmani bosing)" }.Where(s => s.Length > 0));
        }
        else (c, pdfNote, pdf) = await ProcessAsync(core, didox, firm, token, item, req);
        var note = string.Join("; ", new[] { total > 1 ? $"jami {total} ta shartnomadan tanlangan" : "", c.Note, pdfNote }.Where(s => s.Length > 0));
        if (c.FirmAccount.Length > 0 && c.FirmAccount != req.Account)
            note = (note.Length > 0 ? note + "; " : "") + $"diqqat: shartnomadagi firma hisob raqami {c.FirmAccount} — tekshiring";
        if (ambiguousFirm)
            note = (note.Length > 0 ? note + "; " : "") + $"firma nomiga bir nechta STIR mos keldi, {firm.Tin} ({firm.Name}) Didox'idan olindi — tekshiring";
        Log.Write($"CRM shartnoma: {firm.Tin} / {req.Inn} -> {c.Number} {c.Date} ({c.Status})");
        Post(core, new
        {
            kind = "crmData",
            contract = new
            {
                c.DocId, c.Number, c.Date, c.ExpireDate, c.Status, c.PartnerName, c.PartnerAccount, c.PartnerMfo,
                sum = c.Sum, c.Purpose,
            },
            pdf = pdf is null ? null : Convert.ToBase64String(pdf),
            pdfName = "Shartnoma " + string.Concat(c.Number.Select(ch => Path.GetInvalidFileNameChars().Contains(ch) ? '_' : ch)) + ".pdf",
            note,
        });
    }

/// <summary>
    /// Shartnomani to'liq o'qiydi: Didox ma'lumoti, PDF, kerak bo'lsa OCR + shablon, Gemini maqsadi — va keshga yozadi.
    /// </summary>
    static async Task<(DidoxContract c, string pdfNote, byte[]? pdf)> ProcessAsync(CoreWebView2 core, DidoxContracts didox, DidoxContracts.Firm firm, string? token, JsonObject item, Req req)
    {
        DidoxContract c;
        byte[]? pdf;
        string pdfNote;
        token ??= await didox.TokenAsync(firm, t => Status(core, t));
        c = await didox.DetailsAsync(token, item, req.Inn);
        Status(core, $"№{c.Number} topildi, PDF yuklanmoqda…");
        // Imzolanmagan shartnoma hali o'zgarishi mumkin — PDF har safar yangidan olinadi
        pdf = (req.Force || !IsSigned(c) ? null : CrmCache.GetPdf(c.DocId)) ?? await didox.PdfAsync(token, c.DocId);
        pdfNote = "";
        string? ocrText = null;
        var needPdf = c.SumIsDefault || c.ExpireDate.Length == 0 || c.PartnerAccount.Length == 0 || c.PartnerMfo.Length == 0
            || (GeminiPurpose.Available && c.ContractText.Trim().Length == 0);
        if (pdf is not null && needPdf)
            (c, pdfNote, ocrText) = await FromPdfAsync(core, c, pdf, req.Account);
        // Maqsad: Gemini shartnoma matni va fakturadagi tovarlardan, shartnoma tilida (bo'lmasa — oddiy qoidalar natijasi)
        if (GeminiPurpose.Available)
        {
            var text = c.ContractText.Trim().Length > 0 ? c.ContractText : ocrText ?? "";
            if (text.Length > 0 || c.InvoiceGoods.Length > 0)
            {
                Status(core, "Shartnoma maqsadi aniqlanmoqda (Gemini)…");
                if (await GeminiPurpose.DetectAsync(text, c.InvoiceGoods) is { } p)
                {
                    c = c with
                    {
                        Purpose = p.Purpose, PurposeSource = p.Source, PurposeOrigin = p.From,
                        Note = string.Join("; ", c.Note.Split("; ").Where(n => n.Length > 0 && !n.Contains("maqsad"))),
                    };
                    var whereFrom = p.From == "faktura" || p.Source.Length == 0
                        ? "fakturadagi tovarlardan"
                        : "shartnomadan: «" + (p.Source.Length > 90 ? p.Source[..90] + "…" : p.Source) + "» (👁 da sariq)";
                    pdfNote = string.Join("; ", new[] { pdfNote, "maqsad Gemini orqali " + whereFrom + " — tekshiring" }.Where(s => s.Length > 0));
                }
            }
        }
        CrmCache.PutDoc(c, pdfNote, pdf);
        return (c, pdfNote, pdf);
    }

    /// <summary>
    /// Didox ma'lumotida yo'q maydonlarni (summa, amal qilish muddati, hamkor hisob raqami, MFO) shartnoma PDF idan
    /// OCR + shablon bilan to'ldiradi. Didox'dagi tayyor qiymatlar o'zgartirilmaydi.
    /// </summary>
    static async Task<(DidoxContract c, string note, string? text)> FromPdfAsync(CoreWebView2 core, DidoxContract c, byte[] pdf, string firmAccount)
    {
        try
        {
            Status(core, "Shartnoma PDF i o'qilmoqda (OCR)…");
            var text = PdfOcr.TextOf(await LayoutAsync(c.DocId, pdf, IsSigned(c)));
            var f = ContractPdfTemplate.Parse(text, firmAccount, c.FirmMfo);
            var got = new List<string>();
            if (c.SumIsDefault && f.Sum is > 0)
            {
                c = c with { Sum = f.Sum.Value, SumIsDefault = false, Note = string.Join("; ", c.Note.Split("; ").Where(n => n != ContractTerms.NoSumNote)) };
                got.Add("summa");
            }
            if (c.ExpireDate.Length == 0 && f.ExpireDate is { } exp) { c = c with { ExpireDate = exp }; got.Add("muddat"); }
            if (c.PartnerAccount.Length == 0 && f.PartnerAccount is { } acc) { c = c with { PartnerAccount = acc }; got.Add("hisob raqam"); }
            if (c.PartnerMfo.Length == 0 && f.PartnerMfo is { } mfo) { c = c with { PartnerMfo = mfo }; got.Add("MFO"); }
            Log.Write($"CRM shartnoma PDF OCR: {text.Length} belgi, topildi: {string.Join(", ", got)}");
            return (c, got.Count > 0 ? "PDF dan (OCR) olindi: " + string.Join(", ", got) + " — tekshiring" : "", text);
        }
        catch (Exception e)
        {
            Log.Error("CRM shartnoma PDF OCR", e);
            return (c, "PDF o'qilmadi (OCR): " + e.Message, null);
        }
    }

    static async Task PickAsync(CoreWebView2 core, Req req)
    {
        CurrentKey.Value = req.Key;
        await PickCoreAsync(core, req);
    }

    static async Task PickCoreAsync(CoreWebView2 core, Req req)
    {
        try
        {
            if (req.DocId is null || !Choices.TryGetValue(req.DocId, out var p))
            {
                Status(core, "Ro'yxat eskirgan: «Didox'dan to'ldirish» ni qayta bosing.", "err", true);
                return;
            }
            Status(core, "Tanlangan shartnoma Didox'dan o'qilmoqda…");
            await FillAsync(core, new DidoxContracts(), p.Firm, p.Token, p.Item, p.Total, req with { Force = req.Force || p.Force }, p.AmbiguousFirm);
        }
        catch (Exception e)
        {
            Log.Error("CRM shartnoma (tanlash)", e);
            Status(core, "Xato: " + e.Message, "err", true);
        }
    }

    static bool IsSigned(DidoxContract c) => c.Status.StartsWith("Imzolangan", StringComparison.Ordinal);

    /// <summary>Kesh faqat imzolangan shartnoma uchun ishlatiladi: imzolanmagani (holati, matni, PDF i) hali o'zgarishi mumkin.</summary>
    static (DidoxContract c, string note, byte[]? pdf)? CachedSigned(string docId) =>
        CrmCache.GetDoc(docId) is { } hit && IsSigned(hit.c) ? hit : null;

    /// <summary>Sahifa rasmlari va OCR natijasi: avval keshdan, bo'lmasa PDF OCR qilinib keshga yoziladi.</summary>
    static async Task<List<OcrPage>> LayoutAsync(string docId, byte[] pdf, bool signed)
    {
        // Imzolanmagan shartnomaning PDF i o'zgarishi mumkin — OCR keshi faqat imzolangani uchun
        if (signed && CrmCache.GetLayout(docId) is { } cached) return cached;
        var pages = await PdfOcr.ReadLayoutAsync(pdf);
        CrmCache.PutLayout(docId, pages);
        return pages;
    }

    /// <summary>Ko'rish oynasida belgilanadigan maydonlar: maqsad manbasi — sariq, qolganlari boshqa ranglarda.</summary>
    static List<HighlightTarget> Targets(DidoxContract c)
    {
        var t = new List<HighlightTarget>
        {
            new("maqsad", "Maqsad", c.Purpose, "#fde047", Quote: c.PurposeOrigin == "faktura" ? null : c.PurposeSource),
        };
        if (!c.SumIsDefault && c.Sum > 0)
            t.Add(new("summa", "Summa", c.Sum.ToString("#,0.##", System.Globalization.CultureInfo.InvariantCulture).Replace(',', ' '), "#f9a8d4",
                Digits: decimal.Truncate(c.Sum).ToString(System.Globalization.CultureInfo.InvariantCulture)));
        if (c.Date.Length >= 10) t.Add(new("sana", "Sana", c.Date[..10], "#c4b5fd", Date: c.Date[..10]));
        if (c.ExpireDate.Length >= 10) t.Add(new("muddat", "Amal qilish muddati", c.ExpireDate[..10], "#93c5fd", Date: c.ExpireDate[..10]));
        if (c.PartnerAccount.Length > 0) t.Add(new("hisob", "Hamkor hisob raqami", c.PartnerAccount, "#86efac", Digits: c.PartnerAccount));
        if (c.PartnerMfo.Length > 0) t.Add(new("mfo", "MFO", c.PartnerMfo, "#fdba74", Digits: c.PartnerMfo));
        return t;
    }

    /// <summary>
    /// Ro'yxatdagi shartnomani tanlashdan oldin ko'rish: shartnoma to'liq o'qiladi (Didox + OCR + Gemini, keshga yoziladi),
    /// keyin alohida oynada sahifalar ko'rsatiladi — maqsad olingan joy sariq, summa/sana/hisob/MFO boshqa ranglarda belgilangan.
    /// U yerdagi «Shu shartnomani tanlash» CRM oynasini to'ldiradi (keshdan — qayta so'rovsiz).
    /// </summary>
    static async Task PreviewAsync(CoreWebView2 core, Req req, WebTab tab)
    {
        CurrentKey.Value = req.Key;
        try
        {
            if (req.DocId is null || !Choices.TryGetValue(req.DocId, out var p))
            {
                Post(core, new { kind = "crmPdf", docId = req.DocId, error = "Ro'yxat eskirgan: «Didox'dan to'ldirish» ni qayta bosing." });
                return;
            }
            var docId = req.DocId;
            DidoxContract c;
            string pdfNote;
            byte[]? pdf;
            if (CachedSigned(docId) is { } cached) (c, pdfNote, pdf) = cached;
            else (c, pdfNote, pdf) = await ProcessAsync(core, new DidoxContracts(), p.Firm, p.Token, p.Item, req with { Force = false });
            if (pdf is null)
            {
                Post(core, new { kind = "crmPdf", docId, error = "Didox shartnoma PDF ini bermadi." });
                return;
            }
            Status(core, "Shartnoma sahifalari tayyorlanmoqda (OCR)…");
            var pages = await LayoutAsync(docId, pdf, IsSigned(c));
            var found = Targets(c).Select(t => (t, ContractHighlights.Find(pages, t))).ToList();
            var d = DidoxContracts.Describe(p.Item);
            var title = $"Shartnoma №{d.number} · {d.date} · {d.status} · {d.type}";
            var purposeNote = c.PurposeOrigin == "faktura" || c.PurposeSource.Length == 0
                ? "Maqsad shartnoma matnidan emas, oxirgi fakturadagi tovarlardan olingan — PDF da sariq belgi yo'q."
                : found[0].Item2.Count > 0
                    ? "Sariq — maqsad olingan joy: «" + c.PurposeSource + "»"
                    : "Maqsad manbasi PDF da aniq topilmadi (OCR farqi bo'lishi mumkin): «" + c.PurposeSource + "»";
            var html = ContractHighlights.Html(title, pages, found, purposeNote, "../../shartnoma/" + Path.GetFileName(CrmCache.PdfPath(docId)));
            var path = CrmCache.PutViewHtml(docId, html);
            var key = req.Key;
            await PdfViewerForm.ShowAsync(tab.FindForm(), path, title, () => Post(core, new { kind = "crmChoose", docId, key }));
            Post(core, new { kind = "crmPdf", docId, opened = true, number = d.number });
        }
        catch (Exception e)
        {
            Log.Error("CRM shartnoma (ko'rish)", e);
            Post(core, new { kind = "crmPdf", docId = req.DocId, error = "Xato: " + e.Message });
        }
    }
}
