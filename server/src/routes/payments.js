const express = require('express');
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../activity');
const { enrollUserInCurrentBatch, enrollUserInCourse } = require('../enrollment');
const { renderInvoice } = require('../invoice');

const router = express.Router();

const MEMBERSHIP_TIERS = ['Community'];

router.get('/', requireAuth, async (req, res) => {
  const mine = req.query.mine === 'true';
  // Payment records contain every student's amounts, methods and status —
  // only an admin may list everyone's; a student may only list their own.
  if (!mine && req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  const where = mine ? { userId: req.user.id } : {};
  res.json(await prisma.payment.findMany({ where, orderBy: { date: 'desc' } }));
});

router.get('/:id/invoice', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const payment = await prisma.payment.findUnique({ where: { id }, include: { user: true } });
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  if (payment.userId !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Not your invoice' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="invoice-${payment.id}.pdf"`);
  renderInvoice(res, {
    invoiceNumber: `FMM-INV-${String(payment.id).padStart(5, '0')}`,
    date: new Date(payment.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }),
    studentName: payment.student,
    studentEmail: payment.user ? payment.user.email : '—',
    description: payment.course,
    method: payment.method,
    reference: payment.reference,
    amount: payment.amount,
    status: payment.status,
  });
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;
  if (!['Paid', 'Pending', 'Refunded'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const payment = await prisma.payment.update({ where: { id }, data: { status } });
  await logActivity(`Marked payment for ${payment.student} as ${status}`);

  if (status === 'Paid' && payment.userId) {
    const tier = MEMBERSHIP_TIERS.find((t) => payment.course === `${t} Membership`);
    if (tier) {
      // Community membership unlocks tools, live classes and the current batch.
      // Signals are granted separately from the admin Signals tab once the
      // student's partner-broker account is verified (30-day subscription).
      await prisma.user.update({ where: { id: payment.userId }, data: { membershipTier: tier } });
      await logActivity(`Upgraded ${payment.student} to ${tier} membership`);
      await enrollUserInCurrentBatch(payment.userId, 'membership');
    } else if (payment.courseId) {
      await enrollUserInCourse(payment.userId, payment.courseId, 'purchase');
      await logActivity(`Enrolled ${payment.student} in course #${payment.courseId}`);
    }
  }

  res.json(payment);
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  await prisma.payment.delete({ where: { id } });
  await logActivity(`Deleted payment record for ${payment.student} (${payment.course})`);
  res.json({ ok: true });
});

module.exports = router;
