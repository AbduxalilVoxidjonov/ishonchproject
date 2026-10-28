# EPOS / virtual kassa (Uzbekistan): technical integration surface (API, auth, receipt creation)

Note on "EPOS" ambiguity: the name most plausibly means (a) E-POS Systems LLC (epos.uz: E-POS Cashdesk, E-POS Mobile, E-POS API), (b) generic Uzbek "virtual kassa" / online-NKM products registered with the Tax Committee (Multikassa, UzKassa, etc.), or (c) the tax authority's FMO (Fiscal Data Operator, "Yangi texnologiyalar") backend. Unrelated: Epos Now (UK), Dojo, Paynt (not Uzbekistan). Most docs are gated, so much remains unverified.

## Does EPOS / virtual kassa expose an API, local agent, SDK?

### Takeaway
Yes for E-POS: the vendor advertises a public REST/JSON API (api.epos.uz/v1) for CRM/ERP/online stores/marketplaces. Other virtual kassas appear to be cloud registers (UzKassa) or local agents (Multikassa, unverified). The full E-POS reference (docs.epos.uz) is behind an integrator login and could not be read.

### Cited Findings
- E-POS API is described as a REST API for CRM, ERP, online store, marketplace, bank and POS developers; full reference at docs.epos.uz — [epos.uz/en/products/api](https://epos.uz/en/products/api)
- E-POS Systems LLC lists three products: E-POS Cashdesk, E-POS Mobile, E-POS API. The about page does not mention virtual kassa or OFD — [epos.uz/en/about](https://epos.uz/en/about)
- docs.epos.uz shows only a gate titled "Вход для интеграторов" (integrator login); no docs were readable — [docs.epos.uz](https://docs.epos.uz)
- UzKassa is a cloud fiscal register (OFD); a POS (Paloma POS 2) connects with a cloud URL, cashier phone, password and register serial number, then fiscalizes each closed order automatically; failed receipts can be retried — [Paloma POS docs](https://dashboard.palomapos.com/docs/en/pos-v2/fiscalization-uz)
- Multikassa is in the state register of virtual cash registers (ofd.uz); the Poster integration fiscalizes sales and returns, opens/closes shifts, and looks up IKPU via tasnif.soliq.uz — [Poster: Multikassa](https://joinposter.com/en/applications/multikassa)
- A third-party PHP package README states Multikassa is a local cashier agent at http://localhost:8080, not a server-side API (single, unverified source) — [pay-uz](https://github.com/shaxzodbek-uzb/pay-uz)

### Inferences
- A browser extension can reach a localhost agent (if Multikassa works that way) or a cloud REST API, but the cloud route needs a token and likely belongs in a backend, not in extension code.

### Gaps
- No readable official docs for E-POS, UzKassa, Multikassa; no public soliq.uz/ofd.uz API spec found.

## Authentication

### Takeaway
E-POS: Bearer token in the Authorization header (marketing example); page also mentions OAuth2, IP allowlists, request signing. Direct OFD submission reportedly needs PKCS#7 signing with the taxpayer certificate (EDS). UzKassa: cashier login/password.

### Cited Findings
- E-POS example uses a bearer token from an EPOS_TOKEN env var; Security section mentions OAuth2 tokens, IP allowlists, request signing (details not given) — [epos.uz/en/products/api](https://epos.uz/en/products/api)
- Paloma's UzKassa setup uses cashier phone + password + register serial; no token mentioned — [Paloma POS docs](https://dashboard.palomapos.com/docs/en/pos-v2/fiscalization-uz)
- pay-uz's generic "ofd" driver uses bearer token + endpoint + terminal_id; direct submission to ofd.uz requires PKCS#7 signing with taxpayer certificate (unverified third-party claim) — [pay-uz](https://github.com/shaxzodbek-uzb/pay-uz)

### Inferences
- Likely model: the integrator/merchant obtains a token per register/terminal from the vendor; EDS signing is the vendor's/OFD's side for the cloud route.

### Gaps
- Token issuance flow, OAuth2 scopes, token lifetime: unknown.

## Endpoints / operations (sale, items by MXIK, payment, refund, fiscal sign/QR)

### Takeaway
Only one E-POS endpoint is publicly shown: POST https://api.epos.uz/v1/receipts. Refund, status, catalog sync exist as features but their endpoints are undocumented publicly. The soliq-style receipt format (SPIC/MXIK, PackageCode, tiyin amounts) is described by a third-party package.

### Cited Findings
- `POST https://api.epos.uz/v1/receipts` with JSON: `items` (name, price, quantity), `payment` (method, provider, e.g. QR via Payme), `cashier_id`; examples in cURL/JS/PHP. The page's example shows no MXIK field (it may exist in the full docs) — [epos.uz/en/products/api](https://epos.uz/en/products/api)
- Listed features: refund by original receipt ID (full/partial), receipt status + fiscal mark + verification link, bundled payments (Click, Payme, Uzum, Humo, Uzcard), catalog sync — [epos.uz/en/products/api](https://epos.uz/en/products/api)
- Soliq-format receipt line fields (per pay-uz): Name, SPIC (MXIK, 17 digits), PackageCode, GoodPrice, Price, Amount, VAT, VATPercent, IsRefund, ReceivedCash, ReceivedCard; amounts in tiyin; response fields FiscalSign, QRCodeURL, TerminalId. This is a third-party package's reading, not an official spec — [pay-uz](https://github.com/shaxzodbek-uzb/pay-uz)
- Regulation: receipts must show item names, quantity, price, total, VAT, QR and fiscal sign, and national product catalog (MXIK) codes; offline issuance allowed with upload to the operator within 24 hours — [buxgalter.uz overview](https://buxgalter.uz/oz/publish/doc/text154204_onlayn-nkm_va_virtual_kassa_buhgalter_nimalarni_bilishi_kerak) (as summarized by search result; page not fully fetched); legal base PKM No. 943 of 23.11.2019 — [lex.uz/docs/4603340](https://lex.uz/docs/4603340) (appeared in search, not fetched)
- Poster/Multikassa integration confirms returns, shift open/close (Z-report) and IKPU lookup via tasnif.soliq.uz — [Poster: Multikassa](https://joinposter.com/en/applications/multikassa)

### Inferences
- Programmatic sale creation is feasible via E-POS API (one POST), likely with marking/MXIK fields in full docs; unconfirmed.

### Gaps
- Exact schema, MXIK/marking-code (DataMatrix) field names, refund and status endpoint paths, error codes.

## Rate limits, sandbox, pricing, onboarding

### Takeaway
No public info on rate limits, sandbox, or pricing. Onboarding for E-POS is via integrator login at docs.epos.uz / "Connect a cash register". For a software product to count as a virtual kassa itself, a formal registry process applies.

### Cited Findings
- Pricing, sandbox not mentioned on E-POS API page; onboarding only a "Connect a cash register" action — [epos.uz/en/products/api](https://epos.uz/en/products/api)
- Becoming a registered virtual kassa software: developer applies to the FMO ("Yangi texnologiyalar" IAM), signs integration contract, gets FMO and Cybersecurity Center conclusions, then applies to the Tax Committee with 10 attachments (compliance certificate, technical passport, cyber-security conclusion, FMO conclusion, copyright, etc.); a technical service center (TXKM) is also needed; article dated 26.12.2023 — [buxgalter.uz](https://buxgalter.uz/oz/publish/doc/text195345_avtomatlashtirish_dasturlarini_soliq_organlarining_ahborot_tizimlari_bilan_integraciya_qilish_talablari)
- Only registered devices/software may be used; businesses may freely choose among registered online-NKM or virtual kassas — same buxgalter.uz / search summaries ([buxgalter.uz](https://buxgalter.uz/oz/publish/doc/text154204_onlayn-nkm_va_virtual_kassa_buhgalter_nimalarni_bilishi_kerak))

### Inferences
- A third-party tool (extension/backend) should integrate with an already registered vendor kassa (E-POS, UzKassa, Multikassa) instead of registering itself.

### Gaps
- Rate limits, sandbox, price, partner agreement terms: not found.

## Existing third-party integrations

### Takeaway
Integrations exist in POS systems (Poster-Multikassa, Paloma-UzKassa) proving feasibility; no 1C or Telegram-bot connector for Uzbek kassas was found.

### Cited Findings
- Poster–Multikassa module — [Poster](https://joinposter.com/en/applications/multikassa)
- Paloma POS 2–UzKassa — [Paloma](https://dashboard.palomapos.com/docs/en/pos-v2/fiscalization-uz)
- F-Kassa: fiscal kassa for Uzbekistan on top of MoySklad, with OFD and offline mode (no API details) — [MoySklad](https://www.moysklad.ru/integratsii/apps/f-kassa-ferrosoft/)
- Tax Committee says R-Keeper, JOWi, iiko-type programs must integrate with tax systems — [buxgalter.uz](https://buxgalter.uz/oz/publish/doc/text195345_avtomatlashtirish_dasturlarini_soliq_organlarining_ahborot_tizimlari_bilan_integraciya_qilish_talablari)

### Gaps
- No GitHub/Postman/Swagger for E-POS found; 1C connectors and Telegram bots not found.

## Bulk import instead of UI clicking

### Takeaway
No evidence of a document/bulk-import feature for receipts. E-POS "catalog sync" is for items. Receipts are created per call.

### Cited Findings
- Catalog sync via API is listed; no bulk receipt import mentioned — [epos.uz/en/products/api](https://epos.uz/en/products/api)

### Gaps
- Whether the E-POS Cashdesk web UI has an Excel/CSV import: not found. Recommended next step: obtain integrator access at docs.epos.uz or ask E-POS support.
