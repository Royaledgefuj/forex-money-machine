const express = require('express');
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../activity');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const { mine } = req.query;
  const where = mine ? { student: req.user.name } : {};
  res.json(await prisma.ticket.findMany({ where, orderBy: { date: 'desc' } }));
});

router.post('/', requireAuth, async (req, res) => {
  const { subject, message } = req.body;
  if (!subject) return res.status(400).json({ error: 'Subject is required' });
  const ticket = await prisma.ticket.create({
    data: { student: req.user.name, subject: message ? `${subject} — ${message}` : subject },
  });
  res.status(201).json(ticket);
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const ticket = await prisma.ticket.update({ where: { id }, data: { status: 'Resolved' } });
  await logActivity(`Resolved ticket "${ticket.subject}"`);
  res.json(ticket);
});

module.exports = router;
