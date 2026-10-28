# 1C <-> EPOS integration in Uzbekistan and feasibility of a browser-extension bridge

Note on method: ~12 searches/fetches. EPOS developer docs (docs.epos.uz) are behind an integrator login and could not be read. Most 1C-fiscal material found is Russian; Uzbek-specific vendor pricing was not found.

## Q1. Ready 1C connectors/modules for EPOS, Uzbek fiscal modules, virtual kassa, OFD (vendors, partners, pricing)

### Takeaway
No public evidence of a ready "1C <-> EPOS" connector was found. 1C:UT 11 for Uzbekistan has its own native KKM/online-cash/OFD workflow, and EPOS publishes a gated public API for integrators. Pricing: nothing found.

### Cited Findings
- EPOS describes itself as "Cash registers, fiscalisation and integrations for Uzbek businesses"; products listed: E-POS Cashdesk, E-POS Mobile, E-POS API; public API docs at docs.epos.uz; the page does not mention 1C, marking or pricing; phone +998 71 200-01-73 — [epos.uz/en/about](https://epos.uz/en/about)
- docs.epos.uz returned only a title "Login for integrators — E-POS Docs"; API details are not public (or at least not fetchable) — [docs.epos.uz](https://docs.epos.uz)
- Third-party integration example: the F-Kassa app for MoySklad (Uzbekistan region) sends fiscal receipts to the Uzbek OFD "via the EPOS module"; an EPOS module is required for fiscal receipts, non-fiscal payment types work without it. Shows EPOS is used as a fiscal module/gateway by third-party software — [moysklad.ru F-Kassa](https://www.moysklad.ru/integratsii/apps/f-kassa-ferrosoft/)
- 1C:UT 11 for Uzbekistan (Koderline, a 1C partner, 1c@koderline.uz, +998 71 205 16 74) issues KKM receipts through online cash registers connected to the program, sent to the tax authority via OFD; receipts are generated automatically when sales documents are posted; return receipts are done by return-by-receipt mode in the cashier workstation. No models/drivers/virtual kassa/marking/pricing described — [koderline.uz](https://koderline.uz/expert/narabotki/article-kak-probit-chek-kkm-v-1s-ut-11-dlya-uzbekistana/)
- Virtual cash register exists as a legal alternative to a physical online-KKM; Rahmat has a "Virtual Kassa" product (manual only, no 1C integration described) — [rhmt.uz manual](https://rhmt.uz/upload/Руководство_пользователя_Rahmat_Виртуальная_касса.pdf)
- Legal basis: UP-5813 of 6 Sep 2019 (schedule for moving cash-handling businesses to online KKM/virtual kassa) — [prg.kz](https://prg.kz/m/amp/document/31713806); fiscal sign (12-char) mandatory in receipt per PKM No. 943 of 23.11.2019 — [bss.uz](https://www.bss.uz/article/1162-chto-takoe-fiskalnyy-priznak-v-cheke)
- Fiscal module / ECP fee details for 2026 exist — [buxgalter.uz](https://buxgalter.uz/publish/doc/text173416_oplata_za_ecp_i_fiskalnyy_modul_rekvizity) (amounts not retrieved; the snippet only said legal-entity ECP costs 10% of BRV, 2-year validity — treat as unverified)
- 1C integration in Uzbekistan generally goes through HTTP services/OData/SOAP/EnterpriseData; infostart has Uzbek-specific tools (e-imzo WebSocket crypto provider, cbu.uz rates) but no EPOS connector surfaced — [infostart e-imzo](https://infostart.ru/1c/tools/1674319)

### Inferences
- The real decision is whether the customer's 1C (UT 11 Uzbekistan) already has a fiscal-register driver that supports EPOS hardware/module; if yes, 1C itself can fiscalise and the extension adds nothing fiscal.
- Because EPOS API docs need integrator login, access/commercial terms must be requested from EPOS directly.

### Gaps
- No named 1C franchisee selling an EPOS connector; no prices for any 1C-EPOS module (not found).
- Whether EPOS supports a 1C driver/extension (not found).
- Current registry of approved online KKM/virtual kassa (only 2020 data seen: 10 devices, fiscal modules by "Yangi texnologiyalar" per [spot.uz](https://www.spot.uz/ru/2020/11/25/online/) — outdated).

## Q2. Typical technical mechanisms

### Takeaway
Standard 1C patterns apply (HTTP services, REST client from 1C, file exchange, local driver/agent), but no EPOS-specific documentation is publicly confirmed.

### Cited Findings
- 1C integration methods: HTTP services, OData, SOAP, EnterpriseData — [Astanahub vacancy](https://astanahub.com/en/vacancy/6041) (job listing; weak source)
- Cloud/virtual cash pattern: 1C sends sale data to a cloud service, receipt is fiscalised and forwarded to OFD/tax — [sostav.ru](https://www.sostav.ru/blogs/269097/93340) (Russian context)
- Uzbek marking: no requirement to register KKM receipts in ASL BELGISI; seller must scan the Data Matrix at sale, which marks the item as sold to the consumer; ownership change via ESF — [buxgalter.uz](https://buxgalter.uz/ru/publish/doc/text186659_goryachie_voprosy_ucheta_tovarov_s_cifrovoy_markirovkoy). Code price 76.16 sum incl. VAT — [buxgalter.uz Asl Belgisi memo](https://buxgalter.uz/publish/doc/text210003_pamyatka_dlya_predprinimateley_ot_asl_belgisi)

### Inferences
- Most plausible EPOS mechanism is REST API with integrator credentials (unverified). Exact payload for marked goods (codes per line) is unknown.

### Gaps
- EPOS auth, idempotency, return endpoint, marking fields, sandbox: not accessible.

## Q3. Browser extension (MV3): fetch, CORS, host_permissions, mixed content

### Takeaway
An MV3 service worker can call an external HTTPS API if the origin is in host_permissions; content scripts cannot bypass CORS. An http:// 1C page calling https is not mixed content (the reverse is). Local bridge on localhost is feasible but subject to Chrome's new Local Network Access rules.

### Cited Findings
- Remote servers outside the extension need hosts in `host_permissions`; access is per host AND scheme (http and https declared separately) — [Chrome docs](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
- "Cross-origin requests are always treated as such in content scripts, even if the extension has host permissions"; recommended pattern: content script messages the service worker, which does fetch(); handler should accept limited input (e.g. an ID) and build the URL itself, since web pages can forge messages; prefer HTTPS — [Chrome docs](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
- Mixed content: blockable content includes fetch() and XHR; loopback addresses (127.0.0.1, localhost) are treated as secure origins — [MDN Mixed content](https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content). Mixed content rule concerns an HTTPS page loading HTTP; an http:// 1C page fetching https is not blocked (my inference from the rule definition).
- Local Network Access: permission prompt launching Chrome 142 for sites connecting to local network; permission-gated local requests exempt from mixed-content checks if destination is IP literal, .local, or `targetAddressSpace: "local"`; page doesn't discuss extensions — [Chrome LNA blog](https://developer.chrome.com/blog/local-network-access)
- Non-Chrome forum report (Mozilla) of host_permissions not enabling CORS for a redirect case — [Mozilla discourse](https://discourse.mozilla.org/t/host-permissions-not-allowing-cors-requests/106959) (anecdotal)

### Inferences
- If 1C is served over http:// on LAN, the content script reading DOM is fine; calls should go via service worker (extension origin), avoiding page CORS/mixed-content/LNA entirely for most cases (unverified for LNA — Chrome page silent on extensions; test on Chrome/Edge current).
- Service worker holds EPOS credentials in extension storage: secret exposure risk (any user with the extension profile). Edge behaves like Chrome (Chromium) — not separately sourced.
- Scraping the 1C web client DOM for a document is fragile (1C web UI is dynamically generated); marked-goods codes may not be visible in the DOM.

### Gaps
- Whether EPOS API sends CORS headers or restricts origins (irrelevant for service worker but relevant for any page-side call): unknown.
- Edge-specific docs not fetched.

## Q4. Architecture options and compliance risk

### Takeaway
Lowest compliance risk: keep fiscalisation in exactly one system and make the sale document the single source of truth. Prefer (c) a 1C-side HTTP/extension integration (or 1C's native KKM flow) over browser-side collection; the extension (a) is highest risk for double fiscalisation and audit.

### Cited Findings
- Fiscal receipt requirements are uniform regardless of which online-KKM issues the receipt — [buxgalter.uz Q&A](https://buxgalter.uz/oz/publish/doc/text190038_tulov_tizimlarining_fiskal_cheklari_bilan_muammolar_yuzaga_kelsa_2-qism)
- 1C UT 11 Uzbekistan already auto-generates KKM receipts on document posting and supports return-by-receipt — [koderline.uz](https://koderline.uz/expert/narabotki/article-kak-probit-chek-kkm-v-1s-ut-11-dlya-uzbekistana/)
- Marking: scanning the Data Matrix at the sale is what registers retirement — [buxgalter.uz](https://buxgalter.uz/ru/publish/doc/text186659_goryachie_voprosy_ucheta_tovarov_s_cifrovoy_markirovkoy)

### Inferences (assessment, not sourced)
- (a) Extension -> EPOS API directly: quickest to build, no server; cons: credentials in client, no server-side idempotency/retry log, user can re-click -> double fiscalisation, 1C document not linked to fiscal sign unless extension writes back, returns need separate flow, audit trail lives in browser. Needs EPOS API access and CORS irrelevant via service worker.
- (b) Local bridge (localhost agent): good if hardware fiscal device/USB needed; cons: install/maintain on each PC, LNA/mixed-content prompts, still client-side idempotency issue.
- (c) 1C-side HTTP service/extension calling EPOS: best audit — fiscal sign, receipt ID, status stored in the Realizatsiya document; server-side idempotency key = document GUID; handles returns by referencing original receipt; retry queue. Cost: 1C development (partner), but works with the existing web client without a browser extension.
- (d) File import/export: simplest/legal-safe but batch, no immediate fiscal sign, manual mistakes; fine as fallback.
- Cross-cutting controls for any option: idempotency key = 1C document GUID; store EPOS receipt ID + fiscal sign back into 1C; block re-send if status exists; returns only against original receipt; marked codes must be scanned at sale per rules (check whether a Realizatsiya via ESF/B2B differs from retail receipt — B2B sales normally go via ESF, not a cash receipt; clarify whether the scenario is retail-type sale).

### Gaps
- Legal check of whether the target scenario (Realizatsiya with marked goods) requires KKM receipt vs ESF: not verified; consult tax advisor/EPOS.
- EPOS return/refund API and double-send protection: not documented publicly.
