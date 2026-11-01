'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('macOS menus are built with translated labels, preserve callbacks, and rebuild in English', () => {
  let language = 'zh-CN', watcher, applied;
  const click = () => {};
  const Menu = { buildFromTemplate: items => ({ items }), setApplicationMenu: menu => { applied = menu; } };
  const app = { once() {} };
  const context = { console, require(name) {
    if (name === 'electron') return { app, Menu };
    if (name === 'fs') return { watchFile(file, options, callback) { watcher = callback; }, unwatchFile() {} };
    if (name === './preferences.cjs') return { file: '/test/language.json', read: () => language };
    if (name === './menu.json') return { File: '文件', 'New Window': '新建窗口', 'About {{appName}}': '关于 {{appName}}' };
    throw Error(name);
  } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/runtime/main.cjs'), 'utf8'), context);
  const original = [{ label: 'File', submenu: [{ label: 'New Window', click }, { role: 'about' }] }];
  const menu = Menu.buildFromTemplate(original); Menu.setApplicationMenu(menu);
  assert.equal(applied.items[0].label, '文件');
  assert.equal(applied.items[0].submenu[0].label, '新建窗口');
  assert.equal(applied.items[0].submenu[0].click, click);
  assert.equal(applied.items[0].submenu[1].label, '关于 Postman');
  assert.equal(original[0].label, 'File');
  language = 'en'; watcher();
  assert.equal(applied.items[0].label, 'File');
  assert.equal(applied.items[0].submenu[0].label, 'New Window');
});
