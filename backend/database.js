const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

function initDatabase() {
  db.serialize(() => {
    // Users Table
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      password TEXT, -- In a real app, hash this!
      role TEXT,
      org_url TEXT,
      pat TEXT,
      can_push_direct BOOLEAN DEFAULT 0,
      UNIQUE(username, org_url)
    )`);

    // Test Cases Table (Drafts)
    db.run(`CREATE TABLE IF NOT EXISTS cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      steps TEXT, -- JSON string
      expected_result TEXT,
      status TEXT DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED, PUSHED
      author_id INTEGER,
      suite_id TEXT, -- Optional: Target suite ID
      assigned_reviewer_id INTEGER,
      azure_id INTEGER, -- Link to Azure Test Case
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(author_id) REFERENCES users(id),
      FOREIGN KEY(assigned_reviewer_id) REFERENCES users(id)
    )`);

    // Migrations (Run safe alters for existing DBs, though we prefer fresh for this dev)
    db.run("ALTER TABLE cases ADD COLUMN assigned_reviewer_id INTEGER", (err) => { });
    db.run("ALTER TABLE cases ADD COLUMN azure_id INTEGER", (err) => { });
    db.run("ALTER TABLE users ADD COLUMN can_push_direct BOOLEAN DEFAULT 0", (err) => { });
  });
}

module.exports = {
  db,
  initDatabase
};
