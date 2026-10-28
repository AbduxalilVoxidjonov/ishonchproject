namespace IshonchDesktop.UI;

/// <summary>
/// Summa maydoni yozilayotganda minglarga ajratiladi: «100000000» → «100 000 000» (kasr qismi vergul bilan qoladi).
/// Kursor raqamlar orasidagi o'z joyida qoladi.
/// </summary>
public static class ThousandsInput
{
    public static string Format(string text)
    {
        var s = text.Replace(' ', ' ').Replace(" ", "").Replace('.', ',');
        var comma = s.IndexOf(',');
        var intPart = new string((comma >= 0 ? s[..comma] : s).Where(char.IsDigit).ToArray());
        var frac = comma >= 0 ? "," + new string(s[(comma + 1)..].Where(char.IsDigit).Take(2).ToArray()) : "";
        if (intPart.Length == 0) return frac.Length > 0 ? "0" + frac : "";
        intPart = intPart.TrimStart('0');
        if (intPart.Length == 0) intPart = "0";
        var groups = new List<string>();
        for (var end = intPart.Length; end > 0; end -= 3) groups.Insert(0, intPart[Math.Max(0, end - 3)..end]);
        return string.Join(" ", groups) + frac;
    }

    public static void Attach(TextBox box)
    {
        var busy = false;
        box.TextChanged += (_, _) =>
        {
            if (busy) return;
            // Kursordan oldingi raqamlar soni saqlanadi
            var caret = box.SelectionStart;
            var digitsBefore = box.Text.Take(caret).Count(c => char.IsDigit(c) || c is ',' or '.');
            var formatted = Format(box.Text);
            if (formatted == box.Text) return;
            busy = true;
            box.Text = formatted;
            var pos = 0;
            for (var seen = 0; pos < formatted.Length && seen < digitsBefore; pos++)
                if (char.IsDigit(formatted[pos]) || formatted[pos] == ',') seen++;
            box.SelectionStart = pos;
            busy = false;
        };
        box.Text = Format(box.Text);
    }
}
