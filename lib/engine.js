'use strict';

const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const INFO_DIR = path.join(os.tmpdir(), 'md-info');

/* ------------------------------ kleine Helfer ------------------------------ */

function fmtDuration(sec) {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

const ck = (c) => (c && c !== 'none' ? ['--cookies-from-browser', c] : []);
const cancelled = () => Object.assign(new Error('Abgebrochen'), { cancelled: true });

/** yt-dlp mit JSON-Ausgabe (stdout komplett). */
function json(exe, args) {
  return new Promise((resolve, reject) => {
    execFile(exe, args, { windowsHide: true, maxBuffer: 1 << 28 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(ytError(stderr) || err.message));
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error('Antwort von yt-dlp nicht lesbar.'));
      }
    });
  });
}

/** Prozess starten, stdout zeilenweise melden; Abbruch beendet den ganzen Prozessbaum. */
function run(exe, args, { signal, onLine } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(exe, args, { windowsHide: true });
    const kill = () => spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    if (signal) signal.aborted ? kill() : signal.addEventListener('abort', kill, { once: true });
    let err = '';
    let buf = '';
    p.stdout.on('data', (c) => {
      buf += c;
      let i;
      while ((i = buf.search(/[\r\n]/)) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        if (line) onLine?.(line);
      }
    });
    p.stderr.on('data', (c) => (err = (err + c).slice(-4000)));
    p.on('error', reject);
    p.on('close', (code) => {
      if (signal?.aborted) return reject(cancelled());
      code === 0 ? resolve() : reject(new Error(ytError(err) || `Prozess endete mit Code ${code}`));
    });
  });
}

function ytError(stderr) {
  const lines = String(stderr).split('\n').filter(Boolean);
  const msg = (lines.find((l) => /ERROR/i.test(l)) || lines.at(-1) || '').replace(/^ERROR:\s*(\[[^\]]+\]\s*[\w-]*:\s*)?/i, '').trim();
  if (/sign in|age/i.test(msg)) return 'Altersbeschränkt oder Anmeldung nötig.';
  if (/private/i.test(msg)) return 'Dieses Video ist privat.';
  if (/unavailable/i.test(msg)) return 'Dieses Video ist nicht verfügbar.';
  return msg;
}

/* --------------------------------- YouTube --------------------------------- */

const ytThumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

function videoItem(e) {
  return {
    id: e.id,
    url: `https://www.youtube.com/watch?v=${e.id}`,
    title: e.title || 'Unbekannter Titel',
    sub: e.uploader || e.channel || '',
    duration: e.duration ? fmtDuration(e.duration) : '',
    cover: ytThumb(e.id),
  };
}

/** Sofort-Vorschau (Titel/Kanal) über oEmbed, bevor yt-dlp fertig ist. */
async function oembed(id) {
  const res = await fetch(
    'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(`https://www.youtube.com/watch?v=${id}`),
    { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) }
  );
  if (!res.ok) return null;
  const j = await res.json();
  return { platform: 'youtube', kind: 'video', title: j.title, sub: j.author_name, cover: ytThumb(id), items: [{ id, url: `https://www.youtube.com/watch?v=${id}`, title: j.title, sub: j.author_name, duration: '', cover: ytThumb(id) }] };
}

/** Vollständige Metadaten + verfügbare Auflösungen; Info-JSON wird für den Download wiederverwendet. */
async function videoMeta(ytdlp, p, cookies) {
  const info = await json(ytdlp, [...ck(cookies), '--dump-single-json', '--no-warnings', '--no-playlist', '--', p.url]);
  if (info.is_live) throw new Error('Livestreams werden nicht unterstützt.');
  const heights = [...new Set((info.formats || []).filter((f) => f.vcodec && f.vcodec !== 'none' && f.height >= 144).map((f) => f.height))].sort((a, b) => b - a);
  fs.mkdirSync(INFO_DIR, { recursive: true });
  const infoFile = path.join(INFO_DIR, `${info.id}.json`);
  fs.writeFileSync(infoFile, JSON.stringify(info));
  const item = videoItem(info);
  return { platform: 'youtube', kind: 'video', title: item.title, sub: item.sub, cover: pickThumb(info) || item.cover, duration: item.duration, heights, items: [item], infoFile };
}

function pickThumb(info) {
  const t = (info.thumbnails || []).filter((x) => x.url && /^https:/.test(x.url) && x.width).sort((a, b) => b.width - a.width)[0];
  return t?.url || info.thumbnail;
}

async function playlistMeta(ytdlp, p, cookies) {
  const info = await json(ytdlp, [...ck(cookies), '--flat-playlist', '--dump-single-json', '--no-warnings', '--playlist-end', '2000', '--', p.url]);
  const seen = new Set();
  const items = [];
  for (const e of info.entries || []) {
    if (!e?.id || !/^[\w-]{11}$/.test(e.id) || seen.has(e.id) || /private|deleted/i.test(e.title || '')) continue;
    seen.add(e.id);
    items.push(videoItem(e));
  }
  if (!items.length) throw new Error('Keine abspielbaren Videos gefunden.');
  return { platform: 'youtube', kind: 'playlist', title: info.title || 'Playlist', sub: info.uploader || info.channel || '', cover: items[0].cover, items };
}

/** Video-Formatwahl: bevorzugt H.264/AAC (läuft überall), fällt stufenweise zurück. */
function videoSelector(h) {
  const c = h ? `[height<=${h}]` : '';
  return [`bv*${c}[vcodec^=avc1]+ba[acodec^=mp4a]`, `bv*${c}[vcodec^=avc1]+ba`, `bv*${c}+ba`, `b${c}`, 'bv*+ba/b'].join('/');
}

/* --------------------------------- Spotify --------------------------------- */

const spTrack = (id, title, artist, ms, cover, album) => ({
  id,
  url: `https://open.spotify.com/track/${id}`,
  title,
  sub: artist,
  artist,
  album,
  duration: ms ? fmtDuration(ms / 1000) : '',
  seconds: ms ? ms / 1000 : 0,
  cover,
});

/** Alle Songs einer Playlist über die Spotify-API (eigene Zugangsdaten, Client-Credentials). */
async function spotifyPlaylistFull(id, { clientId, secret }, cover) {
  const tr = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${clientId}:${secret}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(10000),
  });
  if (!tr.ok) throw new Error('Spotify-Zugangsdaten ungültig.');
  const { access_token } = await tr.json();
  const items = [];
  let url = `https://api.spotify.com/v1/playlists/${id}/tracks?limit=100&fields=next,items(track(id,name,duration_ms,artists(name)))`;
  while (url && items.length < 3000) {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + access_token }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(r.status === 404 || r.status === 403 ? 'Spotify erlaubt für diese Playlist keinen API-Zugriff.' : `Spotify-API-Fehler ${r.status}.`);
    const j = await r.json();
    for (const { track: t } of j.items) if (t?.id) items.push(spTrack(t.id, t.name, t.artists.map((a) => a.name).join(', '), t.duration_ms, cover, ''));
    url = j.next;
  }
  return items;
}

/** Liest Metadaten aus der öffentlichen Embed-Seite (kein API-Key, kein spotDL). */
async function spotifyMeta(p, creds) {
  const get = () => fetch(`https://open.spotify.com/embed/${p.kind}/${p.id}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
  const res = await get().catch(() => get()); // ein zweiter Versuch fängt kurze Aussetzer ab
  if (!res.ok) throw new Error(`Spotify antwortet mit ${res.status}.`);
  const m = /<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s.exec(await res.text());
  const e = m && JSON.parse(m[1])?.props?.pageProps?.state?.data?.entity;
  if (!e) throw new Error('Spotify-Link konnte nicht gelesen werden.');

  const imgs = [...(e.visualIdentity?.image || []), ...(e.coverArt?.sources || [])];
  const cover = imgs.sort((a, b) => (b.maxWidth || b.width || 0) - (a.maxWidth || a.width || 0))[0]?.url || null;
  const track = spTrack;

  if (p.kind === 'track') {
    const artist = (e.artists || []).map((a) => a.name).join(', ');
    return { platform: 'spotify', kind: 'track', title: e.title || e.name, sub: artist, cover, items: [track(p.id, e.title || e.name, artist, e.duration, cover, '')] };
  }
  const name = e.title || e.name;
  const items = (e.trackList || [])
    .filter((t) => t.uri?.startsWith('spotify:track:'))
    .map((t) => track(t.uri.slice(14), t.title, t.subtitle, t.duration, cover, p.kind === 'album' ? name : ''));
  if (!items.length) throw new Error('Keine Songs gefunden.');
  const out = { platform: 'spotify', kind: p.kind, title: name, sub: e.subtitle || '', cover, items };
  if (items.length >= 100 && p.kind === 'playlist') {
    // Die Embed-Seite liefert höchstens 100 Songs.
    try {
      if (!creds) throw new Error('Spotify liefert nur die ersten 100 Songs. Für mehr: In Spotify alle Songs markieren (Strg+A), Strg+C und hier einfügen.');
      out.items = await spotifyPlaylistFull(p.id, creds, cover);
    } catch (err) {
      out.note = err.message;
    }
  }
  return out;
}

/** Wählt aus Suchtreffern den passendsten Audio-Upload (Dauer, Künstler, „Audio“/Topic). */
function bestMatch(entries, { artist = '', title = '', seconds = 0 }) {
  const a = artist.split(',')[0].trim().toLowerCase();
  const score = (e) => {
    const t = (e.title || '').toLowerCase();
    const up = (e.uploader || e.channel || '').toLowerCase();
    let s = seconds && e.duration ? -Math.abs(e.duration - seconds) : 0;
    if (a && (up.includes(a) || t.includes(a))) s += 6;
    if (/ - topic$/.test(up)) s += 8;
    if (/official audio|\baudio\b/.test(t)) s += 3;
    const bad = /\b(live|remix|cover|karaoke|instrumental|reaction|sped up|slowed)\b/.exec(t);
    if (bad && !title.toLowerCase().includes(bad[1])) s -= 12;
    if (/official (music )?video|lyric/.test(t)) s -= 4;
    return s;
  };
  return [...entries].sort((x, y) => score(y) - score(x))[0] || null;
}

async function spotifyMatch(ytdlp, job) {
  const q = `${job.artist} ${job.title} audio`.replace(/\s+/g, ' ').slice(0, 200);
  const r = await json(ytdlp, ['--flat-playlist', '--dump-single-json', '--no-warnings', '--', `ytsearch6:${q}`]);
  const best = bestMatch((r.entries || []).filter((e) => e?.id), job);
  if (!best) throw new Error('Kein passender Audio-Stream gefunden.');
  return `https://www.youtube.com/watch?v=${best.id}`;
}

/** Schreibt Titel/Künstler/Album und (wo möglich) das Album-Cover in die fertige Audiodatei. */
async function tagAudio(ffmpeg, file, job) {
  const ext = path.extname(file);
  const tmp = `${file}.tag${ext}`;
  const cover = file + '.cover.jpg';
  const args = ['-y', '-loglevel', 'error', '-i', file];
  try {
    if (job.cover && ext !== '.opus') {
      const res = await fetch(job.cover, { signal: AbortSignal.timeout(8000) });
      if (res.ok) fs.writeFileSync(cover, Buffer.from(await res.arrayBuffer()));
    }
    if (fs.existsSync(cover)) args.push('-i', cover, '-map', '0:a', '-map', '1:v', '-c', 'copy', '-disposition:v:0', 'attached_pic', '-metadata:s:v', 'title=Cover', '-metadata:s:v', 'comment=Cover (front)');
    else args.push('-c', 'copy');
    if (ext === '.mp3') args.push('-id3v2_version', '3');
    args.push('-metadata', `title=${job.title}`, '-metadata', `artist=${job.artist}`);
    if (job.album) args.push('-metadata', `album=${job.album}`);
    args.push(tmp);
    await run(ffmpeg, args);
    fs.renameSync(tmp, file);
  } catch {
    /* Tags sind optional – die Datei bleibt gültig */
  } finally {
    fs.rmSync(tmp, { force: true });
    fs.rmSync(cover, { force: true });
  }
}

/* ------------------------- Mehrere eingefügte Links ------------------------- */

async function pool(list, n, fn) {
  const out = new Array(list.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, list.length) }, async () => {
      while (i < list.length) {
        const k = i++;
        out[k] = await fn(list[k]).catch(() => null);
      }
    })
  );
  return out;
}

/** Eingefügte Liste einzelner Song- oder Video-Links (z. B. in Spotify Strg+A, Strg+C). */
async function linkList(links) {
  const platform = links[0].platform;
  const same = links.filter((p) => p.platform === platform && p.kind === (platform === 'spotify' ? 'track' : 'video')).slice(0, 3000);
  if (!same.length) throw new Error('Keine einzelnen Song- oder Video-Links erkannt.');
  const metas = await pool(same, 8, (p) => (platform === 'spotify' ? spotifyMeta(p) : oembed(p.id)));
  const items = metas.filter(Boolean).map((m) => m.items[0]);
  if (!items.length) throw new Error('Die Links konnten nicht gelesen werden.');
  const failed = same.length - items.length;
  return {
    platform,
    kind: 'list',
    title: `${items.length} ${platform === 'spotify' ? 'Songs' : 'Videos'} aus der Zwischenablage`,
    sub: failed ? `${failed} Links nicht lesbar` : '',
    cover: items[0].cover,
    items,
  };
}

/* -------------------------------- Download --------------------------------- */

const safeName = (s) => String(s).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '').slice(0, 120) || 'download';
const AUDIO_SELECTOR = { m4a: 'ba[ext=m4a]/ba/b' };

/**
 * Lädt ein Medium. job: { platform, mode:'video'|'audio', height, fmt, url, title, artist, album, cover, seconds,
 * subs, chapters, normalize, cookies, rate, sub (Unterordner), clip, start, end }
 * Rückgabe: Pfad der fertigen Datei.
 */
async function download(job, { bin, outDir, infoFile, signal, onProgress }) {
  const dir = job.sub ? path.join(outDir, safeName(job.sub)) : outDir;
  fs.mkdirSync(dir, { recursive: true });
  const spotify = job.platform === 'spotify';
  const fmt = job.fmt || 'mp3';
  if (spotify) onProgress({ percent: 0, speed: 0, eta: 0, phase: 'Suche …' });
  const target = spotify ? await spotifyMatch(bin.ytdlp, job) : job.url;
  if (signal?.aborted) throw cancelled();

  const base = (spotify ? safeName(`${job.artist} - ${job.title}`).replace(/%/g, '%%') : '%(title).150B') + (job.clip ? ' [Ausschnitt]' : '');
  const common = [
    '--no-warnings', '--no-mtime', '--no-playlist', '--newline', '--windows-filenames',
    '-N', '4', '--http-chunk-size', '10M', '--retries', '5', '--fragment-retries', '5',
    '--progress-template', 'download:__P__%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s',
    '--ffmpeg-location', bin.ffmpeg,
    '-o', path.join(dir, `${base}.%(ext)s`),
    ...ck(job.cookies),
    ...(job.rate ? ['-r', job.rate] : []),
    ...(job.clip ? ['--download-sections', `*${job.start || '0:00'}-${job.end || 'inf'}`, '--force-keyframes-at-cuts'] : []),
  ];
  const mode =
    job.mode === 'audio'
      ? [
          '-f', AUDIO_SELECTOR[fmt] || 'ba/b', '-x', '--audio-format', fmt, ...(fmt === 'mp3' ? ['--audio-quality', '0'] : []),
          '--embed-metadata', ...(spotify ? [] : ['--embed-thumbnail', '--convert-thumbnails', 'jpg']),
          ...(job.normalize ? ['--postprocessor-args', 'ExtractAudio:-af loudnorm=I=-16:TP=-1.5:LRA=11'] : []),
        ]
      : [
          '-f', videoSelector(job.height), '--merge-output-format', 'mp4',
          ...(job.chapters ? ['--embed-chapters'] : []),
          ...(job.subs ? ['--write-subs', '--write-auto-subs', '--sub-langs', 'de,en', '--embed-subs', '--compat-options', 'no-keep-subs'] : []),
        ];

  let file = null;
  let streams = 1;
  let idx = -1;
  if (job.clip) onProgress({ percent: 0, speed: 0, eta: 0, phase: 'Lade Ausschnitt …' });
  const onLine = (l) => {
    let m;
    if ((m = /Downloading \d+ format\(s\): (.+)/.exec(l))) streams = m[1].split('+').length;
    else if (l.startsWith('[download] Destination:')) {
      idx++;
      file = l.slice(24).trim();
    } else if ((m = /^\[(?:Merger\] Merging formats into|ExtractAudio\] Destination:) "?(.+?)"?$/.exec(l))) file = m[1];
    else if ((m = /^\[download\] (.+) has already been downloaded/.exec(l))) file = m[1];
    else if (l.startsWith('__P__')) {
      const [d, t, e, s, eta] = l.slice(5).split('|').map(Number);
      const total = t || e;
      const frac = total ? Math.min(d / total, 1) : 0;
      const dual = streams === 2;
      const from = dual && idx >= 1 ? 0.9 : 0;
      const span = dual ? (idx >= 1 ? 0.1 : 0.9) : 1;
      onProgress({ percent: Math.min(99, (from + frac * span) * 100), speed: s || 0, eta: eta || 0, phase: '' });
    } else if (/^\[(Merger|ExtractAudio|EmbedThumbnail|Metadata|EmbedSubtitle|ModifyChapters)\]/.test(l)) onProgress({ percent: 99, speed: 0, eta: 0, phase: 'Verarbeite …' });
  };

  const attempt = (src) => run(bin.ytdlp, [...common, ...mode, ...src], { signal, onLine });
  if (infoFile && fs.existsSync(infoFile)) {
    try {
      await attempt(['--load-info-json', infoFile]); // spart die zweite Extraktion
    } catch (err) {
      if (err.cancelled) throw err;
      await attempt(['--', target]); // z. B. abgelaufene Stream-URLs
    }
  } else {
    await attempt(['--', target]);
  }

  if (!file || !fs.existsSync(file)) throw new Error('Datei wurde nicht gefunden.');
  if (spotify) {
    onProgress({ percent: 99, speed: 0, eta: 0, phase: 'Tags & Cover …' });
    await tagAudio(bin.ffmpeg, file, job);
  }
  return file;
}

module.exports = { linkList, oembed, videoMeta, playlistMeta, spotifyMeta, download, bestMatch, videoSelector, fmtDuration, INFO_DIR };
