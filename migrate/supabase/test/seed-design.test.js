const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const seedSql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'seed.sql'), 'utf8');
const dollarQuote = '$seed$';
const jsonStart = seedSql.indexOf(dollarQuote);
const jsonEnd = seedSql.indexOf(dollarQuote, jsonStart + dollarQuote.length);
assert.notEqual(jsonStart, -1, 'reference timetable JSON must be present');
assert.notEqual(jsonEnd, -1, 'reference timetable JSON must be closed');
const referenceGroups = JSON.parse(seedSql.slice(jsonStart + dollarQuote.length, jsonEnd));
const weekdays = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'];
const expectedGroups = ['1A', '1B', '1C', '1D', '2A', '2B', '2C', '3A', '3B', '3C'];

function normalizedScheduleRows() {
  return referenceGroups.flatMap((group) => Object.entries(group.schedule).flatMap(([day, subjects]) =>
    [...new Set(subjects)].map((subject) => `${group.group_name}|${day}|${subject}`)
  ));
}

test('reference seed contains the ten current groups and all weekdays', () => {
  assert.deepEqual(referenceGroups.map((group) => group.group_name), expectedGroups);
  for (const group of referenceGroups) {
    assert.deepEqual(Object.keys(group.schedule), weekdays);
  }
});

test('reference seed includes all eleven subjects and unique group-day-subject rows', () => {
  const rows = normalizedScheduleRows();
  const subjects = new Set(rows.map((row) => row.split('|')[2]));
  assert.equal(subjects.size, 11);
  assert.equal(new Set(rows).size, rows.length);
  assert.ok(rows.length > 250);
});

test('seed does not contain activation codes or account credential fields', () => {
  assert.doesNotMatch(seedSql, /password_hash|service_role|SESSION_SECRET/i);
  assert.doesNotMatch(seedSql, /"code"\s*:/i);
});
