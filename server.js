// server.js - IntelliQuiz Examination Platform
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const os = require('os');

require('./database/db'); // initializes DB + schema on boot

const teacherAuthRoutes = require('./routes/teacherAuth');
const studentAuthRoutes = require('./routes/studentAuth');
const examRoutes = require('./routes/exams');
const questionRoutes = require('./routes/questions');
const teacherDashboardRoutes = require('./routes/teacherDashboard');
const studentExamRoutes = require('./routes/studentExam');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Security & performance middleware ---
app.use(helmet({
  contentSecurityPolicy: false // relaxed for simple inline usage in this local/LAN app
}));
app.use(cors());
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limit auth endpoints to slow down brute-force attempts
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { success: false, message: 'Too many attempts. Please try again in a few minutes.' }
});
app.use('/api/teacher/login', authLimiter);
app.use('/api/student/login', authLimiter);

// --- Static files ---
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- API routes ---
app.use('/api/teacher', teacherAuthRoutes);
app.use('/api/student', studentAuthRoutes);
app.use('/api/exams', examRoutes);
app.use('/api', questionRoutes); // mounts /api/exams/:examId/questions and /api/questions/:id
app.use('/api/dashboard', teacherDashboardRoutes);
app.use('/api/student-exam', studentExamRoutes);

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'IntelliQuiz server is running.', time: new Date().toISOString() });
});

// SPA-style fallbacks for direct navigation to nested pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use(notFound);
app.use(errorHandler);

function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address);
    }
  }
  return ips;
}

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('========================================');
  console.log('   IntelliQuiz Examination Server');
  console.log('========================================');
  console.log(`  Local:    http://localhost:${PORT}`);
  getLocalIPs().forEach(ip => console.log(`  Network:  http://${ip}:${PORT}   <-- share this with students on the same Wi-Fi/LAN`));
  console.log('========================================');
  console.log('');
});
