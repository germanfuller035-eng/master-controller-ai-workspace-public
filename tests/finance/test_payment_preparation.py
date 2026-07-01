import unittest

from tools.finance import FIXTURE_DIR, FinancePolicyError, load_json
from tools.finance.payment_preparation import attempt_payment_execution, validate_payment_preparation


class PaymentPreparationTests(unittest.TestCase):
    def test_payment_preparation_validates_and_execution_blocked(self):
        result = validate_payment_preparation(load_json(FIXTURE_DIR / "synthetic_payment_preparation.json"))
        self.assertEqual(result["status"], "PASS")
        self.assertTrue(result["preparation_only"])
        self.assertTrue(result["payment_execution_blocked"])
        self.assertTrue(result["owner_approval_required_for_future_payment"])
        self.assertEqual(len(result["payload_hash"]), 64)
        with self.assertRaises(FinancePolicyError):
            attempt_payment_execution({})


if __name__ == "__main__":
    unittest.main()
