const express = require('express');
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../activity');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  res.json(await prisma.broker.findMany({ orderBy: { id: 'asc' } }));
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { name, clicks, regs, conv, commission, status } = req.body;
  if (!name) return res.status(400).json({ error: 'Broker name is required' });
  const broker = await prisma.broker.create({
    data: { name, clicks: clicks || 0, regs: regs || 0, conv: conv || '0%', commission: commission || 0, status: status || 'Active' },
  });
  await logActivity(`Added broker partner "${broker.name}"`);
  res.status(201).json(broker);
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const broker = await prisma.broker.findUnique({ where: { id } });
  if (!broker) return res.status(404).json({ error: 'Broker not found' });
  await prisma.broker.delete({ where: { id } });
  await logActivity(`Removed broker partner "${broker.name}"`);
  res.json({ ok: true });
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
