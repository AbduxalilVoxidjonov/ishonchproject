using System.Drawing.Drawing2D;

namespace IshonchDesktop.UI;

/// <summary>Bosh sahifa sarlavhasi: gradient fon, dastur belgisi, nomi, izoh va versiya. Masshtab Font orqali o'zgaradi.</summary>
public sealed class HeaderBar : Control
{
    static readonly Color From = Color.FromArgb(49, 46, 129);
    static readonly Color To = Color.FromArgb(79, 70, 229);

    Image? logo;

    public string Subtitle { get; set; } = "";
    public string Version { get; set; } = "";

    public HeaderBar()
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
        ForeColor = Color.White;
        logo = AppIcon.Image(256); // ico dagi eng katta (256 px) nusxa — kattalashtirilganda ham aniq
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
        var r = ClientRectangle;
        if (r.Width <= 0 || r.Height <= 0) return;

        // Yumaloq burchakli gradient fon
        var radius = Math.Max(6, r.Height / 6);
        using (var path = Rounded(new Rectangle(0, 0, r.Width - 1, r.Height - 1), radius))
        using (var brush = new LinearGradientBrush(r, From, To, LinearGradientMode.Horizontal))
            g.FillPath(brush, path);

        var pad = r.Height / 5;
        var x = pad;
        if (logo is not null)
        {
            // Belgi oq doira ichida
            var d = r.Height - pad * 2;
            using (var white = new SolidBrush(Color.FromArgb(245, 255, 255, 255))) g.FillEllipse(white, x, pad, d, d);
            var inset = d / 10;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.DrawImage(logo, new Rectangle(x + inset, pad + inset, d - inset * 2, d - inset * 2));
            x += d + pad;
        }

        using var titleFont = new Font(Font.FontFamily, Font.SizeInPoints, FontStyle.Bold);
        using var subFont = new Font(Font.FontFamily, Font.SizeInPoints * 0.55f);
        var titleH = g.MeasureString(Text, titleFont).Height;
        var subH = string.IsNullOrEmpty(Subtitle) ? 0 : g.MeasureString(Subtitle, subFont).Height;
        var top = (r.Height - titleH - subH) / 2;
        using (var fg = new SolidBrush(ForeColor)) g.DrawString(Text, titleFont, fg, x, top);
        using (var muted = new SolidBrush(Color.FromArgb(220, 224, 231, 255)))
        {
            if (subH > 0) g.DrawString(Subtitle, subFont, muted, x + 2, top + titleH);
            if (!string.IsNullOrEmpty(Version))
            {
                var vs = g.MeasureString(Version, subFont);
                g.DrawString(Version, subFont, muted, r.Width - vs.Width - pad * 1.5f, (r.Height - vs.Height) / 2);
            }
        }
    }

    static GraphicsPath Rounded(Rectangle r, int radius)
    {
        var d = radius * 2;
        var p = new GraphicsPath();
        p.AddArc(r.X, r.Y, d, d, 180, 90);
        p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) logo?.Dispose();
        base.Dispose(disposing);
    }
}
