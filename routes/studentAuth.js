const express = require('express');
const bcrypt = require('bcryptjs');
const { Exam, Student, Submission } = require('../database/db');
const { signToken } = require('../middleware/auth');
const router = express.Router();

router.get('/verify-controller/:controllerId', async (req, res, next) => {
  try {
    const controllerId = req.params.controllerId.trim().toUpperCase();
    const exam = await Exam.findOne({ controller_id:controllerId }).select('title subject controller_id registration_open status');
    if (!exam) return res.status(404).json({ success:false, message:'Invalid Controller ID. Please check the code and try again.' });
    if (!exam.registration_open) return res.status(403).json({ success:false, message:'Registration is closed for this examination.' });
    res.json({ success:true, exam:{ title:exam.title, subject:exam.subject, controllerId:exam.controller_id } });
  } catch (err) { next(err); }
});

router.post('/register', async (req, res, next) => {
  try {
    const { controllerId, name, rollNumber, email, password } = req.body;
    if (!controllerId || !name || !rollNumber || !password) return res.status(400).json({ success:false, message:'Controller ID, name, roll number, and password are required.' });
    if (String(password).length < 6) return res.status(400).json({ success:false, message:'Password must be at least 6 characters long.' });
    const exam = await Exam.findOne({ controller_id:controllerId.trim().toUpperCase() });
    if (!exam) return res.status(404).json({ success:false, message:'Invalid Controller ID. Please check with your teacher.' });
    if (!exam.registration_open) return res.status(403).json({ success:false, message:'Registration is closed for this examination.' });
    const normalizedRoll = rollNumber.trim();
    if (await Student.exists({ exam_id:exam._id, roll_number:normalizedRoll })) return res.status(409).json({ success:false, message:'This student is already registered for this examination.' });
    const student = await Student.create({ exam_id:exam._id, controller_id:exam.controller_id, name:name.trim(), roll_number:normalizedRoll, email:email || undefined, password_hash:await bcrypt.hash(password,10) });
    await Submission.create({ student_id:student._id, exam_id:exam._id, status:'not_started' });
    const user = { id:student.id, name:student.name, rollNumber:student.roll_number };
    const token = signToken({ id:student.id, role:'student', examId:exam.id, name:student.name });
    res.status(201).json({ success:true, message:'Registration successful. You may now log in to your exam.', token, user:{ ...user, examTitle:exam.title } });
  } catch (err) { next(err); }
});

router.post('/login', async (req, res, next) => {
  try {
    const { controllerId, rollNumber, password } = req.body;
    if (!controllerId || !rollNumber || !password) return res.status(400).json({ success:false, message:'Controller ID, roll number, and password are required.' });
    const exam = await Exam.findOne({ controller_id:controllerId.trim().toUpperCase() });
    if (!exam) return res.status(404).json({ success:false, message:'Invalid Controller ID.' });
    const student = await Student.findOne({ exam_id:exam._id, roll_number:rollNumber.trim() });
    if (!student || !(await bcrypt.compare(password, student.password_hash))) return res.status(401).json({ success:false, message:'Invalid roll number or password.' });
    const token = signToken({ id:student.id, role:'student', examId:exam.id, name:student.name });
    res.json({ success:true, message:`Welcome, ${student.name}!`, token, user:{ id:student.id, name:student.name, rollNumber:student.roll_number, examTitle:exam.title } });
  } catch (err) { next(err); }
});
module.exports = router;
