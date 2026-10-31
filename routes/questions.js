const express=require('express');
const multer=require('multer');
const path=require('path');
const fs=require('fs');
const {Exam,Question,Answer}=require('../database/db');
const {verifyToken,requireRole}=require('../middleware/auth');
const router=express.Router();router.use(verifyToken,requireRole('teacher'));
const uploadDir=path.join(__dirname,'..','uploads','questions');fs.mkdirSync(uploadDir,{recursive:true});
const storage=multer.diskStorage({destination:(req,file,cb)=>cb(null,uploadDir),filename:(req,file,cb)=>cb(null,`${Date.now()}-${Math.round(Math.random()*1e9)}${path.extname(file.originalname)}`)});
const upload=multer({storage,limits:{fileSize:3*1024*1024},fileFilter:(req,file,cb)=>{const ok=['.png','.jpg','.jpeg','.gif','.webp'].includes(path.extname(file.originalname).toLowerCase());cb(ok?null:new Error('Only image files are allowed for question images.'),ok);}});
const validId=id=>/^[a-f\\d]{24}$/i.test(String(id));
async function ownsExam(id,teacherId){return validId(id)?Exam.findOne({_id:id,teacher_id:teacherId}):null;}
async function syncMarks(examId){const result=await Question.aggregate([{$match:{exam_id:examId}},{$group:{_id:null,total:{$sum:'$marks'}}}]);await Exam.updateOne({_id:examId},{$set:{total_marks:result[0]?.total||0}});}
router.get('/exams/:examId/questions',async(req,res,next)=>{try{
 const exam=await ownsExam(req.params.examId,req.user.id);if(!exam)return res.status(404).json({success:false,message:'Exam not found.'});
 const page=Math.max(1,Number(req.query.page)||1),limit=Math.min(100,Math.max(1,Number(req.query.limit)||20)),filter={exam_id:exam._id};
 if(req.query.search)filter.question_text={$regex:String(req.query.search).replace(/[.*+?^${}()|[\\]\\]/g,'\\$&'),$options:'i'};
 if(req.query.category)filter.category=req.query.category;if(req.query.difficulty)filter.difficulty=req.query.difficulty;
 const [total,questions]=await Promise.all([Question.countDocuments(filter),Question.find(filter).sort({_id:-1}).skip((page-1)*limit).limit(limit).lean()]);
 res.json({success:true,questions:questions.map(q=>({...q,id:String(q._id)})),total,page,limit});
}catch(err){next(err);}});
router.post('/exams/:examId/questions',upload.single('image'),async(req,res,next)=>{try{
 const exam=await ownsExam(req.params.examId,req.user.id);if(!exam)return res.status(404).json({success:false,message:'Exam not found.'});
 const {questionText,optionA,optionB,optionC,optionD,correctOption,explanation,category,difficulty,marks}=req.body;
 if(!questionText||!optionA||!optionB||!optionC||!optionD||!correctOption)return res.status(400).json({success:false,message:'Question text, all four options, and the correct option are required.'});
 if(!['a','b','c','d'].includes(String(correctOption).toLowerCase()))return res.status(400).json({success:false,message:'Correct option must be a, b, c, or d.'});
 const question=await Question.create({exam_id:exam._id,question_text:questionText.trim(),option_a:optionA,option_b:optionB,option_c:optionC,option_d:optionD,correct_option:correctOption.toLowerCase(),explanation,category,difficulty:difficulty||'medium',marks:Number(marks)||1,image_path:req.file?`/uploads/questions/${req.file.filename}`:undefined});
 await syncMarks(exam._id);res.status(201).json({success:true,message:'Question added successfully.',question:question.toObject()});
}catch(err){next(err);}});
router.put('/questions/:id',upload.single('image'),async(req,res,next)=>{try{
 if(!validId(req.params.id))return res.status(404).json({success:false,message:'Question not found.'});
 const question=await Question.findById(req.params.id);if(!question)return res.status(404).json({success:false,message:'Question not found.'});
 const exam=await ownsExam(question.exam_id,req.user.id);if(!exam)return res.status(403).json({success:false,message:'You do not have permission to edit this question.'});
 const map={questionText:'question_text',optionA:'option_a',optionB:'option_b',optionC:'option_c',optionD:'option_d',correctOption:'correct_option',explanation:'explanation',category:'category',difficulty:'difficulty',marks:'marks'};
 for(const [k,v] of Object.entries(req.body)){if(map[k]&&v!==undefined)question.set(map[k],k==='correctOption'?String(v).toLowerCase():k==='marks'?Number(v):v);}
 if(req.file)question.image_path=`/uploads/questions/${req.file.filename}`;
 await question.save();await syncMarks(question.exam_id);res.json({success:true,message:'Question updated successfully.',question:question.toObject()});
}catch(err){next(err);}});
router.delete('/questions/:id',async(req,res,next)=>{try{
 if(!validId(req.params.id))return res.status(404).json({success:false,message:'Question not found.'});
 const question=await Question.findById(req.params.id);if(!question)return res.status(404).json({success:false,message:'Question not found.'});
 if(!await ownsExam(question.exam_id,req.user.id))return res.status(403).json({success:false,message:'You do not have permission to delete this question.'});
 await Promise.all([question.deleteOne(),Answer.deleteMany({question_id:question._id})]);await syncMarks(question.exam_id);res.json({success:true,message:'Question deleted successfully.'});
}catch(err){next(err);}});
router.post('/exams/:examId/questions/import',express.json(),async(req,res,next)=>{try{
 const exam=await ownsExam(req.params.examId,req.user.id);if(!exam)return res.status(404).json({success:false,message:'Exam not found.'});
 const {questions}=req.body;if(!Array.isArray(questions)||!questions.length)return res.status(400).json({success:false,message:'Provide a non-empty array of questions to import.'});
 const docs=[],errors=[];questions.forEach((q,i)=>{if(!q.questionText||!q.optionA||!q.optionB||!q.optionC||!q.optionD||!['a','b','c','d'].includes(String(q.correctOption||'').toLowerCase())){errors.push(`Row ${i+1}: missing or invalid required fields, skipped.`);return;}docs.push({exam_id:exam._id,question_text:q.questionText,option_a:q.optionA,option_b:q.optionB,option_c:q.optionC,option_d:q.optionD,correct_option:String(q.correctOption).toLowerCase(),explanation:q.explanation,category:q.category,difficulty:q.difficulty||'medium',marks:Number(q.marks)||1});});
 if(docs.length)await Question.insertMany(docs);await syncMarks(exam._id);res.json({success:true,message:`Imported ${docs.length} of ${questions.length} questions.`,imported:docs.length,errors});
}catch(err){next(err);}});
router.get('/exams/:examId/questions/export',async(req,res,next)=>{try{
 const exam=await ownsExam(req.params.examId,req.user.id);if(!exam)return res.status(404).json({success:false,message:'Exam not found.'});
 const questions=await Question.find({exam_id:exam._id}).lean();res.setHeader('Content-Disposition',`attachment; filename="questions-exam-${exam.id}.json"`);res.json(questions.map(q=>({...q,id:String(q._id)})));
}catch(err){next(err);}});
module.exports=router;
