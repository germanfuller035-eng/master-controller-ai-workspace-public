# ADR-0002: Canonical Writer And State Ownership

## Status

Accepted for foundation v1.

## Context

The project already treats operational truth as a controlled canonical state. Future agents must not introduce side stores or competing writers.

## Decision

There is one canonical writer for operational state. Agents are stateless by default and may only propose changes. Persistent memory is disabled by default. Agents may propose memory, but they may not directly write long-term memory.

## Consequences

- Production writes require explicit gates and owner approval when R4/R5.
- Local generated artifacts can document decisions, but they are not production truth.
- Memory writes require Memory Curator review, provenance, date, confidence, class, retention, and auditability.

## What Is Explicitly Not Implemented

- No new canonical writer.
- No memory database.
- No production DB write path.

## Rollback / Supersession Rule

Revert foundation files or supersede with an ADR that names the writer, migration path, and rollback plan.

## Related Files

- `docs/security/MEMORY_BOUNDARIES.md`
- `docs/policies/OWNER_APPROVAL_CONTRACT.md`
- `config/policies/CAPABILITY_MATRIX.json`
