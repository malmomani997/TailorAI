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
    console.log(`[REGISTER] Attempt for: ${username} in ${orgUrl}`);

    if (!username || !password || !role) {
        console.error('[REGISTER] Missing fields');
        return res.status(400).json({ error: 'Missing fields' });
    }

    // Default Permission: Leads = 1, Testers = 0
    const canPushDirect = role === 'Lead' ? 1 : 0;

    const sql = 'INSERT INTO users (username, password, role, org_url, pat, can_push_direct) VALUES (?, ?, ?, ?, ?, ?)';
    db.run(sql, [username, password, role, orgUrl, pat, canPushDirect], function (err) {
        if (err) {
            console.error(`[REGISTER] Error for ${username}:`, err.message);
            if (err.message.includes('UNIQUE')) {
                return res.status(409).json({ error: 'User already exists in this Organization (Email + Org must be unique).' });
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

    db.all('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, rows) => {
        if (err) {
            console.error('[LOGIN] DB Error:', err.message);
            return res.status(500).json({ error: err.message });
        }

        if (!rows || rows.length === 0) {
            console.warn(`[LOGIN] Failed for ${username}: Invalid credentials or user not found.`);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Multi-Org Check
        if (rows.length > 1) {
            console.log(`[LOGIN] Multiple orgs found for ${username}: ${rows.length}`);
            // Return list of choices
            const choices = rows.map(u => ({
                id: u.id,
                orgUrl: u.org_url,
                role: u.role
            }));
            return res.status(300).json({
                message: "Multiple accounts found",
                choices: choices
            });
        }

        // Single Match
        const row = rows[0];
        console.log(`[LOGIN] Success for: ${username}`);

        res.json({
            id: row.id,
            username: row.username,
            role: row.role,
            orgUrl: row.org_url,
            pat: row.pat,
            canPushDirect: row.can_push_direct
        });
    });
});

// --- Test Case Routes ---

// --- User Routes ---
// Get Users (Filter by Role and Org)
app.get('/users', (req, res) => {
    const { role, orgUrl } = req.query;
    let query = 'SELECT id, username, role, org_url FROM users';
    let params = [];
    let conditions = [];

    if (role) {
        conditions.push('role = ?');
        params.push(role);
    }
    // Strict Org Isolation: Only return users from the requester's Org
    if (orgUrl) {
        conditions.push('org_url = ?');
        params.push(orgUrl);
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Update User (Admin only technically, but basic auth for now)
app.patch('/users/:id', (req, res) => {
    const { id } = req.params;
    const { role, canPushDirect, password } = req.body;

    let updates = [];
    let params = [];

    if (role) {
        updates.push('role = ?');
        params.push(role);
    }
    if (canPushDirect !== undefined) {
        updates.push('can_push_direct = ?');
        params.push(canPushDirect ? 1 : 0);
    }
    if (password) {
        updates.push('password = ?');
        params.push(password);
    }

    if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(id);

    const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;

    db.run(sql, params, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, changes: this.changes });
    });
});

// --- Test Case Routes ---

// Create Draft Case
app.post('/cases', (req, res) => {
    const { title, steps, expectedResult, authorId, suiteId, reviewerId, azureId } = req.body;
    const stmt = db.prepare('INSERT INTO cases (title, steps, expected_result, author_id, suite_id, assigned_reviewer_id, azure_id) VALUES (?, ?, ?, ?, ?, ?, ?)');

    stmt.run(title, JSON.stringify(steps), expectedResult, authorId, suiteId, reviewerId, azureId, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, status: 'PENDING' });
    });
    stmt.finalize();
});

// Get Cases (Filter by status, author, reviewer, and implicitly Org)
app.get('/cases', (req, res) => {
    const { status, authorId, reviewerId, orgUrl } = req.query;
    let query = 'SELECT cases.*, users.username as author_name, users.org_url as author_org FROM cases JOIN users ON cases.author_id = users.id';
    let params = [];
    let conditions = [];

    if (status) {
        conditions.push('cases.status = ?');
        params.push(status);
    }
    if (authorId) {
        conditions.push('cases.author_id = ?');
        params.push(authorId);
    }
    if (reviewerId) {
        conditions.push('cases.assigned_reviewer_id = ?');
        params.push(reviewerId);
    }
    // Org Isolation: Only show cases where the author matches the requester's Org
    if (orgUrl) {
        conditions.push('users.org_url = ?');
        params.push(orgUrl);
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
