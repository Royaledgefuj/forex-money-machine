const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  // One-time migration: the old Silver/Gold/Platinum tiers are collapsed into a
  // single "Community" membership. Idempotent — after the first run nothing matches.
  await prisma.user.updateMany({
    where: { membershipTier: { in: ['Silver', 'Gold', 'Platinum'] } },
    data: { membershipTier: 'Community' },
  });

  const studentHash = await bcrypt.hash('student123', 10);

  await prisma.user.upsert({
    where: { email: 'student@fmm.com' },
    update: {},
    create: { email: 'student@fmm.com', passwordHash: studentHash, name: 'Rayan Khan', role: 'student', status: 'Active', coursesCount: 4 },
  });

  const students = [
    { email: 'sara.a@example.com', name: 'Sara A.', coursesCount: 3, status: 'Active' },
    { email: 'david.m@example.com', name: 'David M.', coursesCount: 2, status: 'Active' },
    { email: 'omar.t@example.com', name: 'Omar T.', coursesCount: 1, status: 'Pending' },
    { email: 'layla.h@example.com', name: 'Layla H.', coursesCount: 4, status: 'Active' },
    { email: 'karim.s@example.com', name: 'Karim S.', coursesCount: 1, status: 'Suspended' },
  ];
  for (const s of students) {
    const hash = await bcrypt.hash('student123', 10);
    await prisma.user.upsert({
      where: { email: s.email },
      update: {},
      create: { ...s, passwordHash: hash, role: 'student' },
    });
  }

  // Courses are monthly batches now, managed entirely by the admin (create + mark
  // "current batch" from the dashboard) — nothing to seed here.
  if ((await prisma.course.count()) === 0) {
    await prisma.course.create({
      data: { name: 'July 2026 Batch', category: 'All Levels', price: '$150', status: 'Published', isCurrentBatch: true },
    });
  }

  // Live classes and announcements are entirely admin-managed now — no seed data.

  const payments = [
    { student: 'Rayan Khan', course: 'Smart Money Concepts', method: 'USDT (TRC20)', amount: '$249.00', status: 'Paid' },
    { student: 'Rayan Khan', course: 'Gold (XAUUSD) Trading', method: 'Ziina', amount: '$199.00', status: 'Paid' },
    { student: 'Sara A.', course: 'Smart Money Concepts', method: 'USDT (TRC20)', amount: '$249.00', status: 'Paid' },
    { student: 'David M.', course: 'Gold (XAUUSD) Trading', method: 'Ziina', amount: '$199.00', status: 'Paid' },
    { student: 'Omar T.', course: 'Beginner Forex Course', method: 'Bank Transfer', amount: '$99.00', status: 'Pending' },
    { student: 'Layla H.', course: 'ICT Masterclass', method: 'BTC', amount: '$399.00', status: 'Paid' },
    { student: 'Karim S.', course: 'Scalping Masterclass', method: 'Ziina', amount: '$279.00', status: 'Refunded' },
  ];
  if ((await prisma.payment.count()) === 0) {
    await prisma.payment.createMany({ data: payments });
  }

  const brokers = [
    { name: 'Exness', clicks: 3910, regs: 498, conv: '12.7%', commission: 3220, status: 'Active' },
    { name: 'PU Prime', clicks: 4820, regs: 612, conv: '12.7%', commission: 4180, status: 'Active' },
    { name: 'JustMarkets', clicks: 6210, regs: 743, conv: '11.9%', commission: 9940, status: 'Active' },
  ];
  if ((await prisma.broker.count()) === 0) {
    await prisma.broker.createMany({ data: brokers });
  }

  const tickets = [
    { student: 'Rayan Khan', subject: "Can't access ICT Masterclass video", status: 'Open' },
    { student: 'Sara A.', subject: 'Certificate name spelled incorrectly', status: 'Resolved' },
    { student: 'Omar T.', subject: 'Payment not reflecting in account', status: 'Open' },
  ];
  if ((await prisma.ticket.count()) === 0) {
    await prisma.ticket.createMany({ data: tickets });
  }

  const paymentMethods = [
    { name: 'USDT (TRC20)', instructions: 'Send the exact amount to wallet address: [ADD YOUR USDT TRC20 WALLET ADDRESS HERE]. Upload a screenshot of the completed transaction.', sortOrder: 1 },
    { name: 'Ziina', instructions: 'Send payment via Ziina to: [ADD YOUR ZIINA PAYMENT LINK OR NUMBER HERE]. Upload a screenshot of the payment confirmation.', sortOrder: 2 },
    { name: 'Bank Transfer', instructions: 'Transfer to: [ADD YOUR BANK NAME, ACCOUNT NUMBER, IBAN HERE]. Upload a screenshot or photo of the transfer receipt.', sortOrder: 3 },
    { name: 'BTC', instructions: 'Send the exact amount to wallet address: [ADD YOUR BTC WALLET ADDRESS HERE]. Upload a screenshot of the completed transaction.', sortOrder: 4 },
  ];
  for (const m of paymentMethods) {
    const existing = await prisma.paymentMethod.findFirst({ where: { name: m.name } });
    if (!existing) await prisma.paymentMethod.create({ data: m });
  }

  if ((await prisma.activityLog.count()) === 0) {
    await prisma.activityLog.createMany({
      data: [
        { text: 'Approved student Layla H.' },
        { text: 'Published course "Scalping Masterclass"' },
        { text: 'Issued certificate to David M. for Trading Psychology' },
        { text: 'Suspended student Karim S. for chargeback review' },
      ],
    });
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
