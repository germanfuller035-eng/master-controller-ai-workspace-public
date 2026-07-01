// tools/commercial_core/tests/first_touch.test.mjs
// First Touch engine tests (pure, no network/LLM).
import { selectHook, scoreHook, composeSubjects, composeBodies, similarity, scoreQuality, HOOK_TYPES, bodySafetyRisks } from '../lib/first_touch_engine.mjs';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('FAIL', n); } };

const findings = [
    { finding_id: 'f1', title: 'Путь до заявки', evidence_url: 'https://x.ru', evidence_text: 'Сложно найти форму заявки от каталога', confidence: 0.7 },
    { finding_id: 'f2', title: 'Доверие', evidence_url: 'https://x.ru/about', evidence_text: 'Нет отзывов и кейсов', confidence: 0.6 },
];

// ---- Hook engine ----
const sel = selectHook(findings, { lead_id: 'X' }, 'mini_audit');
ok('H1 primary hook chosen', sel.primary && sel.primary.hook_type === 'REQUEST_PATH_FRICTION');
ok('H2 hook gate pass (evidence-backed)', sel.primary.scored.gate_pass === true);
ok('H3 hook score >=75', sel.primary.scored.score >= 75);
ok('H4 finding without evidence rejected', selectHook([{ finding_id: 'n', title: 'x', evidence_text: 'y' }], {}, 'mini_audit').primary === null);
ok('H5 forbidden primary hook fails gate', scoreHook({ title: 'На сайте есть контакты', evidence_url: 'u', evidence_text: 'есть контакты', business_impact: 'x' }).gate_pass === false);
ok('H6 invented impact flagged', scoreHook({ title: 'a', evidence_url: 'u', evidence_text: 'b', business_impact: 'вы теряете 30% заявок' }).reasons.includes('invented_impact'));
ok('H7 no evidence -> low + fail', scoreHook({ title: 'a', business_impact: 'x' }).gate_pass === false);

// ---- Subjects ----
const subs = composeSubjects('СтройДвор-Юг', sel.primary);
ok('S1 three subjects', subs.length === 3);
ok('S2 all <=55 chars', subs.every((s) => s.text.length <= 55));
ok('S3 no clickbait/emoji/caps risk', subs.every((s) => !s.risk_flags.includes('spam_risk') && !s.risk_flags.includes('emoji')));

// ---- Bodies ----
const bodies = composeBodies('СтройДвор-Юг', sel.primary, sel.supporting);
ok('B1 two variants', bodies.length === 2);
ok('B2 word count 70-120', bodies.every((b) => b.metrics.word_count >= 70 && b.metrics.word_count <= 120));
ok('B3 exactly one CTA', bodies.every((b) => b.metrics.cta_count === 1));
ok('B4 zero links', bodies.every((b) => b.metrics.links === 0));
ok('B5 no price', bodies.every((b) => !b.metrics.has_price));
ok('B6 <=1 question', bodies.every((b) => b.metrics.questions <= 1));
ok('B7 zero exclaims', bodies.every((b) => b.metrics.exclaims === 0));
ok('B8 first-touch quality standard present', bodies.every((b) => /Меня зовут Дмитрий/.test(b.text) && /перв(ого|ое) касани/.test(b.text)));
ok('B9 caveat + 3-5 point mini-review present', bodies.every((b) => /(не утверждаю|не делаю вывод)/i.test(b.text) && /3[-–]5/.test(b.text)));
ok('B10 no abstract first-touch claims', bodies.every((b) => bodySafetyRisks(b.text).length === 0));
ok('B11 weak abstract copy rejected', bodySafetyRisks('Public digital presence and first-response friction can improve client-volume ROI.').some((r) => r.startsWith('forbidden_')));

// ---- Uniqueness ----
const sim = similarity(bodies[0].text, bodies[1].text);
ok('U1 variants distinct (<0.75)', sim < 0.75);
ok('U2 identical text ~1.0', similarity(bodies[0].text, bodies[0].text) > 0.95);

// ---- Quality scorer ----
const q = scoreQuality({ hook: sel.primary, hookScore: sel.primary.scored.score, body: bodies[0], contactEvidenced: true, priorCommercialSend: false, priorOptOut: false, maxSimilarity: sim });
ok('Q1 passes gate', q.gate_result === 'PASS' && q.total_score >= 85);
ok('Q2 prior send -> auto fail', scoreQuality({ hook: sel.primary, hookScore: 90, body: bodies[0], contactEvidenced: true, priorCommercialSend: true, priorOptOut: false, maxSimilarity: 0 }).failure_reasons.includes('prior_commercial_send'));
ok('Q3 not evidenced -> fail', scoreQuality({ hook: sel.primary, hookScore: 90, body: bodies[0], contactEvidenced: false, priorCommercialSend: false, priorOptOut: false, maxSimilarity: 0 }).gate_result === 'FAIL');
ok('Q4 opt-out -> auto fail', scoreQuality({ hook: sel.primary, hookScore: 90, body: bodies[0], contactEvidenced: true, priorCommercialSend: false, priorOptOut: true, maxSimilarity: 0 }).failure_reasons.includes('prior_opt_out'));
ok('Q5 high similarity penalised', scoreQuality({ hook: sel.primary, hookScore: 90, body: bodies[0], contactEvidenced: true, priorCommercialSend: false, priorOptOut: false, maxSimilarity: 0.9 }).risk_penalty <= -15);

ok('Z1 hook types include required', HOOK_TYPES.includes('REQUEST_PATH_FRICTION') && HOOK_TYPES.includes('TRUST_GAP'));

console.log(`\n==== first_touch: ${pass} passed, ${fail} failed ====`);
if (fail > 0) process.exit(1);
