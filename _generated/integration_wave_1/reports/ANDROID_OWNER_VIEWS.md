# Integration Wave 1 — Android Owner Views

date: 2026-06-18 · app 0.5.0-rc1 (code 9) · signer == rc5 · 5-tab navigation UNCHANGED

## Added (read-only)
- **Сегодня**: new entry card «Коммерческая сводка» → opens the commercial summary (no new root tab).
- **Commercial summary screen** (`feature/commercial/CommercialSummaryScreen.kt`): funnel + finance read
  models — open opportunities, offers awaiting owner, deals won, projects awaiting handoff, invoices
  due, owner decisions; estimated pipeline / confirmed deal value / confirmed payments / confirmed &
  estimated revenue; unpaid invoices; "data without confirmation" count.

## Read-only + offline (RC5 contract reused)
- Reads via `MaterRepository.commercialSummary/financeSummary/commercialIntegrationStatus` → all use
  `readCached` (write-through cache_kv; transport failure → last snapshot flagged fromCache).
- Offline banner + cachedAt timestamp; no-cache → «Нет соединения и сохранённых данных.»
- No mutation controls. Wave 1 commercial commands are feature-flagged off; no send path.

## UNKNOWN ≠ 0
Money fields are nullable + carry a `*_class`. `OwnerLocalization.renderMoneyRu(amount, currency, class)`
renders `null` as «нет данных» (never 0) and appends a Russian qualifier (подтверждено / оценка / план /
нет данных). Counts are genuine integers (real 0 allowed).

## Owner localization
No snake_case / SCREAMING_SNAKE / raw enum / raw error code / null / undefined / NaN reaches the UI.
Classifications are shown as Russian words; the existing raw-code static scanner continues to cover
reachable screens.

## Tests (CommercialMappingTest, 7)
envelope parse, money-unknown-renders-word-not-zero, fact/estimate/target qualifiers, value-class-never-raw,
finance-unknown-not-zero, partial-payload-parses.
