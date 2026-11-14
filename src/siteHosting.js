import { promises as fs, constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { config } from './config.js';

// Only the pg-mcp container has a writable mount. Nginx mounts the same volume read-only.
// The authenticated PostgreSQL principal determines the entire owner namespace.
const locks = new Map();
const TEXT_EXTENSIONS = new Set(['.html', '.htm', '.css', '.js', '.mjs', '.json', '.txt', '.svg', '.map']);
const BINARY_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2']);
const ALL_EXTENSIONS = new Set([...TEXT_EXTENSIONS, ...BINARY_EXTENSIONS]);
const MAX_PROJECTS = 20;
const MAX_FILES = 300;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const MAX_SCAN_ENTRIES = 500;

export function usernameDirectory(username) {
  if (typeof username !== 'string' || !username || Buffer.byteLength(username, 'utf8') > 255) {
    throw new Error('Invalid PostgreSQL username.');
  }
  // PostgreSQL usernames with ordinary characters keep their exact readable name.
  // Quoted/unusual identifiers get a reversible, collision-free encoding.
  return /^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(username)
    ? username : `~${Buffer.from(username, 'utf8').toString('hex')}`;
}

export function projectSlug(name) {
  if (typeof name !== 'string' || !name.trim() || name.length > 160) {
    throw new Error('Provide a short, recognizable project name.');
  }
  const slug = name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64).replace(/-+$/g, '');
  if (!slug) throw new Error('Project name contains no supported letters or digits.');
  return slug;
}

export function fileSegments(input) {
  if (typeof input !== 'string' || input.length > 600 || input.includes('\\') || input.startsWith('/') || input.endsWith('/')) {
    throw new Error('File path must be relative to the project directory.');
  }
  const segments = input.split('/');
  if (segments.length < 1 || segments.length > 8 || segments.some(segment =>
    segment === '.' || segment === '..' || segment.length < 1 || segment.length > 100 ||
    !/^[\p{L}\p{N}_-][\p{L}\p{M}\p{N}_. -]*$/u.test(segment) ||
    segment.endsWith('.') || segment.endsWith(' '))) {
    throw new Error('Invalid path (no .., hidden files, or special path characters).');
  }
  return segments;
}

function validFilePath(filePath) {
  const segments = fileSegments(filePath);
  const ext = path.posix.extname(segments.at(-1)).toLowerCase();
  if (!ALL_EXTENSIONS.has(ext)) {
    throw new Error(`File type not allowed. Use: ${[...ALL_EXTENSIONS].sort().join(', ')}`);
  }
  return { segments, ext };
}

export function publishedUrl(username, project, filePath = 'index.html') {
  const segments = fileSegments(filePath);
  const p = projectSlug(project);
  const url = new URL(config.appPublicUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('APP_PUBLIC_URL must be a valid HTTP(S) base URL without credentials.');
  }
  return url.href.replace(/\/+$/, '') + '/apps/' +
    [usernameDirectory(username), p, ...segments].map(encodeURIComponent).join('/');
}

function ensureEnabled() {
  if (!config.appHostingEnabled) throw new Error('Apphosting is uitgeschakeld (APP_HOSTING_ENABLED=false).');
}

async function locked(key, fn) {
  const previous = locks.get(key) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  locks.set(key, current);
  await previous;
  try { return await fn(); }
  finally {
    release();
    if (locks.get(key) === current) locks.delete(key);
  }
}

async function assertDirectory(directory, create) {
  let stat;
  try { stat = await fs.lstat(directory); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (!create) return false;
    try { await fs.mkdir(directory, { mode: 0o755 }); }
    catch (mkdirError) { if (mkdirError.code !== 'EEXIST') throw mkdirError; }
    stat = await fs.lstat(directory);
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Onveilige publicatiemap geweigerd.');
  return true;
}

async function userRoot(username, create) {
  const root = path.resolve(config.appHostingDir);
  if (!(await assertDirectory(root, false))) {
    throw new Error('Storage directory is missing. Start Docker with APP_HOSTING_ENABLED=true and compose.hosting.yml.');
  }
  const userDir = path.join(root, usernameDirectory(username));
  if (!(await assertDirectory(userDir, create))) return null;
  return userDir;
}

async function ensureParent(userDir, project, segments, create) {
  const full = [projectSlug(project), ...segments.slice(0, -1)];
  let dir = userDir;
  for (const segment of full) {
    dir = path.join(dir, segment);
    if (!(await assertDirectory(dir, create))) return null;
  }
  return dir;
}

async function checkedFile(file) {
  let stat;
  try { stat = await fs.lstat(file); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('File is not a regular file.');
  return stat;
}

async function walk(directory, subpath = '', collection = { files: [], directories: [], bytes: 0, entries: 0 }) {
  let items = await fs.readdir(directory, { withFileTypes: true });
  items = items.sort((a, b) => a.name.localeCompare(b.name));
  for (const item of items) {
    collection.entries++;
    if (collection.entries > MAX_SCAN_ENTRIES) throw new Error('Publishing directory contains too many files for safe processing.');
    if (item.isSymbolicLink()) throw new Error('Symbolic links are forbidden in the publishing directory.');
    const rel = subpath ? `${subpath}/${item.name}` : item.name;
    const full = path.join(directory, item.name);
    if (item.isDirectory()) {
      collection.directories.push(rel);
      await walk(full, rel, collection);
    } else if (item.isFile()) {
      const st = await fs.lstat(full);
      if (!st.isFile() || st.isSymbolicLink()) throw new Error('Invalid file structure.');
      collection.files.push({ path: rel, bytes: st.size });
      collection.bytes += st.size;
    } else throw new Error('Non-regular files are not allowed.');
  }
  return collection;
}

function contentBuffer(content, encoding, ext) {
  if (typeof content !== 'string') throw new Error('content must be a string.');
  const text = TEXT_EXTENSIONS.has(ext);
  const desired = text ? 'utf8' : 'base64';
  if (encoding !== desired) throw new Error(`Use encoding=${desired} for this file type.`);
  if (encoding === 'base64' && (content.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content))) {
    throw new Error('Invalid base64 content.');
  }
  const buffer = Buffer.from(content, encoding);
  if (buffer.length > config.appMaxFileBytes) throw new Error(`File too large (limit ${config.appMaxFileBytes} bytes).`);
  if (encoding === 'utf8' && (buffer.includes(0) || buffer.toString('utf8') !== content)) {
    throw new Error('Invalid UTF-8 text or NUL byte.');
  }
  return buffer;
}

function digest(buffer) { return createHash('sha256').update(buffer).digest('hex'); }
function projectDir(username, project) { return path.join(path.resolve(config.appHostingDir), usernameDirectory(username), projectSlug(project)); }

async function totalUsage(userDir) {
  const stats = await walk(userDir);
  return { files: stats.files.length, bytes: stats.bytes,
    projects: stats.directories.filter(d => !d.includes('/')).length };
}

async function writeFile(username, { project, path: filePath, content, encoding = 'utf8', expected_sha256 }, mode) {
  ensureEnabled();
  const { segments, ext } = validFilePath(filePath);
  const buffer = contentBuffer(content, encoding, ext);
  return locked(username, async () => {
    const userDir = await userRoot(username, true);
    const rootProject = projectDir(username, project);
    // Enforce the project quota BEFORE creating folders (including empty folders).
    if (mode === 'create' && !(await assertDirectory(rootProject, false))) {
      const before = await totalUsage(userDir);
      if (before.projects >= MAX_PROJECTS) throw new Error('Limit of 20 projects per user reached.');
    }
    const destination = path.join(rootProject, ...segments);
    const parent = await ensureParent(userDir, project, segments, mode === 'create');
    if (!parent) throw new Error('Project or folder does not exist. Start with site_create_file.');
    const existing = await checkedFile(destination);
    if (mode === 'create' && existing) throw new Error('File already exists. Use site_update_file.');
    if (mode === 'update' && !existing) throw new Error('File does not exist. Use site_create_file.');
    if (mode === 'update') {
      if (!/^[a-f0-9]{64}$/.test(expected_sha256 || '')) throw new Error('expected_sha256 is required for updates.');
      if (digest(await fs.readFile(destination)) !== expected_sha256) {
        throw new Error('File has changed. Read it again with site_read_file.');
      }
    }
    const usage = await totalUsage(userDir);
    if (usage.bytes - (existing?.size || 0) + buffer.length > MAX_TOTAL_BYTES) throw new Error('20 MiB storage quota per user reached.');
    if (!existing && usage.files >= MAX_FILES) throw new Error('Limit of 300 files per user reached.');
    const temporary = path.join(parent, `.upload-${randomUUID()}.tmp`);
    let created = false;
    try {
      const handle = await fs.open(temporary, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW, 0o644);
      created = true;
      try { await handle.writeFile(buffer); await handle.sync(); }
      finally { await handle.close(); }
      await fs.rename(temporary, destination);
    } finally { if (created) await fs.rm(temporary, { force: true }).catch(() => {}); }
    return { project: projectSlug(project), path: segments.join('/'), bytes: buffer.length,
      sha256: digest(buffer), url: publishedUrl(username, project, filePath), operation: mode };
  });
}

export async function siteCreateFile(username, args) { return writeFile(username, args, 'create'); }
export async function siteUpdateFile(username, args) {
  return writeFile(username, args, 'update');
}

export async function siteReadFile(username, { project, path: filePath }) {
  ensureEnabled();
  const { segments, ext } = validFilePath(filePath);
  const userDir = await userRoot(username, false);
  const parent = userDir && await ensureParent(userDir, project, segments, false);
  const file = parent && path.join(parent, segments.at(-1));
  if (!file || !(await checkedFile(file))) throw new Error('File does not exist.');
  const buffer = await fs.readFile(file);
  if (buffer.length > config.appMaxFileBytes) throw new Error('File is too large to read.');
  const encoding = TEXT_EXTENSIONS.has(ext) ? 'utf8' : 'base64';
  return { project: projectSlug(project), path: segments.join('/'), encoding,
    content: buffer.toString(encoding), bytes: buffer.length, sha256: digest(buffer),
    url: publishedUrl(username, project, filePath) };
}

export async function siteDeleteFile(username, { project, path: filePath, expected_sha256 }) {
  ensureEnabled();
  const { segments } = validFilePath(filePath);
  return locked(username, async () => {
    const userDir = await userRoot(username, false);
    const parent = userDir && await ensureParent(userDir, project, segments, false);
    const file = parent && path.join(parent, segments.at(-1));
    if (!file || !(await checkedFile(file))) throw new Error('File does not exist.');
    if (expected_sha256 && digest(await fs.readFile(file)) !== expected_sha256) {
      throw new Error('File has changed. Read it again with site_read_file.');
    }
    await fs.unlink(file);
    // Preserve the project folder, but remove empty nested asset directories.
    let dir = parent;
    const stop = projectDir(username, project);
    while (dir !== stop) {
      const items = await fs.readdir(dir);
      if (items.length) break;
      await fs.rmdir(dir);
      dir = path.dirname(dir);
    }
    return { deleted: true, project: projectSlug(project), path: segments.join('/') };
  });
}

export async function siteList(username, { project } = {}) {
  ensureEnabled();
  const userDir = await userRoot(username, false);
  if (!userDir) return { username, user_folder: usernameDirectory(username), projects: [], files: [], directories: [] };
  const target = project ? projectDir(username, project) : userDir;
  if (project && !(await assertDirectory(target, false))) throw new Error('Project does not exist.');
  const stats = await walk(target);
  const entries = stats.files.map(file => {
    const parts = project ? [projectSlug(project), file.path] : file.path.split('/');
    const p = parts[0];
    const relative = project ? parts[1] : parts.slice(1).join('/');
    return { ...file, project: p, file: relative, url: publishedUrl(username, p, relative) };
  });
  const projects = project ? [projectSlug(project)] : stats.directories.filter(dir => !dir.includes('/'));
  return { username, user_folder: usernameDirectory(username), projects,
    directories: stats.directories, files: entries, total_files: entries.length, total_bytes: stats.bytes };
}

export async function siteDeleteProject(username, { project, confirm }) {
  ensureEnabled();
  if (confirm !== true) throw new Error('Confirm deletion of the entire project.');
  return locked(username, async () => {
    const dir = projectDir(username, project);
    const userDir = await userRoot(username, false);
    if (!userDir || !(await assertDirectory(dir, false))) throw new Error('Project does not exist.');
    const scan = await walk(dir); // refuse unexpected symlinks or special files
    await fs.rm(dir, { recursive: true });
    return { deleted: true, project: projectSlug(project), files_deleted: scan.files.length };
  });
}
