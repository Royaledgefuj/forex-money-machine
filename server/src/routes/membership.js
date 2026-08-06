const express = require('express');
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { TIERS, currentPrice, COURSE_OFFER, VIP_OFFER } = require('../membership');
const { logActivity } = require('../activity');
const { notifyAdmin } = require('../email');

const router = express.Router();
const VERIFY_TELEGRAM_URL = 'https://t.me/Moneymagnet2026';

router.get('/plans', requireAuth, (req, res) => {
  res.json({ ...TIERS, Course: COURSE_OFFER, Vip: VIP_OFFER });
});

// Admin — every $10/month Community member with their renewal date, so admin
// has the same due-soon/overdue visibility the automatic email reminders act on.
router.get('/renewals', requireAuth, requireAdmin, async (req, res) => {
  try {
    const members = await prisma.user.findMany({
      where: { membershipTier: 'Community' },
      select: { id: true, name: true, email: true, membershipExpiresAt: true },
      orderBy: { membershipExpiresAt: 'asc' },
    });
    const now = Date.now();
    const withStatus = members.map((m) => {
      const daysRemaining = m.membershipExpiresAt
        ? Math.round((new Date(m.membershipExpiresAt).getTime() - now) / (24 * 60 * 60 * 1000))
        : null;
      let status = 'No expiry set';
      if (daysRemaining !== null) status = daysRemaining < 0 ? 'Overdue' : daysRemaining <= 3 ? 'Due Soon' : 'Active';
      return { ...m, daysRemaining, status };
    });
    res.json(withStatus);
  } catch (err) {
    res.status(500).json({ error: 'Could not load membership renewals' });
  }
});

router.post('/request', requireAuth, async (req, res) => {
  const { tier, method, reference } = req.body;
  if (tier !== 'Community') return res.status(400).json({ error: 'Invalid membership tier' });
  if (!method) return res.status(400).json({ error: 'Payment method is required' });

  const paymentMethod = await prisma.paymentMethod.findFirst({ where: { name: method, active: true } });
  if (!paymentMethod) return res.status(400).json({ error: 'Invalid payment method' });

  const existingPending = await prisma.payment.findFirst({
    where: { userId: req.user.id, course: `${tier} Membership`, status: 'Pending' },
  });
  if (existingPending) return res.status(409).json({ error: 'You already have a pending request for this plan' });

  const payment = await prisma.payment.create({
    data: {
      userId: req.user.id,
      student: req.user.name,
      course: `${tier} Membership`,
      method,
      reference: reference || null,
      amount: `$${currentPrice(tier).toFixed(2)}`,
      status: 'Pending',
    },
  });
  await logActivity(`${req.user.name} requested ${tier} membership`);
  notifyAdmin(
    `New payment request: ${tier} Membership`,
    `<p><strong>${req.user.name}</strong> requested <strong>${tier} Membership</strong> (${payment.amount}) via ${method}${reference ? ` — ref: ${reference}` : ''}.</p>
     <p>They were asked to message you directly on Telegram (${VERIFY_TELEGRAM_URL}) with their payment proof — check for their message, then approve in the admin dashboard's Payments tab.</p>`,
  );
  res.status(201).json(payment);
});

module.exports = router;
