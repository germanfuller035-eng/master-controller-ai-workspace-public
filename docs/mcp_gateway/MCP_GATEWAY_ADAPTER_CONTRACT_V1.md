# MCP Gateway Adapter Contract V1

Adapters implement `BaseAdapter.execute(request, timeout_ms, cancellation)` and return `AdapterResult`.

## Required Behavior

- validate the requested action against an allowlist;
- accept only scoped inputs;
- avoid `shell=True`;
- use argument arrays for subprocess calls;
- enforce timeout and cancellation checks;
- return redacted data only;
- create artifacts only through the artifact controller;
- raise `GatewayError` with redacted messages on denial or failure.

## Registered Implemented Adapters

- `filesystem_read`
- `git_read`
- `artifact_local`
- `test_runner_local`

## Contract-Only Adapters

- `vps_health_read_contract`
- `mysql_read_contract`
- `github_read_contract`
- `mail_draft_contract`
- `browser_contract`

Contract-only adapters are OFF and not executable in this session.
