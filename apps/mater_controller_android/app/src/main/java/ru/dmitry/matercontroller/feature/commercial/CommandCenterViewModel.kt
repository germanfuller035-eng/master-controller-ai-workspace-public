package ru.dmitry.matercontroller.feature.commercial

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import ru.dmitry.matercontroller.core.data.DataResult
import ru.dmitry.matercontroller.core.data.ErrorCodes
import ru.dmitry.matercontroller.core.data.MaterRepository
import ru.dmitry.matercontroller.core.model.CommandResult
import ru.dmitry.matercontroller.core.model.CreateOpportunityBody
import ru.dmitry.matercontroller.core.model.LeadRef
import ru.dmitry.matercontroller.core.ui.OwnerLocalization
import javax.inject.Inject

/**
 * Gate C1-A owner command center. Drives the internal commercial chain
 * (opportunity → offer draft → owner decision → handoff → project → invoice draft) through the
 * single canonical writer. NO send, NO payment. Each step:
 *  - is owner-only (requireAuth on the backend),
 *  - is preceded by a preview the owner confirms,
 *  - is idempotency-safe (repository generates a key; an in-flight guard blocks double taps),
 *  - is blocked offline (commands are never served from cache),
 *  - surfaces a stale-revision (409) as a reload prompt.
 * The latest known store revision (from each command result) is threaded forward as expectedRevision
 * so a concurrent writer is detected.
 */
enum class C1AStep { OPPORTUNITY, OFFER, DECISION, HANDOFF, PROJECT, INVOICE }

data class CommandCenterUi(
    val leadId: String = "",
    val testOnly: Boolean = true,           // default ON in the app: owner opt-in to a real lead
    val productId: String = "mini_audit",
    val inFlight: Boolean = false,
    val error: String? = null,
    val staleRevision: Boolean = false,
    val lastRevision: Int? = null,
    // created entity ids as the chain progresses
    val opportunityId: String? = null,
    val offerId: String? = null,
    val dealId: String? = null,
    val handoffId: String? = null,
    val projectId: String? = null,
    val invoiceId: String? = null,
    val log: List<String> = emptyList(),
    // a pending step awaiting owner confirmation (preview dialog)
    val pendingStep: C1AStep? = null,
    val pendingDecision: String? = null,
)

@HiltViewModel
class CommandCenterViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(CommandCenterUi())
    val ui: StateFlow<CommandCenterUi> = _ui.asStateFlow()

    fun setLeadId(v: String) = _ui.update { it.copy(leadId = v) }
    fun setTestOnly(v: Boolean) = _ui.update { it.copy(testOnly = v) }

    // Show the preview/confirm dialog for a step.
    fun requestStep(step: C1AStep, decision: String? = null) =
        _ui.update { it.copy(pendingStep = step, pendingDecision = decision, error = null, staleRevision = false) }
    fun cancelStep() = _ui.update { it.copy(pendingStep = null, pendingDecision = null) }

    // Confirm + execute the pending step. Idempotency-safe; blocks if already in flight.
    fun confirmStep() {
        val s = _ui.value
        val step = s.pendingStep ?: return
        if (s.inFlight) return
        _ui.update { it.copy(inFlight = true, pendingStep = null, error = null, staleRevision = false) }
        viewModelScope.launch {
            val rev = s.lastRevision
            val res: DataResult<CommandResult> = when (step) {
                C1AStep.OPPORTUNITY -> repo.createOpportunity(
                    CreateOpportunityBody(
                        lead = LeadRef(lead_id = s.leadId.trim(), verification_status = "verified"),
                        productId = s.productId, expectedRevision = rev, testOnly = s.testOnly,
                    )
                )
                C1AStep.OFFER -> repo.prepareOffer(s.opportunityId.orEmpty(), rev)
                C1AStep.DECISION -> repo.recordOwnerDecision(s.offerId.orEmpty(), s.pendingDecision ?: "APPROVE", rev)
                C1AStep.HANDOFF -> repo.createHandoff(s.dealId.orEmpty(), rev)
                C1AStep.PROJECT -> repo.createProject(s.handoffId.orEmpty(), rev)
                C1AStep.INVOICE -> repo.createInvoiceDraft(s.dealId, s.projectId, rev)
            }
            when (res) {
                is DataResult.Success -> applySuccess(step, res.data)
                is DataResult.Error -> applyError(res.code, res.message)
            }
        }
    }

    private fun applySuccess(step: C1AStep, r: CommandResult) {
        _ui.update {
            val newLog = it.log + "${labelOf(step)} → создано (${r.entity ?: ""} ${r.id ?: ""}, ревизия ${r.revision ?: "—"})"
            when (step) {
                C1AStep.OPPORTUNITY -> it.copy(opportunityId = r.id, lastRevision = r.revision, inFlight = false, log = newLog)
                C1AStep.OFFER -> it.copy(offerId = r.id, lastRevision = r.revision, inFlight = false, log = newLog)
                // recordOwnerDecision(APPROVE) wins the deal in the same flow and returns dealId.
                C1AStep.DECISION -> it.copy(dealId = r.dealId ?: it.dealId, lastRevision = r.revision, inFlight = false, log = newLog)
                C1AStep.HANDOFF -> it.copy(handoffId = r.id, lastRevision = r.revision, inFlight = false, log = newLog)
                C1AStep.PROJECT -> it.copy(projectId = r.id, lastRevision = r.revision, inFlight = false, log = newLog)
                C1AStep.INVOICE -> it.copy(invoiceId = r.id, lastRevision = r.revision, inFlight = false, log = newLog)
            }
        }
    }

    private fun applyError(code: String, message: String) {
        val stale = code == ErrorCodes.CONFLICT
        _ui.update {
            it.copy(
                inFlight = false,
                staleRevision = stale,
                error = if (stale) "Данные изменились на сервере. Обновите и повторите." else OwnerLocalization.renderErrorCodeRu(code).ifBlank { message },
            )
        }
    }

    companion object {
        fun labelOf(step: C1AStep): String = when (step) {
            C1AStep.OPPORTUNITY -> "Возможность"
            C1AStep.OFFER -> "Предложение (черновик)"
            C1AStep.DECISION -> "Решение владельца"
            C1AStep.HANDOFF -> "Передача в работу"
            C1AStep.PROJECT -> "Проект"
            C1AStep.INVOICE -> "Счёт (черновик)"
        }
    }
}
