# Security Review
CANONICAL_WRITER_COUNT=1; DIRECT_AGENT_WRITERS=0; DIRECT_SMTP/Telegram/IMAP-mutation paths=0; parallel
ledgers/approval truths=0. Webhooks: HTTPS, HMAC signature, timestamp, replay, idempotency, payload limit,
schema validation, secret redaction, unknown→quarantine. Untrusted website/email text cannot enable send,
change flags, request secrets, or call shell (sanitizeUntrusted + QA quarantine). Privacy: hashes + masked
display only; no raw tokens/secrets/cookies; data minimization. AGENT_SECRET_EXPOSURE=0, PROMPT_INJECTION_BYPASS=0.
