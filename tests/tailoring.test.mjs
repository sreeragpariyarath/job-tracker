import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';

function load(file, deps, context = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports, require: id => deps[id], ...context });
  return exports;
}
test('Groq output is validated and usage is retained', async () => {
  const schema = load('lib/tailored-draft.ts', { zod: { z } });
  const content = { fitSummary: 'A match', matchingQualifications: ['React'], missingQualifications: [], resume: 'Resume text', emailSubject: 'Application', emailBody: 'Hello' };
  let request;
  const api = load('lib/generate-tailored.ts', { 'server-only': {}, './tailored-draft': schema }, {
    process: { env: { GROQ_API_KEY: 'test-key' } }, AbortSignal,
    fetch: async (url, options) => { request = { url, options }; return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(content) }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } }) }; },
  });
  const result = await api.generateTailored({ skills: 'React' }, { company: 'Acme', title: 'Developer', description: 'React' });
  assert.equal(result.content.resume, 'Resume text');
  assert.equal(result.usage.totalTokens, 30);
  assert.equal(request.options.headers.Authorization, 'Bearer test-key');
  assert.equal(request.url.includes('test-key'), false);
});
test('incomplete Groq output cannot become a draft', async () => {
  const schema = load('lib/tailored-draft.ts', { zod: { z } });
  const api = load('lib/generate-tailored.ts', { 'server-only': {}, './tailored-draft': schema }, { process: { env: { GROQ_API_KEY: 'test-key' } }, AbortSignal, fetch: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{}' }, finish_reason: 'stop' }] }) }) });
  await assert.rejects(api.generateTailored({}, { company: 'Acme', title: 'Developer', description: 'Job' }), /incomplete/);
});
