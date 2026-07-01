package ru.dmitry.matercontroller.feature.ai

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ru.dmitry.matercontroller.core.ui.ErrorState
import ru.dmitry.matercontroller.core.ui.LoadingState
import ru.dmitry.matercontroller.core.ui.OfflineBanner
import ru.dmitry.matercontroller.core.ui.OwnerLocalization

/**
 * «Расход ИИ» — read-only AI cost dashboard. Calculated units are an internal unit, never rubles.
 * Money is shown ONLY when estimated_money_class is a real class; UNKNOWN/null → «нет данных».
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AiUsageScreen(onBack: () -> Unit, vm: AiUsageViewModel = hiltViewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    Scaffold(topBar = {
        TopAppBar(title = { Text("Расход ИИ") },
            navigationIcon = { IconButton(onClick = onBack, modifier = Modifier.testTag("screen.ai.control.back")) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
            actions = { TextButton(onClick = vm::refresh, modifier = Modifier.testTag("screen.ai.control.refresh")) { Text("Обновить") } })
    }) { pad ->
        when {
            ui.loading -> LoadingState(Modifier.padding(pad))
            ui.error != null && ui.usage == null -> ErrorState(ui.error!!, onRetry = vm::refresh, modifier = Modifier.padding(pad))
            else -> Column(Modifier.padding(pad).padding(16.dp).verticalScroll(rememberScrollState()).testTag("ai_usage")) {
                if (ui.offline) { OfflineBanner(ui.cachedAt); Spacer(Modifier.height(8.dp)) }
                val u = ui.usage

                Text("Итоги расхода", style = MaterialTheme.typography.titleMedium)
                Kv("Всего расчётных единиц", OwnerLocalization.formatCalculatedUnits(u?.total_calculated_units))
                // RC6 (defect E): raw tokens may be "UNKNOWN" — показываем «неизвестно», не 0.
                Kv("Входящий объём", OwnerLocalization.renderRawTokensRu(u?.raw_input_tokens))
                Kv("Исходящий объём", OwnerLocalization.renderRawTokensRu(u?.raw_output_tokens))
                u?.cached_input_tokens?.let { Kv("Входящий объём из кэша", OwnerLocalization.renderRawTokensRu(it)) }
                u?.provider_calculated_units?.let { Kv("Расчётные единицы провайдера", OwnerLocalization.formatCalculatedUnits(it)) }
                Kv("Вызовов провайдера", OwnerLocalization.formatCalculatedUnits(u?.provider_calls))
                Kv("Задач без ИИ", OwnerLocalization.formatCalculatedUnits(u?.no_llm_tasks))
                Kv("Попаданий в кэш", OwnerLocalization.formatCalculatedUnits(u?.cache_hits))
                Kv("Переиспользований артефактов", OwnerLocalization.formatCalculatedUnits(u?.artifact_reuse))
                Kv("Эскалаций", OwnerLocalization.formatCalculatedUnits(u?.escalations))
                u?.estimated_records?.let { Kv("Оценочных записей", OwnerLocalization.renderCounterRu(it)) }
                u?.entries?.let { Kv("Записей учёта", OwnerLocalization.formatCalculatedUnits(it)) }

                // Money: shown separately and ONLY when a real money class is present.
                Spacer(Modifier.height(8.dp))
                Text("Денежная оценка", style = MaterialTheme.typography.titleMedium)
                Kv("Оценка стоимости", OwnerLocalization.renderAiMoneyRu(u?.estimated_money_cost, u?.estimated_money_class))
                Text(
                    "Расчётные единицы — это внутренняя единица учёта, а не рубли.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary,
                )

                ui.cumulative?.let { c ->
                    Spacer(Modifier.height(8.dp))
                    Kv("Накопленные расчётные единицы", OwnerLocalization.formatCalculatedUnits(c.cumulative_calculated_units))
                }

                // RC5: provenance / reconciliation — where the known usage came from. raw tokens may
                // be "UNKNOWN" and are rendered «неизвестно», never a false 0.
                ui.reconciliation?.let { r ->
                    Spacer(Modifier.height(12.dp))
                    Text("Происхождение расхода", style = MaterialTheme.typography.titleMedium)
                    Kv("После включения журнала", OwnerLocalization.formatCalculatedUnits(r.since_persistent_ledger))
                    Kv("Подтверждённая история до журнала", OwnerLocalization.formatCalculatedUnits(r.confirmed_pre_ledger_history))
                    Kv("Общий известный расход", OwnerLocalization.formatCalculatedUnits(r.total_known_usage))
                    Kv("Фактические входящие токены", OwnerLocalization.renderRawTokensRu(r.raw_input_tokens))
                    Kv("Фактические исходящие токены", OwnerLocalization.renderRawTokensRu(r.raw_output_tokens))
                    Kv("Вызовы провайдера", OwnerLocalization.formatCalculatedUnits(r.provider_calls))
                    Kv("Вызовы провайдера до журнала", OwnerLocalization.renderRawTokensRu(r.pre_ledger_provider_calls))

                    Spacer(Modifier.height(6.dp))
                    Text("Записи по источникам", style = MaterialTheme.typography.titleSmall)
                    Kv("Фактические записи", OwnerLocalization.renderCounterRu(r.actual_records))
                    Kv("Оценочные записи", OwnerLocalization.renderCounterRu(r.estimated_records))
                    Kv("Записи без ИИ", OwnerLocalization.renderCounterRu(r.no_llm_records))
                    Kv("Исторические записи", OwnerLocalization.renderCounterRu(r.historical_records))
                    r.by_source_units?.let { bs ->
                        Spacer(Modifier.height(4.dp))
                        Text("Единицы по происхождению", style = MaterialTheme.typography.titleSmall)
                        OwnerLocalization.usageBySourceLines(bs).forEach { (label, value) ->
                            Kv(label, OwnerLocalization.renderCounterRu(value))
                        }
                    }
                    r.false_zeros?.let { Kv("Ложные нули устранено", OwnerLocalization.formatCalculatedUnits(it)) }
                    if (OwnerLocalization.hasValue(r.evidence_reference)) {
                        Kv("Источник доказательств", r.evidence_reference!!)
                    }
                }

                Breakdown("По провайдерам", u?.by_provider)
                Breakdown("По моделям", u?.by_model)
                Breakdown("По агентам", u?.by_agent, roleMap = true)
                Breakdown("По типам задач", u?.by_task_type)
                Breakdown("По лидам", u?.by_lead, companyMap = true)

                ui.providers?.let { reg ->
                    if (reg.items.isNotEmpty()) {
                        Spacer(Modifier.height(12.dp))
                        Text("Провайдеры", style = MaterialTheme.typography.titleMedium)
                        reg.items.forEach { p ->
                            Spacer(Modifier.height(4.dp))
                            Text(p.provider_id ?: "провайдер", style = MaterialTheme.typography.titleSmall)
                            Kv("Состояние", OwnerLocalization.renderProviderStateRu(p.state))
                            Kv("Включён", OwnerLocalization.renderSourceEnabledRu(p.enabled))
                            Kv("Ключ", OwnerLocalization.renderKeyPresenceRu(p.key_presence))
                            Kv("Класс стоимости", OwnerLocalization.renderCostClassRu(p.cost_class))
                            if (p.models.isNotEmpty()) Kv("Модели", p.models.joinToString(", "))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Breakdown(title: String, map: Map<String, Long>?, roleMap: Boolean = false, companyMap: Boolean = false) {
    if (map.isNullOrEmpty()) return
    Spacer(Modifier.height(8.dp))
    Text(title, style = MaterialTheme.typography.titleSmall)
    map.entries.sortedByDescending { it.value }.forEach { (k, v) ->
        val label = when {
            roleMap -> OwnerLocalization.renderAgentRoleRu(k)
            companyMap -> OwnerLocalization.companyFromLeadId(k) ?: k
            else -> k
        }
        Kv(label, OwnerLocalization.formatCalculatedUnits(v))
    }
}

@Composable
private fun Kv(k: String, v: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
        Text("$k: ", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
        Text(v, style = MaterialTheme.typography.bodySmall)
    }
}
