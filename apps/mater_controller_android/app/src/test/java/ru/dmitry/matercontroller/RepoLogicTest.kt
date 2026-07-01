package ru.dmitry.matercontroller

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import org.junit.Assert.*
import org.junit.Test
import ru.dmitry.matercontroller.core.data.DataResult
import ru.dmitry.matercontroller.core.data.ErrorCodes
import ru.dmitry.matercontroller.core.data.RepoLogic
import ru.dmitry.matercontroller.core.ui.MutationPhase

/** Pure repository/mutation logic — the real production path (repo + VMs delegate here). */
class RepoLogicTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test fun decodeCountsParsesStatusMap() {
        val el = json.decodeFromString(JsonElement.serializer(), """{"COMPLETED":27,"QUEUED":2,"DEAD_LETTER":0}""")
        val m = RepoLogic.decodeCounts(el)
        assertEquals(27, m["COMPLETED"])
        assertEquals(0, m["DEAD_LETTER"])
        assertEquals(3, m.size)
    }

    @Test fun decodeCountsHandlesEmptyAndNonObject() {
        assertTrue(RepoLogic.decodeCounts(null).isEmpty())
        val arr = json.decodeFromString(JsonElement.serializer(), """[1,2,3]""")
        assertTrue(RepoLogic.decodeCounts(arr).isEmpty())
    }

    @Test fun mutationSuccessOnlyPathToConfirmed() {
        assertEquals(MutationPhase.Confirmed, RepoLogic.reduceMutation(DataResult.Success(true)))
    }

    @Test fun mutationConflictIsDistinctFromFailure() {
        assertEquals(MutationPhase.Conflict, RepoLogic.reduceMutation(DataResult.Error(ErrorCodes.CONFLICT, "stale")))
        assertEquals(MutationPhase.Failed, RepoLogic.reduceMutation(DataResult.Error(ErrorCodes.SERVER, "boom")))
        assertEquals(MutationPhase.Failed, RepoLogic.reduceMutation(DataResult.Error(ErrorCodes.NETWORK, "offline")))
    }

    @Test fun staleCacheNotServedOnAuthFailures() {
        assertFalse(RepoLogic.shouldUseStaleCache(ErrorCodes.UNAUTHORIZED))
        assertFalse(RepoLogic.shouldUseStaleCache(ErrorCodes.FORBIDDEN))
        // network/unavailable/etc may serve stale cache
        assertTrue(RepoLogic.shouldUseStaleCache(ErrorCodes.NETWORK))
        assertTrue(RepoLogic.shouldUseStaleCache(ErrorCodes.UNAVAILABLE))
    }
}
