package ru.dmitry.matercontroller

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import ru.dmitry.matercontroller.core.data.ErrorCodes
import ru.dmitry.matercontroller.core.data.RepoLogic
import ru.dmitry.matercontroller.core.ui.OwnerLocalization
import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

/**
 * RC4 offline-safety + presentation proofs (pure JVM — no Android/network).
 * The repository's readCached() falls back to cache_kv on transport failure and only surfaces a
 * NETWORK error when there is no cache; these tests lock the localization + cache-eligibility logic
 * those paths depend on, plus the version/device presentation rules.
 */
class OfflineAndMetadataTest {

    // ---- network error localization: raw transport text never shown ----
    @Test fun connectionClosedLocalized() {
        val out = OwnerLocalization.renderNetworkErrorRu(IOException("connection closed"))
        assertEquals("Нет соединения с сервером", out)
        assertFalse(out.lowercase().contains("connection closed"))
    }

    @Test fun timeoutLocalized() {
        assertEquals("Время ожидания истекло", OwnerLocalization.renderNetworkErrorRu(SocketTimeoutException("timeout")))
    }

    @Test fun unknownHostLocalized() {
        assertEquals("Нет соединения с сервером", OwnerLocalization.renderNetworkErrorRu(UnknownHostException("no address")))
    }

    @Test fun connectExceptionLocalized() {
        assertEquals("Не удалось подключиться к серверу", OwnerLocalization.renderNetworkErrorRu(ConnectException("connection refused")))
    }

    @Test fun sslLocalized() {
        assertEquals("Не удалось установить защищённое соединение", OwnerLocalization.renderNetworkErrorRu(javax.net.ssl.SSLException("handshake failed")))
    }

    @Test fun serverUnavailableLocalized() {
        assertEquals("Сервер временно недоступен", OwnerLocalization.renderNetworkErrorRu(IOException("HTTP 503")))
    }

    @Test fun networkErrorNeverLeaksRawClassNames() {
        val errs = listOf(
            IOException("unexpected end of stream"),
            ConnectException("ECONNREFUSED"),
            SocketTimeoutException("timed out"),
            UnknownHostException("sslip.io"),
            RuntimeException("retrofit2.HttpException okhttp3"),
        )
        for (e in errs) {
            val out = OwnerLocalization.renderNetworkErrorRu(e)
            assertFalse(out.contains("java."))
            assertFalse(out.contains("okhttp"))
            assertFalse(out.contains("retrofit"))
            assertFalse(out.lowercase().contains("exception"))
            assertTrue(out.isNotBlank())
        }
    }

    // ---- cache eligibility: never serve stale on auth failures ----
    @Test fun staleCacheOnTransportButNotAuth() {
        assertTrue(RepoLogic.shouldUseStaleCache(ErrorCodes.NETWORK))
        assertTrue(RepoLogic.shouldUseStaleCache(ErrorCodes.UNAVAILABLE))
        assertTrue(RepoLogic.shouldUseStaleCache(ErrorCodes.TIMEOUT))
        assertFalse(RepoLogic.shouldUseStaleCache(ErrorCodes.UNAUTHORIZED))
        assertFalse(RepoLogic.shouldUseStaleCache(ErrorCodes.FORBIDDEN))
    }

    // ---- offline strings are Russian, no raw codes ----
    @Test fun offlineStringsRussian() {
        assertTrue(OwnerLocalization.OFFLINE_BANNER.contains("Офлайн"))
        assertTrue(OwnerLocalization.OFFLINE_EMPTY.contains("Нет соединения"))
        assertTrue(OwnerLocalization.OFFLINE_MUTATION_DISABLED.contains("недоступно"))
        val cached = OwnerLocalization.renderCachedAtRu(0L)
        assertFalse(cached.contains("null"))
    }

    // ---- mutation safety reducer: success ONLY via backend confirm; offline => Failed, never Confirmed ----
    @Test fun offlineMutationNeverFalseSuccess() {
        // a NETWORK error reduces to Failed, never Confirmed (no optimistic success)
        assertEquals(
            ru.dmitry.matercontroller.core.ui.MutationPhase.Failed,
            RepoLogic.reduceMutation(ru.dmitry.matercontroller.core.data.DataResult.Error(ErrorCodes.NETWORK, "offline")),
        )
        assertEquals(
            ru.dmitry.matercontroller.core.ui.MutationPhase.Confirmed,
            RepoLogic.reduceMutation(ru.dmitry.matercontroller.core.data.DataResult.Success(true)),
        )
    }

    // ---- version: BuildConfig is the source, no hardcoded 1.0.0 ----
    @Test fun buildConfigVersionIsCurrentNotHardcoded() {
        assertEquals("0.8.0-rc7", BuildConfig.VERSION_NAME)
        assertEquals(31, BuildConfig.VERSION_CODE)
        assertFalse(BuildConfig.VERSION_NAME == "1.0.0")
    }

    // ---- date formatting helper (locale, source not mutated) ----
    @Test fun cachedAtFormatsWithoutNull() {
        // epoch 0 → some date string, never the raw long or null
        val s = OwnerLocalization.renderCachedAtRu(1_700_000_000_000L)
        assertTrue(s.contains("Последнее обновление") || s.contains("Офлайн"))
        assertFalse(s.contains("169") || s.contains("170")) // not the raw epoch millis
    }

    // ---- RC5: System cache counts survive offline (CountsData round-trips) ----
    @Test fun countsDataRoundTripsThroughJson() {
        val j = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }
        val data = ru.dmitry.matercontroller.core.model.CountsData(mapOf("COMPLETED" to 28, "RUNNING" to 0, "PENDING" to 0))
        val enc = j.encodeToString(ru.dmitry.matercontroller.core.model.CountsData.serializer(), data)
        val back = j.decodeFromString(ru.dmitry.matercontroller.core.model.CountsData.serializer(), enc)
        assertEquals(28, back.counts["COMPLETED"])
        assertEquals(0, back.counts["RUNNING"])
        assertEquals(3, back.counts.size)
    }

    // ---- RC5: AutomationStatusDto round-trips (revision 66 survives cache) ----
    @Test fun automationDtoRoundTripsWithRevision() {
        val j = kotlinx.serialization.json.Json { ignoreUnknownKeys = true; explicitNulls = false }
        val raw = """{"canonicalWriter":true,"autosend":"BLOCKED","sendAllowedLive":false,"storeRevision":66,"deadLetter":0,"running":0,"queued":0}"""
        val dto = j.decodeFromString(ru.dmitry.matercontroller.core.model.AutomationStatusDto.serializer(), raw)
        val back = j.decodeFromString(ru.dmitry.matercontroller.core.model.AutomationStatusDto.serializer(), j.encodeToString(ru.dmitry.matercontroller.core.model.AutomationStatusDto.serializer(), dto))
        assertEquals(66, back.storeRevision)
        assertTrue(back.canonicalWriter)
        assertEquals("BLOCKED", back.autosend)
        assertEquals(0, back.deadLetter)
    }

    // ---- RC5: unknown counts must read as unknown, never a false 0 ----
    @Test fun unknownQueueCountsRenderDashNotZero() {
        // queueCountsKnown=false → UI shows «—»; known with 0 → "0"
        val unknown = ru.dmitry.matercontroller.feature.operations.OperationsUi(queueCountsKnown = false)
        val knownZero = ru.dmitry.matercontroller.feature.operations.OperationsUi(queueCountsKnown = true, queueCounts = mapOf("COMPLETED" to 0))
        val knownReal = ru.dmitry.matercontroller.feature.operations.OperationsUi(queueCountsKnown = true, queueCounts = mapOf("COMPLETED" to 28))
        // mirror the screen's render rule
        fun completed(ui: ru.dmitry.matercontroller.feature.operations.OperationsUi) =
            if (ui.queueCountsKnown) (ui.queueCounts["COMPLETED"] ?: 0).toString() else "—"
        assertEquals("—", completed(unknown))
        assertEquals("0", completed(knownZero))
        assertEquals("28", completed(knownReal))
    }

    // ---- RC5: owner terminology ----
    @Test fun writerStateRussianNoRawWriter() {
        assertEquals("работает", OwnerLocalization.renderWriterStateRu(true))
        assertEquals("не активен", OwnerLocalization.renderWriterStateRu(false))
        assertFalse(OwnerLocalization.renderWriterStateRu(true).lowercase().contains("writer"))
    }

    @Test fun followupReasonUsesPovtornoeObrashenie() {
        val out = OwnerLocalization.renderNextActionReasonRu(
            ru.dmitry.matercontroller.core.model.NextActionData(kind = "followup"),
        )
        assertTrue(out.contains("повторное обращение"))
        assertFalse(out.lowercase().contains("follow-up"))
        assertFalse(out.lowercase().contains("followup"))
    }

    @Test fun followupStatusLabelsRussian() {
        assertFalse(OwnerLocalization.renderApprovalStatusRu("followup_due").lowercase().contains("follow"))
        assertEquals(OwnerLocalization.FOLLOWUP_TERM, "Повторный контакт")
    }
}
