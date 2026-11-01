'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { hashFile } = require('../src/asar.cjs');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'postman-zh-check-package-'));
try {
  for (const line of fs.readFileSync(path.join(dist, 'SHA256SUMS'), 'utf8').trim().split('\n')) {
    const [digest, name] = line.split(/\s+/);
    assert.equal(hashFile(path.join(dist, name)), digest, `下载校验失败：${name}`);
    const names = execFileSync('/usr/bin/unzip', ['-Z1', path.join(dist, name)], { encoding: 'utf8' }).split('\n').filter(Boolean);
    assert.ok(names.every(file => !file.startsWith('/') && !file.split('/').includes('..')), '归档路径必须位于包内');
    assert.ok(names.every(file => !/(node_modules|\.git\/|\.app\/|\.asar$|\.DS_Store|__MACOSX)/.test(file)), '不能夹带依赖、本机应用或系统资料');
    execFileSync('/usr/bin/ditto', ['-x', '-k', path.join(dist, name), temp]);
  }
  const bundle = path.join(temp, 'postman-zh');
  const manifest = JSON.parse(fs.readFileSync(path.join(bundle, 'MANIFEST.json')));
  function list(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory() ? list(file) : [path.relative(bundle, file).split(path.sep).join('/')];
    });
  }
  assert.deepEqual(list(bundle).filter(file => file !== 'MANIFEST.json').sort(), Object.keys(manifest).sort(), '所有包内文件都必须列入清单');
  for (const [name, hash] of Object.entries(manifest)) {
    assert.ok(!path.isAbsolute(name) && !name.split('/').includes('..'));
    assert.equal(hashFile(path.join(bundle, name)), hash, `包内校验失败：${name}`);
  }
  for (const name of ['LICENSE','THIRD_PARTY_NOTICES.md','README.md','README.en.md','docs/installation.md','vendor/hlmd-LICENSE','src/runtime/chrome.cjs']) assert.ok(manifest[name], `缺少发布文件：${name}`);
  for (const name of ['postman-zh.command','恢复原版.command']) assert.ok(fs.statSync(path.join(bundle, name)).mode & 0o111, `${name} 缺少执行权限`);
  const version = require('../package.json').version;
  assert.equal(JSON.parse(fs.readFileSync(path.join(bundle, 'BUILD_INFO.json'))).version, version);
  assert.equal(execFileSync(process.execPath, [path.join(bundle,'src/cli.cjs'),'--version'], { encoding: 'utf8' }).trim(), version);
  assert.ok(fs.existsSync(path.join(temp,'postman-zh-media-kit/assets/social-preview.png')));
  assert.ok(fs.existsSync(path.join(temp,'postman-zh-media-kit/README.md')));
  console.log(`发布包检查通过：${Object.keys(manifest).length} 个文件，执行权限、版本、许可、素材与校验值完整。`);
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
