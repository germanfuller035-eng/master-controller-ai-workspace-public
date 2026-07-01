# Async Pipeline State Model
pipeline_state.mjs: 20 states; per-lead isolation; AWAITING_REPLY/OWNER_REVIEW/DELIVERY_UNCONFIRMED block only their
own lead. Send transitions GATED (Gate C1-C), never auto. pipelineView → actionable/blocked_self/terminal,
pipeline_global_blocked=false. Invariants: one open opp/product/lead, no deal before valid decision, no handoff before
deal, no project before handoff, no invoice before allowed stage. 33 tests pass.
