using IshonchDesktop.Models;

namespace IshonchDesktop.UI;

/// <summary>Yordam → «Xatolar jurnali (yig'uvchi)…»: yig'uvchi manzili va kaliti, ulanishni sinash, hozir yuborish.</summary>
static class ProblemLogDialog
{
    public static void Show(IWin32Window owner, Settings settings, ProblemSender sender)
    {
        using var dlg = new Form
        {
            Text = "Xatolar jurnali", FormBorderStyle = FormBorderStyle.FixedDialog, StartPosition = FormStartPosition.CenterParent,
            MaximizeBox = false, MinimizeBox = false, ClientSize = new Size(520, 280), Font = new Font("Segoe UI", 9.5f),
        };
        var url = new TextBox { Text = settings.LogCollectorUrl ?? "", Left = 16, Top = 36, Width = 488, PlaceholderText = "http://192.168.1.10:5077" };
        var key = new TextBox { Text = settings.LogCollectorKey ?? "", Left = 16, Top = 96, Width = 488, UseSystemPasswordChar = true };
        var info = new Label
        {
            Left = 16, Top = 130, Width = 488, Height = 74, ForeColor = Color.DimGray,
            Text = $"Har bir xato va ogohlantirish shu kompyuterda yoziladi: {ProblemLog.FilePath}\n"
                + $"Yuborilmagan: {ProblemSender.PendingCount()} ta. Manzil bo'sh bo'lsa hech qayerga yuborilmaydi.",
        };
        var test = new Button { Text = "Sinash", Left = 16, Top = 236, Width = 90 };
        var send = new Button { Text = "Hozir yuborish", Left = 112, Top = 236, Width = 120 };
        var ok = new Button { Text = "Saqlash", Left = 324, Top = 236, Width = 85, DialogResult = DialogResult.OK };
        var cancel = new Button { Text = "Bekor", Left = 419, Top = 236, Width = 85, DialogResult = DialogResult.Cancel };
        var result = new Label { Left = 16, Top = 208, Width = 488, AutoSize = false, Height = 22 };
        test.Click += async (_, _) => { result.Text = "Tekshirilmoqda…"; result.Text = await sender.PingAsync(url.Text, key.Text); };
        send.Click += async (_, _) =>
        {
            settings.LogCollectorUrl = url.Text.Trim();
            settings.LogCollectorKey = key.Text.Trim();
            result.Text = "Yuborilmoqda…";
            var n = await sender.SendPendingAsync();
            result.Text = n < 0 ? "Yuborib bo'lmadi (manzil yoki tarmoqni tekshiring)" : $"Yuborildi: {n} ta";
        };
        dlg.Controls.AddRange(new Control[]
        {
            new Label { Text = "Yig'uvchi manzili (IshonchLogs ochiq kompyuter):", Left = 16, Top = 14, AutoSize = true }, url,
            new Label { Text = "Kalit (yig'uvchidagi bilan bir xil):", Left = 16, Top = 74, AutoSize = true }, key,
            info, result, test, send, ok, cancel,
        });
        dlg.AcceptButton = ok;
        dlg.CancelButton = cancel;
        var before = (settings.LogCollectorUrl, settings.LogCollectorKey);
        if (dlg.ShowDialog(owner) != DialogResult.OK)
        {
            (settings.LogCollectorUrl, settings.LogCollectorKey) = before;
            return;
        }
        var u = url.Text.Trim();
        if (u.Length > 0 && ProblemSender.Endpoint(u) is null)
        {
            MessageBox.Show(owner, "Manzil http://… ko'rinishida bo'lsin (masalan http://192.168.1.10:5077).", AppInfo.DisplayName);
            (settings.LogCollectorUrl, settings.LogCollectorKey) = before;
            return;
        }
        settings.LogCollectorUrl = u.Length > 0 ? u : null;
        settings.LogCollectorKey = key.Text.Trim() is { Length: > 0 } k ? k : null;
        settings.Save();
    }
}
