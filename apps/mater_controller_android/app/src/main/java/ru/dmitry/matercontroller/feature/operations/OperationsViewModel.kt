package ru.dmitry.matercontroller.feature.operations

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
import ru.dmitry.matercontroller.core.model.AutomationStatusDto
import ru.dmitry.matercontroller.core.model.JobSummary
import ru.dmitry.matercontroller.core.ui.MutationPhase
import javax.inject.Inject

data class OperationsUi(
    val loading: Boolean = true,
    val error: String? = null,
    val errorCode: String? = null,
    val automation: AutomationStatusDto? = null,
    val queueCounts: Map<String, Int> = emptyMap(),
    /** True when queue counts came from a real response/cache; false → unknown, render as «—» not 0. */
    val queueCountsKnown: Boolean = false,
    val jobs: List<JobSummary> = emptyList(),
    val deadLetters: List<JobSummary> = emptyList(),
    val offline: Boolean = false,
    val cachedAt: Long? = null,
    val retry: MutationPhase = MutationPhase.Idle,
    val retryMessage: String? = null,
    val retryingId: String? = null,
)

/**
 * Backs the entire «Система» domain (automation overview, queue, dead letters, sources,
 * scheduler). All reads are GETs through the canonical API; the only mutation is dead-letter
 * retry (re-enqueue), which is idempotent and backend-confirmed. No send path.
 */
@HiltViewModel
class OperationsViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(OperationsUi())
    val ui: StateFlow<OperationsUi> = _ui.asStateFlow()

    init { refresh() }

    fun refresh() {
        _ui.update { it.copy(loading = true, error = null, errorCode = null) }
        viewModelScope.launch {
            val autoRes = repo.automationStatus2()
            val auto = (autoRes as? DataResult.Success)?.data
            if (auto == null) {
                // nothing live and nothing cached → safe message, never a raw transport exception
                _ui.update { it.copy(loading = false, error = "Нет соединения и сохранённых данных.", errorCode = (autoRes as? DataResult.Error)?.code) }
                return@launch
            }
            val autoCached = (autoRes as? DataResult.Success)?.fromCache == true
            val jobsRes = repo.jobs()
            val jobs = (jobsRes as? DataResult.Success)?.data?.jobs ?: emptyList()
            val jobsCached = (jobsRes as? DataResult.Success)?.fromCache == true
            val countsRes = repo.jobsCounts()
            val counts = (countsRes as? DataResult.Success)?.data?.counts ?: emptyMap()
            val countsKnown = countsRes is DataResult.Success
            val countsCached = (countsRes as? DataResult.Success)?.fromCache == true
            val offline = autoCached || jobsCached || countsCached
            val cachedAt = listOfNotNull(
                (autoRes as? DataResult.Success)?.cachedAt,
                (jobsRes as? DataResult.Success)?.cachedAt,
                (countsRes as? DataResult.Success)?.cachedAt,
            ).maxOrNull()
            val dead = jobs.filter { it.status == "DEAD_LETTER" }
            _ui.update {
                it.copy(loading = false, automation = auto, jobs = jobs, deadLetters = dead, queueCounts = counts, queueCountsKnown = countsKnown, offline = offline, cachedAt = cachedAt, error = null)
            }
        }
    }

    /** Retry a dead-lettered job. Confirmation handled in the screen; disabled while submitting. */
    fun retry(job: JobSummary) {
        if (_ui.value.retry == MutationPhase.Submitting) return
        _ui.update { it.copy(retry = MutationPhase.Submitting, retryMessage = null, retryingId = job.jobId) }
        viewModelScope.launch {
            when (val r = repo.retryJob(job)) {
                is DataResult.Success -> { _ui.update { it.copy(retry = MutationPhase.Confirmed, retryMessage = "Повтор поставлен в очередь.") }; refresh() }
                is DataResult.Error -> {
                    val phase = if (r.code == ErrorCodes.CONFLICT) MutationPhase.Conflict else MutationPhase.Failed
                    _ui.update { it.copy(retry = phase, retryMessage = r.message) }
                }
            }
        }
    }

    fun clearRetry() { _ui.update { it.copy(retry = MutationPhase.Idle, retryMessage = null, retryingId = null) } }
}
