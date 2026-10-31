-- IntelliQuiz Database Schema (SQLite)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS teachers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  institution TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS exams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  controller_id TEXT NOT NULL UNIQUE,      -- Exam Code students register with
  title TEXT NOT NULL,
  subject TEXT,
  instructions TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  total_marks INTEGER NOT NULL DEFAULT 0,
  passing_marks INTEGER NOT NULL DEFAULT 0,
  start_date TEXT,           -- YYYY-MM-DD
  end_date TEXT,
  start_time TEXT,           -- HH:MM
  end_time TEXT,
  questions_per_attempt INTEGER,   -- null = all questions
  shuffle_questions INTEGER NOT NULL DEFAULT 1,
  shuffle_options INTEGER NOT NULL DEFAULT 1,
  negative_marking INTEGER NOT NULL DEFAULT 0,
  negative_mark_value REAL NOT NULL DEFAULT 0,
  registration_open INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',   -- draft, scheduled, active, completed, archived
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_option TEXT NOT NULL CHECK (correct_option IN ('a','b','c','d')),
  explanation TEXT,
  category TEXT,
  difficulty TEXT DEFAULT 'medium',   -- easy, medium, hard
  marks INTEGER NOT NULL DEFAULT 1,
  image_path TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  controller_id TEXT NOT NULL,
  name TEXT NOT NULL,
  roll_number TEXT NOT NULL,
  email TEXT,
  password_hash TEXT NOT NULL,
  registered_at TEXT DEFAULT (datetime('now')),
  UNIQUE(exam_id, roll_number)
);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_started',  -- not_started, in_progress, submitted
  question_order TEXT,        -- JSON array of question ids in the order shown to this student
  started_at TEXT,
  submitted_at TEXT,
  score REAL DEFAULT 0,
  total_marks REAL DEFAULT 0,
  correct_count INTEGER DEFAULT 0,
  incorrect_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  time_taken_seconds INTEGER,
  UNIQUE(student_id, exam_id)
);

CREATE TABLE IF NOT EXISTS answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  selected_option TEXT,        -- a/b/c/d or NULL if skipped
  is_correct INTEGER,
  is_bookmarked INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(submission_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_questions_exam ON questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_students_exam ON students(exam_id);
CREATE INDEX IF NOT EXISTS idx_submissions_exam ON submissions(exam_id);
CREATE INDEX IF NOT EXISTS idx_answers_submission ON answers(submission_id);
