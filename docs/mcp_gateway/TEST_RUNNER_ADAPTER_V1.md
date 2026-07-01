# Test Runner Adapter V1

Adapter id: `test_runner_local`

Status: implemented for local synthetic use only.

Allowed commands:

- `python tools/foundation/validate_foundation.py`
- `python tools/policies/validate_policy_security.py`
- `python tools/policy_security/run_all_policy_security_tests.py`
- `python tools/mcp_gateway/validate_mcp_gateway.py`

Controls:

- command allowlist is exact;
- subprocess uses argument arrays and `shell=False`;
- timeout is required;
- cancellation is checked before and after execution;
- stdout and stderr are redacted and truncated.
