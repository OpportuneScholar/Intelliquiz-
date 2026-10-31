// routes/exams.js
const express = require('express');
const db = require('../database/db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { generateControllerId } = require('../utils/generateId');

const router = express.Router();
router.use(verifyToken, requireRole('teacher'));

// Helper: ensure the exam belongs to the logged-in teacher
function getOwnedExam(examId, teacherId) {
  return db.prepare('SELECT * FROM exams WHERE id = ? AND teacher_id = ?').get(examId, teacherId);
}

// GET /api/exams - list all exams for this teacher, with live counts
router.get('/', (req, res) => {
  const exams = db.prepare(`
    SELECT e.*,
      (SELECT COUNT(*) FROM students s WHERE s.exam_id = e.id) AS total_students,
      (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) AS total_questions,
      (SELECT COUNT(*) FROM submissions sub WHERE sub.exam_id = e.id AND sub.status = 'submitted') AS submitted_count,
      (SELECT COUNT(*) FROM submissions sub WHERE sub.exam_id = e.id AND sub.status = 'in_progress') AS in_progress_count
    FROM exams e
    WHERE e.teacher_id = ?
    ORDER BY e.created_at DESC
  `).all(req.user.id);

  res.json({ success: true, exams });
});

// POST /api/exams - create new exam, auto-generates controller_id
router.post('/', (req, res, next) => {
  try {
    const {
      title, subject, instructions, durationMinutes, totalMarks, passingMarks,
      startDate, endDate, startTime, endTime, questionsPerAttempt,
      shuffleQuestions, shuffleOptions, negativeMarking, negativeMarkValue
    } = req.body;

    if (!title || !durationMinutes) {
      return res.status(400).json({ success: false, message: 'Exam title and duration are required.' });
    }

    let controllerId;
    let attempts = 0;
    // Extremely unlikely to collide, but guard against it anyway.
    do {
      controllerId = generateControllerId();
      attempts++;
    } while (db.prepare('SELECT id FROM exams WHERE controller_id = ?').get(controllerId) && attempts < 5);

    const info = db.prepare(`
      INSERT INTO exams (
        teacher_id, controller_id, title, subject, instructions, duration_minutes,
        total_marks, passing_marks, start_date, end_date, start_time, end_time,
        questions_per_attempt, shuffle_questions, shuffle_options, negative_marking, negative_mark_value, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
    `).run(
      req.user.id, controllerId, title.trim(), subject || null, instructions || null,
      Number(durationMinutes), Number(totalMarks) || 0, Number(passingMarks) || 0,
      startDate || null, endDate || null, startTime || null, endTime || null,
      questionsPerAttempt ? Number(questionsPerAttempt) : null,
      shuffleQuestions === false ? 0 : 1, shuffleOptions === false ? 0 : 1,
      negativeMarking ? 1 : 0, Number(negativeMarkValue) || 0
    );

    const exam = getOwnedExam(info.lastInsertRowid, req.user.id);
    res.status(201).json({ success: true, message: 'Exam created successfully.', exam });
  } catch (err) {
    next(err);
  }
});

// GET /api/exams/:id
router.get('/:id', (req, res) => {
  const exam = getOwnedExam(req.params.id, req.user.id);
  if (!exam) return res.status(404).json({ success: false, message: 'Exam not found.' });
  res.json({ success: true, exam });
});

// PUT /api/exams/:id
router.put('/:id', (req, res, next) => {
  try {
    const exam = getOwnedExam(req.params.id, req.user.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found.' });

    const fields = [
      'title', 'subject', 'instructions', 'duration_minutes', 'total_marks', 'passing_marks',
      'start_date', 'end_date', 'start_time', 'end_time', 'questions_per_attempt',
      'shuffle_questions', 'shuffle_options', 'negative_marking', 'negative_mark_value',
      'registration_open', 'status'
    ];
    const camelToSnake = {
      durationMinutes: 'duration_minutes', totalMarks: 'total_marks', passingMarks: 'passing_marks',
      startDate: 'start_date', endDate: 'end_date', startTime: 'start_time', endTime: 'end_time',
      questionsPerAttempt: 'questions_per_attempt', shuffleQuestions: 'shuffle_questions',
      shuffleOptions: 'shuffle_options', negativeMarking: 'negative_marking',
      negativeMarkValue: 'negative_mark_value', registrationOpen: 'registration_open'
    };

    const updates = {};
    for (const [key, value] of Object.entries(req.body)) {
      const col = camelToSnake[key] || key;
      if (fields.includes(col)) updates[col] = value;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields to update.' });
    }

    const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates);
    db.prepare(`UPDATE exams SET ${setClause} WHERE id = ?`).run(...values, req.params.id);

    res.json({ success: true, message: 'Exam updated successfully.', exam: getOwnedExam(req.params.id, req.user.id) });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/exams/:id
router.delete('/:id', (req, res) => {
  const exam = getOwnedExam(req.params.id, req.user.id);
  if (!exam) return res.status(404).json({ success: false, message: 'Exam not found.' });

  db.prepare('DELETE FROM exams WHERE id = ?').run(req.params.id); // cascades to questions/students/submissions/answers
  res.json({ success: true, message: 'Exam deleted successfully.' });
});

module.exports = router;
