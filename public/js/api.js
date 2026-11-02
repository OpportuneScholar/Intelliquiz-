// public/js/api.js
// Shared helpers: role-isolated API authentication, toasts, theme and formatting.

const IQ = (() => {
  const TOKEN_KEY = 'iq_token';
  const USER_KEY = 'iq_user';
  const ROLE_KEY = 'iq_role';
  const TOKENS_KEY = 'iq_tokens';
  const USERS_KEY = 'iq_users';

  function readMap(key) { try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { return {}; } }
  function getRole() { return localStorage.getItem(ROLE_KEY); }
  function getToken(role = roleForPath(window.location.pathname)) {
    const tokens = readMap(TOKENS_KEY);
    if (role && tokens[role]) return tokens[role];
    return role && getRole() === role ? localStorage.getItem(TOKEN_KEY) : null;
  }
  function getUser(role = roleForPath(window.location.pathname)) {
    const users = readMap(USERS_KEY);
    if (role && users[role]) return users[role];
    if (role && getRole() === role) { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } }
    return null;
  }
  function setSession(token, user, role) {
    const tokens = readMap(TOKENS_KEY), users = readMap(USERS_KEY);
    tokens[role] = token; users[role] = user;
    localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    // Keep legacy keys for older pages while role-specific keys remain authoritative.
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    localStorage.setItem(ROLE_KEY, role);
  }
  function clearSession(role) {
    if (role) {
      const tokens = readMap(TOKENS_KEY), users = readMap(USERS_KEY);
      delete tokens[role]; delete users[role];
      localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
      if (getRole() === role) {
        const nextRole = Object.keys(tokens)[0] || null;
        if (nextRole) {
          localStorage.setItem(ROLE_KEY, nextRole);
          localStorage.setItem(TOKEN_KEY, tokens[nextRole]);
          localStorage.setItem(USER_KEY, JSON.stringify(users[nextRole] || null));
        } else {
          localStorage.removeItem(ROLE_KEY); localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY);
        }
      }
      return;
    }
    [TOKEN_KEY, USER_KEY, ROLE_KEY, TOKENS_KEY, USERS_KEY].forEach(k => localStorage.removeItem(k));
  }

  function roleForPath(path) {
    if (/^\/student(?:\/|[-?]|$)/i.test(path)) return 'student';
    if (/^\/(?:teacher|dashboard|exams|question-bank|questions)(?:\/|[-?]|$)/i.test(path)) return 'teacher';
    return getRole();
  }

  async function api(path, { method = 'GET', body, isForm = false, auth = true } = {}) {
    const headers = {};
    if (!isForm) headers['Content-Type'] = 'application/json';
    const requestRole = roleForPath(path);
    if (auth) {
      const token = getToken(requestRole);
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`/api${path}`, {
      method, headers,
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined
    });
    let data;
    try { data = await res.json(); } catch { data = { success: false, message: 'Unexpected server response.' }; }

    // Only a genuine authentication failure invalidates the token for this role.
    // A 403 role/permission denial must be shown to the user, not force-logout.
    if (res.status === 401 && auth) {
      clearSession(requestRole);
      toast(data.message || 'Your session has expired. Please log in again.', 'error');
      setTimeout(() => (window.location.href = '/'), 1200);
    }
    if (!res.ok || data.success === false) {
      const err = new Error(data.message || 'Something went wrong.');
      err.data = data; err.status = res.status; err.code = data.code;
      throw err;
    }
    return data;
  }

  function ensureToastRegion() {
    let region = document.getElementById('toast-region');
    if (!region) { region = document.createElement('div'); region.id = 'toast-region'; document.body.appendChild(region); }
    return region;
  }
  function toast(message, type = 'info', duration = 4000) {
    const region = ensureToastRegion(), el = document.createElement('div');
    el.className = `toast ${type}`;
    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
    const label = document.createElement('span'); label.textContent = icon;
    const text = document.createElement('span'); text.textContent = String(message || '');
    el.append(label, text); region.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(16px)'; el.style.transition = 'all .25s ease'; setTimeout(() => el.remove(), 260); }, duration);
  }
  function initTheme() { document.documentElement.setAttribute('data-theme', localStorage.getItem('iq_theme') || 'dark'); }
  function toggleTheme() {
    const next = (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next); localStorage.setItem('iq_theme', next); return next;
  }
  function requireRole(role) {
    const token = getToken(role), user = getUser(role);
    if (!token) { window.location.href = '/'; return false; }
    localStorage.setItem(ROLE_KEY, role);
    localStorage.setItem(TOKEN_KEY, token);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    return true;
  }
  function logout() { clearSession(roleForPath(window.location.pathname)); window.location.href = '/'; }
  function fmtDuration(seconds) { if (seconds == null) return '—'; return `${Math.floor(seconds / 60)}m ${seconds % 60}s`; }
  function fmtDate(iso) { if (!iso) return '—'; const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z'); return d.toLocaleString(); }
  function escapeHtml(str) { if (str == null) return ''; return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
  function hideSplash() { const splash = document.getElementById('splash'); if (splash) setTimeout(() => splash.classList.add('hidden'), 350); }

  return { api, toast, initTheme, toggleTheme, requireRole, logout, getToken, getUser, getRole, setSession, clearSession, fmtDuration, fmtDate, escapeHtml, hideSplash };
})();

document.addEventListener('DOMContentLoaded', () => {
  IQ.initTheme(); window.addEventListener('load', IQ.hideSplash); setTimeout(IQ.hideSplash, 1500);
});
