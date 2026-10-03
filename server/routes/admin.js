const crypto = require('crypto');
const express = require('express');
const pool = require('../db/mysql');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

function normalizeCode(rawCode = '') {
  return String(rawCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function hashCode(rawCode) {
  return crypto.createHash('sha256').update(normalizeCode(rawCode)).digest('hex');
}

function generateActivationCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';

  for (let index = 0; index < 12; index += 1) {
    code += alphabet[crypto.randomInt(alphabet.length)];
  }

  return code;
}

router.use(requireAuth, requireAdmin);

const days = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'];

function parsePositiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function isValidDay(day) {
  return days.includes(day);
}

function validateSubjectName(value) {
  return typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 120;
}

router.get('/summary', async (req, res) => {
  try {
    const [[students]] = await pool.query("SELECT COUNT(*) AS total FROM users WHERE role = 'student'");
    const [[groups]] = await pool.query('SELECT COUNT(*) AS total FROM `groups`');
    const [[subjects]] = await pool.query('SELECT COUNT(*) AS total FROM subjects');
    const [[codes]] = await pool.query(
      'SELECT COUNT(*) AS total FROM access_codes WHERE active = 1 AND used_at IS NULL AND revoked_at IS NULL'
    );

    return res.json({
      students: Number(students.total),
      groups: Number(groups.total),
      subjects: Number(subjects.total),
      available_codes: Number(codes.total),
    });
  } catch (error) {
    console.error('Admin summary failed:', error);
    return res.status(500).json({ error: 'Unable to load admin summary.' });
  }
});

router.get('/groups', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, grade, name FROM `groups` ORDER BY id');
    return res.json({ groups: rows });
  } catch (error) {
    console.error('Admin groups failed:', error);
    return res.status(500).json({ error: 'Unable to load groups.' });
  }
});

router.get('/students', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.username, u.active, u.created_at, g.grade, g.name AS group_name
       FROM users u
       LEFT JOIN \`groups\` g ON g.id = u.group_id
       WHERE u.role = 'student'
       ORDER BY u.created_at DESC, u.id DESC`
    );

    return res.json({ students: rows });
  } catch (error) {
    console.error('Admin students failed:', error);
    return res.status(500).json({ error: 'Unable to load students.' });
  }
});

router.patch('/students/:id/status', async (req, res) => {
  const studentId = parsePositiveId(req.params.id);
  if (!studentId || typeof req.body?.active !== 'boolean') {
    return res.status(400).json({ error: 'A valid student id and boolean active value are required.' });
  }

  try {
    const [result] = await pool.query(
      "UPDATE users SET active = ? WHERE id = ? AND role = 'student'",
      [req.body.active ? 1 : 0, studentId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    return res.json({ message: 'Student status updated.', active: req.body.active });
  } catch (error) {
    console.error('Admin student status failed:', error);
    return res.status(500).json({ error: 'Unable to update student status.' });
  }
});

router.get('/subjects', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, created_at FROM subjects ORDER BY name');
    return res.json({ subjects: rows });
  } catch (error) {
    console.error('Admin subjects failed:', error);
    return res.status(500).json({ error: 'Unable to load subjects.' });
  }
});

router.post('/subjects', async (req, res) => {
  if (!validateSubjectName(req.body?.name)) {
    return res.status(400).json({ error: 'A subject name is required.' });
  }

  try {
    const name = req.body.name.trim();
    const [result] = await pool.query('INSERT INTO subjects (name) VALUES (?)', [name]);
    return res.status(201).json({ subject: { id: result.insertId, name } });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'That subject already exists.' });
    }
    console.error('Admin subject creation failed:', error);
    return res.status(500).json({ error: 'Unable to create subject.' });
  }
});

router.patch('/subjects/:id', async (req, res) => {
  const subjectId = parsePositiveId(req.params.id);
  if (!subjectId || !validateSubjectName(req.body?.name)) {
    return res.status(400).json({ error: 'A valid subject id and name are required.' });
  }

  try {
    const [result] = await pool.query('UPDATE subjects SET name = ? WHERE id = ?', [req.body.name.trim(), subjectId]);
    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Subject not found.' });
    }
    return res.json({ message: 'Subject updated.' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'That subject already exists.' });
    }
    console.error('Admin subject update failed:', error);
    return res.status(500).json({ error: 'Unable to update subject.' });
  }
});

router.get('/access-codes', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.id, a.group_id, g.grade, g.name AS group_name, a.active, a.created_at, a.used_at, a.revoked_at,
        CASE
          WHEN a.revoked_at IS NOT NULL OR (a.active = 0 AND a.used_at IS NULL) THEN 'revoked'
          WHEN a.used_at IS NOT NULL THEN 'used'
          ELSE 'available'
        END AS status
       FROM access_codes a
       INNER JOIN \`groups\` g ON g.id = a.group_id
       ORDER BY a.created_at DESC, a.id DESC`
    );
    return res.json({ access_codes: rows });
  } catch (error) {
    console.error('Admin access codes failed:', error);
    return res.status(500).json({ error: 'Unable to load access codes.' });
  }
});

router.post('/access-codes/:id/revoke', async (req, res) => {
  const codeId = parsePositiveId(req.params.id);
  if (!codeId) {
    return res.status(400).json({ error: 'A valid access code id is required.' });
  }

  try {
    const [result] = await pool.query(
      'UPDATE access_codes SET active = 0, revoked_at = NOW() WHERE id = ? AND active = 1 AND used_at IS NULL AND revoked_at IS NULL',
      [codeId]
    );
    if (!result.affectedRows) {
      return res.status(409).json({ error: 'Only an available code can be revoked.' });
    }
    return res.json({ message: 'Access code revoked.' });
  } catch (error) {
    console.error('Admin access code revoke failed:', error);
    return res.status(500).json({ error: 'Unable to revoke access code.' });
  }
});

async function getGroupSchedule(groupId, day) {
  const [groupRows] = await pool.query('SELECT id, grade, name FROM `groups` WHERE id = ? LIMIT 1', [groupId]);
  if (!groupRows[0]) return null;

  const params = [groupId];
  let query = `SELECT s.id, s.day, s.subject_id, sub.name AS subject_name
               FROM schedule s
               INNER JOIN subjects sub ON sub.id = s.subject_id
               WHERE s.group_id = ?`;
  if (day) {
    query += ' AND s.day = ?';
    params.push(day);
  }
  query += " ORDER BY FIELD(s.day, 'lunes','martes','miércoles','jueves','viernes'), s.id";
  const [scheduleRows] = await pool.query(query, params);
  return { group: groupRows[0], schedule: scheduleRows };
}

router.get('/schedule', async (req, res) => {
  const groupId = parsePositiveId(req.query.group_id);
  const day = req.query.day || null;
  if (!groupId || (day && !isValidDay(day))) {
    return res.status(400).json({ error: 'A valid group_id and day are required.' });
  }

  try {
    const result = await getGroupSchedule(groupId, day);
    if (!result) return res.status(404).json({ error: 'Group not found.' });
    return res.json(result);
  } catch (error) {
    console.error('Admin schedule failed:', error);
    return res.status(500).json({ error: 'Unable to load schedule.' });
  }
});

router.post('/schedule', async (req, res) => {
  const groupId = parsePositiveId(req.body?.group_id);
  const subjectId = parsePositiveId(req.body?.subject_id);
  const day = req.body?.day;
  if (!groupId || !subjectId || !isValidDay(day)) {
    return res.status(400).json({ error: 'A valid group, day and subject are required.' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO schedule (group_id, day, subject_id)
       SELECT ?, ?, id FROM subjects WHERE id = ?`,
      [groupId, day, subjectId]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Subject not found.' });
    return res.status(201).json({ message: 'Schedule entry added.', id: result.insertId });
  } catch (error) {
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(404).json({ error: 'Group or subject not found.' });
    }
    console.error('Admin schedule creation failed:', error);
    return res.status(500).json({ error: 'Unable to add schedule entry.' });
  }
});

router.delete('/schedule/:id', async (req, res) => {
  const scheduleId = parsePositiveId(req.params.id);
  if (!scheduleId) return res.status(400).json({ error: 'A valid schedule id is required.' });

  try {
    const [result] = await pool.query('DELETE FROM schedule WHERE id = ?', [scheduleId]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Schedule entry not found.' });
    return res.json({ message: 'Schedule entry deleted.' });
  } catch (error) {
    console.error('Admin schedule deletion failed:', error);
    return res.status(500).json({ error: 'Unable to delete schedule entry.' });
  }
});

router.get('/health', (req, res) => {
  res.json({ ok: true, role: req.session.user.role });
});

router.post('/access-codes/generate', async (req, res) => {
  const groupId = Number(req.body?.group_id);
  if (!Number.isInteger(groupId) || groupId <= 0) {
    return res.status(400).json({ error: 'A valid group_id is required.' });
  }

  try {
    const [groupRows] = await pool.query(
      'SELECT id, grade, name FROM `groups` WHERE id = ? LIMIT 1',
      [groupId]
    );

    if (!groupRows[0]) {
      return res.status(404).json({ error: 'Group not found.' });
    }

    let generatedCode = '';
    let codeHash = '';
    let attempts = 0;

    do {
      generatedCode = generateActivationCode();
      codeHash = hashCode(generatedCode);
      attempts += 1;
      if (attempts > 25) {
        return res.status(500).json({ error: 'Unable to generate a unique activation code.' });
      }

      const [existingRows] = await pool.query(
        'SELECT id FROM access_codes WHERE code_hash = ? LIMIT 1',
        [codeHash]
      );

      if (!existingRows.length) {
        break;
      }
    } while (true);

    await pool.query(
      'INSERT INTO access_codes (code_hash, group_id, active, created_at, used_at, revoked_at) VALUES (?, ?, 1, NOW(), NULL, NULL)',
      [codeHash, groupId]
    );

    console.log(`[DEV] Activation code generated for group ${groupId} (${groupRows[0].grade} ${groupRows[0].name}): ${generatedCode}`);

    return res.status(201).json({
      message: 'Activation code generated for local development.',
      code: generatedCode,
      group_id: groupId,
      group: {
        grade: groupRows[0].grade,
        name: groupRows[0].name,
      },
      note: 'The code is printed once in the Node server log and stored as a hash in MySQL.',
    });
  } catch (error) {
    console.error('dev access-code generation failed:', error);
    return res.status(500).json({ error: 'Unable to generate activation code.' });
  }
});

module.exports = router;
