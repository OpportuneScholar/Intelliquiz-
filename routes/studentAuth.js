// routes/studentAuth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database/db');
const { signToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/student/verify-controller/:controllerId
// Lets the registration form show exam title/subject before the student commits.
router.get('/verify-controller/:controllerId', (req, res) => {
  const controllerId = req.params.controllerId.trim().toUpperCase();
  const exam = db.prepare(
    `SELECT id, title, subject, controller_id, registration_open, status
     FROM exams WHERE controller_id = ?`
  ).get(controllerId);

  if (!exam) {
    return res.status(404).json({ success: false, message: 'Invalid Controller ID. Please check the code and try again.' });
  }
  if (!exam.registration_open) {
    return res.status(403).json({ success: false, message: 'Registration is closed for this examination.' });
  }

  res.json({ success: true, exam: { title: exam.title, subject: exam.subject, controllerId: exam.controller_id } });
});

// POST /api/student/register
router.post('/register', async (req, res, next) => {
  try {
    const { controllerId, name, rollNumber, email, password } = req.body;

    if (!controllerId || !name || !rollNumber || !password) {
      return res.status(400).json({ success: false, message: 'Controller ID, name, roll number, and password are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }

    const exam = db.prepare('SELECT * FROM exams WHERE controller_id = ?').get(controllerId.trim().toUpperCase());
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Invalid Controller ID. Please check with your teacher.' });
    }
    if (!exam.registration_open) {
      return res.status(403).json({ success: false, message: 'Registration is closed for this examination.' });
    }

    // Prevent duplicate registration under the same Controller ID (by roll number)
    const existing = db.prepare(
      'SELECT id FROM students WHERE exam_id = ? AND roll_number = ?'
    ).get(exam.id, rollNumber.trim());

    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'This student is already registered for this examination.'
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const info = db.prepare(
      `INSERT INTO students (exam_id, controller_id, name, roll_number, email, password_hash)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(exam.id, exam.controller_id, name.trim(), rollNumber.trim(), email || null, passwordHash);

    // Pre-create a "not_started" submission record so status can always be looked up
    db.prepare(
      `INSERT INTO submissions (student_id, exam_id, status) VALUES (?, ?, 'not_started')`
    ).run(info.lastInsertRowid, exam.id);

    const student = { id: info.lastInsertRowid, name: name.trim(), rollNumber: rollNumber.trim() };
    const token = signToken({ id: student.id, role: 'student', examId: exam.id, name: student.name });

    res.status(201).json({
      success: true,
      message: 'Registration successful. You may now log in to your exam.',
      token,
      user: { id: student.id, name: student.name, rollNumber: student.rollNumber, examTitle: exam.title }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/student/login
router.post('/login', async (req, res, next) => {
  try {
    const { controllerId, rollNumber, password } = req.body;
    if (!controllerId || !rollNumber || !password) {
      return res.status(400).json({ success: false, message: 'Controller ID, roll number, and password are required.' });
    }

    const exam = db.prepare('SELECT * FROM exams WHERE controller_id = ?').get(controllerId.trim().toUpperCase());
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Invalid Controller ID.' });
    }

    const student = db.prepare(
      'SELECT * FROM students WHERE exam_id = ? AND roll_number = ?'
    ).get(exam.id, rollNumber.trim());

    if (!student) {
      return res.status(401).json({ success: false, message: 'Invalid roll number or password.' });
    }

    const match = await bcrypt.compare(password, student.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid roll number or password.' });
    }

    const token = signToken({ id: student.id, role: 'student', examId: exam.id, name: student.name });

    res.json({
      success: true,
      message: `Welcome, ${student.name}!`,
      token,
      user: { id: student.id, name: student.name, rollNumber: student.roll_number, examTitle: exam.title }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
