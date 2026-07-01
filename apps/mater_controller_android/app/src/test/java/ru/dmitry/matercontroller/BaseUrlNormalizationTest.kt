package ru.dmitry.matercontroller

import org.junit.Assert.assertEquals
import org.junit.Test
import ru.dmitry.matercontroller.core.network.BaseUrlHolder

/**
 * Cold-start fix coverage: base URL normalization is the core of P0-1.
 * Both https://host and https://host/api/v1 must collapse to the same origin,
 * and an empty/garbage input must not silently become a localhost default.
 */
class BaseUrlNormalizationTest {

    @Test
    fun hostOnly_getsTrailingSlash() {
        assertEquals("https://195-96-132-82.sslip.io/", BaseUrlHolder.normalizeOrigin("https://195-96-132-82.sslip.io"))
    }

    @Test
    fun hostWithApiV1_suffixStripped() {
        assertEquals("https://195-96-132-82.sslip.io/", BaseUrlHolder.normalizeOrigin("https://195-96-132-82.sslip.io/api/v1"))
    }

    @Test
    fun hostWithApiV1TrailingSlash_suffixStripped() {
        assertEquals("https://195-96-132-82.sslip.io/", BaseUrlHolder.normalizeOrigin("https://195-96-132-82.sslip.io/api/v1/"))
    }

    @Test
    fun surroundingWhitespace_trimmed() {
        assertEquals("https://host.example/", BaseUrlHolder.normalizeOrigin("  https://host.example  "))
    }

    @Test
    fun empty_staysEmpty_noLocalhostFallback() {
        assertEquals("", BaseUrlHolder.normalizeOrigin(""))
        assertEquals("", BaseUrlHolder.normalizeOrigin("   "))
    }

    @Test
    fun holder_apiBaseEmptyWhenUnconfigured() {
        val h = BaseUrlHolder()
        assertEquals(false, h.isConfigured)
        assertEquals("", h.apiBase)
    }

    @Test
    fun holder_apiBaseAppendsVersionOnce() {
        val h = BaseUrlHolder()
        h.url = "https://195-96-132-82.sslip.io/api/v1"
        assertEquals(true, h.isConfigured)
        assertEquals("https://195-96-132-82.sslip.io/api/v1/", h.apiBase)
    }
}
