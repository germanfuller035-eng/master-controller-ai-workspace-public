---
type: architecture
status: proposed
related_project: revenue_os
updated: 2026-06-17
canonical_target: 07_revenue_os/conversation_hub_architecture.md
apply_status: PROPOSED_AFTER_SOAK
tags: [revenue_os, conversation_hub, architecture, future]
---

# Conversation Hub — Architecture Proposal (non-runtime)

> **Non-runtime architecture only.** No channel adapters are implemented. No client messages are
> sent. This defines the future contract so Revenue OS, Master Controller, and channels share ONE
> conversation truth instead of per-channel CRMs.

## Channels (future)
email · Telegram · MAX · official WhatsApp Business API · web forms.

## One canonical conversation model
```
conversation_id
canonical_lead_id        # links to Master Controller lead truth
channel                  # email | telegram | max | whatsapp_official | web_form
external_thread_id       # provider thread/message id
participants
messages[]               # {direction, ts, body_ref, classification}
classification           # inquiry | price_question | details | objection | opt_out | other
reply_required
opt_out                  # shared across ALL channels
approval_state           # drafts owner-approved before send
revision                 # concurrency token
```

## Rules
- **One canonical conversation truth.** Master Controller owns persistence; the Hub is a model + adapters.
- **Channel adapters only** — no separate per-channel CRM, no separate lead store.
- **No unofficial WhatsApp automation.** Only the official WhatsApp Business API is in scope.
- **No client messages without owner approval.** Drafts are produced by Revenue OS message factory
  (send_allowed=false) and only sent via MC after approval.
- **Opt-out is shared across channels.** An opt-out on any channel suppresses all channels; no follow-up ever.
- **Evidence retained** for every inbound/outbound (provenance + timestamps).
- **Revision conflicts handled** via optimistic concurrency (reject stale writes).

## Boundaries
- Revenue OS: classifies, drafts responses (internal), recommends next action.
- Master Controller: stores conversations, performs approved sends, owns opt-out ledger.
- Conversation Hub: the shared model + per-channel adapters (future).

## Out of scope for this task
Adapters, runtime, live channels, sending. This is the contract only.

## Related
- [[07_revenue_os/master_controller_integration_contract]]
- [[00_MASTER_CONTEXT/AI_SYSTEM_MAP]]
