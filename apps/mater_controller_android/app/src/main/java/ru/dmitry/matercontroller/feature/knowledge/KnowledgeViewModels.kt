package ru.dmitry.matercontroller.feature.knowledge

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
import ru.dmitry.matercontroller.core.model.KnowledgeDigestItem
import ru.dmitry.matercontroller.core.model.KnowledgeSourceDto
import ru.dmitry.matercontroller.core.model.RadarStatusDto
import ru.dmitry.matercontroller.core.ui.OwnerLocalization
import javax.inject.Inject

/**
 * «Радар знаний» — read-only knowledge radar. Three digest windows (urgent / weekly / monthly),
 * the source registry and the radar status. NO automatic production change happens here. Owner
 * actions are local/UI-only (or recorded for a future server flow) and never alter production,
 * client messaging or financial state.
 */
enum class KnowledgeWindow(val wire: String) {
    URGENT("urgent"), WEEKLY("weekly"), MONTHLY("monthly");
}

/** Local owner-side decisions on a finding. None of these change production. */
enum class KnowledgeOwnerAction { OPEN_SOURCE, CREATE_REVIEW_TASK, POSTPONE, NOT_RELEVANT, REJECT, MARK_ERRONEOUS, LEGAL_REVIEW, SECURITY_REVIEW, APPROVE_TESTING }

data class KnowledgeDigestUi(
    val loading: Boolean = true,
    val error: String? = null,
    val window: KnowledgeWindow = KnowledgeWindow.URGENT,
    val items: List<KnowledgeDigestItem> = emptyList(),
    // RC6 (defect C): server-driven empty state. When true the radar genuinely has no confirmed
    // events for this window — the UI shows a real empty state, never fixtures or a false error.
    val emptyState: Boolean = false,
    val offline: Boolean = false,
    val cachedAt: Long? = null,
    /** Local owner decisions keyed by finding id. UI-only — никогда не меняет production. */
    val localDecisions: Map<String, KnowledgeOwnerAction> = emptyMap(),
)

@HiltViewModel
class KnowledgeDigestViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(KnowledgeDigestUi())
    val ui: StateFlow<KnowledgeDigestUi> = _ui.asStateFlow()

    fun load(window: KnowledgeWindow) {
        _ui.update { it.copy(loading = true, error = null, window = window) }
        viewModelScope.launch {
            when (val r = repo.knowledgeDigest(window.wire)) {
                is DataResult.Success -> _ui.update {
                    it.copy(
                        loading = false,
                        items = r.data.items,
                        // empty_state=true OR no items → real empty state (not fixtures).
                        emptyState = r.data.empty_state == true || r.data.items.isEmpty(),
                        offline = r.fromCache,
                        cachedAt = r.cachedAt,
                    )
                }
                is DataResult.Error -> _ui.update { it.copy(loading = false, error = OwnerLocalization.renderErrorCodeRu(r.code)) }
            }
        }
    }

    /** Record a LOCAL owner decision (UI-only). Does not change production / messaging / finance. */
    fun recordLocalDecision(findingId: String, action: KnowledgeOwnerAction) {
        _ui.update { it.copy(localDecisions = it.localDecisions + (findingId to action)) }
    }
}

data class KnowledgeSourcesUi(
    val loading: Boolean = true,
    val error: String? = null,
    val items: List<KnowledgeSourceDto> = emptyList(),
    val offline: Boolean = false,
    val cachedAt: Long? = null,
)

@HiltViewModel
class KnowledgeSourcesViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(KnowledgeSourcesUi())
    val ui: StateFlow<KnowledgeSourcesUi> = _ui.asStateFlow()
    init { refresh() }
    fun refresh() {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val r = repo.knowledgeSources()) {
                is DataResult.Success -> _ui.update { it.copy(loading = false, items = r.data.items, offline = r.fromCache, cachedAt = r.cachedAt) }
                is DataResult.Error -> _ui.update { it.copy(loading = false, error = OwnerLocalization.renderErrorCodeRu(r.code)) }
            }
        }
    }
}

data class KnowledgeStatusUi(
    val loading: Boolean = true,
    val error: String? = null,
    val status: RadarStatusDto? = null,
    val offline: Boolean = false,
    val cachedAt: Long? = null,
)

/**
 * «Состояние радара» (RC6 defect C). Uses the radar-specific endpoint GET /knowledge/radar-status
 * (NOT the general /system status), so a radar-only outage is classified separately — the screen
 * shows a radar error, never a false «нет соединения» for the whole app.
 */
@HiltViewModel
class KnowledgeStatusViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(KnowledgeStatusUi())
    val ui: StateFlow<KnowledgeStatusUi> = _ui.asStateFlow()
    init { refresh() }
    fun refresh() {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val r = repo.radarStatus()) {
                is DataResult.Success -> _ui.update { it.copy(loading = false, status = r.data, offline = r.fromCache, cachedAt = r.cachedAt) }
                is DataResult.Error -> _ui.update { it.copy(loading = false, error = OwnerLocalization.renderRadarErrorRu(r.code)) }
            }
        }
    }
}
