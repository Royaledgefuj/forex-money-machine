const express = require('express');
const prisma = require('../prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  res.json(await prisma.broker.findMany({ orderBy: { id: 'asc' } }));
});

router.get('/summary', requireAuth, async (req, res) => {
  const brokers = await prisma.broker.findMany();
  const totalClicks = brokers.reduce((sum, b) => sum + b.clicks, 0);
  const totalRegs = brokers.reduce((sum, b) => sum + b.regs, 0);
  const commissionTotal = brokers.reduce((sum, b) => sum + b.commission, 0);
  const activeBrokers = brokers.filter((b) => b.status === 'Active').length;
  res.json({ totalClicks, totalRegs, commissionTotal, activeBrokers, totalBrokers: brokers.length });
});

module.exports = router;
