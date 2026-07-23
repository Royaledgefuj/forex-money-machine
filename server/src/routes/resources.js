const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../activity');

const router = express.Router();

const VALID_TIERS = ['Community'];

// Indicators, EAs, templates and spreadsheets come in many formats (.ex4, .ex5, .mq4,
// .tpl, .xlsx, .pdf, .zip...) so uploads accept any file type, unlike the image-only
// proof uploaders elsewhere.
const resourcesDir = process.env.UPLOADS_DIR
  ? path.join(process.env.UPLOADS_DIR, 'resources')
  : path.join(__dirname, '..', '..', 'uploads', 'resources');
fs.mkdirSync(resourcesDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, resourcesDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`),
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

router.get('/', requireAuth, async (req, res) => {
  res.json(await prisma.resource.findMany({ orderBy: { uploadedAt: 'desc' } }));
});

router.post('/', requireAuth, requireAdmin, upload.single('file'), async (req, res) => {
  const { name, type, tier, version } = req.body;
  if (!name || !type || !VALID_TIERS.includes(tier)) return res.status(400).json({ error: 'Name, type and a valid tier (Community) are required' });
  if (!req.file) return res.status(400).json({ error: 'A file is required' });

  const resource = await prisma.resource.create({
    data: {
      name, type, tier, version: version || 'v1.0',
      fileName: req.file.originalname,
      filePath: `/uploads/resources/${req.file.filename}`,
      size: (req.file.size / (1024 * 1024)).toFixed(1) + ' MB',
    },
  });
  await logActivity(`Uploaded "${resource.name}" (${tier} download)`);
  res.status(201).json(resource);
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const resource = await prisma.resource.findUnique({ where: { id } });
  if (!resource) return res.status(404).json({ error: 'Resource not found' });

  const filePath = path.join(resourcesDir, path.basename(resource.filePath));
  fs.unlink(filePath, () => {});

  await prisma.resource.delete({ where: { id } });
  await logActivity(`Removed download "${resource.name}"`);
  res.json({ ok: true });
});

module.exports = router;
