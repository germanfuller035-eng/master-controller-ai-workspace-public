package ru.dmitry.matercontroller.feature

import android.net.Uri
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavType
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.navArgument
import androidx.navigation.compose.*
import ru.dmitry.matercontroller.R
import ru.dmitry.matercontroller.core.designsystem.MaterControllerTheme
import ru.dmitry.matercontroller.core.designsystem.ThemeMode
import ru.dmitry.matercontroller.feature.auth.AuthViewModel
import ru.dmitry.matercontroller.feature.auth.ConnectionScreen
import ru.dmitry.matercontroller.feature.approvals.*
import ru.dmitry.matercontroller.feature.home.TodayScreen
import ru.dmitry.matercontroller.feature.miniaudit.*
import ru.dmitry.matercontroller.feature.operations.*
import ru.dmitry.matercontroller.feature.outreach.OutreachQueueScreen
import ru.dmitry.matercontroller.feature.pipeline.*
import ru.dmitry.matercontroller.feature.sales.WorkingSalesMvpScreen
import ru.dmitry.matercontroller.feature.serverfunnel.ServerFunnelApprovalScreen
import ru.dmitry.matercontroller.feature.serverfunnel.ServerFunnelDraftReplyScreen
import ru.dmitry.matercontroller.feature.serverfunnel.ServerFunnelEmailDetailScreen
import ru.dmitry.matercontroller.feature.serverfunnel.ServerFunnelHistoryScreen
import ru.dmitry.matercontroller.feature.serverfunnel.ServerFunnelMailScreen
import ru.dmitry.matercontroller.feature.settings.SettingsScreen
import ru.dmitry.matercontroller.feature.settings.SettingsViewModel
import kotlinx.coroutines.launch

/**
 * Compact owner-oriented navigation: five top-level destinations
 * (Today / Leads / Replies / Deals / More). Everything else is nested under these via pushed routes.
 * Existing deep routes are preserved, but old specialist surfaces are no longer bottom-nav tabs.
 */
private sealed class Tab(val route: String, val labelRes: Int, val icon: ImageVector) {
    data object Today : Tab("today", R.string.nav_today, Icons.Filled.Today)
    data object Leads : Tab("leads", R.string.nav_leads, Icons.Filled.List)
    data object Replies : Tab("replies", R.string.nav_replies, Icons.Filled.FactCheck)
    data object Deals : Tab("deals", R.string.nav_deals, Icons.Filled.ShoppingCart)
    data object Evidence : Tab("decisions", R.string.nav_evidence, Icons.Filled.FactCheck)
    data object Agents : Tab("agents", R.string.nav_agents, Icons.Filled.Psychology)
    data object System : Tab("system", R.string.nav_system, Icons.Filled.Dns)
}

@OptIn(ExperimentalComposeUiApi::class)
@Composable
fun MaterControllerRoot() {
    val settingsVm: SettingsViewModel = hiltViewModel()
    val theme by settingsVm.themeMode.collectAsState(initial = ThemeMode.DARK)
    MaterControllerTheme(themeMode = theme) {
        // Expose Compose testTags as resource-ids so UIAutomator (By.res) can select every control.
        // No visual/behavioral change; enables the exhaustive control harness to resolve tags.
        androidx.compose.foundation.layout.Box(modifier = Modifier.fillMaxSize().semantics { testTagsAsResourceId = true }) {
            val authVm: AuthViewModel = hiltViewModel()
            val startup by authVm.startup.collectAsState()
            val restoredPaired by authVm.restoredPaired.collectAsState()
            var paired by remember { mutableStateOf(false) }

            LaunchedEffect(startup, restoredPaired) {
                if (startup == ru.dmitry.matercontroller.feature.auth.StartupPhase.READY) {
                    paired = restoredPaired
                }
            }

            when {
                startup == ru.dmitry.matercontroller.feature.auth.StartupPhase.RESTORING -> RestoringProfileScreen()
                !paired -> ConnectionScreen(
                    onPaired = { paired = true },
                    onLocalMode = { paired = true },
                )
                else -> MainScaffold(onUnpair = { paired = false })
            }
        }
    }
}

@Composable
private fun RestoringProfileScreen() {
    Surface {
        androidx.compose.foundation.layout.Box(
            modifier = Modifier.fillMaxSize().testTag("restoring_profile"),
            contentAlignment = androidx.compose.ui.Alignment.Center,
        ) { CircularProgressIndicator() }
    }
}

private val ownerTopLevelRoutes = setOf(
    Tab.Today.route,
    Tab.Leads.route,
    Tab.Replies.route,
    Tab.Deals.route,
    "documents",
    "mail",
    "mail_history",
    "history",
    "safety",
    "connection_settings",
)

private data class OwnerDrawerItem(
    val route: String,
    val label: String,
    val icon: ImageVector,
    val tag: String,
)

@Composable
private fun OwnerTopBar(
    title: String,
    onOpenDrawer: () -> Unit,
) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 2.dp,
        modifier = Modifier.fillMaxWidth().statusBarsPadding().testTag("owner_top_bar"),
    ) {
        Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onOpenDrawer, modifier = Modifier.testTag("owner_drawer_toggle")) {
                    Icon(Icons.Filled.Menu, contentDescription = "Меню")
                }
                Column(Modifier.weight(1f)) {
                    Text("Master Controller", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(title, style = MaterialTheme.typography.titleLarge)
                }
            }
        }
    }
}

@Composable
private fun OwnerDrawer(
    currentRoute: String,
    onNavigate: (String) -> Unit,
    onClose: () -> Unit,
) {
    val primary = listOf(
        OwnerDrawerItem(Tab.Today.route, "Сегодня", Icons.Filled.Today, "owner_drawer_today"),
        OwnerDrawerItem("mail", "Почта", Icons.Filled.Email, "owner_drawer_mail"),
        OwnerDrawerItem(Tab.Leads.route, "Лиды", Icons.Filled.List, "owner_drawer_leads"),
        OwnerDrawerItem(Tab.Replies.route, "Ответы", Icons.Filled.FactCheck, "owner_drawer_replies"),
        OwnerDrawerItem(Tab.Deals.route, "Сделки", Icons.Filled.ShoppingCart, "owner_drawer_deals"),
        OwnerDrawerItem("documents", "Документы", Icons.Filled.Description, "owner_drawer_documents"),
        OwnerDrawerItem("history", "История", Icons.Filled.History, "owner_drawer_history"),
        OwnerDrawerItem("safety", "Безопасность", Icons.Filled.Security, "owner_drawer_safety"),
        OwnerDrawerItem("connection_settings", "Настройки", Icons.Filled.Settings, "owner_drawer_settings"),
    )
    val pinned = listOf(
        OwnerDrawerItem("sales/send", "Первый ручной пакет", Icons.Filled.Outbox, "owner_drawer_first_packet"),
        OwnerDrawerItem("sales/qa", "Ограничения контакта", Icons.Filled.Report, "owner_drawer_contact_limits"),
        OwnerDrawerItem("documents", "Черновики документов", Icons.Filled.Article, "owner_drawer_document_drafts"),
        OwnerDrawerItem("safety", "Разрешение платежей", Icons.Filled.Lock, "owner_drawer_payment_gate"),
        OwnerDrawerItem("safety", "Ошибки обновления", Icons.Filled.SyncProblem, "owner_drawer_refresh_errors"),
    )
    ModalDrawerSheet(
        drawerContainerColor = MaterialTheme.colorScheme.surface,
        drawerContentColor = MaterialTheme.colorScheme.onSurface,
        modifier = Modifier.fillMaxHeight().width(320.dp).testTag("owner_drawer"),
    ) {
        Column(Modifier.fillMaxHeight().verticalScroll(rememberScrollState())) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Пульт владельца", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                IconButton(onClick = onClose, modifier = Modifier.testTag("owner_drawer_close")) {
                    Icon(Icons.Filled.Close, contentDescription = "Закрыть")
                }
            }
            OwnerDrawerSection("Основное")
            primary.forEach { item ->
                OwnerDrawerRow(item = item, currentRoute = currentRoute, onNavigate = onNavigate)
            }
            OwnerDrawerSection("Закреплено")
            pinned.forEach { item ->
                OwnerDrawerRow(item = item, currentRoute = currentRoute, onNavigate = onNavigate)
            }
            OwnerDrawerSection("Последнее")
            listOf(
                OwnerDrawerItem(Tab.Leads.route, "Последний лид", Icons.Filled.PersonSearch, "owner_drawer_recent_lead"),
                OwnerDrawerItem("sales/send", "Последний пакет", Icons.Filled.Outbox, "owner_drawer_recent_packet"),
                OwnerDrawerItem(Tab.Replies.route, "Последний ответ", Icons.Filled.MarkEmailRead, "owner_drawer_recent_reply"),
                OwnerDrawerItem(Tab.Deals.route, "Последняя сделка", Icons.Filled.Work, "owner_drawer_recent_deal"),
                OwnerDrawerItem("documents", "Последний документ", Icons.Filled.Description, "owner_drawer_recent_document"),
            ).forEach { item ->
                OwnerDrawerRow(item = item, currentRoute = currentRoute, onNavigate = onNavigate)
            }
            Spacer(Modifier.height(12.dp))
            Text(
                "Внешние действия только после отдельного подтверждения.",
                modifier = Modifier.padding(16.dp),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun OwnerDrawerSection(title: String) {
    Text(
        title,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.primary,
    )
}

@Composable
private fun OwnerDrawerRow(
    item: OwnerDrawerItem,
    currentRoute: String,
    onNavigate: (String) -> Unit,
) {
    NavigationDrawerItem(
        selected = isOwnerRouteSelected(item.route, currentRoute),
        onClick = { onNavigate(item.route) },
        icon = { Icon(item.icon, contentDescription = null) },
        label = { Text(item.label) },
        modifier = Modifier.height(56.dp).padding(horizontal = 8.dp).testTag(item.tag),
        colors = NavigationDrawerItemDefaults.colors(
            selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
            unselectedContainerColor = MaterialTheme.colorScheme.surface,
        ),
    )
}

@Composable
private fun OwnerCommandBar(
    value: String,
    onValue: (String) -> Unit,
    feedback: String,
    onExecute: () -> Unit,
    onImport: () -> Unit,
    onVoice: () -> Unit,
) {
    val focusManager = LocalFocusManager.current
    fun executeCommand() {
        focusManager.clearFocus(force = true)
        onExecute()
    }
    Surface(
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 4.dp,
        modifier = Modifier.fillMaxWidth().navigationBarsPadding().imePadding().testTag("owner_command_bar"),
    ) {
        Column(Modifier.padding(horizontal = 10.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                IconButton(onClick = onImport, modifier = Modifier.testTag("owner_command_plus")) {
                    Icon(Icons.Filled.Add, contentDescription = "Добавить")
                }
                OutlinedTextField(
                    value = value,
                    onValueChange = onValue,
                    placeholder = {
                        Text(
                            "Введите сайт, команду или решение",
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { executeCommand() }),
                    modifier = Modifier.weight(1f).testTag("owner_command_input"),
                )
                IconButton(onClick = onVoice, modifier = Modifier.testTag("owner_command_voice")) {
                    Icon(Icons.Filled.Mic, contentDescription = "Голос")
                }
                IconButton(
                    onClick = { executeCommand() },
                    modifier = Modifier.height(56.dp).width(56.dp).testTag("owner_command_execute"),
                ) {
                    Icon(Icons.Filled.ArrowForward, contentDescription = null)
                }
            }
            Text(
                feedback,
                modifier = Modifier.testTag("owner_command_feedback"),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

private fun isOwnerRouteSelected(route: String, currentRoute: String): Boolean {
    return currentRoute == route ||
        (route == Tab.Leads.route && currentRoute.startsWith("working_sales_mvp")) ||
        (route == "documents" && currentRoute.startsWith("documents")) ||
        (route == "history" && currentRoute.startsWith("history")) ||
        (route == "safety" && currentRoute.startsWith("safety"))
}

private fun ownerRouteTitle(route: String): String = when {
    route == Tab.Today.route -> "Сегодня"
    route == "mail" || route.startsWith("mail/") -> "Почта"
    route == "mail_history" -> "История"
    route == Tab.Leads.route || route.startsWith("working_sales_mvp") -> "Лиды"
    route == Tab.Replies.route -> "Ответы"
    route == Tab.Deals.route -> "Сделки"
    route.startsWith("documents") -> "Документы"
    route.startsWith("history") -> "История"
    route.startsWith("safety") -> "Безопасность"
    route == "sales/product" -> "Продукт"
    route == "sales/material" -> "Материал"
    route == "sales/invoice" -> "Счёт"
    route == "sales/payment" -> "Платежи"
    route == "sales/history" -> "Результат"
    route == "connection_settings" -> "Настройки"
    else -> "Пульт владельца"
}

@Composable
private fun MainScaffold(onUnpair: () -> Unit) {
    val nav = rememberNavController()
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val focusManager = LocalFocusManager.current
    var commandText by rememberSaveable { mutableStateOf("") }
    var commandFeedback by rememberSaveable {
        mutableStateOf("Команды выполняются локально. Внешние действия не запускаются.")
    }
    val backStack by nav.currentBackStackEntryAsState()
    val currentRoute = backStack?.destination?.route.orEmpty()

    fun navigateOwner(route: String) {
        scope.launch { drawerState.close() }
        nav.navigate(route) {
            launchSingleTop = true
            if (route in ownerTopLevelRoutes) {
                popUpTo(nav.graph.findStartDestination().id) { saveState = false }
            }
        }
    }

    fun runOwnerCommand() {
        focusManager.clearFocus(force = true)
        val raw = commandText.trim()
        val route = when {
            raw.isBlank() -> ""
            raw.contains("почт", ignoreCase = true) || raw.contains("email", ignoreCase = true) -> "mail"
            raw.equals("история", ignoreCase = true) -> "history"
            raw.contains("лид", ignoreCase = true) -> Tab.Leads.route
            raw.contains("разбор", ignoreCase = true) -> "sales/lead"
            raw.contains("текст", ignoreCase = true) || raw.contains("черновик", ignoreCase = true) -> "sales/draft"
            raw.contains("провер", ignoreCase = true) -> "sales/qa"
            raw.contains("канал", ignoreCase = true) -> "sales/readiness"
            raw.contains("результ", ignoreCase = true) -> "sales/history"
            raw.contains("разбор ответа", ignoreCase = true) -> "sales/reply_detail"
            raw.contains("ответ", ignoreCase = true) -> Tab.Replies.route
            raw.contains("сдел", ignoreCase = true) -> Tab.Deals.route
            raw.contains("продукт", ignoreCase = true) -> "sales/product"
            raw.contains("материал", ignoreCase = true) -> "sales/material"
            raw.contains("сч", ignoreCase = true) || raw.contains("оплат", ignoreCase = true) -> "sales/payment"
            raw.contains("безопас", ignoreCase = true) -> "safety"
            raw.contains("настрой", ignoreCase = true) -> "connection_settings"
            raw.contains("пакет", ignoreCase = true) -> "sales/send"
            raw.contains("кп", ignoreCase = true) || raw.contains("документ", ignoreCase = true) -> "documents"
            raw.contains("разобрать", ignoreCase = true) -> Tab.Leads.route
            raw.contains("отлож", ignoreCase = true) -> "history"
            raw.contains(".") && !raw.contains(" ") -> "working_sales_mvp?site=${Uri.encode(raw)}"
            else -> ""
        }
        if (route.isBlank()) {
            commandFeedback = "Команда неоднозначна. Уточните сайт, ответ, сделку, пакет или историю."
        } else {
            commandFeedback = "Команда выполнена локально. Внешние действия не запускались."
            commandText = ""
            navigateOwner(route)
        }
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            OwnerDrawer(
                currentRoute = currentRoute,
                onNavigate = ::navigateOwner,
                onClose = { scope.launch { drawerState.close() } },
            )
        },
        modifier = Modifier.testTag("owner_command_scaffold"),
    ) {
        Scaffold(
            containerColor = MaterialTheme.colorScheme.background,
            topBar = {
                OwnerTopBar(
                    title = ownerRouteTitle(currentRoute),
                    onOpenDrawer = { scope.launch { drawerState.open() } },
                )
            },
            bottomBar = {
                OwnerCommandBar(
                    value = commandText,
                    onValue = { commandText = it },
                    feedback = commandFeedback,
                    onExecute = ::runOwnerCommand,
                    onImport = {
                        commandFeedback = "Импорт выполняется только из приватного хранилища приложения."
                        navigateOwner(Tab.Leads.route)
                    },
                    onVoice = {
                        commandFeedback = "Голосовой ввод сейчас недоступен. Введите сайт или команду текстом."
                    },
                )
            },
        ) { pad ->
        NavHost(nav, startDestination = Tab.Today.route, modifier = Modifier.padding(pad)) {
            // ---- Сегодня ----
            composable(Tab.Today.route) {
                TodayScreen(
                    onOpenMiniAudit = { nav.navigate("mini_audit") },
                    onOpenCommercial = { nav.navigate(Tab.Deals.route) },
                    onOpenCommandCenter = { nav.navigate("command_center") },
                    onOpenCampaigns = { nav.navigate("campaigns") },
                    onOpenDecisions = { nav.navigate(Tab.Evidence.route) },
                    onOpenAgents = { nav.navigate(Tab.Agents.route) },
                    onOpenReplies = { nav.navigate(Tab.Replies.route) },
                    onOpenSystem = { nav.navigate(Tab.System.route) },
                    onOpenCost = { nav.navigate("cost_center") },
                    onOpenIncidents = { nav.navigate("owner_incidents") },
                    onOpenWorkingSalesMvp = { nav.navigate(Tab.Leads.route) },
                )
            }

            // ---- 0.7.0-rc1: Campaign Governor (read-only; без отправки) ----
            composable("campaigns") {
                ru.dmitry.matercontroller.feature.campaigns.CampaignsScreen()
            }

            // ---- 0.8.0-rc1: Owner Command & Autonomy Center (read-only; без отправки) ----
            composable("command_center") {
                ru.dmitry.matercontroller.feature.commandcenter.CommandCenterScreen(
                    onOpenDecisions = { nav.navigate("owner_decisions") },
                    onOpenIncidents = { nav.navigate("owner_incidents") },
                )
            }

            // ---- Server-connected funnel: Email Hub and owner approval path ----
            composable("mail") {
                ServerFunnelMailScreen(
                    onOpenEmail = { emailId -> nav.navigate("mail/$emailId") },
                    onOpenHistory = { nav.navigate("mail_history") },
                )
            }
            composable("mail/{emailId}") { entry ->
                val emailId = entry.arguments?.getString("emailId") ?: ""
                ServerFunnelEmailDetailScreen(
                    emailId = emailId,
                    onPrepareDraft = { id -> nav.navigate("mail/$id/draft") },
                )
            }
            composable("mail/{emailId}/draft") { entry ->
                val emailId = entry.arguments?.getString("emailId") ?: ""
                ServerFunnelDraftReplyScreen(
                    emailId = emailId,
                    onOpenApproval = { id -> nav.navigate("mail/$id/approval") },
                )
            }
            composable("mail/{emailId}/approval") { entry ->
                ServerFunnelApprovalScreen(emailId = entry.arguments?.getString("emailId") ?: "")
            }
            composable("mail_history") {
                ServerFunnelHistoryScreen()
            }
            composable("owner_decisions") {
                ru.dmitry.matercontroller.feature.commandcenter.OwnerListScreen(kind = "decisions")
            }
            composable("owner_incidents") {
                ru.dmitry.matercontroller.feature.commandcenter.OwnerListScreen(kind = "incidents")
            }

            // ---- 0.8.0: Reliability Center (read-only; без отправки) ----
            composable("reliability") {
                ru.dmitry.matercontroller.feature.reliability.ReliabilityScreen()
            }

            // ---- 0.8.0: Cost & Capacity Center (read-only; no-spend) ----
            composable("cost_center") {
                ru.dmitry.matercontroller.feature.cost.CostCenterScreen(onBack = { nav.popBackStack() })
            }

            // ---- 0.8.0: Backup & Recovery Center (read-only; non-destructive drill) ----
            composable("backup_center") {
                ru.dmitry.matercontroller.feature.backup.BackupCenterScreen(onBack = { nav.popBackStack() })
            }

            // ---- 0.8.0: FCM Push settings (status + preferences; delivery disabled by default) ----
            composable("push_settings") {
                ru.dmitry.matercontroller.feature.push.PushSettingsScreen(onBack = { nav.popBackStack() })
            }

            // ---- Commercial workflow top-level tabs ----
            composable(Tab.Replies.route) {
                OwnerSimpleSectionScreen(
                    action = "Проверить новые ответы",
                    description = "Ответы только просматриваются. Автоответ не запускается.",
                    primaryLabel = "Открыть почту",
                    onPrimary = { nav.navigate("mail") },
                    secondaryLabel = "История",
                    onSecondary = { nav.navigate("mail_history") },
                    facts = listOf("Новые ответы" to "0", "Автоответ" to "выключен", "Следующий шаг" to "прочитать"),
                    tag = "owner_replies_simple",
                )
            }
            composable(Tab.Deals.route) {
                OwnerSimpleSectionScreen(
                    action = "Продолжить сделку",
                    description = "Сделка начинается после ответа или ручного решения владельца.",
                    primaryLabel = "Выбрать продукт",
                    onPrimary = { nav.navigate("sales/product") },
                    secondaryLabel = "Сформировать КП",
                    onSecondary = { nav.navigate("sales/material") },
                    facts = listOf("Сделки" to "0", "Рабочая база" to "отдельно", "Платежи" to "выключены"),
                    tag = "owner_deals_simple",
                )
            }
            composable("documents") {
                OwnerSimpleSectionScreen(
                    action = "Подготовить КП/PDF",
                    description = "Документ создаётся как черновик. Клиенту ничего не отправляется автоматически.",
                    primaryLabel = "Открыть черновик",
                    onPrimary = { nav.navigate("sales/material") },
                    secondaryLabel = "Счёт",
                    onSecondary = { nav.navigate("sales/invoice") },
                    facts = listOf("Документы" to "черновики", "Отправка" to "ручная", "Платежная ссылка" to "нет"),
                    tag = "owner_documents_simple",
                )
            }
            composable("history") {
                OwnerSimpleSectionScreen(
                    action = "Проверить локальную историю",
                    description = "Здесь фиксируются ручные решения и результаты без записи в рабочую базу.",
                    primaryLabel = "История почты",
                    onPrimary = { nav.navigate("mail_history") },
                    secondaryLabel = "Результат отправки",
                    onSecondary = { nav.navigate("sales/history") },
                    facts = listOf("Фиксация" to "локально", "Рабочая база" to "отдельно", "Отправка" to "по решению"),
                    tag = "owner_history_simple",
                )
            }
            composable("safety") {
                OwnerSimpleSectionScreen(
                    action = "Проверить ограничения",
                    description = "Отправка, платежи и запись в рабочую базу требуют отдельного разрешения.",
                    primaryLabel = "Открыть систему",
                    onPrimary = { nav.navigate(Tab.System.route) },
                    secondaryLabel = "Настройки",
                    onSecondary = { nav.navigate("connection_settings") },
                    facts = listOf("Автоотправка" to "выключена", "Платежи" to "выключены", "Рабочая база" to "отдельно"),
                    tag = "owner_safety_simple",
                )
            }

            // ---- Internal archive: old commercial summary, not exposed from the owner product path ----
            composable("commercial_summary") {
                ru.dmitry.matercontroller.feature.commercial.CommercialSummaryScreen(
                    onBack = { nav.popBackStack() },
                    onOpenLeads = { nav.navigate(Tab.Leads.route) },
                    onOpenReplies = { nav.navigate(Tab.Replies.route) },
                    onOpenCatalog = { nav.navigate("product_catalog") },
                    onOpenCommands = { nav.navigate("commercial_commands") },
                    onOpenDeliveryReview = { nav.navigate("delivery_review") },
                    onOpenConversations = { nav.navigate("conversations") },
                    onOpenTestOnly = { nav.navigate("test_only") },
                    onOpenAgents = { nav.navigate(Tab.Agents.route) },
                    onOpenQueues = { nav.navigate("owner_queues") },
                    onOpenMultichannel = { nav.navigate("multichannel") },
                    onOpenSendReview = { nav.navigate("queue/send-review") },
                    onOpenAiUsage = { nav.navigate("ai_usage") },
                    onOpenSourceRegistry = { nav.navigate("source_registry") },
                    onOpenKnowledge = { nav.navigate("knowledge") },
                    onOpenFirstTouch = { nav.navigate("working_sales_mvp") },
                    onOpenWorkingSalesMvp = { site ->
                        if (site.isBlank()) {
                            nav.navigate("working_sales_mvp")
                        } else {
                            nav.navigate("working_sales_mvp?site=${Uri.encode(site)}")
                        }
                    },
                )
            }
            composable("working_sales_mvp") {
                WorkingSalesMvpScreen(onBack = { nav.popBackStack() }, initialRoute = "lead_queue")
            }
            composable(
                route = "working_sales_mvp?site={site}",
                arguments = listOf(navArgument("site") { type = NavType.StringType; defaultValue = "" }),
            ) { entry ->
                WorkingSalesMvpScreen(
                    onBack = { nav.popBackStack() },
                    initialSite = entry.arguments?.getString("site").orEmpty(),
                )
            }
            composable("sales/lead") {
                WorkingSalesMvpScreen(onBack = { nav.popBackStack() }, initialStep = 1)
            }
            composable("sales/check") {
                WorkingSalesMvpScreen(onBack = { nav.popBackStack() }, initialStep = 2)
            }
            composable("sales/draft") {
                WorkingSalesMvpScreen(onBack = { nav.popBackStack() }, initialStep = 3)
            }
            composable("sales/qa") {
                WorkingSalesMvpScreen(onBack = { nav.popBackStack() }, initialStep = 4)
            }
            composable("sales/readiness") {
                WorkingSalesMvpScreen(onBack = { nav.popBackStack() }, initialStep = 5)
            }
            composable("sales/send") {
                WorkingSalesMvpScreen(onBack = { nav.popBackStack() }, initialRoute = "packet", initialStep = 6)
            }
            composable("sales/history") {
                OwnerSimpleSectionScreen(
                    action = "Зафиксировать результат",
                    description = "Отмечайте результат только после фактического ручного действия владельца.",
                    primaryLabel = "История почты",
                    onPrimary = { nav.navigate("mail_history") },
                    secondaryLabel = "Безопасность",
                    onSecondary = { nav.navigate("safety") },
                    facts = listOf("Статус" to "локально", "Отправка" to "не запускается", "Рабочая база" to "отдельно"),
                    tag = "owner_result_simple",
                )
            }
            composable("sales/product") {
                OwnerSimpleSectionScreen(
                    action = "Выбрать продукт",
                    description = "Выберите, что готовить для клиента: аудит, КП или другой материал.",
                    primaryLabel = "Подготовить материал",
                    onPrimary = { nav.navigate("sales/material") },
                    secondaryLabel = "К сделкам",
                    onSecondary = { nav.navigate(Tab.Deals.route) },
                    facts = listOf("Продукт" to "черновик", "Данные клиента" to "приватно", "Платежи" to "выключены"),
                    tag = "owner_product_simple",
                )
            }
            composable("sales/material") {
                OwnerSimpleSectionScreen(
                    action = "Проверить материал",
                    description = "Материал готовится как черновик. Клиенту ничего не отправляется автоматически.",
                    primaryLabel = "Подготовить счёт",
                    onPrimary = { nav.navigate("sales/invoice") },
                    secondaryLabel = "К документам",
                    onSecondary = { nav.navigate("documents") },
                    facts = listOf("PDF/КП" to "черновик", "Отправка" to "ручная", "Данные" to "приватно"),
                    tag = "owner_material_simple",
                )
            }
            composable("sales/reply_detail") {
                WorkingSalesMvpScreen(onBack = { nav.popBackStack() }, initialRoute = "reply_detail")
            }
            composable("sales/invoice") {
                OwnerSimpleSectionScreen(
                    action = "Проверить черновик счёта",
                    description = "Счёт можно подготовить как черновик. Платёжная ссылка не создаётся.",
                    primaryLabel = "Платёжный gate",
                    onPrimary = { nav.navigate("sales/payment") },
                    secondaryLabel = "К документам",
                    onSecondary = { nav.navigate("documents") },
                    facts = listOf("Счёт" to "черновик", "Платёжная ссылка" to "нет", "Оплата" to "выключена"),
                    tag = "owner_invoice_simple",
                )
            }
            composable("sales/payment") {
                OwnerSimpleSectionScreen(
                    action = "Платежи выключены",
                    description = "Живая оплата подключается только отдельным разрешением после обратной связи клиентов.",
                    primaryLabel = "Открыть безопасность",
                    onPrimary = { nav.navigate("safety") },
                    secondaryLabel = "Настройки",
                    onSecondary = { nav.navigate("connection_settings") },
                    facts = listOf("Живая оплата" to "выключена", "Платёжная ссылка" to "нет", "Следующий шаг" to "отдельное разрешение"),
                    tag = "owner_payment_simple",
                )
            }

            // ---- 0.6.0: multichannel sources/channels (read-only) ----
            composable("multichannel") {
                ru.dmitry.matercontroller.feature.multichannel.MultichannelScreen(onBack = { nav.popBackStack() })
            }

            // ---- RC4: agents + owner queues (read-only) ----
            composable(Tab.Agents.route) {
                ru.dmitry.matercontroller.feature.agents.AgentsScreen(
                    onBack = { nav.navigate(Tab.Today.route) },
                    showBack = false,
                    onOpenQueues = { nav.navigate("owner_queues") },
                    onOpenAiUsage = { nav.navigate("ai_usage") },
                    onOpenCost = { nav.navigate("cost_center") },
                    onOpenKnowledge = { nav.navigate("knowledge") },
                    onOpenFirstTouch = { nav.navigate("working_sales_mvp") },
                )
            }

            // ---- 0.6.0-rc4: AI cost dashboard (read-only) ----
            composable("ai_usage") {
                ru.dmitry.matercontroller.feature.ai.AiUsageScreen(onBack = { nav.popBackStack() })
            }

            // ---- 0.6.0-rc4: authoritative source registry (read-only) ----
            composable("source_registry") {
                ru.dmitry.matercontroller.feature.sources.SourceRegistryScreen(onBack = { nav.popBackStack() })
            }

            // ---- 0.6.0-rc5: source telemetry (read-only) ----
            composable("source_telemetry") {
                ru.dmitry.matercontroller.feature.sources.SourceTelemetryScreen(onBack = { nav.popBackStack() })
            }

            // ---- 0.6.0-rc5: owner limits & automation (owner command; no send) ----
            composable("owner_settings") {
                ru.dmitry.matercontroller.feature.ownersettings.OwnerSettingsScreen(onBack = { nav.popBackStack() })
            }

            // ---- 0.6.0-rc5: domain reservoir + funnel + capacity (read-only) ----
            composable("reservoir") {
                ru.dmitry.matercontroller.feature.reservoir.ReservoirScreen(onBack = { nav.popBackStack() })
            }

            // ---- 0.6.0-rc4: knowledge radar (read-only; no auto actions) ----
            composable("knowledge") {
                ru.dmitry.matercontroller.feature.knowledge.KnowledgeHomeScreen(
                    onBack = { nav.popBackStack() },
                    onOpenDigest = { window -> nav.navigate("knowledge/digest/$window") },
                    onOpenSources = { nav.navigate("knowledge/sources") },
                    onOpenStatus = { nav.navigate("knowledge/status") },
                )
            }
            // ---- Internal archive: old first-touch strategist, not exposed from the owner product path ----
            composable("first_touch") {
                ru.dmitry.matercontroller.feature.firsttouch.FirstTouchScreen(onBack = { nav.popBackStack() })
            }
            composable("knowledge/digest/{window}") { entry ->
                ru.dmitry.matercontroller.feature.knowledge.KnowledgeDigestScreen(
                    window = entry.arguments?.getString("window") ?: "urgent",
                    onBack = { nav.popBackStack() },
                )
            }
            composable("knowledge/sources") {
                ru.dmitry.matercontroller.feature.knowledge.KnowledgeSourcesScreen(onBack = { nav.popBackStack() })
            }
            composable("knowledge/status") {
                ru.dmitry.matercontroller.feature.knowledge.KnowledgeStatusScreen(onBack = { nav.popBackStack() })
            }
            composable("owner_queues") {
                ru.dmitry.matercontroller.feature.agents.OwnerQueuesScreen(
                    onBack = { nav.popBackStack() },
                    onOpenSendReview = { nav.navigate("queue/send-review") },
                    onOpenQueue = { key -> nav.navigate("queue/$key") },
                )
            }
            // ---- 0.6.0-rc2: offer review (send-review queue → real offers, no send) ----
            composable("queue/send-review") {
                ru.dmitry.matercontroller.feature.commercial.OfferReviewListScreen(
                    onBack = { nav.popBackStack() },
                    onOpenOffer = { offerId -> nav.navigate("offer/$offerId") },
                )
            }
            composable("offer/{offerId}") { entry ->
                ru.dmitry.matercontroller.feature.commercial.OfferDetailScreen(
                    offerId = entry.arguments?.getString("offerId") ?: "",
                    onBack = { nav.popBackStack() },
                )
            }
            // ---- 0.6.0-rc2: generic owner queues (count + explanation lists) ----
            composable("queue/{queueKey}") { entry ->
                ru.dmitry.matercontroller.feature.agents.QueueDetailScreen(
                    queueKey = entry.arguments?.getString("queueKey") ?: "awaiting-reply",
                    onBack = { nav.popBackStack() },
                )
            }

            // ---- transport-readiness (RC3): read-only screens ----
            composable("delivery_review") {
                ru.dmitry.matercontroller.feature.transport.DeliveryReviewScreen(onBack = { nav.popBackStack() })
            }
            composable("conversations") {
                ru.dmitry.matercontroller.feature.transport.ConversationsScreen(onBack = { nav.popBackStack() })
            }
            composable("test_only") {
                ru.dmitry.matercontroller.feature.transport.TestOnlyScreen(onBack = { nav.popBackStack() })
            }

            // ---- Gate C1-A: owner command center (no send) ----
            composable("commercial_commands") {
                ru.dmitry.matercontroller.feature.commercial.CommandCenterScreen(onBack = { nav.popBackStack() })
            }

            // ---- Gate C1-A: product catalog (read-only) ----
            composable("product_catalog") {
                ru.dmitry.matercontroller.feature.catalog.CatalogListScreen(
                    onBack = { nav.popBackStack() },
                    onOpenProduct = { id -> nav.navigate("product_detail/$id") },
                )
            }
            composable("product_detail/{id}") {
                ru.dmitry.matercontroller.feature.catalog.ProductDetailScreen(onBack = { nav.popBackStack() })
            }

            // ---- Лиды (pipeline queues + mini audit) ----
            composable(Tab.Leads.route) {
                OutreachQueueScreen(onOpenManualWebsite = { nav.navigate("working_sales_mvp") })
            }
            composable("pipeline_queue/{queue}") { entry ->
                PipelineQueueScreen(
                    queueKey = entry.arguments?.getString("queue") ?: "STAGING",
                    onBack = { nav.popBackStack() },
                )
            }

            // ---- Решения (approval domain) ----
            composable(Tab.Evidence.route) {
                ApprovalsHomeScreen(
                    onOpenQueue = { queue -> nav.navigate("approval_list/$queue") },
                    onOpenCommandCenter = { nav.navigate("command_center") },
                    onOpenOwnerDecisions = { nav.navigate("owner_decisions") },
                    onOpenIncidents = { nav.navigate("owner_incidents") },
                )
            }
            composable("approval_list/{queue}") { entry ->
                ApprovalListScreen(
                    queueKey = entry.arguments?.getString("queue") ?: "audits",
                    onOpenItem = { q, id -> nav.navigate("approval_detail/$q/$id") },
                    onBack = { nav.popBackStack() },
                )
            }
            composable("approval_detail/{queue}/{id}") { entry ->
                ApprovalDetailScreen(
                    queueKey = entry.arguments?.getString("queue") ?: "audits",
                    leadId = entry.arguments?.getString("id") ?: "",
                    onBack = { nav.popBackStack() },
                )
            }

            // ---- Система (operations + connection settings) ----
            composable(Tab.System.route) {
                OperationsHomeScreen(
                    onOpen = { section -> nav.navigate("ops/$section") },
                    onOpenConnection = { nav.navigate("connection_settings") },
                    onOpenKnowledge = { nav.navigate("knowledge") },
                    onOpenFirstTouch = { nav.navigate("working_sales_mvp") },
                    onOpenAiUsage = { nav.navigate("ai_usage") },
                    onOpenSourceRegistry = { nav.navigate("source_registry") },
                    onOpenSourceTelemetry = { nav.navigate("source_telemetry") },
                    onOpenOwnerSettings = { nav.navigate("owner_settings") },
                    onOpenReservoir = { nav.navigate("reservoir") },
                    onOpenReliability = { nav.navigate("reliability") },
                    onOpenCost = { nav.navigate("cost_center") },
                    onOpenBackup = { nav.navigate("backup_center") },
                    onOpenPush = { nav.navigate("push_settings") },
                )
            }
            composable("ops/{section}") { entry ->
                OperationsDetailScreen(
                    section = entry.arguments?.getString("section") ?: "automation",
                    onBack = { nav.popBackStack() },
                )
            }
            // DEF-V3-004: AutomationScreen was defined but never wired. Reachable via ops_card_automation.
            composable("automation") {
                ru.dmitry.matercontroller.feature.automation.AutomationScreen()
            }
            composable("connection_settings") { SettingsScreen(onUnpair = onUnpair) }

            // ---- preserved deep routes (Мини-аудит working set) ----
            composable("mini_audit") {
                MiniAuditHomeScreen(
                    onOpenBucket = { bucket -> nav.navigate("ma_list/$bucket") },
                    onOpenLead = { id -> nav.navigate("ma_lead/$id") },
                    onBack = { nav.popBackStack() },
                )
            }
            composable("ma_list/{bucket}") { entry ->
                MiniAuditListScreen(
                    bucket = entry.arguments?.getString("bucket") ?: "all",
                    onOpenLead = { id -> nav.navigate("ma_lead/$id") },
                    onBack = { nav.popBackStack() },
                )
            }
            composable("ma_lead/{id}") { entry ->
                LeadDetailScreen(
                    leadId = entry.arguments?.getString("id") ?: "",
                    onBack = { nav.popBackStack() },
                )
            }
        }
    }
}

}

@Composable
private fun OwnerSimpleSectionScreen(
    action: String,
    description: String,
    primaryLabel: String,
    onPrimary: () -> Unit,
    secondaryLabel: String,
    onSecondary: () -> Unit,
    facts: List<Pair<String, String>>,
    tag: String,
) {
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
            .testTag(tag),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        ElevatedCard(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Следующее действие", style = MaterialTheme.typography.titleLarge)
                Text(action, style = MaterialTheme.typography.headlineSmall)
                Text(description, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Button(onClick = onPrimary, modifier = Modifier.fillMaxWidth().height(56.dp).testTag("${tag}_primary")) {
                    Text(primaryLabel)
                }
                OutlinedButton(onClick = onSecondary, modifier = Modifier.fillMaxWidth().height(52.dp).testTag("${tag}_secondary")) {
                    Text(secondaryLabel)
                }
            }
        }
        ElevatedCard(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Кратко", style = MaterialTheme.typography.titleMedium)
                facts.forEach { (label, value) ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(label, style = MaterialTheme.typography.bodyMedium)
                        Text(value, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }
        Text(
            "Внешние действия выполняются только после отдельного подтверждения владельца.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(24.dp))
    }
}
