# MCP Gateway Rollout Plan

Allowed lifecycle sequence:

```text
OFF
-> LOCAL_SYNTHETIC
-> SHADOW
-> PRODUCTION_READ_ONLY
-> DRAFT_ONLY
-> OWNER_APPROVAL_REQUIRED
-> LIMITED_AUTONOMY
```

No promotion happens in this session.

Promotion requirements for later stages:

- owner-approved scope;
- policy/security validation PASS;
- STOP validation PASS;
- adapter-specific tests PASS;
- no credentials in repository;
- rollback and evidence index updated;
- R4/R5 actions require owner approval.
