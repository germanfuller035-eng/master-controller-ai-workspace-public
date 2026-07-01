# ADR-0004: Tool Access Through MCP Gateway

## Status

Accepted for foundation v1.

## Context

Future agents may need tools, but unrestricted shell or direct production adapters would break the control-plane and approval model.

## Decision

Tool access must go through Master Controller policy and a gateway boundary. MCP servers are registry-only skeletons in foundation v1. No production MCP server is enabled.

## Consequences

- Tools are denied by default.
- Gateway policy must check lifecycle, risk, data class, target, approval, STOP state, and evidence requirements.
- Direct Docker socket, unrestricted shell, production DB write, outbound send, payment, and secret-read access remain denied.

## What Is Explicitly Not Implemented

- No MCP server install.
- No browser automation service.
- No production adapter.

## Rollback / Supersession Rule

Remove MCP registry skeletons or supersede with a later gateway implementation ADR and tested deny-by-default policy.

## Related Files

- `config/mcp/MCP_SERVERS_LOCK.json`
- `docs/architecture/TOOL_GATEWAY_SEQUENCE_V1.md`
- `config/policies/CAPABILITY_MATRIX.json`
