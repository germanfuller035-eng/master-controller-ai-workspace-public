package ru.dmitry.matercontroller.feature.ai

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
import ru.dmitry.matercontroller.core.model.AiUsageCumulativeDto
import ru.dmitry.matercontroller.core.model.AiUsageDto
import ru.dmitry.matercontroller.core.model.AiUsageReconciliationDto
import ru.dmitry.matercontroller.core.model.ProviderRegistryDto
import ru.dmitry.matercontroller.core.ui.OwnerLocalization
import javax.inject.Inject

/**
 * «Расход ИИ» — read-only AI cost dashboard from GET /ai/usage (+ cumulative + providers).
 * Calculated units are an internal accounting unit and are NEVER rendered as rubles. Money is only
 * shown when estimated_money_class is a real class (not UNKNOWN/null).
 *
 * RC5: also surfaces GET /ai/usage/reconciliation provenance — known usage split by where it came
 * from (since-ledger / pre-ledger history / total), real raw tokens (which may be "UNKNOWN"), and
 * records by source. raw tokens are typed String? and rendered «неизвестно» when "UNKNOWN", never 0.
 */
data class AiUsageUi(
    val loading: Boolean = true,
    val error: String? = null,
    val usage: AiUsageDto? = null,
    val cumulative: AiUsageCumulativeDto? = null,
    val providers: ProviderRegistryDto? = null,
    val reconciliation: AiUsageReconciliationDto? = null,
    val offline: Boolean = false,
    val cachedAt: Long? = null,
)

@HiltViewModel
class AiUsageViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(AiUsageUi())
    val ui: StateFlow<AiUsageUi> = _ui.asStateFlow()

    init { refresh() }

    fun refresh() {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            val u = repo.aiUsage()
            val c = repo.aiUsageCumulative()
            val p = repo.aiProviders()
            val rec = repo.aiUsageReconciliation()
            _ui.update {
                it.copy(
                    loading = false,
                    usage = (u as? DataResult.Success)?.data ?: it.usage,
                    cumulative = (c as? DataResult.Success)?.data ?: it.cumulative,
                    providers = (p as? DataResult.Success)?.data ?: it.providers,
                    reconciliation = (rec as? DataResult.Success)?.data ?: it.reconciliation,
                    offline = (u as? DataResult.Success)?.fromCache == true || (rec as? DataResult.Success)?.fromCache == true,
                    cachedAt = (u as? DataResult.Success)?.cachedAt ?: (rec as? DataResult.Success)?.cachedAt,
                    error = if (u is DataResult.Error && rec is DataResult.Error && it.usage == null && it.reconciliation == null)
                        OwnerLocalization.renderErrorCodeRu(u.code) else null,
                )
            }
        }
    }
}
