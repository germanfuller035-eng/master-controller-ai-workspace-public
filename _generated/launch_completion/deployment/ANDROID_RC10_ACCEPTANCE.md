# Android RC10 — Live Acceptance (two green runs)

**Дата:** 2026-06-19 · сборка 0.6.0-rc10 (versionCode 22) · эмулятор a56lab (android-34).

## Install-over
```
RC9 (versionCode 21) -> RC10 (versionCode 22): install -r, Success
pairing/data retained · 0 crash on launch · Room migration: none (no new entities)
```

## Два автономных прогона (connectedDebugAndroidTest --rerun-tasks)
```
FULL_RUN_1 = PASS — 3/3, 0 skipped, 0 failed, BUILD SUCCESSFUL, exit 0
FULL_RUN_2 = PASS — 3/3, 0 skipped, 0 failed, BUILD SUCCESSFUL, exit 0
CRASHES=0 · ANRS (приложения)=0 (за всю сессию acceptance)
unit tests: 158 passed / 0 failed
```

## Новое в RC10 (owner command UI, no-send)
Экран «Первое касание» получил действия владельца: подготовить черновик, выбрать тему/текст, одобрить только текст, вернуть на аудит, отклонить, выбрать пилотом. Каждое — через Idempotency-Key + expectedRevision; кнопки «Отправить» нет; после approve-text-only показывается «Текст одобрен. Отправка требует отдельного разрешения владельца.»

## Production safety во время acceptance
```
PRODUCTION_MUTATING_REQUESTS=0 · PRODUCTION_OUTBOUND_REQUESTS=0 · PRODUCTION_PAYMENT_REQUESTS=0
prod ledger 04fda652 (7 строк) unchanged · leads 69 · rev 125 · services active
```

## Артефакты
```
apk_sha256 = 8e1c357d9bdb6804f114074e0eddb72937d96afc9a4fa4aa1aa4bf2f77301c58
aab_sha256 = 17d906ba2aa4812e283b99c04c30a549f852a792859a1494adeb657e238d85d5
signer = 11038fca...1023f7 (== RC1..RC9, apksigner verify PASS) · versionCode 22 / 0.6.0-rc10
dist: MasterController-release-v0.6.0-rc10.apk/.aab + SHA256SUMS-v0.6.0-rc10.txt
```

## Verdict: PASS.
