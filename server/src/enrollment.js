const prisma = require('./prisma');

const PAID_TIERS = ['Silver', 'Gold', 'Platinum'];

// Grant a single student access to a single course (used for individual course purchases).
async function enrollUserInCourse(userId, courseId, source = 'purchase') {
  await prisma.enrollment.upsert({
    where: { userId_courseId: { userId, courseId } },
    update: {},
    create: { userId, courseId, source },
  });
}

// Membership is scoped to whichever batch is currently active — not a permanent
// back-catalog. Used when a membership tier is granted/upgraded.
async function enrollUserInCurrentBatch(userId, source = 'membership') {
  const current = await prisma.course.findFirst({ where: { isCurrentBatch: true } });
  if (!current) return;
  await enrollUserInCourse(userId, current.id, source);
}

// When a course becomes the new current batch, every existing paid member's
// membership rolls forward to include it automatically.
async function enrollAllMembersInCourse(courseId) {
  const members = await prisma.user.findMany({ where: { role: 'student', membershipTier: { in: PAID_TIERS } } });
  for (const member of members) {
    await enrollUserInCourse(member.id, courseId, 'membership');
  }
}

// Single source of truth for "can this student actually watch this course" —
// either a real Enrollment row, or a paid membership tier while it's the current batch.
async function hasAccessToCourse(userId, courseId) {
  const enrollment = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId, courseId } } });
  if (enrollment) return true;

  const [user, course] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.course.findUnique({ where: { id: courseId } }),
  ]);
  return !!(user && course && PAID_TIERS.includes(user.membershipTier) && course.isCurrentBatch);
}

module.exports = { PAID_TIERS, enrollUserInCourse, enrollUserInCurrentBatch, enrollAllMembersInCourse, hasAccessToCourse };
