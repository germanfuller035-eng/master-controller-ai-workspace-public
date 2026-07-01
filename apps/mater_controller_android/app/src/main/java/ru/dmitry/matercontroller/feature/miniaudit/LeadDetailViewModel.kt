package ru.dmitry.matercontroller.feature.miniaudit

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
import ru.dmitry.matercontroller.core.model.ApprovalIntent
import ru.dmitry.matercontroller.core.model.AuditData
import ru.dmitry.matercontroller.core.model.AuditDto
import ru.dmitry.matercontroller.core.model.EmailArtifactDto
import ru.dmitry.matercontroller.core.model.EmailPreviewData
import ru.dmitry.matercontroller.core.model.Lead
import ru.dmitry.matercontroller.core.model.LeadArtifactsDto
import javax.inject.Inject

data class LeadDetailUi(
    val loading: Boolean = true,
    val error: String? = null,
    val lead: Lead? = null,
    val audit: AuditData? = null,
    val email: EmailPreviewData? = null,
    // RC6 (defect B): authoritative artifacts — audit and client email are DISTINCT artifacts.
    // The «Аудит» tab renders artifactAudit; the «Письмо» tab renders artifactEmail. When
    // artifactAudit.audit_ready == false the audit tab shows «Аудит не готов: <status>» and the
    // email is NOT shown in its place. audit_equals_email is always false → badge.
    val artifacts: LeadArtifactsDto? = null,
    val artifactAudit: AuditDto? = null,
    val artifactEmail: EmailArtifactDto? = null,
    // approval flow
    val approval: ApprovalIntent? = null,
    val actionInFlight: Boolean = false,
    val actionMessage: String? = null,
    val sendResult: String? = null,
)

@HiltViewModel
class LeadDetailViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(LeadDetailUi())
    val ui: StateFlow<LeadDetailUi> = _ui.asStateFlow()
    private var leadId: String = ""

    fun load(id: String) {
        leadId = id
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            val lead = repo.lead(id)
            val audit = repo.audit(id)
            val email = repo.emailPreview(id)
            // RC6 (defect B): authoritative artifacts (audit ≠ email). Best-effort; falls back to the
            // legacy audit/email-preview reads above when the artifacts endpoint is unavailable.
            val artifacts = repo.leadArtifacts(id)
            when (lead) {
                is DataResult.Success -> _ui.update {
                    val art = (artifacts as? DataResult.Success)?.data
                    it.copy(
                        loading = false, lead = lead.data,
                        audit = (audit as? DataResult.Success)?.data,
                        email = (email as? DataResult.Success)?.data,
                        artifacts = art,
                        artifactAudit = art?.audit,
                        artifactEmail = art?.email,
                    )
                }
                is DataResult.Error -> _ui.update { it.copy(loading = false, error = lead.message) }
            }
        }
    }

    /** Step 1: create the approval intent (server re-checks eligibility). */
    fun prepareSend() {
        _ui.update { it.copy(actionInFlight = true, actionMessage = null) }
        viewModelScope.launch {
            when (val r = repo.sendPrepare(leadId)) {
                is DataResult.Success -> _ui.update { it.copy(actionInFlight = false, approval = r.data) }
                is DataResult.Error -> _ui.update { it.copy(actionInFlight = false, actionMessage = mapError(r.code, r.message)) }
            }
        }
    }

    /** Step 2: owner confirms — the only path that can trigger a real send (blocked in no-send mode). */
    fun confirmSend() {
        val approval = _ui.value.approval ?: return
        _ui.update { it.copy(actionInFlight = true, actionMessage = null) }
        viewModelScope.launch {
            when (val r = repo.approve(approval.approvalId)) {
                is DataResult.Success -> _ui.update { it.copy(actionInFlight = false, approval = null, sendResult = "Запрос обработан сервером") }
                is DataResult.Error -> _ui.update { it.copy(actionInFlight = false, actionMessage = mapError(r.code, r.message)) }
            }
            load(leadId)
        }
    }

    fun cancelApproval() {
        val approval = _ui.value.approval
        _ui.update { it.copy(approval = null) }
        if (approval != null) viewModelScope.launch { repo.reject(approval.approvalId) }
    }

    fun dismissMessage() = _ui.update { it.copy(actionMessage = null, sendResult = null) }

    private fun mapError(code: String, message: String): String = when (code) {
        "LEAD_NOT_SENDABLE" -> "Лид не готов к отправке: $message"
        "UNAUTHORIZED" -> "Требуется повторное подключение"
        "NETWORK" -> "Нет соединения с API"
        else -> message
    }
}
