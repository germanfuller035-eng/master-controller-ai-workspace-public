# ADR-0010: No Production Runtime Installation In Foundation

## Status

Accepted for foundation v1.

## Context

This macro-session exists to establish architecture, registries, schemas, validation, and handoff evidence only.

## Decision

Foundation v1 must not install, deploy, activate, or connect runtime infrastructure. VoltAgent, Qdrant, OPA, MCP servers, community agents, community skills, Infisical, OpenTelemetry, Grafana, Tempo, Loki, Prometheus, browser automation services, production adapters, and autonomous outbound systems are explicitly out of scope.

## Consequences

- All future runtime work must start from a later macro-session.
- The foundation commit is safe to review as docs, registry skeletons, schemas, and deterministic validation.
- Production behavior remains unchanged.

## What Is Explicitly Not Implemented

- No runtime infrastructure.
- No production configuration change.
- No deploy, merge, tag, or release.

## Rollback / Supersession Rule

Revert the foundation commit. No production rollback is required because production is unchanged.

## Related Files

- `_generated/foundation_v1/FOUNDATION_SCOPE.md`
- `_generated/foundation_v1/FOUNDATION_ROLLBACK.md`
- `tools/foundation/validate_foundation.py`
