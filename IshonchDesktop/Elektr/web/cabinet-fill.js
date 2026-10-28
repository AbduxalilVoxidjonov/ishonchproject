// cabinet.het.uz kirish formasini avtomatik to'ldiradi (bir marta). Login/parol C# tomonidan qo'yiladi va
// faqat shu funksiya ichida turadi; sahifaning o'z skriptlari ularga kira olmaydi.
(() => {
  const LOGIN = __LOGIN__;
  const PASS = __PASS__;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const visible = (e) => !!e && e.offsetParent !== null;
  const setValue = (el, value) => {
    // Angular formalari qiymatni "input" hodisasidan oladi: oddiy el.value = ... yetarli emas
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  (async () => {
    const end = Date.now() + 25000;
    while (Date.now() < end) {
      const form = document.querySelector('form.auth-login-form') || document.querySelector('form');
      const pass = form && [...form.querySelectorAll('input[type=password]')].find(visible);
      if (pass) {
        // API yuridik iste'molchilar uchun: avval "Yuridik iste'molchi" tabi tanlanadi
        const legal = [...document.querySelectorAll('a.nav-link,[role=tab]')].find((a) => /yuridik|юридик|legal/i.test(a.textContent));
        if (legal && !legal.classList.contains('active')) { legal.click(); await sleep(700); continue; }

        const user = [...form.querySelectorAll('input')].find((i) => i !== pass && visible(i) && /^(text|tel|email|)$/.test(i.type));
        if (user) {
          user.focus(); setValue(user, LOGIN);
          pass.focus(); setValue(pass, PASS);
          await sleep(350);
          const btn = [...form.querySelectorAll('button')].find((b) => b.type === 'submit' && /kirish|вход|войти|login/i.test(b.textContent))
            || form.querySelector('button.btn-primary');
          if (btn && !btn.disabled) { btn.click(); return; }
        }
      }
      await sleep(300);
    }
  })();
})();
