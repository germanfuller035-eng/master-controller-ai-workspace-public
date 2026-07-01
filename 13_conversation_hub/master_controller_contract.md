---
canonical_target: 13_conversation_hub/master_controller_contract.md
related_project: conversation-hub
status: PROPOSED_NOT_APPLIED
synthetic: true
---

# Master Controller Contract

Master Controller is the sole canonical writer of identity/pipeline/approval/reply/opt-out/send state. Conversation Hub provides draft requests + approval display + opt-out recommendations only; it never mutates canonical state, never writes the send ledger (outbound_send_ledger.jsonl), and never mutates reply state (reply_monitor).

> Proposed canonical doc. NOT applied. Owner applies post-review via AI HQ apply flow.
