'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : [file];
  });
}
for (const directory of ['src', 'scripts', 'test']) {
  for (const file of files(path.join(root, directory))) if (file.endsWith('.cjs')) execFileSync(process.execPath, ['--check', file]);
}
for (const name of ['postman-zh.command', '恢复原版.command']) execFileSync('/bin/bash', ['-n', path.join(root, name)]);
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json')));
if (pkg.version !== lock.version || pkg.version !== lock.packages[''].version) throw Error('package.json 与锁文件版本不一致');
const locales = JSON.parse(fs.readFileSync(path.join(root, 'locales/zh-CN.json')));
if (!locales.settings || !Object.keys(locales).length) throw Error('缺少设置语言模块');
function strings(record, name) {
  if (!record || typeof record !== 'object') throw Error(`无效词典：${name}`);
  for (const [key, value] of Object.entries(record)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw Error(`危险词典键：${name}.${key}`);
    if (typeof value === 'string') continue;
    strings(value, `${name}.${key}`);
  }
}
strings(locales, 'zh-CN');
for (const name of ['scratchpad', 'menu']) strings(JSON.parse(fs.readFileSync(path.join(root, `locales/${name}.json`))), name);
const markdown = ['README.md', 'README.en.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md', 'THIRD_PARTY_NOTICES.md', ...files(path.join(root, 'docs')).filter(file => file.endsWith('.md'))];
for (const name of markdown) {
  const file = path.resolve(root, name), body = fs.readFileSync(file, 'utf8');
  for (const match of body.matchAll(/\]\(([^)\s]+)\)|(?:src|href)="([^"]+)"/g)) {
    const target = match[1] || match[2];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const local = decodeURIComponent(target.split('#')[0]);
    if (local && !fs.existsSync(path.resolve(path.dirname(file), local))) throw Error(`文档链接不存在：${path.relative(root, file)} -> ${target}`);
  }
  if (/\/Users\/(?!demo(?:\/|\b)|example(?:\/|\b))|[?&](?:userId|teamId)=\d{3,}/i.test(body)) throw Error(`发现本机或账号信息：${name}`);
}
console.log(`检查通过：脚本语法、版本、${Object.keys(locales).length} 个语言模块和文档链接。`);
