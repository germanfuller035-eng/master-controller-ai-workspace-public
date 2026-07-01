# Tool Gateway Sequence V1

Status: foundation v1 architecture.

## Tool Access Flow

```text
agent
-> Master Controller task/policy
-> MCP Gateway / internal API adapter
-> approved tool
-> evidence/result
```

## Required Checks

- lifecycle flag is not OFF for the requested capability;
- data class is allowed;
- risk level is approved;
- target is exact;
- denied capabilities are not requested;
- STOP is not active for the action class;
- approval exists for R4/R5;
- evidence and rollback/cancel requirements are known.

## Denied In Foundation V1

- unrestricted shell;
- direct Docker socket;
- production DB write;
- production deploy;
- outbound send;
- payment;
- secret read;
- production MCP server enablement.

## Not Implemented

No MCP server, gateway process, browser service, production adapter, or credential connection is implemented in foundation v1.
