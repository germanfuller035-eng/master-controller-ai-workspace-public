package ru.dmitry.matercontroller.feature.replies

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ru.dmitry.matercontroller.core.model.ReplyItem
import ru.dmitry.matercontroller.core.ui.ErrorState
import ru.dmitry.matercontroller.core.ui.LoadingState
import ru.dmitry.matercontroller.core.ui.OfflineBanner
import ru.dmitry.matercontroller.core.ui.OwnerLocalization
import ru.dmitry.matercontroller.core.ui.PilotSafetyChips

private val CATEGORY_EMOJI = mapOf(
    "interested" to "🔥", "not_interested" to "🛑", "question" to "❓",
    "bounce" to "📭", "auto_reply" to "🤖", "unmatched" to "❔",
)

private fun categoryLabel(c: String?): String {
    val emoji = CATEGORY_EMOJI[(c ?: "").trim().lowercase()] ?: "❔"
    return "$emoji ${OwnerLocalization.renderReplyClassRu(c)}"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RepliesScreen(
    onOpenReply: (String) -> Unit = {},
    vm: RepliesViewModel = hiltViewModel(),
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    Scaffold(topBar = { TopAppBar(title = { Text("Ответы") }) }) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().testTag("replies_screen")) {
            if (ui.offline) OfflineBanner(ui.cachedAt)
            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Ответы", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.testTag("pilot_replies"))
                Text("Входящие категории: интерес / отказ / неясно / неизвестно. Автоответы не отправляются.", style = MaterialTheme.typography.bodySmall)
                PilotSafetyChips(tag = "pilot_replies_safety_chips")
            }
            // filter chips
            ScrollableTabRow(
                selectedTabIndex = ReplyFilter.entries.indexOf(ui.filter),
                edgePadding = 12.dp,
            ) {
                ReplyFilter.entries.forEach { f ->
                    Tab(
                        selected = ui.filter == f,
                        onClick = { vm.setFilter(f) },
                        text = {
                            val n = when (f) {
                                ReplyFilter.OPEN -> ui.counts?.newCount
                                ReplyFilter.INTERESTED -> ui.counts?.interested
                                ReplyFilter.NOT_INTERESTED -> ui.counts?.notInterested
                                ReplyFilter.BOUNCE -> ui.counts?.bounce
                                ReplyFilter.UNMATCHED -> ui.counts?.unmatched
                                ReplyFilter.ALL -> ui.counts?.total
                            }
                            Text(if (n != null) "${f.label} ($n)" else f.label)
                        },
                        modifier = Modifier.testTag("reply_filter_${f.name}"),
                    )
                }
            }
            when {
                ui.loading -> LoadingState()
                ui.error != null -> ErrorState(ui.error!!, onRetry = vm::refresh)
                ui.items.isEmpty() -> EmptyReplies(ui.filter)
                else -> LazyColumn(Modifier.fillMaxSize()) {
                    items(ui.items, key = { it.replyId }) { r ->
                        ReplyCard(r, onClick = { onOpenReply(r.replyId) })
                    }
                }
            }
        }
    }
}

@Composable
private fun EmptyReplies(filter: ReplyFilter) {
    val msg = when (filter) {
        ReplyFilter.OPEN -> "Новых ответов нет"
        ReplyFilter.INTERESTED -> "Ответы с интересом отсутствуют"
        ReplyFilter.NOT_INTERESTED -> "Отказов нет"
        ReplyFilter.BOUNCE -> "Недоставленных сообщений нет"
        ReplyFilter.UNMATCHED -> "Неопознанных ответов нет"
        ReplyFilter.ALL -> "Ответов в этой категории нет"
    }
    Box(Modifier.fillMaxSize().testTag("replies_empty"), contentAlignment = androidx.compose.ui.Alignment.Center) {
        Text("📭 $msg", style = MaterialTheme.typography.bodyMedium)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ReplyCard(r: ReplyItem, onClick: () -> Unit) {
    val unmatched = r.leadId == null || r.leadId.startsWith("UNMATCHED:")
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp).testTag("reply_card_${r.replyId}"),
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Text(categoryLabel(r.category), style = MaterialTheme.typography.labelLarge)
                Spacer(Modifier.weight(1f))
                if (unmatched) {
                    AssistChip(onClick = {}, enabled = false, label = { Text("Не определено") }, modifier = Modifier.testTag("reply_unmatched"))
                } else if (r.status == "new") {
                    AssistChip(onClick = {}, enabled = false, label = { Text("новый") })
                }
            }
            Spacer(Modifier.height(4.dp))
            Text(
                if (unmatched) (r.from ?: "—") else (r.company ?: r.leadId ?: "—"),
                style = MaterialTheme.typography.titleMedium,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            r.subject?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Spacer(Modifier.height(2.dp))
            Text(
                (r.receivedAt ?: "").replace("T", " ").take(16),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.outline,
            )
        }
    }
}
