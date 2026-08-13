const nodemailer = require('nodemailer');

// Configured via env vars (SMTP_USER, SMTP_PASS, ADMIN_EMAIL). Until they're
// set in production, notifications are skipped rather than crashing requests.
let transporter = null;
if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    // Railway's container network is dual-stack, and Node's default DNS
    // resolution can hand back an IPv6 address for smtp.gmail.com that
    // Railway's egress can't route — the connection then just hangs until
    // it times out (observed directly: "Connection timeout" on every send).
    // Forcing IPv4 here fixes it.
    family: 4,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function notifyAdmin(subject, html) {
  if (!transporter || !process.env.ADMIN_EMAIL) {
    console.log(`[email] Skipped "${subject}" — SMTP_USER/SMTP_PASS/ADMIN_EMAIL not configured`);
    return;
  }
  try {
    await transporter.sendMail({
      from: `Forex Money Machine Academy <${process.env.SMTP_USER}>`,
      to: process.env.ADMIN_EMAIL,
      subject,
      html,
    });
  } catch (err) {
    console.error(`[email] Failed to send "${subject}":`, err.message);
  }
}

// Generic send — used for 2FA codes etc. Returns false (never throws) if SMTP
// isn't configured or sending fails, so callers can fail open rather than
// ever locking someone out for an infra reason.
async function sendMail(to, subject, html) {
  if (!transporter) {
    console.log(`[email] Skipped "${subject}" to ${to} — SMTP_USER/SMTP_PASS not configured`);
    return false;
  }
  try {
    await transporter.sendMail({ from: `Forex Money Machine Academy <${process.env.SMTP_USER}>`, to, subject, html });
    return true;
  } catch (err) {
    console.error(`[email] Failed to send "${subject}" to ${to}:`, err.message);
    return false;
  }
}

function isEmailConfigured() {
  return !!transporter;
}

module.exports = { notifyAdmin, sendMail, isEmailConfigured };
