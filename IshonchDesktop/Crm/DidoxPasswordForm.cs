using IshonchDesktop.UI;

namespace IshonchDesktop.Crm;

/// <summary>
/// Didox parolini bir marta so'raydi (hamma firmalar STIRi uchun bir xil). Parol shu Windows foydalanuvchisi uchun
/// shifrlab (DPAPI) saqlanadi — faqat to'g'ri chiqqandan keyin; jurnalga va boshqa joyga yozilmaydi.
/// </summary>
public sealed class DidoxPasswordForm : Form
{
    readonly TextBox box = new() { UseSystemPasswordChar = true, Width = 330 };

    DidoxPasswordForm(string note)
    {
        Text = "Didox paroli";
        Icon = AppIcon.ForWindow();
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = MinimizeBox = false;
        StartPosition = FormStartPosition.CenterParent;
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        Padding = new Padding(14);
        var layout = new FlowLayoutPanel { FlowDirection = FlowDirection.TopDown, AutoSize = true, WrapContents = false };
        layout.Controls.Add(new Label
        {
            AutoSize = true, MaximumSize = new Size(360, 0),
            Text = "Shartnomani Didox'dan olish uchun Didox paroli kerak (barcha firmalar uchun bir xil).\n" +
                   "Bir marta kiritiladi va shu kompyuterda shifrlab saqlanadi.",
        });
        if (note.Length > 0)
            layout.Controls.Add(new Label { AutoSize = true, ForeColor = Color.Firebrick, Text = note, Margin = new Padding(3, 8, 3, 0) });
        box.Margin = new Padding(3, 10, 3, 10);
        layout.Controls.Add(box);
        var buttons = new FlowLayoutPanel { FlowDirection = FlowDirection.RightToLeft, AutoSize = true, Width = 340 };
        var ok = new Button { Text = "Saqlash", DialogResult = DialogResult.OK, AutoSize = true };
        var cancel = new Button { Text = "Bekor", DialogResult = DialogResult.Cancel, AutoSize = true };
        buttons.Controls.AddRange(new Control[] { cancel, ok });
        layout.Controls.Add(buttons);
        Controls.Add(layout);
        AcceptButton = ok;
        CancelButton = cancel;
        Shown += (_, _) => box.Focus();
    }

    /// <summary>Parolni so'raydi; bekor qilinsa null.</summary>
    public static Task<string?> AskAsync(IWin32Window? owner, string note)
    {
        using var f = new DidoxPasswordForm(note);
        var r = owner is null ? f.ShowDialog() : f.ShowDialog(owner);
        return Task.FromResult(r == DialogResult.OK && f.box.Text.Length > 0 ? f.box.Text : null);
    }
}
