const express = require('express');
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, requireAdmin, async (req, res) => {
  res.json(await prisma.activityLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }));
});

module.exports = router;
