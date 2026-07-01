import unittest
from tools.voice_contracts.core import FIXTURE_DIR, load_json, validate_push_to_talk_request

class PushToTalkTests(unittest.TestCase):
    def test_push_to_talk_no_always_on(self):
        result = validate_push_to_talk_request(load_json(FIXTURE_DIR / 'synthetic_push_to_talk_request.json'))
        self.assertEqual(result['status'], 'PASS')
        self.assertFalse(result['always_on_listening'])
