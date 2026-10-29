using System.Globalization;
using System.Text.RegularExpressions;

namespace IshonchDesktop.Unmarked;

/// <summary>Inventarizatsiyadagi bitta tovar: 1C jadvalidagi tartib raqami, nomi, qoldiq va NDS bilan 1 dona narxi.</summary>
public sealed record StockItem(int Index, string Name, decimal Available, decimal UnitGross);

/// <summary>Bitta chekdagi qator: tovar tartib raqami va miqdori.</summary>
public sealed record PlanLine(int Index, decimal Qty);

public sealed record ReceiptPlan(IReadOnlyList<PlanLine> Lines, decimal Total);

/// <summary>
/// Cheklar bo'yicha miqdorlarni taqsimlaydi: har chek jami (NDS bilan) belgilangan summaga yaqin bo'ladi, hech bir tovar
/// qoldig'idan ko'p olinmaydi (barcha cheklar yig'indisida ham), miqdorlar butun sonlarda.
/// </summary>
public static class Planner
{
    /// <summary>
    /// Umumiy summani cheklarga har xil bo'lib taqsimlaydi: har chek o'rtachadan ±`variation` (masalan 0,25 = ±25%) farq qiladi,
    /// yig'indisi aynan umumiy summaga teng, summalar 1000 so'mga yaxlitlanadi.
    /// </summary>
    public static List<decimal> SplitTotal(decimal total, int count, decimal variation, Random rnd)
    {
        if (count <= 1) return new() { total };
        var w = Enumerable.Range(0, count).Select(_ => 1m + (decimal)(rnd.NextDouble() * 2 - 1) * variation).ToList();
        var sum = w.Sum();
        var parts = w.Select(x => Math.Round(total * x / sum / 1000m) * 1000m).ToList();
        parts[^1] += total - parts.Sum();
        return parts;
    }

    /// <summary>
    /// Tanlangan qatorlar (jadvaldagi tartibda) uchun miqdorlar: har biriga kamida 1 dona, qoldiqdan oshmaydi, jami summadan oshmaydi
    /// va unga imkon qadar yaqin. Pul qatorlar orasida teng taqsimlanadi, qolgan mayda qism arzon tovarlar bilan to'ldiriladi.
    /// 1 donadan ham summaga sig'masa, oxirgi qatorlar tashlab yuboriladi (Lines kamroq bo'ladi).
    /// </summary>
    public static ReceiptPlan Distribute(IReadOnlyList<StockItem> rows, decimal target)
    {
        var use = rows.Where(r => r.UnitGross > 0 && Math.Floor(r.Available) >= 1).ToList();
        while (use.Count > 1 && use.Sum(r => r.UnitGross) > target) use.RemoveAt(use.Count - 1);
        if (use.Count == 0) return new ReceiptPlan(Array.Empty<PlanLine>(), 0);

        var q = use.ToDictionary(r => r.Index, _ => 1m);
        var rest = target - use.Sum(r => r.UnitGross);
        // 1) teng ulush bo'yicha
        for (var round = 0; round < 50 && rest > 0; round++)
        {
            var active = use.Where(r => q[r.Index] < Math.Floor(r.Available)).ToList();
            if (active.Count == 0) break;
            var share = rest / active.Count;
            var moved = false;
            foreach (var r in active)
            {
                var add = Math.Min(Math.Floor(r.Available) - q[r.Index], Math.Floor(share / r.UnitGross));
                if (add <= 0) continue;
                q[r.Index] += add;
                rest -= add * r.UnitGross;
                moved = true;
            }
            if (!moved) break;
        }
        // 2) qolgan mayda qism — arzonlaridan
        foreach (var r in use.OrderBy(r => r.UnitGross))
        {
            var add = Math.Min(Math.Floor(r.Available) - q[r.Index], Math.Floor(rest / r.UnitGross));
            if (add <= 0) continue;
            q[r.Index] += add;
            rest -= add * r.UnitGross;
        }
        return new ReceiptPlan(use.Select(r => new PlanLine(r.Index, q[r.Index])).ToList(), Math.Round(target - rest, 2));
    }

    /// <param name="target">Bitta chek summasi (Всего, NDS bilan).</param>
    /// <param name="count">Cheklar soni.</param>
    /// <param name="tolerancePct">Summadan ruxsat etilgan oshish (foizda).</param>
    public static List<ReceiptPlan> Plan(IReadOnlyList<StockItem> items, decimal target, int count, decimal tolerancePct = 0m, int offset = 0)
    {
        var left = items.ToDictionary(i => i.Index, i => Math.Floor(Math.Max(0, i.Available)));
        var usable = items.Where(i => i.UnitGross > 0).ToList();
        var result = new List<ReceiptPlan>();
        var limit = target * (1 + tolerancePct / 100m);

        for (var r = 0; r < count; r++)
        {
            var qty = new Dictionary<int, decimal>();
            decimal sum = 0;
            // Har chekda boshqa tovardan boshlanadi (hammasi bitta tovardan bo'lib qolmasin)
            var order = usable.OrderByDescending(i => i.UnitGross).ToList();
            if (order.Count > 0)
            {
                var shift = (r + offset) % order.Count;
                order = order.Skip(shift).Concat(order.Take(shift)).ToList();
            }

            foreach (var it in order)
            {
                if (left[it.Index] <= 0) continue;
                var q = Math.Min(left[it.Index], Math.Floor((limit - sum) / it.UnitGross));
                if (q <= 0) continue;
                qty[it.Index] = qty.GetValueOrDefault(it.Index) + q;
                left[it.Index] -= q;
                sum += q * it.UnitGross;
            }
            // Qolgan kichik qismni eng arzon tovarlar bilan to'ldirish
            foreach (var it in usable.OrderBy(i => i.UnitGross))
            {
                if (left[it.Index] <= 0) continue;
                var q = Math.Min(left[it.Index], Math.Floor((limit - sum) / it.UnitGross));
                if (q <= 0) continue;
                qty[it.Index] = qty.GetValueOrDefault(it.Index) + q;
                left[it.Index] -= q;
                sum += q * it.UnitGross;
            }
            result.Add(new ReceiptPlan(
                qty.OrderBy(k => k.Key).Select(k => new PlanLine(k.Key, k.Value)).ToList(),
                Math.Round(sum, 2)));
        }
        return result;
    }

    /// <summary>Gramm bilan sotiladigan tovar miqdori qadami (0,01 g).</summary>
    public const decimal WeightStep = 0.01m;

    /// <summary>
    /// Tovar dona emas, og'irlik (gramm, masalan oltin) bilan sotiladimi: o'lchov birligi «г», «гр», «грамм», «кг» (yoki lotincha)
    /// bo'lsa yoki qoldiq kasr son bo'lsa (12,35). Aks holda — dona.
    /// </summary>
    public static bool IsWeight(string? unit, decimal qty)
    {
        var u = (unit ?? "").Trim().TrimEnd('.').ToLowerInvariant();
        if (u is "г" or "гр" or "грамм" or "граммы" or "граммов" or "кг" or "килограмм" or "g" or "gr" or "gramm" or "gram" or "kg") return true;
        return qty != Math.Truncate(qty);
    }

    /// <summary>1C post xatosi matnidan (qator raqami, qoldiq): «в строке 3 ... превышает остаток. Остаток: 0; Не хватает: 254».</summary>
    public static (int Row, decimal Stock)? ParseStockError(string message)
    {
        if (!message.Contains("превышает остаток", StringComparison.OrdinalIgnoreCase)) return null;
        var row = Regex.Match(message, @"в\s+строке\s+(\d+)");
        var stock = Regex.Match(message, @"Остаток:\s*([\d\s .,]*\d)");
        if (!row.Success || !stock.Success) return null;
        var digits = stock.Groups[1].Value.Replace(" ", "").Replace(" ", "").Replace(',', '.');
        return decimal.TryParse(digits, NumberStyles.Any, CultureInfo.InvariantCulture, out var s)
            ? (int.Parse(row.Groups[1].Value), s) : null;
    }
}
