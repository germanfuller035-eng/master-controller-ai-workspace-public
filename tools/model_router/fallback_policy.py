from __future__ import annotations

import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
FALLBACK_POLICY_PATH = ROOT / "config" / "models" / "MODEL_FALLBACK_POLICY.json"


class FallbackPolicy:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or FALLBACK_POLICY_PATH
        self.data = json.loads(self.path.read_text(encoding="utf-8"))
        self.chains = {item["task_type"]: item for item in self.data.get("fallback_chains", [])}

    def chain_for(self, task_type: str) -> list[str]:
        chain = self.chains.get(task_type)
        if not chain:
            return ["deterministic_fallback_process"]
        return list(chain.get("models", []))

    def max_provider_fallbacks(self, task_type: str) -> int:
        chain = self.chains.get(task_type)
        if not chain:
            return 0
        return int(chain.get("max_provider_fallbacks", 0))

    def deterministic_available(self) -> bool:
        return self.data.get("ai_unavailable_policy") == "CONTINUE_DETERMINISTIC_WHERE_POSSIBLE"
