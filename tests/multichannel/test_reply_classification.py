import unittest
from tools.multichannel.core import classify_reply

class ReplyClassificationTests(unittest.TestCase):
    def test_reply_labels(self):
        cases = [('yes interested', 'positive'), ('no stop', 'negative'), ('how price?', 'question'), ('lottery crypto spam', 'spam')]
        for body, label in cases:
            self.assertEqual(classify_reply({'synthetic': True, 'reply_id': label, 'body': body})['label'], label)
