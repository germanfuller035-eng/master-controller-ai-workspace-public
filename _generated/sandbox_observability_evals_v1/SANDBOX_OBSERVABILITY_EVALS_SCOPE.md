# Sandbox Observability Evals Scope

SESSION_NAME=AGENT_SANDBOX_OBSERVABILITY_AND_EVALS_V1
STATUS=LOCAL_SYNTHETIC_ONLY

Allowed changes:

- config/sandbox/**
- config/observability/**
- config/evals/**
- docs/sandbox/**
- docs/observability/**
- docs/evals/**
- schemas/sandbox/**
- schemas/observability/**
- schemas/evals/**
- tools/sandbox/**
- tools/observability/**
- tools/evals/**
- tools/sandbox_observability_evals/**
- tests/sandbox/**
- tests/observability/**
- tests/evals/**
- tests/fixtures/evals/**
- _generated/sandbox_observability_evals_v1/**
- CURRENT_TASK_CHECKPOINT.md

Forbidden:

- no Docker runtime, Docker socket, Kubernetes, Temporal, NATS, E2B, Daytona, OTel Collector, Grafana stack, Promptfoo, Qdrant, OPA, VoltAgent runtime, external MCP servers, browser automation service, production adapters, or autonomous outbound systems
- no VPS, production API, backend, Caddy, firewall, DNS, production database, HAPP/VPN/proxy, adb reverse, Android proxy, APK, instrumentation, or Gradle cache changes
- no outbound messages, payments, publishing, deployments, tags, releases, provider credentials, runtime data, real client data, or production capabilities
