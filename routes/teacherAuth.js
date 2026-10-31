const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Teacher } = require('../database/db');
const { signToken } = require('../middleware/auth');
const router = express.Router();
const isValidEmail = email => typeof email === 'string' && email.includes('@') && email.split('@')[1]?.includes('.') && !email.split('').some(ch => ch.charCodeAt(0) <= 32);
const normalizeEmail = value => String(value || '').trim().toLowerCase();
const genericResetMessage = 'If a teacher account exists for this email, password reset instructions have been sent.';

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, institution } = req.body;
    if (!name || !email || !password) return res.status(400).json({ success:false, message:'Name, email, and password are required.' });
    if (!isValidEmail(email)) return res.status(400).json({ success:false, message:'Please enter a valid email address.' });
    if (String(password).length < 8) return res.status(400).json({ success:false, message:'Password must be at least 8 characters long.' });
    const normalizedEmail = normalizeEmail(email);
    if (await Teacher.exists({ email:normalizedEmail })) return res.status(409).json({ success:false, message:'An account with this email already exists.' });
    const teacher = await Teacher.create({ name:name.trim(), email:normalizedEmail, password_hash:await bcrypt.hash(password,10), institution:institution || undefined });
    const user = { id:teacher.id, name:teacher.name, email:teacher.email };
    const token = signToken({ id:user.id, role:'teacher', name:user.name });
    res.status(201).json({ success:true, message:'Registration successful. Welcome to IntelliQuiz!', token, user });
  } catch (err) { next(err); }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success:false, message:'Email and password are required.' });
    const teacher = await Teacher.findOne({ email:normalizeEmail(email) });
    if (!teacher || !(await bcrypt.compare(password, teacher.password_hash))) return res.status(401).json({ success:false, message:'Invalid email or password.' });
    const token = signToken({ id:teacher.id, role:'teacher', name:teacher.name });
    res.json({ success:true, message:'Welcome back, ' + teacher.name + '!', token, user:{ id:teacher.id, name:teacher.name, email:teacher.email } });
  } catch (err) { next(err); }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const teacher = email ? await Teacher.findOne({ email }) : null;
    if (teacher) {
      const configured = process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL && process.env.APP_BASE_URL;
      if (!configured) { console.error('[teacher-password-reset] Resend is not configured; set RESEND_API_KEY, RESEND_FROM_EMAIL and APP_BASE_URL.'); return res.json({ success:true, message:genericResetMessage }); }
      const raw = crypto.randomBytes(32).toString('hex');
      teacher.password_reset_token_hash = crypto.createHash('sha256').update(raw).digest('hex');
      teacher.password_reset_expires_at = new Date(Date.now() + 30 * 60 * 1000);
      await teacher.save();
      const base = process.env.APP_BASE_URL.replace(/\/$/, '');
      const url = base + '/reset-password.html?role=teacher&token=' + raw;
      const safeName = String(teacher.name || '').replace(/[&<>\"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[ch]));
      const response = await fetch('https://api.resend.com/emails', {
        method:'POST', headers:{ Authorization:'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type':'application/json' },
        body:JSON.stringify({ from:process.env.RESEND_FROM_EMAIL, to:[teacher.email], subject:'Reset your IntelliQuiz teacher password', html:'<p>Hello ' + safeName + '</p><p>Use the link below to reset your teacher account password. It expires in 30 minutes.</p><p><a href=\"' + url + '\">Reset password</a></p><p>If you did not request this, ignore this email.</p>' })
      });
      if (!response.ok) console.error('[teacher-password-reset] Resend delivery failed:', await response.text());
    }
    return res.json({ success:true, message:genericResetMessage });
  } catch (err) { console.error('[teacher-password-reset] Request failed:', err.message); return res.json({ success:true, message:genericResetMessage }); }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password || String(password).length < 8) return res.status(400).json({ success:false, message:'A valid reset token and password of at least 8 characters are required.' });
    const hash = crypto.createHash('sha256').update(String(token)).digest('hex');
    const teacher = await Teacher.findOne({ password_reset_token_hash:hash, password_reset_expires_at:{ $gt:new Date() } });
    if (!teacher) return res.status(400).json({ success:false, message:'This reset link is invalid or expired. Request a new one.' });
    teacher.password_hash = await bcrypt.hash(password, 10);
    teacher.password_reset_token_hash = undefined; teacher.password_reset_expires_at = undefined;
    await teacher.save();
    return res.json({ success:true, message:'Teacher password updated. You can now log in.' });
  } catch (err) { next(err); }
});

module.exports = router;