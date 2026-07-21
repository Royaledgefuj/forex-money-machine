const express = require('express');
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../activity');
const { notifyAdmin } = require('../email');

const router = express.Router();

const VALID_BROKERS = ['Exness', 'PU Prime', 'JustMarkets'];
const MIN_DEPOSIT = 300;
const SIGNALS_CHANNEL_URL = 'https://t.me/+Ruf7kxdQvhNlMDRk';
const VERIFY_TELEGRAM_URL = 'https://t.me/Moneymagnet2026';

router.get('/mine', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  const latest = await prisma.signalProof.findFirst({ where: { userId: req.user.id }, orderBy: { submittedAt: 'desc' } });
  res.json({
    signalsAccess: user.signalsAccess,
    channelUrl: user.signalsAccess ? SIGNALS_CHANNEL_URL : null,
    verifyUrl: VERIFY_TELEGRAM_URL,
    latest,
  });
});

router.post('/submit', requireAuth, async (req, res) => {
  const { broker, amount } = req.body;
  if (!VALID_BROKERS.includes(broker)) return res.status(400).json({ error: 'Invalid broker' });
  const numericAmount = Number(amount);
  if (!numericAmount || numericAmount < MIN_DEPOSIT) return res.status(400).json({ error: `Minimum deposit is $${MIN_DEPOSIT}` });

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (user.signalsAccess) return res.status(409).json({ error: 'You already have signals access' });

  const existingPending = await prisma.signalProof.findFirst({ where: { userId: req.user.id, status: 'Pending' } });
  if (existingPending) return res.status(409).json({ error: 'You already have a submission pending review' });

  const proof = await prisma.signalProof.create({
    data: { userId: req.user.id, broker, amount: `$${numericAmount.toFixed(2)}`, status: 'Pending' },
  });
  await logActivity(`${req.user.name} submitted a $${numericAmount} deposit (${broker}) for signals access`);
  notifyAdmin(
    'New signals verification request',
    `<p><strong>${req.user.name}</strong> (${req.user.email}) says they deposited ${proof.amount} with <strong>${broker}</strong> for signals access.</p>
     <p>They were asked to message you directly on Telegram (${VERIFY_TELEGRAM_URL}) with proof — check for their message, then approve in the admin dashboard's Signals tab.</p>`,
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
