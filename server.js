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
const { connectDB, mongoose } = require('./database/db');

const teacherAuthRoutes = require('./routes/teacherAuth');
const studentAuthRoutes = require('./routes/studentAuth');
const examRoutes = require('./routes/exams');
const questionRoutes = require('./routes/questions');
const teacherDashboardRoutes = require('./routes/teacherDashboard');
const studentExamRoutes = require('./routes/studentExam');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(helmet({ contentSecurityPolicy: false }));
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map(value => value.trim()).filter(Boolean);
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : false }));
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50, message: { success: false, message: 'Too many attempts. Please try again in a few minutes.' } });
app.use('/api/teacher/login', authLimiter);
app.use('/api/student/login', authLimiter);
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/teacher', teacherAuthRoutes);
app.use('/api/student', studentAuthRoutes);
app.use('/api/exams', examRoutes);
app.use('/api', questionRoutes);
app.use('/api/dashboard', teacherDashboardRoutes);
app.use('/api/student-exam', studentExamRoutes);
app.get('/api/health', (req, res) => {
  const databaseReady = mongoose.connection.readyState === 1;
  res.status(databaseReady ? 200 : 503).json({
    success: databaseReady,
    message: databaseReady ? 'IntelliQuiz server is running.' : 'Database connection is not ready.',
    database: databaseReady ? 'connected' : 'disconnected',
    time: new Date().toISOString()
  });
});
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use(notFound);
app.use(errorHandler);

function getLocalIPs() {
  return Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
}
async function start() {
  try {
    await connectDB();
    app.listen(PORT, '0.0.0.0', () => {
      console.log('IntelliQuiz Examination Server');
      console.log(`Local: http://localhost:${PORT}`);
      getLocalIPs().forEach(ip => console.log(`Network: http://${ip}:${PORT}`));
    });
  } catch (err) {
    console.error('[startup] Database connection failed:', err.message);
    process.exit(1);
  }
}
start();
