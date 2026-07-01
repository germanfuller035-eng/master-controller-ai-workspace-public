package ru.dmitry.matercontroller.feature.outreach

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import ru.dmitry.matercontroller.core.data.DataResult
import ru.dmitry.matercontroller.core.data.MaterRepository
import ru.dmitry.matercontroller.core.model.CommercialAutonomyStartBody
import ru.dmitry.matercontroller.core.model.OutreachLeadDetail
import ru.dmitry.matercontroller.core.model.OutreachLeadRow
import ru.dmitry.matercontroller.core.model.OutreachQueueData
import javax.inject.Inject

private const val CONTACT_OPT_OUT_FOOTER = "Если обращения не нужны, ответьте одним словом, и я больше не напишу."

private fun withContactOptOut(body: String): String {
    val text = body.trim()
    if (text.isBlank()) return text
    if (text.contains("если обращения не нужны", ignoreCase = true) ||
        text.contains("больше не напиш", ignoreCase = true)
    ) {
        return text
    }
    return "$text\n\n$CONTACT_OPT_OUT_FOOTER"
}

data class OutreachUi(
    val loading: Boolean = true,
    val busy: Boolean = false,
    val queue: OutreachQueueData? = null,
    val detail: OutreachLeadDetail? = null,
    val selectedLeadId: String? = null,
    val subject: String = "",
    val body: String = "",
    val error: String? = null,
    val notice: String? = null,
    val fromCache: Boolean = false,
)

@HiltViewModel
class OutreachQueueViewModel @Inject constructor(
    private val repo: MaterRepository,
) : ViewModel() {
    private val _ui = MutableStateFlow(OutreachUi())
    val ui: StateFlow<OutreachUi> = _ui.asStateFlow()

    init { refresh() }

    fun refresh() {
        _ui.update { it.copy(loading = true, error = null, notice = "Обновляем очередь лидов...") }
        viewModelScope.launch {
            when (val q = repo.outreachQueue(25)) {
                is DataResult.Success -> {
                    val selected = _ui.value.detail?.leadId?.takeIf { id -> q.data.items.any { it.leadId == id } }
                        ?: _ui.value.selectedLeadId?.takeIf { id -> q.data.items.any { it.leadId == id } }
                        ?: q.data.items.firstOrNull()?.leadId
                    val message = if (q.fromCache) {
                        "Сервер не ответил. Показан сохранённый список."
                    } else {
                        queueUpdatedMessage(q.data)
                    }
                    _ui.update {
                        it.copy(
                            loading = false,
                            queue = q.data,
                            selectedLeadId = selected,
                            fromCache = q.fromCache,
                            error = if (q.fromCache) message else null,
                            notice = message,
                        )
                    }
                    if (selected != null) openLeadAfterQueueAction(selected) else _ui.update { it.copy(detail = null, selectedLeadId = null, subject = "", body = "") }
                }
                is DataResult.Error -> _ui.update { it.copy(loading = false, error = ownerError(q.code, q.message)) }
            }
        }
    }

    fun startLeadgen() {
        val beforeReady = _ui.value.queue?.readyCount ?: 0
        val beforeTotal = _ui.value.queue?.items?.size ?: 0
        _ui.update { it.copy(busy = true, notice = "Ищем лидов. Отправка не запускается.", error = null) }
        viewModelScope.launch {
            when (val r = repo.commercialAutonomyStartLeadgen(CommercialAutonomyStartBody(limit = 20))) {
                is DataResult.Success -> {
                    val startedMessage = r.data.ownerVisibleRu?.status ?: "Поиск лидов запущен. Проверяем очередь."
                    _ui.update { it.copy(notice = startedMessage) }
                    refreshQueueAfterSearch(beforeReady, beforeTotal, startedMessage)
                }
                is DataResult.Error -> _ui.update { it.copy(busy = false, error = ownerError(r.code, r.message)) }
            }
        }
    }

    private suspend fun refreshQueueAfterSearch(beforeReady: Int, beforeTotal: Int, startedMessage: String) {
        val delays = listOf(0L, 2_000L, 5_000L)
        var lastError: DataResult.Error? = null
        for ((idx, waitMs) in delays.withIndex()) {
            if (waitMs > 0) delay(waitMs)
            when (val q = repo.outreachQueue(25)) {
                is DataResult.Success -> {
                    val selected = _ui.value.selectedLeadId?.takeIf { id -> q.data.items.any { it.leadId == id } }
                        ?: _ui.value.detail?.leadId?.takeIf { id -> q.data.items.any { it.leadId == id } }
                        ?: q.data.items.firstOrNull()?.leadId
                    val readyDelta = q.data.readyCount - beforeReady
                    val totalDelta = q.data.items.size - beforeTotal
                    val message = when {
                        q.fromCache -> "Поиск запущен, но сервер не вернул свежий список. Показан сохранённый список."
                        readyDelta > 0 -> "Найдено новых готовых лидов: $readyDelta. Очередь обновлена."
                        totalDelta > 0 -> "Найдено новых лидов: $totalDelta. Проверьте очередь."
                        idx < delays.lastIndex -> "Поиск запущен. Ждём результат и обновляем очередь..."
                        else -> "$startedMessage Очередь проверена: новых лидов пока нет."
                    }
                    _ui.update {
                        it.copy(
                            busy = idx < delays.lastIndex && !q.fromCache && readyDelta <= 0 && totalDelta <= 0,
                            loading = false,
                            queue = q.data,
                            selectedLeadId = selected,
                            fromCache = q.fromCache,
                            error = if (q.fromCache) message else null,
                            notice = message,
                        )
                    }
                    if (!q.fromCache && (readyDelta > 0 || totalDelta > 0 || idx == delays.lastIndex)) {
                        selected?.let { openLeadAfterQueueAction(it) }
                        _ui.update { it.copy(busy = false) }
                        return
                    }
                }
                is DataResult.Error -> {
                    lastError = q
                    delay(1_000L)
                }
            }
        }
        val err = lastError
        _ui.update {
            it.copy(
                busy = false,
                loading = false,
                error = if (err != null) ownerError(err.code, err.message) else "Поиск не подтвердился. Нажмите «Обновить».",
            )
        }
    }

    fun openLead(leadId: String) {
        openLeadInternal(leadId, clearNotice = true)
    }

    private fun openLeadAfterQueueAction(leadId: String) {
        openLeadInternal(leadId, clearNotice = false)
    }

    private fun openLeadInternal(leadId: String, clearNotice: Boolean) {
        _ui.update { it.copy(busy = true, selectedLeadId = leadId, error = null, notice = if (clearNotice) null else it.notice) }
        viewModelScope.launch {
            when (val d = repo.outreachLead(leadId)) {
                is DataResult.Success -> _ui.update {
                    it.copy(
                        busy = false,
                        detail = d.data,
                        selectedLeadId = d.data.leadId,
                        subject = d.data.draft.subject,
                        body = d.data.draft.body,
                    )
                }
                is DataResult.Error -> _ui.update {
                    if (d.code == "LEAD_NOT_FOUND" || d.code == "NOT_FOUND") {
                        it.copy(
                            busy = false,
                            detail = null,
                            selectedLeadId = null,
                            subject = "",
                            body = "",
                            error = ownerError(d.code, d.message),
                        )
                    } else {
                        it.copy(busy = false, error = ownerError(d.code, d.message))
                    }
                }
            }
        }
    }

    fun setSubject(v: String) { _ui.update { it.copy(subject = v) } }
    fun setBody(v: String) { _ui.update { it.copy(body = v) } }

    fun saveDraft() {
        val d = _ui.value.detail ?: return
        val subjectToSave = _ui.value.subject
        val bodyToSave = withContactOptOut(_ui.value.body)
        _ui.update { it.copy(busy = true, error = null, notice = null) }
        viewModelScope.launch {
            when (val r = repo.outreachSaveDraft(d.leadId, subjectToSave, bodyToSave)) {
                is DataResult.Success -> _ui.update {
                    it.copy(
                        busy = false,
                        detail = r.data,
                        subject = r.data.draft.subject,
                        body = r.data.draft.body,
                        notice = "Черновик сохранён. Ничего не отправлено.",
                    )
                }
                is DataResult.Error -> _ui.update {
                    if (r.code == "LEAD_NOT_FOUND" || r.code == "NOT_FOUND") {
                        it.copy(
                            busy = false,
                            detail = null,
                            selectedLeadId = null,
                            subject = "",
                            body = "",
                            error = ownerError(r.code, r.message),
                        )
                    } else {
                        it.copy(busy = false, error = ownerError(r.code, r.message))
                    }
                }
            }
        }
    }

    fun sendOne() {
        val d = _ui.value.detail ?: return
        _ui.update { it.copy(busy = true, error = null, notice = null) }
        viewModelScope.launch {
            when (val r = repo.outreachSend(d.leadId, d.exactRecipient, _ui.value.subject, _ui.value.body)) {
                is DataResult.Success -> {
                    _ui.update {
                        it.copy(
                            busy = false,
                            notice = "Письмо отправлено. Лид ждёт ответа.",
                        )
                    }
                    refresh()
                }
                is DataResult.Error -> _ui.update { it.copy(busy = false, error = ownerError(r.code, r.message)) }
            }
        }
    }

    fun postpone() = decide("postpone")
    fun skip() = decide("skip")
    fun reject() = decide("reject")

    private fun decide(kind: String) {
        val d = _ui.value.detail ?: return
        _ui.update { it.copy(busy = true, error = null, notice = null) }
        viewModelScope.launch {
            val res = when (kind) {
                "skip" -> repo.outreachSkip(d.leadId, "владелец пропустил")
                "reject" -> repo.outreachReject(d.leadId, "владелец отклонил")
                else -> repo.outreachPostpone(d.leadId, "владелец отложил")
            }
            when (res) {
                is DataResult.Success -> {
                    _ui.update { it.copy(busy = false, notice = "Решение сохранено.") }
                    refresh()
                }
                is DataResult.Error -> _ui.update { it.copy(busy = false, error = ownerError(res.code, res.message)) }
            }
        }
    }

    private fun ownerError(code: String, message: String): String = when (code) {
        "NETWORK" -> "Нет соединения с рабочим сервером. Запустите сервер или проверьте подключение, затем нажмите «Обновить»."
        "READ_ONLY" -> "Сейчас доступен только просмотр. Включите рабочую фиксацию и повторите действие."
        "LIVE_SEND_DISABLED" -> "Нужно отдельное разрешение на одну отправку этого письма."
        "OWNER_CONFIRMATION_REQUIRED" -> "Нужно подтверждение владельца на этот текст и получателя."
        "DUPLICATE_SEND_BLOCKED", "SEND_BLOCKED" -> "Отправка заблокирована: есть блокер или письмо уже отправлялось."
        "QUALITY_BLOCKED" -> "Проверка качества остановила письмо. Уберите неподтверждённые обещания."
        "LEAD_NOT_FOUND", "NOT_FOUND" -> "Лид обновился или уже убран из очереди. Нажмите «Обновить» и откройте актуальное письмо."
        else -> ownerSafeMessage(message)
    }

    private fun ownerSafeMessage(message: String): String {
        val low = message.lowercase()
        return when {
            message.isBlank() -> "Действие не выполнено. Обновите данные и повторите попытку."
            "failed to connect" in low ||
                "127.0.0.1" in low ||
                "localhost" in low ||
                "connectexception" in low ||
                "unknownhost" in low -> "Нет соединения с рабочим сервером. Запустите сервер или проверьте подключение, затем нажмите «Обновить»."
            else -> message
        }
    }

    private fun queueUpdatedMessage(data: OutreachQueueData): String =
        "Обновлено: готово ${data.readyCount}, всего в очереди ${data.items.size}."
}

@Composable
fun OutreachQueueScreen(
    onOpenManualWebsite: () -> Unit,
    vm: OutreachQueueViewModel = hiltViewModel(),
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val scrollState = rememberScrollState()
    LaunchedEffect(ui.detail?.leadId, ui.selectedLeadId) {
        if (ui.detail != null || ui.selectedLeadId != null) scrollState.animateScrollTo(0)
    }
    val selectedRow = ui.queue?.items?.firstOrNull { it.leadId == ui.selectedLeadId }
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(16.dp)
            .testTag("outreach_queue_screen"),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Лиды", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Text("Выберите лид, проверьте письмо, отправьте одно письмо.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        ui.detail?.let { detail ->
            LeadDetailCard(
                detail = detail,
                subject = ui.subject,
                body = ui.body,
                busy = ui.busy,
                liveSendEnabled = ui.queue?.liveSendEnabled == true,
                actionNotice = ui.notice,
                actionError = ui.error,
                onSubject = vm::setSubject,
                onBody = vm::setBody,
                onSave = vm::saveDraft,
                onSend = vm::sendOne,
                onReject = vm::reject,
            )
        }
        if (ui.detail == null && selectedRow != null) {
            LeadSelectedPreviewCard(row = selectedRow, busy = ui.busy, error = ui.error, onRefresh = vm::refresh)
        }
        StatusRow(ui)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            val actionsEnabled = !ui.busy && !ui.loading
            Button(onClick = vm::refresh, enabled = actionsEnabled, modifier = Modifier.weight(1f).height(52.dp).testTag("outreach_refresh")) {
                Icon(Icons.Filled.Refresh, contentDescription = null)
                Text("Обновить")
            }
            OutlinedButton(onClick = vm::startLeadgen, enabled = actionsEnabled, modifier = Modifier.weight(1f).height(52.dp).testTag("outreach_start_leadgen")) {
                Text("Найти")
            }
        }
        if (ui.detail != null) {
            ui.error?.let { ErrorCard(it) }
            ui.notice?.let { NoticeCard(it) }
        }
        OutlinedButton(onClick = onOpenManualWebsite, modifier = Modifier.fillMaxWidth().height(52.dp).testTag("outreach_manual_site")) {
            Text("Добавить сайт")
        }
        if (ui.detail == null) {
            ui.error?.let { ErrorCard(it) }
            ui.notice?.let { NoticeCard(it) }
        }
        val queue = ui.queue
        if (ui.loading) {
            Text("Загрузка очереди...", style = MaterialTheme.typography.bodyMedium)
        } else if (queue == null || queue.items.isEmpty()) {
            EmptyQueue()
        } else {
            Text("Очередь", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            queue.items.take(8).forEach { row ->
                LeadRow(row = row, selected = ui.selectedLeadId == row.leadId, onClick = { vm.openLead(row.leadId) })
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun StatusRow(ui: OutreachUi) {
    val q = ui.queue
    Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth().testTag("outreach_status")) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            AssistChip(onClick = {}, label = { Text("Готово: ${q?.readyCount ?: 0}") }, leadingIcon = { Icon(Icons.Filled.CheckCircle, null) })
            AssistChip(onClick = {}, label = { Text("Блокеры: ${q?.blockedCount ?: 0}") }, leadingIcon = { Icon(Icons.Filled.Warning, null) })
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            AssistChip(onClick = {}, label = { Text(if (q?.liveSendEnabled == true) "Почта готова" else "Нужно разрешение") }, leadingIcon = { Icon(Icons.Filled.Email, null) })
            AssistChip(onClick = {}, label = { Text("Платежи выкл") }, leadingIcon = { Icon(Icons.Filled.Block, null) })
        }
        if (ui.fromCache) Text("Показан сохранённый список. Нажмите «Обновить».", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
    }
}

@Composable
private fun LeadRow(row: OutreachLeadRow, selected: Boolean, onClick: () -> Unit) {
    ElevatedCard(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().testTag("outreach_lead_${row.leadId}"),
        colors = CardDefaults.elevatedCardColors(containerColor = if (selected) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(row.companyName, modifier = Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                OutlinedButton(onClick = onClick, modifier = Modifier.height(44.dp)) {
                    Text(if (row.readiness.ready) "Открыть" else "Проверить")
                }
            }
            Text(ownerWhatSells(row.whatSells), style = MaterialTheme.typography.bodyMedium)
            Text("${channelRu(row.contactChannel)} · ${riskRu(row)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun LeadSelectedPreviewCard(row: OutreachLeadRow, busy: Boolean, error: String?, onRefresh: () -> Unit) {
    ElevatedCard(Modifier.fillMaxWidth().testTag("outreach_selected_preview")) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Лид выбран", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            InfoLine("Лид", row.companyName)
            InfoLine("Что продаёт", ownerWhatSells(row.whatSells))
            InfoLine("Канал", channelRu(row.contactChannel))
            if (error != null) {
                Text(
                    "Письмо не загрузилось: нет связи с рабочим сервером.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                )
            } else {
                Text("Открываем письмо...", style = MaterialTheme.typography.bodyMedium)
            }
            OutlinedButton(onClick = onRefresh, enabled = !busy, modifier = Modifier.fillMaxWidth().height(52.dp)) {
                Text("Обновить")
            }
        }
    }
}

@Composable
private fun LeadDetailCard(
    detail: OutreachLeadDetail,
    subject: String,
    body: String,
    busy: Boolean,
    liveSendEnabled: Boolean,
    actionNotice: String?,
    actionError: String?,
    onSubject: (String) -> Unit,
    onBody: (String) -> Unit,
    onSave: () -> Unit,
    onSend: () -> Unit,
    onReject: () -> Unit,
) {
    ElevatedCard(Modifier.fillMaxWidth().testTag("outreach_detail_card")) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Письмо", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                AssistChip(onClick = {}, label = { Text(if (detail.readiness.ready) "готово" else "проверить") })
            }
            InfoLine("Лид", detail.companyName)
            InfoLine("Что продаёт", ownerWhatSells(detail.whatSells))
            InfoLine("Контакт", if (detail.exactRecipient.isBlank()) "не найден" else "найден")
            InfoLine("История", historyRu(detail))
            if (detail.readiness.blockers.isNotEmpty()) {
                Text("Что мешает отправке", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                detail.readiness.blockers.take(3).forEach { Text("• ${blockerRu(it)}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error) }
            }
            OutlinedTextField(
                value = subject,
                onValueChange = onSubject,
                label = { Text("Тема письма") },
                modifier = Modifier.fillMaxWidth().testTag("outreach_subject"),
                singleLine = false,
            )
            OutlinedTextField(
                value = body,
                onValueChange = onBody,
                label = { Text("Текст письма") },
                modifier = Modifier.fillMaxWidth().height(220.dp).testTag("outreach_body"),
            )
            QualityBlock(detail)
            actionError?.let { InlineActionMessage(text = it, isError = true) }
            actionNotice?.let { InlineActionMessage(text = it, isError = false) }
            Button(
                onClick = onSend,
                enabled = !busy && detail.readiness.ready && liveSendEnabled,
                modifier = Modifier.fillMaxWidth().height(56.dp).testTag("outreach_send_one"),
            ) {
                Icon(Icons.Filled.Send, contentDescription = null)
                Text(if (liveSendEnabled) "Отправить письмо" else "Нужно разрешение")
            }
            if (!liveSendEnabled) {
                Text("Отправка откроется только после отдельного разрешения на этот текст и получателя.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            }
            OutlinedButton(onClick = onSave, enabled = !busy, modifier = Modifier.fillMaxWidth().height(52.dp).testTag("outreach_save_draft")) {
                Text("Сохранить")
            }
            OutlinedButton(onClick = onReject, enabled = !busy, modifier = Modifier.fillMaxWidth().height(48.dp).testTag("outreach_reject")) {
                Text("Отклонить лид")
            }
        }
    }
}

@Composable
private fun QualityBlock(detail: OutreachLeadDetail) {
    Text("Проверка качества", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
    val checks = detail.draft.quality.checks
    if (checks.isEmpty()) {
        Text("Проверка выполнится после сохранения черновика.", style = MaterialTheme.typography.bodySmall)
    } else {
        checks.forEach { c ->
            InfoLine(c.labelRu.ifBlank { c.id }, qualityRu(c.state) + if (c.reasonRu.isNotBlank()) ": ${c.reasonRu}" else "")
        }
    }
}

@Composable
private fun InfoLine(label: String, value: String) {
    Column(Modifier.fillMaxWidth()) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun ErrorCard(text: String) {
    ElevatedCard(Modifier.fillMaxWidth().testTag("outreach_error"), colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
        Text(text, Modifier.padding(14.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onErrorContainer)
    }
}

@Composable
private fun NoticeCard(text: String) {
    ElevatedCard(Modifier.fillMaxWidth().testTag("outreach_notice")) {
        Text(text, Modifier.padding(14.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
    }
}

@Composable
private fun InlineActionMessage(text: String, isError: Boolean) {
    val colors = if (isError) {
        CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.errorContainer)
    } else {
        CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    }
    val textColor = if (isError) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onSurfaceVariant
    ElevatedCard(
        modifier = Modifier.fillMaxWidth().testTag(if (isError) "outreach_inline_error" else "outreach_inline_notice"),
        colors = colors,
    ) {
        Text(text, Modifier.padding(14.dp), style = MaterialTheme.typography.bodyMedium, color = textColor)
    }
}

@Composable
private fun EmptyQueue() {
    ElevatedCard(Modifier.fillMaxWidth().testTag("outreach_empty")) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Очередь пуста", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text("Запустите поиск лидов или разберите сайт вручную. Система не будет отправлять письма без вашего действия.", style = MaterialTheme.typography.bodyMedium)
        }
    }
}

private fun channelRu(v: String): String = when (v) {
    "email" -> "email"
    "contact_form" -> "форма"
    "telegram" -> "Telegram"
    "phone" -> "телефон"
    else -> "не найден"
}

private fun ownerWhatSells(value: String): String {
    val clean = value.trim()
    if (clean.isBlank()) return "не удалось уверенно определить — проверьте вручную"
    val lower = clean.lowercase()
    val rawTokens = setOf(
        "construction",
        "services",
        "consulting",
        "retail",
        "unknown",
        "other",
        "company",
    )
    if (lower in rawTokens || lower.matches(Regex("[a-z_\\-]+"))) {
        return "не удалось уверенно определить — проверьте вручную"
    }
    return clean
}

private fun riskRu(row: OutreachLeadRow): String = when {
    row.readiness.blockers.isNotEmpty() -> "есть блокер"
    row.readiness.warnings.isNotEmpty() -> "проверить"
    else -> "низкий"
}

private fun restrictionRu(v: String): String = when (v) {
    "PASS" -> "можно при точном подтверждении"
    "DO_NOT_CONTACT" -> "не контактировать"
    else -> "проверить"
}

private fun historyRu(d: OutreachLeadDetail): String = when {
    d.history.priorReplyExists -> "есть ответ, первое касание не нужно"
    d.history.priorOutreachExists -> "было прежнее касание, проверьте повтор"
    else -> "прежнее касание не найдено"
}

private fun blockerRu(v: String): String = when (v) {
    "CONTACT_MISSING" -> "нет подтверждённого получателя"
    "RECIPIENT_INVALID" -> "получатель выглядит некорректно"
    "DO_NOT_CONTACT" -> "есть запрет контакта"
    "BOUNCE_BLOCK" -> "есть признак недоставки"
    "DUPLICATE" -> "похожий контакт уже есть"
    "EXISTING_REPLY" -> "есть ответ, нужен другой маршрут"
    "ALREADY_SENT" -> "письмо уже отправлялось"
    "OWNER_REJECTED" -> "лид отклонён владельцем"
    "QUALITY_BLOCKED" -> "текст не прошёл проверку качества"
    else -> v
}

private fun qualityRu(v: String): String = when (v) {
    "PASS" -> "пройдено"
    "NEEDS_EDIT" -> "исправить"
    "BLOCKED" -> "стоп"
    else -> "проверить"
}
