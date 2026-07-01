package ru.dmitry.matercontroller.feature.pipeline

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
import ru.dmitry.matercontroller.core.model.PipelineLead
import javax.inject.Inject

/**
 * Pipeline queues exposed in the first Android queue package. Each maps to a canonical
 * backend status string returned by GET /pipeline/by-status/{status}. The status strings
 * are the server's own values (see tools/mater_controller_api/src/pipeline/service.mjs):
 *   - STAGING                          → freshly staged Lead Hunter candidates
 *   - verified_ready                   → passed the VERIFIED_READY gate, audit-eligible
 *   - manual_review_product_routing    → no auditable website → product-routing review
 *
 * Read-only: this screen never mutates a lead and has no send/approve path.
 */
enum class PipelineQueue(val status: String, val title: String) {
    PRODUCT_ROUTING("manual_review_product_routing", "Продуктовый маршрут"),
    STAGING("STAGING", "Новые кандидаты"),
    VERIFIED_READY("verified_ready", "Проверенные лиды");

    companion object {
        fun fromKey(key: String): PipelineQueue =
            entries.firstOrNull { it.name.equals(key, ignoreCase = true) || it.status.equals(key, ignoreCase = true) }
                ?: STAGING
    }
}

data class PipelineQueueUi(
    val loading: Boolean = true,
    val error: String? = null,
    val items: List<PipelineLead> = emptyList(),
    val offline: Boolean = false,
    val cachedAt: Long? = null,
    val queue: PipelineQueue = PipelineQueue.STAGING,
) {
    val isEmpty: Boolean get() = !loading && error == null && items.isEmpty()
}

@HiltViewModel
class PipelineQueueViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(PipelineQueueUi())
    val ui: StateFlow<PipelineQueueUi> = _ui.asStateFlow()
    private var queue: PipelineQueue = PipelineQueue.STAGING

    fun load(queue: PipelineQueue) {
        this.queue = queue
        _ui.update { it.copy(queue = queue) }
        refresh()
    }

    fun refresh() {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val r = repo.pipelineByStatus(queue.status)) {
                is DataResult.Success -> _ui.update {
                    it.copy(loading = false, items = r.data.items, error = null, offline = r.fromCache, cachedAt = r.cachedAt)
                }
                is DataResult.Error -> _ui.update { it.copy(loading = false, error = r.message) }
            }
        }
    }
}
