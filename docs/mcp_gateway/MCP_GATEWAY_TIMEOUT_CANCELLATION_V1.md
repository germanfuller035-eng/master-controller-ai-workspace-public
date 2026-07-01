# MCP Gateway Timeout Cancellation V1

Timeouts are defined in `config/mcp/GATEWAY_TIMEOUTS.json`. Every gateway request must include `timeout_ms`; the gateway clamps it to adapter limits.

Cancellation is defined in `config/mcp/GATEWAY_CANCELLATION_POLICY.json`.

## Checkpoints

- before policy;
- before adapter;
- after adapter;
- before response.

The local subprocess adapter uses `subprocess.run(..., timeout=...)` with an argument array and `shell=False`. On timeout it returns `TIMEOUT`; on cancellation it returns `CANCELLED`.
