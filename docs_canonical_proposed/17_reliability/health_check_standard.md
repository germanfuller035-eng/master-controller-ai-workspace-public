---
canonical_target: 17_reliability/health_check_standard.md
related_project: reliability-observability
status: PROPOSED_NOT_APPLIED
synthetic: true
---

# Health Check Standard

8 check types. Semantic rules: liveness!=readiness, API 200!=canonical write path, timer active!=successful job, backup exists!=restorable, contract test!=live health. Synthetic marked; default live status UNKNOWN.

> Proposed canonical doc. NOT applied. Owner applies post-review via AI HQ apply flow.
