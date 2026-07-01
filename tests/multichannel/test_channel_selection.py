import unittest
from tools.multichannel.core import CHANNEL_MAIL, select_channel

class ChannelSelectionTests(unittest.TestCase):
    def test_channel_selected_from_synthetic_context(self):
        result = select_channel({'synthetic': True, 'contact_ref': 'reserved-contact', 'preferred_channel': CHANNEL_MAIL, 'available_channels': [CHANNEL_MAIL]})
        self.assertEqual(result['selected_channel'], CHANNEL_MAIL)
        self.assertFalse(result['send_allowed'])
        self.assertTrue(result['owner_approval_required_for_future_send'])
