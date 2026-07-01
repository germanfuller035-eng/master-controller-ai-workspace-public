// build_dashboard_state.mjs — v5 Active Action Board
// Обновлено: 2026-05-26 — добавлены active_work_queue, dmitry_decision_center, lead_order

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../');

function readJson(relPath, fallback = null) {
  const p = resolve(ROOT, relPath);
  if (!existsSync(p)) return fallback;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; }
}

// ── Источники ──────────────────────────────────────────────────────────────
const leadsQueueFile = '13_sales/daily_lead_factory/output/active_leads_queue_2026-05-26.json';
const followupFile   = '13_sales/daily_lead_factory/output/followup_queue_2026-05-26.json';
const leadsRaw       = readJson(leadsQueueFile, []);
const followupRaw    = readJson(followupFile, []);

// ── Активная очередь (ручная — из задачи) ──────────────────────────────────
const ACTIVE_WORK_QUEUE = [
  {
    queue_position: 1,
    lead_id: 'ZB23',
    lead_name: 'ZB23 / Завод «ЖЕЛЕЗОБЕТОН»',
    status: 'waiting_reply',
    status_ru: 'Ждём ответ',
    priority: 1,
    next_contact_date: '2026-05-28',
    next_step_ru: '2026-05-28 — проверить Яндекс-почту. Если ответа нет — подготовить WhatsApp Business follow-up draft.',
    can_contact_now: false,
    channel: 'Яндекс Email → WhatsApp Business',
    forbidden_now: 'не повторять email, не отправлять PDF',
    next_decision_needed: 'ждать до 2026-05-28',
    action_label_ru: 'Проверить ответ',
    draft_needed: true
  },
  {
    queue_position: 2,
    lead_id: 'EDERA',
    lead_name: 'EDERA / Эдера',
    status: 'warm_after_payment',
    status_ru: 'Тёплый лид / после оплаты',
    priority: 2,
    next_contact_date: null,
    next_step_ru: 'Дмитрий подтверждает, что проект закрыт корректно. После этого — подготовить следующий оффер.',
    can_contact_now: false,
    channel: 'Telegram manual (после подтверждения)',
    forbidden_now: 'не писать без проверки статуса проекта',
    next_decision_needed: 'проект закрыт?',
    action_label_ru: 'Ждёт решения Дмитрия',
    draft_needed: true
  },
  {
    queue_position: 3,
    lead_id: 'КЖБИ',
    lead_name: 'КЖБИ / ООО «КЖБИ»',
    status: 'active_needs_contact',
    status_ru: 'Активный / нужен подтверждённый контакт',
    priority: 3,
    next_contact_date: null,
    next_step_ru: 'Дмитрий подтверждает ЛПР и канал связи.',
    can_contact_now: false,
    channel: 'pending',
    forbidden_now: 'не писать на неподтверждённый контакт',
    next_decision_needed: 'какой контакт / ЛПР?',
    action_label_ru: 'Нужен контакт',
    draft_needed: false
  },
  {
    queue_position: 4,
    lead_id: 'ATOM',
    lead_name: 'Завод АТОМ',
    status: 'active_first_touch_unclear',
    status_ru: 'Активный / нужно решение по первому касанию',
    priority: 4,
    next_contact_date: null,
    next_step_ru: 'Дмитрий подтверждает: первое сообщение было отправлено или только подготовлено.',
    can_contact_now: false,
    channel: 'email / manual after approval',
    forbidden_now: 'не делать follow-up, пока неясно, было ли первое касание',
    next_decision_needed: 'было ли первое сообщение?',
    action_label_ru: 'Ждёт решения Дмитрия',
    draft_needed: false
  },
  {
    queue_position: 5,
    lead_id: 'ГСК',
    lead_name: 'ГСК / ООО «ГСК» завод ЖБИ',
    status: 'active_channel_pending',
    status_ru: 'Активный / ждёт выбора канала',
    priority: 5,
    next_contact_date: null,
    next_step_ru: 'Дмитрий выбирает канал: телефон / WhatsApp Business / email / форма сайта. Потом AI готовит черновик.',
    can_contact_now: false,
    channel: 'pending',
    forbidden_now: 'не писать без approval и без выбранного канала',
    next_decision_needed: 'какой канал?',
    action_label_ru: 'Ждёт решения Дмитрия',
    draft_needed: false
  }
];

// ── Центр решений ──────────────────────────────────────────────────────────
const DMITRY_DECISION_CENTER = [
  {
    priority: 1, lead_id: 'ZB23', lead: 'ZB23 — Завод «ЖЕЛЕЗОБЕТОН»',
    decision_question: 'Ждать ответ до 2026-05-28',
    options: ['ждать', 'проверить ответ', 'WA draft после даты', 'HOLD'],
    after_decision: 'WA Business follow-up draft после 28-го'
  },
  {
    priority: 2, lead_id: 'EDERA', lead: 'EDERA — Эдера',
    decision_question: 'Проект закрыт?',
    options: ['закрыт', 'не закрыт', 'HOLD'],
    after_decision: 'Следующий оффер или официальное закрытие проекта'
  },
  {
    priority: 3, lead_id: 'КЖБИ', lead: 'КЖБИ',
    decision_question: 'Какой контакт / ЛПР?',
    options: ['подтвердить ЛПР', 'найти контакт', 'HOLD'],
    after_decision: 'Подготовить черновик первого сообщения'
  },
  {
    priority: 4, lead_id: 'ATOM', lead: 'Завод АТОМ',
    decision_question: 'Было ли первое сообщение?',
    options: ['было', 'не было', 'неизвестно'],
    after_decision: 'Follow-up (если было) или первое письмо (если нет)'
  },
  {
    priority: 5, lead_id: 'ГСК', lead: 'ГСК',
    decision_question: 'Какой канал?',
    options: ['телефон', 'WhatsApp', 'email', 'форма', 'HOLD'],
    after_decision: 'Подготовить черновик под выбранный канал'
  }
];

// ── Порядок лидов ──────────────────────────────────────────────────────────
const LEAD_ORDER = ACTIVE_WORK_QUEUE.map(l => ({
  position: l.queue_position,
  lead_id: l.lead_id,
  lead_name: l.lead_name,
  status_ru: l.status_ru,
  next_decision_needed: l.next_decision_needed
}));

// ── Followup queue (из файла, если есть) ──────────────────────────────────
let followupQueue = [];
if (Array.isArray(followupRaw) && followupRaw.length > 0) {
  followupQueue = followupRaw.slice(0, 10);
} else if (followupRaw && typeof followupRaw === 'object') {
  followupQueue = [followupRaw];
}

// ── Legacy leads (история, НЕ рабочая очередь) ───────────────────────────
const legacyLeads = Array.isArray(leadsRaw)
  ? leadsRaw.filter(l => l.status === 'legacy' || l.status === 'archive' || l.is_legacy)
  : [];

// ── Запрещено ──────────────────────────────────────────────────────────────
const FORBIDDEN_NOW = [
  'Не отправлять email без approval Дмитрия',
  'Не отправлять WhatsApp / Telegram без approval',
  'Не делать follow-up по ZB23 до 2026-05-28',
  'Не писать EDERA без подтверждения статуса проекта',
  'Не писать КЖБИ на неподтверждённый контакт',
  'Не делать follow-up ATOM без ясности по первому касанию',
  'Не писать ГСК без выбранного канала и approval',
  'Не отправлять PDF без отдельного решения',
  'Не запускать auto-send',
  'Не читать .env, пароли, токены',
  'Не трогать VPS / SSH / deploy'
];

// ── Риски ──────────────────────────────────────────────────────────────────
const RISKS = [
  { id: 'R-01', title: 'ZB23 не ответил — нужен follow-up', note: 'Дедлайн: 2026-05-28', level: 'HIGH', status: 'ACTIVE' },
  { id: 'R-02', title: 'EDERA: статус проекта неподтверждён', note: 'Ждём approval Дмитрия', level: 'MEDIUM', status: 'ACTIVE' },
  { id: 'R-03', title: 'КЖБИ: нет подтверждённого контакта', note: 'Канал pending', level: 'MEDIUM', status: 'BLOCKED' },
  { id: 'R-04', title: 'ATOM: неясно первое касание', note: 'Нельзя делать follow-up', level: 'MEDIUM', status: 'BLOCKED' },
  { id: 'R-05', title: 'Auto-send отключён', note: 'Все отправки только через approval', level: 'HIGH', status: 'MITIGATED' }
];

// ── Собираем состояние ─────────────────────────────────────────────────────
const state = {
  generated_at: new Date().toISOString(),
  schema_version: 'v5-active-action-board',
  system_status: 'YELLOW',
  system_status_ru: 'Жёлтый режим — ожидание решений',
  auto_send_enabled: false,

  main_action: {
    text: '📋 ZB23 — ждём ответ до 2026-05-28. Сегодня: Дмитрий принимает решения по EDERA / КЖБИ / ATOM / ГСК в Центре решений.',
    priority: 1
  },

  // Рабочая очередь активных лидов
  active_work_queue: ACTIVE_WORK_QUEUE,

  // Центр решений
  dmitry_decision_center: DMITRY_DECISION_CENTER,

  // Порядок лидов
  lead_order: LEAD_ORDER,

  // Followup queue
  followup_queue: followupQueue,

  // Запрещённые действия
  forbidden_now: FORBIDDEN_NOW,
  forbidden_actions: FORBIDDEN_NOW,

  // Риски
  risks: RISKS,

  // Устаревшие лиды (в архив)
  legacy_leads: legacyLeads,

  // Источники данных
  sources_read: [
    leadsQueueFile,
    followupFile,
    '09_dashboards/dashboard_state.json',
    'data/leads.json',
    'data/followups.json'
  ].filter(f => existsSync(resolve(ROOT, f))),

  // Guidance: куда давать команды
  command_guidance: {
    dashboard_role: 'смотреть — только отображение состояния',
    cline_role: 'выполнять задачи — подготовка черновиков, логирование, обновление данных',
    manual_send_role: 'ручная отправка клиенту через email / WhatsApp / MAX / Telegram',
    log_after_manual: 'после любого ручного касания логировать через Cline',
    telegram_bot_status: 'не подключён к этим командам — в разработке',
    playbook_file: '13_sales/daily_lead_factory/active_lead_command_playbook_2026-05-26.md',
    templates_file: '02_templates/active_lead_cline_command_templates.md',
    sop_file: '03_sop/visual_dashboard_daily_use_sop.md'
  },

  // Шаблоны команд для Cline (краткий список)
  cline_command_templates: [
    'prepare_draft',
    'verify_contact',
    'verify_reply',
    'log_manual_touch',
    'put_on_hold',
    'approve_manual_send',
    'update_lead_status'
  ],

  // Флаг: после ручной отправки обязательно логировать
  manual_send_log_required: true
};


// ── Запись ─────────────────────────────────────────────────────────────────
const outPath = resolve(ROOT, '09_dashboards/dashboard_state.json');
writeFileSync(outPath, JSON.stringify(state, null, 2), 'utf8');
console.log('[build_dashboard_state] ✅ dashboard_state.json обновлён →', outPath);
console.log('[build_dashboard_state] active_work_queue:', ACTIVE_WORK_QUEUE.length, 'лидов');
console.log('[build_dashboard_state] dmitry_decision_center:', DMITRY_DECISION_CENTER.length, 'решений');
console.log('[build_dashboard_state] forbidden_now:', FORBIDDEN_NOW.length, 'правил');
console.log('[build_dashboard_state] risks:', RISKS.length);
console.log('[build_dashboard_state] legacy_leads (архив):', legacyLeads.length);
