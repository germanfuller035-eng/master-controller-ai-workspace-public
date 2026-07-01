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
import ru.dmitry.matercontroller.core.model.OfferDto
import ru.dmitry.matercontroller.core.ui.OwnerLocalization
import javax.inject.Inject

/**
 * Text-only owner actions on an offer. NONE of them sends a message — each maps to a backend
 * status-only `decision` command (except OPEN_PREVIEW which only opens the read-only preview).
 * `code` is the canonical UI key (== name); `decision` is the backend command verb or null.
 * Kept in the ViewModel (not the screen) so no raw SCREAMING_SNAKE decision literal lives in UI code.
 */
enum class OfferReviewAction(val decision: String?) {
    OPEN_PREVIEW(null),
    APPROVE_TEXT_ONLY("APPROVE_DRAFT_FOR_SEND_REVIEW"),
    REQUEST_CHANGES("REQUEST_CHANGES"),
    REJECT_DRAFT("REJECT_INTERNAL_DRAFT"),
    RESTORE_TO_REVIEW("RETURN_FOR_EDIT");

    val code: String get() = name
}

/**
 * Offer review (0.6.0-rc2). Read-only owner queue of offers awaiting a send-review decision.
 * NO send happens here. Allowed owner actions are limited to text-only review:
 * OPEN_PREVIEW / REQUEST_CHANGES / REJECT_DRAFT / APPROVE_TEXT_ONLY. None of them sends a message.
 *
 * TEST_ONLY offers are kept out of the owner send-review list so technical-acceptance artifacts
 * never contaminate the real owner queue.
 */
data class OfferReviewUi(
    val loading: Boolean = true,
    val error: String? = null,
    val offers: List<OfferDto> = emptyList(),
    val offline: Boolean = false,
    val cachedAt: Long? = null,
)

@HiltViewModel
class OfferReviewViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(OfferReviewUi())
    val ui: StateFlow<OfferReviewUi> = _ui.asStateFlow()

    init { refresh() }

    fun refresh() {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val r = repo.offers()) {
                is DataResult.Success -> {
                    // Only real offers awaiting an owner send-review decision; TEST_ONLY excluded.
                    val items = r.data.items.filter {
                        !it.test_only && OwnerLocalization.normStatus(it.status) == "ready_for_send_review"
                    }
                    _ui.update { it.copy(loading = false, offers = items, offline = r.fromCache, cachedAt = r.cachedAt) }
                }
                is DataResult.Error -> _ui.update { it.copy(loading = false, error = OwnerLocalization.renderErrorCodeRu(r.code)) }
            }
        }
    }
}

data class OfferDetailUi(
    val loading: Boolean = true,
    val error: String? = null,
    val offer: OfferDto? = null,
    val offline: Boolean = false,
    val cachedAt: Long? = null,
    // ---- RC3: real owner-decision submission state machine ----
    val submitState: SubmitState = SubmitState.IDLE,
    /** Owner-facing message for the current submit outcome (success/error/conflict). */
    val submitMessage: String? = null,
    /** Append-only owner-facing action history (previous → new state, result). Newest last. */
    val history: List<OfferActionLog> = emptyList(),
    // ---- RC4: authoritative offer preview (GET /offers/{id}/preview) ----
    val previewState: PreviewState = PreviewState.IDLE,
    val preview: ru.dmitry.matercontroller.core.model.OfferPreviewDto? = null,
    val previewError: String? = null,
) {
    /** Decisions are disabled while offline (no cache-served mutations) or while a request is in flight. */
    val actionsEnabled: Boolean get() = !offline && submitState != SubmitState.SUBMITTING && offer != null

    private val statusNorm: String get() = OwnerLocalization.normStatus(offer?.status)

    /** Approve / request-changes / reject apply only while the offer is awaiting send-review. */
    val canDecideReview: Boolean get() = actionsEnabled && statusNorm == "ready_for_send_review"

    /** A rejected / changes-requested offer cannot be re-decided; it can only be RESTORED to review. */
    val canRestore: Boolean get() = actionsEnabled && (statusNorm == "rejected" || statusNorm == "changes_requested")
}

enum class SubmitState { IDLE, SUBMITTING, SUCCESS, ERROR, CONFLICT }
enum class PreviewState { IDLE, LOADING, LOADED, ERROR }

/** One owner-facing line in the offer action history. */
data class OfferActionLog(
    val actionLabel: String,
    val result: String,
    val previousStatus: String?,
    val newStatus: String?,
)

@HiltViewModel
class OfferDetailViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(OfferDetailUi())
    val ui: StateFlow<OfferDetailUi> = _ui.asStateFlow()

    fun load(offerId: String) {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val r = repo.offer(offerId)) {
                is DataResult.Success -> _ui.update { it.copy(loading = false, offer = r.data, offline = r.fromCache, cachedAt = r.cachedAt) }
                is DataResult.Error -> _ui.update { it.copy(loading = false, error = OwnerLocalization.renderErrorCodeRu(r.code)) }
            }
        }
    }

    /** Dismiss a transient submit outcome (success/error/conflict banner) without touching history. */
    fun clearSubmitOutcome() = _ui.update { it.copy(submitState = SubmitState.IDLE, submitMessage = null) }

    /**
     * Execute a REAL owner decision against the backend. NO message is ever sent — this only changes
     * the offer's internal status. Success is reported ONLY after HTTP 2xx + a confirmed CommandResult
     * AND the offer is re-read from the server. A 409 reloads the canonical offer and surfaces a
     * conflict (never auto-retries). Offline / in-flight requests are rejected (double-tap guard).
     */
    fun submitDecision(offerId: String, action: OfferReviewAction) {
        val decision = action.decision ?: return // OPEN_PREVIEW is not a command
        val current = _ui.value
        if (current.offline) {
            _ui.update { it.copy(submitState = SubmitState.ERROR, submitMessage = OwnerLocalization.OFFLINE_MUTATION_DISABLED) }
            return
        }
        if (current.submitState == SubmitState.SUBMITTING) return // double-tap guard
        val previousStatus = current.offer?.status
        _ui.update { it.copy(submitState = SubmitState.SUBMITTING, submitMessage = null) }
        viewModelScope.launch {
            // Read the freshest revision the server knows about so the command is revision-guarded.
            val expectedRevision = when (val rev = repo.automationStatus2()) {
                is DataResult.Success -> rev.data.storeRevision
                is DataResult.Error -> null // proceed unguarded; a stale write returns 409 we handle below
            }
            when (val res = repo.offerDecision(offerId, decision, expectedRevision)) {
                is DataResult.Success -> {
                    // Re-read canonical offer; success is only confirmed once the server state is back.
                    val reloaded = repo.offer(offerId)
                    val newOffer = (reloaded as? DataResult.Success)?.data
                    val newStatus = newOffer?.status ?: res.data.decision
                    val log = OfferActionLog(
                        actionLabel = OwnerLocalization.renderOfferActionTitleRu(action.code),
                        result = "выполнено",
                        previousStatus = OwnerLocalization.renderOfferStatusRu(previousStatus),
                        newStatus = OwnerLocalization.renderOfferStatusRu(newStatus),
                    )
                    _ui.update {
                        it.copy(
                            submitState = SubmitState.SUCCESS,
                            submitMessage = "Готово: ${OwnerLocalization.renderOfferActionTargetStatusRu(action.code)}. ${OwnerLocalization.OFFER_NO_SEND_NOTE}",
                            offer = newOffer ?: it.offer,
                            offline = (reloaded as? DataResult.Success)?.fromCache ?: it.offline,
                            cachedAt = (reloaded as? DataResult.Success)?.cachedAt ?: it.cachedAt,
                            history = it.history + log,
                        )
                    }
                }
                is DataResult.Error -> {
                    if (res.code == ru.dmitry.matercontroller.core.data.ErrorCodes.REVISION_CONFLICT ||
                        res.code == ru.dmitry.matercontroller.core.data.ErrorCodes.CONFLICT
                    ) {
                        // Reload canonical version; do NOT auto-retry.
                        val reloaded = repo.offer(offerId)
                        val newOffer = (reloaded as? DataResult.Success)?.data
                        _ui.update {
                            it.copy(
                                submitState = SubmitState.CONFLICT,
                                submitMessage = OwnerLocalization.renderErrorCodeRu("revision_conflict"),
                                offer = newOffer ?: it.offer,
                                offline = (reloaded as? DataResult.Success)?.fromCache ?: it.offline,
                                cachedAt = (reloaded as? DataResult.Success)?.cachedAt ?: it.cachedAt,
                            )
                        }
                    } else {
                        _ui.update { it.copy(submitState = SubmitState.ERROR, submitMessage = OwnerLocalization.renderErrorCodeRu(res.code)) }
                    }
                }
            }
        }
    }

    /**
     * Load the authoritative offer preview (GET /offers/{id}/preview). Read-only; never sends.
     * Shows ALL backend-provided fields. Blockers are rendered exactly as the backend returns them
     * (no ALREADY_AWAITING_REPLY is injected). Missing fields render as «нет данных: <reason>».
     */
    fun loadPreview(offerId: String) {
        _ui.update { it.copy(previewState = PreviewState.LOADING, previewError = null) }
        viewModelScope.launch {
            when (val r = repo.offerPreview(offerId)) {
                is DataResult.Success -> _ui.update { it.copy(previewState = PreviewState.LOADED, preview = r.data) }
                is DataResult.Error -> _ui.update { it.copy(previewState = PreviewState.ERROR, previewError = OwnerLocalization.renderErrorCodeRu(r.code)) }
            }
        }
    }

    fun clearPreview() = _ui.update { it.copy(previewState = PreviewState.IDLE, preview = null, previewError = null) }
}
