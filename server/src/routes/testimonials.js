const express = require('express');
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../activity');
const { notifyAdmin } = require('../email');

const router = express.Router();

// Public — approved testimonials only, for the homepage. No auth required.
router.get('/public', async (req, res) => {
  const testimonials = await prisma.testimonial.findMany({
    where: { status: 'Approved' },
    include: { user: { select: { name: true, country: true } } },
    orderBy: { createdAt: 'desc' },
    take: 12,
  });
  res.json(testimonials.map((t) => ({ id: t.id, text: t.text, rating: t.rating, name: t.user.name, country: t.user.country })));
});

router.get('/mine', requireAuth, async (req, res) => {
  res.json(await prisma.testimonial.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } }));
});

router.post('/', requireAuth, async (req, res) => {
  const { text, rating } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Please share a few words about your experience' });
  const numericRating = Number(rating) || 5;
  if (numericRating < 1 || numericRating > 5) return res.status(400).json({ error: 'Rating must be between 1 and 5' });

  const existingPending = await prisma.testimonial.findFirst({ where: { userId: req.user.id, status: 'Pending' } });
  if (existingPending) return res.status(409).json({ error: 'You already have feedback pending review' });

  const testimonial = await prisma.testimonial.create({
    data: { userId: req.user.id, text: text.trim(), rating: numericRating, status: 'Pending' },
  });
  await logActivity(`${req.user.name} submitted feedback for review`);
  notifyAdmin(
    'New student testimonial submitted',
    `<p><strong>${req.user.name}</strong> (${req.user.email}) submitted feedback:</p>
     <p>"${testimonial.text}" — ${numericRating}/5</p>
     <p>Review in the admin dashboard's Testimonials tab.</p>`,
  );
  res.status(201).json(testimonial);
});

router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const testimonials = await prisma.testimonial.findMany({ include: { user: true }, orderBy: { createdAt: 'desc' } });
  res.json(testimonials);
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;
  if (!['Approved', 'Rejected', 'Pending'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const testimonial = await prisma.testimonial.update({ where: { id }, data: { status }, include: { user: true } });
  await logActivity(`Marked ${testimonial.user.name}'s testimonial as ${status}`);
  res.json(testimonial);
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const testimonial = await prisma.testimonial.findUnique({ where: { id } });
  if (!testimonial) return res.status(404).json({ error: 'Testimonial not found' });
  await prisma.testimonial.delete({ where: { id } });
  res.json({ ok: true });
});

module.exports = router;
