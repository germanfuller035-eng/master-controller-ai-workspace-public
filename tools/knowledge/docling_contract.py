from __future__ import annotations

from typing import Any


class DoclingContractError(ValueError):
    pass


def validate_docling_parse_result(result: dict[str, Any]) -> dict[str, str]:
    required = ["parse_id", "artifact_id", "synthetic", "pages", "text_chunks", "parser_status"]
    missing = [field for field in required if result.get(field) in (None, "")]
    if missing:
        raise DoclingContractError(f"missing {missing[0]}")
    if result.get("synthetic") is not True:
        raise DoclingContractError("synthetic_parse_result_required")
    if result.get("parser_status") != "CONTRACT_ONLY_NOT_INSTALLED":
        raise DoclingContractError("docling_must_remain_not_installed")
    if not isinstance(result.get("pages"), list) or not isinstance(result.get("text_chunks"), list):
        raise DoclingContractError("pages_and_text_chunks_must_be_lists")
    return {"status": "PASS", "parse_id": result["parse_id"]}
