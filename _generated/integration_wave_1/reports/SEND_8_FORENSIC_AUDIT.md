# Send-8 Forensic Audit — Integration Wave 1 (redacted)

date: 2026-06-18 · read-only · THE PRIMARY SAFETY GATE

## Verdict
SEND_8_CLASSIFICATION=NO_8TH_SEND_METRIC_DEFINITION_ERROR
There was no eighth send. Historical successful sends = 7 (unchanged). UNAUTHORIZED_SENDS=0 ·
UNKNOWN_SENDS=0 · SMTP_CALLS_DURING_WINDOW=0 · DUPLICATE_SEND=NO.

## What actually happened
- Authoritative ledger: /opt/master-controller/13_sales/outbound_send_ledger.jsonl
  = exactly 7 SENT entries (lead 002, A, MA-1, INTERNAL_V, selftest, TEST_OWNER, TEST_KGBI2),
  dated 2026-06-08 .. 2026-06-16T08:09:11Z. File is read-only (mode r--r--r--), mtime 2026-06-16
  07:10. NO writes on 2026-06-17 or 2026-06-18.
- The prior "8" came from a different metric: a substring scan of lead objects for a "sent"/sent_at
  marker. That scan = 8 leads in BOTH the rev66 backup AND live, identical set
  {TEST_OWNER, GBIRESURS, DKBI_RU, BETON-MAST, STROYDVOR, MEGALIT-KR, ZAVODATOM, INTERNAL_V}.
  NEW markers in the 66→90 window = none. So lead-level marker count was already 8 at the approved
  baseline — it never changed and is not a send-ledger count.

## F1 Approval — N/A (no new send to approve). No send occurred in the window.
## F2 Single seam — ledger frozen; no new entry through any path (no direct SMTP script, no Telegram
   bypass, no nodemailer bypass). ACTIVE_PARALLEL_SEND_PATHS=0 · ACTIVE_PARALLEL_LEDGERS=0.
## F3 SMTP evidence — SMTP_CALLS_FOR_WINDOW=0. No new MESSAGE-ID. LEDGER_RECORDED=7 (unchanged).
## F4 Timing/intent — the delta was a counting method change, not an event. Classification: metric
   definition error in the prior pass; corrected here.
## F5 Autosend proof (full window) —
   AUTOSEND_ENABLE_EVENTS=0 · SEND_ALLOWED_LIVE_ENABLE_EVENTS=0 · UNAPPROVED_SEND_ATTEMPTS=0 ·
   SMTP_CALLS_WITHOUT_APPROVAL=0.

## Safe-rebaseline requirements
SEND_8_APPROVAL_VALID=N/A (no send) · SEND_8_SINGLE_SEAM=N/A · SEND_8_DUPLICATE=NO ·
UNAUTHORIZED_SENDS=0 · UNKNOWN_SENDS=0 → PASS for rebaseline.
HISTORICAL_SUCCESSFUL_SENDS for baseline v2 = 7 (NOT 8). Recipients and message bodies redacted.
