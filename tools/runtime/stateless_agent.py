from __future__ import annotations

from typing import Any


class StatelessAgent:
    def __init__(self, memory_enabled: bool = False) -> None:
        self.memory_enabled = memory_enabled

    def execute(self, task: dict[str, Any]) -> dict[str, Any]:
        if self.memory_enabled or task.get("memory_enabled") is True:
            return {"status": "DENIED", "error_code": "MEMORY_ENABLED_FORBIDDEN", "memory_enabled": True}
        if task.get("persistent_memory_write") is True:
            return {"status": "DENIED", "error_code": "PERSISTENT_MEMORY_WRITE_DENIED", "memory_enabled": False}
        return {
            "status": "STATELESS_OK",
            "memory_enabled": False,
            "persistent_memory_write": "DENIED",
            "memory_proposal_allowed": True,
            "state_written": False,
        }
