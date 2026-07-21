const express = require('express');
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../activity');
const { enrollAllMembersInCourse, hasAccessToCourse } = require('../enrollment');
const { notifyAdmin } = require('../email');

const router = express.Router();

function extractYouTubeId(url) {
  const match = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|live\/|shorts\/))([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

// Admin-only: full course list including lesson video links, used by the admin dashboard.
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const courses = await prisma.course.findMany({ include: { lessons: true }, orderBy: { id: 'asc' } });
  res.json(courses);
});

// Public — powers the homepage's Courses section, which always shows whichever batch is active.
router.get('/current-batch', async (req, res) => {
  const current = await prisma.course.findFirst({ where: { isCurrentBatch: true } });
  if (!current) return res.status(404).json({ error: 'No current batch set' });
  res.json({ id: current.id, name: current.name, price: current.price });
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { name, category, price, status } = req.body;
  if (!name) return res.status(400).json({ error: 'Course name is required' });
  const course = await prisma.course.create({
    data: { name, category: category || 'Beginner', price: price || '$0', status: status || 'Draft' },
  });
  await logActivity(`Created new course "${course.name}"`);
  res.status(201).json(course);
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { name, category, price, status, students, isCurrentBatch } = req.body;
  const data = {};
  if (name !== undefined) data.name = name;
  if (category !== undefined) data.category = category;
  if (price !== undefined) data.price = price;
  if (status !== undefined) data.status = status;
  if (students !== undefined) data.students = students;

  if (isCurrentBatch === true) {
    await prisma.course.updateMany({ where: { isCurrentBatch: true }, data: { isCurrentBatch: false } });
    data.isCurrentBatch = true;
  } else if (isCurrentBatch === false) {
    data.isCurrentBatch = false;
  }

  const course = await prisma.course.update({ where: { id }, data });
  await logActivity(`Updated course "${course.name}"`);
  if (isCurrentBatch === true) {
    await logActivity(`Set "${course.name}" as the current batch`);
    await enrollAllMembersInCourse(course.id);
  }
  res.json(course);
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const course = await prisma.course.findUnique({ where: { id } });
  if (!course) return res.status(404).json({ error: 'Course not found' });
  await prisma.course.delete({ where: { id } });
  await logActivity(`Deleted course "${course.name}"`);
  res.json({ ok: true });
});

// Student-facing: lesson list + video links, only for courses the student has access to.
router.get('/:id/watch', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const course = await prisma.course.findUnique({ where: { id }, include: { lessons: true } });
  if (!course) return res.status(404).json({ error: 'Course not found' });

  if (req.user.role !== 'admin' && !(await hasAccessToCourse(req.user.id, id))) {
    return res.status(403).json({ error: 'You do not have access to this course' });
  }

  res.json({
    id: course.id,
    name: course.name,
    lessons: course.lessons.map((l) => ({ id: l.id, title: l.title, duration: l.duration, youtubeId: extractYouTubeId(l.videoUrl) })),
  });
});

// ---- Individual course purchase (alternative to membership) ----
const VERIFY_TELEGRAM_URL = 'https://t.me/Moneymagnet2026';

router.post('/:id/purchase-request', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { method, reference } = req.body;
  if (!method) return res.status(400).json({ error: 'Payment method is required' });

  const course = await prisma.course.findUnique({ where: { id } });
  if (!course || course.status !== 'Published') return res.status(404).json({ error: 'Course not found' });

  const paymentMethod = await prisma.paymentMethod.findFirst({ where: { name: method, active: true } });
  if (!paymentMethod) return res.status(400).json({ error: 'Invalid payment method' });

  const existingAccess = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId: req.user.id, courseId: id } } });
  if (existingAccess) return res.status(409).json({ error: 'You already have access to this course' });

  const existingPending = await prisma.payment.findFirst({ where: { userId: req.user.id, courseId: id, status: 'Pending' } });
  if (existingPending) return res.status(409).json({ error: 'You already have a pending request for this course' });

  const payment = await prisma.payment.create({
    data: {
      userId: req.user.id, courseId: id, student: req.user.name, course: course.name,
      method, reference: reference || null, amount: course.price, status: 'Pending',
    },
  });
  await logActivity(`${req.user.name} requested access to "${course.name}"`);
  notifyAdmin(
    `New payment request: ${course.name}`,
    `<p><strong>${req.user.name}</strong> requested <strong>${course.name}</strong> (${course.price}) via ${method}${reference ? ` — ref: ${reference}` : ''}.</p>
     <p>They were asked to message you directly on Telegram (${VERIFY_TELEGRAM_URL}) with their payment proof — check for their message, then approve in the admin dashboard's Payments tab.</p>`,
  );
  res.status(201).json(payment);
});

// ---- Lessons (YouTube links — no server-side video storage) ----
router.post('/:id/lessons', requireAuth, requireAdmin, async (req, res) => {
  const courseId = Number(req.params.id);
  const { title, videoUrl, duration } = req.body;
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) return res.status(404).json({ error: 'Course not found' });
  if (!title || !videoUrl) return res.status(400).json({ error: 'Title and YouTube link are required' });
  if (!extractYouTubeId(videoUrl)) return res.status(400).json({ error: 'That does not look like a valid YouTube link' });

  const lesson = await prisma.lesson.create({
    data: { courseId, title, videoUrl, duration: duration || '—' },
  });
  await logActivity(`Added lesson "${lesson.title}" to ${course.name}`);
  res.status(201).json(lesson);
});

router.delete('/lessons/:lessonId', requireAuth, requireAdmin, async (req, res) => {
  const lessonId = Number(req.params.lessonId);
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, include: { course: true } });
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

  await prisma.lesson.delete({ where: { id: lessonId } });
  await logActivity(`Removed lesson "${lesson.title}" from ${lesson.course.name}`);
  res.json({ ok: true });
});

module.exports = router;
