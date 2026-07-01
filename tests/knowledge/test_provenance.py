from __future__ import annotations

from pathlib import Path
import unittest

from tools.knowledge.artifact_metadata import load_document_artifact
from tools.knowledge.provenance import ProvenanceValidationError, make_provenance_record, validate_provenance

ROOT = Path(__file__).resolve().parents[2]


class ProvenanceTests(unittest.TestCase):
    def test_provenance_created_for_artifact(self) -> None:
        artifact = load_document_artifact(ROOT / "tests/fixtures/knowledge/synthetic_public_doc.md")
        record = make_provenance_record(artifact)
        self.assertEqual(validate_provenance(record)["status"], "PASS")
        self.assertEqual(record["artifact_id"], artifact["artifact_id"])

    def test_missing_provenance_field_denied(self) -> None:
        with self.assertRaises(ProvenanceValidationError):
            validate_provenance({"provenance_id": "prov_missing"})


if __name__ == "__main__":
    unittest.main()
