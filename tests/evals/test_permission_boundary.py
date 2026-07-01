
import unittest
from tools.evals.permission_boundary import evaluate_permission_boundary
class PermissionBoundaryTests(unittest.TestCase):
    def test_permission_boundary_denied(self): self.assertEqual(evaluate_permission_boundary({"allowed_capabilities": ["read_search_analyze_classify"], "requested_capability": "production_db_write"})["decision"], "DENY_PERMISSION_BOUNDARY")
    def test_stop_denies_permission_boundary(self): self.assertEqual(evaluate_permission_boundary({"allowed_capabilities": ["read_search_analyze_classify"], "requested_capability": "read_search_analyze_classify", "stop_active": True})["decision"], "DENY_STOP_ACTIVE")
if __name__ == "__main__": unittest.main()
