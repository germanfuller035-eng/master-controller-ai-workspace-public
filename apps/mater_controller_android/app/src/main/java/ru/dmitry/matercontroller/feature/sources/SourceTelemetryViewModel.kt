package ru.dmitry.matercontroller.feature.sources

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
import ru.dmitry.matercontroller.core.model.SourceTelemetryItem
import ru.dmitry.matercontroller.core.ui.OwnerLocalization
import javax.inject.Inject

/**
 * Source Telemetry (RC5 defect E). Reads authoritative GET /sources/telemetry. Read-only — there is
 * no mutation or send here. Filters are applied at render time only; canonical telemetry is never
 * mutated. health_state / cost_class are localized; counters render «нет данных» only when truly
 * null AND the source is not disabled (a disabled source shows «—», never a misleading 0).
 */
enum class TelemetryFilter {
    ALL, ENABLED, DISABLED, NEEDS_CREDENTIALS, FREE, PAID
}

data class SourceTelemetryUi(
    val loading: Boolean = true,
    val error: String? = null,
    val items: List<SourceTelemetryItem> = emptyList(),
    val filter: TelemetryFilter = TelemetryFilter.ALL,
    val offline: Boolean = false,
    val cachedAt: Long? = null,
) {
    fun filtered(): List<SourceTelemetryItem> = items.filter { it ->
        val health = OwnerLocalization.normStatus(it.health_state)
        val cred = OwnerLocalization.normStatus(it.credential_state)
        val cost = OwnerLocalization.normStatus(it.cost_class)
        when (filter) {
            TelemetryFilter.ALL -> true
            TelemetryFilter.ENABLED -> it.enabled == true
            TelemetryFilter.DISABLED -> it.enabled == false || health == "disabled"
            TelemetryFilter.NEEDS_CREDENTIALS -> health == "credential_required" || health == "needs_credentials" ||
                cred == "missing" || cred == "absent" || cred == "required" || cred == "invalid" || cred == "expired"
            TelemetryFilter.FREE -> cost == "free" || cost == "no_cost" || cost == "zero"
            TelemetryFilter.PAID -> cost == "paid" || cost == "premium"
        }
    }
}

@HiltViewModel
class SourceTelemetryViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(SourceTelemetryUi())
    val ui: StateFlow<SourceTelemetryUi> = _ui.asStateFlow()

    init { refresh() }

    fun setFilter(f: TelemetryFilter) = _ui.update { it.copy(filter = f) }

    fun refresh() {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val r = repo.sourcesTelemetry()) {
                is DataResult.Success -> _ui.update {
                    it.copy(loading = false, items = r.data.items, offline = r.fromCache, cachedAt = r.cachedAt, error = null)
                }
                is DataResult.Error -> if (_ui.value.items.isEmpty()) {
                    _ui.update { it.copy(loading = false, error = OwnerLocalization.renderErrorCodeRu(r.code)) }
                } else {
                    _ui.update { it.copy(loading = false) }
                }
            }
        }
    }
}
