// public/js/exam-manage.js

const examId = new URLSearchParams(window.location.search).get('id');
let currentExam = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!IQ.requireRole('teacher')) return;
  if (!examId) { window.location.href = '/teacher/dashboard.html'; return; }

  document.getElementById('theme-toggle').textContent = (localStorage.getItem('iq_theme') === 'light') ? '☀️' : '🌙';
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const t = IQ.toggleTheme();
    document.getElementById('theme-toggle').textContent = t === 'light' ? '☀️' : '🌙';
  });
  document.getElementById('logout-btn').addEventListener('click', IQ.logout);

  // Tabs
  document.querySelectorAll('.tabbar button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tabbar button').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tabpanel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
      if (btn.dataset.tab === 'students') loadStudents();
      if (btn.dataset.tab === 'results') loadResults();
    });
  });

  await loadExam();
  await loadQuestions();

  document.getElementById('copy-controller').addEventListener('click', () => {
    navigator.clipboard.writeText(currentExam.controller_id);
    IQ.toast('Controller ID copied to clipboard.', 'success');
  });

  document.getElementById('toggle-active-btn').addEventListener('click', async () => {
    const nextStatus = currentExam.status === 'active' ? 'draft' : 'active';
    try {
      const data = await IQ.api(`/exams/${examId}`, { method: 'PUT', body: { status: nextStatus } });
      currentExam = data.exam;
      renderExamHeader();
      IQ.toast(`Exam is now ${nextStatus}.`, 'success');
    } catch (err) { IQ.toast(err.message, 'error'); }
  });

  // Question search
  document.getElementById('q-search').addEventListener('input', debounce(loadQuestions, 300));
  document.getElementById('add-question-btn').addEventListener('click', () => openQuestionModal());
  document.getElementById('qm-close').addEventListener('click', () => document.getElementById('question-modal').style.display = 'none');
  document.getElementById('question-form').addEventListener('submit', saveQuestion);
  document.getElementById('export-questions-btn').addEventListener('click', () => {
    window.open(`/api/exams/${examId}/questions/export`, '_blank');
  });
  document.getElementById('import-bank-btn').addEventListener('click',()=>{document.getElementById('bank-modal').style.display='flex';});
  document.getElementById('bank-close').addEventListener('click',()=>document.getElementById('bank-modal').style.display='none');
  document.getElementById('select-bank-btn').addEventListener('click',async()=>{document.getElementById('select-bank-modal').style.display='flex';await loadBankQuestions();});
  document.getElementById('select-bank-close').addEventListener('click',()=>document.getElementById('select-bank-modal').style.display='none');
  document.getElementById('bank-unit-filter').addEventListener('change',loadBankQuestions);
  document.getElementById('bank-import-submit').addEventListener('click',importBankQuestions);
  document.getElementById('bank-add-selected').addEventListener('click',addBankQuestionsToExam);

  // Students
  document.getElementById('s-search').addEventListener('input', debounce(loadStudents, 300));
  document.getElementById('s-status-filter').addEventListener('change', loadStudents);

  // Results
  document.getElementById('export-csv-btn').addEventListener('click', () => {
    const token = IQ.getToken();
    // CSV export uses a direct navigation; append token as query isn't ideal, so fetch+blob instead.
    downloadCsv();
  });
  document.getElementById('print-report-btn').addEventListener('click', () => window.print());

  // Settings
  document.getElementById('settings-form').addEventListener('submit', saveSettings);
  document.getElementById('delete-exam-btn').addEventListener('click', deleteExam);
});

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function loadExam() {
  try {
    const { exam } = await IQ.api(`/exams/${examId}`);
    currentExam = exam;
    renderExamHeader();
    fillSettingsForm();
  } catch (err) {
    IQ.toast(err.message, 'error');
  }
}

function renderExamHeader() {
  document.getElementById('exam-title-h').textContent = currentExam.title;
  document.getElementById('controller-id-display').textContent = currentExam.controller_id;
  const badge = document.getElementById('status-badge');
  badge.textContent = currentExam.status;
  badge.className = `badge badge-${currentExam.status}`;
  document.getElementById('toggle-active-btn').textContent = currentExam.status === 'active' ? 'Deactivate Exam' : 'Activate Exam';
}

function fillSettingsForm() {
  const e = currentExam;
  document.getElementById('st-title').value = e.title || '';
  document.getElementById('st-attempt-policy').value = Number(e.max_attempts || 1) > 1 ? 'multiple' : 'single';
  document.getElementById('st-max-attempts').value = e.max_attempts || 2;
  document.getElementById('st-subject').value = e.subject || '';
  document.getElementById('st-instructions').value = e.instructions || '';
  document.getElementById('st-duration').value = e.duration_minutes || '';
  document.getElementById('st-passing').value = e.passing_marks || 0;
  document.getElementById('st-start-date').value = e.start_date || '';
  document.getElementById('st-end-date').value = e.end_date || '';
  document.getElementById('st-shuffle-q').checked = !!e.shuffle_questions;
  document.getElementById('st-shuffle-o').checked = !!e.shuffle_options;
  document.getElementById('st-negative').checked = !!e.negative_marking;
  document.getElementById('st-reg-open').checked = !!e.registration_open;
}

async function saveSettings(e) {
  e.preventDefault();
  try {
    const body = {
      title: document.getElementById('st-title').value.trim(),
      subject: document.getElementById('st-subject').value.trim(),
      instructions: document.getElementById('st-instructions').value.trim(),
      durationMinutes: document.getElementById('st-duration').value,
      passingMarks: document.getElementById('st-passing').value,
      startDate: document.getElementById('st-start-date').value,
      endDate: document.getElementById('st-end-date').value,
      shuffleQuestions: document.getElementById('st-shuffle-q').checked,
      shuffleOptions: document.getElementById('st-shuffle-o').checked,
      negativeMarking: document.getElementById('st-negative').checked,
      registrationOpen: document.getElementById('st-reg-open').checked,
      maxAttempts: document.getElementById('st-attempt-policy').value === 'multiple' ? document.getElementById('st-max-attempts').value : 1
    };
    const data = await IQ.api(`/exams/${examId}`, { method: 'PUT', body });
    currentExam = data.exam;
    renderExamHeader();
    IQ.toast('Settings saved.', 'success');
  } catch (err) { IQ.toast(err.message, 'error'); }
}

async function deleteExam() {
  if (!confirm('Delete this exam permanently? This removes all questions, students, and results. This cannot be undone.')) return;
  try {
    await IQ.api(`/exams/${examId}`, { method: 'DELETE' });
    IQ.toast('Exam deleted.', 'success');
    setTimeout(() => (window.location.href = '/teacher/dashboard.html'), 800);
  } catch (err) { IQ.toast(err.message, 'error'); }
}

// ---------------- Questions ----------------
async function loadQuestions() {
  const list = document.getElementById('question-list');
  const search = document.getElementById('q-search').value;
  try {
    const { questions, total } = await IQ.api(`/exams/${examId}/questions?search=${encodeURIComponent(search)}&limit=200`);
    document.getElementById('q-count').textContent = `${total} question${total === 1 ? '' : 's'}`;
    if (questions.length === 0) {
      list.innerHTML = `<div class="glass-card empty-state"><div class="icon">❓</div>No questions yet. Click "Add Question" to build your question bank.</div>`;
      return;
    }
    list.innerHTML = questions.map((q, i) => `
      <div class="glass-card q-card">
        <div class="flex justify-between items-center">
          <strong>Q${i + 1}. ${IQ.escapeHtml(q.question_text)}</strong>
          <div class="flex gap-8">
            <span class="pill-tag">${q.difficulty}</span>
            <span class="pill-tag">${q.marks} mark${q.marks == 1 ? '' : 's'}</span>
          </div>
        </div>
        ${q.image_path ? `<img src="${q.image_path}" style="max-width:200px;border-radius:8px;margin-top:8px;">` : ''}
        <div class="opts">
          <div class="${q.correct_option === 'a' ? 'opt-correct' : ''}">A. ${IQ.escapeHtml(q.option_a)}</div>
          <div class="${q.correct_option === 'b' ? 'opt-correct' : ''}">B. ${IQ.escapeHtml(q.option_b)}</div>
          <div class="${q.correct_option === 'c' ? 'opt-correct' : ''}">C. ${IQ.escapeHtml(q.option_c)}</div>
          <div class="${q.correct_option === 'd' ? 'opt-correct' : ''}">D. ${IQ.escapeHtml(q.option_d)}</div>
        </div>
        <div class="q-actions">
          <button class="btn btn-ghost btn-sm" onclick='editQuestion(${JSON.stringify(q).replace(/'/g, "&#39;")})'>Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteQuestion(${q.id})">Delete</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = `<div class="glass-card empty-state">Could not load questions: ${err.message}</div>`;
  }
}

function openQuestionModal(q = null) {
  document.getElementById('qm-title').textContent = q ? 'Edit Question' : 'Add Question';
  document.getElementById('qf-id').value = q ? q.id : '';
  document.getElementById('qf-text').value = q ? q.question_text : '';
  document.getElementById('qf-a').value = q ? q.option_a : '';
  document.getElementById('qf-b').value = q ? q.option_b : '';
  document.getElementById('qf-c').value = q ? q.option_c : '';
  document.getElementById('qf-d').value = q ? q.option_d : '';
  document.getElementById('qf-correct').value = q ? q.correct_option : 'a';
  document.getElementById('qf-marks').value = q ? q.marks : 1;
  document.getElementById('qf-category').value = q ? (q.category || '') : '';
  document.getElementById('qf-difficulty').value = q ? q.difficulty : 'medium';
  document.getElementById('qf-explanation').value = q ? (q.explanation || '') : '';
  document.getElementById('qf-image').value = '';
  document.getElementById('question-modal').style.display = 'flex';
}
function editQuestion(q) { openQuestionModal(q); }

async function deleteQuestion(id) {
  if (!confirm('Delete this question?')) return;
  try {
    await IQ.api(`/questions/${id}`, { method: 'DELETE' });
    IQ.toast('Question deleted.', 'success');
    loadQuestions();
  } catch (err) { IQ.toast(err.message, 'error'); }
}

async function saveQuestion(e) {
  e.preventDefault();
  const id = document.getElementById('qf-id').value;
  const fd = new FormData();
  fd.append('questionText', document.getElementById('qf-text').value.trim());
  fd.append('optionA', document.getElementById('qf-a').value);
  fd.append('optionB', document.getElementById('qf-b').value);
  fd.append('optionC', document.getElementById('qf-c').value);
  fd.append('optionD', document.getElementById('qf-d').value);
  fd.append('correctOption', document.getElementById('qf-correct').value);
  fd.append('marks', document.getElementById('qf-marks').value);
  fd.append('category', document.getElementById('qf-category').value);
  fd.append('difficulty', document.getElementById('qf-difficulty').value);
  fd.append('explanation', document.getElementById('qf-explanation').value);
  const imgFile = document.getElementById('qf-image').files[0];
  if (imgFile) fd.append('image', imgFile);

  try {
    if (id) {
      await IQ.api(`/questions/${id}`, { method: 'PUT', body: fd, isForm: true });
      IQ.toast('Question updated.', 'success');
    } else {
      await IQ.api(`/exams/${examId}/questions`, { method: 'POST', body: fd, isForm: true });
      IQ.toast('Question added.', 'success');
    }
    document.getElementById('question-modal').style.display = 'none';
    loadQuestions();
    loadExam();
  } catch (err) { IQ.toast(err.message, 'error'); }
}


async function importBankQuestions(){
 const file=document.getElementById('bank-file').files[0],subject=document.getElementById('bank-subject').value.trim(),unit=document.getElementById('bank-unit').value.trim(),msg=document.getElementById('bank-import-message'),btn=document.getElementById('bank-import-submit');
 if(!file||!subject||!unit){msg.textContent='Select a JSON file and enter subject and unit.';return;}
 btn.disabled=true;btn.textContent='Importing…';msg.textContent='';
 try{
  const parsed=JSON.parse(await file.text());
  const questions=Array.isArray(parsed)?parsed:(parsed.questions||parsed.data||parsed.items);
  if(!Array.isArray(questions))throw new Error('JSON must contain an array, or an object with a questions array.');
  const r=await IQ.api('/question-bank/import',{method:'POST',body:{subject,unit,questions}});
  msg.textContent='Imported '+r.imported+'; skipped '+r.skipped+'.'+(r.errors?.length?' First issue: '+r.errors[0].message:'');
  IQ.toast(r.message||'Question bank imported.','success');
  document.getElementById('bank-file').value='';
  await loadBankQuestions();
 }catch(e){msg.textContent=e.message;IQ.toast(e.message,'error');}
 finally{btn.disabled=false;btn.textContent='Import and Save';}
}
async function loadBankQuestions(){
 const filter=document.getElementById('bank-unit-filter'),list=document.getElementById('bank-question-list');
 try{const r=await IQ.api('/question-bank/questions'+(filter.value?'?unit='+encodeURIComponent(filter.value):''));const units=[...new Set(r.questions.map(q=>q.unit))];const current=filter.value;filter.innerHTML='<option value="">All saved units</option>'+units.map(u=>'<option value="'+IQ.escapeHtml(u)+'">'+IQ.escapeHtml(u)+'</option>').join('');filter.value=current;list.innerHTML=r.questions.length?r.questions.map(q=>'<label class="glass-card q-card" style="display:block"><input type="checkbox" class="bank-q-check" value="'+q.id+'"> <strong>'+IQ.escapeHtml(q.unit)+'</strong> · '+IQ.escapeHtml(q.question_text)+'<div class="text-muted">'+IQ.escapeHtml(q.subject)+' · '+q.marks+' marks</div></label>').join(''):'<p class="text-muted">No saved questions in this unit yet.</p>';}catch(e){list.textContent=e.message;}
}
async function addBankQuestionsToExam(){
 const questionIds=[...document.querySelectorAll('.bank-q-check:checked')].map(x=>x.value);if(!questionIds.length){IQ.toast('Select at least one question.','error');return;}
 try{const r=await IQ.api('/exams/'+examId+'/questions/from-bank',{method:'POST',body:{questionIds}});IQ.toast(r.message,'success');document.getElementById('select-bank-modal').style.display='none';await loadQuestions();await loadExam();}catch(e){IQ.toast(e.message,'error');}
}

// ---------------- Students ----------------
async function loadStudents() {
  const tbody = document.querySelector('#students-table tbody');
  const search = document.getElementById('s-search').value;
  const status = document.getElementById('s-status-filter').value;
  try {
    const { students } = await IQ.api(`/dashboard/exams/${examId}/students?search=${encodeURIComponent(search)}&status=${status}`);
    if (students.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No students match.</td></tr>`;
      return;
    }
    tbody.innerHTML = students.map(s => `
      <tr>
        <td>${IQ.escapeHtml(s.name)}</td>
        <td class="mono">${IQ.escapeHtml(s.roll_number)}</td>
        <td><span class="badge badge-${s.status || 'not_started'}">${(s.status || 'not_started').replace('_',' ')}</span></td>
        <td>${s.score != null && s.status === 'submitted' ? `${s.score}/${s.total_marks}` : '—'}</td>
        <td>
          <button class="btn btn-danger btn-sm" onclick="deleteStudent('${s.id}', '${s.submissionId}', '${IQ.escapeHtml(s.name)}')">Remove</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">${err.message}</td></tr>`;
  }
}

async function deleteStudent(id, submissionId, name) {
  if (!confirm(`Remove ${name} from this exam? This cannot be undone.`)) return;
  try {
    await IQ.api(`/dashboard/students/${id}?submissionId=${encodeURIComponent(submissionId)}`, { method: 'DELETE' });
    IQ.toast(`${name} removed.`, 'success');
    loadStudents();
  } catch (err) { IQ.toast(err.message, 'error'); }
}

// ---------------- Results ----------------
async function loadResults() {
  const tbody = document.querySelector('#results-table tbody');
  try {
    const { results } = await IQ.api(`/dashboard/exams/${examId}/results`);
    const submitted = results.filter(r => r.status === 'submitted').sort((a, b) => b.score - a.score);
    const others = results.filter(r => r.status !== 'submitted');
    if (results.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No students registered yet.</td></tr>`;
      return;
    }
    let rows = submitted.map((r, i) => {
      const pct = r.total_marks > 0 ? ((r.score / r.total_marks) * 100).toFixed(1) : '0.0';
      return `<tr>
        <td>#${i + 1}</td><td>${IQ.escapeHtml(r.name)}</td><td class="mono">${IQ.escapeHtml(r.roll_number)}</td>
        <td>${r.score}/${r.total_marks}</td><td>${pct}%</td>
        <td><span class="badge badge-submitted">submitted</span></td>
        <td>${IQ.fmtDate(r.submitted_at)}</td>
      </tr>`;
    }).join('');
    rows += others.map(r => `<tr>
        <td>—</td><td>${IQ.escapeHtml(r.name)}</td><td class="mono">${IQ.escapeHtml(r.roll_number)}</td>
        <td>—</td><td>—</td>
        <td><span class="badge badge-${r.status || 'not_started'}">${(r.status || 'not_started').replace('_',' ')}</span></td>
        <td>—</td>
      </tr>`).join('');
    tbody.innerHTML = rows;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">${err.message}</td></tr>`;
  }
}

async function downloadCsv() {
  try {
    const res = await fetch(`/api/dashboard/exams/${examId}/export.csv`, {
      headers: { Authorization: `Bearer ${IQ.getToken()}` }
    });
    if (!res.ok) throw new Error('Export failed.');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentExam.title.replace(/\W+/g, '_')}_results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) { IQ.toast(err.message, 'error'); }
}
