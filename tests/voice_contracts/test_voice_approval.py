import unittest
from tools.voice_contracts.core import FIXTURE_DIR, create_voice_action_plan, load_json

class VoiceApprovalTests(unittest.TestCase):
    def test_risky_and_payment_actions_blocked(self):
        risky = create_voice_action_plan(load_json(FIXTURE_DIR / 'synthetic_voice_intent_risky.json'))
        self.assertEqual(risky['decision'], 'REQUIRES_SCREEN_APPROVAL')
        payment = create_voice_action_plan({'synthetic': True, 'intent_id': 'payment', 'intent_type': 'payment', 'transcript': 'pay synthetic invoice'})
        self.assertEqual(payment['decision'], 'DENY_PAYMENT_BY_VOICE')
