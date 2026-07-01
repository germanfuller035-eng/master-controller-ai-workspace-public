package ru.dmitry.matercontroller

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import ru.dmitry.matercontroller.core.model.BackupStatus
import ru.dmitry.matercontroller.core.model.CostOverview
import ru.dmitry.matercontroller.core.model.PushStatus
import ru.dmitry.matercontroller.core.model.ReliabilityOverview

/**
 * ProdCaptureMappingTest — deserializes REAL captured production JSON (api/v1 data payloads,
 * captured 0.8.0-rc3) through the ACTUAL Android DTOs. This proves the production-truth → DTO
 * contract for the new owner-center screens: if the server shape and the Kotlin DTO disagree,
 * this test fails. Fixtures live in src/test/resources/prod_capture/.
 */
class ProdCaptureMappingTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    private fun load(name: String): String =
        this::class.java.classLoader!!.getResourceAsStream("prod_capture/$name")!!.bufferedReader().readText()

    @Test fun reliabilityProdJsonMapsToDto() {
        val d = json.decodeFromString(ReliabilityOverview.serializer(), load("reliability.json"))
        assertEquals("reliability_v1", d.reliability_version)
        assertTrue("overall_health real verdict", d.overall_health in listOf("HEALTHY", "DEGRADED", "DOWN", "UNKNOWN"))
        assertTrue("services present", d.services.isNotEmpty())
        assertTrue("api service mapped", d.services.any { it.key == "api" })
        // queue dead_letter is a JsonElement (number or "UNKNOWN") — must not crash mapping
        assertTrue("queue mapped", d.queue != null)
    }

    @Test fun costsProdJsonMapsToDto() {
        val d = json.decodeFromString(CostOverview.serializer(), load("costs.json"))
        assertEquals("cost_center_v1", d.cost_center_version)
        assertTrue("total units is real number from prod ledger", d.total_calculated_units >= 0)
        assertTrue("budget present", d.budget != null)
        // money honesty: either a real ESTIMATE or UNKNOWN, never silently coerced
        assertTrue("money class honest", d.estimated_money_class == "UNKNOWN" || d.estimated_money_class == "ESTIMATE")
    }

    @Test fun backupStatusProdJsonMapsToDto() {
        val d = json.decodeFromString(BackupStatus.serializer(), load("backups_status.json"))
        assertEquals("backup_center_v1", d.backup_center_version)
        assertTrue("inventory present", d.items.isNotEmpty())
        assertTrue("canonical_leads protected", d.items.any { it.key == "canonical_leads" && it.critical })
    }

    @Test fun pushStatusProdJsonMapsToDto() {
        val d = json.decodeFromString(PushStatus.serializer(), load("push_status.json"))
        assertEquals("fcm_push_v1", d.fcm_push_version)
        // production has NO firebase creds → honest CREDENTIAL_REQUIRED, never a fake LIVE
        assertEquals("CREDENTIAL_REQUIRED", d.delivery_state)
        assertEquals(false, d.credential_present)
        assertEquals(false, d.sends_client_messages)
    }
}
