package ru.dmitry.matercontroller.feature.ownersettings

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
import ru.dmitry.matercontroller.core.model.OwnerSettingsAuditDto
import ru.dmitry.matercontroller.core.model.OwnerSettingsDto
import ru.dmitry.matercontroller.core.model.OwnerSettingsUpdateBody
import ru.dmitry.matercontroller.core.ui.OwnerLocalization
import java.util.UUID
import javax.inject.Inject

/**
 * «Лимиты и автоматизация» (RC5 defect F). Owner automation/limits controls.
 *
 * Read GET /owner/settings + /owner/settings/audit. Write POST /owner/settings as an owner command
 * (no send). Each numeric field is bounded by hard_limits[field]; the source strategy is FREE_ONLY
 * by default and selecting a paid strategy requires explicit confirmation (and surfaces the server's
 * 422 paid_source_requires_confirmation error when creds are absent). Save is gated:
 *  - blocked while offline (no cache-served mutation),
 *  - blocked while a request is in flight (double-tap guard),
 *  - success ONLY after HTTP 2xx + a fresh re-read of GET /owner/settings,
 *  - 409 reloads the canonical settings and surfaces a conflict (never auto-retries),
 *  - 422 surfaces the validation errors (hard limit / paid confirmation).
 *
 * The settings shown while offline are flagged cached and editing is disabled.
 */

/** Numeric editable fields. wire == backend snake_case key (kept out of UI literals). */
enum class SettingsNumericField(val wire: String) {
    DISCOVERY_RUNS_PER_DAY("discovery_runs_per_day"),
    RAW_CANDIDATES_PER_DAY("raw_candidates_per_day"),
    VERIFIED_LEADS_PER_DAY("verified_leads_per_day"),
    SITES_CHECKED_PER_DAY("sites_checked_per_day"),
    SAME_SEGMENT_RESCAN_DAYS("same_segment_rescan_days"),
    OWNER_QUEUE_MAX("owner_queue_max"),
    AUDIT_READY_QUEUE_MAX("audit_ready_queue_max"),
    AI_AUDITS_PER_DAY("ai_audits_per_day"),
    OFFERS_PER_DAY("offers_per_day"),
    DAILY_CALCULATED_UNITS_LIMIT("daily_calculated_units_limit"),
    PREMIUM_CALLS_PER_DAY("premium_calls_per_day"),
    REPAIR_ATTEMPTS("repair_attempts"),
    FALLBACK_ATTEMPTS("fallback_attempts"),
    PROVIDER_CONCURRENCY("provider_concurrency");

    fun serverValue(s: OwnerSettingsDto?): Long? = when (this) {
        DISCOVERY_RUNS_PER_DAY -> s?.discovery_runs_per_day?.toLong()
        RAW_CANDIDATES_PER_DAY -> s?.raw_candidates_per_day?.toLong()
        VERIFIED_LEADS_PER_DAY -> s?.verified_leads_per_day?.toLong()
        SITES_CHECKED_PER_DAY -> s?.sites_checked_per_day?.toLong()
        SAME_SEGMENT_RESCAN_DAYS -> s?.same_segment_rescan_days?.toLong()
        OWNER_QUEUE_MAX -> s?.owner_queue_max?.toLong()
        AUDIT_READY_QUEUE_MAX -> s?.audit_ready_queue_max?.toLong()
        AI_AUDITS_PER_DAY -> s?.ai_audits_per_day?.toLong()
        OFFERS_PER_DAY -> s?.offers_per_day?.toLong()
        DAILY_CALCULATED_UNITS_LIMIT -> s?.daily_calculated_units_limit
        PREMIUM_CALLS_PER_DAY -> s?.premium_calls_per_day?.toLong()
        REPAIR_ATTEMPTS -> s?.repair_attempts?.toLong()
        FALLBACK_ATTEMPTS -> s?.fallback_attempts?.toLong()
        PROVIDER_CONCURRENCY -> s?.provider_concurrency?.toLong()
    }
}

/** Source strategy options. Only FREE_ONLY is active without confirmation. */
enum class SourceStrategyChoice(val wire: String, val requiresPaid: Boolean) {
    FREE_ONLY("FREE_ONLY", false),
    FREE_WITH_PAID_RESERVE("FREE_WITH_PAID_RESERVE", true),
    ALL_ALLOWED("ALL_ALLOWED", true);

    companion object {
        fun fromWire(v: String?): SourceStrategyChoice {
            val n = (v ?: "").trim().uppercase()
            return entries.firstOrNull { it.wire == n } ?: FREE_ONLY
        }
    }
}

enum class SaveState { IDLE, SUBMITTING, SUCCESS, ERROR, CONFLICT, VALIDATION }

data class OwnerSettingsUi(
    val loading: Boolean = true,
    val error: String? = null,
    val settings: OwnerSettingsDto? = null,
    val audit: OwnerSettingsAuditDto? = null,
    val offline: Boolean = false,
    val cachedAt: Long? = null,
    // ---- editable draft ----
    val draftNumeric: Map<SettingsNumericField, Long> = emptyMap(),
    val draftProfile: String? = null,
    val draftStrategy: SourceStrategyChoice = SourceStrategyChoice.FREE_ONLY,
    val confirmPaid: Boolean = false,
    // ---- save state machine ----
    val saveState: SaveState = SaveState.IDLE,
    val saveMessage: String? = null,
    val showDiff: Boolean = false,
) {
    val editable: Boolean get() = !offline && settings != null && saveState != SaveState.SUBMITTING

    fun hardLimit(field: SettingsNumericField): Long? =
        settings?.hard_limits?.get(field.wire)?.toLong()

    fun currentValue(field: SettingsNumericField): Long =
        draftNumeric[field] ?: field.serverValue(settings) ?: 0L

    /** Fields whose draft differs from the server value. */
    fun changedNumeric(): List<SettingsNumericField> = SettingsNumericField.entries.filter { f ->
        val server = f.serverValue(settings) ?: 0L
        currentValue(f) != server
    }

    val strategyChanged: Boolean
        get() = SourceStrategyChoice.fromWire(settings?.source_strategy) != draftStrategy

    val profileChanged: Boolean
        get() = OwnerLocalization.hasValue(draftProfile) &&
            !draftProfile.equals(settings?.profile, ignoreCase = true)

    val hasChanges: Boolean get() = changedNumeric().isNotEmpty() || strategyChanged || profileChanged

    /** True when a paid strategy is selected but not yet confirmed by the owner. */
    val paidNotConfirmed: Boolean get() = draftStrategy.requiresPaid && !confirmPaid
}

@HiltViewModel
class OwnerSettingsViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(OwnerSettingsUi())
    val ui: StateFlow<OwnerSettingsUi> = _ui.asStateFlow()

    init { refresh() }

    fun refresh() {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            val s = repo.ownerSettings()
            val a = repo.ownerSettingsAudit()
            when (s) {
                is DataResult.Success -> _ui.update {
                    it.copy(
                        loading = false,
                        settings = s.data,
                        audit = (a as? DataResult.Success)?.data ?: it.audit,
                        offline = s.fromCache,
                        cachedAt = s.cachedAt,
                        // reset draft to the freshly-read server state
                        draftNumeric = emptyMap(),
                        draftProfile = s.data.profile,
                        draftStrategy = SourceStrategyChoice.fromWire(s.data.source_strategy),
                        confirmPaid = false,
                        error = null,
                    )
                }
                is DataResult.Error -> _ui.update {
                    if (it.settings == null) it.copy(loading = false, error = OwnerLocalization.renderErrorCodeRu(s.code))
                    else it.copy(loading = false)
                }
            }
        }
    }

    fun setNumeric(field: SettingsNumericField, value: Long) {
        val max = _ui.value.hardLimit(field)
        val clamped = value.coerceAtLeast(0L).let { if (max != null) it.coerceAtMost(max) else it }
        _ui.update { it.copy(draftNumeric = it.draftNumeric + (field to clamped), draftProfile = customProfile(it)) }
    }

    fun setProfile(profile: String) = _ui.update { it.copy(draftProfile = profile) }

    fun setStrategy(choice: SourceStrategyChoice) =
        _ui.update { it.copy(draftStrategy = choice, confirmPaid = if (choice.requiresPaid) it.confirmPaid else false) }

    fun setConfirmPaid(confirm: Boolean) = _ui.update { it.copy(confirmPaid = confirm) }

    /** Selecting a custom numeric value moves the profile to «Пользовательский» implicitly. */
    private fun customProfile(s: OwnerSettingsUi): String? =
        if (s.draftProfile.equals("custom", ignoreCase = true)) s.draftProfile else "custom"

    fun openDiff() {
        if (!_ui.value.hasChanges) return
        _ui.update { it.copy(showDiff = true) }
    }

    fun closeDiff() = _ui.update { it.copy(showDiff = false) }

    fun clearSaveOutcome() = _ui.update { it.copy(saveState = SaveState.IDLE, saveMessage = null) }

    /**
     * Forecast: a rough expected-load / AI-cost hint derived from the draft (NOT a server promise).
     * Returns null when there's nothing to forecast.
     */
    fun forecast(): String? {
        val u = _ui.value
        val runs = u.currentValue(SettingsNumericField.DISCOVERY_RUNS_PER_DAY)
        val sites = u.currentValue(SettingsNumericField.SITES_CHECKED_PER_DAY)
        val aiAudits = u.currentValue(SettingsNumericField.AI_AUDITS_PER_DAY)
        val units = u.currentValue(SettingsNumericField.DAILY_CALCULATED_UNITS_LIMIT)
        return "Ожидаемая нагрузка: ~$runs запусков, до $sites проверок сайтов в день. " +
            "ИИ-аудитов: до $aiAudits/день · дневной лимит расчётных единиц: ${OwnerLocalization.formatCalculatedUnits(units)}."
    }

    /**
     * Submit the draft as a single POST /owner/settings command. No send. Builds expectedRevision +
     * a fresh UUID idempotencyKey + the explicit changedFields list + an ISO timestamp. On 2xx the
     * canonical settings are re-read before success is declared. Double-tap and offline are guarded.
     */
    fun save() {
        val u = _ui.value
        if (u.offline) {
            _ui.update { it.copy(saveState = SaveState.ERROR, saveMessage = OwnerLocalization.OFFLINE_MUTATION_DISABLED, showDiff = false) }
            return
        }
        if (u.saveState == SaveState.SUBMITTING) return // double-tap guard
        if (!u.hasChanges) { _ui.update { it.copy(showDiff = false) } ; return }
        if (u.paidNotConfirmed) {
            _ui.update {
                it.copy(
                    saveState = SaveState.VALIDATION,
                    saveMessage = OwnerLocalization.renderSettingsErrorRu("paid_source_requires_confirmation"),
                    showDiff = false,
                )
            }
            return
        }

        val changed = mutableListOf<String>()
        u.changedNumeric().forEach { changed.add(it.wire) }
        if (u.strategyChanged) changed.add("source_strategy")
        if (u.profileChanged) changed.add("profile")

        fun n(field: SettingsNumericField): Int? =
            if (field in u.changedNumeric()) u.currentValue(field).toInt() else null

        val body = OwnerSettingsUpdateBody(
            profile = if (u.profileChanged) u.draftProfile else null,
            discovery_runs_per_day = n(SettingsNumericField.DISCOVERY_RUNS_PER_DAY),
            raw_candidates_per_day = n(SettingsNumericField.RAW_CANDIDATES_PER_DAY),
            verified_leads_per_day = n(SettingsNumericField.VERIFIED_LEADS_PER_DAY),
            sites_checked_per_day = n(SettingsNumericField.SITES_CHECKED_PER_DAY),
            same_segment_rescan_days = n(SettingsNumericField.SAME_SEGMENT_RESCAN_DAYS),
            owner_queue_max = n(SettingsNumericField.OWNER_QUEUE_MAX),
            audit_ready_queue_max = n(SettingsNumericField.AUDIT_READY_QUEUE_MAX),
            ai_audits_per_day = n(SettingsNumericField.AI_AUDITS_PER_DAY),
            offers_per_day = n(SettingsNumericField.OFFERS_PER_DAY),
            daily_calculated_units_limit = if (SettingsNumericField.DAILY_CALCULATED_UNITS_LIMIT in u.changedNumeric())
                u.currentValue(SettingsNumericField.DAILY_CALCULATED_UNITS_LIMIT) else null,
            premium_calls_per_day = n(SettingsNumericField.PREMIUM_CALLS_PER_DAY),
            repair_attempts = n(SettingsNumericField.REPAIR_ATTEMPTS),
            fallback_attempts = n(SettingsNumericField.FALLBACK_ATTEMPTS),
            provider_concurrency = n(SettingsNumericField.PROVIDER_CONCURRENCY),
            source_strategy = if (u.strategyChanged) u.draftStrategy.wire else null,
            confirm_paid_sources = if (u.draftStrategy.requiresPaid) u.confirmPaid else null,
            expectedRevision = u.settings?.settings_revision,
            idempotencyKey = "android-owner-settings-" + UUID.randomUUID(),
            changedFields = changed,
            timestamp = nowIso(),
        )

        _ui.update { it.copy(saveState = SaveState.SUBMITTING, saveMessage = null, showDiff = false) }
        viewModelScope.launch {
            when (val res = repo.updateOwnerSettings(body)) {
                is DataResult.Success -> {
                    // Re-read canonical settings before declaring success.
                    val reread = repo.ownerSettings()
                    val fresh = (reread as? DataResult.Success)?.data
                    _ui.update {
                        it.copy(
                            saveState = SaveState.SUCCESS,
                            saveMessage = "Сохранено. Настройки обновлены на сервере.",
                            settings = fresh ?: res.data.settings ?: it.settings,
                            offline = (reread as? DataResult.Success)?.fromCache ?: it.offline,
                            cachedAt = (reread as? DataResult.Success)?.cachedAt ?: it.cachedAt,
                            draftNumeric = emptyMap(),
                            draftProfile = (fresh ?: res.data.settings)?.profile,
                            draftStrategy = SourceStrategyChoice.fromWire((fresh ?: res.data.settings)?.source_strategy),
                            confirmPaid = false,
                        )
                    }
                    // refresh the audit trail in the background
                    val a = repo.ownerSettingsAudit()
                    (a as? DataResult.Success)?.let { ok -> _ui.update { it.copy(audit = ok.data) } }
                }
                is DataResult.Error -> when (res.code) {
                    ErrorCodes.REVISION_CONFLICT, ErrorCodes.CONFLICT -> {
                        // Reload canonical; do NOT auto-retry.
                        val reread = repo.ownerSettings()
                        val fresh = (reread as? DataResult.Success)?.data
                        _ui.update {
                            it.copy(
                                saveState = SaveState.CONFLICT,
                                saveMessage = OwnerLocalization.renderErrorCodeRu("revision_conflict"),
                                settings = fresh ?: it.settings,
                                draftNumeric = emptyMap(),
                                draftProfile = fresh?.profile ?: it.draftProfile,
                                draftStrategy = SourceStrategyChoice.fromWire(fresh?.source_strategy ?: it.settings?.source_strategy),
                                confirmPaid = false,
                            )
                        }
                    }
                    "VALIDATION" -> _ui.update { it.copy(saveState = SaveState.VALIDATION, saveMessage = res.message) }
                    else -> _ui.update { it.copy(saveState = SaveState.ERROR, saveMessage = OwnerLocalization.renderErrorCodeRu(res.code)) }
                }
            }
        }
    }

    private fun nowIso(): String =
        java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.US).format(java.util.Date())
}
