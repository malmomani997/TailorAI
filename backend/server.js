const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { db, initDatabase } = require('./database');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

// Initialize DB
initDatabase();

// --- Auth Routes ---

// Register
app.post('/auth/register', (req, res) => {
    const { username, password, role, orgUrl, pat } = req.body;
    console.log(`[REGISTER] Attempt for: ${username}`);

    if (!username || !password || !role) {
        console.error('[REGISTER] Missing fields');
        return res.status(400).json({ error: 'Missing fields' });
    }

    const sql = 'INSERT INTO users (username, password, role, org_url, pat) VALUES (?, ?, ?, ?, ?)';
    db.run(sql, [username, password, role, orgUrl, pat], function (err) {
        if (err) {
            console.error(`[REGISTER] Error for ${username}:`, err.message);
            if (err.message.includes('UNIQUE')) {
                return res.status(409).json({ error: 'Username already exists' });
            }
            return res.status(500).json({ error: err.message });
        }
        console.log(`[REGISTER] Success: ${username} (ID: ${this.lastID})`);
        res.json({ id: this.lastID, username, role });
    });
});

// Login
app.post('/auth/login', (req, res) => {
    const { username, password } = req.body;
    console.log(`[LOGIN] Attempt for: ${username}`);

    // Check if any users exist (debug)
    db.all('SELECT * FROM users', [], (err, rows) => {
        if (rows) console.log(`[DEBUG] Total users in DB: ${rows.length}`);
    });

    db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, row) => {
        if (err) {
            console.error('[LOGIN] DB Error:', err.message);
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            console.warn(`[LOGIN] Failed for ${username}: Invalid credentials or user not found.`);
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        console.log(`[LOGIN] Success for: ${username}`);

        // Return user info (no token implementation for simplicity for now, just user object)
        res.json({
            id: row.id,
            username: row.username,
            role: row.role,
            orgUrl: row.org_url,
            pat: row.pat
        });
    });
});

// --- Test Case Routes ---

// Create Draft Case
app.post('/cases', (req, res) => {
    const { title, steps, expectedResult, authorId, suiteId } = req.body;
    const stmt = db.prepare('INSERT INTO cases (title, steps, expected_result, author_id, suite_id) VALUES (?, ?, ?, ?, ?)');

    stmt.run(title, JSON.stringify(steps), expectedResult, authorId, suiteId, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, status: 'PENDING' });
    });
    stmt.finalize();
});

// Get Cases (Filter by status optional)
app.get('/cases', (req, res) => {
    const { status, authorId } = req.query;
    let query = 'SELECT cases.*, users.username as author_name FROM cases JOIN users ON cases.author_id = users.id';
    let params = [];
    let conditions = [];

    if (status) {
        conditions.push('status = ?');
        params.push(status);
    }
    if (authorId) {
        conditions.push('author_id = ?');
        params.push(authorId);
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        // Parse steps JSON
        const cases = rows.map(c => ({
            ...c,
            steps: JSON.parse(c.steps)
        }));
        res.json(cases);
    });
});

// Update Case Status (Approve/Reject/Push)
app.patch('/cases/:id', (req, res) => {
    const { status } = req.body;
    const { id } = req.params;

    db.run('UPDATE cases SET status = ? WHERE id = ?', [status, id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
