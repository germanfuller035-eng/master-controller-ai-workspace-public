package ru.dmitry.matercontroller.feature.catalog

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ru.dmitry.matercontroller.core.model.ProductListItem
import ru.dmitry.matercontroller.core.ui.ErrorState
import ru.dmitry.matercontroller.core.ui.LoadingState
import ru.dmitry.matercontroller.core.ui.OfflineBanner
import ru.dmitry.matercontroller.core.ui.OwnerLocalization

/**
 * «Каталог продуктов» — read-only owner catalog (Gate C1-A). Data comes only from the API/cache
 * (никаких захардкоженных продуктов/цен). Unknown price renders as words, never 0 ₽.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CatalogListScreen(
    onBack: () -> Unit,
    onOpenProduct: (String) -> Unit,
    vm: CatalogListViewModel = hiltViewModel(),
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Каталог продуктов") },
                navigationIcon = { IconButton(onClick = onBack, modifier = Modifier.testTag("screen.catalog.control.back")) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
                actions = { TextButton(onClick = vm::refresh, modifier = Modifier.testTag("screen.catalog.control.refresh")) { Text("Обновить") } },
            )
        },
    ) { pad ->
        when {
            ui.loading -> LoadingState(Modifier.padding(pad))
            ui.error != null && ui.catalog == null -> ErrorState(ui.error!!, onRetry = vm::refresh, modifier = Modifier.padding(pad))
            else -> Column(Modifier.padding(pad).fillMaxSize().testTag("catalog_list")) {
                if (ui.offline) OfflineBanner(ui.cachedAt)
                val c = ui.catalog
                if (c != null) {
                    val active = c.counts["ACTIVE"] ?: 0
                    val draft = c.counts["DRAFT"] ?: 0
                    val planned = c.counts["PLANNED"] ?: 0
                    Text(
                        "${c.total} продуктов · $active активных · $draft черновиков · $planned запланировано",
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp).testTag("catalog_counts"),
                    )
                    OutlinedTextField(
                        value = ui.query,
                        onValueChange = vm::setQuery,
                        label = { Text("Поиск") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).testTag("catalog_search"),
                    )
                    Row(Modifier.padding(16.dp, 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(selected = ui.statusFilter == "ACTIVE", onClick = { vm.setStatusFilter("ACTIVE") }, label = { Text("Активные") }, modifier = Modifier.testTag("filter_active"))
                        FilterChip(selected = ui.statusFilter == "DRAFT", onClick = { vm.setStatusFilter("DRAFT") }, label = { Text("Черновики") }, modifier = Modifier.testTag("filter_draft"))
                        FilterChip(selected = ui.statusFilter == "PLANNED", onClick = { vm.setStatusFilter("PLANNED") }, label = { Text("Планы") }, modifier = Modifier.testTag("filter_planned"))
                    }
                    val items = ui.visibleItems
                    if (items.isEmpty()) {
                        Box(Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.Center) {
                            Text("Нет продуктов по запросу", style = MaterialTheme.typography.bodyMedium)
                        }
                    } else {
                        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            items(items, key = { it.product_id }) { p -> ProductRow(p, onOpenProduct) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ProductRow(p: ProductListItem, onOpen: (String) -> Unit) {
    ElevatedCard(Modifier.fillMaxWidth().clickable { onOpen(p.product_id) }.testTag("product_${p.product_id}")) {
        Column(Modifier.padding(16.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(p.name ?: p.product_id, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                AssistChip(onClick = {}, enabled = false, label = { Text(OwnerLocalization.renderProductStatusRu(p.status)) })
            }
            Spacer(Modifier.height(4.dp))
            Text(
                OwnerLocalization.renderProductPriceRu(p.price, p.currency, p.price_display),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.primary,
            )
            ownerVisibleDescription(p.short_description)?.let { description ->
                Spacer(Modifier.height(4.dp))
                Text(description, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
    }
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

private fun looksLikeMostlyEnglish(text: String): Boolean {
    val latin = text.count { it in 'A'..'Z' || it in 'a'..'z' }
    val cyrillic = text.count { it in 'А'..'я' || it == 'ё' || it == 'Ё' }
    return latin > 20 && latin > cyrillic * 2
}
