
from __future__ import annotations
from dataclasses import dataclass
from typing import Any
ALLOWED_TRANSITIONS = {"REQUESTED": {"CREATED", "CANCELLED"}, "CREATED": {"RUNNING", "PAUSED", "CANCELLED", "CLEANED_UP"}, "RUNNING": {"PAUSED", "CANCELLED", "COMPLETED"}, "PAUSED": {"RUNNING", "CANCELLED", "CLEANED_UP"}, "CANCELLED": {"CLEANED_UP"}, "COMPLETED": {"CLEANED_UP"}, "CLEANED_UP": set()}
@dataclass(frozen=True)
class SandboxRun:
    run_id: str
    task_id: str
    state: str
    cleanup_required: bool
def create_run(task_id: str, run_id: str = "synthetic-run") -> SandboxRun:
    return SandboxRun(run_id, task_id, "CREATED", True)
def transition(run: SandboxRun, target_state: str) -> SandboxRun:
    if target_state not in ALLOWED_TRANSITIONS.get(run.state, set()): raise ValueError(f"invalid transition {run.state} -> {target_state}")
    return SandboxRun(run.run_id, run.task_id, target_state, target_state != "CLEANED_UP")
def pause_run(run: SandboxRun) -> SandboxRun: return transition(run, "PAUSED")
def cancel_run(run: SandboxRun) -> SandboxRun: return transition(run, "CANCELLED")
def cleanup_run(run: SandboxRun) -> SandboxRun: return transition(run, "CLEANED_UP")
def lifecycle_event(run: SandboxRun) -> dict[str, Any]: return {"run_id": run.run_id, "task_id": run.task_id, "state": run.state, "cleanup_required": run.cleanup_required}
