# MCP Gateway Architecture V1

Status: local deterministic foundation for MASTER_CONTROLLER_MCP_GATEWAY_V1.

## Purpose

The gateway brokers future tool access without giving agents direct tool configuration, direct credentials, unrestricted shell, or production access. In this session it is a local Python package and config set only; it is not an external MCP server.

## Flow

```text
Agent or internal caller
-> Master Controller task context
-> policy/security check
-> MCP Gateway
-> approved adapter
-> bounded tool result
-> artifact/evidence
-> audit event
```

## Runtime Shape

- `tools/mcp_gateway/gateway.py` accepts a request dict and returns a bounded response dict.
- `policy_bridge.py` maps gateway calls to existing policy actions and feature flags.
- `adapter_registry.py` loads `config/mcp/GATEWAY_ADAPTERS.json`.
- Adapters are registered but not production-enabled.
- Audit and artifact writes are limited to `_generated/mcp_gateway_v1`.

## Default State

All implemented adapters are `LOCAL_SYNTHETIC_ALLOWED` and `production_enabled=false`. Contract-only adapters are `OFF`. `MCP_READ` and `MCP_WRITE` remain OFF in production config.

## Explicit Denials

No unrestricted shell, direct Docker socket, direct SSH, production DB write, production filesystem access, production MCP server, outbound send, browser action, or payment path is enabled.
