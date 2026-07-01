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
import ru.dmitry.matercontroller.core.data.MaterRepository
import ru.dmitry.matercontroller.core.model.CommercialIntegrationStatus
import ru.dmitry.matercontroller.core.model.CommercialSummary
import ru.dmitry.matercontroller.core.model.FinanceSummaryDto
import javax.inject.Inject

/**
 * Integration Wave 1 — read-only commercial owner view model. Reuses the RC5 read-through cache
 * contract (fromCache → offline banner; UNKNOWN never coerced to 0). No mutations: Wave 1 commercial
 * commands are feature-flagged off and there is no send path.
 */
data class CommercialUi(
    val loading: Boolean = true,
    val error: String? = null,
    val summary: CommercialSummary? = null,
    val finance: FinanceSummaryDto? = null,
    val integration: CommercialIntegrationStatus? = null,
    val offline: Boolean = false,
    val cachedAt: Long? = null,
)

@HiltViewModel
class CommercialViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(CommercialUi())
    val ui: StateFlow<CommercialUi> = _ui.asStateFlow()

    init { refresh() }

    fun refresh() {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            val sumRes = repo.commercialSummary()
            val finRes = repo.financeSummary()
            val intRes = repo.commercialIntegrationStatus()
            val summary = (sumRes as? DataResult.Success)?.data
            val finance = (finRes as? DataResult.Success)?.data
            val integration = (intRes as? DataResult.Success)?.data
            if (summary == null && finance == null && integration == null) {
                _ui.update { it.copy(loading = false, error = "Нет соединения и сохранённых данных.") }
                return@launch
            }
            val offline = listOf(sumRes, finRes, intRes).any { it is DataResult.Success && it.fromCache }
            val cachedAt = listOf(sumRes, finRes, intRes).mapNotNull { (it as? DataResult.Success)?.cachedAt }.maxOrNull()
            _ui.update {
                it.copy(loading = false, summary = summary, finance = finance, integration = integration,
                    offline = offline, cachedAt = cachedAt, error = null)
            }
        }
    }
}
