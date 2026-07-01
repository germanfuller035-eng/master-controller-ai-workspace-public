# Cost Governor V1

STATUS=LOCAL_SYNTHETIC_CONFIG_ONLY

The Cost Governor enforces deterministic cost estimates and budget ceilings before runtime dry-run execution.

Configured controls:

- monthly AI budget range: 10000 to 30000 RUB equivalent;
- active local synthetic budget: 20000 RUB equivalent;
- per-task budget ceilings;
- retry budget ceiling;
- max retries per step: `2`;
- expensive task stop-loss requirement;
- transparent meter fields;
- no unlimited loops;
- no production spend authority.

Cost estimates use synthetic token counts from the runtime request and local model cost config. No billing API or provider API is called.
