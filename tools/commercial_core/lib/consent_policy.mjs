// tools/commercial_core/lib/consent_policy.mjs
// PURE consent / contact policy engine. No I/O, no send. Decides what is ALLOWED for a (channel,
// contact) pair and records reason codes. UNKNOWN never becomes ALLOWED; opt-out blocks all outbound;
// inbound reply may be DRAFTED but sending stays gated. Decisions are deterministic and auditable.

export const CONSENT_STATUS = ['PUBLIC_BUSINESS_CONTACT', 'INBOUND_INITIATED', 'EXPLICIT_OPT_IN', 'EXISTING_RELATIONSHIP', 'OWNER_APPROVED_ONE_TIME', 'UNKNOWN', 'OPTED_OUT', 'PROHIBITED'];
export const ACTIONS = ['DISCOVERY_ALLOWED', 'STORE_CONTACT_ALLOWED', 'PREPARE_DRAFT_ALLOWED', 'OWNER_REVIEW_REQUIRED', 'OUTBOUND_ALLOWED', 'FOLLOWUP_ALLOWED', 'BLOCKED'];

// Outbound is OFF for all new channels this wave; the engine still computes the policy decision so the
// owner can see what WOULD be allowed, but OUTBOUND_ALLOWED is never returned true for a new channel.
const NEW_CHANNELS_OUTBOUND_OFF = new Set(['VK', 'MAX', 'TELEGRAM', 'WHATSAPP', 'SMS', 'PHONE', 'AVITO', 'WEB_FORM']);

/**
 * Evaluate the contact policy.
 * @param input { channel, consentStatus, direction, optedOut, priorConversation, quietHours, ownerApproval }
 * Returns { allowed_actions[], outbound_allowed, reason_codes[] }.
 */
export function evaluatePolicy(input = {}) {
    const { channel = 'EMAIL', consentStatus = 'UNKNOWN', direction = 'inbound', optedOut = false, priorConversation = false, quietHours = false, ownerApproval = false } = input;
    const reasons = [];
    const allowed = new Set();

    // Opt-out / prohibited: hard block on outbound; discovery/store still depend on lawful basis.
    if (optedOut || consentStatus === 'OPTED_OUT') { reasons.push('opted_out'); return finalize(allowed, false, reasons, ['BLOCKED_OUTBOUND']); }
    if (consentStatus === 'PROHIBITED') { reasons.push('prohibited'); return finalize(allowed, false, reasons, ['BLOCKED_OUTBOUND']); }

    // Discovery + storing a public business contact is allowed; it is NOT consent to message.
    if (consentStatus === 'PUBLIC_BUSINESS_CONTACT') { allowed.add('DISCOVERY_ALLOWED'); allowed.add('STORE_CONTACT_ALLOWED'); reasons.push('public_business_contact'); }

    // Drafting (internal) is allowed for inbound-initiated, existing relationship, opt-in, public contact.
    if (['INBOUND_INITIATED', 'EXPLICIT_OPT_IN', 'EXISTING_RELATIONSHIP', 'PUBLIC_BUSINESS_CONTACT', 'OWNER_APPROVED_ONE_TIME'].includes(consentStatus) || priorConversation) {
        allowed.add('PREPARE_DRAFT_ALLOWED');
        reasons.push('draft_basis_present');
    }

    // UNKNOWN never becomes allowed for anything beyond owner review.
    if (consentStatus === 'UNKNOWN') { allowed.add('OWNER_REVIEW_REQUIRED'); reasons.push('unknown_requires_owner_review'); }

    // Outbound eligibility (the "would be allowed" computation). A real send still needs the transport
    // gate; for NEW channels outbound is OFF regardless.
    let outboundEligible = false;
    if (['EXPLICIT_OPT_IN', 'EXISTING_RELATIONSHIP', 'INBOUND_INITIATED'].includes(consentStatus) && !quietHours) outboundEligible = true;
    if (consentStatus === 'OWNER_APPROVED_ONE_TIME' && ownerApproval && !quietHours) outboundEligible = true;
    if (quietHours) reasons.push('quiet_hours');

    if (outboundEligible) allowed.add('OWNER_REVIEW_REQUIRED'); // even eligible outbound needs owner review here

    // Channel rule: new channels never return OUTBOUND_ALLOWED this wave.
    const outboundAllowed = outboundEligible && !NEW_CHANNELS_OUTBOUND_OFF.has(channel);
    if (NEW_CHANNELS_OUTBOUND_OFF.has(channel)) reasons.push('new_channel_outbound_off');
    if (outboundAllowed) allowed.add('OUTBOUND_ALLOWED');

    return finalize(allowed, outboundAllowed, reasons, []);
}

function finalize(allowedSet, outboundAllowed, reasons, extra) {
    return {
        allowed_actions: [...allowedSet],
        outbound_allowed: outboundAllowed === true,
        reason_codes: [...reasons, ...extra],
    };
}
