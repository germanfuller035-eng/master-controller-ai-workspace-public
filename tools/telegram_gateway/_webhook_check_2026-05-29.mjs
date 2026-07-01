// Webhook check via IPv4 transport. Redacted; no token printed.
import { getWebhookInfo, deleteWebhook, TRANSPORT_NAME } from './telegram_api_transport.mjs';

const arg = (process.argv[2] || '').toLowerCase();
const doDelete = arg === 'delete';

(async () => {
  try {
    const info = await getWebhookInfo();
    const url = info && info.result ? info.result.url : null;
    const out = {
      transport: TRANSPORT_NAME,
      token_printed: 'no',
      chat_id_printed: 'no',
      webhook_ok: !!(info && info.ok),
      webhook_url_present: !!(url && url.length > 0),
      pending_update_count: info && info.result ? info.result.pending_update_count : null
    };
    if (doDelete && out.webhook_url_present) {
      const del = await deleteWebhook();
      out.deleteWebhook_ok = !!(del && del.ok);
    } else {
      out.deleteWebhook_ok = 'skipped';
    }
    console.log(JSON.stringify(out, null, 2));
  } catch (e) {
    console.log(JSON.stringify({ error: e && e.message ? e.message : String(e) }));
    process.exit(1);
  }
})();
