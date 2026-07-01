import unittest
from tools.multichannel.core import create_telegram_reserve_notice

class TelegramReserveTests(unittest.TestCase):
    def test_telegram_notice_not_sent(self):
        draft = create_telegram_reserve_notice({'synthetic': True, 'draft_ref': 'A', 'contact_ref': 'reserved-telegram'})
        self.assertTrue(draft['reserve_only'])
        self.assertFalse(draft['telegram_sent'])
