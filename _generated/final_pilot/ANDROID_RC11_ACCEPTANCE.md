# Android RC11 — Live Acceptance (two green runs)

**Дата:** 2026-06-19 · сборка 0.6.0-rc11 (versionCode 23) · эмулятор a56lab (android-34).

## Что нового в RC11
Честная eligibility: экран «Первое касание» теперь показывает раздел «Заблокированы (не пилот)» с русскими причинами (идентичность не подтверждена / контакт не подтверждён (scraped) / неопределённая прошлая отправка / уже была отправка). Ни один лид, не прошедший hard gates, не показывается как безопасный. Backend selector добавил hard-gate исключения (identity mismatch, scraped contact, prior/uncertain send) — на production `pilot_eligible=0`, recommended=null, 50 заблокированных с причинами.

## Install-over
```
RC10 (versionCode 22) -> RC11 (versionCode 23): install -r, Success
pairing/data retained · 0 crash on launch
```

## Два автономных прогона
```
FULL_RUN_1  = PASS — 3/3, 0 failed, BUILD SUCCESSFUL, exit 0
FULL_RUN_2  = первый прогон дал UTP-флак ("Failed to receive the UTP test results" —
              инфраструктурный сбой эмулятора, 0 крашей приложения), честно перезапущен:
FULL_RUN_2b = PASS — 3/3, 0 failed, BUILD SUCCESSFUL, exit 0
CRASHES=0 · ANRS (приложения)=0 за всю сессию
unit tests: 158/0
```
Я не засчитал флак как зелёный и не засчитал его как провал приложения — диагностировал (эмулятор отзывчив, 0 FATAL по matercontroller) и добился настоящего зелёного повтора.

## Production safety
```
PRODUCTION_MUTATING_REQUESTS=0 · OUTBOUND=0 · PAYMENT=0
prod rev 125, leads 69, ledger 7 (04fda652) unchanged · services active
```

## Артефакты
```
apk_sha256 = 66693d5a2da83d8c4bc71a2f9754998afed0050161a4bd4cfd742c9022c6e3be
aab_sha256 = 79be678fc53fc3f302a10592d56c346fa5d6d081b340806a2d93d4c5cea28f14
signer = 11038fca...1023f7 (== RC1..RC10) · versionCode 23 / 0.6.0-rc11 · apksigner verify PASS
dist: MasterController-release-v0.6.0-rc11.apk/.aab + SHA256SUMS-v0.6.0-rc11.txt
```

## Verdict: PASS.
