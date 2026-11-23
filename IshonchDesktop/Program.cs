using System.Security.Cryptography;
using System.Text;
using IshonchDesktop.Models;
using IshonchDesktop.UI;

namespace IshonchDesktop;

static class Program
{
    [STAThread]
    static void Main()
    {
        // Kutilmagan xatolar: Windows'ning «Continue/Quit» oynasi o'rniga jurnalga (va xatolar yig'uvchiga) yoziladi,
        // dastur ishlashda davom etadi
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_, e) => OnUiError(e.Exception);
        AppDomain.CurrentDomain.UnhandledException += (_, e) =>
        {
            if (e.ExceptionObject is Exception ex) Log.Error("Kutilmagan xato (fon)", ex);
        };

        // Bitta nusxa (ma'lumotlar papkasi bo'yicha): dastur ✕ dan keyin tray'da qolishi mumkin — qayta ishga tushirilsa
        // ikkinchi nusxa ochilmaydi (bir xil sozlama fayllari va brauzer profillariga ikki nusxa yozmasin), ishlab turgani ko'rsatiladi
        var id = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Paths.AppData.ToLowerInvariant())))[..16];
        using var mutex = new Mutex(false, @"Local\Ishonch-" + id);
        using var show = new EventWaitHandle(false, EventResetMode.AutoReset, @"Local\Ishonch-show-" + id);
        var owned = false;
        try { owned = mutex.WaitOne(0); } catch (AbandonedMutexException) { owned = true; }
        if (!owned)
        {
            show.Set(); // ishlab turgan nusxa oynasini ochadi
            // Yangilanishdan keyingi qayta ishga tushirishda eski nusxa hali yopilayotgan bo'ladi: u chiqquncha biroz kutiladi
            try { owned = mutex.WaitOne(6000); } catch (AbandonedMutexException) { owned = true; }
            if (!owned) return;
            show.Reset();
        }
        try
        {
            ApplicationConfiguration.Initialize();
            var form = new MainForm();
            var stop = new CancellationTokenSource();
            var listener = new Thread(() =>
            {
                while (WaitHandle.WaitAny(new[] { show, stop.Token.WaitHandle }) == 0)
                {
                    try { if (form.IsHandleCreated && !form.IsDisposed) form.BeginInvoke(() => ShowMain(form)); }
                    catch { /* oyna yopilmoqda */ }
                }
            }) { IsBackground = true, Name = "single-instance" };
            listener.Start();
            Application.Run(form);
            stop.Cancel();
        }
        finally { mutex.ReleaseMutex(); }
    }

    /// <summary>Yashirilgan (tray) yoki yig'ilgan oynani oldinga chiqaradi.</summary>
    static void ShowMain(Form form)
    {
        form.Show();
        if (form.WindowState == FormWindowState.Minimized) form.WindowState = FormWindowState.Normal;
        form.Activate();
    }

    static bool showing;

    static void OnUiError(Exception ex)
    {
        Log.Error("Kutilmagan xato (oyna)", ex);
        // Jadvalning o'z hodisasi ichidagi qayta kirish (DataGridView SetCurrentCellAddressCore) — zararsiz, jim o'tkaziladi
        if (ex is InvalidOperationException && ex.Message.Contains("SetCurrentCellAddressCore")) return;
        if (showing) return;
        showing = true;
        try
        {
            MessageBox.Show("Kutilmagan xato: " + ex.Message + "\n\nDastur ishlashda davom etadi. Xato jurnalga yozildi.",
                AppInfo.DisplayName, MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
        finally { showing = false; }
    }
}
