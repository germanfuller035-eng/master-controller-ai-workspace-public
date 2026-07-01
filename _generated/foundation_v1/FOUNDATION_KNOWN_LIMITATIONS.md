# Foundation Known Limitations

SESSION_NAME=AI_SYSTEM_FOUNDATION_AND_OWNER_UX_ARCHITECTURE_V1

## Accepted Limitations

- Foundation v1 is architecture and local validation only.
- Registry schemas are structural contracts, not runtime policy enforcement.
- MCP, model routing, memory, STOP, approvals, telemetry, and agent runtime are not implemented.
- SKILLS_LOCK was converted to foundation registry shape and records existing project-local skills at summary level; no new skill was installed.
- Android alignment is documented from the completed UX redesign; no Android code was changed.

## Must Be Implemented Later

- Policy runtime and denial tests.
- Secret handling automation.
- Approval payload hashing implementation.
- STOP runtime and emergency-control tests.
- MCP gateway prototype in local synthetic/read-only mode.
- Model routing and cost governance.
- Agent runtime only after flags and approvals.
