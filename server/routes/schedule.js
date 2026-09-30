const express = require('express');
const pool = require('../db/mysql');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/schedule', requireAuth, async (req, res) => {
  const user = req.session.user;

  try {
    const [groupRows] = await pool.query(
      "SELECT g.id, g.grade, g.name FROM `groups` g WHERE g.id = ?",
      [user.group_id]
    );

    if (!groupRows[0]) {
      return res.status(404).json({ error: 'Group not found for this user.' });
    }

    const [scheduleRows] = await pool.query(
      `SELECT s.day, sub.name AS subject_name
       FROM schedule s
       INNER JOIN subjects sub ON sub.id = s.subject_id
       WHERE s.group_id = ?
       ORDER BY FIELD(s.day, 'lunes','martes','miércoles','jueves','viernes')`,
      [user.group_id]
    );

    const grouped = {};
    const days = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'];
    for (const day of days) grouped[day] = [];

    for (const row of scheduleRows) {
      if (!grouped[row.day]) grouped[row.day] = [];
      grouped[row.day].push(row.subject_name);
    }

    return res.json({
      group: {
        id: groupRows[0].id,
        grade: groupRows[0].grade,
        name: groupRows[0].name,
      },
      schedule: grouped,
    });
  } catch (error) {
    console.error('Schedule retrieval failed:', error);
    return res.status(500).json({ error: 'Unable to load schedule.' });
  }
});

module.exports = router;
