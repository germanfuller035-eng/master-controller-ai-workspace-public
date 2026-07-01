package ru.dmitry.matercontroller.feature.multichannel

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
import ru.dmitry.matercontroller.core.ui.SectionCard

/** «Источники и каналы» — multichannel read-only overview. No outbound, no send. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MultichannelScreen(onBack: () -> Unit, vm: MultichannelViewModel = hiltViewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    Scaffold(topBar = {
        TopAppBar(title = { Text("Источники и каналы") },
            navigationIcon = { IconButton(onClick = onBack, modifier = Modifier.testTag("screen.multichannel.control.back")) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
            actions = { TextButton(onClick = vm::refresh, modifier = Modifier.testTag("screen.multichannel.control.refresh")) { Text("Обновить") } })
    }) { pad ->
        when {
            ui.loading -> LoadingState(Modifier.padding(pad))
            ui.error != null && ui.sources == null -> ErrorState(ui.error!!, onRetry = vm::refresh, modifier = Modifier.padding(pad))
            else -> Column(Modifier.padding(pad).padding(16.dp).verticalScroll(rememberScrollState()).testTag("multichannel")) {
                if (ui.offline) { OfflineBanner(ui.cachedAt); Spacer(Modifier.height(8.dp)) }

                ui.queue?.let { q ->
                    Text("Многоканальная очередь", style = MaterialTheme.typography.titleMedium)
                    SectionCard("Входящие заявки на проверку", trailing = q.inbound_to_review.toString(), tag = "mc_q_inbound")
                    SectionCard("Конфликты идентичности", trailing = q.identity_conflicts.toString(), tag = "mc_q_conflicts")
                    SectionCard("Черновики ответов", trailing = q.reply_drafts.toString(), tag = "mc_q_drafts")
                    SectionCard("Карантин", trailing = q.quarantine.toString(), tag = "mc_q_quarantine")
                    Spacer(Modifier.height(12.dp))
                }

                ui.sources?.let { s ->
                    Text("Источники лидов (${s.total})", style = MaterialTheme.typography.titleMedium)
                    val health = ui.sourcesHealth?.items?.associateBy { it.source_id } ?: emptyMap()
                    s.items.forEach { src ->
                        val h = health[src.source_id]
                        val sub = ruStatus(src.status) + (if (h?.has_data == true) " · кандидатов: ${h.candidates ?: "—"}" else " · нет данных")
                        SectionCard(src.display_name, subtitle = sub, tag = "mc_src_${src.source_id}")
                    }
                    Spacer(Modifier.height(12.dp))
                }

                ui.channels?.let { c ->
                    Text("Каналы связи", style = MaterialTheme.typography.titleMedium)
                    c.items.forEach { ch ->
                        SectionCard(ch.channel, subtitle = "входящие: ${ruChan(ch.inbound)} · исходящие: ${ruChan(ch.outbound)}", tag = "mc_ch_${ch.channel}")
                    }
                    Text("Исходящие сообщения через новые каналы пока не разрешены.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 8.dp))
                }

                Spacer(Modifier.height(12.dp))
                Text("Входящие заявки", style = MaterialTheme.typography.titleMedium)
                val inboundItems = ui.inbound?.items.orEmpty()
                if (inboundItems.isNotEmpty()) {
                    inboundItems.take(20).forEach { i -> SectionCard(i.company ?: i.id, subtitle = "${i.source} · ${ruStatus(i.status)}", tag = "mc_in_${i.id}") }
                } else {
                    Text(
                        if (ui.inbound == null) "Входящие заявки пока недоступны." else "Входящих заявок пока нет.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 8.dp).testTag("multichannel_inbound_empty")
                    )
                }
            }
        }
    }
}

private fun ruStatus(s: String) = when (s) {
    "ACTIVE" -> "активен"; "DISABLED" -> "отключён"; "PENDING_CREDENTIAL" -> "ждёт доступа"
    "PENDING_MODERATION" -> "ждёт модерации"; "DEGRADED" -> "ограничен"; "ERROR" -> "ошибка"
    "NEW" -> "новая"; "RATE_LIMITED" -> "лимит"; "POLICY_BLOCKED" -> "политика"
    else -> s
}
private fun ruChan(s: String) = when (s) {
    "ON" -> "вкл"; "OFF" -> "выкл"; "PENDING_CREDENTIAL" -> "ждёт доступа"; "GATED" -> "по согласованию"; "NA" -> "—"
    else -> s
}
