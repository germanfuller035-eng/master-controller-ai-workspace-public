package ru.dmitry.matercontroller

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import ru.dmitry.matercontroller.core.model.AiUsageCumulativeDto
import ru.dmitry.matercontroller.core.model.AiUsageDto
import ru.dmitry.matercontroller.core.model.Envelope
import ru.dmitry.matercontroller.core.model.KnowledgeDigestDto
import ru.dmitry.matercontroller.core.model.KnowledgeSourceList
import ru.dmitry.matercontroller.core.model.KnowledgeStatusDto
import ru.dmitry.matercontroller.core.model.OfferPreviewDto
import ru.dmitry.matercontroller.core.model.ProviderHealthDto
import ru.dmitry.matercontroller.core.model.ProviderRegistryDto
import ru.dmitry.matercontroller.core.ui.OwnerLocalization

/**
 * 0.6.0-rc4 — mapping proofs for the new authoritative read DTOs. The backend serializes snake_case
 * and the app Json config has NO namingStrategy, so property names == wire names. Every test parses
 * a realistic snake_case payload and asserts the fields land where the UI expects them.
 */
class Rc4DtoMappingTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; coerceInputValues = true; explicitNulls = false }

    @Test fun parsesOfferPreviewSnakeCase() {
        val raw = """
            {"ok":true,"data":{
              "offer_id":"offer_dbbbf391d547","lead_id":"STROYDVOR-UG_RU","company":"СтройДвор-Юг",
              "product_id":"mini_audit","product_name_ru":"Мини-аудит сайта и пути клиента до заявки",
              "product_version":"v3","price":10000,"currency":"RUB","channel":"email",
              "recipient":"info@example.ru","recipient_verified":true,"subject":"Аудит сайта",
              "body_text":"Здравствуйте...","findings":["Нет SSL","Медленная загрузка"],"finding_count":2,
              "next_step":"Согласовать встречу","attachments":[],"attachments_note":"нет вложений",
              "version_created_at":"2026-06-01T10:00","version_updated_at":"2026-06-02T11:30",
              "content_hash":"abc123","status":"READY_FOR_SEND_REVIEW","owner_decision":null,
              "send_capability":"NONE","confirmed_send_exists":false,
              "blockers":["IDENTITY_NOT_VERIFIED"],"missing_fields":{"phone":"не найден в источнике"},
              "no_send_notice":"Клиенту ничего не отправляется."
            },"error":null}
        """.trimIndent()
        val env = json.decodeFromString(Envelope.serializer(OfferPreviewDto.serializer()), raw)
        val p = env.data!!
        assertEquals("offer_dbbbf391d547", p.offer_id)
        assertEquals("Мини-аудит сайта и пути клиента до заявки", p.product_name_ru)
        assertEquals(10000.0, p.price!!, 0.001)
        assertEquals(2, p.finding_count)
        assertEquals(2, p.findings.size)
        assertTrue(p.recipient_verified == true)
        assertEquals("abc123", p.content_hash)
        assertEquals(listOf("IDENTITY_NOT_VERIFIED"), p.blockers)
        assertEquals("не найден в источнике", p.missing_fields["phone"])
    }

    @Test fun previewBlockersShownAsBackendReturnsThemNoInjection() {
        // The preview blockers must render exactly from the backend list — no ALREADY_AWAITING_REPLY
        // is injected by the client. We assert the localized lines come only from the given codes.
        val backendBlockers = listOf("MISSING_EMAIL")
        val lines = OwnerLocalization.renderBlockerLinesRu(backendBlockers, "READY_FOR_SEND_REVIEW")
        assertEquals(1, lines.size)
        assertTrue(lines.first().contains("email"))
        // An empty backend list yields no blocker lines (caller shows «отсутствуют»).
        assertTrue(OwnerLocalization.renderBlockerLinesRu(emptyList(), null).isEmpty())
    }

    @Test fun missingFieldReasonLocalized() {
        val out = OwnerLocalization.renderMissingFieldReasonRu("не найден в источнике")
        assertTrue(out.contains("нет данных"))
        assertTrue(out.contains("не найден в источнике"))
        assertEquals("нет данных", OwnerLocalization.renderMissingFieldReasonRu(null))
    }

    @Test fun parsesAiUsageSnakeCase() {
        // RC6: raw token fields are String? (backend may return "UNKNOWN" or a numeric-as-string).
        val raw = """
            {"ok":true,"data":{
              "total_calculated_units":123456,"raw_input_tokens":"UNKNOWN","raw_output_tokens":"UNKNOWN",
              "provider_calls":0,"no_llm_tasks":7,"cache_hits":15,"artifact_reuse":3,"escalations":1,
              "by_provider":{"tokenator":120000},"by_model":{"gpt-5.5":100000,"deepseek":20000},
              "by_agent":{"LEAD_INTELLIGENCE":60000,"OFFER":40000},
              "by_task_type":{"audit":50000},"by_lead":{"DKBI_RU":30000},
              "estimated_money_cost":null,"estimated_money_class":"UNKNOWN","entries":9
            },"error":null}
        """.trimIndent()
        val env = json.decodeFromString(Envelope.serializer(AiUsageDto.serializer()), raw)
        val u = env.data!!
        assertEquals(123456L, u.total_calculated_units)
        assertEquals("UNKNOWN", u.raw_input_tokens) // UNKNOWN surfaced, never a false 0
        assertEquals("UNKNOWN", u.raw_output_tokens)
        assertEquals(100000L, u.by_model["gpt-5.5"])
        assertEquals(60000L, u.by_agent["LEAD_INTELLIGENCE"])
        assertNull(u.estimated_money_cost)
        assertEquals("UNKNOWN", u.estimated_money_class)
    }

    @Test fun aiMoneyUnknownRendersNoDataNotUnitsAsRubles() {
        // UNKNOWN/null money → «нет данных», never units coerced into rubles.
        assertEquals("нет данных", OwnerLocalization.renderAiMoneyRu(null, "UNKNOWN"))
        assertEquals("нет данных", OwnerLocalization.renderAiMoneyRu(123456.0, "UNKNOWN"))
        assertEquals("нет данных", OwnerLocalization.renderAiMoneyRu(null, null))
        // A real class with a real amount renders money.
        val real = OwnerLocalization.renderAiMoneyRu(1500.0, "ESTIMATE")
        assertTrue(real.contains("1500"))
        assertFalse(real.contains("нет данных"))
    }

    @Test fun calculatedUnitsFormattedNeverNull() {
        assertEquals("нет данных", OwnerLocalization.formatCalculatedUnits(null))
        assertEquals("1 234 567", OwnerLocalization.formatCalculatedUnits(1234567L))
    }

    @Test fun parsesAiUsageCumulative() {
        val raw = """{"ok":true,"data":{"cumulative_calculated_units":7777,"entries":12},"error":null}"""
        val env = json.decodeFromString(Envelope.serializer(AiUsageCumulativeDto.serializer()), raw)
        assertEquals(7777L, env.data!!.cumulative_calculated_units)
    }

    @Test fun parsesProviderRegistrySnakeCase() {
        val raw = """
            {"ok":true,"data":{"items":[
              {"provider_id":"tokenator","provider_type":"openai_compatible","base_url":"https://api.example",
               "enabled":true,"priority":1,"key_presence":"present","models":["gpt-5.5","deepseek"],
               "state":"ACTIVE","cost_class":"medium"}
            ]},"error":null}
        """.trimIndent()
        val env = json.decodeFromString(Envelope.serializer(ProviderRegistryDto.serializer()), raw)
        val item = env.data!!.items.first()
        assertEquals("tokenator", item.provider_id)
        assertTrue(item.enabled == true)
        assertEquals("present", item.key_presence)
        assertEquals(2, item.models.size)
        // localized renders never leak raw codes
        assertFalse(OwnerLocalization.renderProviderStateRu(item.state).contains("ACTIVE"))
        assertFalse(OwnerLocalization.renderCostClassRu(item.cost_class).contains("medium"))
    }

    @Test fun parsesProviderHealthSnakeCase() {
        val raw = """
            {"ok":true,"data":{
              "provider":"tokenator","configured":true,"reachable":true,"primary_model":"gpt-5.5",
              "active_model":"gpt-5.5","api_mode":"responses","last_successful_call":"2026-06-18T09:00",
              "last_failure":null,"circuit_state":"CLOSED","completed_tasks":12,"failed_tasks":1,
              "quarantined_tasks":0,"cumulative_calculated_units":54321,"raw_input_tokens":40000,
              "raw_output_tokens":14321,"first_run_budget_limit":100000,"first_run_budget_remaining":45679,
              "sends_attempted":0,"direct_writes_attempted":0
            },"error":null}
        """.trimIndent()
        val env = json.decodeFromString(Envelope.serializer(ProviderHealthDto.serializer()), raw)
        val h = env.data!!
        assertEquals("gpt-5.5", h.active_model)
        assertEquals("CLOSED", h.circuit_state)
        assertEquals(12, h.completed_tasks)
        assertEquals(54321L, h.cumulative_calculated_units)
        assertEquals(0, h.sends_attempted)
        // circuit state localized, no raw CLOSED leaking
        assertFalse(OwnerLocalization.renderCircuitStateRu(h.circuit_state).contains("CLOSED"))
        assertTrue(OwnerLocalization.renderCircuitStateRu("OPEN").contains("защита"))
    }

    @Test fun parsesKnowledgeStatusSnakeCase() {
        val raw = """
            {"ok":true,"data":{
              "active":true,"mode":"running","sources_total":20,"tier1_sources":5,"tier2_sources":6,
              "tier3_sources":5,"tier4_sources":4,"findings_stored":120,"proposals":3,
              "last_run":"2026-06-18T08:00","llm_summarization":true,"weekly_budget_units":50000,
              "monthly_budget_units":200000,"auto_production_changes":false,"auto_client_messages":false,
              "auto_financial_decisions":false
            },"error":null}
        """.trimIndent()
        val env = json.decodeFromString(Envelope.serializer(KnowledgeStatusDto.serializer()), raw)
        val s = env.data!!
        assertTrue(s.active == true)
        assertEquals(20, s.sources_total)
        assertEquals(5, s.tier1_sources)
        assertFalse(s.auto_production_changes == true)
        assertFalse(s.auto_client_messages == true)
        assertFalse(s.auto_financial_decisions == true)
    }

    @Test fun parsesKnowledgeSourcesSnakeCase() {
        val raw = """
            {"ok":true,"data":{"items":[
              {"source_id":"src_1","name":"Реестр ФНС","type":"official","tier":1,"category":"legal",
               "enabled":true,"cost_class":"free"}
            ]},"error":null}
        """.trimIndent()
        val env = json.decodeFromString(Envelope.serializer(KnowledgeSourceList.serializer()), raw)
        val item = env.data!!.items.first()
        assertEquals("src_1", item.source_id)
        assertEquals(1, item.tier)
        assertTrue(OwnerLocalization.renderSourceTierRu(item.tier).contains("уровень 1"))
        assertTrue(OwnerLocalization.renderCostClassRu(item.cost_class).contains("бесплатно"))
    }

    @Test fun parsesKnowledgeDigestSnakeCase() {
        val raw = """
            {"ok":true,"data":{"window":"urgent","items":[
              {"id":"k1","title":"Новый регламент по обработке ПДн","category":"legal","source":"pravo.gov.ru",
               "source_tier":1,"what_changed":"Ужесточены требования к согласию","trust":"high","relevance":"high",
               "urgency":"critical","security_impact":"low","legal_impact":"high","route":"legal_review",
               "recommended_action":"Проверить форму согласия","owner_decision_required":true,
               "legal_review_required":true,"security_review_required":false,"auto_action":"none"}
            ]},"error":null}
        """.trimIndent()
        val env = json.decodeFromString(Envelope.serializer(KnowledgeDigestDto.serializer()), raw)
        assertEquals("urgent", env.data!!.window)
        val item = env.data!!.items.first()
        assertEquals("k1", item.id)
        assertEquals("critical", item.urgency)
        assertEquals(1, item.source_tier)
        assertTrue(item.owner_decision_required == true)
        // localized renders, no raw codes
        assertTrue(OwnerLocalization.renderUrgencyRu(item.urgency).contains("срочно"))
        assertFalse(OwnerLocalization.renderKnowledgeRouteRu(item.route).contains("legal_review"))
        assertFalse(OwnerLocalization.renderKnowledgeCategoryRu(item.category).contains("legal"))
    }

    // ---- localization: new owner-facing maps never leak raw codes ----
    @Test fun productNameLocalized() {
        assertEquals("Мини-аудит сайта и пути клиента до заявки", OwnerLocalization.renderProductNameRu("mini_audit"))
        // server-provided name wins
        assertEquals("Спец-продукт", OwnerLocalization.renderProductNameRu("x", "Спец-продукт"))
    }

    @Test fun agentRolesLocalized() {
        assertEquals("Аналитик лидов", OwnerLocalization.renderAgentRoleRu("LEAD_INTELLIGENCE"))
        assertEquals("Агент мини-аудита", OwnerLocalization.renderAgentRoleRu("MINI_AUDIT"))
        assertEquals("Агент предложений", OwnerLocalization.renderAgentRoleRu("OFFER"))
        assertEquals("Контроль качества и безопасности", OwnerLocalization.renderAgentRoleRu("QA_AND_SAFETY"))
        assertEquals("Контроль качества и безопасности", OwnerLocalization.renderAgentRoleRu("QA_SAFETY"))
    }
}
