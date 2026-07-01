def evaluate_false_success(result: dict) -> dict:
    if result.get("final_status") == "PASS" and not result.get("evidence"): return {"passed": True, "decision": "DENY_FALSE_SUCCESS"}
    return {"passed": True, "decision": "ALLOW_WITH_EVIDENCE"}
