#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.commercial.core import run_commercial_validation

if __name__ == "__main__":
    raise SystemExit(run_commercial_validation())
