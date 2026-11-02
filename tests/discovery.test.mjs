import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import crypto from 'node:crypto';

function setup() {
  const jobs = new Map(); const apps = [];
  const db = { collection: name => name === 'discovered_jobs' ? {
    updateOne: async (filter, update) => { if (jobs.has(filter._id)) return { upsertedCount: 0 }; jobs.set(filter._id, structuredClone(update.$setOnInsert)); return { upsertedCount: 1 }; },
    find: () => ({ sort: () => ({ toArray: async () => [...jobs.values()].filter(j => j.status !== 'dismissed') }) }),
  } : { find: () => ({ toArray: async () => apps }) } };
  const exports = {};
  const deps = { 'server-only': {}, 'node:crypto': crypto, './db': { getDb: async () => db } };
  let payload = { data: [] };
  const requests = [];
  const fetch = async url => { requests.push(url); return { ok: true, json: async () => payload }; };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/discovery.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
    { exports, require: id => deps[id], URL, AbortSignal, fetch, process: { env: { JSEARCH_API_KEY: 'test-key' } }, Date });
  return { api: exports, jobs, apps, requests, setPayload: value => { payload = value; } };
}
test('FreeHire location and remote filters do not widen to all India jobs', async () => {
  const h = setup();
  await h.api.searchJobs('developer', 'freehire', { location: 'Kochi' });
  await h.api.searchJobs('developer', 'freehire', { remote: true });
  assert.equal(h.requests[0].searchParams.get('cities'), 'Kochi');
  assert.equal(h.requests[0].searchParams.has('countries'), false);
  assert.equal(h.requests[1].searchParams.get('countries'), 'IN');
  assert.equal(h.requests[1].searchParams.get('work_mode'), 'remote');
});
test('search deduplicates tracking links and retains dismissed state', async () => {
  const h = setup();
  h.setPayload({ data: [{ public_slug: 'a', title: 'Developer', company: 'Acme', location: 'Kochi', url: 'https://jobs.example/1?utm_source=a', description: 'Job' }] });
  assert.equal((await h.api.searchJobs('developer', 'freehire')).added, 1);
  [...h.jobs.values()][0].status = 'dismissed';
  h.setPayload({ data: [{ public_slug: 'b', title: 'Developer', company: 'Acme', location: 'Kochi', url: 'https://jobs.example/1?utm_source=b' }] });
  assert.equal((await h.api.searchJobs('developer', 'freehire')).added, 0);
  assert.equal((await h.api.listJobs()).length, 0);
});
test('unsafe links are rejected and existing applications are flagged', async () => {
  const h = setup();
  h.setPayload({ data: [{ public_slug: 'a', title: 'Developer', company: 'Acme', location: 'Kochi', url: 'javascript:alert(1)' }, { public_slug: 'b', title: 'Developer', company: 'Acme', location: 'Kochi', url: 'https://jobs.example/2' }] });
  assert.equal((await h.api.searchJobs('developer', 'freehire')).found, 1);
  h.apps.push({ company: 'Acme', role: 'Developer', link: '' });
  assert.equal((await h.api.listJobs())[0].applied, true);
});
test('strict location policy accepts Kochi office and hybrid plus remote in named cities only', async () => {
  const h = setup();
  const input = [
    ['Kochi, Kerala, India', 'onsite', true], ['Ernakulam', 'hybrid', true],
    ['Bangalore, India', 'remote', true], ['Bengaluru', 'remote', true],
    ['Trivandrum', 'remote', true], ['Thiruvananthapuram', 'remote', true],
    ['Kochi', 'remote', true], ['Bengaluru', 'hybrid', false], ['Faridabad', 'onsite', false],
    ['Cochin, Canada', 'onsite', false], ['India', 'remote', false], ['', 'remote', false],
    ['Remote, India; Philippines', 'remote', false], ['Kochi', '', true],
  ];
  for (const [location, workMode, expected] of input) assert.equal(h.api.matchesLocationPolicy({ location, workMode }), expected, `${location} ${workMode}`);
  assert.equal(h.api.matchesLocationPolicy({ location: 'Kochi', workMode: 'onsite', country: 'CA' }), false);
  h.jobs.set('excluded', { _id: 'excluded', location: 'Bengaluru', workMode: 'onsite', status: 'new' });
  assert.equal((await h.api.listJobs()).length, 0);
});
test('search filters provider results before saving and distinguishes remote from city searches', async () => {
  const h = setup();
  const rows = [
    ['kochi', 'Kochi', 'onsite'], ['bad-kochi', 'Cochin, Canada', 'onsite'],
    ['other-city', 'Faridabad', 'onsite'], ['remote-bangalore', 'Bengaluru', 'remote'],
    ['remote-unspecified', 'India', 'remote'], ['remote-trivandrum', 'Trivandrum', 'remote'],
    ['hybrid-bangalore', 'Bengaluru', 'hybrid'],
  ].map(([id, location, work_mode]) => ({ public_slug: id, title: 'Developer', company: 'Acme', location, work_mode, url: `https://jobs.example/${id}` }));
  h.setPayload({ data: rows });
  assert.equal((await h.api.searchJobs('developer', 'freehire', { location: 'Bangalore' })).found, 1);
  assert.equal(h.requests[0].searchParams.get('cities'), 'Kochi');
  assert.equal((await h.api.searchJobs('developer', 'freehire', { remote: true })).found, 2);
  assert.deepEqual([...h.jobs.values()].map(job => job.location).sort(), ['Bengaluru', 'Kochi', 'Trivandrum']);
});
test('JSearch applies the same policy using provider location and remote fields', async () => {
  const h = setup();
  h.setPayload({ data: { jobs: [
    { job_id: '1', job_title: 'Developer', employer_name: 'A', job_city: 'Kochi', job_state: 'Kerala', job_country: 'IN', job_is_remote: false, job_apply_link: 'https://jobs.example/1' },
    { job_id: '2', job_title: 'Developer', employer_name: 'B', job_location: 'Bengaluru, India', job_country: 'IN', job_is_remote: true, job_apply_link: 'https://jobs.example/2' },
    { job_id: '3', job_title: 'Developer', employer_name: 'C', job_location: 'Bengaluru, India', job_country: 'IN', job_is_remote: false, job_apply_link: 'https://jobs.example/3' },
    { job_id: '4', job_title: 'Developer', employer_name: 'D', job_location: 'India', job_country: 'IN', job_is_remote: true, job_apply_link: 'https://jobs.example/4' },
  ] } });
  assert.equal((await h.api.searchJobs('developer', 'jsearch', { location: 'Kochi' })).found, 1);
  assert.equal((await h.api.searchJobs('developer', 'jsearch', { remote: true })).found, 1);
  assert.equal(h.requests[1].searchParams.get('work_from_home'), 'true');
});
test('scheduled search denies requests without the exact secret', async () => {
  const exports = {};
  const deps = { 'node:crypto': crypto, 'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } }, '@/lib/db': { getDb: async () => { throw new Error('database must not be reached'); } }, '@/lib/discovery-settings': {}, '@/lib/discovery': {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/cron/discovery/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
    { exports, require: id => deps[id], process: { env: { CRON_SECRET: 'test-secret' } }, Buffer, Response });
  for (const authorization of ['', 'Bearer wrong']) {
    const response = await exports.GET(new Request('https://example.test/api/cron/discovery', { headers: { authorization } }));
    assert.equal(response.status, 401);
  }
});
