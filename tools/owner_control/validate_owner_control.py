#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.owner_control.core import validate_owner_control_contracts, write_baseline_files, write_closeout_reports, write_validation_results


def main() -> int:
    write_baseline_files()
    errors = validate_owner_control_contracts()
    write_validation_results(errors)
    status = "PASS" if not errors else "FAIL"
    write_closeout_reports(validation_status=status, stage_status=status)
    print(f"OWNER_CONTROL_VALIDATION_RESULT={status}")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
