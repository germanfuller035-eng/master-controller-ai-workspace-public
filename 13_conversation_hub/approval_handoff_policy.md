---
canonical_target: 13_conversation_hub/approval_handoff_policy.md
related_project: conversation-hub
status: PROPOSED_NOT_APPLIED
synthetic: true
---

# Approval / Outbound Handoff Policy

Source OS -> Hub draft request -> validation -> owner preview -> Master Controller approval -> MC approved-send seam -> channel transport -> transport result -> MC canonical ledger -> Hub derived view. Hub never bypasses approval, calls SMTP, writes a send ledger, marks sent, infers success, or retries non-idempotently. Master Controller remains canonical approval owner.

> Proposed canonical doc. NOT applied. Owner applies post-review via AI HQ apply flow.
