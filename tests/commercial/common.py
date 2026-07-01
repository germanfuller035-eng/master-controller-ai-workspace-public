from pathlib import Path

from tools.commercial.core import FIXTURE_DIR, load_json


def lead(name: str):
    return load_json(FIXTURE_DIR / "leads" / name)


def site(name: str):
    return load_json(FIXTURE_DIR / "digital_presence" / name)


def batch():
    return load_json(FIXTURE_DIR / "pipeline" / "no_send_batch_10.json")
