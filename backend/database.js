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
      username TEXT UNIQUE,
      password TEXT, -- In a real app, hash this!
      role TEXT,
      org_url TEXT,
      pat TEXT
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(author_id) REFERENCES users(id)
    )`);
    });
}

module.exports = {
    db,
    initDatabase
};
