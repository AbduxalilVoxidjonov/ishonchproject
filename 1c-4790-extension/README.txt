1C 4790 TO'LDIRUVCHI — Chrome extension
=======================================

Nima qiladi
-----------
1. «ОСВ по счету 4790» hisobotidan qizil (minus) qoldiqli xodimlarni o'qiydi:
   bo'lim, F.I.Sh., summa.
2. «Операция (введенная вручную)»da siz tanlagan namuna 4790 qatoridan F9 bilan
   nusxa oladi. Shunday qilib Кт tomoni (4010 / bo'lim / firmaning o'zi «(выручка)» /
   shartnoma) har bir firmada o'zinikidek ko'chadi, taxmin qilinmaydi.
3. Har bir xodim uchun yangi qatorda Подразделение Дт, xodim va summani yozadi.
   Agar namuna qatorda Сумма НУ summaga teng bo'lsa, НУ Дт/Кт ni ham summaga teng qiladi.
4. Har bir qatordan keyin natijani tekshiradi. Mos kelmasa — to'xtaydi.
5. HECH QACHON «Записать» yoki «Провести»ni bosmaydi — buni siz qilasiz.

O'rnatish (bir marta)
---------------------
1. Arxivni papkaga oching (masalan C:\1c-4790-extension).
2. Chrome'da manzil qatoriga yozing: chrome://extensions
3. O'ng yuqorida «Режим разработчика / Developer mode»ni yoqing.
4. «Загрузить распакованное / Load unpacked» → papkani tanlang.
5. Extension ikonkasini paneldagi «jumboq» belgisidan mahkamlab qo'ying (pin).

Agar 1C manzili tas-1cbuxapp-01 emas bo'lsa (masalan IP orqali kirsangiz),
manifest.json ichidagi ikki joyda «http://tas-1cbuxapp-01/*» ni o'zgartiring
va chrome://extensions da «Обновить» bosing.

Ishlatish
---------
1. 1C ni Chrome'da oching, ikonkani bosing — o'ng pastda panel chiqadi.
2. «ОСВ по счету 4790»ni kerakli oyga shakllantiring → «ОСВ'dan o'qish».
   Agar «jadval topilmadi» desa: hisobot ichiga bosing → Ctrl+A → Ctrl+C →
   panelda «yoki: nusxa joylash» → Ctrl+V → «Tahlil qilish».
3. Ro'yxatni tekshiring. Bo'lim, ism va summani panelda tuzatsa bo'ladi;
   kerak bo'lmaganining belgisini oling.
4. «Операция (введенная вручную)»ni oching (yangi yoki shu oyniki).
   To'g'ri Кт tomoni bor BITTA 4790 qatoriga bir marta bosing → «Namunani tekshirish».
   Yangi hujjatda bunday qator bo'lmasa, birinchisini qo'lda kiriting.
5. Avval «Bitta qator (sinov)» → natijani ko'zdan kechiring.
   Hammasi to'g'ri bo'lsa → «Hammasini to'ldirish».
6. Hujjatni tekshirib, o'zingiz «Записать» / «Провести» bosing.
7. ОСВ 4790 ni qayta shakllantiring — qizil qoldiq 0 bo'lishi kerak.

Bilish kerak
------------
* Ishlayotganda Chrome tepasida «… отлаживает этот браузер» degan sariq qator
  chiqadi. Bu normal: extension 1C ga haqiqiy klaviatura va sichqoncha bosishlarini
  shu yo'l bilan yuboradi. Ish tugagach o'zi yo'qoladi. To'ldirish paytida
  sichqoncha va klaviaturaga tegmang.
* Brauzer masshtabi 100% bo'lsin (Ctrl+0).
* Avval TestDB11 da sinang.
* Xato bo'lsa: panelda «Diagnostika» → matn nusxalanadi → Claude'ga yuboring.
