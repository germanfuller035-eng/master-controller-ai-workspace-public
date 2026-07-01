package ru.dmitry.matercontroller.feature.campaigns

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
import ru.dmitry.matercontroller.core.model.CampaignSummary
import javax.inject.Inject

/**
 * Campaign Governor screen state (0.7.0-rc1). Read-only: the app shows campaign
 * plan/cohort/observation state. Cohort SEND execution is disabled server-side
 * (ACTIVE_NO_SEND); there are no send actions here.
 */
data class CampaignsUi(
    val loading: Boolean = true,
    val error: String? = null,
    val items: List<CampaignSummary> = emptyList(),
    val offline: Boolean = false,
    val cachedAt: Long? = null,
)

@HiltViewModel
class CampaignsViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(CampaignsUi())
    val ui: StateFlow<CampaignsUi> = _ui.asStateFlow()

    init { refresh() }

    fun refresh() {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val res = repo.campaigns()) {
                is DataResult.Success -> _ui.update {
                    it.copy(
                        loading = false,
                        // Owner KPI view: test_only campaigns are already hidden server-side.
                        items = res.data.campaigns,
                        offline = res.fromCache,
                        cachedAt = res.cachedAt,
                        error = null,
                    )
                }
                is DataResult.Error -> _ui.update {
                    it.copy(loading = false, error = res.message)
                }
            }
        }
    }
}
