// Student Dashboard — every panel is backed by the real API.

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
  aitrade: 'AI Trade', feedback: 'Feedback', community: 'Community', support: 'Support', profile: 'Profile & Security',
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

// Land back on the right panel after a Stripe Checkout redirect, and let the
// student know what happened — the actual membership grant/expiry update
// comes from the webhook (async), so "success" here just means checkout
// completed, not that the database update has necessarily landed yet.
(function handleStripeRedirect() {
  const params = new URLSearchParams(window.location.search);
  const stripeResult = params.get('stripe');
  const panel = params.get('panel');
  if (panel) showPanel(panel);
  if (stripeResult === 'success') {
    alert('Payment received! Your membership will activate within a few seconds — refresh this page if it doesn\'t show as active yet.');
  } else if (stripeResult === 'cancelled') {
    alert('Checkout was cancelled — no payment was made.');
  }
  if (stripeResult) {
    params.delete('stripe');
    params.delete('panel');
    const newUrl = window.location.pathname + (params.toString() ? `?${params}` : '');
    window.history.replaceState({}, '', newUrl);
  }
})();

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
    <a href="watch.html?courseId=${c.id}" class="btn btn-outline btn-sm">${c.completed ? 'Review' : 'Resume'}</a>
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
  document.getElementById('enrolledCount').textContent = `${data.accessible.length} active`;
  document.getElementById('courseRecommended').innerHTML = data.notAccessible.length
    ? data.notAccessible.map((c) => `
    <div class="course-row">
      <div class="thumb">${c.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</div>
      <div class="course-row-info"><strong>${c.name}</strong><span class="progress-pct">${c.price} · or included with Community membership</span></div>
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

// The Community membership unlocks all live classes; Free members see them locked.
function liveRow(l, unlocked) {
  return `<div class="list-item"><span class="list-dot"></span><div><strong>${l.title}</strong><span>${l.when} · ${l.platform}</span></div>
    ${unlocked
      ? '<span class="badge-pill pill-success">Unlocked</span>'
      : '<button class="btn btn-outline btn-sm" data-upgrade-tier="Community">Members Only</button>'}
  </div>`;
}

async function loadLiveClasses() {
  const classes = await apiFetch('/live-classes');
  const unlocked = tierRank(session.membershipTier || 'Free') >= tierRank('Community');
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

async function loadAnnouncements() {
  const announcements = await apiFetch('/announcements');
  document.getElementById('overviewAnnouncements').innerHTML = announcements.length ? announcements.slice(0, 5).map((a) => `
    <div class="list-item"><span class="list-dot"></span><div><strong>${a.title}</strong><span>${new Date(a.sentAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></div></div>`).join('')
    : '<p class="empty-note">No announcements yet.</p>';
}
loadAnnouncements();

async function loadOverviewStats() {
  const [enrollments, certificates, payments] = await Promise.all([
    apiFetch('/enrollments/mine'), apiFetch('/certificates/mine'), apiFetch('/payments?mine=true'),
  ]);
  const pendingCount = payments.filter((p) => p.status === 'Pending').length;
  const stats = [
    { icon: '🎓', num: enrollments.accessible.length, label: 'Enrolled Courses' },
    { icon: '📜', num: certificates.length, label: 'Certificates Earned' },
    { icon: '💎', num: session.membershipTier || 'Free', label: 'Membership Tier' },
    { icon: '⏳', num: pendingCount, label: 'Pending Requests' },
  ];
  document.getElementById('overviewStats').innerHTML = stats.map((s) => `
    <div class="stat-card"><div class="stat-top"><span class="ic">${s.icon}</span></div><span class="num">${s.num}</span><span class="label">${s.label}</span></div>`).join('');
}
loadOverviewStats();

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

  const isMember = tierRank(myTier) >= tierRank('Community');
  document.getElementById('downloadList').innerHTML = all.map((d) => {
    const isFree = d.tier === 'Free';
    const label = isFree ? 'Free' : 'Community';
    const unlocked = isFree || isMember;
    return `
    <div class="download-tile">
      <div class="dt-top"><h4>${d.name}</h4><span class="badge-pill ${isFree ? 'pill-success' : 'pill-warn'}">${label}</span></div>
      <p class="meta">${d.type} · ${d.size} · ${d.version}</p>
      ${d.href
        ? `<a href="${d.href}" class="btn btn-gold btn-sm">Open</a>`
        : unlocked
          ? `<a href="${MEDIA_BASE}${d.filePath}" class="btn btn-gold btn-sm" download>Download</a>`
          : `<button class="btn btn-outline btn-sm" data-upgrade-tier="Community">🔒 Requires Community</button>`}
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
const VIP_TELEGRAM_URL = 'https://t.me/Moneymagnet2026';
let pendingMembershipRequests = [];
let myVipBookings = [];

async function loadVipBookings() {
  myVipBookings = await apiFetch('/vip-bookings/mine');
}

function vipStatusNote() {
  const pending = myVipBookings.find((b) => b.status === 'Pending');
  const confirmed = myVipBookings.find((b) => b.status === 'Confirmed' && new Date(b.requestedAt) > new Date());
  const fmt = (d) => new Date(d).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  if (confirmed) return `<p class="mini-note">✅ Confirmed: <strong>${fmt(confirmed.requestedAt)}</strong></p>`;
  if (pending) return `<p class="mini-note">⏳ Requested: <strong>${fmt(pending.requestedAt)}</strong> — awaiting confirmation.</p>`;
  return '';
}

function renewalNoticeHtml() {
  if (!session || session.membershipTier !== 'Community' || !session.membershipExpiresAt) return '';
  const daysRemaining = Math.round((new Date(session.membershipExpiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (daysRemaining > 3) return '';
  const overdueDays = -daysRemaining;
  return `<div class="card"><p class="mini-note">${daysRemaining < 0
    ? `⚠️ Your $10/month Community membership expired ${overdueDays} day${overdueDays === 1 ? '' : 's'} ago — renew below to keep your access.`
    : `⏳ Your $10/month Community membership renews in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} — renew below to avoid losing access.`}</p></div>`;
}

function communityPriceLabel() {
  const price = currentPrice('Community');
  const tier = MEMBERSHIP_TIERS.Community;
  const onOffer = tier.originalPrice != null && price < tier.originalPrice;
  return onOffer ? `$${price} / month (was $${tier.originalPrice})` : `$${price} / month`;
}

function offerLabel(offer, suffix) {
  const price = offerPrice(offer);
  const onOffer = offer.originalPrice != null && price < offer.originalPrice;
  return onOffer ? `$${price}${suffix} (was $${offer.originalPrice}${suffix})` : `$${price}${suffix}`;
}

function renderMembership() {
  const myTier = (session && session.membershipTier) || 'Free';
  document.getElementById('currentTierLabel').textContent = myTier === 'Community' ? 'Community' : 'Free';

  const pending = pendingMembershipRequests[0];
  document.getElementById('pendingRequestNote').innerHTML = (pending
    ? `<div class="card"><p class="mini-note">⏳ Your request for <strong>${pending.course}</strong> is pending admin approval.</p></div>`
    : '') + renewalNoticeHtml();

  const isMember = myTier === 'Community';
  const hasPending = pendingMembershipRequests.some((p) => p.course === 'Community Membership');
  let communityAction;
  if (isMember) communityAction = '<button class="btn btn-outline btn-sm" disabled>Current Plan</button>';
  else if (hasPending) communityAction = '<button class="btn btn-outline btn-sm" disabled>Request Pending</button>';
  else communityAction = '<button class="btn btn-gold btn-sm" data-request-tier="Community">Join Community</button>';

  const vipHasPending = myVipBookings.some((b) => b.status === 'Pending');
  const vipAction = vipHasPending
    ? '<button class="btn btn-outline btn-sm" disabled>Request Pending</button>'
    : '<button class="btn btn-gold btn-sm" id="vipBookBtn">Book a Session</button>';

  document.getElementById('membershipPlans').innerHTML = `
    <div class="download-tile">
      <div class="dt-top"><h4>Community Membership</h4><span class="badge-pill pill-warn">${communityPriceLabel()}</span></div>
      <p class="meta">Market analysis · Priority support · Trading signals · All indicators &amp; tools · Live classes &amp; course access</p>
      ${communityAction}
    </div>
    <div class="download-tile">
      <div class="dt-top"><h4>Trading Course</h4><span class="badge-pill pill-warn">${offerLabel(COURSE_OFFER, ' one-time')}</span></div>
      <p class="meta"><strong>$${offerPrice(COURSE_OFFER)} one-time</strong> — full course &amp; certificate, learning access only (no ongoing support).<br><strong>Or $75 to start + $10 / month</strong> — ongoing course &amp; support; $10 due on the 1st of each month from your second month, uploaded as proof on Telegram for continuous access.</p>
      <button class="btn btn-gold btn-sm" data-goto-courses>View Course</button>
    </div>
    <div class="download-tile">
      <div class="dt-top"><h4>VIP Coaching</h4><span class="badge-pill pill-warn">${offerLabel(VIP_OFFER, ' / hour')}</span></div>
      <p class="meta">1-on-1 mindset &amp; psychology coaching · $150 package available</p>
      ${vipStatusNote()}
      ${vipAction}
    </div>`;
}

document.getElementById('membershipPlans').addEventListener('click', async (e) => {
  const gotoCourses = e.target.closest('button[data-goto-courses]');
  if (gotoCourses) { showPanel('courses'); return; }
  if (e.target.closest('#vipBookBtn')) {
    document.getElementById('vipForm').reset();
    document.getElementById('vipError').hidden = true;
    document.getElementById('vipModal').hidden = false;
    return;
  }
  const btn = e.target.closest('button[data-request-tier]');
  if (!btn) return;
  btn.disabled = true;
  try {
    const { url } = await apiFetch('/stripe/create-checkout-session', { method: 'POST', body: JSON.stringify({ kind: 'membership' }) });
    window.location.href = url;
  } catch (err) {
    alert(err.message);
    btn.disabled = false;
  }
});

document.getElementById('vipModalClose').addEventListener('click', () => { document.getElementById('vipModal').hidden = true; });
document.getElementById('vipModal').addEventListener('click', (e) => { if (e.target.id === 'vipModal') document.getElementById('vipModal').hidden = true; });

document.getElementById('vipForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const date = document.getElementById('vipDate').value;
  const time = document.getElementById('vipTime').value;
  const notes = document.getElementById('vipNotes').value;
  const errorEl = document.getElementById('vipError');
  const submitBtn = document.getElementById('vipSubmitBtn');
  submitBtn.disabled = true;
  errorEl.hidden = true;
  try {
    const requestedAt = new Date(`${date}T${time}`).toISOString();
    await apiFetch('/vip-bookings', { method: 'POST', body: JSON.stringify({ requestedAt, notes }) });
    await loadVipBookings();
    renderMembership();
    document.getElementById('vipModal').hidden = true;
    alert('Booking requested! We\'ll confirm your session shortly by email.');
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
  }
});

async function loadPendingMembershipRequests() {
  const mine = await apiFetch('/payments?mine=true');
  pendingMembershipRequests = mine.filter((p) => p.status === 'Pending' && p.course.endsWith(' Membership'));
}

async function refreshMembershipTier() {
  const me = await apiFetch('/auth/me');
  session.membershipTier = me.membershipTier;
  session.membershipExpiresAt = me.membershipExpiresAt;
  Auth.updateSession({ membershipTier: me.membershipTier });
  await Promise.all([loadPendingMembershipRequests(), loadVipBookings()]);
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

const COURSE_INSTALLMENT_AMOUNT = '$75.00';
const payPlanField = document.getElementById('payPlanField');

function updatePayAmountForPlan() {
  if (currentPaymentRequest.kind !== 'course') return;
  const plan = document.querySelector('input[name="payPlan"]:checked').value;
  const amount = plan === 'installment' ? COURSE_INSTALLMENT_AMOUNT : currentPaymentRequest.amount;
  document.getElementById('payModalAmount').textContent = `Amount due now: ${amount}`;
}

async function openPaymentModal(request) {
  currentPaymentRequest = request;
  payError.hidden = true;
  payForm.reset();
  document.getElementById('payModalTitle').textContent = `Pay for ${request.name}`;

  if (request.kind === 'course') {
    document.getElementById('payPlanFullLabel').textContent = `Pay in full — ${request.amount}`;
    document.getElementById('payPlanFull').checked = true;
    payPlanField.hidden = false;
    updatePayAmountForPlan();
  } else {
    payPlanField.hidden = true;
    document.getElementById('payModalAmount').textContent = `Amount due: ${request.amount}`;
  }

  if (!PAYMENT_METHODS.length) PAYMENT_METHODS = await apiFetch('/payment-methods');
  payMethodSelect.innerHTML = PAYMENT_METHODS.map((m) => `<option value="${m.name}">${m.name}</option>`).join('');
  updatePayInstructions();

  payModal.hidden = false;
}
document.querySelectorAll('input[name="payPlan"]').forEach((r) => r.addEventListener('change', updatePayAmountForPlan));

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

  const submitBtn = document.getElementById('paySubmitBtn');
  submitBtn.disabled = true;
  payError.hidden = true;

  try {
    const body = {
      method: payMethodSelect.value,
      reference: document.getElementById('payReference').value || undefined,
    };

    if (currentPaymentRequest.kind === 'course') {
      body.plan = document.querySelector('input[name="payPlan"]:checked').value;
    }

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
    alert('Request submitted! Message us on Telegram (@Moneymagnet2026) with your payment proof and we\'ll verify and activate your access shortly.');
  } catch (err) {
    payError.textContent = err.message;
    payError.hidden = false;
  } finally {
    submitBtn.disabled = false;
  }
});

async function loadPayments() {
  const mine = await apiFetch('/payments?mine=true');
  document.getElementById('paymentRows').innerHTML = mine.length ? mine.map((p) => `
    <tr><td>${new Date(p.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' })}</td><td>${p.course}</td><td>${p.method}</td><td>${p.amount}</td>
    <td><span class="badge-pill ${p.status === 'Paid' ? 'pill-success' : p.status === 'Pending' ? 'pill-warn' : 'pill-danger'}">${p.status}</span></td><td><a href="${API_BASE}/payments/${p.id}/invoice?token=${session.token}" target="_blank" class="btn btn-outline btn-sm">Invoice</a></td></tr>`).join('')
    : '<tr><td colspan="6"><p class="empty-note">No payments yet.</p></td></tr>';
}
loadPayments();

// ================= SIGNALS (monthly subscription) =================
async function loadSignals() {
  const data = await apiFetch('/signals/mine');
  const el = document.getElementById('signalsContent');

  if (data.active) {
    const expiry = data.expiresAt ? new Date(data.expiresAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
    el.innerHTML = `
      <div class="stat-card" style="margin-bottom:16px;">
        <span class="num text-gold">${data.daysRemaining} day${data.daysRemaining === 1 ? '' : 's'} left</span>
        <span class="label">Signals subscription active · renews ${expiry}</span>
      </div>
      <p class="mini-note" style="margin-bottom:16px;">✅ You're in! Tap below to open the private signals group. Renew each month (with your Community subscription) to keep access.</p>
      <a href="${data.channelUrl}" target="_blank" rel="noopener" class="btn btn-gold">Join Signals Group</a>`;
    return;
  }

  el.innerHTML = `
    <p class="mini-note" style="margin-bottom:16px;">Live trading signals are included with your <strong>Community membership</strong> ($10/month) — access runs for 30 days per subscription payment. To get started:</p>
    <ol class="signals-steps" style="margin:0 0 18px 20px; color:var(--muted); font-size:.9rem; line-height:1.9;">
      <li>Open an account with any of our <a href="index.html#brokers" target="_blank" rel="noopener">partner brokers</a> using our link.</li>
      <li>Subscribe to <a href="#" data-goto-membership>Community membership</a> ($10/month).</li>
      <li>Message us on Telegram — we'll verify and add you to the private signals group.</li>
    </ol>
    <a href="${data.verifyUrl}" target="_blank" rel="noopener" class="btn btn-gold">Message Us on Telegram</a>`;

  const gotoMembership = el.querySelector('[data-goto-membership]');
  if (gotoMembership) gotoMembership.addEventListener('click', (e) => { e.preventDefault(); showPanel('membership'); });
}
loadSignals();

// ================= AI TRADE =================
const AI_TRADE_BROKERS = ['PU Prime'];

function renderUndertakingGate() {
  const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  return `
    <div style="background:rgba(212,175,55,0.05); border:1px solid rgba(212,175,55,0.3); border-radius:12px; padding:20px; margin-bottom:16px;">
      <h4 style="margin-top:0;">AI Copy Trading Risk Acknowledgement and No-Refund Agreement</h4>
      <p class="mini-note">By joining the AI Copy Trading service, I acknowledge, understand, and agree to the following terms and conditions:</p>
      <ol style="color:var(--muted); font-size:.9rem; line-height:1.8; padding-left:20px;">
        <li><strong>Understanding of Risk</strong> — I understand that forex, commodities, cryptocurrencies, and other financial markets are highly volatile and involve substantial risk. Trading may result in partial or total loss of my invested capital.</li>
        <li><strong>No Guaranteed Returns</strong> — I acknowledge that no guarantees, promises, or assurances have been made regarding profits, returns on investment, or preservation of capital. Past performance is not indicative of future results.</li>
        <li><strong>Independent Decision</strong> — I confirm that I am voluntarily choosing to participate in the AI Copy Trading service after conducting my own research (DYOR). I understand that all trading decisions ultimately remain my responsibility.</li>
        <li><strong>Acceptance of Losses</strong> — I understand that losses are a normal part of trading and accept full responsibility for any financial losses incurred while using the AI Copy Trading service.</li>
        <li><strong>No Refund Policy</strong> — I acknowledge and agree that all payments made for AI Copy Trading services, subscriptions, setup fees, or related services are final and non-refundable, regardless of trading performance, profits, losses, market conditions, or my decision to discontinue the service.</li>
        <li><strong>No Liability</strong> — I agree not to hold VR Money Magnet, its founder, employees, affiliates, partners, or representatives liable for any financial loss, missed opportunities, indirect damages, or any other consequences arising from participation in the AI Copy Trading service.</li>
        <li><strong>Financial Responsibility</strong> — I confirm that I am using funds that I can afford to risk and that participation in AI Copy Trading will not cause financial hardship.</li>
        <li><strong>Educational Purpose</strong> — I understand that the information, support, and guidance provided are for educational and informational purposes only and do not constitute financial, investment, or legal advice.</li>
        <li><strong>Agreement</strong> — By signing this undertaking, I confirm that I have read, understood, and voluntarily accepted all the above terms and conditions without coercion.</li>
      </ol>
      <div class="table-wrap" style="margin:16px 0;"><table class="dash-table">
        <tbody>
          <tr><td>Full Name</td><td>${session.name}</td></tr>
          <tr><td>Email</td><td>${session.email}</td></tr>
          <tr><td>Date</td><td>${today}</td></tr>
        </tbody>
      </table></div>
      <p class="mini-note">I declare that I have read this undertaking in full, understand the risks associated with AI Copy Trading, and voluntarily agree to participate. I understand that there are no guaranteed returns, capital is at risk, and no refunds will be provided under any circumstances.</p>
    </div>
    <form id="undertakingForm" class="form-grid">
      <div class="form-field full">
        <label style="display:flex;align-items:flex-start;gap:8px;">
          <input type="checkbox" id="undertakingCheckbox" required style="width:auto;margin-top:4px;">
          <span class="mini-note">I have read, understood, and voluntarily accept all the terms above.</span>
        </label>
      </div>
      <p class="modal-error" id="undertakingError" hidden></p>
      <div class="form-field full"><button type="submit" class="btn btn-gold" id="undertakingSubmitBtn">I Agree &amp; Continue</button></div>
    </form>`;
}

function renderAiTradeForm() {
  return `
    <p class="mini-note" style="margin-bottom:16px;">Open a <strong>Cent / USDC-Cent account</strong> with <strong>PU Prime</strong> using our link, deposit a minimum of <strong>$200 USDC</strong>, submit the form below, then message us on Telegram — we'll verify and show you how to link your account to our AI Trade system.</p>
    <div class="form-field full" style="margin-bottom:16px;">
      <a href="https://www.puprime.partners/forex-trading-account/?affid=NzM4OTQ1Mw==" target="_blank" rel="noopener sponsored" class="btn btn-outline btn-sm">Open PU Prime Account</a>
    </div>
    <form id="aiTradeForm" class="form-grid">
      <div class="form-field"><label>Broker</label>
        <select id="atBroker" required>${AI_TRADE_BROKERS.map((b) => `<option value="${b}">${b}</option>`).join('')}</select>
      </div>
      <div class="form-field"><label>Trading Account Number</label><input type="text" id="atAccountNumber" placeholder="Your Cent / USDC-Cent account #" required></div>
      <div class="form-field"><label>Deposit Amount (USDC)</label><input type="number" id="atAmount" min="200" step="1" placeholder="200" required></div>
      <div class="form-field full">
        <p class="mini-note">After submitting, message <a href="https://t.me/Moneymagnet2026" target="_blank" rel="noopener">@Moneymagnet2026</a> on Telegram with your account &amp; deposit proof — we'll show you how to link.</p>
      </div>
      <p class="modal-error" id="atError" hidden></p>
      <div class="form-field full"><button type="submit" class="btn btn-gold" id="atSubmitBtn">Submit for Review</button></div>
    </form>`;
}

async function loadAiTrade() {
  const data = await apiFetch('/ai-trade/mine');
  const el = document.getElementById('aiTradeContent');

  if (!data.undertakingAccepted) {
    el.innerHTML = renderUndertakingGate();
    document.getElementById('undertakingForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('undertakingSubmitBtn');
      const errorEl = document.getElementById('undertakingError');
      submitBtn.disabled = true;
      errorEl.hidden = true;
      try {
        await apiFetch('/ai-trade/accept-undertaking', { method: 'POST' });
        await loadAiTrade();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
        submitBtn.disabled = false;
      }
    });
    return;
  }

  if (data.aiTradeConnected) {
    el.innerHTML = `<p class="mini-note">✅ You're connected! Your account is live in our AI Trade system.</p>`;
    return;
  }

  if (data.latest && data.latest.status === 'Pending') {
    el.innerHTML = `<p class="mini-note">⏳ Your AI Trade request (${data.latest.broker}, ${data.latest.amount}) is pending review. Make sure you've messaged us on <a href="${data.verifyUrl}" target="_blank" rel="noopener">Telegram</a> with your proof.</p>`;
    return;
  }

  if (data.latest && data.latest.status === 'Approved') {
    el.innerHTML = `<p class="mini-note">✅ Your submission has been verified — we're now connecting your account to AI Trade. This can take a little time.</p>`;
    return;
  }

  el.innerHTML = renderAiTradeForm();
  if (data.latest && data.latest.status === 'Rejected') {
    document.getElementById('aiTradeContent').insertAdjacentHTML('afterbegin', '<p class="modal-error" style="margin-bottom:16px;">Your last submission couldn\'t be verified. Please double-check your account and try again.</p>');
  }

  document.getElementById('aiTradeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('atSubmitBtn');
    const errorEl = document.getElementById('atError');
    submitBtn.disabled = true;
    errorEl.hidden = true;
    try {
      await apiFetch('/ai-trade/submit', {
        method: 'POST',
        body: JSON.stringify({
          broker: document.getElementById('atBroker').value,
          accountNumber: document.getElementById('atAccountNumber').value,
          amount: document.getElementById('atAmount').value,
        }),
      });
      await loadAiTrade();
      alert('Submitted! Message us on Telegram (@Moneymagnet2026) with your proof and we\'ll connect you to AI Trade shortly.');
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
      submitBtn.disabled = false;
    }
  });
}
loadAiTrade();

// ================= FEEDBACK / TESTIMONIALS =================
function renderFeedbackForm() {
  return `
    <p class="mini-note" style="margin-bottom:16px;">Tell us about your experience — what worked, what you achieved, anything you'd tell a friend considering the academy. If approved, we may feature it on our website or social media (using your name).</p>
    <form id="feedbackForm" class="form-grid">
      <div class="form-field full"><label>Rating</label>
        <select id="fbRating" required>
          <option value="5">★★★★★ (5)</option>
          <option value="4">★★★★☆ (4)</option>
          <option value="3">★★★☆☆ (3)</option>
          <option value="2">★★☆☆☆ (2)</option>
          <option value="1">★☆☆☆☆ (1)</option>
        </select>
      </div>
      <div class="form-field full"><label>Your feedback</label><textarea id="fbText" placeholder="Share your experience..." required></textarea></div>
      <p class="modal-error" id="fbError" hidden></p>
      <div class="form-field full"><button type="submit" class="btn btn-gold" id="fbSubmitBtn">Submit Feedback</button></div>
    </form>`;
}

function feedbackHistoryHtml(items) {
  if (!items.length) return '';
  const map = { Pending: 'pill-warn', Approved: 'pill-success', Rejected: 'pill-danger' };
  return `<div class="table-wrap" style="margin-top:24px;"><table class="dash-table">
    <thead><tr><th>Date</th><th>Feedback</th><th>Rating</th><th>Status</th></tr></thead>
    <tbody>${items.map((t) => `
      <tr><td>${new Date(t.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' })}</td>
        <td>${t.text}</td><td>${'★'.repeat(t.rating)}${'☆'.repeat(5 - t.rating)}</td>
        <td><span class="badge-pill ${map[t.status]}">${t.status}</span></td></tr>`).join('')}
    </tbody></table></div>`;
}

async function loadFeedback() {
  const mine = await apiFetch('/testimonials/mine');
  const el = document.getElementById('feedbackContent');
  const hasPending = mine.some((t) => t.status === 'Pending');

  el.innerHTML = (hasPending ? '<p class="mini-note">⏳ Your feedback is pending admin review.</p>' : renderFeedbackForm()) + feedbackHistoryHtml(mine);

  const form = document.getElementById('feedbackForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('fbSubmitBtn');
      const errorEl = document.getElementById('fbError');
      submitBtn.disabled = true;
      errorEl.hidden = true;
      try {
        await apiFetch('/testimonials', {
          method: 'POST',
          body: JSON.stringify({ text: document.getElementById('fbText').value, rating: document.getElementById('fbRating').value }),
        });
        await loadFeedback();
        alert('Thank you! Your feedback has been submitted for review.');
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
        submitBtn.disabled = false;
      }
    });
  }
}
loadFeedback();

document.getElementById('brokerAccounts').innerHTML = ['Exness', 'PU Prime', 'JustMarkets'].map((name) => `
  <div class="course-row"><div class="thumb">${name.split(' ').map((w) => w[0]).join('')}</div><div class="course-row-info"><strong>${name}</strong><span class="progress-pct">Not linked yet</span></div><a href="index.html#brokers" class="btn btn-outline btn-sm">Open Account</a></div>`).join('');

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

// ================= PROFILE & SECURITY =================
async function loadProfile() {
  const me = await apiFetch('/auth/me');
  document.getElementById('profileCountry').value = me.country || '';
  document.getElementById('profilePhone').value = me.phone || '';
  document.getElementById('profileTelegramId').value = me.telegramId || '';
  document.getElementById('profileWhatsapp').value = me.whatsappNumber || '';
}
loadProfile();

document.getElementById('profileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('profileName').value;
  const country = document.getElementById('profileCountry').value;
  const phone = document.getElementById('profilePhone').value;
  const telegramId = document.getElementById('profileTelegramId').value;
  const whatsappNumber = document.getElementById('profileWhatsapp').value;
  await apiFetch('/auth/me', { method: 'PATCH', body: JSON.stringify({ name, country, phone, telegramId, whatsappNumber }) });

  const stored = Auth.updateSession({ name });
  if (stored) {
    document.getElementById('userName').textContent = name;
    document.getElementById('welcomeMsg').textContent = `Welcome back, ${name.split(' ')[0]}!`;
  }
  alert('Profile updated.');
});

document.getElementById('passwordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  try {
    await apiFetch('/auth/password', { method: 'PATCH', body: JSON.stringify({ currentPassword, newPassword }) });
    alert('Password updated.');
    e.target.reset();
  } catch (err) {
    alert(err.message);
  }
});
