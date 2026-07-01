package ru.dmitry.matercontroller.feature.campaigns

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ru.dmitry.matercontroller.core.model.CampaignSummary
import ru.dmitry.matercontroller.core.model.CohortSummary
import ru.dmitry.matercontroller.core.ui.ErrorState
import ru.dmitry.matercontroller.core.ui.LoadingState
import ru.dmitry.matercontroller.core.ui.OfflineBanner

// Owner-facing Russian labels — no raw enum codes in the main UI.
private fun campaignStatusRu(s: String?): String = when ((s ?: "").uppercase()) {
    "DRAFT" -> "Черновик"
    "ACTIVE" -> "Активна"
    "PAUSED" -> "На паузе"
    "COMPLETED" -> "Завершена"
    "ARCHIVED" -> "В архиве"
    else -> "неизвестно"
}

private fun cohortStatusRu(s: String?): String = when ((s ?: "").uppercase()) {
    "PLANNED" -> "Запланирована"
    "RELEASED" -> "Запущена"
    "OBSERVING" -> "Наблюдение"
    "CLOSED" -> "Закрыта"
    else -> "неизвестно"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CampaignsScreen(
    vm: CampaignsViewModel = hiltViewModel(),
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    Scaffold(topBar = { TopAppBar(title = { Text("Кампании") }) }) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().testTag("campaigns_screen")) {
            if (ui.offline) OfflineBanner(ui.cachedAt)
            // No-send posture is a hard invariant — make it explicit for the owner.
            AssistChip(
                onClick = {},
                enabled = false,
                label = { Text("Режим: без отправки") },
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp).testTag("campaigns_no_send_badge"),
            )
            when {
                ui.loading -> LoadingState()
                ui.error != null -> ErrorState(ui.error!!, onRetry = vm::refresh)
                ui.items.isEmpty() -> EmptyCampaigns()
                else -> LazyColumn(
                    Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(12.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(ui.items, key = { it.campaign_id }) { c -> CampaignCard(c) }
                }
            }
        }
    }
}

@Composable
private fun CampaignCard(c: CampaignSummary) {
    Card(Modifier.fillMaxWidth().testTag("campaign_card_${c.campaign_id}")) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(c.name ?: "Без названия", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                AssistChip(onClick = {}, enabled = false, label = { Text(campaignStatusRu(c.status)) })
            }
            val seg = listOfNotNull(c.niche, c.region).joinToString(" · ")
            if (seg.isNotBlank()) Text(seg, style = MaterialTheme.typography.bodySmall)
            if (c.suppressed > 0) {
                Text("Исключено из рассылки: ${c.suppressed}", style = MaterialTheme.typography.bodySmall)
            }
            Divider(Modifier.padding(vertical = 4.dp))
            c.cohorts.forEach { co -> CohortRow(co) }
        }
    }
}

@Composable
private fun CohortRow(co: CohortSummary) {
    Column(Modifier.fillMaxWidth().padding(vertical = 2.dp).testTag("cohort_row_${co.cohort_id}")) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Когорта ${co.index + 1} · план ${co.planned_size}", style = MaterialTheme.typography.bodyMedium)
            Text(cohortStatusRu(co.status), style = MaterialTheme.typography.bodyMedium)
        }
        val s = co.summary
        if (s != null && co.released > 0) {
            // Accepted vs delivered are kept distinct (SMTP accepted ≠ proven delivery).
            Text(
                "Запущено ${co.released} · принято ${s.accepted} · доставлено ${s.delivered} · " +
                    "отскок ${s.bounced} · ответы ${s.replied}",
                style = MaterialTheme.typography.bodySmall,
            )
        } else if (co.released > 0) {
            Text("Запущено ${co.released}", style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun EmptyCampaigns() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text("Кампаний пока нет", style = MaterialTheme.typography.bodyLarge)
    }
}
