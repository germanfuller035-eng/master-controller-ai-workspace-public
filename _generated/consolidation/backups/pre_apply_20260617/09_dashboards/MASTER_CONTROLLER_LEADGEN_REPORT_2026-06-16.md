# Lead Generation Root-Cause & Pipeline Report — Master Controller (2026-06-16)

## Root causes (evidence from current store)
Leads such as `JBI-KUBAN_RU` were created by **guessing a domain from the company name**
and promoted without verification:
- `source: mini_audit_promote`, `enrichment_batch_id: mini_audit_enrichment_batch_1_2026-06-12`
- `domain_validation_status: blocked`, `website_reachable: false`
- `identity_match_status: not_verified`, `email_source: missing`

Identified root causes:
1. Domain guessed from name (no DNS/HTTPS proof before creating the lead).
2. No site↔company identity check.
3. Unverified / missing email treated as a lead anyway.
4. No contact evidence required.
5. Promotion to pipeline before any quality gate ("too early READY").
6. Test and production candidates not separated.

## Canonical pipeline (enforced by `leadgen_verify.mjs`, REVIEW_ONLY)
```
SOURCE → DNS resolve → HTTPS reachable → identity match (company tokens on page)
→ region check → contact evidence (email/tel/form) → RISK GATE → HUMAN REVIEW → VERIFIED (manual)
```
Per-lead provenance recorded: source_name, source_url, discovered_at, domain_status,
website_reachable, identity_match_status, identity_confidence, region_check, email_status,
email_on_official_site, phone_found, contact_form_found, contact_evidence_url,
verification_method, verification_timestamp, quality_score, risk_flags, next_action.

**VERIFIED requires ALL gates to pass.** The tool never auto-promotes to READY and never
sends outreach; verdict is always `human_review`.

## Live discovery sample (Краснодарский край; ЖБИ/бетон) — REVIEW_ONLY
| Domain | DNS | Reachable | Identity | Region | Contact | Score | Verdict |
|---|---|---|---|---|---|---|---|
| kgbi23.ru | resolves | yes | matched | matched | yes | 100 | VERIFIED_CANDIDATE_REVIEW_ONLY |
| jbi-kuban.ru | no_a_record | no | — | — | no | 0 | DEAD_DOMAIN |
| beton-kubani.ru | no_a_record | no | — | — | no | 0 | DEAD_DOMAIN |

Result: the gate **accepts** the verifiable site and **rejects** the guessed domains that
previously polluted the store. Sample is intentionally small and VPS-friendly (DNS+HTTPS+HTML,
no headless browser). 

## Constraints honored
- REAL_OUTREACH_TO_DISCOVERED_LEADS = 0 (no emails to any discovered lead).
- AUTO_PROMOTE_TO_READY = NO. REVIEW_ONLY = YES.
- Scheduled generation must stay REVIEW_ONLY, autosend BLOCKED, bounded candidate count,
  public business data only. Heavy browser workers not run continuously (1 GB VPS).
