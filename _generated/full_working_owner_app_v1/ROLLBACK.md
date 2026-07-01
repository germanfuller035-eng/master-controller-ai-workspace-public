# Full Working Owner App V1 — Rollback

## Git Rollback

Revert the closeout commit if the owner wants to return to the previous installed-ready baseline:

```text
git revert <closeout_commit>
```

## Device Rollback

Install the APK built from base head `d9e1633b03b06c75e4fc9d6bcc894d63c79332c0`.

## Safety Notes

- No live-send path was enabled.
- No payment path was enabled.
- No production-write path was enabled.
- No VPS/DNS/HAPP/proxy change was made.
