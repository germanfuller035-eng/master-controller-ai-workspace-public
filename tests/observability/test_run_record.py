
import unittest
from tools.observability.run_record import validate_run_record
class RunRecordTests(unittest.TestCase):
    def record(self):
        return {"trace_id": "trace", "task_id": "task", "workflow_id": "workflow", "agent_id": "agent", "model": "deterministic", "provider": "local", "prompt_version": "v1", "tool_calls": [], "policy_decisions": [], "approvals": [], "tokens": {"input": 0, "output": 0}, "calculated_cost": 0, "duration": 1, "retry_count": 0, "artifacts": ["artifact"], "verification": {"evidence_refs": ["artifact"]}, "final_status": "PASS"}
    def test_run_record_requires_mandatory_fields(self):
        record = self.record(); record.pop("model"); self.assertFalse(validate_run_record(record)["valid"])
    def test_run_record_validates(self): self.assertTrue(validate_run_record(self.record())["valid"])
    def test_false_pass_without_evidence_flagged(self):
        record = self.record(); record["artifacts"] = []; record["verification"] = {}; self.assertEqual(validate_run_record(record)["reason"], "FALSE_PASS_WITHOUT_EVIDENCE")
if __name__ == "__main__": unittest.main()
