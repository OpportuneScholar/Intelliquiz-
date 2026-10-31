const express = require('express');
const bcrypt = require('bcryptjs');
const { Teacher } = require('../database/db');
const { signToken } = require('../middleware/auth');
const router = express.Router();
const isValidEmail = email => typeof email === 'string' && email.includes('@') && email.split('@')[1]?.includes('.') && !/\\s/.test(email);

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, institution } = req.body;
    if (!name || !email || !password) return res.status(400).json({ success:false, message:'Name, email, and password are required.' });
    if (!isValidEmail(email)) return res.status(400).json({ success:false, message:'Please enter a valid email address.' });
    if (String(password).length < 6) return res.status(400).json({ success:false, message:'Password must be at least 6 characters long.' });
    const normalizedEmail = email.toLowerCase().trim();
    if (await Teacher.exists({ email: normalizedEmail })) return res.status(409).json({ success:false, message:'An account with this email already exists.' });
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
    const teacher = await Teacher.findOne({ email:email.toLowerCase().trim() });
    if (!teacher || !(await bcrypt.compare(password, teacher.password_hash))) return res.status(401).json({ success:false, message:'Invalid email or password.' });
    const token = signToken({ id:teacher.id, role:'teacher', name:teacher.name });
    res.json({ success:true, message:`Welcome back, ${teacher.name}!`, token, user:{ id:teacher.id, name:teacher.name, email:teacher.email } });
  } catch (err) { next(err); }
});
module.exports = router;
