# Memory Boundaries

Status: foundation v1 contract.

## Default

Memory write is disabled by default. Agents are stateless by default and may propose memory only. No agent may directly write long-term memory.

## Memory Proposal Requirements

A memory proposal must include:

- source reference;
- observed date;
- confidence;
- data class;
- retention expectation;
- owner-visible summary;
- reason this should be durable;
- rollback or deletion path.

## Memory Curator

Memory Curator validates provenance, date, confidence, class, retention, and auditability. It must reject proposals containing secrets, raw credentials, unapproved sensitive data, or unverifiable claims.

## Auditability

Long-term memory writes must be auditable. For high-risk data, the audit record stores hashes and references, not the full payload.

## Not Implemented

No memory store, memory API, vector database, knowledge ingestion runtime, or automatic memory writer is implemented in foundation v1.
