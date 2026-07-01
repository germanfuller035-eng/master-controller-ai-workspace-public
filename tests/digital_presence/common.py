from tools.digital_presence.core import FIXTURE_DIR, load_json, process_site


def site(name: str):
    return load_json(FIXTURE_DIR / "sites" / name)


def batch():
    return load_json(FIXTURE_DIR / "pipeline" / "no_deploy_batch_6.json")


def processed(name: str):
    return process_site(site(name))
