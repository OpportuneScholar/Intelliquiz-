// routes/teacherDashboard.js
const express = require('express');
const { Parser } = require('json2csv');
const db = require('../database/db');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken, requireRole('teacher'));

function ownsExam(examId, teacherId) {
  return db.prepare('SELECT * FROM exams WHERE id = ? AND teacher_id = ?').get(examId, teacherId);
}

// GET /api/dashboard/overview - aggregate stats across all of the teacher's exams
router.get('/overview', (req, res) => {
  const teacherId = req.user.id;

  const totals = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM exams WHERE teacher_id = ?) AS total_exams,
      (SELECT COUNT(*) FROM exams WHERE teacher_id = ? AND status = 'active') AS active_exams,
      (SELECT COUNT(*) FROM exams WHERE teacher_id = ? AND status = 'completed') AS completed_exams,
      (SELECT COUNT(*) FROM questions q JOIN exams e ON q.exam_id = e.id WHERE e.teacher_id = ?) AS total_questions,
      (SELECT COUNT(DISTINCT s.id) FROM students s JOIN exams e ON s.exam_id = e.id WHERE e.teacher_id = ?) AS total_students,
      (SELECT COUNT(*) FROM submissions sub JOIN exams e ON sub.exam_id = e.id WHERE e.teacher_id = ? AND sub.status = 'in_progress') AS live_participants
  `).get(teacherId, teacherId, teacherId, teacherId, teacherId, teacherId);

  const scoreStats = db.prepare(`
    SELECT
      AVG(CASE WHEN sub.total_marks > 0 THEN (sub.score * 100.0 / sub.total_marks) END) AS avg_percentage,
      SUM(CASE WHEN sub.total_marks > 0 AND sub.score >= e.passing_marks THEN 1 ELSE 0 END) AS pass_count,
      COUNT(*) AS graded_count
    FROM submissions sub
    JOIN exams e ON sub.exam_id = e.id
    WHERE e.teacher_id = ? AND sub.status = 'submitted'
  `).get(teacherId);

  const passPercentage = scoreStats.graded_count > 0
    ? Math.round((scoreStats.pass_count / scoreStats.graded_count) * 1000) / 10
    : 0;

  const recentActivity = db.prepare(`
    SELECT s.name AS student_name, e.title AS exam_title, sub.status, sub.score, sub.total_marks,
           COALESCE(sub.submitted_at, sub.started_at) AS activity_time
    FROM submissions sub
    JOIN students s ON sub.student_id = s.id
    JOIN exams e ON sub.exam_id = e.id
    WHERE e.teacher_id = ? AND sub.status != 'not_started'
    ORDER BY activity_time DESC
    LIMIT 10
  `).all(teacherId);

  res.json({
    success: true,
    stats: {
      ...totals,
      average_score: scoreStats.avg_percentage ? Math.round(scoreStats.avg_percentage * 10) / 10 : 0,
      pass_percentage: passPercentage
    },
    recentActivity
  });
});

// GET /api/dashboard/exams/:examId/students - with search/filter/status
router.get('/exams/:examId/students', (req, res) => {
  const exam = ownsExam(req.params.examId, req.user.id);
  if (!exam) return res.status(404).json({ success: false, message: 'Exam not found.' });

  const { search = '', status = '' } = req.query;
  let where = 's.exam_id = ?';
  const params = [req.params.examId];

  if (search) {
    where += ' AND (s.name LIKE ? OR s.roll_number LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  if (status) {
    where += ' AND sub.status = ?';
    params.push(status);
  }

  const students = db.prepare(`
    SELECT s.id, s.name, s.roll_number, s.email, s.registered_at,
           sub.status, sub.score, sub.total_marks, sub.submitted_at, sub.time_taken_seconds
    FROM students s
    LEFT JOIN submissions sub ON sub.student_id = s.id AND sub.exam_id = s.exam_id
    WHERE ${where}
    ORDER BY s.name ASC
  `).all(...params);

  res.json({ success: true, students });
});

// POST /api/dashboard/students/:studentId/reset-attempt
router.post('/students/:studentId/reset-attempt', (req, res) => {
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.studentId);
  if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

  const exam = ownsExam(student.exam_id, req.user.id);
  if (!exam) return res.status(403).json({ success: false, message: 'You do not have permission to modify this student.' });

  const submission = db.prepare('SELECT * FROM submissions WHERE student_id = ? AND exam_id = ?').get(student.id, student.exam_id);
  if (submission) {
    db.prepare('DELETE FROM answers WHERE submission_id = ?').run(submission.id);
    db.prepare(`
      UPDATE submissions SET status = 'not_started', question_order = NULL, started_at = NULL,
        submitted_at = NULL, score = 0, total_marks = 0, correct_count = 0, incorrect_count = 0,
        skipped_count = 0, time_taken_seconds = NULL
      WHERE id = ?
    `).run(submission.id);
  }

  res.json({ success: true, message: `Attempt reset for ${student.name}. They may now reattempt the exam.` });
});

// DELETE /api/dashboard/students/:studentId
router.delete('/students/:studentId', (req, res) => {
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.studentId);
  if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

  const exam = ownsExam(student.exam_id, req.user.id);
  if (!exam) return res.status(403).json({ success: false, message: 'You do not have permission to delete this student.' });

  db.prepare('DELETE FROM students WHERE id = ?').run(student.id);
  res.json({ success: true, message: `${student.name} has been removed.` });
});

// GET /api/dashboard/exams/:examId/results - full results with analytics
router.get('/exams/:examId/results', (req, res) => {
  const exam = ownsExam(req.params.examId, req.user.id);
  if (!exam) return res.status(404).json({ success: false, message: 'Exam not found.' });

  const results = db.prepare(`
    SELECT s.name, s.roll_number, s.email, sub.status, sub.score, sub.total_marks,
           sub.correct_count, sub.incorrect_count, sub.skipped_count,
           sub.time_taken_seconds, sub.submitted_at
    FROM students s
    LEFT JOIN submissions sub ON sub.student_id = s.id AND sub.exam_id = s.exam_id
    WHERE s.exam_id = ?
    ORDER BY sub.score DESC
  `).all(req.params.examId);

  res.json({ success: true, exam, results });
});

// GET /api/dashboard/exams/:examId/export.csv - downloadable CSV (opens in Excel)
router.get('/exams/:examId/export.csv', (req, res, next) => {
  try {
    const exam = ownsExam(req.params.examId, req.user.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found.' });

    const rows = db.prepare(`
      SELECT s.name AS "Student Name", s.roll_number AS "Roll Number", s.email AS "Email",
             sub.status AS "Status", sub.score AS "Score", sub.total_marks AS "Total Marks",
             ROUND(CASE WHEN sub.total_marks > 0 THEN sub.score * 100.0 / sub.total_marks ELSE 0 END, 2) AS "Percentage",
             sub.correct_count AS "Correct", sub.incorrect_count AS "Incorrect", sub.skipped_count AS "Skipped",
             sub.time_taken_seconds AS "Time Taken (s)", sub.submitted_at AS "Submitted At"
      FROM students s
      LEFT JOIN submissions sub ON sub.student_id = s.id AND sub.exam_id = s.exam_id
      WHERE s.exam_id = ?
      ORDER BY sub.score DESC
    `).all(req.params.examId);

    const parser = new Parser();
    const csv = parser.parse(rows);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${exam.title.replace(/\W+/g, '_')}_results.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
