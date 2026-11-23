using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using IshonchDesktop.Models;

namespace IshonchDesktop.Crm;

/// <summary>
/// Shartnoma maqsadini (nima sotib olinadi / qanday xizmat) Gemini orqali aniqlaydi: shartnoma matni va oxirgi
/// fakturadagi tovarlar yuboriladi, qisqa o'zbekcha (kirill) ibora qaytadi. Kalit exe ga yig'ishda yoziladi
/// (<see cref="AppInfo.BuiltInGeminiKey"/>); bo'lmasa yoki xato bo'lsa — null (oddiy qoidalar ishlaydi).
/// Yuborishdan oldin hisob raqamlari, STIR/JShShIR va telefonlar matndan olib tashlanadi.
/// </summary>
public static class GeminiPurpose
{
    // Model band bo'lsa uzoq kutmasdan keyingisiga o'tiladi
    static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(15) };
    // Biri band (503) yoki yopilgan (404) bo'lsa keyingisi sinaladi
    static readonly string[] Models = { "gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-3.8-flash", "gemini-flash-latest" };

    public static bool Available => AppInfo.BuiltInGeminiKey is { Length: > 0 };

    /// <summary>Yuboriladigan matndan rekvizitlarni olib tashlaydi (hisob, STIR, telefon, karta).</summary>
    public static string Redact(string s)
    {
        s = Regex.Replace(s ?? "", @"(?<!\d)\d(?:[ ]?\d){15,19}(?!\d)", "[hisob]");
        s = Regex.Replace(s, @"(?<!\d)\+?998[\s\-()]*\d{2}[\s\-()]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}(?!\d)", "[tel]");
        s = Regex.Replace(s, @"(?<!\d)(\d{14}|\d{9})(?!\d)", "[stir]");
        return s;
    }

    /// <summary>Matnning boshidagi (shartnoma predmeti odatda boshida) ko'pi bilan <paramref name="max"/> belgi.</summary>
    static string Cut(string s, int max) => s.Length <= max ? s : s[..max];

    /// <summary>Gemini natijasi: maqsad, uning shartnomadagi manbasi (so'zma-so'z parcha; fakturadan bo'lsa bo'sh) va qayerdan olingani.</summary>
    public sealed record Result(string Purpose, string Source, string From);

    public static async Task<Result?> DetectAsync(string contractText, string invoiceGoods, CancellationToken ct = default)
    {
        var key = AppInfo.BuiltInGeminiKey;
        if (string.IsNullOrWhiteSpace(key)) return null;
        var prompt = new StringBuilder()
            .AppendLine("Sen buxgalteriya yordamchisisan. Quyidagi shartnoma bo'yicha \"Шартнома мақсади\" maydoni uchun qisqa ibora yoz:")
            .AppendLine("nima sotib olinadi yoki qanday xizmat/ish bajariladi. 2–8 so'z, oxirida nuqta yo'q.")
            .AppendLine("TIL: shartnomaning asosiy matni qaysi tilda yozilgan bo'lsa, maqsadni AYNAN O'SHA TILDA yoz:")
            .AppendLine("- shartnoma rus tilida bo'lsa — rus tilida, masalan \"Приобретение бытовой техники\", \"Поставка мобильных телефонов\",")
            .AppendLine("  \"Изготовление и установка металлических стеллажей\", \"Аренда помещения\", \"Рекламные услуги\";")
            .AppendLine("- o'zbek tilida (kirill) bo'lsa — kirillda, masalan \"Маиший техника харид қилиш\", \"Мобил телефонлар харид қилиш\";")
            .AppendLine("- o'zbek tilida (lotin) bo'lsa — lotinda, masalan \"Maishiy texnika xarid qilish\".")
            .AppendLine("Ikki tilli shartnomada asosiy (birinchi kelgan, to'liqroq) matn tilini ol. Didox imzo protokoli va rekvizitlar tilini hisobga olma.")
            .AppendLine("Shartnoma matnida tovar aniq bo'lmasa, fakturadagi tovarlarga qarab umumlashtir.")
            .AppendLine("MANBA: \"manba\" maydoniga maqsad olingan joyni SHARTNOMA MATNIDAN so'zma-so'z, hech o'zgartirmasdan ko'chir")
            .AppendLine("(odatda «Предмет договора / Шартнома предмети» bandidagi yoki tovar jadvalidagi 5–25 so'zli parcha).")
            .AppendLine("Maqsad fakturadagi tovarlardan olingan bo'lsa \"manba\" bo'sh, \"qayerdan\" = \"faktura\"; aks holda \"qayerdan\" = \"shartnoma\".")
            .AppendLine("Faqat JSON qaytar.")
            .AppendLine()
            .AppendLine("=== SHARTNOMA MATNI ===")
            .AppendLine(Cut(Redact(contractText), 9000))
            .AppendLine()
            .AppendLine("=== OXIRGI FAKTURADAGI TOVARLAR ===")
            .AppendLine(Cut(Redact(invoiceGoods), 2000))
            .ToString();
        var body = new JsonObject
        {
            ["contents"] = new JsonArray(new JsonObject { ["role"] = "user", ["parts"] = new JsonArray(new JsonObject { ["text"] = prompt }) }),
            ["generationConfig"] = new JsonObject
            {
                ["temperature"] = 0.1,
                ["responseMimeType"] = "application/json",
                ["responseSchema"] = new JsonObject
                {
                    ["type"] = "OBJECT",
                    ["properties"] = new JsonObject
                    {
                        ["maqsad"] = new JsonObject { ["type"] = "STRING" },
                        ["manba"] = new JsonObject { ["type"] = "STRING" },
                        ["qayerdan"] = new JsonObject { ["type"] = "STRING", ["enum"] = new JsonArray("shartnoma", "faktura") },
                    },
                    ["required"] = new JsonArray("maqsad", "manba", "qayerdan"),
                },
            },
        };
        foreach (var model in Models)
        {
            try
            {
                using var req = new HttpRequestMessage(HttpMethod.Post, $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent")
                {
                    Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json"),
                };
                req.Headers.Add("x-goog-api-key", key);
                req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
                using var resp = await Http.SendAsync(req, ct);
                var text = await resp.Content.ReadAsStringAsync(ct);
                if (!resp.IsSuccessStatusCode)
                {
                    Log.Write($"Gemini {model}: HTTP {(int)resp.StatusCode}");
                    continue;
                }
                var answer = JsonNode.Parse(text)?["candidates"]?[0]?["content"]?["parts"]?[0]?["text"]?.GetValue<string>();
                var j = answer is null ? null : JsonNode.Parse(answer);
                var purpose = j?["maqsad"]?.GetValue<string>()?.Trim().TrimEnd('.');
                if (purpose is { Length: > 1 and < 200 })
                    return new Result(purpose, (j?["manba"]?.GetValue<string>() ?? "").Trim(), j?["qayerdan"]?.GetValue<string>() ?? "shartnoma");
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
            catch (Exception e) { Log.Write($"Gemini {model}: {e.GetType().Name}: {e.Message}"); }
        }
        return null;
    }
}
