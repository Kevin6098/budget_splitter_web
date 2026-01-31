/**
 * Local mode routes - SQLite, no authentication
 * Single group, all data stored locally
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const dbPath = process.env.SQLITE_PATH || path.join(dataDir, 'budget_splitter.db');
const db = new Database(dbPath);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS local_group (
    id TEXT PRIMARY KEY DEFAULT 'default',
    name TEXT NOT NULL DEFAULT 'My Trip',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    description TEXT,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'JPY',
    category TEXT NOT NULL,
    paid_by_member_id TEXT NOT NULL,
    expense_date TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (paid_by_member_id) REFERENCES members(id)
  );

  CREATE TABLE IF NOT EXISTS expense_splits (
    id TEXT PRIMARY KEY,
    expense_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    amount REAL NOT NULL,
    FOREIGN KEY (expense_id) REFERENCES expenses(id),
    FOREIGN KEY (member_id) REFERENCES members(id)
  );

  INSERT OR IGNORE INTO local_group (id, name) VALUES ('default', 'My Trip');
`);

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/x/g, () =>
    (Math.random() * 16 | 0).toString(16));
}

module.exports = function(app) {
  // ==================== MEMBERS ====================

  app.get('/api/members', (req, res) => {
    try {
      const rows = db.prepare('SELECT id, name, created_at FROM members ORDER BY name').all();
      res.json({ members: rows.map(r => ({
        id: r.id,
        name: r.name,
        createdAt: r.created_at
      })) });
    } catch (err) {
      console.error('GET /api/members:', err);
      res.status(500).json({ error: 'Failed to fetch members' });
    }
  });

  app.post('/api/members', (req, res) => {
    try {
      const { name } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Name required' });
      }
      const id = uuid();
      db.prepare('INSERT INTO members (id, name) VALUES (?, ?)').run(id, name.trim());
      const row = db.prepare('SELECT id, name, created_at FROM members WHERE id = ?').get(id);
      res.status(201).json({
        member: { id: row.id, name: row.name, createdAt: row.created_at }
      });
    } catch (err) {
      console.error('POST /api/members:', err);
      res.status(500).json({ error: 'Failed to add member' });
    }
  });

  app.delete('/api/members/:id', (req, res) => {
    try {
      const { id } = req.params;
      const result = db.prepare('DELETE FROM members WHERE id = ?').run(id);
      if (result.changes === 0) {
        return res.status(404).json({ error: 'Member not found' });
      }
      db.prepare('DELETE FROM expense_splits WHERE member_id = ?').run(id);
      const expenses = db.prepare('SELECT id FROM expenses WHERE paid_by_member_id = ?').all(id);
      const firstMember = db.prepare('SELECT id FROM members LIMIT 1').get();
      if (expenses.length && firstMember) {
        db.prepare('UPDATE expenses SET paid_by_member_id = ? WHERE paid_by_member_id = ?')
          .run(firstMember.id, id);
      }
      res.json({ success: true });
    } catch (err) {
      console.error('DELETE /api/members:', err);
      res.status(500).json({ error: 'Failed to delete member' });
    }
  });

  app.post('/api/members/reset', (req, res) => {
    try {
      db.prepare('DELETE FROM expense_splits').run();
      db.prepare('DELETE FROM expenses').run();
      db.prepare('DELETE FROM members').run();
      const defaults = [
        'Soon Zheng Dong', 'Soon Cheng Wai', 'Soon Xin Yi', 'See Siew Pheng',
        'Ang Shin Nee', 'See Siew Tin', 'See Siew Kim', 'See Eng Kim',
        'See Yi Joe', 'Koay Jun Ming'
      ];
      const insert = db.prepare('INSERT INTO members (id, name) VALUES (?, ?)');
      for (const name of defaults) {
        insert.run(uuid(), name);
      }
      res.json({ success: true, message: 'Reset complete' });
    } catch (err) {
      console.error('POST /api/members/reset:', err);
      res.status(500).json({ error: 'Reset failed' });
    }
  });

  // ==================== EXPENSES ====================

  app.get('/api/expenses', (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT e.id, e.description, e.amount, e.currency, e.category,
               e.paid_by_member_id, e.expense_date, e.created_at
        FROM expenses e
        ORDER BY e.expense_date DESC, e.created_at DESC
      `).all();

      const expenses = rows.map(e => {
        const splits = db.prepare(
          'SELECT id, member_id, amount FROM expense_splits WHERE expense_id = ?'
        ).all(e.id);
        return {
          id: e.id,
          description: e.description || '',
          amount: e.amount,
          currency: e.currency,
          category: e.category,
          paidByMemberId: e.paid_by_member_id,
          expenseDate: e.expense_date,
          createdAt: e.created_at,
          splits: splits.map(s => ({ id: s.id, memberId: s.member_id, amount: s.amount }))
        };
      });
      res.json({ expenses });
    } catch (err) {
      console.error('GET /api/expenses:', err);
      res.status(500).json({ error: 'Failed to fetch expenses' });
    }
  });

  app.post('/api/expenses', (req, res) => {
    try {
      const { description, amount, currency, category, paidByMemberId, expenseDate, splits } = req.body;

      if (!amount || amount <= 0 || !category || !paidByMemberId || !expenseDate || !splits?.length) {
        return res.status(400).json({ error: 'Invalid expense data' });
      }

      const expenseId = uuid();
      const dateStr = expenseDate.split('T')[0];

      db.prepare(`
        INSERT INTO expenses (id, description, amount, currency, category, paid_by_member_id, expense_date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(expenseId, description || '', amount, currency || 'JPY', category, paidByMemberId, dateStr);

      const splitInsert = db.prepare(
        'INSERT INTO expense_splits (id, expense_id, member_id, amount) VALUES (?, ?, ?, ?)'
      );
      for (const s of splits) {
        splitInsert.run(uuid(), expenseId, s.memberId, s.amount);
      }

      res.status(201).json({ success: true, expenseId });
    } catch (err) {
      console.error('POST /api/expenses:', err);
      res.status(500).json({ error: 'Failed to add expense' });
    }
  });

  app.delete('/api/expenses/:id', (req, res) => {
    try {
      const { id } = req.params;
      db.prepare('DELETE FROM expense_splits WHERE expense_id = ?').run(id);
      const result = db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
      if (result.changes === 0) {
        return res.status(404).json({ error: 'Expense not found' });
      }
      res.json({ success: true });
    } catch (err) {
      console.error('DELETE /api/expenses:', err);
      res.status(500).json({ error: 'Failed to delete expense' });
    }
  });

  // ==================== SUMMARY ====================

  app.get('/api/summary', (req, res) => {
    try {
      const members = db.prepare('SELECT id, name FROM members').all();
      const expenses = db.prepare('SELECT id, amount, currency, category FROM expenses').all();

      const memberTotals = {};
      const categoryTotals = {};

      for (const m of members) {
        const total = db.prepare(
          'SELECT COALESCE(SUM(amount), 0) as total FROM expense_splits WHERE member_id = ?'
        ).get(m.id);
        memberTotals[m.id] = { name: m.name, amount: total?.total || 0 };
      }

      for (const e of expenses) {
        categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
      }

      const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);

      res.json({
        totalSpent,
        memberTotals: Object.entries(memberTotals).map(([id, v]) => ({ memberId: id, ...v })),
        categoryTotals
      });
    } catch (err) {
      console.error('GET /api/summary:', err);
      res.status(500).json({ error: 'Failed to fetch summary' });
    }
  });
};
