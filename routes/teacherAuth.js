// routes/teacherAuth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database/db');
const { signToken } = require('../middleware/auth');

const router = express.Router();

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// POST /api/teacher/register
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, institution } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }

    const existing = db.prepare('SELECT id FROM teachers WHERE email = ?').get(email.toLowerCase().trim());
    if (existing) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const info = db.prepare(
      'INSERT INTO teachers (name, email, password_hash, institution) VALUES (?, ?, ?, ?)'
    ).run(name.trim(), email.toLowerCase().trim(), passwordHash, institution || null);

    const teacher = { id: info.lastInsertRowid, name: name.trim(), email: email.toLowerCase().trim() };
    const token = signToken({ id: teacher.id, role: 'teacher', name: teacher.name });

    res.status(201).json({ success: true, message: 'Registration successful. Welcome to IntelliQuiz!', token, user: teacher });
  } catch (err) {
    next(err);
  }
});

// POST /api/teacher/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const teacher = db.prepare('SELECT * FROM teachers WHERE email = ?').get(email.toLowerCase().trim());
    if (!teacher) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const match = await bcrypt.compare(password, teacher.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const token = signToken({ id: teacher.id, role: 'teacher', name: teacher.name });
    res.json({
      success: true,
      message: `Welcome back, ${teacher.name}!`,
      token,
      user: { id: teacher.id, name: teacher.name, email: teacher.email }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
