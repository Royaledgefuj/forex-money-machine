const prisma = require('./prisma');

async function logActivity(text) {
  await prisma.activityLog.create({ data: { text } });
}

module.exports = { logActivity };
