using IshonchDesktop.Epos;

namespace IshonchDesktop.UI;

/// <summary>
/// Oynaning pastidagi holat qatori: E-POS fiskal modul ulanganmi, aktivmi va uning raqami (Terminal / FactoryID).
/// Har 15 soniyada faqat o'qish so'rovlari bilan tekshiriladi; sotuv paytida so'ralmaydi. Bosilsa darhol yangilanadi.
/// </summary>
public sealed class FiscalStatusBar : StatusStrip
{
    static readonly Color Ok = Color.FromArgb(22, 163, 74);
    static readonly Color Bad = Color.FromArgb(220, 38, 38);
    static readonly Color Idle = Color.FromArgb(148, 163, 184);

    readonly ToolStripStatusLabel dot = new("●") { Font = new Font("Segoe UI", 11f) };
    readonly ToolStripStatusLabel text = new("Fiskal modul: tekshirilmoqda…") { Spring = true, TextAlign = ContentAlignment.MiddleLeft };
    readonly ToolStripStatusLabel time = new("") { ForeColor = Color.FromArgb(100, 116, 139) };
    readonly System.Windows.Forms.Timer timer = new() { Interval = 15000 };
    readonly UzposClient client = new();
    bool busy;
    /// <summary>Oxirgi topilgan modul raqami (port o'zgarmaguncha qayta so'ralmaydi).</summary>
    string? module;
    int modulePort;

    public FiscalStatusBar()
    {
        Dock = DockStyle.Bottom;
        SizingGrip = false;
        BackColor = Color.FromArgb(248, 250, 252);
        Font = new Font("Segoe UI", 9.5f);
        Cursor = Cursors.Hand;
        ShowItemToolTips = true;
        dot.ForeColor = Idle;
        Items.AddRange(new ToolStripItem[] { dot, text, time });
        foreach (ToolStripItem i in Items) i.ToolTipText = "Bosing — fiskal modul holatini hozir tekshirish";
        timer.Tick += async (_, _) => await RefreshAsync();
        ItemClicked += async (_, _) => await RefreshAsync();
        HandleCreated += async (_, _) => { timer.Start(); await RefreshAsync(); };
    }

    public async Task RefreshAsync()
    {
        if (busy || IsDisposed || UzposClient.SaleInProgress) return;
        busy = true;
        try
        {
            if (!await client.IsAliveAsync())
            {
                Show(Bad, "Fiskal modul: aktiv emas — E-POS Communicator ishlamayapti (dasturini oching)");
                module = null;
                return;
            }
            try
            {
                await client.GetStatusAsync();
            }
            catch (UzposException)
            {
                // Joriy portda yo'q — boshqa portlarni sinab ko'ramiz
                if (await client.DetectPortAsync() is null)
                {
                    Show(Bad, "Fiskal modul: aktiv emas — ulanganini tekshiring");
                    module = null;
                    return;
                }
            }
            if (module is null || modulePort != client.FiscalPort)
            {
                module = await client.GetModuleNameAsync();
                modulePort = client.FiscalPort;
            }
            Show(Ok, $"Fiskal modul: AKTIV — port {client.FiscalPort}" + (module is null ? " (raqami aniqlanmadi)" : $" — {module}"));
        }
        catch (Exception e)
        {
            Show(Bad, "Fiskal modul: tekshirib bo'lmadi — " + e.Message);
        }
        finally { busy = false; }
    }

    void Show(Color color, string message)
    {
        if (IsDisposed) return;
        dot.ForeColor = color;
        text.Text = message;
        time.Text = "tekshirildi " + DateTime.Now.ToString("HH:mm:ss");
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            timer.Dispose();
            client.Dispose();
        }
        base.Dispose(disposing);
    }
}
