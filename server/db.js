const Database = require('better-sqlite3');
const db = new Database('omnijoin.db');

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, email TEXT UNIQUE, password_hash TEXT,
  role TEXT DEFAULT 'owner'
);
CREATE TABLE IF NOT EXISTS projects(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, owner_id INTEGER
);
CREATE TABLE IF NOT EXISTS claims(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER, type TEXT, text TEXT, reason TEXT,
  owner TEXT, source TEXT, status TEXT DEFAULT 'draft',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);
module.exports = db;