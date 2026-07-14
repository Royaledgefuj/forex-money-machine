const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../activity');
const { notifyAdmin } = require('../email');

const router = express.Router();

const VALID_BROKERS = ['Exness', 'PU Prime', 'JustMarkets'];
const MIN_DEPOSIT = 300;
const SIGNALS_CHANNEL_URL = 'https://t.me/+Ruf7kxdQvhNlMDRk';

const proofsDir = process.env.UPLOADS_DIR
  ? path.join(process.env.UPLOADS_DIR, 'deposit-proofs')
  : path.join(__dirname, '..', '..', 'uploads', 'deposit-proofs');
fs.mkdirSync(proofsDir, { recursive: true });

const proofStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, proofsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`),
});
const uploadProof = multer({
  storage: proofStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

router.post('/upload-proof', requireAuth, uploadProof.single('proof'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'A valid image file is required' });
  res.status(201).json({ url: `/uploads/deposit-proofs/${req.file.filename}` });
});

router.get('/mine', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  const latest = await prisma.signalProof.findFirst({ where: { userId: req.user.id }, orderBy: { submittedAt: 'desc' } });
  res.json({
    signalsAccess: user.signalsAccess,
    channelUrl: user.signalsAccess ? SIGNALS_CHANNEL_URL : null,
    latest,
  });
});

router.post('/submit', requireAuth, async (req, res) => {
  const { broker, amount, proofUrl } = req.body;
  if (!VALID_BROKERS.includes(broker)) return res.status(400).json({ error: 'Invalid broker' });
  if (!proofUrl) return res.status(400).json({ error: 'Proof of deposit is required' });
  const numericAmount = Number(amount);
  if (!numericAmount || numericAmount < MIN_DEPOSIT) return res.status(400).json({ error: `Minimum deposit is $${MIN_DEPOSIT}` });

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (user.signalsAccess) return res.status(409).json({ error: 'You already have signals access' });

  const existingPending = await prisma.signalProof.findFirst({ where: { userId: req.user.id, status: 'Pending' } });
  if (existingPending) return res.status(409).json({ error: 'You already have a submission pending review' });

  const proof = await prisma.signalProof.create({
    data: { userId: req.user.id, broker, amount: `$${numericAmount.toFixed(2)}`, proofUrl, status: 'Pending' },
  });
  await logActivity(`${req.user.name} submitted a $${numericAmount} deposit proof (${broker}) for signals access`);
  notifyAdmin(
    'New signals deposit proof submitted',
    `<p><strong>${req.user.name}</strong> (${req.user.email}) submitted proof of a ${proof.amount} deposit with <strong>${broker}</strong> for signals access.</p>
     <p><a href="https://www.vrcommercesolutions.com${proofUrl}">View proof screenshot</a></p>
     <p>Review and approve in the admin dashboard's Signals tab.</p>`,
  );
  res.status(201).json(proof);
});

router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const proofs = await prisma.signalProof.findMany({ include: { user: true }, orderBy: { submittedAt: 'desc' } });
  res.json(proofs);
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;
  if (!['Approved', 'Rejected', 'Pending'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

  if (status === 'Approved') {
    const current = await prisma.signalProof.findUnique({ where: { id } });
    await prisma.user.update({ where: { id: current.userId }, data: { signalsAccess: true } });
  }
  const proof = await prisma.signalProof.update({ where: { id }, data: { status }, include: { user: true } });
  if (status === 'Approved') {
    await logActivity(`Granted ${proof.user.name} signals access (${proof.broker} deposit verified)`);
  } else {
    await logActivity(`Marked ${proof.user.name}'s signals deposit proof as ${status}`);
  }
  res.json(proof);
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const proof = await prisma.signalProof.findUnique({ where: { id } });
  if (!proof) return res.status(404).json({ error: 'Submission not found' });
  await prisma.signalProof.delete({ where: { id } });
  res.json({ ok: true });
});

module.exports = router;
