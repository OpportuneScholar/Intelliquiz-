const express = require('express');
const { Exam, Student, Question, Submission, UnitQuestion } = require('../database/db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { generateControllerId } = require('../utils/generateId');
const router = express.Router();
router.use(verifyToken, requireRole('teacher'));
const validId = id => /^[a-f\d]{24}$/i.test(String(id));
async function getOwnedExam(id, teacherId) { if (!validId(id)) return null; return Exam.findOne({ _id:id, teacher_id:teacherId }); }

router.get('/', async (req,res,next) => {
 try {
  const exams=await Exam.find({teacher_id:req.user.id}).sort({created_at:-1}).lean();
  const enriched=await Promise.all(exams.map(async e=>{const [total_students,total_questions,submitted_count,in_progress_count]=await Promise.all([Submission.distinct('student_id',{exam_id:e._id}).then(x=>x.length),Question.countDocuments({exam_id:e._id}),Submission.countDocuments({exam_id:e._id,status:'submitted'}),Submission.countDocuments({exam_id:e._id,status:'in_progress'})]);return {...e,id:String(e._id),total_students,total_questions,submitted_count,in_progress_count};}));
  res.json({success:true,exams:enriched});
 } catch(err){next(err);}
});
router.post('/',async(req,res,next)=>{
 try{
  const {title,subject,instructions,durationMinutes,totalMarks,passingMarks,startDate,endDate,startTime,endTime,questionsPerAttempt,shuffleQuestions,shuffleOptions,negativeMarking,negativeMarkValue,selectedUnits=[]}=req.body;
  if(!title||!durationMinutes||Number(durationMinutes)<=0)return res.status(400).json({success:false,message:'Exam title and duration are required.'});
  let controllerId; for(let i=0;i<5;i++){controllerId=generateControllerId();if(!await Exam.exists({controller_id:controllerId}))break;}
  const exam=await Exam.create({teacher_id:req.user.id,controller_id,title:title.trim(),subject,instructions,duration_minutes:Number(durationMinutes),total_marks:Number(totalMarks)||0,passing_marks:Number(passingMarks)||0,start_date:startDate||undefined,end_date:endDate||undefined,start_time:startTime||undefined,end_time:endTime||undefined,questions_per_attempt:questionsPerAttempt?Number(questionsPerAttempt):undefined,shuffle_questions:shuffleQuestions!==false,shuffle_options:shuffleOptions!==false,negative_marking:!!negativeMarking,negative_mark_value:Number(negativeMarkValue)||0,status:'draft'});
  let preloaded=0;if(Array.isArray(selectedUnits)&&selectedUnits.length){const bank=await UnitQuestion.find({teacher_id:req.user.id,subject:subject,unit:{$in:selectedUnits}}).lean();if(bank.length){await Question.insertMany(bank.map(q=>({exam_id:exam._id,question_text:q.question_text,option_a:q.option_a,option_b:q.option_b,option_c:q.option_c,option_d:q.option_d,correct_option:q.correct_option,explanation:q.explanation,difficulty:q.difficulty,marks:q.marks,category:q.unit})));preloaded=bank.length;const sum=await Question.aggregate([{$match:{exam_id:exam._id}},{$group:{_id:null,total:{$sum:'$marks'}}}]);exam.total_marks=sum[0]?.total||0;await exam.save();}}
  res.status(201).json({success:true,message:'Exam created successfully. '+preloaded+' saved unit questions added.',exam:exam.toObject(),preloadedQuestions:preloaded});
 }catch(err){next(err);}
});
router.get('/:id',async(req,res,next)=>{try{const exam=await getOwnedExam(req.params.id,req.user.id);if(!exam)return res.status(404).json({success:false,message:'Exam not found.'});res.json({success:true,exam:exam.toObject()});}catch(err){next(err);}});
router.put('/:id',async(req,res,next)=>{
 try{
  const exam=await getOwnedExam(req.params.id,req.user.id);if(!exam)return res.status(404).json({success:false,message:'Exam not found.'});
  const map={durationMinutes:'duration_minutes',totalMarks:'total_marks',passingMarks:'passing_marks',startDate:'start_date',endDate:'end_date',startTime:'start_time',endTime:'end_time',questionsPerAttempt:'questions_per_attempt',shuffleQuestions:'shuffle_questions',shuffleOptions:'shuffle_options',negativeMarking:'negative_marking',negativeMarkValue:'negative_mark_value',registrationOpen:'registration_open'};
  const allowed=['title','subject','instructions','duration_minutes','total_marks','passing_marks','start_date','end_date','start_time','end_time','questions_per_attempt','shuffle_questions','shuffle_options','negative_marking','negative_mark_value','registration_open','status'];
  let changed=false;for(const [key,value] of Object.entries(req.body)){const field=map[key]||key;if(allowed.includes(field)){exam.set(field,value);changed=true;}}
  if(!changed)return res.status(400).json({success:false,message:'No valid fields to update.'});
  await exam.save();res.json({success:true,message:'Exam updated successfully.',exam:exam.toObject()});
 }catch(err){next(err);}
});
router.delete('/:id',async(req,res,next)=>{
 try{const exam=await getOwnedExam(req.params.id,req.user.id);if(!exam)return res.status(404).json({success:false,message:'Exam not found.'});
  const submissions=await Submission.find({exam_id:exam._id}).select('_id');const ids=submissions.map(s=>s._id);
  const {Answer}=require('../database/db');await Promise.all([Question.deleteMany({exam_id:exam._id}),Submission.deleteMany({exam_id:exam._id}),Answer.deleteMany({submission_id:{$in:ids}}),exam.deleteOne()]);
  res.json({success:true,message:'Exam deleted successfully.'});
 }catch(err){next(err);}
});
module.exports=router;
