
import unittest
from tools.observability.incident_event import validate_incident_event
class IncidentEventTests(unittest.TestCase):
    def test_incident_event_validates(self): self.assertTrue(validate_incident_event({"incident_id": "inc", "trace_id": "trace", "task_id": "task", "severity": "HIGH", "policy_decision": "DENY", "verification": {"evidence_refs": ["local"]}, "final_status": "DENIED"})["valid"])
if __name__ == "__main__": unittest.main()
