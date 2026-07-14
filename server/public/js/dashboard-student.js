// Student Dashboard — Payments, Support Tickets, Courses (Enrollment), Live Classes, and Membership
// are backed by the real API; certificates/leaderboard have no backing model yet, so they stay illustrative.

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
  downloads: 'Downloads & Tools', payments: 'Payments & Brokers', membership: 'Membership', signals: 'Signals',
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

// ---- Real course access (via membership all-access pass or individual purchase) ----
function courseRow(c) {
  return `<div class="course-row">
    <div class="thumb">${c.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</div>
    <div class="course-row-info">
      <strong>${c.name}</strong>
      <div class="progress-bar"><span style="width:${c.progress}%"></span></div>
      <span class="progress-pct">${c.progress}% complete ${c.source === 'membership' ? '· via membership' : ''}</span>
    </div>
    <a href="#" class="btn btn-outline btn-sm">${c.completed ? 'Review' : 'Resume'}</a>
  </div>`;
}

async function loadEnrollments() {
  const data = await apiFetch('/enrollments/mine');
  const inProgress = data.accessible.filter((c) => !c.completed);
  document.getElementById('overviewCourses').innerHTML = inProgress.length
    ? inProgress.slice(0, 3).map(courseRow).join('')
    : '<p class="empty-note">No courses yet — check Membership or the course catalog to get started.</p>';
  document.getElementById('courseList').innerHTML = data.accessible.length
    ? data.accessible.map(courseRow).join('')
    : '<p class="empty-note">No courses yet. Upgrade your membership or purchase a course to get started.</p>';
  document.getElementById('courseRecommended').innerHTML = data.notAccessible.length
    ? data.notAccessible.map((c) => `
    <div class="course-row">
      <div class="thumb">${c.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</div>
      <div class="course-row-info"><strong>${c.name}</strong><span class="progress-pct">${c.price} · or included with Silver+ membership</span></div>
      <button class="btn btn-gold btn-sm" data-buy-course="${c.id}" data-buy-name="${c.name}" data-buy-amount="${c.price}">Enroll</button>
    </div>`).join('')
    : '<p class="empty-note">You have access to every course. 🎉</p>';
}
loadEnrollments();
document.getElementById('courseRecommended').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-buy-course]');
  if (!btn) return;
  openPaymentModal({ kind: 'course', courseId: btn.dataset.buyCourse, name: btn.dataset.buyName, amount: btn.dataset.buyAmount });
});

// Any paid tier (Silver/Gold/Platinum) unlocks all live classes; Free members see them locked.
function liveRow(l, unlocked) {
  return `<div class="list-item"><span class="list-dot"></span><div><strong>${l.title}</strong><span>${l.when} · ${l.platform}</span></div>
    ${unlocked
      ? '<span class="badge-pill pill-success">Unlocked</span>'
      : '<button class="btn btn-outline btn-sm" data-upgrade-tier="Silver">Members Only</button>'}
  </div>`;
}

async function loadLiveClasses() {
  const classes = await apiFetch('/live-classes');
  const unlocked = tierRank(session.membershipTier || 'Free') >= tierRank('Silver');
  document.getElementById('overviewLive').innerHTML = classes.length
    ? classes.slice(0, 2).map((l) => liveRow(l, unlocked)).join('')
    : '<p class="empty-note">No live classes scheduled right now.</p>';
  document.getElementById('liveSchedule').innerHTML = classes.length
    ? classes.map((l) => liveRow(l, unlocked)).join('')
    : '<p class="empty-note">No live classes scheduled right now.</p>';
}
loadLiveClasses();
['overviewLive', 'liveSchedule'].forEach((id) => {
  document.getElementById(id).addEventListener('click', (e) => {
    if (!e.target.closest('button[data-upgrade-tier]')) return;
    showPanel('membership');
  });
});

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

async function loadCertificates() {
  const certificates = await apiFetch('/certificates/mine');
  document.getElementById('certList').innerHTML = certificates.length ? certificates.map((c) => `
    <div class="download-tile">
      <div class="dt-top"><h4>${c.programName}</h4><span class="badge-pill pill-success">Earned</span></div>
      <p class="meta">Batch: ${c.batchName} · Certificate No. ${c.certificateNumber}</p>
      <a href="${API_BASE}/certificates/${c.id}/download?token=${session.token}" target="_blank" class="btn btn-outline btn-sm">Download PDF</a>
    </div>`).join('')
    : '<p class="empty-note">No certificates yet — they\'re issued once you complete a program batch.</p>';
}
loadCertificates();

// The 3 free tools are static pages (no login required, no tier gating);
// everything else is admin-uploaded via /api/resources and tier-gated.
const FREE_TOOLS = [
  { name: 'PDF Guides', type: 'Beginner Guide', version: 'v1.0', size: '—', tier: 'Free', href: 'guide.html' },
  { name: 'Risk Calculator', type: 'Interactive Tool', version: 'v1.0', size: '—', tier: 'Free', href: 'risk-calculator.html' },
  { name: 'Lot Size Calculator', type: 'Interactive Tool', version: 'v1.0', size: '—', tier: 'Free', href: 'lot-size-calculator.html' },
];

async function renderDownloads() {
  const myTier = (session && session.membershipTier) || 'Free';
  const resources = await apiFetch('/resources');
  const all = FREE_TOOLS.concat(resources.map((r) => ({
    name: r.name, type: r.type, version: r.version, size: r.size, tier: r.tier, filePath: r.filePath,
  })));

  document.getElementById('downloadList').innerHTML = all.map((d) => {
    const unlocked = tierRank(myTier) >= tierRank(d.tier);
    return `
    <div class="download-tile">
      <div class="dt-top"><h4>${d.name}</h4><span class="badge-pill ${d.tier === 'Free' ? 'pill-success' : 'pill-warn'}">${d.tier}</span></div>
      <p class="meta">${d.type} · ${d.size} · ${d.version}</p>
      ${d.href
        ? `<a href="${d.href}" class="btn btn-gold btn-sm">Open</a>`
        : unlocked
          ? `<a href="${MEDIA_BASE}${d.filePath}" class="btn btn-gold btn-sm" download>Download</a>`
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

document.getElementById('membershipPlans').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-request-tier]');
  if (!btn) return;
  const tier = btn.dataset.requestTier;
  openPaymentModal({ kind: 'membership', tier, name: `${tier} Membership`, amount: `$${MEMBERSHIP_TIERS[tier].price.toFixed(2)}` });
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

// ================= PAYMENT MODAL (shared: membership + course purchases) =================
let PAYMENT_METHODS = [];
let currentPaymentRequest = null;

const payModal = document.getElementById('payModal');
const payForm = document.getElementById('payForm');
const payMethodSelect = document.getElementById('payMethod');
const payInstructions = document.getElementById('payInstructions');
const payError = document.getElementById('payError');

async function openPaymentModal(request) {
  currentPaymentRequest = request;
  payError.hidden = true;
  payForm.reset();
  document.getElementById('payModalTitle').textContent = `Pay for ${request.name}`;
  document.getElementById('payModalAmount').textContent = `Amount due: ${request.amount}`;

  if (!PAYMENT_METHODS.length) PAYMENT_METHODS = await apiFetch('/payment-methods');
  payMethodSelect.innerHTML = PAYMENT_METHODS.map((m) => `<option value="${m.name}">${m.name}</option>`).join('');
  updatePayInstructions();

  payModal.hidden = false;
}

function updatePayInstructions() {
  const method = PAYMENT_METHODS.find((m) => m.name === payMethodSelect.value);
  payInstructions.textContent = method ? method.instructions : 'Select a payment method above.';
}
payMethodSelect.addEventListener('change', updatePayInstructions);

function closePaymentModal() { payModal.hidden = true; currentPaymentRequest = null; }
document.getElementById('payModalClose').addEventListener('click', closePaymentModal);
payModal.addEventListener('click', (e) => { if (e.target === payModal) closePaymentModal(); });

payForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentPaymentRequest) return;
  const fileInput = document.getElementById('payProof');
  const file = fileInput.files[0];
  if (!file) return;

  const submitBtn = document.getElementById('paySubmitBtn');
  submitBtn.disabled = true;
  payError.hidden = true;

  try {
    const proofData = new FormData();
    proofData.append('proof', file);
    const { url: proofUrl } = await apiFetch('/payments/upload-proof', { method: 'POST', body: proofData });

    const body = {
      method: payMethodSelect.value,
      proofUrl,
      reference: document.getElementById('payReference').value || undefined,
    };

    if (currentPaymentRequest.kind === 'membership') {
      body.tier = currentPaymentRequest.tier;
      await apiFetch('/membership/request', { method: 'POST', body: JSON.stringify(body) });
      await loadPendingMembershipRequests();
      renderMembership();
    } else {
      await apiFetch(`/courses/${currentPaymentRequest.courseId}/purchase-request`, { method: 'POST', body: JSON.stringify(body) });
      await loadEnrollments();
    }

    await loadPayments();
    closePaymentModal();
    alert('Payment submitted! An admin will review your proof and approve access shortly.');
  } catch (err) {
    payError.textContent = err.message;
    payError.hidden = false;
  } finally {
    submitBtn.disabled = false;
  }
});

async function loadPayments() {
  const all = await apiFetch('/payments');
  const mine = all.filter((p) => p.student === session.name);
  document.getElementById('paymentRows').innerHTML = mine.length ? mine.map((p) => `
    <tr><td>${new Date(p.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' })}</td><td>${p.course}</td><td>${p.method}</td><td>${p.amount}</td>
    <td><span class="badge-pill ${p.status === 'Paid' ? 'pill-success' : p.status === 'Pending' ? 'pill-warn' : 'pill-danger'}">${p.status}</span></td><td><a href="#" class="btn btn-outline btn-sm">Invoice</a></td></tr>`).join('')
    : '<tr><td colspan="6"><p class="empty-note">No payments yet.</p></td></tr>';
}
loadPayments();

// ================= SIGNALS =================
const BROKER_OPTIONS = ['Exness', 'PU Prime', 'JustMarkets'];

function renderSignalsForm() {
  return `
    <p class="mini-note" style="margin-bottom:16px;">Deposit $300 or more with any one of our partner brokers, then upload your proof below. Once verified, we'll unlock our private signals group for you.</p>
    <form id="signalsForm" class="form-grid">
      <div class="form-field"><label>Broker</label>
        <select id="sigBroker" required>${BROKER_OPTIONS.map((b) => `<option value="${b}">${b}</option>`).join('')}</select>
      </div>
      <div class="form-field"><label>Deposit Amount (USD)</label><input type="number" id="sigAmount" min="300" step="1" placeholder="300" required></div>
      <div class="form-field full"><label>Upload Deposit Proof</label><input type="file" id="sigProof" accept="image/*" required></div>
      <p class="modal-error" id="sigError" hidden></p>
      <div class="form-field full"><button type="submit" class="btn btn-gold" id="sigSubmitBtn">Submit for Review</button></div>
    </form>`;
}

async function loadSignals() {
  const data = await apiFetch('/signals/mine');
  const el = document.getElementById('signalsContent');

  if (data.signalsAccess) {
    el.innerHTML = `
      <p class="mini-note" style="margin-bottom:16px;">✅ Verified — you're in! Tap below to join the private signals group.</p>
      <a href="${data.channelUrl}" target="_blank" rel="noopener" class="btn btn-gold">Join Signals Group</a>`;
    return;
  }

  if (data.latest && data.latest.status === 'Pending') {
    el.innerHTML = `<p class="mini-note">⏳ Your ${data.latest.amount} deposit proof (${data.latest.broker}) is pending review. We'll unlock the signals group as soon as it's verified.</p>`;
    return;
  }

  el.innerHTML = renderSignalsForm();
  if (data.latest && data.latest.status === 'Rejected') {
    document.getElementById('signalsContent').insertAdjacentHTML('afterbegin', '<p class="modal-error" style="margin-bottom:16px;">Your last submission couldn\'t be verified. Please double-check the deposit and try again.</p>');
  }

  document.getElementById('signalsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('sigProof');
    const file = fileInput.files[0];
    if (!file) return;
    const submitBtn = document.getElementById('sigSubmitBtn');
    const errorEl = document.getElementById('sigError');
    submitBtn.disabled = true;
    errorEl.hidden = true;
    try {
      const proofData = new FormData();
      proofData.append('proof', file);
      const { url: proofUrl } = await apiFetch('/signals/upload-proof', { method: 'POST', body: proofData });
      await apiFetch('/signals/submit', {
        method: 'POST',
        body: JSON.stringify({ broker: document.getElementById('sigBroker').value, amount: document.getElementById('sigAmount').value, proofUrl }),
      });
      await loadSignals();
      alert('Proof submitted! We\'ll review it and unlock the signals group shortly.');
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
      submitBtn.disabled = false;
    }
  });
}
loadSignals();

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
