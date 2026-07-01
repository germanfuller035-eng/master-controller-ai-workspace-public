# PLAN — IMPLEMENT_SAFE_TEST_ONLY_FIRSTTOUCH_PATH

Цель сессии: закрыть BLOCKER `FIRSTTOUCH_TEST_ONLY_SUPPORT_GAP` — безопасный TEST_ONLY-контур для
6 post-draft контролов firsttouch (CTRL-0139..0144), довести firsttouch до 15/15 CLEAN, без реальных
лидов, без отправок. НЕ переходить к multichannel/transport/conversations/Full Run.

## Корневая причина (подтверждена кодом)
- `/first-touch/candidates` отдаёт только `top_5` из `pilotCandidates()`, который исключает test_only
  (`first_touch_service.mjs:121`). Карточка `ft_cand_` не появляется → диалог не открыть → ft_generate
  и 6 post-draft контролов недостижимы.
- `generateDraft`/`findLead` (`first_touch_commands.mjs`) фильтра test_only НЕ имеют → draft на
  СИНТЕТИЧЕСКОМ test_only-лиде технически безопасен (no-send by construction).
- Симуляция движка подтвердила: синтетический лид с верным audit-наблюдением даёт hookScore=88
  (gate pass), quality=98 PASS → станет eligible в top_5 при includeTest.

## Вектора утечки test_only-лида в canonical store (ЗАКРЫТЬ — раздел 4)
1. `pilotCandidates()` считает `leads_scored=rows.length` по ВСЕМ лидам → KPI «Лидов проверено».
2. `getMiniAuditOperatorState` (telegram_gateway/mini_audit_operator_mode.mjs) фильтрует только
   `isHidden`/`isArchived`, НЕ test_only → утечка в «Требуют проверки» + owner brief.
3. `owner_commercial_truth.truth()` — `total_leads`/stageCounts считают все (есть `is_test` флаг, но
   агрегаты не фильтруют).
БЕЗОПАСНО уже сейчас: funnel/command-brief берутся из domain_reservoir + DEF-V3-001 фильтра;
scheduler зовёт /candidates без includeTest (default false).

## ДИЗАЙН (additive, no-send, default-неизменное поведение)

### A. Backend: includeTest-aware first_touch (production change, ADDITIVE_NO_SEND_TEST_ONLY_SUPPORT)
1. `first_touch_service.mjs`:
   - `pilotCandidates(includeTest=false)`: при `false` test_only-лиды ПОЛНОСТЬЮ исключаются из `rows`
     (нулевая утечка в leads_scored/leads_considered/exclusion_breakdown). При `true` — test_only-лид
     НЕ получает исключение 'TEST_ONLY', но ВСЕ прочие safety-гейты сохраняются
     (identity/contact/audit/quality/compliance/prior-send/opt-out).
   - `summary(includeTest=false)` — пробросить флаг.
   - Инвариант `scope` остаётся `COMMERCIAL_REAL_ONLY` при `includeTest=false`; при `true` →
     `COMMERCIAL_REAL_PLUS_TEST_ACCEPTANCE` (явная маркировка, чтобы не маскировать режим).
2. `server/index.mjs`: `/first-touch/summary` и `/first-touch/candidates` читают
   `includeTest = req.query.includeTest === 'true'` и пробрасывают. generate-draft и post-draft
   команды НЕ меняются (работают по leadId, лид уже виден только в acceptance).
3. `mini_audit` утечка: добавить test_only-гард в operator-state потребителя так, чтобы реальные
   owner-поверхности (getStatus/getLeads/owner brief) НИКОГДА не показывали test_only-лид независимо
   от флага (этот экран не имеет acceptance-режима). Минимальное additive-изменение: фильтровать
   `test_only` в `mini_audit/service.mjs` слое (не трогая telegram-движок), либо добавить
   `excludeTestLeads` в loadState. Выбор — наименее инвазивный, с регрессией.
4. `owner_commercial_truth`: убедиться, что `total_leads`/stageCounts не показывают синтетику в
   реальном owner-представлении (real()-фильтр для leads-агрегатов, сохраняя includeTest debug-путь).

### B. Детерминированный seeder (canonical lead store)
Новый режим в `tools/android_acceptance_lab/seed_acceptance_fixtures.mjs` ИЛИ отдельный
`seed_firsttouch_candidate.mjs` (через `updateStoreWithRevision`, sole canonical writer):
- `seed-firsttouch <run_id>` / `verify-firsttouch` / `cleanup-firsttouch`.
- fixture_id=`ACCEPTANCE_V3_FIRSTTOUCH_CANDIDATE`, run_id=`acceptance_v3_firsttouch`.
- Синтетический лид: lead_id с префиксом `TEST_ONLY_FT_ACCEPT_V3` (ловится `isTestLead` regex И
  test_only=true), синтетические company/email(.test)/website/audit_observations(≥1 с evidence),
  identity_match_status='match', email_source='manual_verified', status НЕ из VERIFICATION_BLOCK,
  no_send=true, excluded_from_commercial_KPI=true, excluded_from_owner_brief=true,
  excluded_from_campaigns=true, excluded_from_followup=true, excluded_from_payment=true,
  cleanup_supported=true, created_by_run_id.
- Idempotent: повторный seed не дублирует (детерминированный lead_id).
- Перед seed: зафиксировать revision, число реальных лидов, send-ledger длину.

### C. Cleanup (полный)
`cleanup-firsttouch`: удалить синтетический лид + все linked артефакты в canonical store:
`first_touch.drafts` (по lead_id), `first_touch.decisions` (по lead_id), `first_touch.pilot`
(selected_lead_id если он), `_first_touch_idem` (ключи этого лида). Реальные лиды/прочие acceptance_v3
owner-center fixtures НЕ трогать. Reread-доказательство: linked artifacts=0, real leads unchanged.

### D. Android runtime (version bump + новый подписанный RC — решение владельца)
1. `MaterRepository.kt`: `firstTouchSummary`/`firstTouchCandidates` → передать
   `includeTest = BuildConfig.DEBUG` (как уже делают campaigns/owner endpoints). `MaterApi.kt`:
   добавить `@Query("includeTest")` в обе сигнатуры (default false).
2. release-сборка шлёт `includeTest=false` → backend исключает test_only → release-экран чист.
3. `build.gradle.kts`: versionCode 29→30, versionName `0.8.0-rc5`→`0.8.0-rc6`.
4. Собрать debug + debug.test (для harness) и подписанный release RC (assembleRelease).

### E. Harness (androidTest — НЕ влияет на версию)
`ScreenByScreenRunner.kt` ft_-ветка: добавить inner-scroll внутри AlertDialog перед By.text-матчем
post-draft кнопок (они ниже текста письма в прокручиваемом Column). Ограниченное число scroll,
подтверждение dialog-state до и после, повторная проверка anchor.

## ТЕСТЫ ДО DEPLOYMENT (раздел 9 — deploy запрещён при одном failing)
1. Backend unit/contract (новый `first_touch_includetest_test.mjs`):
   - test_only accepted ТОЛЬКО при includeTest=true;
   - real candidate behavior unchanged (includeTest=false → как до правки, по 62-лид fixture);
   - leads_scored/leads_considered НЕ растут при includeTest=false с засеянным test_only лидом;
   - test_only draft не входит в send seam (no_send=true, send ledger unchanged);
   - mini_audit/owner-brief/truth НЕ показывают test_only лид (KPI/brief leak=0);
   - idempotent seed; idempotent cleanup; cleanup удаляет все linked артефакты; real leads unchanged.
2. Существующие: `first_touch_commands_test.mjs`, `tests/run_all.mjs` (regression DEF-V3-001),
   `first_touch.test.mjs`, `first_touch_live_no_send_verify.mjs`.
3. Android: компиляция (assembleDebug + assembleDebugAndroidTest + assembleRelease),
   instrumented firsttouch batch компилируется.

## PRODUCTION PREFLIGHT + DEPLOYMENT (разделы 10, owner-approved ADDITIVE_NO_SEND)
1. read-only baseline на VPS (revision, реальные лиды count, send-ledger).
2. backup изменяемых файлов (.bak_v3_ft).
3. allowlist manifest (только изменённые backend-файлы + seeder).
4. показать точный diff; подтвердить relate-only-to-TEST_ONLY-firsttouch; нет schema migration; rollback.
5. scp только allowlisted; `sudo systemctl restart master-controller-api` (только этот сервис).
6. postflight: hashes match, healthy, sole canonical writer, autosend blocked, send gate disabled.
НЕ трогать Telegram/IMAP/Caddy/scheduler/discovery/outbound transport.

## LIVE ACCEPTANCE (раздел 11)
seed → проверить release/обычные endpoints не видят (includeTest=false → 0) → debug acceptance видит →
открыть firsttouch → 15 контролов → 6 post-draft по одному (visible/enabled/inner-scroll/action/
UI result/HTTP result/server reread/остаётся TEST_ONLY/side-effects=0) → idempotency → no sends →
полный firsttouch screen batch 15/15.

## CLEANUP + ЗАВЕРШЕНИЕ (разделы 12,15)
cleanup-firsttouch → reread (fixture cleaned, linked=0, real leads unchanged, KPI/brief leaks=0,
send-ledger delta=0) → evidence → checkpoint update → commit → stop processes → HANDOFF.
NEXT_PHASE=CLOSE_REMAINING_4_SCREEN_BATCHES. Финальный статус:
COMPLETE_SAFE_TEST_ONLY_FIRSTTOUCH_SUPPORT (НЕ весь проект COMPLETE).

## SAFETY-инварианты (на всём протяжении)
CLIENT_MESSAGES_SENT=0, COMMERCIAL_EMAILS_SENT=0, SMTP_CALLS=0, FOLLOWUPS_SENT=0,
PAYMENT_OPERATIONS=0, SEND_LEDGER_DELTA=0, AUTOSEND=BLOCKED, SEND_ALLOWED_LIVE=OFF,
CONTROLLED_SEND_GATE=DISABLED. Любая попытка send/payment → немедленная остановка.
