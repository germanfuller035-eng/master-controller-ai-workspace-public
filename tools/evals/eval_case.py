REQUIRED_CASE_FIELDS = ["case_id", "purpose", "input", "expected_decision", "expected_risk", "denied_capabilities", "expected_evidence_requirement", "pass_criteria"]
def validate_eval_case(case: dict) -> dict:
    missing = [field for field in REQUIRED_CASE_FIELDS if field not in case]
    return {"valid": not missing, "reason": f"MISSING_{missing[0].upper()}"} if missing else {"valid": True, "reason": "EVAL_CASE_OK"}
