// tools/mater_controller_api/src/commercial/deepseek_provider.mjs
// Direct DeepSeek AI provider adapter (OpenAI-compatible). Mirrors the Tokenator adapter contract.
// Lives in the API layer (outbound HTTPS). Config from environment ONLY:
//
//   DEEPSEEK_API_KEY=<secret>            (never logged, never returned)
//   DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
//   DEEPSEEK_PRIMARY_MODEL=deepseek-chat
//   DEEPSEEK_BILLING_MULTIPLIER=1.0
//
// When the secret file/env is absent, the adapter reports a DISABLED state and never calls out.
// It never sends client messages, never writes canonical, never performs payments.
import { PROVIDER_ERROR, classifyError, maskKeyPresence, extractJson, validateStructured } from '../../../commercial_core/lib/ai_provider.mjs';

function cfg(env = process.env) {
    return {
        apiKey: env.DEEPSEEK_API_KEY || '',
        baseUrl: (env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, ''),
        primaryModel: env.DEEPSEEK_PRIMARY_MODEL || 'deepseek-chat',
        multiplier: Number(env.DEEPSEEK_BILLING_MULTIPLIER || 1.0),
        timeoutMs: Number(env.DEEPSEEK_TIMEOUT_MS || 30000),
        maxOutputTokens: Number(env.DEEPSEEK_MAX_OUTPUT_TOKENS || 1500),
    };
}

export function isConfigured(env = process.env) {
    const c = cfg(env);
    return Boolean(c.apiKey && c.baseUrl);
}

// Provider state for the registry/health view (no secrets).
export function providerState(env = process.env) {
    const c = cfg(env);
    if (!isConfigured(env)) {
        return {
            provider_id: 'deepseek_direct', provider_type: 'openai_compatible', enabled: false,
            state: 'READY_DISABLED_SECRET_MISSING', base_url: c.baseUrl, key_presence: 'ABSENT',
            primary_model: c.primaryModel, reason: 'DEEPSEEK secret not provided; adapter implemented and tested, awaiting owner secret + activation.',
        };
    }
    return {
        provider_id: 'deepseek_direct', provider_type: 'openai_compatible', enabled: false,
        state: 'READY_DISABLED_OWNER_APPROVAL_REQUIRED', base_url: c.baseUrl, key_presence: maskKeyPresence(c.apiKey),
        primary_model: c.primaryModel, reason: 'Secret present; live activation requires explicit owner approval in this wave.',
    };
}

async function httpJson(url, { method = 'GET', apiKey, body, timeoutMs = 30000 } = {}) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            method,
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: body ? JSON.stringify(body) : undefined,
            signal: ac.signal,
        });
        let json = null; let text = '';
        try { text = await res.text(); json = text ? JSON.parse(text) : null; } catch { /* keep text */ }
        return { ok: res.ok, status: res.status, json, text, requestId: res.headers.get('x-request-id') || null };
    } finally { clearTimeout(t); }
}

export async function probeCapabilities(env = process.env) {
    const c = cfg(env);
    const out = { provider: 'deepseek_direct', base_url: c.baseUrl, key_presence: maskKeyPresence(c.apiKey), models_endpoint: 'unknown', chat_api: 'unknown', models_seen: [], last_error: null };
    if (!isConfigured(env)) { out.last_error = 'DISABLED_SECRET_MISSING'; return out; }
    try {
        const r = await httpJson(`${c.baseUrl}/models`, { apiKey: c.apiKey, timeoutMs: c.timeoutMs });
        if (r.ok && r.json) { out.models_endpoint = 'ok'; const arr = Array.isArray(r.json.data) ? r.json.data : []; out.models_seen = arr.map((m) => m.id).filter(Boolean).slice(0, 30); }
        else { out.models_endpoint = `status_${r.status}`; if (r.status === 401 || r.status === 403) out.last_error = PROVIDER_ERROR.AUTH; }
    } catch (e) { out.models_endpoint = classifyError(0, e); }
    return out;
}

export async function generateText({ system, user, model, maxOutputTokens } = {}, env = process.env) {
    const c = cfg(env);
    if (!isConfigured(env)) return { ok: false, errorCategory: 'DISABLED_SECRET_MISSING', text: '', usage: null };
    const r = await httpJson(`${c.baseUrl}/chat/completions`, {
        method: 'POST', apiKey: c.apiKey, timeoutMs: c.timeoutMs,
        body: {
            model: model || c.primaryModel,
            messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: user || '' }],
            max_tokens: maxOutputTokens || c.maxOutputTokens, temperature: 0,
        },
    });
    if (!r.ok) return { ok: false, status: r.status, errorCategory: classifyError(r.status), text: '', usage: null };
    const u = r.json?.usage || {};
    return {
        ok: true, text: r.json?.choices?.[0]?.message?.content ?? '', requestId: r.requestId,
        usage: { input: u.prompt_tokens ?? null, output: u.completion_tokens ?? null, estimated: u.prompt_tokens == null },
    };
}

export async function generateStructured({ system, user, schema, model, maxOutputTokens } = {}, env = process.env) {
    const sys = `${system || ''}\n\nReturn ONLY valid minified JSON. No prose.`;
    const r = await generateText({ system: sys, user, model, maxOutputTokens }, env);
    if (!r.ok) return { ok: false, errorCategory: r.errorCategory, usage: r.usage || null };
    let obj = extractJson(r.text);
    let v = obj ? validateStructured(obj, schema) : { ok: false, errors: ['no_json'] };
    let usageIn = r.usage?.input || 0, usageOut = r.usage?.output || 0;
    if (!v.ok) {
        const repair = await generateText({ system: sys, user: `${user}\n\nPrevious answer invalid (${v.errors.join(',')}). Return corrected minified JSON only.`, model, maxOutputTokens }, env);
        if (repair.ok) { usageIn += repair.usage?.input || 0; usageOut += repair.usage?.output || 0; const o2 = extractJson(repair.text); const v2 = o2 ? validateStructured(o2, schema) : { ok: false, errors: ['no_json'] }; if (v2.ok) { obj = o2; v = v2; } }
    }
    return { ok: v.ok, data: v.ok ? obj : null, errors: v.ok ? [] : v.errors, errorCategory: v.ok ? null : PROVIDER_ERROR.SCHEMA, requestId: r.requestId, usage: { input: usageIn, output: usageOut, estimated: Boolean(r.usage?.estimated) } };
}

export default { isConfigured, providerState, probeCapabilities, generateText, generateStructured, cfg };
