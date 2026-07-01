package ru.dmitry.matercontroller.feature.reservoir

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
import ru.dmitry.matercontroller.core.model.OwnerQueues
import ru.dmitry.matercontroller.core.model.OwnerSettingsDto
import ru.dmitry.matercontroller.core.model.ReservoirFunnelDto
import ru.dmitry.matercontroller.core.model.ReservoirSummaryDto
import ru.dmitry.matercontroller.core.ui.OwnerLocalization
import javax.inject.Inject

/**
 * Domain Reservoir + Pipeline Funnel + Capacity status (RC5). Read-only:
 * GET /reservoir/summary + /reservoir/funnel + owner-queues (current load) + owner/settings
 * (owner_queue_max). No mutation or send here. Counts render via «нет данных» when truly absent.
 */
data class ReservoirUi(
    val loading: Boolean = true,
    val error: String? = null,
    val summary: ReservoirSummaryDto? = null,
    val funnel: ReservoirFunnelDto? = null,
    val ownerQueues: OwnerQueues? = null,
    val settings: OwnerSettingsDto? = null,
    val offline: Boolean = false,
    val cachedAt: Long? = null,
) {
    /** Current owner-queue load = items awaiting an owner decision (best-effort, read-only). */
    val ownerQueueLoad: Int?
        get() = ownerQueues?.let { it.ready_for_send_review.size + it.agent_results_to_review + it.replies_received }

    val ownerQueueMax: Int? get() = settings?.owner_queue_max
}

@HiltViewModel
class ReservoirViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(ReservoirUi())
    val ui: StateFlow<ReservoirUi> = _ui.asStateFlow()

    init { refresh() }

    fun refresh() {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            val s = repo.reservoirSummary()
            val f = repo.reservoirFunnel()
            val q = repo.ownerQueues()
            val st = repo.ownerSettings()
            val anyData = (s as? DataResult.Success)?.data != null || (f as? DataResult.Success)?.data != null
            if (!anyData && s is DataResult.Error && f is DataResult.Error) {
                _ui.update { it.copy(loading = false, error = OwnerLocalization.renderErrorCodeRu(s.code)) }
                return@launch
            }
            _ui.update {
                it.copy(
                    loading = false,
                    summary = (s as? DataResult.Success)?.data ?: it.summary,
                    funnel = (f as? DataResult.Success)?.data ?: it.funnel,
                    ownerQueues = (q as? DataResult.Success)?.data ?: it.ownerQueues,
                    settings = (st as? DataResult.Success)?.data ?: it.settings,
                    offline = (s as? DataResult.Success)?.fromCache == true || (f as? DataResult.Success)?.fromCache == true,
                    cachedAt = (s as? DataResult.Success)?.cachedAt ?: (f as? DataResult.Success)?.cachedAt,
                    error = null,
                )
            }
        }
    }
}
