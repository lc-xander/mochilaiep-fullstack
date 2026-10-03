const test = require('node:test');
const assert = require('node:assert/strict');
const { requireAdmin } = require('../server/middleware/auth');
const adminRoutes = require('../server/routes/admin');

function responseDouble() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('admin middleware rejects an unauthenticated request', () => {
  const response = responseDouble();
  let called = false;

  requireAdmin({ session: null }, response, () => { called = true; });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { error: 'Authentication required.' });
  assert.equal(called, false);
});

test('admin middleware returns 403 for a student session', () => {
  const response = responseDouble();
  let called = false;

  requireAdmin({ session: { user: { id: 22, role: 'student', active: 1 } } }, response, () => { called = true; });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, { error: 'Administrator privileges required.' });
  assert.equal(called, false);
});

test('admin middleware allows an active admin session', () => {
  const response = responseDouble();
  let called = false;

  requireAdmin({ session: { user: { id: 1, role: 'admin', active: 1 } } }, response, () => { called = true; });

  assert.equal(response.statusCode, null);
  assert.equal(called, true);
});

test('every administrative route rejects a student session before reaching its handler', async () => {
  const routes = [
    ['GET', '/summary'],
    ['GET', '/groups'],
    ['GET', '/students'],
    ['PATCH', '/students/1/status'],
    ['GET', '/subjects'],
    ['POST', '/subjects'],
    ['PATCH', '/subjects/1'],
    ['GET', '/access-codes'],
    ['POST', '/access-codes/generate'],
    ['POST', '/access-codes/1/revoke'],
    ['GET', '/schedule'],
    ['POST', '/schedule'],
    ['DELETE', '/schedule/1'],
  ];

  for (const [method, path] of routes) {
    const response = await new Promise((resolve) => {
      const result = responseDouble();
      result.json = (body) => {
        result.body = body;
        resolve(result);
        return result;
      };

      adminRoutes.handle(
        {
          method,
          url: path,
          path,
          query: {},
          body: {},
          params: {},
          session: { user: { id: 22, role: 'student', active: 1 } },
        },
        result,
        () => resolve(result)
      );
    });

    assert.equal(response.statusCode, 403, `${method} ${path} should reject students`);
  }
});
