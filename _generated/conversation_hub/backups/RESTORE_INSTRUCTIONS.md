# Conversation Hub — Backup & Restore Instructions (MP42)

date: 2026-06-17

## Artifacts
- `conv_hub_src_20260617/` — source mirror of tools/conversation_hub (17 files)
- `conv_hub_src_20260617_manifest.sha256` — deterministic SHA256 manifest (sorted)
- `conversation_hub_20260617.gitbundle` — full git history to HEAD (gitignored large binary)

## Verify manifest
```bash
cd _generated/conversation_hub/backups/conv_hub_src_20260617
sha256sum -c ../conv_hub_src_20260617_manifest.sha256
```

## Restore test (offline, no network, no production)
```bash
git clone <bundle> /tmp/conv_restore
cd /tmp/conv_restore
node tools/ai_hq/tests/run_all.mjs            # AI HQ regression (incl. context-pack)
node tools/conversation_hub/tests/run_all.mjs # 88 functional + 25 security
node tools/conversation_hub/conversation.mjs normalize --fixture f01
node tools/conversation_hub/conversation.mjs dedupe --fixture f02
node tools/conversation_hub/conversation.mjs correlate --fixture f01
node tools/conversation_hub/conversation.mjs classify --fixture f08
node tools/conversation_hub/conversation.mjs route --fixture f11
node tools/conversation_hub/conversation.mjs draft --fixture f26   # blocked, send_allowed=false
node tools/conversation_hub/conversation.mjs dashboard-refresh
node tools/conversation_hub/conversation.mjs validate-all
```
All commands are offline and deterministic. No network access, no production reads, no send.
