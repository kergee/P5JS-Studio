import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/serialProtocol.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const protocol = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const scope = { owner: 'editor-1', project: 'class/example', run: 'run-1' };

function frame(activeScope = scope) {
  const sent = [], listeners = {}, timers = new Map();
  let timerId = 0;
  const parent = { postMessage: (message) => sent.push(message) };
  const window = {
    parent, addEventListener: (name, fn) => { listeners[name] = fn; },
    setTimeout: (fn) => { timers.set(++timerId, fn); return timerId; },
    clearTimeout: (id) => timers.delete(id),
  };
  vm.runInNewContext(protocol.serialBootstrapSource(activeScope), { window, TextEncoder, console });
  const receive = (type, extra = {}, source = parent, fields = activeScope) => listeners.message({ source, data: { type, ...fields, ...extra } });
  return { api: window.studioSerial, window, sent, timers, receive, close: () => listeners.pagehide() };
}

test('scope and UTF-8 byte limits reject stale project/run and malformed lines', () => {
  assert.equal(protocol.matchesSerialScope({ ...scope }, scope), true);
  for (const changed of [{ owner: 'old' }, { project: 'other' }, { run: 'old' }]) {
    assert.equal(protocol.matchesSerialScope({ ...scope, ...changed }, scope), false);
  }
  assert.equal(protocol.matchesSerialScope({ owner: '', project: '', run: '' }, { owner: '', project: '', run: '' }), false);
  assert.equal(protocol.validSerialLine('中'.repeat(2730)), true);
  for (const invalid of ['中'.repeat(2731), 'x'.repeat(8193), 'a\nb', 'a\rb', null, {}]) assert.equal(protocol.validSerialLine(invalid), false);
  assert.equal(protocol.validSerialLine('x'.repeat(8192)), true);
});

test('bootstrap never connects or sends automatically and trusts only its scoped parent', async () => {
  const f = frame();
  assert.deepEqual(f.sent.map((m) => m.type), ['p5studio_serial_ready']);
  await assert.rejects(f.api.writeLine('LED:1'), /not connected/);
  f.receive('p5studio_serial_status', { connected: true }, {});
  f.receive('p5studio_serial_status', { connected: true }, f.window.parent, { ...scope, run: 'old' });
  assert.equal(f.api.connected, false);
  f.receive('p5studio_serial_status', { connected: true });
  assert.equal(f.api.connected, true);
  assert.equal(Object.isFrozen(f.api), true);
  assert.equal(Object.getOwnPropertyDescriptor(f.window, 'studioSerial').writable, false);
});

test('batched JSON lines, unsubscribe and new runs do not duplicate callbacks', () => {
  const old = frame(); const seen = [];
  old.receive('p5studio_serial_status', { connected: true });
  const off = old.api.onLine((line) => seen.push(line));
  old.receive('p5studio_serial_lines', { lines: ['{"value":42}', 'next'] });
  assert.deepEqual(seen, ['{"value":42}', 'next']);
  off(); old.receive('p5studio_serial_lines', { lines: ['ignored'] });
  assert.equal(seen.length, 2);
  old.api.onLine((line) => seen.push(line)); old.close();
  old.receive('p5studio_serial_lines', { lines: ['old run'] });
  const current = frame({ ...scope, run: 'run-2' });
  current.receive('p5studio_serial_status', { connected: true });
  current.api.onLine((line) => seen.push(line));
  current.receive('p5studio_serial_lines', { lines: ['new run'] });
  assert.deepEqual(seen, ['{"value":42}', 'next', 'new run']);
});

test('write replies, failures, disconnect, navigation and timeout settle pending promises', async () => {
  const f = frame(); f.receive('p5studio_serial_status', { connected: true });
  const ok = f.api.writeLine('LED:1');
  assert.equal(f.sent.at(-1).text, 'LED:1');
  f.receive('p5studio_serial_reply', { id: f.sent.at(-1).id }); await ok;
  const failed = f.api.writeLine('LED:0');
  f.receive('p5studio_serial_reply', { id: f.sent.at(-1).id, error: 'write_failed' });
  await assert.rejects(failed, /write_failed/);
  const disconnected = f.api.writeLine('LED:1');
  f.receive('p5studio_serial_status', { connected: false }); await assert.rejects(disconnected, /disconnected/);
  f.receive('p5studio_serial_status', { connected: true });
  const timeout = f.api.writeLine('LED:1'); [...f.timers.values()][0](); await assert.rejects(timeout, /timed out/);
  const leaving = f.api.writeLine('LED:0'); f.close(); await assert.rejects(leaving, /disconnected/);
  assert.equal(f.api.connected, false);
  await assert.rejects(f.api.writeLine('a\nb'), /one UTF-8 line/);
});
