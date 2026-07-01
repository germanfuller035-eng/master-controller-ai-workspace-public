# Component Map V1

Status: foundation v1 architecture.

## Canonical Control Plane

Master Controller is the only top-level orchestrator. It owns task lifecycle, policy checks, owner approvals, capability routing, evidence, checkpointing, and STOP interpretation.

## Components

| Component | Owns | Does not own |
| --- | --- | --- |
| Master Controller control plane | Task lifecycle, policy routing, final status. | Direct uncontrolled tool access. |
| Canonical writer | Operational truth contract. | Competing side writes. |
| Policy gateway | Risk, data class, lifecycle, approval, STOP checks. | Business logic or tool execution. |
| Approval control | Approval payloads, hashes, expiry, revocation. | Hidden broad approvals. |
| Agent runtime future | Future stateless agents. | Runtime in foundation v1. |
| MCP gateway future | Future tool access boundary. | Installed MCP servers in foundation v1. |
| Model router | Future model class selection. | Credentials in registry. |
| Memory control | Memory proposal review. | Direct memory writes. |
| Owner interface design | Web, Android, Telegram, voice UX contracts. | Production execution. |
| STOP control plane | Emergency command contract. | Runtime process control in foundation v1. |
| Artifact evidence control | Reports, evidence index, rollback, handoff. | Production truth. |

## Ownership Rules

- Agents propose; Master Controller decides through policy.
- Tools run only through gateway after approval.
- Production writes require gates and owner approval.
- All new capabilities start OFF.

## Not Implemented

No runtime, server, queue, database, telemetry stack, or production adapter is implemented in foundation v1.
