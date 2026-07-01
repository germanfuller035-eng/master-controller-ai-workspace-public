# Owner Visible Repair V1 - Rollback

## Scope

This sprint changed Android owner-visible UI and generated evidence docs only.
It did not change backend, VPS, DNS, Caddy, firewall, production database,
feature flags, HAPP, VPN, or proxy.

## Git Rollback

After the sprint commit is created, rollback is:

```powershell
git revert <owner-visible-repair-commit>
```

Expected reverted areas:

- Android files listed in `OWNER_VISIBLE_DELTA_REPORT.md`.
- `_generated/owner_visible_repair_v1/**`.
- `CURRENT_TASK_CHECKPOINT.md` session block.

Do not remove unrelated historical checkpoint entries.

## Device Rollback

If device rollback is needed, install the previous accepted debug APK from the
prior owner-visible acceptance source. Do not clear app data unless the owner
explicitly authorizes it.

Network/proxy state to preserve:

- adb reverse `tcp:18089 -> tcp:10809`
- Android global proxy `127.0.0.1:18089`

## Safety

No production-side rollback is required because production was not changed.

PRODUCTION_CHANGES=NO
VPS_CHANGED=NO
DNS_CHANGED=NO
HAPP_PROXY_CHANGED=NO
