def evaluate_permission_boundary(case: dict) -> dict:
    if case.get("stop_active") is True: return {"passed": True, "decision": "DENY_STOP_ACTIVE"}
    if case.get("requested_capability") not in set(case.get("allowed_capabilities", [])): return {"passed": True, "decision": "DENY_PERMISSION_BOUNDARY"}
    return {"passed": True, "decision": "ALLOW"}
