---
canonical_target: 15_agent_orchestration/agent_orchestration_note.md
related_project: agent-orchestration
status: PROPOSED_NOT_APPLIED
synthetic: true
---

# Agent Orchestration — Canonical Note

Agent Automation & Orchestration is a development/knowledge-work control plane for AI-agent tasks: task contracts, agent/model selection, capability policy, execution plans, dependency DAG, anti-loop, checkpoints, budgets, leases, retries, dead-letter, artifact handoff, verification, owner gates, audit. It is NOT a production worker/scheduler and NOT a replacement for the Master Controller job queue. It never starts real agents, schedulers, background processes, networks, sends, or mutates production. Max executable risk this block: R2_ISOLATED_CODE.

> Proposed canonical doc. NOT applied. Owner applies post-review via AI HQ apply flow.
