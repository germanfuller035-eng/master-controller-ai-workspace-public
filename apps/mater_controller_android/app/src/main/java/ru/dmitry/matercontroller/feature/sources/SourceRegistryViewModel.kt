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
import ru.dmitry.matercontroller.core.model.SourceHealthItem
import ru.dmitry.matercontroller.core.model.SourceItem
import ru.dmitry.matercontroller.core.ui.OwnerLocalization
import javax.inject.Inject

/**
 * Source Registry (RC4 fix 4.6). Reads authoritative GET /sources + /sources/health (no hardcode).
 * Read-only — there is no mutation or send here. Filters are applied at render time only; canonical
 * source state is never mutated.
 */
enum class SourceFilter {
    ALL, ENABLED, DISABLED, NEEDS_CREDENTIALS, UNHEALTHY, INBOUND, DISCOVERY, PAID, FREE
}

data class SourceRegistryUi(
    val loading: Boolean = true,
    val error: String? = null,
    val sources: List<SourceItem> = emptyList(),
    val health: Map<String, SourceHealthItem> = emptyMap(),
    val filter: SourceFilter = SourceFilter.ALL,
    val offline: Boolean = false,
    val cachedAt: Long? = null,
) {
    fun filtered(): List<SourceItem> = sources.filter { src ->
        val h = health[src.source_id]
        when (filter) {
            SourceFilter.ALL -> true
            SourceFilter.ENABLED -> src.enabled == true || OwnerLocalization.normStatus(src.status) == "active"
            SourceFilter.DISABLED -> src.enabled == false || OwnerLocalization.normStatus(src.status) == "disabled"
            SourceFilter.NEEDS_CREDENTIALS -> {
                val c = OwnerLocalization.normStatus(src.credential_status)
                c == "missing" || c == "absent" || c == "required" || c == "invalid" || c == "expired" ||
                    OwnerLocalization.normStatus(src.status).contains("credential")
            }
            SourceFilter.UNHEALTHY -> {
                val hh = OwnerLocalization.normStatus(h?.health ?: h?.status)
                hh == "down" || hh == "degraded" || hh == "error" || hh == "paused"
            }
            SourceFilter.INBOUND -> src.inbound == true || src.capabilities.any { OwnerLocalization.normStatus(it) == "inbound" }
            SourceFilter.DISCOVERY -> src.capabilities.any { OwnerLocalization.normStatus(it) == "discovery" }
            SourceFilter.PAID -> OwnerLocalization.normStatus(src.cost_class) == "paid" ||
                OwnerLocalization.normStatus(src.cost_class) == "high" || OwnerLocalization.normStatus(src.cost_class) == "medium"
            SourceFilter.FREE -> {
                val cc = OwnerLocalization.normStatus(src.cost_class)
                cc == "free" || cc == "no_cost" || cc == "zero"
            }
        }
    }
}

@HiltViewModel
class SourceRegistryViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(SourceRegistryUi())
    val ui: StateFlow<SourceRegistryUi> = _ui.asStateFlow()

    init { refresh() }

    fun setFilter(f: SourceFilter) = _ui.update { it.copy(filter = f) }

    fun refresh() {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            val s = repo.sources()
            val h = repo.sourcesHealth()
            if (s is DataResult.Error && _ui.value.sources.isEmpty()) {
                _ui.update { it.copy(loading = false, error = OwnerLocalization.renderErrorCodeRu(s.code)) }
                return@launch
            }
            _ui.update {
                it.copy(
                    loading = false,
                    sources = (s as? DataResult.Success)?.data?.items ?: it.sources,
                    health = (h as? DataResult.Success)?.data?.items?.associateBy { hi -> hi.source_id } ?: it.health,
                    offline = (s as? DataResult.Success)?.fromCache == true,
                    cachedAt = (s as? DataResult.Success)?.cachedAt,
                    error = null,
                )
            }
        }
    }
}
