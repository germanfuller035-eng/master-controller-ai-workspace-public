package ru.dmitry.matercontroller.core.data

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import ru.dmitry.matercontroller.core.ui.MutationPhase

/**
 * Pure, side-effect-free logic shared by the repository and ViewModels. Extracted so it can be
 * unit-tested without Android/Context/network dependencies (the spec's "narrow, deterministic"
 * seam) — the repository and ViewModels delegate to these instead of inlining the logic.
 */
object RepoLogic {
    /** Decode a free-form `{STATUS: count}` JSON object (jobs/counts, pipeline/counts). */
    fun decodeCounts(el: JsonElement?): Map<String, Int> {
        val obj = el as? JsonObject ?: return emptyMap()
        return obj.mapNotNull { (k, v) -> (v as? JsonPrimitive)?.content?.toIntOrNull()?.let { k to it } }.toMap()
    }

    /**
     * Reduce a mutation result to the next MutationPhase. A 409 conflict is distinct from a
     * generic failure (the UI reloads canonical state on conflict). Success is the ONLY path to
     * Confirmed — there is no optimistic success.
     */
    fun reduceMutation(result: DataResult<Boolean>): MutationPhase = when (result) {
        is DataResult.Success -> MutationPhase.Confirmed
        is DataResult.Error -> if (result.code == ErrorCodes.CONFLICT) MutationPhase.Conflict else MutationPhase.Failed
    }

    /** Whether an error code should fall back to stale cache (vs. surface the error directly). */
    fun shouldUseStaleCache(code: String): Boolean = when (code) {
        ErrorCodes.UNAUTHORIZED, ErrorCodes.FORBIDDEN -> false   // never serve stale on auth failures
        else -> true
    }
}
