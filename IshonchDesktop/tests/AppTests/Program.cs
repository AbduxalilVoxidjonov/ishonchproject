using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using IshonchDesktop.Elektr;
using IshonchDesktop.Models;
using IshonchDesktop.Update;

// Yangilanish tizimi va Elektr saqlash qatlamini soxta GitHub serveri bilan tekshiradi.
// Haqiqiy GitHub, haqiqiy loginlar yoki parollar ishlatilmaydi.

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
    catch (Exception e) { Check(false, name + " (boshqa xato: " + e.GetType().Name + ": " + e.Message + ")"); }
}

var tmp = Path.Combine(Path.GetTempPath(), "ishonch-apptests-" + Guid.NewGuid().ToString("N")[..8]);
Directory.CreateDirectory(tmp);

// ---- versiya va hash yordamchilari ----
Console.WriteLine("Versiya / hash");
Check(AppInfo.ParseVersion("v1.2.3")?.ToString() == "1.2.3", "v1.2.3");
Check(AppInfo.ParseVersion("1.2.3+abc")?.ToString() == "1.2.3", "1.2.3+abc");
Check(AppInfo.ParseVersion("0.6")?.ToString() == "0.6.0", "0.6 -> 0.6.0");
Check(AppInfo.ParseVersion("nightly") is null, "versiya emas");
Check(AppInfo.ParseVersion("v0.10.0")! > AppInfo.ParseVersion("v0.9.0")!, "0.10.0 > 0.9.0 (son sifatida)");
var hex = new string('a', 64);
Check(UpdateChecker.ParseDigest("sha256:" + hex.ToUpperInvariant()) == hex, "digest");
Check(UpdateChecker.ParseDigest("md5:abcd") is null, "digest noto'g'ri");
Check(UpdateChecker.ParseHashFile(hex + "  Ishonch.exe\n") == hex, "hash fayli");
Check(UpdateChecker.IsValidRepo("a/b") && !UpdateChecker.IsValidRepo("a/b/c") && !UpdateChecker.IsValidRepo("a b/c"), "repo nomi");

// ---- soxta GitHub ----
var exeBytes = new byte[4096];
exeBytes[0] = (byte)'M'; exeBytes[1] = (byte)'Z';
new Random(1).NextBytes(exeBytes.AsSpan(2));
var exeHash = Convert.ToHexString(SHA256.HashData(exeBytes)).ToLowerInvariant();

var port = 18391;
var base_ = $"http://127.0.0.1:{port}";
string latestTag = "v0.7.0";
string? digest = "sha256:" + exeHash;
var includeExe = true;
var serveBadBytes = false;
var seenAuth = new List<string?>();
var listener = new HttpListener();
listener.Prefixes.Add($"http://127.0.0.1:{port}/");
listener.Start();
_ = Task.Run(async () =>
{
    while (listener.IsListening)
    {
        HttpListenerContext c;
        try { c = await listener.GetContextAsync(); } catch { return; }
        var path = c.Request.Url!.AbsolutePath;
        seenAuth.Add(c.Request.Headers["Authorization"]);
        byte[] body; var status = 200; var type = "application/json";
        if (path == "/repos/o/r/releases/latest")
        {
            var assets = new List<object>();
            if (includeExe) assets.Add(new { name = "Ishonch.exe", state = "uploaded", size = exeBytes.Length, digest, url = base_ + "/asset/1", browser_download_url = base_ + "/dl/Ishonch.exe" });
            body = JsonSerializer.SerializeToUtf8Bytes(new { tag_name = latestTag, body = "Yangi: Elektr bo'limi", html_url = "https://github.com/o/r/releases/tag/" + latestTag, assets });
        }
        else if (path == "/repos/o/none/releases/latest") { status = 404; body = Encoding.UTF8.GetBytes("{}"); }
        else if (path is "/dl/Ishonch.exe" or "/asset/1")
        {
            type = "application/octet-stream";
            body = serveBadBytes ? exeBytes.Select(b => (byte)(b ^ 1)).ToArray() : exeBytes;
        }
        else { status = 404; body = Array.Empty<byte>(); }
        c.Response.StatusCode = status;
        c.Response.ContentType = type;
        c.Response.OutputStream.Write(body);
        c.Response.Close();
    }
});

var checker = new UpdateChecker(base_);
var v06 = new Version(0, 6, 0);

Console.WriteLine("Tekshirish");
var r = await checker.CheckAsync("o/r", null, v06);
Check(r.State == UpdateCheckState.Available && r.Update!.Version == new Version(0, 7, 0), "yangi versiya topildi");
Check(r.Update?.Sha256 == exeHash, "digest olindi");
Check(r.Update?.Notes.Contains("Elektr") == true, "izoh olindi");
r = await checker.CheckAsync("o/r", null, new Version(0, 7, 0));
Check(r.State == UpdateCheckState.UpToDate, "bir xil versiya — yangilanish yo'q");
r = await checker.CheckAsync("o/r", null, new Version(0, 8, 0));
Check(r.State == UpdateCheckState.UpToDate, "mahalliy versiya yangiroq — yangilanish yo'q");
r = await checker.CheckAsync("o/none", null, v06);
Check(r.State == UpdateCheckState.Failed && r.Message.Contains("private"), "404 — tushunarli xabar");
includeExe = false;
r = await checker.CheckAsync("o/r", null, v06);
Check(r.State == UpdateCheckState.Failed && r.Message.Contains("Ishonch.exe"), "exe fayli yo'q");
includeExe = true;
latestTag = "nightly";
r = await checker.CheckAsync("o/r", null, v06);
Check(r.State == UpdateCheckState.Failed, "tag versiya emas");
latestTag = "v0.7.0";
r = await checker.CheckAsync("bad repo", null, v06);
Check(r.State == UpdateCheckState.Failed, "repo nomi noto'g'ri");
seenAuth.Clear();
await checker.CheckAsync("o/r", "tok-123", v06);
Check(seenAuth.Contains("Bearer tok-123"), "token Authorization sarlavhasida yuboriladi");
r = await new UpdateChecker("http://127.0.0.1:1").CheckAsync("o/r", null, v06);
Check(r.State == UpdateCheckState.Failed, "server yo'q — xato xabari (istisno emas)");

Console.WriteLine("Yuklash va tekshirish");
r = await checker.CheckAsync("o/r", null, v06);
var info = r.Update!;
var dl = Path.Combine(tmp, "dl");
string? NoCheck(string p, UpdateInfo i) => null; // PE/mahsulot tekshiruvi alohida sinaladi (soxta exe resurssiz)
var file = await UpdateInstaller.DownloadAsync(info, null, null, CancellationToken.None, dl, allowLocal: true, validator: NoCheck);
Check(File.Exists(file) && File.ReadAllBytes(file).SequenceEqual(exeBytes), "to'g'ri fayl yuklandi");
Check(!File.Exists(file + ".part"), ".part qoldirilmadi");

var progress = new List<double>();
await UpdateInstaller.DownloadAsync(info, null, new Progress<double>(progress.Add), CancellationToken.None, dl, allowLocal: true, validator: NoCheck);
await Task.Delay(100);
Check(progress.Count > 0 && progress.Max() >= 0.99, "jarayon xabar qilindi");

serveBadBytes = true;
await Throws<UpdateVerificationException>(() => UpdateInstaller.DownloadAsync(info, null, null, CancellationToken.None, Path.Combine(tmp, "dl2"), allowLocal: true, validator: NoCheck), "buzilgan fayl rad etildi (SHA-256)");
Check(!Directory.Exists(Path.Combine(tmp, "dl2")) || Directory.GetFiles(Path.Combine(tmp, "dl2")).Length == 0, "buzilgan fayl diskda qolmadi");
serveBadBytes = false;

await Throws<UpdateVerificationException>(() => UpdateInstaller.DownloadAsync(info with { Sha256 = null }, null, null, CancellationToken.None, Path.Combine(tmp, "dl3"), allowLocal: true), "exe sarlavhasi/mahsulot tekshiruvi (soxta fayl rad etildi)");
await Throws<IOException>(() => UpdateInstaller.DownloadAsync(info with { AssetDownloadUrl = "http://evil.example/x.exe", AssetApiUrl = "" }, null, null, CancellationToken.None, Path.Combine(tmp, "dl4")), "GitHub bo'lmagan manzil rad etildi");
await Throws<IOException>(() => UpdateInstaller.DownloadAsync(info with { AssetDownloadUrl = base_ + "/dl/Ishonch.exe", AssetApiUrl = "" }, null, null, CancellationToken.None, Path.Combine(tmp, "dl5"), allowLocal: false), "mahalliy manzil faqat sinov rejimida");

seenAuth.Clear();
await UpdateInstaller.DownloadAsync(info, "tok-xyz", null, CancellationToken.None, Path.Combine(tmp, "dl6"), allowLocal: true, validator: NoCheck);
Check(seenAuth.Contains("Bearer tok-xyz"), "token yuklashda ham ishlatiladi");

var cts = new CancellationTokenSource();
cts.Cancel();
await Throws<OperationCanceledException>(() => UpdateInstaller.DownloadAsync(info, null, null, cts.Token, Path.Combine(tmp, "dl7"), allowLocal: true, validator: NoCheck), "bekor qilish ishlaydi");

Console.WriteLine("Almashtirish");
var appDir = Path.Combine(tmp, "app");
Directory.CreateDirectory(appDir);
var cur = Path.Combine(appDir, "Ishonch.exe");
File.WriteAllText(cur, "ESKI");
File.WriteAllText(Path.Combine(tmp, "new.exe"), "YANGI");
UpdateInstaller.Replace(cur, Path.Combine(tmp, "new.exe"));
Check(File.ReadAllText(cur) == "YANGI", "yangi exe o'rnida");
Check(File.ReadAllText(cur + ".old") == "ESKI", "eski nusxa .old da");
UpdateInstaller.CleanupOld(cur);
Check(!File.Exists(cur + ".old"), ".old tozalandi");

// xato bo'lsa orqaga qaytadi
File.WriteAllText(cur, "ESKI2");
try { UpdateInstaller.Replace(cur, Path.Combine(tmp, "yoq.exe")); Check(false, "xato kutilgan edi"); }
catch (FileNotFoundException) { Check(File.ReadAllText(cur) == "ESKI2", "almashtirish muvaffaqiyatsiz — eski exe joyida"); }

// ishlayotgan (qulflangan) exe ni ham nomini o'zgartirib almashtirish mumkin
File.WriteAllText(Path.Combine(tmp, "new2.exe"), "YANGI2");
using (new FileStream(cur, FileMode.Open, FileAccess.Read, FileShare.Read | FileShare.Delete))
{
    UpdateInstaller.Replace(cur, Path.Combine(tmp, "new2.exe"));
}
Check(File.ReadAllText(cur) == "YANGI2", "qulflangan (ishlayotgan) exe almashtirildi");

Console.WriteLine("Ma'lumotlar zaxirasi");
var data = Path.Combine(tmp, "data");
Directory.CreateDirectory(Path.Combine(data, "marking"));
File.WriteAllText(Path.Combine(data, "settings.json"), "{\"a\":1}");
File.WriteAllText(Path.Combine(data, "elektr.dat"), "BLOB");
File.WriteAllText(Path.Combine(data, "marking", "bad.json"), "[]");
File.WriteAllText(Path.Combine(data, "app.log"), "log");
var bk = UpdateInstaller.BackupUserData(data, v06, new Version(0, 7, 0));
Check(File.ReadAllText(Path.Combine(bk, "settings.json")) == "{\"a\":1}" && File.Exists(Path.Combine(bk, "elektr.dat")), "sozlamalar va elektr.dat nusxalandi");
Check(File.Exists(Path.Combine(bk, "marking", "bad.json")), "markirovka bazasi nusxalandi");
Check(!File.Exists(Path.Combine(bk, "app.log")), "jurnal nusxalanmadi");
for (var i = 0; i < 7; i++) { await Task.Delay(1100); UpdateInstaller.BackupUserData(data, v06, new Version(0, 7, 0)); }
Check(Directory.GetDirectories(Path.Combine(data, "backups")).Length == 5, "faqat oxirgi 5 zaxira saqlanadi");

Console.WriteLine("Elektr xotirasi");
var epath = Path.Combine(tmp, "elektr.dat");
var store = new ElektrStore(epath);
Check(store.Load().Accounts.Count == 0, "boshida bo'sh");
var d = new ElektrData { TablePath = @"C:\x\jadval.xlsx", Concurrency = 6 };
d.Accounts.Add(new ElektrAccount { Login = "1111", Password = "p@ss-ЎЎ", Note = "test" });
d.Accounts.Add(new ElektrAccount { Login = "2222", Password = "q", Enabled = false });
store.Save(d);
var raw = File.ReadAllBytes(epath);
Check(!Encoding.UTF8.GetString(raw).Contains("p@ss") && !Encoding.UTF8.GetString(raw).Contains("1111"), "diskda ochiq matn yo'q (shifrlangan)");
var back = new ElektrStore(epath).Load();
Check(back.Accounts.Count == 2 && back.Accounts[0].Password == "p@ss-ЎЎ" && !back.Accounts[1].Enabled && back.Concurrency == 6 && back.TablePath == d.TablePath, "qayta o'qildi (yangi nusxa orqali)");
d.Accounts.Add(new ElektrAccount { Login = "3333", Password = "z" });
store.Save(d);
File.WriteAllBytes(epath, new byte[] { 1, 2, 3, 4, 5 }); // buzilgan fayl
var s2 = new ElektrStore(epath);
var rec = s2.Load();
Check(rec.Accounts.Count == 2 && s2.Warning is not null, "buzilgan fayl — zaxiradan tiklandi + ogohlantirish");

Console.WriteLine("Elektr tarixi");
var hpath = Path.Combine(tmp, "hist.dat");
var hs = new ElektrHistoryStore(hpath);
Check(hs.Load() == "{}", "tarix boshida bo'sh");
hs.Save("{\"2026-09\":{\"1111\":{\"balance\":123}}}");
Check(!Encoding.UTF8.GetString(File.ReadAllBytes(hpath)).Contains("1111"), "tarix diskda shifrlangan");
Check(new ElektrHistoryStore(hpath).Load().Contains("\"balance\":123"), "tarix qayta o'qildi");
hs.Save("{\"2026-10\":{}}");
File.WriteAllBytes(hpath, new byte[] { 9, 9, 9 });
Check(new ElektrHistoryStore(hpath).Load().Contains("2026-09"), "buzilgan tarix — zaxiradan tiklandi");

Console.WriteLine("Elektr URL ruxsati");
Check(ElektrHost.IsAllowedUrl(new Uri("https://cabinet-api.het.uz/api/x")), "cabinet-api.het.uz ruxsat");
Check(!ElektrHost.IsAllowedUrl(new Uri("https://evil.example/api")), "boshqa host taqiqlangan");
Check(!ElektrHost.IsAllowedUrl(new Uri("http://cabinet-api.het.uz/x")), "http taqiqlangan");
Check(!ElektrHost.IsAllowedUrl(new Uri("https://cabinet-api.het.uz.evil.example/x")), "o'xshash host taqiqlangan");
Check(!ElektrHost.IsAllowedUrl(new Uri("http://127.0.0.1:5555/x")), "mahalliy server sinov rejimisiz taqiqlangan");
Check(ElektrHost.IsAllowedUrl(new Uri("http://127.0.0.1:5555/x"), "http://127.0.0.1:5555"), "sinov rejimida mahalliy ruxsat");
var wu = ElektrHost.WriteUnique(Path.Combine(tmp, "out"), "natija.xlsx", new byte[] { 1 });
var wu2 = ElektrHost.WriteUnique(Path.Combine(tmp, "out"), "natija.xlsx", new byte[] { 2 });
Check(wu != wu2 && File.ReadAllBytes(wu)[0] == 1, "natija fayli ustiga yozilmaydi");

listener.Stop();
try { Directory.Delete(tmp, true); } catch { }
Console.WriteLine(failures == 0 ? "\nHAMMASI YAXSHI" : $"\n{failures} ta xato");
return failures == 0 ? 0 : 1;
