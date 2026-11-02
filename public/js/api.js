// public/js/api.js
// Shared helpers: API fetch wrapper, toasts, theme, auth/session utilities.

const IQ = (() => {
  const TOKEN_KEY = 'iq_token';
  const USER_KEY = 'iq_user';
  const ROLE_KEY = 'iq_role';

  // Auth state is tab-scoped. Teacher and student sessions in separate tabs
  // must never overwrite one another on the same origin.
  function getToken() { return sessionStorage.getItem(TOKEN_KEY); }
  function getUser() { try { return JSON.parse(sessionStorage.getItem(USER_KEY)); } catch { return null; } }
  function getRole() { return sessionStorage.getItem(ROLE_KEY); }

  function setSession(token, user, role) {
    // Remove legacy shared localStorage values so an old token cannot be reused.
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(ROLE_KEY);
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    sessionStorage.setItem(ROLE_KEY, role);
  }

  function clearSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(ROLE_KEY);
    // Clean up values written by older versions of IntelliQuiz.
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(ROLE_KEY);
  }

  async function api(path, { method = 'GET', body, isForm = false, auth = true } = {}) {
    const headers = {};
    if (!isForm) headers['Content-Type'] = 'application/json';
    if (auth) {
      const t = getToken();
      if (t) headers['Authorization'] = `Bearer ${t}`;
    }

    const res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined
    });

    let data;
    try { data = await res.json(); } catch { data = { success: false, message: 'Unexpected server response.' }; }

    if (res.status === 401 && auth) {
      clearSession();
      toast('Your session has expired. Please log in again.', 'error');
      setTimeout(() => (window.location.href = '/'), 1200);
    }

    // A 403 is an authorization denial, not proof that the login token is
    // expired. Keep the session intact and show the server's specific message;
    // automatic logout here caused users to get trapped in a login loop.
    if (res.status === 403 && auth && data.code === 'ROLE_FORBIDDEN') {
      data.message = data.message || 'This account cannot access this feature. Please switch to the correct account.';
    }

    if (!res.ok || data.success === false) {
      const err = new Error(data.message || 'Something went wrong.');
      err.data = data;
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // ---------- Toasts ----------
  function ensureToastRegion() {
    let region = document.getElementById('toast-region');
    if (!region) {
      region = document.createElement('div');
      region.id = 'toast-region';
      document.body.appendChild(region);
    }
    return region;
  }

  function toast(message, type = 'info', duration = 4000) {
    const region = ensureToastRegion();
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
    el.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    region.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(16px)';
      el.style.transition = 'all .25s ease';
      setTimeout(() => el.remove(), 260);
    }, duration);
  }

  // ---------- Theme ----------
  function initTheme() {
    const saved = localStorage.getItem('iq_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
  }
  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('iq_theme', next);
    return next;
  }

  // ---------- Auth guards ----------
  function requireRole(role) {
    const currentRole = getRole();
    const token = getToken();
    if (!token || currentRole !== role) {
      window.location.href = '/';
      return false;
    }
    return true;
  }

  function logout() {
    clearSession();
    window.location.href = '/';
  }

  // ---------- Small formatting helpers ----------
  function fmtDuration(seconds) {
    if (seconds == null) return '—';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
    return d.toLocaleString();
  }
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function hideSplash() {
    const splash = document.getElementById('splash');
    if (splash) setTimeout(() => splash.classList.add('hidden'), 350);
  }

  return {
    api, toast, initTheme, toggleTheme, requireRole, logout,
    getToken, getUser, getRole, setSession, clearSession,
    fmtDuration, fmtDate, escapeHtml, hideSplash
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  IQ.initTheme();
  window.addEventListener('load', IQ.hideSplash);
  setTimeout(IQ.hideSplash, 1500); // fallback in case 'load' already fired
});
