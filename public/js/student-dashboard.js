document.addEventListener('DOMContentLoaded', async () => {
  if (!IQ.requireRole('student')) return;
  const $ = id => document.getElementById(id);
  const user = IQ.getUser() || {};
  let selectedExamId = new URLSearchParams(location.search).get('examId') || user.examId || null;
  let performanceHistory = { summary: {}, exams: [], attempts: [] };

  $('welcome-text').textContent = user.name ? 'Hi, ' + user.name : 'Student';
  $('welcome-name').textContent = user.name || 'Student';
  $('theme-toggle').textContent = localStorage.getItem('iq_theme') === 'light' ? '☀️' : '🌙';
  $('theme-toggle').addEventListener('click', () => { $('theme-toggle').textContent = IQ.toggleTheme() === 'light' ? '☀️' : '🌙'; });
  $('logout-btn').addEventListener('click', IQ.logout);

  function set(id, value) {
    if ($(id)) $(id).textContent = value == null || value === '' ? '—' : value;
  }
  function section(name) {
    document.querySelectorAll('.student-section').forEach(element => element.classList.toggle('active', element.id === name));
    document.querySelectorAll('[data-section]').forEach(element => element.classList.toggle('active', element.dataset.section === name));
  }
  document.querySelectorAll('[data-section]').forEach(element => element.addEventListener('click', () => section(element.dataset.section)));
  $('retry-btn').addEventListener('click', load);
  $('history-search').addEventListener('input', renderHistory);
  $('history-status-filter').addEventListener('change', renderHistory);
  $('history-export').addEventListener('click', exportHistory);

  $('join-exam-form').addEventListener('submit', async event => {
    event.preventDefault();
    const code = $('join-controller-id').value.trim().toUpperCase();
    try {
      const joined = await IQ.api('/student/join', { method: 'POST', body: { controllerId: code } });
      selectedExamId = joined.exam.id;
      history.replaceState({}, '', '?examId=' + encodeURIComponent(selectedExamId));
      $('join-message').textContent = joined.message || 'Examination added.';
      IQ.toast('Examination added to your dashboard.', 'success');
      await load();
    } catch (error) {
      $('join-message').textContent = error.message;
      IQ.toast(error.message, 'error');
    }
  });

  await load();

  async function load() {
    $('load-error').hidden = true;
    $('dashboard-content').hidden = false;
    try {
      const list = await IQ.api('/student/exams');
      const exams = list.exams || [];
      if (!selectedExamId && exams.length) selectedExamId = exams[0].id;

      const holder = $('joined-exams');
      holder.innerHTML = exams.length
        ? exams.map(exam => '<button class="btn btn-ghost btn-sm" data-exam-id="' + IQ.escapeHtml(exam.id) + '" style="margin:4px">' + IQ.escapeHtml(exam.title) + ' · ' + IQ.escapeHtml(exam.controllerId) + '</button>').join('')
        : '<p class="text-muted">No exams joined yet. Enter the Controller ID above to join your first examination.</p>';
      holder.querySelectorAll('[data-exam-id]').forEach(button => button.addEventListener('click', () => {
        selectedExamId = button.dataset.examId;
        history.replaceState({}, '', '?examId=' + encodeURIComponent(selectedExamId));
        section('overview');
        load();
      }));

      try {
        performanceHistory = await IQ.api('/student-exam/history');
      } catch (historyError) {
        performanceHistory = { summary: {}, exams: [], attempts: [] };
        $('exam-history-list').innerHTML = '<p class="text-muted">Exam history is temporarily unavailable: ' + IQ.escapeHtml(historyError.message) + '</p>';
        $('analytics-panel').innerHTML = '<p class="text-muted">Analytics could not be loaded: ' + IQ.escapeHtml(historyError.message) + '</p>';
      }
      renderHistory();
      renderAnalytics();

      if (!selectedExamId) {
        set('welcome-name', user.name);
        set('welcome-subtitle', 'Join an examination using the Controller ID provided by your teacher.');
        set('p-name', user.name); set('p-roll', user.rollNumber); set('p-email', user.email);
        set('stat-status', 'Not joined'); set('stat-total', '—'); set('stat-score', '—');
        $('exam-badge').textContent = 'No exam selected';
        $('status-banner').textContent = 'You have not joined an examination yet. Enter your teacher’s Controller ID above to get started.';
        $('exam-actions').innerHTML = '';
        set('exam-title', 'No examination selected'); set('exam-subject', '');
        set('exam-detail-title', '—'); set('exam-detail-subject', '');
        set('p-controller', '—'); set('p-exam', '—'); set('p-duration', '—'); set('p-marks', '—'); set('p-passing', '—'); set('p-attempt', '—');
        return;
      }

      const data = await IQ.api('/student-exam/status?examId=' + encodeURIComponent(selectedExamId));
      const student = data.student || {}, exam = data.exam || {}, submission = data.submission || {};
      set('welcome-name', student.name || user.name);
      set('welcome-subtitle', exam.subject ? 'Your ' + exam.subject + ' examination at a glance.' : 'Your examination overview.');
      set('exam-title', exam.title); set('exam-subject', exam.subject);
      set('exam-detail-title', exam.title); set('exam-detail-subject', exam.subject);
      set('p-name', student.name || user.name); set('p-roll', student.rollNumber || user.rollNumber);
      set('p-email', student.email || user.email); set('p-controller', exam.controllerId);
      set('p-registered', student.registeredAt ? new Date(student.registeredAt).toLocaleDateString() : null);
      set('p-exam', exam.title); set('p-duration', exam.durationMinutes != null ? exam.durationMinutes + ' minutes' : null);
      set('p-marks', exam.totalMarks); set('p-passing', exam.passingMarks); set('p-attempt', submission.status);
      set('stat-total', exam.totalMarks);

      const latestAttempt = (performanceHistory.attempts || []).find(item => item.examId === exam.id && item.status === 'submitted');
      const percentage = latestAttempt?.percentage;
      const scoreText = latestAttempt ? latestAttempt.score + ' / ' + latestAttempt.totalMarks : '—';
      set('stat-status', submission.status === 'submitted' ? 'Submitted' : submission.status === 'in_progress' ? 'In progress' : exam.status === 'active' ? 'Ready' : 'Not active');
      set('stat-score', scoreText);
      $('exam-badge').textContent = submission.status === 'submitted' ? 'Submitted' : submission.status === 'in_progress' ? 'In progress' : exam.status === 'active' ? 'Ready' : 'Not active';

      if (!exam.id) {
        $('status-banner').textContent = 'Join an examination using its Controller ID, or choose one from your exam list.';
        $('exam-actions').innerHTML = '';
        $('exam-badge').textContent = 'No exam selected';
      } else if (submission.status === 'submitted') {
        const canRetry = Number(data.attemptsUsed || 1) < Number(exam.maxAttempts || 1);
        $('status-banner').innerHTML = '<strong>Examination submitted</strong><p class="text-muted">Latest score: ' + IQ.escapeHtml(scoreText) + (percentage != null ? ' (' + Number(percentage).toFixed(1) + '%)' : '') + '. Attempt ' + (submission.attemptNumber || 1) + ' of ' + (exam.maxAttempts || 1) + '.</p>';
        $('exam-actions').innerHTML = '<a class="btn btn-ghost" href="/student/result.html?examId=' + encodeURIComponent(exam.id) + '">View latest result</a>' + (canRetry ? '<a class="btn btn-primary" href="/student/take-exam.html?examId=' + encodeURIComponent(exam.id) + '">Start next attempt</a>' : '');
      } else if (submission.status === 'in_progress') {
        $('status-banner').innerHTML = '<strong>Your examination is in progress</strong><p class="text-muted">Continue your saved attempt. Previous answers are retained.</p>';
        $('exam-actions').innerHTML = '<a class="btn btn-primary" href="/student/take-exam.html?examId=' + encodeURIComponent(exam.id) + '">Resume examination</a>';
      } else if (exam.status === 'active') {
        $('status-banner').innerHTML = '<strong>You are ready to begin</strong><p class="text-muted">Review the instructions before starting. Allowed attempts: ' + (exam.maxAttempts || 1) + '.</p>';
        $('exam-actions').innerHTML = '<a class="btn btn-primary" href="/student/take-exam.html?examId=' + encodeURIComponent(exam.id) + '">Start examination</a>';
      } else {
        $('status-banner').innerHTML = '<strong>Examination not active yet</strong><p class="text-muted">Your teacher has not activated this examination.</p>';
        $('exam-actions').innerHTML = '';
      }
    } catch (error) {
      $('dashboard-content').hidden = true;
      $('load-error').hidden = false;
      set('error-message', error.message || 'Unable to load dashboard.');
      IQ.toast(error.message || 'Unable to load dashboard data.', 'error');
      console.error('Student dashboard API error', error);
    }
  }

  function renderHistory() {
    const container = $('exam-history-list');
    if (!container) return;
    const attempts = performanceHistory.attempts || [];
    const search = $('history-search').value.trim().toLowerCase();
    const status = $('history-status-filter').value;
    const filtered = attempts.filter(item =>
      (!status || item.status === status) &&
      (!search || [item.examTitle, item.subject, item.controllerId].some(value => String(value || '').toLowerCase().includes(search)))
    );
    if (!filtered.length) {
      container.innerHTML = '<div class="text-muted">' + (attempts.length ? 'No attempts match the selected filter.' : 'No exam attempts yet. Join an exam using the Controller ID above.') + '</div>';
      return;
    }
    container.innerHTML = filtered.map(item => {
      const submitted = item.status === 'submitted';
      const statusText = submitted ? 'Submitted' : item.status === 'in_progress' ? 'In progress' : 'Joined · Not started';
      const score = submitted ? item.score + ' / ' + item.totalMarks : '—';
      const performance = submitted && item.percentage != null ? Number(item.percentage).toFixed(1) + '%' : '—';
      const resultLink = submitted ? '<a class="btn btn-ghost btn-sm" href="/student/result.html?examId=' + encodeURIComponent(item.examId) + '&attemptId=' + encodeURIComponent(item.id) + '">Review result</a>' : item.status === 'in_progress' ? '<a class="btn btn-primary btn-sm" href="/student/take-exam.html?examId=' + encodeURIComponent(item.examId) + '">Resume</a>' : '';
      return '<article class="glass-card history-card"><div class="flex justify-between items-center" style="gap:12px;flex-wrap:wrap"><div><strong>' + IQ.escapeHtml(item.examTitle) + '</strong><div class="history-meta"><span>' + IQ.escapeHtml(item.subject || 'General') + '</span><span>Controller: ' + IQ.escapeHtml(item.controllerId) + '</span><span>Attempt ' + item.attemptNumber + '</span></div></div><span class="badge">' + statusText + '</span></div><div class="history-metrics"><div class="history-metric"><small>Score</small><strong>' + score + '</strong></div><div class="history-metric"><small>Percentage</small><strong>' + performance + '</strong></div><div class="history-metric"><small>Correct / Wrong</small><strong>' + (submitted ? item.correct + ' / ' + item.incorrect : '—') + '</strong></div><div class="history-metric"><small>Attempt date</small><strong>' + formatDate(item.attemptedAt) + '</strong></div></div><div class="qb-actions" style="margin-top:12px">' + resultLink + '</div></article>';
    }).join('');
  }

  function renderAnalytics() {
    const container = $('analytics-panel');
    if (!container) return;
    const summary = performanceHistory.summary || {};
    const exams = performanceHistory.exams || [];
    const submitted = Number(summary.submittedAttempts || 0);
    container.innerHTML =
      '<div class="analytics-kpis">' +
        kpi('Exams attempted', summary.attemptedExams || 0) +
        kpi('Submitted attempts', submitted) +
        kpi('Average score', summary.averagePercentage == null ? '—' : Number(summary.averagePercentage).toFixed(1) + '%') +
        kpi('Best score', summary.bestPercentage == null ? '—' : Number(summary.bestPercentage).toFixed(1) + '%') +
      '</div>' +
      '<h3>Performance by examination</h3>' +
      (exams.length ? exams.map(exam => {
        const average = exam.averagePercentage == null ? null : Number(exam.averagePercentage);
        const best = exam.bestPercentage == null ? null : Number(exam.bestPercentage);
        return '<article class="glass-card exam-performance"><div class="flex justify-between items-center" style="gap:10px;flex-wrap:wrap"><div><strong>' + IQ.escapeHtml(exam.title) + '</strong><div class="history-meta">' + IQ.escapeHtml(exam.subject || 'General') + ' · ' + exam.submittedAttempts + ' submitted / ' + exam.attempts + ' attempts</div></div><strong>' + (average == null ? 'No result yet' : average.toFixed(1) + '% avg') + '</strong></div><div class="performance-track"><div class="performance-fill" style="width:' + Math.max(0,Math.min(100,average || 0)) + '%"></div></div><div class="history-meta" style="margin-top:9px"><span>Best: ' + (best == null ? '—' : best.toFixed(1) + '%') + '</span><span>Latest: ' + formatDate(exam.latestAttemptAt) + '</span></div></article>';
      }).join('') : '<p class="text-muted">Your exam-wise performance will appear here after you start or submit examinations.</p>') +
      '<div class="history-meta" style="margin-top:14px"><span>Correct answers: ' + (summary.totalCorrect || 0) + '</span><span>Incorrect: ' + (summary.totalIncorrect || 0) + '</span><span>Skipped: ' + (summary.totalSkipped || 0) + '</span></div>';
  }

  function kpi(label, value) {
    return '<div class="analytics-kpi"><small>' + label + '</small><strong>' + value + '</strong></div>';
  }
  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
  }
  function exportHistory() {
    const headers = ['Exam','Subject','Controller ID','Attempt','Status','Score','Total Marks','Percentage','Correct','Incorrect','Skipped','Attempted At'];
    const rows = (performanceHistory.attempts || []).map(item => [item.examTitle,item.subject,item.controllerId,item.attemptNumber,item.status,item.score,item.totalMarks,item.percentage,item.correct,item.incorrect,item.skipped,item.attemptedAt]);
    const csv = [headers,...rows].map(row => row.map(value => '"' + String(value ?? '').replace(/"/g,'""') + '"').join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = 'intelliquiz-student-exam-history.csv'; link.click(); URL.revokeObjectURL(url);
  }
});
