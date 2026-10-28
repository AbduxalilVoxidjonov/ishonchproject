# EPOS fiskallash integratsiya

Yangi integrator uchun to'liq qo'llanma: E-POS dasturi (Communicator) ichi qanday qurilgan, fiskallash qanday ishlaydi, soliq / MXIK (tasnif) / markirovka / OFD bilan qanday bog'langan va 1C dan qanday sotiladi.

- Sana: 2026-10-28.
- Manba: o'rnatilgan **E-POS Communicator 3.23.8** va E-POS Cashdesk 0.2.39 ning o'z kodi (faqat o'qildi, hech narsa o'zgartirilmadi), FiscalDriveService README (github.com/qo0p/fiscal-drive-service), avvalgi tadqiqot hisoboti (`reports/EPOS integratsiyasi markirovka.md`).
- Belgilar: **[kod]** — E-POS kodidan o'qilgan, tasdiqlangan; **[taxmin]** — kodga asoslangan, lekin haqiqiy qurilmada sinalmagan; **[hujjat]** — rasmiy hujjatdan.
- Maxfiy kalitlar va tokenlar bu hujjatga ataylab yozilmagan.

---

## 1. Qisqa xulosa

1. **Fiskallash** = sotuvni **fiskal modul (ФМ)** ga yozish (u chekni raqamli imzolaydi) va keyin **OFD** (fiskal ma'lumotlar operatori) ga yuborish. Natija: chek raqami, fiskal belgi (FP) va tekshirish QR havolasi.
2. Dasturingiz **to'g'ridan-to'g'ri** ФМ bilan gaplashmaydi. Zanjir: **1C → Ishonch → E-POS Communicator → FiscalDriveService (xizmat) → USB ФМ → OFD**.
3. E-POS Communicator — mahalliy server (`http://localhost:8347/uzpos`), **UzPOS** protokoli: bitta POST so'rov, JSON. Kirish (login) kerak emas, so'rovda protokol tokeni yuboriladi.
4. Chek qatori uchun uchta kod shart: **IKPU (MXIK, 17 raqam)**, **qadoq kodi** va (markirovkali tovarda) **markirovka kodi**. Bularsiz chek yaratilmaydi.
5. ФМ E-POS ning maxfiy kaliti bilan **bog'langan (POS-lock)** bo'lishi mumkin; shunda boshqa dastur uni boshqara olmaydi. Shuning uchun biz E-POS Communicator orqali ishlaymiz.
6. Haqiqiy chekni **qaytarib bo'lmaydi** (faqat qaytarish cheki bilan). Sinash uchun emulyator bor (7-bo'lim).

---

## 2. Fiskallash tushunchalari

| Atama | Ma'nosi |
|---|---|
| **ФМ (fiskal modul)** | OFD beradigan USB kalit yoki smart-karta. Chekni shifrlab imzolaydi, xotirasida saqlaydi. Seriya raqami — `FactoryID` (36 belgi) va `TerminalID`. |
| **OFD** | Fiskal ma'lumotlar operatori (ofd.uz / ofd.soliq.uz). Chekni qabul qilib tasdiq (Ack) fayli qaytaradi. |
| **Virtual kassa** | Kassa dasturi (E-POS) + ФМ. Chek JSON ko'rinishida ФМ ga beriladi. |
| **Z-hisobot (smena)** | Kassa smenasi. Chek yozishdan oldin smena ochiq bo'lishi kerak; smenada kamida 1 amal bo'lsa yopiladi. |
| **Sync / Ack** | ФМ dagi cheklar OFD ga yuboriladi, OFD tasdiq faylini qaytaradi, ФМ shuni qabul qilib chekni o'z xotirasidan o'chiradi. |
| **2 kun qoidasi** | ФМ da yuborilmagan cheklar 2 kundan ortiq tursa, ФМ yangi chek yozmaydi (xato 9031). |
| **IKPU (MXIK)** | Mahsulot/xizmat identifikatsiya kodi (17 raqam), soliq tasnifidan (tasnif.soliq.uz). |
| **Qadoq kodi** | O'lchov birligi/qadoq kodi, har bir IKPU uchun cheklangan ro'yxatdan. |
| **Markirovka kodi** | Raqamli markirovka (DataMatrix/GS1); sotishda chekka yoziladi, sotilgan kod qayta sotilmaydi. |
| **QR havola** | `https://ofd.soliq.uz/check?t={terminalId}&r={chekRaqami}&c={vaqt}&s={fiskalBelgi}`; chekka QR sifatida bosiladi. |
| **Tiyin** | Barcha summalar tiyinda (1 so'm = 100 tiyin). |
| **QQS** | 0% yoki 12% (boshqa stavka rad etiladi). Narx ichiga kiritilgan: `qqs = narx × % / (100 + %)`. |

---

## 3. E-POS qismlari va ularning joylashuvi

```
┌─ E-POS Cashdesk (Electron)   – kassir dasturi, o'z mahalliy serveri :8347 (bizga kerak emas)
├─ E-POS Communicator (Electron) – UzPOS API serveri :8347, ichki bildirishnoma kanali :8080 (WebSocket)
├─ FiscalDriveService  (Windows xizmati, nssm) – ФМ ga REST :3449 (yangi, ФМ 0400)
├─ FiscalDriveAPI      (Windows xizmati, nssm) – ФМ ga JSON-RPC :3448 (eski)
└─ E-POS bulut: api.my.epos.uz, evergreen.epos.uz, api.epos.uz – katalog, markirovka tekshiruvi, hisobot
```

- **Cashdesk va Communicator ikkalasi ham `8347` portini egallaydi** (ichki server). Ikkalasini bir vaqtda ishlatmang; Communicator port band bo'lsa uni egallagan jarayonni o'ldiradi [kod].
- Communicator o'rnatilgan joyi (foydalanuvchi darajasida): `%LOCALAPPDATA%\Programs\epos-communicator\`.
- Ma'lumotlar: `%USERPROFILE%\.EPOS\` — `database\` (SQLite, MXIK bazasi), `logs\`, `invoices\`, `qrs\`, `manager.ini`; jurnal: `%APPDATA%\epos-communicator\logs\main.log`.
- Dastur kodi (asar ichida): `epos-communicator-backend/` (Express + Sequelize/SQLite), `epos-communicator-frontend/` (React oynasi).
- FiscalDriveService / FiscalDriveAPI: `C:\Program Files\FiscalDriveService\` va `...\FiscalDriveAPI\` (`config.ini` — OFD serverlari: `s0/s1/s2.ofd.uz:3447`, `ofd1-4.yt.uz:3447`; `[api] address=127.0.0.1:...`). Administrator huquqi bilan o'rnatiladi.

### Port va ФМ moslashtirish (`manager.ini`)
Communicator ФМ larni `~\.EPOS\manager.ini` orqali portga bog'laydi: `3448=<FactoryID>`, `3449=<FactoryID>`, `3450=...`. So'rovdagi `port` maydoni qaysi ФМ ishlatilishini tanlaydi (bitta kompyuterga bir nechta ФМ ulash mumkin). Ruxsat etilgan qiymatlar faqat **3448, 3449, 3450**. Standart — 3448 [kod].

---

## 4. Fiskal modul qatlami (Communicator ФМ bilan qanday gaplashadi)

Communicator avval **v4 (FiscalDriveService, `127.0.0.1:3449`)** ga `FiscalDrive/List` yuboradi; javob bo'lmasa **v3 (FiscalDriveAPI, JSON-RPC `3448`)** ga o'tadi [kod]. Xato bo'lsa: `FISCAL_DRIVER_IS_NOT_WORKING`.

### v4 (REST) asosiy amallar [kod + hujjat]
| Endpoint | Vazifa |
|---|---|
| `POST /FiscalDrive/List` | Ulangan ФМ lar (`FactoryID`, `ReaderName`, `AppletVersion`) |
| `POST /FiscalDrive/Info/{id}`, `/FiscalMemory/Info/{id}` | Holat, chek/smena hisoblagichlari, xotira |
| `POST /FiscalDrive/ZReport/Open/{id}`, `/Close/{id}`, `/Info/{id}` | Smena ochish/yopish/ma'lumot |
| `POST /FiscalDrive/Receipt/GetTXID/{id}` (JSON chek) | Chekni FМ ga **yozishdan oldin** bazaga saqlaydi, `TXID` qaytaradi |
| `POST /FiscalDrive/Receipt/RegisterTXID/{id}` (`TXID`) | Chekni ФМ da **ro'yxatdan o'tkazadi**: `TerminalID, ReceiptSeq, DateTime, FiscalSign, QRCodeURL` |
| `POST /FiscalDrive/State/Sync/{id}` | ФМ holatini serverga moslash (vaqt, blok ochish) |
| `POST /DataBase/Files/Sync/FullReceipts|Receipts|ZReports/{id}` | Cheklarni OFD ga yuborish va tasdiqni ФМ ga qaytarish |
| `POST /DataBase/Files/Count`, `/List/{id}/{limit}/{offset}` | Yuborilmagan/tasdiqlanmagan cheklar soni |

### Chek yozish ketma-ketligi (sale) [kod]
1. Communicator chekni tekshiradi (sxema, QQS, IKPU, qadoq, markirovka, naqd cheklovi).
2. `GetTXID` — chek JSON (`Time, Type=0, Operation=0, Items[], ReceivedCash, ReceivedCard, ExtraInfo, Location`) → `TXID`.
3. `POS/Challenge/{id}` → `challenge`; sarlavha `X-POS-Auth = SHA-256(maxfiyKalit + challenge)`.
4. `RegisterTXID` (sarlavha bilan) → `ReceiptSeq`, `FiscalSign`, `QRCodeURL`.
5. Orqa fonda: `State/Sync` → `Sync/FullReceipts` → `Sync/Receipts` → `Sync/ZReports` (OFD ga yuborish).
6. Communicator chekni o'z bazasiga yozadi (`paycheck`, `paycheck_items`, markirovka kodlari bilan) va chop etadi (agar sozlangan bo'lsa).
- Qayta chaqirish xavfsiz: aloqa uzilsa `RegisterTXID` ni takrorlash dublikat yaratmaydi (ФМ eski natijani qaytaradi) [hujjat].

### POS-lock (muhim!)
ФМ ni maxfiy kalit bilan **POS-tizimga bog'lash** mumkin (`POS/Lock`). Bog'langach har bir amal `X-POS-Auth` ni talab qiladi, kalitsiz amal rad etiladi: xato **9092** (ФМ allaqachon bog'langan) va **9093** (to'g'ri kalit kerak). E-POS o'z kalitini Communicator ga joylagan [kod]. Demak, E-POS ФМ sini olgan bo'lsangiz, uni faqat E-POS orqali boshqarasiz; boshqa dastur to'g'ridan-to'g'ri yoza olmaydi. Blokdan chiqarish faqat OFD operatori buyrug'i bilan.

---

## 5. UzPOS protokoli (Communicator API)

`POST http://localhost:8347/uzpos`, `Content-Type: application/json`. Tana — JSON obyekt (yoki JSON qatori):

```json
{ "token": "<protokol tokeni>", "method": "sale", "port": 3448, "params": { ... } }
```

- `token` majburiy; noto'g'ri bo'lsa `WRONG_TOKEN`. Token Communicator o'z interfeysida ham yuboriladi, ya'ni protokolning umumiy tokeni (Ishonch: `UzposClient.ProtocolToken`).
- `port` — qaysi ФМ (3448/3449/3450); berilmasa 3448.
- CORS ochiq (`*`), `GET /uzpos` rad etiladi ("method type GET").
- **Javob** doim HTTP 200: `{ "error": false, "message": ... }` yoki `{ "error": true, "message": "XATO_KODI \n Ru: matn" }`.

### Metodlar (to'liq ro'yxat, `method-handlers.js`)
| Guruh | Metodlar |
|---|---|
| **Sotuv** | `sale`, `fastSale`, `credit` (kredit), `advance` (avans), `saleEPS`, `creditEps`, `advanceEps` |
| **Qaytarish** | `refund`, `refundEPS` |
| **Smena** | `openZreport`, `closeZreport`, `getZreportInfo`, `getZReportInfoByNumber`, `getZReportCount`, `getZReportsStats`, `getZReportsStatus`, `sendZReportByNumber` |
| **Holat** | `getVersion`, `getStatus`, `checkStatus`, `getDeviceId`, `getFiscalsList`, `getInfo`, `getReceiptCount`, `getUnsentCount`, `getAckCount` |
| **Cheklar** | `getReceiptInfo`, `getReceiptInfoByNumber`, `getReceiptInfoByFiscalSign`, `getReceiptsInfoByDate`, `getLastRegisteredReceipt`, `printLastPaycheck`, `printReceipt`, `retrieveCheques`, `retrieveOneCheque`, `checkReceiptIfExists` |
| **OFD** | `sendReceipt`, `acknowledge`, `rescanReceipts`, `resendUnsent`, `syncWithOfd` |
| **Tasnif/markirovka** | `setMxik`, `getICPCPackage`, `validationMarking`, `validationMultipleMarking`, `onlineLabelValidation`, `getPouringPackagesCode`, `openForPouring` |
| **Sozlama** | `settingsGet`, `settingsUpdate`, `setCashNumber`, `getEpsSettings`, `updateEps` |
| **To'lov (EPS)** | `epsPayment`, `epsPaymentCancel`, `getYuzPayTerminalList`, `cancelLastTransaction`, `closeDayPinPad` |

### `sale` so'rovi (maydonlar) [kod]
```json
{
  "token": "...", "method": "sale", "port": 3448,
  "params": {
    "items": [{
      "classCode": "12345678901234567",   // IKPU (MXIK), 17 raqam, majburiy
      "packageCode": "1501",               // qadoq kodi, majburiy
      "name": "Tovar nomi",
      "price": 15000000,                   // qator jami, TIYINDA
      "amount": 1000,                      // miqdor ×1000 (1 dona = 1000)   [taxmin]
      "vat": 1607143, "vatPercent": "12",  // QQS tiyinda (narx ichida), faqat "0" yoki "12"
      "ownerType": 0, "discount": 0, "other": 0,
      "label": "0104780000000001215...",   // markirovka kodi (markirovkali tovarda majburiy)
      "barcode": "4780000000001",
      "commissionTIN": ""                  // 9 (INN) yoki 14 (PINFL) raqam
    }],
    "receivedCash": 15000000, "receivedCard": 0,   // tiyinda; yig'indisi chek jamiga teng
    "externalId": "1C-hujjat-id", "paycheckNumber": "", "note": ""
  },
  "payType": 0, "usePinPad": false,
  "extraInfo": { "tin": "", "pinfl": "", "phoneNumber": "", "carNumber": "" },
  "location": { "latitude": 41.29, "longitude": 69.21 }
}
```
**Javob:** `{ "error": false, "info": { "terminalId", "receiptSeq", "fiscalSign", "dateTime", "qrCodeURL" }, "paycheck": "...", "qrPath": "...", "virtualNumber": "..." }`.

### `sale` da Communicator tekshiradigan qoidalar [kod]
1. Sxema (yup): `price`, `amount`, `vat`, `vatPercent`, `name` majburiy.
2. QQS: `|hisoblangan − vat| ≤ 10` tiyin; stavka faqat 0 yoki 12.
3. IKPU Communicator MXIK bazasida bo'lishi shart (aks holda: "Коды ИКПУ ... не найдены"; baza avtomatik yangilanishga urinadi).
4. Qadoq kodi shu IKPU ning ruxsat etilgan qadoqlari ichida (yo'q bo'lsa `tasnif.soliq.uz` dan so'raladi).
5. **Naqd cheklovi** (`cash_sale` bayrog'i): ba'zi IKPU lar uchun naqd to'lov taqiqlangan; ba'zilarida qator summasi `2 500 000 000` tiyindan (25 mln so'm) oshsa naqd taqiqlanadi.
6. **Markirovka:** IKPU markirovkali guruhda bo'lsa `label` bo'sh bo'lishi mumkin emas; kod formati va uzunligi guruhga mos kelishi kerak (9-bo'lim); bir chekda takror kod rad etiladi; **avval sotilgan kod rad etiladi** (Communicator o'z bazasidan qaraydi).
7. Sozlama yoqilgan bo'lsa **onlayn tekshiruv**: `api.my.epos.uz/.../check-label` (kod hozir kimda ekanini E-POS serveri soliq markirovka tizimidan so'raydi).
8. Chop etish yoqilgan bo'lsa printer o'rnatilgan bo'lishi kerak.

---

## 6. Tashqi servislar xaritasi (Communicator kimlar bilan gaplashadi)

| Servis | Manzil | Nima uchun |
|---|---|---|
| **Soliq: tasnif** | `https://tasnif.soliq.uz/api/cl-api/integration-mxik/get/information?mxikCode=...&type=1&terminalId=...` | IKPU uchun qadoq kodlarini tekshirish |
| **Soliq: OFD tekshirish** | `https://ofd.soliq.uz/check?t=&r=&c=&s=` | Chek QR havolasi |
| **OFD serverlari** | `s0/s1/s2.ofd.uz:3447`, `ofd1-4.yt.uz:3447` (FiscalDriveService `config.ini`) | Cheklarni yuborish (TCP) |
| **E-POS: MXIK bazasi** | `https://evergreen.epos.uz/mxik-list/mxik-version/` va `.../compressed-mxik-with-package-codes-v2/` | ~580 ming qatorli IKPU+qadoq bazasi (zstd siqilgan, ~68 MB), versiya bo'yicha avtomatik yangilanadi |
| **E-POS: markirovka guruhlari** | `https://api.my.epos.uz/api/v1/tasnif-products/markcode-categories?lastUpdatedAt=` | Qaysi IKPU markirovkali va qaysi guruhda |
| **E-POS: onlayn tekshiruv** | `https://api.my.epos.uz/api/v1/cashdesks-panel/check-label` (`ownerTin, terminalId, isRefund, products[]`) | Markirovka kodini soliq tizimida tekshirish |
| **E-POS: boshqaruv paneli** | `https://api.my.epos.uz/api/v1/cashdesks-panel/push-data/receipts|reports` | Cheklar va hisobotlarni E-POS paneliga yuborish |
| **E-POS: kassa ro'yxati** | `http://api.epos.uz/v1/clients/{deviceId}/number/`, `.../v1/info/` | Kassa/korxona (INN, nom) ma'lumotlari, applet versiyasi |
| **Vaqt** | `https://www.google.com` (HEAD) | Kompyuter soatini tekshirish (ФМ 2 kunlik tafovutni qabul qilmaydi) |
| **Internet** | `https://epos.uz` | Ulanish tekshiruvi |
| **To'lov provayderlari** | Click, Payme, Uzum (Apelsin), Paynet, Alif, Beepul, YuzPay, Anor; Humo pinpad | EPS to'lovlar (QR/telefon bilan), cheklar fiskallangach provayderga FP yuboriladi |

Communicator ning o'z **identifikatsiyasi**: kassa `sha256(FactoryID + port)` kaliti bilan E-POS serverida ro'yxatdan o'tadi; INN va korxona nomi shu orqali olinadi. Ya'ni E-POS akkaunti (korxona ro'yxatdan o'tgan) bo'lmasa onlayn tekshiruv va panelga yuborish ishlamaydi.

---

## 7. Fiskal xizmat va emulyator bilan xavfsiz sinash [hujjat]

Haqiqiy chek yaratmasdan sinash uchun FiscalDriveService ning o'z sinov rejimlari bor (`fiscal-drive-service.exe`):

1. `devtool test-server -e 7` — sinov OFD serveri (TCP 13447, holat API si 13448). Faqat sinov ФМ (`ZZ000000000000`) cheklarini qabul qiladi.
2. `devtool fiscal-drive-emulator` — ФМ emulyatori (TCP 4387; xotira RAM da, har safar yangi `FactoryID`; `--fail-apdu 001700 --fail-chance 25` bilan aloqa uzilishini taqlid qilish).
3. `api config.ini -o - -e 7 --server-address 127.0.0.1:13447 --use-fiscal-drive-emulator-address 127.0.0.1:4387` — REST API (swagger: `http://127.0.0.1:3449/swagger/index.html`).
4. Swagger orqali: `FiscalDrive/List` → `FactoryID`; `State/Sync` (avval `13448/state` da `ChangeLockState=Yes, LockState=Unlock`); `ZReport/Open`; `Receipt/GetTXID` → `RegisterTXID`.

Hujjat bo'yicha bu buyruqlar administrator cmd sida ishga tushiriladi; test-server/emulyator o'zi alohida port ochadi. Tarmoq/DB yozish huquqi bo'lgan papkada, o'z konfiguratsiya nusxasi bilan ishlatish mumkin [taxmin].

**Tartib:** emulyator → UzPOS `getStatus` → `openZreport` → kichik `sale` → `getLastRegisteredReceipt` → `refund` → `closeZreport`.

---

## 8. Smena, sinxronlash va yuborilmagan cheklar

- Chek yozishdan oldin **smena ochiq** bo'lishi shart (`openZreport`); aks holda "Z отчет не открыт" (`ERROR_ZREPORT_IS_NOT_OPEN`). Smenada kamida bitta amal bo'lsa `closeZreport` ishlaydi; bo'sh smenani yopib bo'lmaydi.
- Smena hajmi: bitta smenada **29999 gacha** amal; chek/smena xotirasi to'lsa (≈10 smena qolganda) Communicator ogohlantiradi.
- Cheklar **avtomatik** OFD ga yuboriladi (har chekdan keyin orqa fonda); qo'lda: `syncWithOfd`, `sendReceipt`, `resendUnsent`, `rescanReceipts`. Holat: `getUnsentCount`, `getAckCount`.
- ФМ da yuborilmagan cheklar 2 kundan oshmasin (9031). Internet uzilganda ham sotish davom etadi, lekin tez orada yuborish kerak.

---

## 9. Markirovka (DataMatrix) qoidalari [kod]

IKPU ning birinchi 11 raqami markirovka guruhini aniqlaydi (E-POS `label-categories` bazasi). Kod avval tozalanadi (`GS`/`\u001d`, klaviatura nomlari olib tashlanadi), keyin guruh bo'yicha qisqartiriladi:

| Guruh | "Iste'molchi" (dona) uzunligi | Guruh qadoq |
|---|---|---|
| Tamaki | 21 | 25 |
| Alkogol | 25 | 31 |
| Pivo | 25 | 31 |
| Dori vositalari | 31 | — |
| Maishiy texnika | 38 | — |
| Suv/salqin ichimlik | 31 | 31 |

- Tozalangan kod `^[0-9A-Za-z!"%&'()*+,-./_:;=<>?]{18,}$` ga mos bo'lishi shart.
- **Takror sotuv himoyasi:** Communicator har sotilgan kodni `paycheck_items` da saqlaydi; xuddi shu kod yana sotilsa rad etadi. `validationMarking` shuni sotishsiz tekshiradi: `{ isValidMarking, alreadySold, originalMarking, cutMarking }`.
- **Qaytarishda** kod bazadagi sotuv bilan solishtiriladi (onlayn tekshiruvda `isRefund=true`).
- **Ulgurji va chakana:** chakana sotuvda kod chekka yoziladi va tizimda "sotilgan" bo'ladi; korxonalar orasidagi ulgurji o'tkazma ESF (elektron hisob-faktura) orqali. Ishonch ning markirovka tekshiruvi `my.soliq.uz` tarixidan oxirgi operatsiyani o'qiydi (ulgurji → sotsa bo'ladi, chakana → sotilgan).
- Eslatma: kodni sotish uchun **bizning STIR** da (ulgurji) turgan bo'lishi kerak; Ishonch paneli bazaning INN ini STIR sifatida avtomatik yozadi.

---

## 10. IKPU (MXIK / tasnif) va qadoq

- 1C dagi tovarda IKPU (17 raqam) bo'lishi kerak. Bo'lmasa: markirovkali tovar uchun **birinchi kodning `my.soliq.uz` markirovka tarixidagi "MXIK" maydoni** ishlatiladi (Ishonch shuni qiladi), keyin qo'lda tasdiqlanadi.
- Qadoq kodi Communicator MXIK bazasidan olinadi: `getICPCPackage { classCode }` → `[{ code, nameLat }]`. Bazada yo'q bo'lsa `tasnif.soliq.uz` API sidan.
- Har bir tovar uchun IKPU + qadoq **bir marta** aniqlanib saqlanadi (Ishonch: `uzpos-map-<baza>.json`); keyingi sotuvlarda so'ralmaydi.
- QQS: 12% standart; ba'zi tovarlar 0%. Kerakli bo'lsa 1C nomenklaturasidagi QQS stavkasi bilan almashtiring.
- Soliq tasnif sahifasidagi o'zgarishlar (yangi IKPU, o'zgargan qadoq) E-POS bazasida versiya bo'yicha yangilanadi; "IKPU topilmadi" chiqsa `setMxik`/yangilash yoki E-POS qo'llab-quvvatlashi.

---

## 11. 1C bilan qanday bog'lanadi

**Muammo.** 1C serveri (masalan `tas-1cbuxapp-01`) boshqa kompyuterda; lekin Communicator va ФМ **kassa kompyuteringizda** (`localhost`). 1C serveri `localhost:8347` ga yeta olmaydi.

**Standart 1C yo'li:** 1C da UzPOS ga ulanuvchi qo'shimcha (HTTP so'rov yoki tashqi komponenta) bo'lsa, u kassa kompyuterida ishlashi kerak (1C klient tomonida).

**Ishonch yo'li (qurilgan):** 1C web-mijozi Ishonch dasturida ochiladi; Ishonch uning yoniga panel qo'yadi.
1. Markirovka paneli chekni yig'adi (tovar, miqdor, narx, markirovka kodlari 1C ga o'tkaziladi).
2. Panelda **E-POS orqali sotish** tugmasi (faqat Ishonch dasturida ko'rinadi).
3. Bosilganda dastur sotish oynasini ochadi: tovarlar, IKPU/qadoq (avtomatik to'ldiriladi), to'lov (naqd/karta), "HAQIQIY fiskal chek" tasdiq belgisi.
4. Tasdiqdan keyin `sale` yuboriladi; natija (chek raqami, FP, QR) panel jurnaliga yoziladi.
5. Bir 1C cheki ikkinchi marta sotilmaydi (`uzpos-sold-<baza>.json`).
- Ma'lumot manbai: paneldagi holat (1C ga **aynan o'tkazilgan** miqdorlar va shu chekning kodlari). 1C hujjat jadvali virtual (faqat ko'rinadigan qatorlar), shuning uchun u asosiy manba qilinmagan.
- **Keyingi qadam [taxmin/kerak]:** chek natijasini (FP, chek raqami) 1C hujjatining izohiga yozish; qaytarish uchun original chek ma'lumotini saqlash.

---

## 12. Qaytarish (refund)

`refund` metodi original chek ma'lumotini talab qiladi:
```json
"refundInfo": { "terminalId": "...", "receiptSeq": "...", "dateTime": "...", "fiscalSign": "..." }
```
- Bu to'rt maydon sotuv javobidan olinadi (`info.*`). **Sotuvda ularni albatta saqlang** (1C hujjatida yoki Ishonch jurnalida), aks holda qaytarish imkonsiz.
- Noto'g'ri `refundInfo` bo'lsa chek yozilmaydi (xato).
- ФМ da yetarli naqd/karta/QQS summasi bo'lishi kerak (`ERROR_NOT_ENOUGH_CASH/CARD/VAT_FOR_REFUND`).
- EPS (QR) to'lov bo'lsa Communicator provayderga qaytarishni ham yuboradi (`eps_id`).

---

## 13. Xatolar katalogi (asosiylari)

**Communicator (`error.message`):** `WRONG_TOKEN`; `NO_SUCH_METHOD_AVAILABLE`; `PORT_VALUE_NOT_AVAILABLE`; `FACTORY_ID_NOT_PROVIDED_IN_MANAGER_INI`; `FISCAL_DRIVER_IS_NOT_WORKING` (xizmat to'xtagan yoki ФМ yo'q); `UNSUPPORTED_REQUEST_FORMAT_PRICE|CLASS_CODE|PACKAGE_CODE|CLASS_CODE_LENGTH`; "Неправильная сумма НДС"; "Коды ИКПУ ... не найдены"; "Поле маркировки не может быть пустым"; "код маркировки недействителен / дублируется"; "Наличный расчёт запрещён"; `INSTALL_'<printer>'_PRINTER`.

**ФМ (v4 `Reason`):**
| Kod | Ma'nosi |
|---|---|
| 9000 | Muvaffaqiyat |
| 9021–9023 | Smena ochilmagan / yopilmagan / allaqachon yopilgan |
| 9030 | Vaqt oxirgi amaldan oldin yoki teng |
| 9031 | ФМ da cheklar 2 kundan ortiq; OFD ga yuboring |
| 9032 | Bo'sh smenani yopib bo'lmaydi |
| 9033 | Maksimal chek raqami; ФМ ni almashtiring |
| 9034–9037 | Qaytarish/QQS summasi yetmaydi yoki limitga yetdi |
| 9040–9045 | Smena/fiskal xotira limitlari (29999 amal va h.k.) |
| 9090 | ФМ bloklangan: `State/Sync` kerak |
| 9091 | Vaqt oxirgi amaldan 2 kundan oshiq: kompyuter soatini to'g'rilang |
| 9092 / 9093 | ФМ POS-kalit bilan bog'langan / to'g'ri kalit kerak |
| 90F0 / 90F1 / 90FF | Smena / chek / umumiy xotira to'lgan: sinxronlang yoki almashtiring |

---

## 14. Xavfsizlik va ehtiyot choralari

- **Token** protokolning umumiy tokeni; uni maxfiy hisoblamang, lekin Communicator `localhost` da ochiq (CORS `*`): ishonchsiz sahifa brauzeringizdan unga so'rov yuborishi mumkin. Kompyuterda begona sahifalar bilan ehtiyot bo'ling.
- Communicator va FiscalDriveService kodida **qattiq yozilgan maxfiy kalitlar** bor (POS-lock kaliti, ichki JWT). Ularni ko'chirmang, boshqa joyda ishlatmang.
- **Haqiqiy chek qaytarib bo'lmaydi.** Ishonch: tasdiq belgisi + savol oynasi + takroriy sotuvdan himoya.
- Yuborishdan oldin 1C chekini "sotilgan" deb belgilash (aloqa uzilsa ham ikkinchi marta yuborilmasin); javob kelmasa Communicator dagi so'nggi chekni (`getLastRegisteredReceipt`) tekshiring.
- Internetga ulanish va to'g'ri soat shart. UPS tavsiya etiladi (DB buzilmasligi uchun).
- E-POS ichki API si (Cashdesk) hujjatlanmagan va versiyaga bog'liq; Communicator UzPOS API si barqarorroq.

---

## 15. O'rganish yo'li (qadamma-qadam)

1. **Tushunchalar** (2-bo'lim): ФМ, OFD, smena, sync, IKPU, qadoq, markirovka.
2. **FiscalDriveService README** ni o'qing (github.com/qo0p/fiscal-drive-service): REST API va chek JSON maydonlari.
3. **Emulyatorni ishga tushiring** (7-bo'lim) va swagger orqali bitta sinov chekini qo'lda yozing (`GetTXID` → `RegisterTXID`). Natijani (FP, QR) ko'ring.
4. **Communicator** ni ulang: `getVersion` → `getStatus` → `openZreport` → `sale` (kichik summa) → `getLastRegisteredReceipt`.
5. **`getICPCPackage` va `validationMarking`** bilan IKPU/qadoq/kodlarni sotishsiz tekshirishni mashq qiling.
6. **Qaytarish**: sotuv javobini saqlab, `refund` ni sinang; `closeZreport`.
7. **Haqiqiy ФМ**: OFD dan ФМ olish, E-POS da korxona ro'yxatdan o'tkazish (INN), MXIK bazasi yuklanishini kuting (birinchi ishga tushishda ~1 daqiqa), soatni tekshiring.
8. **Ishonch bilan birga**: 1C dan chek yig'ing → "E-POS orqali sotish" → natijani tekshiring.
9. **Huquqiy tomon:** faqat ro'yxatdan o'tgan qurilma/dastur ishlatilishi mumkin (PKM №943, 23.11.2019); o'z dasturingizni virtual kassa qilib ro'yxatdan o'tkazish og'ir jarayon, shuning uchun ro'yxatdagi vendor (E-POS) orqali ishlash tavsiya etiladi. B2B "Реализация" da kassa cheki kerakmi yoki ESF yetadimi, buni soliq maslahatchisi bilan aniqlang.

---

## 16. Ishonch dasturida qurilgan qismlar

| Qism | Fayl |
|---|---|
| UzPOS mijozi (`getVersion/getStatus/getICPCPackage/validationMarking/sale`) | `IshonchDesktop/Epos/UzposClient.cs` |
| Chek qatorlarini UzPOS shakliga o'girish (tiyin, QQS, markirovka qatorlari) | `Epos/SaleBuilder.cs` |
| 1C chekini o'qish, IKPU xotirasi, takroriy sotuv jurnali | `Epos/MarkingReceipt.cs`, `SaleBuilder.cs` (`ProductMap`, `SoldLog`) |
| Sotish oynasi | `UI/CommunicatorTab.cs` (`SaleDialog`) |
| Paneldagi tugma va `eposSale` so'rovi | `markirovkani togirlash/content.js`, `Marking/MarkingSession.cs` |
| MXIK ni soliq tarixidan olish | `Marking/SoliqBridge.cs` (`LookupProductAsync`) |
| Testlar (soxta Communicator, 50 dan ortiq tekshiruv) | `tests/UzposTests` |

**Sinalgan:** so'rov shakllari, tiyin/ming birliklari (kod bo'yicha), QQS chegarasi, tasdiqsiz yuborilmasligi, haqiqiy Communicator `getVersion/getStatus`, sotish oynasining ochilishi.
**Sinalmagan (ФМ va OFD kerak):** haqiqiy `sale`, `validationMarking`, `getICPCPackage`, qaytarish, smena. Birinchi haqiqiy chekda `amount` (1 dona = 1000) va `price` (qator jami, tiyin) taxminini tekshiring.
