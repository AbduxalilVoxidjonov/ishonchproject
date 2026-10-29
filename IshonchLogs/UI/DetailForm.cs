using IshonchLogs.Core;

namespace IshonchLogs.UI;

/// <summary>Bitta yozuvning to'liq ma'lumoti: firma, kompyuter, xabar, stack trace va undan oldingi app.log qatorlari.</summary>
public sealed class DetailForm : Form
{
    public DetailForm(Problem p)
    {
        Text = $"{p.FirmTitle} — {p.Feature}";
        Size = new Size(1000, 700);
        StartPosition = FormStartPosition.CenterParent;
        var text = string.Join(Environment.NewLine, new[]
        {
            $"Vaqt:       {p.Time.LocalDateTime:dd.MM.yyyy HH:mm:ss}",
            $"Daraja:     {(p.Level == "err" ? "XATO" : "ogohlantirish")}",
            $"Bo'lim:     {p.Feature}",
            $"Firma:      {p.Firm}",
            $"Baza:       {p.Db}" + (string.IsNullOrEmpty(p.Server) ? "" : $"  (server {p.Server})"),
            $"INN:        {p.Inn}",
            $"Kompyuter:  {p.Pc}   foydalanuvchi: {p.User}   Ishonch {p.App}",
            $"Manba:      {p.Source}, qabul qilindi {p.Received.LocalDateTime:dd.MM.yyyy HH:mm:ss}",
            "",
            "XABAR:",
            p.Message,
            "",
            "TAFSILOT:",
            p.Details ?? "(yo'q)",
            "",
            "OLDINGI JURNAL QATORLARI (app.log):",
            p.Context ?? "(yo'q)",
        }).Replace("\r\n", "\n").Replace("\n", Environment.NewLine);
        var box = new TextBox
        {
            Dock = DockStyle.Fill, Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Both, WordWrap = false,
            Font = new Font("Consolas", 10f), Text = text,
        };
        var copy = new Button { Text = "Nusxalash", Dock = DockStyle.Bottom, Height = 32 };
        copy.Click += (_, _) => { try { Clipboard.SetText(text); } catch { /* buferga yozilmadi */ } };
        Controls.Add(box);
        Controls.Add(copy);
    }
}
