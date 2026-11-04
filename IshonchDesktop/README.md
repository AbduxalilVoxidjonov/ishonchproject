# Ishonch (Windows dastur, C# / WinForms / WebView2)

Bosh sahifada 101 ta 1C bazasi ro'yxati (Excel `0001.xlsx` dan). Baza tanlanadi (qidiruv bilan), ikki marta bosilsa 1C web-mijoz yangi tabda ochiladi.
`my.soliq.uz` tugmasi shu firma uchun alohida profilda kabinetni ochadi. Har bir baza/firma o'z cookie va loginini saqlaydi; tablar tepada, yopish — ×, o'rta tugma yoki Ctrl+W, almashtirish — Ctrl+Tab.

Baza ro'yxati: `%APPDATA%\Ishonch\bases.json` (tahrirlash: «Ro'yxat faylini ochish», keyin «Qayta yuklash»).

## Yig'ish

```
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o publish
```
Natija `publish\Ishonch.exe` (.NET runtime ichida; kompyuterda faqat Edge WebView2 Runtime bo'lishi kerak, Windows 11 da bor).

## Keyingi bosqich
Markirovkali chek va MXIK amallari: WebView2 `CoreWebView2.CallDevToolsProtocolMethodAsync` orqali ishonchli (trusted) klaviatura/sichqoncha, `ExecuteScriptAsync` orqali sahifa o'qish. Hozirgi kengaytma mantiqi shu yerga ko'chiriladi.

## Markirovkali chek (0.2.0)

Bosh sahifada bazani tanlab «Markirovkali chek tayyorlash» bosilsa, 1C tabi ochiladi va o'ng tomonda kengaytmadagi bilan bir xil panel (Olish, Boshlash, Pauza, Tekshirish, ovozli xabar...) chiqadi. Kengaytma fayllari (`markirovkani togirlash` va `tasnifsoliq\extension`) o'zgarishsiz exe ichiga joylanadi, shuning uchun mantiq bitta joyda yangilanadi.

- 1C sahifasiga `chrome.*` o'rnini bosuvchi ko'prik (`Marking\shim.js`) kiritiladi; ishonchli klaviatura/sichqoncha WebView2 DevTools Protocol orqali (`CdpInput.cs`).
- Holat: `%APPDATA%\Ishonch\marking\<baza>.json`. Jurnal: `%APPDATA%\Ishonch\app.log`.
- Soliq tekshiruvi shu firma INN dagi `my.soliq.uz` tabida orqa fonda bajariladi: avval shu tabda kabinetga kirib qo'ying.
- ``my.soliq.uz`` tabi to'g'ridan-to'g'ri «Юридик шахс» kirish sahifasida ochiladi: ERI (E-IMZO) kalitini va parolni foydalanuvchi o'zi tanlaydi/kiritadi, dastur parol va kalitlarga tegmaydi.

## Qidiruv, masshtab, oyna o'lchami (0.3.0)

- **Qidiruv.** Yozgan sari ro'yxat darhol filtrlanadi; bir nechta so'z yozilsa hammasi mos kelishi kerak (masalan `baza8 Артамонов`). Pastga yoki Enter — birinchi natijaga o'tadi, Esc — tozalaydi. Ro'yxatdagi istalgan qiymatni **Ctrl+bosish** yoki **o'ng tugma** menyusi bilan shu qiymat bo'yicha filtrlash mumkin (masalan bitta buxgalterning barcha firmalari); filtr tepada belgi bilan ko'rinadi va "Filtrni olib tashlash" bilan o'chadi.
- **Masshtab.** Har bir tab (har bir baza, soliq, markirovka paneli) va Bosh sahifa o'z masshtabini eslab qoladi. Tab panelida `−  100%  +` tugmalari, Ctrl+g'ildirak, Ctrl+`+` / `-` / `0` ishlaydi. Masshtab 100% dan boshqa bo'lsa, 1C da bosish joylari avtomatik moslashadi (jurnalda ogohlantirish chiqadi); baribir 1C tabini 100% da ushlash ishonchliroq.
- **Oyna o'lchami.** Birinchi ishga tushishda oyna ekran ish maydonining 90% ida ochiladi, keyin oxirgi joy va o'lchamda (monitor ajratilgan bo'lsa ekranga qaytariladi). Juda tor oynada Bosh sahifada aylantirish chizig'i chiqadi, panel kengligi oyna kengligiga mos (taxminan 1/3). DPI 100–200% ekranlarda ishlaydi.
- **my.soliq.uz tili.** Markirovka tekshiruvi sayt qaysi tilda ochiq bo'lishidan qat'i nazar (kirill o'zbekcha, ruscha, inglizcha, qoraqalpoqcha) ishlaydi: qidirishdan oldin sayt o'zi lotin o'zbekchaga o'tkaziladi (sahifadagi til tanlagich orqali, kerak bo'lsa `i18nextLng` orqali). Bu `tasnifsoliq\extension` (0.4.6) dagi o'zgarish, shuning uchun Chrome kengaytmasida ham ishlaydi.

## E-POS Communicator orqali sotish (0.4.0)

Bosh sahifadagi **E-POS orqali sotish** tugmasi shu bazaning tayyor markirovkali chekini E-POS Communicator (`localhost:8347`, UzPOS protokoli) orqali fiskal chek qilib sotadi. Batafsil: `docsPOS-integratsiya.md`. Sotish haqiqiy fiskal chek yaratadi: alohida tasdiq belgisi va savol oynasi bor, bir 1C cheki ikki marta sotilmaydi. Testlar: `dotnet run --project tests\UzposTests -c Release`.

## E-POS Communicator orqali sotish (0.4.0)

Bosh sahifadagi **E-POS orqali sotish** tugmasi shu bazaning tayyor markirovkali chekini E-POS Communicator (`localhost:8347`, UzPOS protokoli) orqali fiskal chek qilib sotadi. Batafsil: `docs/EPOS-integratsiya.md`. Sotish haqiqiy fiskal chek yaratadi: alohida tasdiq belgisi va savol oynasi bor, bir 1C cheki ikki marta sotilmaydi. Testlar: `dotnet run --project tests/UzposTests -c Release`.

## 0.5.0

- 1C paneldagi **E-POS orqali sotish** tugmasi (Bosh sahifadagi alohida E-POS tabi olib tashlandi).
- Xato markirovkalar doimiy bazasi (kengaytma 1.1.9).

## 0.6.0
- **Elektr** bo'limi: HET kabinetlari login/parollari (shifrlangan), parallel yig'ish, oylik tarix.
- **Yangilanish**: GitHub Release dan tekshirish/yuklash/almashtirish (Yordam → Yangilanishni tekshirish), ma'lumotlar zaxirasi, ochiq tablar tiklanadi.
- Bosh sahifa: raqam yonidagi ☆ bilan bazani tepaga qadash, № bo'yicha tartib.

## 0.7.8 — Xatolar jurnali, inventarizatsiya sanasi
- **Xatolar jurnali**: har bir ogohlantirish va xato `%APPDATA%\Ishonch\problems.jsonl` ga yoziladi: vaqt, baza/firma/INN, bo'lim (markirovkali avto, markirovkasiz, E-POS, soliq, Elektr…), matn, stack trace va oldingi `app.log` qatorlari.
- **Yordam → «Xatolar jurnali (yig'uvchi)…»** da manzil berilsa, yozuvlar egasining kompyuteridagi **IshonchLogs.exe** ga yuboriladi (HTTP, kalit bilan). Manzil va kalit release da GitHub `LOG_COLLECTOR_URL` / `LOG_COLLECTOR_KEY` dan exe ga yoziladi — kompyuterlarda qo'lda kiritish shart emas. Ular berilmasa jurnal faqat kompyuterda yoziladi, dastur odatdagidek ishlaydi. Batafsil: `../IshonchLogs/README.md`.
- **Inventarizatsiya sanasi va vaqti**: markirovkali avtomatika panelida va markirovkasiz bo'limda tepada so'raladi (odatiy — bugun 23:30:00); 1C hujjatiga soniyasigacha shu sana yoziladi.

## 0.7.7 — Markirovkali avtomatika: bitta chek, pauza, davom etish
- «▶ Avto boshlash» har safar **bitta chek** yaratadi («Maqsad summa» — shu chek summasi; bir tovardan nechta — «Bir tovardan, dona»).
- **⏸ Pauza / ▶ Davom**: jarayon (panel Podbor'i ham) shu joyida to'xtaydi va davom etadi; to'xtatilgan chekni keyingi «Avto boshlash» **qolgan joyidan davom ettirishni** taklif qiladi.
- **⟲ Boshiga qaytarish**: qotib qolsa majburan to'xtatib, joriy chekni tozalaydi (ombor ma'lumoti, ishlatilgan kodlar va xato bazasi saqlanadi).
- Ombor (inventarizatsiya + «Olish») **kuniga bir marta** o'qiladi; keyingi cheklar sotilganlarni ayirib, darhol boshlanadi.
- «Olish»da «Jadval tanlanmadi» xatosi kamaydi (qayta urinadi); panel tugmalari va holat qatori endi to'g'ri yangilanadi.

## 0.7.6 — E-POS markirovkasiz sotishda, pastki qatorlar
- **Markirovkasiz sotish**: «🧾 E-POS orqali sotish» tugmasi — provesti qilingan chekni fiskal chek qiladi. O'zi bosilmaydi: faqat siz bosganda (bir nechta chek bo'lsa ro'yxatdan tanlanadi), sotilgani qayta taklif qilinmaydi. Gramm tovarlar ham to'g'ri (8,33 g).
- Markirovkali panelda «E-POS orqali sotish» faqat ko'rinadi, avtomatika uni bosmaydi.
- 2-, 3-cheklarda jadvalning pastki qatorlariga o'tishda xato chiqib to'xtash tuzatildi: uzoq masofaga g'ildirak bilan aylantirib, qatorni bosib o'tiladi.

## 0.7.5 — Markirovkali avtomatika, yangi dizayn, fiskal modul
- **Markirovkali avtomatika** (panelda «▶ Avto boshlash»): inventarizatsiya bir marta (sana bugun 23:30), «Olish», har chek uchun «Товары, услуги, комиссия» (sklad + «Товар маркирован») → Podbor → provesti; oxirida inventarizatsiya qayta yangilanadi. Oldingi cheklarda ishlatilgan, sotilgan yoki soliqda topilmagan markirovkalar qayta olinmaydi.
- my.soliq.uz ga **yuridik shaxs** sifatida (ERI kalit bilan) kirilmagan bo'lsa boshlanmaydi: «Avval … ERI kalitdan birini tanlang» deydi.
- «Markirovka topilmadi» kodlari darhol tashlanadi; chek rejasi yuzlab tovarda ham bir-ikki soniyada tuziladi (oldin daqiqalab 1C ni band qilardi).
- Panel bosqichma-bosqich: ① Sozlamalar, ② Ishga tushirish; qo'lda boshqarish yashirildi; chek oxiridagi ovoz olib tashlandi.
- **Yangi dizayn**: bosh sahifa lentasi va belgisi, oyna nomi «Ishonch-Abduxalil»; «Yordam» (telefon, Telegram) Elektr ostida; pastda fiskal modul holati (aktiv / aktiv emas, modul raqami).
- **E-POS orqali sotish** qaytdi; fiskal port (3448/3449/3450) o'zi topiladi.
- Markirovkasiz sotish: **gramm** bilan sotiladigan tovarlar (oltin) avtomatik aniqlanadi; qatorga o'tishda qotib qolmaydi; sana yozishda qayta urinadi.

## 0.7.4 — Pauza va barqaror ishlash (markirovkasiz sotish)
- **⏸ Pauza**: jarayon keyingi 1C amalidan oldin to'xtab turadi, **▶ Davom etish** aynan shu joydan davom ettiradi.
- ■ To'xtatish yoki xatodan keyin **▶ Boshlash** — qolgan cheklardan davom etish (yoki boshidan) taklif qilinadi.
- Eng oxirgi inventarizatsiyani qidirishda ro'yxat oxiriga bir marta o'tiladi, qatorlar chizilmasa o'zi aylantiradi (qotib qolmaydi).
- Tovarlarni o'qishda 1C ortiqcha aylantirsa ham joy topiladi («joy yo'qoldi» xatosi chiqmaydi).
- NDS allaqachon to'g'ri bo'lsa «Выполнить» dan keyin ortiqcha kutilmaydi; jurnalga har qadam vaqti yoziladi.

## 0.7.3 — Sinov bazasi ro'yxatda
- Bazalar ro'yxatiga **TestDB11** (sinov bazasi, `tas-1cbuxapp-01`) qo'shildi. Ro'yxati allaqachon bor kompyuterlarga yangilanishdan keyin bir marta o'zi qo'shiladi; o'chirib tashlansa qayta qo'shilmaydi.

## 0.7.2 — Inventarizatsiya sanasi va eng oxirgi hujjat
- Inventarizatsiyani yangilashda sana doim **bugun 23:30:00** qilinadi, keyin sklad qoldig'i bo'yicha to'ldirilib provesti qilinadi.
- «Добавить из документа → Инвентаризация товаров» va inventarizatsiya ro'yxatida butun ro'yxat ko'rilib, skladning sana/vaqt bo'yicha **eng oxirgi** hujjati tanlanadi.

## 0.7.1 — Markirovkali avtomatika panel ichida
- Markirovkali chek panelidagi **«Avtomatik cheklar»** bo'limi: avval **sklad** (bo'sh bo'lsa boshlanmaydi), cheklar soni, provesti; umumiy summa — «Maqsad summa» maydonidan. Panel endi ikkiga bo'linmaydi.
- Avtomatika panel qayta chizilganda o'zi to'xtab qolmaydi; «To'xtatildi» faqat ■ bosilganda.
- Markirovka kodlari my.soliq.uz API orqali tezroq tekshiriladi; bir nechta firma bir vaqtda ishlasa bir-biriga halaqit bermaydi.
- Summa maydonlarida minglik ajratgich.
- «E-POS orqali sotish» vaqtincha o'chirildi.

## 0.7.0 — Markirovkasiz sotish
Bosh sahifada bazani tanlab **«Markirovkasiz sotish»** — 1C tabining o'ng tomonida panel ochiladi (har baza uchun sozlamalar alohida saqlanadi):
- **Umumiy summa** va **cheklar soni** — summa cheklarga har xil (±25%) bo'linadi, yig'indisi aynan umumiy summa.
- **Har chekda tovar qatorlari soni** va **bir tovardan ko'pi bilan necha dona**.
- **Narxga foiz**, **sklad** nomi, **provesti qilish** va **inventarizatsiyani yangilash** belgilari.

Jarayon: boshida skladning oxirgi «Инвентаризация товаров» hujjati «Заполнить по остаткам на складе» bilan to'ldirilib provesti qilinadi;
har chek uchun Реализация (накладная) → Изменить → Добавить из документа → Без НДС → +foiz → NDS 12% → rejadagi qatorlar qoldiriladi
(qolgani bloklab o'chiriladi) → miqdorlar → Перенести → Провести и закрыть. 1C «Остаток» xatosi bersa o'sha qator o'chirilib qayta provesti qilinadi.
Menyu «Markirovkasiz sotish → Barcha ochiq panellarda boshlash» — ochiq bazalarning hammasida bir vaqtda. Ish paytida 1C oynasiga tegmang.
Summa maydonlari minglarga ajratiladi (markirovkali panelda ham).

## 0.8.3 — IKPU qidiruvi faqat kerak bo'lganda; «Подбор» ochilmay qolishi tuzatildi

- 1C nomenklaturasidan IKPU o'qish endi har tovarda emas, faqat bir tovarning kodlari turli MXIK da chiqqandagina ishlaydi: shunda «Подбор» yopiladi, IKPU o'qiladi va tovar qaytadan olinadi. Qolgan tovarlarda ~30 soniya yo'qotilmaydi.
- «Подбор» tugmasi bosilishi 1C da yo'qolsa, haqiqiy bosish bilan takrorlanadi (oyna ekranda bo'lsa — qayta bosilmaydi); kutish tugasa xabarda ekran holati ko'rsatiladi.
- Nomenklaturadan qaytganda hujjat tabi o'z o'rni bo'yicha topiladi va «Подбор» tugmasi ko'ringuncha kutiladi.
- IKPU ketma-ket 2 marta o'qilmasa, qidiruv shu ishga tushirishda o'chiriladi.

## 0.8.2 — Natsenka 1C orqali, ochiq hujjatni sotish, har bazaning o'z E-POS i

- Markirovkali panelda «Natsenka, %»: Подбор dan keyin hujjat «Провести» qilinadi, so'ng 1C «Заполнить → Заполнить цены (себестоимость + %)» bilan natsenka qo'yiladi (ishlamasa «Сумма» = «Сумма списания» + natsenka). 1C formani qayta ochsa ham panel davom etadi.
- Ikkala panelda «📄 Ochiq 1C hujjatini E-POS orqali sotish»: 1C da ochiq istalgan Реализация (dastur yaratmagan bo'lsa ham) — narx, QQS, MXIK va markirovka kodlari («маркирован» oynasidan) bilan.
- Har bazaga o'z Communicator manzili; birinchi sotuvda baza fiskal modulga biriktiriladi, boshqa modulga chek yuborilmaydi.
- «Ushbu markirovka kodi topilmadi» — kod kutmasdan tashlanadi va xato bazasiga yoziladi.

## 0.8.1 — Markirovkasiz chek ham E-POS orqali 1C bilan bir xil sotiladi

- Markirovkasiz chek provesti qilinishidan oldin 1C hujjatidan har qatorning MXIK (ИКПУ), narxi, summasi, QQS va «Всего» si o'qiladi; E-POS cheki shular bilan, markirovka va shtrix kodsiz yuboriladi («Narxga foiz» qo'yilgan bo'lsa ham 1C bilan tiyingacha bir xil).
- O'lchov birligi: dona tovarda «dona», gramm tovarda «gramm» qadog'i tanlanadi.
- Provesti qilingan markirovkasiz cheklar faylga saqlanadi — dastur qayta ochilsa ham «E-POS orqali sotish» ro'yxatida qoladi, sotilgani belgilanadi.

## 0.8.0 — Markirovkali chek: narx, IKPU va E-POS 1C bilan bir xil

- Подбор dan keyin «Товары, услуги, комиссия» hujjatining har qatoriga inventarizatsiya narxi yoziladi (avval narx bo'sh, hujjat 0 so'm bilan provesti bo'lardi). 1C QQS ni ustiga qo'shadi, shuning uchun chek jami maqsad summaga teng chiqadi.
- Tovarning IKPU si 1C nomenklatura kartochkasidan («Код из классификатора») bir marta o'qiladi va eslab qolinadi. Подбор da MXIK i boshqa IKPU dagi markirovka olinmaydi — o'rniga keyingisi olinadi, rad etilgan kod «Sotib bo'lmaydigan markirovkalar» ga yoziladi.
- To'xtatilib davom ettirilgan chekning kodlari E-POS oynasidan yo'qolmaydi.
- E-POS orqali sotish: IKPU 1C dan, har bir kodning MXIK i tekshiriladi, «Markirovkalar» ochiladigan ro'yxati; jadvalda 1C dagi kabi Narx, Summa, QQS %, QQS, Jami; chek jami 1C dagi «Всего» bilan tiyingacha bir xil; sotishdan oldin kodlar Communicator orqali avtomatik tekshiriladi.

## 0.7.9 — Inventarizatsiya qoldig‘ini qayta ishlatish

Markirovkali cheklar orasida ombor qoldig‘i va ishlatilgan kodlar saqlanadi, kun almashishi yoki «Boshiga qaytarish» ularni yangilamaydi. «Inventarizatsiyani yangilash» keyingi «Avto boshlash» uchun qayta o‘qishni belgilaydi. Birinchi o‘qish va sklad almashtirishda yangi inventarizatsiya olinadi. Xato markirovkalar bosh sahifadagi tugmadan ilova ichidagi alohida tabda ochiladi.
