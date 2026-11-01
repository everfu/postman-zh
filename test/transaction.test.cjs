'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { replaceApp, parse } = require('../src/cli.cjs');

test('failed post-swap validation restores the entire original bundle', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'postman-zh-transaction-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, 'Postman.app'), temporary = path.join(root, 'stage'); fs.mkdirSync(temporary);
  const prepared = path.join(temporary, 'Postman.app');
  fs.mkdirSync(app); fs.mkdirSync(prepared);
  fs.writeFileSync(path.join(app, 'signature'), 'vendor-signature');
  fs.writeFileSync(path.join(prepared, 'signature'), 'local-signature');
  assert.throws(() => replaceApp(app, prepared, temporary, () => { throw Error('simulated signing failure'); }), /simulated/);
  assert.equal(fs.readFileSync(path.join(app, 'signature'), 'utf8'), 'vendor-signature');
  assert.equal(fs.readFileSync(path.join(prepared, 'signature'), 'utf8'), 'local-signature');
  replaceApp(app, prepared, temporary, () => {});
  assert.equal(fs.readFileSync(path.join(app, 'signature'), 'utf8'), 'local-signature');
  assert.equal(fs.readFileSync(path.join(temporary, 'previous.app', 'signature'), 'utf8'), 'vendor-signature');
});

test('CLI rejects conflicting actions and missing or unknown arguments', () => {
  assert.equal(parse(['--restore', '--app', '/some path/Postman.app']).action, 'restore');
  assert.throws(() => parse(['--restore', '--install']));
  assert.throws(() => parse(['--app']));
  assert.throws(() => parse(['--unexpected']));
  assert.equal(parse(['--version']).version, true);
  assert.throws(() => parse(['--version', '--restore']));
});

test('version and help can be read without locating or changing Postman', () => {
  const { execFileSync } = require('node:child_process');
  const cli = require.resolve('../src/cli.cjs');
  assert.equal(execFileSync(process.execPath, [cli, '--version'], { encoding: 'utf8' }).trim(), require('../package.json').version);
  assert.match(execFileSync(process.execPath, [cli, '--help'], { encoding: 'utf8' }), /--restore/);
});
