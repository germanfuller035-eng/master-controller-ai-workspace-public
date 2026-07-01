# Owner Command & Autonomy Center 0.8.0-rc3 — Functional Recovery + Production Deploy

## Итог

Все локальные подсистемы доведены до production (no-send) и доказаны функционально
на реальном контуре: чтение и TEST_ONLY-запись с подтверждённым server reread, в т.ч.
инструментальными тестами в реальном Android-рантайме против production.

## Backend deploy (production VPS 195.96.132.82, /opt/master-controller)

- Доступ: SSH ключ /d/AI_SECRETS/ssh/master_controller_195_96_132_82_ed25519, host 195-96-132-82.sslip.io.
- Reconcile prod-ahead перед деплоем: adopted jobs/service.mjs (FIRST_TOUCH_DRAFT_GENERATE) +
  daily_discovery.mjs (RUNS_PER_DAY=2) — чтобы additive-деплой не откатил живой discovery.
- Развёрнуто аддитивно (manifest sha-verified == remote): reliability.mjs, cost_center.mjs,
  backup_center.mjs, fcm_push.mjs, remediation_engine.mjs, telegram_owner.mjs, server/index.mjs,
  worker/index.mjs, shared/config.mjs.
- Backup: /opt/master-controller/backups/owner_autonomy_rc3_20260620_161039 (canonical + pre-src).
- Restart: только master-controller-api (+worker для BACKUP_VERIFY drill). Caddy/IMAP/Telegram нетронуты.
- Live-read с прод-данными: /reliability HEALTHY, /costs реальные расчётные единицы из прод-ledger,
  /backups/status реальный canonical, /push/status CREDENTIAL_REQUIRED, /telegram-owner/status
  CREDENTIAL_REQUIRED, /remediation/playbooks allow/forbidden.

## Auto-remediation (REAL bounded executors)

owner_center/remediation_engine.mjs: recover expired lease, retry idempotent TEST_ONLY job
(отказ для live), detect missed scheduler, health recheck, temp source isolation, enable kill
switch (только более строгий режим). Forbidden плейбуки fail-closed ДО любого side effect.
RESTART_WORKER не подделывается (NOT_EXECUTED_NEEDS_HOST + точная команда). Bounded-лимиты.
Prod smoke: HEALTH_RECHECK выполнен (HEALTHY), SEND_CLIENT отклонён 400. Тест 26/0.

## WorkManager push fallback (LIVE, без Firebase)

OwnerNotifier (каналы P0/P1, dedup по event_id, quiet hours для P1) + NotificationSyncWorker
(периодически тянет свежие события → системные уведомления) + WorkScheduler в MainActivity.
FCM остаётся CREDENTIAL_REQUIRED; уведомления доставляются через WorkManager.

## Android 0.8.0-rc3 (versionCode 27)

- Functional wiring matrix: 0 STATIC_RUNTIME, 0 MOCK, 0 PLACEHOLDER, 0 NO_OP, 0 FALSE_SUCCESS,
  0 BROKEN_NAVIGATION (два независимых read-only аудита). Исправлено: dead-nav к command_center+
  campaigns, retry-scope 401→owner POST /jobs/{id}/retry, Knowledge false-success текст,
  5 декоративных AssistChip → enabled=false.
- Owner write-контролы доведены до UI: переключатель автопилота (Reliability) и кнопка
  «Подтвердить» инцидент (Incidents) — оба с server reread.
- unit + lint PASS. assembleRelease + bundleRelease PASS. signer 11038fca… (без изменений).
- APK MasterController-release-v0.8.0-rc3.apk SHA256 2dd19595a91dd771a92363414020fb71e8020d75d940701c0e9f7d03bd289749
- AAB MasterController-release-v0.8.0-rc3.aab SHA256 5db00b641c9d55a1fe71410836d76087dfd00d16c78ade46ad82d40daae14678

## Functional acceptance (НЕ navigation smoke)

- Live prod verification (Node): 28/0 — 12 read endpoints, owner pairing→TEST_ONLY write→server
  reread (notification read, autopilot OBSERVE/MANAGED), idempotency, forbidden-rejection,
  0 mismatches, 0 false-success.
- ProdCaptureMappingTest (JVM): реальный прод-JSON десериализуется через настоящие Android DTO.
- LiveProdInstrumentedTest (на эмуляторе, реальный Android-рантайм против prod): READ + TEST_ONLY
  write→server reread через настоящий MaterApi. Functional Run 1 + Run 2 PASS (4/4, 0 skipped/failed).
- 0 crash / 0 ANR. Canonical: rev 221→254, leads 13→29 (рост от штатного discovery, 0 потерь).
  Autopilot восстановлен в MANAGED. Гейты OFF (NO_SEND/AUTOSEND/COMMERCIAL_SEND/FOLLOWUP_AUTOSEND).
- Physical device: NOT_RUN (телефон не подключён).

## Тесты (все exit 0)

reliability 29/0 · costs 30/0 · backup 35/0 · radar 31/0 · fcm 29/0 · remediation 26/0 ·
telegram_owner 18/0 · owner_center 38/0 · API suite 47/0 · live prod 28/0 · Android unit PASS ·
instrumented 4/4.

## Credential-gated (live OFF, готовы к активации, credentials НЕ выдуманы)

- FCM live push: нет Firebase credentials → CREDENTIAL_REQUIRED. WorkManager fallback покрывает.
  Пакет: _generated/release/FCM_PUSH_ACTIVATION_PACKAGE.md.
- Telegram owner alerts: bot token есть, owner chat id отсутствует → CREDENTIAL_REQUIRED, алерт не
  отправлен. Активация: задать MATER_OWNER_TELEGRAM_CHAT_ID + MATER_TELEGRAM_OWNER_ENABLED=true + sender.
- Knowledge Radar live fetch: OFF (offline engine готов).

## No-send инварианты (подтверждены)

CLIENT_MESSAGES_SENT=0, COMMERCIAL_EMAILS_SENT=0, SMTP_CALLS=0, FOLLOWUPS_SENT=0,
PAYMENT_OPERATIONS=0, AUTOSEND=BLOCKED, SEND_ALLOWED_LIVE=OFF, CONTROLLED_SEND_GATE=DISABLED.
