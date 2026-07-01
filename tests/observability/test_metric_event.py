
import unittest
from tools.observability.metric_event import validate_metric_event
class MetricEventTests(unittest.TestCase):
    def test_metric_event_validates(self): self.assertTrue(validate_metric_event({"metric_name": "sandbox.duration", "metric_kind": "gauge", "value": 1.2, "unit": "seconds", "task_id": "task"})["valid"])
if __name__ == "__main__": unittest.main()
