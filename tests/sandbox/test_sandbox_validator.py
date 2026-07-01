
import unittest
from tools.sandbox.validate_sandbox import validate
class SandboxValidatorTests(unittest.TestCase):
    def test_sandbox_validator_passes(self):
        status, errors = validate(); self.assertEqual(errors, []); self.assertEqual(status, "PASS")
if __name__ == "__main__": unittest.main()
