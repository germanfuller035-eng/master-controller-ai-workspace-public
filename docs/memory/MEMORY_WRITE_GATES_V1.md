# Memory Write Gates V1

Write gates:

- MEMORY_WRITE must remain OFF.
- Direct memory write is denied.
- Auto-write is denied.
- Curator approval is required.
- Sensitive auto-write is denied.
- Secret-looking values are denied and redacted.
- Production memory store is disabled.

Even after curator approval, this session creates a proposed record only. A
future production write stage must define owner approval, audit trail, rollback,
retention enforcement, and conflict-resolution rules.
