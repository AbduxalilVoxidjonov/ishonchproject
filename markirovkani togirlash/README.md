# Markirovkali chek tayyorlash — 1.1.9

Faqat markirovkali tovarlar bilan ishlaydigan Chrome kengaytmasi. Markirovkasiz rejim va oddiy Podbor kodi olib tashlangan.

## O‘rnatish

Chrome `chrome://extensions` → Developer mode → Load unpacked → shu papkani tanlang. Oldingi nusxa uchun Reload, keyin 1C sahifasini yangilang. Manzil: `http://tas-1cbuxapp-01/TestDB11/`.

Yangilashda fayllarni doim shu bir xil papkaga almashtiring va mavjud extension kartasida **Reload** bosing. Har versiyani boshqa papkadan **Load unpacked** qilish bir nechta extension nusxasini yaratishi mumkin; ular bir-birining xotirasini o‘qimaydi. Chrome’da shu extensionning faqat bitta nusxasini yoqib qoldiring. Yangilangach toolbar ikonkasini bosing; panel sarlavhasidagi versiya yangi buildni tasdiqlaydi.

## Ishlatish

Panel Chrome’ning yon panelida ochiladi: toolbar ikonkasini bosing. 1C sahifasi torayadi, panel uning ustini yopmaydi. Panelda **Qatorlar**, **Olish**, **Summa**, **Bir tovardan, dona** va bitta asosiy tugma bor.

1. `Инвентаризация товаров` oynasida **Qatorlar** maydoniga masalan **100** yoki **200** kiriting va **Olish** ni bosing. Bo‘sh maydon barcha qatorlarni bildiradi. Bu mahsulot donalari emas, jadval boshidagi qatorlar sonidir. Kursor jadval o‘rtasida bo‘lsa ham dastlabki qatorlar olinadi. Nol miqdorli qatorlar ham ushbu chegaraga kiradi; bir xil nomlar chegaralashdan keyin birlashtiriladi.
2. Shu ombor uchun bo‘sh `Реализация` hujjatini oching, kerakli maydonlarni to‘ldiring va **Товар маркирован** ni belgilang.
3. Summani kiriting (natsenka foizi endi so‘ralmaydi). **Bir tovardan, dona** maydoniga har bir tovardan nechta olishni yozing (masalan **5**). Qoldiq kam bo‘lsa boricha olinadi. Bo‘sh qoldirsangiz har bir tovarning hammasi olinadi.
4. **Boshlash** reja tanlash, Podbor, kodlarni qo‘shish va ichki qoldiq hisobini avtomatik bajaradi. Alohida Reja yoki Chekni tayyorlash tugmasini bosish kerak emas.
5. Xuddi shu tugma ishlayotganda **Pauza**, pauzada **Davom** bo‘ladi. Pauza joriy xavfsiz qadam tugagach amal qiladi.
6. Keyingi chek uchun yangi bo‘sh hujjat oching, yangi summa va foizni kiriting, shu asosiy tugmani yana bosing. Qolgan ichki qoldiq saqlanadi.

Miqdori noto‘g‘ri o‘qilgan inventarizatsiya qatori alohida ogohlantirish bilan tashlab ketiladi. Qolgan qatorlar o‘qishda davom etadi; shu qator ichki qoldiq va chek rejasiga qo‘shilmaydi.

Tovarlar jadvali va jurnal **Tafsilotlar** ichida yig‘ilgan. Noaniq o‘tkazish yoki sahifa yangilangandan keyingi hujjatni tiklash tugmalari faqat shu holat yuzaga kelganda chiqadi.

Panel yon tomonda ochiladi. Boshqa tabga o‘tsangiz ham panel ishlayotgan 1C tabini ko‘rsatishda davom etadi. 1C masshtabi 100% bo‘lsin. Chrome debugging sariq panelini ish vaqtida yopmang.

## Soliq.uz markirovka tekshiruvi

MXIK Qidiruv (soliq.uz) 0.4.5 extensioni bilan ishlaydi. Podbor jadvalidagi har bir kod 1C ga qo‘shilishidan oldin `my.soliq.uz` dagi markirovka tarixi orqali tekshiriladi. Oxirgi operatsiya chakana bo‘lsa kod sotilgan deb tashlanadi; ulgurji bo‘lsa olinadi. Tarix topilmasa, xizmat javob bermasa yoki holat noma’lum bo‘lsa kod xavfsizlik uchun olinmaydi va jurnalga yoziladi. Buning uchun MXIK extensioni yoqilgan, foydalanuvchi `my.soliq.uz` ga kirgan va 1C extensioni bilan bir xil Chrome profilida bo‘lishi kerak.

## Hisob va chegaralar

Birlik reja narxi = boshlang‘ich narx × (1 + foiz / 100), ikki kasrgacha yaxlitlanadi. Reja barcha mos mahsulot to‘plamlarini ko‘rib chiqadi. Har bir mahsulot bo‘yicha miqdor **Bir tovardan** qiymatidan oshmaydi (standart 2). Qoldiq undan kam bo‘lsa butun qoldiq olinadi, bo‘sh qiymatda esa doim butun qoldiq olinadi. Qiymat chek boshlanganda rejaga qotiriladi. Bir xil nomli inventarizatsiya qatorlari birlashtirilib, narxi miqdor bo‘yicha o‘rtachalanadi.

Inventarizatsiya miqdori ichki rejalash chegarasi. Haqiqiy kodlar, rezerv, 1C tannarxi va QQS sabab yakuniy summa rejadan farq qilishi mumkin. 1C dagi yakuniy summani tekshiring.

## Pauza va noaniq o‘tkazish

Pauza va Davom bitta asosiy tugma orqali boshqariladi. O‘tkazish natijasi noaniq bo‘lsa, qayta qo‘shish bloklanadi. Hujjatni tekshirib, faqat haqiqiy natijani panelda tasdiqlang. Sahifa yangilanganda aynan joriy hujjatni qayta tasdiqlash kerak bo‘lishi mumkin.

Oldingi rejimda yarim bajarilgan chek bo‘lsa, u avtomatik davom ettirilmaydi. Avval eski hujjatdagi miqdorlarni tekshiring. Yangi boshlang‘ich ro‘yxat olish eski hujjatni bekor qilmaydi va tovarlarni 1C omboriga qaytarmaydi.

Ichki qoldiq tayyor hujjatlarga ajratilgan miqdorni hisoblaydi. Hujjatni 1C dan o‘chirsangiz, ichki qoldiq avtomatik qaytmaydi. Qayta Olish yangi boshlang‘ich ro‘yxat beradi.

Kengaytma Save, Post, Post and close yoki fiskal yuborish tugmalarini bosmaydi. U hujjatni tayyorlaydi.

## Tekshirish

```sh
node --test *.test.cjs
```

Avtomatik testlar jonli Chrome/1C bilan to‘liq sinov o‘rnini bosmaydi.


## 0.9.1: dastlabki qatorlarni olish

Chegara ixtiyoriy musbat butun son. 0, manfiy, kasr va noto‘g‘ri qiymatlarda eski ro‘yxat o‘chirilmaydi va o‘qish boshlanmaydi. Sozlama sahifa yangilanganda ham saqlanadi. Jadvalda kiritilgan sondan kam qator bo‘lsa, mavjud qatorlar olinadi.

## 0.9.2: yakuniy natsenka

Podbordan tovarlar o‘tkazilgach, «Заполнить → Заполнить цены (себестоимость + %)» ochiladi. Paneldagi foiz birinchi «Процент наценки» maydoniga kiritilib tekshiriladi va shu oynaning «Заполнить» tugmasi bosiladi. Narxlar barcha tovar qatorlariga qo‘llanadi; hujjat Save bilan saqlanmaydi. Oyna maydonlari 1C tomonidan qayta yaratilganda ham joriy qiymat tekshiriladi. Oyna yopilgani va yakuniy summa aniqlangani tasdiqlangach chek tayyor deb ko‘rsatiladi.

## 0.9.3: Podbor va maqsad summa

«По остаткам расширенный коды маркировки» katagi joriy holati orqali tekshiriladi, faol bo‘lmasa bir marta bosiladi. 1C katakni qayta chizganda yangi element olinadi; aynan shu Podbor oynasidagi markirovka jadvali va qidiruv maydoni tayyor bo‘lmaguncha qidirish boshlanmaydi.

Yangi chek yangi kiritilgan summaga qayta rejalashtiriladi. Boshlangan chekda maqsadni almashtirib eski miqdorlar bilan davom etish bloklanadi. Reja barcha mos mahsulot to‘plamlarini solishtiradi. Maqsad mumkin bo‘lgan eng kichik–eng katta summa oralig‘idan tashqarida bo‘lsa, panel eng yaqin summa, oraliq va farqni ko‘rsatadi. Oraliqda bo‘lish aynan shu summali to‘plam mavjudligini anglatmaydi. Hisob o‘qilgan inventarizatsiya narxi va natsenkaga asoslanadi; 1C tannarxi va QQS yakuniy hujjat summasini o‘zgartirishi mumkin.

## 0.9.4: versiyani yangilash

Toolbar panelning haqiqiy versiyasini tekshiradi. Eski yoki uzilgan panel o‘rniga manifestdagi barcha modullar tartib bilan yuklanadi. Oldingi nusxaning taymer va xabar tinglovchilari to‘xtatiladi; eski versiyadan kelgan klaviatura/sichqoncha buyruqlari qabul qilinmaydi.

Saqlangan holat versiya va sxema bilan yuritiladi. Yangilashda boshlanmagan yoki tugallangan chekning eski rejasi, jurnal va vaqtinchalik qiymatlari tozalanadi. O‘qilgan mahsulotlar, qolgan qoldiq va tarix saqlanadi. Yarim bajarilgan chek yoki natijasi noaniq o‘tkazish saqlanib, pauzaga olinadi; hujjat qayta tasdiqlanmaguncha davom etmaydi. Holat yuklanishidan oldin boshqaruvlar ishlamaydi. Buzilgan yoki mos kelmaydigan holat xato bilan ko‘rsatiladi va uning ustiga bo‘sh qoldiq yozilmaydi.

## 0.9.5: cheksiz turdagi mahsulotlar

Endi bitta chekdagi mahsulot turlari soni cheklanmaydi. Har bir tanlangan mahsulotdan qoldiq 2 yoki undan ko‘p bo‘lsa 2 dona, qoldiq 1 bo‘lsa 1 dona olinadi. Planner barcha mos mahsulotlar to‘plamini ko‘rib, kiritilgan summaga eng yaqin jami summani tanlaydi. Takroriy nomlar bir marta hisoblanadi; narxi yoki qoldig‘i yaroqsiz mahsulotlar tashlab ketiladi.

## 0.9.6: tozalash tugmasi

Panelda **Olish**, **Tozalash**, **Omborni tozalash** va **Barcha mahsulotlarni qo‘shish** tugmalari bor. **Barcha mahsulotlarni qo‘shish** summa kiritishni talab qilmaydi: narxi va qoldig‘i bor barcha tovarlardan qoldiq 2 yoki undan ko‘p bo‘lsa 2 dona, 1 dona bo‘lsa 1 dona rejalaydi. Ustama foizi kiritiladi, keyin asosiy tugma orqali chek tayyorlanadi. **Tozalash** joriy chekni tozalaydi va ombor qoldig‘ini saqlaydi. **Omborni tozalash** o‘qilgan tovarlar ro‘yxatini va ichki ombor qoldig‘ini alohida tozalaydi; tarix saqlanadi. Ishlayotgan yoki natijasi noaniq o‘tkazilgan holatda bu amallar bloklanadi.

## 1.0.0: doimiy extension ID

Ikkala extension `manifest.json` da `key` maydoniga ega, shuning uchun ID har qanday kompyuter (Windows, macOS) va papkada bir xil: bu extension `iimlgpfdhffcigknhggakccmgbljiloj`, MXIK Qidiruv `miockbfbngeadklmkfmcjicjlcnjlpof`. `key` ni o‘zgartirmang yoki o‘chirmang — aks holda ikki extension bir-birini topa olmaydi va barcha kodlar «noma’lum» bo‘lib olinmaydi.

## 1.1.0: yon panel, taymer, bir tovardan N dona, xato markirovkalar

- **Yon panel.** Panel 1C sahifasining ichida emas, Chrome yon panelida ochiladi (toolbar ikonkasi). Hisob-kitob va 1C bilan ishlash avvalgidek 1C tabida bajariladi, yon panel faqat ko‘rsatadi va tugmalarni yuboradi. Sahifa yangilansa, panel o‘zi qayta ulanadi.
- **Taymer.** «⏱ Chek: 0:12:34 ishladi • 14:05 da boshlandi» qatori joriy ish (chek yoki Olish) qancha vaqtdan beri ishlayotganini ko‘rsatadi. Pauzadagi vaqt hisoblanmaydi. Chek tugagach yakuniy vaqt qoladi.
- **Bir tovardan, dona.** Raqam (masalan 5) yozilsa, har bir tovardan ko‘pi bilan shuncha dona olinadi. Qoldiq kam bo‘lsa boricha olinadi. Bo‘sh qoldirilsa, har bir tovarning hammasi olinadi. Bu maqsad summa rejasiga ham, «Barcha mahsulotlarni qo‘shish» ga ham ta’sir qiladi.
- **Xato markirovkalar.** soliq.uz bo‘yicha sotilgan yoki tekshirib bo‘lmagan kodlar alohida ro‘yxatda chiqadi. Har birida tovar nomi, inventarizatsiyadagi qator raqami, kodning shu tovarning Podbor ro‘yxatidagi o‘rni, kodning o‘zi va sababi ko‘rsatiladi. Ro‘yxat yangi chek boshlanganda yoki Tozalashda tozalanadi.

## 1.1.1: Olish jadval boshiga qaytmay to‘xtab qolishi tuzatildi

To‘liq Olishda (cheklov bo‘sh) kursor jadval o‘rtasida bo‘lsa, pastgacha o‘qilgandan keyin boshiga qaytish yarim yo‘lda to‘xtab qolardi: allaqachon o‘qilgan sahifalarda yangi qator chiqmagani «jadval boshi» deb hisoblanardi. Endi jadval chegarasi faqat sahifa boshqa siljimaganda aniqlanadi. 1C sekin javob bersa, qo‘shimcha kutiladi. Kursor jadvaldan chiqib ketsa, ish to‘xtatilmaydi, kursor jadvalga qaytariladi.

**Markirovkani tekshirish.** Panelda kodni yozing yoki skanerlang (bir nechtasini bo‘shliq bilan), Enter yoki **Tekshirish** ni bosing. Har bir kod uchun ko‘rsatiladi:
- soliq.uz: mahsulot nomi, nechta operatsiya bo‘lgani va oxirgisi nechinchi o‘rinda ekani (ulgurji → olsa bo‘ladi, chakana → sotilgan);
- 1C: kod Podborda uchragan bo‘lsa, qaysi tovarniki, inventarizatsiya qatori va Podbor ro‘yxatidagi o‘rni.

Chek ishlayotganda soliq.uz sahifasi band, shuning uchun tekshirishdan oldin **Pauza** bosing.

**Keyingi chek.** Keyingi chekni boshlab bo‘lmasa, panel endi aniq sababni yozadi: hujjat topilmadi, hujjat bo‘sh emas, oldingi chekning o‘sha oynasi yoki raqami bir xil hujjat.

## 1.1.2: keyingi chek qayta Olish bilan

Chek tugagach **Olish** darhol ishlaydi, **Tozalash** kerak emas. Tugagan chek tarixga yoziladi, keyin Инвентаризация qayta o‘qiladi: sotilgan tovarlar chiqib ketgan yangi qoldiq olinadi. Chekka o‘tkazilgan markirovka kodlari eslab qolinadi va keyingi cheklarga qayta olinmaydi, hatto 1C Podborda ularni hali ko‘rsatsa ham. Bunday kod xato markirovkalar ro‘yxatida «oldingi chekda ishlatilgan» deb chiqadi. Bu ro‘yxat **Omborni tozalash** bilan tozalanadi.

## 1.1.3: xato bergan tovar tashlab ketiladi

1C da tovarni qidirish yoki kodlarini to‘ldirishda xato chiqsa (qidiruv natijasi kelmadi, ustun topilmadi, fokus yo‘qoldi va hokazo), chek to‘xtamaydi: **Подбор** yopiladi (shu tovarga yozilgan 1 lar o‘tkazilmaydi), tovar «–» bilan tashlab ketiladi va keyingi tovarga o‘tiladi. Sababi tovar ustiga sichqonchani olib borganda va jurnalda ko‘rinadi. Tashlab ketilgan tovar chekni «to‘liq emas» qilmaydi.

Quyidagi hollarda esa avvalgidek pauza qilinadi: hujjat yoki ombor o‘zgargan, o‘tkazish natijasi noaniq, **Подбор** yopilmadi yoki 3 ta tovar ketma-ket xato berdi (bu odatda 1C yoki debugger bilan umumiy muammo).

## 1.1.5: boshqa kompyuterda Olish va Podbor ishlashi

- **Sonlar 1C tili bo‘yicha o‘qiladi.** Rus tilidagi 1C miqdorni `5,000` (= 5), ingliz tilidagisi `1,000` (= 1000) deb chiqaradi. Oldin bunday qiymat «noaniq» deb rad etilardi va tovar «miqdor o‘qilmadi» bilan tashlab ketilardi. Endi ajratgich butun ustun bo‘yicha aniqlanadi.
- **1000-qatordan keyingi qatorlar.** `1 000` ko‘rinishidagi qator raqami endi 1-qator deb o‘qilmaydi.
- **Ustun nomlari.** «Кол-во (факт)», «Количество факт.», ikki qatorga bo‘lingan sarlavha va hokazo ham taniladi.
- **Podborda «1» yozilganini tekshirish** `1`, `1,000` va `1.000` ko‘rinishlarining hammasida ishlaydi.
- **Brauzer masshtabi.** Masshtab 100% bo‘lmasa, bosish joyi o‘lchab moslashtiriladi va jurnalda ogohlantirish chiqadi. Baribir Ctrl+0 bilan 100% qilish tavsiya etiladi.

## 1.1.6: ⛔ To‘liq to‘xtatish

Amal (Olish, chek tayyorlash, noaniq o‘tkazish yoki hujjatni tasdiqlash) oxiriga yetmay qotib qolsa, «Tozalash» va «Omborni tozalash» bloklanib qolardi. Endi panelda doim ishlaydigan **⛔ To‘liq to‘xtatish** tugmasi bor. Tasodifan bosilmasligi uchun uni 5 soniya ichida ikki marta bosish kerak.

- Qotib qolgan amal tugatiladi va panel toza holda qayta ishga tushadi. Sahifani yangilash (F5) shart emas.
- Joriy chek nolga qaytadi. 1C ga o‘tkazilgani tasdiqlangan miqdorlar qoldiqdan ayrilgan holda qoladi, tasdiqlanmaganlari bekor qilinadi. O‘qilgan ombor ro‘yxati saqlanadi.
- Shundan keyin «Olish», «Tozalash» va «Omborni tozalash» darhol ishlaydi.
- 1C da ochiq qolgan «Подбор» oynasini va yarim to‘ldirilgan hujjatni qo‘lda tekshiring yoki yoping.

## 1.1.7: qatorlar oralig‘i va Edge / Yandex

- **Qatorlar oralig‘i.** Maydon endi ikki xil qiymat qabul qiladi: `100` — boshidan 100 qator (avvalgidek); `4-20` — 4-qatordan 20-qatorgacha, ikkala chegara ham kiradi (17 qator). Bo‘sh — hammasi. Jadval oxiridan oshib ketgan chegara jadval oxirigacha olinadi; boshlanish jadvaldan keyin bo‘lsa, xato chiqadi. `20-4`, `0-5`, `4-` kabi noto‘g‘ri qiymatlar hech narsa o‘qilmasdan rad etiladi.
- **Edge va Yandex: «Yaroqli miqdorli tovar topilmadi».** Bu brauzerlarda 1C sonlarni boshqa Unicode belgilar bilan chiqaradi (ingichka/tor bo‘shliq, yashirin belgilar, apostrof guruhlash, boshqa raqam shakllari, birlik qo‘shimchasi `5 шт`), shuning uchun barcha qatorlar «miqdor o‘qilmadi» bo‘lardi. Endi matn avval oddiy ko‘rinishga keltiriladi, so‘ng o‘qiladi. Baribir o‘qilmasa, jurnal va xato xabarida o‘qilgan xom matn va uning belgi kodlari chiqadi.
- **Yandex: yon panel.** Brauzerda `chrome.sidePanel` bo‘lmasa, toolbar ikonkasi panelni alohida kichik oynada ochadi (o‘sha 1C tabiga bog‘langan). Edge da oddiy yon panel ishlaydi.
- **Natsenka olib tashlandi.** «Ustama %» maydoni va 1C dagi «Заполнить цены (себестоимость + %)» qadami yo‘q. Narxlar 1C bergancha qoladi, reja inventarizatsiya narxi bo‘yicha (ustamasiz) hisoblanadi. Chek tugagach ko‘rsatiladigan jami — o‘tkazilgan tovarlarning lokal hisobi. Eski 0.9.x–1.1.6 bo‘limlaridagi natsenka haqidagi gaplar endi amal qilmaydi.
- **Yig‘ib bo‘lindi.** Chek yig‘ib bo‘lingach panelda «Yig‘ib bo‘lindi» chiqadi. Hujjatni kengaytma o‘tkazmaydi, uni o‘zingiz «Провести» qilasiz.
- **Ovozli xabar.** Chek yig‘ib bo‘lingach qisqa signal chalinadi va «Yig‘ib bo‘lindi» deb aytiladi (o‘zbek ovozi bo‘lmasa rus ovozida «Сбор завершён»). Ovoz chiqishi uchun 1C tabida tovush yoqilgan bo‘lishi kerak.

## 1.1.8: Olish jarayonida pauza va o‘qilgan qatorlar soni

Olish boshlangach shu tugma **Pauza (N)** ga aylanadi, bu yerda N — hozirgacha o‘qilgan qatorlar soni; pauzada **Davom (N)**. Holat qatorida «Olish: N / jami qator o‘qildi» ko‘rinadi (oraliq `4-20` berilsa jami shu oraliq). Pauza joriy sahifa o‘qilgach amal qiladi; Davom kursorni jadvalga qaytarib, o‘qishni davom ettiradi. O‘qish tugagach tugma yana «Olish» bo‘ladi.

## 1.1.9: xato markirovkalar doimiy bazasi va E-POS tugmasi

- **Xato bazasi.** soliq.uz **aniq** rad etgan kod (sotilgan yoki boshqa STIR da) nomi, sababi va soliqdagi mahsulot nomi bilan doimiy saqlanadi (yangi chek, Tozalash va Omborni tozalash uni o‘chirmaydi). Keyingi chekda shu kod yana uchrasa soliq.uz tekshirilmasdan darhol o‘tkazib yuboriladi va jurnalda «xato bazasida» deb yoziladi. «Tekshirilmadi» (javob yo‘q, kirilmagan) kodlar saqlanmaydi. Baza shu bazaning holatida turadi va faqat shu STIR uchun amal qiladi (STIR o‘zgarsa qayta tekshiriladi). Tozalash: «Xato bazasini tozalash» tugmasi.
- **E-POS orqali sotish.** Faqat Ishonch dasturida ko‘rinadi: tayyor chekni E-POS Communicator orqali sotadi (Ishonch hujjatiga qarang).
