# Yangi versiya chiqarish

Dastur yangilanishni GitHub Release dan oladi: `releases/latest` dagi **Ishonch.exe** (va ixtiyoriy `Ishonch.exe.sha256`).
Tegdagi versiya (`v0.6.1`) o'rnatilgan versiyadan katta bo'lsa, foydalanuvchida «Yangi versiya mavjud» oynasi chiqadi.

## Yo'l 1 — teg bilan (tavsiya)

```bash
git tag v0.6.1
git push origin v0.6.1
```

`.github/workflows/release.yml` testlarni yurgizadi, exe ni yig'adi va release yaratadi.

## Yo'l 2 — kompyuterdan

```powershell
.\tools\release.ps1 -Version 0.6.1            # faqat publish\ ga yig'adi
.\tools\release.ps1 -Version 0.6.1 -Publish   # va GitHub Release yaratadi (gh kerak)
```

## Muhim

- Repozitoriy **yopiq** bo'lsa, boshqa kompyuterlardagi dastur yangilanishni ko'ra olmaydi. Yechim: faqat release uchun
  alohida ochiq repo (so'ng dasturda Yordam → Yangilanish sozlamalarida repo nomini o'zgartiring) yoki har bir
  kompyuterda GitHub token (Contents: Read-only).
- Repoga haqiqiy login/parollar (`elektr/Kamunalka_yangi_jadval.xlsx`) tushmasin, ayniqsa ochiq repoda.
- Foydalanuvchi ma'lumotlari (`%APPDATA%\Ishonch`, brauzer profillari) exe dan alohida, yangilanishda saqlanadi;
  yangilanishdan oldin `%APPDATA%\Ishonch\backups` ga zaxira olinadi.
- Sinov: `ISHONCH_UPDATE_API=http://127.0.0.1:PORT` soxta GitHub serveriga yo'naltiradi, `ISHONCH_DATA_DIR` ma'lumotlarni boshqa papkaga ajratadi.
