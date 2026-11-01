'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readArchive, patchArchive, sha256, hashFile } = require('../src/asar.cjs');

test('patched archives round-trip with official ASAR, preserving binary, links, and unpacked entries', async t => {
  const asar = await import('@electron/asar');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'postman-zh-asar-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source'); fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'preload.js'), 'ORIGINAL');
  fs.writeFileSync(path.join(source, 'binary.dat'), Buffer.from([0, 13, 255, 123]));
  fs.writeFileSync(path.join(source, 'native.node'), 'unpacked-content');
  fs.symlinkSync('binary.dat', path.join(source, 'link'));
  const baseline = path.join(root, 'baseline.asar'), output = path.join(root, 'patched.asar');
  await asar.createPackageWithOptions(source, baseline, { unpack: '*.node' });
  const before = hashFile(baseline);
  const headerHash = patchArchive(baseline, output, { 'preload.js': 'PATCHED', 'postman-zh/new.json': '{"语言":"中文"}' });
  assert.equal(hashFile(baseline), before);
  assert.equal(asar.extractFile(output, 'preload.js').toString(), 'PATCHED');
  assert.deepEqual(asar.extractFile(output, 'binary.dat'), Buffer.from([0, 13, 255, 123]));
  assert.deepEqual(asar.extractFile(output, 'link'), Buffer.from([0, 13, 255, 123]));
  assert.equal(asar.statFile(output, 'native.node').unpacked, true);
  assert.equal(readArchive(output).read('postman-zh/new.json').toString(), '{"语言":"中文"}');
  assert.equal(asar.statFile(output, 'preload.js').integrity.hash, sha256(Buffer.from('PATCHED')));
  assert.equal(headerHash, sha256(Buffer.from(asar.getRawHeader(output).headerString)));
  assert.throws(() => patchArchive(output, output, {}));
  assert.throws(() => patchArchive(baseline, path.join(root, 'bad.asar'), { '../evil': 'bad' }));
});

test('reject truncated and malformed ASAR headers', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'postman-zh-invalid-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'bad.asar'); fs.writeFileSync(file, 'bad');
  assert.throws(() => readArchive(file), /有效/);
});
