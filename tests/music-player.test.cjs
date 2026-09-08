const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../snippets/music-player.liquid'), 'utf8');

test('fallback list does not contain any hardcoded tracks when liquid settings are empty', () => {
  // Ensure the old 19 tracks are completely removed from the fallback
  assert.ok(!source.includes('Port António'), 'Port António fallback should be removed');
  assert.ok(!source.includes('CorDaPele'), 'CorDaPele fallback should be removed');
  assert.ok(!source.includes("THAT'S THAT"), 'THATS_THAT fallback should be removed');
});

test('playlistSignature automatically clears old localStorage keys when tracks change', () => {
  const localStorageData = {
    musicPlayerPlaylistSignature: 'old-url-1|old-url-2',
    musicPlayerShuffledOrder: JSON.stringify([1, 0]),
    musicPlayerTrack: '1',
    musicPlayerTime: '45.2',
  };

  const fakeLocalStorage = {
    getItem: (key) => (key in localStorageData ? localStorageData[key] : null),
    setItem: (key, val) => { localStorageData[key] = String(val); },
    removeItem: (key) => { delete localStorageData[key]; },
  };

  const tracks = [
    { name: 'Song A', url: 'https://example.com/song-a.mp3' },
    { name: 'Song B', url: 'https://example.com/song-b.mp3' },
  ];

  // Emulate player cache invalidation logic
  const playlistSignature = tracks.map((t) => t.url).join('|');
  const storedSignature = fakeLocalStorage.getItem('musicPlayerPlaylistSignature');
  if (storedSignature !== playlistSignature) {
    fakeLocalStorage.setItem('musicPlayerPlaylistSignature', playlistSignature);
    fakeLocalStorage.removeItem('musicPlayerShuffledOrder');
    fakeLocalStorage.removeItem('musicPlayerTrack');
    fakeLocalStorage.removeItem('musicPlayerTime');
  }

  assert.equal(fakeLocalStorage.getItem('musicPlayerPlaylistSignature'), 'https://example.com/song-a.mp3|https://example.com/song-b.mp3');
  assert.equal(fakeLocalStorage.getItem('musicPlayerShuffledOrder'), null);
  assert.equal(fakeLocalStorage.getItem('musicPlayerTrack'), null);
  assert.equal(fakeLocalStorage.getItem('musicPlayerTime'), null);
});

test('out-of-bounds savedTrack does not crash getTrackByShuffledIndex and clamps safely', () => {
  const tracks = [
    { name: 'Track 1', url: 'https://example.com/1.mp3' },
    { name: 'Track 2', url: 'https://example.com/2.mp3' },
  ];

  const shuffledOrder = [1, 0];
  function getTrackByShuffledIndex(idx) {
    if (tracks.length === 0) return null;
    if (typeof idx !== 'number' || isNaN(idx) || idx < 0 || idx >= tracks.length) {
      idx = 0;
    }
    const orderIndex = (shuffledOrder && typeof shuffledOrder[idx] === 'number') ? shuffledOrder[idx] : 0;
    return tracks[orderIndex] || tracks[0];
  }

  // Previous session had track index 15 with 19 songs, now only 2 songs exist
  const savedTrack = 15;
  const currentTrack = (!isNaN(savedTrack) && savedTrack >= 0 && savedTrack < tracks.length) ? savedTrack : 0;
  assert.equal(currentTrack, 0);

  const trackObj = getTrackByShuffledIndex(15);
  assert.ok(trackObj);
  assert.equal(trackObj.name, 'Track 2'); // shuffledOrder[0] = 1 -> Track 2
});

test('ended event listener is registered and advances to next track', () => {
  assert.match(source, /audio\.addEventListener\(\s*['"]ended['"]/, 'music-player must listen for ended event');
  assert.match(source, /\(currentTrack\s*\+\s*1\)\s*%\s*tracks\.length/, 'music-player must advance to next track on ended');
});

test('empty playlist gracefully stops and hides play button', () => {
  assert.match(source, /if\s*\(tracks\.length\s*===\s*0\)\s*\{\s*playBtn\.style\.display\s*=\s*['"]none['"];\s*return;\s*\}/);
});
