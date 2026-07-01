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
import ru.dmitry.matercontroller.core.model.SourceHealthItem
import ru.dmitry.matercontroller.core.model.SourceItem
import ru.dmitry.matercontroller.core.ui.EmptyState
import ru.dmitry.matercontroller.core.ui.ErrorState
import ru.dmitry.matercontroller.core.ui.LoadingState
import ru.dmitry.matercontroller.core.ui.OfflineBanner
import ru.dmitry.matercontroller.core.ui.OwnerLocalization
import ru.dmitry.matercontroller.core.ui.PilotSafetyChips

/**
 * «Реестр источников» — authoritative source registry from /sources + /sources/health. Read-only.
 * Shows id, name, type, enabled/disabled, credential state, health, last success/failure, records
 * discovered/promoted, reason disabled, inbound/discovery capability, cost class. Filters applied at
 * render time; canonical state never mutated.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SourceRegistryScreen(onBack: () -> Unit, vm: SourceRegistryViewModel = hiltViewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    Scaffold(topBar = {
        TopAppBar(title = { Text("Реестр источников") },
            navigationIcon = { IconButton(onClick = onBack, modifier = Modifier.testTag("screen.sources.control.back")) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
            actions = { TextButton(onClick = vm::refresh, modifier = Modifier.testTag("screen.sources.control.refresh")) { Text("Обновить") } })
    }) { pad ->
        when {
            ui.loading -> LoadingState(Modifier.padding(pad))
            ui.error != null && ui.sources.isEmpty() -> ErrorState(ui.error!!, onRetry = vm::refresh, modifier = Modifier.padding(pad))
            else -> Column(Modifier.padding(pad).fillMaxSize().testTag("source_registry")) {
                if (ui.offline) OfflineBanner(ui.cachedAt)
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Источники", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.testTag("pilot_sources"))
                    Text("Реестр источников лидов: доступность, стоимость и качество данных. Только просмотр.", style = MaterialTheme.typography.bodySmall)
                    PilotSafetyChips(tag = "pilot_sources_safety_chips")
                }
                FilterRow(ui.filter, vm::setFilter)
                val items = ui.filtered()
                if (items.isEmpty()) {
                    EmptyState("Нет источников по выбранному фильтру")
                } else {
                    Column(Modifier.fillMaxSize().padding(horizontal = 12.dp).verticalScroll(rememberScrollState())) {
                        items.forEach { src -> SourceCard(src, ui.health[src.source_id]) }
                        Spacer(Modifier.height(12.dp))
                        Text("Реестр только для чтения. Исходящие действия и отправка недоступны.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.height(12.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun FilterRow(active: SourceFilter, onSelect: (SourceFilter) -> Unit) {
    val filters = listOf(
        SourceFilter.ALL to "Все",
        SourceFilter.ENABLED to "Активные",
        SourceFilter.DISABLED to "Отключённые",
        SourceFilter.NEEDS_CREDENTIALS to "Нужны учётные данные",
        SourceFilter.UNHEALTHY to "Проблемные",
        SourceFilter.INBOUND to "Входящие",
        SourceFilter.DISCOVERY to "Поиск лидов",
        SourceFilter.PAID to "Платные",
        SourceFilter.FREE to "Бесплатные",
    )
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(8.dp)) {
        filters.forEach { (f, label) ->
            FilterChip(
                selected = active == f,
                onClick = { onSelect(f) },
                label = { Text(label) },
                modifier = Modifier.padding(horizontal = 4.dp).testTag("src_filter_${f.name}"),
            )
        }
    }
}

@Composable
private fun SourceCard(src: SourceItem, h: SourceHealthItem?) {
    val title = OwnerLocalization.run {
        if (hasValue(src.name)) src.name!! else if (hasValue(src.display_name)) src.display_name else src.source_id
    }
    Card(Modifier.fillMaxWidth().padding(vertical = 6.dp).testTag("src_card_${src.source_id}")) {
        Column(Modifier.padding(14.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Kv("Код источника", src.source_id)
            if (OwnerLocalization.hasValue(src.source_type)) Kv("Тип", src.source_type)
            Kv("Состояние", OwnerLocalization.renderSourceEnabledRu(src.enabled ?: (OwnerLocalization.normStatus(src.status) == "active")))
            Kv("Учётные данные", OwnerLocalization.renderCredentialStateRu(src.credential_status))
            Kv("Здоровье", OwnerLocalization.renderSourceHealthRu(h?.health ?: h?.status))
            Kv("Класс стоимости", OwnerLocalization.renderCostClassRu(src.cost_class))
            Kv("Последний успех", OwnerLocalization.renderDateRu(h?.last_success ?: h?.last_run) ?: "нет данных")
            Kv("Последняя ошибка", OwnerLocalization.renderDateRu(h?.last_failure) ?: "нет данных")
            Kv("Найдено записей", (h?.records_discovered ?: h?.candidates)?.toString() ?: "нет данных")
            Kv("Принято записей", (h?.records_promoted ?: h?.verified)?.toString() ?: "нет данных")
            val caps = buildList {
                if (src.inbound == true || src.capabilities.any { OwnerLocalization.normStatus(it) == "inbound" }) add("приём входящих")
                if (src.outbound == true) add("исходящие")
                if (src.capabilities.any { OwnerLocalization.normStatus(it) == "discovery" }) add("поиск лидов")
            }
            if (caps.isNotEmpty()) Kv("Возможности", caps.joinToString(", "))
            if (OwnerLocalization.hasValue(src.reason_disabled)) {
                Kv("Причина отключения", src.reason_disabled!!)
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
