# IntelliQuiz — Online Examination Platform

**Examine · Evaluate · Excel.** IntelliQuiz is a self-hosted, LAN-ready online
examination platform built with Node.js, Express, and SQLite. One computer
runs the server; students on the same Wi-Fi/LAN join from any browser
(phone, tablet, laptop) — no internet connection required on exam day.

---

## 1. What's included

- **Role-based auth** — separate Teacher/Admin and Student login & registration,
  JWT sessions, bcrypt password hashing.
- **Exam Controller ID system** — every exam gets a unique code (e.g. `IQ-4F7K9X2P`)
  that students use to register and log in.
- **Duplicate-registration protection** — a student (by roll number) can only
  register once per Controller ID.
- **Single-attempt enforcement** — once a student submits, the server marks the
  attempt `submitted` and permanently blocks re-entry — on refresh, re-login,
  or a different device — with a clear message.
- **Question bank** — add/edit/delete/search/filter, difficulty & category tags,
  per-question marks, optional images, JSON bulk import/export.
- **Exam configuration** — duration, marks, passing marks, schedule window,
  shuffle questions/options, negative marking, questions-per-attempt.
- **Exam-taking UI** — countdown timer, progress bar, question palette,
  bookmarking, autosave, submit confirmation, auto-submit on timeout,
  fullscreen toggle.
- **Teacher dashboard** — live stats (students, exams, live participants,
  average score, pass %), recent activity feed, per-exam student management
  (search/filter/reset attempt/remove), results table, CSV export
  (opens directly in Excel), and a print-to-PDF results report.
- **Student dashboard** — profile, exam status, start/resume/locked states.
- **Results page** — score, percentage, pass/fail, correct/incorrect/skipped,
  time taken, rank, remarks, full question-by-question review, printable PDF.
- **Dark/light theme**, glassmorphism UI, toast notifications, responsive layout.

### Scope notes (be aware of these before you present this as "complete")

To deliver a genuinely working system rather than a stack of stubs, a few
items from a full commercial spec were simplified:

- **Excel export is CSV**, not a native `.xlsx` binary. CSV opens correctly in
  Excel/Sheets and is what teachers actually use to import elsewhere. If you
  need a true `.xlsx` file, add the `xlsx` (SheetJS) package and swap the
  `json2csv` call in `routes/teacherDashboard.js`.
- **PDF export uses the browser's print dialog** ("Save as PDF") on the
  results page and results tab, not a server-side PDF renderer. This keeps
  the app dependency-light; swap in `puppeteer` or `pdfkit` if you need
  server-generated PDFs.
- **No Android APK** is included — see §6 for the WebView wrapper approach.
- Dark/light mode is a CSS-variable theme, not a full design-token rebrand.

Everything else in the spec (auth, exam engine, single-attempt lock,
dashboards, question bank, LAN access) is fully implemented and working.

---

## 2. Project structure

```
intelliquiz/
├── server.js                 # Express app entry point, LAN IP printout
├── package.json
├── .env.example               # Copy to .env before running
├── database/
│   ├── schema.sql              # SQLite schema (teachers, exams, questions,
│   │                           #  students, submissions, answers)
│   └── db.js                   # better-sqlite3 connection + schema bootstrap
├── middleware/
│   ├── auth.js                 # JWT sign/verify, role guard
│   └── errorHandler.js
├── routes/
│   ├── teacherAuth.js          # POST /api/teacher/register, /login
│   ├── studentAuth.js          # POST /api/student/register, /login,
│   │                           #  GET /verify-controller/:id
│   ├── exams.js                # Exam CRUD (teacher)
│   ├── questions.js            # Question bank CRUD + import/export
│   ├── teacherDashboard.js     # Overview stats, student mgmt, results, CSV
│   └── studentExam.js          # status/start/save/submit/result — the
│                               #  single-attempt engine
├── utils/generateId.js         # Exam Controller ID generator
├── uploads/questions/          # Uploaded question images (gitignored)
├── reports/                    # Reserved for future server-generated reports
└── public/                     # Frontend (static, no build step)
    ├── index.html               # Login / registration (role tabs)
    ├── teacher/dashboard.html   # Teacher dashboard
    ├── teacher/exam.html        # Exam workspace: questions/students/results/settings
    ├── student/dashboard.html   # Student dashboard
    ├── student/take-exam.html   # Timed exam-taking UI
    ├── student/result.html      # Result + review
    ├── css/style.css            # Design system (glassmorphism, gradients)
    ├── js/*.js                  # Page controllers + shared api.js client
    └── assets/logo.png          # IntelliQuiz logo (used as favicon/branding)
```

Architecture is a lightweight MVC: `routes/` = controllers, `database/` = model
layer (raw SQL via `better-sqlite3`, no ORM overhead), `public/` = views.
Each route module owns one resource and enforces its own authorization
(`verifyToken` + `requireRole`), so a teacher can never read another
teacher's exams and a student can never see another student's answers.

---

## 3. Installation

**Requirements:** Node.js 18+ (comes with npm).

```bash
cd intelliquiz
npm install
cp .env.example .env
```

Open `.env` and set a real `JWT_SECRET` (any long random string) — do not
ship the default value.

```bash
npm start
```

You'll see something like:

```
========================================
   IntelliQuiz Examination Server
========================================
  Local:    http://localhost:3000
  Network:  http://192.168.1.42:3000   <-- share this with students
========================================
```

Open `http://localhost:3000` in your browser. The SQLite database file is
created automatically at `database/intelliquiz.db` on first run — nothing
else to configure.

For development with auto-restart on file changes: `npm run dev` (uses
`nodemon`, already in `devDependencies`).

---

## 4. Using IntelliQuiz

### As a teacher
1. Register on the **Teacher / Admin** tab.
2. From the dashboard, click **Create New Exam** — fill in title, duration,
   schedule, shuffle/negative-marking options. A unique **Controller ID** is
   generated (e.g. `IQ-4F7K9X2P`).
3. Open the exam workspace → **Questions** tab → **Add Question** to build
   your question bank (or use **Export Question Bank** on one exam and the
   `POST /api/exams/:id/questions/import` endpoint to bulk-load another).
4. Click **Activate Exam** when ready. Share the Controller ID with students.
5. Watch **Students** and **Results & Analytics** tabs populate live as
   students register and submit.

### As a student
1. Register on the **Student** tab using the Controller ID from your teacher,
   your name, roll number, and a password.
2. Log in, review instructions, click **Start Exam**.
3. Answer questions, use the palette to jump around, bookmark ones to revisit.
   Answers autosave as you go — refreshing the page resumes exactly where you
   left off, with the same timer (it counts down from the original start
   time, not from the refresh).
4. Submit before time runs out, or the exam auto-submits when the timer hits
   zero. Once submitted, the attempt is locked — logging in again shows the
   result page, not a fresh exam.

---

## 5. LAN setup guide (exam day)

1. Pick **one** computer to be the **Examination Server** — this is the
   machine running `npm start`. It should be on the same Wi-Fi/LAN as the
   students, and stay powered on and connected for the full exam duration.
2. Run `npm start` on that machine. Note the `Network:` IP address it prints
   (e.g. `http://192.168.1.42:3000`).
3. On Windows, allow Node.js through the firewall if prompted (Public/Private
   network). On macOS, allow incoming connections when prompted.
4. Every student device (phone, tablet, laptop) joins the **same Wi-Fi
   network**, opens a browser, and navigates to that Network URL.
5. All registrations and submissions write directly to the SQLite database
   on the server machine — the Teacher Dashboard reflects them immediately on
   refresh (there's no separate sync step).
6. Capacity: SQLite with WAL mode (enabled by default here) comfortably
   handles 30–100 concurrent students doing typical read/write patterns
   (answer autosave every ~250ms per active student) on modest hardware. For
   the high end of that range, prefer a wired connection for the server and
   a solid Wi-Fi access point (not a phone hotspot) for students.

**Tip:** If your router doesn't hand out predictable IPs, set a static/
reserved IP for the server machine so the Network URL doesn't change between
exam sessions.

---

## 6. Future deployment & Android options

**Cloud/production deployment:** the app is a standard Node/Express server —
deploy it to any VPS (DigitalOcean, Render, Railway, a college server) behind
HTTPS (e.g. via Nginx + Let's Encrypt). Swap `better-sqlite3` for a hosted
Postgres/MySQL if you need multi-server scaling; the SQL in `routes/` is
plain enough to port. Set real environment variables (`JWT_SECRET`,
`NODE_ENV=production`) and put the server behind a process manager like PM2.

**Android (WebView wrapper):** since IntelliQuiz is a responsive web app,
the fastest path to an installable Android app is a thin WebView wrapper
(e.g. using [Median](https://median.co) or a minimal Android Studio project
with a single `WebView` pointed at your server's URL/IP). This repo does not
include a prebuilt APK or Android project — that's a separate build step
once you've decided on your production URL.

---

## 7. Security notes

- Passwords are hashed with bcrypt (cost factor 10); never stored in plaintext.
- JWTs are signed server-side (`JWT_SECRET`) with a 12-hour default expiry.
- Login endpoints are rate-limited (50 attempts / 15 min / IP) to slow down
  brute-force attempts.
- All teacher-only and student-only routes are enforced server-side via
  middleware — the frontend UI restrictions are a convenience, not the
  security boundary.
- This app is designed for **trusted LAN use** (a classroom/lab). If you
  expose it to the public internet, put it behind HTTPS and tighten the CORS
  policy in `server.js` (currently open, appropriate for LAN-only use).

---

## 8. Troubleshooting

- **Students can't reach the server:** confirm they're on the same Wi-Fi/LAN
  and using the `Network:` IP printed at startup, not `localhost`. Check the
  server machine's firewall.
- **"Invalid Controller ID":** codes are case-insensitive but must match
  exactly, including the `IQ-` prefix — copy/paste from the teacher dashboard
  rather than retyping.
- **Timer looks wrong after refresh:** this is expected behavior, not a bug —
  the timer is computed from the original `started_at` timestamp on the
  server, so it can only count down, never reset.
- **Database locked errors under heavy concurrent load:** SQLite is already
  running in WAL mode for better concurrency; if you're pushing well past
  100 simultaneous writers, migrate to Postgres (see §6).
