package ru.dmitry.matercontroller.core.ui

/** Generic screen UI state with loading/empty/offline/error. */
data class UiState<T>(
    val loading: Boolean = false,
    val data: T? = null,
    val error: String? = null,
    val offline: Boolean = false,
    val cachedAt: Long? = null,
) {
    val isEmpty: Boolean get() = !loading && error == null && data == null
}
