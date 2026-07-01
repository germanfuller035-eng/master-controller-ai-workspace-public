# Transport Security Review (Gate C1-C readiness — NOT activated)

date: 2026-06-18 · COMMERCIAL_SEND=OFF · SEND_ALLOWED_LIVE=OFF · AUTOSEND=BLOCKED

## Single seam (enforced by existing architecture)
owner approval → approved send controller → outbound channel router → email adapter → authoritative
send ledger. The commercial_core has `sendCapability: NONE` and imports NO transport. Security scan
(commercial_core/tests/security.test.mjs, 15 checks) confirms no nodemailer/SMTP, no Telegram send, no
IMAP mutation in the commercial libs.

## Approval contract (commercial_core/lib/transport_approval.mjs — pure, no send)
Immutable single-use approval binding: owner_id, lead_id, channel, offer_id, recipient_hash,
subject_hash, body_hash, product_snapshot_hash, price, currency, approved_at, expires_at.
`validateApproval` fails closed on: BODY_CHANGED, SUBJECT_CHANGED, RECIPIENT_CHANGED, APPROVAL_EXPIRED,
APPROVAL_ALREADY_CONSUMED, NO_APPROVAL. No PII stored (hashes only) — verified by test TA2.

## Send requirements (future, all required together)
COMMERCIAL_SEND=ON + SEND_ALLOWED_LIVE=ON + OWNER_SEND_APPROVAL_ID + IDEMPOTENCY_KEY + EXPECTED_REVISION.
Autosend stays BLOCKED. One-message limiter bounds MAX_REAL_SENDS=1 to the allowed lead/channel.

## Duplicate / uncertain-outcome protection (test TA9–TA11)
- Repeat approval id rejected (single_use + consumed).
- Repeat idempotency key returns prior result (writer seam).
- SMTP timeout / unknown outcome → RECONCILIATION queue, `treatAsSent=false`, `resendAllowed=false`
  (NO blind resend).
- Ledger SENT row written ONLY on confirmed transport result with a message id.
- Delivery unknown is never counted as SENT.

## Verified this pass
36 transport_readiness checks pass. No transport activated. Across deploy + real prep: send ledger
unchanged (7), email ledger unchanged (63), SMTP calls 0, real messages 0.

```
TRANSPORT_GATE_TECHNICALLY_READY=YES  COMMERCIAL_SEND=OFF  SEND_ALLOWED_LIVE=OFF
```
