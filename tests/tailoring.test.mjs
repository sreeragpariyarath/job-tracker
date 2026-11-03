import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { PDFParse } from 'pdf-parse';

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
  const prompt = JSON.parse(request.options.body);
  assert.match(prompt.messages[0].content, /Do not simply reproduce/);
  assert.match(prompt.messages[1].content, /React/);
});
test('resume comparison detects unchanged content and changed wording', () => {
  const api = load('lib/tailoring-comparison.ts', {});
  const original = 'EXPERIENCE\nBuilt user interfaces with React and TypeScript.';
  assert.equal(api.compareResume(original, original).sameText, true);
  const result = api.compareResume(original, 'EXPERIENCE\nBuilt responsive interfaces using React and TypeScript.');
  assert.equal(result.sameText, false);
  assert.equal(result.changedLines.length, 1);
  assert.equal(api.compareResume('', original).available, false);
});
test('incomplete Groq output cannot become a draft', async () => {
  const schema = load('lib/tailored-draft.ts', { zod: { z } });
  const api = load('lib/generate-tailored.ts', { 'server-only': {}, './tailored-draft': schema }, { process: { env: { GROQ_API_KEY: 'test-key' } }, AbortSignal, fetch: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{}' }, finish_reason: 'stop' }] }) }) });
  await assert.rejects(api.generateTailored({}, { company: 'Acme', title: 'Developer', description: 'Job' }), /incomplete/);
});
test('resume PDF contains selectable saved text across pages', async () => {
  const api = load('lib/resume-pdf.ts', { pdfkit: { default: PDFDocument }, 'node:path': { default: path } }, { Buffer, process });
  const input = Array.from({ length: 100 }, (_, i) => `Experience ${i}: Built accessible software.`).join('\n');
  const pdf = await api.renderResumePdf(input);
  const parser = new PDFParse({ data: pdf });
  try { const result = await parser.getText(); assert.match(result.text, /Experience 0: Built accessible software/); assert.match(result.text, /Experience 99: Built accessible software/); assert.ok(result.total > 1); }
  finally { await parser.destroy(); }
});
test('number review finds values missing from the profile', () => {
  const api = load('lib/draft-review.ts', {});
  assert.deepEqual(Array.from(api.findUnverifiedNumbers('Worked for 8 years on 3 projects', 'Completed 3 projects')), ['8']);
});
test('resume PDF renders and extracts common CV bullets and hyphens', async () => {
  const api = load('lib/resume-pdf.ts', { pdfkit: { default: PDFDocument }, 'node:path': { default: path } }, { Buffer, process });
  const pdf = await api.renderResumePdf('SAMPLE CANDIDATE\nDeveloper\n\nEXPERIENCE\n\uf0b7 Built an end\u2011to\u2011end application.\n• Led real-time work.');
  const parser = new PDFParse({ data: pdf });
  try { const result = await parser.getText(); assert.match(result.text, /Built an end-to-end application/); assert.match(result.text, /Led real-time work/); assert.doesNotMatch(result.text, /[\u0000\uFFFD\uF0B7]/); }
  finally { await parser.destroy(); }
});
