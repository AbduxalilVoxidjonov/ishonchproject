namespace IshonchDesktop.UI;

/// <summary>Yon panellar uchun umumiy ko'rinish: ranglar, tugmalar, sarlavha.</summary>
public static class PanelStyle
{
    public static readonly Color Back = Color.FromArgb(248, 250, 252);
    public static readonly Color Card = Color.White;
    public static readonly Color Border = Color.FromArgb(226, 232, 240);
    public static readonly Color Accent = Color.FromArgb(37, 99, 235);
    public static readonly Color AccentDark = Color.FromArgb(29, 78, 216);
    public static readonly Color Muted = Color.FromArgb(100, 116, 139);
    public static readonly Color Danger = Color.FromArgb(220, 38, 38);
    public static readonly Font Base = new("Segoe UI", 9.5f);
    public static readonly Font Bold = new("Segoe UI", 9.5f, FontStyle.Bold);
    public static readonly Font Title = new("Segoe UI Semibold", 11.5f);

    public static Button Primary(Button b)
    {
        b.FlatStyle = FlatStyle.Flat;
        b.FlatAppearance.BorderSize = 0;
        b.BackColor = Accent;
        b.ForeColor = Color.White;
        b.Font = Bold;
        b.Cursor = Cursors.Hand;
        b.FlatAppearance.MouseOverBackColor = AccentDark;
        b.EnabledChanged += (_, _) => b.BackColor = b.Enabled ? Accent : Color.FromArgb(148, 163, 184);
        return b;
    }

    public static Button Secondary(Button b, bool danger = false)
    {
        b.FlatStyle = FlatStyle.Flat;
        b.FlatAppearance.BorderColor = danger ? Danger : Border;
        b.BackColor = Card;
        b.ForeColor = danger ? Danger : Color.FromArgb(30, 41, 59);
        b.Font = Base;
        b.Cursor = Cursors.Hand;
        return b;
    }

    /// <summary>Oq, ingichka chegarali "karta" konteyner.</summary>
    public static Panel CardPanel(Padding padding)
    {
        var p = new Panel { BackColor = Card, Padding = padding };
        p.Paint += (_, e) =>
        {
            using var pen = new Pen(Border);
            e.Graphics.DrawRectangle(pen, 0, 0, p.Width - 1, p.Height - 1);
        };
        return p;
    }

    public static Label Caption(string text) => new()
    {
        Text = text, AutoSize = false, Height = 20, Dock = DockStyle.Top, ForeColor = Muted, Font = Base,
        TextAlign = ContentAlignment.BottomLeft,
    };
}
