package ru.dmitry.matercontroller.feature.home

import androidx.lifecycle.ViewModel
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
import ru.dmitry.matercontroller.core.model.MiniAuditStatus
import ru.dmitry.matercontroller.core.model.NextActionData
import ru.dmitry.matercontroller.core.model.AutomationStatusDto
import ru.dmitry.matercontroller.core.model.CommandBrief
import ru.dmitry.matercontroller.core.model.CommercialAutonomyStartBody
import ru.dmitry.matercontroller.core.model.CommercialAutonomyStatus
import ru.dmitry.matercontroller.core.model.CostOverview
import ru.dmitry.matercontroller.core.model.IncidentsSummary
import ru.dmitry.matercontroller.core.model.OutreachQueueData
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import javax.inject.Inject

data class TodayUi(
    val loading: Boolean = true,
    val error: String? = null,
    val status: MiniAuditStatus? = null,
    val nextAction: NextActionData? = null,
    val automation: AutomationStatusDto? = null,
    val autonomy: CommercialAutonomyStatus? = null,
    val replyAttention: Int = 0,
    val deadLetters: Int = 0,
    val cost: CostOverview? = null,
    val incidents: IncidentsSummary? = null,
    val brief: CommandBrief? = null,
    val outreachQueue: OutreachQueueData? = null,
    val apiOk: Boolean = false,
    val offline: Boolean = false,
    val cachedAt: Long? = null,
    val actionBusy: Boolean = false,
    val notice: String? = null,
)

@HiltViewModel
class TodayViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(TodayUi())
    val ui: StateFlow<TodayUi> = _ui.asStateFlow()
    private var autoRefillRequested = false

    init { refresh(ownerRequested = false) }

    fun refresh() {
        refresh(ownerRequested = true)
    }

    private fun refresh(ownerRequested: Boolean, actionNotice: String? = null) {
        _ui.update {
            it.copy(
                loading = true,
                error = null,
                notice = actionNotice ?: if (ownerRequested) "Обновляем данные..." else it.notice,
            )
        }
        viewModelScope.launch {
            val st = repo.status()
            val na = repo.nextAction()
            // Aggregate operational signals from backend (never recomputed locally).
            val autoRes = repo.automationStatus2()
            val costRes = repo.costOverview()
            val incidentsRes = repo.ownerIncidentsSummary()
            val briefRes = repo.commandBrief()
            val outreachQueueRes = repo.outreachQueue(limit = 25)
            val autonomyRes = repo.commercialAutonomyStatus()
            val auto = (autoRes as? DataResult.Success)?.data
            val autonomy = (autonomyRes as? DataResult.Success)?.data
            val outreachQueue = (outreachQueueRes as? DataResult.Success)?.data
            val replyCounts = (repo.replyCounts() as? DataResult.Success)?.data
            val status = (st as? DataResult.Success)?.data
            val next = (na as? DataResult.Success)?.data
            val cost = (costRes as? DataResult.Success)?.data
            val incidents = (incidentsRes as? DataResult.Success)?.data
            val brief = (briefRes as? DataResult.Success)?.data
            // Offline = any successful read served from cache.
            val reads = listOf(st, na, autoRes, autonomyRes, outreachQueueRes, costRes, incidentsRes, briefRes)
            val fromCache = reads.any { it is DataResult.Success<*> && it.fromCache }
            val cachedAt = reads.mapNotNull { (it as? DataResult.Success<*>)?.cachedAt }.maxOrNull()
            if (status == null && next == null && auto == null && autonomy == null && outreachQueue == null && cost == null && incidents == null && brief == null) {
                val message = ownerActionError("Обновление", (st as? DataResult.Error)?.message)
                _ui.update {
                    it.copy(
                        loading = false,
                        error = message,
                        notice = if (ownerRequested) message else it.notice,
                        apiOk = false,
                        offline = false,
                    )
                }
            } else {
                _ui.update {
                    val notice = actionNotice ?: when {
                        ownerRequested && fromCache -> "Сервер не ответил. Показан сохранённый снимок."
                        ownerRequested -> "Обновлено: ${formatClock(System.currentTimeMillis())}"
                        else -> it.notice
                    }
                    it.copy(
                        loading = false, status = status, nextAction = next, automation = auto, autonomy = autonomy,
                        replyAttention = (replyCounts?.newCount ?: 0) + (replyCounts?.interested ?: 0),
                        deadLetters = auto?.deadLetter ?: 0,
                        outreachQueue = outreachQueue,
                        cost = cost,
                        incidents = incidents,
                        brief = brief,
                        apiOk = !fromCache, error = null, offline = fromCache, cachedAt = cachedAt,
                        notice = notice,
                    )
                }
                maybeStartAutoRefill(outreachQueue, autonomy)
            }
        }
    }

    fun startLeadgen() {
        val beforeReady = _ui.value.outreachQueue?.readyCount ?: 0
        val beforeTotal = _ui.value.outreachQueue?.items?.size ?: 0
        _ui.update { it.copy(actionBusy = true, notice = "Запускаю поиск лидов...", error = null) }
        viewModelScope.launch {
            when (val res = repo.commercialAutonomyStartLeadgen(CommercialAutonomyStartBody(limit = 20))) {
                is DataResult.Success -> {
                    val message = res.data.ownerVisibleRu?.status
                        ?: "Поиск лидов поставлен в очередь. Отправка остаётся только по вашему подтверждению."
                    _ui.update {
                        it.copy(
                            actionBusy = true,
                            autonomy = res.data.after ?: it.autonomy,
                            notice = message,
                            error = null,
                        )
                    }
                    refreshQueueAfterSearch(beforeReady, beforeTotal, message)
                }
                is DataResult.Error -> {
                    val message = ownerActionError("Поиск лидов", res.message)
                    _ui.update { it.copy(actionBusy = false, error = message, notice = message) }
                }
            }
        }
    }

    private suspend fun refreshQueueAfterSearch(beforeReady: Int, beforeTotal: Int, startedMessage: String) {
        val delays = listOf(0L, 2_000L, 5_000L)
        var lastError: DataResult.Error? = null
        for ((idx, waitMs) in delays.withIndex()) {
            if (waitMs > 0) delay(waitMs)
            when (val q = repo.outreachQueue(limit = 25)) {
                is DataResult.Success -> {
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
                            actionBusy = idx < delays.lastIndex && !q.fromCache && readyDelta <= 0 && totalDelta <= 0,
                            outreachQueue = q.data,
                            offline = q.fromCache,
                            apiOk = !q.fromCache,
                            error = if (q.fromCache) message else null,
                            notice = message,
                        )
                    }
                    if (!q.fromCache && (readyDelta > 0 || totalDelta > 0 || idx == delays.lastIndex)) {
                        _ui.update { it.copy(actionBusy = false) }
                        refresh(ownerRequested = false, actionNotice = message)
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
        val message = if (err != null) ownerActionError("Поиск лидов", err.message) else "Поиск не подтвердился. Нажмите «Обновить»."
        _ui.update { it.copy(actionBusy = false, error = message, notice = message) }
    }

    private fun maybeStartAutoRefill(queue: OutreachQueueData?, autonomy: CommercialAutonomyStatus?) {
        if (autoRefillRequested) return
        if (queue == null || autonomy == null) return
        if (autonomy.flags?.leadDiscoveryEnabled != true) return
        if ((autonomy.active?.leadDiscoveryJobs ?: 0) > 0) return
        if ((autonomy.active?.totalWorkingJobs ?: 0) > 0) return
        if (queue.readyCount >= AUTO_REFILL_MIN_READY) return
        autoRefillRequested = true
        _ui.update {
            it.copy(
                notice = "Автопополнение лидов запущено. Отправка писем остаётся только вручную.",
            )
        }
        viewModelScope.launch {
            when (val res = repo.commercialAutonomyStartLeadgen(CommercialAutonomyStartBody(limit = AUTO_REFILL_BATCH_LIMIT))) {
                is DataResult.Success -> _ui.update {
                    it.copy(
                        autonomy = res.data.after ?: it.autonomy,
                        notice = res.data.ownerVisibleRu?.status ?: "Автопополнение лидов запущено. Отправка писем остаётся только вручную.",
                    )
                }
                is DataResult.Error -> {
                    autoRefillRequested = false
                    _ui.update { it.copy(error = res.message) }
                }
            }
        }
    }

    companion object {
        private const val AUTO_REFILL_MIN_READY = 10
        private const val AUTO_REFILL_BATCH_LIMIT = 20
    }
}

private fun ownerActionError(action: String, rawMessage: String?): String {
    val message = rawMessage.orEmpty()
    val low = message.lowercase(Locale.ROOT)
    return when {
        "unauthorized" in low || "требуется повторное" in low ->
            "$action не выполнен: нужно заново подключить устройство к серверу."
        "timeout" in low || "failed to connect" in low || "unable to resolve" in low ||
            "network" in low || "closed" in low || "ssl" in low ->
            "$action не выполнен: сервер сейчас недоступен с телефона. Проверьте интернет и подключение к серверу."
        message.isBlank() -> "$action не выполнен: сервер сейчас недоступен."
        else -> "$action не выполнен: $message"
    }
}

private fun formatClock(value: Long): String =
    SimpleDateFormat("HH:mm", Locale("ru", "RU")).format(Date(value))
