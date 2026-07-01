// tools/mater_controller_api/src/commercial/provider_registry.mjs
// Read-only AI provider registry. Surfaces every provider slot + capability/health/state (no secrets).
import tokenator from './tokenator_provider.mjs';
import deepseek from './deepseek_provider.mjs';
import { maskKeyPresence } from '../../../commercial_core/lib/ai_provider.mjs';

export function registry() {
    const tk = tokenator.cfg();
    const items = [
        {
            provider_id: 'tokenator', provider_type: 'openai_compatible', base_url: tk.baseUrl,
            enabled: tokenator.isConfigured(), priority: 1, key_presence: maskKeyPresence(tk.apiKey),
            models: [tk.primaryModel, tk.fallbackModel], structured_output: true, streaming: true,
            cost_class: 'paid', state: tokenator.isConfigured() ? 'ACTIVE' : 'DISABLED_SECRET_MISSING',
        },
        deepseek.providerState(),
        { provider_id: 'openai_direct', provider_type: 'openai', enabled: false, priority: 9, state: 'DISABLED', key_presence: 'ABSENT', cost_class: 'paid' },
        { provider_id: 'anthropic_direct', provider_type: 'anthropic', enabled: false, priority: 9, state: 'DISABLED', key_presence: 'ABSENT', cost_class: 'paid' },
        { provider_id: 'local_ollama', provider_type: 'local', enabled: false, priority: 9, state: 'FUTURE', key_presence: 'NA', cost_class: 'free' },
    ];
    return { items, count: items.length };
}

export default { registry };
