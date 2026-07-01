package ru.dmitry.matercontroller.feature.sources

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ru.dmitry.matercontroller.core.model.SourceTelemetryItem
import ru.dmitry.matercontroller.core.ui.EmptyState
import ru.dmitry.matercontroller.core.ui.ErrorState
import ru.dmitry.matercontroller.core.ui.LoadingState
import ru.dmitry.matercontroller.core.ui.OfflineBanner
import ru.dmitry.matercontroller.core.ui.OwnerLocalization

/**
 * «Телеметрия источников» — authoritative GET /sources/telemetry. Read-only. Shows health_state
 * (localized), disabled_reason, cost_class (бесплатный/платный), last success/failure, discovery /
 * promotion / rejection counters (or «нет данных» only when truly null and not disabled),
 * never_run_note. Filters: активные / отключённые / нужны credentials / бесплатные / платные.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SourceTelemetryScreen(onBack: () -> Unit, vm: SourceTelemetryViewModel = hiltViewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    Scaffold(topBar = {
        TopAppBar(title = { Text("Телеметрия источников") },
            navigationIcon = { IconButton(onClick = onBack, modifier = Modifier.testTag("screen.sources.control.back")) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
            actions = { TextButton(onClick = vm::refresh, modifier = Modifier.testTag("screen.sources.control.refresh")) { Text("Обновить") } })
    }) { pad ->
        when {
            ui.loading -> LoadingState(Modifier.padding(pad))
            ui.error != null && ui.items.isEmpty() -> ErrorState(ui.error!!, onRetry = vm::refresh, modifier = Modifier.padding(pad))
            else -> Column(Modifier.padding(pad).fillMaxSize().testTag("source_telemetry")) {
                if (ui.offline) OfflineBanner(ui.cachedAt)
                FilterRow(ui.filter, vm::setFilter)
                val items = ui.filtered()
                if (items.isEmpty()) {
                    EmptyState("Нет источников по выбранному фильтру")
                } else {
                    Column(Modifier.fillMaxSize().padding(horizontal = 12.dp).verticalScroll(rememberScrollState())) {
                        items.forEach { TelemetryCard(it) }
                        Spacer(Modifier.height(12.dp))
                        Text("Только для чтения. Исходящие действия и отправка недоступны.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.height(12.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun FilterRow(active: TelemetryFilter, onSelect: (TelemetryFilter) -> Unit) {
    val filters = listOf(
        TelemetryFilter.ALL to "Все",
        TelemetryFilter.ENABLED to "Активные",
        TelemetryFilter.DISABLED to "Отключённые",
        TelemetryFilter.NEEDS_CREDENTIALS to "Нужны учётные данные",
        TelemetryFilter.FREE to "Бесплатные",
        TelemetryFilter.PAID to "Платные",
    )
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(8.dp)) {
        filters.forEach { (f, label) ->
            FilterChip(
                selected = active == f,
                onClick = { onSelect(f) },
                label = { Text(label) },
                modifier = Modifier.padding(horizontal = 4.dp).testTag("tel_filter_${f.name}"),
            )
        }
    }
}

@Composable
private fun TelemetryCard(t: SourceTelemetryItem) {
    val title = if (OwnerLocalization.hasValue(t.display_name)) t.display_name!! else (t.source_id ?: "источник")
    val disabled = t.enabled == false
    Card(Modifier.fillMaxWidth().padding(vertical = 6.dp).testTag("tel_card_${t.source_id}")) {
        Column(Modifier.padding(14.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            if (OwnerLocalization.hasValue(t.source_id)) Kv("ID источника", t.source_id!!)
            if (OwnerLocalization.hasValue(t.source_type)) Kv("Тип", t.source_type!!)
            Kv("Состояние", OwnerLocalization.renderHealthStateRu(t.health_state))
            Kv("Включён", OwnerLocalization.renderSourceEnabledRu(t.enabled))
            Kv("Учётные данные", OwnerLocalization.renderCredentialStateRu(t.credential_state))
            Kv("Класс стоимости", OwnerLocalization.renderCostClassBinaryRu(t.cost_class))
            if (OwnerLocalization.hasValue(t.disabled_reason)) Kv("Причина отключения", t.disabled_reason!!)
            Kv("Последняя проверка", OwnerLocalization.renderDateRu(t.last_check_at) ?: "нет данных")
            Kv("Последний успех", OwnerLocalization.renderDateRu(t.last_success_at) ?: "нет данных")
            Kv("Последняя ошибка", OwnerLocalization.renderDateRu(t.last_failure_at) ?: "нет данных")
            if (OwnerLocalization.hasValue(t.last_error_category)) Kv("Категория ошибки", OwnerLocalization.renderLastErrorCategoryRu(t.last_error_category))

            Spacer(Modifier.height(4.dp))
            Kv("Найдено записей (всего)", OwnerLocalization.renderCounterRu(t.records_discovered_total, disabled))
            Kv("Найдено за последний запуск", OwnerLocalization.renderCounterRu(t.records_discovered_last_run, disabled))
            Kv("Принято записей (всего)", OwnerLocalization.renderCounterRu(t.records_promoted_total, disabled))
            Kv("Отклонено записей (всего)", OwnerLocalization.renderCounterRu(t.records_rejected_total, disabled))

            val caps = buildList {
                if (t.inbound_capability == true) add("приём входящих")
                if (t.discovery_capability == true) add("поиск лидов")
                if (t.outbound_capability == true) add("исходящие")
            }
            if (caps.isNotEmpty()) Kv("Возможности", caps.joinToString(", "))
            if (OwnerLocalization.hasValue(t.never_run_note)) {
                Spacer(Modifier.height(4.dp))
                Text(t.never_run_note!!, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
            }
        }
    }
}

@Composable
private fun Kv(k: String, v: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
        Text("$k: ", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
        Text(v, style = MaterialTheme.typography.bodySmall)
    }
}
