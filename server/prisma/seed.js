const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const adminHash = await bcrypt.hash('admin123', 10);
  const studentHash = await bcrypt.hash('student123', 10);

  await prisma.user.upsert({
    where: { email: 'admin@fmm.com' },
    update: {},
    create: { email: 'admin@fmm.com', passwordHash: adminHash, name: 'Ahmad Hassan', role: 'admin', status: 'Active' },
  });

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

  const courseSeed = [
    { name: 'Beginner Forex Course', category: 'Beginner', price: '$99', students: 12340, status: 'Published',
      lessons: [
        { title: 'Welcome to the Academy', fileName: 'welcome-intro.mp4', filePath: '/uploads/videos/seed-welcome-intro.mp4', size: '84 MB', duration: '4:12' },
        { title: 'Reading Your First Candlestick Chart', fileName: 'candlestick-basics.mp4', filePath: '/uploads/videos/seed-candlestick-basics.mp4', size: '212 MB', duration: '11:47' },
      ] },
    { name: 'Smart Money Concepts', category: 'Intermediate', price: '$249', students: 8420, status: 'Published',
      lessons: [{ title: 'Liquidity & Order Blocks', fileName: 'smc-liquidity.mp4', filePath: '/uploads/videos/seed-smc-liquidity.mp4', size: '340 MB', duration: '18:03' }] },
    { name: 'ICT Masterclass', category: 'Advanced', price: '$399', students: 6910, status: 'Published', lessons: [] },
    { name: 'Gold (XAUUSD) Trading', category: 'Intermediate', price: '$199', students: 5210, status: 'Published', lessons: [] },
    { name: 'Funded Account Program', category: 'Advanced', price: '$349', students: 3040, status: 'Draft', lessons: [] },
    { name: 'Scalping Masterclass', category: 'Advanced', price: '$279', students: 2870, status: 'Published', lessons: [] },
  ];
  for (const c of courseSeed) {
    const existing = await prisma.course.findFirst({ where: { name: c.name } });
    if (existing) continue;
    await prisma.course.create({
      data: {
        name: c.name, category: c.category, price: c.price, students: c.students, status: c.status,
        lessons: { create: c.lessons },
      },
    });
  }

  const liveClasses = [
    { title: 'Weekly Gold (XAUUSD) Market Breakdown', when: 'Today, 8:00 PM GST', platform: 'YouTube Live', attendees: 412 },
    { title: 'ICT Kill Zones Workshop', when: 'Thu, Jul 11 · 7:00 PM GST', platform: 'Zoom', attendees: 0 },
    { title: 'Trading Psychology Q&A', when: 'Sat, Jul 13 · 6:00 PM GST', platform: 'Google Meet', attendees: 0 },
  ];
  for (const lc of liveClasses) {
    const existing = await prisma.liveClass.findFirst({ where: { title: lc.title } });
    if (!existing) await prisma.liveClass.create({ data: lc });
  }

  const announcements = [
    { title: 'New Course: Funded Account Program 2.0', audience: 'All Students' },
    { title: 'Server maintenance for video portal', audience: 'All Students' },
  ];
  for (const a of announcements) {
    const existing = await prisma.announcement.findFirst({ where: { title: a.title } });
    if (!existing) await prisma.announcement.create({ data: a });
  }

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
