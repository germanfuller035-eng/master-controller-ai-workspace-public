import unittest
from tools.commercial.capacity_planner import plan_capacity

class CapacityPlannerTests(unittest.TestCase):
    def test_capacity_limit_throttles_expensive_drafts(self):
        result = plan_capacity({"expensive_material_limit":2, "expensive_materials_used":2}, 1)
        self.assertEqual(result["capacity_status"], "THROTTLED")
        self.assertTrue(result["throttled"])
