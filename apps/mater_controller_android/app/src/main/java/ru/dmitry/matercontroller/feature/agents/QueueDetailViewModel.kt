package ru.dmitry.matercontroller.feature.agents

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import ru.dmitry.matercontroller.core.data.DataResult
import ru.dmitry.matercontroller.core.data.MaterRepository
import ru.dmitry.matercontroller.core.ui.OwnerLocalization
import javax.inject.Inject

/**
 * Queue kinds reachable from the owner-queues dashboard. Each maps to a route segment and a
 * count source. The send-review queue has its own dedicated offer-review screen and is NOT handled
 * here; the remaining queues are count/explanation views over existing read models (no new truth).
 */
enum class QueueKind(val routeKey: String, val titleRu: String, val explanationRu: String) {
    AWAITING_REPLY("awaiting-reply", "Ожидают ответа",
        "Предложения, по которым ожидается ответ. Реальных отправок ещё нет — отправка отключена."),
    REPLIES("replies", "Ответы получены",
        "Входящие ответы в диалогах. Открываются для проверки владельцем."),
    FOLLOWUP_REVIEW("followup-review", "Повторный контакт к рассмотрению",
        "Кандидаты на повторный контакт. Авто-отправка повторных сообщений отключена."),
    DELIVERY_RECONCILIATION("delivery-reconciliation", "Требуют сверки доставки",
        "Записи, где факт доставки требует сверки. Неподтверждённая доставка не считается отправкой."),
    AGENT_REVIEW("agent-review", "Агентские результаты на проверку",
        "Результаты теневого анализа агентов на проверку владельцем. Агенты не отправляют и не меняют данные."),
    TEST_RECORDS("test-records", "Служебные записи",
        "Служебные сущности для внутренней проверки. Исключены из бизнес-показателей.");

    companion object {
        fun fromKey(key: String?): QueueKind = entries.firstOrNull { it.routeKey == key } ?: AWAITING_REPLY
    }
}

data class QueueDetailUi(
    val loading: Boolean = true,
    val error: String? = null,
    val kind: QueueKind = QueueKind.AWAITING_REPLY,
    val count: Int = 0,
    val rows: List<String> = emptyList(),
    val offline: Boolean = false,
    val cachedAt: Long? = null,
)

@HiltViewModel
class QueueDetailViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(QueueDetailUi())
    val ui: StateFlow<QueueDetailUi> = _ui.asStateFlow()
    private var current: QueueKind = QueueKind.AWAITING_REPLY

    fun load(kind: QueueKind) {
        current = kind
        _ui.update { it.copy(loading = true, error = null, kind = kind) }
        viewModelScope.launch {
            when (val q = repo.ownerQueues()) {
                is DataResult.Success -> {
                    val d = q.data
                    val count = when (kind) {
                        QueueKind.AWAITING_REPLY -> d.awaiting_reply
                        QueueKind.REPLIES -> d.replies_received
                        QueueKind.FOLLOWUP_REVIEW -> d.followup_due
                        QueueKind.DELIVERY_RECONCILIATION -> d.delivery_review
                        QueueKind.AGENT_REVIEW -> d.agent_results_to_review
                        QueueKind.TEST_RECORDS -> d.test_records
                    }
                    _ui.update { it.copy(loading = false, kind = kind, count = count, offline = q.fromCache, cachedAt = q.cachedAt) }
                    // Enrich with concrete rows where a richer read model exists.
                    enrich(kind)
                }
                is DataResult.Error -> _ui.update { it.copy(loading = false, error = OwnerLocalization.renderErrorCodeRu(q.code)) }
            }
        }
    }

    fun refresh() = load(current)

    private fun enrich(kind: QueueKind) {
        viewModelScope.launch {
            when (kind) {
                QueueKind.REPLIES -> {
                    when (val r = repo.conversations()) {
                        is DataResult.Success -> _ui.update { it.copy(rows = r.data.items.mapNotNull { c -> c.lead_id ?: c.conversation_id }) }
                        is DataResult.Error -> {}
                    }
                }
                QueueKind.DELIVERY_RECONCILIATION -> {
                    when (val r = repo.deliveryContainment()) {
                        is DataResult.Success -> _ui.update { it.copy(rows = r.data.owner_review_queue.map { rec -> rec.leadId }) }
                        is DataResult.Error -> {}
                    }
                }
                else -> {}
            }
        }
    }
}
