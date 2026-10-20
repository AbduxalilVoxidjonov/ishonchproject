'use strict';
// Bitta login bilan tezkor tekshiruv: node test/probe.js <login> <parol>
const { makeClient } = require('../src/het');
(async () => {
  const [login, password] = process.argv.slice(2);
  if (!login || !password) { console.log('Foydalanish: node test/probe.js <login> <parol>'); process.exit(1); }
  const c = makeClient({ retries: 0 });
  try {
    const s = await c.login(login, password);
    console.log('Kirish: OK (coato:', s.coato + ')');
    const d = await c.fetchAccount(s);
    console.log('Hisob-faktura qatorlari:', (d.calc.items || []).length, '| hisoblagich qatorlari:', (d.calc.items || []).filter((x) => /Сч\./.test(x.name)).length);
    console.log("Chiqish qoldig'i (so'm):", d.period && d.period.balance ? d.period.balance.totalBalanceOut / 100 : '—');
  } catch (e) {
    console.log('XATO:', e.status || '', e.message);
    process.exit(2);
  }
})();
