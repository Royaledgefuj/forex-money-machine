// Admin Dashboard — backed by the real Express + SQLite API

const session = Auth.requireRole('admin');

if (session) {
  document.getElementById('userName').textContent = session.name;
  document.getElementById('userEmail').textContent = session.email;
  document.getElementById('userAvatar').textContent = initials(session.name);
}

// ---- Tab navigation ----
const navItems = document.querySelectorAll('.dash-nav-item[data-panel]');
const panels = document.querySelectorAll('.dash-panel[data-panel]');
const topbarTitle = document.getElementById('topbarTitle');
const titleMap = {
  overview: 'Analytics', students: 'Student Management', courses: 'Course Management', live: 'Live Classes',
  downloads: 'Downloads & Tools', announcements: 'Announcements', payments: 'Payments', paymentMethods: 'Payment Methods', signals: 'Signals',
  brokers: 'Broker Referrals', support: 'Support Tickets', activity: 'Activity Log',
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

function initials(name) { return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase(); }
function fmtMoney(n) { return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 }); }
function parseAmount(str) { return Number(String(str).replace(/[^0-9.]/g, '')) || 0; }

async function logActivityLocal(text) {
  const el = document.getElementById('activityRows');
  const row = document.createElement('div');
  row.className = 'list-item';
  row.innerHTML = `<span class="list-dot"></span><div><strong>${text}</strong><span>Just now</span></div>`;
  el.prepend(row);
}

// ================= STUDENTS =================
function statusPill(status) {
  const map = { Active: 'pill-success', Pending: 'pill-warn', Suspended: 'pill-danger' };
  return `<span class="badge-pill ${map[status] || 'pill-muted'}">${status}</span>`;
}
async function loadStudents(filter = '') {
  const students = await apiFetch('/students');
  const rows = students.filter((s) => s.name.toLowerCase().includes(filter.toLowerCase()) || s.email.toLowerCase().includes(filter.toLowerCase()));
  const tierPillClass = { Free: 'pill-muted', Silver: 'pill-muted', Gold: 'pill-warn', Platinum: 'pill-success' };
  document.getElementById('studentRows').innerHTML = rows.map((s) => `
    <tr>
      <td><div class="table-user"><div class="avatar">${initials(s.name)}</div><div><strong>${s.name}</strong><br><span class="mini-note">${s.email}</span></div></div></td>
      <td>${s.coursesCount}</td>
      <td>${new Date(s.joinedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' })}</td>
      <td>${statusPill(s.status)}</td>
      <td><span class="badge-pill ${tierPillClass[s.membershipTier] || 'pill-muted'}">${s.membershipTier || 'Free'}</span></td>
      <td><div class="row-actions">
        ${s.status !== 'Active' ? `<button class="icon-btn" title="Approve / Activate" data-action="approve" data-id="${s.id}">✔</button>` : ''}
        ${s.status !== 'Suspended' ? `<button class="icon-btn" title="Suspend" data-action="suspend" data-id="${s.id}">⏸</button>` : ''}
        <button class="icon-btn" title="Set Membership Tier" data-action="tier" data-id="${s.id}">💎</button>
        <button class="icon-btn danger" title="Delete" data-action="delete" data-id="${s.id}">🗑</button>
      </div></td>
    </tr>`).join('');
  return students;
}
document.getElementById('studentSearch').addEventListener('input', (e) => loadStudents(e.target.value));
document.getElementById('studentRows').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === 'approve') await apiFetch(`/students/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'Active' }) });
  if (action === 'suspend') await apiFetch(`/students/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'Suspended' }) });
  if (action === 'tier') {
    const tier = prompt('Set membership tier (Free, Silver, Gold, Platinum):');
    if (!tier) return;
    if (!['Free', 'Silver', 'Gold', 'Platinum'].includes(tier)) return alert('Must be exactly: Free, Silver, Gold, or Platinum');
    await apiFetch(`/students/${id}`, { method: 'PATCH', body: JSON.stringify({ membershipTier: tier }) });
  }
  if (action === 'delete') {
    if (!confirm('Delete this student? This cannot be undone.')) return;
    await apiFetch(`/students/${id}`, { method: 'DELETE' });
  }
  await Promise.all([loadStudents(document.getElementById('studentSearch').value), loadActivity()]);
});

// ================= COURSES =================
let COURSES = [];
let selectedCourseIndex = null;

async function loadCourses() {
  COURSES = await apiFetch('/courses');
  document.getElementById('courseRows').innerHTML = COURSES.map((c, i) => `
    <tr>
      <td><strong>${c.name}</strong></td>
      <td>${c.category}</td>
      <td>${c.price}</td>
      <td>${c.students.toLocaleString()}</td>
      <td><span class="badge-pill ${c.status === 'Published' ? 'pill-success' : 'pill-muted'}">${c.status}</span></td>
      <td><div class="row-actions">
        <button class="icon-btn" title="Manage Content / Upload Video" data-action="manage" data-i="${i}">🎬</button>
        <button class="icon-btn" title="Edit" data-action="edit" data-i="${i}">✎</button>
        <button class="icon-btn danger" title="Delete" data-action="delete" data-i="${i}">🗑</button>
      </div></td>
    </tr>`).join('');
  renderCourseContent();
  return COURSES;
}

document.getElementById('courseRows').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const i = Number(btn.dataset.i);
  const course = COURSES[i];
  if (btn.dataset.action === 'edit') {
    const newPrice = prompt(`New price for "${course.name}"`, course.price);
    if (newPrice) await apiFetch(`/courses/${course.id}`, { method: 'PATCH', body: JSON.stringify({ price: newPrice }) });
  }
  if (btn.dataset.action === 'delete') {
    if (!confirm(`Delete course "${course.name}"?`)) return;
    await apiFetch(`/courses/${course.id}`, { method: 'DELETE' });
    if (selectedCourseIndex === i) selectedCourseIndex = null;
  }
  if (btn.dataset.action === 'manage') {
    selectedCourseIndex = i;
    renderCourseContent();
    document.getElementById('contentCourseName').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  await Promise.all([loadCourses(), loadActivity()]);
});

document.getElementById('newCourseBtn').addEventListener('click', async () => {
  const name = prompt('New course title:');
  if (!name) return;
  await apiFetch('/courses', { method: 'POST', body: JSON.stringify({ name, category: 'Beginner', price: '$0', status: 'Draft' }) });
  await Promise.all([loadCourses(), loadActivity()]);
});

function renderCourseContent() {
  const nameEl = document.getElementById('contentCourseName');
  const listEl = document.getElementById('lessonList');
  const formEl = document.getElementById('uploadForm');

  if (selectedCourseIndex === null || !COURSES[selectedCourseIndex]) {
    nameEl.textContent = 'Select a course';
    listEl.innerHTML = '<p class="empty-note">Click the 🎬 icon next to a course above to manage its lessons and upload videos.</p>';
    formEl.dataset.disabled = 'true';
    return;
  }

  const course = COURSES[selectedCourseIndex];
  nameEl.textContent = course.name;
  formEl.dataset.disabled = 'false';

  listEl.innerHTML = course.lessons.length ? course.lessons.map((l) => `
    <div class="lesson-item">
      <div class="lesson-ic">🎬</div>
      <div class="lesson-info">
        <strong>${l.title}</strong>
        <span>${l.fileName} · ${l.size} ${l.duration ? '· ' + l.duration : ''}</span>
        <video class="lesson-video-preview" src="${MEDIA_BASE}${l.filePath}" controls preload="metadata"></video>
      </div>
      <button class="icon-btn danger" title="Remove lesson" data-remove="${l.id}">🗑</button>
    </div>`).join('') : '<p class="empty-note">No lessons uploaded yet for this course.</p>';
}

document.getElementById('lessonList').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-remove]');
  if (!btn) return;
  await apiFetch(`/courses/lessons/${btn.dataset.remove}`, { method: 'DELETE' });
  await Promise.all([loadCourses(), loadActivity()]);
});

document.getElementById('uploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (selectedCourseIndex === null) return;
  const course = COURSES[selectedCourseIndex];
  const titleInput = document.getElementById('lessonTitle');
  const fileInput = document.getElementById('lessonVideo');
  const file = fileInput.files[0];
  if (!file) return;

  const progressWrap = document.getElementById('uploadProgressWrap');
  const progressBar = document.getElementById('uploadProgressBar');
  const progressLabel = document.getElementById('uploadProgressLabel');
  const submitBtn = document.getElementById('uploadSubmitBtn');

  progressWrap.hidden = false;
  submitBtn.disabled = true;
  progressBar.style.width = '30%';
  progressLabel.textContent = 'Uploading…';

  const formData = new FormData();
  formData.append('title', titleInput.value);
  formData.append('video', file);

  try {
    await apiFetch(`/courses/${course.id}/lessons`, { method: 'POST', body: formData });
    progressBar.style.width = '100%';
    progressLabel.textContent = 'Uploaded!';
    await Promise.all([loadCourses(), loadActivity()]);
    e.target.reset();
  } catch (err) {
    alert('Upload failed: ' + err.message);
  } finally {
    setTimeout(() => { progressWrap.hidden = true; progressBar.style.width = '0%'; submitBtn.disabled = false; }, 600);
  }
});

// ================= LIVE CLASSES =================
async function loadLive() {
  const live = await apiFetch('/live-classes');
  document.getElementById('liveRows').innerHTML = live.map((l) => `
    <tr><td><strong>${l.title}</strong></td><td>${l.when}</td><td>${l.platform}</td><td>${l.attendees}</td>
    <td><button class="icon-btn danger" data-id="${l.id}">🗑</button></td></tr>`).join('');
  return live;
}
document.getElementById('liveRows').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-id]');
  if (!btn) return;
  await apiFetch(`/live-classes/${btn.dataset.id}`, { method: 'DELETE' });
  await Promise.all([loadLive(), loadActivity()]);
});
document.getElementById('liveForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const inputs = e.target.querySelectorAll('input, select');
  const title = inputs[0].value, date = inputs[1].value, time = inputs[2].value, platform = inputs[3].value;
  await apiFetch('/live-classes', { method: 'POST', body: JSON.stringify({ title, when: `${date} · ${time}`, platform }) });
  await Promise.all([loadLive(), loadActivity()]);
  e.target.reset();
});

// ================= DOWNLOADS & TOOLS =================
let RESOURCES = [];
async function loadResources() {
  RESOURCES = await apiFetch('/resources');
  document.getElementById('resourceRows').innerHTML = RESOURCES.length ? RESOURCES.map((r) => `
    <div class="lesson-item">
      <div class="lesson-ic">⬇️</div>
      <div class="lesson-info">
        <strong>${r.name} <span class="badge-pill pill-warn">${r.tier}</span></strong>
        <span>${r.type} · ${r.version} · ${r.size} · ${r.fileName}</span>
      </div>
      <button class="icon-btn danger" title="Delete" data-id="${r.id}">🗑</button>
    </div>`).join('') : '<p class="empty-note">No downloads uploaded yet.</p>';
}
document.getElementById('resourceRows').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-id]');
  if (!btn) return;
  const resource = RESOURCES.find((r) => r.id === Number(btn.dataset.id));
  if (!confirm(`Delete "${resource.name}"?`)) return;
  await apiFetch(`/resources/${resource.id}`, { method: 'DELETE' });
  await Promise.all([loadResources(), loadActivity()]);
});
document.getElementById('resourceForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fileInput = document.getElementById('resFile');
  const file = fileInput.files[0];
  if (!file) return;
  const submitBtn = document.getElementById('resSubmitBtn');
  submitBtn.disabled = true;
  try {
    const formData = new FormData();
    formData.append('name', document.getElementById('resName').value);
    formData.append('type', document.getElementById('resType').value);
    formData.append('tier', document.getElementById('resTier').value);
    formData.append('version', document.getElementById('resVersion').value);
    formData.append('file', file);
    await apiFetch('/resources', { method: 'POST', body: formData });
    await Promise.all([loadResources(), loadActivity()]);
    e.target.reset();
    document.getElementById('resVersion').value = 'v1.0';
  } catch (err) {
    alert('Upload failed: ' + err.message);
  } finally {
    submitBtn.disabled = false;
  }
});

// ================= ANNOUNCEMENTS =================
async function loadAnnouncements() {
  const announcements = await apiFetch('/announcements');
  document.getElementById('announcementRows').innerHTML = announcements.length ? announcements.map((a) => `
    <div class="list-item"><span class="list-dot"></span><div><strong>${a.title}</strong><span>${new Date(a.sentAt).toLocaleDateString()} · Sent to ${a.audience}</span></div></div>`).join('')
    : '<p class="empty-note">No announcements sent yet.</p>';
}
document.getElementById('announceForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const inputs = e.target.querySelectorAll('input, textarea, select');
  const title = inputs[0].value, message = inputs[1].value, audience = inputs[3].value;
  await apiFetch('/announcements', { method: 'POST', body: JSON.stringify({ title, message, audience }) });
  await Promise.all([loadAnnouncements(), loadActivity()]);
  e.target.reset();
});

// ================= PAYMENTS =================
let PAYMENTS = [];
async function loadPayments() {
  PAYMENTS = await apiFetch('/payments');
  const map = { Paid: 'pill-success', Pending: 'pill-warn', Refunded: 'pill-danger' };
  document.getElementById('txnRows').innerHTML = PAYMENTS.map((t) => `
    <tr><td>${t.student}</td><td>${t.course}</td><td>${t.method}${t.reference ? `<br><span class="mini-note">Ref: ${t.reference}</span>` : ''}</td><td>${t.amount}</td>
      <td>${t.proofUrl ? `<a href="${MEDIA_BASE}${t.proofUrl}" target="_blank" rel="noopener" class="btn btn-outline btn-sm">View</a>` : '—'}</td>
      <td><span class="badge-pill ${map[t.status]}">${t.status}</span></td>
      <td>${t.status === 'Pending' ? `<button class="btn btn-outline btn-sm" data-approve="${t.id}">Approve</button>` : '<button class="btn btn-outline btn-sm">Invoice</button>'}</td></tr>`).join('');
  return PAYMENTS;
}
document.getElementById('txnRows').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-approve]');
  if (!btn) return;
  await apiFetch(`/payments/${btn.dataset.approve}`, { method: 'PATCH', body: JSON.stringify({ status: 'Paid' }) });
  await Promise.all([loadPayments(), loadActivity(), refreshRevenue()]);
});

// ================= PAYMENT METHODS =================
let PAYMENT_METHODS = [];
async function loadPaymentMethods() {
  PAYMENT_METHODS = await apiFetch('/payment-methods');
  document.getElementById('paymentMethodRows').innerHTML = PAYMENT_METHODS.length ? PAYMENT_METHODS.map((m) => `
    <div class="lesson-item">
      <div class="lesson-ic">🏦</div>
      <div class="lesson-info">
        <strong>${m.name} ${m.active ? '<span class="badge-pill pill-success">Active</span>' : '<span class="badge-pill pill-muted">Hidden</span>'}</strong>
        <span>${m.instructions}</span>
      </div>
      <div class="row-actions">
        <button class="icon-btn" title="Edit" data-action="edit" data-id="${m.id}">✎</button>
        <button class="icon-btn" title="${m.active ? 'Hide from students' : 'Show to students'}" data-action="toggle" data-id="${m.id}">${m.active ? '🙈' : '👁'}</button>
        <button class="icon-btn danger" title="Delete" data-action="delete" data-id="${m.id}">🗑</button>
      </div>
    </div>`).join('') : '<p class="empty-note">No payment methods yet. Add one so students can pay you.</p>';
  return PAYMENT_METHODS;
}

const pmForm = document.getElementById('paymentMethodForm');
function resetPmForm() {
  pmForm.reset();
  document.getElementById('pmId').value = '';
  document.getElementById('pmActive').checked = true;
  document.getElementById('pmFormTitle').textContent = 'Add Payment Method';
  document.getElementById('pmSubmitBtn').textContent = 'Add Method';
  document.getElementById('pmCancelBtn').hidden = true;
}

document.getElementById('paymentMethodRows').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const method = PAYMENT_METHODS.find((m) => m.id === Number(btn.dataset.id));
  if (btn.dataset.action === 'edit') {
    document.getElementById('pmId').value = method.id;
    document.getElementById('pmName').value = method.name;
    document.getElementById('pmInstructions').value = method.instructions;
    document.getElementById('pmActive').checked = method.active;
    document.getElementById('pmFormTitle').textContent = `Edit "${method.name}"`;
    document.getElementById('pmSubmitBtn').textContent = 'Save Changes';
    document.getElementById('pmCancelBtn').hidden = false;
    pmForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  if (btn.dataset.action === 'toggle') {
    await apiFetch(`/payment-methods/${method.id}`, { method: 'PATCH', body: JSON.stringify({ active: !method.active }) });
  }
  if (btn.dataset.action === 'delete') {
    if (!confirm(`Delete payment method "${method.name}"?`)) return;
    await apiFetch(`/payment-methods/${method.id}`, { method: 'DELETE' });
  }
  await Promise.all([loadPaymentMethods(), loadActivity()]);
});

document.getElementById('pmCancelBtn').addEventListener('click', resetPmForm);

pmForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('pmId').value;
  const body = JSON.stringify({
    name: document.getElementById('pmName').value,
    instructions: document.getElementById('pmInstructions').value,
    active: document.getElementById('pmActive').checked,
  });
  if (id) await apiFetch(`/payment-methods/${id}`, { method: 'PATCH', body });
  else await apiFetch('/payment-methods', { method: 'POST', body });
  resetPmForm();
  await Promise.all([loadPaymentMethods(), loadActivity()]);
});

// ================= SIGNALS =================
let SIGNAL_PROOFS = [];
async function loadSignals() {
  SIGNAL_PROOFS = await apiFetch('/signals');
  const map = { Approved: 'pill-success', Pending: 'pill-warn', Rejected: 'pill-danger' };
  document.getElementById('signalRows').innerHTML = SIGNAL_PROOFS.length ? SIGNAL_PROOFS.map((s) => `
    <tr><td>${s.user.name}</td><td>${s.broker}</td><td>${s.amount}</td>
      <td><a href="${MEDIA_BASE}${s.proofUrl}" target="_blank" rel="noopener" class="btn btn-outline btn-sm">View</a></td>
      <td><span class="badge-pill ${map[s.status]}">${s.status}</span></td>
      <td><div class="row-actions">
        ${s.status === 'Pending' ? `
          <button class="icon-btn" title="Approve" data-action="approve" data-id="${s.id}">✔</button>
          <button class="icon-btn danger" title="Reject" data-action="reject" data-id="${s.id}">✕</button>` : ''}
        <button class="icon-btn danger" title="Delete" data-action="delete" data-id="${s.id}">🗑</button>
      </div></td></tr>`).join('')
    : '<tr><td colspan="6"><p class="empty-note">No signals submissions yet.</p></td></tr>';
}
document.getElementById('signalRows').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'delete') {
    if (!confirm('Delete this submission?')) return;
    await apiFetch(`/signals/${btn.dataset.id}`, { method: 'DELETE' });
  } else {
    const status = btn.dataset.action === 'approve' ? 'Approved' : 'Rejected';
    await apiFetch(`/signals/${btn.dataset.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
  }
  await Promise.all([loadSignals(), loadActivity()]);
});

// ================= BROKERS =================
let BROKERS = [];
async function loadBrokers() {
  BROKERS = await apiFetch('/brokers');
  document.getElementById('brokerRows').innerHTML = BROKERS.map((b) => `
    <tr><td><strong>${b.name}</strong></td><td>${b.clicks.toLocaleString()}</td><td>${b.regs.toLocaleString()}</td><td>${b.conv}</td><td>${fmtMoney(b.commission)}</td>
    <td><span class="badge-pill ${b.status === 'Active' ? 'pill-success' : 'pill-muted'}">${b.status}</span></td>
    <td><button class="icon-btn danger" title="Remove" data-id="${b.id}">🗑</button></td></tr>`).join('');

  const summary = await apiFetch('/brokers/summary');
  document.getElementById('brokerSummaryStats').innerHTML = `
    <div class="stat-card"><span class="num">${summary.totalClicks.toLocaleString()}</span><span class="label">Total Clicks</span></div>
    <div class="stat-card"><span class="num">${summary.totalRegs.toLocaleString()}</span><span class="label">Total Registrations</span></div>
    <div class="stat-card"><span class="num">${fmtMoney(summary.commissionTotal)}</span><span class="label">Commission Income</span></div>
    <div class="stat-card"><span class="num">${summary.activeBrokers}/${summary.totalBrokers}</span><span class="label">Active Partners</span></div>`;
  return summary;
}
document.getElementById('brokerRows').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-id]');
  if (!btn) return;
  const broker = BROKERS.find((b) => b.id === Number(btn.dataset.id));
  if (!confirm(`Remove broker partner "${broker.name}"?`)) return;
  await apiFetch(`/brokers/${broker.id}`, { method: 'DELETE' });
  await Promise.all([loadBrokers(), loadActivity(), refreshRevenue()]);
});
document.getElementById('newBrokerBtn').addEventListener('click', async () => {
  const name = prompt('New broker name:');
  if (!name) return;
  await apiFetch('/brokers', { method: 'POST', body: JSON.stringify({ name, status: 'Active' }) });
  await Promise.all([loadBrokers(), loadActivity()]);
});

// ================= REVENUE (connects Payments + Broker commissions) =================
async function refreshRevenue() {
  const payments = PAYMENTS.length ? PAYMENTS : await loadPayments();
  const courseSalesRevenue = payments.filter((p) => p.status === 'Paid').reduce((sum, p) => sum + parseAmount(p.amount), 0);
  const brokerSummary = await apiFetch('/brokers/summary');
  const brokerCommissionTotal = brokerSummary.commissionTotal;
  const totalRevenue = courseSalesRevenue + brokerCommissionTotal;

  document.getElementById('statTotalRevenue').textContent = fmtMoney(totalRevenue);
  document.getElementById('statBrokerRevenue').textContent = fmtMoney(brokerCommissionTotal);
  document.getElementById('paymentsTotalRevenue').textContent = fmtMoney(totalRevenue);

  const coursePct = totalRevenue ? Math.round((courseSalesRevenue / totalRevenue) * 100) : 0;
  const brokerPct = 100 - coursePct;
  const html = `
    <div class="traffic-row"><span class="traffic-label">Course Sales</span><div class="traffic-bar"><span style="width:${coursePct}%"></span></div><span class="traffic-pct">${fmtMoney(courseSalesRevenue)}</span></div>
    <div class="traffic-row"><span class="traffic-label">Broker Commissions</span><div class="traffic-bar"><span style="width:${brokerPct}%"></span></div><span class="traffic-pct">${fmtMoney(brokerCommissionTotal)}</span></div>`;
  document.getElementById('revenueBreakdown').innerHTML = html;
  document.getElementById('revenueBreakdownPayments').innerHTML = html;
}

// ================= SUPPORT TICKETS =================
async function loadTickets() {
  const tickets = await apiFetch('/tickets');
  document.getElementById('supportRows').innerHTML = tickets.map((t) => `
    <tr><td>${t.student}</td><td>${t.subject}</td><td>${new Date(t.date).toLocaleDateString()}</td>
    <td><span class="badge-pill ${t.status === 'Open' ? 'pill-warn' : 'pill-success'}">${t.status}</span></td>
    <td>${t.status === 'Open' ? `<button class="btn btn-outline btn-sm" data-id="${t.id}">Mark Resolved</button>` : '—'}</td></tr>`).join('');
}
document.getElementById('supportRows').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-id]');
  if (!btn) return;
  await apiFetch(`/tickets/${btn.dataset.id}`, { method: 'PATCH' });
  await Promise.all([loadTickets(), loadActivity()]);
});

// ================= ACTIVITY LOG =================
async function loadActivity() {
  const activity = await apiFetch('/activity');
  document.getElementById('activityRows').innerHTML = activity.map((a) => `
    <div class="list-item"><span class="list-dot"></span><div><strong>${a.text}</strong><span>${new Date(a.createdAt).toLocaleString()}</span></div></div>`).join('');
}

// ================= Popular courses (derived from real course.students) =================
async function renderPopularCourses() {
  const sorted = [...COURSES].sort((a, b) => b.students - a.students).slice(0, 4);
  document.getElementById('popularCourses').innerHTML = sorted.map((c) => `
    <div class="list-item"><span class="list-dot"></span><div><strong>${c.name}</strong><span>${c.students.toLocaleString()} students enrolled</span></div></div>`).join('');
}

// ================= Illustrative-only (no backing model yet) =================
const SALES = [
  { m: 'Feb', v: 52 }, { m: 'Mar', v: 61 }, { m: 'Apr', v: 58 }, { m: 'May', v: 70 }, { m: 'Jun', v: 76 }, { m: 'Jul', v: 84 },
];
const maxSale = Math.max(...SALES.map((s) => s.v));
document.getElementById('salesChart').innerHTML = SALES.map((s) => `
  <div class="bar-col">
    <span class="bar-value">$${s.v}k</span>
    <div class="bar" style="height:${(s.v / maxSale) * 100}%"></div>
    <span class="bar-label">${s.m}</span>
  </div>`).join('');
const TRAFFIC = [
  { label: 'YouTube', pct: 38 }, { label: 'Instagram', pct: 24 }, { label: 'Direct', pct: 18 }, { label: 'Google', pct: 12 }, { label: 'Referral', pct: 8 },
];
document.getElementById('trafficSources').innerHTML = TRAFFIC.map((t) => `
  <div class="traffic-row"><span class="traffic-label">${t.label}</span><div class="traffic-bar"><span style="width:${t.pct}%"></span></div><span class="traffic-pct">${t.pct}%</span></div>`).join('');

// ================= Boot =================
(async function init() {
  try {
    await Promise.all([loadStudents(), loadCourses(), loadLive(), loadResources(), loadAnnouncements(), loadPayments(), loadPaymentMethods(), loadSignals(), loadBrokers(), loadTickets(), loadActivity()]);
    await Promise.all([refreshRevenue(), renderPopularCourses()]);
  } catch (err) {
    console.error('Failed to load dashboard data:', err);
    alert('Could not load dashboard data. Is the API server running on http://localhost:4000?');
  }
})();
