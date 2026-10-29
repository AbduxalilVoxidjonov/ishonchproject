using System.Net;
using System.Text;
using System.Text.Json;
using IshonchDesktop.Epos;

// Soxta E-POS Communicator (UzPOS) serveri bilan UzposClient va SaleBuilder ni tekshiradi.
// Haqiqiy Communicator va fiskal modulga tegmaydi.

var failures = 0;
void Check(bool ok, string name)
{
    Console.WriteLine((ok ? "  OK   " : "  XATO ") + name);
    if (!ok) failures++;
}
async Task Throws<T>(Func<Task> f, string name) where T : Exception
{
    try { await f(); Check(false, name + " (xato kutilgan edi)"); }
    catch (T) { Check(true, name); }
    catch (Exception e) { Check(false, name + " (boshqa xato: " + e.GetType().Name + ")"); }
}

// ---- soxta server ----
var port = 18347;
var requests = new List<JsonElement>();
Func<JsonElement, object> respond = _ => new { error = false, message = "OK" };
var listener = new HttpListener();
listener.Prefixes.Add($"http://localhost:{port}/");
listener.Start();
_ = Task.Run(async () =>
{
    while (listener.IsListening)
    {
        HttpListenerContext ctx;
        try { ctx = await listener.GetContextAsync(); } catch { break; }
        using var reader = new StreamReader(ctx.Request.InputStream, Encoding.UTF8);
        var body = JsonDocument.Parse(await reader.ReadToEndAsync()).RootElement.Clone();
        lock (requests) requests.Add(body);
        var json = JsonSerializer.Serialize(respond(body));
        var bytes = Encoding.UTF8.GetBytes(json);
        ctx.Response.ContentType = "application/json";
        await ctx.Response.OutputStream.WriteAsync(bytes);
        ctx.Response.Close();
    }
});
JsonElement Last() { lock (requests) return requests[^1]; }

var client = new UzposClient($"http://localhost:{port}/uzpos");

Console.WriteLine("Oddiy so'rovlar:");
respond = _ => new { error = false, message = "Communicator--3.23.8" };
Check(await client.GetVersionAsync() == "Communicator--3.23.8", "getVersion matni");
Check(Last().GetProperty("token").GetString() == UzposClient.ProtocolToken, "so'rovda protokol tokeni bor");
Check(Last().GetProperty("method").GetString() == "getVersion", "method=getVersion");
Check(Last().GetProperty("port").GetInt32() == 3448, "port standart 3448");
Check(await client.IsAliveAsync(), "IsAlive true");

client.FiscalPort = 3449;
await client.GetVersionAsync();
Check(Last().GetProperty("port").GetInt32() == 3449, "port 3449 ga o'zgartirilganda yuboriladi");
client.FiscalPort = 3448;

respond = _ => new { error = true, message = "FISCAL_DRIVER_IS_NOT_WORKING" };
await Throws<UzposException>(() => client.GetStatusAsync(), "getStatus xatosi UzposException bo'ladi");
Check(await client.IsAliveAsync(), "xato javob ham 'ilova tirik' degani");

respond = body => new { error = false, classCode = "12345678901234567", packages = new[] { new { code = "1501", nameLat = "dona" }, new { code = "1502", nameLat = "quti" } } };
var packages = await client.GetPackagesAsync("12345678901234567");
Check(packages.Count == 2 && packages[0].Code == "1501" && packages[1].Name == "quti", "getICPCPackage ro'yxati");
Check(Last().GetProperty("classCode").GetString() == "12345678901234567", "classCode yuboriladi");

respond = _ => new { error = false, message = new { isValidMarking = true, alreadySold = true, originalMarking = "x", cutMarking = "y" } };
var mc = await client.ValidateMarkingAsync("0104780000000001215ABC", "12345678901234567");
Check(mc.IsValid && mc.AlreadySold, "validationMarking: yaroqli, lekin sotilgan");
Check(Last().GetProperty("marking").GetString() == "0104780000000001215ABC", "marking maydoni yuboriladi");

Console.WriteLine("QQS va miqdor hisobi (Communicator tekshiruviga mos):");
Check(SaleBuilder.ToTiyin(1234.565m) == 123457, "tiyinga yaxlitlash (yarim yuqoriga)");
foreach (var (price, pct) in new[] { (100000L, 12), (5000000L, 12), (333333L, 12), (100000L, 0) })
{
    var vat = SaleBuilder.VatIncluded(price, pct);
    var calc = pct == 0 ? 0.0 : price * (double)pct / (100 + pct);
    Check(Math.Abs(calc - vat) <= 10, $"QQS {price} tiyin, {pct}%: {vat} (Communicator xato chegarasi ≤10 ichida)");
}

Console.WriteLine("Chek qatorlarini yig'ish:");
var receiptLine = new ReceiptLine("Tovar A", 2, 150000m, new[] { "0104780000000001215AAAAAAAAAAAA", "0104780000000001215BBBBBBBBBBBB" });
var plain = new ReceiptLine("Tovar B", 3, 1000m, Array.Empty<string>());
var marked = new SaleLine { Source = receiptLine, ClassCode = "12345678901234567", PackageCode = "1501" };
var unmarked = new SaleLine { Source = plain, ClassCode = "76543210987654321", PackageCode = "1501" };
var items = SaleBuilder.Build(new[] { marked, unmarked });
Check(items.Count == 3, "markirovkali 2 dona = 2 qator, markirovkasiz 3 dona = 1 qator");
Check(items[0].Label == receiptLine.Codes[0] && items[1].Label == receiptLine.Codes[1], "har bir qatorga o'z kodi");
Check(items[0].Amount == 1000 && items[0].PriceTiyin == 15000000, "markirovkali qator: 1 dona, narx tiyinda");
Check(items[2].Amount == 3000 && items[2].PriceTiyin == 300000 && items[2].Label is null, "markirovkasiz qator: 3000 (=3 dona), kod yo'q");
Check(SaleBuilder.Total(items) == 15000000 * 2 + 300000, "chek jami");

Check(new SaleLine { Source = receiptLine, ClassCode = "123", PackageCode = "1" }.Problem() is not null, "qisqa IKPU rad etiladi");
Check(new SaleLine { Source = receiptLine, ClassCode = "12345678901234567", PackageCode = "" }.Problem() is not null, "qadoqsiz qator rad etiladi");
var fewCodes = new SaleLine { Source = new ReceiptLine("X", 3, 10m, new[] { "a", "b" }), ClassCode = "12345678901234567", PackageCode = "1" };
Check(fewCodes.Problem() is not null, "dona soniga kod yetmasa rad etiladi");
Check(throwsSync(() => SaleBuilder.Build(new[] { fewCodes })), "Build tayyor bo'lmagan qatorda xato beradi");
bool throwsSync(Action a) { try { a(); return false; } catch (ArgumentException) { return true; } }

Console.WriteLine("Sotuv so'rovi va xavfsizlik:");
var before = requests.Count;
await Throws<InvalidOperationException>(() => client.SaleAsync(items, 30300000, 0, "1C-1", confirmRealFiscalReceipt: false), "tasdiqsiz sotuv yuborilmaydi");
await Throws<ArgumentException>(() => client.SaleAsync(items, 1, 0, "1C-1", true), "to'lov summasi jamiga teng bo'lmasa yuborilmaydi");
await Throws<ArgumentException>(() => client.SaleAsync(Array.Empty<SaleItem>(), 0, 0, "1C-1", true), "bo'sh chek yuborilmaydi");
Check(requests.Count == before, "rad etilgan holatlarda serverga hech narsa yuborilmadi");

respond = _ => new { error = false, paycheck = "...", info = new { terminalId = "UZ000000000001", receiptSeq = "42", fiscalSign = "123456789012", dateTime = "2026-10-28 16:00:00", qrCodeURL = "https://ofd.soliq.uz/check?t=1" } };
var total = SaleBuilder.Total(items);
var result = await client.SaleAsync(items, total, 0, "1C-123", true);
Check(result.ReceiptSeq == "42" && result.FiscalSign == "123456789012" && result.QrCodeUrl.StartsWith("https://ofd"), "sotuv natijasi o'qiladi");
var sent = Last();
Check(sent.GetProperty("method").GetString() == "sale", "method=sale");
var p = sent.GetProperty("params");
Check(p.GetProperty("receivedCash").GetInt64() == total && p.GetProperty("receivedCard").GetInt64() == 0, "naqd = jami, karta = 0");
Check(p.GetProperty("externalId").GetString() == "1C-123", "externalId 1C chek identifikatori");
var first = p.GetProperty("items")[0];
Check(first.GetProperty("classCode").GetString() == "12345678901234567" && first.GetProperty("packageCode").GetString() == "1501", "classCode va packageCode");
Check(first.GetProperty("price").GetInt64() == 15000000 && first.GetProperty("amount").GetInt64() == 1000, "price va amount tiyin/ming birliklarida");
Check(first.GetProperty("vatPercent").GetString() == "12" && first.GetProperty("vat").GetInt64() == SaleBuilder.VatIncluded(15000000, 12), "QQS stavkasi va summasi");
Check(first.GetProperty("label").GetString() == receiptLine.Codes[0], "markirovka kodi label maydonida");
Check(p.GetProperty("items")[2].GetProperty("label").GetString() == "", "markirovkasiz qatorda label bo'sh");

respond = _ => new { error = true, message = "Данный просканированный код маркировки дублируется" };
await Throws<UzposException>(() => client.SaleAsync(items, total, 0, "1C-124", true), "Communicator rad etgan sotuv UzposException bo'ladi");

Console.WriteLine("Aloqa yo'q holati:");
var dead = new UzposClient("http://localhost:18999/uzpos");
Check(!await dead.IsAliveAsync(), "o'chiq Communicator: IsAlive false");
await Throws<IOException>(() => dead.GetVersionAsync(), "o'chiq Communicator: tushunarli IOException");

Console.WriteLine("1C chekini o'qish:");
var stateJson = """
{ "receiptId": 1730000000, "status": "done",
  "items": [ { "name": "Tovar A", "placed": 2, "price": 150000 }, { "name": "Tovar B", "placed": 0, "price": 5 } ],
  "usedCodes": { "CODE1": { "name": "Tovar A", "receiptId": 1730000000 }, "CODE2": { "name": "Tovar A", "receiptId": 1730000000 },
                 "OLD": { "name": "Tovar A", "receiptId": 1 } } }
""";
var parsed = MarkingReceipt.Parse(JsonDocument.Parse(stateJson).RootElement);
Check(parsed is { Finished: true } && parsed.Lines.Count == 1, "faqat o'tkazilgan (placed>0) qatorlar olinadi");
Check(parsed!.Lines[0].Quantity == 2 && parsed.Lines[0].Codes.Count == 2, "faqat shu chekning kodlari (eski chek kodi emas)");

Console.WriteLine("1C paneli chekini o'qish (FromJson):");
var panelJson = """{ "receiptId": "99", "finished": true, "lines": [ { "name": "Tovar A", "quantity": 2, "unitPrice": 150000, "codes": ["C1","C2"] }, { "name": "Bo'sh", "quantity": 0, "unitPrice": 1, "codes": [] }, { "name": "Tovar B", "quantity": 1, "unitPrice": 5000.5 } ] }""";
var fromPanel = MarkingReceipt.FromJson(JsonDocument.Parse(panelJson).RootElement);
Check(fromPanel is { ReceiptId: "99", Finished: true } && fromPanel.Lines.Count == 2, "nol miqdorli qator tashlanadi, qolganlari o'qiladi");
Check(fromPanel!.Lines[0].Codes.Count == 2 && fromPanel.Lines[1].Codes.Count == 0 && fromPanel.Lines[1].UnitPrice == 5000.5m, "kodlar va narx saqlanadi");
Check(MarkingReceipt.FromJson(JsonDocument.Parse("{}").RootElement) is null, "lines yo'q bo'lsa null");
Check(MarkingReceipt.FromJson(JsonDocument.Parse("{\"lines\":[]}").RootElement) is null, "bo'sh chek null");

// Markirovkasiz chek (gramm tovar bilan): bitta qator, miqdor mingdan bir ulushda, summa tiyingacha
{
    var goldLine = new SaleLine { Source = new ReceiptLine("Oltin uzuk 585", 8.33m, 1_200_000m, Array.Empty<string>()), ClassCode = "71131900001000000", PackageCode = "1514296" };
    var phoneLine = new SaleLine { Source = new ReceiptLine("Telefon", 2m, 1_500_000.50m, Array.Empty<string>()), ClassCode = "85171300001000000", PackageCode = "1500000" };
    var built = SaleBuilder.Build(new[] { goldLine, phoneLine });
    Check(built.Count == 2, "markirovkasiz: har tovarga bitta qator");
    Check(built[0].Amount == 8330 && built[0].PriceTiyin == 999_600_000, "gramm: 8,33 g → miqdor 8330, summa 9 996 000,00");
    Check(built[1].Amount == 2000 && built[1].PriceTiyin == 300_000_100, "dona: 2 ta → miqdor 2000, summa 3 000 001,00");
}

listener.Stop();
Console.WriteLine(failures == 0 ? "\nHAMMASI O'TDI" : $"\n{failures} TA XATO");
return failures == 0 ? 0 : 1;
