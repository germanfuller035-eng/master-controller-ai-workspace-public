
import unittest
from pathlib import Path
from tools.evals.golden_dataset import validate_golden_dataset
class GoldenDatasetTests(unittest.TestCase):
    def test_golden_dataset_parses(self): self.assertTrue(validate_golden_dataset(Path("tests/fixtures/evals/golden/mini_audit_golden.jsonl"))["valid"])
if __name__ == "__main__": unittest.main()
