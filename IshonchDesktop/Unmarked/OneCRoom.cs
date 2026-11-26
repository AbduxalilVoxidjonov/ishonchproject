using System.Globalization;
using System.Runtime.CompilerServices;
using System.Text.Json;
using IshonchDesktop.Models;
using Microsoft.Web.WebView2.Core;

namespace IshonchDesktop.Unmarked;

/// <summary>
/// 1C sahifasiga avtomatika uchun yetarli joy beradi. Oyna kichik, masshtab katta yoki yonda panel ochiq bo'lsa 1C ustun va
/// tugmalarni yashiradi («Еще» ga yig'adi) — dastur ularni topa olmaydi. Shuning uchun ish paytida sahifa kamida
/// <see cref="MinWidth"/>×<see cref="MinHeight"/> CSS pikselda chiziladi va oynaga kichraytirib sig'diriladi (DevTools
/// emulyatsiyasi); joy yetarli bo'lsa — hech narsa qilinmaydi. Oyna o'lchami yoki masshtab o'zgarsa qayta moslanadi.
/// Bosish koordinatalari OneCDriver / content.js da haqiqiy sichqoncha harakati bilan qayta o'lchanadi.
/// Avtomatika to'xtagach (bir necha soniya murojaat bo'lmasa, ushlab turilmagan bo'lsa) sahifa asl holatiga qaytariladi.
/// </summary>
public static class OneCRoom
{
    public const int MinWidth = 1360;
    public const int MinHeight = 680;
    static readonly TimeSpan IdleRelease = TimeSpan.FromSeconds(12);

    sealed class State
    {
        public bool Active;
        public int Held;
        public bool Fixed;
        public DateTime LastUse;
        public string Applied = "";
        public Func<(double W, double H)?>? RealSize;
        public System.Windows.Forms.Timer? Timer;
    }

    static readonly ConditionalWeakTable<CoreWebView2, State> States = new();

    /// <summary>
    /// Sahifaning haqiqiy joyi (CSS pikselda, emulyatsiyasiz): WebView2 boshqaruvchisi o'lchami / (DPI × masshtab).
    /// Berilmasa sahifadan so'raladi (emulyatsiya yo'q paytdagina to'g'ri).
    /// </summary>
    public static void Register(CoreWebView2 core, Func<(double W, double H)?> realSize) => States.GetOrCreateValue(core).RealSize = realSize;

    /// <summary>Sahifaga murojaat qilindi (avtomatika hali ishlayapti) — qaytarish kechiktiriladi.</summary>
    public static void Touch(CoreWebView2 core)
    {
        if (States.TryGetValue(core, out var s)) s.LastUse = DateTime.UtcNow;
    }

    /// <summary>Uzoq ish (masalan Markirovkali chek paneli ochiq) davomida joy qaytarilmasin.</summary>
    public static void Hold(CoreWebView2 core, bool on)
    {
        var s = States.GetOrCreateValue(core);
        s.Held = Math.Max(0, s.Held + (on ? 1 : -1));
        s.LastUse = DateTime.UtcNow;
    }

    /// <summary>
    /// Yon panel ochiq: 1C sahifasi doim bir xil kenglikda (<see cref="MinWidth"/> CSS piksel) chizilib, oynaga sig'diriladi —
    /// har kompyuterda (ekran, DPI, foydalanuvchi masshtabi qanday bo'lmasin) 1C bir xil joylashadi va panel yopilguncha qotib turadi.
    /// </summary>
    public static async Task FixAsync(CoreWebView2 core, bool on)
    {
        var s = States.GetOrCreateValue(core);
        if (s.Fixed == on) return;
        s.Fixed = on;
        Hold(core, on);
        s.Applied = "";
        if (on) await EnsureAsync(core);
        else if (s.Held == 0) await ReleaseAsync(core);
        else await EnsureAsync(core);
    }

    /// <summary>
    /// Qotirilgan rejim uchun emulyatsiya: kenglik doim <see cref="MinWidth"/>, koeffitsiyent = haqiqiy kenglik / MinWidth
    /// (0.4–1.0, kattalashtirilmaydi); balandlik oynani to'liq egallaydi (kamida <see cref="MinHeight"/>). Juda past oynada balandlik bo'yicha kichraytiriladi.
    /// </summary>
    public static (int Width, int Height, double Scale)? PlanFixed(double w, double h)
    {
        if (w <= 0 || h <= 0) return null;
        var scale = Math.Round(Math.Clamp(Math.Min(w / MinWidth, h / MinHeight), 0.4, 1.0), 4);
        return (Math.Max(MinWidth, (int)Math.Floor(w / scale)), Math.Max(MinHeight, (int)Math.Floor(h / scale)), scale);
    }

    /// <summary>Oyna o'lchami / masshtab o'zgardi: moslash yoqilgan bo'lsa qayta hisoblanadi.</summary>
    public static async Task OnResizedAsync(CoreWebView2 core)
    {
        // Moslash yoqilgan, ushlab turilgan yoki avtomatika hozirgina ishlagan bo'lsa (ish paytida oyna kichraytirildi)
        if (States.TryGetValue(core, out var s) && (s.Active || s.Held > 0 || DateTime.UtcNow - s.LastUse < IdleRelease)) await EnsureAsync(core);
    }

    /// <summary>Boshqa kod emulyatsiyani o'chirgan bo'lsa (masalan hisobotni o'qish) — moslashni qayta qo'yadi.</summary>
    public static async Task RestoreAsync(CoreWebView2 core)
    {
        if (!States.TryGetValue(core, out var s) || !s.Active) return;
        s.Applied = "";
        await EnsureAsync(core);
    }

    /// <summary>
    /// Haqiqiy joy (w, h) uchun kerakli emulyatsiya: null — joy yetarli (emulyatsiya kerak emas); aks holda chiziladigan
    /// o'lcham va kichraytirish koeffitsiyenti (chizilgan sahifa oynaga to'liq sig'adi).
    /// </summary>
    public static (int Width, int Height, double Scale)? Plan(double w, double h)
    {
        if (w <= 0 || h <= 0 || (w >= MinWidth && h >= MinHeight)) return null;
        var scale = Math.Round(Math.Min(w / Math.Max(w, MinWidth), h / Math.Max(h, MinHeight)), 4);
        // Kichraytirilgan sahifa oynani to'liq egallasin: chiziladigan o'lcham = oyna / koeffitsiyent
        return (Math.Max(MinWidth, (int)Math.Floor(w / scale)), Math.Max(MinHeight, (int)Math.Floor(h / scale)), scale);
    }

    /// <summary>Joy yetarli bo'lmasa — sahifani kattaroq chizib oynaga sig'diradi; yetarli bo'lsa asl holatga qaytaradi.</summary>
    public static async Task EnsureAsync(CoreWebView2 core)
    {
        var s = States.GetOrCreateValue(core);
        s.LastUse = DateTime.UtcNow;
        try
        {
            // Faqat 1C veb-mijozi sahifasida (CRM va boshqa saytlarga tegilmaydi)
            var raw = await core.ExecuteScriptAsync(
                "innerWidth + '|' + innerHeight + '|' + (document.getElementById('openedCell_cont') || document.querySelector('[id^=\"themesCell_theme_\"]') ? 1 : 0)");
            var parts = raw.Trim('"').Split('|');
            if (parts.Length != 3 || parts[2] != "1") return;
            (double W, double H)? real = s.RealSize?.Invoke();
            if (real is null)
            {
                if (s.Active) return; // emulyatsiya ostida sahifa o'lchami haqiqiy emas
                real = (double.Parse(parts[0], CultureInfo.InvariantCulture), double.Parse(parts[1], CultureInfo.InvariantCulture));
            }
            var plan = s.Fixed ? PlanFixed(real.Value.W, real.Value.H) : Plan(real.Value.W, real.Value.H);
            if (plan is null)
            {
                if (s.Active) await ReleaseAsync(core);
                return;
            }
            var (tw, th, scale) = plan.Value;
            var sig = $"{tw}x{th}@{scale}";
            if (s.Active && s.Applied == sig) return;
            await core.CallDevToolsProtocolMethodAsync("Emulation.setDeviceMetricsOverride",
                JsonSerializer.Serialize(new { width = tw, height = th, deviceScaleFactor = 0, mobile = false, scale }));
            s.Active = true;
            s.Applied = sig;
            // Sahifa yangi o'lchamda qayta chizilguncha kutiladi — aks holda keyingi bosish eski koordinata nisbati bilan ketadi
            for (var i = 0; i < 20; i++)
            {
                var now = (await core.ExecuteScriptAsync("innerWidth")).Trim('"');
                if (double.TryParse(now, NumberStyles.Float, CultureInfo.InvariantCulture, out var iw) && Math.Abs(iw - tw) <= 2) break;
                await Task.Delay(50);
            }
            if (!s.Fixed) Log.Write($"1C oynasi kichik ({real.Value.W:0}×{real.Value.H:0}): sahifa {tw}×{th} chizilib {scale:0.00} ga kichraytirildi");
            if (s.Timer is null)
            {
                s.Timer = new System.Windows.Forms.Timer { Interval = 2000 };
                s.Timer.Tick += async (_, _) =>
                {
                    if (s.Active && s.Held == 0 && DateTime.UtcNow - s.LastUse >= IdleRelease) await ReleaseAsync(core);
                };
            }
            s.Timer.Start();
        }
        catch (Exception e) { Log.Error("1C oyna o'lchamini moslash", e); }
    }

    /// <summary>Sahifani asl o'lchamiga qaytaradi.</summary>
    public static async Task ReleaseAsync(CoreWebView2 core)
    {
        if (!States.TryGetValue(core, out var s) || !s.Active) return;
        s.Active = false;
        s.Applied = "";
        s.Timer?.Stop();
        try { await core.CallDevToolsProtocolMethodAsync("Emulation.clearDeviceMetricsOverride", "{}"); }
        catch { /* sahifa yopilgan */ }
    }
}
