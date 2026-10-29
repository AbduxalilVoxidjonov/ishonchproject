using System.Text;
using System.Text.Json;

namespace IshonchDesktop.Epos;

public sealed class UzposException : Exception
{
    public UzposException(string message) : base(message) { }
}

public sealed record Package(string Code, string Name);

/// <summary>Chekning bitta qatori, UzPOS shaklida: summalar tiyinda, miqdor mingdan bir ulushda (1 dona = 1000).</summary>
public sealed record SaleItem(string ClassCode, string PackageCode, string Name, long PriceTiyin, long Amount,
    long VatTiyin, int VatPercent, string? Label, string? Barcode);

public sealed record SaleResult(string TerminalId, string ReceiptSeq, string FiscalSign, string DateTime, string QrCodeUrl);

public sealed record MarkingCheck(bool IsValid, bool AlreadySold);

/// <summary>
/// E-POS Communicator (UzPOS protokoli): POST http://localhost:8347/uzpos, tanasi {token, method, port, ...}.
/// Communicator o'zi fiskal modulga (FiscalDriveService / FiscalDriveAPI, port 3448/3449) murojaat qiladi,
/// markirovka kodini tekshiradi va chekni OFD ga yuboradi. Kirish (login) kerak emas.
/// </summary>
public sealed class UzposClient : IDisposable
{
    public const string DefaultUrl = "http://localhost:8347/uzpos";

    /// <summary>UzPOS protokolining umumiy tokeni: Communicator har bir so'rovda shuni talab qiladi (o'z interfeysi ham shuni yuboradi).</summary>
    public const string ProtocolToken = "DXJFX32CN1296678504F2";

    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    readonly HttpClient http;
    readonly Uri url;

    /// <summary>Fiskal xizmat porti: 3448 (FiscalDriveAPI) yoki 3449/3450 (FiscalDriveService).</summary>
    public int FiscalPort { get; set; } = 3448;

    public UzposClient(string url = DefaultUrl, HttpMessageHandler? handler = null)
    {
        this.url = new Uri(url);
        http = handler is null ? new HttpClient() : new HttpClient(handler);
        http.Timeout = TimeSpan.FromSeconds(60); // sotuv fiskal modulga yozadi va OFD ga yuboradi
    }

    // ---- o'qish (xavfsiz) metodlari -------------------------------------------------------

    public async Task<string> GetVersionAsync() => Message(await CallAsync("getVersion"));

    /// <summary>Communicator ishlayaptimi (port javob beradimi va versiya qaytaradimi).</summary>
    public async Task<bool> IsAliveAsync()
    {
        try { await GetVersionAsync(); return true; }
        catch (UzposException) { return true; } // javob keldi, demak ilova tirik
        catch { return false; }
    }

    static int salesInProgress;

    /// <summary>Hozir fiskal chek sotilmoqdami (holat qatori shu paytda modulni so'ramaydi).</summary>
    public static bool SaleInProgress => Volatile.Read(ref salesInProgress) > 0;

    /// <summary>Fiskal xizmat ishlashi mumkin bo'lgan portlar: FiscalDriveAPI — 3448, FiscalDriveService — 3449/3450.</summary>
    public static readonly int[] KnownPorts = { 3448, 3449, 3450 };

    /// <summary>
    /// Fiskal modul javob beradigan portni topadi (avval joriysi, keyin qolganlari) va <see cref="FiscalPort"/> ga yozadi.
    /// Topilmasa null (joriy port o'zgarmaydi). Faqat holat so'raladi — hech narsa yozilmaydi.
    /// </summary>
    public async Task<int?> DetectPortAsync()
    {
        var original = FiscalPort;
        foreach (var port in KnownPorts.OrderBy(p => p == original ? 0 : 1))
        {
            FiscalPort = port;
            try { await GetStatusAsync(); return port; }
            catch (UzposException) { /* bu portda modul yo'q */ }
        }
        FiscalPort = original;
        return null;
    }

    /// <summary>
    /// Ulangan fiskal modul nomi/raqami (faqat o'qish): avval Communicator `getInfo`, bo'lmasa FiscalDriveService ning
    /// `POST /FiscalDrive/List` (ulangan modullar). Javobdan TerminalID va FactoryID qidiriladi. Topilmasa null.
    /// </summary>
    public async Task<string?> GetModuleNameAsync()
    {
        try
        {
            var r = await CallAsync("getInfo");
            if (Describe(r) is { } fromInfo) return fromInfo;
        }
        catch (Exception e) when (e is UzposException or IOException or TaskCanceledException) { }

        foreach (var port in new[] { 3449, 3450, 3448 })
        {
            try
            {
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
                using var resp = await http.PostAsync($"http://127.0.0.1:{port}/FiscalDrive/List", new StringContent("{}", Encoding.UTF8, "application/json"), cts.Token);
                if (!resp.IsSuccessStatusCode) continue;
                using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(cts.Token));
                if (Describe(doc.RootElement) is { } fromList) return fromList;
            }
            catch { /* bu portda xizmat yo'q */ }
        }
        return null;
    }

    /// <summary>JSON ichidan TerminalID va FactoryID ni topib, o'qiladigan matn qiladi.</summary>
    static string? Describe(JsonElement root)
    {
        string? terminal = null, factory = null;
        void Walk(JsonElement e)
        {
            if (e.ValueKind == JsonValueKind.Object)
                foreach (var p in e.EnumerateObject())
                {
                    if (p.Value.ValueKind == JsonValueKind.String && p.Value.GetString() is { Length: > 0 } v)
                    {
                        if (terminal is null && p.Name.Contains("terminal", StringComparison.OrdinalIgnoreCase)) terminal = v;
                        else if (factory is null && p.Name.Contains("factory", StringComparison.OrdinalIgnoreCase)) factory = v;
                    }
                    else Walk(p.Value);
                }
            else if (e.ValueKind == JsonValueKind.Array)
                foreach (var x in e.EnumerateArray()) Walk(x);
        }
        Walk(root);
        if (terminal is null && factory is null) return null;
        return string.Join(", ", new[] { terminal is null ? null : "Terminal " + terminal, factory is null ? null : "FactoryID " + factory }.Where(s => s is not null));
    }

    /// <summary>Fiskal modul holati; ishlamasa UzposException (masalan FISCAL_DRIVER_IS_NOT_WORKING).</summary>
    public async Task<string> GetStatusAsync()
    {
        var r = await CallAsync("getStatus");
        return r.TryGetProperty("message", out var m) ? (m.ValueKind == JsonValueKind.String ? m.GetString()! : m.GetRawText()) : "OK";
    }

    public async Task<List<Package>> GetPackagesAsync(string classCode)
    {
        var r = await CallAsync("getICPCPackage", new { classCode });
        var list = new List<Package>();
        if (r.TryGetProperty("packages", out var arr) && arr.ValueKind == JsonValueKind.Array)
            foreach (var p in arr.EnumerateArray())
                list.Add(new Package(Str(p, "code"), Str(p, "nameLat")));
        return list;
    }

    /// <summary>Markirovka kodini Communicator qoidalari bo'yicha tekshiradi va shu kod avval sotilganmi (u o'zi eslab qoladi) ko'rsatadi.</summary>
    public async Task<MarkingCheck> ValidateMarkingAsync(string marking, string classCode)
    {
        var r = await CallAsync("validationMarking", new { marking, classCode });
        var m = r.TryGetProperty("message", out var msg) ? msg : default;
        return new MarkingCheck(Bool(m, "isValidMarking"), Bool(m, "alreadySold"));
    }

    // ---- sotuv (HAQIQIY fiskal chek) ------------------------------------------------------

    /// <summary>
    /// Chekni fiskal modulga yozadi va OFD ga yuboradi. Qaytarib bo'lmaydi (faqat qaytarish cheki bilan),
    /// shuning uchun aniq tasdiq talab qilinadi. Summalar tiyinda.
    /// </summary>
    public async Task<SaleResult> SaleAsync(IReadOnlyList<SaleItem> items, long cashTiyin, long cardTiyin,
        string? externalId, bool confirmRealFiscalReceipt)
    {
        if (!confirmRealFiscalReceipt) throw new InvalidOperationException("Haqiqiy fiskal chek yaratish tasdiqlanmagan.");
        if (items.Count == 0) throw new ArgumentException("Chekda tovar yo'q.");
        var total = items.Sum(i => i.PriceTiyin);
        if (cashTiyin + cardTiyin != total)
            throw new ArgumentException($"To'lov summasi chek jamiga teng emas: {cashTiyin + cardTiyin} != {total}.");

        // Sotuv paytida fonda holat so'rovlari yuborilmasin (fiskal modul band)
        Interlocked.Increment(ref salesInProgress);
        JsonElement r;
        try
        {
        r = await CallAsync("sale", new
        {
            @params = new
            {
                items = items.Select(i => new
                {
                    classCode = i.ClassCode,
                    packageCode = i.PackageCode,
                    name = i.Name,
                    price = i.PriceTiyin,
                    amount = i.Amount,
                    vat = i.VatTiyin,
                    vatPercent = i.VatPercent.ToString(),
                    ownerType = 0,
                    discount = 0,
                    other = 0,
                    label = i.Label ?? "",
                    barcode = i.Barcode,
                }),
                receivedCash = cashTiyin,
                receivedCard = cardTiyin,
                externalId,
            },
        });
        }
        finally { Interlocked.Decrement(ref salesInProgress); }

        var info = r.TryGetProperty("info", out var i2) ? i2 : default;
        return new SaleResult(Str(info, "terminalId"), Str(info, "receiptSeq"), Str(info, "fiscalSign"),
            Str(info, "dateTime"), Str(info, "qrCodeURL"));
    }

    // ---- ichki ----------------------------------------------------------------------------

    async Task<JsonElement> CallAsync(string method, object? extra = null)
    {
        var body = new Dictionary<string, object?> { ["token"] = ProtocolToken, ["method"] = method, ["port"] = FiscalPort };
        if (extra is not null)
            foreach (var p in JsonSerializer.SerializeToElement(extra, Json).EnumerateObject())
                body[p.Name] = p.Value;

        HttpResponseMessage resp;
        try
        {
            resp = await http.PostAsync(url, new StringContent(JsonSerializer.Serialize(body, Json), Encoding.UTF8, "application/json"));
        }
        catch (HttpRequestException) { throw new IOException("E-POS Communicator ishlamayapti (localhost:8347 javob bermadi)."); }
        catch (TaskCanceledException) { throw new IOException("E-POS Communicator javob bermadi (vaqt tugadi)."); }

        using (resp)
        {
            var text = await resp.Content.ReadAsStringAsync();
            JsonElement root;
            try { root = JsonDocument.Parse(text).RootElement.Clone(); }
            catch { throw new UzposException($"Communicator tushunarsiz javob qaytardi ({(int)resp.StatusCode})."); }
            if (root.ValueKind == JsonValueKind.Object && root.TryGetProperty("error", out var e) && e.ValueKind == JsonValueKind.True)
                throw new UzposException(Str(root, "message") is { Length: > 0 } m ? m : "Communicator xato qaytardi.");
            return root;
        }
    }

    static string Message(JsonElement r) => Str(r, "message");

    static string Str(JsonElement e, string name) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v)
            ? v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : v.ToString() : "";

    static bool Bool(JsonElement e, string name) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.True;

    public void Dispose() => http.Dispose();
}
