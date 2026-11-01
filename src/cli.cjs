#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { readArchive, patchArchive, hashFile, sha256 } = require('./asar.cjs');
const ROOT = path.resolve(__dirname, '..');
const VERSION = require('../package.json').version;
const MARKER = '/* POSTMAN_ZH_V1 */';
const manifestRelative = 'Contents/Resources/postman-zh.json';
const archiveRelative = 'Contents/Resources/app.asar';
const runtimeNames = ['preferences.cjs', 'renderer.cjs', 'main.cjs', 'chrome.cjs'];

function command(program, args, options = {}) {
  const result = spawnSync(program, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) throw Error(`${path.basename(program)} 执行失败：${result.error?.message || result.stderr?.trim() || result.stdout?.trim()}`);
  return result.stdout.trim();
}
function plist(file, key) { return command('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, file]); }
function detectApp(explicit) {
  const candidates = explicit ? [explicit] : ['/Applications/Postman.app', path.join(os.homedir(), 'Applications/Postman.app')];
  const found = candidates.find(candidate => fs.existsSync(candidate));
  if (!found) throw Error('没有找到 Postman.app，请使用 --app /完整路径/Postman.app');
  const app = fs.realpathSync(found);
  if (!app.endsWith('.app') || plist(path.join(app, 'Contents/Info.plist'), 'CFBundleIdentifier') !== 'com.postmanlabs.mac') throw Error('所选路径不是 Postman macOS 应用');
  if (!fs.existsSync(path.join(app, archiveRelative))) throw Error('此版本没有 app.asar，暂不支持。原应用未修改。');
  return app;
}
function inspect(app) {
  const asarPath = path.join(app, archiveRelative), archive = readArchive(asarPath);
  const pkg = JSON.parse(archive.read('package.json'));
  const version = plist(path.join(app, 'Contents/Info.plist'), 'CFBundleShortVersionString');
  const preload = ['preload_desktop.js', 'preload/desktop/index.js'].find(name => archive.entry(name));
  if (!/^(10|11|12)\./.test(version) || !preload || pkg.main !== 'main.js' || !archive.entry('main.js')) throw Error(`未适配的应用结构 / 版本：${version}。原应用未修改。`);
  const markerFile = path.join(app, manifestRelative);
  const manifest = fs.existsSync(markerFile) ? JSON.parse(fs.readFileSync(markerFile, 'utf8')) : null;
  if (!manifest && ['pm-chinese.js', 'pm-main-cn.js', 'pm-scratchpad-cn.js'].some(name => archive.entry(name))) throw Error('检测到其他汉化工具的补丁，请先使用对应工具恢复原版。');
  if (!manifest && (archive.read(preload).includes(MARKER) || archive.entry('postman-zh/renderer.cjs'))) throw Error('检测到缺少恢复记录的汉化补丁，请先恢复官方应用再安装。');
  return { app, version, preload, archive, asarPath, manifest, hash: hashFile(asarPath) };
}
function assets() {
  const files = {};
  for (const name of runtimeNames) files[`postman-zh/${name}`] = fs.readFileSync(path.join(ROOT, 'src/runtime', name));
  for (const name of ['zh-CN.json', 'scratchpad.json', 'menu.json']) files[`postman-zh/${name}`] = fs.readFileSync(path.join(ROOT, 'locales', name));
  return files;
}
function assetsHash(files) {
  const hash = crypto.createHash('sha256');
  hash.update(VERSION);
  hash.update(fs.readFileSync(__filename)).update(fs.readFileSync(path.join(__dirname, 'asar.cjs')));
  for (const [name, data] of Object.entries(files)) hash.update(name).update('\0').update(data);
  return hash.digest('hex');
}
function verifyBackup(info, backupRoot) {
  const manifest = info.manifest;
  if (manifest.format !== 1 || manifest.appPath !== info.app || manifest.version !== info.version || manifest.patchedHash !== info.hash) throw Error('当前应用与安装记录不一致，拒绝覆盖。若 Postman 已升级，请使用当前版本的官方应用重新安装汉化。');
  const backup = fs.realpathSync(manifest.backupApp);
  const realRoot = fs.realpathSync(backupRoot);
  if (!backup.startsWith(realRoot + path.sep) || hashFile(path.join(backup, archiveRelative)) !== manifest.originalHash || hashFile(path.join(backup, 'Contents/Info.plist')) !== manifest.originalPlistHash) throw Error('原版备份缺失、位置不符或校验失败，拒绝继续。');
  command('/usr/bin/codesign', ['--verify', '--deep', '--strict', backup]);
  return backup;
}
function running(app) {
  const output = command('/bin/ps', ['-axo', 'pid=,comm=']);
  return output.split('\n').some(line => {
    const match = /^\s*(\d+)\s+(.+)$/.exec(line);
    return match && Number(match[1]) !== process.pid && match[2].startsWith(app + '/Contents/');
  });
}
async function ensureClosed(app, quit) {
  if (!running(app)) return;
  if (!quit) throw Error('Postman 正在运行，请先退出，或加 --quit 让脚本正常退出应用。');
  console.log('正在正常退出 Postman，请留意未保存内容的提示…');
  command('/usr/bin/osascript', ['-e', 'on run argv\n tell application (item 1 of argv) to quit\nend run', app], { timeout: 30000 });
  for (let i = 0; i < 40; i++) { if (!running(app)) return; await new Promise(resolve => setTimeout(resolve, 500)); }
  throw Error('Postman 未完全退出（可能有待保存内容）。请保存并退出后重试；脚本不会强制终止进程。');
}
function copyApp(source, destination) {
  command('/usr/bin/ditto', [source, destination]);
}
function sign(app) {
  // Ad-hoc signatures have no vendor Team ID. Keeping the vendor's runtime flag
  // causes dyld to reject even ad-hoc-signed Electron frameworks. Keep existing
  // entitlements, but remove runtime flags only on this locally modified bundle.
  // Gatekeeper, SIP and Electron fuses are never changed. Full vendor backup is kept.
  command('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', '--preserve-metadata=entitlements', '--options', '0', '--timestamp=none', app]);
  command('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
}
function updateIntegrity(app, headerHash) {
  const file = path.join(app, 'Contents/Info.plist');
  const key = 'ElectronAsarIntegrity:Resources/app.asar';
  try { plist(file, key); }
  catch { return; } // Most Postman builds only contain default_app.asar metadata.
  const algorithm = plist(file, `${key}:algorithm`);
  if (algorithm !== 'SHA256') throw Error(`不支持的 ASAR 校验算法：${algorithm}`);
  command('/usr/libexec/PlistBuddy', ['-c', `Set :${key}:hash ${headerHash}`, file]);
}

// All preparation finishes before the live bundle is swapped. On any commit
// failure put the original bundle back. Backups keep the vendor's full signature.
function replaceApp(app, prepared, temporaryRoot, verify = bundle => command('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle])) {
  const rollback = path.join(temporaryRoot, 'previous.app');
  let movedOriginal = false, installed = false;
  try {
    fs.renameSync(app, rollback); movedOriginal = true;
    fs.renameSync(prepared, app); installed = true;
    verify(app);
  } catch (error) {
    try {
      if (installed) fs.renameSync(app, prepared);
      if (movedOriginal) fs.renameSync(rollback, app);
    } catch (recoveryError) {
      const failure = Error(`${error.message}\n自动回滚未完成：${recoveryError.message}\n保留恢复文件：${rollback}\n请勿删除此目录。`);
      failure.keepTemporary = true;
      throw failure;
    }
    throw error;
  }
}

async function execute(options) {
  if (process.platform !== 'darwin') throw Error('此脚本仅支持 macOS。');
  const app = detectApp(options.app);
  const info = inspect(app);
  const backupRoot = path.resolve(options.backupDir || path.join(os.homedir(), 'Library/Application Support/PostmanZH/backups'));
  console.log(`Postman ZH ${VERSION}\nPostman ${info.version}\n位置：${app}\n状态：${info.manifest ? '已安装中文补丁' : '未安装本工具的补丁'}`);
  if (options.action === 'check' || options.action === 'status') {
    command('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
    if (info.manifest) { const backup = verifyBackup(info, backupRoot); console.log(`校验通过；可恢复原版：${backup}`); }
    else console.log(`结构检查通过：${info.preload} + main.js`);
    return;
  }
  // Recovery must work even when translation files are missing or damaged.
  const files = options.action === 'install' ? assets() : null;
  const contentHash = files ? assetsHash(files) : null;
  let source = app;
  if (info.manifest) source = verifyBackup(info, backupRoot);
  if (options.action === 'restore' && !info.manifest) { console.log('无需恢复：未检测到本工具的补丁。'); return; }
  if (options.action === 'install' && info.manifest?.assetsHash === contentHash) { console.log('当前补丁已是相同版本，无需重复安装。'); return; }
  fs.accessSync(path.dirname(app), fs.constants.W_OK);
  await ensureClosed(app, options.quit);
  // Lock is held across backup, signing and commit; concurrent installers refuse.
  const lockPath = path.join(path.dirname(app), `.postman-zh-${sha256(app).slice(0, 16)}.lock`);
  let lock, temporaryRoot, keepTemporary = false;
  try {
    lock = fs.openSync(lockPath, 'wx', 0o600); fs.writeSync(lock, String(process.pid));
    const bytes = Number(command('/usr/bin/du', ['-sk', app]).split(/\s/)[0]) * 1024;
    const volume = fs.statfsSync(path.dirname(app));
    if (volume.bavail * volume.bsize < bytes * 3 + 64 * 1024 * 1024) throw Error('可用空间不足，请为暂存应用和完整备份至少预留应用大小的三倍空间。');
    temporaryRoot = fs.mkdtempSync(path.join(path.dirname(app), '.PostmanZH-'));
    const prepared = path.join(temporaryRoot, 'Postman.app');
    if (options.action === 'restore') {
      console.log('正在准备原版应用…');
      copyApp(source, prepared);
      if (hashFile(path.join(prepared, archiveRelative)) !== info.manifest.originalHash) throw Error('原版暂存副本校验失败');
      command('/usr/bin/codesign', ['--verify', '--deep', '--strict', prepared]);
      await ensureClosed(app, false);
      if (hashFile(path.join(app, archiveRelative)) !== info.hash) throw Error('准备期间应用已发生变化，已取消恢复。');
      replaceApp(app, prepared, temporaryRoot);
      console.log('已恢复原版应用及原始签名。语言偏好与备份已保留。');
    } else {
      let backupApp = source;
      const originalHash = info.manifest?.originalHash || info.hash;
      const originalPlistHash = info.manifest?.originalPlistHash || hashFile(path.join(app, 'Contents/Info.plist'));
      if (!info.manifest) {
        // Refuse to silently stack over an already-invalid/third-party-signed app.
        command('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
        fs.mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
        const backupVolume = fs.statfsSync(backupRoot);
        if (backupVolume.bavail * backupVolume.bsize < bytes + 64 * 1024 * 1024) throw Error('备份所在磁盘空间不足');
        const backupDir = fs.mkdtempSync(path.join(backupRoot, `${info.version}-`));
        backupApp = path.join(backupDir, 'Postman.app');
        console.log(`完整备份：${backupApp}`);
        copyApp(app, backupApp);
        if (hashFile(path.join(backupApp, archiveRelative)) !== originalHash) throw Error('备份校验失败');
        command('/usr/bin/codesign', ['--verify', '--deep', '--strict', backupApp]);
        source = backupApp;
      }
      console.log('正在准备中文补丁…');
      copyApp(source, prepared);
      const baseline = readArchive(path.join(source, archiveRelative));
      const main = baseline.read('main.js').toString();
      const preload = baseline.read(info.preload).toString();
      if (preload.includes(MARKER) || main.includes(MARKER)) throw Error('备份已包含本工具补丁，拒绝重复注入');
      // require paths are relative to each original entry, including older preload/desktop.
      const hook = path.posix.relative(path.posix.dirname(info.preload), 'postman-zh/renderer.cjs');
      files[info.preload] = `${MARKER}\ntry { require(${JSON.stringify(hook.startsWith('.') ? hook : './' + hook)}); } catch (e) { console.warn('[PostmanZH]', e.message); }\n${preload}`;
      files['main.js'] = `${MARKER}\ntry { require('./postman-zh/main.cjs'); } catch (e) { console.warn('[PostmanZH]', e.message); }\n${main}`;
      const destination = path.join(prepared, archiveRelative);
      const next = destination + '.next';
      const headerHash = patchArchive(path.join(source, archiveRelative), next, files);
      fs.renameSync(next, destination);
      updateIntegrity(prepared, headerHash);
      const manifest = { format: 1, toolVersion: VERSION, appPath: app, version: info.version, backupApp, originalHash, originalPlistHash, patchedHash: hashFile(destination), assetsHash: contentHash, installedAt: new Date().toISOString() };
      fs.writeFileSync(path.join(prepared, manifestRelative), JSON.stringify(manifest, null, 2));
      console.log('正在生成本地应用签名并校验…');
      sign(prepared);
      await ensureClosed(app, false);
      if (hashFile(path.join(app, archiveRelative)) !== info.hash) throw Error('准备期间应用已发生变化，已取消替换。');
      replaceApp(app, prepared, temporaryRoot);
      console.log('中文补丁已安装。设置 → 常规（General）→ 界面语言，可切换简体中文 / 跟随官方语言。');
    }
  } catch (error) {
    keepTemporary = Boolean(error.keepTemporary);
    throw error;
  } finally {
    if (temporaryRoot && !keepTemporary) fs.rmSync(temporaryRoot, { recursive: true, force: true });
    if (lock !== undefined) { fs.closeSync(lock); fs.unlinkSync(lockPath); }
  }
  if (options.open) command('/usr/bin/open', [app]);
}

function parse(args) {
  const options = { action: 'install', quit: false, open: false };
  let actionSeen = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (['--install', '--restore', '--check', '--status'].includes(arg)) {
      if (actionSeen) throw Error('一次只能选择一种操作');
      options.action = arg.slice(2); actionSeen = true;
    } else if (arg === '--quit') options.quit = true;
    else if (arg === '--open') options.open = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--version' || arg === '-v') options.version = true;
    else if (arg === '--app' || arg === '--backup-dir') {
      const value = args[++i]; if (!value || value.startsWith('--')) throw Error(`${arg} 后缺少路径`);
      options[arg === '--app' ? 'app' : 'backupDir'] = value;
    } else throw Error(`未知参数：${arg}`);
  }
  if (options.version && actionSeen) throw Error('--version 不能与安装、恢复或检查操作一起使用');
  return options;
}
if (require.main === module) {
  (async () => {
    const options = parse(process.argv.slice(2));
    if (options.version) { console.log(VERSION); return; }
    if (options.help) {
      console.log('用法：./postman-zh.command [--install | --restore | --check | --status] [--app /Applications/Postman.app] [--quit] [--open] [--backup-dir 路径]\n无参数双击：正常退出 Postman、备份、安装、重新打开。\n--check / --status 只读检查；--restore 恢复当前版本的完整原版应用。\n--version 查看工具版本；--help 查看帮助。');
      return;
    }
    await execute(options);
  })().catch(error => { console.error(`\n操作失败：${error.message}\n如已进入替换步骤，脚本会尝试恢复原应用。完整备份不会自动删除。`); process.exitCode = 1; });
}
module.exports = { parse, inspect, replaceApp, assets, assetsHash, execute };
