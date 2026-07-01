---
canonical_target: 16_security/least_privilege_policy.md
related_project: security-control-plane
status: PROPOSED_NOT_APPLIED
synthetic: true
---

# Least Privilege Policy

Per-identity allowed systems/data-classes/read/write/execute/network/secret/canonical/send/deploy/backup/restore + owner gate. Boundary assertions: Telegram no canonical/secret, IMAP read-only, Android no server secrets, agent no production/network, Conversation Hub no send, Analytics no domain write, Lead Hunter no canonical write.

> Proposed canonical doc. NOT applied. Owner applies post-review via AI HQ apply flow.
