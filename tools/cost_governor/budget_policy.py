from __future__ import annotations

import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
COST_POLICY_PATH = ROOT / "config" / "costs" / "COST_GOVERNOR_POLICY.json"
TASK_LIMITS_PATH = ROOT / "config" / "costs" / "TASK_BUDGET_LIMITS.json"


class BudgetPolicy:
    def __init__(self, cost_policy_path: Path | None = None, task_limits_path: Path | None = None) -> None:
        self.cost_policy = json.loads((cost_policy_path or COST_POLICY_PATH).read_text(encoding="utf-8"))
        self.task_limits_data = json.loads((task_limits_path or TASK_LIMITS_PATH).read_text(encoding="utf-8"))
        self.task_limits = {item["task_type"]: item for item in self.task_limits_data.get("limits", [])}

    def enforce(
        self,
        task_type: str,
        estimate: dict[str, Any],
        requested_task_budget_rub: float | None = None,
        monthly_spend_rub: float = 0.0,
        stop_loss_ack: bool = False,
        max_iterations: int | str | None = 1,
    ) -> dict[str, Any]:
        if isinstance(max_iterations, str) and max_iterations.upper() == "UNLIMITED":
            return {"allowed": False, "reason": "UNLIMITED_LOOP_DENIED"}
        if max_iterations is None:
            return {"allowed": False, "reason": "UNLIMITED_LOOP_DENIED"}

        estimate_rub = float(estimate.get("estimated_rub", 0.0))
        active_monthly = float(self.cost_policy["active_monthly_budget_rub"])
        if monthly_spend_rub + estimate_rub > active_monthly:
            return {"allowed": False, "reason": "MONTHLY_CAP_EXCEEDED", "active_monthly_budget_rub": active_monthly}

        task_limit = self.task_limits.get(task_type, {})
        configured_cap = float(task_limit.get("max_task_budget_rub", self.task_limits_data.get("default_task_budget_rub", 0)))
        requested_cap = configured_cap if requested_task_budget_rub is None else min(float(requested_task_budget_rub), configured_cap)
        if estimate_rub > requested_cap:
            return {"allowed": False, "reason": "TASK_CAP_EXCEEDED", "task_budget_rub": requested_cap}

        expensive_threshold = float(self.cost_policy.get("expensive_task_threshold_rub", 0))
        expensive = estimate_rub >= expensive_threshold or bool(task_limit.get("requires_stop_loss"))
        if expensive and self.cost_policy.get("stop_loss_required_for_expensive_task") and not stop_loss_ack:
            return {"allowed": False, "reason": "STOP_LOSS_REQUIRED", "expensive_task_threshold_rub": expensive_threshold}

        return {
            "allowed": True,
            "reason": "WITHIN_BUDGET",
            "task_budget_rub": requested_cap,
            "active_monthly_budget_rub": active_monthly,
            "monthly_spend_rub": monthly_spend_rub,
        }
