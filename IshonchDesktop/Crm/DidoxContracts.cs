using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using IshonchDesktop.Models;

namespace IshonchDesktop.Crm;

/// <summary>Didox'dagi shartnoma (CRM «Шартнома яратиш» oynasi uchun kerakli maydonlar).</summary>
public sealed record DidoxContract(
    string DocId, string Number, string Date, string ExpireDate, string Status,
    string PartnerName, string PartnerTin, string PartnerAccount, string PartnerMfo,
    string FirmAccount, decimal Sum, string Purpose, string Note = "", bool SumIsDefault = false, string FirmMfo = "",
    string ContractText = "", string InvoiceGoods = "",
    // Maqsad qayerdan: «shartnoma» (PurposeSource — shartnomadagi so'zma-so'z parcha) yoki «faktura»
    string PurposeSource = "", string PurposeOrigin = "");

/// <summary>
/// Didox'dan shartnomalarni FAQAT O'QIYDI (doctype 007). Kirish Solishtiruv saqlagan sessiya tokenlari bilan
/// (shu Windows foydalanuvchisi, DPAPI), ular eskirgan bo'lsa — Solishtiruv'dagi umumiy Didox paroli bilan.
/// Token va parol hech qayerga yozilmaydi va jurnalga chiqmaydi.
/// </summary>
public sealed class DidoxContracts
{
    const string Api = "https://api2.didox.uz";
    static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(60) };
    static readonly Dictionary<string, string> Session = new(); // tin -> token (faqat xotirada)

    // Didox holatlari (Solishtiruv bilan bir xil guruhlar)
    static readonly HashSet<int> Signed = new() { 3, 33, 180, 1170 };
    static readonly HashSet<int> Rejected = new() { 4, 130, 150, 170, 190, 1130, 1110, 1160, 1180, 1190, 1200, 1210 };
    static readonly HashSet<int> Deleted = new() { 5, 120, 555 };

    public sealed record Firm(string Tin, string Name, string Slug, string DataDir);

    // ---- Solishtiruv ma'lumotlari --------------------------------------------------------------

    /// <summary>Solishtiruv'ning didox_data papkalari (firms.json bori), eng yangisi birinchi.</summary>
    public static List<string> DataDirs()
    {
        // Sinov: Solishtiruv o'rnatilmagan kompyuterni taqlid qilish
        if (Environment.GetEnvironmentVariable("ISHONCH_NO_SOLISHTIRUV") == "1") return new();
        var desk = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var cands = new[]
        {
            Environment.GetEnvironmentVariable("SOLISHTIRUV_APPDATA") ?? "",
            Path.Combine(Paths.AppData, "solishtiruv"),
            Path.Combine(desk, "Solishtiruv"),
            Path.Combine(local, "Programs", "Solishtiruv"),
        };
        return cands.Where(c => c.Length > 0).Select(c => Path.Combine(c, "didox_data"))
            .Where(d => File.Exists(Path.Combine(d, "firms.json")))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(d => File.GetLastWriteTimeUtc(Path.Combine(d, "tokens.json")))
            .ToList();
    }

    public static List<Firm> Firms()
    {
        var res = new List<Firm>();
        foreach (var dd in DataDirs())
        {
            try
            {
                var root = JsonNode.Parse(File.ReadAllText(Path.Combine(dd, "firms.json"))) as JsonObject;
                if (root is null) continue;
                foreach (var (slug, f) in root)
                {
                    var tin = (Str(f?["tin"]) is { Length: > 0 } t ? t : Str(f?["eimzo"]?["tin"])).Trim();
                    if (tin.Length == 0) continue;
                    foreach (var name in new[] { Str(f?["eimzo"]?["org"]), Str(f?["label"]), slug.Replace('_', ' ') })
                        if (name.Trim().Length > 0) res.Add(new Firm(tin, name.Trim(), slug, dd));
                }
            }
            catch (Exception e) { Log.Error("Didox firms.json " + dd, e); }
        }
        return res;
    }

    /// <summary>Firma nomini taqqoslash uchun: katta harf, lotin, qo'shtirnoq va MCHJ/ООО kabi qo'shimchalarsiz.</summary>
    /// <param name="keepParens">true — qavs ichidagi izoh ham nomning bir qismi (aniq taqqoslash).</param>
    public static string NormName(string s, bool keepParens = false)
    {
        s = Translit(s.ToUpperInvariant());
        // Bazalar ro'yxatidagi qavs ichidagi izoh («EVOLUTION NETWORKS (DONT WASTE TIME)») olib tashlanadi;
        // tutuq belgisi so'zni bo'lmaydi («FARG'ONA» = «FARGONA»)
        if (!keepParens) s = Regex.Replace(s, @"\([^)]*\)", " ");
        s = Regex.Replace(s, @"['`‘’ʻʼ]", "");
        s = Regex.Replace(s, @"[""«»“”.,()\-]", " ");
        s = Regex.Replace(s, @"\b(MCHJ|OOO|LLC|XK|QK|AJ)\b", " ");
        return Regex.Replace(s, @"\s+", " ").Trim();
    }

    static string Translit(string s)
    {
        var map = new Dictionary<char, string>
        {
            ['А'] = "A", ['Б'] = "B", ['В'] = "V", ['Г'] = "G", ['Д'] = "D", ['Е'] = "E", ['Ё'] = "YO", ['Ж'] = "J", ['З'] = "Z",
            ['И'] = "I", ['Й'] = "Y", ['К'] = "K", ['Л'] = "L", ['М'] = "M", ['Н'] = "N", ['О'] = "O", ['П'] = "P", ['Р'] = "R",
            ['С'] = "S", ['Т'] = "T", ['У'] = "U", ['Ф'] = "F", ['Х'] = "X", ['Ц'] = "TS", ['Ч'] = "CH", ['Ш'] = "SH", ['Щ'] = "SH",
            ['Ъ'] = "", ['Ы'] = "I", ['Ь'] = "", ['Э'] = "E", ['Ю'] = "YU", ['Я'] = "YA", ['Ў'] = "O", ['Қ'] = "Q", ['Ғ'] = "G", ['Ҳ'] = "H",
        };
        var sb = new StringBuilder();
        foreach (var ch in s) sb.Append(map.TryGetValue(ch, out var r) ? r : ch.ToString());
        return sb.ToString();
    }

    /// <summary>CRM'dagi firma nomi bo'yicha STIR: Solishtiruv firmalari va Ishonch bazalari ro'yxatidan (aniq mos nom).</summary>
    public static List<Firm> FindFirm(string crmName, IEnumerable<BaseEntry> bases)
    {
        var key = NormName(crmName);
        var all = Firms();
        foreach (var b in bases)
            if (b.Inn.Trim().Length > 0) all.Add(new Firm(b.Inn.Trim(), b.Firm, "", ""));
        // Avval aniq nom (qavsdagi izoh bilan); topilmasa — izohsiz. Shunda «X (ANDIJON)» va «X (NAMANGAN)» aralashmaydi,
        // agar CRM nomi ulardan biriga aniq mos kelsa
        var strict = NormName(crmName, true);
        var hits = all.Where(f => NormName(f.Name, true) == strict).ToList();
        if (hits.Count == 0) hits = all.Where(f => NormName(f.Name) == key).ToList();
        // Bir xil STIR bir nechta manbadan kelishi mumkin: Solishtiruv yozuvi (token bori) birinchi
        return hits.GroupBy(f => f.Tin).Select(g => g.OrderByDescending(f => f.Slug.Length > 0).First()).ToList();
    }


    /// <summary>Solishtiruv'ning shartnoma keshidan (shartnoma_kesh/*.json) shu hamkor bilan shartnomasi bor firmalar (eng yangisi birinchi).</summary>
    public static List<(string FirmTin, string Firm, string Number, string Date)> CachedContractsWith(string partnerTin)
    {
        var res = new List<(string, string, string, string)>();
        foreach (var dd in DataDirs())
        {
            var dir = Path.Combine(dd, "shartnoma_kesh");
            if (!Directory.Exists(dir)) continue;
            foreach (var f in Directory.GetFiles(dir, "*.json"))
            {
                try
                {
                    var j = JsonNode.Parse(File.ReadAllText(f));
                    var firmTin = Str(j?["tin"]);
                    var name = Path.GetFileNameWithoutExtension(f).Replace('_', ' ');
                    foreach (var r in (j?["rows"] as JsonArray ?? new()))
                        if (Str(r?["partner_tin"]) == partnerTin && !Rejected.Contains(Int(r?["status"])) && !Deleted.Contains(Int(r?["status"])))
                            res.Add((firmTin, name, Str(r?["no"]), Str(r?["sana"])));
                }
                catch { /* buzilgan kesh fayli */ }
            }
        }
        return res.Distinct().OrderByDescending(x => x.Item4).ToList();
    }
    // ---- kirish -----------------------------------------------------------------------------

    static string Unprotect(string base64) =>
        Encoding.UTF8.GetString(ProtectedData.Unprotect(Convert.FromBase64String(base64.Trim()), null, DataProtectionScope.CurrentUser));

    static Dictionary<string, string> SolishtiruvTokens(string dd)
    {
        try
        {
            var s = File.ReadAllText(Path.Combine(dd, "tokens.json")).Trim();
            if (s.StartsWith("dpapi:")) s = Unprotect(s[6..]);
            return JsonSerializer.Deserialize<Dictionary<string, string>>(s.Length > 0 ? s : "{}") ?? new();
        }
        catch { return new(); }
    }

    static string SolishtiruvPassword(string dd)
    {
        try { return Str(JsonNode.Parse(Unprotect(File.ReadAllText(Path.Combine(dd, "didox_parol.dat"))))?["parol"]); }
        catch { return ""; }
    }

    async Task<bool> ValidAsync(string token)
    {
        using var r = await SendAsync(token, "/v2/documents?page=1&limit=1&owner=0");
        return r.StatusCode is not (HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden) && r.IsSuccessStatusCode;
    }

    // ---- Ishonch'ning o'z Didox paroli va sessiyalari (Solishtiruv o'rnatilmagan kompyuterlar uchun) ----------
    // Parol hamma firmalar uchun bir xil: bir marta so'raladi va shu Windows foydalanuvchisi uchun DPAPI bilan saqlanadi.
    // Sessiya tokenlari ham saqlanadi — har safar parol bilan kirilmaydi (Didox ko'p kirishni bloklaydi).

    static readonly byte[] Entropy = Encoding.UTF8.GetBytes("Ishonch.Didox.v1");
    public static string PasswordFile { get; set; } = Path.Combine(Paths.AppData, "didox-parol.dat");
    public static string TokensFile { get; set; } = Path.Combine(Paths.AppData, "didox-sessiya.dat");

    /// <summary>Parolni so'rash oynasi (UI dan beriladi). Argument — izoh (masalan «parol noto'g'ri»); null — bekor qilindi.</summary>
    public static Func<string, Task<string?>>? PasswordPrompt { get; set; }

    static string? ReadProtected(string path)
    {
        try { return File.Exists(path) ? Encoding.UTF8.GetString(ProtectedData.Unprotect(File.ReadAllBytes(path), Entropy, DataProtectionScope.CurrentUser)) : null; }
        catch { return null; }
    }

    static void WriteProtected(string path, string text)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var tmp = path + ".tmp";
        File.WriteAllBytes(tmp, ProtectedData.Protect(Encoding.UTF8.GetBytes(text), Entropy, DataProtectionScope.CurrentUser));
        File.Move(tmp, path, overwrite: true);
    }

    /// <summary>Shu ishga tushishda Didox qabul qilgan parol (faqat xotirada) — firma xatosini parol xatosidan ajratish uchun.</summary>
    static string? VerifiedPassword;

    public static string OwnPassword() => ReadProtected(PasswordFile) ?? "";
    public static void SaveOwnPassword(string pwd) => WriteProtected(PasswordFile, pwd);
    public static void ForgetOwnPassword() { try { File.Delete(PasswordFile); } catch { } }

    static Dictionary<string, string> OwnTokens()
    {
        try { return JsonSerializer.Deserialize<Dictionary<string, string>>(ReadProtected(TokensFile) ?? "{}") ?? new(); }
        catch { return new(); }
    }

    static void SaveOwnToken(string tin, string token)
    {
        try { var t = OwnTokens(); t[tin] = token; WriteProtected(TokensFile, JsonSerializer.Serialize(t)); }
        catch (Exception e) { Log.Error("Didox sessiyasini saqlash", e); }
    }

    /// <summary>Firma uchun yaroqli token: xotiradagi, Ishonch saqlagan sessiya, Solishtiruv sessiyasi, keyin parol bilan kirish.</summary>
    public async Task<string> TokenAsync(Firm firm, Action<string> status)
    {
        if (Session.TryGetValue(firm.Tin, out var t) && await ValidAsync(t)) return t;
        if (OwnTokens().TryGetValue(firm.Tin, out var own) && own.Length > 0 && await ValidAsync(own)) return Session[firm.Tin] = own;
        var dirs = DataDirs();
        foreach (var dd in dirs)
        {
            var toks = SolishtiruvTokens(dd);
            foreach (var slug in Firms().Where(f => f.Tin == firm.Tin && f.DataDir == dd).Select(f => f.Slug).Distinct())
                if (toks.TryGetValue(slug, out var tok) && tok.Length > 0 && await ValidAsync(tok))
                    return Session[firm.Tin] = tok;
        }
        // Parol: Ishonch'da saqlangani, bo'lmasa Solishtiruv'dagisi, bo'lmasa foydalanuvchidan bir marta so'raladi
        var pwd = OwnPassword();
        var fromUser = false;
        if (pwd.Length == 0) pwd = dirs.Select(SolishtiruvPassword).FirstOrDefault(p => p.Length > 0) ?? "";
        var asked0 = false;
        for (var attempt = 0; attempt < 3; attempt++)
        {
            if (pwd.Length == 0)
            {
                var asked = PasswordPrompt is null ? null
                    : await PasswordPrompt(asked0 ? $"{firm.Name}: Didox parolni qabul qilmadi — qayta kiriting." : "");
                if (string.IsNullOrEmpty(asked)) throw new InvalidOperationException("Didox paroli kiritilmadi.");
                pwd = asked;
                fromUser = true;
            }
            status("Didox'ga kirilmoqda…");
            var (token, code) = await LoginAsync(firm.Tin, pwd);
            if (token is not null)
            {
                if (fromUser) SaveOwnPassword(pwd); // to'g'ri chiqqan parol saqlanadi (keyingi safar so'ralmaydi)
                VerifiedPassword = pwd;
                SaveOwnToken(firm.Tin, token);
                return Session[firm.Tin] = token;
            }
            if (code == 423) throw new InvalidOperationException("Didox parol bilan kirishni vaqtincha bloklagan (423). Keyinroq urinib ko'ring.");
            if (code == 404) throw new InvalidOperationException($"{firm.Name} ({firm.Tin}) Didox'da topilmadi (HTTP 404) — firma STIRini tekshiring.");
            if (code is >= 400 and < 500 and not 429)
            {
                // Shu parol shu ishga tushishda boshqa firmada ishlagan: muammo parolda emas, firmada — parol so'ralmaydi
                if (VerifiedPassword == pwd)
                    throw new InvalidOperationException($"{firm.Name} ({firm.Tin}) Didox'iga kirib bo'lmadi (HTTP {code}); parol boshqa firmalarda ishlayapti — firma STIRini yoki Didox'dagi hisobini tekshiring.");
                // Parol noto'g'ri bo'lishi mumkin: qayta so'raladi. Saqlangan parol O'CHIRILMAYDI — yangisi to'g'ri chiqsa ustidan yoziladi
                pwd = "";
                asked0 = true;
                continue;
            }
            throw new InvalidOperationException($"Didox'ga kirib bo'lmadi (HTTP {code}).");
        }
        throw new InvalidOperationException("Didox'ga kirib bo'lmadi: parol noto'g'ri.");
    }

    static async Task<(string? token, int code)> LoginAsync(string tin, string pwd)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, $"{Api}/v1/auth/{tin}/password/uz")
        {
            Content = new StringContent(JsonSerializer.Serialize(new { password = pwd }), Encoding.UTF8, "application/json"),
        };
        req.Headers.UserAgent.ParseAdd("Mozilla/5.0");
        using var resp = await Http.SendAsync(req);
        if (!resp.IsSuccessStatusCode) return (null, (int)resp.StatusCode);
        var j = JsonNode.Parse(await resp.Content.ReadAsStringAsync());
        var token = Str(j?["token"]) is { Length: > 0 } a ? a : Str(j?["data"]?["token"]) is { Length: > 0 } b ? b : Str(j?["user"]?["token"]);
        if (token.Length == 0) throw new InvalidOperationException("Didox javobida token yo'q.");
        return (token, 200);
    }

    // ---- so'rovlar ----------------------------------------------------------------------------

    static Task<HttpResponseMessage> SendAsync(string token, string path)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, Api + path);
        req.Headers.Add("user-key", token);
        req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        req.Headers.AcceptLanguage.ParseAdd("uz");
        req.Headers.UserAgent.ParseAdd("Mozilla/5.0");
        return Http.SendAsync(req);
    }

    static async Task<JsonNode?> GetJsonAsync(string token, string path)
    {
        for (var a = 0; ; a++)
        {
            using var r = await SendAsync(token, path);
            if (r.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
                throw new InvalidOperationException("Didox sessiyasi eskirgan.");
            if (((int)r.StatusCode == 429 || (int)r.StatusCode >= 500) && a < 3) { await Task.Delay(1500 * (a + 1)); continue; }
            if (!r.IsSuccessStatusCode) throw new InvalidOperationException($"Didox xatosi (HTTP {(int)r.StatusCode}).");
            return JsonNode.Parse(await r.Content.ReadAsStringAsync());
        }
    }

    public static string StatusName(int st) =>
        Signed.Contains(st) ? "Imzolangan" : Rejected.Contains(st) ? "Rad etilgan" : Deleted.Contains(st) ? "O'chirilgan"
        : st is 0 or 1 ? "Qoralama" : "Imzo kutilmoqda";

    /// <summary>Firma bilan hamkor o'rtasidagi barcha shartnomalar (rad etilgan, o'chirilgan va yuborilmagan qoralamalarsiz), eng yangisi birinchi.</summary>
    public async Task<List<JsonObject>> CandidatesAsync(string token, string partnerTin)
    {
        var items = new List<JsonObject>();
        // 007 — shartnoma shakli; 000 — erkin shakldagi hujjat (shartnoma PDF bo'lib yuklangan bo'lishi mumkin)
        foreach (var doctype in new[] { "007", "000" })
            foreach (var owner in new[] { 0, 1 })
            {
                var j = await GetJsonAsync(token, $"/v2/documents?page=1&limit=100&owner={owner}&doctype={doctype}&partner={partnerTin}");
                foreach (var x in (j?["data"] as JsonArray ?? new()).OfType<JsonObject>())
                    if (Str(x["partnerTin"]) == partnerTin && Str(x["doctype"]) == doctype && (doctype == "007" || IsContractLike(x)))
                        items.Add(x);
            }
        return items.Where(x =>
            {
                var st = Int(x["doc_status"]);
                return !Rejected.Contains(st) && !Deleted.Contains(st) && st is not (0 or 1);
            })
            .GroupBy(x => Str(x["doc_id"])).Select(g => g.First())
            // Bir xil hujjatning ikki nusxasi (kiruvchi va chiquvchi tomondan) bitta bo'lib ko'rinsin
            .GroupBy(x => Str(x["doctype"]) + "|" + Describe(x).number + "|" + ItemDate(x)).Select(g => g.OrderByDescending(x => Signed.Contains(Int(x["doc_status"]))).First())
            .OrderByDescending(ItemDate)
            .ThenByDescending(x => Str(x["created"]))
            .ToList();
    }

    /// <summary>
    /// Didox ID bo'yicha bitta hujjat (ro'yxat qatori ko'rinishida). Avval hamkor bilan hujjatlar ro'yxatidan qidiriladi
    /// (holati qanday bo'lmasin); u yerda bo'lmasa hujjatning o'zi so'raladi. Topilmasa null.
    /// </summary>
    public async Task<JsonObject?> ByIdAsync(string token, string docId, string partnerTin)
    {
        bool Same(JsonNode? n) => string.Equals(Str(n), docId, StringComparison.OrdinalIgnoreCase);
        foreach (var doctype in new[] { "007", "000" })
            foreach (var owner in new[] { 0, 1 })
            {
                var j = await GetJsonAsync(token, $"/v2/documents?page=1&limit=100&owner={owner}&doctype={doctype}&partner={partnerTin}");
                var hit = (j?["data"] as JsonArray ?? new()).OfType<JsonObject>().FirstOrDefault(x => Same(x["doc_id"]));
                if (hit is not null) return hit;
            }
        // Ro'yxatda yo'q (100 tadan ko'p hujjat yoki boshqa tur): hujjatning o'zi — kiruvchi, keyin chiquvchi tomondan
        foreach (var owner in new[] { 1, 0 })
        {
            try
            {
                var data = (await GetJsonAsync(token, $"/v1/documents/{Uri.EscapeDataString(docId)}?owner={owner}"))?["data"];
                if (data?["json"] is not JsonObject js) continue;
                var doc = data["document"];
                var type = Str(doc?["doctype"]) is { Length: > 0 } t ? t : js["contractdoc"] is not null && js["clients"] is not null ? "007" : "000";
                var status = Str(doc?["doc_status"]) is { Length: > 0 } s ? s : Str(data["doc_status"]);
                return new JsonObject
                {
                    ["doc_id"] = docId, ["owner"] = owner, ["doctype"] = type, ["doc_status"] = status,
                    ["name"] = Str(doc?["name"]), ["doc_date"] = Str(doc?["doc_date"]), ["partnerTin"] = partnerTin,
                    ["partnerCompany"] = Str(doc?["partnerCompany"]),
                };
            }
            catch (InvalidOperationException e) when (!e.Message.Contains("sessiyasi")) { /* bu tomondan yo'q */ }
        }
        return null;
    }

    static string ItemDate(JsonObject x) =>
        Str(x["contract_date"]) is { Length: > 0 } d ? d[..Math.Min(10, d.Length)] : Str(x["doc_date"]);

    /// <summary>Ro'yxatdagi qator uchun qisqa tavsif: raqam, sana (kk.oo.yyyy), holat, hujjat turi.</summary>
    public static (string number, string date, string status, string type) Describe(JsonObject x)
    {
        var number = Str(x["contract_number"]).Trim() is { Length: > 0 } n ? n : Str(x["name"]).Trim();
        var iso = ItemDate(x);
        var date = DateTime.TryParseExact(iso.Length >= 10 ? iso[..10] : iso, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var dt)
            ? dt.ToString("dd.MM.yyyy") : iso;
        return (number, date, StatusName(Int(x["doc_status"])), Str(x["doctype"]) == "000" ? "erkin shakl" : "shartnoma");
    }

    static readonly Regex ContractWord = new(@"договор|шартнома|shartnoma|contract|келишув|kelishuv", RegexOptions.IgnoreCase);

    /// <summary>Erkin shakldagi hujjat shartnomami: shartnoma raqami berilgan yoki nomida «договор/шартнома».</summary>
    static bool IsContractLike(JsonObject x) => Str(x["contract_number"]).Trim().Length > 0 || ContractWord.IsMatch(Str(x["name"]));

    public async Task<DidoxContract> DetailsAsync(string token, JsonObject item, string partnerTin)
    {
        var id = Str(item["doc_id"]);
        var owner = Int(item["owner"]);
        var j = await GetJsonAsync(token, $"/v1/documents/{id}?owner={owner}");
        var js = j?["data"]?["json"] ?? throw new InvalidOperationException("Shartnoma ichi o'qilmadi.");
        if (Str(item["doctype"]) == "000") return await FreeFormAsync(token, item, js, partnerTin);
        var c = js["contractdoc"];
        var sides = new List<JsonNode?> { js["owner"] };
        sides.AddRange((js["clients"] as JsonArray ?? new()));
        var partner = sides.FirstOrDefault(s => Str(s?["tin"]) == partnerTin) ?? js["owner"];
        var firm = sides.FirstOrDefault(s => s is not null && Str(s["tin"]) != partnerTin);
        var number = Str(c?["contractno"]).Trim();
        var names = new List<string>();
        foreach (var p in (js["products"] as JsonArray ?? new()))
        {
            var n = Str(p?["name"]).Trim();
            if (n.Length > 0 && !names.Contains(n)) names.Add(n);
        }
        // Summa — shartnomada YOZILGAN summa (tovar qatoridagi narx emas); yo'q bo'lsa 1 mlrd va eslatma
        var (sum, sumNote) = ContractTerms.SumOrDefault(ContractTerms.StatedSum(js));
        // Maqsad — shu shartnomadagi eng oxirgi faktura tovarlaridan
        var inv = await InvoiceForAsync(token, partnerTin, number);
        var purpose = inv.Purpose.Length > 0 ? inv.Purpose : names.Count > 0 ? string.Join("; ", names) : Str(c?["contractname"]);
        return new DidoxContract(
            id, number, Str(c?["contractdate"]), Str(c?["contractexpiredate"]),
            StatusName(Int(item["doc_status"])),
            Str(partner?["name"]).Trim(), Str(partner?["tin"]),
            Str(partner?["account"]) is { Length: > 0 } a ? a : inv.Account,
            Str(partner?["bankid"]) is { Length: > 0 } b ? b : inv.Mfo,
            Str(firm?["account"]), sum, purpose, Join(sumNote, inv.Note), sumNote.Length > 0, Str(firm?["bankid"]) is { Length: > 0 } fm ? fm : inv.FirmMfo,
            ContractText(js), inv.Goods);
    }

    static string Join(params string[] notes) => string.Join("; ", notes.Where(n => n.Length > 0));

    /// <summary>
    /// Erkin shakldagi hujjat: raqam, sana va hamkor nomi hujjatdan; hisob raqam va MFO unda yo'q — shu hamkorning
    /// eng oxirgi fakturasidagi sotuvchi/xaridor rekvizitlaridan olinadi. Summa va muddat bo'sh qoladi.
    /// </summary>
    async Task<DidoxContract> FreeFormAsync(string token, JsonObject item, JsonNode js, string partnerTin)
    {
        var c = js["contractdoc"];
        var d = js["document"];
        var partnerSide = Str(js["sellertin"]) == partnerTin ? js["seller"] : Str(js["buyertin"]) == partnerTin ? js["buyer"] : null;
        var name = Str(partnerSide?["name"]) is { Length: > 0 } n ? n : Str(item["partnerCompany"]);
        var number = Str(c?["contractno"]) is { Length: > 0 } cn ? cn : Str(d?["documentno"]) is { Length: > 0 } dn ? dn : Str(item["name"]);
        var date = Str(c?["contractdate"]) is { Length: > 0 } cd ? cd : Str(d?["documentdate"]) is { Length: > 0 } dd ? dd : Str(item["doc_date"]);
        var inv = await InvoiceForAsync(token, partnerTin, number);
        var (sum, sumNote) = ContractTerms.SumOrDefault(ContractTerms.StatedSum(js));
        return new DidoxContract(Str(item["doc_id"]), number.Trim(), date.Length >= 10 ? date[..10] : date, "",
            StatusName(Int(item["doc_status"])) + ", erkin shakl", name.Trim(), partnerTin, inv.Account, inv.Mfo, "", sum,
            inv.Purpose.Length > 0 ? inv.Purpose : Str(d?["documentname"]).Trim(), Join(sumNote, inv.Note), sumNote.Length > 0, inv.FirmMfo,
            "", inv.Goods);
    }

    public sealed record InvoiceInfo(string Account, string Mfo, string Purpose, string Note, string FirmAccount = "", string FirmMfo = "", string Goods = "");

    /// <summary>007 shartnoma JSON idan matn (Gemini uchun): nomi, bandlari va tovarlari.</summary>
    static string ContractText(JsonNode js)
    {
        var sb = new StringBuilder();
        sb.AppendLine(Str(js["contractdoc"]?["contractname"]));
        foreach (var p in (js["parts"] as JsonArray ?? new())) sb.AppendLine(Str(p?["title"])).AppendLine(Str(p?["body"]));
        foreach (var p in (js["products"] as JsonArray ?? new())) sb.AppendLine("Tovar: " + Str(p?["name"]) + " (" + Str(p?["catalogname"]) + ")");
        return sb.ToString();
    }

    /// <summary>
    /// Shu shartnoma raqamidagi eng oxirgi faktura (bo'lmasa hamkor bilan eng oxirgi faktura): hamkorning hisob raqami,
    /// MFO si va tovarlaridan shartnoma maqsadi (ContractTerms qoidalari).
    /// </summary>
    async Task<InvoiceInfo> InvoiceForAsync(string token, string partnerTin, string contractNo)
    {
        var list = await InvoiceItemsAsync(token, partnerTin);
        var refs = list.Select(x => new InvoiceRef(Str(x["doc_id"]), Int(x["owner"]), Str(x["contract_number"]), Str(x["doc_date"]), Str(x["created"]))).ToList();
        var hit = ContractTerms.LatestFor(refs, contractNo);
        var note = "";
        if (hit is null)
        {
            hit = refs.OrderByDescending(r => r.Date).ThenByDescending(r => r.Created, StringComparer.Ordinal).FirstOrDefault();
            if (hit is null) return new InvoiceInfo("", "", "", "hamkor bilan faktura topilmadi, maqsadni tekshiring");
            note = "bu shartnoma bo'yicha faktura yo'q, maqsad hamkorning oxirgi fakturasidan";
        }
        try
        {
            var j = await GetJsonAsync(token, $"/v1/documents/{hit.DocId}?owner={hit.Owner}");
            var js = j?["data"]?["json"];
            var side = Str(js?["sellertin"]) == partnerTin ? js?["seller"] : Str(js?["buyertin"]) == partnerTin ? js?["buyer"] : null;
            var own = Str(js?["sellertin"]) == partnerTin ? js?["buyer"] : js?["seller"];
            var mfo = Str(side?["bankid"]) is { Length: > 0 } b ? b : Str(side?["mfo"]);
            return new InvoiceInfo(Str(side?["account"]), mfo, ContractTerms.PurposeFrom(ContractTerms.InvoiceLines(js)), note,
                Str(own?["account"]), Str(own?["bankid"]) is { Length: > 0 } ob ? ob : Str(own?["mfo"]),
                string.Join("\n", ContractTerms.InvoiceLines(js).Select(l => l.Name + (l.CatalogName.Length > 0 ? " (" + l.CatalogName + ")" : "")).Distinct().Take(40)));
        }
        catch (Exception e)
        {
            Log.Error("Didox faktura", e);
            return new InvoiceInfo("", "", "", "faktura o'qilmadi, maqsadni tekshiring");
        }
    }

    /// <summary>Hamkor bilan fakturalar ro'yxati (kiruvchi va chiquvchi; rad etilgan va o'chirilganlarsiz).</summary>
    async Task<List<JsonObject>> InvoiceItemsAsync(string token, string partnerTin)
    {
        var list = new List<JsonObject>();
        foreach (var doctype in new[] { "002", "001" })
            foreach (var owner in new[] { 0, 1 })
            {
                try
                {
                    var j = await GetJsonAsync(token, $"/v2/documents?page=1&limit=50&owner={owner}&doctype={doctype}&partner={partnerTin}");
                    list.AddRange((j?["data"] as JsonArray ?? new()).OfType<JsonObject>()
                        .Where(x => Str(x["partnerTin"]) == partnerTin && !Rejected.Contains(Int(x["doc_status"])) && !Deleted.Contains(Int(x["doc_status"]))));
                }
                catch (Exception e) { Log.Error("Didox faktura ro'yxati", e); }
            }
        return list;
    }

    public async Task<byte[]?> PdfAsync(string token, string docId)
    {
        using var r = await SendAsync(token, $"/v1/documents/{docId}/pdf/uz");
        if (!r.IsSuccessStatusCode) return null;
        var bytes = await r.Content.ReadAsByteArrayAsync();
        return bytes.Length > 4 && bytes[0] == '%' && bytes[1] == 'P' ? bytes : null;
    }

    // ---- yordamchilar ---------------------------------------------------------------------------

    static string Str(JsonNode? n)
    {
        if (n is null) return "";
        try { return n.GetValueKind() == JsonValueKind.String ? n.GetValue<string>() : n.ToJsonString().Trim('"'); }
        catch { return ""; }
    }

    static int Int(JsonNode? n) => int.TryParse(Str(n), out var v) ? v : -1;

    static decimal Dec(JsonNode? n) =>
        decimal.TryParse(Str(n).Replace(" ", "").Replace(',', '.'), NumberStyles.Number, CultureInfo.InvariantCulture, out var v) ? v : 0;
}
