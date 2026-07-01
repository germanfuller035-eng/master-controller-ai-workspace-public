def validate_incident_event(event: dict) -> dict:
    required = ["incident_id", "trace_id", "task_id", "severity", "policy_decision", "verification", "final_status"]
    missing = [field for field in required if not event.get(field)]
    if missing: return {"valid": False, "reason": f"MISSING_{missing[0].upper()}"}
    if event["severity"] not in {"LOW", "MEDIUM", "HIGH", "CRITICAL"}: return {"valid": False, "reason": "INVALID_SEVERITY"}
    return {"valid": True, "reason": "INCIDENT_EVENT_OK"}
