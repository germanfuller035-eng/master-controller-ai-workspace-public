
import unittest
from tools.sandbox.sandbox_stop import enforce_sandbox_stop
class SandboxStopTests(unittest.TestCase):
    def test_stop_blocks_sandbox_run(self): self.assertFalse(enforce_sandbox_stop({"active": True})["allowed"])
    def test_stop_inactive_allows(self): self.assertTrue(enforce_sandbox_stop(False)["allowed"])
if __name__ == "__main__": unittest.main()
