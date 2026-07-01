# SMTP Canary Report

Result:

- SMTP_WITHOUT_APPROVAL=BLOCKED
- SMTP_HASH_CHANGED_BLOCKS=PASS
- SMTP_EXPIRED_PACKET_BLOCKS=PASS
- SMTP_DUPLICATE_BLOCKS=PASS
- SMTP_SINGLE_APPROVED_CANARY=BLOCKED_PENDING_OWNER_APPROVAL
- OUTBOUND_COUNT=0

Reason:

This task did not include exact owner approval for one SMTP canary recipient, subject, and body.

Required before live SMTP canary:

- exact recipient
- exact subject
- exact body
- owner approval callback for that packet
- packet not expired
- recipient match
- text marker match
- packet marker match
- duplicate guard pass
- stop request no
- bounce block no
- mass send off
- auto reply off
- payment link absent

No SMTP client/customer email was sent in this closeout.
