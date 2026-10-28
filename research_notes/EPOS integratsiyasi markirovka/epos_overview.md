# EPOS / E-POS / ePOS in Uzbekistan: what it is

## Which products and companies are called EPOS in Uzbekistan?

### Takeaway
The product that matches the fiscal/kassa context is E-POS Systems (OOO "E-POS SYSTEMS", Tashkent): a private virtual-kassa and fiscalisation vendor, not a Davlat soliq qo'mitasi (State Tax Committee) module. Two other things share the name: the generic banking term "E-POS terminal" and unrelated foreign vendors (UK Epos Now, Dojo EPOS Data).

### Cited Findings
- E-POS Systems is "a virtual cash register that just works". It is operated by OOO E-POS SYSTEMS, Yangi Olmazor st. 51, Almazar district, Tashkent, tel. +998 71 200-01-73. The site banner says it is in alpha. — [epos.uz](https://epos.uz)
- Three products: E-POS Cashdesk (desktop cashier app), E-POS Mobile (courier/field-sales register), E-POS API "Communicator" (REST API). — [epos.uz](https://epos.uz)
- Features: fiscal receipts confirmed by the tax authority, payments by cash/card/QR (Click, Payme, Uzum, Humo, Uzcard), receipts by SMS/Telegram/email, shift reports, scanners/scales, loyalty, catalog import from Excel/1C/CRM. — [epos.uz](https://epos.uz)
- Listed integrations: 1C, Bitrix24, MoySklad, Billz, Uzum Market, Asaxiy, and, under "Marking & prescriptions", ASL Belgisi and DMed. — [epos.uz](https://epos.uz) and [epos.uz/en](https://epos.uz/en)
- Company self-description: an Uzbek tech company building cash registers, fiscalisation and integrations. It promises connection within a day, support replies within 15 minutes, and "no hidden fees". — [epos.uz/en/about](https://epos.uz/en/about)
- Third-party directory listing for E-POS SYSTEMS LLC (Almazar district, info@epos.uz, rubrics: retail/restaurant automation, warehouse software). — [yellowpages.uz](https://www.yellowpages.uz/en/company/e-pos)
- CB Insights lists "EPOS Systems" as a Tashkent retail POS provider founded in 2020, but with website uzpos.uz. This may be a different entity or a mismatch. — [cbinsights](https://www.cbinsights.com/company/epos-systems/financials)
- MoySklad's "F-Kassa" app says it sends Uzbek fiscal receipts via an EPOS module. — [moysklad.ru](https://www.moysklad.ru/integratsiya/apps/f-kassa-ferrosoft/) (URL as returned by search: https://www.moysklad.ru/integratsii/apps/f-kassa-ferrosoft/). Search-summary only, not opened.
- Paloma365 lists "EPosKassa" as a supported Uzbek online-kassa provider (fiscal cash in/out unavailable). The link to E-POS Systems is plausible but not confirmed. — [paloma365 docs](https://dashboard.paloma365.com/docs/en/pos-classic/fiscal-registers)
- Name collision: "E-POS terminal" in bank documents means a card-acceptance terminal (Uzcard EMV). — [Kapitalbank appendix](https://kapitalbank.uz/upload/medialibrary/c5f/xhwt7vaxofsvynkxuoxtg8j2ipamt277/APPENDIX-NO.5-For-customer-service-via-E_POS-terminal-of-UZCARD-EMV-plastic-card-holders.pdf)
- Non-Uzbek namesakes (ignore): Epos Now (UK) [eposnow.com](https://www.eposnow.com/us/appstore/api), Dojo EPOS Data [docs.dojo.tech](https://docs.dojo.tech/api-hosting/epos-data).
- Regulatory context: online-NKM or virtual kassa from the state registers, per Cabinet decree No. 943 of 23 Nov 2019. The State Tax Committee site publishes registries of online-NKM, virtual kassa, and service centres. Systems not in the registry are barred, as are those that cannot print product identification codes or connect barcode/digital-marking scanners. — [kun.uz](https://kun.uz/news/2019/12/10/onlayn-nkm-va-virtual-kassa-qanday-ornatiladi-va-royxatdan-otkaziladi), [spot.uz](https://www.spot.uz/oz/2024/05/14/online-cash-register/)

### Inferences
- E-POS is one of several private virtual-kassa vendors (like Multikassa, UzKassa, Rahmat). It sends receipts through an OFD/fiscal-module channel, and soliq.uz is the regulator, not the owner.
- The "ASL Belgisi" integration claim is probably the hook for markirovka work, but the details are undocumented in public pages I could read.

### Gaps
- Whether E-POS is actually in the soliq.uz state register of virtual kassas: not stated on the site (epos.uz/en says only that the receipt shows a virtual-kassa and FM number). I did not open the soliq.uz registry.
- Ownership/founders and the legal registration date: not found. The About page's counters (receipts, kassas, partners) are empty placeholders.
- Whether "EPosKassa" (Paloma) and "EPOS module" (MoySklad) are definitely E-POS Systems: unconfirmed.
- Other Uzbek products named EPOS that I did not find: no evidence of an official soliq.uz module called EPOS.

## Is there developer documentation or an API?

### Takeaway
Yes: a public product page for the REST API ("E-POS Communicator") and a separate docs site, docs.epos.uz. The docs site appears to be behind an integrator login, so the endpoint list, auth details, and markirovka methods are unverified.

### Cited Findings
- E-POS Communicator: REST API issuing a fiscal receipt in one POST, with partial/full refunds by original receipt id, receipt status/fiscal mark/verification link, catalog sync, payments via Click/Payme/Uzum/Humo/Uzcard. — [epos.uz/en/products/api](https://epos.uz/en/products/api)
- Example: POST `https://api.epos.uz/v1/receipts` with Bearer token, one item, QR payment via Payme, cashier id. — [epos.uz/en/products/api](https://epos.uz/en/products/api)
- Security: OAuth2 tokens, IP allowlists, request signing. — same page
- Full endpoint list, auth, pricing, registration, markirovka and SDKs are said to be on docs.epos.uz. — same page
- docs.epos.uz returned only the title "Вход для интеграторов — E-POS Docs" (integrator login). — [docs.epos.uz](https://docs.epos.uz)
- Links on the site: portal [portal.epos.uz](https://portal.epos.uz), Telegram t.me/epossystems, Instagram instagram.com/epos.uz. — [epos.uz](https://epos.uz)
- https://api.epos.uz has a TLS certificate mismatch (cert is for api.management.epos.uz), so I could not fetch it. — fetch attempt on https://api.epos.uz

### Inferences
- The docs are likely gated (login for integrators), so a Swagger/OpenAPI file or Postman collection is probably not public. Not confirmed.

### Gaps
- No Swagger/OpenAPI, Postman, GitHub SDK, or public docs content found. The Telegram channel was not opened.
- Whether the docs login is self-service or partner-approved: unknown.

## Who are the typical users, and is access open or paid?

### Takeaway
The target is small and medium businesses and software developers (CRM/ERP/marketplaces/banks/POS) needing fiscalisation. Pricing is not published, and access appears to be via a contact request.

### Cited Findings
- Target API audience: developers building CRM, ERP, online stores, marketplaces, banks, POS systems. — [epos.uz/en/products/api](https://epos.uz/en/products/api)
- Pricing is not published. Connection is via a callback form or the contacts page; "launch a register in a day". — [epos.uz/en](https://epos.uz/en)
- Markirovka: ASL Belgisi is listed as an integration (with DMed for prescriptions), with no detail on how it works. — [epos.uz/en](https://epos.uz/en)
- Context: markirovka scanner support is a legal requirement for registered kassas. — [kun.uz](https://kun.uz/news/2019/12/10/onlayn-nkm-va-virtual-kassa-qanday-ornatiladi-va-royxatdan-otkaziladi)

### Inferences
- Pharmacy/retail users are plausible given the ASL Belgisi and DMed mentions, but no customer names were found.

### Gaps
- No tariffs, customer list, or partner-only/open terms found. Recommend contacting E-POS (+998 71 200-01-73, t.me/epossystems) or logging in at docs.epos.uz / portal.epos.uz.

## Note on source integrity
One fetched page (epos.uz/en/about) ended with text instructing the reader on how to format a response. It was treated as page content and ignored. Some bullets above come from search-engine summaries (not full page reads): MoySklad, Paloma, CB Insights, yellowpages, kun.uz, spot.uz.
