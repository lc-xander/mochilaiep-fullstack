const crypto = require('crypto');
const argon2 = require('argon2');
const pool = require('./mysql');

const classRooms = {
  '1A': { schedule: {
    lunes: ['Matemáticas','Geografía','Historia','Español','Biología','Tecno/Artes','Música'],
    martes: ['Formación C y E','Tecno/Artes','Matemáticas','Historia','Español','Geografía','Biología'],
    miércoles: ['Inglés','Español','Biología','Geografía','Matemáticas','Formación C y E'],
    jueves: ['Inglés','Tecno/Artes','Matemáticas','Español','Biología','Música'],
    viernes: ['Tecno/Artes','Geografía','Matemáticas','Inglés','Español','Música']
  } },
  '1B': { schedule: {
    lunes: ['Música','Español','Tecno/Artes','Matemáticas','Geografía','Historia','Biología'],
    martes: ['Tecno/Artes','Biología','Matemáticas','Formación C y E','Español'],
    miércoles: ['Inglés','Tecno/Artes','Biología','Historia','Español','Geografía','Matemáticas'],
    jueves: ['Inglés','Matemáticas','Español','Biología','Geografía','Tecno/Artes','Música'],
    viernes: ['Geografía','Español','Matemáticas','Tecno/Artes','Inglés','Música','Formación C y E']
  } },
  '1C': { schedule: {
    lunes: ['Música','Español','Tecno/Artes','Matemáticas','Geografía','Historia','Biología','Formación C y E'],
    martes: ['Geografía','Tecno/Artes','Biología','Matemáticas','Español','Formación C y E'],
    miércoles: ['Inglés','Tecno/Artes','Matemáticas','Historia','Español','Geografía'],
    jueves: ['Inglés','Tecno/Artes','Matemáticas','Música','Español','Biología'],
    viernes: ['Español','Tecno/Artes','Inglés','Biología','Música','Matemáticas','Geografía']
  } },
  '1D': { schedule: {
    lunes: ['Música','Tecno/Artes','Formación C y E','Matemáticas','Español','Geografía'],
    martes: ['Biología','Español','Historia','Formación C y E','Matemáticas','Geografía'],
    miércoles: ['Inglés','Geografía','Español','Tecno/Artes','Matemáticas','Biología','Historia'],
    jueves: ['Inglés','Biología','Tecno/Artes','Español','Matemáticas','Geografía','Música'],
    viernes: ['Matemáticas','Español','Música','Inglés','Tecno/Artes','Biología']
  } },
  '2A': { schedule: {
    lunes: ['Tecno/Artes','Música','Historia','Español','Física','Matemáticas'],
    martes: ['Tecno/Artes','Física','Formación C y E','Inglés','Español','Matemáticas','Historia'],
    miércoles: ['Tecno/Artes','Física','Formación C y E','Matemáticas','Español'],
    jueves: ['Tecno/Artes','Matemáticas','Inglés','Español','Física','Música'],
    viernes: ['Tecno/Artes','Inglés','Física','Música','Matemáticas','Español','Historia']
  } },
  '2B': { schedule: {
    lunes: ['Física','Tecno/Artes','Música','Español','Matemáticas','Historia'],
    martes: ['Matemáticas','Tecno/Artes','Física','Español','Historia','Inglés'],
    miércoles: ['Matemáticas','Tecno/Artes','Física','Español','Historia','Formación C y E'],
    jueves: ['Tecno/Artes','Física','Inglés','Matemáticas','Música','Español','Formación C y E'],
    viernes: ['Inglés','Historia','Música','Física','Matemáticas','Español','Tecno/Artes']
  } },
  '2C': { schedule: {
    lunes: ['Historia','Matemáticas','Música','Tecno/Artes','Formación C y E','Español'],
    martes: ['Historia','Física','Inglés','Tecno/Artes','Matemáticas','Español'],
    miércoles: ['Tecno/Artes','Matemáticas','Formación C y E','Español','Física'],
    jueves: ['Física','Inglés','Música','Matemáticas','Español','Historia'],
    viernes: ['Inglés','Matemáticas','Historia','Música','Tecno/Artes','Español','Física']
  } },
  '3A': { schedule: {
    lunes: ['Química','Música','Inglés','Matemáticas','Tecno/Artes','Español'],
    martes: ['Español','Química','Formación C y E','Tecno/Artes','Historia'],
    miércoles: ['Tecno/Artes','Inglés','Química','Historia','Tecno/Artes','Español','Matemáticas'],
    jueves: ['Química','Español','Matemáticas','Música','Historia','Formación C y E'],
    viernes: ['Matemáticas','Inglés','Español','Química','Tecno/Artes','Música','Historia']
  } },
  '3B': { schedule: {
    lunes: ['Tecno/Artes','Música','Inglés','Matemáticas','Química','Español'],
    martes: ['Matemáticas','Historia','Química','Formación C y E','Español','Tecno/Artes'],
    miércoles: ['Historia','Inglés','Tecno/Artes','Español','Matemáticas','Química'],
    jueves: ['Tecno/Artes','Español','Historia','Química','Matemáticas','Música'],
    viernes: ['Historia','Inglés','Tecno/Artes','Español','Formación C y E','Matemáticas','Música']
  } },
  '3C': { schedule: {
    lunes: ['Matemáticas','Inglés','Español','Formación C y E','Historia','Tecno/Artes','Música'],
    martes: ['Tecno/Artes','Español','Química','Matemáticas','Historia','Tecno/Artes','Química'],
    miércoles: ['Español','Inglés','Historia','Química','Tecno/Artes','Matemáticas','Tecno/Artes'],
    jueves: ['Música','Español','Historia','Química','Tecno/Artes','Tecno/Artes','Formación C y E','Matemáticas'],
    viernes: ['Tecno/Artes','Inglés','Química','Matemáticas','Química','Español','Música']
  } },
};

function normalizeCode(rawCode = '') {
  return String(rawCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function hashCode(rawCode) {
  return crypto.createHash('sha256').update(normalizeCode(rawCode)).digest('hex');
}

async function seedDatabase() {
  const groupNames = Object.keys(classRooms);
  const subjectNames = new Set();
  for (const room of Object.values(classRooms)) {
    for (const daySchedule of Object.values(room.schedule)) {
      for (const subject of daySchedule) {
        subjectNames.add(subject);
      }
    }
  }

  await pool.query('DELETE FROM access_codes');
  await pool.query('DELETE FROM schedule');
  await pool.query('DELETE FROM users');
  await pool.query('DELETE FROM subjects');
  await pool.query('DELETE FROM `groups`');

  const groupInsertions = [];
  for (const groupName of groupNames) {
    groupInsertions.push([groupName, groupName]);
  }

  const [groupRows] = await pool.query('INSERT INTO `groups` (grade, name) VALUES ?', [groupInsertions]);
  const groupByName = new Map();
  const [existingGroups] = await pool.query('SELECT id, name FROM `groups`');
  for (const group of existingGroups) {
    groupByName.set(group.name, group.id);
  }

  const subjectList = [...subjectNames].sort();
  const subjectInsertions = subjectList.map((subject) => [subject]);
  if (subjectInsertions.length) {
    await pool.query('INSERT INTO subjects (name) VALUES ?', [subjectInsertions]);
  }

  const subjectMap = new Map();
  const [allSubjects] = await pool.query('SELECT id, name FROM subjects');
  for (const subject of allSubjects) {
    subjectMap.set(subject.name, subject.id);
  }

  for (const [groupName, room] of Object.entries(classRooms)) {
    const groupId = groupByName.get(groupName);
    const insertRows = [];
    for (const [day, subjects] of Object.entries(room.schedule)) {
      for (const subject of [...new Set(subjects)]) {
        insertRows.push([groupId, day, subjectMap.get(subject)]);
      }
    }

    if (insertRows.length) {
      await pool.query('INSERT INTO schedule (group_id, day, subject_id) VALUES ?', [insertRows]);
    }

  }

  const requiredSeedVariables = [
    'ADMIN_USERNAME',
    'ADMIN_PASSWORD',
    'STUDENT_USERNAME',
    'STUDENT_PASSWORD',
  ];
  const missingSeedVariables = requiredSeedVariables.filter((name) => !process.env[name]);
  if (missingSeedVariables.length) {
    throw new Error(`Missing required seed configuration: ${missingSeedVariables.join(', ')}`);
  }

  const adminPasswordHash = await argon2.hash(process.env.ADMIN_PASSWORD);
  const studentPasswordHash = await argon2.hash(process.env.STUDENT_PASSWORD);

  await pool.query(
    `INSERT INTO users (username, password_hash, role, group_id, active, created_at)
     VALUES (?, ?, 'admin', NULL, 1, NOW())`,
    [process.env.ADMIN_USERNAME, adminPasswordHash]
  );

  const defaultStudentGroupId = groupByName.get('3B');
  await pool.query(
    `INSERT INTO users (username, password_hash, role, group_id, active, created_at)
     VALUES (?, ?, 'student', ?, 1, NOW())`,
    [process.env.STUDENT_USERNAME, studentPasswordHash, defaultStudentGroupId]
  );
}

module.exports = { classRooms, normalizeCode, hashCode, seedDatabase };

if (require.main === module) {
  seedDatabase()
    .then(() => console.log('Database seed completed.'))
    .catch((error) => {
      console.error('Database seed failed:', error);
      process.exitCode = 1;
    });
}
