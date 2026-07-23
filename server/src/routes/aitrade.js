const express = require('express');
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../activity');
const { notifyAdmin } = require('../email');

const router = express.Router();

const VALID_BROKERS = ['PU Prime'];
const MIN_DEPOSIT = 200;
const ACCOUNT_TYPE = 'Cent / USDC-Cent';
const VERIFY_TELEGRAM_URL = 'https://t.me/Moneymagnet2026';

router.get('/mine', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  const latest = await prisma.aiTradeRequest.findFirst({ where: { userId: req.user.id }, orderBy: { submittedAt: 'desc' } });
  res.json({ aiTradeConnected: user.aiTradeConnected, verifyUrl: VERIFY_TELEGRAM_URL, latest });
});

router.post('/submit', requireAuth, async (req, res) => {
  const { broker, accountNumber, amount, undertakingAccepted } = req.body;
  if (!VALID_BROKERS.includes(broker)) return res.status(400).json({ error: 'Invalid broker' });
  if (!accountNumber || !accountNumber.trim()) return res.status(400).json({ error: 'Trading account number is required' });
  if (!undertakingAccepted) return res.status(400).json({ error: 'You must accept the risk undertaking to proceed' });
  const numericAmount = Number(amount);
  if (!numericAmount || numericAmount < MIN_DEPOSIT) return res.status(400).json({ error: `Minimum deposit is $${MIN_DEPOSIT}` });

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (user.aiTradeConnected) return res.status(409).json({ error: 'You are already connected to AI Trade' });

  const existingPending = await prisma.aiTradeRequest.findFirst({ where: { userId: req.user.id, status: { in: ['Pending', 'Approved'] } } });
  if (existingPending) return res.status(409).json({ error: 'You already have a submission pending review' });

  const request = await prisma.aiTradeRequest.create({
    data: {
      userId: req.user.id,
      broker,
      accountType: ACCOUNT_TYPE,
      accountNumber: accountNumber.trim(),
      amount: `$${numericAmount.toFixed(2)}`,
      undertakingAccepted: true,
      status: 'Pending',
    },
  });
  await logActivity(`${req.user.name} submitted an AI Trade request (${broker}, ${request.amount})`);
  notifyAdmin(
    'New AI Trade verification request',
    `<p><strong>${req.user.name}</strong> (${req.user.email}) submitted an AI Trade request with <strong>${broker}</strong> — account #${request.accountNumber}, deposit ${request.amount}.</p>
     <p>They were asked to message you directly on Telegram (${VERIFY_TELEGRAM_URL}) with proof — check for their message, then review in the admin dashboard's AI Trade tab.</p>`,
  );
  res.status(201).json(request);
});

router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const requests = await prisma.aiTradeRequest.findMany({ include: { user: true }, orderBy: { submittedAt: 'desc' } });
  res.json(requests);
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;
  if (!['Approved', 'Connected', 'Rejected', 'Pending'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

  if (status === 'Connected') {
    const current = await prisma.aiTradeRequest.findUnique({ where: { id } });
    await prisma.user.update({ where: { id: current.userId }, data: { aiTradeConnected: true } });
  }
  const request = await prisma.aiTradeRequest.update({ where: { id }, data: { status }, include: { user: true } });
  if (status === 'Connected') {
    await logActivity(`Connected ${request.user.name} to AI Trade (${request.broker})`);
  } else {
    await logActivity(`Marked ${request.user.name}'s AI Trade request as ${status}`);
  }
  res.json(request);
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const request = await prisma.aiTradeRequest.findUnique({ where: { id } });
  if (!request) return res.status(404).json({ error: 'Request not found' });
  await prisma.aiTradeRequest.delete({ where: { id } });
  res.json({ ok: true });
});

module.exports = router;
