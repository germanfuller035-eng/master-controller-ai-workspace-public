# FIRST TOUCH — CURRENT STATE (forensic)

**Дата:** 2026-06-19 (UTC). Production read-only. base 55aff3a.

## Существующий механизм сообщений
- `audit_artifact.miniAudit(leadId)` — строит настоящий аудит из `lead.audit_observations` (evidence-backed, без AI). Источник findings для hook engine.
- `audit_artifact.outreachEmail(leadId)` — email-черновик (subject/body/template_id из `lead.audit_preview`).
- `offer_preview.offerPreview(offerId)` — preview оффера (subject/body/findings/next_step/hash на backend).
- `owner_commercial_truth` — единая коммерческая истина + классификация отправок (commercial_sends=0).
- Lead carries: `audit_observations[]`, `email`, `email_source`, `website`, `subject`, `audit_preview`.

## Чего НЕТ (нужно создать)
- отдельный hook selector (выбор коммерческого угла);
- quality score / subject score / uniqueness check;
- разделение FIRST_TOUCH vs FREE_TEASER vs PAID_MINI_AUDIT vs OFFER на уровне artifact-типа;
- compliance gate / deliverability readiness read model;
- pilot candidate selector по всем 62.

## Eligibility (детерминированно, все 62)
```
pilot_eligible=7 (verified email + observations + website): KZ-JBI_RU, GBIRESURS_RU, DKBI_RU, BETON-MASTERS_RU, STROYDVOR-UG_RU, MEGALIT-KRD_RU, ZAVODATOM_RU
ineligible=53  test=2
```
3 коммерческих оффера (СтройДвор/ДКБИ/Завод Атом): email_source=manual_verified, 3 observations каждый.

## Принцип интеграции
First Touch — этап существующей pipeline (Lead → Contact → Audit → Product Route → FirstTouch → Hook → Composer → Quality → Compliance → Owner Review → Send Gate[disabled]). Единый writer, единый send ledger, единая commercial truth. Никаких параллельных store.
