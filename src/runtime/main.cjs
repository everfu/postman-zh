'use strict';
const { app, Menu } = require('electron');
const fs = require('fs');
const preferences = require('./preferences.cjs');
const dictionary = require('./menu.json');
const templates = new WeakMap();
let applicationTemplate;
const build = Menu.buildFromTemplate;
const set = Menu.setApplicationMenu;
const roles = { about: 'About Postman', quit: 'Quit Postman', hide: 'Hide Postman', hideOthers: 'Hide Others', unhide: 'Show All', undo: 'Undo', redo: 'Redo', cut: 'Cut', copy: 'Copy', paste: 'Paste', selectAll: 'Select All', minimize: 'Minimize', zoom: 'Zoom', close: 'Close Window' };
function text(source) {
  if (typeof source !== 'string') return source;
  const trimmed = source.trim();
  if (Object.hasOwn(dictionary, trimmed)) return source.replace(trimmed, dictionary[trimmed]);
  for (const [key, value] of Object.entries(dictionary)) {
    if (key.includes('{{appName}}') && key.replaceAll('{{appName}}', 'Postman') === trimmed) return value.replaceAll('{{appName}}', 'Postman');
  }
  return source;
}
function copy(items, chinese) {
  return items.map(item => {
    const result = { ...item };
    if (Array.isArray(item.submenu)) result.submenu = copy(item.submenu, chinese);
    const label = item.label || roles[item.role];
    if (chinese && label) result.label = text(label);
    return result;
  });
}
Menu.buildFromTemplate = function (items) {
  const original = copy(items, false);
  // Native macOS labels must be translated before constructing NSMenuItems.
  const menu = build.call(this, copy(original, preferences.read() === 'zh-CN'));
  templates.set(menu, original);
  return menu;
};
Menu.setApplicationMenu = function (menu) {
  applicationTemplate = templates.get(menu);
  return set.call(this, menu);
};
fs.watchFile(preferences.file, { persistent: false, interval: 1000 }, () => {
  if (!applicationTemplate) return;
  try {
    const menu = build.call(Menu, copy(applicationTemplate, preferences.read() === 'zh-CN'));
    templates.set(menu, applicationTemplate);
    set.call(Menu, menu);
  } catch (error) { console.warn('[PostmanZH] 菜单更新失败:', error.message); }
});
app.once('will-quit', () => fs.unwatchFile(preferences.file));
