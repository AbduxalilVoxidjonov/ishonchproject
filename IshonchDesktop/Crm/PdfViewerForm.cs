using IshonchDesktop.Models;
using IshonchDesktop.UI;
using Microsoft.Web.WebView2.WinForms;

namespace IshonchDesktop.Crm;

/// <summary>
/// Shartnoma PDF ini alohida katta oynada ko'rsatadi (WebView2 ning o'z PDF ko'rgichi: varaqlash, kattalashtirish, qidirish).
/// Tepada «Shu shartnomani tanlash» — bosilsa CRM oynasidagi maydonlar shu shartnomadan to'ldiriladi.
/// Bir vaqtda bitta oyna: yangi shartnoma ochilsa o'sha oynada almashtiriladi.
/// </summary>
public sealed class PdfViewerForm : Form
{
    static PdfViewerForm? current;

    readonly WebView2 view = new() { Dock = DockStyle.Fill };
    readonly Label title = new() { AutoSize = true, Font = new Font("Segoe UI", 11f, FontStyle.Bold), Padding = new Padding(4, 8, 12, 0) };
    readonly Button choose = new()
    {
        Text = "✔  Shu shartnomani tanlash", AutoSize = true, Height = 34, FlatStyle = FlatStyle.Flat, Cursor = Cursors.Hand,
        BackColor = Color.FromArgb(22, 163, 74), ForeColor = Color.White, Font = new Font("Segoe UI", 10f, FontStyle.Bold),
    };
    readonly Button close = new() { Text = "Yopish", AutoSize = true, Height = 34 };
    Action? onChoose;
    string? path;

    PdfViewerForm()
    {
        Text = "Shartnoma — Didox";
        Icon = AppIcon.ForWindow();
        StartPosition = FormStartPosition.CenterScreen;
        var area = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1280, 900);
        Size = new Size(Math.Min(1100, area.Width - 40), area.Height - 40);
        KeyPreview = true;
        KeyDown += (_, e) => { if (e.KeyCode == Keys.Escape) Close(); };
        var top = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 46, Padding = new Padding(8, 6, 8, 4), BackColor = Color.FromArgb(240, 253, 244) };
        choose.FlatAppearance.BorderSize = 0;
        choose.Click += (_, _) => { var a = onChoose; Close(); a?.Invoke(); };
        close.Click += (_, _) => Close();
        top.Controls.AddRange(new Control[] { title, choose, close });
        Controls.Add(view);
        Controls.Add(top);
        FormClosed += (_, _) => { if (current == this) current = null; };
    }

    /// <summary>PDF faylini (keshdagi) oynada ochadi.</summary>
    public static async Task ShowAsync(IWin32Window? owner, string pdfPath, string caption, Action onChoose)
    {
        var f = current ??= new PdfViewerForm();
        f.title.Text = caption;
        f.Text = caption + " — Didox";
        f.onChoose = onChoose;
        f.path = pdfPath;
        if (!f.Visible)
        {
            if (owner is not null) f.Show(owner); else f.Show();
            await f.view.EnsureCoreWebView2Async(await WebTab.GetEnvironmentAsync("crm-pdf"));
        }
        f.Activate();
        if (f.WindowState == FormWindowState.Minimized) f.WindowState = FormWindowState.Normal;
        f.view.CoreWebView2.Navigate(new Uri(pdfPath).AbsoluteUri);
    }
}
