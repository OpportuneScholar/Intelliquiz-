// routes/studentExam.js
const express = require('express');
const db = require('../database/db');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken, requireRole('student'));

function shuffle(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// GET /api/student-exam/status - profile + exam info + current submission status
// This is the single source of truth that blocks re-attempts, no matter how the
// student got here (fresh login, refresh, new device, new browser).
router.get('/status', (req, res) => {
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.user.id);
  if (!student) return res.status(404).json({ success: false, message: 'Student record not found.' });

  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(student.exam_id);
  const submission = db.prepare('SELECT * FROM submissions WHERE student_id = ? AND exam_id = ?').get(student.id, student.exam_id);

  res.json({
    success: true,
    student: { id: student.id, name: student.name, rollNumber: student.roll_number, email: student.email },
    exam: {
      id: exam.id, title: exam.title, subject: exam.subject, instructions: exam.instructions,
      durationMinutes: exam.duration_minutes, totalMarks: exam.total_marks, passingMarks: exam.passing_marks,
      startDate: exam.start_date, endDate: exam.end_date, startTime: exam.start_time, endTime: exam.end_time,
      status: exam.status
    },
    submission: submission ? {
      status: submission.status,
      startedAt: submission.started_at,
      submittedAt: submission.submitted_at,
      score: submission.score,
      totalMarks: submission.total_marks
    } : { status: 'not_started' }
  });
});

// POST /api/student-exam/start - creates/resumes an in_progress attempt and returns questions
// WITHOUT correct answers. Blocks outright if already submitted.
router.post('/start', (req, res, next) => {
  try {
    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.user.id);
    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(student.exam_id);
    let submission = db.prepare('SELECT * FROM submissions WHERE student_id = ? AND exam_id = ?').get(student.id, exam.id);

    if (submission && submission.status === 'submitted') {
      return res.status(403).json({
        success: false,
        locked: true,
        message: 'You have already submitted this examination. Reattempt is not allowed.'
      });
    }

    let questionOrder;

    if (submission && submission.status === 'in_progress' && submission.question_order) {
      // Resume existing attempt with the SAME question order/selection as before
      questionOrder = JSON.parse(submission.question_order);
    } else {
      // Fresh start: pick + order questions
      let allQuestions = db.prepare('SELECT id FROM questions WHERE exam_id = ?').all(exam.id).map(q => q.id);
      if (allQuestions.length === 0) {
        return res.status(400).json({ success: false, message: 'This exam has no questions yet. Please contact your teacher.' });
      }
      if (exam.shuffle_questions) allQuestions = shuffle(allQuestions);
      if (exam.questions_per_attempt && exam.questions_per_attempt < allQuestions.length) {
        allQuestions = allQuestions.slice(0, exam.questions_per_attempt);
      }
      questionOrder = allQuestions;

      if (submission) {
        db.prepare(`UPDATE submissions SET status = 'in_progress', question_order = ?, started_at = datetime('now') WHERE id = ?`)
          .run(JSON.stringify(questionOrder), submission.id);
      } else {
        db.prepare(`INSERT INTO submissions (student_id, exam_id, status, question_order, started_at) VALUES (?, ?, 'in_progress', ?, datetime('now'))`)
          .run(student.id, exam.id, JSON.stringify(questionOrder));
      }
      submission = db.prepare('SELECT * FROM submissions WHERE student_id = ? AND exam_id = ?').get(student.id, exam.id);
    }

    const placeholders = questionOrder.map(() => '?').join(',');
    const rows = db.prepare(`SELECT * FROM questions WHERE id IN (${placeholders})`).all(...questionOrder);
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));

    const existingAnswers = db.prepare('SELECT * FROM answers WHERE submission_id = ?').all(submission.id);
    const answerByQ = Object.fromEntries(existingAnswers.map(a => [a.question_id, a]));

    const optionKeys = ['a', 'b', 'c', 'd'];
    const questions = questionOrder.map((qid) => {
      const q = byId[qid];
      let opts = optionKeys.map(k => ({ key: k, text: q[`option_${k}`] }));
      if (exam.shuffle_options) opts = shuffle(opts);
      return {
        id: q.id,
        questionText: q.question_text,
        imagePath: q.image_path,
        marks: q.marks,
        options: opts,
        selectedOption: answerByQ[q.id] ? answerByQ[q.id].selected_option : null,
        isBookmarked: answerByQ[q.id] ? !!answerByQ[q.id].is_bookmarked : false
      };
    });

    res.json({
      success: true,
      submissionId: submission.id,
      startedAt: submission.started_at,
      durationMinutes: exam.duration_minutes,
      instructions: exam.instructions,
      title: exam.title,
      questions
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/student-exam/save - autosave a single answer / bookmark toggle
router.post('/save', (req, res, next) => {
  try {
    const { questionId, selectedOption, isBookmarked } = req.body;
    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.user.id);
    const submission = db.prepare('SELECT * FROM submissions WHERE student_id = ? AND exam_id = ?').get(student.id, student.exam_id);

    if (!submission || submission.status !== 'in_progress') {
      return res.status(403).json({ success: false, message: 'No active exam attempt found.' });
    }

    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(questionId);
    if (!question || question.exam_id !== student.exam_id) {
      return res.status(400).json({ success: false, message: 'Invalid question for this exam.' });
    }

    const existing = db.prepare('SELECT * FROM answers WHERE submission_id = ? AND question_id = ?').get(submission.id, questionId);

    if (existing) {
      db.prepare(`
        UPDATE answers SET
          selected_option = COALESCE(?, selected_option),
          is_bookmarked = COALESCE(?, is_bookmarked),
          updated_at = datetime('now')
        WHERE id = ?
      `).run(selectedOption ?? null, typeof isBookmarked === 'boolean' ? (isBookmarked ? 1 : 0) : null, existing.id);
    } else {
      db.prepare(`
        INSERT INTO answers (submission_id, question_id, selected_option, is_bookmarked)
        VALUES (?, ?, ?, ?)
      `).run(submission.id, questionId, selectedOption || null, isBookmarked ? 1 : 0);
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/student-exam/submit - final, irreversible submission + scoring
router.post('/submit', (req, res, next) => {
  try {
    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.user.id);
    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(student.exam_id);
    const submission = db.prepare('SELECT * FROM submissions WHERE student_id = ? AND exam_id = ?').get(student.id, exam.id);

    if (!submission || submission.status === 'not_started') {
      return res.status(400).json({ success: false, message: 'No active exam attempt to submit.' });
    }
    if (submission.status === 'submitted') {
      // Idempotent: already locked, do not allow re-scoring
      return res.status(403).json({ success: false, locked: true, message: 'You have already submitted this examination. Reattempt is not allowed.' });
    }

    const questionOrder = JSON.parse(submission.question_order);
    const placeholders = questionOrder.map(() => '?').join(',');
    const questions = db.prepare(`SELECT * FROM questions WHERE id IN (${placeholders})`).all(...questionOrder);
    const answers = db.prepare('SELECT * FROM answers WHERE submission_id = ?').all(submission.id);
    const answerByQ = Object.fromEntries(answers.map(a => [a.question_id, a]));

    let score = 0;
    let totalMarks = 0;
    let correct = 0, incorrect = 0, skipped = 0;

    const updateAnswer = db.prepare('UPDATE answers SET is_correct = ? WHERE id = ?');
    const insertAnswer = db.prepare('INSERT INTO answers (submission_id, question_id, selected_option, is_correct) VALUES (?, ?, ?, ?)');

    const scoreTx = db.transaction(() => {
      for (const q of questions) {
        totalMarks += q.marks;
        const ans = answerByQ[q.id];
        const selected = ans ? ans.selected_option : null;

        if (!selected) {
          skipped++;
          if (ans) updateAnswer.run(0, ans.id);
          else insertAnswer.run(submission.id, q.id, null, 0);
          continue;
        }

        const isCorrect = selected.toLowerCase() === q.correct_option.toLowerCase();
        if (isCorrect) {
          correct++;
          score += q.marks;
        } else {
          incorrect++;
          if (exam.negative_marking) {
            score -= exam.negative_mark_value;
          }
        }
        if (ans) updateAnswer.run(isCorrect ? 1 : 0, ans.id);
        else insertAnswer.run(submission.id, q.id, selected, isCorrect ? 1 : 0);
      }

      if (score < 0) score = 0;

      const startedAt = new Date(submission.started_at + 'Z');
      const timeTaken = Math.round((Date.now() - startedAt.getTime()) / 1000);

      db.prepare(`
        UPDATE submissions SET
          status = 'submitted', submitted_at = datetime('now'), score = ?, total_marks = ?,
          correct_count = ?, incorrect_count = ?, skipped_count = ?, time_taken_seconds = ?
        WHERE id = ?
      `).run(score, totalMarks, correct, incorrect, skipped, Math.max(timeTaken, 0), submission.id);
    });

    scoreTx();

    res.json({
      success: true,
      message: 'Exam submitted successfully.',
      result: { score, totalMarks, correct, incorrect, skipped, passed: score >= exam.passing_marks }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/student-exam/result - detailed result with per-question breakdown
router.get('/result', (req, res) => {
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.user.id);
  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(student.exam_id);
  const submission = db.prepare('SELECT * FROM submissions WHERE student_id = ? AND exam_id = ?').get(student.id, exam.id);

  if (!submission || submission.status !== 'submitted') {
    return res.status(400).json({ success: false, message: 'No submitted result found for this exam.' });
  }

  const questionOrder = JSON.parse(submission.question_order);
  const placeholders = questionOrder.map(() => '?').join(',');
  const questions = db.prepare(`SELECT * FROM questions WHERE id IN (${placeholders})`).all(...questionOrder);
  const answers = db.prepare('SELECT * FROM answers WHERE submission_id = ?').all(submission.id);
  const answerByQ = Object.fromEntries(answers.map(a => [a.question_id, a]));

  const breakdown = questionOrder.map(qid => {
    const q = questions.find(x => x.id === qid);
    const a = answerByQ[qid];
    return {
      questionText: q.question_text,
      options: { a: q.option_a, b: q.option_b, c: q.option_c, d: q.option_d },
      correctOption: q.correct_option,
      selectedOption: a ? a.selected_option : null,
      isCorrect: a ? !!a.is_correct : false,
      explanation: q.explanation,
      marks: q.marks
    };
  });

  // Simple rank among students who have submitted this exam
  const rankRow = db.prepare(`
    SELECT COUNT(*) + 1 AS rank FROM submissions
    WHERE exam_id = ? AND status = 'submitted' AND score > ?
  `).get(exam.id, submission.score);

  const totalSubmitted = db.prepare(`SELECT COUNT(*) AS c FROM submissions WHERE exam_id = ? AND status = 'submitted'`).get(exam.id).c;

  const percentage = submission.total_marks > 0 ? (submission.score / submission.total_marks) * 100 : 0;
  let remarks = 'Needs Improvement';
  if (percentage >= 90) remarks = 'Outstanding';
  else if (percentage >= 75) remarks = 'Excellent';
  else if (percentage >= 60) remarks = 'Good';
  else {
    const passPct = submission.total_marks > 0 ? (exam.passing_marks / submission.total_marks) * 100 : 0;
    if (percentage >= passPct) remarks = 'Satisfactory';
  }

  res.json({
    success: true,
    exam: { title: exam.title, subject: exam.subject, passingMarks: exam.passing_marks },
    student: { name: student.name, rollNumber: student.roll_number },
    result: {
      score: submission.score,
      totalMarks: submission.total_marks,
      percentage: Math.round(percentage * 100) / 100,
      passed: submission.score >= exam.passing_marks,
      correct: submission.correct_count,
      incorrect: submission.incorrect_count,
      skipped: submission.skipped_count,
      timeTakenSeconds: submission.time_taken_seconds,
      submittedAt: submission.submitted_at,
      rank: rankRow.rank,
      totalSubmitted,
      remarks
    },
    breakdown
  });
});

module.exports = router;
