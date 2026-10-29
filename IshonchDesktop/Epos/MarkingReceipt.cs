using System.Text.Json;
using IshonchDesktop.Models;

namespace IshonchDesktop.Epos;

/// <summary>
/// 1C chekidagi bitta qator: tovar nomi, miqdori (dona; gramm tovarda — kasr) va markirovka kodlari (markirovkasizda bo'sh).
/// </summary>
public sealed record ReceiptLine(string Name, decimal Quantity, decimal UnitPrice, IReadOnlyList<string> Codes);

public sealed record MarkingReceipt(string ReceiptId, bool Finished, IReadOnlyList<ReceiptLine> Lines)
{
    /// <summary>
    /// Markirovka paneli saqlagan holatdan (%APPDATA%\Ishonch\marking\&lt;baza&gt;.json) oxirgi chekni o'qiydi:
    /// 1C ga o'tkazilgan (placed) miqdorlar va shu chekda ishlatilgan kodlar.
    /// </summary>
    public static MarkingReceipt? Load(BaseEntry b)
    {
        var path = Path.Combine(Paths.AppData, "marking", b.ProfileKey + ".json");
        if (!File.Exists(path)) return null;
        using var doc = JsonDocument.Parse(File.ReadAllText(path));
        if (!doc.RootElement.TryGetProperty("mk1c_state", out var state)) return null;
        return Parse(state);
    }

    /// <summary>1C panelidan kelgan chek: { receiptId, finished, lines: [{ name, quantity, unitPrice, codes[] }] }.</summary>
    public static MarkingReceipt? FromJson(JsonElement e)
    {
        if (e.ValueKind != JsonValueKind.Object || !e.TryGetProperty("lines", out var arr) || arr.ValueKind != JsonValueKind.Array) return null;
        var lines = new List<ReceiptLine>();
        foreach (var l in arr.EnumerateArray())
        {
            var name = l.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "";
            var qty = l.TryGetProperty("quantity", out var q) && q.ValueKind == JsonValueKind.Number ? (int)Math.Round(q.GetDouble()) : 0;
            var price = l.TryGetProperty("unitPrice", out var p) && p.ValueKind == JsonValueKind.Number ? p.GetDecimal() : 0m;
            var codes = l.TryGetProperty("codes", out var c) && c.ValueKind == JsonValueKind.Array
                ? c.EnumerateArray().Select(x => x.GetString() ?? "").Where(x => x.Length > 0).ToList() : new List<string>();
            if (name.Length > 0 && qty > 0) lines.Add(new ReceiptLine(name, qty, price, codes));
        }
        if (lines.Count == 0) return null;
        var id = e.TryGetProperty("receiptId", out var r) ? r.ToString() : "";
        var fin = e.TryGetProperty("finished", out var f) && f.ValueKind == JsonValueKind.True;
        return new MarkingReceipt(id, fin, lines);
    }

    public static MarkingReceipt? Parse(JsonElement state)
    {
        var receiptId = state.TryGetProperty("receiptId", out var rid) ? rid.ToString() : "";
        var finished = state.TryGetProperty("status", out var st) && st.GetString() == "done";

        // kodlar: shu chekda ishlatilganlar, tovar nomi bo'yicha guruhlanadi
        var byName = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        if (state.TryGetProperty("usedCodes", out var used) && used.ValueKind == JsonValueKind.Object)
            foreach (var c in used.EnumerateObject())
            {
                if (c.Value.ValueKind != JsonValueKind.Object) continue;
                var codeReceipt = c.Value.TryGetProperty("receiptId", out var r) ? r.ToString() : "";
                if (receiptId.Length > 0 && codeReceipt != receiptId) continue;
                var name = c.Value.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "";
                if (name.Length == 0) continue;
                if (!byName.TryGetValue(name, out var list)) byName[name] = list = new List<string>();
                list.Add(c.Name);
            }

        var lines = new List<ReceiptLine>();
        if (state.TryGetProperty("items", out var items) && items.ValueKind == JsonValueKind.Array)
            foreach (var i in items.EnumerateArray())
            {
                var placed = i.TryGetProperty("placed", out var p) && p.ValueKind == JsonValueKind.Number ? (int)Math.Round(p.GetDouble()) : 0;
                if (placed <= 0) continue;
                var name = i.TryGetProperty("name", out var nm) ? nm.GetString() ?? "" : "";
                var price = i.TryGetProperty("price", out var pr) && pr.ValueKind == JsonValueKind.Number ? pr.GetDecimal() : 0;
                byName.TryGetValue(name, out var codes);
                lines.Add(new ReceiptLine(name, placed, price, codes ?? new List<string>()));
            }
        return lines.Count == 0 ? null : new MarkingReceipt(receiptId, finished, lines);
    }
}
