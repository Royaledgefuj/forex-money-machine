const express = require('express');
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { PAID_TIERS } = require('../enrollment');

const router = express.Router();

// Returns the student's real course access: every course they have an
// Enrollment row for, PLUS (if they hold a paid membership) every published
// course, since membership is an all-access pass.
router.get('/mine', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  const enrollments = await prisma.enrollment.findMany({ where: { userId: req.user.id }, include: { course: true } });
  const enrolledIds = new Set(enrollments.map((e) => e.courseId));

  let accessible = enrollments.map((e) => ({
    id: e.course.id, name: e.course.name, category: e.course.category, price: e.course.price,
    progress: e.progress, completed: e.completed, source: e.source,
  }));

  let notAccessible = [];
  if (PAID_TIERS.includes(user.membershipTier)) {
    const published = await prisma.course.findMany({ where: { status: 'Published' } });
    const missing = published.filter((c) => !enrolledIds.has(c.id));
    accessible = accessible.concat(missing.map((c) => ({
      id: c.id, name: c.name, category: c.category, price: c.price, progress: 0, completed: false, source: 'membership',
    })));
  } else {
    const published = await prisma.course.findMany({ where: { status: 'Published' } });
    notAccessible = published.filter((c) => !enrolledIds.has(c.id))
      .map((c) => ({ id: c.id, name: c.name, category: c.category, price: c.price }));
  }

  res.json({ membershipTier: user.membershipTier, accessible, notAccessible });
});

// Revoke a student's access to a course (e.g. to correct a mistaken enrollment).
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const enrollment = await prisma.enrollment.findUnique({ where: { id } });
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found' });
  await prisma.enrollment.delete({ where: { id } });
  res.json({ ok: true });
});

module.exports = router;
