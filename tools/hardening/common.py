from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
GENERATED_DIR = ROOT / "_generated" / "hardening_release_v1"
SESSION_NAME = "AI_SYSTEM_HARDENING_DISASTER_RECOVERY_AND_RELEASE_V1"
BASE_HEAD = "1a25dae0b818d8a8ded66afe9624b7a1060fbf39"
BRANCH = "feature/ai-system-hardening-disaster-recovery-release-v1"


def rel(path: Path) -> str:
    return str(path.resolve().relative_to(ROOT)).replace("\\", "/")


def read_json(rel_path: str) -> Any:
    return json.loads((ROOT / rel_path).read_text(encoding="utf-8"))


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text.rstrip() + "\n", encoding="utf-8", newline="\n")


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def run(args: list[str], timeout: int = 300) -> tuple[int, str]:
    result = subprocess.run(
        args,
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
        timeout=timeout,
    )
    return result.returncode, result.stdout.strip()


def run_python(args: list[str], timeout: int = 300) -> tuple[int, str]:
    return run([sys.executable, *args], timeout=timeout)


def git(args: list[str], timeout: int = 120) -> tuple[int, str]:
    return run(["git", *args], timeout=timeout)


def status_paths() -> list[str]:
    code, out = git(["status", "--porcelain=v1", "--untracked-files=all"])
    if code != 0:
        return []
    paths: list[str] = []
    for line in out.splitlines():
        if not line:
            continue
        raw = line[3:]
        if " -> " in raw:
            raw = raw.split(" -> ", 1)[1]
        paths.append(raw.replace("\\", "/"))
    return paths


def component_changed(prefixes: tuple[str, ...]) -> bool:
    return any(path.startswith(prefixes) for path in status_paths())


def release_gate_decision(decisions: dict[str, bool] | None = None) -> dict[str, Any]:
    decisions = decisions or {}
    gated = {
        "merge": bool(decisions.get("merge")),
        "tag": bool(decisions.get("tag")),
        "deploy": bool(decisions.get("deploy")),
        "android_acceptance": bool(decisions.get("android_acceptance")),
        "legacy_full_run": bool(decisions.get("legacy_full_run")),
        "secret_rotation": bool(decisions.get("secret_rotation")),
        "cleanup_quarantine": bool(decisions.get("cleanup_quarantine")),
    }
    blocked = [name for name, approved in gated.items() if not approved]
    return {
        "result": "BLOCKED_PENDING_OWNER_GATE" if blocked else "APPROVED_BY_OWNER_GATE",
        "blocked": blocked,
        "decisions": gated,
        "release_tag_created": False,
        "merge_done": False,
        "deploy_done": False,
    }


def markdown_table(headers: list[str], rows: list[list[str]]) -> str:
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join("---" for _ in headers) + " |",
    ]
    lines.extend("| " + " | ".join(str(cell).replace("\n", "<br>") for cell in row) + " |" for row in rows)
    return "\n".join(lines)
