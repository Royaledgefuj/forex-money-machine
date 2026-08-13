// Sends via the Resend HTTP API rather than talking SMTP directly to Gmail —
// Railway's egress was blocking/misrouting outbound SMTP on both port 465
// and 587 (confirmed directly: ENETUNREACH/timeout on every send attempt,
// even after forcing IPv4 DNS resolution). HTTPS to Resend's API sidesteps
// that whole class of problem, since it's the same kind of outbound call
// every other integration in this app already makes successfully.
const RESEND_API_BASE = 'https://api.resend.com';

function isEmailConfigured() {
  return !!process.env.RESEND_API_KEY;
}

async function send(to, subject, html) {
  if (!isEmailConfigured()) {
    console.log(`[email] Skipped "${subject}" to ${to} — RESEND_API_KEY not configured`);
    return false;
  }
  try {
    const res = await fetch(`${RESEND_API_BASE}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // vrcommercesolutions.com is verified in Resend, so this is a safe
        // default — onboarding@resend.dev (Resend's sandbox address) can only
        // send to the Resend account owner's own email, which silently broke
        // admin notifications going to a different address.
        from: process.env.RESEND_FROM || 'Forex Money Machine Academy <noreply@vrcommercesolutions.com>',
        to,
        subject,
        html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[email] Failed to send "${subject}" to ${to}: ${res.status} ${body}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[email] Failed to send "${subject}" to ${to}:`, err.message);
    return false;
  }
}

async function notifyAdmin(subject, html) {
  if (!process.env.ADMIN_EMAIL) {
    console.log(`[email] Skipped "${subject}" — ADMIN_EMAIL not configured`);
    return;
  }
  await send(process.env.ADMIN_EMAIL, subject, html);
}

// Generic send — used for 2FA codes, password resets, etc. Never throws, so
// callers can fail open rather than ever locking someone out for an infra
// reason.
async function sendMail(to, subject, html) {
  return send(to, subject, html);
}

module.exports = { notifyAdmin, sendMail, isEmailConfigured };
