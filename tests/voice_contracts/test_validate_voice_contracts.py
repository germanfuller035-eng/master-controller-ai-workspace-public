import unittest
from tools.voice_contracts.core import FIXTURE_DIR, create_voice_action_plan, load_json, validate_voice_contracts

class ValidateVoiceContractsTests(unittest.TestCase):
    def test_validator_and_stop_block_voice(self):
        self.assertEqual(validate_voice_contracts(), [])
        result = create_voice_action_plan(load_json(FIXTURE_DIR / 'synthetic_voice_intent_safe.json'), stop_active=True)
        self.assertEqual(result['decision'], 'BLOCKED_BY_STOP')
