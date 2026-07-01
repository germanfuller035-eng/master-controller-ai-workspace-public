# Integration Wave 2 — Plan (PREPARATION ONLY — NOT STARTED)

date: 2026-06-18 · WAVE_2_EXECUTION=NOT_STARTED · no Wave 2 production code in this task.
Builds on Wave 1 (Commercial Core, read-only live; commands gated; send forbidden).

## Next major contour
```
Commercial Core (Wave 1, DONE read-only)
  → Conversation Hub        (channels, threads, classification, draft validation — NO send)
  → Customer Success        (post-deal delivery health, renewals, satisfaction)
  → Analytics               (read models over commercial + delivery + finance + conversation)
  → Executive Owner Queues  (single prioritized owner decision/action queue across all OS)
```

## Contracts that ALREADY exist (reuse, do not re-author)
- `13_conversation_hub/`: channel_contract_standard, email_contract, classification_policy,
  draft_validation_policy, consent_opt_out_policy, approval_handoff_policy, analytics_contract,
  conversation_domain_standard, attachment_policy.
- `11_analytics_os/`: data_contract_standard, event_taxonomy, business_glossary, attribution_policy,
  cohort_standard, data_quality_policy, data_lineage_policy, controlled_commercial_cycle_measurement_plan.
- `07_revenue_os/`: commercial pricing/product truth already consumed by Wave 1.

## What Wave 2 needs to build
### New API / read models
- Conversation read models: threads, messages (read-only projection), classification status,
  draft queue (drafts only — never sent), consent/opt-out state.
- Customer Success read models: delivery health per project, renewal candidates, satisfaction signals.
- Analytics read models: funnel (lead→opportunity→offer→deal→project→invoice→payment), with
  FACT/TARGET/ESTIMATE/UNKNOWN classification preserved (UNKNOWN never 0).
- Executive Owner Queue: a unified, prioritized list of owner_decisions_required across OS.

### Events to wire (read-only first)
- conversation.message_received / classified / draft_prepared (NO send event).
- delivery.project_status_changed → success signals.
- commercial.* lifecycle events (already emitted by commercial_core/events.mjs) feed analytics.

### Android views needed
- Conversation Hub view (threads + drafts, read-only; no send control).
- Customer Success dashboard.
- Analytics funnel view.
- Owner Queue (single actionable list; actions remain gated until their command gate).

### Owner decisions needed
- Approve which conversation channels are surfaced (read-only) first.
- Approve analytics metric definitions (reuse business_glossary).
- Approve owner-queue prioritization policy.

### Commands that stay OFF in Wave 2
- All conversation SEND commands (email/Telegram/follow-up) — FORBIDDEN (transport = C1-C, never).
- Commercial commands remain governed by Gate C1 (separate).
- Customer Success / renewal commands: gated, design only.

### Sends that remain forbidden
- Email send, Telegram client send, follow-up send, SMTP, IMAP flag mutation.
- AUTOSEND=BLOCKED, SEND_ALLOWED_LIVE=OFF throughout.

### Synthetic E2E required (before any Wave 2 production)
- Conversation read projection over a synthetic thread fixture.
- Analytics funnel over a synthetic full commercial cycle fixture.
- Owner queue aggregation correctness (no duplicate/﻿missing decisions).
- Proof: zero send paths, zero second writer, UNKNOWN never coerced to 0.

### Production gates required
- Wave 2 Gate A: read-only conversation + analytics activation (mirror Wave 1 Gate B discipline:
  manifest freeze, closure scan, backup, exact staging, additive migration, one API restart).
- Wave 2 Gate B+: any command activation is a separate gate, send always excluded.

## Boundaries
- No Wave 2 production code authored in this task.
- No Wave 2 deployment, migration, or flag change performed.
- Single canonical writer discipline carries over unchanged.

WAVE_2_PLAN=READY · WAVE_2_EXECUTION=NOT_STARTED
