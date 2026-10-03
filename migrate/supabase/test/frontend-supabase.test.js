const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..', '..', '..');
const readRootFile = (name) => fs.readFileSync(path.join(repositoryRoot, name), 'utf8');
const homeHtml = readRootFile('index.html');
const adminHtml = readRootFile('admin.html');
const homeScript = readRootFile('script.js');
const adminScript = readRootFile('admin.js');
const buildScript = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'build-static-site.cjs'), 'utf8');
const vercelConfig = JSON.parse(readRootFile('vercel.json'));

test('both vanilla HTML views load the SDK and generated config before their app script', () => {
  for (const [html, appScript] of [[homeHtml, 'script.js'], [adminHtml, 'admin.js']]) {
    const sdkPosition = html.indexOf('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
    const configPosition = html.indexOf('supabase-config.js');
    const appPosition = html.indexOf(appScript);
    assert.ok(sdkPosition >= 0 && sdkPosition < configPosition && configPosition < appPosition);
  }
});

test('browser code uses Supabase Auth/Edge Functions and RLS queries instead of Express APIs', () => {
  assert.doesNotMatch(homeScript, /\/api\//);
  assert.doesNotMatch(adminScript, /\/api\//);
  assert.match(homeScript, /invokeEdgeFunction\('activate'/);
  assert.match(homeScript, /invokeEdgeFunction\('login-username'/);
  assert.match(homeScript, /\.from\('schedule'\)/);
  assert.match(adminScript, /functions\.invoke\('admin-access-codes'/);
  assert.match(adminScript, /\.from\('profiles'\)/);
  assert.match(adminScript, /\.from\('schedule'\)/);
  assert.doesNotMatch(`${homeScript}\n${adminScript}`, /SUPABASE_SERVICE_ROLE_KEY|service_role/i);
});

test('static build exposes only Supabase public config and copies only browser assets', () => {
  assert.match(buildScript, /process\.env\.SUPABASE_URL/);
  assert.match(buildScript, /process\.env\.SUPABASE_ANON_KEY/);
  assert.match(buildScript, /process\.env\.SUPABASE_PUBLISHABLE_KEY/);
  assert.match(buildScript, /window\.MOCHILA_SUPABASE_CONFIG/);
  assert.doesNotMatch(buildScript, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(buildScript, /const staticFiles = \['index\.html', 'script\.js', 'admin\.html', 'admin\.js', 'admin\.css'\]/);
  assert.equal(vercelConfig.outputDirectory, 'dist');
  assert.equal(vercelConfig.buildCommand, 'node migrate/supabase/scripts/build-static-site.cjs');
  assert.match(vercelConfig.installCommand, /No dependencies required/);
});
