
REQUIRED_RUN_FIELDS = ["trace_id", "task_id", "workflow_id", "agent_id", "model", "provider", "prompt_version", "tool_calls", "policy_decisions", "approvals", "tokens", "calculated_cost", "duration", "retry_count", "artifacts", "verification", "final_status"]
def validate_run_record(record: dict) -> dict:
    missing = [field for field in REQUIRED_RUN_FIELDS if field not in record]
    if missing: return {"valid": False, "reason": f"MISSING_{missing[0].upper()}"}
    if record.get("final_status") == "PASS":
        verification = record.get("verification") or {}
        evidence = verification.get("evidence_refs") if isinstance(verification, dict) else None
        if not record.get("artifacts") and not evidence: return {"valid": False, "reason": "FALSE_PASS_WITHOUT_EVIDENCE"}
    return {"valid": True, "reason": "RUN_RECORD_OK"}
