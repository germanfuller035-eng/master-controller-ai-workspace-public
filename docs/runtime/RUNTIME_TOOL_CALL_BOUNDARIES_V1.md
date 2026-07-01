# Runtime Tool Call Boundaries V1

Runtime has no direct tool authority.

Required boundary:

- all tool calls route through MCP Gateway;
- direct MCP bypass is denied;
- production MCP tools are denied;
- production tool adapters are denied;
- direct shell, Docker socket, SSH, production filesystem, production DB, outbound, and payments are denied.

The runtime request must include `tool_scope.route=MCP_GATEWAY`, `mcp_gateway_required=true`, `direct_tool_call=false`, and `production_capabilities=0`.

MCP Gateway remains local/synthetic with production adapters disabled. This stage does not enable MCP write, external MCP servers, or production tools.
