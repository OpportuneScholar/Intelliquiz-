// Exam focus mode: fullscreen is requested from the student's Start/Resume click
// because browsers do not allow reliable fullscreen entry without a user gesture.
let examData = null;
let currentIndex = 0;
let timerInterval = null;
let remainingSeconds = 0;
let hasSubmitted = false;
let isSubmitting = false;
let navigationGuardActive = false;
let wasFullscreen = false;

document.addEventListener('DOMContentLoaded', () => {
  if (!IQ.requireRole('student')) return;

  const startButton = document.getElementById('start-exam-btn');
  const restoreButton = document.getElementById('restore-fullscreen-btn');
  const continueButton = document.getElementById('continue-without-fullscreen-btn');

  startButton.addEventListener('click', startExam);
  restoreButton.addEventListener('click', restoreFullscreen);
  continueButton.addEventListener('click', () => {
    document.getElementById('fullscreen-warning').style.display = 'none';
    IQ.toast('Exam is continuing outside fullscreen. Avoid leaving this page until submission.', 'warning', 5000);
  });

  document.getElementById('prev-btn').addEventListener('click', () => go(currentIndex - 1));
  document.getElementById('next-btn').addEventListener('click', () => {
    if (examData && currentIndex === examData.questions.length - 1) openSubmitConfirm();
    else go(currentIndex + 1);
  });
  document.getElementById('clear-btn').addEventListener('click', clearResponse);
  document.getElementById('bookmark-btn').addEventListener('click', toggleBookmark);
  document.getElementById('submit-btn').addEventListener('click', openSubmitConfirm);
  document.getElementById('cancel-submit').addEventListener('click', () => document.getElementById('submit-modal').style.display = 'none');
  document.getElementById('confirm-submit').addEventListener('click', () => doSubmit(false));
  document.getElementById('fullscreen-btn').addEventListener('click', toggleFullscreen);

  document.addEventListener('fullscreenchange', () => {
    const active = !!document.fullscreenElement;
    if (active) {
      wasFullscreen = true;
      document.getElementById('fullscreen-warning').style.display = 'none';
    } else if (wasFullscreen && examData && !hasSubmitted) {
      document.getElementById('fullscreen-warning').style.display = 'flex';
      IQ.toast('Fullscreen was exited. Return to fullscreen to continue in focus mode.', 'warning', 5000);
    }
  });

  window.addEventListener('popstate', () => {
    if (!navigationGuardActive || hasSubmitted) return;
    history.pushState({ intelliQuizExamLock: true }, '', location.href);
    IQ.toast('You cannot go back while an examination is in progress. Submit the exam first.', 'warning', 4500);
  });

  window.addEventListener('keydown', event => {
    if (!navigationGuardActive || hasSubmitted) return;
    if (event.altKey && event.key === 'ArrowLeft') {
      event.preventDefault();
      IQ.toast('Back navigation is disabled until you submit the exam.', 'warning', 3500);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigationGuardActive && !hasSubmitted) {
      IQ.toast('You have returned to your examination. Your saved answers are retained.', 'info', 3500);
    }
  });

  window.addEventListener('beforeunload', event => {
    if (navigationGuardActive && !hasSubmitted) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
});

async function startExam() {
  const button = document.getElementById('start-exam-btn');
  button.disabled = true;
  button.textContent = 'Entering exam…';

  // This call must happen directly in the click handler to satisfy browser user-activation rules.
  let enteredFullscreen = false;
  try {
    if (document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
      enteredFullscreen = !!document.fullscreenElement;
    }
  } catch (error) {
    console.info('Fullscreen entry was not permitted by this browser:', error.message);
  }

  if (!enteredFullscreen) {
    IQ.toast('Fullscreen is unavailable in this browser. The exam will continue with navigation protection enabled.', 'warning', 5500);
  }

  try {
    const examId = new URLSearchParams(location.search).get('examId') || IQ.getUser()?.examId;
    const data = await IQ.api('/student-exam/start', { method: 'POST', body: examId ? { examId } : {} });
    examData = data;
    currentIndex = 0;
    document.getElementById('exam-start-modal').style.display = 'none';
    activateNavigationGuard();
    initTimer();
    renderQuestion();
    renderPalette();
    document.getElementById('fullscreen-btn').textContent = document.fullscreenElement ? '⛶ Fullscreen active' : '⛶ Enter fullscreen';
  } catch (error) {
    if (document.fullscreenElement && document.exitFullscreen) {
      try { await document.exitFullscreen(); } catch (_) {}
    }
    if (error.data && error.data.locked) {
      document.getElementById('exam-start-modal').style.display = 'none';
      document.getElementById('locked-message').textContent = error.message;
      document.getElementById('locked-modal').style.display = 'flex';
    } else {
      IQ.toast(error.message, 'error');
      setTimeout(() => { window.location.href = '/student/dashboard.html'; }, 1500);
    }
  } finally {
    button.disabled = false;
    button.textContent = 'Enter Fullscreen & Start';
  }
}

async function restoreFullscreen() {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    }
    if (!document.fullscreenElement) throw new Error('Fullscreen is not supported by this browser.');
    document.getElementById('fullscreen-warning').style.display = 'none';
  } catch (error) {
    IQ.toast(error.message || 'Could not restore fullscreen.', 'error');
  }
}

function activateNavigationGuard() {
  if (navigationGuardActive) return;
  navigationGuardActive = true;
  history.pushState({ intelliQuizExamLock: true }, '', location.href);
}

// ---------------- Timer ----------------
function initTimer() {
  clearInterval(timerInterval);
  const startedAt = new Date(examData.startedAt.includes('T') ? examData.startedAt : examData.startedAt.replace(' ', 'T') + 'Z');
  const totalSeconds = examData.durationMinutes * 60;
  const elapsed = Math.floor((Date.now() - startedAt.getTime()) / 1000);
  remainingSeconds = Math.max(totalSeconds - elapsed, 0);
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    remainingSeconds = Math.max(0, remainingSeconds - 1);
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
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  el.textContent = String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
  el.classList.toggle('warn', remainingSeconds <= 300 && remainingSeconds > 60);
  el.classList.toggle('danger', remainingSeconds <= 60);
}

// ---------------- Question rendering ----------------
function renderQuestion() {
  if (!examData || !examData.questions.length) return;
  const question = examData.questions[currentIndex];
  document.getElementById('q-progress-text').textContent = 'Question ' + (currentIndex + 1) + ' of ' + examData.questions.length;
  document.getElementById('question-text').textContent = question.questionText;
  const optionsList = document.getElementById('options-list');
  optionsList.innerHTML = '';
  if (question.imagePath) {
    const image = document.createElement('img');
    image.src = question.imagePath;
    image.alt = 'Question illustration';
    image.style.cssText = 'max-width:100%;border-radius:10px;margin-bottom:16px;';
    optionsList.appendChild(image);
  }
  question.options.forEach(option => {
    const item = document.createElement('div');
    item.className = 'option-item' + (question.selectedOption === option.key ? ' selected' : '');
    const key = document.createElement('span');
    key.className = 'option-key';
    key.textContent = option.key.toUpperCase();
    const label = document.createElement('span');
    label.textContent = option.text;
    item.append(key, label);
    item.addEventListener('click', () => selectOption(option.key));
    optionsList.appendChild(item);
  });
  document.getElementById('prev-btn').disabled = currentIndex === 0;
  document.getElementById('next-btn').textContent = currentIndex === examData.questions.length - 1 ? 'Finish Review' : 'Next →';
  document.getElementById('bookmark-btn').textContent = question.isBookmarked ? '★ Bookmarked' : '☆ Bookmark';
  const answered = examData.questions.filter(item => item.selectedOption).length;
  document.getElementById('header-progress-fill').style.width = (answered / examData.questions.length) * 100 + '%';
  updatePaletteHighlight();
}
function go(index) {
  if (!examData || index < 0 || index >= examData.questions.length) return;
  currentIndex = index;
  renderQuestion();
}
function selectOption(key) {
  const question = examData.questions[currentIndex];
  question.selectedOption = key;
  renderQuestion();
  autosave(question.id, { selectedOption: key });
}
function clearResponse() {
  const question = examData.questions[currentIndex];
  question.selectedOption = null;
  renderQuestion();
  autosave(question.id, { selectedOption: '' });
}
function toggleBookmark() {
  const question = examData.questions[currentIndex];
  question.isBookmarked = !question.isBookmarked;
  renderQuestion();
  autosave(question.id, { isBookmarked: question.isBookmarked });
}

let saveTimers = {};
let pendingSaves = {};
function autosave(questionId, payload) {
  clearTimeout(saveTimers[questionId]);
  saveTimers[questionId] = setTimeout(async () => {
    const task = IQ.api('/student-exam/save', { method: 'POST', body: { questionId, examId: examData.examId, ...payload } });
    pendingSaves[questionId] = task;
    try { await task; }
    catch (error) { console.warn('Autosave failed:', error.message); }
    finally { if (pendingSaves[questionId] === task) delete pendingSaves[questionId]; }
  }, 250);
}
async function flushPendingSaves() {
  for (const id of Object.keys(saveTimers)) {
    clearTimeout(saveTimers[id]);
    delete saveTimers[id];
    const question = examData.questions.find(item => item.id === id);
    if (question) {
      const payload = { selectedOption: question.selectedOption || '', isBookmarked: !!question.isBookmarked };
      const task = IQ.api('/student-exam/save', { method: 'POST', body: { questionId: id, examId: examData.examId, ...payload } });
      pendingSaves[id] = task;
    }
  }
  const settled = await Promise.allSettled(Object.values(pendingSaves));
  const failed = settled.find(item => item.status === 'rejected' && item.reason?.code !== 'EXAM_TIME_EXPIRED');
  if (failed) throw failed.reason;
}

// ---------------- Question palette ----------------
function renderPalette() {
  const grid = document.getElementById('palette-grid');
  grid.innerHTML = examData.questions.map((question, index) => '<button class="palette-btn" data-index="' + index + '">' + (index + 1) + '</button>').join('');
  grid.querySelectorAll('.palette-btn').forEach(button => button.addEventListener('click', () => go(Number(button.dataset.index))));
  updatePaletteHighlight();
}
function updatePaletteHighlight() {
  document.querySelectorAll('.palette-btn').forEach((button, index) => {
    const question = examData.questions[index];
    button.classList.toggle('current', index === currentIndex);
    button.classList.toggle('answered', !!question.selectedOption);
    button.classList.toggle('bookmarked', !!question.isBookmarked);
  });
}

// ---------------- Submit ----------------
function openSubmitConfirm() {
  if (!examData || hasSubmitted || isSubmitting) return;
  const total = examData.questions.length;
  const answered = examData.questions.filter(question => question.selectedOption).length;
  const skipped = total - answered;
  document.getElementById('submit-summary').textContent = 'You have answered ' + answered + ' of ' + total + ' questions. ' + skipped + ' question' + (skipped === 1 ? ' is' : 's are') + ' unanswered.';
  document.getElementById('submit-modal').style.display = 'flex';
}
async function doSubmit(isAutoSubmit = false) {
  if (!examData || hasSubmitted || isSubmitting) return;
  isSubmitting = true;
  clearInterval(timerInterval);
  document.getElementById('submit-modal').style.display = 'none';
  document.getElementById('confirm-submit').disabled = true;
  try {
    await flushPendingSaves();
    await IQ.api('/student-exam/submit', { method: 'POST', body: { examId: examData.examId } });
    hasSubmitted = true;
    navigationGuardActive = false;
    IQ.toast(isAutoSubmit ? 'Time expired — your exam was submitted automatically.' : 'Exam submitted successfully!', 'success');
    setTimeout(() => { window.location.href = '/student/result.html?examId=' + encodeURIComponent(examData.examId); }, 900);
  } catch (error) {
    if (error.data && error.data.locked) {
      hasSubmitted = true;
      navigationGuardActive = false;
      window.location.href = '/student/result.html?examId=' + encodeURIComponent(examData.examId);
    } else {
      isSubmitting = false;
      document.getElementById('confirm-submit').disabled = false;
      IQ.toast(error.message, 'error');
      initTimer();
    }
  }
}
function toggleFullscreen() {
  if (document.fullscreenElement) {
    IQ.toast('Fullscreen stays active during the examination. Submit your exam to exit.', 'info', 3500);
    return;
  }
  restoreFullscreen();
}
