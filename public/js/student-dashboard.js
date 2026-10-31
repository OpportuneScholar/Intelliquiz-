// public/js/student-dashboard.js

document.addEventListener('DOMContentLoaded', async () => {
  if (!IQ.requireRole('student')) return;

  const user = IQ.getUser();
  document.getElementById('welcome-text').textContent = `Hi, ${user.name}`;
  document.getElementById('theme-toggle').textContent = (localStorage.getItem('iq_theme') === 'light') ? '☀️' : '🌙';
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const t = IQ.toggleTheme();
    document.getElementById('theme-toggle').textContent = t === 'light' ? '☀️' : '🌙';
  });
  document.getElementById('logout-btn').addEventListener('click', IQ.logout);

  try {
    const { student, exam, submission } = await IQ.api('/student-exam/status');

    document.getElementById('exam-title-h').textContent = exam.title;
    document.getElementById('exam-subject-p').textContent = exam.subject || '';
    document.getElementById('p-name').textContent = student.name;
    document.getElementById('p-roll').textContent = student.rollNumber;
    document.getElementById('p-exam').textContent = exam.title;
    document.getElementById('p-duration').textContent = `${exam.durationMinutes} minutes`;
    document.getElementById('p-marks').textContent = exam.totalMarks;
    document.getElementById('p-passing').textContent = exam.passingMarks;

    const body = document.getElementById('status-body');

    if (submission.status === 'submitted') {
      body.innerHTML = `
        <span class="badge badge-submitted" style="font-size:13px;padding:6px 16px;">Already Submitted</span>
        <p class="text-muted mt-16">You have already submitted this examination. Reattempt is not allowed.</p>
        <button class="btn btn-primary mt-16" onclick="window.location.href='/student/result.html'">View My Result</button>
      `;
    } else if (exam.status !== 'active') {
      body.innerHTML = `
        <span class="badge badge-draft" style="font-size:13px;padding:6px 16px;">Not Active</span>
        <p class="text-muted mt-16">Your teacher has not activated this exam yet. Please check back later.</p>
      `;
    } else if (submission.status === 'in_progress') {
      body.innerHTML = `
        <span class="badge badge-in_progress" style="font-size:13px;padding:6px 16px;">In Progress</span>
        <p class="text-muted mt-16">You have an exam in progress. Resume where you left off.</p>
        <button class="btn btn-primary mt-16" onclick="window.location.href='/student/take-exam.html'">Resume Exam</button>
      `;
    } else {
      body.innerHTML = `
        <span class="badge badge-active" style="font-size:13px;padding:6px 16px;">Ready to Start</span>
        ${exam.instructions ? `<p class="text-muted mt-16" style="text-align:left; white-space:pre-line;">${IQ.escapeHtml(exam.instructions)}</p>` : ''}
        <p class="text-muted mt-16">You can attempt this exam only once. Once submitted, it cannot be reopened.</p>
        <button class="btn btn-primary mt-16" onclick="window.location.href='/student/take-exam.html'">Start Exam</button>
      `;
    }
  } catch (err) {
    IQ.toast(err.message, 'error');
  }
});
