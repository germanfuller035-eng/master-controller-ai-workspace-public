from __future__ import annotations

import shlex
import subprocess
import sys
from pathlib import Path

from tools.mcp_gateway.adapters.contracts import BaseAdapter
from tools.mcp_gateway.models import AdapterResult, GatewayError, GatewayRequest
from tools.mcp_gateway.redaction import redact_text


ROOT = Path(__file__).resolve().parents[3]
SHELL_MARKERS = (";", "&&", "||", "|", "`", "$(", "\n", "\r")


def _normalize_command(command) -> list[str]:
    if isinstance(command, str):
        parts = shlex.split(command)
    elif isinstance(command, list):
        parts = [str(part) for part in command]
    else:
        raise GatewayError("TEST_COMMAND_INVALID", "command must be string or array", status="DENIED")
    if not parts:
        raise GatewayError("TEST_COMMAND_INVALID", "empty command denied", status="DENIED")
    joined = " ".join(parts)
    if any(marker in joined for marker in SHELL_MARKERS):
        raise GatewayError("TEST_COMMAND_DENIED", "shell metacharacter denied", status="DENIED")
    return parts


def _allowlist_key(parts: list[str]) -> str:
    head = Path(parts[0]).name.lower()
    normalized_head = "python" if head.startswith("python") else parts[0]
    return " ".join([normalized_head, *parts[1:]])


class TestRunnerLocalAdapter(BaseAdapter):
    def execute(self, request: GatewayRequest, timeout_ms: int, cancellation) -> AdapterResult:
        cancellation.check(request.cancellation_token)
        if request.action != "run":
            raise GatewayError("TEST_ACTION_DENIED", "unknown test runner action", status="DENIED")
        parts = _normalize_command(request.input.get("command"))
        key = _allowlist_key(parts).replace("\\", "/")
        allowlist = [str(item).replace("\\", "/") for item in self.registration.raw.get("allowlist", [])]
        if key not in allowlist:
            raise GatewayError("TEST_COMMAND_DENIED", "command not allowlisted", status="DENIED")
        argv = [sys.executable, *parts[1:]] if key.startswith("python ") else parts
        try:
            result = subprocess.run(
                argv,
                cwd=ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                timeout=timeout_ms / 1000,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise GatewayError("TIMEOUT", "test runner timeout", status="TIMEOUT") from exc
        cancellation.check(request.cancellation_token)
        return AdapterResult(
            data={
                "command": key,
                "returncode": result.returncode,
                "output": redact_text(result.stdout[-4000:]),
            }
        )
