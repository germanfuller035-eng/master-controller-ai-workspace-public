# ADR-0001: Master Controller Control Plane

## Status

Accepted for foundation v1.

## Context

Future AI-system expansion needs one canonical control plane so agents, tools, owner interfaces, approvals, and STOP do not create competing command paths.

## Decision

Master Controller is the only top-level orchestrator. Every task follows the same lifecycle: owner request, requirements check, plan, budget and risk, policy check, agent or tool selection, execution, independent verification, evidence, checkpoint, and final status.

## Consequences

- Agents and tools are subordinate components, not peer orchestrators.
- Owner interfaces can request action, but they do not bypass policy.
- Task state, approvals, and STOP are interpreted through the Master Controller control plane.

## What Is Explicitly Not Implemented

- No VoltAgent runtime.
- No new orchestrator process.
- No production deployment or connection change.

## Rollback / Supersession Rule

Revert this ADR and the foundation registries if a later approved architecture replaces Master Controller as control plane.

## Related Files

- `config/components/COMPONENTS_LOCK.json`
- `docs/architecture/COMPONENT_MAP_V1.md`
- `docs/architecture/TASK_LIFECYCLE_V1.md`
