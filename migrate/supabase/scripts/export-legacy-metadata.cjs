const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');

const repositoryRoot = path.resolve(__dirname, '..', '..', '..');
const requireFromRepository = createRequire(path.join(repositoryRoot, 'package.json'));
const mysql = requireFromRepository('mysql2/promise');

const requiredEnvironment = [
  'LEGACY_DB_HOST',
  'LEGACY_DB_USER',
  'LEGACY_DB_PASSWORD',
  'LEGACY_DB_NAME',
];

async function main() {
  const missing = requiredEnvironment.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing source database environment variables: ${missing.join(', ')}`);
  }

  const connection = await mysql.createConnection({
    host: process.env.LEGACY_DB_HOST,
    port: Number(process.env.LEGACY_DB_PORT || 3306),
    user: process.env.LEGACY_DB_USER,
    password: process.env.LEGACY_DB_PASSWORD,
    database: process.env.LEGACY_DB_NAME,
    charset: 'utf8mb4',
    multipleStatements: false,
  });

  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.query('SET TRANSACTION READ ONLY');
    await connection.beginTransaction();

    const [groups] = await connection.query(
      'SELECT id, grade, name, created_at FROM `groups` ORDER BY id'
    );
    const [subjects] = await connection.query(
      'SELECT id, name, created_at FROM subjects ORDER BY id'
    );
    const [schedule] = await connection.query(
      'SELECT group_id, day, subject_id FROM schedule ORDER BY group_id, day, subject_id'
    );
    const [users] = await connection.query(
      'SELECT id, username, role, group_id, active, created_at FROM users ORDER BY id'
    );
    const [activationCodes] = await connection.query(
      `SELECT id, code_hash, group_id, user_id, active, created_at, used_at, revoked_at
       FROM access_codes ORDER BY id`
    );

    await connection.commit();

    const snapshot = {
      format: 'mochila-legacy-metadata-v1',
      exported_at: new Date().toISOString(),
      source_counts: {
        groups: groups.length,
        subjects: subjects.length,
        schedule: schedule.length,
        users: users.length,
        activation_codes: activationCodes.length,
      },
      groups,
      subjects,
      schedule,
      users,
      activation_codes: activationCodes,
      warnings: [
        'Password hashes are intentionally excluded; no Argon2-to-Supabase import is assumed.',
        'Activation code hashes are sensitive migration material. Protect this file and never commit it.',
        'Group IDs are source references; map destination groups by group name.',
      ],
    };

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputPath = path.join(os.tmpdir(), `mochila-legacy-metadata-${timestamp}.json`);
    await fs.writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    console.log(`Read-only metadata snapshot written outside the repository: ${outputPath}`);
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(`Legacy metadata export failed: ${error.message}`);
  process.exitCode = 1;
});
