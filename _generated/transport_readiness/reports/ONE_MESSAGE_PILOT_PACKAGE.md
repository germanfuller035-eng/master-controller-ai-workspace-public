# One-Message Pilot Package (PREPARED — NOT SENT)

date: 2026-06-18 · REAL_PILOT_SEND_EXECUTED=NO · COMMERCIAL_SEND=OFF · SEND_ALLOWED_LIVE=OFF

## Selected lead (redacted)
- **STROYDVOR-UG_RU — СтройДвор-Юг** (стройматериалы, Краснодарский край).
- Identity: `identity_match_status=match`. Contact: `email_verified=true`, `email_source=manual_verified`
  (no guessed email). Recipient redacted: `s***@stroydvor-***.ru`.
- Delivery classification: **CONFIRMED_SENT** (one proven prior message, SMTP 250) — explicitly NOT a
  delivery-unconfirmed record, so it is eligible.
- Selection reason: clean verified identity + verified email + audit preview ready + no existing
  opportunity + good Mini Audit fit. (DKBI_RU lacked an audit preview; ZAVODATOM_RU equally valid —
  STROYDVOR chosen for the ready preview.)

## Internal entities prepared (live, no send/deal)
```
opportunity opp_e70e7ec3cc87
offer       offer_dbbbf391d547  status READY_FOR_SEND_REVIEW
deal/handoff/project/invoice = NONE
```

## Offer preview
Mini Audit — 10 000 ₽. scope 8 / exclusions 9 / inputs 3. send_capability NONE.

## Email preview (OWNER PREVIEW ONLY — not sent)
- Subject: «Мини-аудит сайта СтройДвор-Юг: как поднять заявки с сайта»
- Body (preview): «[OWNER PREVIEW] Здравствуйте! Подготовил для СтройДвор-Юг мини-аудит сайта и пути
  клиента до заявки (10 000 ₽): что мешает заявкам и 3 конкретных улучшения. Если интересно — пришлю
  краткий разбор. — Дмитрий»

## Transport approval (would be required to send — NOT issued)
Single-use immutable approval binding owner/lead/channel/offer + recipient/subject/body/product-snapshot
hashes (commercial_core/lib/transport_approval.mjs). Any change to recipient/subject/body invalidates it.
Send also requires COMMERCIAL_SEND=ON + SEND_ALLOWED_LIVE=ON (both OFF) + a one-message limiter (below).

## One-message limiter (prepared, not armed)
```
MAX_REAL_SENDS=1  ALLOWED_LEAD_ID=STROYDVOR-UG_RU  ALLOWED_CHANNEL=email  FOLLOWUP_AUTOSEND=OFF  active=false
```

## Duplicate / risk / containment
- No prior opportunity for this lead. One proven prior send → this is a **follow-up**, not a first contact.
- SMTP uncertain outcome would go to the reconciliation queue, never a blind resend; a ledger SENT row
  is written ONLY on a confirmed transport result with a message id.
- Containment: no send executed; offer stays READY_FOR_SEND_REVIEW; no deal; reverting needs nothing
  (send already OFF).

## Reply monitoring & follow-up
Read-only IMAP correlation (thread → recipient → subject fallback; ambiguous quarantined; flags never
mutated). Follow-up plan D0/D2/D5/D10 is owner-task only; FOLLOWUP_AUTOSEND=OFF; delivery-unconfirmed
leads are excluded from follow-up.

## Exact owner approval line (NOT executed)
```
APPROVE_ONE_REAL_PILOT_SEND_STROYDVOR-UG_RU
```
Executing this line is a SEPARATE future step requiring transport activation (Gate C1-C), which remains
prohibited in this pass.
