from __future__ import annotations

from pathlib import Path
import unittest

from tools.knowledge.artifact_metadata import ArtifactValidationError, load_document_artifact, validate_artifact_metadata

ROOT = Path(__file__).resolve().parents[2]


class ArtifactMetadataTests(unittest.TestCase):
    def test_synthetic_public_doc_accepted(self) -> None:
        artifact = load_document_artifact(ROOT / "tests/fixtures/knowledge/synthetic_public_doc.md")
        self.assertEqual(artifact["data_class"], "SYNTHETIC_PUBLIC")
        self.assertEqual(validate_artifact_metadata(artifact)["status"], "PASS")

    def test_artifact_requires_source_date_data_class_and_sha256(self) -> None:
        artifact = load_document_artifact(ROOT / "tests/fixtures/knowledge/synthetic_public_doc.md")
        for field in ["source_id", "data_class", "sha256"]:
            broken = dict(artifact)
            broken[field] = ""
            with self.assertRaises(ArtifactValidationError):
                validate_artifact_metadata(broken)
        broken = dict(artifact)
        broken["source_date"] = ""
        broken["created_at"] = ""
        with self.assertRaises(ArtifactValidationError):
            validate_artifact_metadata(broken)


if __name__ == "__main__":
    unittest.main()
