// Notifies the admin via Telegram Bot API. Configured via env vars
// (TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_CHAT_ID). Telegram bots cannot DM a user
// who hasn't messaged the bot first, so this only ever notifies the admin
// (who sets it up once) — never students. Fails open (never throws) if
// unconfigured or the request fails, so a missing setup can't block anything.
async function notifyAdminTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !chatId) {
    console.log(`[telegram] Skipped notification — TELEGRAM_BOT_TOKEN/TELEGRAM_ADMIN_CHAT_ID not configured`);
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    if (!res.ok) {
      console.error('[telegram] Send failed:', res.status, await res.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (err) {
    console.error('[telegram] Send error:', err.message);
    return false;
  }
}

module.exports = { notifyAdminTelegram };
