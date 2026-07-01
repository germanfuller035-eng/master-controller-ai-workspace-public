# Integration Wave 1 — Event Contract

date: 2026-06-18 · aligned with Integration Event Standard (tools/integration_os)

## Envelope
```
event_id          deterministic sha256(type+subject+at) → evt_…
event_type        one of the 12 below
event_version     1
event_kind        FACT_EVENT | RECOMMENDATION_EVENT | COMMAND_RESULT
occurred_at / recorded_at   ISO-8601 UTC
actor / source_system       commercial_core
subject_type / subject_id
correlation_id / causation_id
revision          store revision after the committed mutation (null for recommendations)
classification    FACT | TARGET | ESTIMATE | UNKNOWN
evidence          { … }
payload           { … }
```

## Event types (12)
opportunity.created · opportunity.stage_changed · offer.prepared ·
offer.owner_decision_recorded · deal.won · deal.lost · delivery_handoff.created ·
project.created · invoice.created · payment.evidence_recorded · payment.confirmed ·
profitability.updated

## Kind separation (enforced + tested)
- **FACT_EVENT** — emitted only after a committed mutation (e.g. `deal.won` with a real deal_id +
  revision). Carries `classification: FACT`.
- **RECOMMENDATION_EVENT** — a proposal (e.g. a suggested offer/next-best-action). Never carries a
  revision and never reads as a completed operation.
- **COMMAND_RESULT** — the structured outcome of a command (ok/replayed/conflict).

Test `EVT2` proves a recommendation is structurally distinct from a fact; `EVT3` proves an unknown
event type is rejected. Recommendations cannot masquerade as facts.
