using System.Globalization;
using System.Text.RegularExpressions;

namespace IshonchDesktop.Debtors;

/// <summary>Оборотно-сальдовая ведомость ning bitta qatori: moxel qator raqami (y), nom katagining chap chekinishi (daraja) va ustun raqami → matn.</summary>
public sealed record OsvRow(int Y, int Pad, Dictionary<int, string> Cells)
{
    public string Name => Cells.TryGetValue(0, out var n) ? n : "";
}

/// <summary>Kontragentning bitta hisobdagi oxirgi qoldig'i (Debet / Kredit).</summary>
public sealed record AccountBalance(string Account, decimal Debit, decimal Credit);

/// <summary>Kontragent: hisoblar bo'yicha qoldiq va umumiy debitor / kreditor summalari.</summary>
public sealed record PartyBalance(string Party, List<AccountBalance> Accounts)
{
    public decimal Debit => Accounts.Sum(a => a.Debit);
    public decimal Credit => Accounts.Sum(a => a.Credit);
    /// <summary>Debet − Kredit: musbat — kontragent bizga qarzdor (debitor), manfiy — biz unga qarzdormiz (kreditor).</summary>
    public decimal Net => Debit - Credit;
    public string Kind => Net > 0 ? "Debitor" : Net < 0 ? "Kreditor" : "—";
}

public static class OsvParser
{
    /// <summary>Qaysi hisoblar bo'yicha kontragent qoldig'i olinadi (haqiqiy hisobotdagi guruhlash bilan bir xil).</summary>
    public static readonly string[] Accounts = { "4010", "4310", "6010", "6310" };

    // «4010, Расчеты…» (bitta ustunda) yoki «4010» (kod va nom alohida ustunlarda — «Размещение: В отдельных колонках»)
    static readonly Regex AccountRow = new(@"^(\d{4}(?:\.\d+)?)(,\s|$)", RegexOptions.Compiled);

    public static decimal Num(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return 0;
        var t = Regex.Replace(text, @"[\s ]", "").Replace(',', '.');
        return decimal.TryParse(t, NumberStyles.Any, CultureInfo.InvariantCulture, out var v) ? v : 0;
    }

    /// <summary>
    /// Hisobot qatorlaridan (y bo'yicha) kontragentlarni ajratadi: hisob qatori → uning ostidagi birinchi chuqurroq daraja — kontragent,
    /// undan chuqurrog'i (shartnoma) tashlanadi. Oxirgi qoldiq: 5-ustun — Debet, 6-ustun — Kredit.
    /// </summary>
    public static List<PartyBalance> Parse(IEnumerable<OsvRow> rows)
    {
        var result = new Dictionary<string, PartyBalance>(StringComparer.OrdinalIgnoreCase);
        string? acc = null;
        int accPad = 0;
        int? partyPad = null;
        var shift = 0; // alohida ustunlar rejimida hisob nomi 1-ustunga o'tadi va raqamlar bir ustun o'ngga siljiydi
        foreach (var r in rows.GroupBy(x => x.Y).Select(g => g.First()).OrderBy(x => x.Y))
        {
            var m = AccountRow.Match(r.Name);
            if (m.Success)
            {
                acc = Accounts.Contains(m.Groups[1].Value) ? m.Groups[1].Value : null;
                accPad = r.Pad;
                partyPad = null;
                shift = m.Groups[2].Value.Length == 0 ? 1 : 0;
                continue;
            }
            if (acc is null) continue;
            if (r.Pad <= accPad) { acc = null; continue; }
            partyPad ??= r.Pad;
            if (r.Pad != partyPad) continue; // shartnoma qatori
            var party = r.Name.Trim();
            if (party.Length == 0) continue;
            var bal = new AccountBalance(acc, Num(r.Cells.GetValueOrDefault(5 + shift)), Num(r.Cells.GetValueOrDefault(6 + shift)));
            if (!result.TryGetValue(party, out var p)) result[party] = p = new PartyBalance(party, new());
            p.Accounts.Add(bal);
        }
        return result.Values.OrderBy(p => p.Party, StringComparer.OrdinalIgnoreCase).ToList();
    }
}
