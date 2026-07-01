# DEFECT REGISTER — exhaustive_v3 (run_id=acceptance_v3)

Дата открытия: 2026-06-21. Прод-бэкенд (VPS 195.96.132.82) на ревизии, развёрнутой из этого worktree.

---

## DEF-V3-001 — BACKEND: test_only решения/инциденты протекают в command-brief primary_constraint

**Severity:** P2 (утечка тестовых данных в реальное owner-представление; НЕ commercial-KPI, НЕ отправка)
**Root cause class:** BACKEND
**Статус:** FIXED + DEPLOYED + VERIFIED (2026-06-21, владелец явно разрешил правку прода)

### Симптом
После засева TEST_ONLY решения (`[ACCEPT_V3] Тестовое решение владельца`, test_only=true) эндпоинт
`GET /command-brief` вернул `primary_constraint.kind=DECISIONS_PENDING`,
`text_ru="Ожидают решения владельца: 1"`. То же значение видно в UART приложения на экране
«Командный центр» (command_center_screen) как «Ожидают решения владельца: 1».

Реальный владелец (без includeTest) НЕ должен видеть тестовые сущности нигде.

### Доказательство (API, через свежесопряжённый read-токен)
- `GET /owner-decisions` (без includeTest) → total=0  ✔ (этот эндпоинт фильтрует корректно)
- `GET /owner-decisions?includeTest=true` → total=1, title `[ACCEPT_V3] Тестовое решение владельца`
- `GET /next-actions` → `owner_decisions:[]`  ✔ (использует listDecisions, фильтрует)
- `GET /command-brief` → `primary_constraint.text_ru="Ожидают решения владельца: 1"`  ✘ ЛИК

### Точная причина в коде
`tools/mater_controller_api/src/owner_center/chief_ops.mjs`:
- Строка 66: `const openDec = (store.decisions || []).filter((d) => d.status === 'OPEN');`
  — читает store.decisions НАПРЯМУЮ, без `(includeTest || !d.test_only)`.
- Строка 42: `const inc = (store.incidents || []).filter((i) => !['RESOLVED','MUTED'].includes(i.state));`
  — тот же сырой паттерн для инцидентов (потенциальный лик инцидента в primary_constraint P0_INCIDENT).

Везде в `service.mjs` фильтр консистентен (`includeTest || !test_only`), а `primaryConstraint`
обходит его, читая сырой store. Это единственная точка несогласованности.

### Предлагаемый фикс (НЕ применён)
В `primaryConstraint` фильтровать test_only:
```js
const openDec = (store.decisions || []).filter((d) => d.status === 'OPEN' && !d.test_only);
const inc = (store.incidents || []).filter((i) => !['RESOLVED','MUTED'].includes(i.state) && !i.test_only);
```
+ regression-тест в `tools/mater_controller_api/tests/` (seed test decision → assert command-brief
primary_constraint.kind != DECISIONS_PENDING).

### Применённый фикс (DEPLOYED)
`chief_ops.mjs primaryConstraint`: обе сырые выборки теперь фильтруют test_only:
`incidents.filter(i => !i.test_only && ...)`, `decisions.filter(d => !d.test_only && d.status==='OPEN')`.
Regression добавлен в `tests/run_all.mjs` ([DEF-V3-001] секция: 3 проверки, 50/50 PASS локально).
Деплой: scp файла на VPS (бэкап chief_ops.mjs.bak_v3_def001) + `sudo systemctl restart master-controller-api`.

### Верификация на проде (после рестарта)
- BEFORE: command-brief primary_constraint = `DECISIONS_PENDING "Ожидают решения владельца: 2"` (ЛИК).
- AFTER: primary_constraint = `AUDIT_BACKLOG "Лиды готовы к аудиту"` — test_only НЕ протекает.
- owner-decisions?includeTest=true → total=2 (debug-путь цел); без флага → total=0 (реальный владелец чист).
- health=ok, сервис active. PRODUCTION_BACKEND_CHANGED_THIS_TASK=YES (с разрешения владельца).

### Влияние на приёмку
Пока дефект был открыт, TEST_ONLY decision/incident протекал в command-brief. Теперь устранено.
Найден именно потому, что v3 harness сеет реальные фикстуры и читает их через UI/API.

### Безопасность
Это read-only операционный бриф. CLIENT_MESSAGES_SENT=0, отправок нет, commercial-KPI не затронут.

---

## DEF-V3-002 — APP: список лидов любого НЕпустого бакета падает в state_error (score: тип Double vs объект)

**Severity:** P1 (ломается ключевой экран — список лидов mini-audit для всех реальных данных)
**Root cause class:** APP (Android client deserialization)
**Статус:** OPEN → будет исправлен в app (это клиентский баг, не прод-бэкенд)

### Симптом
Переход в любой НЕпустой бакет mini-audit (Требуют проверки=29, Готовят аудит=4) показывает
`state_error` + кнопку «Повторить». Список лидов не отображается ни в одном populated-бакете.
Прошлая сессия не выявила (drill в бакеты с данными не выполнялся; 139 контролов были UNEXECUTED).

### Доказательство
- API `GET /mini-audit/leads?bucket=needs_check&pageSize=100` → HTTP 200, 29 валидных items.
- В каждом item поле `score` — это ОБЪЕКТ:
  `{score_version, score_components:{identity_score:12.5,...}, overall_priority_score:67.5, result, ...}`.
- Проверено по бакетам: all=dict, needs_check=dict, preparing=dict, ready_send=empty.
- Android-модель `core/model/Dtos.kt:80`: `val score: Double? = null` — ожидает СКАЛЯР.
- kotlinx.serialization (даже с coerceInputValues=true) бросает JsonDecodingException на
  объект-вместо-Double (coerce покрывает null/invalid-enum, НЕ структурный mismatch) →
  `repo.leads()` ловит в catch → `DataResult.Error(NETWORK)` → ViewModel `state_error`.
- UI потребляет: `LeadDetailScreen.kt:101 Field("Каноническая оценка", lead.score?.let { String.format("%.0f", it) })`.

### Бэкенд-контракт
`tools/mater_controller_api/src/mini_audit/service.mjs:50` `score: lead.score ?? null` — отдаёт
канонический объект score как есть. Это стабильный серверный контракт; чинить надо клиент.

### Фикс (в app — клиентский баг, release+debug)
1. `Dtos.kt`: заменить `val score: Double? = null` на nested `@Serializable data class LeadScore`
   с полем `overall_priority_score: Double? = null` (+ остальные опциональные поля), `val score: LeadScore? = null`.
2. `LeadDetailScreen.kt:101`: `lead.score?.overall_priority_score?.let { String.format("%.0f", it) }`.
3. Room-кэш: сущность хранит сериализованный Lead JSON — совместимо после смены модели.
4. Regression: androidTest парсинг реального needs_check ответа → assert items.size>0, score распарсен.

### Влияние на приёмку
Это первый НАСТОЯЩИЙ дефект приложения (DEF-V3-001 — бэкенд). Найден именно потому, что v3
harness реально заходит в populated-бакеты с anchor+honest-PASS. Подтверждает ценность подхода.

### Безопасность
Чтение read-only. Фикс модели не влияет на отправки/КPI/безопасность.

---

## DEF-V3-003 — PLAN: контролы приписаны не к тому экрану (exec_plan mis-assignment)

**Severity:** P2 (дефект тест-плана, не приложения; искажает покрытие/UNEXEC)
**Root cause class:** HARNESS/PLAN
**Статус:** FIXED — canonical exec_plan.json приведён к экранам рендера; см. ниже + DEF-V3-006

### Симптом
На экране commandcenter контролы CTRL-0078/0079 (`incident_ack_${i.incident_id}`) дают
UNEXECUTED_NOT_FOUND_ON_SCREEN — их там физически нет.

### Причина
`incident_ack_${id}` определён в `commandcenter/OwnerListScreen.kt:110`, который рендерит
экран **owner_list_incidents** (достигается через "Все инциденты"), а НЕ command_center_screen.
exec_plan приписал эти контролы к screen_id=commandcenter — это ошибка генерации плана:
testTag сгруппирован по исходному файлу (OwnerListScreen.kt физически рядом с CommandCenterScreen
в каталоге commandcenter/), а не по фактическому экрану навигации.

### Следствие
Часть из 283 контролов в плане может быть приписана к экрану, на котором их нельзя достичь →
ложные UNEXEC. Это НЕ дефект приложения и не недостижимость — это неверный план.

### Нужно
Аудит exec_plan: для каждого testTag-контрола сверить screen_id с экраном, где testTag реально
рендерится (по nav-графу), а не с каталогом исходника. Переназначить mis-assigned контролы
(напр. incident_ack → owner_list_incidents с nav через command center → "Все инциденты").
owner_list_decisions / owner_list_incidents — отдельные достижимые экраны, которых нет в текущем
SCREEN_ROUTE_REGISTRY как самостоятельных строк.

### Дополнительно (commandcenter dynamic recompose)
CTRL-0077 ("Все инциденты") периодически даёт StaleObjectException: command_center_screen
часто рекомпозируется (живой снапшот). Нужен тот же stale-retry, что и для list-экранов, плюс,
вероятно, разбиение commandcenter на сам хаб + дочерние owner_list_* экраны.

### Аудит всего плана (субагент, READ-ONLY)
58 из 283 контролов (~20%) приписаны к экрану, где их testTag физически НЕ рендерится. Причина
системная: план группировал testTag по ФАЙЛУ/каталогу исходника, а не по экрану рендера. Страдают
файлы с несколькими экранами (OwnerListScreen, AgentsScreens, OfferReviewScreens, KnowledgeScreens,
OperationsScreens, TransportScreens) и detail-экраны, требующие доп. тапа. 153 MATCH, 58 MISMATCH/недостижимо.
Нужно: добавить ~16 достижимых под-экранов в реестр (owner_incidents/owner_decisions/owner_queues/
conversations/test_only/queue-send-review/offer-detail/product-detail/approval-list/approval-detail/
ma_list/ma_lead/knowledge-digest/source_telemetry/ops_deadletters/ops_sources) и переназначить контролы
с корректным nav-путём. Полный список mismatch — в отчёте аудита (этой сессии).

---

## DEF-V3-004 — APP: AutomationScreen — мёртвый экран (orphaned, не подключён к NavHost)

**Severity:** P2 (недостижимая фича-поверхность; 8 контролов плана неисполнимы)
**Root cause class:** APP (navigation graph)
**Статус:** OPEN

### Симптом
8 контролов плана (`auto_writer/auto_autosend/auto_send/auto_rev/auto_queued/auto_running/auto_dead/auto_maint`,
screen_id=automation) недостижимы.

### Причина (проверено в коде)
- `feature/automation/AutomationScreen.kt` определяет `fun AutomationScreen()` с anchor `automation_screen`
  и тегами `auto_*`. Но `AutomationScreen(` НЕ вызывается НИГДЕ в main-коде (только собственное объявление).
- Карточка `ops_card_automation` (OperationsScreens.kt:63) открывает route `ops/automation` →
  `OperationsDetailScreen(section="automation")` → `AutomationContent` (OperationsScreens.kt:126),
  где НЕТ ни одного `auto_*` testTag (там простые Kv-строки без testTag).
- Итог: `AutomationScreen` — мёртвый код; его контролы не существуют в рантайме ни на одном маршруте.

### Следствие / варианты
1. Подключить AutomationScreen к навигации (если это была задуманная owner-поверхность), либо
2. Удалить AutomationScreen.kt и переназначить 8 контролов на реальный AutomationContent (без testTag —
   тогда либо добавить теги в AutomationContent, либо классифицировать как display-only).
Решение за владельцем (это продуктовое поведение, не приёмочный артефакт).

### Аналогично (требует доп. проверки)
PipelineHomeScreen.kt (`pipeline_card_${q.name}`, 2 контрола) — аудит сообщает, что tab `leads`
рендерит LeadsHomeScreen (`leads_card_*`), а PipelineHomeScreen не подключён. Похоже на тот же класс.

### РЕШЕНИЕ (после проверки кода)
- **AutomationScreen**: уникальный функциональный экран (свой VM, 8 owner-полей), просто не был подключён.
  ИСПРАВЛЕНО в app: добавлен route `automation` → `AutomationScreen()`, карточка ops_card_automation
  ведёт на него (раньше шла в ops/automation → AutomationContent без auto_* тегов). DEF-V3-004 (app-часть) закрыт.
- **PipelineHomeScreen**: НЕ уникальный — это дубликат, вытесненный LeadsHomeScreen (та же тройка очередей
  как leads_card_* + Mini Audit). PipelineHomeScreen — мёртвый код. App НЕ трогаем; 2 контрола
  pipeline_card_* в плане переназначаются на leads_card_* (tab_leads, достижимо). Это plan-fix (DEF-V3-003),
  не app-дефект. PipelineHomeScreen.kt можно удалить отдельным cleanup (вне рамок приёмки).

### Безопасность
Не влияет на отправки/КPI. Read-only находка.

---

## DEF-V3-006 — PLAN: timeline-dialog «Закрыть» (text selector) остался на transport вместо conversations

**Severity:** P2 (дефект тест-плана, не приложения; CTRL-0317 искажал состав transport/conversations)
**Root cause class:** HARNESS/PLAN (generator)
**Статус:** FIXED + REGRESSION_GUARD (2026-06-23)

### Симптом
В canonical `exec_plan.json` (файл, который реально читает `ScreenByScreenRunner.kt`) контрол
`CTRL-0317` (`selector_kind=text`, `selector_value="Закрыть"`) числился на `screen=transport`.
Фактически это кнопка закрытия диалога ленты переписки (`TransportScreens.kt:133`,
`TextButton(onClick = vm::closeTimeline) { Text("Закрыть") }`), которая рендерится ТОЛЬКО внутри
`ConversationsScreen` (AlertDialog, открывается после тапа по строке `conv_${lead_id}`).

### Причина (5-source сверка)
`TransportScreens.kt` содержит ТРИ composable: `DeliveryReviewScreen` (anchor `delivery_review`),
`TestOnlyScreen` (`test_only`), `ConversationsScreen` (`conversations`). Статический сканер
`scan_static_controls.mjs` выводит экран из родительского каталога файла (`screenRoute()` →
`feature/transport`), поэтому ВСЕ 17 контролов файла получают `transport`. Генератор
`regen_exec_plan.mjs` затем чинит testTag-контролы по RULES (conv_→conversations, to_badge→test_only),
но цикл переназначения guard'ился на `selector_kind === 'testTag'` (строка 126), а CTRL-0317 —
`text`. Поэтому conv_/to_badge починились, а «Закрыть» осталась на transport.

### Фикс (в source of truth, не вручную в JSON)
1. `regen_exec_plan.mjs`: правило для conversations расширено записью с `kind:'text', prefix:'Закрыть',
   from:'transport'` (re-home только этой кнопки; `from:'transport'` защищает CTRL-0169 «Закрыть»
   на knowledge_digest от ложного матча).
2. `ruleFor()` теперь сверяет `selector_kind` контрола с `r.kind` (default `'testTag'`); цикл
   пропускает и `testTag`, и `text` селекторы.
3. `node regen_exec_plan.mjs --apply` → переназначен ровно 1 контрол (CTRL-0317 transport→conversations);
   conv_/to_badge уже на месте (идемпотентно). TOTAL=283 сохранён.
4. Легаси `control_plan.jsonl` (читается только неиспользуемым `ControlLedgerHarness.kt`) синхронизирован
   вручную: CTRL-0315/0316/0317 → conversations, CTRL-0306/0307 → test_only.

### Regression guard (новый, постоянный)
`tools/android_acceptance_lab/assert_plan_screens.mjs`: проверяет инварианты на canonical exec_plan.json —
`conv_*→conversations`, timeline `Закрыть` НЕ на transport, `to_badge→test_only`, transport не содержит
conv_/to_badge, `CONTROLS_WITHOUT_SCREEN=0`, `CONTROLS_WITH_WRONG_SCREEN=0`, TOTAL=283. Зелёный (exit 0).
Результат: `transport=8, conversations=3, test_only=2`.

### Влияние на приёмку
Это plan-fix, НЕ дефект приложения и НЕ недостижимость. До запуска transport/conversations батча
состав экранов теперь верен: transport=8 собственных контролов, conversations=3 (conv_×2 + timeline close).

### Безопасность
Read-only правка тест-плана. Отправок/КPI/реальных лидов не касается.

---

**Severity:** P3 (тестируемость; влияет на harness, не на пользователя)
**Root cause class:** APP/TESTABILITY
**Статус:** OBSERVED (harness обходит по тексту; app-фикс опционален)

### Находка
Кнопки внутри `AlertDialog` (btn_unpair_confirm/btn_unpair_cancel в SettingsScreen.kt:77,80) имеют
Modifier.testTag(...), но в дереве UiAutomator диалог рендерится в ОТДЕЛЬНОМ суб-окне, где
`testTagsAsResourceId` НЕ применяется → By.res("btn_unpair_confirm") не находит кнопку. Дамп показывает
только `android:id/content` + тексты ("Отвязать устройство?","Отвязать","Отмена").

### Доказательство
Ручная трассировка: btn_unpair найден и нажат, диалог открыт (тексты видны), но resource-id кнопок
отсутствуют. By.text("Отвязать"/"Отмена") находит их корректно.

### Обход в harness (применён)
Dialog-child контролы (btn_unpair_confirm/cancel) проверяются по ТЕКСТУ кнопки, затем ВСЕГДА Cancel
(confirm никогда не нажимается — это реальный unpair). settings 11/11 PASS.

### Вероятно затрагивает (проверить при достижении)
Другие dialog-кнопки с testTag: offer_action_confirm, offer_preview_close, cc_confirm_btn,
ag_wave_confirm, settings_confirm_save, confirm_paid. Если они в Compose AlertDialog — тот же обход.

### Опциональный app-фикс
Чтобы dialog-testTags были видимы инструментам, можно добавить `Modifier.semantics { testTagsAsResourceId=true }`
в свойствах диалога или использовать `properties = DialogProperties(...)`. Не обязателен для приёмки.

---

## BLOCKER FIRSTTOUCH_TEST_ONLY_SUPPORT_GAP — нет безопасного TEST_ONLY-пути для firsttouch candidate/draft

**Severity:** P2 (блокирует верификацию 6 post-draft контролов firsttouch без изменения реальных лидов)
**Root cause class:** PRODUCT/BACKEND (design gap, НЕ дефект приложения)
**Статус:** OPEN — BLOCKED (решение владельца: не выполнять варианты обхода в текущей screen-by-screen сессии)

```text
BLOCKER_ID=FIRSTTOUCH_TEST_ONLY_SUPPORT_GAP
SCREEN=firsttouch
CONTROLS_BLOCKED=6
ROOT_CAUSE=first_touch engine filters TEST_ONLY leads and has no safe TEST_ONLY candidate/draft path
REAL_LEADS_MUST_NOT_BE_CHANGED=YES
```

### Симптом
6 post-draft контролов диалога кандидата firsttouch недоступны для честной верификации без записи
в canonical lead store на РЕАЛЬНОМ лиде:
`ft_select_subject (CTRL-0139)`, `ft_select_body (CTRL-0140)`, `ft_approve_text (CTRL-0141)`,
`ft_return_audit (CTRL-0142)`, `ft_reject (CTRL-0143)`, `ft_select_pilot (CTRL-0144)`.

Эти кнопки (FirstTouchScreen.kt:106-118) рендерятся в дереве ТОЛЬКО при `ui.activeDraftId != null`,
т.е. ПОСЛЕ клика `ft_generate (CTRL-0138)` → `vm.generateDraft(leadId)` → серверная команда
`first_touch_commands.mjs generateDraft`, которая ПИШЕТ в canonical lead store (секции
`first_touch.drafts/decisions/pilot`) и бампит `store_revision`. Это no-send (никаких SMTP/transport),
но это запись на реальном лиде «Арт-строй» без флага test_only.

### Подтверждённая диагностика (этой сессии, вручную через adb, без записи)
- Навигация firsttouch достижима: tab_today → card_commercial → (scroll) cs_first_touch → anchor `first_touch`.
  3 реальных кандидата ft_cand_*. Баннер "Отправка отключена. ... Шлюз отправки: выключен." виден.
- DIAGNOSTIC CANARY ft_close (CTRL-0137) = PASS:
  FIRSTTOUCH_DIALOG_OPENED=YES, FT_CLOSE_FOUND=YES (text "Закрыть" @ 801,2142),
  FT_CLOSE_EXECUTED=YES, FIRSTTOUCH_ANCHOR_RETAINED=YES (first_touch + 3 ft_cand_ снова видны).
- HARNESS-нюанс (для следующей сессии): ft_generate ("Подготовить черновик") и post-draft кнопки лежат
  ВНУТРИ прокручиваемого Column диалога, НИЖЕ длинного текста письма. Видны только после inner-scroll
  диалога. Текущий ScreenByScreenRunner матчит их By.text БЕЗ inner-scroll → ложный FAIL. При реализации
  TEST_ONLY-пути харнессу нужен доскролл внутри AlertDialog перед By.text-матчем.

### Почему 3 рассмотренных варианта отклонены (решение владельца)
1. «Gated без записи» — НЕ проверяет 6 post-draft контролов фактически (только наличие affordance).
2. «Реальный draft + cleanup» — изменяет реальный лид и canonical store (rev++; откатить ревизию нельзя).
3. «Доработать includeTest» — отдельное backend/product изменение; не выполнять внутри длинной
   screen-by-screen сессии.

### Подтверждено в коде
- `first_touch_service.mjs:121` — `if (isTestLead(lead)) exclude.push('TEST_ONLY');` (test_only лиды
  исключаются из скоринга по дизайну).
- `first_touch_service.mjs:19` — `isTestLead` ловит `test_only===true` И lead_id по regex.
- `scope: 'COMMERCIAL_REAL_ONLY'` (строки 165, 177) — заявленный инвариант экрана.
- `seed_acceptance_fixtures.mjs` пишет только в owner_center/campaigns store; canonical lead store
  он НЕ трогает — готового safe-seeder для firsttouch-кандидата НЕТ.

### Требуется (следующая фаза, с отдельным owner-approval на деплой)
```text
EXACT_NEXT_PHASE=IMPLEMENT_SAFE_TEST_ONLY_FIRSTTOUCH_PATH
- добавить TEST_ONLY-aware firsttouch candidate path (ветка includeTest, по образцу DEF-V3-001);
- исключить TEST_ONLY из release/KPI/owner brief;
- разрешить только debug/acceptance mode;
- создать deterministic seeder для canonical lead store (test_only кандидат);
- создать полный cleanup (drafts/decisions/pilot/idem + test_only лид);
- НЕ менять реальные лиды; НЕ активировать send/payment paths;
- харнессу: inner-scroll AlertDialog перед By.text-матчем post-draft кнопок;
- проверить 6 post-draft controls;
- затем вернуться к remaining screen batches (multichannel, transport, conversations, test_only).
PRODUCTION_CHANGE_REQUIRED=YES
PRODUCTION_CHANGE_CLASS=ADDITIVE_NO_SEND_TEST_ONLY_SUPPORT
OWNER_APPROVAL_REQUIRED_FOR_DEPLOYMENT=YES
```

### Безопасность
В этой сессии: НЕ создан draft на реальном лиде, canonical store НЕ изменён (rev 254 цел),
acceptance_v3 fixtures НЕ чищены (нужны следующей сессии). CLIENT_MESSAGES_SENT=0, SMTP_CALLS=0,
PAYMENT_OPERATIONS=0. Вся диагностика — read-only adb-дампы (open candidate dialog → ft_close → закрыт).
