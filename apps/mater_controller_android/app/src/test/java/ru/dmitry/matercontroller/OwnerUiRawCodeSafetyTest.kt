package ru.dmitry.matercontroller

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Static owner-UI safety scan (Phase 8). Reads the reachable Compose screen sources and asserts
 * no raw internal code (SCREAMING_SNAKE_CASE / snake_case enum) survives in a DISPLAYED string
 * literal. Mapping keys (`"x" -> ...`, `"x" to ...`), testTags, navigation routes, comments and
 * non-UI ViewModel logic are legitimately allowed and stripped before the check.
 *
 * This guards against the RC2→RC3 class of defect (raw codes leaking onto nested screens) without
 * needing a device.
 */
class OwnerUiRawCodeSafetyTest {

    // Reachable Compose screen files (root tabs + nested). Dead-code screens not in the nav graph
    // (SystemScreen/ProjectsScreen/PipelineHomeScreen/AutomationScreen) are excluded.
    private val screenFiles = listOf(
        "feature/home/TodayScreen.kt",
        "feature/pipeline/LeadsHomeScreen.kt",
        "feature/pipeline/PipelineQueueScreen.kt",
        "feature/approvals/ApprovalsHomeScreen.kt",
        "feature/approvals/ApprovalListScreen.kt",
        "feature/approvals/ApprovalDetailScreen.kt",
        "feature/commandcenter/CommandCenterScreen.kt",
        "feature/commandcenter/OwnerListScreen.kt",
        "feature/replies/RepliesScreen.kt",
        "feature/operations/OperationsScreens.kt",
        "feature/transport/TransportScreens.kt",
        "feature/miniaudit/MiniAuditHomeScreen.kt",
        "feature/miniaudit/MiniAuditListScreen.kt",
        "feature/miniaudit/LeadDetailScreen.kt",
        // 0.6.0-rc2: newly reachable screens (queue navigation + offer review)
        "feature/agents/AgentsScreens.kt",
        "feature/agents/QueueDetailScreen.kt",
        "feature/commercial/OfferReviewScreens.kt",
        "feature/commercial/CommercialSummaryScreen.kt",
        // 0.6.0-rc4: AI cost dashboard + source registry + knowledge radar
        "feature/ai/AiUsageScreen.kt",
        "feature/sources/SourceRegistryScreen.kt",
        "feature/knowledge/KnowledgeScreens.kt",
        "feature/firsttouch/FirstTouchScreen.kt",
        "feature/reliability/ReliabilityScreen.kt",
        "feature/cost/CostCenterScreen.kt",
        // 0.6.0-rc5: product detail (presentation), source telemetry, owner settings, reservoir
        "feature/catalog/ProductDetailScreen.kt",
        "feature/sources/SourceTelemetryScreen.kt",
        "feature/ownersettings/OwnerSettingsScreen.kt",
        "feature/reservoir/ReservoirScreen.kt",
        "feature/sales/WorkingSalesMvpScreen.kt",
        "feature/serverfunnel/ServerFunnelScreens.kt",
        "feature/settings/SettingsScreen.kt",
    )

    // Tokens that are allowed to appear (brand names / safe identifiers), case-insensitive.
    private val allowTokens = setOf(
        "mini_audit", // brand handled separately; not expected as a literal anyway
    )

    private fun srcRoot(): File {
        // test working dir is the module dir (app/); source is under src/main/java/...
        val base = File("src/main/java/ru/dmitry/matercontroller")
        return if (base.exists()) base else File("app/src/main/java/ru/dmitry/matercontroller")
    }

    /** Extract DISPLAYED string literals from a line after stripping safe contexts. */
    private fun displayedLiterals(rawLine: String): List<String> {
        var line = rawLine
        // drop comments
        val ci = line.indexOf("//")
        if (ci >= 0) line = line.substring(0, ci)
        if (line.isBlank()) return emptyList()
        // Internal key assembly, not displayed text.
        if (line.contains("joinToString(\"_\")")) return emptyList()
        // strip testTag("...") and tag/rootTag/safetyTag = "..."
        line = line.replace(Regex("""testTag\(\s*"[^"]*"\s*\)"""), "")
        line = line.replace(Regex("""\b(tag|rootTag|safetyTag)\s*=\s*"[^"]*""""), "")
        // strip navigation routes / callback data: navigate("..."), route("..."), startsWith("...")
        line = line.replace(Regex("""(navigate|route|startsWith|getString|composable)\(\s*"[^"]*"""), "$1(")
        // strip callback/navigation invocations: onOpenBucket("..."), onOpenQueue("..."), onOpen("..."),
        // onOpenItem(q, "..."), onOpenLead("...") etc. — these pass canonical keys, never displayed text.
        line = line.replace(Regex("""\bon[A-Z][A-Za-z0-9]*\([^)]*"""), "")
        // strip operator-import parser keys; they are accepted input keys, not displayed UI text.
        line = line.replace(Regex("""\bupperKey\([^)]*\)"""), "")
        line = stripKotlinInterpolations(line)
        // collect remaining literals
        val lits = Regex("\"([^\"]*)\"").findAll(line).map { it.groupValues[1] }.toList()
        // drop map/when KEY literals: a literal immediately followed by `->` or `to `
        val keyKilled = mutableListOf<String>()
        val keyRegex = Regex("\"([^\"]*)\"\\s*(->|to\\b)")
        val keys = keyRegex.findAll(line).map { it.groupValues[1] }.toSet()
        for (l in lits) if (l !in keys) keyKilled.add(l)
        return keyKilled.map {
            it.replace(Regex("""\$\{[^}]*}"""), "")
                .replace(Regex("""\$[A-Za-z_][A-Za-z0-9_]*"""), "")
        }
    }

    private fun stripKotlinInterpolations(input: String): String {
        val out = StringBuilder()
        var i = 0
        while (i < input.length) {
            if (input[i] == '$' && i + 1 < input.length && input[i + 1] == '{') {
                i += 2
                var depth = 1
                while (i < input.length && depth > 0) {
                    when (input[i]) {
                        '{' -> depth++
                        '}' -> depth--
                    }
                    i++
                }
                continue
            }
            if (input[i] == '$' && i + 1 < input.length && (input[i + 1].isLetter() || input[i + 1] == '_')) {
                i += 2
                while (i < input.length && (input[i].isLetterOrDigit() || input[i] == '_')) i++
                continue
            }
            out.append(input[i])
            i++
        }
        return out.toString()
    }

    private val rawCode = Regex("""\b[A-Z][A-Z0-9]{2,}(_[A-Z0-9]+)+\b|\b[a-z]+(_[a-z0-9]+)+\b""")

    private fun isTechnicalTestTag(literal: String): Boolean {
        val prefixes = listOf("pilot_", "card_", "cs_", "ops_", "agents_", "decisions_", "leads_", "sales_", "owner_")
        return prefixes.any { literal.startsWith(it) } && rawCode.matches(literal)
    }

    @Test fun noRawInternalCodesInOwnerVisibleLiterals() {
        val root = srcRoot()
        val offenders = mutableListOf<String>()
        for (rel in screenFiles) {
            val f = File(root, rel)
            assertTrue("missing screen file: $rel", f.exists())
            f.readLines().forEachIndexed { idx, line ->
                for (lit in displayedLiterals(line)) {
                    if (lit.isBlank()) continue
                    if (lit.lowercase() in allowTokens) continue
                    if (isTechnicalTestTag(lit)) continue
                    // a displayed string is usually a phrase with spaces or Cyrillic; a bare
                    // snake/SCREAMING token with no spaces is the smell we catch.
                    if (lit.contains(' ')) continue
                    val m = rawCode.find(lit) ?: continue
                    // allow interpolation placeholders like ${...}
                    if (lit.startsWith("$")) continue
                    offenders.add("$rel:${idx + 1}  «$lit» (match ${m.value})")
                }
            }
        }
        assertTrue(
            "Raw internal codes found in owner-visible literals:\n" + offenders.joinToString("\n"),
            offenders.isEmpty(),
        )
    }

    @Test fun ownerCommercialWorkflowLabelsPresent() {
        val root = srcRoot()
        val text = screenFiles.joinToString("\n") { rel -> File(root, rel).readText() } +
            "\n" + File(root, "feature/MaterControllerRoot.kt").readText()
        listOf(
            "Выберите следующий лид или введите сайт вручную.",
            "Проверка качества",
            "Выбрать канал",
            "Создать отправочный пакет",
            "Номер пакета",
            "Контрольная метка текста",
            "Метка пакета",
            "Монитор ответов",
            "Выбрать продукт",
            "Сформировать PDF",
            "Черновик счёта",
            "Платежи выключены",
            "Локальный аудит",
            "Следующее действие",
            "Краткая сводка",
            "Открыть лид",
            "Запустить поиск",
            "К отправке",
            "Данные не обновились",
            "Очередь лидов",
            "Реальные лиды",
            "Контакт и источник",
            "История и ограничения контакта",
            "Структура первого касания",
            "Фактическая основа",
            "Проверки качества",
            "Предпросмотр аудита исключения",
            "Форма на сайте",
            "Телефон",
            "Другой ручной",
            "Предпросмотр аудита",
            "Локальный аудит результата",
            "Классы: интерес, вопрос, возражение, не писать, недоставка, не по теме",
            "Создать сделку",
            "Сформировать аудит",
            "Подготовить ответ",
            "Не контактировать",
            "Стадии сделки",
            "Действия с документом",
            "Провайдер оплаты настроен",
            "События контура",
            "Автоматизированная воронка",
            "Пульт владельца",
            "Введите сайт, команду или решение",
            "Команды выполняются локально. Внешние действия не запускаются.",
            "ПАКЕТ НЕ ОТПРАВЛЕН",
            "Причина устаревания",
            "Почта",
            "Письмо",
            "Черновик ответа",
            "Подтверждение",
            "Локальная история",
            "Пакет не отправлен",
            "Клиенту письмо не отправлено.",
        ).forEach { needle ->
            assertTrue("missing owner workflow literal: $needle", text.contains(needle))
        }
    }

    @Test fun drawerCommandCenterNavigationIsOwnerPrimaryShell() {
        val nav = File(srcRoot(), "feature/MaterControllerRoot.kt").readText()
        listOf(
            "owner_command_scaffold",
            "owner_top_bar",
            "owner_drawer",
            "owner_command_bar",
            "owner_command_input",
            "owner_command_execute",
            "owner_drawer_today",
            "owner_drawer_leads",
            "owner_drawer_replies",
            "owner_drawer_deals",
            "owner_drawer_documents",
            "owner_drawer_history",
            "owner_drawer_safety",
            "owner_drawer_settings",
        ).forEach { needle ->
            assertTrue("missing dark command center shell literal: $needle", nav.contains(needle))
        }
        assertTrue(nav.contains("owner_replies_simple"))
        assertTrue(nav.contains("owner_deals_simple"))
        assertTrue(nav.contains("owner_documents_simple"))
        assertTrue(nav.contains("owner_history_simple"))
        assertTrue(nav.contains("owner_safety_simple"))
        assertTrue(nav.contains("initialRoute = \"lead_queue\""))
        assertFalse("old commerce tab must be removed from tab model", nav.contains("data object Commerce"))
        assertFalse("dark command center must not keep bottom nav shell", nav.contains("bottom_nav"))
        assertFalse("old commerce tab must not be in nav model", nav.contains("Tab.Commerce"))
        assertFalse("mode toggle must stay removed until it changes screen content", nav.contains("owner_mode_focus"))
        assertFalse("mode toggle must stay removed until it changes screen content", nav.contains("owner_mode_overview"))
        assertFalse("top-level drawer routes must not restore stale commercial screens", nav.contains("restoreState = true"))
        val todayVm = File(srcRoot(), "feature/home/TodayViewModel.kt").readText()
        assertTrue("autorefilling must be based on ready leads, not stale total backlog", todayVm.contains("queue.readyCount >= AUTO_REFILL_MIN_READY"))
        assertFalse("autorefilling must not be blocked by stale total backlog", todayVm.contains("queue.total >= AUTO_REFILL_MIN"))
    }

    @Test fun darkCommandCenterComponentsPresent() {
        val root = srcRoot()
        val nav = File(root, "feature/MaterControllerRoot.kt").readText()
        val sales = File(root, "feature/sales/WorkingSalesMvpScreen.kt").readText()
        val theme = File(root, "core/designsystem/Theme.kt").readText()
        listOf(
            "ThemeMode.DARK",
            "Color(0xFF050505)",
            "Color(0xFF151515)",
            "Color(0xFF292929)",
            "Color(0xFF9B6CFF)",
        ).forEach { needle ->
            assertTrue("missing dark theme token/default: $needle", theme.contains(needle))
        }
        listOf(
            "owner_focus_card",
            "owner_overview_list",
            "owner_status_badge",
            "owner_primary_action",
            "owner_secondary_action",
            "owner_danger_action",
            "owner_gate_card",
            "owner_checklist",
            "owner_boarding_pass_packet",
            "owner_timeline",
            "owner_audit_event_row",
            "owner_empty_state",
            "owner_loading_state",
            "owner_error_state",
            "owner_stale_state",
            "owner_offline_state",
            "owner_permission_state",
            "owner_blocked_by_gate_state",
        ).forEach { needle ->
            assertTrue("missing dark command center workflow component/tag: $needle", sales.contains(needle))
        }
        assertTrue(nav.contains("Команда выполнена локально. Внешние действия не запускались."))
    }

    @Test fun oldCommercialScreenGenerationsNotInOwnerProductPath() {
        val nav = File(srcRoot(), "feature/MaterControllerRoot.kt").readText()
        assertTrue(nav.contains("Internal archive: old commercial summary"))
        assertTrue(nav.contains("Internal archive: old first-touch strategist"))
        assertFalse("owner callbacks must not open old first_touch route", nav.contains("onOpenFirstTouch = { nav.navigate(\"first_touch\") }"))
        assertTrue("owner callbacks should open current workflow", nav.contains("onOpenFirstTouch = { nav.navigate(\"working_sales_mvp\") }"))
    }

    @Test fun operatorImportRouteVisibleWithSafetyLabels() {
        val root = srcRoot()
        val nav = File(root, "feature/MaterControllerRoot.kt").readText()
        val sales = File(root, "feature/sales/WorkingSalesMvpScreen.kt").readText()
        assertTrue("working sales route must open the real input screen", nav.contains("WorkingSalesMvpScreen(onBack"))
        listOf(
            "operator_import_route",
            "operator_import_load",
            "sales_site_input",
            "sales_analyze_site",
            "sales_import_site_list",
            "sales_site_analysis_loading",
            "sales_primary_next_action",
            "sales_step_qa",
            "sales_step_readiness",
            "sales_step_manual_send",
            "sales_send_readiness",
            "sales_draft_editor",
            "sales_confirm_manual_send_packet",
            "sales_post_send_result",
            "sales_owner_override_reason",
            "sales_qa_override_reason",
            "Сайт компании",
            "Разобрать",
            "Импорт списка сайтов",
            "Расширенные данные",
            "Загрузить лиды оператора",
            "Файл оператора не найден. Импорт не выполнен.",
            "Ручное письмо доступно владельцу; платежи выключены.",
            "sales_safety_banner",
        ).forEach { needle ->
            assertTrue("missing operator import/safety literal: $needle", sales.contains(needle))
        }
    }

    @Test fun operatorImportKeepsRealLeadFixturesOutOfGit() {
        val moduleRoot = File(".")
        listOf(
            "src/main/assets/operator_import",
            "src/main/res/raw/operator_import",
            "src/test/resources/operator_import",
            "src/androidTest/assets/operator_import",
        ).forEach { rel ->
            assertFalse("operator import runtime data must not be committed: $rel", File(moduleRoot, rel).exists())
        }
        val sales = File(srcRoot(), "feature/sales/WorkingSalesMvpScreen.kt").readText()
        assertTrue("operator import must read from app external files", sales.contains("context.getExternalFilesDir(null)"))
    }

    @Test fun noPilotOwnerVisibleEnglishResidueInLiterals() {
        val forbidden = listOf(
            "Manual Sales Pilot",
            "Working Sales MVP",
            "start here",
            "sales pilot",
            "Lead / Qualify / Draft",
            "Lead -> Qualify",
            "Offer Detail",
            "Synthetic Window Studio",
            "manual/synthetic",
            "visual review",
            "manual gate",
            "fake green",
            "needs decision",
            "needs reply",
            "in progress",
            "read-only",
            "draft-only",
            "drafts",
            "synthetic",
            "contract-only",
            "Payment provider",
            "AI usage, budget",
            "Value proposition",
            "First message draft",
            "Message draft",
            "Safety warnings",
            "Shadow analysis",
            "owner review",
            "owner decisions",
            "production write",
            "prod-write",
            "CRM/payment/mail",
            "Browser automation",
            "voice capture",
        )
        val root = srcRoot()
        val offenders = mutableListOf<String>()
        for (rel in screenFiles) {
            val f = File(root, rel)
            assertTrue("missing screen file: $rel", f.exists())
            f.readLines().forEachIndexed { idx, line ->
                for (lit in displayedLiterals(line)) {
                    if (lit.isBlank()) continue
                    if (isTechnicalTestTag(lit)) continue
                    val found = forbidden.firstOrNull { lit.contains(it, ignoreCase = true) }
                    if (found != null) offenders.add("$rel:${idx + 1}  «$lit» (match $found)")
                }
            }
        }
        assertTrue(
            "Pilot owner-visible English residue found:\n" + offenders.joinToString("\n"),
            offenders.isEmpty(),
        )
    }

    @Test fun noProductionNoSendPilotDemoTestResidueInOwnerVisibleLiterals() {
        val forbidden = Regex("""(?i)(^|[\s,.:;()«»/\\-])(пилот\p{L}*|демо|тест\p{L}*|test_only|synthetic)(?=$|[\s,.:;()«»/\\-])""")
        val root = srcRoot()
        val offenders = mutableListOf<String>()
        for (rel in screenFiles) {
            val f = File(root, rel)
            assertTrue("missing screen file: $rel", f.exists())
            f.readLines().forEachIndexed { idx, line ->
                for (lit in displayedLiterals(line)) {
                    if (lit.isBlank()) continue
                    if (isTechnicalTestTag(lit)) continue
                    val found = forbidden.find(lit) ?: continue
                    offenders.add("$rel:${idx + 1}  «$lit» (match ${found.value.trim()})")
                }
            }
        }
        assertTrue(
            "Pilot/demo/test residue found in owner-visible literals:\n" + offenders.joinToString("\n"),
            offenders.isEmpty(),
        )
    }

    @Test fun noUnsafeSuccessLabelsInOwnerVisibleLiterals() {
        val unsafe = setOf(
            "sent",
            "paid",
            "written",
            "send enabled",
            "payment enabled",
            "production enabled",
            "prod write enabled",
        )
        val root = srcRoot()
        val offenders = mutableListOf<String>()
        for (rel in screenFiles) {
            val f = File(root, rel)
            assertTrue("missing screen file: $rel", f.exists())
            f.readLines().forEachIndexed { idx, line ->
                for (lit in displayedLiterals(line)) {
                    if (lit.trim().lowercase() in unsafe) {
                        offenders.add("$rel:${idx + 1}  «$lit»")
                    }
                }
            }
        }
        assertTrue(
            "Unsafe success labels found in owner-visible literals:\n" + offenders.joinToString("\n"),
            offenders.isEmpty(),
        )
    }

    @Test fun noCommercialTechJargonInOwnerVisibleLiterals() {
        val forbidden = listOf(
            "STOP",
            "QA",
            "hash",
            "payload",
            "suppression",
            "production write",
            "auto-send",
            "read-only",
            "MCP",
            "runtime",
            "DTO",
            "stacktrace",
            "raw internal codes",
            "body_hash",
            "payload_hash",
            "approval_id",
            "idempotency_key",
            "Ключ идемпотентности",
            "Хэш текста",
            "Хэш пакета",
            "Совпадение хэша",
            "Код текста",
            "Код пакета",
            "Код записи",
            "Предыдущий код",
        )
        val root = srcRoot()
        val offenders = mutableListOf<String>()
        for (rel in screenFiles) {
            val f = File(root, rel)
            assertTrue("missing screen file: $rel", f.exists())
            f.readLines().forEachIndexed { idx, line ->
                for (lit in displayedLiterals(line)) {
                    if (lit.isBlank()) continue
                    if (isTechnicalTestTag(lit)) continue
                    val found = forbidden.firstOrNull { lit.contains(it, ignoreCase = true) }
                    if (found != null) offenders.add("$rel:${idx + 1}  «$lit» (match $found)")
                }
            }
        }
        assertTrue(
            "Commercial tech jargon found in owner-visible literals:\n" + offenders.joinToString("\n"),
            offenders.isEmpty(),
        )
    }
}
