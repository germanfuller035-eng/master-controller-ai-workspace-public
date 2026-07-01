from __future__ import annotations

from pathlib import Path
import unittest

from tools.knowledge.artifact_metadata import load_document_artifact
from tools.knowledge.ingestion_policy import evaluate_ingestion_request
from tools.knowledge.provenance import make_provenance_record

ROOT = Path(__file__).resolve().parents[2]


class IngestionPolicyTests(unittest.TestCase):
    def test_synthetic_public_doc_accepted(self) -> None:
        artifact = load_document_artifact(ROOT / "tests/fixtures/knowledge/synthetic_public_doc.md")
        provenance = make_provenance_record(artifact)
        result = evaluate_ingestion_request({"request_id": "ingest_valid_001", "artifact": artifact, "provenance": provenance, "environment": "LOCAL_SYNTHETIC"})
        self.assertEqual(result["status"], "ACCEPTED_LOCAL_SYNTHETIC")
        self.assertFalse(result["production_write"])

    def test_missing_provenance_denied(self) -> None:
        artifact = load_document_artifact(ROOT / "tests/fixtures/knowledge/synthetic_public_doc.md")
        result = evaluate_ingestion_request({"request_id": "ingest_missing_prov_001", "artifact": artifact, "environment": "LOCAL_SYNTHETIC"})
        self.assertIn("missing_provenance", result["errors"])

    def test_secret_like_doc_denied(self) -> None:
        artifact = load_document_artifact(ROOT / "tests/fixtures/knowledge/secret_like_doc.md")
        provenance = make_provenance_record(artifact)
        result = evaluate_ingestion_request({"request_id": "ingest_secret_001", "artifact": artifact, "provenance": provenance, "environment": "LOCAL_SYNTHETIC"})
        self.assertIn("secret_like_content_denied", result["errors"])

    def test_sensitive_fake_military_doc_requires_owner_approval(self) -> None:
        artifact = load_document_artifact(ROOT / "tests/fixtures/knowledge/sensitive_fake_military_doc.md")
        provenance = make_provenance_record(artifact)
        result = evaluate_ingestion_request({"request_id": "ingest_sensitive_001", "artifact": artifact, "provenance": provenance, "environment": "LOCAL_SYNTHETIC"})
        self.assertIn("sensitive_requires_owner_approval", result["errors"])


if __name__ == "__main__":
    unittest.main()
