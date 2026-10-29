# Ishonch log yig'uvchi (IshonchLogs.exe)

Barcha kompyuterlardagi Ishonch dasturlaridan kelgan xato va ogohlantirishlarni bir joyga yig'adi:
qaysi firmada, qaysi bo'limda (markirovkali avto, markirovkasiz, E-POS, soliq, Elektr…), qachon va qanday matn bilan.
Faqat egasining kompyuterida ishlaydi — muammoni ko'rish uchun Ishonch ning yangi versiyasini chiqarish shart emas.

## Qanday ishlaydi

1. Ishonch har bir ogohlantirish/xatoni o'z kompyuterida `%APPDATA%\Ishonch\problems.jsonl` ga yozadi
   (vaqt, baza, firma, INN, server, kompyuter, Ishonch versiyasi, xabar, stack trace va undan oldingi 40 ta `app.log` qatori).
   Bir xil muammo (raqamlarigacha farq qilmasa) bir daqiqada bir martadan ko'p yozilmaydi.
2. Ishonch ichida **Yordam → «Xatolar jurnali (yig'uvchi)…»** da yig'uvchi manzili berilgan bo'lsa, yozuvlar
   har daqiqada (yangi xato bo'lsa ~5 soniyada) `POST <manzil>/api/problems` bilan shu dasturga yuboriladi.
   Tarmoq bo'lmasa faylda qoladi va keyin yuboriladi. Manzil bo'sh bo'lsa hech qayerga yuborilmaydi.
3. IshonchLogs.exe yozuvlarni `%LOCALAPPDATA%\IshonchLogs\inbox\yyyy-MM.jsonl` ga saqlaydi (bir xil yozuv ikki marta qo'shilmaydi)
   va firma → muammo guruhi ko'rinishida ko'rsatadi.

## Sozlash

1. IshonchLogs.exe ni oching. Birinchi marta Windows «Брандмауэр» ruxsat so'rasa — **Частные сети** ga ruxsat bering.
2. **Sozlamalar…** → «Yangi kalit» → Saqlash. Pastki satrda shu kompyuter manzili ko'rinadi, masalan `http://192.168.1.10:5077`.
3. Manzil va kalitni Ishonch ga bir marta o'rnating — keyingi release dan boshlab hamma kompyuterda o'zi ishlaydi:
   GitHub → repozitoriy → **Settings → Secrets and variables → Actions**:
   - **Variables** → `LOG_COLLECTOR_URL` = `http://<sizning manzilingiz>:5077`
   - **Secrets** → `LOG_COLLECTOR_KEY` = yig'uvchidagi kalit

   Release yig'ilganda ular exe ichiga yoziladi (kodga va repozitoriyga tushmaydi). Manzil o'zgarsa — o'zgaruvchini
   yangilab, yangi release chiqaring.
4. Bitta kompyuterda boshqa manzil kerak bo'lsa (yoki release dan oldin sinash uchun): Ishonch → Yordam →
   «Xatolar jurnali (yig'uvchi)…» → manzil va kalit → **Sinash** («Ulandi») → Saqlash. Kiritilgani o'rnatilganidan ustun;
   maydon tozalansa o'rnatilganiga qaytadi.

Kalit exe ichida bo'lgani uchun uni to'liq sir deb bo'lmaydi: u faqat begona so'rovlarni to'sadi. Kalit tarqalib ketsa —
yig'uvchida yangisini qo'ying va `LOG_COLLECTOR_KEY` ni yangilab release chiqaring.

Kompyuterlar boshqa binoda bo'lsa, ular sizning kompyuteringizga yetib borishi kerak: bir xil lokal tarmoq, VPN
(masalan Radmin VPN / ZeroTier) yoki routerda port ochish (5077). Ma'lumot uchinchi tomon serveriga yuborilmaydi.

## Ko'rish

- Chapda: firmalar (jami, oxirgisi qachon), ichida bir xil muammolar guruhi — «2-chek: panel javob bermadi» va
  «3-chek: …» bitta guruh (raqamlar va «…» ichidagi qiymatlar hisobga olinmaydi). Qizil — xato, to'q sariq — ogohlantirish.
- Tepada filtr: sana oralig'i, firma, bo'lim, daraja, qidiruv (bir nechta so'z — hammasi mos kelishi kerak).
- O'ngdagi yozuvni ikki marta bosing — to'liq ma'lumot: stack trace va undan oldingi `app.log` qatorlari, «Nusxalash».
- Firma INN bo'yicha birlashtiriladi; faqat INN bilan kelgan (soliq) yoki faqat baza nomi bilan kelgan (eski app.log) yozuvlar ham shu firmaga tushadi.

## Eski versiyalar va qo'lda olingan fayllar

**Fayl qo'shish…** bilan istalgan kompyuterdan olingan faylni qo'shish mumkin (Telegram orqali yuborilgan bo'lsa ham):
- `problems.jsonl` (yoki `problems.jsonl.old`) — yangi Ishonch dan;
- `app.log` — muammolar jurnali hali yo'q eski Ishonch (0.7.6 va oldingi) dan: «XATO …», «✗», «xato», «bo'lmadi», «topilmadi»
  bor qatorlar olinadi; app.log da faqat vaqt bor, sana — faylning o'zgargan kuni. Kompyuter nomi o'rnida fayl nomi
  ko'rinadi, shuning uchun faylni oldin `BUX-PC-07-app.log` kabi qayta nomlash qulay.

Namuna fayllar: `samples\` (ikki o'ylab topilgan firma va eski app.log).

## Yig'ish va testlar

```
dotnet publish IshonchLogs/IshonchLogs.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o publish-logs
dotnet run -c Release --project IshonchLogs/tests/LogsTests/LogsTests.csproj
```

Ishonch ni qo'lda manzil bilan yig'ish: `LogCollectorUrl` va `LogCollectorKey` muhit o'zgaruvchilari (yoki `-p:LogCollectorUrl=…`).

Testlar: fayllarni o'qish (buzilgan qatorlar, eski app.log), guruhlash, filtr, takrorsiz saqlash, HTTP (kalit, 400/401)
va Ishonch tomoni — `ProblemLog` yozadi → `ProblemSender` yuboradi → yig'uvchida ikki firma alohida guruhlanadi.

## HTTP

| | |
|---|---|
| `GET /api/ping` | `ok` (kalit to'g'ri bo'lsa) |
| `POST /api/problems` | tana: JSON massiv (yoki bitta obyekt) — `problems.jsonl` qatorlari; javob `{"received":N,"added":M}` |

Kalit `X-Ishonch-Key` sarlavhasida. Sozlamalar: `%LOCALAPPDATA%\IshonchLogs\settings.json` (`Port`, `Key`).
Boshqa papka kerak bo'lsa — `ISHONCH_LOGS_DIR` muhit o'zgaruvchisi.
