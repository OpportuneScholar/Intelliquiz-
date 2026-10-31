// public/js/login.js

document.addEventListener('DOMContentLoaded', () => {
  // If already logged in, redirect straight to the right dashboard.
  const role = IQ.getRole();
  if (role === 'teacher') return (window.location.href = '/teacher/dashboard.html');
  if (role === 'student') return (window.location.href = '/student/dashboard.html');

  // ---------- Tabs ----------
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      showPanel(`${btn.dataset.role}-login`);
    });
  });

  function showPanel(name) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    const el = document.getElementById(`panel-${name}`);
    if (el) el.classList.add('active');
    const role = name.split('-')[0];
    tabBtns.forEach(b => b.classList.toggle('active', b.dataset.role === role));
  }

  document.querySelectorAll('[data-show]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      showPanel(link.dataset.show);
    });
  });

  // ---------- Password show/hide ----------
  document.querySelectorAll('.input-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.toggle);
      const isPw = input.type === 'password';
      input.type = isPw ? 'text' : 'password';
      btn.textContent = isPw ? 'HIDE' : 'SHOW';
    });
  });

  // ---------- Teacher login ----------
  document.getElementById('form-teacher-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Logging in…';
    try {
      const email = document.getElementById('t-login-email').value.trim();
      const password = document.getElementById('t-login-password').value;
      const data = await IQ.api('/teacher/login', { method: 'POST', body: { email, password }, auth: false });
      IQ.setSession(data.token, data.user, 'teacher');
      IQ.toast(data.message, 'success');
      setTimeout(() => (window.location.href = '/teacher/dashboard.html'), 500);
    } catch (err) {
      IQ.toast(err.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Log In';
    }
  });

  // ---------- Teacher register ----------
  document.getElementById('form-teacher-register').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Creating account…';
    try {
      const body = {
        name: document.getElementById('t-reg-name').value.trim(),
        institution: document.getElementById('t-reg-institution').value.trim(),
        email: document.getElementById('t-reg-email').value.trim(),
        password: document.getElementById('t-reg-password').value
      };
      const data = await IQ.api('/teacher/register', { method: 'POST', body, auth: false });
      IQ.setSession(data.token, data.user, 'teacher');
      IQ.toast(data.message, 'success');
      setTimeout(() => (window.location.href = '/teacher/dashboard.html'), 500);
    } catch (err) {
      IQ.toast(err.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Create Teacher Account';
    }
  });

  // ---------- Student: preview exam on controller ID blur ----------
  const previewBox = document.getElementById('exam-preview');
  document.getElementById('s-reg-controller').addEventListener('blur', async (e) => {
    const id = e.target.value.trim().toUpperCase();
    if (!id) return previewBox.classList.remove('show');
    try {
      const data = await IQ.api(`/student/verify-controller/${encodeURIComponent(id)}`, { auth: false });
      previewBox.innerHTML = `📘 <strong>${IQ.escapeHtml(data.exam.title)}</strong>${data.exam.subject ? ' — ' + IQ.escapeHtml(data.exam.subject) : ''}`;
      previewBox.classList.add('show');
    } catch (err) {
      previewBox.textContent = err.message;
      previewBox.classList.add('show');
    }
  });

  // ---------- Student register ----------
  document.getElementById('form-student-register').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Registering…';
    try {
      const body = {
        controllerId: document.getElementById('s-reg-controller').value.trim().toUpperCase(),
        name: document.getElementById('s-reg-name').value.trim(),
        rollNumber: document.getElementById('s-reg-roll').value.trim(),
        email: document.getElementById('s-reg-email').value.trim(),
        password: document.getElementById('s-reg-password').value
      };
      const data = await IQ.api('/student/register', { method: 'POST', body, auth: false });
      IQ.toast(data.message, 'success');
      showPanelExternal('student-login');
      document.getElementById('s-login-controller').value = body.controllerId;
      document.getElementById('s-login-roll').value = body.rollNumber;
    } catch (err) {
      IQ.toast(err.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Register for Exam';
    }
  });

  function showPanelExternal(name) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`panel-${name}`).classList.add('active');
    const role = name.split('-')[0];
    tabBtns.forEach(b => b.classList.toggle('active', b.dataset.role === role));
  }

  // ---------- Student login ----------
  document.getElementById('form-student-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Logging in…';
    try {
      const body = {
        controllerId: document.getElementById('s-login-controller').value.trim().toUpperCase(),
        rollNumber: document.getElementById('s-login-roll').value.trim(),
        password: document.getElementById('s-login-password').value
      };
      const data = await IQ.api('/student/login', { method: 'POST', body, auth: false });
      IQ.setSession(data.token, data.user, 'student');
      IQ.toast(data.message, 'success');
      setTimeout(() => (window.location.href = '/student/dashboard.html'), 500);
    } catch (err) {
      IQ.toast(err.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Log In to Exam';
    }
  });
});
