const test = require('node:test');
const assert = require('node:assert/strict');
const { parseUrl, findUrl } = require('../lib/url');
const { bestMatch, videoSelector } = require('../lib/engine');

test('YouTube-Varianten', () => {
  for (const u of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5', 'https://youtu.be/dQw4w9WgXcQ?si=x', 'https://youtube.com/shorts/dQw4w9WgXcQ', 'https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDAMVMdQw4w9WgXcQ']) {
    assert.deepEqual(parseUrl(u), { platform: 'youtube', kind: 'video', id: 'dQw4w9WgXcQ', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  }
});

test('Playlists und Kanäle', () => {
  assert.equal(parseUrl('https://www.youtube.com/playlist?list=PLabcdefghij123').kind, 'playlist');
  assert.equal(parseUrl('https://www.youtube.com/@blender').url, 'https://www.youtube.com/@blender/videos');
  assert.equal(parseUrl('https://www.youtube.com/watch?list=RDabcdefghijk'), null);
});

test('Spotify', () => {
  const p = parseUrl('https://open.spotify.com/intl-de/track/0VjIjW4GlUZAMYd2vXMi3b?si=abc');
  assert.deepEqual(p, { platform: 'spotify', kind: 'track', id: '0VjIjW4GlUZAMYd2vXMi3b', url: 'https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b' });
  assert.equal(parseUrl('https://open.spotify.com/album/1234567890abc').kind, 'album');
});

test('ungültige Eingaben', () => {
  for (const u of ['', 'foo', 'file:///c:/x', 'https://evil.com/watch?v=dQw4w9WgXcQ', '--exec calc', 'https://www.youtube.com/']) assert.equal(parseUrl(u), null);
});

test('Link in Text finden', () => {
  assert.equal(findUrl('schau mal (https://youtu.be/dQw4w9WgXcQ).').id, 'dQw4w9WgXcQ');
  assert.equal(findUrl('nichts'), null);
});

test('Spotify-Match bevorzugt Topic/Dauer', () => {
  const best = bestMatch(
    [
      { id: 'a', title: 'Song (Official Video)', uploader: 'Band', duration: 260 },
      { id: 'b', title: 'Song', uploader: 'Band - Topic', duration: 201 },
      { id: 'c', title: 'Song (Live)', uploader: 'x', duration: 200 },
    ],
    { artist: 'Band', title: 'Song', seconds: 200 }
  );
  assert.equal(best.id, 'b');
});

test('Formatwahl', () => {
  assert.match(videoSelector(1080), /height<=1080/);
  assert.doesNotMatch(videoSelector(null), /height/);
});

test('Mehrere Links aus der Zwischenablage', () => {
  const { findUrls } = require('../lib/url');
  const text = 'https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b\nhttps://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b?si=1\nhttps://open.spotify.com/track/3zOYmiNOuyDL0ClxJcEJ0T';
  assert.equal(findUrls(text).length, 2);
});
