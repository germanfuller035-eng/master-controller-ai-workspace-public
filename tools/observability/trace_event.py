REQUIRED_TRACE_FIELDS = ["trace_id", "task_id", "workflow_id", "agent_id"]
def validate_trace_event(event: dict) -> dict:
    missing = [field for field in REQUIRED_TRACE_FIELDS if not event.get(field)]
    return {"valid": not missing, "reason": f"MISSING_{missing[0].upper()}"} if missing else {"valid": True, "reason": "TRACE_EVENT_OK"}
