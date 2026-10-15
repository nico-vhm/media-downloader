'use strict';

const { app, BrowserWindow, ipcMain, shell, dialog, clipboard, safeStorage, Notification } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const tools = require('./lib/tools');
const engine = require('./lib/engine');
const { parseUrl, findUrl, findUrls } = require('./lib/url');

if (process.env.MD_USER_DATA) app.setPath('userData', process.env.MD_USER_DATA);
if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

const userFile = (n) => path.join(app.getPath('userData'), n);
const load = (n, d) => {
  try {
    return JSON.parse(fs.readFileSync(userFile(n), 'utf8'));
  } catch {
    return d;
  }
};
const save = (n, v) => {
  try {
    fs.writeFileSync(userFile(n), JSON.stringify(v));
  } catch {}
};

const QUALITIES = ['mp3', '720', '1080', '1440', '2160'];
const HEIGHTS = [144, 240, 360, 480, 720, 1080, 1440, 2160, 4320];
const TIME = /^\d{1,2}(:\d{2}){0,2}$/;
let settings;
const defaults = () => ({
  dir: app.getPath('downloads'), quality: '1080', parallel: 3, theme: 'aurora', lang: 'de',
  audio: 'mp3', subs: false, chapters: true, folders: 'flat', limit: 0, notify: true, cookies: 'none',
  normalize: false, after: 'none', lastUpdate: 0, spotifyId: '', spotifySecret: '',
});
const pick = (v, list, d) => (list.includes(v) ? v : d);

function cleanSettings(s) {
  const d = defaults();
  return {
    dir: typeof s.dir === 'string' && path.isAbsolute(s.dir) ? s.dir : d.dir,
    quality: pick(s.quality, QUALITIES, d.quality),
    parallel: Math.min(4, Math.max(1, Math.round(Number(s.parallel)) || d.parallel)),
    theme: pick(s.theme, ['aurora', 'terminal'], d.theme),
    lang: pick(s.lang, ['de', 'en'], d.lang),
    audio: pick(s.audio, ['mp3', 'm4a', 'flac', 'opus'], d.audio),
    subs: !!s.subs,
    chapters: s.chapters !== false,
    folders: pick(s.folders, ['flat', 'sorted'], d.folders),
    limit: pick(Number(s.limit), [0, 1, 2, 5, 10], 0),
    notify: s.notify !== false,
    cookies: pick(s.cookies, ['none', 'chrome', 'edge', 'firefox', 'brave'], d.cookies),
    normalize: !!s.normalize,
    after: pick(s.after, ['none', 'shutdown'], 'none'),
    lastUpdate: Number(s.lastUpdate) || 0,
    spotifyId: /^\w{0,64}$/.test(s.spotifyId) ? s.spotifyId : '',
    spotifySecret: typeof s.spotifySecret === 'string' ? s.spotifySecret.slice(0, 600) : '',
  };
}

const pubSettings = () => ({ ...settings, spotifySecret: settings.spotifySecret ? '1' : '' });
const spotifyCreds = () => {
  try {
    const secret = settings.spotifySecret && safeStorage.decryptString(Buffer.from(settings.spotifySecret, 'base64'));
    return settings.spotifyId && secret ? { clientId: settings.spotifyId, secret } : null;
  } catch {
    return null;
  }
};
const applyPatch = (patch) => {
  const p = { ...patch };
  if (typeof p.spotifySecret === 'string' && p.spotifySecret) p.spotifySecret = safeStorage.encryptString(p.spotifySecret.trim()).toString('base64');
  else delete p.spotifySecret;
  if (patch.spotifyId === '') p.spotifySecret = '';
  settings = cleanSettings({ ...settings, ...p });
  save('settings.json', settings);
};

let win;
const send = (ch, ...a) => win && !win.isDestroyed() && win.webContents.send(ch, ...a);

function createWindow() {
  win = new BrowserWindow({
    width: 980,
    height: 700,
    minWidth: 760,
    minHeight: 560,
    frame: false,
    backgroundColor: '#07070d',
    show: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: true, contextIsolation: true },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('focus', () => send('focus'));
  win.on('maximize', () => send('maximized', true));
  win.on('unmaximize', () => send('maximized', false));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

let bin = tools.paths(app.getPath('userData'));
let toolsReady = Promise.resolve();

function setupTools() {
  if (tools.isReady(app.getPath('userData'))) return Promise.resolve();
  const frac = {};
  return (toolsReady = tools
    .ensure(app.getPath('userData'), (label, f) => {
      frac[label] = f;
      const vals = Object.values(frac);
      send('setup', { step: label, pct: vals.reduce((a, b) => a + b, 0) / 2 });
    })
    .then((p) => {
      bin = p;
      send('setup', { done: true });
    })
    .catch((e) => {
      send('setup', { error: e.message });
      throw e;
    }));
}

async function maybeUpdate(force) {
  if (!force && Date.now() - settings.lastUpdate < 864e5) return null;
  if (!force && [...items.values()].some((i) => i.status === 'active')) return null;
  settings.lastUpdate = Date.now();
  save('settings.json', settings);
  return tools.update(app.getPath('userData'));
}

const items = new Map();
const infoCache = new Map();
const dirty = new Set();
let flushTimer = null;
let seq = 0;

const pub = ({ ac, infoFile, _ls, ...i }) => i;
const OPEN = ['queued', 'active', 'paused'];
const anyOpen = () => [...items.values()].some((i) => OPEN.includes(i.status));

let archive = {};
const akey = (it) => `${it.key}|${it.mode === 'audio' ? it.fmt : 'video'}`;
const haveKeys = () => new Set(Object.entries(archive).filter(([, f]) => fs.existsSync(f)).map(([k]) => k.split('|')[0]));

let persistTimer = null;
const persist = () => {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(
    () => save('library.json', [...items.values()].filter((i) => ['done', 'queued', 'active', 'paused', 'error'].includes(i.status)).sort((a, b) => b.addedAt - a.addedAt).slice(0, 1500).map(pub)),
    800
  );
};
const touch = (it) => {
  if (it.status && it._ls !== it.status) {
    it._ls = it.status;
    persist();
  }
  dirty.add(it.id);
  flushTimer ??= setTimeout(() => {
    flushTimer = null;
    send('queue', [...dirty].map((id) => (items.has(id) ? pub(items.get(id)) : { id, removed: true })));
    dirty.clear();
  }, 120);
};

const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');

function add(jobs) {
  let added = 0;
  let skipped = 0;
  const list = Array.isArray(jobs) ? jobs.slice(0, 3000) : [];
  const bulk = list.length > 1;
  const rate = settings.limit ? `${Math.max(50, Math.round((settings.limit * 1000) / settings.parallel))}K` : '';
  for (const j of list) {
    const p = parseUrl(j?.url);
    if (!p || (p.kind === 'playlist' && p.platform === 'youtube') || (p.platform === 'spotify' && p.kind !== 'track')) continue;
    const audio = p.platform === 'spotify' || j.mode === 'audio';
    const clip = !bulk && p.platform === 'youtube' && (TIME.test(j.start) || TIME.test(j.end));
    const it = {
      id: `j${++seq}${Date.now().toString(36)}`,
      key: `${p.platform}:${p.id}`,
      platform: p.platform,
      mode: audio ? 'audio' : 'video',
      height: !audio && HEIGHTS.includes(Number(j.height)) ? Number(j.height) : null,
      url: p.url,
      title: str(j.title, 200) || 'Unbekannt',
      artist: str(j.artist, 200),
      album: str(j.album, 200),
      cover: /^https:\/\//.test(j.cover) ? str(j.cover, 500) : '',
      seconds: Number(j.seconds) || 0,
      fmt: settings.audio,
      subs: settings.subs,
      chapters: settings.chapters,
      normalize: settings.normalize,
      cookies: settings.cookies,
      rate,
      sub: settings.folders === 'sorted' ? str(j.collection, 120) || str(j.artist, 120).split(',')[0].trim() : '',
      clip,
      start: clip && TIME.test(j.start) ? j.start : '',
      end: clip && TIME.test(j.end) ? j.end : '',
      status: 'queued',
      percent: 0,
      speed: 0,
      eta: 0,
      phase: '',
      addedAt: Date.now() + added,
      infoFile: infoCache.get(p.id),
    };
    const known = archive[akey(it)];
    if (bulk && known && fs.existsSync(known)) {
      skipped++;
      continue;
    }
    items.set(it.id, it);
    touch(it);
    added++;
  }
  pump();
  return { added, skipped };
}

function pump() {
  const running = [...items.values()].filter((i) => i.status === 'active').length;
  const queued = [...items.values()].filter((i) => i.status === 'queued').sort((a, b) => a.addedAt - b.addedAt);
  for (const it of queued.slice(0, Math.max(0, settings.parallel - running))) run(it);
}

const TRANSIENT = /timed out|timeout|connection|reset|HTTP Error (5\d\d|429)|unable to download|fragment|SSL|temporar|network|getaddrinfo/i;
let batchDone = 0;
let batchFail = 0;

async function run(it) {
  it.status = 'active';
  it.ac = new AbortController();
  touch(it);
  let last = 0;
  const onProgress = (p) => {
    const now = Date.now();
    if (now - last < 150 && p.percent < 99) return;
    last = now;
    Object.assign(it, p);
    touch(it);
  };
  try {
    await toolsReady;
    for (let attempt = 1; ; attempt++) {
      try {
        it.file = await engine.download(it, { bin, outDir: settings.dir, infoFile: it.infoFile, signal: it.ac.signal, onProgress });
        break;
      } catch (e) {
        if (e.cancelled || attempt >= 3 || !TRANSIENT.test(e.message)) throw e;
        Object.assign(it, { phase: `Neuer Versuch ${attempt + 1}/3 …`, percent: 0, speed: 0, eta: 0 });
        touch(it);
        await new Promise((r) => setTimeout(r, attempt * 3000));
        if (it.ac.signal.aborted) throw Object.assign(new Error('Abgebrochen'), { cancelled: true });
      }
    }
    Object.assign(it, { status: 'done', percent: 100, speed: 0, eta: 0, phase: '', size: fs.statSync(it.file).size });
    if (!it.clip) {
      archive[akey(it)] = it.file;
      save('archive.json', archive);
    }
    batchDone++;
  } catch (e) {
    it.status = e.cancelled ? (it.pause ? 'paused' : 'cancelled') : 'error';
    it.error = e.cancelled ? '' : e.message;
    if (it.status === 'paused') Object.assign(it, { speed: 0, eta: 0, phase: '' });
    if (!e.cancelled) batchFail++;
  } finally {
    it.ac = null;
    it.pause = false;
    touch(it);
    pump();
    if (!anyOpen()) finishBatch();
  }
}

function finishBatch() {
  if (!batchDone && !batchFail) return;
  const [done, fail] = [batchDone, batchFail];
  batchDone = batchFail = 0;
  if (settings.notify && Notification.isSupported() && !win?.isFocused()) {
    const en = settings.lang === 'en';
    new Notification({ title: 'Media Downloader', body: en ? `${done} finished${fail ? `, ${fail} failed` : ''}` : `${done} fertig${fail ? `, ${fail} fehlgeschlagen` : ''}` }).show();
  }
  if (settings.after === 'shutdown' && done) {
    applyPatch({ after: 'none' });
    spawn('shutdown', ['/s', '/t', '60'], { windowsHide: true, stdio: 'ignore' });
    send('shutdown', 60);
  }
}

const need = (id) => items.get(id) || null;

ipcMain.handle('init', () => {
  settings = cleanSettings({ ...defaults(), ...load('settings.json', {}) });
  archive = load('archive.json', {});
  for (const i of load('library.json', [])) {
    if (!i?.id) continue;
    if (i.status === 'done') {
      if (i.file && fs.existsSync(i.file)) items.set(i.id, i);
    } else if (i.status === 'error' || i.status === 'paused') items.set(i.id, i);
    else items.set(i.id, { ...i, status: 'queued', percent: 0, speed: 0, eta: 0, phase: '' });
  }
  const ready = tools.isReady(app.getPath('userData'));
  if (ready) setTimeout(() => maybeUpdate(false).catch(() => {}), 4000);
  else setupTools().catch(() => {});
  const queue = [...items.values()].map(pub);
  setTimeout(pump, 500);
  return { settings: pubSettings(), queue, ready };
});

ipcMain.handle('setup:retry', () => setupTools());

ipcMain.handle('resolve', async (e, text, reqId) => {
  const have = haveKeys();
  const mark = (r) => {
    r.items.forEach((i) => (i.have = have.has(`${r.platform}:${i.id}`)));
    return r;
  };
  const links = findUrls(text);
  if (links.length > 1) return mark(await engine.linkList(links));
  const p = parseUrl(text);
  if (!p) throw new Error('Das ist kein gültiger YouTube- oder Spotify-Link.');
  if (p.platform === 'spotify') return mark(await engine.spotifyMeta(p, spotifyCreds()));
  await toolsReady;
  if (p.kind === 'playlist') return mark(await engine.playlistMeta(bin.ytdlp, p, settings.cookies));
  engine.oembed(p.id).then((r) => r && send('partial', reqId, r)).catch(() => {});
  const { infoFile, ...meta } = await engine.videoMeta(bin.ytdlp, p, settings.cookies);
  infoCache.set(p.id, infoFile);
  return mark(meta);
});

ipcMain.handle('queue:add', (e, jobs) => add(jobs));
ipcMain.handle('shutdown:cancel', () => spawn('shutdown', ['/a'], { windowsHide: true, stdio: 'ignore' }));
const pauseOne = (it) => {
  if (it.status === 'active') {
    it.pause = true;
    it.ac?.abort();
  } else if (it.status === 'queued') {
    it.status = 'paused';
    touch(it);
  }
};
const resumeOne = (it) => {
  if (it.status !== 'paused') return;
  it.status = 'queued';
  touch(it);
};
ipcMain.handle('queue:pause', (e, id) => need(id) && pauseOne(need(id)));
ipcMain.handle('queue:resume', (e, id) => {
  need(id) && resumeOne(need(id));
  pump();
});
ipcMain.handle('queue:pause-all', () => items.forEach(pauseOne));
ipcMain.handle('queue:resume-all', () => {
  items.forEach(resumeOne);
  pump();
});
ipcMain.handle('queue:cancel', (e, id) => {
  const it = need(id);
  if (it?.status === 'active') it.ac?.abort();
  else if (it?.status === 'queued' || it?.status === 'paused') {
    it.status = 'cancelled';
    touch(it);
  }
});
ipcMain.handle('queue:cancel-all', () => {
  for (const it of items.values()) {
    if (it.status === 'active') it.ac?.abort();
    else if (it.status === 'queued' || it.status === 'paused') {
      it.status = 'cancelled';
      touch(it);
    }
  }
});
ipcMain.handle('queue:retry', (e, id) => {
  const it = need(id);
  if (it && (it.status === 'error' || it.status === 'cancelled')) {
    Object.assign(it, { status: 'queued', percent: 0, error: '', addedAt: Date.now() });
    touch(it);
    pump();
  }
});
ipcMain.handle('queue:remove', (e, id) => {
  const it = need(id);
  if (!it || it.status === 'active') return;
  items.delete(id);
  touch({ id });
  persist();
});
ipcMain.handle('queue:clear', () => {
  for (const [id, it] of items) if (!['active', 'queued'].includes(it.status)) (items.delete(id), touch({ id }));
  persist();
});
ipcMain.handle('file:open', (e, id) => {
  const f = need(id)?.file;
  if (f && fs.existsSync(f)) return shell.openPath(f).then((r) => !r);
  return false;
});
ipcMain.handle('file:show', (e, id) => {
  const f = need(id)?.file;
  f && fs.existsSync(f) ? shell.showItemInFolder(f) : shell.openPath(settings.dir);
});

ipcMain.handle('settings:set', (e, patch) => {
  applyPatch(patch);
  pump();
  return pubSettings();
});
ipcMain.handle('settings:dir', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], defaultPath: settings.dir });
  if (!r.canceled) applyPatch({ dir: r.filePaths[0] });
  return pubSettings();
});
ipcMain.handle('tools:version', () => tools.version(app.getPath('userData')));
ipcMain.handle('tools:update', () => maybeUpdate(true));

ipcMain.handle('disk', () => {
  let dir = settings.dir;
  while (dir && !fs.existsSync(dir) && path.dirname(dir) !== dir) dir = path.dirname(dir);
  try {
    const s = fs.statfsSync(dir);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
});
ipcMain.handle('folder:open', () => {
  fs.mkdirSync(settings.dir, { recursive: true });
  return shell.openPath(settings.dir);
});
ipcMain.handle('clipboard', () => {
  const text = clipboard.readText();
  return findUrls(text).length > 1 ? text.slice(0, 400000) : findUrl(text)?.url || '';
});
ipcMain.on('win', (e, cmd) => {
  if (cmd === 'min') win.minimize();
  else if (cmd === 'max') win.isMaximized() ? win.unmaximize() : win.maximize();
  else if (cmd === 'close') win.close();
});

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});
app.on('window-all-closed', () => app.quit());
app.on('quit', () => {
  for (const it of items.values()) it.ac?.abort();
  fs.rmSync(engine.INFO_DIR, { recursive: true, force: true });
});
app.whenReady().then(createWindow);
