'use strict';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const platformOf = (x) => (/youtu\.?be|youtube\.com/i.test(x) ? 'youtube' : /open\.spotify\.com/i.test(x) ? 'spotify' : '');

const ICONS = {
  link: '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" class="fill"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4L15.8 12z"/></svg>',
  spotify: '<svg viewBox="0 0 24 24" class="fill"><path d="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24zm5.5 17.3a.75.75 0 0 1-1 .25c-2.8-1.7-6.3-2.1-10.4-1.2a.75.75 0 1 1-.3-1.4c4.5-1 8.4-.6 11.5 1.3.3.2.4.7.2 1zm1.5-3.3a.94.94 0 0 1-1.3.3c-3.2-2-8-2.5-11.8-1.4a.94.94 0 0 1-.5-1.8c4.3-1.3 9.6-.7 13.3 1.6.4.3.6.9.3 1.3zm.1-3.4C15.3 8.3 8.9 8 5.2 9.2a1.1 1.1 0 1 1-.7-2.1c4.3-1.4 11.4-1.1 15.9 1.5a1.1 1.1 0 0 1-1.3 2z"/></svg>',
};
const THEMES = {
  aurora: { label: 'Aurora', brand: 'Media Downloader', headline: 'Link einfügen' },
  terminal: { label: 'Terminal', brand: '~/media-downloader', headline: '$ get <link>' },
};
const QUALITY = [{ v: 'mp3', l: 'MP3' }, { v: '720', l: '720p' }, { v: '1080', l: '1080p' }, { v: '1440', l: '1440p' }, { v: '2160', l: '4K' }];
const DEFAULT_HEIGHTS = [2160, 1440, 1080, 720, 480, 360];
const ONOFF = [{ v: 'on', l: 'An' }, { v: 'off', l: 'Aus' }];

const st = { s: null, items: new Map(), rows: new Map(), result: null, req: 0, sel: '1080', checked: new Set(), busy: false, clip: '', batch: new Set(), batchStart: 0, plat: 'all', sd: 0 };

const EN = {
  'Einstellungen': 'Settings', 'Design wechseln': 'Switch design', 'Link einfügen': 'Paste a link', 'YouTube- oder Spotify-Link': 'YouTube or Spotify link',
  'Einfügen': 'Paste', 'Laden': 'Load', 'Minimieren': 'Minimize', 'Maximieren': 'Maximize', 'Schließen': 'Close', 'Downloads': 'Downloads',
  'Fertige entfernen': 'Clear finished', 'Noch nichts geladen. Füge oben einen Link ein.': 'Nothing downloaded yet. Paste a link above.',
  'Heute': 'Today', 'Insgesamt': 'Total', 'Datenmenge': 'Data', 'Songs / Videos': 'Songs / Videos', 'Statistik': 'Statistics',
  'Zielordner öffnen': 'Open target folder', 'Pause': 'Pause', 'Fortsetzen': 'Resume', 'Alle Downloads pausieren': 'Pause all downloads',
  'Abbrechen': 'Cancel', 'Alle Downloads abbrechen': 'Cancel all downloads', 'Suchen …': 'Search …',
  'Werkzeuge werden vorbereitet': 'Preparing tools', 'yt-dlp und ffmpeg werden einmalig geladen …': 'yt-dlp and ffmpeg are downloaded once …', 'Erneut versuchen': 'Try again',
  'Zielordner': 'Target folder', 'Ändern': 'Change', 'Standardqualität': 'Default quality', 'Vorauswahl für neue Links': 'Preselected for new links',
  'Parallele Downloads': 'Parallel downloads', 'Gleichzeitig aktive Jobs': 'Jobs running at once', 'Design': 'Design',
  'Farbe folgt dem Link: YouTube rot, Spotify grün': 'Color follows the link: YouTube red, Spotify green',
  'Sprache': 'Language', 'Oberfläche': 'Interface', 'Audio-Format': 'Audio format', 'Für Audio-Downloads und Spotify': 'For audio downloads and Spotify',
  'Untertitel': 'Subtitles', 'Deutsch und Englisch ins Video einbetten': 'Embed German and English into the video',
  'Kapitel': 'Chapters', 'Kapitelmarken ins Video einbetten': 'Embed chapter marks into the video',
  'Unterordner': 'Subfolders', 'Sortiert nach Kanal, Künstler oder Playlist': 'Sorted by channel, artist or playlist', 'Flach': 'Flat', 'Sortiert': 'Sorted',
  'Tempolimit': 'Speed limit', 'Gesamt in MB/s, ∞ = unbegrenzt': 'Total in MB/s, ∞ = unlimited',
  'Lautstärke angleichen': 'Normalize volume', 'Gleiche Lautheit bei Audio-Downloads': 'Same loudness for audio downloads',
  'Benachrichtigung': 'Notification', 'Hinweis, wenn alle Downloads fertig sind': 'Notify when all downloads are finished',
  'Danach herunterfahren': 'Shut down afterwards', 'Einmalig nach dem nächsten Stapel, 60 s zum Abbrechen': 'Once after the next batch, 60 s to cancel',
  'Browser-Cookies': 'Browser cookies', 'Für altersbeschränkte oder private Videos (bei Chrome und Edge oft nicht möglich)': 'For age-restricted or private videos (often not possible with Chrome and Edge)',
  'Spotify-API (optional)': 'Spotify API (optional)',
  'Nur nutzbar, wenn dein Spotify-Entwicklerkonto Web API freigeschaltet hat (aktuell Premium). Ohne: Songs in Spotify markieren (Strg+A), Strg+C, hier einfügen.':
    'Only usable if your Spotify developer account has Web API access (currently Premium). Otherwise: select songs in Spotify (Ctrl+A), Ctrl+C, paste here.',
  'Client-ID': 'Client ID', 'Client-Secret': 'Client secret', 'Secret gespeichert': 'Secret saved', 'Speichern': 'Save', 'Aktualisieren': 'Update', 'Fertig': 'Done',
  'Nur für den privaten Gebrauch und Inhalte, an denen du die Rechte hast. DRM wird nicht umgangen. Spotify-Songs werden auf YouTube gesucht und als MP3 geladen.':
    'For private use and content you have the rights to. DRM is not bypassed. Spotify songs are matched on YouTube and downloaded as audio.',
  'PC wird heruntergefahren': 'Shutting down the PC', 'An': 'On', 'Aus': 'Off', 'Alle': 'All',
  'In der Zwischenablage ist kein YouTube- oder Spotify-Link.': 'No YouTube or Spotify link in the clipboard.',
  'Das ist kein gültiger YouTube- oder Spotify-Link.': 'That is not a valid YouTube or Spotify link.',
  'Wartet …': 'Waiting …', 'Pausiert': 'Paused', 'Fehler': 'Error', 'Öffnen': 'Open', 'Ordner': 'Folder', 'Erneut': 'Retry', 'Entfernen': 'Remove',
  'Herunterladen': 'Download', 'laden': 'download', 'ausgewählt': 'selected', 'Videos': 'videos', 'Songs': 'songs', 'bereits geladen': 'already downloaded',
  'Download gestartet': 'Download started', 'Downloads gestartet': 'downloads started', 'übersprungen': 'skipped', 'Alles war schon geladen': 'Everything was already downloaded',
  'schon geladen': 'already have', 'Spotify-Zugang gespeichert': 'Spotify access saved', 'Spotify-Zugang entfernt': 'Spotify access removed',
  'Suche Update …': 'Checking for update …', 'nicht gefunden': 'not found', 'frei': 'free', 'aktiv': 'active', 'wartend': 'waiting', 'pausiert': 'paused',
  'Links aus der Zwischenablage': 'links from the clipboard', 'mit Cover & Tags': 'with cover & tags', 'Ausschnitt': 'Clip', 'Ende': 'End',
  'Suche …': 'Searching …', 'Verarbeite …': 'Processing …', 'Tags & Cover …': 'Tags & cover …', 'Lade Ausschnitt …': 'Downloading clip …',
  'noch < 1 Min': '< 1 min left', 
  'Abgebrochen': 'Cancelled', 'Dieses Video ist privat.': 'This video is private.', 'Dieses Video ist nicht verfügbar.': 'This video is not available.',
  'Altersbeschränkt oder Anmeldung nötig.': 'Age-restricted or sign-in required.', 'Livestreams werden nicht unterstützt.': 'Live streams are not supported.',
  'Keine abspielbaren Videos gefunden.': 'No playable videos found.', 'Keine Songs gefunden.': 'No songs found.', 'Datei wurde nicht gefunden.': 'File not found.',
  'Kein passender Audio-Stream gefunden.': 'No matching audio stream found.', 'Spotify-Link konnte nicht gelesen werden.': 'Could not read the Spotify link.',
  'Spotify liefert nur die ersten 100 Songs. Für mehr: In Spotify alle Songs markieren (Strg+A), Strg+C und hier einfügen.': 'Spotify only provides the first 100 songs. For more: select all songs in Spotify (Ctrl+A), Ctrl+C and paste here.',
  'Keine einzelnen Song- oder Video-Links erkannt.': 'No single song or video links found.', 'Die Links konnten nicht gelesen werden.': 'The links could not be read.',
};
const RULES = [
  [/^Neuer Versuch (\d\/3) …$/, 'Retry $1 …'],
  [/^(\d+) Links nicht lesbar$/, '$1 links unreadable'],
  [/^(\d+) Songs aus der Zwischenablage$/, '$1 songs from the clipboard'],
  [/^(\d+) Videos aus der Zwischenablage$/, '$1 videos from the clipboard'],
];
const t = (s) => {
  if (st.s?.lang !== 'en' || !s) return s;
  if (EN[s]) return EN[s];
  for (const [re, to] of RULES) if (re.test(s)) return s.replace(re, to);
  return s;
};

function translateStatic() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    n._de ??= n.nodeValue;
    const key = n._de.trim();
    if (key) n.nodeValue = n._de.replace(key, t(key));
  }
  for (const el of document.querySelectorAll('[placeholder],[title],[aria-label]')) {
    for (const a of ['placeholder', 'title', 'aria-label']) {
      if (!el.hasAttribute(a)) continue;
      const key = 'data-de-' + a;
      if (!el.hasAttribute(key)) el.setAttribute(key, el.getAttribute(a));
      el.setAttribute(a, t(el.getAttribute(key)));
    }
  }
}

const bytes = (n) => (n >= 1e9 ? (n / 1e9).toFixed(2) + ' GB' : n >= 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB');
const speed = (b) => (b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB/s' : Math.round(b / 1e3) + ' KB/s');
const eta = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}h` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);
const qLabel = (h) => (h === 2160 ? '4K' : h + 'p');

function toast(text) {
  const el = Object.assign(document.createElement('div'), { className: 'toast', textContent: text });
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 2800);
}

function applyTheme(name) {
  const th = THEMES[name] || THEMES.aurora;
  document.body.dataset.theme = name in THEMES ? name : 'aurora';
  $('#theme-btn').textContent = th.label;
  $('#brand').textContent = th.brand;
  $('#headline').textContent = t(th.headline);
}

function setPlatform(p) {
  document.body.dataset.platform = p;
  $('#plat').innerHTML = ICONS[p] || ICONS.link;
}

const msg = (text = '', err = false) => {
  $('#msg').textContent = t(text);
  $('#msg').classList.toggle('err', err);
};

function pickQuality(want, heights) {
  if (want === 'mp3') return 'mp3';
  const hs = [...heights].sort((a, b) => b - a);
  return String(hs.find((h) => h <= +want) ?? hs.at(-1) ?? 1080);
}

async function resolve(text) {
  text = text.trim();
  if (!text || st.busy) return;
  const id = ++st.req;
  st.busy = true;
  st.result = null;
  $('#go').classList.add('busy');
  msg();
  renderResult();
  try {
    const r = await api.resolve(text, id);
    if (id !== st.req) return;
    setPlatform(r.platform);
    st.result = r;
    st.sel = pickQuality(st.sel, r.heights || DEFAULT_HEIGHTS);
    st.checked = new Set(r.items.map((_, i) => i).filter((i) => r.items.length === 1 || !r.items[i].have));
  } catch (e) {
    if (id === st.req) msg(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), true);
  } finally {
    if (id === st.req) {
      st.busy = false;
      $('#go').classList.remove('busy');
      renderResult();
    }
  }
}

api.onPartial((id, r) => {
  if (id !== st.req || !st.busy) return;
  setPlatform(r.platform);
  st.result = { ...r, partial: true };
  st.checked = new Set([0]);
  st.sel = pickQuality(st.s.quality, DEFAULT_HEIGHTS);
  renderResult();
});

function renderResult() {
  const el = $('#result');
  const r = st.result;
  if (!r && !st.busy) return void (el.hidden = true);
  el.hidden = false;
  if (!r) {
    el.innerHTML = '<div class="head"><div class="cover skel"></div><div class="meta"><div class="skel line w60"></div><div class="skel line w30"></div></div></div>';
    return;
  }
  const list = r.items.length > 1;
  const sp = r.platform === 'spotify';
  const heights = r.heights || DEFAULT_HEIGHTS;
  const opts = [{ v: 'mp3', l: (st.s.audio || 'mp3').toUpperCase() }, ...heights.map((h) => ({ v: String(h), l: qLabel(h) }))];
  const chips = sp ? `<span class="chip fixed">${esc((st.s.audio || 'mp3').toUpperCase())} · ${esc(t('mit Cover & Tags'))}</span>` : `<div class="seg" id="chips">${opts.map((o) => `<button data-q="${o.v}">${o.l}</button>`).join('')}</div>`;
  const dupe = !list && r.items[0].have;
  const count = list ? `${r.items.length} ${t(sp ? 'Songs' : 'Videos')}` : r.items[0].duration;
  const clip = !list && !sp ? `<button id="clip-toggle" class="ghost">✂ ${esc(t('Ausschnitt'))}</button><span class="clip" hidden><input id="t-from" placeholder="0:00" /> – <input id="t-to" placeholder="${esc(t('Ende'))}" /></span>` : '';

  el.innerHTML = `
    <div class="head">
      <img class="cover ${sp ? 'sq' : ''}" src="${esc(r.cover)}" alt="" />
      <div class="meta">
        <h2>${esc(r.title)}</h2>
        <p class="muted">${esc([t(r.sub), count].filter(Boolean).join(' · '))}${dupe ? ` <span class="badge">${esc(t('bereits geladen'))}</span>` : ''}</p>
        ${r.note ? `<p class="note">${esc(t(r.note))}</p>` : ''}
        ${list ? '' : `<div class="actions">${chips}${clip}<button id="dl" class="primary">${esc(t('Herunterladen'))}</button></div>`}
      </div>
    </div>
    ${list ? `
    <div class="bar">
      <label class="check"><input type="checkbox" id="all" checked /> ${esc(t('Alle'))}</label>
      ${chips}
      <span class="grow"></span>
      <span id="count" class="muted"></span>
      <button id="dl" class="primary">${esc(t('Herunterladen'))}</button>
    </div>
    <div class="items">${r.items.map((it, i) => `
      <label class="item"><input type="checkbox" data-i="${i}" ${st.checked.has(i) ? 'checked' : ''} />
        <img src="${esc(it.cover)}" alt="" loading="lazy" />
        <span class="t">${esc(it.title)}<small>${esc(it.sub)}</small></span>${it.have ? `<span class="badge have">${esc(t('bereits geladen'))}</span>` : ''}<span class="muted">${esc(it.duration)}</span></label>`).join('')}
    </div>` : ''}`;
  syncResult();
}

function syncResult() {
  const r = st.result;
  if (!r) return;
  document.querySelectorAll('#chips [data-q]').forEach((b) => b.classList.toggle('on', b.dataset.q === st.sel));
  const n = st.checked.size;
  const have = r.items.filter((i) => i.have).length;
  const count = $('#count');
  if (count) count.textContent = `${n} ${t('ausgewählt')}${have ? ` · ${have} ${t('schon geladen')}` : ''}`;
  const all = $('#all');
  if (all) all.checked = n === r.items.length;
  const dl = $('#dl');
  dl.disabled = n === 0;
  dl.textContent = r.items.length > 1 ? `${n} ${t('laden')}` : t('Herunterladen');
}

$('#result').addEventListener('click', async (e) => {
  const q = e.target.closest('[data-q]');
  if (q) {
    st.sel = q.dataset.q;
    return syncResult();
  }
  if (e.target.closest('#clip-toggle')) return void ($('.clip').hidden = !$('.clip').hidden);
  if (!e.target.closest('#dl') || !st.result) return;
  const r = st.result;
  const audio = r.platform === 'spotify' || st.sel === 'mp3';
  const clipOn = $('.clip') && !$('.clip').hidden;
  const collection = r.kind === 'playlist' || r.kind === 'album' ? r.title : '';
  const jobs = r.items
    .filter((_, i) => st.checked.has(i))
    .map((it) => ({
      url: it.url, mode: audio ? 'audio' : 'video', height: audio ? null : +st.sel, title: it.title, artist: it.artist || it.sub,
      album: it.album, cover: it.cover, seconds: it.seconds, collection,
      start: clipOn ? $('#t-from').value.trim() : '', end: clipOn ? $('#t-to').value.trim() : '',
    }));
  const { added, skipped } = await api.add(jobs);
  toast(added ? `${added} ${t(added === 1 ? 'Download gestartet' : 'Downloads gestartet')}${skipped ? `, ${skipped} ${t('übersprungen')}` : ''}` : t('Alles war schon geladen'));
  st.result = null;
  $('#url').value = '';
  setPlatform('');
  renderResult();
});

$('#result').addEventListener('change', (e) => {
  if (e.target.id === 'all') {
    st.checked = new Set(e.target.checked ? st.result.items.map((_, i) => i) : []);
    document.querySelectorAll('[data-i]').forEach((c) => (c.checked = e.target.checked));
  } else if (e.target.dataset.i !== undefined) {
    st.checked[e.target.checked ? 'add' : 'delete'](+e.target.dataset.i);
  }
  syncResult();
});

function statusText(it) {
  if (it.status === 'queued') return t('Wartet …');
  if (it.status === 'paused') return `${t('Pausiert')} · ${Math.round(it.percent)}%`;
  if (it.status === 'active') return it.phase ? t(it.phase) : [`${Math.round(it.percent)}%`, it.speed && speed(it.speed), it.eta && eta(it.eta)].filter(Boolean).join(' · ');
  if (it.status === 'done') return [it.mode === 'audio' ? (it.fmt || 'mp3').toUpperCase() : 'MP4' + (it.height ? ' ' + qLabel(it.height) : ''), it.size && bytes(it.size)].filter(Boolean).join(' · ');
  if (it.status === 'error') return t(it.error) || t('Fehler');
  return t('Abgebrochen');
}

const btn = (act, label) => `<button data-act="${act}">${esc(t(label))}</button>`;
const BTN = {
  active: () => btn('pause', 'Pause') + btn('cancel', 'Abbrechen'),
  queued: () => btn('pause', 'Pause') + btn('cancel', 'Abbrechen'),
  paused: () => btn('resume', 'Fortsetzen') + btn('cancel', 'Abbrechen'),
  done: () => btn('open', 'Öffnen') + btn('show', 'Ordner') + `<button data-act="remove" aria-label="${esc(t('Entfernen'))}">✕</button>`,
  error: () => btn('retry', 'Erneut') + `<button data-act="remove" aria-label="${esc(t('Entfernen'))}">✕</button>`,
  cancelled: () => btn('retry', 'Erneut') + `<button data-act="remove" aria-label="${esc(t('Entfernen'))}">✕</button>`,
};

function buildRow(it) {
  const el = document.createElement('div');
  el.className = 'qrow';
  el.dataset.id = it.id;
  el.dataset.status = it.status;
  el.innerHTML = `<${it.cover ? 'img' : 'div'} class="qc ${it.platform === 'spotify' ? 'sq' : ''}" ${it.cover ? `src="${esc(it.cover)}" alt=""` : ''}></${it.cover ? 'img' : 'div'}>
    <div class="qm"><b class="qt">${esc(it.title)}</b><span class="qs"></span><div class="track"><i></i></div></div>
    <div class="qa">${BTN[it.status]()}</div>`;
  patchRow(el, it);
  return el;
}

function patchRow(el, it) {
  const s = el.querySelector('.qs');
  s.textContent = statusText(it);
  s.title = it.status === 'error' ? it.error : '';
  el.querySelector('.track i').style.width = `${it.status === 'done' ? 100 : it.percent}%`;
  const q = $('#qsearch').value.trim().toLowerCase();
  el.hidden = (st.plat !== 'all' && it.platform !== st.plat) || (q && !`${it.title} ${it.artist}`.toLowerCase().includes(q));
}

function upsert(it) {
  const prev = st.items.get(it.id);
  st.items.set(it.id, it);
  let el = st.rows.get(it.id);
  if (!el) {
    el = buildRow(it);
    st.rows.set(it.id, el);
    $('#qlist').prepend(el);
  } else if (prev.status !== it.status) {
    const fresh = buildRow(it);
    el.replaceWith(fresh);
    st.rows.set(it.id, fresh);
  } else patchRow(el, it);
}

function rebuildRows() {
  const all = [...st.items.values()].sort((a, b) => a.addedAt - b.addedAt);
  st.items.clear();
  st.rows.clear();
  $('#qlist').innerHTML = '';
  all.forEach(upsert);
}

async function refreshDisk() {
  const free = await api.disk();
  $('#disk').textContent = free === null ? '' : `${bytes(free)} ${t('frei')}`;
  $('#folder-name').textContent = st.s.dir.split(/[\\/]/).filter(Boolean).pop() || st.s.dir;
  $('#folder-btn').title = st.s.dir;
}

function renderStats(all) {
  const done = all.filter((i) => i.status === 'done');
  const day = new Date().setHours(0, 0, 0, 0);
  const songs = done.filter((i) => i.mode === 'audio').length;
  $('#st-today').textContent = done.filter((i) => i.addedAt >= day).length;
  $('#st-all').textContent = done.length;
  $('#st-size').textContent = done.length ? bytes(done.reduce((s, i) => s + (i.size || 0), 0)) : '0 MB';
  $('#st-mix').textContent = `${songs} / ${done.length - songs}`;
}

function renderBatch(all) {
  const open = all.filter((i) => ['active', 'queued', 'paused'].includes(i.status));
  if (!open.length) st.batch.clear();
  else if (!st.batch.size) st.batchStart = Date.now();
  open.forEach((i) => st.batch.add(i.id));
  const b = [...st.batch].map((id) => st.items.get(id)).filter((i) => i && ['active', 'queued', 'paused', 'done'].includes(i.status));
  $('#batch').hidden = !b.length;
  if (!b.length) return;
  const running = all.some((i) => i.status === 'active' || i.status === 'queued');
  $('#pause-all').textContent = t(running ? 'Pause' : 'Fortsetzen');
  $('#pause-all').dataset.mode = running ? 'pause' : 'resume';
  const pct = b.reduce((s, i) => s + (i.status === 'done' ? 100 : i.percent || 0), 0) / b.length;
  $('#batch-bar').style.width = `${pct}%`;
  const sec = ((Date.now() - st.batchStart) / 1000) * ((100 - pct) / Math.max(pct, 1));
  const left = !running ? t('Pausiert') : pct >= 3 && Date.now() - st.batchStart > 5000 ? (sec < 60 ? t('noch < 1 Min') : st.s.lang === 'en' ? (sec < 5400 ? `~${Math.round(sec / 60)} min left` : `~${(sec / 3600).toFixed(1)} h left`) : sec < 5400 ? `noch ~${Math.round(sec / 60)} Min` : `noch ~${(sec / 3600).toFixed(1)} Std`) : '';
  $('#batch-txt').textContent = [`${b.filter((i) => i.status === 'done').length}/${b.length}`, `${Math.round(pct)}%`, left].filter(Boolean).join(' · ');
}

function renderSummary() {
  const all = [...st.items.values()];
  const count = (s) => all.filter((i) => i.status === s).length;
  const bps = all.reduce((a, i) => a + (i.status === 'active' ? i.speed || 0 : 0), 0);
  const parts = [count('active') && `${count('active')} ${t('aktiv')}`, count('queued') && `${count('queued')} ${t('wartend')}`, count('paused') && `${count('paused')} ${t('pausiert')}`, bps && speed(bps)];
  $('#summary').textContent = parts.filter(Boolean).join(' · ');
  $('#qempty').hidden = all.length > 0;
  $('#qfilter').hidden = all.length < 6;
  renderStats(all);
  renderBatch(all);
  $('#clear').hidden = !all.some((i) => !['active', 'queued', 'paused'].includes(i.status));
}

api.onQueue((patches) => {
  for (const p of patches) {
    if (p.removed) {
      st.items.delete(p.id);
      st.rows.get(p.id)?.remove();
      st.rows.delete(p.id);
    } else upsert(p);
  }
  renderSummary();
  if (patches.some((p) => p.status === 'done')) refreshDisk();
});

$('#qlist').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const id = b.closest('.qrow').dataset.id;
  const act = { cancel: api.cancel, pause: api.pause, resume: api.resume, retry: api.retry, remove: api.remove, open: api.open, show: api.show }[b.dataset.act];
  act(id);
});
$('#clear').onclick = () => api.clear();
$('#pause-all').onclick = (e) => (e.currentTarget.dataset.mode === 'pause' ? api.pauseAll() : api.resumeAll());
$('#cancel-all').onclick = () => api.cancelAll();

const refilter = () => st.rows.forEach((el, id) => patchRow(el, st.items.get(id)));
$('#qsearch').addEventListener('input', refilter);

function seg(el, opts, cur, pick) {
  el.innerHTML = opts.map((o) => `<button data-v="${o.v}" class="${String(o.v) === String(cur) ? 'on' : ''}">${esc(t(String(o.l)))}</button>`).join('');
  el.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    pick(b.dataset.v);
    seg(el, opts, b.dataset.v, pick);
  };
}

const save = async (patch) => {
  st.s = await api.set(patch);
  applyTheme(st.s.theme);
  if ('lang' in patch) applyLang();
};

const flag = (b) => (b ? 'on' : 'off');
function fillSettings() {
  const s = st.s;
  const row = (sel, opts, key, show = String, conv = (v) => v) => seg($(sel), opts, show(s[key]), (v) => save({ [key]: conv(v) }));
  $('#s-dir').textContent = s.dir;
  row('#s-quality', QUALITY, 'quality');
  row('#s-parallel', [1, 2, 3, 4].map((n) => ({ v: n, l: n })), 'parallel', String, Number);
  row('#s-theme', Object.entries(THEMES).map(([v, th]) => ({ v, l: th.label })), 'theme');
  row('#s-lang', [{ v: 'de', l: 'Deutsch' }, { v: 'en', l: 'English' }], 'lang');
  row('#s-audio', ['mp3', 'm4a', 'flac', 'opus'].map((v) => ({ v, l: v.toUpperCase() })), 'audio');
  row('#s-subs', ONOFF, 'subs', flag, (v) => v === 'on');
  row('#s-chapters', ONOFF, 'chapters', flag, (v) => v === 'on');
  row('#s-folders', [{ v: 'flat', l: 'Flach' }, { v: 'sorted', l: 'Sortiert' }], 'folders');
  row('#s-limit', [0, 1, 2, 5, 10].map((n) => ({ v: n, l: n || '∞' })), 'limit', String, Number);
  row('#s-norm', ONOFF, 'normalize', flag, (v) => v === 'on');
  row('#s-notify', ONOFF, 'notify', flag, (v) => v === 'on');
  row('#s-after', ONOFF, 'after', (v) => (v === 'shutdown' ? 'on' : 'off'), (v) => (v === 'on' ? 'shutdown' : 'none'));
  row('#s-cookies', [{ v: 'none', l: 'Aus' }, { v: 'chrome', l: 'Chrome' }, { v: 'edge', l: 'Edge' }, { v: 'firefox', l: 'Firefox' }, { v: 'brave', l: 'Brave' }], 'cookies');
  $('#s-id').value = s.spotifyId;
  $('#s-secret').value = '';
  $('#s-secret').placeholder = t(s.spotifySecret ? 'Secret gespeichert' : 'Client-Secret');
}

async function openSettings() {
  $('#settings').hidden = false;
  fillSettings();
  $('#s-ver').textContent = (await api.version()) || t('nicht gefunden');
}

function applyLang() {
  document.documentElement.lang = st.s.lang;
  translateStatic();
  applyTheme(st.s.theme);
  seg($('#qplat'), [{ v: 'all', l: 'Alle' }, { v: 'youtube', l: 'YouTube' }, { v: 'spotify', l: 'Spotify' }], st.plat, setPlat);
  rebuildRows();
  renderResult();
  renderSummary();
  refreshDisk();
  if (!$('#settings').hidden) fillSettings();
}

function setPlat(v) {
  st.plat = v;
  refilter();
}

$('#settings-btn').onclick = openSettings;
async function closeSettings() {
  if ($('#settings').hidden) return;
  $('#settings').hidden = true;
  const id = $('#s-id').value.trim();
  if ($('#s-secret').value || id !== st.s.spotifyId) await save({ spotifyId: id, spotifySecret: $('#s-secret').value });
}
$('#s-close').onclick = closeSettings;
$('#settings').addEventListener('mousedown', (e) => e.target === e.currentTarget && closeSettings());
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeSettings());
$('#s-dir-btn').onclick = async () => {
  st.s = await api.pickDir();
  $('#s-dir').textContent = st.s.dir;
  refreshDisk();
};
$('#s-update').onclick = async (e) => {
  e.target.disabled = true;
  $('#s-ver').textContent = t('Suche Update …');
  $('#s-ver').textContent = (await api.update()) || t('nicht gefunden');
  e.target.disabled = false;
};
$('#s-spot-save').onclick = async () => {
  await save({ spotifyId: $('#s-id').value.trim(), spotifySecret: $('#s-secret').value });
  $('#s-secret').value = '';
  $('#s-secret').placeholder = t(st.s.spotifySecret ? 'Secret gespeichert' : 'Client-Secret');
  toast(t(st.s.spotifySecret ? 'Spotify-Zugang gespeichert' : 'Spotify-Zugang entfernt'));
};
$('#folder-btn').onclick = () => api.openFolder();
$('#theme-btn').onclick = () => save({ theme: st.s.theme === 'aurora' ? 'terminal' : 'aurora' });

document.querySelectorAll('[data-win]').forEach((b) => (b.onclick = () => api.win(b.dataset.win)));
api.onMaximized((m) => {
  $('#max-ico').innerHTML = m ? '<path d="M2.5 2.5V.5h7v7h-2"/><rect x=".5" y="2.5" width="7" height="7"/>' : '<rect x=".5" y=".5" width="9" height="9"/>';
});

api.onShutdown((secs) => {
  st.sd = secs;
  $('#shutdown').hidden = false;
  const tick = () => {
    $('#sd-text').textContent = st.s.lang === 'en' ? `The PC shuts down in ${st.sd} seconds. Press the button to cancel.` : `Der PC fährt in ${st.sd} Sekunden herunter. Mit dem Button brichst du ab.`;
    if (st.sd-- <= 0 || $('#shutdown').hidden) clearInterval(st.sdTimer);
  };
  clearInterval(st.sdTimer);
  st.sdTimer = setInterval(tick, 1000);
  tick();
});
$('#sd-cancel').onclick = () => {
  api.cancelShutdown();
  clearInterval(st.sdTimer);
  $('#shutdown').hidden = true;
};

const input = $('#url');
input.addEventListener('input', () => {
  setPlatform(platformOf(input.value));
  msg();
});
input.addEventListener('keydown', (e) => e.key === 'Enter' && resolve(input.value));

function submitText(text) {
  const n = (text.match(/https?:\/\/[^\s]+/g) || []).filter(platformOf).length;
  input.value = n > 1 ? `${n} ${t('Links aus der Zwischenablage')}` : text.trim();
  setPlatform(platformOf(text));
  resolve(text);
}

input.addEventListener('paste', (e) => {
  const text = e.clipboardData.getData('text');
  if (!platformOf(text)) return;
  e.preventDefault();
  submitText(text);
});
$('#go').onclick = () => resolve(input.value);
$('#paste').onclick = async () => {
  const u = await api.clipboard();
  if (!u) return msg('In der Zwischenablage ist kein YouTube- oder Spotify-Link.', true);
  submitText(u);
};

async function takeClipboard() {
  if (input.value || st.result || st.busy) return;
  const u = await api.clipboard();
  if (!u || u === st.clip) return;
  st.clip = u;
  submitText(u);
}
api.onFocus(takeClipboard);

api.onSetup((p) => {
  const box = $('#setup');
  if (p.done) return void (box.hidden = true);
  box.hidden = false;
  if (p.error) {
    $('#setup-err').hidden = $('#setup-retry').hidden = false;
    $('#setup-err').textContent = p.error;
  } else if (p.pct !== undefined) $('#setup-bar').style.width = `${Math.round(p.pct * 100)}%`;
});
$('#setup-retry').onclick = () => {
  $('#setup-err').hidden = $('#setup-retry').hidden = true;
  api.retrySetup().catch(() => {});
};

(async () => {
  const init = await api.init();
  st.s = init.settings;
  st.sel = st.s.quality;
  setPlatform('');
  init.queue.sort((a, b) => a.addedAt - b.addedAt).forEach(upsert);
  applyLang();
  if (!init.ready) $('#setup').hidden = false;
  api.version().then((v) => ($('#ver').textContent = v ? `yt-dlp ${v}` : ''));
  takeClipboard();
})();
