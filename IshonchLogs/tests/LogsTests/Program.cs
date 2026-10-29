using System.Net;
using System.Net.Sockets;
using IshonchDesktop.Models;
using IshonchLogs.Core;

// Yig'uvchi (IshonchLogs): fayllarni o'qish, firma/muammo bo'yicha guruhlash, saqlash, HTTP qabul qilish
// va Ishonch dasturidagi ProblemLog → ProblemSender → yig'uvchi zanjiri. Faqat 127.0.0.1 va vaqtinchalik papka ishlatiladi.

var tmp = Path.Combine(Path.GetTempPath(), "ishonch-logstests-" + Guid.NewGuid().ToString("N")[..8]);
Directory.CreateDirectory(tmp);
// Ishonch o'z papkasini haqiqiy %APPDATA% o'rniga shu yerda ochsin (Paths birinchi murojaatda o'qiydi)
Environment.SetEnvironmentVariable("ISHONCH_DATA_DIR", Path.Combine(tmp, "ishonch"));

var failures = 0;
void Check(bool ok, string name)
{
    Console.WriteLine((ok ? "  OK   " : "  XATO ") + name);
    if (!ok) failures++;
}
var samples = Path.Combine(AppContext.BaseDirectory, "samples");

// ---- o'qish ----
Console.WriteLine("O'qish");
var a = ProblemParser.ParseJsonLines(File.ReadAllText(Path.Combine(samples, "firm-a.problems.jsonl")), "a");
var b = ProblemParser.ParseJsonLines(File.ReadAllText(Path.Combine(samples, "firm-b.problems.jsonl")), "b");
Check(a.Count == 4, "1-firma: 4 ta yozuv, buzilgan qator tashlandi");
Check(b.Count == 3, "2-firma: 3 ta yozuv");
Check(a[0].Firm == "Namuna Savdo MChJ" && a[0].Inn == "300000001" && a[0].Level == "warn" && a[0].Feature == "Markirovkali avto", "maydonlar o'qildi");
Check(a[0].Time == new DateTimeOffset(2026, 10, 27, 9, 12, 5, TimeSpan.FromHours(5)), "vaqt");
Check(ProblemParser.ParseJsonLines("{\"message\":\"x\"}", "s")[0].Id.Length == 32, "Id bo'lmasa — mazmundan hosil qilinadi");
Check(ProblemParser.ParseJsonLines("{\"level\":\"err\"}", "s").Count == 0, "xabarsiz yozuv tashlanadi");
Check(ProblemParser.ParseBody("[{\"message\":\"a\"},{\"message\":\"b\"}]", "h").Count == 2, "HTTP massiv");
Check(ProblemParser.ParseBody("{\"message\":\"a\"}", "h").Count == 1, "HTTP bitta obyekt");
try { ProblemParser.ParseBody("salom", "h"); Check(false, "JSON emas — xato"); }
catch (FormatException) { Check(true, "JSON emas — xato"); }

var legacy = ProblemParser.ParseAppLog(File.ReadAllText(Path.Combine(samples, "legacy-app.log")), "BUX-PC-07-app.log", new DateTime(2026, 10, 20));
Check(legacy.Count == 2, "eski app.log: 2 ta muammo (oddiy qatorlar o'tkazib yuborildi)");
Check(legacy[0].Feature == "Markirovkasiz" && legacy[0].Db == "baza902" && legacy[0].Firm == "Sinov Market MChJ" && legacy[0].Level == "err", "eski app.log: markirovkasiz baza/firma");
Check(legacy[0].Time.DateTime == new DateTime(2026, 10, 20, 9, 0, 3, 250), "eski app.log: sana fayldan, vaqt qatordan");
Check(legacy[0].Context?.Contains("Inventarizatsiya ochilmoqda") == true, "eski app.log: oldingi qatorlar kontekstda");
Check(legacy[1].Feature == "Yangilanish" && legacy[1].Details?.Contains("ConnectToTcpHostAsync") == true, "eski app.log: XATO + stack trace davomi");

// ---- guruhlash ----
Console.WriteLine("Guruhlash");
Check(ProblemGrouper.Normalize("2-chek: panel javob bermadi") == ProblemGrouper.Normalize("3-chek: panel javob bermadi"), "raqamlar namunada #");
Check(ProblemGrouper.Normalize("«Asosiy sklad» uchun inventarizatsiya topilmadi") == ProblemGrouper.Normalize("«Filial sklad» uchun inventarizatsiya topilmadi"), "«…» ichi namunada yo'q");
Check(ProblemGrouper.Normalize("a\nb") == "a", "faqat birinchi qator");

var groups = ProblemGrouper.Group(a.Concat(b).Concat(legacy));
var ga = groups.Single(g => g.Key == "inn:300000001");
var gb = groups.Single(g => g.Key == "inn:300000002");
Check(groups.Count == 3, "3 ta firma guruhi (2 firma + INN siz eski log bazasi)");
Check(ga.Title == "Namuna Savdo MChJ (baza901)" && ga.Count == 4, "1-firma: sarlavha va 4 ta yozuv (faqat INN li soliq xatosi ham shu firmada)");
Check(ga.Problems.Count == 3, "1-firma: 3 xil muammo (panel javob bermadi ×2 bitta guruh)");
Check(ga.Problems.Single(p => p.Feature == "Markirovkali avto").Count == 2, "bir xil muammo sanaladi");
Check(gb.Problems.Single(p => p.Pattern.Contains("inventarizatsiya")).Count == 2, "2-firma: inventarizatsiya ×2 bitta guruh");
Check(gb.Count == 4 && gb.Problems.Any(p => p.Items.Any(i => i.Source == "BUX-PC-07-app.log")), "2-firma: INN siz eski app.log yozuvi baza nomi orqali shu firmada");
Check(new ProblemFilter(FirmKey: gb.Key) { KeyOf = p => ProblemGrouper.KeyOf(p, ProblemGrouper.InnByDb(legacy.Concat(b))) }.Match(legacy[0]), "firma filtri ham eski yozuvni o'tkazadi");
Check(groups[0].Last >= groups[1].Last, "eng so'nggi firma tepada");
Check(ga.Problems[0].Last >= ga.Problems[^1].Last, "firma ichida eng so'nggi muammo tepada");

// ---- filtr ----
Console.WriteLine("Filtr");
var all = a.Concat(b).ToList();
Check(all.Count(new ProblemFilter(Level: "err").Match) == 4, "faqat xatolar");
Check(all.Count(new ProblemFilter(Feature: "E-POS").Match) == 1, "bo'lim");
Check(all.Count(new ProblemFilter(FirmKey: "inn:300000002").Match) == 3, "firma");
Check(all.Count(new ProblemFilter(Text: "sinov sklad").Match) == 2, "matn (bir nechta so'z)");
Check(all.Count(new ProblemFilter(From: new DateTime(2026, 10, 28), To: new DateTime(2026, 10, 28)).Match) == 4, "sana oralig'i");

// ---- saqlash ----
Console.WriteLine("Saqlash");
var store = new ProblemStore(Path.Combine(tmp, "store"));
Check(store.Import(Path.Combine(samples, "firm-a.problems.jsonl")) == 4, "fayl import");
Check(store.Import(Path.Combine(samples, "firm-a.problems.jsonl")) == 0, "qayta import — takrorlanmaydi");
Check(store.Import(Path.Combine(samples, "legacy-app.log")) == 2, "eski app.log import");
var reload = new ProblemStore(store.Folder);
reload.Load();
Check(reload.Count == 6, "diskdan qayta o'qildi");
Check(reload.Add(a) == 0, "qayta o'qilgandan keyin ham takrorlanmaydi");

// ---- HTTP + Ishonch dasturi ----
Console.WriteLine("HTTP");
int FreePort() { var l = new TcpListener(IPAddress.Loopback, 0); l.Start(); var p = ((IPEndPoint)l.LocalEndpoint).Port; l.Stop(); return p; }
var port = FreePort();
var inbox = new ProblemStore(Path.Combine(tmp, "inbox"));
await using (var server = new CollectorServer(inbox, port, "sinov-kalit"))
{
    await server.StartAsync();
    var url = $"http://127.0.0.1:{port}";
    using var http = new HttpClient();
    Check((await http.GetAsync(url + "/api/ping")).StatusCode == HttpStatusCode.Unauthorized, "kalitsiz — 401");
    var bad = new HttpRequestMessage(HttpMethod.Post, url + "/api/problems") { Content = new StringContent("salom") };
    bad.Headers.Add(CollectorServer.KeyHeader, "sinov-kalit");
    Check((await http.SendAsync(bad)).StatusCode == HttpStatusCode.BadRequest, "JSON emas — 400");

    // Ishonch tomoni: ikki firmada muammo yoziladi va yuboriladi
    ProblemLog.FilePath = Path.Combine(tmp, "ishonch", "problems.jsonl");
    Log.FilePath = Path.Combine(tmp, "ishonch", "app.log");
    Log.Write("Markirovkasiz [baza901 — Namuna Savdo MChJ]: Inventarizatsiya ochilmoqda");
    var firmA = new BaseEntry { Db = "baza901", Firm = "Namuna Savdo MChJ", Inn = "300000001", Server = "tas-1cbuxapp-01" };
    var firmB = new BaseEntry { Db = "baza902", Firm = "Sinov Market MChJ", Inn = "300000002", Server = "tas-1cbuxapp-02" };
    ProblemLog.Report(Feature.Unmarked, "err", "Kutilmagan xato: 1C javob bermadi", firmA, "System.Exception: 1C javob bermadi");
    ProblemLog.Report(Feature.Unmarked, "err", "Kutilmagan xato: 1C javob bermadi", firmA); // 60 s ichida takror — yozilmaydi
    ProblemLog.Report(Feature.Marked, "warn", "1C javobi kutilmoqda: Podbor (12 s)", firmB);
    ProblemLog.Report(Feature.Marked, "warn", "1C javobi kutilmoqda: Podbor (15 s)", firmB); // faqat raqami boshqa — takror
    ProblemLog.Report(Feature.Epos, "err", "✗ Chek yaratilmadi: port 3448", firmB);
    Log.Error("elektr.save", new IOException("disk to'la"));
    var lines = File.ReadAllLines(ProblemLog.FilePath);
    Check(lines.Length == 4, "Ishonch: 4 ta yozuv (takrorlar bostirildi)");
    Check(lines[0].Contains("\"firm\":\"Namuna Savdo MChJ\"") && lines[0].Contains("\"inn\":\"300000001\"") && lines[0].Contains("\"feature\":\"Markirovkasiz\""), "Ishonch: firma, INN, bo'lim yozildi");
    Check(lines[0].Contains("Inventarizatsiya ochilmoqda"), "Ishonch: app.log konteksti qo'shildi");
    Check(lines[3].Contains("\"feature\":\"Elektr\"") && lines[3].Contains("disk to'la"), "Ishonch: Log.Error ham yoziladi");
    Check(ProblemSender.PendingCount() == 4, "Ishonch: 4 ta yuborilmagan");

    using (var noUrl = new ProblemSender(() => (null, null)))
        Check(await noUrl.SendPendingAsync() == 0 && ProblemSender.PendingCount() == 4, "manzil berilmasa hech narsa yuborilmaydi");
    using (var wrongKey = new ProblemSender(() => (url, "boshqa")))
        Check(await wrongKey.SendPendingAsync() == -1 && ProblemSender.PendingCount() == 4, "kalit noto'g'ri — yuborilmadi, faylda qoldi");
    using (var offline = new ProblemSender(() => ($"http://127.0.0.1:{FreePort()}", "sinov-kalit")))
        Check(await offline.SendPendingAsync() == -1 && ProblemSender.PendingCount() == 4, "yig'uvchi o'chiq — faylda qoldi");

    using var sender = new ProblemSender(() => (url, "sinov-kalit"));
    Check(await sender.PingAsync(url, "sinov-kalit") == "Ulandi", "ping");
    var sent = await sender.SendPendingAsync();
    Check(sent == 4, $"4 ta yuborildi ({sent})");
    Check(ProblemSender.PendingCount() == 0, "yuborilganlar belgilandi");
    Check(await sender.SendPendingAsync() == 0, "qayta yuborilmaydi");
    File.AppendAllText(ProblemLog.FilePath, "buzilgan qator\n");
    ProblemLog.Report(Feature.Soliq, "warn", "soliq-api 401", inn: "300000002");
    Check(await sender.SendPendingAsync() == 1, "buzilgan qator yuborishni to'xtatmaydi");

    var got = ProblemGrouper.Group(inbox.Snapshot());
    Check(inbox.Count == 5, $"yig'uvchida 5 ta yozuv ({inbox.Count}: {string.Join(" | ", inbox.Snapshot().Select(p => p.FirmTitle + ": " + p.Message))})");
    Check(got.Any(g => g.Title == "Namuna Savdo MChJ (baza901)" && g.Count == 1), "yig'uvchi: 1-firma guruhi");
    Check(got.Any(g => g.Title == "Sinov Market MChJ (baza902)" && g.Count == 3), "yig'uvchi: 2-firma guruhi (INN li soliq xatosi bilan)");
    Check(inbox.Snapshot().All(p => p.Source == "http 127.0.0.1" && p.Pc == Environment.MachineName), "manba va kompyuter");
}

try { Directory.Delete(tmp, true); } catch { }
Console.WriteLine(failures == 0 ? "\nHAMMASI YAXSHI" : $"\n{failures} ta xato");
return failures == 0 ? 0 : 1;
