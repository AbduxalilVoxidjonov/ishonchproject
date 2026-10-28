# Markirovka (Asl Belgisi) in Uzbekistan retail and EPOS support

## 1. Operator, covered product groups, deadlines

### Takeaway
The National Information System "Asl Belgisi" is run by LLC CRPT Turon, with the State Tax Committee (Soliq) as regulator. Mandatory groups: alcohol, tobacco, beer, some household appliances, medicines, water/soft drinks. Car batteries were added Jan 2026, fertilizers and plant-protection chemicals May 2026. Dates are subject to repeated postponement.

### Cited Findings
- Operator is LLC "CRPT Turon"; producers/importers apply Data Matrix codes and enter product data (name, quantity, production/expiry date) into Asl Belgisi. — [gov.uz/soliq](https://gov.uz/ru/soliq/news/view/93824)
- Groups per Tax Committee (Oct 2025): tobacco, alcohol, beer, household appliances, medicines and medical devices, water and soft drinks. Resolution PP-296 of 06.10.2025. — [gov.uz/soliq](https://gov.uz/ru/soliq/news/view/93824)
- Spot.uz (8 Jul 2026): current groups are alcohol, tobacco, beer, some appliances, medicines, water/soft drinks. Car batteries mandatory from Jan 2026; mineral fertilizers and plant-protection chemicals from May 2026. Pilots from 1 Jul 2026: vegetable oils, vaccines, medical devices. BAD (supplements) from 1 Jan 2028. — [spot.uz](https://www.spot.uz/ru/2026/07/08/crpt-turon/)
- Spot.uz: 1 March 2026 launched a "permissive regime" for retail sale of marked goods. Water/soft-drink traceability (aggregation, codes in ESF) postponed 1 Apr 2026 -> 1 Apr 2027. — [spot.uz](https://www.spot.uz/ru/2026/07/08/crpt-turon/)
- Cabinet decision of 21 Oct 2025 changed the list: batteries (HS 8507) from 1 Jan 2026; lamps (HS 8539/8540) removed. — [spot.uz](https://www.spot.uz/ru/2025/10/23/electric-marking/) (via search snippet; not opened)
- Fines for violations from 1 Jan 2026 (turnover-based: up to 20% of net quarterly revenue for repeat violation). — [kun.uz](https://kun.uz/en/news/2025/05/26/govt-to-enforce-fines-for-labeling-violations-starting-2026); [spot.uz](https://www.spot.uz/ru/2026/07/08/crpt-turon/)
- Code price for producers: 76.16 UZS incl. VAT per code. — [buxgalter.uz](https://buxgalter.uz/publish/doc/text210003_pamyatka_dlya_predprinimateley_ot_asl_belgisi)
- Draft: vegetable oil mandatory from 1 Jul 2027 (draft, unverified). — [spot.uz](https://www.spot.uz/ru/2025/10/23/electric-marking/)

### Inferences
- Tires were not found in any list; likely not covered (unverified).

### Gaps
- Lex.uz primary texts not fetched; exact current resolution numbers and per-group dates for appliances and medicines not confirmed.

## 2. What must be sent on retail sale

### Takeaway
The seller scans the Data Matrix with a 2D scanner; the online cash register (online-KKM) checks the code against Asl Belgisi before forming the receipt; the scanned code goes into the fiscal receipt, which goes to Soliq; Asl Belgisi then sets status "withdrawn from circulation, sold". No separate "chiqish" call is described: withdrawal happens via the fiscal receipt.

### Cited Findings
- Scan Data Matrix on each package; data included in fiscal receipt and sent to GNK database; codes then become "Выведен из оборота, продан". Receipts containing codes visible in the Asl Belgisi cabinet, Documents -> Receipts. — [buxgalter.uz instruction](https://buxgalter.uz/publish/doc/text185356_kak_roznice_nachat_rabotu_s_tovarom_podlejashchim_obyazatelnoy_cifrovoy_markirovke_instrukciya)
- Device asks to scan the data matrix when a marked item is added; scanned code appears in the receipt's corresponding field; marking code is a mandatory receipt detail; selling without codes on receipt/ESF is prohibited. — [buxgalter.uz](https://buxgalter.uz/publish/doc/text178429_kak_otrajat_kody_markirovki_v_esf_i_chekah)
- Marked goods are flagged in the register's product list (by IKPU). — same source
- Before the receipt is formed, the register validates authenticity and expiry in Asl Belgisi; sale blocked if code already used or expired ("срок годности товара истек"), no receipt produced. — [spot.uz](https://www.spot.uz/ru/2026/07/08/crpt-turon/); [gov.uz/soliq](https://gov.uz/ru/soliq/news/view/93824)
- Without scanning, no receipt can be generated. — [gov.uz/soliq](https://gov.uz/ru/soliq/news/view/147925)
- Full code earlier had to be printed on the receipt; that was dropped, some KKT vendors still print it, no format requirement. A register putting "1" in the field was judged OK by an expert. — [buxgalter.uz](https://buxgalter.uz/publish/doc/text189729_vlekut_li_nastroyki_kassy_narushenie_pravil_cifrovoy_markirovki)
- HoReCa draft alcohol/beer: codes not scanned, withdrawn after supplier ESF confirmation, not in fiscal receipts (from 1 Jun 2026). — [spot.uz](https://www.spot.uz/ru/2026/07/08/crpt-turon/)
- Code format: GS1 DataMatrix, GTIN + serial + verification key + code; import AIC 25 digits. — [zamin.uz](https://zamin.uz/en/economy/220721-new-requirements-established-for-the-sale-of-marked-products.html) (via search snippet)
- Code misreads: GS1 needs FNC1 (ASCII 232/GS) prefix handling. — cleverence snippet, Russian context, low relevance.

### Inferences
- Validation is performed by the register/fiscal module or Soliq backend, not by the merchant app, so a third-party POS must pass the raw scanned string to its fiscal module (EPOS) unaltered.

### Gaps
- Exact receipt tag/field name and wire format for the code not found in public sources.

## 3. EPOS support for marked goods

### Takeaway
E-POS Systems (epos.uz) lists "ASL Belgisi" integration under "Маркировка и рецепты" and offers E-POS API (Communicator, REST). Its public pages do not describe DataMatrix fields; docs.epos.uz requires integrator login.

### Cited Findings
- E-POS: virtual cash register service (Cashdesk, Mobile, API/Communicator REST); receipt goes to fiscal module and is confirmed by tax authority; integrations with ASL Belgisi and DMed listed. Docs at docs.epos.uz, portal portal.epos.uz, phone +998 71 200-01-73. — [epos.uz](https://epos.uz)
- docs.epos.uz shows only "Вход для интеграторов" (login); /api returned 404. — [docs.epos.uz](https://docs.epos.uz)
- E-POS about page says it handles ASL Belgisi among local requirements. — [epos.uz/en/about](https://epos.uz/en/about)

### Inferences
- Support probably exists at virtual-cash-register level (since ASL Belgisi integration advertised) but the item field for the code must be confirmed with EPOS support / integrator docs.

### Gaps
- No release notes or support articles on marking found; field names unknown; unclear whether EPOS performs the Asl Belgisi pre-check itself.

## 4. Checking code status / official API

### Takeaway
No public code-check API was found. Tools: Asl Belgisi cabinet (crpt-turon.uz), mobile apps (consumer and BUSINESS), Soliq cabinets my.soliq.uz / my3.soliq.uz. Integrators use partner/Soliq services.

### Cited Findings
- my.soliq.uz -> Услуги -> Система оборота продукции с цифровой маркировкой -> "Сомнительные ситуации" (7 case types incl. duplicate-code sales, retail without 2D scanner); "Валидация" section shows "Попытки продажи дубликата" by manufacturer. — [gov.uz/soliq](https://gov.uz/ru/soliq/news/view/211787)
- Withdraw unwritten-off codes via my3.soliq.uz -> Налоговый учет -> Вывод из оборота (list, manual, Excel) or inventory via Soliq mobile app. — [buxgalter.uz](https://buxgalter.uz/publish/doc/text214607_kak_vyvesti_iz_oborota_kody_markirovki_ne_spisannye_po_oshibke_ili_v_rezultate_sboya)
- Mobile app ASL BELGISI BUSINESS (free) checks codes; second version for consumers. — [buxgalter.uz](https://buxgalter.uz/publish/doc/text191823_mobilnoe_prilojeniya_dlya_proverki_vladelca_tovara_v_asl_belgisi_uzbekistan)
- Third-party Set Mark (checks duplicates, returns, ownership vs ESF) and Soft Business Group (checks via tax services or offline). — [spot.uz](https://www.spot.uz/ru/2026/07/08/crpt-turon/); [spot.uz 2025](https://www.spot.uz/ru/2025/03/27/sbg/)

### Gaps
- No public API documentation found; per-code history view in my.soliq.uz not confirmed.

## 5. Wholesale vs retail; already-sold codes

### Takeaway
Wholesalers show codes in ESF; retailers show them in cash receipts. A code already withdrawn (sold at retail) is rejected on re-sale, consistent with the user's extension.

### Cited Findings
- Roles: producers/importers and wholesalers show codes in ESF; retailers in online-KKM receipts. Wholesale marked sales only non-cash via bank (PP-190). — [gov.uz/soliq](https://gov.uz/ru/soliq/news/view/147925)
- Sale blocked if code already used. — [spot.uz](https://www.spot.uz/ru/2026/07/08/crpt-turon/)
- Duplicate-code sale attempts are tracked as violations. — [gov.uz/soliq](https://gov.uz/ru/soliq/news/view/211787)
- Fines: art. 227-1 Tax Code (net revenue of last quarter); penalties only after control purchase, documented violation, and two warnings for system-data checks. — [buxgalter.uz](https://buxgalter.uz/publish/doc/text189729_vlekut_li_nastroyki_kassy_narushenie_pravil_cifrovoy_markirovki); [gov.uz/soliq](https://gov.uz/ru/soliq/news/view/147925)

### Inferences
- A code whose last operation is retail sale should be rejected for re-sale; returns require specific handling (Set Mark mentions returns) - procedure not found.

### Gaps
- Return-to-circulation procedure for refunded marked goods not found.
