const nodemailer = require('nodemailer');

// Configured via env vars (SMTP_USER, SMTP_PASS, ADMIN_EMAIL). Until they're
// set in production, notifications are skipped rather than crashing requests.
let transporter = null;
if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
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

module.exports = { notifyAdmin };
