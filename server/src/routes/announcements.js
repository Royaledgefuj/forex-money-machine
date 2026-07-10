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

module.exports = router;
