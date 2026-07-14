const express = require('express');
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../activity');

const router = express.Router();

const MEMBERSHIP_TIERS = ['Silver', 'Gold', 'Platinum'];

router.get('/', requireAuth, async (req, res) => {
  res.json(await prisma.payment.findMany({ orderBy: { date: 'desc' } }));
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;
  if (!['Paid', 'Pending', 'Refunded'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const payment = await prisma.payment.update({ where: { id }, data: { status } });
  await logActivity(`Marked payment for ${payment.student} as ${status}`);

  if (status === 'Paid' && payment.userId) {
    const tier = MEMBERSHIP_TIERS.find((t) => payment.course === `${t} Membership`);
    if (tier) {
      await prisma.user.update({ where: { id: payment.userId }, data: { membershipTier: tier } });
      await logActivity(`Upgraded ${payment.student} to ${tier} membership`);
    }
  }

  res.json(payment);
});

module.exports = router;
