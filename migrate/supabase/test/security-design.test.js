const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '202610030001_initial_schema.sql');
const migration = fs.readFileSync(migrationPath, 'utf8');
const config = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'config.toml'), 'utf8');
const activationFunction = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'activate', 'index.ts'), 'utf8');
const adminFunction = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'admin-access-codes', 'index.ts'), 'utf8');
const loginFunction = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'login-username', 'index.ts'), 'utf8');
const exporter = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'export-legacy-metadata.cjs'), 'utf8');

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

test('all public application tables enable and force row-level security', () => {
  assert.equal(countMatches(migration, /alter table public\.[a-z_]+ enable row level security;/g), 5);
  assert.equal(countMatches(migration, /alter table public\.[a-z_]+ force row level security;/g), 5);
  assert.match(migration, /private\.can_read_group\(group_id\)/);
  assert.match(migration, /profile\.group_id = target_group_id/);
});

test('security-definer functions pin search_path and sensitive RPC execute rights are restricted', () => {
  assert.equal(countMatches(migration, /security definer\s+set search_path = ''/g), 6);
  assert.match(migration, /revoke all on function public\.activate_student\(text, uuid, text\) from public, anon, authenticated;/);
  assert.match(migration, /grant execute on function public\.activate_student\(text, uuid, text\) to service_role;/);
  assert.match(migration, /grant execute on function public\.create_activation_code\(text, bigint\) to authenticated;/);
  assert.match(migration, /grant execute on function public\.revoke_activation_code\(bigint\) to authenticated;/);
});

test('activation locks and consumes a code in the same SQL routine', () => {
  assert.match(migration, /for update;/);
  assert.match(migration, /where code\.code_hash = p_code_hash[\s\S]*code\.used_at is null[\s\S]*code\.revoked_at is null[\s\S]*for update;/);
  assert.match(migration, /insert into public\.profiles[\s\S]*update public\.activation_codes[\s\S]*used_at = now\(\)/);
});

test('activation hashes are not selectable and the service key stays inside the Edge Function', () => {
  assert.match(migration, /grant select \(id, group_id, user_id, active, created_at, used_at, revoked_at\)\s+on public\.activation_codes/);
  assert.doesNotMatch(migration.match(/grant select \([^)]*\)\s+on public\.activation_codes/)?.[0] || '', /code_hash/);
  assert.match(activationFunction, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(adminFunction, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(config, /\[functions\.activate\][\s\S]*verify_jwt = false/);
  assert.match(config, /\[functions\.admin-access-codes\][\s\S]*verify_jwt = true/);
});

test('username login checks the active server-side profile and the exporter omits password hashes', () => {
  assert.match(loginFunction, /\.from\('profiles'\)[\s\S]*\.eq\('username', username\)/);
  assert.match(loginFunction, /!profile\.active/);
  assert.doesNotMatch(exporter, /password_hash/);
  assert.match(exporter, /SET TRANSACTION READ ONLY/);
  assert.match(exporter, /os\.tmpdir\(\)/);
});
