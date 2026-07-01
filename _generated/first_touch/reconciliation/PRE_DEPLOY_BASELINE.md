# First Touch — Pre-Deploy Baseline (forensic)

**Дата:** 2026-06-19 · ветка `feature/first-touch-strategist-controlled-pilot-v1` · HEAD `8f88f9e`

## Локальное состояние
- Worktree store: **50 лидов, revision 1** (устаревший снимок — причина «leads_scored=50»).
- Android: 0.6.0-rc9 (versionCode 21), APK `ba652780…`, AAB `a8c858d4…`, signer `11038fca…1023f7`.
- Frozen deployment manifest: `_generated/first_touch/data/deployment_manifest.json` (3 backend-файла).

## Production read-only baseline (VPS 195.96.132.82, masterctl@debian12)
- SSH fingerprint: **совпал** с ожидаемым `SHA256:iO8wf6143FN1U0DJJzrFShO62xT3k+HiGfNxPtgvXXs`.
- Canonical store: `/opt/master-controller/canonical/lead_pipeline_store.json` — **revision 106, 62 лида, 0 test_only**, sha `04c0160d…`.
- Send ledger: 7 строк, sha `04fda652…` (совпадает с RC8 evidence). Commercial sends=0, test/internal=7.
- Queue: 41 COMPLETED, 0 failed, 0 dead letters. Writer count=1.
- Сервисы active: api, telegram, worker. **discovery.service = failed** (предсуществующий дефект, вне scope — не трогаю).
- Гейты: autosend BLOCKED, sendAllowedLive OFF, commercial_send OFF, followup_autosend OFF. Payment facts=0.

## Ключевой вывод
Production = 62 лида (rev 106). Локальный store = 50 (rev 1). Расхождение 50/62 — **рассинхрон данных**, а не дефект scorer'а. Подтверждено в разделе сверки: тот же код против 62-лидового store даёт `leads_scored=62`.

Машинный baseline: `PRE_DEPLOY_BASELINE.json`.
