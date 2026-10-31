const mongoose = require('mongoose');
const models = require('./models');

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required. Add your MongoDB Atlas connection string to the environment.');
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  console.log('[db] Connected to MongoDB Atlas');
}
module.exports = { ...models, connectDB, mongoose };
