// public/js/result.js

document.addEventListener('DOMContentLoaded', async () => {
  if (!IQ.requireRole('student')) return;

  document.getElementById('theme-toggle').textContent = (localStorage.getItem('iq_theme') === 'light') ? '☀️' : '🌙';
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const t = IQ.toggleTheme();
    document.getElementById('theme-toggle').textContent = t === 'light' ? '☀️' : '🌙';
  });
  document.getElementById('logout-btn').addEventListener('click', IQ.logout);

  try {
    const { exam, student, result, breakdown } = await IQ.api('/student-exam/result'+(new URLSearchParams(location.search).get('examId')?'?examId='+encodeURIComponent(new URLSearchParams(location.search).get('examId')):''));

    document.getElementById('score-hero').innerHTML = `
      <div class="score-ring" style="--pct:${result.percentage}">
        <span>${result.percentage}%</span>
      </div>
      <h2>${IQ.escapeHtml(student.name)}</h2>
      <p class="text-muted">${IQ.escapeHtml(exam.title)}${exam.subject ? ' — ' + IQ.escapeHtml(exam.subject) : ''}</p>
      <span class="badge ${result.passed ? 'badge-active' : 'badge-not_started'}" style="font-size:13px;padding:6px 18px;margin-top:10px;display:inline-flex;">
        ${result.passed ? '✓ PASSED' : '✕ NOT PASSED'} — ${result.remarks}
      </span>
      <div class="result-stats">
        <div class="glass-card rstat"><div class="v">${result.score}/${result.totalMarks}</div><div class="l">Score</div></div>
        <div class="glass-card rstat"><div class="v" style="color:var(--green-500)">${result.correct}</div><div class="l">Correct</div></div>
        <div class="glass-card rstat"><div class="v" style="color:var(--red-500)">${result.incorrect}</div><div class="l">Incorrect</div></div>
        <div class="glass-card rstat"><div class="v" style="color:var(--text-muted)">${result.skipped}</div><div class="l">Skipped</div></div>
        <div class="glass-card rstat"><div class="v">${IQ.fmtDuration(result.timeTakenSeconds)}</div><div class="l">Time Taken</div></div>
        <div class="glass-card rstat"><div class="v">#${result.rank}/${result.totalSubmitted}</div><div class="l">Rank</div></div>
      </div>
    `;

    document.getElementById('breakdown-list').innerHTML = breakdown.map((b, i) => {
      const cls = !b.selectedOption ? 'b-skipped' : b.isCorrect ? 'b-correct' : 'b-wrong';
      const statusLabel = !b.selectedOption ? 'Skipped' : b.isCorrect ? 'Correct' : 'Incorrect';
      return `
        <div class="glass-card breakdown-item ${cls}">
          <div class="flex justify-between items-center">
            <strong>Q${i + 1}. ${IQ.escapeHtml(b.questionText)}</strong>
            <span class="text-muted" style="font-size:12px;">${statusLabel}</span>
          </div>
          <div class="mt-8" style="font-size:13.5px;">
            <div>Your answer: <strong>${b.selectedOption ? b.selectedOption.toUpperCase() + '. ' + IQ.escapeHtml(b.options[b.selectedOption]) : '— Not answered'}</strong></div>
            ${!b.isCorrect ? `<div>Correct answer: <strong style="color:var(--green-500)">${b.correctOption.toUpperCase()}. ${IQ.escapeHtml(b.options[b.correctOption])}</strong></div>` : ''}
            ${b.explanation ? `<div class="text-muted mt-8">💡 ${IQ.escapeHtml(b.explanation)}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    IQ.toast(err.message, 'error');
    document.getElementById('score-hero').innerHTML = `<div class="empty-state">${err.message}</div>`;
  }
});
