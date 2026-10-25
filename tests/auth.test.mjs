import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, dependencies, env) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(source, { exports, require: (id) => {
    if (!(id in dependencies)) throw new Error('Unexpected dependency: ' + id);
    return dependencies[id];
  }, process: { env }, URL, Request, Response });
  return exports;
}
const configured = {
  AUTH0_DOMAIN: 'tenant.us.auth0.com', AUTH0_CLIENT_ID: 'client', AUTH0_CLIENT_SECRET: 'secret',
  AUTH0_SECRET: 'a'.repeat(64), APP_BASE_URL: 'http://localhost:3000', AUTH0_OWNER_SUB: 'google-oauth2|owner',
};
const next = { NextResponse: class extends Response {
  static json(body, init) { return Response.json(body, init); }
} };
function harness(env = { ...configured }, session = null, invalidSession = false) {
  const policy = load('lib/auth-policy.ts', {}, env);
  const auth = load('lib/api-auth.ts', {
    'server-only': {}, 'next/server': next, './auth-policy': policy,
    './auth0': { getAuth0: () => ({ getSession: async () => {
      if (invalidSession) throw new Error('Invalid cookie');
      return session;
    } }) },
  }, env);
  return { policy, auth };
}

test('configuration fails closed for each missing variable and invalid origin/secret', () => {
  assert.equal(harness().policy.authConfigured(), true);
  for (const key of Object.keys(configured)) {
    const env = { ...configured }; delete env[key];
    assert.equal(harness(env).policy.authConfigured(), false, key);
  }
  for (const base of ['null', 'https://example.com/path', 'https://example.com/']) {
    assert.equal(harness({ ...configured, APP_BASE_URL: base }).policy.authConfigured(), false);
  }
  assert.equal(harness({ ...configured, NODE_ENV: 'production' }).policy.authConfigured(), false);
  assert.equal(harness({ ...configured, AUTH0_SECRET: 'weak' }).policy.authConfigured(), false);
});

test('owner checks and write origins reject impersonation and foreign origins', async () => {
  for (const [session, invalid, expected] of [[null, false, 401], [null, true, 401], [{ user: { sub: 'other' } }, false, 403]]) {
    const result = await harness({ ...configured }, session, invalid).auth.requireOwner(new Request('http://localhost:3000/api/applications'));
    assert.equal(result.status, expected);
    assert.match(result.headers.get('cache-control'), /no-store/);
  }
  const { auth } = harness({ ...configured }, { user: { sub: configured.AUTH0_OWNER_SUB } });
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    for (const origin of [undefined, 'null', 'https://evil.example', 'http://localhost:3001']) {
      const result = await auth.requireOwner(new Request('http://localhost:3000/api/applications', { method, headers: origin ? { origin } : {} }));
      assert.equal(result.status, 403);
    }
    assert.equal(await auth.requireOwner(new Request('http://localhost:3000/api/applications', { method, headers: { origin: configured.APP_BASE_URL } })), null);
  }
  assert.equal(await auth.requireOwner(new Request('http://localhost:3000/api/applications')), null);
  assert.equal((await harness({}).auth.requireOwner(new Request('http://localhost:3000/api/applications'))).status, 503);
});

test('every route denies access before parsing input or calling the database', async () => {
  for (const file of ['app/api/applications/route.ts', 'app/api/applications/[id]/route.ts', 'app/api/applications/import/route.ts', 'app/mcp/approve/[id]/confirm/route.ts']) {
    for (const status of [401, 403, 503]) {
      const routes = load(file, {
        'next/server': next,
        '@/lib/api-auth': { requireOwner: async () => Response.json({ error: 'Denied' }, { status }), PRIVATE_HEADERS: {} },
        '@/lib/applications': new Proxy({}, { get: () => () => { throw new Error('Database must not be called'); } }),
        '@/lib/types': { STATUSES: [], SOURCES: [] },
        '@/lib/auth0': { getAuth0: () => { throw new Error('Session must not be read after denial'); } },
        '@/lib/application-previews': { approvePreview: () => { throw new Error('Database must not be called'); } },
      }, {});
      for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
        if (!routes[method]) continue;
        const response = await routes[method](new Request('http://localhost:3000/api/applications', { method }), { params: Promise.resolve({ id: 'a' }) });
        assert.equal(response.status, status);
      }
    }
  }
});
