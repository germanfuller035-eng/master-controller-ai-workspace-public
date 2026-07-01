package ru.dmitry.matercontroller.feature.serverfunnel

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ru.dmitry.matercontroller.core.model.ServerFunnelMailItem

@Composable
fun ServerFunnelMailScreen(
    onOpenEmail: (String) -> Unit,
    onOpenHistory: () -> Unit,
    vm: ServerFunnelViewModel = hiltViewModel(),
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    ServerFunnelPage("Почта", "Входящие с почтового сервера. Только заголовки, без изменения писем.") {
        StatusStrip(ui)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            Button(
                onClick = vm::refreshMailReadonly,
                enabled = !ui.actionBusy,
                modifier = Modifier.weight(1f).height(52.dp).testTag("mail_refresh_readonly"),
            ) {
                Icon(Icons.Filled.Refresh, contentDescription = null)
                Text("Обновить")
            }
            OutlinedButton(
                onClick = onOpenHistory,
                modifier = Modifier.height(52.dp).testTag("mail_open_history"),
            ) {
                Icon(Icons.Filled.History, contentDescription = null)
                Text("История")
            }
        }
        if (ui.loading) LoadingBlock()
        val items = ui.mail?.items.orEmpty()
        if (!ui.loading && items.isEmpty()) {
            OwnerEmptyBlock(
                title = "Писем пока нет",
                text = ui.status?.ownerVisibleRu?.staleReason ?: "Нажмите обновление. Система прочитает только заголовки из разрешённых ящиков.",
            )
        }
        items.forEach { item ->
            MailRow(item = item, onClick = { onOpenEmail(item.emailId) })
        }
    }
}

@Composable
fun ServerFunnelEmailDetailScreen(
    emailId: String,
    onPrepareDraft: (String) -> Unit,
    vm: ServerFunnelViewModel = hiltViewModel(),
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    LaunchedEffect(emailId) { vm.openEmail(emailId) }
    ServerFunnelPage("Письмо", "Краткая карточка без тела письма и без вложений.") {
        StatusStrip(ui)
        if (ui.loading) LoadingBlock()
        val detail = ui.detail
        if (detail != null) {
            ElevatedCard(Modifier.fillMaxWidth().testTag("email_detail_card")) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(detail.email.subject ?: "Без темы", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                    InfoLine("От", detail.email.fromMasked ?: "скрыто")
                    InfoLine("Тип", typeRu(detail.email.classification?.type))
                    InfoLine("Причина", detail.email.classification?.reasonRu ?: "Требуется проверка владельца")
                    InfoLine("Риск", detail.riskRu ?: "Перед ответом нужно подтверждение")
                    InfoLine("Следующее действие", detail.proposedNextActionRu ?: "Подготовить ответ")
                    Button(
                        onClick = { onPrepareDraft(emailId) },
                        modifier = Modifier.fillMaxWidth().height(52.dp).testTag("email_prepare_reply"),
                    ) { Text("Подготовить ответ") }
                }
            }
        }
    }
}

@Composable
fun ServerFunnelDraftReplyScreen(
    emailId: String,
    onOpenApproval: (String) -> Unit,
    vm: ServerFunnelViewModel = hiltViewModel(),
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    LaunchedEffect(emailId) { vm.prepareDraft(emailId) }
    ServerFunnelPage("Черновик ответа", "Текст можно проверить перед отправкой на подтверждение.") {
        StatusStrip(ui)
        if (ui.actionBusy && ui.draft == null) LoadingBlock()
        val draft = ui.draft
        if (draft != null) {
            ElevatedCard(Modifier.fillMaxWidth().testTag("reply_draft_card")) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    InfoLine("Тема", draft.subject ?: "Без темы")
                    Text("Текст", style = MaterialTheme.typography.labelLarge)
                    Text(draft.body.orEmpty(), style = MaterialTheme.typography.bodyMedium)
                    Divider()
                    Text("Проверка качества", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    draft.quality?.checks.orEmpty().forEach { check ->
                        InfoLine(check.labelRu ?: "Проверка", qualityRu(check.state))
                    }
                    InfoLine("Контрольная метка", draft.textHash ?: "будет создана после сохранения")
                    Button(
                        onClick = { onOpenApproval(emailId) },
                        modifier = Modifier.fillMaxWidth().height(52.dp).testTag("draft_open_approval"),
                    ) { Text("Отправить на подтверждение") }
                }
            }
        }
    }
}

@Composable
fun ServerFunnelApprovalScreen(
    emailId: String,
    vm: ServerFunnelViewModel = hiltViewModel(),
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    LaunchedEffect(emailId) { vm.prepareDraft(emailId) }
    ServerFunnelPage("Подтверждение", "Один пакет. Клиенту ничего не отправлено до отдельного действия.") {
        StatusStrip(ui)
        val draft = ui.draft
        if (draft != null) {
            ElevatedCard(Modifier.fillMaxWidth().testTag("approval_review_card")) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Пакет не отправлен", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    InfoLine("Канал", "Email")
                    InfoLine("Тема", draft.subject ?: "Без темы")
                    Text("Финальный текст", style = MaterialTheme.typography.labelLarge)
                    Text(draft.body.orEmpty(), style = MaterialTheme.typography.bodyMedium)
                    InfoLine("Риск", draft.riskRu ?: "Нужно решение владельца")
                    InfoLine("Контрольная метка текста", draft.textHash ?: "нет")
                    Button(
                        onClick = { vm.createApproval(emailId, sendTelegram = true) },
                        enabled = !ui.actionBusy,
                        modifier = Modifier.fillMaxWidth().height(52.dp).testTag("approval_send_owner_telegram"),
                    ) { Text("Подтвердить одну отправку") }
                }
            }
        } else if (ui.actionBusy) {
            LoadingBlock()
        }
        ui.approval?.let { approval ->
            Card(
                Modifier.fillMaxWidth().testTag("approval_packet_result"),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer),
            ) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Карточка владельца создана", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    InfoLine("Номер пакета", approval.packet?.packetId ?: "нет")
                    InfoLine("Метка пакета", approval.packet?.packetHash ?: "нет")
                    InfoLine("Срок действия", approval.packet?.expiresAt ?: "не задан")
                    InfoLine("Статус Telegram", if (approval.telegramSent) "Отправлено владельцу" else "Ожидает отправки владельцу")
                    Text("Клиенту письмо не отправлено.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error)
                }
            }
        }
    }
}

@Composable
fun ServerFunnelHistoryScreen(
    vm: ServerFunnelViewModel = hiltViewModel(),
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    ServerFunnelPage("История", "Локальные события контура. Запись в рабочую базу отдельно.") {
        StatusStrip(ui)
        ElevatedCard(Modifier.fillMaxWidth().testTag("server_funnel_history")) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Локальная история", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                InfoLine("Последнее обновление", ui.status?.yandexImapRead?.fetchedAt ?: "нет")
                InfoLine("Писем в снимке", (ui.status?.yandexImapRead?.count ?: 0).toString())
                InfoLine("Автоответ", "выключен")
                InfoLine("Массовая отправка", "выключена")
                InfoLine("Платежи", "выключены")
                InfoLine("Рабочая база", "только по отдельному разрешению")
                Text("События аудита сохраняются локально в приватном хранилище сервера.", style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

@Composable
private fun ServerFunnelPage(title: String, subtitle: String, content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp).testTag("server_funnel_page"),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(title, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        content()
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun StatusStrip(ui: ServerFunnelUiState) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth().testTag("mail_status_strip")) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            AssistChip(onClick = {}, enabled = false, label = { Text(if (ui.status?.yandexImapRead?.snapshotExists == true) "Данные доступны" else "Нужно обновить") }, leadingIcon = { Icon(Icons.Filled.Email, null) })
            AssistChip(onClick = {}, enabled = false, label = { Text("Без автоответа") }, leadingIcon = { Icon(Icons.Filled.Lock, null) })
        }
        ui.status?.ownerVisibleRu?.lastRefresh?.let { InfoLine("Последнее обновление", it) }
        ui.status?.ownerVisibleRu?.staleReason?.let { InfoLine("Причина", it) }
        ui.notice?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary) }
        ui.error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }
    }
}

@Composable
private fun MailRow(item: ServerFunnelMailItem, onClick: () -> Unit) {
    ElevatedCard(onClick = onClick, modifier = Modifier.fillMaxWidth().testTag("mail_row_${item.emailId}")) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(item.subject ?: "Без темы", modifier = Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                AssistChip(onClick = {}, enabled = false, label = { Text(typeRu(item.classification?.type)) })
            }
            InfoLine("От", item.fromMasked ?: "скрыто")
            InfoLine("Статус", item.statusRu ?: "Требует решения владельца")
            Text(item.nextActionRu ?: "Открыть письмо", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
        }
    }
}

@Composable
private fun OwnerEmptyBlock(title: String, text: String) {
    Card(Modifier.fillMaxWidth().testTag("mail_empty_state")) {
        Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
            Icon(Icons.Filled.Warning, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text(text, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

@Composable
private fun LoadingBlock() {
    Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.Center) {
        CircularProgressIndicator()
    }
}

@Composable
private fun InfoLine(label: String, value: String) {
    Column(Modifier.fillMaxWidth()) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium)
    }
}

private fun typeRu(type: String?): String = when (type) {
    "lead" -> "новый лид"
    "client" -> "клиент"
    "invoice" -> "счёт"
    "document" -> "документ"
    "deal_reply" -> "ответ по сделке"
    "bounce" -> "недоставка"
    "stop_request" -> "не контактировать"
    "system" -> "системное"
    "spam" -> "спам"
    else -> "не ясно"
}

private fun qualityRu(state: String?): String = when (state) {
    "PASS" -> "пройдено"
    "BLOCKED" -> "заблокировано"
    "NEEDS_OWNER_REVIEW" -> "проверить вручную"
    "REQUIRES_OWNER_DECISION" -> "нужно решение владельца"
    else -> "проверить"
}
