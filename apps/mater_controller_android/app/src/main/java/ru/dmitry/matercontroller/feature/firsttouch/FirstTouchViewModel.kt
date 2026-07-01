package ru.dmitry.matercontroller.feature.firsttouch

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
import ru.dmitry.matercontroller.core.model.FirstTouchArtifactDto
import ru.dmitry.matercontroller.core.model.FirstTouchCandidatesDto
import ru.dmitry.matercontroller.core.model.FirstTouchSummaryDto
import ru.dmitry.matercontroller.core.ui.OwnerLocalization
import javax.inject.Inject

/**
 * «Первое касание» — read-only owner view of the First Touch Strategist. Shows scored candidates,
 * the recommended pilot, hook evidence, subject/body variants, quality/compliance/deliverability.
 * NO send action exists here: the controlled send gate is disabled and surfaced as such.
 */
data class FirstTouchUi(
    val loading: Boolean = true,
    val error: String? = null,
    val summary: FirstTouchSummaryDto? = null,
    val candidates: FirstTouchCandidatesDto? = null,
    val selected: FirstTouchArtifactDto? = null,
    val offline: Boolean = false,
    val cachedAt: Long? = null,
    // 0.6.0-rc10: owner command state (no-send)
    val commandBusy: Boolean = false,
    val commandMessage: String? = null,
    val activeDraftId: String? = null,
    val textApproved: Boolean = false,
    val selectedPilot: String? = null,
)

@HiltViewModel
class FirstTouchViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(FirstTouchUi())
    val ui: StateFlow<FirstTouchUi> = _ui.asStateFlow()

    init { refresh() }

    fun refresh() {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            val s = repo.firstTouchSummary()
            val c = repo.firstTouchCandidates()
            _ui.update {
                it.copy(
                    loading = false,
                    summary = (s as? DataResult.Success)?.data,
                    candidates = (c as? DataResult.Success)?.data,
                    offline = (s as? DataResult.Success)?.fromCache == true,
                    cachedAt = (s as? DataResult.Success)?.cachedAt,
                    error = if (s is DataResult.Error && it.summary == null) OwnerLocalization.renderErrorCodeRu(s.code) else null,
                )
            }
        }
    }

    fun openCandidate(leadId: String) {
        viewModelScope.launch {
            when (val r = repo.firstTouchCandidate(leadId)) {
                is DataResult.Success -> _ui.update { it.copy(selected = r.data) }
                is DataResult.Error -> _ui.update { it.copy(error = OwnerLocalization.renderErrorCodeRu(r.code)) }
            }
        }
    }

    fun closeCandidate() { _ui.update { it.copy(selected = null, activeDraftId = null, textApproved = false, commandMessage = null) } }

    // ---- 0.6.0-rc10 owner commands (no-send). Every command re-reads the store revision first
    // (optimistic concurrency), runs the command, and reports success ONLY from the server result.
    // None of these can send: approve-text-only echoes send_allowed_live=false. ----
    private suspend fun currentRevision(): Int? =
        (repo.storeRevision() as? DataResult.Success)?.data?.revision

    private fun runCommand(label: String, block: suspend (Int?) -> DataResult<ru.dmitry.matercontroller.core.model.FirstTouchCommandResult>) {
        _ui.update { it.copy(commandBusy = true, commandMessage = null, error = null) }
        viewModelScope.launch {
            val rev = currentRevision()
            when (val r = block(rev)) {
                is DataResult.Success -> _ui.update {
                    it.copy(
                        commandBusy = false,
                        commandMessage = "$label — готово (отправка не выполняется)",
                        activeDraftId = r.data.draftId ?: it.activeDraftId,
                        textApproved = if (r.data.textApproved) true else it.textApproved,
                        selectedPilot = r.data.selectedPilot ?: it.selectedPilot,
                    )
                }
                is DataResult.Error -> _ui.update {
                    it.copy(commandBusy = false, commandMessage = "$label — ${OwnerLocalization.renderErrorCodeRu(r.code)}")
                }
            }
        }
    }

    fun generateDraft(leadId: String) = runCommand("Черновик") { repo.firstTouchGenerateDraft(leadId, it) }
    fun selectSubject(subjectId: String) { val d = _ui.value.activeDraftId ?: return; runCommand("Тема") { repo.firstTouchSelectSubject(d, subjectId, it) } }
    fun selectBody(bodyId: String) { val d = _ui.value.activeDraftId ?: return; runCommand("Текст") { repo.firstTouchSelectBody(d, bodyId, it) } }
    fun approveTextOnly() { val d = _ui.value.activeDraftId ?: return; runCommand("Одобрение текста") { repo.firstTouchApproveTextOnly(d, it) } }
    fun requestChanges(note: String) { val d = _ui.value.activeDraftId ?: return; runCommand("Правки") { repo.firstTouchRequestChanges(d, note, it) } }
    fun reject(reason: String) { val d = _ui.value.activeDraftId ?: return; runCommand("Отклонение") { repo.firstTouchReject(d, reason, it) } }
    fun returnToAudit() { val d = _ui.value.activeDraftId ?: return; runCommand("Возврат на аудит") { repo.firstTouchReturnToAudit(d, it) } }
    fun selectPilot(leadId: String) = runCommand("Выбор лида") { repo.firstTouchSelectPilot(leadId, it) }
}
