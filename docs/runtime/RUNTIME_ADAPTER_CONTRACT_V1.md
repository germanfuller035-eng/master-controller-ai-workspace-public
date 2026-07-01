# Runtime Adapter Contract V1

The runtime adapter is the future invocation seam between Master Controller and an internal runtime such as VoltAgent.

Request minimum:

- `task_id`;
- `actor`;
- `purpose`;
- `risk`;
- `budget`;
- `model_requirement`;
- `tool_scope`.

Response minimum:

- `status`;
- selected model and provider profile;
- deterministic cost estimate;
- retry count;
- evidence references;
- memory status;
- production capability count.

Contract rules:

- `AGENT_RUNTIME` remains OFF in production;
- explicit `LOCAL_SYNTHETIC` fixture is required for dry-run execution;
- production capabilities must equal `0`;
- direct production credentials are denied;
- direct Docker socket access is denied;
- production DB writes are denied;
- outbound sends and payments are denied;
- tool calls must route through MCP Gateway;
- STOP blocks execution before routing;
- max retries per step is `2`;
- max delegation depth is `1`;
- max subagents per task is `3`;
- max interagent messages is `8`.

The adapter in this stage is deterministic and standard-library only. It performs no real LLM calls and no external API calls.
