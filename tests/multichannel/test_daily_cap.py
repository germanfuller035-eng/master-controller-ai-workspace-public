import unittest
from tools.multichannel.core import CHANNEL_MAIL, select_channel

class DailyCapTests(unittest.TestCase):
    def test_daily_cap_blocks_over_limit_draft(self):
        result = select_channel({'synthetic': True, 'contact_ref': 'reserved-cap', 'preferred_channel': CHANNEL_MAIL, 'available_channels': [CHANNEL_MAIL]}, [], [{'synthetic': True, 'channel': CHANNEL_MAIL, 'daily_cap': 1, 'used_today': 1}])
        self.assertEqual(result['decision'], 'BLOCKED_DAILY_CAP')
