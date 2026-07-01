// lead_import_readonly_live_bot_glue.mjs
// =============================================================================
// D3-2 — Bot glue for the read-only lead-import live-control commands.
//
// Thin, side-effect-free adapter between the Telegram master bot and the pure
// read-only control module (lead_import_readonly_live_control.mjs).
//
// SAFETY (D3-2)
//   * READ-ONLY. No mutation, no client send, no queue write.
//   * This module NEVER calls sendTelegram itself — it returns { handled, text }
//     and the master bot performs the owner-facing reply.
//   * Mutating verbs (approve/reject/commit) are explicitly NOT routed here.
// =============================================================================

import * as control from './lead_import_readonly_live_control.mjs';

export const D3_2_GLUE_VERSION = 'd3-2-readonly-live-bot-glue-1.0.0';

// Re-export for the master bot routing guard.
export function shouldRouteToReadonlyLiveControl(text) {
    return control.isReadonlyLiveControlCommand(text);
}

export function parseReadonlyLiveControlCommand(text) {
    return control.parseReadonlyCommand(text);
}

// Guard against accidental routing of write/mutating verbs. These commands are
// NOT part of D3-2 and must never be handled by the read-only path.
const FORBIDDEN_VERBS = /^\/?(approve|reject|commit|import|cancel|send)\b/i;

export function isForbiddenWriteCommand(text) {
    if (typeof text !== 'string') return false;
    return FORBIDDEN_VERBS.test(text.trim());
}

// Main entry used by the master bot. Returns:
//   { handled:false } when text is not a read-only live-control command;
//   { handled:true, text } with the owner-facing message otherwise.
export function handleReadonlyLiveControlBotMessage(text, opts = {}) {
    // Never handle forbidden write commands here.
    if (isForbiddenWriteCommand(text) && !control.isReadonlyLiveControlCommand(text)) {
        return { handled: false, blocked_write: true, text: null };
    }
    if (!control.isReadonlyLiveControlCommand(text)) {
        return { handled: false, text: null };
    }
    const result = control.handleReadonlyLiveControl(text, opts);
    if (!result || result.handled !== true) {
        return { handled: false, text: null };
    }
    return {
        handled: true,
        command: result.command,
        arg: result.arg || null,
        text: result.text || '',
        meta: {
            ok: result.ok,
            found: result.found,
            readable: result.readable,
            counts: result.counts,
        },
    };
}
