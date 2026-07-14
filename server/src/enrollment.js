const prisma = require('./prisma');

const PAID_TIERS = ['Silver', 'Gold', 'Platinum'];

// Grant a student access to every currently published course (used when their
// membership becomes Silver/Gold/Platinum, and when a new course is published).
async function enrollUserInAllCourses(userId, source = 'membership') {
  const courses = await prisma.course.findMany({ where: { status: 'Published' } });
  for (const course of courses) {
    await prisma.enrollment.upsert({
      where: { userId_courseId: { userId, courseId: course.id } },
      update: {},
      create: { userId, courseId: course.id, source },
    });
  }
}

// Grant a single student access to a single course (used for individual course purchases).
async function enrollUserInCourse(userId, courseId, source = 'purchase') {
  await prisma.enrollment.upsert({
    where: { userId_courseId: { userId, courseId } },
    update: {},
    create: { userId, courseId, source },
  });
}

// When a new course is published, auto-enroll every existing paid member.
async function enrollAllMembersInCourse(courseId) {
  const members = await prisma.user.findMany({ where: { role: 'student', membershipTier: { in: PAID_TIERS } } });
  for (const member of members) {
    await enrollUserInCourse(member.id, courseId, 'membership');
  }
}

module.exports = { PAID_TIERS, enrollUserInAllCourses, enrollUserInCourse, enrollAllMembersInCourse };
