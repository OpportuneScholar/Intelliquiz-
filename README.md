# IntelliQuiz — Online Examination Platform

**Examine · Evaluate · Excel.** IntelliQuiz is a Node.js and Express online examination platform with a static HTML/CSS/JavaScript frontend and MongoDB Atlas persistence.

## Features
- Teacher and student registration/login with JWT sessions and bcrypt password hashing.
- Unique exam Controller IDs and duplicate student-registration protection.
- Exam configuration, question bank, image upload, JSON import/export.
- Timed exam attempts, question/option shuffling, autosave, bookmarking, submission and scoring.
- Single-attempt enforcement, result breakdown, rank, teacher dashboard and CSV export.
- Responsive frontend; no React build step is required.

## Technology
- Node.js 20.x, Express 4
- MongoDB Atlas with Mongoose 8
- Vanilla JavaScript frontend
- JWT, bcryptjs, Multer, json2csv

## Local setup
1. Install Node.js 20.x.
2. Clone the repository and run `npm install`.
3. Copy `.env.example` to `.env`.
4. Create a MongoDB Atlas database user and allow the server's network access in Atlas.
5. Set `MONGODB_URI` to the Atlas connection string. Replace the username/password placeholders and use the database name `intelliquiz`.
6. Set a long random `JWT_SECRET`.
7. Run `npm start` and open `http://localhost:3000`.

Required environment variables:

- `MONGODB_URI` — MongoDB Atlas connection string.
- `JWT_SECRET` — long random signing secret (mandatory in production).
- `JWT_EXPIRES_IN` — optional; defaults to `12h`.
- `NODE_ENV` — set to `production` when deployed.
- `PORT` — supplied automatically by most hosting providers.

## Render deployment
- Build command: `npm install`
- Start command: `npm start`
- Runtime: Node.js 20.x
- Add `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN=12h`, and `NODE_ENV=production` in the Render environment settings.
- Configure Atlas Network Access to allow connections from the deployed service. For a quick test, Atlas may allow `0.0.0.0/0`; use tighter network restrictions where practical.

The application waits for a successful MongoDB connection before opening its HTTP port. The health endpoint is `/api/health`.

## Important deployment limitations
- **Fresh database:** this migration starts with an empty MongoDB database. Existing SQLite records are not migrated.
- **Uploaded images:** question images are currently stored in the app's local `uploads/questions` directory. Render's local filesystem is ephemeral on typical free web services, so images can disappear after redeploy/restart. Use object storage (for example S3-compatible storage or Cloudinary) before relying on persistent image uploads.
- **CORS:** currently open; restrict allowed origins before exposing a production service broadly.
- **Testing:** run `npm install` and exercise teacher registration, exam creation, question import, student registration, exam start/autosave/submit, result review, dashboard and CSV export before using this in a live examination.

## Project structure
- `server.js` — Express entry point and MongoDB startup.
- `database/models.js` — Mongoose schemas and indexes.
- `database/db.js` — Atlas connection and model exports.
- `routes/` — authentication, exams, questions, dashboard and exam attempt APIs.
- `middleware/` — JWT authorization and centralized error handling.
- `public/` — static frontend.
- `uploads/questions/` — local question-image storage.
