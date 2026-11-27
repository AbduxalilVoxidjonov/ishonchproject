using IshonchDesktop.Models;
using IshonchDesktop.UI;
using Microsoft.Web.WebView2.Core;

namespace IshonchDesktop.Marking;

/// <summary>
/// my.soliq.uz kirish sahifasida firmaning ERI kalitini o'zi tanlaydi: «Юридик шахс» bo'limi ochiladi, E-IMZO kalitlari
/// ro'yxatidan shu firma STIR i yozilgan kalit belgilanadi va «ЭРИ билан кириш» bosiladi — E-IMZO parol oynasi chiqadi,
/// parolni foydalanuvchi o'zi kiritadi (dastur parolga tegmaydi). Har sahifa yuklanishida bir marta: parol noto'g'ri bo'lsa
/// yoki kalit topilmasa aylanib qolmaydi.
/// </summary>
public static class SoliqLogin
{
    public static void Attach(WebTab tab, string stir)
    {
        var digits = new string((stir ?? "").Where(char.IsDigit).ToArray());
        if (digits.Length < 9) return;
        _ = AttachAsync(tab, digits);
    }

    static async Task AttachAsync(WebTab tab, string stir)
    {
        await tab.Ready;
        if (tab.Core is not { } core) return;
        core.NavigationCompleted += async (_, e) =>
        {
            if (!e.IsSuccess || !(core.Source ?? "").Contains("my.soliq.uz/login", StringComparison.OrdinalIgnoreCase)) return;
            try
            {
                var raw = await core.CallDevToolsProtocolMethodAsync("Runtime.evaluate",
                    System.Text.Json.JsonSerializer.Serialize(new { expression = Script(stir), awaitPromise = true, returnByValue = true }));
                using var doc = System.Text.Json.JsonDocument.Parse(raw);
                var result = doc.RootElement.TryGetProperty("result", out var r) && r.TryGetProperty("value", out var v) ? v.ToString() : raw;
                Log.Write($"my.soliq.uz kirish: {stir} kaliti — {result}");
            }
            catch (Exception ex) { Log.Write("my.soliq.uz kirish skripti: " + ex.Message); }
        };
    }

    /// <summary>
    /// Sahifada ishlaydi: kalitlar ro'yxati (E-IMZO dan) 30 soniyagacha kutiladi; STIR yozilgan eng kichik bosiladigan element
    /// topilib bosiladi, so'ng kirish tugmasi. Natija matni jurnalga yoziladi (topilmadi / tanlandi).
    /// </summary>
    static string Script(string stir) => $$"""
        (async () => {
          if (window.__ishSoliqKey) return 'allaqachon';
          window.__ishSoliqKey = true;
          const stir = '{{stir}}';
          const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
          const sleep = ms => new Promise(r => setTimeout(r, ms));
          const txt = e => (e.textContent || '').replace(/\s+/g, ' ').trim();
          // «Юридик шахс» bo'limi
          // Sayt lotin yozuvini «ş» bilan chiqaradi (Yuridik şaxs, Kiriş) — ikkala yozuv ham qabul qilinadi
          const tabBtn = [...document.querySelectorAll('button, a, div[role=tab], li')].find(e => vis(e) && /^(Юридик шахс|Yuridik (sh|ş)axs|Юридическое лицо)$/i.test(txt(e)));
          if (tabBtn && !/active|selected/.test(tabBtn.className)) { tabBtn.click(); await sleep(800); }
          // my.soliq.uz: har kalit alohida kartochka (KeyCard: «Tashkilot STIRi …» va o'z «Kiriş» tugmasi) — shu STIR li
          // kartochkaning tugmasi bosiladi, E-IMZO parol oynasi chiqadi
          const loginRe = /^(Кириш|Kirish|Kiriş|Войти|ЭРИ билан кириш|ERI bilan kirish|ERI bilan kiriş|Войти с ЭЦП)$/i;
          for (let i = 0; i < 60; i++) {
            const inn = [...document.querySelectorAll('[class*=KeyCard_inn], [class*=key-card] p')].find(e => vis(e) && e.textContent.replace(/\D/g, '').includes(stir));
            const card = inn && inn.closest('[class*=key-card]'); // KeyCard_key-card__… (KeyCard_inn emas)
            const cardBtn = card && [...card.querySelectorAll('button')].find(b => vis(b) && !b.disabled && loginRe.test(txt(b)));
            if (cardBtn) { cardBtn.click(); return 'kalit tanlandi, parol so‘ralmoqda'; }
            if (document.querySelectorAll('[class*=key-card]').length > 0 && i > 6) break; // kartochkalar bor, lekin bu STIR yo'q
            await sleep(500);
          }
          // Kalit: STIR raqami yozilgan, ichida boshqa STIR li kalit bo'lmagan eng kichik ko'rinadigan element
          let key = null;
          for (let i = 0; i < 60 && !key; i++) {
            const all = [...document.querySelectorAll('li, label, tr, div, a, button')].filter(e => vis(e) && txt(e).replace(/\D/g, ' ').split(' ').includes(stir));
            key = all.filter(e => !all.some(o => o !== e && e.contains(o))).sort((a, b) => txt(a).length - txt(b).length)[0] || null;
            if (!key) await sleep(500);
          }
          if (!key) return 'kalit topilmadi (E-IMZO da ' + stir + ' STIR li kalit yo‘qmi?)';
          const clickable = key.closest('li, label, tr, [role=option], [role=button], button, a') || key;
          const radio = clickable.querySelector('input[type=radio], input[type=checkbox]');
          (radio || clickable).click();
          await sleep(600);
          // Kirish tugmasi — faqat <button> (sahifadagi «Кабинетга кириш» havolasi kabi linklar bosilmaydi), kalit ro'yxati
          // turgan qismdagi va matni «кириш / kirish / войти» bo'lgan. Kalit bosilganda parol oynasi o'zi chiqqan bo'lsa — tugma kerak emas
          const area = clickable.closest('form, section, [class*=card], [class*=login], [class*=auth]') || document.body;
          const btn = [...area.querySelectorAll('button')].find(e => vis(e) && !e.disabled && loginRe.test(txt(e)));
          if (!btn) return 'kalit tanlandi (kirish tugmasini bosing, agar parol oynasi chiqmagan bo‘lsa)';
          btn.click();
          return 'kalit tanlandi, parol so‘ralmoqda';
        })()
        """;
}
