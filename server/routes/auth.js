const express = require('express');
const argon2 = require('argon2');
const crypto = require('crypto');
const pool = require('../db/mysql');
const { normalizeCode, hashCode } = require('../db/seedData');

const router = express.Router();

function validateUsername(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length >= 3 && trimmed.length <= 40 && /^[a-zA-Z0-9._-]+$/.test(trimmed);
}

function validatePassword(value) {
  if (typeof value !== 'string') return false;
  return value.length >= 8 && value.length <= 100;
}

function validateActivationCode(value) {
  if (typeof value !== 'string') return false;
  const normalized = normalizeCode(value);
  return normalized.length >= 5 && normalized.length <= 12 && /^[A-Z0-9]+$/.test(normalized);
}

router.post('/activate', async (req, res) => {
  const { code, username, password } = req.body || {};

  if (!validateActivationCode(code)) {
    return res.status(400).json({ error: 'Activation code is invalid.' });
  }

  if (!validateUsername(username) || !validatePassword(password)) {
    return res.status(400).json({ error: 'Username and password must be valid.' });
  }

  const normalizedCode = normalizeCode(code);
  const codeHash = hashCode(normalizedCode);

  try {
    const [rows] = await pool.query(
      "SELECT a.id, a.group_id, a.active, a.used_at, a.revoked_at, g.name AS group_name " +
      "FROM access_codes a " +
      "INNER JOIN `groups` g ON g.id = a.group_id " +
      "WHERE a.code_hash = ? LIMIT 1",
      [codeHash]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: 'Activation code not found.' });
    }

    const codeRecord = rows[0];
    if (!codeRecord.active) {
      return res.status(410).json({ error: 'Activation code has been revoked.' });
    }
    if (codeRecord.used_at) {
      return res.status(409).json({ error: 'Activation code has already been used.' });
    }
    if (codeRecord.revoked_at) {
      return res.status(410).json({ error: 'Activation code has been revoked.' });
    }

    const usernameCandidate = username.trim();
    const [existingUsers] = await pool.query('SELECT id FROM users WHERE username = ? LIMIT 1', [usernameCandidate]);
    if (existingUsers.length) {
      return res.status(409).json({ error: 'Username is already in use.' });
    }

    const passwordHash = await argon2.hash(password);
    const [result] = await pool.query(
      `INSERT INTO users (username, password_hash, role, group_id, active, created_at)
       VALUES (?, ?, 'student', ?, 1, NOW())`,
      [usernameCandidate, passwordHash, codeRecord.group_id]
    );

    await pool.query(
      `UPDATE access_codes SET user_id = ?, used_at = NOW(), active = 0 WHERE id = ?`,
      [result.insertId, codeRecord.id]
    );

    req.session.user = {
      id: result.insertId,
      username: usernameCandidate,
      role: 'student',
      group_id: codeRecord.group_id,
      active: 1,
    };

    return res.status(201).json({
      message: 'Account created successfully.',
      user: {
        id: result.insertId,
        username: usernameCandidate,
        role: 'student',
        group_id: codeRecord.group_id,
      },
      group_name: codeRecord.group_name,
    });
  } catch (error) {
    console.error('Activation failed:', error);
    return res.status(500).json({ error: 'Unable to activate account.' });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};

  if (!validateUsername(username) || !validatePassword(password)) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT id, username, password_hash, role, group_id, active
       FROM users
       WHERE username = ?
       LIMIT 1`,
      [username.trim()]
    );

    if (!rows[0]) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const user = rows[0];
    if (!user.active) {
      return res.status(403).json({ error: 'User account is disabled.' });
    }

    const passwordMatches = await argon2.verify(user.password_hash, password);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      group_id: user.group_id,
      active: user.active,
    };

    return res.json({
      message: 'Login successful.',
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        group_id: user.group_id,
      },
    });
  } catch (error) {
    console.error('Login failed:', error);
    return res.status(500).json({ error: 'Unable to log in.' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error('Logout failed:', error);
      return res.status(500).json({ error: 'Unable to log out.' });
    }

    return res.clearCookie('mochila.sid').json({ message: 'Logged out successfully.' });
  });
});

router.get('/me', async (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  return res.json({
    user: {
      id: req.session.user.id,
      username: req.session.user.username,
      role: req.session.user.role,
      group_id: req.session.user.group_id,
    },
  });
});

module.exports = router;
