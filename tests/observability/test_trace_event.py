
import unittest
from tools.observability.trace_event import validate_trace_event
class TraceEventTests(unittest.TestCase):
    def test_trace_event_requires_ids(self): self.assertFalse(validate_trace_event({"trace_id": "t"})["valid"])
    def test_trace_event_validates(self): self.assertTrue(validate_trace_event({"trace_id": "t", "task_id": "task", "workflow_id": "wf", "agent_id": "agent"})["valid"])
if __name__ == "__main__": unittest.main()
