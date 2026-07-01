# VoltAgent Runtime Architecture V1

SESSION_NAME=VOLTAGENT_RUNTIME_MODEL_ROUTER_AND_COST_GOVERNOR_V1
STATUS=LOCAL_SYNTHETIC_CONTRACT_ONLY

VoltAgent is a future internal runtime implementation detail. It is not the top-level orchestrator, it does not own production data, and it does not make release or approval decisions.

Master Controller remains the control plane and owns:

- canonical state;
- owner approvals and approval revocation;
- task budgets and cost ceilings;
- risk and data classification;
- release, deploy, merge, tag, and production decisions.

Runtime invocation is represented by `tools/runtime/runtime_adapter.py`. A later production caller would submit a `runtime_request` with `task_id`, `actor`, `purpose`, `risk`, `budget`, `model_requirement`, and `tool_scope`. In this session the adapter accepts only explicit `LOCAL_SYNTHETIC` fixtures and returns deterministic dry-run output.

VoltAgent fit:

- internal runtime only;
- no public VoltAgent API;
- no managed VoltAgent memory;
- no VoltAgent deployment;
- no production credentials;
- no direct Docker socket;
- no direct production DB write;
- no outbound send authority;
- no payment authority.

Agents are stateless by default. Persistent memory is disabled. Agents may propose memory for later owner-reviewed handling, but runtime cannot write long-term memory.

All tool calls must route through the MCP Gateway boundary. The runtime has no direct production tool adapter and no direct MCP bypass.

STOP is authoritative. When STOP is active, runtime execution is denied, pending workflows are paused or cancelled, and active approvals are treated as revoked.

This session does not deploy runtime.
