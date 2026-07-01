---
canonical_target: 15_agent_orchestration/scheduler_contract.md
related_project: agent-orchestration
status: PROPOSED_NOT_APPLIED
synthetic: true
---

# Scheduler Contract

Future scheduler: select READY -> enforce dependency -> acquire lease -> enforce capability/budgets -> invoke approved executor -> persist checkpoints -> verify -> release lease. This task: contract + simulator only. No cron/systemd/Windows task.

> Proposed canonical doc. NOT applied. Owner applies post-review via AI HQ apply flow.
