const express = require('express');
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { PAID_TIERS } = require('../enrollment');

const router = express.Router();

// Returns the student's real course access: every course they have an
// Enrollment row for, PLUS (if they hold a paid membership) the current batch,
// since membership only rolls forward with whichever batch is active right now.
router.get('/mine', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  const enrollments = await prisma.enrollment.findMany({ where: { userId: req.user.id }, include: { course: true } });
  const enrolledIds = new Set(enrollments.map((e) => e.courseId));

  let accessible = enrollments.map((e) => ({
    id: e.course.id, name: e.course.name, category: e.course.category, price: e.course.price,
    progress: e.progress, completed: e.completed, source: e.source,
  }));

  if (PAID_TIERS.includes(user.membershipTier)) {
    const current = await prisma.course.findFirst({ where: { isCurrentBatch: true } });
    if (current && !enrolledIds.has(current.id)) {
      accessible.push({ id: current.id, name: current.name, category: current.category, price: current.price, progress: 0, completed: false, source: 'membership' });
      enrolledIds.add(current.id);
    }
  }

  const published = await prisma.course.findMany({ where: { status: 'Published' } });
  const notAccessible = published.filter((c) => !enrolledIds.has(c.id))
    .map((c) => ({ id: c.id, name: c.name, category: c.category, price: c.price }));

  res.json({ membershipTier: user.membershipTier, accessible, notAccessible });
});

// Revoke a student's access to a specific course (e.g. to correct a mistaken enrollment).
router.delete('/:userId/:courseId', requireAuth, requireAdmin, async (req, res) => {
  const userId = Number(req.params.userId);
  const courseId = Number(req.params.courseId);
  const enrollment = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId, courseId } } });
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found' });
  await prisma.enrollment.delete({ where: { userId_courseId: { userId, courseId } } });
  res.json({ ok: true });
});

module.exports = router;
