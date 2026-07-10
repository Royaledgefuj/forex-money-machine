const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../activity');

const router = express.Router();

// UPLOADS_DIR lets a persistent volume be mounted at a custom path in production
// (e.g. Railway volumes) instead of the default local ./uploads folder.
const uploadsDir = process.env.UPLOADS_DIR
  ? path.join(process.env.UPLOADS_DIR, 'videos')
  : path.join(__dirname, '..', '..', 'uploads', 'videos');
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`),
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

router.get('/', requireAuth, async (req, res) => {
  const courses = await prisma.course.findMany({ include: { lessons: true }, orderBy: { id: 'asc' } });
  res.json(courses);
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
  const { name, category, price, status, students } = req.body;
  const data = {};
  if (name !== undefined) data.name = name;
  if (category !== undefined) data.category = category;
  if (price !== undefined) data.price = price;
  if (status !== undefined) data.status = status;
  if (students !== undefined) data.students = students;

  const course = await prisma.course.update({ where: { id }, data });
  await logActivity(`Updated course "${course.name}"`);
  res.json(course);
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const course = await prisma.course.findUnique({ where: { id }, include: { lessons: true } });
  if (!course) return res.status(404).json({ error: 'Course not found' });

  course.lessons.forEach((lesson) => {
    const filePath = path.join(uploadsDir, path.basename(lesson.filePath));
    fs.unlink(filePath, () => {});
  });

  await prisma.course.delete({ where: { id } });
  await logActivity(`Deleted course "${course.name}"`);
  res.json({ ok: true });
});

// ---- Lessons / video uploads ----
router.post('/:id/lessons', requireAuth, requireAdmin, upload.single('video'), async (req, res) => {
  const courseId = Number(req.params.id);
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) return res.status(404).json({ error: 'Course not found' });
  if (!req.file) return res.status(400).json({ error: 'Video file is required' });

  const lesson = await prisma.lesson.create({
    data: {
      courseId,
      title: req.body.title || req.file.originalname,
      fileName: req.file.originalname,
      filePath: `/uploads/videos/${req.file.filename}`,
      size: (req.file.size / (1024 * 1024)).toFixed(1) + ' MB',
    },
  });
  await logActivity(`Uploaded video "${lesson.fileName}" to ${course.name}`);
  res.status(201).json(lesson);
});

router.delete('/lessons/:lessonId', requireAuth, requireAdmin, async (req, res) => {
  const lessonId = Number(req.params.lessonId);
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, include: { course: true } });
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

  const filePath = path.join(uploadsDir, path.basename(lesson.filePath));
  fs.unlink(filePath, () => {});

  await prisma.lesson.delete({ where: { id: lessonId } });
  await logActivity(`Removed lesson "${lesson.title}" from ${lesson.course.name}`);
  res.json({ ok: true });
});

module.exports = router;
