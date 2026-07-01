from __future__ import annotations

import unittest

from tools.memory.validate_memory import validate


class ValidateMemoryTests(unittest.TestCase):
    def test_memory_validator_passes_write_off_state(self) -> None:
        status, errors = validate()
        self.assertEqual(errors, [])
        self.assertEqual(status, "PASS")


if __name__ == "__main__":
    unittest.main()
