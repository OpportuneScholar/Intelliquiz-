const express=require('express');
const multer=require('multer');
const path=require('path');
const fs=require('fs');
const {Exam,Question,Answer,UnitQuestion}=require('../database/db');
const {verifyToken,requireRole}=require('../middleware/auth');
const router=express.Router();router.use(verifyToken,requireRole('teacher'));
const uploadDir=path.join(__dirname,'..','uploads','questions');fs.mkdirSync(uploadDir,{recursive:true});
const storage=multer.diskStorage({destination:(req,file,cb)=>cb(null,uploadDir),filename:(req,file,cb)=>cb(null,`${Date.now()}-${Math.round(Math.random()*1e9)}${path.extname(file.originalname)}`)});
const upload=multer({storage,limits:{fileSize:3*1024*1024},fileFilter:(req,file,cb)=>{const ok=['.png','.jpg','.jpeg','.gif','.webp'].includes(path.extname(file.originalname).toLowerCase());cb(ok?null:new Error('Only image files are allowed for question images.'),ok);}});
const validId=id=>/^[a-f\d]{24}$/i.test(String(id));
async function ownsExam(id,teacherId){return validId(id)?Exam.findOne({_id:id,teacher_id:teacherId}):null;}
async function syncMarks(examId){const result=await Question.aggregate([{$match:{exam_id:examId}},{$group:{_id:null,total:{$sum:'$marks'}}}]);await Exam.updateOne({_id:examId},{$set:{total_marks:result[0]?.total||0}});}
router.get('/exams/:examId/questions',async(req,res,next)=>{try{
 const exam=await ownsExam(req.params.examId,req.user.id);if(!exam)return res.status(404).json({success:false,message:'Exam not found.'});
 const page=Math.max(1,Number(req.query.page)||1),limit=Math.min(100,Math.max(1,Number(req.query.limit)||20)),filter={exam_id:exam._id};
 if(req.query.search){const escaped=String(req.query.search).split('').map(ch => '.*+?^${}()|[]\\'.includes(ch) ? String.fromCharCode(92)+ch : ch).join('');filter.question_text={$regex:escaped,$options:'i'};}
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

router.get('/question-bank/units',async(req,res,next)=>{try{const rows=await UnitQuestion.aggregate([{$match:{teacher_id:req.user._id||req.user.id}},{$group:{_id:{subject:'$subject',unit:'$unit'},count:{$sum:1}}},{$sort:{'_id.subject':1,'_id.unit':1}}]);res.json({success:true,units:rows.map(x=>({subject:x._id.subject||'',unit:x._id.unit,count:x.count}))});}catch(err){next(err);}});
router.get('/question-bank/questions',async(req,res,next)=>{try{const filter={teacher_id:req.user.id};if(req.query.subject)filter.subject=req.query.subject;if(req.query.unit)filter.unit=req.query.unit;const questions=await UnitQuestion.find(filter).sort({unit:1,_id:-1}).lean();res.json({success:true,questions:questions.map(q=>({...q,id:String(q._id)}))});}catch(err){next(err);}});
router.post('/question-bank/import',async(req,res,next)=>{try{const {subject,unit,questions}=req.body;if(!subject?.trim()||!unit?.trim()||!Array.isArray(questions)||!questions.length)return res.status(400).json({success:false,message:'Subject, unit and a non-empty questions array are required.'});if(questions.length>1000)return res.status(400).json({success:false,message:'Import is limited to 1000 questions per file.'});const docs=[],errors=[];questions.forEach((q,i)=>{const correct=String(q.correctOption||q.correct_option||'').toLowerCase();const vals=[q.questionText||q.question_text,q.optionA||q.option_a,q.optionB||q.option_b,q.optionC||q.option_c,q.optionD||q.option_d];if(vals.some(v=>!String(v||'').trim())||!['a','b','c','d'].includes(correct)){errors.push('Row '+(i+1)+': invalid question/options/correctOption');return;}docs.push({teacher_id:req.user.id,subject:subject.trim(),unit:unit.trim(),question_text:String(vals[0]).trim(),option_a:String(vals[1]).trim(),option_b:String(vals[2]).trim(),option_c:String(vals[3]).trim(),option_d:String(vals[4]).trim(),correct_option:correct,explanation:q.explanation||'',difficulty:q.difficulty||'medium',marks:Number(q.marks)||1});});if(docs.length)await UnitQuestion.insertMany(docs);res.status(201).json({success:true,imported:docs.length,skipped:errors.length,errors});}catch(err){next(err);}});
router.post('/exams/:examId/questions/from-bank',async(req,res,next)=>{try{const exam=await ownsExam(req.params.examId,req.user.id);if(!exam)return res.status(404).json({success:false,message:'Exam not found.'});const ids=Array.isArray(req.body.questionIds)?req.body.questionIds:[];if(!ids.length)return res.status(400).json({success:false,message:'Select at least one saved question.'});const saved=await UnitQuestion.find({_id:{$in:ids},teacher_id:req.user.id}).lean();if(saved.length!==ids.length)return res.status(400).json({success:false,message:'Some selected questions were not found in your question bank.'});const docs=saved.map(q=>({exam_id:exam._id,question_text:q.question_text,option_a:q.option_a,option_b:q.option_b,option_c:q.option_c,option_d:q.option_d,correct_option:q.correct_option,explanation:q.explanation,difficulty:q.difficulty,marks:q.marks,category:q.unit}));await Question.insertMany(docs);await syncMarks(exam._id);res.status(201).json({success:true,added:docs.length,message:docs.length+' questions added to this exam.'});}catch(err){next(err);}});
router.delete('/question-bank/questions/:id',async(req,res,next)=>{try{if(!validId(req.params.id))return res.status(404).json({success:false,message:'Saved question not found.'});const deleted=await UnitQuestion.findOneAndDelete({_id:req.params.id,teacher_id:req.user.id});if(!deleted)return res.status(404).json({success:false,message:'Saved question not found.'});res.json({success:true,message:'Saved question deleted.'});}catch(err){next(err);}});

module.exports=router;
