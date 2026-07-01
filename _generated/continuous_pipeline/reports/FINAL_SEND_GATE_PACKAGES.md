# Final Send Gate Packages

date: 2026-06-18 · REAL_SEND_EXECUTED=NO · COMMERCIAL_SEND=OFF · SEND_ALLOWED_LIVE=OFF

Three pilot leads are prepared to READY_FOR_SEND_REVIEW. Each has a package; NONE is approved or sent.
Actual send requires Gate C1-C (separate owner approval + transport activation), which is prohibited here.

## Packages (redacted — no full emails)
| lead | company | opportunity | offer | product/price | delivery class | approval line (NOT executed) |
|---|---|---|---|---|---|---|
| STROYDVOR-UG_RU | СтройДвор-Юг | opp_e70e7ec3cc87 | offer_dbbbf391d547 | Mini Audit / 10 000 ₽ | CONFIRMED_SENT (prior, awaiting reply) | APPROVE_ONE_REAL_PILOT_SEND_STROYDVOR-UG_RU |
| DKBI_RU | ДКБИ | opp_70378d4e92d3 | offer_ec64d56d08b4 | Mini Audit / 10 000 ₽ | CONFIRMED_SENT (prior, awaiting reply) | APPROVE_ONE_REAL_PILOT_SEND_DKBI_RU |
| ZAVODATOM_RU | Завод Атом | opp_19b1fde46bd4 | offer_f1e0c4948965 | Mini Audit / 10 000 ₽ | CONFIRMED_SENT (prior, awaiting reply) | APPROVE_ONE_REAL_PILOT_SEND_ZAVODATOM_RU |

Each package binds (at owner approval time): recipient/subject/body/product-snapshot hashes, single-use,
expiry, one-message limiter (MAX_REAL_SENDS=1). Any content change invalidates the approval. SMTP
uncertain outcome → reconciliation queue, never a blind resend; ledger SENT only on confirmed result.

All three leads are warm (one proven prior message, awaiting reply) → any action is a follow-up, owner
must review the prior message. None has an audit-preview gap that blocks review except DKBI (no preview yet).

## Primary owner approval line (NOT executed)
```
APPROVE_ONE_REAL_PILOT_SEND_STROYDVOR-UG_RU
```
Executing any approval line is a SEPARATE future step (Gate C1-C). Send transport remains OFF.
