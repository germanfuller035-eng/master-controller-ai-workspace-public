# Stateless Agent Execution V1

Default agent execution is stateless.

Runtime defaults:

- `memory_enabled=false`;
- persistent memory writes denied;
- production capabilities `0`;
- no direct production credentials;
- no outbound send authority;
- no direct production DB write;
- no direct Docker socket.

Allowed in this stage:

- local deterministic dry-run;
- model routing decision from config;
- cost estimate from synthetic token counts;
- memory proposal flag only;
- evidence references.

Denied in this stage:

- persistent memory write;
- managed runtime memory;
- production tool adapter;
- direct MCP bypass;
- direct send, payment, deploy, DB write, or secret read.

The stateless execution helper is `tools/runtime/stateless_agent.py`.
