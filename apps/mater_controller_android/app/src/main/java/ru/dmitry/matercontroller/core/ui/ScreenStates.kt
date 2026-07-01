package ru.dmitry.matercontroller.core.ui

/**
 * Standard screen + mutation states shared across release domains. Kept as a small sealed
 * surface so ViewModels and tests can reason about UI state without per-screen duplication.
 * No state here implies an offline mutation succeeded — mutations are only ever Confirmed by
 * the backend.
 */
enum class ScreenPhase { Initial, Loading, Content, Empty, Refreshing, StaleContent, Unauthorized, Maintenance, Conflict, RateLimited, Unavailable, Error }

enum class MutationPhase { Idle, Submitting, Confirmed, Conflict, Failed }

/** Maps an ErrorCodes constant to the matching screen phase. */
fun screenPhaseForError(code: String): ScreenPhase = when (code) {
    "UNAUTHORIZED" -> ScreenPhase.Unauthorized
    "MAINTENANCE" -> ScreenPhase.Maintenance
    "CONFLICT" -> ScreenPhase.Conflict
    "RATE_LIMITED" -> ScreenPhase.RateLimited
    "UNAVAILABLE" -> ScreenPhase.Unavailable
    else -> ScreenPhase.Error
}

/** Persistent banner text shown anywhere a mutation can be triggered. Send is always off. */
const val SEND_DISABLED_WARNING = "Отправка отключена. Подтверждение сохранит решение, но письмо не будет отправлено."
