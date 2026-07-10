const express = require('express');
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../activity');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  res.json(await prisma.liveClass.findMany({ orderBy: { id: 'desc' } }));
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { title, when, platform } = req.body;
  if (!title || !when) return res.status(400).json({ error: 'Title and date/time are required' });
  const liveClass = await prisma.liveClass.create({ data: { title, when, platform: platform || 'YouTube Live' } });
  await logActivity(`Scheduled live class "${liveClass.title}"`);
  res.status(201).json(liveClass);
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const liveClass = await prisma.liveClass.findUnique({ where: { id } });
  if (!liveClass) return res.status(404).json({ error: 'Live class not found' });
  await prisma.liveClass.delete({ where: { id } });
  await logActivity(`Cancelled live class "${liveClass.title}"`);
  res.json({ ok: true });
});

module.exports = router;
