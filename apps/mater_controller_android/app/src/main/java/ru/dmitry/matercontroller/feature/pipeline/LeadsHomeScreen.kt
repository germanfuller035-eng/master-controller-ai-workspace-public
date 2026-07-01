package ru.dmitry.matercontroller.feature.pipeline

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import ru.dmitry.matercontroller.core.ui.OwnerActionCard
import ru.dmitry.matercontroller.core.ui.OwnerSafetyInvariant
import ru.dmitry.matercontroller.core.ui.OwnerStatusChip
import ru.dmitry.matercontroller.core.ui.OwnerStatusTone
import ru.dmitry.matercontroller.core.ui.PilotSafetyChips
import ru.dmitry.matercontroller.core.ui.SafetyInvariantPanel
import ru.dmitry.matercontroller.core.ui.SectionCard

/**
 * «Лиды» top-level hub. Aggregates the lead-facing destinations: the three pipeline queues
 * plus the existing Мини-аудит working set. Pure routing — each child owns its data + states.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LeadsHomeScreen(
    onOpenQueue: (String) -> Unit,
    onOpenMiniAudit: () -> Unit,
    onOpenWorkingSalesMvp: () -> Unit = {},
) {
    Scaffold(topBar = { TopAppBar(title = { Text("Лиды") }) }) { pad ->
        Column(Modifier.padding(pad).padding(16.dp).verticalScroll(rememberScrollState()).testTag("leads_home")) {
            Text("Лиды", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.testTag("pilot_leads"))
            Text("Ручная очередь для продаж. Здесь видно, что готово, что заблокировано и что нужно исправить. Клиентам ничего не отправляется.", style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OwnerStatusChip("Отправка ВЫКЛ", OwnerStatusTone.NoSend)
                OwnerStatusChip("Только черновики", OwnerStatusTone.Neutral)
            }
            Spacer(Modifier.height(8.dp))
            PilotSafetyChips(tag = "pilot_leads_safety_chips")
            Spacer(Modifier.height(8.dp))
            OwnerActionCard(
                "Ручная проверка лида",
                subtitle = "Добавить лид, проверить соответствие продукту, подготовить черновик предложения и пройти контроль без отправки.",
                onClick = onOpenWorkingSalesMvp,
                tag = "leads_card_working_sales_mvp",
                status = "только черновик",
                tone = OwnerStatusTone.NoSend,
            )
            Text("Сводка ручного контура", style = MaterialTheme.typography.titleMedium)
            SectionCard("Всего лидов", subtitle = "ручной рабочий набор", trailing = "1", tag = "pilot_leads_total")
            SectionCard("В работе", subtitle = "Лид / Проверка / Черновик", trailing = "1", tag = "pilot_leads_in_progress")
            SectionCard("Нужен ответ", subtitle = "только входящие или ручная проверка", trailing = "0", tag = "pilot_leads_needs_reply")
            SectionCard("В очереди", subtitle = "не отправляется автоматически", trailing = "0", tag = "pilot_leads_queued")
            SafetyInvariantPanel(
                title = "Как читать пайплайн",
                subtitle = "Это рабочая поверхность для проверки лидов и черновиков. Она не связывается с клиентами.",
                items = listOf(
                    OwnerSafetyInvariant("Реальная отправка", "ВЫКЛ", OwnerStatusTone.NoSend, "Любая будущая отправка требует отдельного контроля владельца."),
                    OwnerSafetyInvariant("Лимит пачки", "3", OwnerStatusTone.Attention, "Лимит есть в контракте; этот экран его не расширяет."),
                    OwnerSafetyInvariant("Дневной лимит и стоп-лист", "gate", OwnerStatusTone.Attention, "Ограничители остаются обязательными до любой будущей отправки."),
                    OwnerSafetyInvariant("Мониторинг ответов", "gate", OwnerStatusTone.Attention, "Ответы проверяются как условие, не как автодействие."),
                ),
                tag = "leads_no_send_panel",
            )
            Spacer(Modifier.height(8.dp))
            PipelineQueue.entries.forEach { q ->
                OwnerActionCard(
                    title = q.title,
                    subtitle = when (q) {
                        PipelineQueue.PRODUCT_ROUTING -> "Без аудируемого сайта: только продуктовый маршрут и ручная проверка."
                        PipelineQueue.STAGING -> "Новые кандидаты: видимость готовности контура, не реальные клиентские обещания."
                        PipelineQueue.VERIFIED_READY -> "Проверены и готовы к аудиту: всё ещё без отправки до контроля владельца."
                    },
                    onClick = { onOpenQueue(q.name) },
                    tag = "leads_card_${q.name}",
                    status = "только просмотр",
                    tone = OwnerStatusTone.Neutral,
                )
            }
            OwnerActionCard(
                "Мини-аудит",
                subtitle = "Рабочий набор лидов: готовые, ожидающие и повторный контакт. Отправка не выполняется из этого центра.",
                onClick = onOpenMiniAudit,
                tag = "leads_card_miniaudit",
                status = "без отправки",
                tone = OwnerStatusTone.NoSend,
            )
        }
    }
}
