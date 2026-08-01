const express = require('express');
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../activity');
const { renderCertificate } = require('../certificate');

const router = express.Router();

// A raw count() breaks the moment any certificate is ever deleted (the
// "Revoke" button) — the recycled count collides with a still-existing
// certificateNumber and hits the unique constraint. Basing it on the highest
// number actually in use this year is immune to gaps from deletions.
async function nextCertificateNumber() {
  const year = new Date().getFullYear();
  const prefix = `FMM-${year}-`;
  const certs = await prisma.certificate.findMany({
    where: { certificateNumber: { startsWith: prefix } },
    select: { certificateNumber: true },
  });
  const maxNum = certs.reduce((max, c) => {
    const n = parseInt(c.certificateNumber.slice(prefix.length), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `${prefix}${String(maxNum + 1).padStart(5, '0')}`;
}

router.get('/mine', requireAuth, async (req, res) => {
  res.json(await prisma.certificate.findMany({ where: { userId: req.user.id }, orderBy: { issuedAt: 'desc' } }));
});

router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const certs = await prisma.certificate.findMany({ include: { user: { select: { name: true, email: true } } }, orderBy: { issuedAt: 'desc' } });
  res.json(certs);
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { userId, programName, batchName, completionDate } = req.body;
    if (!userId || !programName || !batchName || !completionDate) {
      return res.status(400).json({ error: 'userId, programName, batchName and completionDate are required' });
    }
    const student = await prisma.user.findUnique({ where: { id: Number(userId) } });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const certificate = await prisma.certificate.create({
      data: {
        userId: student.id,
        studentName: student.name,
        programName, batchName, completionDate,
        certificateNumber: await nextCertificateNumber(),
      },
    });
    await logActivity(`Issued certificate ${certificate.certificateNumber} to ${student.name}`);
    res.status(201).json(certificate);
  } catch (err) {
    res.status(500).json({ error: 'Could not issue certificate — please try again' });
  }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const certificate = await prisma.certificate.findUnique({ where: { id } });
  if (!certificate) return res.status(404).json({ error: 'Certificate not found' });
  await prisma.certificate.delete({ where: { id } });
  await logActivity(`Revoked certificate ${certificate.certificateNumber}`);
  res.json({ ok: true });
});

router.get('/:id/download', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const certificate = await prisma.certificate.findUnique({ where: { id } });
  if (!certificate) return res.status(404).json({ error: 'Certificate not found' });
  if (certificate.userId !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Not your certificate' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${certificate.certificateNumber}.pdf"`);
  renderCertificate(res, {
    studentName: certificate.studentName,
    programName: certificate.programName,
    batchName: certificate.batchName,
    completionDate: certificate.completionDate,
    certificateNumber: certificate.certificateNumber,
  });
});

module.exports = router;
