// Forex Money Machine Academy — real API-backed authentication

const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:4000/api'
  : '/api';
const MEDIA_BASE = API_BASE.replace(/\/api$/, '');
const AUTH_KEY = 'fmm_session';

const MEMBERSHIP_TIERS = {
  Free: { rank: 0, price: 0 },
  Community: { rank: 1, price: 10 },
};
function tierRank(tier) {
  return MEMBERSHIP_TIERS[tier] ? MEMBERSHIP_TIERS[tier].rank : 0;
}

const Auth = {
  async login(email, password) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return this.setSession(data);
  },
  async register(name, email, password) {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Registration failed');
    }
    const data = await res.json();
    return this.setSession(data);
  },
  loginDemo(role) {
    return role === 'admin' ? this.login('admin@fmm.com', 'admin123') : this.login('student@fmm.com', 'student123');
  },
  setSession(data) {
    const session = { token: data.token, ...data.user };
    localStorage.setItem(AUTH_KEY, JSON.stringify(session));
    return session;
  },
  getSession() {
    try {
      return JSON.parse(localStorage.getItem(AUTH_KEY));
    } catch (e) {
      return null;
    }
  },
  logout() {
    localStorage.removeItem(AUTH_KEY);
  },
  requireRole(role) {
    const session = this.getSession();
    if (!session || session.role !== role) {
      window.location.href = 'login.html';
      return null;
    }
    return session;
  },
};

// Fetch wrapper that attaches the JWT and redirects to login on 401.
async function apiFetch(path, options = {}) {
  const session = Auth.getSession();
  const headers = { ...(options.headers || {}) };
  if (session && session.token) headers.Authorization = `Bearer ${session.token}`;
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    Auth.logout();
    window.location.href = 'login.html';
    throw new Error('Session expired');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed (${res.status})`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// Swap the header "Log In" button for a "Dashboard" link when a session exists.
function renderAuthNav() {
  const slot = document.getElementById('authNavSlot');
  if (!slot) return;
  const session = Auth.getSession();
  if (session) {
    const dashboardHref = session.role === 'admin' ? 'dashboard-admin.html' : 'dashboard-student.html';
    slot.innerHTML = `
      <a href="${dashboardHref}" class="btn btn-ghost">Dashboard</a>
      <a href="#" class="btn btn-gold" id="logoutBtn">Log Out</a>
    `;
    document.getElementById('logoutBtn').addEventListener('click', (e) => {
      e.preventDefault();
      Auth.logout();
      window.location.href = 'index.html';
    });
  }
}

document.addEventListener('DOMContentLoaded', renderAuthNav);
