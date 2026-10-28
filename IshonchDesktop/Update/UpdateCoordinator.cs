using System.Security.Cryptography;
using System.Text;
using IshonchDesktop.Models;
using IshonchDesktop.UI;

namespace IshonchDesktop.Update;

/// <summary>
/// Yangilanish oqimi: tekshirish → yangi versiya oynasi → zaxira → yuklash → almashtirish → qayta ishga tushirish.
/// Sozlamalar (repo, token, avto-tekshirish) shu yerda boshqariladi.
/// </summary>
public sealed class UpdateCoordinator
{
    readonly Form owner;
    readonly Settings settings;
    readonly HomeControl home;
    readonly UpdateChecker checker;
    readonly bool allowLocal;
    UpdateInfo? available;
    bool busy;

    /// <summary>Yangilanish o'rnatildi: shu exe ni ishga tushirib, joriy oynani yopish kerak.</summary>
    public string? PendingRestart { get; private set; }

    public UpdateCoordinator(Form owner, Settings settings, HomeControl home)
    {
        this.owner = owner;
        this.settings = settings;
        this.home = home;
        // Faqat sinov uchun: soxta GitHub serveri (mahalliy 127.0.0.1)
        var dev = Environment.GetEnvironmentVariable("ISHONCH_UPDATE_API");
        var local = dev is not null && dev.StartsWith("http://127.0.0.1:", StringComparison.Ordinal);
        allowLocal = local;
        checker = new UpdateChecker(local ? dev! : UpdateChecker.DefaultApiBase);
        home.CheckUpdatesClicked += async () => await CheckAsync(manual: true);
        home.InstallUpdateClicked += async () => { if (available is not null) await OfferAsync(available, fromBanner: true); };
    }

    // ---- token (DPAPI) -----------------------------------------------------------------------

    public string? Token
    {
        get
        {
            if (string.IsNullOrEmpty(settings.UpdateTokenProtected)) return null;
            try { return Encoding.UTF8.GetString(ProtectedData.Unprotect(Convert.FromBase64String(settings.UpdateTokenProtected), null, DataProtectionScope.CurrentUser)); }
            catch { return null; }
        }
        set => settings.UpdateTokenProtected = string.IsNullOrWhiteSpace(value)
            ? null
            : Convert.ToBase64String(ProtectedData.Protect(Encoding.UTF8.GetBytes(value.Trim()), null, DataProtectionScope.CurrentUser));
    }

    // ---- tekshirish --------------------------------------------------------------------------

    /// <summary>Ishga tushganda jim tekshiradi (xato bo'lsa hech narsa ko'rsatmaydi); yangi versiya bo'lsa oyna chiqadi.</summary>
    public async Task CheckOnStartupAsync()
    {
        if (!settings.AutoCheckUpdates) return;
        await CheckAsync(manual: false);
    }

    public async Task CheckAsync(bool manual)
    {
        if (busy) return;
        busy = true;
        home.SetCheckingUpdates(true);
        try
        {
            var result = await checker.CheckAsync(settings.UpdateRepo, Token, AppInfo.Current);
            settings.LastUpdateCheckUtc = DateTime.UtcNow;
            switch (result.State)
            {
                case UpdateCheckState.Available when result.Update is { } u:
                    available = u;
                    home.ShowUpdateBanner($"Yangi versiya {AppInfo.Format(u.Version)} mavjud — yangilash uchun bosing");
                    if (manual || settings.SkippedVersion != AppInfo.Format(u.Version))
                    {
                        busy = false;
                        await OfferAsync(u, fromBanner: false);
                    }
                    break;
                case UpdateCheckState.UpToDate:
                    available = null;
                    home.ShowUpdateBanner(null);
                    if (manual) Info(result.Message);
                    break;
                default:
                    Log.Write("update.check: " + result.Message);
                    if (manual) Warn(result.Message);
                    break;
            }
        }
        catch (Exception e)
        {
            Log.Error("update.check", e);
            if (manual) Warn("Tekshirishda xato: " + e.Message);
        }
        finally
        {
            busy = false;
            home.SetCheckingUpdates(false);
        }
    }

    // ---- taklif va o'rnatish -----------------------------------------------------------------

    async Task OfferAsync(UpdateInfo u, bool fromBanner)
    {
        using var dlg = new UpdateDialog(u, AppInfo.Current, canAutoInstall: AppInfo.IsSingleFile);
        var choice = dlg.ShowDialog(owner);
        switch (dlg.Choice)
        {
            case UpdateChoice.Install: await InstallAsync(u); break;
            case UpdateChoice.Skip:
                settings.SkippedVersion = AppInfo.Format(u.Version);
                settings.Save();
                break;
            case UpdateChoice.OpenPage:
                if (u.PageUrl.StartsWith("https://github.com/", StringComparison.OrdinalIgnoreCase))
                    System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(u.PageUrl) { UseShellExecute = true });
                break;
        }
        _ = choice;
    }

    async Task InstallAsync(UpdateInfo u)
    {
        var current = Environment.ProcessPath;
        if (current is null || !AppInfo.IsSingleFile)
        {
            Warn("Bu nusxa avtomatik yangilanmaydi (ishlab chiqish rejimi). Release sahifasidan Ishonch.exe ni yuklab oling.");
            return;
        }

        using var progress = new ProgressDialog($"Ishonch {AppInfo.Format(u.Version)} yuklanmoqda…");
        progress.Show(owner);
        try
        {
            // 1) Ma'lumotlar zaxirasi (yangilanish ularga tegmaydi, lekin ehtiyot uchun)
            try { UpdateInstaller.BackupUserData(Paths.AppData, AppInfo.Current, u.Version); }
            catch (Exception e) { Log.Error("update.backup", e); }

            // 2) Yuklab olish va tekshirish
            var file = await UpdateInstaller.DownloadAsync(u, Token, new Progress<double>(progress.Report), progress.Token, allowLocal: allowLocal);

            // 3) Almashtirish
            progress.SetText("O'rnatilmoqda…");
            settings.SkippedVersion = null;
            settings.Save();
            UpdateInstaller.Replace(current, file);
            PendingRestart = current;
        }
        catch (OperationCanceledException)
        {
            progress.Close();
            return;
        }
        catch (UpdateVerificationException e)
        {
            progress.Close();
            Warn("Yangilanish bekor qilindi — " + e.Message + "\n\nHozirgi versiya o'zgarishsiz qoldi.");
            return;
        }
        catch (Exception e)
        {
            Log.Error("update.install", e);
            progress.Close();
            Warn("Yangilab bo'lmadi: " + e.Message + "\n\nHozirgi versiya o'zgarishsiz qoldi. Dastur papkasiga yozish ruxsati bormi tekshiring.");
            return;
        }
        progress.Close();

        // 4) Qayta ishga tushirish (ochiq tablar keyingi ishga tushishda tiklanadi)
        if (MessageBox.Show(owner, $"Yangilanish o'rnatildi (v{AppInfo.Format(u.Version)}).\nDastur qayta ishga tushadi; ochiq tablaringiz va saqlangan ma'lumotlar o'z joyida qoladi.",
                "Ishonch", MessageBoxButtons.OKCancel, MessageBoxIcon.Information) == DialogResult.OK)
            owner.Close();
        else
            PendingRestart = null; // keyingi qo'lda ishga tushirishda yangi versiya ochiladi
    }

    static void Info(string text) => MessageBox.Show(text, "Ishonch — yangilanish", MessageBoxButtons.OK, MessageBoxIcon.Information);
    static void Warn(string text) => MessageBox.Show(text, "Ishonch — yangilanish", MessageBoxButtons.OK, MessageBoxIcon.Warning);

    // ---- sozlamalar --------------------------------------------------------------------------

    public void ShowSettings()
    {
        using var dlg = new Form
        {
            Text = "Yangilanish sozlamalari", FormBorderStyle = FormBorderStyle.FixedDialog, StartPosition = FormStartPosition.CenterParent,
            MaximizeBox = false, MinimizeBox = false, ClientSize = new Size(520, 300), Font = owner.Font,
        };
        var repo = new TextBox { Text = settings.UpdateRepo, Left = 16, Top = 36, Width = 488 };
        var token = new TextBox { Left = 16, Top = 96, Width = 488, UseSystemPasswordChar = true, PlaceholderText = Token is null ? "(kiritilmagan)" : "(saqlangan — o'zgartirish uchun yangisini kiriting)" };
        var auto = new CheckBox { Text = "Ishga tushganda yangilanishni tekshirish", Left = 16, Top = 134, Width = 480, Checked = settings.AutoCheckUpdates };
        var restore = new CheckBox { Text = "Oxirgi ochiq tablarni keyingi ishga tushishda tiklash", Left = 16, Top = 162, Width = 480, Checked = settings.RestoreTabs };
        var clear = new CheckBox { Text = "Saqlangan tokenni o'chirish", Left = 16, Top = 190, Width = 480 };
        var hint = new Label
        {
            Left = 16, Top = 218, Width = 488, Height = 40, ForeColor = Color.DimGray,
            Text = "Token faqat repozitoriy yopiq (private) bo'lganda kerak: GitHub → Settings → Fine-grained token → Contents: Read-only. Token shu kompyuterda shifrlangan holda saqlanadi.",
        };
        var ok = new Button { Text = "Saqlash", Left = 324, Top = 262, Width = 85, DialogResult = DialogResult.OK };
        var cancel = new Button { Text = "Bekor", Left = 419, Top = 262, Width = 85, DialogResult = DialogResult.Cancel };
        dlg.Controls.AddRange(new Control[]
        {
            new Label { Text = "GitHub repozitoriy (egasi/nomi):", Left = 16, Top = 14, AutoSize = true }, repo,
            new Label { Text = "GitHub token (ixtiyoriy, yopiq repozitoriy uchun):", Left = 16, Top = 74, AutoSize = true }, token,
            auto, restore, clear, hint, ok, cancel,
        });
        dlg.AcceptButton = ok;
        dlg.CancelButton = cancel;
        if (dlg.ShowDialog(owner) != DialogResult.OK) return;

        var r = repo.Text.Trim();
        if (!UpdateChecker.IsValidRepo(r)) { Warn("Repozitoriy nomi «egasi/nomi» ko'rinishida bo'lsin."); return; }
        settings.UpdateRepo = r;
        settings.AutoCheckUpdates = auto.Checked;
        settings.RestoreTabs = restore.Checked;
        if (clear.Checked) Token = null;
        else if (token.Text.Trim().Length > 0) Token = token.Text;
        settings.Save();
    }
}

public enum UpdateChoice { None, Install, Skip, OpenPage }

/// <summary>"Yangi versiya mavjud" oynasi: o'zgarishlar ro'yxati va tanlov.</summary>
public sealed class UpdateDialog : Form
{
    public UpdateChoice Choice { get; private set; } = UpdateChoice.None;

    public UpdateDialog(UpdateInfo u, Version current, bool canAutoInstall)
    {
        Text = "Ishonch — yangi versiya";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        StartPosition = FormStartPosition.CenterParent;
        MaximizeBox = MinimizeBox = false;
        ClientSize = new Size(560, 360);
        Font = new Font("Segoe UI", 9.5f);

        var head = new Label
        {
            Left = 16, Top = 14, Width = 528, Height = 48, Font = new Font("Segoe UI", 12f, FontStyle.Bold),
            Text = $"Yangi versiya mavjud: {AppInfo.Format(u.Version)}\n(hozirgi: {AppInfo.Format(current)})",
        };
        var notes = new TextBox
        {
            Left = 16, Top = 70, Width = 528, Height = 220, Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical,
            Text = string.IsNullOrWhiteSpace(u.Notes) ? "(O'zgarishlar tavsifi yo'q.)" : u.Notes.Replace("\r\n", "\n").Replace("\n", "\r\n"),
        };
        var note = new Label
        {
            Left = 16, Top = 296, Width = 528, Height = 20, ForeColor = Color.DimGray,
            Text = canAutoInstall ? "Ma'lumotlaringiz (loginlar, sozlamalar, ochiq tablar) saqlanadi." : "Bu nusxa avtomatik yangilanmaydi — release sahifasidan yuklab oling.",
        };

        var install = new Button { Text = "Hozir yangilash", Left = 16, Top = 322, Width = 140, Height = 30, Enabled = canAutoInstall };
        var later = new Button { Text = "Keyinroq", Left = 164, Top = 322, Width = 100, Height = 30, DialogResult = DialogResult.Cancel };
        var skip = new Button { Text = "Bu versiyani o'tkazish", Left = 272, Top = 322, Width = 170, Height = 30 };
        var page = new Button { Text = "Sahifa", Left = 450, Top = 322, Width = 94, Height = 30 };
        install.Click += (_, _) => { Choice = UpdateChoice.Install; DialogResult = DialogResult.OK; };
        skip.Click += (_, _) => { Choice = UpdateChoice.Skip; DialogResult = DialogResult.OK; };
        page.Click += (_, _) => { Choice = UpdateChoice.OpenPage; DialogResult = DialogResult.OK; };
        Controls.AddRange(new Control[] { head, notes, note, install, later, skip, page });
        AcceptButton = canAutoInstall ? install : page;
        CancelButton = later;
    }
}

/// <summary>Yuklash jarayoni oynasi (bekor qilish mumkin).</summary>
public sealed class ProgressDialog : Form
{
    readonly Label label = new() { Left = 16, Top = 16, Width = 388, Height = 24 };
    readonly ProgressBar bar = new() { Left = 16, Top = 46, Width = 388, Height = 20, Minimum = 0, Maximum = 1000 };
    readonly CancellationTokenSource cts = new();

    public CancellationToken Token => cts.Token;

    public ProgressDialog(string text)
    {
        Text = "Ishonch — yangilanish";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        StartPosition = FormStartPosition.CenterParent;
        MaximizeBox = MinimizeBox = ControlBox = false;
        ClientSize = new Size(420, 120);
        Font = new Font("Segoe UI", 9.5f);
        label.Text = text;
        var cancel = new Button { Text = "Bekor qilish", Left = 304, Top = 80, Width = 100 };
        cancel.Click += (_, _) => { cts.Cancel(); cancel.Enabled = false; };
        Controls.AddRange(new Control[] { label, bar, cancel });
    }

    public void Report(double fraction)
    {
        bar.Value = (int)Math.Clamp(fraction * 1000, 0, 1000);
        label.Text = $"Yuklanmoqda… {fraction:P0}";
    }

    public void SetText(string text) => label.Text = text;

    protected override void Dispose(bool disposing)
    {
        if (disposing) cts.Dispose();
        base.Dispose(disposing);
    }
}
