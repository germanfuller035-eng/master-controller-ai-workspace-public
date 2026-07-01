package ru.dmitry.matercontroller.feature.catalog

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
 * Product detail (read-only). RC5: the owner-facing content comes from the authoritative Russian
 * presentation (GET /products/{code}/presentation): product_name_ru, description_ru, scope_ru,
 * exclusions_ru, required_inputs_ru, outputs_ru, acceptance_criteria_ru. The legacy /products/{id}
 * detail is a fallback for version/status only. No English owner-facing strings, no hardcoded data.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProductDetailScreen(onBack: () -> Unit, vm: ProductDetailViewModel = hiltViewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val title = ui.presentation?.product_name_ru?.takeIf { OwnerLocalization.hasValue(it) }
        ?: ui.product?.name ?: "Продукт"
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title) },
                navigationIcon = { IconButton(onClick = onBack, modifier = Modifier.testTag("screen.catalog.control.back")) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
                actions = { TextButton(onClick = vm::refresh, modifier = Modifier.testTag("screen.catalog.control.refresh")) { Text("Обновить") } },
            )
        },
    ) { pad ->
        when {
            ui.loading -> LoadingState(Modifier.padding(pad))
            ui.error != null && ui.product == null && ui.presentation == null ->
                ErrorState(ui.error!!, onRetry = vm::refresh, modifier = Modifier.padding(pad))
            else -> {
                val p = ui.product
                val pres = ui.presentation
                Column(Modifier.padding(pad).padding(16.dp).verticalScroll(rememberScrollState()).testTag("product_detail")) {
                    if (ui.offline) { OfflineBanner(ui.cachedAt); Spacer(Modifier.height(8.dp)) }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(title, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.weight(1f))
                        if (p?.status != null) {
                            AssistChip(onClick = {}, enabled = false, label = { Text(OwnerLocalization.renderProductStatusRu(p.status)) }, modifier = Modifier.testTag("pd_status"))
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    // Price: prefer presentation price, fall back to legacy detail. Never a false 0.
                    val price = pres?.price ?: p?.price
                    val currency = pres?.currency ?: p?.currency
                    Text(
                        "Цена: ${OwnerLocalization.renderProductPriceRu(price, currency, p?.price_display)}",
                        style = MaterialTheme.typography.titleLarge,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.testTag("pd_price"),
                    )
                    if (!p?.version.isNullOrBlank()) {
                        Text("Версия продукта: ${p!!.version}", style = MaterialTheme.typography.bodySmall)
                    }
                    val description = pres?.description_ru?.takeIf { OwnerLocalization.hasValue(it) } ?: ownerVisibleDescription(p?.description)
                    if (!description.isNullOrBlank()) {
                        Spacer(Modifier.height(12.dp)); Text(description, style = MaterialTheme.typography.bodyMedium)
                    }
                    // RC5: Russian presentation lists are preferred; legacy lists are the fallback.
                    DetailList("Что входит", pres?.scope_ru?.ifEmpty { null } ?: ownerVisibleLines(p?.scope_included.orEmpty()))
                    DetailList("Что не входит", pres?.exclusions_ru?.ifEmpty { null } ?: ownerVisibleLines(p?.scope_excluded.orEmpty()))
                    DetailList("Что нужно от клиента", pres?.required_inputs_ru?.ifEmpty { null } ?: ownerVisibleLines(p?.inputs_required.orEmpty()))
                    DetailList("Результат", pres?.outputs_ru?.ifEmpty { null } ?: ownerVisibleLines(p?.deliverables.orEmpty()))
                    DetailList("Критерии готовности", pres?.acceptance_criteria_ru?.ifEmpty { null } ?: ownerVisibleLines(p?.acceptance_criteria.orEmpty()))
                    Spacer(Modifier.height(16.dp))
                    Text("Только просмотр. Клиенту ничего не отправляется.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                }
            }
        }
    }
}

@Composable
private fun DetailList(title: String, items: List<String>) {
    if (items.isEmpty()) return
    Spacer(Modifier.height(12.dp))
    Text(title, style = MaterialTheme.typography.titleMedium)
    Spacer(Modifier.height(4.dp))
    items.forEach { line -> Text("• $line", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(start = 8.dp, top = 2.dp)) }
}

private fun ownerVisibleDescription(value: String?): String? {
    val text = value?.trim().orEmpty()
    if (text.isBlank()) return null
    return if (looksLikeMostlyEnglish(text)) {
        "Описание на русском пока не загружено. Нажмите «Обновить»."
    } else {
        text
    }
}

private fun ownerVisibleLines(items: List<String>): List<String> =
    items.mapNotNull { line ->
        val text = line.trim()
        text.takeIf { it.isNotBlank() && !looksLikeMostlyEnglish(it) }
    }.distinct()

private fun looksLikeMostlyEnglish(text: String): Boolean {
    val latin = text.count { it in 'A'..'Z' || it in 'a'..'z' }
    val cyrillic = text.count { it in 'А'..'я' || it == 'ё' || it == 'Ё' }
    return latin > 20 && latin > cyrillic * 2
}
