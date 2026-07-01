def compare_expected_output(case: dict, actual_output: str) -> dict:
    expected = str(case.get("expected_output", ""))
    return {"passed": False, "decision": "FAIL_REGRESSION", "expected": expected, "actual": actual_output} if actual_output != expected else {"passed": True, "decision": "PASS_REGRESSION"}
