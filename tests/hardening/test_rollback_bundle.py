from __future__ import annotations

import unittest

from tools.hardening.build_rollback_bundle import build_rollback_bundle


class RollbackBundleTest(unittest.TestCase):
    def test_rollback_bundle_contains_required_indexes(self) -> None:
        result = build_rollback_bundle()
        self.assertEqual(result["result"], "PASS")
        self.assertFalse(result["release_tag_created"])
        self.assertFalse(result["merge_done"])
        self.assertFalse(result["deploy_done"])
        self.assertTrue(result["commit_list"].endswith("COMMIT_LIST.md"))
        self.assertTrue(result["evidence_index"].endswith("EVIDENCE_INDEX.md"))
        self.assertTrue(result["rollback_docs"].endswith("ROLLBACK_DOCS.md"))


if __name__ == "__main__":
    unittest.main()
