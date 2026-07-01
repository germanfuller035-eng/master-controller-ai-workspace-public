#!/usr/bin/env python3
"""Scan changed files for secret-looking values without printing values."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = ROOT / "config" / "security" / "SECRET_DENYLIST_PATTERNS.json"
MAX_FILE_BYTES = 2_000_000


@dataclass(frozen=True)
class Match:
    path: str
    line_number: int
    pattern_id: str


def load_config() -> dict:
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def normalize_path(path: str) -> str:
    return path.replace("\\", "/")


def changed_files() -> list[Path]:
    paths: list[Path] = []
    result = subprocess.run(
        ["git", "status", "--porcelain", "--untracked-files=all", "--ignored=matching"],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    for line in result.stdout.splitlines():
        if not line:
            continue
        status = line[:2]
        raw_path = line[3:]
        if " -> " in raw_path:
            raw_path = raw_path.split(" -> ", 1)[1]
        if status.strip() == "D":
            continue
        paths.append(ROOT / raw_path)
    return paths


def is_binary(path: Path) -> bool:
    try:
        chunk = path.read_bytes()[:4096]
    except OSError:
        return True
    return b"\0" in chunk


def allowlisted(config: dict, rel_path: str, line: str) -> bool:
    for item in config.get("allowlisted_examples", []):
        if re.search(item["path_regex"], rel_path) and re.search(item["line_regex"], line):
            return True
    return False


def scan_paths(paths: Iterable[Path]) -> list[Match]:
    config = load_config()
    content_patterns = [(item["id"], re.compile(item["regex"])) for item in config.get("patterns", [])]
    blocked_paths = [(item["id"], re.compile(item["pattern"])) for item in config.get("blocked_paths", [])]
    matches: list[Match] = []

    for path in paths:
        if not path.exists() or not path.is_file():
            continue
        try:
            rel_path = normalize_path(str(path.resolve().relative_to(ROOT)))
        except ValueError:
            rel_path = normalize_path(str(path))
        if rel_path == "config/security/SECRET_DENYLIST_PATTERNS.json":
            continue

        for pattern_id, pattern in blocked_paths:
            if pattern.search(rel_path):
                matches.append(Match(rel_path, 0, pattern_id))

        if path.stat().st_size > MAX_FILE_BYTES or is_binary(path):
            continue

        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except UnicodeDecodeError:
            continue
        for line_number, line in enumerate(lines, start=1):
            if allowlisted(config, rel_path, line):
                continue
            for pattern_id, pattern in content_patterns:
                if pattern.search(line):
                    matches.append(Match(rel_path, line_number, pattern_id))
    return matches


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Scan changed files for secret-looking values.")
    parser.add_argument("paths", nargs="*", help="Optional explicit paths. Defaults to changed/staged/untracked files.")
    args = parser.parse_args(argv)
    paths = [ROOT / path for path in args.paths] if args.paths else changed_files()
    matches = scan_paths(paths)
    if matches:
        for match in matches:
            print(f"{match.path}:{match.line_number}: {match.pattern_id}")
        return 1
    print("SECRETS_FOUND=NO")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
