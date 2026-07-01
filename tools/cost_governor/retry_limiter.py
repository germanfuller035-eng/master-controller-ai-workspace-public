from __future__ import annotations

import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
RETRY_POLICY_PATH = ROOT / "config" / "runtime" / "RETRY_POLICY.json"
RETRY_BUDGET_PATH = ROOT / "config" / "costs" / "RETRY_BUDGET_LIMITS.json"


class RetryLimiter:
    def __init__(self, retry_policy_path: Path | None = None, retry_budget_path: Path | None = None) -> None:
        self.retry_policy = json.loads((retry_policy_path or RETRY_POLICY_PATH).read_text(encoding="utf-8"))
        self.retry_budget = json.loads((retry_budget_path or RETRY_BUDGET_PATH).read_text(encoding="utf-8"))

    @property
    def max_retries_per_step(self) -> int:
        return int(self.retry_policy.get("max_retries_per_step", 0))

    def enforce(self, retry_count: int, retry_budget_spent_rub: float = 0.0, loop_policy: str | None = None) -> dict[str, Any]:
        if loop_policy and loop_policy.upper() == "UNLIMITED":
            return {"allowed": False, "reason": "UNLIMITED_LOOP_DENIED"}
        if retry_count > self.max_retries_per_step:
            return {"allowed": False, "reason": "RETRY_LIMIT_EXCEEDED", "max_retries_per_step": self.max_retries_per_step}
        max_retry_budget = float(self.retry_budget.get("max_retry_budget_rub_per_task", 0))
        if retry_budget_spent_rub > max_retry_budget:
            return {"allowed": False, "reason": "RETRY_BUDGET_EXCEEDED", "max_retry_budget_rub": max_retry_budget}
        return {"allowed": True, "reason": "WITHIN_RETRY_LIMITS", "max_retries_per_step": self.max_retries_per_step}
