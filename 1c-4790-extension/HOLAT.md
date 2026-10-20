# 1C 4790 to'ldiruvchi — ish holati (20.10.2026, 17:00)

Chrome extension (Manifest V3): «ОСВ по счету 4790» dagi qizil qoldiqlarni o'qiydi va
«Операция (введенная вручную)» ga har bir xodim uchun qator yozadi. «Записать/Провести» ni hech qachon o'zi bosmaydi.
Server: http://tas-1cbuxapp-01/TestDB11/ (test baza). Joriy versiya: **v1.6.1** (MacBook: /Users/me/Projects/ishonchproject/1c-4790-extension).

## Fayllar
- `manifest.json` — ruxsatlar: debugger, storage; host: http://tas-1cbuxapp-01/*
- `background.js` — chrome.debugger (CDP) orqali haqiqiy sichqoncha/klaviatura bosishlari
- `content.js` — ОСВ o'qish + to'ldirish mantig'i + panel
- `panel.css`, `README.txt` (o'rnatish yo'riqnomasi — hali v1.0 matni)

## Tayyor va TASDIQLANGAN
1. **ОСВ o'qish** (haqiqiy sahifada sinalgan). Hisobot 1C'da «moxel» iframe'larida `R{n}C{m}` div-kataklar bilan chiziladi;
   ustunlar «Дебет/Кредит» sarlavhasi joylashuvi bo'yicha, bo'lim qatorlari RANGI bo'yicha (4790 qatori bilan bir xil yashil) aniqlanadi.
   Natija: 5 qizil xodim, jami 8 018 909,00 = ОСВ «Total».
2. Raqam formati: `1 080 000,00` ham, `1,080,000.00` ham to'g'ri o'qiladi.

## 1C'da qo'lda sinab topilgan qoidalar (o'z brauzerimda)
- Jadval virtual: faqat ko'rinayotgan qatorlar chiziladi, `rowindex` = ekrandagi tartib. Qatorni **# ustunidagi raqam** bo'yicha topish kerak.
- «Copy» (F9 / More actions → Copy): yangi qator OXIRIGA qo'shiladi, Счет Дт tahrirga ochiladi.
- «Add»: yangi bo'sh qator, Счет Дт bo'sh holda tahrirga ochiladi. `4790` yozilganda ro'yxatda «4790 (Расчеты по прочим операциям)» chiqadi.
- Tab tartibi: Счет Дт → Подразделение Дт → Работник (Субконто Дт1) → Счет Кт → …
- Ma'lumotnoma maydonlari (bo'lim, xodim): sintetik JS kiritishni 1C QABUL QILMAYDI; haqiqiy tugma bosishlari kerak.
  Yozilgach #editDropDown ro'yxatida qidiruv natijasi chiqadi (masalan «SHAMSUTDINOV BAXROM BAXODIROVICH (00-0000162)»).
  **XAVF:** maydon ochilganda ro'yxatda TARIXdagi oldingi tanlovlar turadi; ko'r-ko'rona Tab bosilsa o'sha (boshqa odam) tanlanadi.
  Shuning uchun: nomi aynan mos element chiqquncha kutib, O'SHA elementni bosish kerak.
- Summa maydoni: raqamlar bittalab bosilsa ishlaydi (bir yo'la joylash ishlamaydi). Tab'dan keyin Сумма НУ Дт/Кт ni 1C o'zi to'ldiradi.
- Кт kontragent maydoni tahrirga ochilsa ro'yxatda boshqa firmalar chiqadi — tasodifan Tab/Enter bosilmasin (Escape xavfsiz).

## v1.3 dagi to'ldirish (hozirgi kod)
Namuna 4790 qatori tanlanadi → F9 → Tab → bo'lim (pickRef) → Tab → xodim (pickRef) → summa katagi 2x bosish → raqamlar → Tab → tekshiruv.
Xato bo'lsa yangi qator o'chiriladi. Keyingi xodim uchun oxirgi yangi qatordan nusxa olinadi.
**Foydalanuvchining Chrome'ida v1.3 hali sinalmagan.**

## v1.4 (20.10.2026, 17:10) — ADD usuli yozildi, SINALMAGAN
- Panel: «Кт namunasini olish» — tanlangan haqiqiy 4790 qatoridan Кт tomonini (hisob, bo'lim, subkonto 1–3) o'qib, chrome.storage'ga saqlaydi; panelda tahrirlanadi.
- Кт namunasi bor bo'lsa → ADD usuli: Add → 4790 → Tab → bo'lim → Tab → xodim → Tab → Кт hisob → bo'lim → subkontolar → summa → to'liq tekshiruv (Дт+Кт+summa); xato bo'lsa qator o'chiriladi.
- Кт namunasi yo'q bo'lsa → eski NUSXA usuli.
- `tabTo()` keyingi kerakli maydonga Tab bilan boradi (max 4 Tab) — Кт maydonlarining haqiqiy Tab tartibi 1C'da TEKSHIRILISHI kerak.
- Dropdown solishtiruvi: «"Farg'ona Ishonch Savdo" МЧЖ (выручка)» kabi qavsli nomlar uchun to'liq matn ham solishtiriladi.

## v1.4.1 → v1.6.1 (20.10.2026, 17:05–17:18)
- 1.4.1: Mac'da belgilash Cmd+A (+ CDP `commands: ["selectAll"]` va DOM `input.select()`).
- 1.4.2: login'dan keyin 1C <body> ni qayta chizadi — panel yo'qolardi; endi tekshirib qayta quriladi. Sahifa oldin ochilgan bo'lsa ikonka content.js ni o'zi yuklaydi (`scripting` ruxsati).
- 1.5: tez yozish — matn `Input.insertText` bilan bir yo'la, oxirgi belgi haqiqiy tugma (1C qidiruvi uchun); yozilgan qiymat tekshiriladi («4710» kabi xato bo'lsa qayta yoziladi). Summa raqamlari kechikishsiz.
- 1.5.1: Кт maydonlari Tab bilan emas, katakni 2x bosib ochiladi (ro'yxat elementi bosilgach 1C tahrirni yopadi, Tab ishonchsiz edi) — foydalanuvchi «kredit ustunlarini to'ldirmayapti» degan.
- 1.6: Кт tomoni AVTOMATIK — ochiq Операция'dagi istalgan to'liq 4790 qatoridan o'qiladi va eslab qolinadi (tugma shart emas). To'ldirish paytida yangilanmaydi.
- 1.6.1: Escape faqat jadval katagi tahrirda bo'lsa bosiladi — tahrirdan tashqari Escape 1C'da HUJJAT OYNASINI YOPARDI (foydalanuvchi: «saqlashni so'ramasdan chiqib ketyapti»). Oxirida hujjat ochiq qoladi, saqlash buxgalterda.
- Foydalanuvchi talabi: bir paytda bir nechta qatorni to'ldirish — 1C bitta katak tahririga ruxsat beradi, shuning uchun ketma-ket, lekin tez.

## QOLGAN ISHLAR (foydalanuvchi talablari)
1. **Asosiy usul — «Add»** (foydalanuvchi: «doim Add qilib yaratiladi», yangi oy hujjatida 4790 qatori bo'lmaydi).
   Add → 4790 → Tab → bo'lim → Tab → xodim → Tab → **Кт tomonini ham to'ldirish**: 4010 / Основное подразделение /
   «"Farg'ona Ishonch Savdo" МЧЖ (выручка)» / «Основной договор» → summa.
   Кт qiymatlari TAXMIN QILINMAYDI: har firma uchun haqiqiy qatordan olib panelda saqlash (masalan «Namunani eslab qolish» tugmasi,
   chrome.storage'da firma bo'yicha) yoki foydalanuvchi panelda kiritadi.
   Add'dan keyingi Кт maydonlarining Tab tartibini hali sinash kerak.
2. **«Show all»**: nom qisqa ro'yxatda chiqmasa — Show all oynasini ochib, o'sha yerdan qidirib tanlash. Oyna tuzilishi hali o'rganilmagan
   (bir urinishda ochilmadi). Hozircha kod to'xtab, ro'yxatda nima borligini yozadi.
3. README.txt ni yangi tartibga moslab yangilash.
4. Kelajak g'oyasi: o'z WebView2 (C#) «kichik brauzer» ilovasi — bir nechta 1C avtomatlashtirish modullari bilan.

## Eslatma
- Bu server Claude brauzer panelida «yuqori xavfli» — har bir amalga alohida ruxsat so'raladi.
- Sinov hujjatlari doim SAQLANMASDAN yopilgan («No»). 31.01.2026 hujjati summasi 9 115 636 833,30 — o'zgarmagan.
- Windows'dagi papka: D:\extension\1c-4790-extension. MacBook'da foydalanuvchi boshqa papka beradi.
