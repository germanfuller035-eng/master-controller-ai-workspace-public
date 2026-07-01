package ru.dmitry.matercontroller.core.data

/** A network/data result with an explicit offline/stale signal for the UI. */
sealed interface DataResult<out T> {
    data class Success<T>(val data: T, val fromCache: Boolean = false, val cachedAt: Long? = null) : DataResult<T>
    data class Error(val code: String, val message: String) : DataResult<Nothing>
}

object ErrorCodes {
    const val NETWORK = "NETWORK"
    const val UNAUTHORIZED = "UNAUTHORIZED"
    const val NOT_PAIRED = "NOT_PAIRED"
    const val SERVER = "SERVER"
    // distinct backend states the UI must surface differently
    const val FORBIDDEN = "FORBIDDEN"            // 403 scope denied
    const val CONFLICT = "CONFLICT"              // 409 revision conflict → reload canonical
    const val REVISION_CONFLICT = "REVISION_CONFLICT" // 409 on a revision-guarded command (offer decision)
    const val MAINTENANCE = "MAINTENANCE"        // 423 maintenance lock
    const val RATE_LIMITED = "RATE_LIMITED"      // 429
    const val UNAVAILABLE = "UNAVAILABLE"        // 503 backend unavailable → stale cache ok
    const val TIMEOUT = "TIMEOUT"
    const val NOT_FOUND = "NOT_FOUND"            // 404

    /** Map an HTTP status to a distinct error code. */
    fun fromHttp(status: Int): String = when (status) {
        401 -> UNAUTHORIZED
        403 -> FORBIDDEN
        404 -> NOT_FOUND
        409 -> CONFLICT
        423 -> MAINTENANCE
        429 -> RATE_LIMITED
        503 -> UNAVAILABLE
        else -> SERVER
    }
}

