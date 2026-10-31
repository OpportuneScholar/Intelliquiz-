const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Exam, Student, Submission } = require('../database/db');
const { signToken, verifyToken, requireRole } = require('../middleware/auth');
const router = express.Router();
const normalizeEmail = value => String(value || '').trim().toLowerCase();
const normalizeCode = value => String(value || '').trim().toUpperCase();
const publicUser = student => ({id:student.id,name:student.name,rollNumber:student.roll_number,email:student.email,registeredAt:student.registered_at});
async function enroll(student, code) {
  const exam = await Exam.findOne({controller_id:normalizeCode(code)});
  if (!exam) { const error=new Error('Invalid Controller ID.'); error.status=404; throw error; }
  let submission = await Submission.findOne({student_id:student._id,exam_id:exam._id});
  if (!submission && !exam.registration_open) { const error=new Error('Registration is closed for this examination.'); error.status=403; throw error; }
  if (!submission) submission = await Submission.create({student_id:student._id,exam_id:exam._id,status:'not_started'});
  return {exam,submission};
}
router.get('/verify-controller/:controllerId', async (req,res,next)=>{try{
 const exam=await Exam.findOne({controller_id:normalizeCode(req.params.controllerId)}).select('title subject controller_id registration_open');
 if(!exam)return res.status(404).json({success:false,message:'Invalid Controller ID.'});
 if(!exam.registration_open)return res.status(403).json({success:false,message:'Registration is closed for this examination.'});
 res.json({success:true,exam:{title:exam.title,subject:exam.subject,controllerId:exam.controller_id}});
}catch(err){next(err);}});
router.post('/register',async(req,res,next)=>{try{
 const {name,rollNumber,password,controllerId}=req.body,email=normalizeEmail(req.body.email);
 if(!name?.trim()||!rollNumber?.trim()||!email||!password)return res.status(400).json({success:false,message:'Name, roll number, email, and password are required.'});
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({success:false,message:'Enter a valid email address.'});
 if(String(password).length<8)return res.status(400).json({success:false,message:'Password must be at least 8 characters long.'});
 if(await Student.exists({email}))return res.status(409).json({success:false,message:'An account with this email already exists. Please log in.'});
 let exam=null;
 if(controllerId?.trim()){
  exam=await Exam.findOne({controller_id:normalizeCode(controllerId)});
  if(!exam)return res.status(404).json({success:false,message:'Invalid Controller ID.'});
  if(!exam.registration_open)return res.status(403).json({success:false,message:'Registration is closed for this examination.'});
 }
 const student=await Student.create({name:name.trim(),roll_number:rollNumber.trim(),email,password_hash:await bcrypt.hash(password,12)});
 if(exam)await Submission.create({student_id:student._id,exam_id:exam._id,status:'not_started'});
 const token=signToken({id:student.id,role:'student',...(exam?{examId:exam.id}:{}),name:student.name});
 res.status(201).json({success:true,message:'Account created successfully.',token,user:{...publicUser(student),examId:exam?.id||null,examTitle:exam?.title||null}});
}catch(err){next(err);}});
router.post('/login',async(req,res,next)=>{try{
 const email=normalizeEmail(req.body.email),password=req.body.password,controllerId=req.body.controllerId;
 if(!email||!password)return res.status(400).json({success:false,message:'Email and password are required.'});
 const student=await Student.findOne({email});
 if(!student||!(await bcrypt.compare(password,student.password_hash)))return res.status(401).json({success:false,message:'Invalid email or password.'});
 let exam=null;
 if(controllerId?.trim()){({exam}=await enroll(student,controllerId));}
 const token=signToken({id:student.id,role:'student',...(exam?{examId:exam.id}:{}),name:student.name});
 res.json({success:true,message:exam?'Login successful. Opening your examination.':`Welcome, ${student.name}!`,token,user:{...publicUser(student),examId:exam?.id||null,examTitle:exam?.title||null}});
}catch(err){if(err.status)return res.status(err.status).json({success:false,message:err.message});next(err);}});
router.post('/forgot-password',async(req,res,next)=>{try{
 const email=normalizeEmail(req.body.email),generic='If an account exists for this email, password reset instructions have been sent.';
 if(email){
  const student=await Student.findOne({email});
  if(student){
   const configured=process.env.RESEND_API_KEY&&process.env.RESEND_FROM_EMAIL&&process.env.APP_BASE_URL;
   if(!configured){console.error('[password-reset] Resend is not configured; set RESEND_API_KEY, RESEND_FROM_EMAIL and APP_BASE_URL in Render.');return res.json({success:true,message:generic});}
   const raw=crypto.randomBytes(32).toString('hex'),hash=crypto.createHash('sha256').update(raw).digest('hex');
   student.password_reset_token_hash=hash;student.password_reset_expires_at=new Date(Date.now()+30*60*1000);await student.save();
   const url=`${process.env.APP_BASE_URL.replace(/\/$/,'')}/reset-password.html?token=${raw}`;
   const escapeHtml=value=>String(value||'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
   const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.RESEND_FROM_EMAIL,to:[student.email],subject:'Reset your IntelliQuiz password',html:`<p>Hello ${escapeHtml(student.name)}</p><p>Use the link below to reset your password. It expires in 30 minutes.</p><p><a href="${url}">Reset password</a></p><p>If you did not request this, ignore this email.</p>`})});
   if(!response.ok){console.error('[resend] Email delivery failed:',await response.text());}
  }
 }
 res.json({success:true,message:generic});
}catch(err){console.error('[password-reset] Request failed:',err.message);res.json({success:true,message:'If an account exists for this email, password reset instructions have been sent.'});}});
router.post('/reset-password',async(req,res,next)=>{try{
 const {token,password}=req.body;
 if(!token||!password||String(password).length<8)return res.status(400).json({success:false,message:'A valid reset token and password of at least 8 characters are required.'});
 const hash=crypto.createHash('sha256').update(String(token)).digest('hex');
 const student=await Student.findOne({password_reset_token_hash:hash,password_reset_expires_at:{$gt:new Date()}});
 if(!student)return res.status(400).json({success:false,message:'This reset link is invalid or expired. Request a new one.'});
 student.password_hash=await bcrypt.hash(password,12);student.password_reset_token_hash=undefined;student.password_reset_expires_at=undefined;await student.save();
 res.json({success:true,message:'Password updated. You can now log in.'});
}catch(err){next(err);}});
router.post('/join',verifyToken,requireRole('student'),async(req,res,next)=>{try{
 const student=await Student.findById(req.user.id);if(!student)return res.status(404).json({success:false,message:'Student account not found.'});
 const {exam,submission}=await enroll(student,req.body.controllerId);
 res.json({success:true,message:'Examination added to your dashboard.',exam:{id:exam.id,title:exam.title,subject:exam.subject,controllerId:exam.controller_id,status:exam.status,submissionStatus:submission.status}});
}catch(err){if(err.status)return res.status(err.status).json({success:false,message:err.message});next(err);}});
router.get('/exams',verifyToken,requireRole('student'),async(req,res,next)=>{try{
 const rows=await Submission.find({student_id:req.user.id}).populate('exam_id','title subject controller_id status duration_minutes total_marks passing_marks registration_open').sort({created_at:-1}).lean();
 res.json({success:true,exams:rows.filter(x=>x.exam_id).map(x=>({id:String(x.exam_id._id),title:x.exam_id.title,subject:x.exam_id.subject,controllerId:x.exam_id.controller_id,status:x.exam_id.status,durationMinutes:x.exam_id.duration_minutes,totalMarks:x.exam_id.total_marks,passingMarks:x.exam_id.passing_marks,submissionStatus:x.status}))});
}catch(err){next(err);}});
module.exports=router;
