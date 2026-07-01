import unittest
from tools.personal_assistant.validate_personal_assistant import validate_all
class ValidatePersonalAssistantTests(unittest.TestCase):
    def test_validator_passes(self):
        self.assertEqual(validate_all(), [])
if __name__ == "__main__": unittest.main()
