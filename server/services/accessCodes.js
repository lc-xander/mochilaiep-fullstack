const crypto = require('crypto');
const pool = require('../db/mysql');

function normalizeCode(rawCode = '') {
  return String(rawCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function hashCode(rawCode) {
  return crypto.createHash('sha256').update(normalizeCode(rawCode)).digest('hex');
}

function generateActivationCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const chunks = [];
  for (let i = 0; i < 3; i += 1) {
    let chunk = '';
    for (let j = 0; j < 4; j += 1) {
      chunk += chars[Math.floor(Math.random() * chars.length)];
    }
    chunks.push(chunk);
  }
  return chunks.join('-');
}

async function findActivationCode(code) {
  const codeHash = hashCode(code);
  const [rows] = await pool.query(
    `SELECT ac.id, ac.group_id, ac.active, ac.used_at, ac.revoked_at, g.name AS group_name
     FROM access_codes ac
     INNER JOIN groups g ON g.id = ac.group_id
     WHERE ac.code_hash = ?
     LIMIT 1`,
    [codeHash]
  );
  return rows[0] || null;
}

async function markActivationCodeUsed(codeId, userId) {
  await pool.query(
    `UPDATE access_codes SET user_id = ?, used_at = NOW(), active = 0 WHERE id = ? AND used_at IS NULL`,
    [userId, codeId]
  );
}

async function revokeActivationCode(codeId) {
  await pool.query(
    `UPDATE access_codes SET active = 0, revoked_at = NOW() WHERE id = ? AND revoked_at IS NULL`,
    [codeId]
  );
}

module.exports = {
  normalizeCode,
  hashCode,
  generateActivationCode,
  findActivationCode,
  markActivationCodeUsed,
  revokeActivationCode,
};
