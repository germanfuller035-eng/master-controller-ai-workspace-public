---
canonical_target: 13_conversation_hub/retry_idempotency_policy.md
related_project: conversation-hub
status: PROPOSED_NOT_APPLIED
synthetic: true
---

# Retry / Idempotency Policy

Idempotency key + attempt ID + original request ID + retry count. Outbound retry only from canonical approved request, same idempotency key; no retry after ambiguous transport result without reconciliation; inbound replay deduplicated; attachment retries checksum-aware; rate-limit state preserved.

> Proposed canonical doc. NOT applied. Owner applies post-review via AI HQ apply flow.
