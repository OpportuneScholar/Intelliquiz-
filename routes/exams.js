const express = require('express');
const { Exam, Question, Submission, UnitQuestion, Answer } = require('../database/db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { generateControllerId } = require('../utils/generateId');
const router = express.Router();
router.use(verifyToken, requireRole('teacher'));

const validId = id => /^[a-f\\d]{24}$/i.test(String(id));
async function getOwnedExam(id, teacherId) {
  if (!validId(id)) return null;
  return Exam.findOne({ _id: id, teacher_id: teacherId });
}

router.get('/', async (req, res, next) => {
  try {
    const exams = await Exam.find({ teacher_id: req.user.id }).sort({ created_at: -1 }).lean();
    const enriched = await Promise.all(exams.map(async exam => {
      const [total_students, total_questions, submitted_count, in_progress_count] = await Promise.all([
        Submission.distinct('student_id', { exam_id: exam._id }).then(rows => rows.length),
        Question.countDocuments({ exam_id: exam._id }),
        Submission.countDocuments({ exam_id: exam._id, status: 'submitted' }),
        Submission.countDocuments({ exam_id: exam._id, status: 'in_progress' })
      ]);
      return { ...exam, id: String(exam._id), total_students, total_questions, submitted_count, in_progress_count };
    }));
    res.json({ success: true, exams: enriched });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  let createdExam;
  try {
    const body = req.body || {};
    const title = String(body.title || '').trim();
    const subject = String(body.subject || '').trim();
    const duration = Number(body.durationMinutes);
    if (!title) return res.status(400).json({ success: false, message: 'Exam title is required.' });
    if (!Number.isFinite(duration) || duration <= 0 || duration > 1440) {
      return res.status(400).json({ success: false, message: 'Duration must be between 1 and 1440 minutes.' });
    }

    let controllerId;
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = generateControllerId();
      if (!(await Exam.exists({ controller_id: candidate }))) { controllerId = candidate; break; }
    }
    if (!controllerId) throw new Error('Could not generate a unique exam controller ID. Please retry.');

    createdExam = await Exam.create({
      teacher_id: req.user.id,
      controller_id: controllerId,
      title,
      subject: subject || undefined,
      instructions: String(body.instructions || ''),
      duration_minutes: duration,
      total_marks: 0,
      passing_marks: Math.max(0, Number(body.passingMarks) || 0),
      start_date: body.startDate || undefined,
      end_date: body.endDate || undefined,
      start_time: body.startTime || undefined,
      end_time: body.endTime || undefined,
      questions_per_attempt: body.questionsPerAttempt ? Math.max(1, Number(body.questionsPerAttempt)) : undefined,
      shuffle_questions: body.shuffleQuestions !== false,
      shuffle_options: body.shuffleOptions !== false,
      negative_marking: body.negativeMarking === true,
      negative_mark_value: body.negativeMarking === true ? Math.max(0, Number(body.negativeMarkValue) || 0) : 0,
      status: 'draft'
    });

    // Question-bank preload must never turn a successfully-created exam into a failed request.
    let preloaded = 0;
    const selectedUnits = Array.isArray(body.selectedUnits)
      ? body.selectedUnits.map(unit => String(unit).trim()).filter(Boolean)
      : [];
    if (selectedUnits.length && subject) {
      try {
        const bank = await UnitQuestion.find({
          teacher_id: req.user.id,
          subject: { $regex: '^' + subject.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&') + '$', $options: 'i' },
          unit: { $in: selectedUnits }
        }).lean();
        if (bank.length) {
          const docs = bank.map(q => ({
            exam_id: createdExam._id,
            question_text: q.question_text,
            option_a: q.option_a, option_b: q.option_b, option_c: q.option_c, option_d: q.option_d,
            correct_option: q.correct_option, explanation: q.explanation,
            difficulty: q.difficulty, marks: q.marks, category: q.unit
          }));
          const inserted = await Question.insertMany(docs, { ordered: true });
          preloaded = inserted.length;
          const total = await Question.aggregate([
            { $match: { exam_id: createdExam._id } },
            { $group: { _id: null, total: { $sum: '$marks' } } }
          ]);
          createdExam.total_marks = total[0]?.total || 0;
          await createdExam.save();
        }
      } catch (bankError) {
        console.error('[exam-create] Question-bank preload failed; exam was created without preload:', bankError);
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Exam created successfully.',
      exam: createdExam.toObject(),
      preloadedQuestions: preloaded,
      preloadWarning: selectedUnits.length && !preloaded ? 'No matching saved questions were found. You can add them from the exam question bank.' : undefined
    });
  } catch (err) {
    console.error('[exam-create] Failed to create exam:', {
      name: err.name, message: err.message, code: err.code,
      teacherId: req.user?.id
    });
    if (createdExam) {
      return res.status(201).json({
        success: true,
        message: 'Exam created successfully. Some optional question-bank items could not be preloaded.',
        exam: createdExam.toObject(),
        preloadedQuestions: 0
      });
    }
    return next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const exam = await getOwnedExam(req.params.id, req.user.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found.' });
    res.json({ success: true, exam: exam.toObject() });
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const exam = await getOwnedExam(req.params.id, req.user.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found.' });
    const map = { durationMinutes: 'duration_minutes', totalMarks: 'total_marks', passingMarks: 'passing_marks', startDate: 'start_date', endDate: 'end_date', startTime: 'start_time', endTime: 'end_time', questionsPerAttempt: 'questions_per_attempt', shuffleQuestions: 'shuffle_questions', shuffleOptions: 'shuffle_options', negativeMarking: 'negative_marking', negativeMarkValue: 'negative_mark_value', registrationOpen: 'registration_open' };
    const allowed = ['title', 'subject', 'instructions', 'duration_minutes', 'total_marks', 'passing_marks', 'start_date', 'end_date', 'start_time', 'end_time', 'questions_per_attempt', 'shuffle_questions', 'shuffle_options', 'negative_marking', 'negative_mark_value', 'registration_open', 'status'];
    let changed = false;
    for (const [key, value] of Object.entries(req.body || {})) {
      const field = map[key] || key;
      if (allowed.includes(field)) { exam.set(field, value); changed = true; }
    }
    if (!changed) return res.status(400).json({ success: false, message: 'No valid fields to update.' });
    await exam.save();
    res.json({ success: true, message: 'Exam updated successfully.', exam: exam.toObject() });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const exam = await getOwnedExam(req.params.id, req.user.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found.' });
    const submissions = await Submission.find({ exam_id: exam._id }).select('_id');
    const ids = submissions.map(item => item._id);
    await Promise.all([
      Question.deleteMany({ exam_id: exam._id }),
      Submission.deleteMany({ exam_id: exam._id }),
      Answer.deleteMany({ submission_id: { $in: ids } }),
      exam.deleteOne()
    ]);
    res.json({ success: true, message: 'Exam deleted successfully.' });
  } catch (err) { next(err); }
});

module.exports = router;
