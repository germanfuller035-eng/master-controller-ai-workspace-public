
import unittest
from tools.sandbox.resource_limits import validate_resource_limits
class ResourceLimitsTests(unittest.TestCase):
    def test_timeout_required(self): self.assertFalse(validate_resource_limits({"cpu_cores": 1, "memory_mb": 128})["allowed"])
    def test_cpu_ram_limit_required(self): self.assertFalse(validate_resource_limits({"timeout_seconds": 30})["allowed"])
    def test_valid_limits_allowed(self): self.assertTrue(validate_resource_limits({"timeout_seconds": 30, "cpu_cores": 1, "memory_mb": 128})["allowed"])
if __name__ == "__main__": unittest.main()
