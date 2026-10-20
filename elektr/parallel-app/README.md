# HET Excel Parallel

cabinet.het.uz dagi har bir login uchun ma'lumotni **bir vaqtda (parallel)** yig'ib, Kamunalka jadvalini to'ldiradigan ilova.
Brauzer va extension kerak emas: ilova saytning o'z API'siga (`cabinet-api.het.uz`) har bir login uchun alohida sessiya bilan murojaat qiladi.

## Ishlatish

1. Ilovani oching, **Kamunalka jadvalini (.xlsx)** tanlang (login/parol shu jadvalning «Логин» va «Парол» ustunlaridan olinadi).
2. Parallel oqimlar sonini belgilang (3–5 tavsiya etiladi) va **Boshlash** ni bosing.
3. Tugagach to'ldirilgan jadval o'zi yuklanadi (`<nom>_toldirildi.xlsx`). Muvaffaqiyatsiz loginlar jadvalda o'zgarmasdan qoladi.

To'ldirish qoidalari extensiondagi bilan bir xil (`lib/jadval.js`): har bir hisoblagich alohida qator, Олдиндан тулов, №, «Тўланадиган сумма», login boshidagi 0 va h.k.

## Ishga tushirish

Node.js 20+ kerak.

```
npm install
npm start            # oyna (Electron)
npm run serve        # yoki oynasiz: brauzerda http://127.0.0.1:5177
```

## Tayyor dastur (.dmg / .exe) yig'ish

Har bir tizimda o'zida yig'iladi:

```
npm run dist:mac     # macOS da  -> dist/*.dmg
npm run dist:win     # Windows da -> dist/*.exe
```

Yoki GitHub'ga yuklab, **Actions → Build apps → Run workflow** ni bosing: ikkala tizim uchun fayl avtomatik yig'iladi.

## Tekshirish

Bitta login bilan tezkor sinov (token chiqarilmaydi):

```
node test/probe.js <login> <parol>
```

Soxta server bilan to'liq sinov: `node test/run.js <jadval.xlsx> <login fayllari papkasi> <natija.xlsx>`.

## Eslatma

- Parollar faqat xotirada turadi, diskka yozilmaydi.
- Sayt bir manzildan ko'p parallel kirishni cheklashi mumkin. Xato chiqsa oqimlar sonini kamaytiring.
- Sayt API'si o'zgarsa `src/het.js` va `src/convert.js` ni yangilash kerak bo'ladi.
