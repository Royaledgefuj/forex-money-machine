const prisma = require('./prisma');
const { sendMail, notifyAdmin } = require('./email');

const DAY_MS = 24 * 60 * 60 * 1000;
const REMIND_WITHIN_DAYS = 3; // start emailing the student once this close to renewal
const REMIND_THROTTLE_DAYS = 3; // don't re-email the same student more than once every N days

function daysBetween(a, b) {
  return Math.round((a.getTime() - b.getTime()) / DAY_MS);
}

async function checkMembershipRenewals() {
  const now = new Date();
  const members = await prisma.user.findMany({
    where: { membershipTier: 'Community', membershipExpiresAt: { not: null } },
  });

  const dueSoon = [];
  const overdue = [];

  for (const member of members) {
    const daysRemaining = daysBetween(member.membershipExpiresAt, now);
    if (daysRemaining > REMIND_WITHIN_DAYS) continue; // not due yet, nothing to do

    const alreadyReminded = member.lastMembershipReminderAt
      && daysBetween(now, member.lastMembershipReminderAt) < REMIND_THROTTLE_DAYS;
    if (alreadyReminded) {
      (daysRemaining < 0 ? overdue : dueSoon).push({ ...member, daysRemaining });
      continue;
    }

    const overdueDays = -daysRemaining;
    const subject = daysRemaining < 0
      ? `Your Community membership expired ${overdueDays} day${overdueDays === 1 ? '' : 's'} ago`
      : `Your Community membership renews in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`;
    const body = `
      <p>Hi ${member.name},</p>
      <p>${daysRemaining < 0
        ? `Your $10/month Community membership expired ${overdueDays} day${overdueDays === 1 ? '' : 's'} ago. Renew now to keep your trading signals, tools and live class access.`
        : `Your $10/month Community membership renews in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}. Renew from your dashboard to avoid losing access.`}</p>
      <p>Log in and go to Membership to renew.</p>`;
    // eslint-disable-next-line no-await-in-loop
    await sendMail(member.email, subject, body);
    // eslint-disable-next-line no-await-in-loop
    await prisma.user.update({ where: { id: member.id }, data: { lastMembershipReminderAt: now } });

    (daysRemaining < 0 ? overdue : dueSoon).push({ ...member, daysRemaining });
  }

  if (dueSoon.length || overdue.length) {
    const row = (m) => `<li>${m.name} (${m.email}) — ${m.daysRemaining < 0 ? `overdue by ${-m.daysRemaining}d` : `due in ${m.daysRemaining}d`}</li>`;
    await notifyAdmin(
      `Community membership renewals: ${overdue.length} overdue, ${dueSoon.length} due soon`,
      `${overdue.length ? `<p><strong>Overdue:</strong></p><ul>${overdue.map(row).join('')}</ul>` : ''}
       ${dueSoon.length ? `<p><strong>Due soon:</strong></p><ul>${dueSoon.map(row).join('')}</ul>` : ''}
       <p>Check the admin dashboard's Membership tab for the full list.</p>`,
    );
  }
}

function startMembershipReminderPolling() {
  checkMembershipRenewals().catch((err) => console.error('[membershipReminders] initial check failed:', err.message));
  setInterval(() => {
    checkMembershipRenewals().catch((err) => console.error('[membershipReminders] check failed:', err.message));
  }, 24 * 60 * 60 * 1000);
}

module.exports = { checkMembershipRenewals, startMembershipReminderPolling };
