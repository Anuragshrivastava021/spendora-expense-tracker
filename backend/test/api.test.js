import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:1/test';
process.env.SESSION_SECRET ||= 'test-secret-that-is-at-least-32-characters-long';
process.env.FRONTEND_URL ||= 'http://localhost:5173';
const { app } = await import('../src/app.js');
const { pool } = await import('../src/db.js');

let server;
let origin;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test('health endpoint reports API readiness', async () => {
  const response = await fetch(`${origin}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('protected user and admin endpoints require authentication', async () => {
  const profile = await fetch(`${origin}/api/profile`);
  assert.equal(profile.status, 401);
  assert.deepEqual(await profile.json(), { error: 'Authentication required.' });

  const admin = await fetch(`${origin}/api/admin/analytics`);
  assert.equal(admin.status, 401);
  assert.deepEqual(await admin.json(), { error: 'Authentication required.' });
});

test('state-changing requests reject missing CSRF tokens', async () => {
  const response = await fetch(`${origin}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test', email: 'test@example.com', password: 'long-enough-password' }),
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'CSRF validation failed.' });
});

test('registration validates input before database access', async () => {
  const csrfResponse = await fetch(`${origin}/api/auth/csrf`);
  const { csrfToken } = await csrfResponse.json();
  const csrfCookie = csrfResponse.headers.get('set-cookie').split(';')[0];
  const response = await fetch(`${origin}/api/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: csrfCookie,
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify({ name: '', email: 'not-an-email', password: 'short' }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /String|Invalid/i);
});

test('public registration rejects attempts to assign an administrator role', async () => {
  const csrfResponse = await fetch(`${origin}/api/auth/csrf`);
  const { csrfToken } = await csrfResponse.json();
  const csrfCookie = csrfResponse.headers.get('set-cookie').split(';')[0];
  const response = await fetch(`${origin}/api/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: csrfCookie,
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify({
      name: 'Test User',
      email: 'test@example.com',
      password: 'at-least-10-characters',
      role: 'admin',
    }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Unrecognized key/i);
});

test('contact form validates input before database access', async () => {
  const csrfResponse = await fetch(`${origin}/api/auth/csrf`);
  const { csrfToken } = await csrfResponse.json();
  const csrfCookie = csrfResponse.headers.get('set-cookie').split(';')[0];
  const response = await fetch(`${origin}/api/contact`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: csrfCookie,
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify({ name: 'Test User', email: 'invalid', message: 'short' }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Invalid|must|at least/i);
});

test('analytics tracking rejects malformed paths before database access', async () => {
  const csrfResponse = await fetch(`${origin}/api/auth/csrf`);
  const { csrfToken } = await csrfResponse.json();
  const csrfCookie = csrfResponse.headers.get('set-cookie').split(';')[0];
  const response = await fetch(`${origin}/api/analytics/track`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: csrfCookie,
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify({ path: '//secret' }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Invalid/i);
});

test('origin policy blocks untrusted browser origins', async () => {
  const response = await fetch(`${origin}/api/health`, { headers: { Origin: 'https://untrusted.example' } });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'Origin not allowed.' });
});

test('origin policy permits same-origin app requests', async () => {
  const response = await fetch(`${origin}/api/health`, { headers: { Origin: origin } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
});
