# Reply Monitor Readiness

date: 2026-06-18 · read-only IMAP correlation; no flag mutation; no send.

## Reuse
`tools/communication_monitor/yandex_mail_imap_read.mjs` reads headers in IMAP EXAMINE (read-only) mode;
flags/body/attachments never touched. `tools/telegram_gateway/reply_correlation.mjs` correlates inbound
headers to leads from the authoritative ledgers (read-only). `reply_monitor.mjs` persists matched
replies append-only with dedup. No second store, no send.

## Correlation strategy (high → low)
1. THREAD (high): In-Reply-To / References contains one of our sent Message-IDs → that lead.
2. RECIPIENT (medium): inbound From == known recipient → that lead.
3. SUBJECT (low, NEW): normalized subject (Re:/Fwd: stripped) maps to exactly one lead.
   Ambiguous subject (two leads) → QUARANTINED (matched=false, reason=ambiguous_subject).
UNMATCHED otherwise — caller never mutates lead state.

## Synthetic tests (reply_correlation.test.mjs — 9/9)
1 In-Reply-To exact · 2 thread high confidence · 3 References correlation · 4 subject fallback unique ·
5 wrong sender unmatched · 6 ambiguous subject quarantined · 7 recipient medium · 8 duplicate header
idempotent · 9 no send/mutation side effects.

## For the future one send
The pilot message would carry an smtp_message_id; a reply's In-Reply-To/References would thread back to
STROYDVOR-UG_RU, link to the offer/ledger row, create an owner reply queue entry, and prepare (not send)
a reply draft. IMAP flags remain unchanged; no automatic reply.

```
REPLY_MONITOR_READY=YES  IMAP_FLAG_MUTATIONS=0  OUTBOUND_SEND=0
```
