const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { seedDatabase } = require('./seedData');

async function initializeDatabase() {
  const schemaPath = path.join(__dirname, '..', '..', 'database', 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });

  try {
    await connection.query(schemaSql);
    console.log('Database schema ensured.');
  } finally {
    await connection.end();
  }

  await seedDatabase();
  console.log('Database initialized with seed data.');
}

if (require.main === module) {
  initializeDatabase()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Database init failed:', error);
      process.exit(1);
    });
}

module.exports = { initializeDatabase };
