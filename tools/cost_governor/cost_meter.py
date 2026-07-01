from __future__ import annotations

import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
MODEL_COST_LIMITS_PATH = ROOT / "config" / "models" / "MODEL_COST_LIMITS.json"


class CostMeter:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or MODEL_COST_LIMITS_PATH
        self.data = json.loads(self.path.read_text(encoding="utf-8"))
        self.limits = {item["model_id"]: item for item in self.data.get("cost_limits", [])}

    def estimate(self, model_id: str, input_tokens: int, output_tokens: int, retry_count: int = 0) -> dict[str, Any]:
        if input_tokens < 0 or output_tokens < 0 or retry_count < 0:
            raise ValueError("token counts and retry count must be non-negative")
        rates = self.limits.get(model_id) or self.limits.get("deterministic_fallback_process")
        if not rates:
            raise KeyError(f"missing cost limit for {model_id}")
        base = (input_tokens / 1000.0) * float(rates["input_per_1k_rub"])
        base += (output_tokens / 1000.0) * float(rates["output_per_1k_rub"])
        total = round(base * (1 + retry_count), 4)
        return {
            "model_id": model_id,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "retry_count": retry_count,
            "estimated_rub": total,
            "max_task_budget_rub": rates.get("max_task_budget_rub"),
            "currency": self.data.get("currency", "RUB_EQUIVALENT"),
        }
