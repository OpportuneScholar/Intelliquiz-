// public/js/take-exam.js

let examData = null;      // { questions, durationMinutes, startedAt, submissionId, title }
let currentIndex = 0;
let timerInterval = null;
let remainingSeconds = 0;
let hasSubmitted = false;

document.addEventListener('DOMContentLoaded', async () => {
  if (!IQ.requireRole('student')) return;

  try {
    const examId=new URLSearchParams(location.search).get('examId')||IQ.getUser()?.examId; const data = await IQ.api('/student-exam/start', { method: 'POST', body: examId?{examId}:{} });
    examData = data;
    currentIndex = 0;
    initTimer();
    renderQuestion();
    renderPalette();
  } catch (err) {
    if (err.data && err.data.locked) {
      document.getElementById('locked-message').textContent = err.message;
      document.getElementById('locked-modal').style.display = 'flex';
    } else {
      IQ.toast(err.message, 'error');
      setTimeout(() => (window.location.href = '/student/dashboard.html'), 1500);
    }
  }

  document.getElementById('prev-btn').addEventListener('click', () => go(currentIndex - 1));
  document.getElementById('next-btn').addEventListener('click', () => go(currentIndex + 1));
  document.getElementById('clear-btn').addEventListener('click', clearResponse);
  document.getElementById('bookmark-btn').addEventListener('click', toggleBookmark);
  document.getElementById('submit-btn').addEventListener('click', openSubmitConfirm);
  document.getElementById('cancel-submit').addEventListener('click', () => document.getElementById('submit-modal').style.display = 'none');
  document.getElementById('confirm-submit').addEventListener('click', doSubmit);
  document.getElementById('fullscreen-btn').addEventListener('click', toggleFullscreen);

  // Warn on attempted navigation away / tab close while exam in progress
  window.addEventListener('beforeunload', (e) => {
    if (!hasSubmitted && examData) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
});

// ---------------- Timer ----------------
function initTimer() {
  const startedAt = new Date(examData.startedAt.includes('T') ? examData.startedAt : examData.startedAt.replace(' ', 'T') + 'Z');
  const totalSeconds = examData.durationMinutes * 60;
  const elapsed = Math.floor((Date.now() - startedAt.getTime()) / 1000);
  remainingSeconds = Math.max(totalSeconds - elapsed, 0);

  updateTimerDisplay();
  timerInterval = setInterval(() => {
    remainingSeconds--;
    updateTimerDisplay();
    if (remainingSeconds <= 0) {
      clearInterval(timerInterval);
      IQ.toast('Time is up! Submitting your exam automatically…', 'info', 3000);
      doSubmit(true);
    }
  }, 1000);
}

function updateTimerDisplay() {
  const el = document.getElementById('timer');
  const m = Math.floor(remainingSeconds / 60);
  const s = remainingSeconds % 60;
  el.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  el.classList.toggle('warn', remainingSeconds <= 300 && remainingSeconds > 60);
  el.classList.toggle('danger', remainingSeconds <= 60);
}

// ---------------- Question rendering ----------------
function renderQuestion() {
  const q = examData.questions[currentIndex];
  document.getElementById('q-progress-text').textContent = `Question ${currentIndex + 1} of ${examData.questions.length}`;
  document.getElementById('question-text').textContent = q.questionText;

  const optsList = document.getElementById('options-list');
  optsList.innerHTML = '';
  if (q.imagePath) {
    const img = document.createElement('img');
    img.src = q.imagePath;
    img.style.cssText = 'max-width:100%;border-radius:10px;margin-bottom:16px;';
    optsList.appendChild(img);
  }
  q.options.forEach(opt => {
    const div = document.createElement('div');
    div.className = 'option-item' + (q.selectedOption === opt.key ? ' selected' : '');
    div.innerHTML = `<span class="option-key">${opt.key.toUpperCase()}</span><span>${IQ.escapeHtml(opt.text)}</span>`;
    div.addEventListener('click', () => selectOption(opt.key));
    optsList.appendChild(div);
  });

  document.getElementById('prev-btn').disabled = currentIndex === 0;
  document.getElementById('next-btn').textContent = currentIndex === examData.questions.length - 1 ? 'Finish Review' : 'Next →';
  document.getElementById('bookmark-btn').textContent = q.isBookmarked ? '★ Bookmarked' : '☆ Bookmark';

  const answered = examData.questions.filter(x => x.selectedOption).length;
  document.getElementById('header-progress-fill').style.width = `${(answered / examData.questions.length) * 100}%`;

  updatePaletteHighlight();
}

function go(index) {
  if (index < 0 || index >= examData.questions.length) return;
  currentIndex = index;
  renderQuestion();
}

function selectOption(key) {
  const q = examData.questions[currentIndex];
  q.selectedOption = key;
  renderQuestion();
  autosave(q.id, { selectedOption: key });
}

function clearResponse() {
  const q = examData.questions[currentIndex];
  q.selectedOption = null;
  renderQuestion();
  autosave(q.id, { selectedOption: '' });
}

function toggleBookmark() {
  const q = examData.questions[currentIndex];
  q.isBookmarked = !q.isBookmarked;
  renderQuestion();
  autosave(q.id, { isBookmarked: q.isBookmarked });
}

let saveTimers = {};
function autosave(questionId, payload) {
  clearTimeout(saveTimers[questionId]);
  saveTimers[questionId] = setTimeout(async () => {
    try {
      await IQ.api('/student-exam/save', { method: 'POST', body: { questionId, examId: examData.examId, ...payload } });
    } catch (err) {
      // Silent fail is acceptable for autosave blips; next save attempt will retry.
      console.warn('Autosave failed:', err.message);
    }
  }, 250);
}

// ---------------- Palette ----------------
function renderPalette() {
  const grid = document.getElementById('palette-grid');
  grid.innerHTML = examData.questions.map((q, i) => `
    <button class="palette-btn" data-index="${i}">${i + 1}</button>
  `).join('');
  grid.querySelectorAll('.palette-btn').forEach(btn => {
    btn.addEventListener('click', () => go(Number(btn.dataset.index)));
  });
  updatePaletteHighlight();
}

function updatePaletteHighlight() {
  document.querySelectorAll('.palette-btn').forEach((btn, i) => {
    const q = examData.questions[i];
    btn.classList.toggle('current', i === currentIndex);
    btn.classList.toggle('answered', !!q.selectedOption);
    btn.classList.toggle('bookmarked', !!q.isBookmarked);
  });
}

// ---------------- Submit ----------------
function openSubmitConfirm() {
  const total = examData.questions.length;
  const answered = examData.questions.filter(q => q.selectedOption).length;
  const skipped = total - answered;
  document.getElementById('submit-summary').textContent =
    `You have answered ${answered} of ${total} questions. ${skipped} question${skipped === 1 ? ' is' : 's are'} unanswered.`;
  document.getElementById('submit-modal').style.display = 'flex';
}

async function doSubmit(isAutoSubmit = false) {
  if (hasSubmitted) return;
  hasSubmitted = true;
  clearInterval(timerInterval);
  document.getElementById('submit-modal').style.display = 'none';

  try {
    await IQ.api('/student-exam/submit', { method: 'POST', body: { examId: examData.examId } });
    IQ.toast(isAutoSubmit ? 'Time expired — your exam was submitted automatically.' : 'Exam submitted successfully!', 'success');
    setTimeout(() => (window.location.href = '/student/result.html?examId='+encodeURIComponent(examData.examId)), 900);
  } catch (err) {
    if (err.data && err.data.locked) {
      window.location.href = '/student/result.html';
    } else {
      IQ.toast(err.message, 'error');
      hasSubmitted = false;
    }
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen();
  }
}
