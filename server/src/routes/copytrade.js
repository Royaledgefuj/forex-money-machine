const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../activity');
const { notifyAdmin } = require('../email');

const router = express.Router();

const VALID_BROKERS = ['PU Prime', 'Exness'];
const MIN_DEPOSIT = 200;
const ACCOUNT_TYPE = 'Cent / USDC-Cent';

const proofsDir = process.env.UPLOADS_DIR
  ? path.join(process.env.UPLOADS_DIR, 'copy-trade-proofs')
  : path.join(__dirname, '..', '..', 'uploads', 'copy-trade-proofs');
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
  res.status(201).json({ url: `/uploads/copy-trade-proofs/${req.file.filename}` });
});

router.get('/mine', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  const latest = await prisma.copyTradeRequest.findFirst({ where: { userId: req.user.id }, orderBy: { submittedAt: 'desc' } });
  res.json({ copyTradeConnected: user.copyTradeConnected, latest });
});

router.post('/submit', requireAuth, async (req, res) => {
  const { broker, accountNumber, amount, proofUrl, undertakingAccepted } = req.body;
  if (!VALID_BROKERS.includes(broker)) return res.status(400).json({ error: 'Invalid broker' });
  if (!accountNumber || !accountNumber.trim()) return res.status(400).json({ error: 'Trading account number is required' });
  if (!proofUrl) return res.status(400).json({ error: 'Proof of account opening / deposit is required' });
  if (!undertakingAccepted) return res.status(400).json({ error: 'You must accept the risk undertaking to proceed' });
  const numericAmount = Number(amount);
  if (!numericAmount || numericAmount < MIN_DEPOSIT) return res.status(400).json({ error: `Minimum deposit is $${MIN_DEPOSIT}` });

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (user.copyTradeConnected) return res.status(409).json({ error: 'You are already connected to copy trade' });

  const existingPending = await prisma.copyTradeRequest.findFirst({ where: { userId: req.user.id, status: { in: ['Pending', 'Approved'] } } });
  if (existingPending) return res.status(409).json({ error: 'You already have a submission pending review' });

  const request = await prisma.copyTradeRequest.create({
    data: {
      userId: req.user.id,
      broker,
      accountType: ACCOUNT_TYPE,
      accountNumber: accountNumber.trim(),
      amount: `$${numericAmount.toFixed(2)}`,
      proofUrl,
      undertakingAccepted: true,
      status: 'Pending',
    },
  });
  await logActivity(`${req.user.name} submitted a copy trade request (${broker}, ${request.amount})`);
  notifyAdmin(
    'New copy trade request submitted',
    `<p><strong>${req.user.name}</strong> (${req.user.email}) submitted a copy trade request with <strong>${broker}</strong> — account #${request.accountNumber}, deposit ${request.amount}.</p>
     <p><a href="https://www.vrcommercesolutions.com${proofUrl}">View proof screenshot</a></p>
     <p>Review in the admin dashboard's Copy Trade tab.</p>`,
  );
  res.status(201).json(request);
});

router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const requests = await prisma.copyTradeRequest.findMany({ include: { user: true }, orderBy: { submittedAt: 'desc' } });
  res.json(requests);
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;
  if (!['Approved', 'Connected', 'Rejected', 'Pending'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

  if (status === 'Connected') {
    const current = await prisma.copyTradeRequest.findUnique({ where: { id } });
    await prisma.user.update({ where: { id: current.userId }, data: { copyTradeConnected: true } });
  }
  const request = await prisma.copyTradeRequest.update({ where: { id }, data: { status }, include: { user: true } });
  if (status === 'Connected') {
    await logActivity(`Connected ${request.user.name} to copy trade (${request.broker})`);
  } else {
    await logActivity(`Marked ${request.user.name}'s copy trade request as ${status}`);
  }
  res.json(request);
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const request = await prisma.copyTradeRequest.findUnique({ where: { id } });
  if (!request) return res.status(404).json({ error: 'Request not found' });
  await prisma.copyTradeRequest.delete({ where: { id } });
  res.json({ ok: true });
});

module.exports = router;
