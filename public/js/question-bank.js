document.addEventListener('DOMContentLoaded', async () => {
  if (!IQ.requireRole('teacher')) return;
  const $ = id => document.getElementById(id);
  const tabs = [['manual-tab','manual-panel'],['import-tab','import-panel']];
  $('theme-toggle').textContent = localStorage.getItem('iq_theme') === 'light' ? '☀️' : '🌙';
  $('theme-toggle').onclick = () => $('theme-toggle').textContent = IQ.toggleTheme() === 'light' ? '☀️' : '🌙';
  $('logout-btn').onclick = IQ.logout;
  $('template-btn').onclick = downloadTemplate;
  $('refresh-btn').onclick = load;
  $('import-btn').onclick = importCsv;
  $('manual-form').addEventListener('submit', saveManual);
  $('search-filter').addEventListener('input', render);
  $('subject-filter').addEventListener('change', () => { updateUnitFilter(); render(); });
  $('unit-filter').addEventListener('change', render);
  tabs.forEach(([tab,panel]) => $(tab).addEventListener('click', () => {
    tabs.forEach(([t,p]) => { $(t).setAttribute('aria-selected', String(t === tab)); $(p).classList.toggle('active', p === panel); });
  }));
  await load();

  async function saveManual(event) {
    event.preventDefault();
    const btn = $('manual-save'), msg = $('manual-message');
    const payload = {
      subject: $('manual-subject').value.trim(), unit: $('manual-unit').value.trim(),
      questionText: $('manual-question').value.trim(), optionA: $('manual-a').value.trim(),
      optionB: $('manual-b').value.trim(), optionC: $('manual-c').value.trim(),
      optionD: $('manual-d').value.trim(), correctOption: $('manual-correct').value,
      difficulty: $('manual-difficulty').value, marks: Number($('manual-marks').value || 1),
      explanation: $('manual-explanation').value.trim()
    };
    if (Object.values(payload).slice(0,8).some(value => !String(value || '').trim())) {
      msg.textContent = 'Please complete all required fields.'; return;
    }
    btn.disabled = true; msg.textContent = 'Saving question…';
    try {
      const result = await IQ.api('/question-bank/questions', { method: 'POST', body: payload });
      msg.textContent = result.message || 'Question saved.';
      IQ.toast(result.message || 'Question saved.', 'success');
      $('manual-form').reset(); $('manual-difficulty').value = 'medium'; $('manual-marks').value = '1';
      await load();
    } catch (error) {
      msg.textContent = error.message; IQ.toast(error.message, 'error');
    } finally { btn.disabled = false; }
  }
});

let bankQuestions = [];
function esc(value) { return IQ.escapeHtml(String(value ?? '')); }
function downloadTemplate() {
  const rows = [
    ['questionText','optionA','optionB','optionC','optionD','correctOption','explanation','difficulty','marks'],
    ['What is a stack?','LIFO data structure','FIFO data structure','Tree','Graph','A','A stack follows Last In First Out.','easy','1']
  ];
  const csv = rows.map(row => row.map(value => '"' + String(value).replace(/"/g,'""') + '"').join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'intelliquiz-question-bank-template.csv'; a.click(); URL.revokeObjectURL(url);
}
function parseCSV(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i=0;i<text.length;i++) {
    const c=text[i];
    if (quoted) { if(c==='"' && text[i+1]==='"'){cell+='"';i++;} else if(c==='"') quoted=false; else cell+=c; }
    else if(c==='"') quoted=true;
    else if(c===','){row.push(cell);cell='';}
    else if(c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(cell.length || row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}
  const headers=(rows.shift()||[]).map(x=>x.trim());
  return rows.filter(r=>r.some(x=>x.trim())).map(r=>Object.fromEntries(headers.map((h,i)=>[h,(r[i]||'').trim()])));
}
async function importCsv() {
  const file=document.getElementById('csv-file').files[0],subject=document.getElementById('subject').value.trim(),unit=document.getElementById('unit').value.trim();
  const msg=document.getElementById('message'),btn=document.getElementById('import-btn');
  if(!file||!subject||!unit){msg.textContent='Subject, unit and CSV file are required.';return;}
  btn.disabled=true;msg.textContent='Reading and importing CSV…';
  try {
    const questions=parseCSV(await file.text());
    if(!questions.length) throw Error('No question rows found.');
    if(questions.length>1000) throw Error('Import is limited to 1,000 questions per file.');
    const result=await IQ.api('/question-bank/import',{method:'POST',body:{subject,unit,questions}});
    msg.textContent=(result.message||'Import completed.')+(result.skipped?' Skipped: '+result.skipped+'.':'');
    IQ.toast(result.message||'Import completed.','success');
    document.getElementById('csv-file').value=''; await load();
  } catch(error){msg.textContent=error.message;IQ.toast(error.message,'error');}
  finally{btn.disabled=false;}
}
async function load() {
  const container=document.getElementById('questions');
  container.innerHTML='<div class="glass-card qb-empty">Loading questions…</div>';
  try {
    const result=await IQ.api('/question-bank/questions');
    bankQuestions=result.questions||[];
    const subjects=[...new Set(bankQuestions.map(q=>q.subject).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    const subjectFilter=document.getElementById('subject-filter'),previous=subjectFilter.value;
    subjectFilter.innerHTML='<option value="">All subjects</option>'+subjects.map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join('');
    subjectFilter.value=subjects.includes(previous)?previous:'';
    updateUnitFilter();
    document.getElementById('total-count').textContent=bankQuestions.length;
    document.getElementById('subject-count').textContent=subjects.length;
    document.getElementById('unit-count').textContent=new Set(bankQuestions.map(q=>q.subject+'::'+q.unit)).size;
    render();
  } catch(error){container.innerHTML='<div class="glass-card qb-empty"><strong>Could not load questions</strong><p>'+esc(error.message)+'</p><button class="btn btn-ghost" onclick="load()">Try again</button></div>';}
}
function updateUnitFilter() {
  const subject=document.getElementById('subject-filter').value,filter=document.getElementById('unit-filter'),previous=filter.value;
  const units=[...new Set(bankQuestions.filter(q=>!subject||q.subject===subject).map(q=>q.unit).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  filter.innerHTML='<option value="">All units</option>'+units.map(u=>'<option value="'+esc(u)+'">'+esc(u)+'</option>').join('');
  filter.value=units.includes(previous)?previous:'';
}
function render() {
  const container=document.getElementById('questions'),search=document.getElementById('search-filter').value.trim().toLowerCase();
  const subject=document.getElementById('subject-filter').value,unit=document.getElementById('unit-filter').value;
  const shown=bankQuestions.filter(q=>(!subject||q.subject===subject)&&(!unit||q.unit===unit)&&(!search||[q.question_text,q.subject,q.unit].some(v=>String(v||'').toLowerCase().includes(search))));
  if(!shown.length){container.innerHTML='<div class="glass-card qb-empty"><strong>'+(bankQuestions.length?'No matching questions':'Your question bank is empty')+'</strong><p>'+(bankQuestions.length?'Try changing your search or filters.':'Add your first question manually or import a CSV file.')+'</p></div>';return;}
  container.innerHTML=shown.map((q,index)=>{
    const id=esc(q.id||q._id),difficulty=String(q.difficulty||'medium').toLowerCase(),correct=String(q.correct_option||'').toLowerCase();
    const options=[['A',q.option_a],['B',q.option_b],['C',q.option_c],['D',q.option_d]];
    return '<article class="glass-card qb-question"><div class="flex justify-between items-center" style="gap:10px;flex-wrap:wrap"><strong>'+esc(q.subject)+' · '+esc(q.unit)+'</strong><span class="badge">'+esc(difficulty)+'</span></div><p style="margin-top:12px"><strong>'+(index+1)+'.</strong> '+esc(q.question_text)+'</p><div class="qb-options">'+options.map(([letter,value])=>'<div class="qb-option '+(correct===letter.toLowerCase()?'correct':'')+'"><strong>'+letter+'.</strong> '+esc(value)+'</div>').join('')+'</div><div class="flex justify-between items-center" style="gap:10px;flex-wrap:wrap"><small class="qb-note">Correct: '+correct.toUpperCase()+' · '+esc(q.marks||1)+' marks'+(q.explanation?' · Explanation available':'')+'</small><button class="btn btn-ghost btn-sm" data-delete-question="'+id+'">Delete</button></div></article>';
  }).join('');
  container.querySelectorAll('[data-delete-question]').forEach(button=>button.addEventListener('click',async()=>{
    if(!confirm('Delete this saved question permanently?'))return;
    button.disabled=true;
    try{const result=await IQ.api('/question-bank/questions/'+encodeURIComponent(button.dataset.deleteQuestion),{method:'DELETE'});IQ.toast(result.message||'Question deleted.','success');await load();}
    catch(error){button.disabled=false;IQ.toast(error.message,'error');}
  }));
}
