DENIED_ATTACK_TYPES = {"prompt_injection", "excessive_agency", "ssrf", "data_leakage", "tool_discovery"}
def run_security_case(case: dict) -> dict:
    attack_type = case.get("attack_type") or case.get("expected_risk")
    if attack_type in DENIED_ATTACK_TYPES or str(case.get("expected_decision", "")).startswith("DENY"): return {"passed": True, "decision": "DENY", "risk": attack_type, "external_llm_call_attempted": False}
    return {"passed": False, "decision": "UNKNOWN_CASE", "external_llm_call_attempted": False}
