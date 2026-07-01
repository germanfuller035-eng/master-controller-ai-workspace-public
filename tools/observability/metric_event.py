ALLOWED_KINDS = {"counter", "gauge", "histogram"}
def validate_metric_event(event: dict) -> dict:
    missing = [field for field in ["metric_name", "metric_kind", "value", "unit", "task_id"] if field not in event]
    if missing: return {"valid": False, "reason": f"MISSING_{missing[0].upper()}"}
    if event["metric_kind"] not in ALLOWED_KINDS: return {"valid": False, "reason": "INVALID_METRIC_KIND"}
    if not isinstance(event["value"], (int, float)): return {"valid": False, "reason": "INVALID_METRIC_VALUE"}
    return {"valid": True, "reason": "METRIC_EVENT_OK"}
