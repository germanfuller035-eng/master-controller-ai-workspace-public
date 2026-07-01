from __future__ import annotations

import unittest

from tools.model_router.model_validator import validate


class ModelValidatorTests(unittest.TestCase):
    def test_model_config_validates(self) -> None:
        status, errors, _loaded = validate()
        self.assertEqual(status, "PASS", errors)


if __name__ == "__main__":
    unittest.main()
