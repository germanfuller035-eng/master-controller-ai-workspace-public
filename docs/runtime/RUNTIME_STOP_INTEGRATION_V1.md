# Runtime STOP Integration V1

STOP is a control-plane block, not a runtime suggestion.

When STOP is active:

- new runtime requests are denied;
- running workflows are paused or cancelled;
- pending tool calls are cancelled;
- active approvals are revoked;
- outbound, production write, payment, browser, and deploy queues remain disabled.

The runtime adapter checks STOP before model routing, cost estimation, retry handling, or tool routing.

Implementation:

- `config/runtime/RUNTIME_STOP_POLICY.json`;
- `config/policies/STOP_POLICY.json`;
- `tools/runtime/runtime_stop.py`.
