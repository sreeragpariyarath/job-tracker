import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { generateKeyPair, exportJWK, SignJWT, jwtVerify, createLocalJWKSet } from 'jose';

function load(file, deps, env = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
    { exports, require: id => { if (!(id in deps)) throw Error('Unexpected import: ' + id); return deps[id]; }, process: { env }, URL, Response, Request });
  return exports;
}
const config = { resource: 'https://tracker.example/api/mcp', metadata: 'https://tracker.example/.well-known/oauth-protected-resource/api/mcp', issuer: 'https://tenant.auth0.com/' };

test('signed tokens enforce issuer, audience, expiry, owner and read scope', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey); jwk.kid = 'test';
  const auth = load('lib/mcp/auth.ts', {
    'server-only': {}, jose: { jwtVerify, createRemoteJWKSet: () => createLocalJWKSet({ keys: [jwk] }) },
    '../auth-policy': { isOwner: sub => sub === 'owner' }, './config': { mcpConfig: () => config },
  });
  async function token(overrides = {}) {
    return new SignJWT({ sub: 'owner', scope: 'read:applications', ...overrides }).setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer(overrides.iss ?? config.issuer).setAudience(overrides.aud ?? config.resource).setIssuedAt().setExpirationTime(overrides.exp ?? '5m').sign(privateKey);
  }
  const request = (value, origin) => new Request(config.resource, { method: 'POST', headers: { ...(value ? { authorization: 'Bearer ' + value } : {}), ...(origin ? { origin } : {}) } });
  assert.equal((await auth.authorizeMcp(request())).status, 401);
  assert.match((await auth.authorizeMcp(request())).headers.get('www-authenticate'), /resource_metadata/);
  assert.equal(await auth.authorizeMcp(request(await token())), null);
  for (const claims of [{ iss: 'https://evil.example/' }, { aud: 'different-api' }, { exp: 1 }]) assert.equal((await auth.authorizeMcp(request(await token(claims)))).status, 401);
  for (const claims of [{ sub: 'other' }, { sub: 'service@clients' }, { scope: 'write:applications' }]) assert.equal((await auth.authorizeMcp(request(await token(claims)))).status, 403);
  assert.equal((await auth.authorizeMcp(request('not-a-jwt'))).status, 401);
  assert.equal((await auth.authorizeMcp(request(await token(), 'https://evil.example'))).status, 403);
});

test('real MCP transport initializes, lists only read tools, validates and executes calls', async () => {
  let calls = 0, options;
  const id = '123e4567-e89b-42d3-a456-426614174000';
  const { createTrackerMcpServer } = load('lib/mcp/server.ts', {
    '@modelcontextprotocol/sdk/server/mcp.js': { McpServer }, zod: { z },
    '../types': { STATUSES: ['Applied', 'Rejected', 'Closed'], SOURCES: ['Indeed', 'Other'] },
    '../applications': { listApplicationsPage: async value => { calls++; options = value; return { items: [{ id, status: 'Rejected' }], total: 11 }; }, getApplication: async value => [id, 'alignminds-mern'].includes(value) ? { id: value } : null },
  });
  const route = load('app/api/mcp/route.ts', {
    '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js': { WebStandardStreamableHTTPServerTransport },
    '@/lib/mcp/auth': { authorizeMcp: async () => null }, '@/lib/mcp/server': { createTrackerMcpServer },
  });
  let rpcId = 0;
  async function rpc(method, params) {
    const response = await route.POST(new Request(config.resource, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-11-25' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }) }));
    assert.match(response.headers.get('cache-control'), /no-store/);
    return response.json();
  }
  assert.equal((await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } })).result.serverInfo.name, 'job-tracker');
  const listed = await rpc('tools/list', {});
  assert.deepEqual(listed.result.tools.map(t => t.name).sort(), ['get_application', 'search_applications']);
  assert.equal(listed.result.tools.every(t => t.annotations.readOnlyHint), true);
  const search = await rpc('tools/call', { name: 'search_applications', arguments: {} });
  assert.equal(options.status, 'All'); assert.equal(search.result.structuredContent.pagination.totalPages, 2);
  await rpc('tools/call', { name: 'search_applications', arguments: { pageSize: 51 } }); assert.equal(calls, 1);
  assert.equal((await rpc('tools/call', { name: 'get_application', arguments: { id } })).result.structuredContent.application.id, id);
  assert.equal((await rpc('tools/call', { name: 'get_application', arguments: { id: 'alignminds-mern' } })).result.structuredContent.application.id, 'alignminds-mern');
  for (const invalidId of ['', 'x'.repeat(2001), { $ne: null }]) {
    const invalid = await rpc('tools/call', { name: 'get_application', arguments: { id: invalidId } });
    assert.ok(invalid.error || invalid.result?.isError);
  }
  assert.equal((await rpc('tools/call', { name: 'get_application', arguments: { id: '123e4567-e89b-42d3-a456-426614174001' } })).result.isError, true);
  assert.equal((await route.GET(new Request(config.resource))).status, 405);
});

test('discovery advertises only public read scope and the configured resource', () => {
  const env = { AUTH0_DOMAIN: 'tenant.auth0.com', APP_BASE_URL: 'https://tracker.example' };
  const metadata = load('lib/mcp/config.ts', { '../auth-policy': { authConfigured: () => true } }, env).resourceMetadata();
  assert.equal(metadata.resource, config.resource);
  assert.equal(metadata.scopes_supported.join(' '), 'read:applications');
  assert.equal(JSON.stringify(metadata).includes('SECRET'), false);
});
