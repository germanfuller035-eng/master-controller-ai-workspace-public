# Memory Conflict Detection V1

Memory conflicts are detected before curator approval.

Conflict key:

- subject
- key

If two records share the same subject and key but have different values, the
decision is FLAG_FOR_CURATOR. The system does not overwrite older claims and
does not resolve conflicts automatically.

Conflicts block automatic memory write because automatic memory write is always
OFF in this session.
