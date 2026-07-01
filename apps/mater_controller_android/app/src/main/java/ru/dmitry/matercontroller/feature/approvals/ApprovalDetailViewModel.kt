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
import ru.dmitry.matercontroller.core.model.AuditData
import ru.dmitry.matercontroller.core.model.EmailPreviewData
import ru.dmitry.matercontroller.core.model.Lead
import ru.dmitry.matercontroller.core.ui.MutationPhase
import javax.inject.Inject

data class ApprovalDetailUi(
    val loading: Boolean = true,
    val error: String? = null,
    val errorCode: String? = null,
    val lead: Lead? = null,
    val audit: AuditData? = null,
    val emailPreview: EmailPreviewData? = null,
    val queue: ApprovalQueue = ApprovalQueue.AUDITS,
    // mutation
    val mutation: MutationPhase = MutationPhase.Idle,
    val mutationMessage: String? = null,
)

/**
 * Detail + no-send actions for an approval item. reject/defer always go through the API and
 * never assert delivery; approve is saved through the backend approval gate while send stays
 * OFF. A 409 surfaces as MutationPhase.Conflict and triggers a reload of canonical state.
 */
@HiltViewModel
class ApprovalDetailViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(ApprovalDetailUi())
    val ui: StateFlow<ApprovalDetailUi> = _ui.asStateFlow()
    private var leadId: String = ""
    private var queue: ApprovalQueue = ApprovalQueue.AUDITS

    fun load(queue: ApprovalQueue, leadId: String) {
        this.queue = queue
        this.leadId = leadId
        _ui.update { it.copy(queue = queue) }
        refresh()
    }

    fun refresh() {
        _ui.update { it.copy(loading = true, error = null, errorCode = null) }
        viewModelScope.launch {
            val leadRes = repo.lead(leadId)
            val lead = (leadRes as? DataResult.Success)?.data
            if (leadRes is DataResult.Error && lead == null) {
                val msg = if (leadRes.code == ru.dmitry.matercontroller.core.data.ErrorCodes.NETWORK)
                    "Нет соединения с сервером. Откройте экран при подключении." else leadRes.message
                _ui.update { it.copy(loading = false, error = msg, errorCode = leadRes.code) }
                return@launch
            }
            val audit = if (queue == ApprovalQueue.AUDITS) (repo.audit(leadId) as? DataResult.Success)?.data else null
            val email = if (queue == ApprovalQueue.DRAFTS) (repo.emailPreview(leadId) as? DataResult.Success)?.data else null
            _ui.update { it.copy(loading = false, lead = lead, audit = audit, emailPreview = email, error = null) }
        }
    }

    /** Defer the item (postpone). No-send. */
    fun defer() = mutate { repo.postponeFollowup(leadId) }

    /** Reject the lead's draft. No-send. */
    fun reject() = mutate { repo.setLeadStatus(leadId, "rejected", _ui.value.lead?.let { null }) }

    private fun mutate(block: suspend () -> DataResult<Boolean>) {
        if (_ui.value.mutation == MutationPhase.Submitting) return // prevent duplicate taps
        _ui.update { it.copy(mutation = MutationPhase.Submitting, mutationMessage = null) }
        viewModelScope.launch {
            val r = block()
            when (ru.dmitry.matercontroller.core.data.RepoLogic.reduceMutation(r)) {
                MutationPhase.Confirmed -> {
                    _ui.update { it.copy(mutation = MutationPhase.Confirmed, mutationMessage = "Решение сохранено. Письмо НЕ отправлено.") }
                    refresh()
                }
                MutationPhase.Conflict -> {
                    _ui.update { it.copy(mutation = MutationPhase.Conflict, mutationMessage = "Конфликт ревизии — состояние перезагружено.") }
                    refresh()
                }
                else -> {
                    val msg = (r as? DataResult.Error)?.message ?: "Ошибка"
                    _ui.update { it.copy(mutation = MutationPhase.Failed, mutationMessage = msg) }
                }
            }
        }
    }

    fun clearMutation() { _ui.update { it.copy(mutation = MutationPhase.Idle, mutationMessage = null) } }
}
