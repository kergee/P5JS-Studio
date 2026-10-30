import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';

const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const transpile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2021 } }).outputText;
const dependenciesUrl = moduleUrl(transpile(await readFile(new URL('../src/lib/projectDependencies.ts', import.meta.url), 'utf8')));
const { checkProjectDependencies, decodeLocalScript } = await import(dependenciesUrl);
const data = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

test('dependency checks preserve declaration order and handle local path aliases, missing and remote scripts', () => {
  const assets = { 'libraries/一.js': data('var greeting = "你好";'), '/two.js': data('var two = 2;') };
  assert.deepEqual(checkProjectDependencies(['./libraries/一.js', 'two.js', 'absent.js', 'https://cdn.test/lib.js', '//cdn.test/a.js', ''], assets).map((x) => x.status),
    ['ready', 'ready', 'missing', 'external', 'external', 'invalid']);
  assert.deepEqual(checkProjectDependencies([], assets), []);
  assert.equal(decodeLocalScript(assets['libraries/一.js']), 'var greeting = "你好";');
});

test('inline scripts remain compatible; corrupt files report invalid without throwing', () => {
  const assets = { 'bad.js': 'data:text/javascript;base64,!!!!', 'broken.js': 'data:text/javascript,%zz' };
  assert.deepEqual(checkProjectDependencies(['bad.js', 'broken.js', data('var ok=1')], assets).map((x) => x.status), ['invalid', 'invalid', 'ready']);
});

let previewSource = await readFile(new URL('../src/lib/p5source.ts', import.meta.url), 'utf8');
previewSource = previewSource.replace('"./projectDependencies"', JSON.stringify(dependenciesUrl))
  .replace('"./runtimes"', JSON.stringify(moduleUrl('export const LEGACY_P5_VERSION = "test";')))
  .replace('"./runtimeSources"', JSON.stringify(moduleUrl('export const getRuntimeSources = () => ({source:"",sound:""});')))
  .replace('"./serialProtocol"', JSON.stringify(moduleUrl('export const serialBootstrapSource = () => "";')));
const { buildSrcdoc } = await import(moduleUrl(transpile(previewSource)));

test('preview loads classic libraries in declared order and isolates script-closing text', () => {
  const html = buildSrcdoc('', {
    'a.js': data('window.order=["first"]; window.label="</script>";'),
    'b.js': data('window.order.push("second");'),
  }, ['a.js', 'b.js']);
  const scripts = [...html.matchAll(/<script data-p5studio-library="[^"]*">([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 2);
  const context = { window: {} };
  scripts.forEach((script) => vm.runInNewContext(script[1], context));
  assert.equal(context.window.order.join(','), 'first,second');
  assert.equal(context.window.label, '</script>');
  const reversed = buildSrcdoc('', { 'a.js': data(''), 'b.js': data('') }, ['b.js', 'a.js']);
  assert.ok(reversed.indexOf('data-p5studio-library="b.js"') < reversed.indexOf('data-p5studio-library="a.js"'));
});

test('missing or malformed scripts produce diagnostics; empty dependencies support ordinary projects', () => {
  assert.doesNotThrow(() => buildSrcdoc('function setup() {}'));
  const html = buildSrcdoc('', { 'bad.js': 'data:text/javascript;base64,!!!!' }, ['missing.js', 'bad.js']);
  assert.ok(html.includes('Library not found: missing.js'));
  assert.ok(html.includes('Library could not be loaded as a local script: bad.js'));
});

test('existing optional ml5 local URL compatibility is retained', () => {
  const html = buildSrcdoc('');
  assert.ok(html.includes('https://storage.googleapis.com/tfjs-models/tfjs/sentiment_cnn_v1/'));
  assert.ok(html.includes('libraries/ml5-models/sentiment_cnn_v1/'));
});
