// Safe env presence check - prints only presence flags + chat_id last4, never tokens.
import 'dotenv/config';
const tok = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || '';
const chat = process.env.TELEGRAM_CHAT_ID || process.env.CHAT_ID || '';
console.log('BOT_TOKEN present:', tok ? 'yes' : 'no');
console.log('CHAT_ID present:', chat ? 'yes' : 'no');
console.log('CHAT_ID last4:', chat ? String(chat).slice(-4) : '(none)');
console.log('GATEWAY_LOG_DIR present:', process.env.GATEWAY_LOG_DIR ? 'yes' : 'no');
console.log('GATEWAY_STATE_DIR present:', process.env.GATEWAY_STATE_DIR ? 'yes' : 'no');
