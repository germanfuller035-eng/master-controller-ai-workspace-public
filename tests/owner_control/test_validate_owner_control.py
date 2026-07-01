import unittest

from tools.owner_control.core import OwnerControlPolicyError, reject_false_pass_without_evidence, run_stage_gate, validate_owner_control_contracts


class ValidateOwnerControlTests(unittest.TestCase):
    def test_false_pass_without_evidence_is_rejected(self):
        with self.assertRaises(OwnerControlPolicyError):
            reject_false_pass_without_evidence({"synthetic": True, "status": "PASS"})

    def test_validator_and_stage_gate_pass(self):
        self.assertEqual(validate_owner_control_contracts(), [])
        self.assertEqual(run_stage_gate()["status"], "PASS")
