'use strict';

// Append-only ASAR writer. Original data offsets and unpacked files stay intact.
const fs = require('node:fs');
const crypto = require('node:crypto');
const BLOCK = 4 * 1024 * 1024;
const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');

function readArchive(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const prefix = Buffer.alloc(16);
    if (fs.readSync(fd, prefix, 0, 16, 0) !== 16 || prefix.readUInt32LE(0) !== 4) throw Error('不是有效的 ASAR 文件');
    const headerSize = prefix.readUInt32LE(4), jsonSize = prefix.readUInt32LE(12);
    if (headerSize > 64 * 1024 * 1024 || jsonSize > headerSize - 8 || headerSize < 8) throw Error('ASAR 文件头损坏');
    const buffer = Buffer.alloc(jsonSize);
    if (fs.readSync(fd, buffer, 0, jsonSize, 16) !== jsonSize) throw Error('ASAR 文件头不完整');
    const header = JSON.parse(buffer.toString('utf8'));
    const start = 8 + headerSize;
    if (!header.files || start > fs.fstatSync(fd).size) throw Error('ASAR 数据区损坏');
    return {
      header, start,
      entry(name) { return name.split('/').reduce((dir, key) => dir?.files?.[key], header); },
      read(name) {
        const entry = this.entry(name);
        if (!entry || entry.files || entry.link || entry.unpacked) throw Error(`无法读取归档文件：${name}`);
        const offset = Number(entry.offset);
        if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(entry.size) || entry.size < 0 || start + offset + entry.size > fs.statSync(file).size) throw Error(`ASAR 文件范围无效：${name}`);
        const data = Buffer.alloc(entry.size), input = fs.openSync(file, 'r');
        try { if (fs.readSync(input, data, 0, data.length, start + offset) !== data.length) throw Error(`文件不完整：${name}`); }
        finally { fs.closeSync(input); }
        return data;
      }
    };
  } finally { fs.closeSync(fd); }
}

function integrity(data) {
  const blocks = [];
  for (let pos = 0; pos < data.length; pos += BLOCK) blocks.push(sha256(data.subarray(pos, pos + BLOCK)));
  return { algorithm: 'SHA256', hash: sha256(data), blockSize: BLOCK, blocks };
}

function patchArchive(source, destination, replacements) {
  if (source === destination || fs.existsSync(destination)) throw Error('输出必须是一个新文件');
  const archive = readArchive(source);
  let offset = fs.statSync(source).size - archive.start;
  const buffers = [];
  for (const [name, value] of Object.entries(replacements)) {
    const parts = name.split('/');
    if (parts.some(p => !p || ['..', '.', '__proto__', 'constructor', 'prototype'].includes(p))) throw Error('无效的归档路径');
    let dir = archive.header;
    for (const part of parts.slice(0, -1)) {
      dir.files[part] ||= { files: {} };
      dir = dir.files[part];
      if (!dir.files) throw Error('归档路径不是目录');
    }
    const data = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const previous = dir.files[parts.at(-1)];
    if (previous?.unpacked || previous?.link || previous?.files) throw Error('不支持替换外部文件或链接');
    dir.files[parts.at(-1)] = { size: data.length, offset: String(offset), integrity: integrity(data), ...(previous?.executable ? { executable: true } : {}) };
    offset += data.length;
    buffers.push(data);
  }
  const json = Buffer.from(JSON.stringify(archive.header));
  const payloadSize = Math.ceil((4 + json.length) / 4) * 4;
  const prefix = Buffer.alloc(8 + 4 + payloadSize);
  prefix.writeUInt32LE(4, 0);
  prefix.writeUInt32LE(4 + payloadSize, 4);
  prefix.writeUInt32LE(payloadSize, 8);
  prefix.writeUInt32LE(json.length, 12);
  json.copy(prefix, 16);
  const input = fs.openSync(source, 'r'), output = fs.openSync(destination, 'wx', fs.statSync(source).mode & 0o777);
  try {
    fs.writeSync(output, prefix);
    const buffer = Buffer.alloc(BLOCK);
    let position = archive.start, n;
    while ((n = fs.readSync(input, buffer, 0, buffer.length, position))) {
      fs.writeSync(output, buffer, 0, n); position += n;
    }
    for (const data of buffers) fs.writeSync(output, data);
    fs.fsyncSync(output);
  } finally { fs.closeSync(input); fs.closeSync(output); }
  return sha256(json); // ElectronAsarIntegrity hashes getRawHeader().headerString.
}

function hashFile(file) {
  const fd = fs.openSync(file, 'r'), buffer = Buffer.alloc(BLOCK), hash = crypto.createHash('sha256');
  try { let n; while ((n = fs.readSync(fd, buffer))) hash.update(buffer.subarray(0, n)); }
  finally { fs.closeSync(fd); }
  return hash.digest('hex');
}

module.exports = { readArchive, patchArchive, hashFile, sha256 };
