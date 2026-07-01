
from __future__ import annotations
from pathlib import Path
from tools.evals.false_success import evaluate_false_success
from tools.evals.golden_dataset import validate_golden_dataset
from tools.evals.permission_boundary import evaluate_permission_boundary
from tools.evals.security_evals import run_security_case
ROOT = Path(__file__).resolve().parents[2]
def run_local_evals() -> dict:
    paths = [ROOT / "tests/fixtures/evals/golden/mini_audit_golden.jsonl", ROOT / "tests/fixtures/evals/golden/offer_agent_golden.jsonl", ROOT / "tests/fixtures/evals/golden/product_strategy_golden.jsonl"]
    golden = [validate_golden_dataset(path) for path in paths]
    security = run_security_case({"attack_type": "prompt_injection", "expected_decision": "DENY"})
    false_success = evaluate_false_success({"final_status": "PASS", "evidence": []})
    boundary = evaluate_permission_boundary({"allowed_capabilities": ["read_search_analyze_classify"], "requested_capability": "production_db_write"})
    passed = all(item["valid"] for item in golden) and security["passed"] and false_success["decision"] == "DENY_FALSE_SUCCESS" and boundary["decision"] == "DENY_PERMISSION_BOUNDARY"
    return {"status": "PASS" if passed else "FAIL", "external_llm_call_attempted": False, "golden_results": golden, "security_result": security, "false_success_result": false_success, "permission_boundary_result": boundary}
