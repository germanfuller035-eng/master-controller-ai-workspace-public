package ru.dmitry.matercontroller

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import ru.dmitry.matercontroller.core.model.ChannelsList
import ru.dmitry.matercontroller.core.model.Envelope
import ru.dmitry.matercontroller.core.model.SourceHealthList
import ru.dmitry.matercontroller.core.model.SourcesList

/** 0.6.0 multichannel Android proofs: sources/channels parse; outbound disabled; no-data not zero. */
class MultichannelMappingTest {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true; explicitNulls = false }

    @Test fun sourcesParse() {
        val raw = """{"ok":true,"data":{"items":[{"source_id":"osm_overpass","source_type":"OSM","display_name":"OSM","status":"ACTIVE","capabilities":["DISCOVERY"]},{"source_id":"vk_communities","source_type":"VK","display_name":"VK","status":"PENDING_CREDENTIAL","capabilities":["DISCOVERY"]}],"total":2},"error":null}"""
        val env = json.decodeFromString(Envelope.serializer(SourcesList.serializer()), raw)
        assertEquals(2, env.data?.total)
        assertEquals("ACTIVE", env.data?.items?.first()?.status)
    }

    @Test fun channelsOutboundDisabled() {
        val raw = """{"ok":true,"data":{"items":[{"channel":"VK","discovery":"separate","inbound":"PENDING_CREDENTIAL","outbound":"OFF"}],"outbound_channels_enabled":0},"error":null}"""
        val env = json.decodeFromString(Envelope.serializer(ChannelsList.serializer()), raw)
        assertEquals(0, env.data?.outbound_channels_enabled)
        assertEquals("OFF", env.data?.items?.first()?.outbound)
    }

    @Test fun sourceHealthNoDataNotZero() {
        val raw = """{"ok":true,"data":{"items":[{"source_id":"vk_communities","status":"PENDING_CREDENTIAL","candidates":null,"has_data":false}]},"error":null}"""
        val env = json.decodeFromString(Envelope.serializer(SourceHealthList.serializer()), raw)
        val item = env.data?.items?.first()
        // candidates is null (no data), NOT 0
        assertEquals(null, item?.candidates)
        assertFalse(item!!.has_data)
    }
}
