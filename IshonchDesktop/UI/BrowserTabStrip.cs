using System.Drawing.Drawing2D;

namespace IshonchDesktop.UI;

/// <summary>
/// TabControl ning o'z sarlavhalarisiz varianti: sahifalar shu yerda turadi, sarlavhalarni <see cref="BrowserTabStrip"/> chizadi.
/// </summary>
public sealed class HeaderlessTabControl : TabControl
{
    const int TCM_ADJUSTRECT = 0x1328;

    protected override void WndProc(ref Message m)
    {
        // Sarlavha qatori uchun joy ajratilmaydi — sahifa butun maydonni egallaydi
        if (m.Msg == TCM_ADJUSTRECT && !DesignMode) { m.Result = (IntPtr)1; return; }
        base.WndProc(ref m);
    }
}

/// <summary>
/// Chrome'dagidek tablar satri: yumaloq burchakli tablar, faol tab sahifa rangida ajralib turadi, har birida ✕ (Bosh sahifadan
/// tashqari), oxirida «+» (Bosh sahifaga o'tadi — u yerdan baza/sayt ochiladi). O'rta tugma — yopish; sichqoncha g'ildiragi —
/// tablar orasida yurish. Sahifalar <see cref="HeaderlessTabControl"/> da turadi, bu satr faqat ularni ko'rsatadi va tanlaydi.
/// </summary>
public sealed class BrowserTabStrip : Control
{
    readonly TabControl tabs;
    readonly ToolTip tip = new() { InitialDelay = 600 };
    int hover = -1;
    bool hoverClose, hoverPlus;
    string? tipText;

    public static readonly Color StripBack = Color.FromArgb(222, 228, 236);
    public static readonly Color ActiveBack = Color.FromArgb(248, 250, 252); // WebTab paneli bilan bir xil
    static readonly Color HoverBack = Color.FromArgb(236, 240, 245);
    static readonly Color Text = Color.FromArgb(30, 41, 59);
    static readonly Color MutedText = Color.FromArgb(71, 85, 105);
    static readonly Color Separator = Color.FromArgb(176, 186, 200);

    /// <summary>Tab yopilishi so'raldi (✕ yoki o'rta tugma).</summary>
    public event Action<int>? CloseRequested;
    /// <summary>«+» bosildi.</summary>
    public event Action? NewTabRequested;

    public BrowserTabStrip(TabControl tabs)
    {
        this.tabs = tabs;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
        Dock = DockStyle.Top;
        BackColor = StripBack;
        Font = new Font("Segoe UI", 9.5f);
        Height = LogicalToDeviceUnits(38);
        tabs.SelectedIndexChanged += (_, _) => Invalidate();
        tabs.ControlAdded += (_, _) => Invalidate();
        tabs.ControlRemoved += (_, _) => Invalidate();
        DpiChangedAfterParent += (_, _) => Height = LogicalToDeviceUnits(38);
    }

    int S(int v) => LogicalToDeviceUnits(v);
    int Top0 => S(7);
    int PlusSize => S(28);

    /// <summary>Har tab kengligi: imkon bo'lsa 230, joy yetmasa teng bo'linadi (eng kami 64).</summary>
    int TabWidth()
    {
        var n = Math.Max(1, tabs.TabPages.Count);
        var avail = Width - S(8) - PlusSize - S(16);
        return Math.Clamp(avail / n, S(64), S(230));
    }

    Rectangle TabRect(int i)
    {
        var w = TabWidth();
        return new Rectangle(S(8) + i * w, Top0, w, Height - Top0);
    }

    Rectangle CloseRect(Rectangle r)
    {
        var s = S(18);
        return new Rectangle(r.Right - s - S(9), r.Top + (r.Height - s) / 2, s, s);
    }

    Rectangle PlusRect()
    {
        var n = tabs.TabPages.Count;
        var x = n == 0 ? S(8) : TabRect(n - 1).Right + S(6);
        return new Rectangle(x, Top0 + (Height - Top0 - PlusSize) / 2, PlusSize, PlusSize);
    }

    bool Closable(int i) => i > 0; // Bosh sahifa yopilmaydi

    static GraphicsPath TabPath(Rectangle r, int radius)
    {
        var p = new GraphicsPath();
        var d = radius * 2;
        p.AddArc(r.Left, r.Top, d, d, 180, 90);
        p.AddArc(r.Right - d, r.Top, d, d, 270, 90);
        p.AddLine(r.Right, r.Top + radius, r.Right, r.Bottom);
        p.AddLine(r.Right, r.Bottom, r.Left, r.Bottom);
        p.CloseFigure();
        return p;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        var sel = tabs.SelectedIndex;
        for (var i = 0; i < tabs.TabPages.Count; i++)
        {
            var r = TabRect(i);
            var active = i == sel;
            var body = new Rectangle(r.Left + S(1), r.Top, r.Width - S(2), r.Height + 1);
            if (active || i == hover)
            {
                using var path = TabPath(body, S(8));
                using var brush = new SolidBrush(active ? ActiveBack : HoverBack);
                g.FillPath(brush, path);
            }
            // Ajratgich chiziq: faol yoki ustidagi tab yonida chizilmaydi
            if (i > 0 && i != sel && i - 1 != sel && i != hover && i - 1 != hover)
            {
                using var sep = new Pen(Separator);
                g.DrawLine(sep, r.Left, r.Top + S(8), r.Left, r.Bottom - S(8));
            }

            var page = tabs.TabPages[i];
            var iconSize = S(16);
            var icon = new Rectangle(r.Left + S(12), r.Top + (r.Height - iconSize) / 2, iconSize, iconSize);
            DrawIcon(g, i, icon, active);
            var right = Closable(i) ? CloseRect(r).Left - S(4) : r.Right - S(10);
            var textRect = new Rectangle(icon.Right + S(8), r.Top, Math.Max(0, right - icon.Right - S(8)), r.Height);
            TextRenderer.DrawText(g, page.Text, Font, textRect, active ? Text : MutedText,
                TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis | TextFormatFlags.Left | TextFormatFlags.NoPrefix);

            if (Closable(i) && (active || i == hover || r.Width > S(110)))
            {
                var c = CloseRect(r);
                if (i == hover && hoverClose)
                {
                    using var hb = new SolidBrush(Color.FromArgb(203, 213, 225));
                    g.FillEllipse(hb, c);
                }
                using var pen = new Pen(MutedText, S(1) * 1.4f);
                var k = S(5);
                g.DrawLine(pen, c.Left + k, c.Top + k, c.Right - k, c.Bottom - k);
                g.DrawLine(pen, c.Right - k, c.Top + k, c.Left + k, c.Bottom - k);
            }
        }

        // «+»
        var plus = PlusRect();
        if (hoverPlus)
        {
            using var hb = new SolidBrush(HoverBack);
            g.FillEllipse(hb, plus);
        }
        using (var pp = new Pen(MutedText, S(1) * 1.6f))
        {
            var m = S(8);
            g.DrawLine(pp, plus.Left + m, plus.Top + plus.Height / 2, plus.Right - m, plus.Top + plus.Height / 2);
            g.DrawLine(pp, plus.Left + plus.Width / 2, plus.Top + m, plus.Left + plus.Width / 2, plus.Bottom - m);
        }
    }

    /// <summary>Tab belgisi: Bosh sahifa — uycha, 1C — «1C», soliq — «S», boshqalar — doira.</summary>
    void DrawIcon(Graphics g, int i, Rectangle r, bool active)
    {
        var key = tabs.TabPages[i].Tag as string ?? "";
        var color = i == 0 ? Color.FromArgb(37, 99, 235)
            : key.StartsWith("1c-") ? Color.FromArgb(220, 38, 38)
            : key.StartsWith("soliq") ? Color.FromArgb(22, 163, 74)
            : key == "crm" ? Color.FromArgb(124, 58, 237)
            : Color.FromArgb(100, 116, 139);
        if (i == 0)
        {
            using var pen = new Pen(color, S(1) * 1.7f) { LineJoin = LineJoin.Round };
            var cx = r.Left + r.Width / 2f;
            g.DrawLines(pen, new[] { new PointF(r.Left + 1, r.Top + r.Height * 0.48f), new PointF(cx, r.Top + 1), new PointF(r.Right - 1, r.Top + r.Height * 0.48f) });
            g.DrawRectangle(pen, r.Left + r.Width * 0.2f, r.Top + r.Height * 0.45f, r.Width * 0.6f, r.Height * 0.5f);
            return;
        }
        using var b = new SolidBrush(color);
        g.FillEllipse(b, r);
        var label = key.StartsWith("1c-") ? "1C" : key.StartsWith("soliq") ? "S" : key == "crm" ? "M" : "";
        if (label.Length == 0) return;
        using var f = new Font("Segoe UI", label.Length > 1 ? 5.8f : 7f, FontStyle.Bold);
        TextRenderer.DrawText(g, label, f, r, Color.White, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
    }

    int HitTab(Point p)
    {
        for (var i = 0; i < tabs.TabPages.Count; i++) if (TabRect(i).Contains(p)) return i;
        return -1;
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);
        var h = HitTab(e.Location);
        var hc = h > 0 && Closable(h) && CloseRect(TabRect(h)).Contains(e.Location);
        var hp = PlusRect().Contains(e.Location);
        if (h != hover || hc != hoverClose || hp != hoverPlus) { hover = h; hoverClose = hc; hoverPlus = hp; Invalidate(); }
        // To'liq nom — qisqartirilgan bo'lsa tooltipda
        var t = hp ? "Bosh sahifa (yangi baza yoki sayt ochish)" : h >= 0 ? (tabs.TabPages[h].ToolTipText is { Length: > 0 } tt ? tt : tabs.TabPages[h].Text) : null;
        if (t != tipText) { tipText = t; tip.SetToolTip(this, t ?? ""); }
    }

    protected override void OnMouseLeave(EventArgs e)
    {
        base.OnMouseLeave(e);
        hover = -1; hoverClose = hoverPlus = false;
        Invalidate();
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (PlusRect().Contains(e.Location) && e.Button == MouseButtons.Left) { NewTabRequested?.Invoke(); return; }
        var i = HitTab(e.Location);
        if (i < 0) return;
        if (Closable(i) && (e.Button == MouseButtons.Middle || (e.Button == MouseButtons.Left && CloseRect(TabRect(i)).Contains(e.Location))))
        {
            CloseRequested?.Invoke(i);
            return;
        }
        if (e.Button == MouseButtons.Left) tabs.SelectedIndex = i;
    }

    protected override void OnMouseWheel(MouseEventArgs e)
    {
        base.OnMouseWheel(e);
        var n = tabs.TabPages.Count;
        if (n == 0) return;
        tabs.SelectedIndex = ((tabs.SelectedIndex + (e.Delta < 0 ? 1 : -1)) % n + n) % n;
    }
}
