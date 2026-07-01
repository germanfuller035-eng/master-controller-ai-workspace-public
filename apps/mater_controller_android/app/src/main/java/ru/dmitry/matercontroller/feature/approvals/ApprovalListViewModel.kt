package ru.dmitry.matercontroller.feature.approvals

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
import ru.dmitry.matercontroller.core.model.Lead
import ru.dmitry.matercontroller.core.model.PipelineLead
import ru.dmitry.matercontroller.core.model.ReplyItem
import ru.dmitry.matercontroller.core.ui.MutationPhase
import javax.inject.Inject

/**
 * Approval domain queues. Each maps to a canonical backend source:
 *  - AUDITS         → pipeline/by-status/audit_ready (+ audit body on detail)
 *  - DRAFTS         → pipeline/by-status/approval_pending
 *  - FOLLOWUPS      → mini-audit/followups
 *  - REPLY_DRAFTS   → replies needing a response (read-only inbound; drafts are proposals)
 *
 * Read + no-send mutations only (reject/defer/approve all go through the API; send stays OFF).
 * No queue is ever created or mutated locally; revisions and approval state come from backend.
 */
enum class ApprovalQueue(val key: String, val title: String, val status: String) {
    AUDITS("audits", "Аудиты", "audit_ready"),
    DRAFTS("drafts", "Черновики писем", "approval_pending"),
    FOLLOWUPS("followups", "Повторный контакт", "followups"),
    REPLY_DRAFTS("reply_drafts", "Черновики ответов", "needs_response");

    companion object {
        fun fromKey(k: String): ApprovalQueue = entries.firstOrNull { it.key.equals(k, true) } ?: AUDITS
    }
}

data class ApprovalListUi(
    val loading: Boolean = true,
    val error: String? = null,
    val errorCode: String? = null,
    val pipelineItems: List<PipelineLead> = emptyList(),
    val leadItems: List<Lead> = emptyList(),
    val replyItems: List<ReplyItem> = emptyList(),
    val offline: Boolean = false,
    val cachedAt: Long? = null,
    val queue: ApprovalQueue = ApprovalQueue.AUDITS,
) {
    val isEmpty: Boolean get() = !loading && error == null && pipelineItems.isEmpty() && leadItems.isEmpty() && replyItems.isEmpty()
}

@HiltViewModel
class ApprovalListViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(ApprovalListUi())
    val ui: StateFlow<ApprovalListUi> = _ui.asStateFlow()
    private var queue: ApprovalQueue = ApprovalQueue.AUDITS

    fun load(queue: ApprovalQueue) {
        this.queue = queue
        _ui.update { it.copy(queue = queue) }
        refresh()
    }

    fun refresh() {
        _ui.update { it.copy(loading = true, error = null, errorCode = null) }
        viewModelScope.launch {
            when (queue) {
                ApprovalQueue.FOLLOWUPS -> when (val r = repo.followups()) {
                    is DataResult.Success -> _ui.update { it.copy(loading = false, leadItems = r.data.items, pipelineItems = emptyList(), offline = r.fromCache, cachedAt = r.cachedAt) }
                    is DataResult.Error -> _ui.update { it.copy(loading = false, error = r.message, errorCode = r.code) }
                }
                ApprovalQueue.REPLY_DRAFTS -> when (val r = repo.replies(status = "needs_response")) {
                    is DataResult.Success -> _ui.update { it.copy(loading = false, replyItems = r.data.items, pipelineItems = emptyList(), leadItems = emptyList(), offline = r.fromCache, cachedAt = r.cachedAt, error = null) }
                    is DataResult.Error -> _ui.update { it.copy(loading = false, error = r.message, errorCode = r.code) }
                }
                else -> when (val r = repo.pipelineByStatus(queue.status)) {
                    is DataResult.Success -> _ui.update { it.copy(loading = false, pipelineItems = r.data.items, leadItems = emptyList(), offline = r.fromCache, cachedAt = r.cachedAt) }
                    is DataResult.Error -> _ui.update { it.copy(loading = false, error = r.message, errorCode = r.code) }
                }
            }
        }
    }
}
