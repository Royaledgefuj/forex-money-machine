const express = require('express');
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../activity');
const { notifyAdmin, sendMail } = require('../email');
const { notifyAdminTelegram } = require('../telegram');

const router = express.Router();

router.get('/mine', requireAuth, async (req, res) => {
  res.json(await prisma.vipBooking.findMany({ where: { userId: req.user.id }, orderBy: { requestedAt: 'desc' } }));
});

router.post('/', requireAuth, async (req, res) => {
  const { requestedAt, notes } = req.body;
  if (!requestedAt) return res.status(400).json({ error: 'A requested date/time is required' });

  const when = new Date(requestedAt);
  if (isNaN(when.getTime())) return res.status(400).json({ error: 'Invalid date/time' });
  if (when.getTime() < Date.now()) return res.status(400).json({ error: 'Please pick a time in the future' });

  const existingPending = await prisma.vipBooking.findFirst({ where: { userId: req.user.id, status: 'Pending' } });
  if (existingPending) return res.status(409).json({ error: 'You already have a pending booking request' });

  const booking = await prisma.vipBooking.create({
    data: { userId: req.user.id, requestedAt: when, notes: notes || null, status: 'Pending' },
  });
  const whenLabel = when.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  await logActivity(`${req.user.name} requested a VIP coaching session for ${whenLabel}`);
  notifyAdmin(
    'New VIP coaching booking request',
    `<p><strong>${req.user.name}</strong> (${req.user.email}) requested a VIP coaching session for <strong>${whenLabel}</strong>.</p>
     ${notes ? `<p>Notes: ${notes}</p>` : ''}
     <p>Review and confirm in the admin dashboard's VIP Bookings tab.</p>`,
  );
  notifyAdminTelegram(`📅 New VIP coaching request\n${req.user.name} (${req.user.email})\nRequested: ${whenLabel}${notes ? `\nNotes: ${notes}` : ''}`);
  res.status(201).json(booking);
});

router.get('/', requireAuth, requireAdmin, async (req, res) => {
  res.json(await prisma.vipBooking.findMany({ include: { user: true }, orderBy: { requestedAt: 'asc' } }));
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;
  if (!['Confirmed', 'Cancelled', 'Pending'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const booking = await prisma.vipBooking.update({ where: { id }, data: { status }, include: { user: true } });
  const whenLabel = new Date(booking.requestedAt).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  await logActivity(`Marked ${booking.user.name}'s VIP session (${whenLabel}) as ${status}`);

  if (status === 'Confirmed') {
    sendMail(
      booking.user.email,
      'Your VIP coaching session is confirmed',
      `<p>Hi ${booking.user.name},</p><p>Your 1-on-1 VIP coaching session is confirmed for <strong>${whenLabel}</strong>.</p><p>We'll reach out with the meeting details closer to the time.</p>`,
    );
  } else if (status === 'Cancelled') {
    sendMail(
      booking.user.email,
      'Your VIP coaching session request',
      `<p>Hi ${booking.user.name},</p><p>Unfortunately your requested VIP coaching session for <strong>${whenLabel}</strong> couldn't be scheduled. Please book another time that works.</p>`,
    );
  }
  res.json(booking);
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const booking = await prisma.vipBooking.findUnique({ where: { id } });
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  await prisma.vipBooking.delete({ where: { id } });
  res.json({ ok: true });
});

module.exports = router;
