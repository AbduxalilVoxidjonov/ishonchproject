using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using ExcelDataReader;

namespace IshonchDesktop.Doverennost;

/// <summary>1C bank ko'chirmasi (Список.xls) dagi bitta chiqim qatori.</summary>
public sealed record BankRow(int Line, DateOnly Date, decimal Amount, string Purpose, string Counterparty, string Operation, string Contract = "")
{
    /// <summary>Bank o'z xizmati uchun olgan komissiya (dovernis kerak emas): «Bank xizmatlari», IPAK YO'LI va h.k.</summary>
    public bool LooksLikeBankFee =>
        Regex.IsMatch(Purpose, @"За оп\.обс|Тариф|комисси", RegexOptions.IgnoreCase) ||
        Regex.IsMatch(Purpose, @"Bank xizmatlari", RegexOptions.IgnoreCase);
}

public static class BankStatement
{
    /// <summary>.xls / .xlsx faylidan «Списание» (chiqim) bor qatorlarni o'qiydi.</summary>
    public static List<BankRow> Load(string path)
    {
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        using var reader = ExcelReaderFactory.CreateReader(stream);
        var rows = new List<object?[]>();
        while (reader.Read())
        {
            var cells = new object?[reader.FieldCount];
            for (var i = 0; i < cells.Length; i++) cells[i] = reader.GetValue(i);
            rows.Add(cells);
        }
        return Parse(rows);
    }

    /// <summary>Jadval qatorlaridan (birinchisi — sarlavha) chiqimlarni ajratadi. Tekshirish uchun alohida.</summary>
    public static List<BankRow> Parse(IReadOnlyList<object?[]> rows)
    {
        var result = new List<BankRow>();
        if (rows.Count == 0) return result;
        var head = rows[0].Select(c => (c?.ToString() ?? "").Trim().ToLowerInvariant()).ToList();
        int Col(params string[] names) => head.FindIndex(h => names.Any(n => h == n));
        var cDate = Col("дата"); var cOut = Col("списание"); var cPurpose = Col("назначение платежа");
        var cParty = Col("контрагент"); var cOp = Col("вид операции"); var cContract = Col("договор");
        if (cDate < 0 || cOut < 0 || cParty < 0) throw new InvalidDataException("Faylda «Дата», «Списание», «Контрагент» ustunlari topilmadi");
        for (var i = 1; i < rows.Count; i++)
        {
            var r = rows[i];
            string S(int c) => c >= 0 && c < r.Length ? (r[c]?.ToString() ?? "").Trim() : "";
            object? Raw(int col) => col >= 0 && col < r.Length ? r[col] : null;
            var amount = ParseAmount(Raw(cOut));
            var date = ParseDate(Raw(cDate));
            if (amount is not > 0 || date is null) continue;
            result.Add(new BankRow(i + 1, date.Value, amount.Value, S(cPurpose), S(cParty), S(cOp), S(cContract)));
        }
        return result;
    }

    public static decimal? ParseAmount(object? c)
    {
        switch (c)
        {
            case null: return null;
            case double d: return (decimal)d;
            case decimal m: return m;
            case int n: return n;
        }
        var s = Regex.Replace(c.ToString() ?? "", @"[\s ]", "").Replace(',', '.');
        return decimal.TryParse(s, NumberStyles.Number, CultureInfo.InvariantCulture, out var v) ? v : null;
    }

    public static DateOnly? ParseDate(object? c)
    {
        if (c is DateTime dt) return DateOnly.FromDateTime(dt);
        var s = (c?.ToString() ?? "").Trim();
        return DateTime.TryParseExact(s.Split(' ')[0], "dd.MM.yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)
            ? DateOnly.FromDateTime(d) : null;
    }
}
