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
