const express=require('express');
const {Student,Exam,Question,Submission,Answer}=require('../database/db');
const {verifyToken,requireRole}=require('../middleware/auth');
const router=express.Router();router.use(verifyToken,requireRole('student'));
const validId=id=>/^[a-f\d]{24}$/i.test(String(id));
const shuffle=a=>{const x=[...a];for(let i=x.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[x[i],x[j]]=[x[j],x[i]];}return x;};
async function context(id){if(!validId(id))return {};const student=await Student.findById(id);if(!student)return {};const [exam,submission]=await Promise.all([Exam.findById(student.exam_id),Submission.findOne({student_id:student._id,exam_id:student.exam_id})]);return {student,exam,submission};}
router.get('/status',async(req,res,next)=>{try{const {student,exam,submission}=await context(req.user.id);if(!student||!exam)return res.status(404).json({success:false,message:'Student record not found.'});res.json({success:true,student:{id:student.id,name:student.name,rollNumber:student.roll_number,email:student.email,controllerId:student.controller_id,registeredAt:student.registered_at},exam:{id:exam.id,title:exam.title,subject:exam.subject,instructions:exam.instructions,durationMinutes:exam.duration_minutes,totalMarks:exam.total_marks,passingMarks:exam.passing_marks,startDate:exam.start_date,endDate:exam.end_date,startTime:exam.start_time,endTime:exam.end_time,status:exam.status},submission:submission?{status:submission.status,startedAt:submission.started_at,submittedAt:submission.submitted_at,score:submission.score,totalMarks:submission.total_marks}:{status:'not_started'}});}catch(err){next(err);}});
router.post('/start',async(req,res,next)=>{try{
 const {student,exam}=await context(req.user.id);if(!student||!exam)return res.status(404).json({success:false,message:'Student or examination record not found.'});
 let submission=await Submission.findOne({student_id:student._id,exam_id:exam._id});
 if(submission?.status==='submitted')return res.status(403).json({success:false,locked:true,message:'You have already submitted this examination. Reattempt is not allowed.'});
 let questionOrder=submission?.status==='in_progress'&&submission.question_order?.length?submission.question_order.map(String):null;
 if(!questionOrder){
  let all=(await Question.find({exam_id:exam._id}).select('_id').lean()).map(q=>String(q._id));
  if(!all.length)return res.status(400).json({success:false,message:'This exam has no questions yet. Please contact your teacher.'});
  if(exam.shuffle_questions)all=shuffle(all);if(exam.questions_per_attempt&&exam.questions_per_attempt<all.length)all=all.slice(0,exam.questions_per_attempt);questionOrder=all;
  if(submission){submission.status='in_progress';submission.question_order=questionOrder;submission.started_at=new Date();await submission.save();}
  else submission=await Submission.create({student_id:student._id,exam_id:exam._id,status:'in_progress',question_order:questionOrder,started_at:new Date()});
 }
 const ids=questionOrder.filter(validId);const [rows,answers]=await Promise.all([Question.find({_id:{$in:ids},exam_id:exam._id}).lean(),Answer.find({submission_id:submission._id}).lean()]);
 const byId=Object.fromEntries(rows.map(q=>[String(q._id),q]));const answerByQ=Object.fromEntries(answers.map(a=>[String(a.question_id),a]));
 const questions=questionOrder.filter(id=>byId[id]).map(id=>{const q=byId[id];let options=['a','b','c','d'].map(k=>({key:k,text:q['option_'+k]}));if(exam.shuffle_options)options=shuffle(options);const a=answerByQ[id];return{id,questionText:q.question_text,imagePath:q.image_path,marks:q.marks,options,selectedOption:a?.selected_option||null,isBookmarked:!!a?.is_bookmarked};});
 res.json({success:true,submissionId:submission.id,startedAt:submission.started_at,durationMinutes:exam.duration_minutes,instructions:exam.instructions,title:exam.title,questions});
}catch(err){next(err);}});
router.post('/save',async(req,res,next)=>{try{
 const {questionId,selectedOption,isBookmarked}=req.body;const {student,submission}=await context(req.user.id);
 if(!student||!submission||submission.status!=='in_progress')return res.status(403).json({success:false,message:'No active exam attempt found.'});
 if(!validId(questionId))return res.status(400).json({success:false,message:'Invalid question for this exam.'});
 const question=await Question.findOne({_id:questionId,exam_id:student.exam_id});if(!question)return res.status(400).json({success:false,message:'Invalid question for this exam.'});
 const update={};if(selectedOption!==undefined)update.selected_option=selectedOption;if(typeof isBookmarked==='boolean')update.is_bookmarked=isBookmarked;
 await Answer.findOneAndUpdate({submission_id:submission._id,question_id:question._id},{$set:update,$setOnInsert:{submission_id:submission._id,question_id:question._id}},{upsert:true,new:true,runValidators:true});
 res.json({success:true});
}catch(err){next(err);}});
router.post('/submit',async(req,res,next)=>{try{
 const {student,exam,submission}=await context(req.user.id);if(!student||!exam)return res.status(404).json({success:false,message:'Student record not found.'});
 if(!submission||submission.status==='not_started')return res.status(400).json({success:false,message:'No active exam attempt to submit.'});
 if(submission.status==='submitted')return res.status(403).json({success:false,locked:true,message:'You have already submitted this examination. Reattempt is not allowed.'});
 const order=(submission.question_order||[]).map(String),questions=await Question.find({_id:{$in:order},exam_id:exam._id}).lean(),answers=await Answer.find({submission_id:submission._id});
 const qById=Object.fromEntries(questions.map(q=>[String(q._id),q])),aById=Object.fromEntries(answers.map(a=>[String(a.question_id),a]));
 let score=0,totalMarks=0,correct=0,incorrect=0,skipped=0;const bulk=[];
 for(const id of order){const q=qById[id];if(!q)continue;totalMarks+=Number(q.marks)||0;let a=aById[id];const selected=a?.selected_option||null;let isCorrect=false;
  if(!selected)skipped++;else if(String(selected).toLowerCase()===String(q.correct_option).toLowerCase()){correct++;score+=Number(q.marks)||0;isCorrect=true;}else{incorrect++;if(exam.negative_marking)score-=Number(exam.negative_mark_value)||0;}
  if(a)bulk.push({updateOne:{filter:{_id:a._id},update:{$set:{is_correct:isCorrect}}}});
  else bulk.push({insertOne:{document:{submission_id:submission._id,question_id:q._id,selected_option:null,is_correct:false,is_bookmarked:false}}});
 }
 score=Math.max(0,score);if(bulk.length)await Answer.bulkWrite(bulk);
 const started=submission.started_at?new Date(submission.started_at).getTime():Date.now(),timeTaken=Math.max(0,Math.round((Date.now()-started)/1000));
 submission.status='submitted';submission.submitted_at=new Date();submission.score=score;submission.total_marks=totalMarks;submission.correct_count=correct;submission.incorrect_count=incorrect;submission.skipped_count=skipped;submission.time_taken_seconds=timeTaken;await submission.save();
 res.json({success:true,message:'Exam submitted successfully.',result:{score,totalMarks,correct,incorrect,skipped,passed:score>=exam.passing_marks}});
}catch(err){next(err);}});
router.get('/result',async(req,res,next)=>{try{
 const {student,exam,submission}=await context(req.user.id);if(!student||!exam)return res.status(404).json({success:false,message:'Student record not found.'});
 if(!submission||submission.status!=='submitted')return res.status(400).json({success:false,message:'No submitted result found for this exam.'});
 const order=(submission.question_order||[]).map(String),[questions,answers,totalSubmitted,better]=await Promise.all([Question.find({_id:{$in:order}}).lean(),Answer.find({submission_id:submission._id}).lean(),Submission.countDocuments({exam_id:exam._id,status:'submitted'}),Submission.countDocuments({exam_id:exam._id,status:'submitted',score:{$gt:submission.score}})]);
 const qById=Object.fromEntries(questions.map(q=>[String(q._id),q])),aById=Object.fromEntries(answers.map(a=>[String(a.question_id),a]));
 const breakdown=order.filter(id=>qById[id]).map(id=>{const q=qById[id],a=aById[id];return{questionText:q.question_text,options:{a:q.option_a,b:q.option_b,c:q.option_c,d:q.option_d},correctOption:q.correct_option,selectedOption:a?.selected_option||null,isCorrect:!!a?.is_correct,explanation:q.explanation,marks:q.marks};});
 const percentage=submission.total_marks>0?submission.score/submission.total_marks*100:0;let remarks='Needs Improvement';if(percentage>=90)remarks='Outstanding';else if(percentage>=75)remarks='Excellent';else if(percentage>=60)remarks='Good';else if(percentage>=(submission.total_marks>0?exam.passing_marks/submission.total_marks*100:0))remarks='Satisfactory';
 res.json({success:true,exam:{title:exam.title,subject:exam.subject,passingMarks:exam.passing_marks},student:{name:student.name,rollNumber:student.roll_number},result:{score:submission.score,totalMarks:submission.total_marks,percentage:Math.round(percentage*100)/100,passed:submission.score>=exam.passing_marks,correct:submission.correct_count,incorrect:submission.incorrect_count,skipped:submission.skipped_count,timeTakenSeconds:submission.time_taken_seconds,submittedAt:submission.submitted_at,rank:better+1,totalSubmitted,remarks},breakdown});
}catch(err){next(err);}});
module.exports=router;
