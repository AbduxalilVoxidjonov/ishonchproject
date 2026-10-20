'use strict';
// Login so'rovi qaysi shaklda qabul qilinishini aniqlash: node test/probe-login.js <login> <parol>
// Bir nechta ehtimoliy maydon nomlarini sinab, server javobini (status + xabar) chiqaradi. Parol ekranga chiqmaydi.
const { API } = require('../src/het');
(async () => {
  const [u, p] = process.argv.slice(2);
  if (!u || !p) { console.log('Foydalanish: node test/probe-login.js <login> <parol>'); process.exit(1); }
  const variants = {
    'login/password': { login: u, password: p },
    'login/password': { login: u, password: p },
    'userName/password': { userName: u, password: p },
    'phone/password': { phone: u, password: p },
    'username/password+type': { username: u, password: p, type: 'LEGAL' },
  };
  for (const [name, body] of Object.entries(variants)) {
    try {
      const r = await fetch(API + '/user-login', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', lang: 'uz', 'Coato-Code': '33401' }, body: JSON.stringify(body) });
      const t = await r.text();
      let j = null; try { j = JSON.parse(t); } catch {}
      console.log(name.padEnd(26), r.status, j && j.accessToken ? 'TOKEN KELDI ✅' : t.slice(0, 200));
    } catch (e) { console.log(name.padEnd(26), 'tarmoq xatosi:', e.message); }
  }
})();
