// public/js/teacher-dashboard.js

document.addEventListener('DOMContentLoaded', async () => {
  if (!IQ.requireRole('teacher')) return;

  const user = IQ.getUser();
  document.getElementById('welcome-text').textContent = `Welcome, ${user.name}`;
  document.getElementById('theme-toggle').textContent = (localStorage.getItem('iq_theme') === 'light') ? '☀️' : '🌙';

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const t = IQ.toggleTheme();
    document.getElementById('theme-toggle').textContent = t === 'light' ? '☀️' : '🌙';
  });
  document.getElementById('logout-btn').addEventListener('click', IQ.logout);

  await loadOverview();
  await loadExams();

  // ---------- Create exam modal ----------
  const modal = document.getElementById('create-modal');
  document.getElementById('create-exam-btn').addEventListener('click', () => modal.style.display = 'flex');
  loadQuestionBankUnits();
  document.getElementById('close-modal').addEventListener('click', () => modal.style.display = 'none');
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

  document.getElementById('ce-negative').addEventListener('change', (e) => {
    document.getElementById('ce-negative-value-wrap').style.display = e.target.checked ? 'block' : 'none';
  });

  document.getElementById('ce-attempt-policy').addEventListener('change', e => { document.getElementById('ce-max-attempts-wrap').style.display = e.target.value === 'multiple' ? 'block' : 'none'; });
  document.getElementById('create-exam-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Creating…';
    try {
      const body = {
        title: document.getElementById('ce-title').value.trim(),
        subject: document.getElementById('ce-subject').value.trim(),
        instructions: document.getElementById('ce-instructions').value.trim(),
        durationMinutes: document.getElementById('ce-duration').value,
        passingMarks: document.getElementById('ce-passing').value,
        questionsPerAttempt: document.getElementById('ce-qpa').value || null,
        startDate: document.getElementById('ce-start-date').value,
        endDate: document.getElementById('ce-end-date').value,
        startTime: document.getElementById('ce-start-time').value,
        endTime: document.getElementById('ce-end-time').value,
        shuffleQuestions: document.getElementById('ce-shuffle-q').checked,
        shuffleOptions: document.getElementById('ce-shuffle-o').checked,
        negativeMarking: document.getElementById('ce-negative').checked,
        negativeMarkValue: document.getElementById('ce-negative-value').value,
        selectedUnits: [...document.getElementById('ce-units').selectedOptions].map(o => o.value),
        attemptPolicy: document.getElementById('ce-attempt-policy').value,
        maxAttempts: document.getElementById('ce-attempt-policy').value === 'multiple' ? document.getElementById('ce-max-attempts').value : 1
      };
      const data = await IQ.api('/exams', { method: 'POST', body });
      IQ.toast(`Exam created! Controller ID: ${data.exam.controller_id}`, 'success', 6000);
      window.location.href = `/teacher/exam.html?id=${data.exam.id}`;
    } catch (err) {
      IQ.toast(err.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Create Exam & Generate Controller ID';
    }
  });
});

async function loadOverview() {
  try {
    const { stats, recentActivity } = await IQ.api('/dashboard/overview');
    const cards = [
      { label: 'Total Students', value: stats.total_students, icon: '👥' },
      { label: 'Total Exams', value: stats.total_exams, icon: '📝' },
      { label: 'Active Exams', value: stats.active_exams, icon: '🟢' },
      { label: 'Completed Exams', value: stats.completed_exams, icon: '✅' },
      { label: 'Total Questions', value: stats.total_questions, icon: '❓' },
      { label: 'Live Participants', value: stats.live_participants, icon: '⚡' },
      { label: 'Average Score', value: `${stats.average_score}%`, icon: '📊' },
      { label: 'Pass Percentage', value: `${stats.pass_percentage}%`, icon: '🎯' }
    ];
    document.getElementById('stat-grid').innerHTML = cards.map(c => `
      <div class="glass-card stat-card">
        <div class="stat-icon">${c.icon}</div>
        <div class="stat-label">${c.label}</div>
        <div class="stat-value">${c.value}</div>
      </div>
    `).join('');

    const panel = document.getElementById('activity-panel');
    if (recentActivity.length === 0) return;
    panel.innerHTML = recentActivity.map(a => `
      <div class="activity-item">
        <div>
          <div style="font-weight:600;">${IQ.escapeHtml(a.student_name)}</div>
          <div class="text-muted" style="font-size:12px;">${IQ.escapeHtml(a.exam_title)}</div>
        </div>
        <span class="badge badge-${a.status}">${a.status.replace('_', ' ')}</span>
      </div>
    `).join('');
  } catch (err) {
    IQ.toast(err.message, 'error');
  }
}

async function loadExams() {
  const grid = document.getElementById('exam-grid');
  try {
    const { exams } = await IQ.api('/exams');
    if (exams.length === 0) {
      grid.innerHTML = `<div class="glass-card empty-state" style="grid-column:1/-1;"><div class="icon">🗂️</div>No exams yet. Click "Create New Exam" to get started.</div>`;
      return;
    }
    grid.innerHTML = exams.map(ex => `
      <div class="glass-card exam-card" onclick="window.location.href='/teacher/exam.html?id=${ex.id}'">
        <div class="top-row">
          <span class="badge badge-${ex.status}">${ex.status}</span>
          <span class="code">${ex.controller_id}</span>
        </div>
        <h3 style="font-size:17px;">${IQ.escapeHtml(ex.title)}</h3>
        <div class="text-muted" style="font-size:13px;">${IQ.escapeHtml(ex.subject || 'No subject set')}</div>
        <div class="exam-meta">
          <span>👥 ${ex.total_students} students</span>
          <span>❓ ${ex.total_questions} questions</span>
          <span>✅ ${ex.submitted_count} submitted</span>
        </div>
      </div>
    `).join('');
  } catch (err) {
    grid.innerHTML = `<div class="glass-card empty-state" style="grid-column:1/-1;">Could not load exams: ${err.message}</div>`;
  }
}

async function loadQuestionBankUnits(){
 const select=document.getElementById('ce-units');if(!select)return;
 try{const r=await IQ.api('/question-bank/units');select.innerHTML=(r.units||[]).map(u=>'<option value="'+IQ.escapeHtml(u.unit)+'">'+IQ.escapeHtml((u.subject?u.subject+' — ':'')+u.unit)+' ('+u.count+')</option>').join('');}catch(e){select.innerHTML='';console.warn('Could not load saved units',e);}
}
