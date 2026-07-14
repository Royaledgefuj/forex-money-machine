const express = require('express');
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../activity');

const router = express.Router();

// Students only need active methods with payment instructions; admins manage the full list.
router.get('/', requireAuth, async (req, res) => {
  const where = req.user.role === 'admin' ? {} : { active: true };
  const methods = await prisma.paymentMethod.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
  res.json(methods);
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { name, instructions, active, sortOrder } = req.body;
  if (!name || !instructions) return res.status(400).json({ error: 'Name and instructions are required' });
  const method = await prisma.paymentMethod.create({
    data: { name, instructions, active: active !== undefined ? active : true, sortOrder: sortOrder || 0 },
  });
  await logActivity(`Added payment method "${method.name}"`);
  res.status(201).json(method);
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { name, instructions, active, sortOrder } = req.body;
  const data = {};
  if (name !== undefined) data.name = name;
  if (instructions !== undefined) data.instructions = instructions;
  if (active !== undefined) data.active = active;
  if (sortOrder !== undefined) data.sortOrder = sortOrder;
  const method = await prisma.paymentMethod.update({ where: { id }, data });
  await logActivity(`Updated payment method "${method.name}"`);
  res.json(method);
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const method = await prisma.paymentMethod.findUnique({ where: { id } });
  if (!method) return res.status(404).json({ error: 'Payment method not found' });
  await prisma.paymentMethod.delete({ where: { id } });
  await logActivity(`Removed payment method "${method.name}"`);
  res.json({ ok: true });
});

module.exports = router;
