package ru.dmitry.matercontroller.feature.approvals

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import ru.dmitry.matercontroller.core.ui.OwnerActionCard
import ru.dmitry.matercontroller.core.ui.OwnerStatusChip
import ru.dmitry.matercontroller.core.ui.OwnerStatusTone
import ru.dmitry.matercontroller.core.ui.PilotSafetyChips
import ru.dmitry.matercontroller.core.ui.SectionCard

/** «Решения» hub — entry into the four approval queues. Static routing; no data load. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ApprovalsHomeScreen(
    onOpenQueue: (String) -> Unit,
    onOpenCommandCenter: () -> Unit = {},
    onOpenOwnerDecisions: () -> Unit = {},
    onOpenIncidents: () -> Unit = {},
) {
    Scaffold(topBar = { TopAppBar(title = { Text("Решения") }) }) { pad ->
        Column(
            Modifier.padding(pad).padding(16.dp).verticalScroll(rememberScrollState()).testTag("approvals_home"),
        ) {
            Text("Решения владельца", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.testTag("pilot_owner_decisions"))
            Text("Здесь владелец подтверждает, правит, откладывает или отклоняет черновики. Отправки, платежей и записи в рабочую базу нет.", style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(8.dp))
            PilotSafetyChips(tag = "pilot_owner_decisions_safety_chips")
            Spacer(Modifier.height(8.dp))
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OwnerStatusChip("Без отправки", OwnerStatusTone.NoSend)
                OwnerStatusChip("Решения владельца", OwnerStatusTone.Attention)
            }
            Spacer(Modifier.height(12.dp))
            OwnerActionCard("Командный центр", "Сводка событий, ограничений и решений владельца.", onClick = onOpenCommandCenter, tag = "decisions_command_center")
            OwnerActionCard("Все решения владельца", "Список решений из командного центра, если они есть.", onClick = onOpenOwnerDecisions, tag = "decisions_owner_list")
            OwnerActionCard("Инциденты", "Критические события и действия по восстановлению.", onClick = onOpenIncidents, tag = "decisions_incidents")
            Spacer(Modifier.height(12.dp))
            Text("Очереди подтверждений", style = MaterialTheme.typography.titleMedium)
            ApprovalQueue.entries.forEach { q ->
                SectionCard(
                    title = q.title,
                    subtitle = when (q) {
                        ApprovalQueue.AUDITS -> "Готовые аудиты на проверку"
                        ApprovalQueue.DRAFTS -> "Черновики сообщений — ожидают подтверждения"
                        ApprovalQueue.FOLLOWUPS -> "Повторный контакт"
                        ApprovalQueue.REPLY_DRAFTS -> "Ответы, требующие реакции"
                    },
                    onClick = { onOpenQueue(q.key) },
                    tag = "approvals_card_${q.key}",
                )
            }
            Spacer(Modifier.height(8.dp))
            Text(
                "Отправка отключена. Подтверждение сохраняет решение, письма не отправляются.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            )
        }
    }
}
