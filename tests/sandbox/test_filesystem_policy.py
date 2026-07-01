
import tempfile, unittest
from pathlib import Path
from tools.sandbox.filesystem_policy import evaluate_filesystem_path
class FilesystemPolicyTests(unittest.TestCase):
    def test_path_traversal_denied(self):
        with tempfile.TemporaryDirectory() as tmp: self.assertFalse(evaluate_filesystem_path("../outside.txt", tmp)["allowed"])
    def test_filesystem_outside_root_denied(self):
        with tempfile.TemporaryDirectory() as tmp: self.assertFalse(evaluate_filesystem_path(str(Path(tmp).parent / "outside.txt"), tmp)["allowed"])
    def test_inside_root_allowed(self):
        with tempfile.TemporaryDirectory() as tmp: self.assertTrue(evaluate_filesystem_path("inside.txt", tmp)["allowed"])
if __name__ == "__main__": unittest.main()
