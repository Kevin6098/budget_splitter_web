/**
 * VPS mode routes - PostgreSQL, JWT authentication
 * Multi-group, full API per SWIFT_DEVELOPER_GUIDE
 */

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'budget_splitter',
  user: process.env.DB_USER || 'budget_user',
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const JWT_EXPIRES_IN = '30d';

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await pool.query(
      `SELECT at.*, u.display_name, u.email, u.phone, u.id as user_id
       FROM auth_tokens at
       JOIN users u ON at.user_id = u.id
       WHERE at.token = $1 AND at.expires_at > NOW()`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    await pool.query('UPDATE auth_tokens SET last_used_at = NOW() WHERE token = $1', [token]);

    req.user = {
      id: result.rows[0].user_id,
      displayName: result.rows[0].display_name,
      email: result.rows[0].email,
      phone: result.rows[0].phone
    };
    req.token = token;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

module.exports = function(app) {
  // ==================== AUTH ROUTES ====================

  app.post('/auth/register', async (req, res) => {
    try {
      const { email, phone, password, displayName } = req.body;

      if (!password || password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      if (!email && !phone) {
        return res.status(400).json({ error: 'Email or phone required' });
      }
      if (!displayName || displayName.length < 2) {
        return res.status(400).json({ error: 'Display name required' });
      }

      const normalizedEmail = email?.toLowerCase().trim() || null;
      const normalizedPhone = phone?.replace(/\D/g, '') || null;

      const existing = await pool.query(
        'SELECT id FROM users WHERE email = $1 OR phone = $2',
        [normalizedEmail, normalizedPhone]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'User already exists' });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const result = await pool.query(
        `INSERT INTO users (email, phone, password_hash, display_name)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, phone, display_name, created_at`,
        [normalizedEmail, normalizedPhone, passwordHash, displayName]
      );
      const user = result.rows[0];

      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
      await pool.query(
        `INSERT INTO auth_tokens (user_id, token, device_name, expires_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '30 days')`,
        [user.id, token, req.headers['user-agent']]
      );

      res.status(201).json({
        user: { id: user.id, email: user.email, phone: user.phone, displayName: user.display_name },
        token
      });
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  app.post('/auth/login', async (req, res) => {
    try {
      const { emailOrPhone, password, deviceId, deviceName } = req.body;

      if (!emailOrPhone || !password) {
        return res.status(400).json({ error: 'Email/phone and password required' });
      }

      const normalized = emailOrPhone.toLowerCase().trim();
      const isEmail = normalized.includes('@');
      const col = isEmail ? 'email' : 'phone';
      const val = isEmail ? normalized : normalized.replace(/\D/g, '');

      const result = await pool.query(
        `SELECT id, email, phone, password_hash, display_name, is_active FROM users WHERE ${col} = $1`,
        [val]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const user = result.rows[0];

      if (!user.is_active) {
        return res.status(403).json({ error: 'Account deactivated' });
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
      await pool.query(
        `INSERT INTO auth_tokens (user_id, token, device_id, device_name, expires_at)
         VALUES ($1, $2, $3, $4, NOW() + INTERVAL '30 days')`,
        [user.id, token, deviceId || null, deviceName || req.headers['user-agent']]
      );
      await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

      res.json({
        user: { id: user.id, email: user.email, phone: user.phone, displayName: user.display_name },
        token
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  app.post('/auth/logout', authenticateToken, async (req, res) => {
    try {
      await pool.query('DELETE FROM auth_tokens WHERE token = $1', [req.token]);
      res.json({ message: 'Logged out' });
    } catch (err) {
      res.status(500).json({ error: 'Logout failed' });
    }
  });

  app.get('/auth/me', authenticateToken, (req, res) => {
    res.json({ user: req.user });
  });

  app.get('/api/groups', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, name, description, owner_id, invite_code, is_active
         FROM trip_groups WHERE owner_id = $1 AND is_active = TRUE`,
        [req.user.id]
      );
      res.json({ groups: result.rows });
    } catch (err) {
      console.error('GET /api/groups:', err);
      res.status(500).json({ error: 'Failed to fetch groups' });
    }
  });

  app.get('/api/groups/:groupId/members', authenticateToken, async (req, res) => {
    try {
      const { groupId } = req.params;
      const check = await pool.query(
        'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
        [groupId, req.user.id]
      );
      if (check.rows.length === 0) {
        return res.status(403).json({ error: 'Not a member' });
      }
      const result = await pool.query(
        'SELECT id, group_id, user_id, name, created_at FROM members WHERE group_id = $1 ORDER BY name',
        [groupId]
      );
      res.json({
        members: result.rows.map(r => ({
          id: r.id,
          groupId: r.group_id,
          userId: r.user_id,
          name: r.name,
          createdAt: r.created_at
        }))
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch members' });
    }
  });

  app.get('/api/groups/:groupId/expenses', authenticateToken, async (req, res) => {
    try {
      const { groupId } = req.params;
      const check = await pool.query(
        'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
        [groupId, req.user.id]
      );
      if (check.rows.length === 0) {
        return res.status(403).json({ error: 'Not a member' });
      }
      const rows = await pool.query(
        `SELECT id, group_id, description, amount, currency, category, paid_by_member_id, expense_date, created_at
         FROM expenses WHERE group_id = $1 AND is_deleted = FALSE ORDER BY expense_date DESC, created_at DESC`,
        [groupId]
      );
      const expenses = [];
      for (const e of rows.rows) {
        const splits = await pool.query(
          'SELECT id, member_id, amount, is_paid FROM expense_splits WHERE expense_id = $1',
          [e.id]
        );
        expenses.push({
          id: e.id,
          groupId: e.group_id,
          description: e.description || '',
          amount: parseFloat(e.amount),
          currency: e.currency,
          category: e.category,
          paidByMemberId: e.paid_by_member_id,
          expenseDate: e.expense_date,
          createdAt: e.created_at,
          splits: splits.rows.map(s => ({
            id: s.id,
            memberId: s.member_id,
            amount: parseFloat(s.amount),
            isPaid: s.is_paid
          }))
        });
      }
      res.json({ expenses });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch expenses' });
    }
  });

  app.post('/api/expenses', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { groupId, description, amount, currency, category, paidByMemberId, expenseDate, splits } = req.body;

      const memberCheck = await client.query(
        'SELECT role, can_add_expenses FROM group_members WHERE group_id = $1 AND user_id = $2',
        [groupId, req.user.id]
      );
      if (memberCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Not a member of this group' });
      }
      if (!memberCheck.rows[0].can_add_expenses && memberCheck.rows[0].role !== 'owner') {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Cannot add expenses' });
      }

      const expenseResult = await client.query(
        `INSERT INTO expenses (group_id, description, amount, currency, category, paid_by_member_id, expense_date, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [groupId, description, amount, currency || 'JPY', category, paidByMemberId, expenseDate, req.user.id]
      );
      const expenseId = expenseResult.rows[0].id;

      for (const s of splits || []) {
        await client.query(
          'INSERT INTO expense_splits (expense_id, member_id, amount) VALUES ($1, $2, $3)',
          [expenseId, s.memberId, s.amount]
        );
      }

      await client.query('COMMIT');
      res.status(201).json({ success: true, expenseId });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Add expense:', err);
      res.status(500).json({ error: 'Failed to add expense' });
    } finally {
      client.release();
    }
  });

  app.delete('/api/expenses/:expenseId', authenticateToken, async (req, res) => {
    try {
      const { expenseId } = req.params;
      const check = await pool.query(
        `SELECT e.*, gm.role, gm.can_edit_all_expenses
         FROM expenses e
         JOIN group_members gm ON gm.group_id = e.group_id AND gm.user_id = $2
         WHERE e.id = $1 AND e.is_deleted = FALSE`,
        [expenseId, req.user.id]
      );
      if (check.rows.length === 0) return res.status(404).json({ error: 'Not found' });
      const exp = check.rows[0];
      const canDelete = exp.role === 'owner' || exp.can_edit_all_expenses || exp.created_by_user_id === req.user.id;
      if (!canDelete) return res.status(403).json({ error: 'Cannot delete' });

      await pool.query(
        'UPDATE expenses SET is_deleted = TRUE, deleted_at = NOW(), deleted_by_user_id = $2 WHERE id = $1',
        [expenseId, req.user.id]
      );
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Delete failed' });
    }
  });

  app.patch('/api/expense-splits/:splitId/payment', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { splitId } = req.params;
      const { isPaid, reason } = req.body;

      const splitResult = await client.query(
        `SELECT es.*, e.group_id, m.user_id as split_member_user_id,
                pm.user_id as payer_user_id, gm.role, gm.can_mark_paid
         FROM expense_splits es
         JOIN expenses e ON es.expense_id = e.id
         JOIN members m ON es.member_id = m.id
         JOIN members pm ON e.paid_by_member_id = pm.id
         LEFT JOIN group_members gm ON gm.group_id = e.group_id AND gm.user_id = $2
         WHERE es.id = $1 AND e.is_deleted = FALSE`,
        [splitId, req.user.id]
      );
      if (splitResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Split not found' });
      }
      const s = splitResult.rows[0];
      const canMark = s.split_member_user_id === req.user.id || s.payer_user_id === req.user.id ||
        s.role === 'owner' || (s.role === 'admin' && s.can_mark_paid);
      if (!canMark) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'No permission' });
      }

      await client.query(
        `UPDATE expense_splits SET is_paid = $1, paid_at = CASE WHEN $1 THEN NOW() ELSE NULL END,
         marked_paid_by_user_id = $2, notes = COALESCE($3, notes) WHERE id = $4`,
        [isPaid, req.user.id, reason, splitId]
      );
      await client.query(
        `INSERT INTO payment_history (expense_split_id, action, performed_by_user_id, reason, ip_address, device_info)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [splitId, isPaid ? 'marked_paid' : 'marked_unpaid', req.user.id, reason, req.ip, req.headers['user-agent']]
      );
      await client.query('COMMIT');
      res.json({ success: true, message: isPaid ? 'Marked paid' : 'Marked unpaid' });
    } catch (err) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: 'Update failed' });
    } finally {
      client.release();
    }
  });

  app.get('/api/expense-splits/:splitId/history', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT ph.*, u.display_name as performed_by_name
         FROM payment_history ph
         JOIN users u ON ph.performed_by_user_id = u.id
         WHERE ph.expense_split_id = $1 ORDER BY ph.performed_at DESC`,
        [req.params.splitId]
      );
      res.json({ history: result.rows });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch history' });
    }
  });
};
