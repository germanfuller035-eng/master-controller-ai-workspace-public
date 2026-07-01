# Continuous Pipeline — Deployment Runbook
Additive, read-only + shadow. Preflight STOP: historical sends != 7, unknown writer, direct canonical write,
queue failed/dead letters, canonical integrity fail, unexpected payment/real send, commercial send enabled.
Backup canonical/queue/ledger/index.mjs/config → before_hashes (verify). Stage 5 files; sha256==manifest;
node --check; import closure. Atomic install. Activate AGENT_RUNTIME=true, AGENT_MODE=SHADOW_NO_SEND,
AGENT_CANONICAL_DIRECT_WRITE/SEND/PAYMENT=false (commercial send/payment unchanged OFF). Restart ONLY API.
Verify /agents/status, /agents/shadow-wave, /owner-queues, /executive-brief; HTTP_500=0; ledger 7.
