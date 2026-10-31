// routes/questions.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database/db');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken, requireRole('teacher'));

const uploadDir = path.join(__dirname, '..', 'uploads', 'questions');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, unique);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
  fileFilter: (req, file, cb) => {
    const ok = ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Only image files are allowed for question images.'), ok);
  }
});

function ownsExam(examId, teacherId) {
  return db.prepare('SELECT id FROM exams WHERE id = ? AND teacher_id = ?').get(examId, teacherId);
}

// GET /api/exams/:examId/questions - supports search/filter/pagination
router.get('/exams/:examId/questions', (req, res) => {
  const exam = ownsExam(req.params.examId, req.user.id);
  if (!exam) return res.status(404).json({ success: false, message: 'Exam not found.' });

  const { search = '', category = '', difficulty = '', page = 1, limit = 20 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let where = 'exam_id = ?';
  const params = [req.params.examId];

  if (search) {
    where += ' AND question_text LIKE ?';
    params.push(`%${search}%`);
  }
  if (category) {
    where += ' AND category = ?';
    params.push(category);
  }
  if (difficulty) {
    where += ' AND difficulty = ?';
    params.push(difficulty);
  }

  const total = db.prepare(`SELECT COUNT(*) AS c FROM questions WHERE ${where}`).get(...params).c;
  const questions = db.prepare(
    `SELECT * FROM questions WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`
  ).all(...params, Number(limit), offset);

  res.json({ success: true, questions, total, page: Number(page), limit: Number(limit) });
});

// POST /api/exams/:examId/questions - add a question (with optional image)
router.post('/exams/:examId/questions', upload.single('image'), (req, res, next) => {
  try {
    const exam = ownsExam(req.params.examId, req.user.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found.' });

    const {
      questionText, optionA, optionB, optionC, optionD,
      correctOption, explanation, category, difficulty, marks
    } = req.body;

    if (!questionText || !optionA || !optionB || !optionC || !optionD || !correctOption) {
      return res.status(400).json({ success: false, message: 'Question text, all four options, and the correct option are required.' });
    }
    if (!['a', 'b', 'c', 'd'].includes(correctOption.toLowerCase())) {
      return res.status(400).json({ success: false, message: 'Correct option must be a, b, c, or d.' });
    }

    const imagePath = req.file ? `/uploads/questions/${req.file.filename}` : null;

    const info = db.prepare(`
      INSERT INTO questions (exam_id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, category, difficulty, marks, image_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.params.examId, questionText.trim(), optionA, optionB, optionC, optionD,
      correctOption.toLowerCase(), explanation || null, category || null,
      difficulty || 'medium', Number(marks) || 1, imagePath
    );

    // Keep exam total_marks in sync
    db.prepare(`
      UPDATE exams SET total_marks = (SELECT COALESCE(SUM(marks),0) FROM questions WHERE exam_id = ?) WHERE id = ?
    `).run(req.params.examId, req.params.examId);

    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ success: true, message: 'Question added successfully.', question });
  } catch (err) {
    next(err);
  }
});

// PUT /api/questions/:id
router.put('/questions/:id', upload.single('image'), (req, res, next) => {
  try {
    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.id);
    if (!question) return res.status(404).json({ success: false, message: 'Question not found.' });

    const exam = ownsExam(question.exam_id, req.user.id);
    if (!exam) return res.status(403).json({ success: false, message: 'You do not have permission to edit this question.' });

    const {
      questionText, optionA, optionB, optionC, optionD,
      correctOption, explanation, category, difficulty, marks
    } = req.body;

    const imagePath = req.file ? `/uploads/questions/${req.file.filename}` : question.image_path;

    db.prepare(`
      UPDATE questions SET
        question_text = ?, option_a = ?, option_b = ?, option_c = ?, option_d = ?,
        correct_option = ?, explanation = ?, category = ?, difficulty = ?, marks = ?, image_path = ?
      WHERE id = ?
    `).run(
      questionText || question.question_text,
      optionA || question.option_a, optionB || question.option_b,
      optionC || question.option_c, optionD || question.option_d,
      (correctOption || question.correct_option).toLowerCase(),
      explanation !== undefined ? explanation : question.explanation,
      category !== undefined ? category : question.category,
      difficulty || question.difficulty,
      marks !== undefined ? Number(marks) : question.marks,
      imagePath,
      req.params.id
    );

    db.prepare(`
      UPDATE exams SET total_marks = (SELECT COALESCE(SUM(marks),0) FROM questions WHERE exam_id = ?) WHERE id = ?
    `).run(question.exam_id, question.exam_id);

    const updated = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.id);
    res.json({ success: true, message: 'Question updated successfully.', question: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/questions/:id
router.delete('/questions/:id', (req, res) => {
  const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.id);
  if (!question) return res.status(404).json({ success: false, message: 'Question not found.' });

  const exam = ownsExam(question.exam_id, req.user.id);
  if (!exam) return res.status(403).json({ success: false, message: 'You do not have permission to delete this question.' });

  db.prepare('DELETE FROM questions WHERE id = ?').run(req.params.id);
  db.prepare(`
    UPDATE exams SET total_marks = (SELECT COALESCE(SUM(marks),0) FROM questions WHERE exam_id = ?) WHERE id = ?
  `).run(question.exam_id, question.exam_id);

  res.json({ success: true, message: 'Question deleted successfully.' });
});

// POST /api/exams/:examId/questions/import - bulk import via JSON array
router.post('/exams/:examId/questions/import', express.json(), (req, res, next) => {
  try {
    const exam = ownsExam(req.params.examId, req.user.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found.' });

    const { questions } = req.body;
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ success: false, message: 'Provide a non-empty array of questions to import.' });
    }

    const insert = db.prepare(`
      INSERT INTO questions (exam_id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, category, difficulty, marks)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let imported = 0;
    const errors = [];
    const insertMany = db.transaction((rows) => {
      rows.forEach((q, idx) => {
        if (!q.questionText || !q.optionA || !q.optionB || !q.optionC || !q.optionD || !q.correctOption) {
          errors.push(`Row ${idx + 1}: missing required fields, skipped.`);
          return;
        }
        insert.run(
          req.params.examId, q.questionText, q.optionA, q.optionB, q.optionC, q.optionD,
          String(q.correctOption).toLowerCase(), q.explanation || null, q.category || null,
          q.difficulty || 'medium', Number(q.marks) || 1
        );
        imported++;
      });
    });
    insertMany(questions);

    db.prepare(`
      UPDATE exams SET total_marks = (SELECT COALESCE(SUM(marks),0) FROM questions WHERE exam_id = ?) WHERE id = ?
    `).run(req.params.examId, req.params.examId);

    res.json({ success: true, message: `Imported ${imported} of ${questions.length} questions.`, imported, errors });
  } catch (err) {
    next(err);
  }
});

// GET /api/exams/:examId/questions/export - export question bank as JSON (download)
router.get('/exams/:examId/questions/export', (req, res) => {
  const exam = ownsExam(req.params.examId, req.user.id);
  if (!exam) return res.status(404).json({ success: false, message: 'Exam not found.' });

  const questions = db.prepare('SELECT * FROM questions WHERE exam_id = ?').all(req.params.examId);
  res.setHeader('Content-Disposition', `attachment; filename="questions-exam-${req.params.examId}.json"`);
  res.json(questions);
});

module.exports = router;
