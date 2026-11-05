using System.Text.Json;
using IshonchDesktop.Models;

namespace IshonchDesktop.Doverennost;

/// <summary>
/// Dastur yaratgan dovernislar (har baza uchun alohida fayl): ish tugagach ularni 1C ro'yxatida belgilash va
/// dastur qayta ochilsa ham eslab qolish uchun. ЭДО orqali yuborishni foydalanuvchi o'zi bajaradi.
/// </summary>
public sealed class DoverennostStore
{
    public sealed record Entry(string Number, DateOnly Date, string Counterparty, decimal Amount, DateTime Created);

    const int Keep = 500;
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    readonly string path;

    public List<Entry> Items { get; }

    public DoverennostStore(string profileKey, string? file = null)
    {
        path = file ?? Path.Combine(Paths.AppData, "doverennost-" + profileKey + ".json");
        try { Items = JsonSerializer.Deserialize<List<Entry>>(File.ReadAllText(path), Json) ?? new(); }
        catch { Items = new(); }
    }

    public void Add(PlanItem p)
    {
        Items.RemoveAll(e => e.Number == p.Number && e.Date == p.Date);
        Items.Add(new Entry(p.Number, p.Date, p.Counterparty, p.Amount, DateTime.Now));
        if (Items.Count > Keep) Items.RemoveRange(0, Items.Count - Keep);
        Save();
    }

    public void Clear()
    {
        Items.Clear();
        Save();
    }

    void Save()
    {
        try
        {
            var tmp = path + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(Items, Json));
            File.Move(tmp, path, overwrite: true);
        }
        catch { /* saqlab bo'lmasa ish to'xtamaydi */ }
    }
}
