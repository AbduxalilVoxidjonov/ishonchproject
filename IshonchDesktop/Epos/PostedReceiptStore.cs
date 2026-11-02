using System.Text.Json;
using IshonchDesktop.Models;

namespace IshonchDesktop.Epos;

/// <summary>
/// Markirovkasiz sotishda provesti qilingan cheklar — «E-POS orqali sotish» uchun. Har baza uchun alohida faylda saqlanadi
/// (%APPDATA%\Ishonch\unmarked-receipts-&lt;baza&gt;.json), dastur qayta ochilsa ham sotilmaganlari ro'yxatda qoladi.
/// </summary>
public sealed class PostedReceiptStore
{
    /// <summary>Saqlanadigan eng ko'p chek (eskilari o'chadi).</summary>
    const int Keep = 200;

    public sealed record Entry(MarkingReceipt Receipt, bool Sold, DateTime Time);

    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = false };
    readonly string path;

    public List<Entry> Items { get; }

    public PostedReceiptStore(string profileKey, string? file = null)
    {
        path = file ?? Path.Combine(Paths.AppData, "unmarked-receipts-" + profileKey + ".json");
        try { Items = JsonSerializer.Deserialize<List<Entry>>(File.ReadAllText(path), Json) ?? new(); }
        catch { Items = new(); }
    }

    public void Add(MarkingReceipt receipt)
    {
        if (Items.Any(e => e.Receipt.ReceiptId == receipt.ReceiptId)) return;
        Items.Add(new Entry(receipt, false, DateTime.Now));
        if (Items.Count > Keep) Items.RemoveRange(0, Items.Count - Keep);
        Save();
    }

    public void MarkSold(string receiptId)
    {
        var i = Items.FindIndex(e => e.Receipt.ReceiptId == receiptId);
        if (i < 0) return;
        Items[i] = Items[i] with { Sold = true };
        Save();
    }

    void Save()
    {
        try
        {
            var tmp = path + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(Items, Json));
            File.Move(tmp, path, true);
        }
        catch (Exception e) { Log.Error("PostedReceiptStore", e); }
    }
}
