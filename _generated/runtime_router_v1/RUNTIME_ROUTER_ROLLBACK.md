# Runtime Router Rollback

SESSION_NAME=VOLTAGENT_RUNTIME_MODEL_ROUTER_AND_COST_GOVERNOR_V1
STATUS=LOCAL_SYNTHETIC_ONLY

Rollback command after commit:

```text
git revert <runtime-router-cost-governor-commit>
```

Rollback scope:

- runtime/router/cost configs;
- runtime/router/cost docs;
- runtime/router/cost schemas;
- deterministic tools and tests;
- runtime_router_v1 generated evidence;
- checkpoint section for this stage.

No production rollback is required.
No VPS rollback is required.
No secret rotation is required if final secret scan remains clean.
No VoltAgent uninstall is required because VoltAgent was not installed.
No provider credential revocation is required because no provider credentials were committed.
