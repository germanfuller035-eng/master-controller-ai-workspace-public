package ru.dmitry.matercontroller

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import ru.dmitry.matercontroller.core.model.AiUsageReconciliationDto
import ru.dmitry.matercontroller.core.model.Envelope
import ru.dmitry.matercontroller.core.model.KnowledgeDigestDto
import ru.dmitry.matercontroller.core.model.OfferPreviewDto
import ru.dmitry.matercontroller.core.model.OwnerSettingsAuditDto
import ru.dmitry.matercontroller.core.model.OwnerSettingsDto
import ru.dmitry.matercontroller.core.model.ProductPresentationDto
import ru.dmitry.matercontroller.core.model.ReservoirFunnelDto
import ru.dmitry.matercontroller.core.model.ReservoirSummaryDto
import ru.dmitry.matercontroller.core.model.SourceTelemetryList
import ru.dmitry.matercontroller.core.ui.OwnerLocalization

/**
 * 0.6.0-rc5 — mapping proofs for the new authoritative read DTOs and owner-facing localization.
 * The backend serializes snake_case and the app Json config has NO namingStrategy, so property
 * names == wire names. Critical RC5 invariant: raw tokens may be a NUMBER or the string "UNKNOWN";
 * the DTO field is String? and renders «неизвестно» (never a false 0).
 */
class Rc5DtoMappingTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; coerceInputValues = true; explicitNulls = false }

    // ---- product presentation (Russian owner-facing) ----
    @Test fun parsesProductPresentationSnakeCase() {
        val raw = """
            {"ok":true,"data":{
              "product_code":"mini_audit","product_name_ru":"Мини-аудит сайта",
              "description_ru":"Проверка сайта и пути клиента до заявки",
              "scope_ru":["Анализ сайта","Проверка форм"],"exclusions_ru":["Реклама не входит"],
              "required_inputs_ru":["Адрес сайта"],"outputs_ru":["Отчёт PDF"],
              "acceptance_criteria_ru":["Отчёт получен"],"price":10000,"currency":"RUB"
            },"error":null}
        """.trimIndent()
        val env = json.decodeFromString(Envelope.serializer(ProductPresentationDto.serializer()), raw)
        val p = env.data!!
        assertEquals("mini_audit", p.product_code)
        assertEquals("Мини-аудит сайта", p.product_name_ru)
        assertEquals(2, p.scope_ru.size)
        assertEquals(1, p.exclusions_ru.size)
        assertEquals(1, p.outputs_ru.size)
        assertEquals(10000.0, p.price!!, 0.001)
    }

    // ---- AI usage reconciliation: raw tokens as number AND as "UNKNOWN" ----
    @Test fun parsesReconciliationWithNumericRawTokens() {
        val raw = """
            {"ok":true,"data":{
              "since_persistent_ledger":1000,"confirmed_pre_ledger_history":500,"total_known_usage":1500,
              "actual_records":40,"estimated_records":5,"no_llm_records":3,"historical_records":10,
              "raw_input_tokens":"98765","raw_output_tokens":"54321","provider_calls":42,
              "pre_ledger_provider_calls":"UNKNOWN",
              "by_source_units":{"ACTUAL_PROVIDER_RESPONSE":120000,"ESTIMATED":2000,
                "CONFIRMED_HISTORICAL_EVIDENCE":500,"SYNTHETIC_TEST":0},
              "false_zeros":0,"evidence_reference":"ledger#2026-06"
            },"error":null}
        """.trimIndent()
        val env = json.decodeFromString(Envelope.serializer(AiUsageReconciliationDto.serializer()), raw)
        val r = env.data!!
        assertEquals(1500L, r.total_known_usage)
        // raw tokens are String? — numeric string parses and renders grouped, not 0.
        assertEquals("98765", r.raw_input_tokens)
        assertEquals("UNKNOWN", r.pre_ledger_provider_calls)
        assertEquals(120000L, r.by_source_units!!.ACTUAL_PROVIDER_RESPONSE)
        // render: numeric → grouped value; UNKNOWN → «неизвестно»; never a false 0.
        assertEquals("98 765", OwnerLocalization.renderRawTokensRu(r.raw_input_tokens))
        assertEquals("неизвестно", OwnerLocalization.renderRawTokensRu(r.pre_ledger_provider_calls))
    }

    @Test fun rawTokensUnknownNeverShownAsZero() {
        // literal "UNKNOWN" → «неизвестно»; null → «нет данных»; неверно было бы вернуть 0.
        assertEquals("неизвестно", OwnerLocalization.renderRawTokensRu("UNKNOWN"))
        assertEquals("нет данных", OwnerLocalization.renderRawTokensRu(null))
        assertEquals("0", OwnerLocalization.renderRawTokensRu("0")) // a real 0 stays 0
        assertFalse(OwnerLocalization.renderRawTokensRu("UNKNOWN").contains("0"))
    }

    @Test fun reconciliationAcceptsNumericRawTokensFieldType() {
        // Backend sometimes emits a bare number for raw_input_tokens. With isLenient the DTO String?
        // still accepts it; the render path then groups it. (Lenient JSON coerces 12345 → "12345".)
        val raw = """{"ok":true,"data":{"raw_input_tokens":12345,"raw_output_tokens":"UNKNOWN"},"error":null}"""
        val env = json.decodeFromString(Envelope.serializer(AiUsageReconciliationDto.serializer()), raw)
        val r = env.data!!
        assertEquals("12 345", OwnerLocalization.renderRawTokensRu(r.raw_input_tokens))
        assertEquals("неизвестно", OwnerLocalization.renderRawTokensRu(r.raw_output_tokens))
    }

    // ---- source telemetry ----
    @Test fun parsesSourceTelemetrySnakeCase() {
        val raw = """
            {"ok":true,"data":{"items":[
              {"source_id":"overpass","display_name":"OpenStreetMap","source_type":"discovery",
               "enabled":true,"credential_state":"not_required","health_state":"HEALTHY",
               "disabled_reason":null,"last_check_at":"2026-06-18T09:00","last_success_at":"2026-06-18T09:00",
               "last_failure_at":null,"last_error_category":null,"records_discovered_total":1200,
               "records_discovered_last_run":40,"records_promoted_total":300,"records_rejected_total":50,
               "cost_class":"FREE","inbound_capability":false,"discovery_capability":true,
               "outbound_capability":false,"never_run_note":null},
              {"source_id":"two_gis","display_name":"2ГИС","source_type":"discovery","enabled":false,
               "credential_state":"missing","health_state":"CREDENTIAL_REQUIRED","cost_class":"PAID",
               "never_run_note":"Источник ещё ни разу не запускался"}
            ]},"error":null}
        """.trimIndent()
        val env = json.decodeFromString(Envelope.serializer(SourceTelemetryList.serializer()), raw)
        val items = env.data!!.items
        assertEquals(2, items.size)
        val osm = items[0]
        assertEquals("OpenStreetMap", osm.display_name)
        assertEquals(1200L, osm.records_discovered_total)
        assertTrue(osm.discovery_capability == true)
        // health localized; raw codes never leak
        assertEquals("работает", OwnerLocalization.renderHealthStateRu(osm.health_state))
        assertEquals("бесплатный", OwnerLocalization.renderCostClassBinaryRu(osm.cost_class))
        val gis = items[1]
        assertEquals("нужен ключ", OwnerLocalization.renderHealthStateRu(gis.health_state))
        assertEquals("платный", OwnerLocalization.renderCostClassBinaryRu(gis.cost_class))
        // disabled source: a null counter renders «—», never a false 0.
        assertEquals("—", OwnerLocalization.renderCounterRu(gis.records_discovered_total, disabled = true))
    }

    // ---- owner settings (read + hard limits + audit) ----
    @Test fun parsesOwnerSettingsSnakeCase() {
        val raw = """
            {"ok":true,"data":{
              "settings_revision":7,"profile":"balanced","discovery_runs_per_day":2,
              "raw_candidates_per_day":200,"verified_leads_per_day":20,"sites_checked_per_day":100,
              "same_segment_rescan_days":30,"owner_queue_max":50,"audit_ready_queue_max":40,
              "ai_audits_per_day":10,"offers_per_day":5,"daily_calculated_units_limit":500000,
              "premium_calls_per_day":0,"repair_attempts":2,"fallback_attempts":1,"provider_concurrency":2,
              "source_strategy":"FREE_ONLY","paid_sources_enabled":false,
              "morning_discovery_time":"08:00","evening_discovery_time":"18:00",
              "processing_window":"08:00-20:00","timezone":"TIMEZONE_UNKNOWN",
              "hard_limits":{"discovery_runs_per_day":6,"ai_audits_per_day":50},
              "profiles_available":["economy","balanced","active","custom"],
              "source_strategy_active":["FREE_ONLY"]
            },"error":null}
        """.trimIndent()
        val env = json.decodeFromString(Envelope.serializer(OwnerSettingsDto.serializer()), raw)
        val s = env.data!!
        assertEquals(7, s.settings_revision)
        assertEquals("FREE_ONLY", s.source_strategy)
        assertEquals(6.0, s.hard_limits["discovery_runs_per_day"]!!, 0.001)
        assertEquals(4, s.profiles_available.size)
        // localization: profile + strategy + timezone unknown
        assertEquals("Сбалансированный", OwnerLocalization.renderProfileRu(s.profile))
        assertEquals("Только бесплатные", OwnerLocalization.renderSourceStrategyRu(s.source_strategy))
        assertTrue(OwnerLocalization.isTimezoneUnknown(s.timezone))
    }

    @Test fun parsesOwnerSettingsAuditSnakeCase() {
        val raw = """
            {"ok":true,"data":{"items":[
              {"revision":7,"at":"2026-06-18T10:00","by":"owner","changed_fields":["ai_audits_per_day"],"profile":"custom"},
              {"revision":6,"at":"2026-06-10T09:00","by":"owner","changed_fields":["profile"],"profile":"balanced"}
            ]},"error":null}
        """.trimIndent()
        val env = json.decodeFromString(Envelope.serializer(OwnerSettingsAuditDto.serializer()), raw)
        assertEquals(2, env.data!!.items.size)
        assertEquals(7, env.data!!.items.first().revision)
        assertEquals(listOf("ai_audits_per_day"), env.data!!.items.first().changed_fields)
    }

    @Test fun settingsValidationErrorsLocalized() {
        // hard-limit and paid-confirmation 422 codes → owner-facing Russian (never raw code).
        assertTrue(OwnerLocalization.renderSettingsErrorRu("exceeds_hard_limit", limit = 6.0).contains("лимит"))
        assertTrue(OwnerLocalization.renderSettingsErrorRu("exceeds_hard_limit", limit = 6.0).contains("6"))
        assertTrue(OwnerLocalization.renderSettingsErrorRu("paid_source_requires_confirmation").contains("платных"))
        assertFalse(OwnerLocalization.renderSettingsErrorRu("exceeds_hard_limit").contains("exceeds"))
    }

    @Test fun settingsFieldLabelsLocalizedNoRawCodes() {
        assertEquals("ИИ-аудитов в день", OwnerLocalization.renderSettingsFieldRu("ai_audits_per_day"))
        assertEquals("Стратегия источников", OwnerLocalization.renderSettingsFieldRu("source_strategy"))
        assertFalse(OwnerLocalization.renderSettingsFieldRu("owner_queue_max").contains("_"))
    }

    // ---- reservoir summary + funnel ----
    @Test fun parsesReservoirSummarySnakeCase() {
        val raw = """
            {"ok":true,"data":{
              "reservoir_domains":15000,"by_state":{"raw":10000,"contact_verified":2000,"rejected":3000},
              "cursor":"abc","runs_total":120,"canonical_promotions_total":400,
              "common_crawl_adapter":"cc-main","common_crawl_mode":"TEST_ONLY",
              "common_crawl_refresh":"weekly","paid_sources_enabled":false
            },"error":null}
        """.trimIndent()
        val env = json.decodeFromString(Envelope.serializer(ReservoirSummaryDto.serializer()), raw)
        val s = env.data!!
        assertEquals(15000L, s.reservoir_domains)
        assertEquals(10000L, s.by_state["raw"])
        // TEST_ONLY mode is explicitly localized as internal/service-only.
        assertEquals("служебный", OwnerLocalization.renderCrawlModeRu(s.common_crawl_mode))
        assertFalse(s.paid_sources_enabled == true)
    }

    @Test fun parsesReservoirFunnelSnakeCase() {
        val raw = """
            {"ok":true,"data":{
              "raw_candidates":10000,"technically_alive":8000,"business_identified":5000,
              "contact_verified":2000,"audit_candidates":1000,"audit_ready":500,
              "promoted_to_canonical":400,"rejected":3000,"raw_import_ai_calls":0
            },"error":null}
        """.trimIndent()
        val env = json.decodeFromString(Envelope.serializer(ReservoirFunnelDto.serializer()), raw)
        val f = env.data!!
        assertEquals(10000L, f.raw_candidates)
        assertEquals(0L, f.raw_import_ai_calls)
        // a real 0 stays 0 (free import), not «нет данных».
        assertEquals("0", OwnerLocalization.renderCounterRu(f.raw_import_ai_calls))
    }

    // ---- offer preview next_step provenance ----
    @Test fun parsesOfferPreviewNextStepProvenance() {
        val raw = """
            {"ok":true,"data":{
              "offer_id":"offer_1","next_step":"Согласовать встречу","next_step_source":"qa_agent",
              "next_step_created_at":"2026-06-18T11:00","missing_fields":{},
              "no_send_notice":"Клиенту ничего не отправляется."
            },"error":null}
        """.trimIndent()
        val env = json.decodeFromString(Envelope.serializer(OfferPreviewDto.serializer()), raw)
        val p = env.data!!
        assertEquals("Согласовать встречу", p.next_step)
        assertEquals("qa_agent", p.next_step_source)
        assertEquals("2026-06-18T11:00", p.next_step_created_at)
    }

    @Test fun offerPreviewMissingNextStepUsesMissingFieldsReason() {
        val raw = """
            {"ok":true,"data":{"offer_id":"offer_2","next_step":null,
              "missing_fields":{"next_step":"не сформирован агентом"}},"error":null}
        """.trimIndent()
        val env = json.decodeFromString(Envelope.serializer(OfferPreviewDto.serializer()), raw)
        val p = env.data!!
        assertNull(p.next_step)
        assertEquals("не сформирован агентом", p.missing_fields["next_step"])
    }

    // ---- knowledge digest evidence fields + verification badge ----
    @Test fun parsesKnowledgeDigestEvidenceFields() {
        val raw = """
            {"ok":true,"data":{"window":"urgent","items":[
              {"item_id":"k1","title":"CVE в библиотеке","category":"security","source_id":"nvd",
               "source_name":"NVD","source_tier":1,"source_url":"https://nvd.nist.gov/vuln/CVE-2026-1",
               "published_at":"2026-06-15T00:00","cve_id":"CVE-2026-1","advisory_id":"GHSA-xxxx",
               "affected_versions":"<2.1.0","installed_version":"2.0.3","stack_match":"match",
               "applicability":"applicable","effective_at":"2026-06-16T00:00","document_id":"doc-9",
               "evidence_excerpt":"RCE при обработке ввода","urgency":"critical",
               "review_route":"security_review","priority_reason":"совпадение версии",
               "verification":"TEST_ONLY","recommended_action":"Обновить библиотеку",
               "owner_decision_required":true}
            ]},"error":null}
        """.trimIndent()
        val env = json.decodeFromString(Envelope.serializer(KnowledgeDigestDto.serializer()), raw)
        val item = env.data!!.items.first()
        assertEquals("k1", item.itemKey) // item_id mapped via itemKey
        assertEquals("CVE-2026-1", item.cve_id)
        assertEquals("2.0.3", item.installed_version)
        assertEquals("doc-9", item.document_id)
        assertEquals("https://nvd.nist.gov/vuln/CVE-2026-1", item.source_url)
        // verification badge: TEST_ONLY is explicit and flagged as internal/service-only.
        assertEquals("служебное", OwnerLocalization.renderVerificationRu(item.verification))
        assertTrue(OwnerLocalization.isTestOnly(item.verification))
        assertFalse(OwnerLocalization.isVerified(item.verification))
        // review_route localized, no raw code leaks
        assertFalse(OwnerLocalization.renderKnowledgeRouteRu(item.review_route).contains("security_review"))
    }

    @Test fun verificationBadgeStates() {
        assertEquals("проверено", OwnerLocalization.renderVerificationRu("VERIFIED"))
        assertTrue(OwnerLocalization.isVerified("VERIFIED"))
        assertEquals("не проверено", OwnerLocalization.renderVerificationRu("UNVERIFIED"))
        assertEquals("примерные данные", OwnerLocalization.renderVerificationRu("SYNTHETIC"))
        assertTrue(OwnerLocalization.isTestOnly("SYNTHETIC"))
    }
}
