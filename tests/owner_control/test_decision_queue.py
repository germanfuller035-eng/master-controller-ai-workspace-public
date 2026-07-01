import unittest

from tools.owner_control.decision_queue import decision_queue


class DecisionQueueTests(unittest.TestCase):
    def test_urgent_approvals_first(self):
        result = decision_queue()
        self.assertTrue(result["urgent_approvals_first"])
        self.assertEqual(result["decisions"][0]["risk"], "R4")
