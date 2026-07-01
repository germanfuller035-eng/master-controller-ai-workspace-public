
import unittest
from tools.sandbox.sandbox_policy import evaluate_sandbox_request
class SandboxPolicyTests(unittest.TestCase):
    def payload(self):
        return {"task_id": "sandbox-test", "environment": "LOCAL_SYNTHETIC", "local_synthetic_fixture": True, "requested_capabilities": [], "resource_limits": {"timeout_seconds": 30, "cpu_cores": 1, "memory_mb": 256}, "egress_target": "synthetic://fixture-metadata", "filesystem_path": ".", "stop_state": False}
    def test_production_sandbox_disabled(self):
        p = self.payload(); p["environment"] = "PRODUCTION"; self.assertEqual(evaluate_sandbox_request(p)["decision"], "PRODUCTION_SANDBOX_DISABLED")
    def test_local_synthetic_fixture_allowed(self): self.assertEqual(evaluate_sandbox_request(self.payload())["status"], "LOCAL_SYNTHETIC_ALLOWED")
    def test_docker_socket_denied(self):
        p = self.payload(); p["requested_capabilities"] = ["direct_docker_socket"]; self.assertIn("CAPABILITY_DENIED", evaluate_sandbox_request(p)["decision"])
    def test_unrestricted_shell_denied(self):
        p = self.payload(); p["requested_capabilities"] = ["unrestricted_shell"]; self.assertIn("CAPABILITY_DENIED", evaluate_sandbox_request(p)["decision"])
    def test_production_credentials_and_db_denied(self):
        p = self.payload(); p["requested_capabilities"] = ["production_credentials", "production_db"]; self.assertIn("CAPABILITY_DENIED", evaluate_sandbox_request(p)["decision"])
if __name__ == "__main__": unittest.main()
