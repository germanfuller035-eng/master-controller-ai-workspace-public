import unittest
from tools.multichannel.core import run_intentional_fail_checks, run_no_send_shadow_pipeline, validate_multichannel_contracts

class ValidateMultichannelTests(unittest.TestCase):
    def test_validator_and_shadow_pipeline_pass(self):
        self.assertEqual(validate_multichannel_contracts(), [])
        result = run_no_send_shadow_pipeline()
        self.assertEqual(result['pipeline_status'], 'PASS')
        self.assertEqual(result['outbound_count'], 0)
        self.assertTrue(result['payload_hash_generated'])
        self.assertTrue(run_intentional_fail_checks()['send_attempt_blocked'])
