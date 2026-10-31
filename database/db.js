// database/db.js
// Central SQLite connection using better-sqlite3 (synchronous, fast, simple).
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'intelliquiz.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

const dbExists = fs.existsSync(DB_PATH);
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Always run schema (CREATE TABLE IF NOT EXISTS is idempotent/safe on every boot)
const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
db.exec(schema);

if (!dbExists) {
  console.log('[db] New database created at', DB_PATH);
} else {
  console.log('[db] Connected to existing database at', DB_PATH);
}

module.exports = db;
