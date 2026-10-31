const mongoose = require('mongoose');
const models = require('./models');

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required. Add your MongoDB Atlas connection string to the environment.');
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  // Remove the legacy one-submission-per-exam unique index so configured reattempts can be stored.
  try {
    const indexes = await mongoose.connection.collection('submissions').indexes();
    const legacy = indexes.find(index => index.unique && index.key?.student_id === 1 && index.key?.exam_id === 1 && Object.keys(index.key).length === 2);
    if (legacy) { await mongoose.connection.collection('submissions').dropIndex(legacy.name); console.log('[db] Removed legacy unique submission index'); }
  } catch (indexError) { if (indexError.codeName !== 'NamespaceNotFound') console.warn('[db] Submission index check:', indexError.message); }
  console.log('[db] Connected to MongoDB Atlas');
}
module.exports = { ...models, connectDB, mongoose };
