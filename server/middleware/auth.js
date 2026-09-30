const pool = require('../db/mysql');

async function loadSessionUser(req, res, next) {
  if (!req.session || !req.session.user) {
    return next();
  }

  try {
    const [rows] = await pool.query(
      `SELECT id, username, role, group_id, active, created_at
       FROM users
       WHERE id = ?`,
      [req.session.user.id]
    );

    if (!rows[0]) {
      req.session.destroy(() => next());
      return;
    }

    req.session.user = {
      id: rows[0].id,
      username: rows[0].username,
      role: rows[0].role,
      group_id: rows[0].group_id,
      active: rows[0].active,
      created_at: rows[0].created_at,
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  if (req.session.user.active === 0 || req.session.user.active === false) {
    return res.status(403).json({ error: 'User account is inactive.' });
  }

  return next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator privileges required.' });
  }

  return next();
}

module.exports = { loadSessionUser, requireAuth, requireAdmin };
