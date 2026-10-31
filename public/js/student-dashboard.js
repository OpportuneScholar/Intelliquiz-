document.addEventListener('DOMContentLoaded',async function(){
 if(!IQ.requireRole('student'))return;
 const user=IQ.getUser()||{},$=id=>document.getElementById(id);
 $('welcome-text').textContent=user.name?'Hi, '+user.name:'Student';$('welcome-name').textContent=user.name||'Student';
 $('theme-toggle').textContent=localStorage.getItem('iq_theme')==='light'?'☀️':'🌙';
 $('theme-toggle').addEventListener('click',()=>{$('theme-toggle').textContent=IQ.toggleTheme()==='light'?'☀️':'🌙';});$('logout-btn').addEventListener('click',IQ.logout);
 function section(name){document.querySelectorAll('.student-section').forEach(x=>x.classList.toggle('active',x.id===name));document.querySelectorAll('[data-section]').forEach(x=>x.classList.toggle('active',x.dataset.section===name));}
 document.querySelectorAll('[data-section]').forEach(x=>x.addEventListener('click',()=>section(x.dataset.section)));
 $('retry-btn').addEventListener('click',load);
 let selectedExamId=new URLSearchParams(location.search).get('examId')||user.examId||null;
 const set=(id,v)=>{if($(id))$(id).textContent=v==null||v===''?'—':v;};
 async function load(){ $('load-error').hidden=true;$('dashboard-content').hidden=false;
  try{
   const list=await IQ.api('/student/exams'); const exams=list.exams||[]; if(!selectedExamId&&exams.length) selectedExamId=exams[0].id; const holder=$('joined-exams'); holder.innerHTML=exams.length?exams.map(x=>'<button class="btn btn-ghost btn-sm" data-exam-id="'+IQ.escapeHtml(x.id)+'" style="margin:4px">'+IQ.escapeHtml(x.title)+' · '+IQ.escapeHtml(x.controllerId)+'</button>').join(''):'<p class="text-muted">No exams joined yet.</p>'; holder.querySelectorAll('[data-exam-id]').forEach(btn=>btn.addEventListener('click',()=>{selectedExamId=btn.dataset.examId;history.replaceState({},'','?examId='+encodeURIComponent(selectedExamId));load();})); if(!selectedExamId){
   set('welcome-name',user.name);set('welcome-subtitle','Join an examination using the Controller ID provided by your teacher.');
   set('p-name',user.name);set('p-roll',user.rollNumber);set('p-email',user.email);
   set('stat-status','Not joined');set('stat-total','—');set('stat-score','—');
   $('exam-badge').textContent='No exam selected';$('status-banner').textContent='You have not joined an examination yet. Enter your teacher’s Controller ID above to get started.';$('exam-actions').innerHTML='';
   set('exam-title','No examination selected');set('exam-subject','');
   set('exam-detail-title','—');set('exam-detail-subject','');
   set('p-controller','—');set('p-exam','—');set('p-duration','—');set('p-marks','—');set('p-passing','—');set('p-attempt','—');
   return;
  }
  const d=await IQ.api('/student-exam/status?examId='+encodeURIComponent(selectedExamId)),s=d.student||{},e=d.exam||{},a=d.submission||{};
   set('welcome-name',s.name||user.name);set('welcome-subtitle',e.subject?'Your '+e.subject+' examination at a glance.':'Your examination overview.');
   set('exam-title',e.title);set('exam-subject',e.subject);set('exam-detail-title',e.title);set('exam-detail-subject',e.subject);
   set('p-name',s.name);set('p-roll',s.rollNumber);set('p-email',s.email);set('p-controller',e.controllerId);set('p-registered',s.registeredAt?new Date(s.registeredAt).toLocaleDateString():null);set('p-exam',e.title);
   set('p-duration',e.durationMinutes!=null?e.durationMinutes+' minutes':null);set('p-marks',e.totalMarks);set('p-passing',e.passingMarks);set('p-attempt',a.status);set('stat-total',e.totalMarks);
   let r=null;if(a.status==='submitted'){try{const rd=await IQ.api('/student-exam/result?examId='+encodeURIComponent(e.id));r=rd.result||null;}catch(ex){console.warn('Result data unavailable',ex);}}
   set('stat-status',a.status==='submitted'?'Submitted':a.status==='in_progress'?'In progress':e.status==='active'?'Ready':'Not active');set('stat-score',r?r.score+' / '+r.totalMarks:'—');
   $('exam-badge').textContent=a.status==='submitted'?'Submitted':a.status==='in_progress'?'In progress':e.status==='active'?'Ready':'Not active';
   if(!e.id){$('status-banner').textContent='Join an examination using its Controller ID, or choose one from your exam list.';$('exam-actions').innerHTML='';$('exam-badge').textContent='No exam selected';} else if(a.status==='submitted'){const canRetry=Number(d.attemptsUsed||1)<Number(e.maxAttempts||1);$('status-banner').innerHTML='<strong>Examination submitted</strong><p class="text-muted">Attempt '+(a.attemptNumber||1)+' of '+(e.maxAttempts||1)+'. '+(canRetry?'You may start another attempt.':'All allowed attempts are used.')+'</p>';$('exam-actions').innerHTML='<a class="btn btn-ghost" href="/student/result.html?examId='+encodeURIComponent(e.id)+'">View my result</a>'+(canRetry?'<a class="btn btn-primary" href="/student/take-exam.html?examId='+encodeURIComponent(e.id)+'">Start next attempt</a>':'');}
   else if(a.status==='in_progress'){$('status-banner').innerHTML='<strong>Your examination is in progress</strong><p class="text-muted">Continue your saved attempt. Previous answers are retained.</p>';$('exam-actions').innerHTML='<a class="btn btn-primary" href="/student/take-exam.html?examId='+encodeURIComponent(e.id)+'">Resume examination</a>';}
   else if(e.status==='active'){$('status-banner').innerHTML='<strong>You are ready to begin</strong><p class="text-muted">Review the instructions before starting. Allowed attempts: '+(e.maxAttempts||1)+'.</p>';$('exam-actions').innerHTML='<a class="btn btn-primary" href="/student/take-exam.html?examId='+encodeURIComponent(e.id)+'">Start examination</a>';}
   else{$('status-banner').innerHTML='<strong>Examination not active yet</strong><p class="text-muted">Your teacher has not activated this examination.</p>';$('exam-actions').innerHTML='';}
   if(r){$('analytics-panel').innerHTML='<div class="student-stats"><div class="glass-card student-stat"><small>PERCENTAGE</small><strong>'+Number(r.percentage||0).toFixed(1)+'%</strong></div><div class="glass-card student-stat"><small>CORRECT</small><strong>'+(r.correct||0)+'</strong></div><div class="glass-card student-stat"><small>RANK</small><strong>'+(r.rank||'—')+' / '+(r.totalSubmitted||'—')+'</strong></div></div><p><strong>'+IQ.escapeHtml(r.remarks||'Result available')+'</strong></p><div class="progress-track"><div class="progress-fill" style="width:'+Math.max(0,Math.min(100,Number(r.percentage)||0))+'%"></div></div><p class="text-muted">Correct: '+(r.correct||0)+' · Incorrect: '+(r.incorrect||0)+' · Skipped: '+(r.skipped||0)+'</p>';}
  }catch(err){$('dashboard-content').hidden=true;$('load-error').hidden=false;set('error-message',err.message||'Unable to load dashboard.');IQ.toast(err.message||'Unable to load dashboard data.','error');console.error('Student dashboard API error',err);}
 }
 $('join-exam-form').addEventListener('submit',async ev=>{ev.preventDefault();const code=$('join-controller-id').value.trim().toUpperCase();try{const joined=await IQ.api('/student/join',{method:'POST',body:{controllerId:code}});selectedExamId=joined.exam.id;history.replaceState({},'','?examId='+encodeURIComponent(selectedExamId));$('join-message').textContent=joined.message;await load();}catch(err){$('join-message').textContent=err.message;}});
 await load();
});