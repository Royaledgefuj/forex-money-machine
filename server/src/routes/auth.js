const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { notifyAdmin, sendMail } = require('../email');

const router = express.Router();

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name, role: user.role, membershipTier: user.membershipTier };
}

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const SITE_URL = 'https://www.vrcommercesolutions.com';

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    // Without this, a database error here was an unhandled rejection that
    // never sent a response — the single most critical request in the app
    // would just hang forever instead of failing with a clear error.
    res.status(500).json({ error: 'Could not log in right now — please try again' });
  }
});

router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: 'Name, email and password are required' });

  const existing = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email: email.trim().toLowerCase(), passwordHash, name, role: 'student', status: 'Active' },
  });

  notifyAdmin(
    'New student registration',
    `<p><strong>${user.name}</strong> (${user.email}) just created an account.</p>`,
  );

  const token = signToken(user);
  res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, membershipTier: user.membershipTier } });
});

// Admin-only: create another admin account, or promote+reset an existing account
// (e.g. one that was registered as a student) to admin with a fresh password.
// Existing admins provision new ones — there's no public sign-up path for the role.
router.post('/create-admin', requireAuth, requireAdmin, async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: 'Name, email and password are required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const passwordHash = await bcrypt.hash(password, 10);
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  const user = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: { role: 'admin', passwordHash, name, status: 'Active' } })
    : await prisma.user.create({ data: { email: normalizedEmail, passwordHash, name, role: 'admin', status: 'Active' } });

  res.status(existing ? 200 : 201).json({ id: user.id, email: user.email, name: user.name, role: user.role, promoted: !!existing });
});

// Always responds the same way regardless of whether the email matches an
// account — otherwise this endpoint could be used to discover which emails
// have accounts registered.
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
      await prisma.user.update({ where: { id: user.id }, data: { resetToken, resetTokenExpiresAt } });
      const link = `${SITE_URL}/reset-password.html?token=${resetToken}`;
      // Fire-and-forget: Gmail's SMTP handshake from this host can take minutes
      // (observed, not just a timeout risk), and the token is already saved —
      // making the browser wait on the send would look like the button just
      // hung with no feedback, when the actual reset link is already valid.
      sendMail(
        user.email,
        'Reset your Forex Money Machine Academy password',
        `<p>Hi ${user.name},</p><p>Click the link below to set a new password. This link expires in 1 hour.</p><p><a href="${link}">${link}</a></p><p>If you didn't request this, you can safely ignore this email — your password won't change.</p>`,
      ).catch((err) => console.error('[forgot-password] sendMail failed:', err.message));
    }
    res.json({ ok: true, message: 'If an account exists for that email, a reset link has been sent.' });
  } catch (err) {
    res.status(500).json({ error: 'Could not process this request — please try again' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password are required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });

    const user = await prisma.user.findUnique({ where: { resetToken: token } });
    if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
      return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash, resetToken: null, resetTokenExpiresAt: null } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not reset your password — please try again' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ id: user.id, email: user.email, name: user.name, role: user.role, membershipTier: user.membershipTier, membershipExpiresAt: user.membershipExpiresAt, country: user.country, phone: user.phone, telegramId: user.telegramId, whatsappNumber: user.whatsappNumber });
});

router.patch('/me', requireAuth, async (req, res) => {
  const { name, country, phone, telegramId, whatsappNumber } = req.body;
  const data = {};
  if (name !== undefined) data.name = name;
  if (country !== undefined) data.country = country;
  if (phone !== undefined) data.phone = phone;
  if (telegramId !== undefined) data.telegramId = telegramId;
  if (whatsappNumber !== undefined) data.whatsappNumber = whatsappNumber;

  const user = await prisma.user.update({ where: { id: req.user.id }, data });
  res.json({ id: user.id, email: user.email, name: user.name, role: user.role, membershipTier: user.membershipTier, membershipExpiresAt: user.membershipExpiresAt, country: user.country, phone: user.phone, telegramId: user.telegramId, whatsappNumber: user.whatsappNumber });
});

router.patch('/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password are required' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  res.json({ ok: true });
});

module.exports = router;
