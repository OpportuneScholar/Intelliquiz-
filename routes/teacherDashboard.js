const express=require('express');
const {Parser}=require('json2csv');
const {Exam,Question,Student,Submission,Answer}=require('../database/db');
const {verifyToken,requireRole}=require('../middleware/auth');
const router=express.Router();router.use(verifyToken,requireRole('teacher'));
const validId=id=>/^[a-f\d]{24}$/i.test(String(id));
async function ownsExam(id,teacherId){return validId(id)?Exam.findOne({_id:id,teacher_id:teacherId}):null;}
router.get('/overview',async(req,res,next)=>{try{
 const teacherId=req.user.id,exams=await Exam.find({teacher_id:teacherId}).select('_id status').lean(),ids=exams.map(e=>e._id);
 const [total_questions,total_students,live_participants,submitted]=await Promise.all([Question.countDocuments({exam_id:{$in:ids}}),Submission.distinct('student_id',{exam_id:{$in:ids}}).then(x=>x.length),Submission.countDocuments({exam_id:{$in:ids},status:'in_progress'}),Submission.find({exam_id:{$in:ids},status:'submitted'}).populate('exam_id','passing_marks').lean()]);
 const total_exams=exams.length,active_exams=exams.filter(e=>e.status==='active').length,completed_exams=exams.filter(e=>e.status==='completed').length;
 const percentages=submitted.filter(s=>s.total_marks>0).map(s=>s.score/s.total_marks*100),average_score=percentages.length?Math.round(percentages.reduce((a,b)=>a+b,0)/percentages.length*10)/10:0;
 const passCount=submitted.filter(s=>s.score>=(s.exam_id?.passing_marks||0)).length,pass_percentage=submitted.length?Math.round(passCount/submitted.length*1000)/10:0;
 const recent=await Submission.find({exam_id:{$in:ids},status:{$ne:'not_started'}}).sort({submitted_at:-1,started_at:-1}).limit(10).populate('student_id','name').populate('exam_id','title').lean();
 const recentActivity=recent.map(s=>({student_name:s.student_id?.name||'Unknown',exam_title:s.exam_id?.title||'Exam',status:s.status,score:s.score,total_marks:s.total_marks,activity_time:s.submitted_at||s.started_at}));
 res.json({success:true,stats:{total_exams,active_exams,completed_exams,total_questions,total_students,live_participants,average_score,pass_percentage},recentActivity});
}catch(err){next(err);}});
router.get('/exams/:examId/students',async(req,res,next)=>{try{
 const exam=await ownsExam(req.params.examId,req.user.id);if(!exam)return res.status(404).json({success:false,message:'Exam not found.'});
 const subs=await Submission.find({exam_id:exam._id}).populate('student_id','name roll_number email registered_at').lean();let rows=subs.filter(s=>s.student_id).map(sub=>({id:String(sub.student_id._id),submissionId:String(sub._id),name:sub.student_id.name,roll_number:sub.student_id.roll_number,email:sub.student_id.email,registered_at:sub.student_id.registered_at,status:sub.status||'not_started',score:sub.score??0,total_marks:sub.total_marks??0,submitted_at:sub.submitted_at,time_taken_seconds:sub.time_taken_seconds}));if(req.query.search){const term=String(req.query.search).toLowerCase();rows=rows.filter(s=>[s.name,s.roll_number,s.email].some(v=>String(v||'').toLowerCase().includes(term)));}
 if(req.query.status)rows=rows.filter(s=>s.status===req.query.status);res.json({success:true,students:rows});
}catch(err){next(err);}});
router.post('/students/:studentId/reset-attempt',async(req,res,next)=>{try{
 if(!validId(req.params.studentId))return res.status(404).json({success:false,message:'Student not found.'});
 const submission=await Submission.findOne({_id:req.body.submissionId,student_id:req.params.studentId}).populate('student_id','name');if(!submission)return res.status(404).json({success:false,message:'Exam enrollment not found.'});const exam=await ownsExam(submission.exam_id,req.user.id);if(!exam)return res.status(403).json({success:false,message:'You do not have permission to modify this enrollment.'});const student=submission.student_id;if(submission){await Answer.deleteMany({submission_id:submission._id});Object.assign(submission,{status:'not_started',question_order:[],started_at:null,submitted_at:null,score:0,total_marks:0,correct_count:0,incorrect_count:0,skipped_count:0,time_taken_seconds:null});await submission.save();}
 res.json({success:true,message:`Attempt reset for ${student.name}. They may now reattempt the exam.`});
}catch(err){next(err);}});
router.delete('/students/:studentId',async(req,res,next)=>{try{
 if(!validId(req.params.studentId))return res.status(404).json({success:false,message:'Student not found.'});
 const submission=await Submission.findOne({_id:req.query.submissionId,student_id:req.params.studentId}).populate('student_id','name');if(!submission)return res.status(404).json({success:false,message:'Exam enrollment not found.'});if(!await ownsExam(submission.exam_id,req.user.id))return res.status(403).json({success:false,message:'You do not have permission to remove this enrollment.'});await Answer.deleteMany({submission_id:submission._id});await submission.deleteOne();res.json({success:true,message:'Student removed from this examination. Their account and other exam enrollments remain intact.'});
}catch(err){next(err);}});
router.get('/exams/:examId/results',async(req,res,next)=>{try{
 const exam=await ownsExam(req.params.examId,req.user.id);if(!exam)return res.status(404).json({success:false,message:'Exam not found.'});
 const subs=await Submission.find({exam_id:exam._id}).populate('student_id','name roll_number email').lean();
 const results=subs.filter(s=>s.student_id).map(sub=>({name:sub.student_id.name,roll_number:sub.student_id.roll_number,email:sub.student_id.email,status:sub.status||'not_started',score:sub.score??0,total_marks:sub.total_marks??0,correct_count:sub.correct_count??0,incorrect_count:sub.incorrect_count??0,skipped_count:sub.skipped_count??0,time_taken_seconds:sub.time_taken_seconds,submitted_at:sub.submitted_at})).sort((a,b)=>(b.score||0)-(a.score||0));
 res.json({success:true,exam:exam.toObject(),results});
}catch(err){next(err);}});
router.get('/exams/:examId/export.csv',async(req,res,next)=>{try{
 const exam=await ownsExam(req.params.examId,req.user.id);if(!exam)return res.status(404).json({success:false,message:'Exam not found.'});
 const subs=await Submission.find({exam_id:exam._id}).populate('student_id','name roll_number email').lean();
 const rows=subs.filter(s=>s.student_id).map(sub=>{const total=Number(sub.total_marks)||0,score=Number(sub.score)||0;return{'Student Name':sub.student_id.name,'Roll Number':sub.student_id.roll_number,Email:sub.student_id.email||'',Status:sub.status||'not_started',Score:score,'Total Marks':total,Percentage:total?Math.round(score/total*10000)/100:0,Correct:sub.correct_count||0,Incorrect:sub.incorrect_count||0,Skipped:sub.skipped_count||0,'Time Taken (s)':sub.time_taken_seconds??'','Submitted At':sub.submitted_at||''};}).sort((a,b)=>b.Score-a.Score);
 const csv=new Parser().parse(rows);res.setHeader('Content-Type','text/csv');res.setHeader('Content-Disposition',`attachment; filename="${exam.title.replaceAll(' ','_')}_results.csv"`);res.send(csv);
}catch(err){next(err);}});
module.exports=router;
