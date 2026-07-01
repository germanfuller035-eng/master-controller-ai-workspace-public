# Foundation Scope

SESSION_NAME=AI_SYSTEM_FOUNDATION_AND_OWNER_UX_ARCHITECTURE_V1

## Allowed

- ADRs.
- Component registry.
- Agent registry.
- Skill registry.
- MCP registry skeleton.
- Model registry skeleton.
- Capability matrix.
- Risk/data classification.
- Feature flag matrix.
- Owner interface architecture.
- STOP UX contract.
- Web/Android IA alignment.
- Evidence, checkpoint, handoff.
- Deterministic local registry validator.

## Forbidden

- Runtime install or activation.
- VoltAgent, Qdrant, OPA, MCP servers, community agents, community skills.
- Infisical, OpenTelemetry, Grafana, Tempo, Loki, Prometheus.
- Browser automation services.
- Production tool adapters.
- VPS, production API/backend, Caddy, firewall, DNS, production DB changes.
- Deploy, merge, tag, release.
- Outbound messages, publishing, payments.
- HAPP/VPN/proxy/adb reverse/Android global proxy changes.
- Full Run 1, Full Run 2, broad Android acceptance.
- Secrets, runtime data, Gradle homes, APKs, logs/cache, pairing/device files.

## Default

All new capabilities are OFF by default.
