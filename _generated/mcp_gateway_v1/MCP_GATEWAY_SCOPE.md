# MCP Gateway Scope

SESSION_NAME=MASTER_CONTROLLER_MCP_GATEWAY_V1
SCOPE_STATUS=ACCEPTED

## Allowed

- Local deterministic gateway package under tools/mcp_gateway.
- Gateway configs under config/mcp.
- Gateway schemas under schemas/mcp_gateway.
- Gateway docs under docs/mcp_gateway.
- Synthetic tests under tests/mcp_gateway.
- Synthetic evidence under _generated/mcp_gateway_v1.
- CURRENT_TASK_CHECKPOINT.md additive section only.

## Forbidden

- Real external MCP runtime or server connection.
- VoltAgent, Qdrant, OPA, vault, browser automation, Docker socket, SSH, unrestricted shell.
- Production API/backend/Caddy/firewall/DNS changes.
- Production DB writes or production filesystem access.
- Gmail, Telegram, publication, or payment actions.
- Full Run 1, Full Run 2, Android acceptance, APK install, instrumentation, Gradle cache cleanup.

## Safety Defaults

MCP_READ_PRODUCTION=OFF
MCP_WRITE=OFF
IMPLEMENTED_ADAPTERS=LOCAL_SYNTHETIC_ALLOWED_ONLY
CONTRACT_ONLY_ADAPTERS=OFF_NOT_CONNECTED
TOOL_CREDENTIALS_IN_AGENT_CONTEXT=NO
DIRECT_TOOL_CONFIG_IN_AGENT_CONTEXT=NO
