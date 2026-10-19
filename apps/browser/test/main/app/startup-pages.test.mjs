import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import pages from '../../../dist/shared/startup-pages.js';
import settings from '../../../dist/main/app/settings.js';
import windowModule from '../../../dist/main/window/window.js';

test('automatic navigation accepts only explicit web addresses and deduplicates/bounds startup pages', () => {
  for (const value of [
    'javascript:alert(1)',
    'data:text/html,x',
    'file:///etc/passwd',
    'https://user:secret@example.com/',
    'example.com',
    'yalqen://settings/',
    null,
  ])
    assert.equal(pages.webPageUrl(value), null);
  assert.equal(pages.webPageUrl('  https://EXAMPLE.com  '), 'https://example.com/');
  assert.deepEqual(pages.sanitizeStartupUrls(['https://example.com', 'https://example.com/', 'invalid']), [
    'https://example.com/',
  ]);
  assert.equal(pages.sanitizeStartupUrls(Array.from({ length: 30 }, (_, i) => `https://example.com/${i}`)).length, 20);
});
test('startup addresses persist per profile', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yalqen-startup-'));
  try {
    const store = new settings.SettingsStore(root);
    store.update({
      startupUrls: ['https://first.example/', 'https://second.example/'],
      startupBehavior: 'pages',
    });
    const values = new settings.SettingsStore(root).get();
    assert.equal(values.startupBehavior, 'pages');
    assert.deepEqual(pages.startupPages(values.startupBehavior, values.startupUrls, false), [
      'https://first.example/',
      'https://second.example/',
    ]);
    assert.deepEqual(
      pages.startupPages(values.startupBehavior, values.startupUrls, true),
      [],
      'an update restart restores saved tabs once',
    );
    assert.deepEqual(pages.startupPages('restore', values.startupUrls, false), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test('the Home action opens the first startup page only when specific pages are chosen, otherwise a new tab', () => {
  const urls = [];
  const host = {
    app: {
      settings: {
        get: () => ({ startupBehavior: 'pages', startupUrls: ['https://home.example/', 'https://other.example/'] }),
      },
    },
    tabs: { navigate: (url) => urls.push(url) },
  };
  windowModule.YalqenWindow.prototype.goHome.call(host);
  assert.deepEqual(urls, ['https://home.example/']);
  host.app.settings.get = () => ({ startupBehavior: 'restore', startupUrls: ['https://home.example/'] });
  windowModule.YalqenWindow.prototype.goHome.call(host);
  assert.match(urls[1], /^yalqen:/);
  host.app.settings.get = () => ({ startupBehavior: 'pages', startupUrls: [] });
  windowModule.YalqenWindow.prototype.goHome.call(host);
  assert.match(urls[2], /^yalqen:/);
});
