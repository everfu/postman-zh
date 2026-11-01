'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { hashFile } = require('../src/asar.cjs');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const output = path.join(dist, 'postman-zh-macos.zip');
const directory = path.join(dist, 'postman-zh');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'postman-zh-package-'));
const bundle = path.join(temporary, 'postman-zh');
const media = path.join(temporary, 'postman-zh-media-kit');
const mediaOutput = path.join(dist, 'postman-zh-media-kit.zip');
const pkg = require('../package.json');
function list(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? list(file) : [file];
  });
}
function buildInfo() {
  let revision = null;
  try { revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim(); } catch { /* Local source snapshot without git. */ }
  return { name: pkg.name, version: pkg.version, revision };
}
try {
  fs.mkdirSync(bundle);
  for (const name of ['postman-zh.command', '恢复原版.command', 'README.md', 'README.en.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', 'package.json', 'package-lock.json', 'src', 'locales', 'vendor', 'test', 'scripts', 'docs']) {
    fs.cpSync(path.join(root, name), path.join(bundle, name), { recursive: true });
  }
  fs.writeFileSync(path.join(bundle, 'BUILD_INFO.json'), JSON.stringify(buildInfo(), null, 2) + '\n');
  const manifest = Object.fromEntries(list(bundle).sort().map(file => [path.relative(bundle, file).split(path.sep).join('/'), hashFile(file)]));
  fs.writeFileSync(path.join(bundle, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.mkdirSync(media);
  fs.cpSync(path.join(root, 'docs/assets'), path.join(media, 'assets'), { recursive: true });
  fs.copyFileSync(path.join(root, 'docs/media-kit.md'), path.join(media, 'README.md'));
  fs.copyFileSync(path.join(root, 'LICENSE'), path.join(media, 'LICENSE'));
  fs.mkdirSync(dist, { recursive: true });
  // Refresh both the archive and the folder people may have already extracted.
  // Never delete an unrelated destination or include installed applications.
  if (fs.existsSync(directory) && JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8')).name !== 'postman-zh-macos') throw Error('输出目录不是本项目，已取消');
  fs.cpSync(bundle, directory, { recursive: true });
  execFileSync('/usr/bin/ditto', ['-c', '-k', '--norsrc', '--keepParent', bundle, output]);
  execFileSync('/usr/bin/ditto', ['-c', '-k', '--norsrc', '--keepParent', media, mediaOutput]);
  execFileSync('/usr/bin/unzip', ['-t', output], { stdio: 'ignore' });
  execFileSync('/usr/bin/unzip', ['-t', mediaOutput], { stdio: 'ignore' });
  fs.writeFileSync(path.join(dist, 'SHA256SUMS'), [output, mediaOutput].map(file => `${hashFile(file)}  ${path.basename(file)}`).join('\n') + '\n');
  console.log(`已生成 v${pkg.version} 工具包、素材包和 SHA256SUMS：${dist}`);
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
