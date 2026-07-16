const express = require('express');
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../activity');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  res.json(await prisma.announcement.findMany({ orderBy: { sentAt: 'desc' } }));
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { title, message, audience } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  const announcement = await prisma.announcement.create({
    data: { title, message: message || '', audience: audience || 'All Students' },
  });
  await logActivity(`Sent announcement "${announcement.title}" to ${announcement.audience}`);
  res.status(201).json(announcement);
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const announcement = await prisma.announcement.findUnique({ where: { id } });
  if (!announcement) return res.status(404).json({ error: 'Announcement not found' });
  await prisma.announcement.delete({ where: { id } });
  await logActivity(`Deleted announcement "${announcement.title}"`);
  res.json({ ok: true });
});

module.exports = router;
