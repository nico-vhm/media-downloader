'use strict';

/** yt-dlp + ffmpeg im Benutzerprofil bereitstellen (ohne Admin-Rechte) und aktuell halten. */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { net } = require('electron');

const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
const FFMPEG_URL = 'https://github.com/GyanD/codexffmpeg/releases/download/7.1/ffmpeg-7.1-essentials_build.zip';
const FFMPEG_ENTRY = 'ffmpeg-7.1-essentials_build/bin/ffmpeg.exe';

const paths = (userData) => {
  const dir = path.join(userData, 'bin');
  const legacy = path.join(dir, 'ffmpeg', 'ffmpeg-7.1-essentials_build', 'bin', 'ffmpeg.exe'); // Version 1.x
  return { dir, ytdlp: path.join(dir, 'yt-dlp.exe'), ffmpeg: fs.existsSync(legacy) ? legacy : path.join(dir, 'ffmpeg.exe') };
};

const ok = (f, min) => fs.existsSync(f) && fs.statSync(f).size > min;
const isReady = (userData) => {
  const p = paths(userData);
  return ok(p.ytdlp, 5e6) && ok(p.ffmpeg, 5e6);
};

async function fetchTo(url, dest, onFrac) {
  const res = await net.fetch(url, { headers: { 'User-Agent': 'media-downloader' } });
  if (!res.ok) throw new Error(`Download fehlgeschlagen (HTTP ${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  let got = 0;
  const body = Readable.fromWeb(res.body);
  body.on('data', (c) => total && onFrac?.((got += c.length) / total));
  const tmp = dest + '.part';
  await pipeline(body, fs.createWriteStream(tmp));
  fs.rmSync(dest, { force: true });
  fs.renameSync(tmp, dest);
}

const exec = (cmd, args) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true, stdio: 'ignore' });
    p.on('error', reject);
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`${cmd} endete mit Code ${c}`))));
  });

/** Lädt fehlende Werkzeuge parallel. onProgress(label, 0..1) */
async function ensure(userData, onProgress) {
  const p = paths(userData);
  fs.mkdirSync(p.dir, { recursive: true });
  const jobs = [];
  if (!ok(p.ytdlp, 5e6)) jobs.push(fetchTo(YTDLP_URL, p.ytdlp, (f) => onProgress('yt-dlp', f)));
  if (!ok(p.ffmpeg, 5e6)) {
    jobs.push(
      (async () => {
        const zip = path.join(p.dir, 'ffmpeg.zip');
        await fetchTo(FFMPEG_URL, zip, (f) => onProgress('ffmpeg', f * 0.95));
        await exec(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', zip, '-C', p.dir, '--strip-components=2', FFMPEG_ENTRY]);
        fs.rmSync(zip, { force: true });
        onProgress('ffmpeg', 1);
      })()
    );
  }
  await Promise.all(jobs);
  if (!isReady(userData)) throw new Error('Werkzeuge konnten nicht eingerichtet werden.');
  return paths(userData);
}

/** yt-dlp aktualisiert sich selbst (-U). Liefert die Version danach. */
async function update(userData) {
  const { ytdlp } = paths(userData);
  await exec(ytdlp, ['-U']).catch(() => {});
  return version(userData);
}

function version(userData) {
  return new Promise((resolve) => {
    let out = '';
    const p = spawn(paths(userData).ytdlp, ['--version'], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    p.stdout.on('data', (c) => (out += c));
    p.on('error', () => resolve(null));
    p.on('close', () => resolve(out.trim() || null));
  });
}

module.exports = { paths, isReady, ensure, update, version };
