'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const directory = path.join(os.homedir(), 'Library', 'Application Support', 'PostmanZH');
const file = path.join(directory, 'language.json');
function read() {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')).language === 'en' ? 'en' : 'zh-CN'; }
  catch { return 'zh-CN'; }
}
function write(language) {
  if (!['en', 'zh-CN'].includes(language)) throw Error('不支持的语言');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify({ language }, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
module.exports = { file, read, write };
