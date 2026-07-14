const express = require('express');
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../activity');

const router = express.Router();

router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const students = await prisma.user.findMany({ where: { role: 'student' }, orderBy: { joinedAt: 'asc' } });
  res.json(students);
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { status, membershipTier } = req.body;
  const data = {};

  if (status !== undefined) {
    if (!['Active', 'Pending', 'Suspended'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    data.status = status;
  }
  if (membershipTier !== undefined) {
    if (!['Free', 'Silver', 'Gold', 'Platinum'].includes(membershipTier)) return res.status(400).json({ error: 'Invalid membership tier' });
    data.membershipTier = membershipTier;
  }

  const student = await prisma.user.update({ where: { id }, data });
  if (status !== undefined) await logActivity(`${status === 'Active' ? 'Approved' : 'Suspended'} student ${student.name}`);
  if (membershipTier !== undefined) await logActivity(`Set ${student.name}'s membership to ${membershipTier}`);
  res.json(student);
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const student = await prisma.user.findUnique({ where: { id } });
  if (!student) return res.status(404).json({ error: 'Student not found' });
  await prisma.user.delete({ where: { id } });
  await logActivity(`Deleted student ${student.name}`);
  res.json({ ok: true });
});

module.exports = router;
