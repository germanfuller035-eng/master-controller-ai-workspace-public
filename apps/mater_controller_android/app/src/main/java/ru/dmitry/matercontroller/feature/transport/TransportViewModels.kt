package ru.dmitry.matercontroller.feature.transport

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
import ru.dmitry.matercontroller.core.model.ConversationsList
import ru.dmitry.matercontroller.core.model.ConversationTimeline
import ru.dmitry.matercontroller.core.model.DeliveryContainment
import ru.dmitry.matercontroller.core.model.TechnicalAcceptance
import ru.dmitry.matercontroller.core.ui.OwnerLocalization
import javax.inject.Inject

/** Delivery-status review (read-only). Auto-resend/follow-up are forbidden for these records. */
data class DeliveryUi(
    val loading: Boolean = true, val error: String? = null,
    val data: DeliveryContainment? = null, val offline: Boolean = false, val cachedAt: Long? = null,
)

@HiltViewModel
class DeliveryReviewViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(DeliveryUi()); val ui: StateFlow<DeliveryUi> = _ui.asStateFlow()
    init { refresh() }
    fun refresh() {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val r = repo.deliveryContainment()) {
                is DataResult.Success -> _ui.update { it.copy(loading = false, data = r.data, offline = r.fromCache, cachedAt = r.cachedAt) }
                is DataResult.Error -> _ui.update { it.copy(loading = false, error = OwnerLocalization.renderErrorCodeRu(r.code)) }
            }
        }
    }
}

/** TEST_ONLY technical view (hidden from normal KPIs/queues). */
data class TestOnlyUi(
    val loading: Boolean = true, val error: String? = null,
    val data: TechnicalAcceptance? = null, val offline: Boolean = false, val cachedAt: Long? = null,
)

@HiltViewModel
class TestOnlyViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(TestOnlyUi()); val ui: StateFlow<TestOnlyUi> = _ui.asStateFlow()
    init { refresh() }
    fun refresh() {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val r = repo.technicalAcceptance()) {
                is DataResult.Success -> _ui.update { it.copy(loading = false, data = r.data, offline = r.fromCache, cachedAt = r.cachedAt) }
                is DataResult.Error -> _ui.update { it.copy(loading = false, error = OwnerLocalization.renderErrorCodeRu(r.code)) }
            }
        }
    }
}

/** Conversations list + (optional) one timeline. */
data class ConversationsUi(
    val loading: Boolean = true, val error: String? = null,
    val list: ConversationsList? = null, val timeline: ConversationTimeline? = null,
    val offline: Boolean = false, val cachedAt: Long? = null,
)

@HiltViewModel
class ConversationsViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(ConversationsUi()); val ui: StateFlow<ConversationsUi> = _ui.asStateFlow()
    init { refresh() }
    fun refresh() {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val r = repo.conversations()) {
                is DataResult.Success -> _ui.update { it.copy(loading = false, list = r.data, offline = r.fromCache, cachedAt = r.cachedAt) }
                is DataResult.Error -> _ui.update { it.copy(loading = false, error = OwnerLocalization.renderErrorCodeRu(r.code)) }
            }
        }
    }
    fun openTimeline(id: String) {
        viewModelScope.launch {
            when (val r = repo.conversationTimeline(id)) {
                is DataResult.Success -> _ui.update { it.copy(timeline = r.data) }
                is DataResult.Error -> _ui.update { it.copy(error = OwnerLocalization.renderErrorCodeRu(r.code)) }
            }
        }
    }
    fun closeTimeline() = _ui.update { it.copy(timeline = null) }
}
