'use strict';

const YT_HOST = /^(?:www\.|m\.|music\.)?youtube\.com$/;
const SP_PATH = /^\/(?:intl-[a-z-]+\/)?(track|album|playlist)\/([A-Za-z0-9]{10,32})/;

function parseUrl(raw) {
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;

  if (u.hostname === 'open.spotify.com') {
    const m = SP_PATH.exec(u.pathname);
    if (!m) return null;
    return { platform: 'spotify', kind: m[1], id: m[2], url: `https://open.spotify.com/${m[1]}/${m[2]}` };
  }

  const short = u.hostname === 'youtu.be';
  if (!short && !YT_HOST.test(u.hostname)) return null;

  const idRe = /^[\w-]{11}$/;
  const list = u.searchParams.get('list');
  const realList = list && !/^RD/.test(list);
  let vid = short ? u.pathname.slice(1, 12) : u.searchParams.get('v');
  const seg = /^\/(?:shorts|embed|live|v)\/([\w-]{11})/.exec(u.pathname);
  if (seg) vid = seg[1];

  if (vid && idRe.test(vid)) {
    return { platform: 'youtube', kind: 'video', id: vid, url: `https://www.youtube.com/watch?v=${vid}` };
  }
  if (realList && /^[\w-]{10,64}$/.test(list)) {
    return { platform: 'youtube', kind: 'playlist', id: list, url: `https://www.youtube.com/playlist?list=${list}` };
  }
  const ch = /^\/(@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)/.exec(u.pathname);
  if (ch) {
    return { platform: 'youtube', kind: 'playlist', id: ch[1], url: `https://www.youtube.com/${ch[1]}/videos` };
  }
  return null;
}

function findUrl(text) {
  for (const raw of String(text || '').match(/https?:\/\/[^\s"'<>]+/gi) || []) {
    const p = parseUrl(raw.replace(/[)\],.;!]+$/, ''));
    if (p) return p;
  }
  return null;
}

function findUrls(text) {
  const seen = new Map();
  for (const raw of String(text || '').match(/https?:\/\/[^\s"'<>]+/gi) || []) {
    const p = parseUrl(raw.replace(/[)\],.;!]+$/, ''));
    if (p && !seen.has(p.url)) seen.set(p.url, p);
  }
  return [...seen.values()];
}

module.exports = { parseUrl, findUrl, findUrls };
