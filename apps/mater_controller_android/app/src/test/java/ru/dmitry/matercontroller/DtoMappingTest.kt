package ru.dmitry.matercontroller

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import ru.dmitry.matercontroller.core.model.Envelope
import ru.dmitry.matercontroller.core.model.Lead
import ru.dmitry.matercontroller.core.model.MiniAuditStatus
import ru.dmitry.matercontroller.core.model.CommercialAutonomyStartResult
import ru.dmitry.matercontroller.core.model.CommercialAutonomyStatus
import ru.dmitry.matercontroller.core.model.ServerFunnelApprovalCardResponse
import ru.dmitry.matercontroller.core.model.ServerFunnelMailData
import ru.dmitry.matercontroller.core.model.SystemStatus
import ru.dmitry.matercontroller.core.model.OutreachLeadDetail
import ru.dmitry.matercontroller.core.model.OutreachQueueData
import ru.dmitry.matercontroller.core.model.OutreachSendResult

class DtoMappingTest {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true; explicitNulls = false }

    @Test
    fun parsesStatusEnvelope() {
        val raw = """{"ok":true,"data":{"waitingReply":3,"readySend":0,"sendUncertain":3,"total":40,"autosend":"BLOCKED"},"error":null,"requestId":"req_1"}"""
        val env = json.decodeFromString(Envelope.serializer(MiniAuditStatus.serializer()), raw)
        assertTrue(env.ok)
        assertEquals(3, env.data?.waitingReply)
        assertEquals("BLOCKED", env.data?.autosend)
    }

    @Test
    fun parsesLeadWithUnknownFieldsIgnored() {
        val raw = """{"leadId":"DKBI_RU","company":"ДКБИ","status":"waiting_reply","sendProof":"proven","smtpCode":250,"sendable":false,"blockingReasons":["ALREADY_WAITING_REPLY"],"extraServerField":123}"""
        val lead = json.decodeFromString(Lead.serializer(), raw)
        assertEquals("DKBI_RU", lead.leadId)
        assertEquals(250, lead.smtpCode)
        assertFalse(lead.sendable)
        assertEquals(listOf("ALREADY_WAITING_REPLY"), lead.blockingReasons)
    }

    @Test
    fun parsesErrorEnvelope() {
        val raw = """{"ok":false,"data":null,"error":{"code":"LEAD_NOT_SENDABLE","message":"Лид не готов","details":{"reasons":["ALREADY_WAITING_REPLY"]}},"requestId":"req_2"}"""
        val env = json.decodeFromString(Envelope.serializer(Lead.serializer()), raw)
        assertFalse(env.ok)
        assertEquals("LEAD_NOT_SENDABLE", env.error?.code)
    }

    @Test
    fun parsesServerConnectedFunnelStatus() {
        val raw = """{"ok":true,"data":{"smtpConfigured":true,"autosend":"BLOCKED","serverFunnel":{"version":"server_connected_commercial_funnel_v1","yandex_imap_read":{"enabled":true,"read_only":true,"headers_only":true,"pop3_used":false,"snapshot_exists":true,"count":2},"yandex_smtp_ready":{"configured":true,"real_send_enabled":false,"allowed_after_owner_approval":true,"missing_keys":[]},"email_classification":{"enabled":true,"counts":{"lead":1,"deal_reply":1}},"crm_local_write":{"enabled":true,"private_only":true,"production_synced":false},"telegram_approval":{"enabled":true,"sends_telegram_now":false,"card_ready":true},"safety":{"auto_reply":"OFF","mass_send":"OFF","payment_live":"OFF","payment_link":"OFF","production_db_write":"OFF","outbound_count":0,"payment_count":0,"production_db_writes":0},"owner_visible_ru":{"status":"Серверная воронка подключена в управляемом режиме.","next_action":"Проверьте новые письма.","blocked_reason":"Живые действия выполняются только после отдельного подтверждения владельца."}}},"error":null,"requestId":"req_3"}"""
        val env = json.decodeFromString(Envelope.serializer(SystemStatus.serializer()), raw)
        val funnel = env.data?.serverFunnel
        assertTrue(env.ok)
        assertEquals(true, funnel?.yandexImapRead?.readOnly)
        assertEquals(false, funnel?.yandexImapRead?.pop3Used)
        assertEquals(true, funnel?.yandexSmtpReady?.allowedAfterOwnerApproval)
        assertEquals("OFF", funnel?.safety?.paymentLive)
        assertEquals(0, funnel?.safety?.outboundCount)
    }

    @Test
    fun parsesServerFunnelMailAndApprovalDtos() {
        val mailRaw = """{"ok":true,"data":{"snapshot_exists":true,"fetched_at":"2026-06-30T02:55:56.885Z","count":1,"items":[{"email_id":"eml_1","thread_id":"thr_1","date":"2026-06-30T02:55:00.000Z","from_masked":"o***r@example.test","subject":"Заявка","classification":{"type":"lead","confidence":0.74,"reason_ru":"Есть признаки нового запроса."},"status_ru":"Требует решения владельца","next_action_ru":"Открыть письмо"}]},"error":null,"requestId":"req_mail"}"""
        val mail = json.decodeFromString(Envelope.serializer(ServerFunnelMailData.serializer()), mailRaw)
        assertTrue(mail.ok)
        assertEquals(true, mail.data?.snapshotExists)
        assertEquals("eml_1", mail.data?.items?.first()?.emailId)
        assertEquals("lead", mail.data?.items?.first()?.classification?.type)

        val approvalRaw = """{"ok":true,"data":{"email_id":"eml_1","packet":{"packet_id":"pkt_1","recipient":"owner-approved@example.test","channel":"email","subject":"Re: Заявка","body":"Здравствуйте.","text_hash":"txt_1","packet_hash":"pkt_hash_1","expires_at":"2026-06-30T03:25:00.000Z","status":"NOT_SENT","quality_status":"PASS"},"approval_card":{"approval_id":"apv_1","status":"WAITING_OWNER_APPROVAL","expires_at":"2026-06-30T03:25:00.000Z","approval_hash":"mark_1","card_ru":{"from":"o***r@example.test","type":"lead","lead_or_deal":"lead_1","summary":"Черновик готов.","risk":"Нужно решение.","draft":"Здравствуйте.","buttons":["Одобрить","Править"]}},"telegram_sent":false,"telegram_status":"TELEGRAM_SEND_NOT_REQUESTED","sends_client_email":false},"error":null,"requestId":"req_apv"}"""
        val approval = json.decodeFromString(Envelope.serializer(ServerFunnelApprovalCardResponse.serializer()), approvalRaw)
        assertTrue(approval.ok)
        assertEquals("NOT_SENT", approval.data?.packet?.status)
        assertEquals(false, approval.data?.sendsClientEmail)
        assertEquals("WAITING_OWNER_APPROVAL", approval.data?.approvalCard?.status)
    }

    @Test
    fun parsesCommercialAutonomyStatusAndStartResult() {
        val statusRaw = """{"ok":true,"data":{"version":"owner_safe_autonomy_v1","enabled":true,"mode":"OWNER_APPROVES_SEND_ONLY","flags":{"LEAD_DISCOVERY_ENABLED":true,"VERIFY_ENABLED":true,"AUDIT_AND_DRAFT_ENABLED":true,"OWNER_APPROVAL_REQUIRED_FOR_SEND":true,"AUTO_SEND_ENABLED":false,"AUTO_REPLY_ENABLED":false,"MASS_SEND_ENABLED":false,"PAYMENT_LIVE_ENABLED":false,"PRODUCTION_DB_WRITE_ENABLED":false},"job_counts":{"QUEUED":1},"pipeline_counts":{"STAGING":2},"active":{"lead_discovery_jobs":1,"verification_jobs":0,"preparation_jobs":0,"total_working_jobs":1},"first_touch":{"leads_considered":2,"pilot_eligible":1,"approval_pending":0},"owner_visible_ru":{"status":"Автоподготовка работает.","next_action":"Ожидайте черновик.","blocker":null},"safety":{"auto_send":"OFF","auto_reply":"OFF","mass_send":"OFF","payment_live":"OFF","production_db_write":"OFF","outbound_count":0,"payment_count":0,"production_db_writes":0}},"error":null,"requestId":"req_auto"}"""
        val status = json.decodeFromString(Envelope.serializer(CommercialAutonomyStatus.serializer()), statusRaw)
        assertTrue(status.ok)
        assertEquals(true, status.data?.flags?.leadDiscoveryEnabled)
        assertEquals(false, status.data?.flags?.autoSendEnabled)
        assertEquals(1, status.data?.active?.leadDiscoveryJobs)
        assertEquals(0, status.data?.safety?.outboundCount)

        val startRaw = """{"ok":true,"data":{"ok":true,"status":"LEADGEN_QUEUED","idempotent":false,"owner_visible_ru":{"status":"Поиск лидов поставлен в очередь.","next_action":"Готовые черновики появятся в решениях владельца.","blocker":null},"safety":{"auto_send":"OFF","auto_reply":"OFF","mass_send":"OFF","payment_live":"OFF","production_db_write":"OFF","outbound_count":0,"payment_count":0,"production_db_writes":0},"after":{"enabled":true,"active":{"total_working_jobs":1},"first_touch":{"approval_pending":0}}},"error":null,"requestId":"req_start"}"""
        val start = json.decodeFromString(Envelope.serializer(CommercialAutonomyStartResult.serializer()), startRaw)
        assertTrue(start.ok)
        assertEquals("LEADGEN_QUEUED", start.data?.status)
        assertEquals(1, start.data?.after?.active?.totalWorkingJobs)
        assertEquals("OFF", start.data?.safety?.autoSend)
    }

    @Test
    fun parsesOutreachQueueDetailAndSendResult() {
        val queueRaw = """{"ok":true,"data":{"items":[{"lead_id":"READY_1","company_name":"Ready Company","website":"https://ready.example.test","what_sells":"производство мебели","source":"pipeline","confidence":"high","contact_channel":"email","contact_present":true,"contact_source_present":true,"contact_confidence":"high","prior_outreach_status":"NONE_VISIBLE","contact_restriction_status":"PASS","duplicate_status":"NONE_VISIBLE","status":"audit_ready","priority_score":1081,"fit_score":81,"draft_subject":"Короткий разбор сайта Ready Company","draft_body_preview":"Здравствуйте.","text_marker":"txt_1","readiness":{"ready":true,"blockers":[],"warnings":[],"owner_action_ru":"Проверьте текст и отправьте одно письмо."},"next_action_ru":"Проверить и отправить одно письмо"}],"total":1,"ready_count":1,"blocked_count":0,"live_send_enabled":false,"mock_send_enabled":false,"payments_live":false,"production_db_write":false,"next_action_ru":"Откройте первый готовый лид."},"error":null,"requestId":"req_outreach"}"""
        val queue = json.decodeFromString(Envelope.serializer(OutreachQueueData.serializer()), queueRaw)
        assertTrue(queue.ok)
        assertEquals(1, queue.data?.readyCount)
        assertEquals("READY_1", queue.data?.items?.first()?.leadId)
        assertEquals(true, queue.data?.items?.first()?.readiness?.ready)
        assertEquals(false, queue.data?.liveSendEnabled)

        val detailRaw = """{"ok":true,"data":{"lead_id":"READY_1","company_name":"Ready Company","website":"https://ready.example.test","what_sells":"производство мебели","source":"pipeline","confidence":"high","exact_recipient":"client@example.test","contact_source_url":"https://ready.example.test/contacts","contact_channel":"email","prior_outreach_status":"NONE_VISIBLE","contact_restriction_status":"PASS","duplicate_status":"NONE_VISIBLE","status":"audit_ready","fit_score":81,"readiness":{"ready":true,"blockers":[],"warnings":[],"owner_action_ru":"Проверьте текст и отправьте одно письмо."},"draft":{"draft_id":"draft_1","subject":"Короткий разбор сайта Ready Company","body":"Здравствуйте.","text_marker":"txt_1","quality":{"status":"PASS","checks":[{"id":"tone","label_ru":"Тон","state":"PASS","reason_ru":""}]},"status":"DRAFT_READY"},"history":{"prior_outreach_exists":false,"prior_reply_exists":false,"sent_at":null,"send_proof_status":null}},"error":null,"requestId":"req_detail"}"""
        val detail = json.decodeFromString(Envelope.serializer(OutreachLeadDetail.serializer()), detailRaw)
        assertTrue(detail.ok)
        assertEquals("client@example.test", detail.data?.exactRecipient)
        assertEquals("PASS", detail.data?.draft?.quality?.status)
        assertEquals("txt_1", detail.data?.draft?.textMarker)

        val sendRaw = """{"ok":true,"data":{"ok":true,"status":"SENT","lead_id":"READY_1","sent_count":1,"provider":"mock","text_marker":"txt_1","package_marker":"pkg_1","duplicate_guard_id":"dup_1","revision":2},"error":null,"requestId":"req_send"}"""
        val sent = json.decodeFromString(Envelope.serializer(OutreachSendResult.serializer()), sendRaw)
        assertTrue(sent.ok)
        assertEquals(1, sent.data?.sentCount)
        assertEquals("SENT", sent.data?.status)
    }
}
