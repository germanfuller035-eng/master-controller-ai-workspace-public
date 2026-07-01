# ADR-0009: Data Classification And Memory Boundaries

## Status

Accepted for foundation v1.

## Context

Future AI features must handle public, business, client, personal, medical/military, and credential-like data without leaking content into prompts, logs, reports, or Git.

## Decision

Data classes are `PUBLIC`, `BUSINESS_INTERNAL`, `CLIENT_CONFIDENTIAL`, `PERSONAL_CONFIDENTIAL`, `MILITARY_MEDICAL`, and `SECRETS`. Memory writes are disabled by default. Agents may propose memory only; Memory Curator validates provenance, date, confidence, class, retention, and audit requirements.

## Consequences

- Secrets never go into prompts, logs, reports, or Git.
- Medical/military sensitive data requires explicit owner approval before external AI processing.
- High-risk audit logs store hashes and references, not full secret or sensitive content.

## What Is Explicitly Not Implemented

- No memory store.
- No knowledge ingestion runtime.
- No secret manager integration.

## Rollback / Supersession Rule

Supersede with a later data-governance ADR and migrate all registries that cite these classes.

## Related Files

- `docs/security/DATA_CLASSIFICATION.md`
- `docs/security/MEMORY_BOUNDARIES.md`
- `docs/security/HIGH_RISK_AUDIT_LOG_SPEC.md`
