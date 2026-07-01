import unittest
from tools.voice_contracts.core import FIXTURE_DIR, classify_voice_intent, load_json, validate_stt_result

class SttIntentTests(unittest.TestCase):
    def test_synthetic_stt_and_intent(self):
        self.assertEqual(validate_stt_result(load_json(FIXTURE_DIR / 'synthetic_stt_result.json'))['status'], 'PASS')
        self.assertEqual(classify_voice_intent(load_json(FIXTURE_DIR / 'synthetic_voice_intent_safe.json'))['risk'], 'R1')
