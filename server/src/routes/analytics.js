const express = require('express');
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../activity');

const router = express.Router();

const DEFAULTS = {
  totalRevenue: '$0',
  revenueDelta: '',
  totalStudents: '0',
  studentsDelta: '',
  certificatesIssued: '0',
  certificatesDelta: '',
  brokerCommission: '$0',
  brokerCommissionDelta: '',
  conversionRate: '0%',
  monthlySales: [],
  trafficSources: [],
};

// Singleton row — always id: 1. Every field here is admin-entered, not
// computed, so this is just a plain get-or-create rather than a real model.
async function getOrCreateSettings() {
  let settings = await prisma.analyticsSettings.findUnique({ where: { id: 1 } });
  if (!settings) {
    settings = await prisma.analyticsSettings.create({ data: { id: 1, ...DEFAULTS } });
  }
  return settings;
}

router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    res.json(await getOrCreateSettings());
  } catch (err) {
    res.status(500).json({ error: 'Could not load analytics settings' });
  }
});

router.patch('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    await getOrCreateSettings();
    const {
      totalRevenue, revenueDelta, totalStudents, studentsDelta,
      certificatesIssued, certificatesDelta, brokerCommission, brokerCommissionDelta,
      conversionRate, monthlySales, trafficSources,
    } = req.body;
    const data = {};
    if (totalRevenue !== undefined) data.totalRevenue = totalRevenue;
    if (revenueDelta !== undefined) data.revenueDelta = revenueDelta;
    if (totalStudents !== undefined) data.totalStudents = totalStudents;
    if (studentsDelta !== undefined) data.studentsDelta = studentsDelta;
    if (certificatesIssued !== undefined) data.certificatesIssued = certificatesIssued;
    if (certificatesDelta !== undefined) data.certificatesDelta = certificatesDelta;
    if (brokerCommission !== undefined) data.brokerCommission = brokerCommission;
    if (brokerCommissionDelta !== undefined) data.brokerCommissionDelta = brokerCommissionDelta;
    if (conversionRate !== undefined) data.conversionRate = conversionRate;
    if (monthlySales !== undefined) data.monthlySales = monthlySales;
    if (trafficSources !== undefined) data.trafficSources = trafficSources;

    const settings = await prisma.analyticsSettings.update({ where: { id: 1 }, data });
    await logActivity('Updated analytics dashboard figures');
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Could not save analytics settings' });
  }
});

router.post('/reset', requireAuth, requireAdmin, async (req, res) => {
  try {
    const settings = await prisma.analyticsSettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...DEFAULTS },
      update: DEFAULTS,
    });
    await logActivity('Reset analytics dashboard figures to defaults');
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Could not reset analytics settings' });
  }
});

module.exports = router;
