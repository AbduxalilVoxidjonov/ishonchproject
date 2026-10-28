# E-POS Communicator orqali sotish (Ishonch 0.4.0)

Sana: 2026-10-28. Manba: o'rnatilgan E-POS Communicator 3.23.8 (`%LOCALAPPDATA%\Programs\epos-communicator`, faqat o'qildi), FiscalDriveService README (github.com/qo0p/fiscal-drive-service). E-POS Cashdesk kerak emas (ishlatilmaydi).

## Tizim

```
Ishonch (1C tabi + markirovka paneli)  ──►  [E-POS orqali sotish] tabi
        │   POST http://localhost:8347/uzpos   {token, method, port, ...}
        ▼
E-POS Communicator (UzPOS protokoli)  ── markirovka kodini tekshiradi, takror sotuvni to'sadi
        │   port 3448 (FiscalDriveAPI) yoki 3449/3450 (FiscalDriveService)
        ▼
Fiskal modul (USB) ──► OFD (ofd.uz / ofd.soliq.uz)
```

- Kirish (login) kerak emas: so'rovda UzPOS protokolining umumiy tokeni yuboriladi (Communicator o'z interfeysida ham shuni ishlatadi).
- `localhost:8080` — faqat ichki bildirishnoma kanali (WebSocket), API emas.

## Ishlatiladigan metodlar

| Metod | Vazifa | Xavf |
|---|---|---|
| `getVersion` | Communicator tirikmi | yo'q |
| `getStatus` | fiskal modul ishlayaptimi | yo'q |
| `getICPCPackage {classCode}` | IKPU uchun qadoq kodlari | yo'q |
| `validationMarking {marking, classCode}` | kod yaroqlimi, avval sotilganmi | yo'q |
| `sale {params:{items[], receivedCash, receivedCard, externalId}}` | **HAQIQIY fiskal chek** | qaytarib bo'lmaydi |

Chek qatori: `classCode` (IKPU, 17 raqam), `packageCode`, `name`, `price` (tiyin), `amount` (1 dona = 1000), `vat` (tiyin, narx ichida), `vatPercent` ("12"), `label` (markirovka kodi). Markirovkali tovarda har bir dona uchun alohida qator (1 dona, o'z kodi bilan). QQS Communicator formulasi bilan tekshiriladi: `(narx×%)/(100+%)`, xato ≤ 10 tiyin.

## Ishonch dagi oqim (tugma 1C panelida)

Batafsil va to'liq qo'llanma: `fiskal/EPOS fiskallash integratsiya.md`.

Asosiy oqim: Markirovka panelidagi **E-POS orqali sotish** tugmasi (faqat Ishonch dasturida ko'rinadi) tayyor chekni dastur oynasiga uzatadi. Quyidagi bandlar shu oyna ichidagi amallar.

## Oyna ichidagi amallar

1. Bosh sahifada bazani tanlab **E-POS orqali sotish** → tab ochiladi, tepada Communicator va fiskal modul holati.
2. **1C chekidan yuklash** — Markirovkali chek paneli saqlagan holatdan o'tkazilgan tovarlar va shu chekning kodlari (`%APPDATA%\Ishonch\marking\<baza>.json`).
3. **IKPU va qadoqni to'ldirish** — IKPU (MXIK) birinchi kodning my.soliq.uz markirovka tarixidan, qadoq Communicator bazasidan; hammasi qo'lda tahrirlanadi va bir marta eslab qolinadi (`uzpos-map-<baza>.json`).
4. **Kodlarni tekshirish** — har bir kod `validationMarking` orqali (sotishsiz).
5. **Sotish** — faqat «HAQIQIY fiskal chek yaratishini tushunaman» belgilangach, jami va to'lov ko'rsatilgan savol oynasidan keyin. Chek yuborilishidan oldin 1C cheki «sotilgan» deb belgilanadi (`uzpos-sold-<baza>.json`), shuning uchun ikkinchi marta sotilmaydi. Natija (chek raqami, fiskal belgi, QR) jurnalga va `uzpos-sales.log` ga yoziladi.

## Sinovdan o'tgan va o'tmagan

- O'tgan: `tests\UzposTests` (soxta Communicator bilan 46 ta tekshiruv: so'rov shakllari, tiyin/ming birliklari, QQS chegarasi, tasdiqsiz sotuv yuborilmasligi, jami ≠ to'lov rad etilishi, aloqa yo'q holati); haqiqiy Communicator bilan `getVersion` va `getStatus`.
- O'tmagan: haqiqiy `sale`, `validationMarking`, `getICPCPackage` (fiskal xizmatlar to'xtagan, USB modul ulanmagan).
- Taxmin (birinchi haqiqiy chekda tekshiring): `amount` ming ulushda (1 dona = 1000) va `price` — qator jami tiyinda. Bu FiscalDriveService README misoliga va Communicator kodiga asoslangan (`SaleBuilder.PieceAmount`).

## Boshlashdan oldin

- [ ] FiscalDriveService (yoki FiscalDriveAPI) xizmati ishlayotgan; ikkalasi bir portda (3448), bittasi ishlasin va tabdagi "Fiskal port" shunga mos bo'lsin.
- [ ] USB fiskal modul ulangan (yoki sinov uchun emulyator: README "Порядок тестирования") va OFD da ro'yxatdan o'tgan.
- [ ] Communicator ishlayotgan (`localhost:8347`); E-POS Cashdesk bilan bir vaqtda ishlatmang, ikkalasi ham 8347 portini egallaydi.
- [ ] Birinchi sinov: emulyator yoki juda kichik chek.
