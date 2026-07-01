# Suspend Resume Contract V1

Suspend/resume state must be JSON-serializable and must not contain credentials, raw secret values, production tokens, or persistent memory.

Required state:

- `task_id`;
- `lifecycle_state`;
- `step_index`;
- `retry_count`;
- `budget_spent_rub`;
- `evidence_refs`;
- `memory_enabled=false`;
- `production_capabilities=0`.

Resume rules:

- STOP must be inactive;
- lifecycle state must be resumable;
- retry counters are restored;
- budget spent is restored;
- evidence references are preserved;
- runtime remains stateless.

Implementation: `tools/runtime/suspend_resume.py`.
