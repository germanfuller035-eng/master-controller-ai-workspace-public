
import unittest
from tools.observability.log_redaction import PLACEHOLDER, redact_event, redact_text
class LogRedactionTests(unittest.TestCase):
    def test_secret_looking_values_redacted(self): self.assertEqual(redact_text("token=FAKE_TOKEN_VALUE"), PLACEHOLDER)
    def test_sensitive_key_redacted(self): self.assertEqual(redact_event({"provider_key": "FAKE_PROVIDER_KEY"})["provider_key"], PLACEHOLDER)
if __name__ == "__main__": unittest.main()
