# Reply Monitor — Continuous Mode
reply_correlation (thread/recipient/subject-fallback, ambiguous quarantined) runs independent of dev/other deals.
Read-only IMAP (EXAMINE), no flag mutation, no send, duplicate idempotent. No reply → no global block. 9 tests pass.
Results: REPLY_RECEIVED/AMBIGUOUS/UNMATCHED/AUTOREPLY/BOUNCE classified; matched → conversation event + owner task + reply draft (not sent).
