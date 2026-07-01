/**
 * telegram_universal_russian_command_router_test.mjs — STANDALONE tests
 *
 * Verifies parseRussianIntent() produces the correct canonical slash commands
 * for ≥5 lead_ids (ZB23, EDERA, KZHBI, ATOM, GSK) plus help & unknown-lead.
 *
 * SAFETY: pure in-process assertions. No Telegram calls. No file writes.
 *         Never prints tokens / chat ids.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { parseRussianIntent } from '../telegram_gateway/russian_command_router.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(__dirname, '..', '..');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail = '') {
    if (cond) {
        passed++;
        console.log(`  ✅ ${name}`);
    } else {
        failed++;
        failures.push(`${name} ${detail}`);
        console.log(`  ❌ ${name} ${detail}`);
    }
}

function run() {
    console.log('TELEGRAM RU ROUTER — STANDALONE TESTS');
    console.log('────────────────────────────────────');

    // 1. SALES TODAY
    {
        const r = parseRussianIntent('что сегодня', WORKSPACE);
        check('1. "что сегодня" → /sales_today',
            r.ok && r.command === '/sales_today',
            `got=${r.command}`);
    }

    // 2. HEALTH
    {
        const r = parseRussianIntent('статус системы', WORKSPACE);
        check('2. "статус системы" → /health',
            r.ok && r.command === '/health',
            `got=${r.command}`);
    }

    // 3. LEAD STATUS ZB23
    {
        const r = parseRussianIntent('покажи ZB23', WORKSPACE);
        check('3. "покажи ZB23" → /lead_status ZB23',
            r.ok && r.command === '/lead_status ZB23',
            `got=${r.command}`);
    }

    // 4. LEAD STATUS EDERA via "что по"
    {
        const r = parseRussianIntent('что по EDERA', WORKSPACE);
        check('4. "что по EDERA" → /lead_status EDERA',
            r.ok && r.command === '/lead_status EDERA',
            `got=${r.command}`);
    }

    // 5. DRAFT FOLLOWUP KZHBI
    {
        const r = parseRussianIntent('подготовь письмо KZHBI', WORKSPACE);
        check('5. "подготовь письмо KZHBI" → /draft_followup KZHBI email',
            r.ok && r.command === '/draft_followup KZHBI email',
            `got=${r.command}`);
    }

    // 6. LOG EMAIL SENT ATOM
    {
        const r = parseRussianIntent('я отправил письмо ATOM', WORKSPACE);
        check('6. "я отправил письмо ATOM" → /log_touch ATOM email followup_sent',
            r.ok && r.command === '/log_touch ATOM email followup_sent',
            `got=${r.command}`);
    }

    // 7. CONTACT HOLD WHATSAPP GSK (C2.6b: whatsapp "не найден" now routes to contact_hold_whatsapp)
    {
        const r = parseRussianIntent('ватсап GSK не найден', WORKSPACE);
        check('7. "ватсап GSK не найден" → /contact_hold_whatsapp GSK not_found',
            r.ok && r.command === '/contact_hold_whatsapp GSK not_found',
            `got=${r.command}`);
    }


    // 8. SET NEXT ZB23
    {
        const r = parseRussianIntent('поставь звонок ZB23 завтра 10:30', WORKSPACE);
        check('8. "поставь звонок ZB23 завтра 10:30" → /set_next ZB23 call_next_business_day_1030',
            r.ok && r.command === '/set_next ZB23 call_next_business_day_1030',
            `got=${r.command}`);
    }

    // 9. LEAD NOTE EDERA
    {
        const r = parseRussianIntent('добавь заметку EDERA клиент ответил позже', WORKSPACE);
        check('9. "добавь заметку EDERA ..." → /lead_note EDERA клиент ответил позже',
            r.ok && r.command === '/lead_note EDERA клиент ответил позже',
            `got=${r.command}`);
    }

    // 10. UNKNOWN LEAD → ok:false + error + examples
    {
        const r = parseRussianIntent('покажи QQQ999', WORKSPACE);
        check('10. unknown lead → ok:false + error + examples',
            r.ok === false && typeof r.error === 'string' && r.error.length > 0 &&
            Array.isArray(r.examples) && r.examples.length > 0,
            `ok=${r.ok} err=${r.error ? 'yes' : 'no'} examples=${r.examples.length}`);
    }

    // 11. HELP
    {
        const r = parseRussianIntent('помощь', WORKSPACE);
        check('11. "помощь" → help_ru',
            r.ok && r.intent === 'help' && r.command === 'help_ru',
            `intent=${r.intent} command=${r.command}`);
    }

    // ──────────────────────────────────────────────
    // APPROVAL QUEUE INTENTS (B2 extension)
    // ──────────────────────────────────────────────

    // 12. PREPARE SEND ZB23
    {
        const r = parseRussianIntent('подготовь отправку письма ZB23', WORKSPACE);
        check('12. "подготовь отправку письма ZB23" → /prepare_send ZB23 email followup',
            r.ok && r.command === '/prepare_send ZB23 email followup',
            `got=${r.command}`);
    }

    // 13. PREPARE SEND EDERA
    {
        const r = parseRussianIntent('подготовь email на отправку EDERA', WORKSPACE);
        check('13. "подготовь email на отправку EDERA" → /prepare_send EDERA email followup',
            r.ok && r.command === '/prepare_send EDERA email followup',
            `got=${r.command}`);
    }

    // 14. PENDING APPROVALS (покажи подтверждения)
    {
        const r = parseRussianIntent('покажи подтверждения', WORKSPACE);
        check('14. "покажи подтверждения" → /pending_approvals',
            r.ok && r.command === '/pending_approvals',
            `got=${r.command}`);
    }

    // 15. PENDING APPROVALS (что на подтверждении)
    {
        const r = parseRussianIntent('что на подтверждении', WORKSPACE);
        check('15. "что на подтверждении" → /pending_approvals',
            r.ok && r.command === '/pending_approvals',
            `got=${r.command}`);
    }

    // 16. APPROVE (подтверждаю)
    {
        const r = parseRussianIntent('подтверждаю AP-20260531-120000-ZB23-EMAIL', WORKSPACE);
        check('16. "подтверждаю AP-..." → /approve AP-20260531-120000-ZB23-EMAIL',
            r.ok && r.command === '/approve AP-20260531-120000-ZB23-EMAIL',
            `got=${r.command}`);
    }

    // 17. APPROVE (одобряю)
    {
        const r = parseRussianIntent('одобряю AP-20260531-120000-ZB23-EMAIL', WORKSPACE);
        check('17. "одобряю AP-..." → /approve AP-20260531-120000-ZB23-EMAIL',
            r.ok && r.command === '/approve AP-20260531-120000-ZB23-EMAIL',
            `got=${r.command}`);
    }

    // 18. REJECT with reason
    {
        const r = parseRussianIntent('отклоняю AP-20260531-120000-ZB23-EMAIL неверный текст', WORKSPACE);
        check('18. "отклоняю AP-... неверный текст" → /reject AP-... неверный текст',
            r.ok && r.command === '/reject AP-20260531-120000-ZB23-EMAIL неверный текст',
            `got=${r.command}`);
    }

    // 19. APPROVAL STATUS (статус подтверждения)
    {
        const r = parseRussianIntent('статус подтверждения AP-20260531-120000-ZB23-EMAIL', WORKSPACE);
        check('19. "статус подтверждения AP-..." → /approval_status AP-...',
            r.ok && r.command === '/approval_status AP-20260531-120000-ZB23-EMAIL',
            `got=${r.command}`);
    }

    // 20. APPROVAL STATUS (покажи AP-...)
    {
        const r = parseRussianIntent('покажи AP-20260531-120000-ZB23-EMAIL', WORKSPACE);
        check('20. "покажи AP-..." → /approval_status AP-...',
            r.ok && r.command === '/approval_status AP-20260531-120000-ZB23-EMAIL',
            `got=${r.command}`);
    }

    // 21. "покажи ZB23" still → /lead_status ZB23 (NOT approval)
    {
        const r = parseRussianIntent('покажи ZB23', WORKSPACE);
        check('21. "покажи ZB23" still → /lead_status ZB23',
            r.ok && r.command === '/lead_status ZB23',
            `got=${r.command}`);
    }

    // 22. "статус ZB23" still → /lead_status ZB23 (NOT approval)
    {
        const r = parseRussianIntent('статус ZB23', WORKSPACE);
        check('22. "статус ZB23" still → /lead_status ZB23',
            r.ok && r.command === '/lead_status ZB23',
            `got=${r.command}`);
    }

    // ──────────────────────────────────────────────
    // APPROVED EMAIL SEND INTENTS (C2.2 extension)
    // ──────────────────────────────────────────────
    {
        const r = parseRussianIntent('проверь отправку AP-20260531-120000-ZB23-EMAIL', WORKSPACE);
        check('23. "проверь отправку AP-..." → /send_approved_dry_run',
            r.ok && r.command === '/send_approved_dry_run AP-20260531-120000-ZB23-EMAIL',
            `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('проверь письмо AP-20260531-120000-ZB23-EMAIL', WORKSPACE);
        check('24. "проверь письмо AP-..." → /send_approved_dry_run',
            r.ok && r.command === '/send_approved_dry_run AP-20260531-120000-ZB23-EMAIL',
            `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('сделай dry-run отправки AP-20260531-120000-ZB23-EMAIL', WORKSPACE);
        check('25. "сделай dry-run отправки AP-..." → /send_approved_dry_run',
            r.ok && r.command === '/send_approved_dry_run AP-20260531-120000-ZB23-EMAIL',
            `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('проверь готовность отправки AP-20260531-120000-ZB23-EMAIL', WORKSPACE);
        check('26. "проверь готовность отправки AP-..." → /send_approved_dry_run',
            r.ok && r.command === '/send_approved_dry_run AP-20260531-120000-ZB23-EMAIL',
            `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('статус отправки SJ-20260531-120000-ZB23-EMAIL', WORKSPACE);
        check('27. "статус отправки SJ-..." → /send_job_status',
            r.ok && r.command === '/send_job_status SJ-20260531-120000-ZB23-EMAIL',
            `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('покажи отправку SJ-20260531-120000-ZB23-EMAIL', WORKSPACE);
        check('28. "покажи отправку SJ-..." → /send_job_status',
            r.ok && r.command === '/send_job_status SJ-20260531-120000-ZB23-EMAIL',
            `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('что с отправкой SJ-20260531-120000-ZB23-EMAIL', WORKSPACE);
        check('29. "что с отправкой SJ-..." → /send_job_status',
            r.ok && r.command === '/send_job_status SJ-20260531-120000-ZB23-EMAIL',
            `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('покажи задания отправки', WORKSPACE);
        check('30. "покажи задания отправки" → /send_jobs',
            r.ok && r.command === '/send_jobs', `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('покажи send jobs', WORKSPACE);
        check('31. "покажи send jobs" → /send_jobs',
            r.ok && r.command === '/send_jobs', `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('очередь отправки', WORKSPACE);
        check('32. "очередь отправки" → /send_jobs',
            r.ok && r.command === '/send_jobs', `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('покажи AP-20260531-120000-ZB23-EMAIL', WORKSPACE);
        check('33. "покажи AP-..." still → /approval_status',
            r.ok && r.command === '/approval_status AP-20260531-120000-ZB23-EMAIL',
            `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('покажи ZB23', WORKSPACE);
        check('34. "покажи ZB23" still → /lead_status ZB23',
            r.ok && r.command === '/lead_status ZB23', `got=${r.command}`);
    }

    // ──────────────────────────────────────────────
    // LEAD CONTACT INTENTS (C2.6b extension)
    // ──────────────────────────────────────────────
    {
        const r = parseRussianIntent('покажи контакты ZB23', WORKSPACE);
        check('35. "покажи контакты ZB23" → /contact_show ZB23',
            r.ok && r.command === '/contact_show ZB23', `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('контакты ZB23', WORKSPACE);
        check('36. "контакты ZB23" → /contact_show ZB23',
            r.ok && r.command === '/contact_show ZB23', `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('проверь контакты ZB23', WORKSPACE);
        check('37. "проверь контакты ZB23" → /contact_show ZB23',
            r.ok && r.command === '/contact_show ZB23', `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('добавь email ZB23 kvs@zb23.ru', WORKSPACE);
        check('38. "добавь email ZB23 kvs@zb23.ru" → /contact_add_email ZB23 kvs@zb23.ru',
            r.ok && r.command === '/contact_add_email ZB23 kvs@zb23.ru', `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('добавь почту ZB23 kvs@zb23.ru', WORKSPACE);
        check('39. "добавь почту ZB23 kvs@zb23.ru" → /contact_add_email ZB23 kvs@zb23.ru',
            r.ok && r.command === '/contact_add_email ZB23 kvs@zb23.ru', `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('подтверди email ZB23 kvs@zb23.ru', WORKSPACE);
        check('40. "подтверди email ZB23 kvs@zb23.ru" → /contact_verify_email ZB23 kvs@zb23.ru',
            r.ok && r.command === '/contact_verify_email ZB23 kvs@zb23.ru', `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('email ZB23 kvs@zb23.ru подтверждён', WORKSPACE);
        check('41. "email ZB23 kvs@zb23.ru подтверждён" → /contact_verify_email ZB23 kvs@zb23.ru',
            r.ok && r.command === '/contact_verify_email ZB23 kvs@zb23.ru', `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('добавь телефон ZB23 +79180000000', WORKSPACE);
        check('42. "добавь телефон ZB23 +79180000000" → /contact_add_phone ZB23 +79180000000',
            r.ok && r.command === '/contact_add_phone ZB23 +79180000000', `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('телефон ZB23 +79180000000', WORKSPACE);
        check('43. "телефон ZB23 +79180000000" → /contact_add_phone ZB23 +79180000000',
            r.ok && r.command === '/contact_add_phone ZB23 +79180000000', `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('ватсап ZB23 не найден', WORKSPACE);
        check('44. "ватсап ZB23 не найден" → /contact_hold_whatsapp ZB23 not_found',
            r.ok && r.command === '/contact_hold_whatsapp ZB23 not_found', `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('whatsapp ZB23 не найден', WORKSPACE);
        check('45. "whatsapp ZB23 не найден" → /contact_hold_whatsapp ZB23 not_found',
            r.ok && r.command === '/contact_hold_whatsapp ZB23 not_found', `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('покажи реестр контактов', WORKSPACE);
        check('46. "покажи реестр контактов" → /contact_registry',
            r.ok && r.command === '/contact_registry', `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('статус контактов', WORKSPACE);
        check('47. "статус контактов" → /contact_registry',
            r.ok && r.command === '/contact_registry', `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('покажи ZB23', WORKSPACE);
        check('48. "покажи ZB23" still → /lead_status ZB23',
            r.ok && r.command === '/lead_status ZB23', `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('проверь отправку AP-20260531-142450-ZB23-EMAIL', WORKSPACE);
        check('49. "проверь отправку AP-..." still → /send_approved_dry_run',
            r.ok && r.command === '/send_approved_dry_run AP-20260531-142450-ZB23-EMAIL',
            `got=${r.command}`);
    }

    // ──────────────────────────────────────────────
    // CONTACT ENRICHMENT INTENTS (C2.7d extension)
    // Offline enrichment routing → canonical /contact_enrich* slash commands.
    // ──────────────────────────────────────────────
    {
        const r = parseRussianIntent('обнови контакты ZB23 из текста Email: test@example.com', WORKSPACE);
        check('50. "обнови контакты ZB23 из текста Email: test@example.com" → /contact_enrich_text ZB23 Email: test@example.com',
            r.ok && r.command === '/contact_enrich_text ZB23 Email: test@example.com',
            `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('обогати контакты ZB23 из текста Телефон +7 918 000-00-00', WORKSPACE);
        check('51. "обогати контакты ZB23 из текста Телефон +7 918 000-00-00" → /contact_enrich_text ZB23 Телефон +7 918 000-00-00',
            r.ok && r.command === '/contact_enrich_text ZB23 Телефон +7 918 000-00-00',
            `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('извлеки контакты ZB23 из текста WhatsApp: https://wa.me/79180000000', WORKSPACE);
        check('52. "извлеки контакты ZB23 из текста WhatsApp: https://wa.me/79180000000" → /contact_enrich_text ZB23 WhatsApp: https://wa.me/79180000000',
            r.ok && r.command === '/contact_enrich_text ZB23 WhatsApp: https://wa.me/79180000000',
            `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('проверь контакты ZB23 из текста Telegram: https://t.me/example', WORKSPACE);
        check('53. "проверь контакты ZB23 из текста Telegram: https://t.me/example" → /contact_enrich_text ZB23 Telegram: https://t.me/example',
            r.ok && r.command === '/contact_enrich_text ZB23 Telegram: https://t.me/example',
            `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('покажи каналы ZB23', WORKSPACE);
        check('54. "покажи каналы ZB23" → /contact_channels ZB23',
            r.ok && r.command === '/contact_channels ZB23',
            `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('какие каналы у ZB23', WORKSPACE);
        check('55. "какие каналы у ZB23" → /contact_channels ZB23',
            r.ok && r.command === '/contact_channels ZB23',
            `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('какой лучший канал ZB23', WORKSPACE);
        check('56. "какой лучший канал ZB23" → /contact_best_channel ZB23',
            r.ok && r.command === '/contact_best_channel ZB23',
            `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('лучший контакт ZB23', WORKSPACE);
        check('57. "лучший контакт ZB23" → /contact_best_channel ZB23',
            r.ok && r.command === '/contact_best_channel ZB23',
            `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('куда писать ZB23', WORKSPACE);
        check('58. "куда писать ZB23" → /contact_best_channel ZB23',
            r.ok && r.command === '/contact_best_channel ZB23',
            `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('статус обогащения ZB23', WORKSPACE);
        check('59. "статус обогащения ZB23" → /contact_enrichment_status ZB23',
            r.ok && r.command === '/contact_enrichment_status ZB23',
            `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('когда обновлялись контакты ZB23', WORKSPACE);
        check('60. "когда обновлялись контакты ZB23" → /contact_enrichment_status ZB23',
            r.ok && r.command === '/contact_enrichment_status ZB23',
            `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('покажи контакты ZB23', WORKSPACE);
        check('61. "покажи контакты ZB23" still → /contact_show ZB23',
            r.ok && r.command === '/contact_show ZB23',
            `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('проверь контакты ZB23', WORKSPACE);
        check('62. "проверь контакты ZB23" still → /contact_show ZB23',
            r.ok && r.command === '/contact_show ZB23',
            `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('статус контактов', WORKSPACE);
        check('63. "статус контактов" still → /contact_registry',
            r.ok && r.command === '/contact_registry',
            `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('покажи ZB23', WORKSPACE);
        check('64. "покажи ZB23" still → /lead_status ZB23',
            r.ok && r.command === '/lead_status ZB23',
            `got=${r.command}`);
    }

    // ──────────────────────────────────────────────
    // CONTACT ENRICHMENT NEW-LEAD INTENTS (C2.7g extension)
    // enrich-from-text must accept a lead_id NOT known to lead_resolver.
    // lead_id validated (latin/digits/_/-, length 2–40) and uppercased.
    // ──────────────────────────────────────────────
    {
        const r = parseRussianIntent('обнови контакты TESTLEAD из текста Email: demo@example.com', WORKSPACE);
        check('65. "обнови контакты TESTLEAD из текста Email: demo@example.com" → /contact_enrich_text TESTLEAD Email: demo@example.com',
            r.ok && r.command === '/contact_enrich_text TESTLEAD Email: demo@example.com',
            `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('обогати контакты NEW-123 из текста Телефон +7 918 000-00-00', WORKSPACE);
        check('66. "обогати контакты NEW-123 из текста Телефон +7 918 000-00-00" → /contact_enrich_text NEW-123 Телефон +7 918 000-00-00',
            r.ok && r.command === '/contact_enrich_text NEW-123 Телефон +7 918 000-00-00',
            `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('извлеки контакты abc_99 из текста WhatsApp https://wa.me/79180000000', WORKSPACE);
        check('67. "извлеки контакты abc_99 из текста WhatsApp ..." → /contact_enrich_text ABC_99 WhatsApp https://wa.me/79180000000 (uppercased)',
            r.ok && r.command === '/contact_enrich_text ABC_99 WhatsApp https://wa.me/79180000000',
            `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('обнови контакты X из текста Email: x@example.com', WORKSPACE);
        check('68. "обнови контакты X из текста ..." should NOT route as contact_enrich_text (lead_id too short)',
            !(r.ok && typeof r.command === 'string' && r.command.startsWith('/contact_enrich_text')),
            `got ok=${r.ok} command=${r.command}`);
    }
    {
        const r = parseRussianIntent('обнови контакты TESTLEAD из текста', WORKSPACE);
        check('69. "обнови контакты TESTLEAD из текста" should NOT route as contact_enrich_text (text empty)',
            !(r.ok && typeof r.command === 'string' && r.command.startsWith('/contact_enrich_text')),
            `got ok=${r.ok} command=${r.command}`);
    }
    {
        const r = parseRussianIntent('покажи контакты ZB23', WORKSPACE);
        check('70. "покажи контакты ZB23" still → /contact_show ZB23',
            r.ok && r.command === '/contact_show ZB23',
            `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('проверь контакты ZB23', WORKSPACE);
        check('71. "проверь контакты ZB23" still → /contact_show ZB23',
            r.ok && r.command === '/contact_show ZB23',
            `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('покажи ZB23', WORKSPACE);
        check('72. "покажи ZB23" still → /lead_status ZB23',
            r.ok && r.command === '/lead_status ZB23',
            `got=${r.command}`);
    }
    {
        const r = parseRussianIntent('статус контактов', WORKSPACE);
        check('73. "статус контактов" still → /contact_registry',
            r.ok && r.command === '/contact_registry',
            `got=${r.command}`);
    }

    console.log('────────────────────────────────────');


    console.log(`RESULT: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
        console.log('FAILURES:');
        failures.forEach(f => console.log('  - ' + f));
        process.exit(1);
    }
    console.log('ALL PASS ✅');
    process.exit(0);
}

run();
