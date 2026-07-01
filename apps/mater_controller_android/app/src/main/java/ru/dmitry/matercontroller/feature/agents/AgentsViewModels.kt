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
import ru.dmitry.matercontroller.core.model.AgentStatus
import ru.dmitry.matercontroller.core.model.ExecutiveBrief
import ru.dmitry.matercontroller.core.model.OwnerQueues
import ru.dmitry.matercontroller.core.model.ProviderHealthDto
import ru.dmitry.matercontroller.core.model.ShadowWaveResult
import ru.dmitry.matercontroller.core.ui.OwnerLocalization
import javax.inject.Inject

/** Agents dashboard: status + provider-health + (on demand) shadow-wave summary. No API key shown. */
data class AgentsUi(
    val loading: Boolean = true, val error: String? = null,
    val status: AgentStatus? = null, val wave: ShadowWaveResult? = null,
    val health: ProviderHealthDto? = null,
    val offline: Boolean = false, val cachedAt: Long? = null,
    /** True while a shadow-wave run is in flight (blocks the run button; never sends). */
    val waveSubmitting: Boolean = false,
)

@HiltViewModel
class AgentsViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(AgentsUi()); val ui: StateFlow<AgentsUi> = _ui.asStateFlow()
    init { refresh() }
    fun refresh() {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            val s = repo.agentStatus()
            val h = repo.providerHealth()
            _ui.update {
                it.copy(
                    loading = false,
                    status = (s as? DataResult.Success)?.data ?: it.status,
                    health = (h as? DataResult.Success)?.data ?: it.health,
                    offline = (s as? DataResult.Success)?.fromCache == true,
                    cachedAt = (s as? DataResult.Success)?.cachedAt,
                    error = if (s is DataResult.Error && it.status == null) OwnerLocalization.renderErrorCodeRu(s.code) else null,
                )
            }
        }
    }
    fun runShadowWave() {
        if (_ui.value.waveSubmitting) return // double-tap guard; never sends
        _ui.update { it.copy(waveSubmitting = true) }
        viewModelScope.launch {
            when (val r = repo.agentShadowWave()) {
                is DataResult.Success -> _ui.update { it.copy(wave = r.data, waveSubmitting = false) }
                is DataResult.Error -> _ui.update { it.copy(error = OwnerLocalization.renderErrorCodeRu(r.code), waveSubmitting = false) }
            }
        }
    }
}

/** Owner queues + executive brief. */
data class QueuesUi(
    val loading: Boolean = true, val error: String? = null,
    val queues: OwnerQueues? = null, val brief: ExecutiveBrief? = null,
    val offline: Boolean = false, val cachedAt: Long? = null,
)

@HiltViewModel
class QueuesViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(QueuesUi()); val ui: StateFlow<QueuesUi> = _ui.asStateFlow()
    init { refresh() }
    fun refresh() {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            val q = repo.ownerQueues(); val b = repo.executiveBrief()
            _ui.update {
                it.copy(
                    loading = false,
                    queues = (q as? DataResult.Success)?.data,
                    brief = (b as? DataResult.Success)?.data,
                    offline = (q as? DataResult.Success)?.fromCache == true,
                    error = if (q is DataResult.Error && it.queues == null) OwnerLocalization.renderErrorCodeRu(q.code) else null,
                )
            }
        }
    }
}
