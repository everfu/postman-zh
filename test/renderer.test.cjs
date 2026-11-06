'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { install } = require('../src/runtime/renderer.cjs');

// Structure inspected in the actual logged-in Postman 12.26.1 settings modal.
const html = `<main><button>Send</button><section class="settings-modal"><div class="settings-container" style="display:grid;grid-template-columns:160px minmax(0,1fr)"><div direction="row" class="sidebar-wrapper" style="display:flex"><nav class="settings-tabs" role="tablist" aria-orientation="vertical"><button role="tab">General</button><button role="tab">Themes</button><button role="tab">Shortcuts</button></nav></div><main class="settings-content-pane" style="display:flex;flex-direction:column"><header class="settings-modal--header"><h2>General</h2><button>Close</button></header><div class="settings-scroll-area"><h3>Application</h3><p>Language</p></div></main></div></section><input value="Send"><textarea>Send</textarea><div contenteditable="true">Send</div><div class="monaco-editor">Send</div><pre>Send</pre><table><tbody><tr><td>Send</td></tr></tbody></table><div role="tree">Send</div></main>`;
function fixture(t, url = 'https://desktop.postman.com/', initialLanguage = 'zh-CN') {
  const dom = new JSDOM(html, { url });
  const saved = { language: initialLanguage, reloads: 0, fail: false };
  const window = {
    document: dom.window.document, location: { href: url, reload() { saved.reloads++; } },
    MutationObserver: dom.window.MutationObserver, NodeFilter: dom.window.NodeFilter,
    setTimeout: dom.window.setTimeout.bind(dom.window),
    Headers, Response, XMLHttpRequest: dom.window.XMLHttpRequest,
    fetch: async input => new Response(JSON.stringify({ label: 'Send', nested: { title: 'Settings', untouched: '{{name}}' }, rows: [{ text: 'English' }] }), { headers: { 'x-test': 'kept', 'content-length': '99' } })
  };
  const prefs = { read: () => saved.language, write: value => { if (saved.fail) throw Error('read-only'); saved.language = value; } };
  const api = install(window, prefs, { settings: { label: '发送', nested: { title: '设置', unknown: '不应出现' }, rows: [{ text: '中文' }] } }, { Send: '发送', General: '通用', Themes: '主题', Shortcuts: '快捷键' });
  t.after(() => { api?.disconnect(); dom.window.close(); });
  return { window, document: window.document, saved, api, dom };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 130));

test('modern grid settings mount below the header in the right column without altering the sidebar', async t => {
  const { document } = fixture(t);
  const sidebar = document.querySelector('.sidebar-wrapper');
  const original = sidebar.outerHTML;
  await tick();
  const row = document.querySelector('[data-postman-zh="language"]');
  assert.equal(row.parentElement, document.querySelector('.settings-content-pane'));
  assert.equal(row.previousElementSibling, document.querySelector('.settings-modal--header'));
  assert.equal(row.nextElementSibling, document.querySelector('.settings-scroll-area'));
  assert.equal(sidebar.outerHTML, original);
  assert.equal(document.querySelector('.settings-container').children.length, 2);
});

test('language control preserves its theme-aware separator and transparent background', async t => {
  const { document } = fixture(t);
  await tick();
  const row = document.querySelector('[data-postman-zh="language"]');
  assert.match(row.style.getPropertyValue('border-bottom'), /var\(--border-color-default,/);
  assert.equal(row.style.getPropertyValue('background-color'), 'transparent');
});

test('a misplaced old language row is relocated and unknown layouts are left untouched', async t => {
  const { document } = fixture(t);
  const old = document.createElement('section'); old.dataset.postmanZh = 'language';
  document.querySelector('.settings-tabs').after(old);
  await tick();
  assert.equal(document.querySelectorAll('[data-postman-zh]').length, 1);
  assert.equal(old.parentElement, document.querySelector('.settings-content-pane'));
  document.querySelector('.settings-content-pane').remove();
  document.querySelector('.settings-container').append(document.createElement('h2'));
  await tick();
  assert.equal(document.querySelector('[data-postman-zh]'), null);
});

test('new fixed interface labels translate without changing equally named records, tabs or payloads', async t => {
  const { document } = fixture(t);
  document.querySelector('main').insertAdjacentHTML('beforeend', '<button aria-label="Collections">COLLECTIONS</button><button>Upgrade</button><div role="tablist"><button role="tab">Params</button><button role="tab">Authorization</button><button role="tab">Headers</button><button role="tab">Body</button></div><div role="tree"><button>Collections</button></div><div role="tablist"><div role="tab">Body</div></div><article><button>Upgrade</button></article><pre><button>Headers</button></pre>');
  await tick();
  assert.equal(document.querySelector('button[aria-label="集合"]').textContent, '集合');
  assert.ok(Array.from(document.querySelectorAll('button')).some(node => node.textContent === '升级'));
  assert.deepEqual(Array.from(document.querySelectorAll('main > [role="tablist"] button')).map(node => node.textContent), ['参数','授权','请求头','请求体']);
  assert.equal(document.querySelector('[role="tree"] button').textContent, 'Collections');
  assert.equal(document.querySelector('main > [role="tablist"] div').textContent, 'Body');
  assert.equal(document.querySelector('article button').textContent, 'Upgrade');
  assert.equal(document.querySelector('pre button').textContent, 'Headers');
});

test('icon-only navigation, response headers, and onboarding localize while numbers and environment names stay intact', async t => {
  const { document } = fixture(t);
  document.querySelector('main').insertAdjacentHTML('beforeend', '<div role="tablist"><button role="tab" aria-label="Items"></button><button role="tab" aria-label="Services"></button><button role="tab" aria-label="History"></button></div><div role="combobox" aria-label="Environment"><span>Environment</span><span>Collections</span></div><div data-testid="http-request-workbench"><div class="pane-header"><h5>Response</h5></div><pre>Response</pre></div><div class="ai-chat-usage-onboarding-card"><h4>Start using Agent Mode!</h4><span>Your plan includes <strong>100 AI credits</strong> per month to use Agent Mode.</span></div><div class="ai-chat-footer"><div contenteditable="true" aria-placeholder="Describe what you need. Press @ for context, / for Skills.">Upgrade<p data-placeholder="Describe what you need. Press @ for context, / for Skills."></p></div></div>');
  await tick();
  assert.ok(document.querySelector('[role="tab"][aria-label="项目"]'));
  assert.ok(document.querySelector('[role="tab"][aria-label="服务"]'));
  assert.equal(document.querySelector('[role="combobox"] span').textContent, '环境');
  assert.equal(document.querySelector('[role="combobox"] span + span').textContent, 'Collections');
  assert.equal(document.querySelector('.pane-header h5').textContent, '响应');
  assert.equal(document.querySelector('[data-testid="http-request-workbench"] pre').textContent, 'Response');
  assert.equal(document.querySelector('.ai-chat-usage-onboarding-card strong').textContent, '100 点 AI 额度');
  assert.match(document.querySelector('.ai-chat-usage-onboarding-card').textContent, /套餐每月提供/);
  assert.equal(document.querySelector('.ai-chat-footer [contenteditable]').textContent, 'Upgrade');
  assert.match(document.querySelector('.ai-chat-footer [contenteditable]').getAttribute('aria-placeholder'), /描述你的需求/);
  assert.match(document.querySelector('.ai-chat-footer [data-placeholder]').getAttribute('data-placeholder'), /描述你的需求/);
});

test('Lexical visual placeholder and accessibility hint both translate without touching editable text', async t => {
  const { document } = fixture(t);
  const prompt = 'Describe what you need. Press @ for context, / for Skills.';
  document.body.insertAdjacentHTML('beforeend', `<div class="ai-chat-footer"><div data-testid="ai-chat-input-editor"><div role="textbox" contenteditable="true" aria-placeholder="${prompt}" data-lexical-editor="true">Body</div><div aria-hidden="true"><div class="ai-chat-input-editor-placeholder">${prompt}</div></div></div></div>`);
  await tick();
  assert.match(document.querySelector('.ai-chat-input-editor-placeholder').textContent, /描述你的需求/);
  assert.match(document.querySelector('[data-lexical-editor]').getAttribute('aria-placeholder'), /描述你的需求/);
  assert.equal(document.querySelector('[data-lexical-editor]').textContent, 'Body');
});

test('actual local settings class structure gets exactly one language control', async t => {
  const { document } = fixture(t, 'file:///app/scratchpad.html');
  document.body.innerHTML = '<div class="settings-modal"><div class="modal-header">SETTINGS</div><div class="settings-container"><div class="settings-tabs"><span>General</span><span>Themes</span><span>Shortcuts</span></div><div class="settings-tab-contents"><h3>Request</h3></div></div></div>';
  await tick();
  assert.equal(document.querySelectorAll('[data-postman-zh]').length, 1);
  assert.equal(document.querySelector('.settings-tabs').nextElementSibling.dataset.postmanZh, 'language');
});

test('XHR translates before pre-registered load callbacks and preserves JSON response type and reuse', async t => {
  const http = require('node:http');
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'access-control-allow-origin': '*', 'content-type': 'application/json' });
    response.end('{"label":"Send"}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  // Route the native open to our test server but keep the requested official URL
  // visible to the installed hook. No external request is made.
  // Create a fresh DOM so this route adapter can sit below the installed wrapper.
  const dom = new JSDOM('', { url: 'https://desktop.postman.com/' });
  t.after(() => dom.window.close());
  const nativeOpen = dom.window.XMLHttpRequest.prototype.open;
  dom.window.XMLHttpRequest.prototype.open = function(method) { return nativeOpen.call(this, method, `http://127.0.0.1:${server.address().port}/data`, true); };
  const testWindow = { document: dom.window.document, location: { href: 'https://desktop.postman.com/' }, MutationObserver: dom.window.MutationObserver, NodeFilter: dom.window.NodeFilter, setTimeout: dom.window.setTimeout.bind(dom.window), XMLHttpRequest: dom.window.XMLHttpRequest };
  const api = install(testWindow, { read: () => 'zh-CN', write() {} }, { settings: { label: '发送' } }, {});
  t.after(() => api.disconnect());
  const xhr = new testWindow.XMLHttpRequest();
  const load = () => new Promise((resolve, reject) => { xhr.onload = resolve; xhr.onerror = reject; });
  let done = load();
  xhr.open('GET', 'https://desktop.postman.com/_ar-assets/locales/en-US/settings.json');
  xhr.send(); await done; assert.equal(JSON.parse(xhr.responseText).label, '发送');
  done = load(); xhr.open('GET', 'https://desktop.postman.com/_ar-assets/locales/en-US/settings.json');
  xhr.responseType = 'json'; xhr.send(); await done;
  assert.equal(xhr.response.label, '发送'); assert.throws(() => xhr.responseText);
  done = load(); xhr.open('GET', 'https://example.com/data'); xhr.responseType = 'text'; xhr.send(); await done;
  assert.equal(JSON.parse(xhr.responseText).label, 'Send');
});

test('settings offer Chinese and original language, save preference before reload, and reinsert once on reopen', async t => {
  const { document, saved } = fixture(t);
  await tick();
  const select = document.querySelector('#postman-zh-language');
  assert.equal(select.value, 'zh-CN');
  select.value = 'en';
  document.querySelector('[data-postman-zh] button').click();
  assert.equal(saved.language, 'en'); assert.equal(saved.reloads, 1);
  assert.equal(document.querySelector('input').value, 'Send');
  document.querySelector('header').append(document.createElement('span'));
  await tick();
  assert.equal(document.querySelectorAll('[data-postman-zh]').length, 1);
  document.querySelector('[data-postman-zh]').remove();
  await tick();
  assert.equal(document.querySelectorAll('[data-postman-zh]').length, 1);
});

test('only trusted locale responses are merged; API data and external lookalikes pass through', async t => {
  const { window, api } = fixture(t);
  const response = await window.fetch('https://desktop.postman.com/_ar-assets/locales/en-US/settings-abcdef012345.json');
  assert.equal((await response.clone().json()).nested.title, '设置');
  assert.equal((await response.json()).nested.unknown, undefined);
  assert.equal(response.headers.get('x-test'), 'kept');
  assert.equal(response.headers.has('content-length'), false);
  for (const url of ['https://example.com/_ar-assets/locales/en-US/settings-abcdef012345.json', 'https://evil-postman.com/_ar-assets/locales/en-US/settings.json', 'https://desktop.postman.com/api/settings', 'https://desktop.postman.com/_ar-assets/locales/en-US/unknown.json']) {
    assert.equal((await (await window.fetch(url)).json()).label, 'Send');
  }
  assert.equal(api.translatePayload('https://desktop.postman.com/_ar-assets/locales/en-US/settings.json', 'not json'), null);
});

test('locale arrays translate existing entries without growing arrays or changing incompatible values', t => {
  const { api } = fixture(t);
  const url = 'https://desktop.postman.com/_ar-assets/locales/en-US/settings.json';
  const result = JSON.parse(api.translatePayload(url, '{"rows":[{"text":"English","id":123},{"text":"Unmapped"}]}'));
  assert.deepEqual(result.rows, [{ text: '中文', id: 123 }, { text: 'Unmapped' }]);
  assert.deepEqual(JSON.parse(api.translatePayload(url, '{"rows":[]}')).rows, []);
  assert.deepEqual(JSON.parse(api.translatePayload(url, '{"rows":{"text":"English"}}')).rows, { text: 'English' });
});

test('original language bypasses translations after a fresh launch', async t => {
  const fresh = fixture(t, 'https://desktop.postman.com/', 'en');
  const result = await fresh.window.fetch('https://desktop.postman.com/_ar-assets/locales/en-US/settings.json');
  assert.equal((await result.json()).label, 'Send');
});

test('local chrome translates but request/response data, editors, tables and user trees stay unchanged', async t => {
  const { document } = fixture(t, 'file:///Applications/Postman.app/scratchpad.html');
  await tick();
  assert.equal(document.querySelector('main > button').textContent, '发送');
  for (const selector of ['textarea', '[contenteditable]', '.monaco-editor', 'pre', 'td', '[role="tree"]']) assert.equal(document.querySelector(selector).textContent, 'Send', selector);
  assert.equal(document.querySelector('input').value, 'Send');
  const button = document.createElement('button'); button.textContent = 'Send'; document.body.append(button);
  await tick(); assert.equal(button.textContent, '发送');
});

test('does not add a setting to unrelated request settings or untrusted pages', async t => {
  const { document } = fixture(t, 'https://example.com/');
  await tick(); assert.equal(document.querySelector('[data-postman-zh]'), null);
  const next = fixture(t); next.document.querySelector('[role="tablist"]').remove();
  await tick(); assert.equal(next.document.querySelector('[data-postman-zh]'), null);
});

test('write failures show an error and do not reload', async t => {
  const { document, saved } = fixture(t); saved.fail = true;
  await tick(); document.querySelector('[data-postman-zh] button').click();
  assert.equal(saved.reloads, 0); assert.match(document.querySelector('[role="alert"]').textContent, /read-only/);
});
