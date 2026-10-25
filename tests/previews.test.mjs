import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import crypto from 'node:crypto';

function setup() {
  const rows = { application_previews: [], applications: [], application_creation_locks: [] };
  const matches = (row, filter) => Object.entries(filter).every(([key, value]) => {
    if (value && typeof value === 'object' && '$gt' in value) return row[key] > value.$gt;
    if (value && typeof value === 'object' && '$exists' in value) return (row[key] !== undefined) === value.$exists;
    return row[key] === value;
  });
  const db = { client: { startSession: () => ({ withTransaction: async callback => {
    const snapshot = structuredClone(rows);
    try { return await callback(); } catch (error) { Object.assign(rows, snapshot); throw error; }
  }, endSession: async () => {} }) }, collection: name => ({
    find: () => ({ toArray: async () => rows[name] }),
    findOne: async filter => rows[name].find(row => matches(row, filter)) ?? null,
    insertOne: async doc => { rows[name].push(structuredClone(doc)); },
    updateOne: async (filter, update, options) => {
      let row = rows[name].find(row => matches(row, filter));
      if (!row && options?.upsert) { row = { ...filter, ...update.$setOnInsert }; rows[name].push(row); }
      if (!row) return { modifiedCount: 0 };
      Object.assign(row, update.$set);
      for (const [key, value] of Object.entries(update.$inc ?? {})) row[key] += value;
      return { modifiedCount: 1 };
    },
  }) };
  const exports = {};
  const deps = { 'server-only': {}, crypto, './db': { getDb: async () => db }, './applications': { normalizeApplication: input => ({ status: 'Applied', link: '', ...input }) } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/application-previews.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
    { exports, require: id => deps[id], URL, Date, process: { env: { APP_BASE_URL: 'https://tracker.example' } } });
  return { api: exports, rows };
}
const identity = { sub: 'owner', clientId: 'client-a', scopes: ['read:applications', 'write:applications'] };
const draft = { company: 'Acme', role: 'Developer', applied: '2026-10-25' };

test('creation requires browser approval, exact owner/client and write scope; retries return the same record', async () => {
  const { api, rows } = setup();
  const preview = await api.previewApplication(draft, identity);
  assert.equal(rows.applications.length, 0);
  await assert.rejects(api.createPreviewApplication(preview.confirmationId, identity), /Owner approval/);
  assert.equal(await api.approvePreview(preview.confirmationId, 'other'), false);
  assert.equal(await api.approvePreview(preview.confirmationId, 'owner'), true);
  await assert.rejects(api.createPreviewApplication(preview.confirmationId, { ...identity, clientId: 'other' }), /not found/);
  await assert.rejects(api.createPreviewApplication(preview.confirmationId, { ...identity, scopes: ['read:applications'] }), /Write permission/);
  const saved = await api.createPreviewApplication(preview.confirmationId, identity);
  assert.equal(saved.alreadyCreated, false);
  const retry = await api.createPreviewApplication(preview.confirmationId, identity);
  assert.equal(retry.applicationId, saved.applicationId);
  assert.equal(retry.alreadyCreated, true);
  assert.equal(rows.applications.length, 1);
  assert.equal(rows.applications[0].auditHistory[0].actor, 'owner');
  assert.equal(rows.applications[0].provenance.clientId, 'client-a');
});

test('expired previews cannot be approved or created; legacy and URL duplicates are rejected', async () => {
  const { api, rows } = setup();
  const expired = await api.previewApplication(draft, identity);
  rows.application_previews[0].expiresAt = new Date(0);
  assert.equal(await api.approvePreview(expired.confirmationId, 'owner'), false);
  await assert.rejects(api.createPreviewApplication(expired.confirmationId, identity), /expired/);
  rows.applications.push({ ...draft, company: ' ACME ', _id: 'legacy' });
  const duplicate = await api.previewApplication(draft, identity);
  assert.equal(duplicate.duplicates[0].id, 'legacy');
  await api.approvePreview(duplicate.confirmationId, 'owner');
  await assert.rejects(api.createPreviewApplication(duplicate.confirmationId, identity), /Duplicate/);
  rows.applications.push({ ...draft, _id: 'url-legacy', link: 'https://example.com/job/1?utm_source=email' });
  const sameUrl = await api.previewApplication({ ...draft, company: 'Different', applied: '2026-10-24', link: 'https://example.com/job/1#details' }, identity);
  assert.equal(sameUrl.duplicates[0].id, 'url-legacy');
  assert.equal(rows.applications.length, 2);
});
