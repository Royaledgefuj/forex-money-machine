const express = require('express');
const prisma = require('../prisma');
const { requireAuth } = require('../middleware/auth');
const { TIERS } = require('../membership');
const { logActivity } = require('../activity');

const router = express.Router();

router.get('/plans', requireAuth, (req, res) => {
  res.json(TIERS);
});

router.post('/request', requireAuth, async (req, res) => {
  const { tier, method, proofUrl, reference } = req.body;
  if (!['Silver', 'Gold', 'Platinum'].includes(tier)) return res.status(400).json({ error: 'Invalid membership tier' });
  if (!method || !proofUrl) return res.status(400).json({ error: 'Payment method and proof of payment are required' });

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
      proofUrl,
      reference: reference || null,
      amount: `$${TIERS[tier].price.toFixed(2)}`,
      status: 'Pending',
    },
  });
  await logActivity(`${req.user.name} requested ${tier} membership`);
  res.status(201).json(payment);
});

module.exports = router;
