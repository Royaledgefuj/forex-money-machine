// Student Dashboard — Payments & Support Tickets are backed by the real API;
// course progress/certificates/leaderboard/downloads have no backing model yet, so they stay illustrative.

const session = Auth.requireRole('student');

if (session) {
  document.getElementById('userName').textContent = session.name;
  document.getElementById('userEmail').textContent = session.email;
  document.getElementById('userAvatar').textContent = session.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
  document.getElementById('welcomeMsg').textContent = `Welcome back, ${session.name.split(' ')[0]}!`;
  document.getElementById('profileName').value = session.name;
  document.getElementById('profileEmail').value = session.email;
}

// ---- Tab navigation ----
const navItems = document.querySelectorAll('.dash-nav-item[data-panel]');
const panels = document.querySelectorAll('.dash-panel[data-panel]');
const topbarTitle = document.getElementById('topbarTitle');
const titleMap = {
  overview: 'Overview', courses: 'My Courses', live: 'Live Classes', certificates: 'Certificates',
  downloads: 'Downloads & Tools', payments: 'Payments & Brokers', membership: 'Membership',
  community: 'Community', support: 'Support', profile: 'Profile & Security',
};

function showPanel(key) {
  navItems.forEach((n) => n.classList.toggle('active', n.dataset.panel === key));
  panels.forEach((p) => p.classList.toggle('active', p.dataset.panel === key));
  topbarTitle.textContent = titleMap[key] || 'Dashboard';
}

navItems.forEach((item) => item.addEventListener('click', () => showPanel(item.dataset.panel)));
document.querySelectorAll('[data-nav-to]').forEach((el) => {
  el.addEventListener('click', (e) => { e.preventDefault(); showPanel(el.dataset.navTo); });
});

document.getElementById('logoutBtn').addEventListener('click', (e) => {
  e.preventDefault();
  Auth.logout();
  window.location.href = 'index.html';
});

// ---- Mock data ----
const COURSES = [
  { name: 'Smart Money Concepts', progress: 68, status: 'in-progress' },
  { name: 'Beginner Forex Course', progress: 100, status: 'complete' },
  { name: 'Gold (XAUUSD) Trading', progress: 35, status: 'in-progress' },
  { name: 'Trading Psychology', progress: 100, status: 'complete' },
];
const RECOMMENDED = ['ICT Masterclass', 'Funded Account Program', 'Scalping Masterclass'];

function courseRow(c) {
  return `<div class="course-row">
    <div class="thumb">${c.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</div>
    <div class="course-row-info">
      <strong>${c.name}</strong>
      <div class="progress-bar"><span style="width:${c.progress}%"></span></div>
      <span class="progress-pct">${c.progress}% complete</span>
    </div>
    <a href="#" class="btn btn-outline btn-sm">${c.progress === 100 ? 'Review' : 'Resume'}</a>
  </div>`;
}

document.getElementById('overviewCourses').innerHTML = COURSES.filter((c) => c.status === 'in-progress').map(courseRow).join('');
document.getElementById('courseList').innerHTML = COURSES.map(courseRow).join('');
document.getElementById('courseRecommended').innerHTML = RECOMMENDED.map((name) => `
  <div class="course-row">
    <div class="thumb">${name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</div>
    <div class="course-row-info"><strong>${name}</strong><span class="progress-pct">Not enrolled yet</span></div>
    <a href="index.html#courses" class="btn btn-gold btn-sm">Enroll</a>
  </div>`).join('');

const LIVE_CLASSES = [
  { title: 'Weekly Gold (XAUUSD) Market Breakdown', time: 'Today, 8:00 PM GST', tag: 'Live' },
  { title: 'ICT Kill Zones Workshop', time: 'Thu, Jul 11 · 7:00 PM GST', tag: 'Workshop' },
  { title: 'Trading Psychology Q&A', time: 'Sat, Jul 13 · 6:00 PM GST', tag: 'Q&A' },
];
function liveRow(l) {
  return `<div class="list-item"><span class="list-dot"></span><div><strong>${l.title}</strong><span>${l.time} · ${l.tag}</span></div></div>`;
}
document.getElementById('overviewLive').innerHTML = LIVE_CLASSES.slice(0, 2).map(liveRow).join('');
document.getElementById('liveSchedule').innerHTML = LIVE_CLASSES.map(liveRow).join('');

const ANNOUNCEMENTS = [
  { title: 'New Course: Funded Account Program 2.0', time: '2 days ago' },
  { title: 'Server maintenance for video portal, Jul 12', time: '4 days ago' },
  { title: 'July trading challenge leaderboard is live', time: '1 week ago' },
];
document.getElementById('overviewAnnouncements').innerHTML = ANNOUNCEMENTS.map((a) => `
  <div class="list-item"><span class="list-dot"></span><div><strong>${a.title}</strong><span>${a.time}</span></div></div>`).join('');

const LEADERBOARD = [
  { name: 'Sara A.', points: 4820 }, { name: 'David M.', points: 4510 }, { name: session ? session.name : 'You', points: 3990, self: true }, { name: 'Omar T.', points: 3820 },
];
document.getElementById('overviewLeaderboard').innerHTML = LEADERBOARD.map((l, i) => `
  <div class="list-item"><span class="list-dot" style="${l.self ? 'background:var(--up)' : ''}"></span>
  <div><strong>#${i + 1} ${l.name}${l.self ? ' (You)' : ''}</strong><span>${l.points.toLocaleString()} XP</span></div></div>`).join('');

const CERTIFICATES = [
  { course: 'Beginner Forex Course', id: 'FMM-2026-00842', earned: true },
  { course: 'Trading Psychology', id: 'FMM-2026-00913', earned: true },
  { course: 'Smart Money Concepts', progress: 68, earned: false },
  { course: 'Gold (XAUUSD) Trading', progress: 35, earned: false },
];
document.getElementById('certList').innerHTML = CERTIFICATES.map((c) => `
  <div class="download-tile">
    <div class="dt-top"><h4>${c.course}</h4><span class="badge-pill ${c.earned ? 'pill-success' : 'pill-muted'}">${c.earned ? 'Earned' : 'Locked'}</span></div>
    <p class="meta">${c.earned ? 'Certificate No. ' + c.id : `${c.progress}% complete — finish course to unlock`}</p>
    ${c.earned ? '<a href="#" class="btn btn-outline btn-sm">Download PDF</a>' : '<button class="btn btn-outline btn-sm" disabled>Locked</button>'}
  </div>`).join('');

const DOWNLOADS = [
  { name: 'TradingView Indicators', type: 'TradingView', version: 'v3.2', size: '48 KB', tier: 'Silver' },
  { name: 'MT4 Indicators', type: 'MT4 Indicator Pack', version: 'v3.2', size: '64 KB', tier: 'Silver' },
  { name: 'MT5 Indicators', type: 'MT5 Indicator Pack', version: 'v3.2', size: '64 KB', tier: 'Silver' },
  { name: 'Chart Templates', type: 'MT4/MT5 Template', version: 'v2.0', size: '20 KB', tier: 'Silver' },
  { name: 'Trading Journal', type: 'Excel Sheet', version: 'v2.3', size: '64 KB', tier: 'Gold' },
  { name: 'Excel Sheets', type: 'Trading Toolkit', version: 'v4.1', size: '85 KB', tier: 'Gold' },
  { name: 'Expert Advisors', type: 'MT4/MT5 EA', version: 'v1.8', size: '112 KB', tier: 'Platinum' },
  { name: 'PDF Guides', type: 'PDF Guide', version: 'v1.0', size: '1.2 MB', tier: 'Free' },
  { name: 'Risk Calculator', type: 'Excel Sheet', version: 'v1.4', size: '32 KB', tier: 'Free' },
  { name: 'Lot Size Calculator', type: 'Excel Sheet', version: 'v1.2', size: '28 KB', tier: 'Free' },
];
function renderDownloads() {
  const myTier = (session && session.membershipTier) || 'Free';
  document.getElementById('downloadList').innerHTML = DOWNLOADS.map((d) => {
    const unlocked = tierRank(myTier) >= tierRank(d.tier);
    return `
    <div class="download-tile">
      <div class="dt-top"><h4>${d.name}</h4><span class="badge-pill ${d.tier === 'Free' ? 'pill-success' : 'pill-warn'}">${d.tier}</span></div>
      <p class="meta">${d.type} · ${d.size} · ${d.version}</p>
      ${unlocked
        ? `<a href="#" class="btn btn-gold btn-sm">Download</a>`
        : `<button class="btn btn-outline btn-sm" data-upgrade-tier="${d.tier}">🔒 Requires ${d.tier}</button>`}
    </div>`;
  }).join('');
}
renderDownloads();
document.getElementById('downloadList').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-upgrade-tier]');
  if (!btn) return;
  showPanel('membership');
});

// ================= MEMBERSHIP =================
const PLAN_FEATURES = {
  Silver: ['Indicators (TradingView, MT4, MT5)', 'Chart templates', 'Course access & live classes (already included)'],
  Gold: ['Everything in Silver', 'Trading Journal', 'Excel toolkit sheets'],
  Platinum: ['Everything in Gold', 'Expert Advisors', 'All future new indicators & strategies', 'Lifetime access — one-time payment'],
};
let pendingMembershipRequests = [];

function renderMembership() {
  const myTier = (session && session.membershipTier) || 'Free';
  document.getElementById('currentTierLabel').textContent = myTier;

  const pending = pendingMembershipRequests[0];
  document.getElementById('pendingRequestNote').innerHTML = pending
    ? `<div class="card"><p class="mini-note">⏳ Your request for <strong>${pending.course}</strong> is pending admin approval.</p></div>`
    : '';

  document.getElementById('membershipPlans').innerHTML = ['Silver', 'Gold', 'Platinum'].map((tier) => {
    const price = MEMBERSHIP_TIERS[tier].price;
    const already = tierRank(myTier) >= tierRank(tier);
    const hasPending = pendingMembershipRequests.some((p) => p.course === `${tier} Membership`);
    let action;
    if (already) action = '<button class="btn btn-outline btn-sm" disabled>Current Plan</button>';
    else if (hasPending) action = '<button class="btn btn-outline btn-sm" disabled>Request Pending</button>';
    else action = `<button class="btn btn-gold btn-sm" data-request-tier="${tier}">Request Upgrade</button>`;

    return `
    <div class="download-tile">
      <div class="dt-top"><h4>${tier}</h4><span class="badge-pill pill-warn">$${price}${tier === 'Platinum' ? ' lifetime' : ''}</span></div>
      <p class="meta">${PLAN_FEATURES[tier].join(' · ')}</p>
      ${action}
    </div>`;
  }).join('');
}

document.getElementById('membershipPlans').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-request-tier]');
  if (!btn) return;
  btn.disabled = true;
  try {
    await apiFetch('/membership/request', { method: 'POST', body: JSON.stringify({ tier: btn.dataset.requestTier }) });
    await loadPendingMembershipRequests();
    renderMembership();
    alert(`Upgrade request sent! An admin will review and approve your ${btn.dataset.requestTier} membership shortly.`);
  } catch (err) {
    alert(err.message);
    btn.disabled = false;
  }
});

async function loadPendingMembershipRequests() {
  const all = await apiFetch('/payments');
  pendingMembershipRequests = all.filter((p) => p.student === session.name && p.status === 'Pending' && p.course.endsWith(' Membership'));
}

async function refreshMembershipTier() {
  const me = await apiFetch('/auth/me');
  session.membershipTier = me.membershipTier;
  const stored = Auth.getSession();
  if (stored) { stored.membershipTier = me.membershipTier; localStorage.setItem('fmm_session', JSON.stringify(stored)); }
  await loadPendingMembershipRequests();
  renderDownloads();
  renderMembership();
}
refreshMembershipTier();

async function loadPayments() {
  const all = await apiFetch('/payments');
  const mine = all.filter((p) => p.student === session.name);
  document.getElementById('paymentRows').innerHTML = mine.length ? mine.map((p) => `
    <tr><td>${new Date(p.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' })}</td><td>${p.course}</td><td>${p.method}</td><td>${p.amount}</td>
    <td><span class="badge-pill ${p.status === 'Paid' ? 'pill-success' : p.status === 'Pending' ? 'pill-warn' : 'pill-danger'}">${p.status}</span></td><td><a href="#" class="btn btn-outline btn-sm">Invoice</a></td></tr>`).join('')
    : '<tr><td colspan="6"><p class="empty-note">No payments yet.</p></td></tr>';
}
loadPayments();

document.getElementById('brokerAccounts').innerHTML = `
  <div class="course-row"><div class="thumb">EX</div><div class="course-row-info"><strong>Exness</strong><span class="progress-pct">Account #88213 · Linked Jun 2026</span></div><span class="badge-pill pill-success">Verified</span></div>
  <div class="course-row"><div class="thumb">PU</div><div class="course-row-info"><strong>PU Prime</strong><span class="progress-pct">Not linked yet</span></div><a href="index.html#brokers" class="btn btn-outline btn-sm">Link Account</a></div>
  <div class="course-row"><div class="thumb">JM</div><div class="course-row-info"><strong>JustMarkets</strong><span class="progress-pct">Not linked yet</span></div><a href="index.html#brokers" class="btn btn-outline btn-sm">Link Account</a></div>`;

document.getElementById('dashCommunity').innerHTML = [
  ['💬', 'WhatsApp', 'https://whatsapp.com/channel/0029VbBnrw82v1IqtqOh5N01'],
  ['✈️', 'Telegram', 'https://telegram.me/+7_qfoZp1ilk5ODc0'],
  ['📸', 'Instagram', 'https://www.instagram.com/vrcrypto_and_forex_trader?igsh=MTFleXd2d2ZmYXJkeA=='],
  ['▶️', 'YouTube', 'https://youtube.com/@vrcommerce-ahmadhassanchou9469?si=QX6vaKO_LLebJ4so'],
  ['🎵', 'TikTok', 'https://www.tiktok.com/@forexmoneymachine?_r=1&_t=ZS-981Gonde3h1'],
].map(([icon, name, url]) => `<a href="${url}" class="community-item" target="_blank" rel="noopener"><span class="c-icon">${icon}</span>${name}</a>`).join('');

async function loadTickets() {
  const tickets = await apiFetch('/tickets?mine=true');
  document.getElementById('ticketList').innerHTML = tickets.length ? tickets.map((t) => `
    <div class="list-item"><span class="list-dot"></span><div><strong>${t.subject}</strong><span>${new Date(t.date).toLocaleDateString()} · <span class="badge-pill ${t.status === 'Open' ? 'pill-warn' : 'pill-success'}">${t.status}</span></span></div></div>`).join('')
    : '<p class="empty-note">No support tickets yet.</p>';
}
loadTickets();

document.getElementById('ticketForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const inputs = e.target.querySelectorAll('input, textarea');
  const subject = inputs[0].value, message = inputs[1].value;
  await apiFetch('/tickets', { method: 'POST', body: JSON.stringify({ subject, message }) });
  alert('Ticket submitted! Our support team will respond within 24 hours.');
  e.target.reset();
  loadTickets();
});
