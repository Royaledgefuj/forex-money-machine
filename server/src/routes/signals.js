const express = require('express');
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../activity');

const router = express.Router();

const SIGNALS_CHANNEL_URL = 'https://t.me/+Ruf7kxdQvhNlMDRk';
const VERIFY_TELEGRAM_URL = 'https://t.me/Moneymagnet2026';
const PERIOD_DAYS = 30;

function daysRemaining(expiresAt) {
  if (!expiresAt) return 0;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / (1000 * 60 * 60 * 24)) : 0;
}

// Student: current signals-subscription status.
router.get('/mine', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  const remaining = daysRemaining(user.signalsExpiresAt);
  const active = remaining > 0;
  res.json({
    active,
    daysRemaining: remaining,
    expiresAt: user.signalsExpiresAt,
    channelUrl: active ? SIGNALS_CHANNEL_URL : null,
    verifyUrl: VERIFY_TELEGRAM_URL,
  });
});

// Admin: list every student with their signals-subscription status.
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const students = await prisma.user.findMany({
    where: { role: 'student' },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, email: true, membershipTier: true, signalsExpiresAt: true },
  });
  res.json(students.map((s) => {
    const remaining = daysRemaining(s.signalsExpiresAt);
    return { ...s, daysRemaining: remaining, active: remaining > 0 };
  }));
});

// Admin: grant / renew 30 days of signals access (after verifying the student
// opened a partner broker account and paid the monthly subscription via Telegram).
router.post('/:userId/grant', requireAuth, requireAdmin, async (req, res) => {
  const userId = Number(req.params.userId);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: 'Student not found' });

  // Extend from the later of "now" or the current expiry, so renewals stack.
  const base = user.signalsExpiresAt && new Date(user.signalsExpiresAt) > new Date()
    ? new Date(user.signalsExpiresAt)
    : new Date();
  const expiresAt = new Date(base.getTime() + PERIOD_DAYS * 24 * 60 * 60 * 1000);

  const updated = await prisma.user.update({ where: { id: userId }, data: { signalsExpiresAt: expiresAt, signalsAccess: true } });
  await logActivity(`Granted ${user.name} ${PERIOD_DAYS} days of signals access`);
  res.json({ id: updated.id, signalsExpiresAt: updated.signalsExpiresAt, daysRemaining: daysRemaining(updated.signalsExpiresAt) });
});

router.post('/:userId/revoke', requireAuth, requireAdmin, async (req, res) => {
  const userId = Number(req.params.userId);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: 'Student not found' });
  await prisma.user.update({ where: { id: userId }, data: { signalsExpiresAt: null, signalsAccess: false } });
  await logActivity(`Revoked ${user.name}'s signals access`);
  res.json({ ok: true });
});

module.exports = router;
