package ru.dmitry.matercontroller.feature.reservoir

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
 * «Резервуар доменов» — read-only Domain Reservoir summary + Pipeline funnel + Capacity status.
 * GET /reservoir/summary + /reservoir/funnel. common_crawl_mode TEST_ONLY is explicitly shown;
 * raw_import_ai_calls is shown as-is (=0 means free import). Capacity contrasts owner_queue_max
 * against the current owner-queue load. No mutation or send.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReservoirScreen(onBack: () -> Unit, vm: ReservoirViewModel = hiltViewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    Scaffold(topBar = {
        TopAppBar(title = { Text("Резервуар доменов") },
            navigationIcon = { IconButton(onClick = onBack, modifier = Modifier.testTag("screen.reservoir.control.back")) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
            actions = { TextButton(onClick = vm::refresh, modifier = Modifier.testTag("screen.reservoir.control.refresh")) { Text("Обновить") } })
    }) { pad ->
        when {
            ui.loading -> LoadingState(Modifier.padding(pad))
            ui.error != null && ui.summary == null && ui.funnel == null ->
                ErrorState(ui.error!!, onRetry = vm::refresh, modifier = Modifier.padding(pad))
            else -> Column(Modifier.padding(pad).padding(16.dp).verticalScroll(rememberScrollState()).testTag("reservoir")) {
                if (ui.offline) { OfflineBanner(ui.cachedAt); Spacer(Modifier.height(8.dp)) }

                val s = ui.summary
                Text("Резервуар доменов", style = MaterialTheme.typography.titleMedium)
                Kv("Всего доменов", OwnerLocalization.renderCounterRu(s?.reservoir_domains))
                Kv("Запусков всего", OwnerLocalization.renderCounterRu(s?.runs_total))
                Kv("Переведено в основную базу", OwnerLocalization.renderCounterRu(s?.canonical_promotions_total))
                Kv("Режим Common Crawl", OwnerLocalization.renderCrawlModeRu(s?.common_crawl_mode))
                if (OwnerLocalization.hasValue(s?.common_crawl_adapter)) Kv("Адаптер Common Crawl", s!!.common_crawl_adapter!!)
                if (OwnerLocalization.hasValue(s?.common_crawl_refresh)) Kv("Обновление Common Crawl", s!!.common_crawl_refresh!!)
                Kv("Платные источники", ruBool(s?.paid_sources_enabled))
                if (s?.by_state?.isNotEmpty() == true) {
                    Spacer(Modifier.height(6.dp))
                    Text("По состоянию", style = MaterialTheme.typography.titleSmall)
                    s.by_state.entries.forEach { (k, v) ->
                        Kv(OwnerLocalization.renderReservoirStateRu(k), OwnerLocalization.renderCounterRu(v))
                    }
                }

                // ---- Pipeline funnel ----
                val f = ui.funnel
                Spacer(Modifier.height(12.dp))
                Text("Воронка обработки", style = MaterialTheme.typography.titleMedium)
                Kv("Сырые кандидаты", OwnerLocalization.renderCounterRu(f?.raw_candidates))
                Kv("Технически живые", OwnerLocalization.renderCounterRu(f?.technically_alive))
                Kv("Определён бизнес", OwnerLocalization.renderCounterRu(f?.business_identified))
                Kv("Контакт подтверждён", OwnerLocalization.renderCounterRu(f?.contact_verified))
                Kv("Кандидаты на аудит", OwnerLocalization.renderCounterRu(f?.audit_candidates))
                Kv("Готовы к аудиту", OwnerLocalization.renderCounterRu(f?.audit_ready))
                Kv("Переведено в основную базу", OwnerLocalization.renderCounterRu(f?.promoted_to_canonical))
                Kv("Отклонено", OwnerLocalization.renderCounterRu(f?.rejected))
                Kv("ИИ-вызовы при импорте", OwnerLocalization.renderCounterRu(f?.raw_import_ai_calls))

                // ---- Capacity status ----
                Spacer(Modifier.height(12.dp))
                Text("Загрузка очереди владельца", style = MaterialTheme.typography.titleMedium)
                val load = ui.ownerQueueLoad
                val max = ui.ownerQueueMax
                Kv("Текущая загрузка", load?.toString() ?: "нет данных")
                Kv("Максимум очереди", max?.toString() ?: "нет данных")
                if (load != null && max != null && max > 0) {
                    val ratio = (load.toFloat() / max.toFloat()).coerceIn(0f, 1f)
                    Spacer(Modifier.height(4.dp))
                    LinearProgressIndicator(progress = { ratio }, modifier = Modifier.fillMaxWidth().testTag("capacity_bar"))
                    Spacer(Modifier.height(2.dp))
                    Text("$load из $max", style = MaterialTheme.typography.bodySmall)
                }

                Spacer(Modifier.height(12.dp))
                Text("Только просмотр. Радар и резервуар не выполняют отправку и не меняют производство.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
            }
        }
    }
}

private fun ruBool(v: Boolean?): String = when (v) { true -> "да"; false -> "нет"; null -> "нет данных" }

@Composable
private fun Kv(k: String, v: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
        Text("$k: ", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
        Text(v, style = MaterialTheme.typography.bodySmall)
    }
}
