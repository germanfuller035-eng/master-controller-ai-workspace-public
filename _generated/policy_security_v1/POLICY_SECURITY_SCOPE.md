# Policy Security Scope

SESSION_NAME=POLICY_SECRETS_AUDIT_EMERGENCY_CONTROL_V1
SCOPE=POLICY_SECURITY_ONLY

Allowed file families:

- config/policies/**
- config/security/**
- config/emergency/**
- docs/policies/**
- docs/security/**
- docs/emergency/**
- docs/owner_interfaces/*APPROVAL*
- docs/owner_interfaces/*STOP*
- docs/owner_interfaces/*RISK*
- schemas/policy/**
- schemas/security/**
- schemas/audit/**
- tools/policies/**
- tools/security/**
- tools/audit/**
- tools/emergency/**
- tools/policy_security/**
- tests/policy/**
- tests/security/**
- tests/audit/**
- tests/emergency/**
- tests/fixtures/audit/**
- tests/fixtures/emergency/**
- _generated/policy_security_v1/**
- CURRENT_TASK_CHECKPOINT.md

Forbidden and unchanged:

- OPA runtime not installed.
- VoltAgent runtime not installed.
- Qdrant not installed.
- MCP servers not installed or enabled.
- Infisical or production vault not installed.
- OpenTelemetry/Grafana not installed.
- No production adapter activation.
- No VPS, backend, Caddy, firewall, DNS, production DB, HAPP, VPN, proxy, adb reverse, or Android global proxy changes.
- No Full Run 1, Full Run 2, broad Android acceptance, APK install, device instrumentation, deploy, merge, tag, release, outbound send, publish, or payment.
