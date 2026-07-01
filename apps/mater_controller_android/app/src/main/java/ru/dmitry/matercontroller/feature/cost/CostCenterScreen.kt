package ru.dmitry.matercontroller.feature.cost

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import ru.dmitry.matercontroller.core.data.DataResult
import ru.dmitry.matercontroller.core.data.MaterRepository
import ru.dmitry.matercontroller.core.model.CostOverview
import ru.dmitry.matercontroller.core.ui.ContractOnlyPanel
import ru.dmitry.matercontroller.core.ui.EmptyState
import ru.dmitry.matercontroller.core.ui.ErrorState
import ru.dmitry.matercontroller.core.ui.LoadingState
import ru.dmitry.matercontroller.core.ui.OfflineBanner
import ru.dmitry.matercontroller.core.ui.OwnerSafetyInvariant
import ru.dmitry.matercontroller.core.ui.OwnerStatusTone
import ru.dmitry.matercontroller.core.ui.PilotSafetyChips
import ru.dmitry.matercontroller.core.ui.SafetyInvariantPanel
import javax.inject.Inject

/**
 * Cost & Capacity Center (0.8.0). Read-only owner view of AI usage budget state,
 * provider/model/agent breakdown and provider/source capacity. Calculated units are
 * an internal unit, never rubles. Money is shown only when journaled; otherwise
 * «неизвестно». Never spends; paid sources and autosend stay OFF server-side.
 */
data class CostUi(
    val loading: Boolean = true,
    val error: String? = null,
    val data: CostOverview? = null,
    val offline: Boolean = false,
    val cachedAt: Long? = null,
)

@HiltViewModel
class CostViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(CostUi())
    val ui: StateFlow<CostUi> = _ui.asStateFlow()

    init { refresh() }

    fun refresh() {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val r = repo.costOverview()) {
                is DataResult.Success -> _ui.update { it.copy(loading = false, data = r.data, offline = r.fromCache, cachedAt = r.cachedAt, error = null) }
                is DataResult.Error -> _ui.update { it.copy(loading = false, error = r.message) }
            }
        }
    }
}

// Render a number-or-"UNKNOWN" field honestly in Russian.
private fun JsonElement?.numOrUnknown(): String {
    val p = this as? JsonPrimitive ?: return "неизвестно"
    return if (p.isString) (if (p.content == "UNKNOWN") "неизвестно" else p.content) else p.content
}

private fun JsonElement?.boolRu(): String {
    val p = this as? JsonPrimitive ?: return "неизвестно"
    return when (p.content) { "true" -> "да"; "false" -> "нет"; "UNKNOWN" -> "неизвестно"; else -> p.content }
}

@Composable
private fun budgetColor(state: String?): Color = when ((state ?: "").uppercase()) {
    "OK" -> MaterialTheme.colorScheme.primary
    "WARNING" -> MaterialTheme.colorScheme.tertiary
    "EXCEEDED" -> MaterialTheme.colorScheme.error
    else -> MaterialTheme.colorScheme.outline
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CostCenterScreen(onBack: () -> Unit, onOpenUsageDetail: () -> Unit = {}, vm: CostViewModel = hiltViewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    Scaffold(topBar = {
        TopAppBar(
            title = { Text("Расходы и лимиты") },
            navigationIcon = { IconButton(onClick = onBack, modifier = Modifier.testTag("screen.cost.control.back")) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
            actions = { TextButton(onClick = vm::refresh, modifier = Modifier.testTag("screen.cost.control.refresh")) { Text("Обновить") } },
        )
    }) { pad ->
        when {
            ui.loading -> LoadingState(Modifier.padding(pad))
            ui.error != null && ui.data == null -> ErrorState(ui.error!!, onRetry = vm::refresh, modifier = Modifier.padding(pad))
            ui.data == null -> EmptyState(
                "Нет данных по расходам",
                modifier = Modifier.padding(pad),
                nextAction = "Это не считается нулевым расходом. Нужен живой ответ или сохранённый снимок.",
            )
            else -> {
                val d = ui.data!!
                Column(Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).testTag("cost_center_screen")) {
                    if (ui.offline) OfflineBanner(ui.cachedAt)
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Расходы", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.testTag("pilot_costs"))
                        Text("Использование помощников, бюджет, дневной лимит и тренд. Платёжный провайдер не вызывается.", style = MaterialTheme.typography.bodySmall)
                        PilotSafetyChips(tag = "pilot_costs_safety_chips")
                    }
                    SafetyInvariantPanel(
                        title = "Деньги и безопасность",
                        subtitle = "Этот экран показывает расход и бюджет. Он не вызывает платёжного провайдера и не выполняет списания.",
                        items = listOf(
                            OwnerSafetyInvariant("Платежи", if (d.performs_payment) "включены" else "ВЫКЛ", if (d.performs_payment) OwnerStatusTone.Critical else OwnerStatusTone.Safe, "Если включатся, это P0 для отдельного контроля владельца."),
                            OwnerSafetyInvariant("Отправка", if (d.sends) "включена" else "ВЫКЛ", if (d.sends) OwnerStatusTone.Critical else OwnerStatusTone.NoSend, "Расходы не означают клиентскую отправку."),
                            OwnerSafetyInvariant("Бюджет", d.budget?.state_ru ?: "нет живых данных", if ((d.budget?.state ?: "").uppercase() == "EXCEEDED") OwnerStatusTone.Critical else OwnerStatusTone.Attention, "Нет живого бюджета означает «нет данных», не зелёный статус."),
                            OwnerSafetyInvariant("Запись в рабочую базу", "ВЫКЛ", OwnerStatusTone.Safe, "Центр расходов читает снимок и не меняет рабочую базу."),
                        ),
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                        tag = "cost_safety_summary",
                    )

                    // Budget card
                    d.budget?.let { b ->
                        Card(Modifier.fillMaxWidth().padding(12.dp)) {
                            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text("Дневной бюджет (расчётные единицы)", style = MaterialTheme.typography.labelMedium)
                                Text(b.state_ru ?: "—", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = budgetColor(b.state))
                                val p = b.percent_used.numOrUnknown()
                                Text("Использовано: ${b.used_calculated_units} из ${b.daily_calculated_units_limit.numOrUnknown()} (${if (p == "неизвестно") p else "$p%"})", style = MaterialTheme.typography.bodyMedium)
                                Divider(Modifier.padding(vertical = 2.dp))
                                Kv("Платные источники включены", b.paid_sources_enabled.boolRu())
                                Kv("Стратегия источников", b.source_strategy.numOrUnknown())
                            }
                        }
                    }

                    // Usage totals
                    SectionTitle("Расход")
                    Kv("Всего расчётных единиц", d.total_calculated_units.toString())
                    Kv("Вызовов провайдера", d.provider_calls.numOrUnknown())
                    Kv("Задач без ИИ", d.no_llm_tasks.toString())
                    Kv("Попаданий в кэш", d.cache_hits.toString())
                    Kv("Эскалаций", d.escalations.toString())

                    // Money — honest UNKNOWN
                    SectionTitle("Денежная оценка")
                    Kv("Стоимость", if (d.estimated_money_class == "ESTIMATE") d.estimated_money_cost.numOrUnknown() else "неизвестно")
                    d.money_note_ru?.let { Text(it, Modifier.padding(horizontal = 16.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary) }

                    // Capacity
                    d.capacity?.let { c ->
                        SectionTitle("Мощности")
                        Kv("Активных платных провайдеров", c.active_paid_providers.numOrUnknown())
                        Kv("Активных платных источников", c.paid_sources_active.numOrUnknown())
                    }

                    // Breakdown
                    Breakdown("По провайдерам", d.by_provider)
                    Breakdown("По моделям", d.by_model)
                    Breakdown("По агентам", d.by_agent)
                    Breakdown("По типам задач", d.by_task_type)

                    // History (confirmed pre-ledger)
                    d.history?.let { h ->
                        SectionTitle("История (до журнала)")
                        Kv("Подтверждённые единицы до журнала", h.confirmed_pre_ledger_units.numOrUnknown())
                        Kv("Всего известных единиц", h.total_known_units.numOrUnknown())
                        h.evidence_reference?.let { Kv("Источник доказательств", it) }
                    }

                    ContractOnlyPanel(
                        title = "Расходы только как контракт",
                        items = listOf(
                            "Оплата провайдерам: не выполняется из Android",
                            "Платные источники: только статус/лимит, включение требует контроля владельца",
                            "CRM, платежи и почта: только после отдельного разрешения владельца",
                            "Денежная оценка без доказательств показывается как «неизвестно», не как 0",
                        ),
                        modifier = Modifier.padding(horizontal = 12.dp),
                        tag = "cost_contract_only",
                    )
                    TextButton(onClick = onOpenUsageDetail, modifier = Modifier.padding(horizontal = 8.dp, vertical = 8.dp)) { Text("Подробный учёт ИИ") }
                    Spacer(Modifier.height(24.dp))
                }
            }
        }
    }
}

@Composable
private fun Breakdown(title: String, map: Map<String, Long>?) {
    if (map.isNullOrEmpty()) return
    SectionTitle(title)
    map.entries.sortedByDescending { it.value }.forEach { (k, v) -> Kv(k, v.toString()) }
}

@Composable
private fun SectionTitle(t: String) {
    Text(t, Modifier.padding(start = 16.dp, top = 16.dp, bottom = 4.dp), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
}

@Composable
private fun Kv(k: String, v: String) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 2.dp)) {
        Text("$k: ", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
        Text(v, style = MaterialTheme.typography.bodySmall)
    }
}
