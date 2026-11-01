'use strict';

const preferences = require('./preferences.cjs');
const chrome = require('./chrome.cjs');

// Exported factory also lets tests run the exact installed code in a DOM fixture.
function install(window, prefs = preferences, translations = require('./zh-CN.json'), words = require('./scratchpad.json')) {
  const document = window.document;
  if (!document || window.__postmanZH) return;
  const origin = new URL(window.location.href);
  if (!(origin.protocol === 'file:' || (origin.protocol === 'https:' && /(^|\.)postman\.(com|co)$/.test(origin.hostname)))) return;
  const language = prefs.read();
  window.__postmanZH = { version: 2, language };

  function moduleFor(input) {
    try {
      const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, window.location.href);
      if (url.protocol !== 'https:' || !/(^|\.)postman\.(com|co)$/.test(url.hostname)) return null;
      const match = /^\/_ar-assets\/locales\/(en-US|en|ja)\/([^/]+)\.json$/.exec(url.pathname);
      return match ? match[2].replace(/-[0-9a-f]{8,}$/i, '') : null;
    } catch { return null; }
  }
  function merge(base, translated) {
    if (!base || typeof base !== 'object' || Array.isArray(base) !== Array.isArray(translated)) return base;
    for (const key of Object.keys(translated)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key) || !Object.hasOwn(base, key)) continue;
      if (typeof translated[key] === 'string' && typeof base[key] === 'string') base[key] = translated[key];
      else if (translated[key] && typeof translated[key] === 'object') merge(base[key], translated[key]);
    }
    return base;
  }
  function translatePayload(url, body) {
    const module = moduleFor(url);
    if (language !== 'zh-CN' || !module || !translations[module]) return null;
    try { return JSON.stringify(merge(JSON.parse(body), translations[module])); }
    catch { return null; }
  }
  if (window.fetch) {
    const fetch = window.fetch.bind(window);
    window.fetch = async function (input, options) {
      const response = await fetch(input, options);
      if (!response.ok || language !== 'zh-CN' || !moduleFor(input)) return response;
      try {
        const translated = translatePayload(input, await response.clone().text());
        if (translated === null) return response;
        const headers = new window.Headers(response.headers);
        for (const key of ['content-length', 'content-encoding', 'etag']) headers.delete(key);
        const replacement = new window.Response(translated, { status: response.status, statusText: response.statusText, headers });
        for (const key of ['url', 'redirected', 'type']) Object.defineProperty(replacement, key, { value: response[key] });
        return replacement;
      } catch { return response; }
    };
  }
  // Install getters at open(), before the caller's readystatechange/onload handlers.
  if (window.XMLHttpRequest) {
    const prototype = window.XMLHttpRequest.prototype;
    const open = prototype.open;
    const responseText = Object.getOwnPropertyDescriptor(prototype, 'responseText')?.get;
    const response = Object.getOwnPropertyDescriptor(prototype, 'response')?.get;
    prototype.open = function (method, url, ...args) {
      const xhr = this;
      const result = open.call(xhr, method, url, ...args);
      if (!responseText || !response) return result;
      const translate = () => {
        if (xhr.readyState !== 4 || xhr.status < 200 || xhr.status >= 300 || !moduleFor(url)) return null;
        try {
          if (xhr.responseType === 'json') return translatePayload(url, JSON.stringify(response.call(xhr)));
          if (!xhr.responseType || xhr.responseType === 'text') return translatePayload(url, responseText.call(xhr));
        } catch { /* Preserve native response behavior for other types. */ }
        return null;
      };
      Object.defineProperty(xhr, 'responseText', { configurable: true, get() {
        if (xhr.responseType && xhr.responseType !== 'text') return responseText.call(xhr);
        return translate() ?? responseText.call(xhr);
      } });
      Object.defineProperty(xhr, 'response', { configurable: true, get() {
        const translated = translate();
        return translated === null ? response.call(xhr) : xhr.responseType === 'json' ? JSON.parse(translated) : translated;
      } });
      return result;
    };
  }

  // Local Scratch Pad uses hardcoded labels. Never traverse user data or editors.
  const excluded = 'input,textarea,script,style,pre,code,[contenteditable]:not([contenteditable="false"]),.monaco-editor,.CodeMirror,[role="textbox"],[role="tree"],[role="treegrid"],[role="grid"],table,.request-url,.request-name,.tab-title,.response-body,article,.markdown-body,[data-postman-zh]';
  function translateLocal(root) {
    if (origin.protocol !== 'file:' || language !== 'zh-CN') return;
    const walker = document.createTreeWalker(root, window.NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.parentElement || node.parentElement.closest(excluded)) continue;
      const match = /^(\s*)(.*?)(\s*)$/s.exec(node.nodeValue);
      if (match && Object.hasOwn(words, match[2])) {
        node.nodeValue = match[1] + words[match[2]] + match[3];
      }
    }
  }

  function translateControls() {
    if (language !== 'zh-CN') return;
    const controls = document.querySelectorAll('button,[role="button"],[role="tab"],[role="menuitem"],[role="option"],.settings-modal,[data-testid="http-request-workbench"] .pane-header h5,.response-viewer-header,.response-header,.ai-chat-header,.ai-chat-usage-onboarding-card,.ai-chat-footer .ai-chat-input-editor-placeholder');
    for (const element of controls) {
      if (element.closest(excluded)) continue;
      // The whitelist prevents request names such as "Body" from being changed
      // when the user-created workbench tabs also use role=tab.
      if (element.getAttribute('role') === 'tab' && !element.closest('.settings-tabs')) {
        const list = element.closest('[role="tablist"]');
        const labels = list ? Array.from(list.querySelectorAll('[role="tab"]')).map(tab => tab.getAttribute('aria-label') || tab.textContent).join(' ') : '';
        if (!list || !(/(Params|参数)/.test(labels) && /(Authorization|授权)/.test(labels) || /(Variables|变量)/.test(labels) && /(Code|代码)/.test(labels) || /(Items|项目)/.test(labels) && /(Services|服务)/.test(labels))) continue;
      }
      const walker = document.createTreeWalker(element, window.NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.parentElement.closest(excluded)) continue;
        const key = node.nodeValue.trim();
        if (Object.hasOwn(chrome, key)) node.nodeValue = node.nodeValue.replace(key, chrome[key]);
        else if (element.closest('.ai-chat-usage-onboarding-card') && /^\d[\d,.]*\s+AI credits$/.test(key)) node.nodeValue = node.nodeValue.replace(key, key.replace(/AI credits$/, '点 AI 额度'));
      }
      for (const attribute of ['aria-label', 'title']) {
        const value = element.getAttribute(attribute);
        if (Object.hasOwn(chrome, value)) element.setAttribute(attribute, chrome[value]);
      }
    }
    for (const element of document.querySelectorAll('[role="combobox"]')) {
      if (element.closest(excluded)) continue;
      // Environment names are user data. Only localize the fixed field label.
      const walker = document.createTreeWalker(element, window.NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (!node.parentElement.closest(excluded) && node.nodeValue.trim() === 'Environment') node.nodeValue = node.nodeValue.replace('Environment', '环境');
      }
      if (element.getAttribute('aria-label') === 'Environment') element.setAttribute('aria-label', '环境');
    }
    for (const element of document.querySelectorAll('.ai-chat-footer [contenteditable],.ai-chat-footer [data-placeholder],.ai-chat-footer [aria-placeholder],.ai-chat-footer [placeholder]')) {
      for (const attribute of ['data-placeholder', 'aria-placeholder', 'placeholder']) {
        const value = element.getAttribute(attribute);
        if (Object.hasOwn(chrome, value)) element.setAttribute(attribute, chrome[value]);
      }
    }
    for (const element of document.querySelectorAll('.ai-chat-footer [data-slate-placeholder],.ai-chat-footer .monaco-placeholder')) {
      const walker = document.createTreeWalker(element, window.NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) if (Object.hasOwn(chrome, node.nodeValue.trim())) node.nodeValue = node.nodeValue.replace(node.nodeValue.trim(), chrome[node.nodeValue.trim()]);
    }
  }

  // Modern settings use a two-column GRID with a horizontal FLEX wrapper around
  // the sidebar. Inserting after .settings-tabs puts the new control in that
  // wrapper and collapses the sidebar. Always target the right content column.
  function settingsTarget() {
    for (const panel of document.querySelectorAll('.settings-modal,[data-testid="settings-modal"]')) {
      const tabs = panel.querySelector('.settings-tabs');
      if (!tabs || !/(General|通用|常规|一般)/.test(tabs.textContent) || !/(Themes|主题|テーマ)/.test(tabs.textContent)) continue;
      const pane = panel.querySelector('.settings-content-pane');
      const scroll = pane?.querySelector('.settings-scroll-area');
      if (pane && scroll?.parentElement === pane) return { panel, parent: pane, before: scroll };
      // Legacy local Scratch Pad has horizontal tabs and a column container.
      const content = panel.querySelector('.settings-tab-contents');
      if (!pane && content && content.parentElement === tabs.parentElement) return { panel, parent: tabs.parentElement, before: content };
    }
    return null; // Unknown layouts must never receive a guessed insertion.
  }

  function addSettings() {
    const target = settingsTarget();
    if (!target) return;
    const { panel, parent, before } = target;
    const existing = panel.querySelector('[data-postman-zh="language"]');
    if (existing) {
      if (existing.parentElement !== parent || existing.nextElementSibling !== before) parent.insertBefore(existing, before);
      return;
    }
    const row = document.createElement('section');
    row.dataset.postmanZh = 'language';
    row.setAttribute('aria-label', 'Postman 中文界面 / Interface language');
    row.style.cssText = 'box-sizing:border-box;display:block;position:relative;min-width:0;max-width:100%;margin:0 16px 12px;padding:12px 0;border:0;border-bottom:1px solid var(--border-color-default,#8886);background:transparent;color:var(--content-color-primary,inherit);font:inherit;flex:0 0 auto;';
    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;min-width:0;';
    const chinese = language === 'zh-CN';
    const label = document.createElement('label');
    label.textContent = chinese ? '界面语言' : 'Interface language';
    label.htmlFor = 'postman-zh-language';
    label.style.cssText = 'font-weight:600;white-space:nowrap;margin-right:auto;';
    const select = document.createElement('select');
    select.id = 'postman-zh-language';
    select.setAttribute('aria-label', '界面语言 / Interface language');
    select.style.cssText = 'box-sizing:border-box;font:inherit;max-width:100%;min-width:144px;padding:6px 8px;border-radius:4px;color:inherit;background:var(--background-color-primary,#fff);border:1px solid var(--border-color-default,#888);';
    for (const [value, text] of [['zh-CN', '简体中文'], ['en', chinese ? '跟随官方语言' : 'Follow Postman language']]) {
      const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option);
    }
    select.value = language;
    const save = document.createElement('button');
    save.type = 'button'; save.textContent = chinese ? '保存并重新加载' : 'Save and reload';
    save.style.cssText = 'font:inherit;white-space:nowrap;padding:6px 10px;border:1px solid var(--border-color-default,#888);border-radius:4px;color:inherit;background:var(--background-color-secondary,transparent);cursor:pointer;';
    const note = document.createElement('p');
    note.style.cssText = 'margin:8px 0 0;font-size:12px;opacity:.75;line-height:1.5;';
    note.textContent = chinese ? '仅切换本机界面。原版语言由“常规”页的官方设置决定。切换前请保存正在编辑的内容。' : 'Changes this device only. The original language follows the official setting in General. Save your work before reloading.';
    const error = document.createElement('p'); error.setAttribute('role', 'alert'); error.hidden = true; error.style.color = '#d33';
    save.addEventListener('click', () => {
      try { prefs.write(select.value); window.location.reload(); }
      catch (err) { error.hidden = false; error.textContent = `无法保存语言 / Could not save language: ${err.message}`; }
    });
    controls.append(label, select, save);
    row.append(controls, note, error);
    parent.insertBefore(row, before);
  }

  let queued = false;
  const flush = () => {
    queued = false;
    observer.disconnect();
    try { addSettings(); translateLocal(document.body); translateControls(); }
    catch (error) { console.warn('[PostmanZH] UI:', error.message); }
    finally { observer.observe(document.body, { childList: true, subtree: true, characterData: true }); }
  };
  const observer = new window.MutationObserver(() => {
    if (!queued) { queued = true; window.setTimeout(flush, 80); }
  });
  const start = () => { if (document.body) flush(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
  return { moduleFor, translatePayload, disconnect: () => observer.disconnect() };
}

module.exports = { install };
if (typeof window !== 'undefined') {
  try { install(window); }
  catch (error) { console.warn('[PostmanZH] 初始化失败:', error.message); }
}
