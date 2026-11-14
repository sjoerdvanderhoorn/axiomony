import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pg-mcp-sites-'));
process.env.APP_HOSTING_ENABLED = 'true';
process.env.APP_HOSTING_DIR = root;
process.env.APP_PUBLIC_URL = 'http://localhost:8088';
process.env.PGDATABASE ||= 'test';
const host = await import('../src/siteHosting.js');

test.after(async () => { await fs.rm(root, { recursive: true, force: true }); });

test('project names are predictable slugs and usernames are collision-free', () => {
  assert.equal(host.projectSlug('Invoices Q4 – Overview'), 'invoices-q4-overview');
  assert.equal(host.usernameDirectory('jan'), 'jan');
  assert.equal(host.usernameDirectory('Jan O'), '~4a616e204f');
  assert.equal(host.usernameDirectory('~4a616e204f'), '~7e34613631366532303466');
  assert.equal(host.publishedUrl('jan', 'Invoices Q4', 'css/style.css'),
    'http://localhost:8088/apps/jan/invoices-q4/css/style.css');
});

test('reject path traversal, paths with backslashes, and disallowed file extensions', async () => {
  for (const bad of ['../bob/index.html', '/etc/passwd', 'assets/../a.js', 'assets\\a.js',
    '.secret', 'assets//a.js', 'x?.js', 'trailing./file.html', 'assets/']) {
    await assert.rejects(() => host.siteCreateFile('jan', { project: 'a', path: bad, content: 'oops' }));
  }
  await assert.rejects(() => host.siteCreateFile('jan', { project: 'a', path: '.env', content: 'secret' }), /Invalid path/);
  await assert.rejects(() => host.siteCreateFile('jan', { project: 'a', path: 'access.sql', content: 'query' }), /File type/);
});

test('publishes own HTML, JS and CSS in predictable nested folders and lists the tree', async () => {
  const created = await host.siteCreateFile('jan', { project: 'My Invoices', path: 'index.html', content: '<h1>Invoices</h1>' });
  assert.equal(created.operation, 'create');
  assert.equal(created.url, 'http://localhost:8088/apps/jan/my-invoices/index.html');
  await host.siteCreateFile('jan', { project: 'My Invoices', path: 'js/app.js', content: 'console.log("ok")' });
  await host.siteCreateFile('jan', { project: 'My Invoices', path: 'css/style.css', content: 'body{}' });
  const listing = await host.siteList('jan');
  assert.deepEqual(listing.projects, ['my-invoices']);
  assert.equal(listing.files.length, 3);
  assert.ok(listing.directories.includes('my-invoices/js'));
  assert.ok(listing.directories.includes('my-invoices/css'));
  assert.deepEqual((await host.siteList('jan', { project: 'my-invoices' })).projects, ['my-invoices']);
});

test('cannot see, read, overwrite or delete another PostgreSQL user\'s files', async () => {
  assert.deepEqual((await host.siteList('anne')).projects, []);
  await assert.rejects(() => host.siteReadFile('anne', { project: 'My Invoices', path: 'index.html' }), /does not exist/);
  await assert.rejects(() => host.siteDeleteFile('anne', { project: 'My Invoices', path: 'index.html' }), /does not exist/);
  await assert.rejects(() => host.siteUpdateFile('anne', { project: 'My Invoices', path: 'index.html',
    content: 'hacked', expected_sha256: '0'.repeat(64) }), /does not exist/);
  assert.equal((await host.siteReadFile('jan', { project: 'My Invoices', path: 'index.html' })).content, '<h1>Invoices</h1>');
});

test('update requires current sha256 and does not silently clobber newer versions', async () => {
  const args = { project: 'My Invoices', path: 'index.html' };
  const original = await host.siteReadFile('jan', args);
  await assert.rejects(() => host.siteUpdateFile('jan', { ...args, content: 'new' }), /expected_sha256/);
  const updated = await host.siteUpdateFile('jan', { ...args, content: '<p>new</p>', expected_sha256: original.sha256 });
  assert.notEqual(updated.sha256, original.sha256);
  await assert.rejects(() => host.siteUpdateFile('jan', { ...args, content: 'stale', expected_sha256: original.sha256 }), /has changed/);
  assert.equal((await host.siteReadFile('jan', args)).content, '<p>new</p>');
});

test('base64 binary uploads preserve bytes and can be read back', async () => {
  const content = Buffer.from([0, 1, 2, 3, 255]).toString('base64');
  await host.siteCreateFile('jan', { project: 'My Invoices', path: 'assets/logo.png', content, encoding: 'base64' });
  const read = await host.siteReadFile('jan', { project: 'My Invoices', path: 'assets/logo.png' });
  assert.equal(read.encoding, 'base64');
  assert.equal(read.content, content);
  await assert.rejects(() => host.siteCreateFile('jan', { project: 'x', path: 'x.png', content: 'bad%%%fake', encoding: 'base64' }), /base64/);
});

test('delete file removes empty asset folders; project deletion requires confirmation', async () => {
  const args = { project: 'My Invoices', path: 'assets/logo.png' };
  const read = await host.siteReadFile('jan', args);
  await assert.rejects(() => host.siteDeleteFile('jan', { ...args, expected_sha256: '0'.repeat(64) }), /has changed/);
  await host.siteDeleteFile('jan', { ...args, expected_sha256: read.sha256 });
  const listing = await host.siteList('jan');
  assert.equal(listing.directories.includes('my-invoices/assets'), false);
  await assert.rejects(() => host.siteDeleteProject('jan', { project: 'My Invoices', confirm: false }), /Confirm deletion/);
  const result = await host.siteDeleteProject('jan', { project: 'My Invoices', confirm: true });
  assert.equal(result.files_deleted, 3);
  assert.deepEqual((await host.siteList('jan')).projects, []);
});

test('refuses symlinks even if added out of band to the publication volume', async () => {
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'pg-mcp-escape-'));
  try {
    const dir = path.join(root, 'jan', 'escape');
    await fs.mkdir(dir, { recursive: true });
    await fs.symlink(outside, path.join(dir, 'assets'));
    await assert.rejects(() => host.siteCreateFile('jan', {
      project: 'escape', path: 'assets/secret.html', content: 'secret'
    }), /Onveilige/);
    await assert.rejects(() => host.siteList('jan'), /Symbolic links/);
  } finally {
    await fs.rm(path.join(root, 'jan', 'escape'), { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
});
