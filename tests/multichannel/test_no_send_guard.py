import unittest
from tools.multichannel.core import no_send_guard, select_channel

class NoSendGuardTests(unittest.TestCase):
    def test_no_send_and_stop_block_outbound(self):
        self.assertEqual(no_send_guard('send')['decision'], 'BLOCK')
        self.assertEqual(select_channel({'synthetic': True, 'contact_ref': 'reserved'}, stop_active=True)['decision'], 'BLOCKED_BY_STOP')
