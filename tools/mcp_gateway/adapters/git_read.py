from __future__ import annotations

import re
import subprocess
from pathlib import Path

from tools.mcp_gateway.adapters.contracts import BaseAdapter
from tools.mcp_gateway.models import AdapterResult, GatewayError, GatewayRequest
from tools.mcp_gateway.redaction import redact_text


ROOT = Path(__file__).resolve().parents[3]
DENIED_ACTIONS = {"commit", "merge", "push", "checkout", "reset", "clean", "tag", "rebase"}
SAFE_ARG = re.compile(r"^[A-Za-z0-9_./:@-]{1,120}$")
SHELL_MARKERS = (";", "&&", "||", "|", "`", "$(", "\n", "\r")


def _safe_arg(value: str) -> str:
    if any(marker in value for marker in SHELL_MARKERS) or not SAFE_ARG.match(value) or value.startswith("-"):
        raise GatewayError("GIT_ARG_DENIED", "unsafe git argument denied", status="DENIED")
    return value


class GitReadAdapter(BaseAdapter):
    def execute(self, request: GatewayRequest, timeout_ms: int, cancellation) -> AdapterResult:
        cancellation.check(request.cancellation_token)
        action = request.action
        if action in DENIED_ACTIONS:
            raise GatewayError("GIT_MUTATION_DENIED", "mutating git command denied", status="DENIED")

        if action == "status":
            argv = ["git", "status", "--short"]
        elif action == "log":
            count = int(request.input.get("max_count", 5))
            count = max(1, min(count, 50))
            argv = ["git", "log", "--oneline", f"-{count}"]
        elif action == "show":
            ref = _safe_arg(str(request.input.get("ref", "HEAD")))
            argv = ["git", "show", "--stat", "--oneline", "--no-renames", ref]
        elif action == "diff":
            argv = ["git", "diff", "--stat"]
            path = request.input.get("path")
            if path:
                argv.extend(["--", _safe_arg(str(path))])
        elif action == "branch_show_current":
            argv = ["git", "branch", "--show-current"]
        elif action == "rev_parse":
            ref = _safe_arg(str(request.input.get("ref", "HEAD")))
            argv = ["git", "rev-parse", ref]
        else:
            raise GatewayError("GIT_ACTION_DENIED", "unknown git read action", status="DENIED")

        result = subprocess.run(
            argv,
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=timeout_ms / 1000,
            check=False,
        )
        cancellation.check(request.cancellation_token)
        return AdapterResult(data={"argv": argv[1:], "returncode": result.returncode, "output": redact_text(result.stdout)})
