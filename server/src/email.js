const nodemailer = require('nodemailer');

// Configured via env vars (SMTP_USER, SMTP_PASS, ADMIN_EMAIL). Until they're
// set in production, notifications are skipped rather than crashing requests.
let transporter = null;
if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    // Port 465 (implicit TLS) was timing out/ENETUNREACH from Railway even
    // after forcing IPv4 DNS resolution — looks like Railway's egress blocks
    // or badly routes that port specifically. 587 with STARTTLS is Gmail's
    // other supported SMTP port; trying it since raw-SMTP-port blocking on
    // PaaS hosts is common and port-specific.
    port: 587,
    secure: false,
    requireTLS: true,
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
