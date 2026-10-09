import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { chromium } from 'playwright';
import { renderPage, renderProfile } from '../backend/cloudflare/views.js';

test('automatic text view keeps feed and profile stories without covers, avatars or preview engines, then loads one chosen picture', async () => {
  const site = 'https://ishare.js.gripe';
  const assets = { ASSETS: { fetch: async request => new Response(await readFile('dist' + new URL(request.url).pathname)) } };
  const picture = await readFile('content/assets/brand/bear-icon.3754101e8d6380da.png');
  const post = { id: 'a'.repeat(32), kind: 'post', caption: 'A quiet afternoon by the river.', created: 1, published: 2, state: 'published', author: { id: '42', name: 'River walker', login: 'author' }, shareUrl: site + '/s/' + 'a'.repeat(32), media: [{ id: 'b'.repeat(32), kind: 'image', title: 'River picture' }, { id: 'c'.repeat(32), kind: 'image', title: 'Second picture' }] };
  const browser = await chromium.launch({ headless: true, args: ['--disable-extensions'] });
  try {
    for (const path of ['/', '/u/42', '/s/' + post.id]) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await context.addInitScript(() => Object.defineProperty(navigator, 'connection', { get: () => ({ saveData: true, effectiveType: '4g' }) }));
      const requests = [], actions = [], errors = [];
      context.on('request', request => requests.push(request.url()));
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        assert.equal(url.origin, site);
        if (url.pathname === '/u/42') return route.fulfill({ contentType: 'text/html', body: await (await renderProfile({ id: '42', displayName: 'River walker', bio: 'Stories from outdoors.', login: 'author' }, assets, site)).text() });
        if (url.pathname === '/s/' + post.id) {
          const author = JSON.stringify(post.author);
          const item = { ...post, author, media: post.media.map(child => ({ ...child, author, state: 'published', created: 1, published: 2, source_name: '', source_url: '' })) };
          return route.fulfill({ contentType: 'text/html', body: await (await renderPage(item, assets, site)).text() });
        }
        if (/^\/[iv]\//.test(url.pathname)) return route.fulfill({ contentType: 'image/png', body: picture });
        if (url.pathname === '/api') {
          const action = route.request().headers()['x-service-action']; actions.push(action);
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify(action === 'session' ? { user: null, isAdmin: false } : { items: [post], next: null }) });
        }
        const file = 'dist' + url.pathname + (url.pathname.endsWith('/') ? 'index.html' : '');
        const types = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
        try { return await route.fulfill({ contentType: types[extname(file)] || 'text/html', body: await readFile(file) }); }
        catch (error) { if (error.code !== 'ENOENT') throw error; return route.fulfill({ status: 404 }); }
      });
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
      await page.goto(site + path);
      await page.getByText(post.caption, { exact: true }).waitFor();
      assert.equal(await page.getAttribute('html', 'data-edgepress-data-mode'), 'text');
      assert(!requests.some(url => /\/[iv]\/.+|woff|\/style\.|gallery-runtime\.|\/ishare\/media\./.test(url)), requests.join('\n'));
      assert(!actions.some(action => ['avatar', 'profile-avatar'].includes(action)));
      const placeholder = path.startsWith('/s/') ? page.locator('[data-edgepress-data-media][data-data-feature=gallery]') : page.locator('.post-card .edgepress-data-placeholder');
      await placeholder.getByRole('button').click();
      const image = path.startsWith('/s/') ? page.locator('.gallery-stage img') : page.locator('.post-preview img');
      await image.evaluate(element => element.decode());
      assert(requests.some(url => /\/i\/b{32}\/(?:thumbnail|medium)/.test(url)));
      assert(!requests.some(url => /\/i\/c{32}/.test(url)));
      assert(!requests.some(url => /woff|\/style\./.test(url)));
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); }
});
