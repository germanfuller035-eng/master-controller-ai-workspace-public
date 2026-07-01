# FINAL ACCEPTANCE REPORT — exhaustive_v3 (Android Master Controller)

Дата: 2026-06-22. Ветка: feature/android-exhaustive-control-acceptance-v2.
Прод-бэкенд: https://195-96-132-82.sslip.io (VPS masterctl@195.96.132.82, развёрнут из этого worktree).
App-under-test: ru.dmitry.matercontroller.debug. Runner: ru.dmitry.matercontroller.debug.test.

## ГЛАВНЫЙ ИТОГ

Вывод прошлой сессии про «архитектурный предел 94/283» ОПРОВЕРГНУТ. Это была не архитектура, а
(1) приложение не слало includeTest, (2) дефекты тест-плана/харнесса. После исправления:

- **246 / 283 контролов** находятся в полностью CLEAN-экранах (36 из 41 экрана: каждый контрол честно
  PASS — 0 FAIL, 0 UNEXEC на экран). Это РЕАЛЬНОЕ индивидуальное выполнение с проверкой результата,
  а не «виден=PASS».
- Canary GREEN 14/14 (навигационные уровни, типы контролов, state-groups).
- 5 дефектов найдено и обработано (прошлая сессия — 0).

## CLEAN-ЭКРАНЫ (36/41, 246 контролов)

home13 operations22 ops_deadletters1 ops_sources1 reliability3 cost3 backup4 push4 commandcenter3
owner_incidents2 replies5 settings11 approvals5 approval_detail4 approval_list2 pipeline7 ai2 automation8
campaigns3 commercial31 commandcenter_commercial5 offer_review1 offer_detail9 knowledge11 knowledge_digest3
miniaudit18 ma_lead6 ma_list3 ownersettings17 reservoir2 sources6 source_telemetry2 agents11 owner_queues7
catalog10 product_detail1 (+test_only2 — пройден изолированно ранее).

Honest-PASS статусы: PASS_NAVIGATION (anchor сменился), PASS_LIVE_READ (refresh+reread),
PASS_STATE_TOGGLED (toggle+readback+restore), PASS_INPUT_ECHOED, PASS_UNSAFE_ACTION_BLOCKED
(dangerous/confirm dialog open→cancel, НИКОГДА не подтверждая), PASS_DISABLED_WITH_REASON,
PASS_EMPTY_STATE_VERIFIED (data-gated на здоровом пустом проде, owner-approved),
PASS_NOT_APPLICABLE (нет такой affordance, напр. back/refresh на tab-root).

## PENDING (5 экранов, 37 контролов) — НЕ объявляю COMPLETE

firsttouch(15), multichannel(9), transport(9), conversations(2) [test_only(2) — clean].
- Навигация к ним (карточки cs_* на commercial_summary) ИСПРАВЛЕНА (root cause ниже) — экраны достижимы,
  навигационные/refresh/status контролы PASS (firsttouch 6+/15, multichannel 4+/9 подтверждено).
- ОСТАЮТСЯ: data-gated dialog-контролы внутри candidate-диалога firsttouch (ft_close/ft_generate/
  ft_select_*/ft_approve/ft_reject/ft_return_audit/ft_select_pilot), очередь multichannel (mc_q_*),
  conversations rows. Они требуют открытия Compose-диалога кандидата и/или данных, которых на проде нет.
  Харнесс-правило по тексту добавлено, но не доведено до стабильного PASS (медленный цикл ~25 мин/сборка,
  candidate-диалог не открывался надёжно через testTag-тап). ЭТО НЕ подтверждённый app-дефект и не
  недостижимость — недоделка верификации этого класса.

## ДЕФЕКТЫ (DEFECT_REGISTER.md)

- DEF-V3-001 (BACKEND, P2): test_only протекал в command-brief primaryConstraint. FIXED+DEPLOYED+verified
  (фильтр !test_only; regression в tests/run_all.mjs 50/50; scp+systemctl restart; verified на проде).
- DEF-V3-002 (APP, P1): Lead.score был Double?, API отдаёт объект → state_error на всех списках лидов. FIXED
  (LeadScore модель + 3 UI-потребителя).
- DEF-V3-003 (PLAN, P2): 58/283 контролов приписаны не к тому экрану (план группировал по файлу, не по
  экрану рендера). FIXED (regen_exec_plan.mjs, 25→41 экран, +18 anchors).
- DEF-V3-004 (APP, P2): AutomationScreen определён, но не подключён к NavHost (8 контролов недостижимы).
  FIXED (route + ops_card_automation→AutomationScreen; verified automation 8/8).
- DEF-V3-005 (TESTABILITY, P3): Compose AlertDialog testTag не экспонируется как resource-id. Обход в
  харнессе (матч по тексту кнопки). Опциональный app-фикс — DialogProperties/semantics.

## ROOT CAUSE cs_* НАВИГАЦИИ (исправлен)

commercial_summary — verticalScroll Column (не Lazy): off-screen карточки присутствуют в иерархии, но
рендерятся обрезанными до ~23px на краю вьюпорта. Тап по 23px-слайверу промахивается мимо click-target.
Соседние верхние карточки (204px) работали. Fix: scrollTo требует center в вьюпорте И высоту ≥60px
(доскролл карточки в полный вид). Плюс fix nav-step retry, который ложно репортил step_notfound после
успешной навигации. Доказано ручным дампом bounds: scrolled cs_first_touch (204px) навигирует.

## HARNESS / ИНСТРУМЕНТЫ

- ScreenByScreenRunner.kt — per-screen honest-PASS движок (anchor-assert, controlled scroll с
  progress-check, crash-isolation на контрол, stale-hardening: clickTag/freshEnabled/freshChecked
  re-find fresh; cold-start retry до bottom_nav).
- run_screen_by_screen.ps1 — resumable orchestrator (_clean_screens.txt skip, Free-Ram+Ensure-App,
  NAV_FAILED 3x retry, ANR retry, -Fresh). Стоп на первом non-clean экране (Шаг 6).
- regen_exec_plan.mjs, seed_acceptance_fixtures.mjs (server-side, секрет не покидает VPS).
- screen_anchors.json (41 anchor). CANARY_LEDGER.jsonl, DEFECT_REGISTER.md, FIXTURE_SEEDING_PROOF.jsonl.

## SAFETY (на всём протяжении)

CLIENT_MESSAGES_SENT=0, SMTP_CALLS=0, FOLLOWUPS_SENT=0, PAYMENT_OPERATIONS=0.
AUTOSEND=BLOCKED, SEND_ALLOWED_LIVE=OFF, CONTROLLED_SEND_GATE=DISABLED.
Все dangerous/confirm контролы: open→Cancel, никогда не подтверждались. C1A TEST_ONLY flow и
shadow-анализ — только проверка наличия + отмена, без записи (кроме owner-approved TEST_ONLY draft).
PRODUCTION_BACKEND_CHANGED=YES (только DEF-V3-001 fix + test_only фикстуры, с явного разрешения владельца).
Canonical lead store (rev 254) НЕ менялся.

## TODO ДЛЯ ЗАВЕРШЕНИЯ ДО 41/41

1. Довести firsttouch candidate-dialog flow: надёжно открывать ft_cand_ диалог (через testTag-тап с
   проверкой open), матчить ft_* по тексту, генерировать TEST_ONLY draft для post-draft контролов.
2. multichannel mc_q_* — после nav-fix должны находиться (доскролл); проверить.
3. conversations rows / transport «Закрыть» — dialog/data-gated, классифицировать.
4. Полный Run 1 (все 41 экран CLEAN) → независимый Run 2 → owner-visible run + COVERAGE_REPORT.html.
5. CLEANUP фикстур: ssh ... seed_acceptance_fixtures.mjs cleanup (с env и без — оба store).

STATUS = PARTIAL (честно). 246/283 в CLEAN-экранах, 0 app-дефектов в них; навигационный блокер устранён;
оставшиеся 37 — data-gated dialog-класс, верификация не доведена. НЕ COMPLETE.
