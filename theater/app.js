'use strict';
/* Bühnenton – Töne fürs Theater.
   Alles läuft auf dem Gerät: Tondateien liegen in IndexedDB, die App selbst im Service-Worker-Cache. */

const APP_VERSION = 8;

/* ===================== Helfer ===================== */
const $ = (s, el = document) => el.querySelector(s);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  addKids(el, kids);
  return el;
}
function addKids(el, kids) {
  for (const c of kids) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) addKids(el, c);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const baseName = (n) => String(n || '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_]+/g, ' ').trim();
const mb = (b) => (b / 1048576 < 10 ? (b / 1048576).toFixed(1) : Math.round(b / 1048576)) + ' MB';
function fmt(s) { // 0:00.0
  const t = Math.round(Math.max(0, s || 0) * 10);
  const m = Math.floor(t / 600), r = (t % 600) / 10;
  return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1);
}
function fmt2(s) { // 0:00.00
  const t = Math.round(Math.max(0, s || 0) * 100);
  const m = Math.floor(t / 6000), r = (t % 6000) / 100;
  return m + ':' + (r < 10 ? '0' : '') + r.toFixed(2);
}
const secs = (v) => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',') + ' s';

const ICONS = {
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><rect x="5" y="4" width="5" height="16" rx="1.5"/><rect x="14" y="4" width="5" height="16" rx="1.5"/></svg>',
  fade: '<svg viewBox="0 0 24 24"><path d="M2.5 5.5 21.5 19H2.5z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M10.8 3.5h2.4v7.3h7.3v2.4h-7.3v7.3h-2.4v-7.3H3.5v-2.4h7.3z"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="3" height="14" rx="1"/><path d="M20 5v14L8.5 12z"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M4 5v14l11.5-7z"/><rect x="17" y="5" width="3" height="14" rx="1"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M16 4.5v15L5.5 12z"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M8 4.5v15L18.5 12z"/></svg>',
  loop: '<svg viewBox="0 0 24 24"><path d="M17 3l4 4-4 4M3 11V9a2 2 0 0 1 2-2h16M7 21l-4-4 4-4M21 13v2a2 2 0 0 1-2 2H3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  pen: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  grip: '<svg viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.8"/><circle cx="15" cy="6" r="1.8"/><circle cx="9" cy="12" r="1.8"/><circle cx="15" cy="12" r="1.8"/><circle cx="9" cy="18" r="1.8"/><circle cx="15" cy="18" r="1.8"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><path d="M4 7h9M18 7h2M4 17h3M12 17h8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="15.5" cy="7" r="2.6" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="9.5" cy="17" r="2.6" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>',
  multi: '<svg viewBox="0 0 24 24"><path d="M12 3v11M7.5 9.5 12 14l4.5-4.5M4 19h16" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

/* Farben: dot = Auswahlpunkt, bg = Kasten, ink = Schrift/Wellenform */
const COLORS = {
  red: { dot: '#ff3b30', bg: '#c25e69', ink: '#690916' },
  orange: { dot: '#ff9500', bg: '#c48a5c', ink: '#6f3400' },
  yellow: { dot: '#ffcc00', bg: '#c9b45a', ink: '#544300' },
  green: { dot: '#34c759', bg: '#67ad5e', ink: '#12570d' },
  cyan: { dot: '#32ade6', bg: '#5ea8ba', ink: '#09495e' },
  blue: { dot: '#0a5cff', bg: '#6584c7', ink: '#0f2a72' },
  purple: { dot: '#af52de', bg: '#9b76c5', ink: '#3f126a' },
  light: { dot: '#d1d1d6', bg: '#b7b7ba', ink: '#353537' },
  dark: { dot: '#545458', bg: '#707075', ink: '#141416' },
};
const col = (k) => COLORS[k] || COLORS.green;

function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.tm);
  toast.tm = setTimeout(() => t.classList.remove('show'), ms);
}
function busy(text) {
  const label = h('div', null, text);
  const el = h('div', { class: 'busy' }, h('div', { class: 'spin' }), label);
  document.body.appendChild(el);
  return { set: (s) => { label.textContent = s; }, done: () => el.remove() };
}

/* ===================== Speicher (IndexedDB) ===================== */
let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((res, rej) => {
      const r = indexedDB.open('buehnenton', 2);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        if (!d.objectStoreNames.contains('audio')) d.createObjectStore('audio', { keyPath: 'id' }); // Infos (Name, Länge, Wellenform)
        if (!d.objectStoreNames.contains('data')) d.createObjectStore('data');                       // Tondaten als ArrayBuffer
      };
      r.onblocked = () => toast('Bitte Bühnenton in anderen Fenstern/Tabs schließen.', 6000);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  return dbPromise;
}
function idb(store, mode, fn) {
  return db().then((d) => new Promise((res, rej) => {
    const tx = d.transaction(store, mode);
    let result;
    const r = fn(tx.objectStore(store));
    if (r && 'onsuccess' in r) r.onsuccess = () => { result = r.result; };
    tx.oncomplete = () => res(result);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error || new Error('Speichern abgebrochen'));
  }));
}
const idbGet = (s, k) => idb(s, 'readonly', (st) => st.get(k));
const idbAll = (s) => idb(s, 'readonly', (st) => st.getAll());
const idbPut = (s, v, k) => idb(s, 'readwrite', (st) => (k === undefined ? st.put(v) : st.put(v, k)));
const idbDel = (s, k) => idb(s, 'readwrite', (st) => st.delete(k));
const idbKeys = (s) => idb(s, 'readonly', (st) => st.getAllKeys());
/* Tondaten lesen: neues Format (ArrayBuffer in „data“), sonst altes Format (Blob im Info-Eintrag) */
async function readAudioData(id) {
  const ab = await idbGet('data', id);
  if (ab) return ab;
  const rec = await idbGet('audio', id);
  if (rec && rec.blob) return rec.blob.arrayBuffer();
  return null;
}

/* ===================== Zustand ===================== */
const defaultSettings = () => ({ fadeAll: 3, instant: false, keepAwake: true, cueMode: false, cueFadePrev: false });
let state = { folders: [], activeFolder: null, settings: defaultSettings() };
const audioMeta = new Map(); // id -> {id,name,type,size,duration,peaks,peakMax}
const missingAudio = new Map(); // id -> Dateiname: Info vorhanden, Tondaten verloren
let editMode = false;

const newFolder = (name) => ({ id: uid(), name, size: 'M', tiles: [] });
function newTile(folder) {
  const last = folder && folder.tiles[folder.tiles.length - 1];
  return { id: uid(), name: '', audioId: null, color: last ? last.color : 'green', volume: 1, fadeIn: 0, fadeOut: 0,
    start: 0, end: null, loop: false, solo: false, hold: false };
}
const activeFolder = () => state.folders.find((f) => f.id === state.activeFolder) || state.folders[0];
const folderById = (id) => state.folders.find((f) => f.id === id);
const folderOfTile = (tileId) => state.folders.find((f) => f.tiles.some((t) => t.id === tileId));

let saveTimer = 0, dirty = false, myRev = 0, conflictShown = false;
function save() {
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 200);
}
function flushSave() {
  clearTimeout(saveTimer);
  if (!dirty) return Promise.resolve();
  const snapshot = JSON.parse(JSON.stringify(state));
  return db().then((d) => new Promise((res, rej) => {
    const tx = d.transaction('kv', 'readwrite'), st = tx.objectStore('kv');
    let conflict = false;
    const g = st.get('state');
    g.onsuccess = () => {
      const cur = g.result;
      if (cur && (cur.rev || 0) > myRev) { conflict = true; return; } // anderes Fenster hat inzwischen gespeichert
      snapshot.rev = myRev + 1;
      st.put(snapshot, 'state');
    };
    tx.oncomplete = () => {
      if (conflict) onSaveConflict();
      else { myRev = snapshot.rev; state.rev = myRev; dirty = false; }
      res();
    };
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error || new Error('Speichern abgebrochen'));
  })).catch((e) => toast('Speichern fehlgeschlagen: ' + e.message, 5000));
}
function onSaveConflict() {
  if (conflictShown) return;
  conflictShown = true;
  const m = modal({ title: 'Bühnenton ist zweimal offen', small: true, cancel: null, done: 'Neu laden',
    body: h('p', { style: 'font-size:17px;line-height:1.45' }, 'Die App ist noch in einem anderen Fenster oder Tab offen und wurde dort geändert. Damit nichts überschrieben wird, lädt dieses Fenster jetzt den neuesten Stand. Bitte nur ein Fenster benutzen.'),
    onDone: () => { location.reload(); } });
  return m;
}
const metaOf = (r) => ({ id: r.id, name: r.name, type: r.type, size: r.size, duration: r.duration, peaks: r.peaks, peakMax: r.peakMax || 1 });
const infoOf = (r) => ({ id: r.id, name: r.name, type: r.type, size: r.size, duration: r.duration, peaks: r.peaks, peakMax: r.peakMax || 1, added: r.added });

async function load() {
  const s = await idbGet('kv', 'state');
  if (s && Array.isArray(s.folders)) {
    state = { folders: s.folders, activeFolder: s.activeFolder, settings: Object.assign(defaultSettings(), s.settings || {}), rev: s.rev || 0 };
    myRev = s.rev || 0;
  }
  const dataKeys = new Set((await idbKeys('data')) || []);
  for (const r of (await idbAll('audio')) || []) {
    if (!dataKeys.has(r.id) && r.blob) { // Umzug vom alten Speicherformat
      try {
        const ab = await r.blob.arrayBuffer();
        if (ab && ab.byteLength) { await idbPut('data', ab, r.id); dataKeys.add(r.id); await idbPut('audio', infoOf(r)); }
      } catch (e) { /* Blob nicht mehr lesbar */ }
    }
    if (dataKeys.has(r.id)) audioMeta.set(r.id, metaOf(r));
    else missingAudio.set(r.id, r.name);
  }
  if (!state.folders.length) state.folders.push(newFolder('Vorstellung'));
  if (!folderById(state.activeFolder)) state.activeFolder = state.folders[0].id;
}

/* ===================== Audio-Grundlagen ===================== */
/* iPad/iPhone: Nach einem App-Wechsel (Fotos, Dateien, andere App, Sperrbildschirm) bleibt der
   Audio-Kontext oft „hängen“ und lässt sich nicht mehr fortsetzen. Dann wird er bei der nächsten
   Berührung einfach neu erzeugt. */
/* Wichtig: iPadOS meldet nach einem App-Wechsel manchmal „running“, obwohl die Audio-Uhr steht
   (kein Ton, keine Zeitanzeige). Deshalb wird nicht dem gemeldeten Zustand vertraut, sondern
   regelmäßig geprüft, ob die Audio-Uhr (currentTime) wirklich weiterläuft. */
let ctx = null, master = null, ctxStuck = false, wasHidden = false;
let ctxBorn = 0, everRan = false, lastCT = -1, lastAdv = 0;
function makeCtx() {
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* ältere Geräte */ }
  const AC = window.AudioContext || window.webkitAudioContext;
  ctx = new AC({ latencyHint: 'interactive' });
  master = ctx.createGain();
  master.connect(ctx.destination);
  ctxStuck = false;
  ctxBorn = performance.now(); everRan = false; lastCT = -1; lastAdv = 0;
}
function sampleCtx() { // merkt sich, wann die Audio-Uhr zuletzt weitergelaufen ist
  if (!ctx) return;
  const ct = ctx.currentTime, now = performance.now();
  if (ct > lastCT + 0.0005) {
    if (lastCT >= 0 || ct > 0) { lastAdv = now; if (ctx.state === 'running') everRan = true; }
    lastCT = ct;
  }
}
setInterval(sampleCtx, 120);
function ctxHealthy() {
  sampleCtx();
  return ctx.state === 'running' && performance.now() - lastAdv < 400;
}
/* Nach dem Start eines Tons prüfen, ob er wirklich läuft. Falls nicht: nicht so tun, als ob,
   sondern Kasten zurücksetzen, Audio beim nächsten Antippen neu starten und Bescheid geben. */
function watchVoice(v) {
  const c = ctx, ct0 = c.currentTime;
  setTimeout(() => {
    if (c !== ctx || v.state === 'done' || v.state === 'paused') return;
    if (c.currentTime - ct0 > 0.1) return; // läuft
    ctxStuck = true;
    for (const o of [...voices.values()]) o.finish();
    try { c.resume(); } catch (e) { /* egal */ }
    toast('Der Ton war vom iPad blockiert – bitte nochmal antippen.', 4000);
  }, 600);
}
function getCtx() {
  if (!ctx || ctx.state === 'closed') makeCtx();
  return ctx;
}
function resetCtx() {
  for (const v of [...voices.values()]) { v.state = 'done'; v.src = null; }
  voices.clear();
  const old = ctx;
  ctx = null;
  try { if (old) old.close(); } catch (e) { /* egal */ }
  makeCtx();
  changed();
}
function ensureCtx() { // aus einer Berührung heraus aufrufen
  getCtx();
  const age = performance.now() - ctxBorn;
  // Neu erzeugen, wenn er blockiert ist – aber nicht, wenn er gerade eben (in dieser Berührung) erzeugt wurde
  const bad = ctx.state === 'interrupted' || ctxStuck || (age > 800 && (wasHidden || everRan) && !ctxHealthy());
  if (bad) resetCtx();
  wasHidden = false;
  if (ctx.state !== 'running') {
    ctx.resume().catch(() => {});
    // stiller Ton: schaltet Audio auf iOS frei
    try {
      const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
      s.buffer = b; s.connect(ctx.destination); s.start(0);
    } catch (e) { /* egal */ }
  }
  return ctx;
}
function decode(ab) {
  const c = getCtx();
  return new Promise((res, rej) => {
    const tm = setTimeout(() => rej(new Error('Zeitüberschreitung beim Lesen')), 30000);
    const ok = (b) => { clearTimeout(tm); res(b); }, bad = (e) => { clearTimeout(tm); rej(e || new Error('decode')); };
    const p = c.decodeAudioData(ab, ok, bad);
    if (p && p.then) p.then(ok, bad);
  });
}

/* Dekodierte Töne im Arbeitsspeicher halten (damit sie sofort starten) */
const bufCache = new Map(); // audioId -> {buf, bytes, used}
const bufLoading = new Map();
const BUF_LIMIT = 380e6;
function putBuf(id, buf) {
  bufCache.set(id, { buf, bytes: buf.length * buf.numberOfChannels * 4, used: performance.now() });
  trimCache();
}
function trimCache() {
  let total = 0;
  for (const c of bufCache.values()) total += c.bytes;
  if (total <= BUF_LIMIT) return;
  const keep = new Set();
  for (const t of activeFolder().tiles) keep.add(t.audioId);
  for (const v of voices.values()) keep.add(v.tile.audioId);
  const list = [...bufCache.entries()].filter(([id]) => !keep.has(id)).sort((a, b) => a[1].used - b[1].used);
  for (const [id, c] of list) {
    if (total <= BUF_LIMIT) break;
    bufCache.delete(id);
    total -= c.bytes;
  }
}
function getBuffer(id) {
  const c = bufCache.get(id);
  if (c) { c.used = performance.now(); return Promise.resolve(c.buf); }
  if (bufLoading.has(id)) return bufLoading.get(id);
  const p = (async () => {
    const ab = await readAudioData(id);
    if (!ab) throw new Error('Tondatei fehlt');
    const buf = await decode(ab);
    putBuf(id, buf);
    return buf;
  })();
  bufLoading.set(id, p);
  p.then(() => bufLoading.delete(id), () => bufLoading.delete(id));
  return p;
}
let preloadGen = 0;
async function preloadFolder(f) {
  const gen = ++preloadGen;
  for (const t of f.tiles) {
    if (gen !== preloadGen) return;
    if (t.audioId && audioMeta.has(t.audioId)) { try { await getBuffer(t.audioId); } catch (e) { /* später */ } }
  }
}

function computePeaks(buf, n) {
  const len = buf.length, chans = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
  const out = new Float32Array(n);
  let max = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * len / n), b = Math.max(a + 1, Math.floor((i + 1) * len / n));
    let m = 0;
    for (const d of chans) for (let j = a; j < b && j < len; j++) { const v = d[j] < 0 ? -d[j] : d[j]; if (v > m) m = v; }
    out[i] = m;
    if (m > max) max = m;
  }
  return { data: out, max: max || 1 };
}
const hiPeakCache = new Map();
function hiPeaks(id, buf) {
  if (hiPeakCache.has(id)) return hiPeakCache.get(id);
  const n = Math.max(200, Math.min(60000, Math.ceil(buf.length / 64)));
  const p = computePeaks(buf, n);
  const r = { data: p.data, perSec: n / buf.duration, scale: 0.92 / p.max };
  hiPeakCache.set(id, r);
  return r;
}

/* Zeichnet eine Wellenform in den Zeitbereich v0..v1 */
function paintPeaks(g, data, perSec, v0, v1, w, hgt, rs, re, ink, dim, scale) {
  const n = data.length, mid = hgt / 2, span = v1 - v0;
  const pIn = new Path2D(), pOut = new Path2D();
  for (let x = 0; x < w; x++) {
    const ta = v0 + (x / w) * span, tb = v0 + ((x + 1) / w) * span;
    let a = Math.floor(ta * perSec), b = Math.max(a + 1, Math.ceil(tb * perSec));
    if (a >= n) break;
    if (b > n) b = n;
    let m = 0;
    for (let i = Math.max(0, a); i < b; i++) if (data[i] > m) m = data[i];
    const y = Math.max(0.5, m * scale * mid);
    const t = (ta + tb) / 2;
    (t >= rs && t <= re ? pIn : pOut).rect(x, mid - y, 1, 2 * y);
  }
  g.fillStyle = dim; g.fill(pOut);
  g.fillStyle = ink; g.fill(pIn);
  g.fillStyle = ink; g.globalAlpha = 0.6; g.fillRect(0, Math.round(mid) - 0.5, w, 1); g.globalAlpha = 1;
}
function setupCanvas(cv) {
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, hh = cv.clientHeight;
  if (!w || !hh) return null;
  const W = Math.round(w * dpr), H = Math.round(hh * dpr);
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, hh);
  return { g, w, h: hh };
}

function region(t, dur) {
  const s = clamp(+t.start || 0, 0, Math.max(0, dur - 0.02));
  const e = t.end == null ? dur : clamp(+t.end, s + 0.02, dur);
  return { start: s, end: e };
}
const volGain = (v) => { const x = clamp(+v, 0, 1); return x * x; }; // gehörrichtiger Regler

/* ===================== Wiedergabe ===================== */
const voices = new Map(); // tileId (oder 'preview') -> Voice
const held = new Set();   // Kästen mit „Nur solange gedrückt“, die gerade gehalten werden
const pending = new Set();
let startGen = 0;

function valAt(p, t) {
  if (!p.length) return 0;
  if (t <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) {
    if (t <= p[i][0]) {
      const [t0, v0] = p[i - 1], [t1, v1] = p[i];
      return t1 > t0 ? v0 + (v1 - v0) * (t - t0) / (t1 - t0) : v1;
    }
  }
  return p[p.length - 1][1];
}

class Voice {
  constructor(key, tile, buf) {
    this.key = key; this.tile = tile; this.buf = buf; this.state = 'idle'; this.src = null; this.points = [[0, 0]];
    const r = region(tile, buf.duration);
    this.rs = r.start; this.re = r.end; this.loop = !!tile.loop;
    this.env = ctx.createGain(); this.env.gain.value = 0;
    this.vol = ctx.createGain(); this.vol.gain.value = volGain(tile.volume);
    this.env.connect(this.vol); this.vol.connect(master);
  }
  play(pos, fadeIn) {
    const now = ctx.currentTime + 0.01;
    const src = ctx.createBufferSource();
    src.buffer = this.buf;
    src.connect(this.env);
    if (this.loop) { src.loop = true; src.loopStart = this.rs; src.loopEnd = this.re; src.start(now, pos); }
    else src.start(now, pos, Math.max(0.005, this.re - pos));
    src.onended = () => { if (this.src === src) this.finish(); };
    this.src = src; this.t0 = now; this.p0 = pos; this.state = 'playing';
    let pts = [[now, 0], [now + Math.max(0.006, fadeIn || 0), 1]];
    const fo = +this.tile.fadeOut || 0;
    if (!this.loop && fo > 0) { // automatisches Ausblenden am Ende
      const endT = now + (this.re - pos);
      const fs = Math.max(now + 0.006, endT - fo);
      if (fs < endT) {
        const v = valAt(pts, fs);
        pts = pts.filter((p) => p[0] < fs);
        pts.push([fs, v], [endT, 0]);
      }
    }
    const g = this.env.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(pts[0][1], pts[0][0]);
    for (let i = 1; i < pts.length; i++) g.linearRampToValueAtTime(pts[i][1], pts[i][0]);
    this.points = pts;
  }
  position() {
    if (this.state === 'paused') return this.pausedPos;
    if (this.t0 == null) return this.rs;
    let p = this.p0 + Math.max(0, ctx.currentTime - this.t0);
    if (this.loop) { const L = this.re - this.rs; if (L > 0 && p >= this.re) p = this.rs + ((p - this.rs) % L); }
    else if (p > this.re) p = this.re;
    return p;
  }
  kill() { // ganz kurz abblenden (kein Knacksen) und Quelle anhalten
    const now = ctx.currentTime, g = this.env.gain, v = valAt(this.points, now);
    g.cancelScheduledValues(now); g.setValueAtTime(v, now); g.linearRampToValueAtTime(0, now + 0.02);
    this.points = [[now, v], [now + 0.02, 0]];
    const s = this.src; this.src = null;
    if (s) { try { s.stop(now + 0.03); } catch (e) { /* schon aus */ } }
  }
  fadeOut(d) {
    if (this.state === 'paused' || d <= 0.04) { this.stop(); return; }
    if (this.state !== 'playing' && this.state !== 'fading') return;
    const now = ctx.currentTime;
    if (this.state === 'fading' && this.fadeEnd <= now + d) return; // blendet schon schneller aus
    const g = this.env.gain, v = valAt(this.points, now);
    g.cancelScheduledValues(now); g.setValueAtTime(v, now); g.linearRampToValueAtTime(0, now + d);
    this.points = [[now, v], [now + d, 0]];
    this.fadeEnd = now + d; this.state = 'fading';
    try { this.src.stop(now + d + 0.03); } catch (e) { /* egal */ }
    changed();
  }
  stop() {
    if (this.state === 'done') return;
    if (this.state !== 'paused') this.kill();
    this.finish();
  }
  pause() {
    if (this.state === 'fading') { this.stop(); return; }
    if (this.state !== 'playing') return;
    this.pausedPos = this.position();
    this.kill();
    this.state = 'paused';
  }
  resume() {
    if (this.state !== 'paused') return;
    this.play(this.pausedPos, 0.04);
  }
  finish() {
    if (this.state === 'done') return;
    this.state = 'done';
    const s = this.src; this.src = null;
    if (s) { try { s.stop(); } catch (e) { /* egal */ } }
    setTimeout(() => { try { this.vol.disconnect(); } catch (e) { /* egal */ } }, 250);
    if (voices.get(this.key) === this) voices.delete(this.key);
    changed();
  }
}
const liveVoices = () => [...voices.values()].filter((v) => v.key !== 'preview' && v.key !== 'libprev');

async function startTile(tile) {
  if (!tile.audioId) { toast('Diesem Kasten ist noch kein Ton zugeordnet.'); return; }
  if (!audioMeta.has(tile.audioId)) { toast('Der Ton dieses Kastens fehlt. Bitte unter BEARBEITEN neu auswählen.', 4000); return; }
  if (pending.has(tile.id)) return;
  const gen = startGen;
  pending.add(tile.id); changed();
  let buf;
  try { buf = await getBuffer(tile.audioId); }
  catch (e) { toast('Ton konnte nicht geladen werden.'); return; }
  finally { pending.delete(tile.id); changed(); }
  if (gen !== startGen) return;                    // inzwischen „Stopp“ gedrückt
  if (tile.hold && !held.has(tile.id)) return;     // schon wieder losgelassen
  if (voices.has(tile.id)) return;
  ensureCtx();
  if (tile.solo) {
    const d = tile.fadeIn > 0 ? tile.fadeIn : 0.3;
    for (const o of liveVoices()) o.fadeOut(d);
  }
  const v = new Voice(tile.id, tile, buf);
  voices.set(tile.id, v);
  v.play(v.rs, +tile.fadeIn || 0);
  watchVoice(v);
  changed();
}
function toggleTile(tile) {
  ensureCtx();
  const v = voices.get(tile.id);
  if (!v) {
    if (state.settings.cueMode) { const f = activeFolder(), i = f.tiles.indexOf(tile); if (i >= 0) { cuePos.set(f.id, i + 1); updateCue(); } }
    startTile(tile);
    return;
  }
  if (v.state === 'paused') { v.resume(); watchVoice(v); }
  else if (v.state === 'fading') v.stop();               // während des Ausblendens nochmal tippen = sofort aus
  else if (tile.fadeOut > 0) v.fadeOut(+tile.fadeOut);
  else v.stop();
  changed();
}
function releaseTile(tile) {
  held.delete(tile.id);
  const v = voices.get(tile.id);
  if (!v) return;
  if (tile.fadeOut > 0) v.fadeOut(+tile.fadeOut); else v.stop();
}
function pauseAll() {
  ensureCtx();
  const vs = liveVoices();
  const running = vs.filter((v) => v.state === 'playing' || v.state === 'fading');
  if (running.length) running.forEach((v) => v.pause());
  else vs.filter((v) => v.state === 'paused').forEach((v) => { v.resume(); watchVoice(v); });
  changed();
}
function stopAll() {
  startGen++;
  held.clear();
  liveVoices().forEach((v) => v.stop());
  changed();
}
/* ---------- Ein-Knopf-Modus: WEITER spielt die Kästen des Ordners der Reihe nach ---------- */
const cuePos = new Map(); // Ordner-ID -> Index des nächsten Kastens
const cueIndex = (f) => clamp(cuePos.get(f.id) || 0, 0, f.tiles.length);
function cueGo() {
  const f = activeFolder();
  let i = cueIndex(f);
  while (i < f.tiles.length && !audioMeta.has(f.tiles[i].audioId)) i++; // Kästen ohne Ton überspringen
  if (i >= f.tiles.length) { cuePos.set(f.id, f.tiles.length); updateCue(); toast('Ende der Liste erreicht – „Von vorn“ startet wieder bei 1.'); return; }
  ensureCtx();
  const tile = f.tiles[i];
  if (state.settings.cueFadePrev) {
    for (const v of liveVoices()) if (v.key !== tile.id) v.fadeOut(Math.max(0.5, +v.tile.fadeOut || 0));
  }
  const old = voices.get(tile.id);
  if (old) old.stop();
  startTile(tile);
  cuePos.set(f.id, i + 1);
  updateCue();
}
function cueStep(d) {
  const f = activeFolder();
  cuePos.set(f.id, clamp(cueIndex(f) + d, 0, f.tiles.length));
  updateCue();
}
function updateCue() {
  const bar = $('#cuebar');
  const f = activeFolder();
  const i = cueIndex(f);
  document.querySelectorAll('.tile.cue-next').forEach((n) => n.classList.remove('cue-next'));
  if (!bar) return;
  const t = f.tiles[i];
  const ref = t && tileRefs.get(t.id);
  if (ref) ref.el.classList.add('cue-next');
  $('.cue-what', bar).textContent = t ? (i + 1) + ' · ' + (t.name || 'Ohne Namen') : 'Ende der Liste';
  $('.cue-go', bar).classList.toggle('end', !t);
}
function renderCueBar() {
  const old = $('#cuebar');
  if (old) old.remove();
  document.body.classList.toggle('cue', !editMode && !!state.settings.cueMode);
  if (editMode || !state.settings.cueMode) return;
  const bar = h('div', { id: 'cuebar' },
    h('button', { class: 'cue-nav', title: 'Zurück (Pfeil links)', html: ICONS.left, onclick: () => cueStep(-1) }),
    h('button', { class: 'cue-go', title: 'Nächster Ton (Leertaste)', onclick: cueGo },
      h('span', { class: 'cue-ic', html: ICONS.play }), h('span', { class: 'cue-lbl' }, 'WEITER'), h('span', { class: 'cue-what' })),
    h('button', { class: 'cue-nav', title: 'Überspringen (Pfeil rechts)', html: ICONS.right, onclick: () => cueStep(1) }),
    h('button', { class: 'cue-reset', onclick: () => { cuePos.set(activeFolder().id, 0); updateCue(); } }, 'Von vorn'));
  document.body.appendChild(bar);
  updateCue();
}

function fadeAll() {
  ensureCtx();
  startGen++;
  liveVoices().forEach((v) => v.fadeOut(state.settings.fadeAll));
  changed();
}

/* ===================== Anzeige aktualisieren ===================== */
const tileRefs = new Map(); // tileId -> {el, prog, elp, rem, tile}
const uiHooks = new Set();
let rafOn = false;
function changed() {
  updateStatus();
  uiHooks.forEach((f) => f());
  if (!rafOn) { rafOn = true; requestAnimationFrame(tick); }
}
function tick() {
  for (const [id, ref] of tileRefs) updateTileRef(ref, voices.get(id));
  uiHooks.forEach((f) => f());
  if (voices.size || pending.size) requestAnimationFrame(tick);
  else rafOn = false;
}
function updateTileRef(ref, v) {
  const loading = pending.has(ref.tile.id);
  const st = v ? v.state : (loading ? 'loading' : 'idle');
  if (ref.st !== st) {
    ref.el.classList.remove('playing', 'fading', 'paused', 'loading');
    if (st !== 'idle' && st !== 'done') ref.el.classList.add(st);
    ref.st = st;
    ref.ic.innerHTML = st === 'paused' ? ICONS.pause : st === 'fading' ? ICONS.fade : st === 'playing' ? ICONS.play : '';
  }
  if (!v || v.state === 'done') {
    if (ref.on) {
      ref.on = false;
      ref.prog.style.transform = 'scaleX(0)';
      ref.elp.textContent = '0:00.0';
      ref.rem.textContent = ref.idleRem;
    }
    return;
  }
  ref.on = true;
  const p = v.position(), len = v.re - v.rs;
  ref.prog.style.transform = 'scaleX(' + (len > 0 ? clamp((p - v.rs) / len, 0, 1) : 0) + ')';
  ref.elp.textContent = fmt(p - v.rs);
  ref.rem.textContent = '-' + fmt(v.re - p);
}
function updateStatus() {
  const live = liveVoices();
  const pb = $('.b-pause');
  if (pb) {
    const pausedOnly = live.length && !live.some((v) => v.state === 'playing' || v.state === 'fading');
    pb.classList.toggle('active', !!pausedOnly);
    $('.cl', pb).textContent = pausedOnly ? 'Weiter' : 'Pause';
    $('.ci', pb).innerHTML = pausedOnly ? ICONS.play : ICONS.pause;
  }
  const liveFolders = new Set(live.map((v) => (folderOfTile(v.key) || {}).id));
  document.querySelectorAll('.tab[data-folder]').forEach((b) => b.classList.toggle('live', liveFolders.has(b.dataset.folder)));
}

/* ===================== Oberfläche ===================== */
function render() {
  document.body.classList.toggle('editing', editMode);
  renderTop();
  renderGrid();
  renderCueBar();
}
function ctrlBtn(icon, label, fn, cls) {
  return h('button', { class: 'cbtn ' + (cls || ''), onclick: fn }, h('span', { class: 'ci', html: ICONS[icon] }), h('span', { class: 'cl' }, label));
}
function renderTop() {
  const top = $('#top');
  const old = $('.tabs', top);
  const sl = old ? old.scrollLeft : 0;
  top.textContent = '';
  const tabs = h('div', { class: 'tabs' });
  for (const f of state.folders) {
    const active = f.id === state.activeFolder;
    tabs.appendChild(h('button', { class: 'tab' + (active ? ' active' : ''), 'data-folder': f.id, onclick: () => onTab(f) },
      h('span', { class: 'tab-dot' }), h('span', { class: 'tab-name' }, f.name),
      editMode && active ? h('span', { class: 'tab-edit', html: ICONS.pen }) : null));
  }
  if (editMode) tabs.appendChild(h('button', { class: 'tab tab-add', onclick: addFolder }, '+ Ordner'));
  const mode = h('div', { class: 'mode' },
    h('button', { class: editMode ? '' : 'on', onclick: () => setMode(false) }, 'SPIELEN'),
    h('button', { class: editMode ? 'on' : '', onclick: () => setMode(true) }, 'BEARBEITEN'));
  const ctr = editMode
    ? h('div', { class: 'ctrls' },
      ctrlBtn('plus', 'Kasten', () => openTileDialog(activeFolder(), null), 'b-add'),
      ctrlBtn('multi', 'Mehrere Töne', bulkImport),
      ctrlBtn('gear', 'Einstellungen', openSettings))
    : h('div', { class: 'ctrls' },
      ctrlBtn('pause', 'Pause', pauseAll, 'b-pause'),
      ctrlBtn('stop', 'Alle stoppen', stopAll, 'b-stop'),
      ctrlBtn('fade', 'Ausblenden ' + String(state.settings.fadeAll).replace('.', ',') + ' s', fadeAll, 'b-fade'));
  top.append(tabs, h('div', { class: 'right' }, mode, ctr));
  tabs.scrollLeft = sl;
  const act = $('.tab.active', tabs);
  if (act && !old) act.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  updateStatus();
}
function setMode(m) {
  if (editMode === m) return;
  editMode = m;
  render();
}
function onTab(f) {
  if (f.id !== state.activeFolder) {
    state.activeFolder = f.id;
    save();
    render();
    $('#main').scrollTop = 0;
    preloadFolder(f);
  } else if (editMode) openFolderDialog(f);
}

function renderGrid() {
  const main = $('#main');
  const f = activeFolder();
  const keepScroll = main.scrollTop;
  main.textContent = '';
  tileRefs.clear();
  const grid = h('div', { class: 'grid size-' + (f.size || 'M') });
  for (const t of f.tiles) grid.appendChild(tileEl(t));
  if (editMode) {
    grid.appendChild(h('button', { class: 'tile add-tile', onclick: () => openTileDialog(f, null) },
      h('span', { class: 'plus' }, '+'), h('span', null, 'Kasten hinzufügen')));
  }
  const lost = [];
  for (const fo of state.folders) for (const t of fo.tiles) if (t.audioId && !audioMeta.has(t.audioId)) lost.push({ fo, t });
  if (lost.length) {
    main.appendChild(h('div', { class: 'lostbar' }, h('b', null, lost.length + (lost.length === 1 ? ' Kasten hat' : ' Kästen haben') + ' seinen Ton verloren'),
      ' (' + lost.slice(0, 6).map((x) => '„' + (x.t.name || 'Ohne Namen') + '“' + (x.fo.id !== f.id ? ' in ' + x.fo.name : '')).join(', ') + (lost.length > 6 ? ' …' : '') + '). ',
      'Unter BEARBEITEN den Kasten antippen und den Ton neu auswählen – oder ein Paket öffnen, das diese Töne enthält.'));
  }
  if (editMode && f.tiles.length) main.appendChild(h('p', { class: 'edithint' }, 'Kasten antippen = bearbeiten · Kasten gedrückt halten und ziehen = verschieben (auch auf einen anderen Ordner-Reiter)'));
  main.appendChild(grid);
  if (!f.tiles.length && !editMode) {
    const allEmpty = state.folders.every((x) => !x.tiles.length);
    main.appendChild(h('div', { class: 'empty' },
      allEmpty ? h('div', { class: 'welcome' },
        h('h2', null, 'Willkommen bei Bühnenton'),
        h('p', null, 'Hast du ein Paket (Datei „….buehnenton“) bekommen? Dann hier öffnen – danach sind alle Ordner, Kästen und Töne da.'),
        h('button', { class: 'btn primary big', onclick: importBackup }, 'Paket öffnen'),
        h('p', { class: 'small' }, 'Auf dem iPad: Die Datei vorher z. B. in WhatsApp antippen → Teilen → „In Dateien sichern“.')) : null,
      allEmpty ? 'Oder selbst anfangen: ' : 'In diesem Ordner sind noch keine Kästen. ',
      'Oben rechts auf ', h('b', null, 'BEARBEITEN'), ' und dann auf ', h('b', null, '+ Kasten'), ' oder ', h('b', null, 'Mehrere Töne'), '.'));
  }
  if (!isStandalone() && !localStorage.getItem('bt-hide-install')) {
    const b = h('div', { class: 'banner' }, h('b', null, 'Als App installieren: '),
      isIOS()
        ? 'In Safari unten bzw. oben auf das Teilen-Symbol tippen und „Zum Home-Bildschirm“ wählen. Danach öffnest du Bühnenton über das Symbol auf dem Home-Bildschirm – es funktioniert dann auch ganz ohne WLAN und Internet.'
        : installPrompt
          ? ['Auf „Jetzt installieren“ klicken. Danach startest du Bühnenton wie ein normales Programm (Startmenü/Taskleiste) – es funktioniert dann auch ganz ohne Internet. ',
            h('button', { class: 'btn sm primary', style: 'position:static;width:auto;height:auto;color:#fff;margin-top:8px;display:block', onclick: installApp }, 'Jetzt installieren')]
          : 'In Google Chrome oder Microsoft Edge öffnen und oben rechts in der Adresszeile auf das Symbol „App installieren“ klicken (bei Edge: Menü ··· → Apps → „Diese Website als App installieren“). Danach funktioniert es auch ganz ohne Internet.',
      h('button', { onclick: () => { try { localStorage.setItem('bt-hide-install', '1'); } catch (e) { /* egal */ } b.remove(); } }, '×'));
    main.appendChild(b);
  }
  main.scrollTop = keepScroll;
  for (const [id, ref] of tileRefs) updateTileRef(ref, voices.get(id));
  requestAnimationFrame(drawTileWaves);
  updateStatus();
  updateCue();
}
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let installPrompt = null;
async function installApp() {
  if (!installPrompt) return;
  installPrompt.prompt();
  try { await installPrompt.userChoice; } catch (e) { /* egal */ }
  installPrompt = null;
  renderGrid();
}
function isStandalone() {
  return window.navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
}
function tileEl(t) {
  const c = col(t.color), meta = audioMeta.get(t.audioId);
  const el = h('div', { class: 'tile' + (t.hold && !editMode ? ' hold' : ''), 'data-id': t.id });
  el.style.setProperty('--tbg', c.bg);
  el.style.setProperty('--ink', c.ink);
  const prog = h('div', { class: 'prog' });
  const cv = h('canvas', { class: 'wave' });
  const idleRem = meta ? '-' + fmt(region(t, meta.duration).end - region(t, meta.duration).start) : '';
  const elp = h('span', null, '0:00.0'), rem = h('span', null, idleRem);
  const cueNo = state.settings.cueMode && !editMode ? activeFolder().tiles.indexOf(t) + 1 : 0;
  const badges = h('div', { class: 'badges' },
    cueNo ? h('span', { class: 'badge num' }, String(cueNo)) : null,
    t.loop ? h('span', { class: 'badge', html: ICONS.loop }) : null,
    t.solo ? h('span', { class: 'badge' }, 'S') : null,
    t.hold ? h('span', { class: 'badge' }, 'Halten') : null);
  const stIc = h('div', { class: 'stateic' });
  el.append(prog, stIc, h('div', { class: 'thead' }, t.name || 'Ohne Namen'), badges,
    h('div', { class: 'wwrap' }, meta ? cv : t.audioId ? h('div', { class: 'nofile lost' }, 'Ton fehlt', h('small', null, missingAudio.get(t.audioId) || '')) : h('div', { class: 'nofile' }, 'kein Ton')),
    h('div', { class: 'times' }, elp, rem));
  if (editMode) {
    el.append(h('div', { class: 'grip', html: ICONS.grip }), h('div', { class: 'pen', html: ICONS.pen }));
  }
  if (t.hold && !editMode) el.style.touchAction = 'none';
  el.addEventListener('pointerdown', (e) => onTileDown(e, t, el));
  if (editMode && hasTouch) el.addEventListener('touchstart', (e) => editTouchStart(e, t, el), { passive: true });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  tileRefs.set(t.id, { el, prog, elp, rem, cv, ic: stIc, tile: t, idleRem, st: 'idle', on: false });
  return el;
}
function drawTileWaves() {
  for (const ref of tileRefs.values()) {
    const meta = audioMeta.get(ref.tile.audioId);
    if (!meta || !ref.cv.isConnected) continue;
    const s = setupCanvas(ref.cv);
    if (!s) continue;
    const r = region(ref.tile, meta.duration);
    const peaks = meta.peaks;
    paintPeaks(s.g, peaks, peaks.length / meta.duration, 0, meta.duration, s.w, s.h, r.start, r.end,
      col(ref.tile.color).ink, 'rgba(90,90,90,.75)', 0.92 / (meta.peakMax || 1));
  }
}

/* Berührungen auf Kästen */
function onTileDown(e, t, el) {
  if (e.button > 0) return;
  if (editMode) {
    if (hasTouch && e.pointerType !== 'mouse') return; // Touch läuft über editTouchStart
    editPress(e, t, el);
    return;
  }
  ensureCtx();
  if (t.hold) {
    e.preventDefault();
    held.add(t.id);
    startTile(t);
    const up = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      releaseTile(t);
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return;
  }
  if (state.settings.instant) { toggleTile(t); return; }
  tapDetect(e, () => toggleTile(t));
}
function tapDetect(e, fn) {
  const x = e.clientX, y = e.clientY, id = e.pointerId;
  let ok = true;
  const mv = (ev) => { if (ev.pointerId === id && Math.hypot(ev.clientX - x, ev.clientY - y) > 12) ok = false; };
  const done = (ev) => {
    if (ev.pointerId !== id) return;
    window.removeEventListener('pointermove', mv);
    window.removeEventListener('pointerup', done);
    window.removeEventListener('pointercancel', done);
    if (ev.type === 'pointerup' && ok) fn();
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', done);
  window.addEventListener('pointercancel', done);
}

/* Kästen verschieben (Bearbeiten-Modus):
   kurz antippen = bearbeiten, kurz gedrückt halten und ziehen = verschieben.
   Auf iPad/iPhone mit Touch-Ereignissen (zuverlässiger als Pointer-Ereignisse), mit Maus über Pointer-Ereignisse. */
let dragging = false;
const HOLD_MS = 450;
const hasTouch = 'ontouchstart' in window;

function editTouchStart(e, t, el) {
  if (!editMode || e.touches.length > 1 || dragging) return;
  const c0 = e.changedTouches[0], tid = c0.identifier;
  const x0 = c0.clientX, y0 = c0.clientY;
  let x = x0, y = y0, mode = 'wait', drag = null;
  const own = (ev) => [...ev.changedTouches].find((c) => c.identifier === tid);
  const off = () => {
    clearTimeout(timer);
    el.classList.remove('pressing');
    document.removeEventListener('touchmove', mv, { passive: false });
    document.removeEventListener('touchend', up);
    document.removeEventListener('touchcancel', up);
  };
  const begin = () => {
    if (mode !== 'wait') return;
    mode = 'drag';
    el.classList.remove('pressing');
    drag = beginDrag(x, y, t, el);
  };
  const mv = (ev) => {
    const c = own(ev);
    if (!c) return;
    x = c.clientX; y = c.clientY;
    if (mode === 'drag') { ev.preventDefault(); drag.move(x, y); }
    else if (mode === 'wait' && Math.hypot(x - x0, y - y0) > 10) { mode = 'scroll'; off(); }
  };
  const up = (ev) => {
    if (!own(ev)) return;
    const m = mode;
    mode = 'done';
    off();
    if (m === 'drag') { ev.preventDefault(); drag.drop(ev.type === 'touchend'); }
    else if (m === 'wait' && ev.type === 'touchend') { ev.preventDefault(); openTileDialog(activeFolder(), t); }
  };
  document.addEventListener('touchmove', mv, { passive: false });
  document.addEventListener('touchend', up);
  document.addEventListener('touchcancel', up);
  el.classList.add('pressing');
  const timer = setTimeout(begin, e.target.closest('.grip') ? 0 : HOLD_MS);
}

function editPress(e, t, el) { // Maus
  const id = e.pointerId, x0 = e.clientX, y0 = e.clientY;
  let mode = 'wait', drag = null;
  const off = () => {
    window.removeEventListener('pointermove', mv);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
  };
  const mv = (ev) => {
    if (ev.pointerId !== id) return;
    if (mode === 'wait' && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 6) { mode = 'drag'; drag = beginDrag(x0, y0, t, el); }
    if (mode === 'drag') { ev.preventDefault(); drag.move(ev.clientX, ev.clientY); }
  };
  const up = (ev) => {
    if (ev.pointerId !== id) return;
    off();
    if (mode === 'drag') drag.drop(ev.type === 'pointerup');
    else if (ev.type === 'pointerup') openTileDialog(activeFolder(), t);
  };
  window.addEventListener('pointermove', mv, { passive: false });
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

function beginDrag(px, py, t, el) {
  const main = $('#main'), grid = el.parentNode;
  const r0 = el.getBoundingClientRect();
  const ox = px - r0.left, oy = py - r0.top;
  let x = px, y = py, tabTarget = null;
  dragging = true;
  // Platzhalter nimmt den Platz im Raster ein, der Kasten selbst schwebt unter dem Finger
  const ph = h('div', { class: 'tile placeholder' });
  grid.insertBefore(ph, el);
  el.classList.add('dragging');
  Object.assign(el.style, { position: 'fixed', left: r0.left + 'px', top: r0.top + 'px', width: r0.width + 'px', height: r0.height + 'px', margin: '0' });
  const place = () => { el.style.transform = `translate(${x - ox - r0.left}px, ${y - oy - r0.top}px) scale(1.06)`; };
  const inside = (r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  const findTarget = () => {
    document.querySelectorAll('.drop-tab').forEach((n) => n.classList.remove('drop-tab'));
    tabTarget = null;
    for (const tab of document.querySelectorAll('.tab[data-folder]')) {
      if (inside(tab.getBoundingClientRect())) {
        if (tab.dataset.folder !== state.activeFolder) { tabTarget = tab.dataset.folder; tab.classList.add('drop-tab'); }
        return;
      }
    }
    for (const tl of grid.querySelectorAll('.tile[data-id]')) {
      if (tl === el) continue;
      const tr = tl.getBoundingClientRect();
      if (!inside(tr)) continue;
      if (x < tr.left + tr.width / 2) { if (tl.previousSibling !== ph) grid.insertBefore(ph, tl); }
      else if (tl.nextSibling !== ph) grid.insertBefore(ph, tl.nextSibling);
      return;
    }
    const add = grid.querySelector('.add-tile');
    if (add && inside(add.getBoundingClientRect()) && add.previousSibling !== ph) grid.insertBefore(ph, add);
  };
  place();
  const scroller = setInterval(() => {
    const mr = main.getBoundingClientRect();
    let d = 0;
    if (y < mr.top + 70 && y > mr.top - 10) d = -12; else if (y > mr.bottom - 70) d = 12;
    if (d) { const s0 = main.scrollTop; main.scrollTop += d; if (main.scrollTop !== s0) findTarget(); }
  }, 16);
  return {
    move(nx, ny) { x = nx; y = ny; place(); findTarget(); },
    drop(ok) {
      clearInterval(scroller);
      dragging = false;
      const f = activeFolder();
      if (ok && tabTarget) {
        const to = folderById(tabTarget);
        moveTile(t, f, to);
        toast('Nach „' + to.name + '“ verschoben');
      } else if (ok) {
        const order = [];
        for (const n of grid.children) {
          if (n === ph) order.push(t.id);
          else if (n !== el && n.dataset && n.dataset.id) order.push(n.dataset.id);
        }
        const byId = new Map(f.tiles.map((x2) => [x2.id, x2]));
        const next = order.map((i) => byId.get(i)).filter(Boolean);
        if (next.length === f.tiles.length) f.tiles = next;
      }
      save();
      render();
    },
  };
}
function moveTile(t, from, to) {
  if (!to || from === to) return;
  from.tiles.splice(from.tiles.indexOf(t), 1);
  to.tiles.push(t);
}

/* ===================== Dialoge ===================== */
function modal({ title, body, done = 'Fertig', cancel = 'Abbrechen', onDone, onCancel, small }) {
  const dlg = h('div', { class: 'dlg' + (small ? ' small' : '') });
  const ov = h('div', { class: 'ov' }, dlg);
  const close = () => { ov.remove(); };
  const head = h('div', { class: 'dhead' },
    cancel ? h('button', { class: 'lnk', onclick: () => { if (onCancel) onCancel(); close(); } }, cancel) : h('span'),
    h('h2', null, title),
    done ? h('button', { class: 'lnk done', onclick: async () => { if (onDone && (await onDone()) === false) return; close(); } }, done) : h('span'));
  dlg.append(head, h('div', { class: 'dbody' }, body));
  document.body.appendChild(ov);
  return { close, el: dlg };
}
function confirmDlg(text, okLabel = 'OK', danger = false) {
  return new Promise((res) => {
    const m = modal({
      title: 'Bitte bestätigen', small: true, done: null, cancel: null,
      body: h('div', null, h('p', { style: 'font-size:17px;line-height:1.45;margin:4px 0 18px' }, text),
        h('div', { class: 'btnrow' },
          h('button', { class: 'btn', onclick: () => { m.close(); res(false); } }, 'Abbrechen'),
          h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => { m.close(); res(true); } }, okLabel))),
    });
  });
}
function switchRow(label, val, onChange, hint) {
  const inp = h('input', { type: 'checkbox' });
  inp.checked = !!val;
  inp.addEventListener('change', () => onChange(inp.checked));
  return h('label', { class: 'swrow' }, h('span', { class: 'swl' }, label, hint ? h('small', null, hint) : null),
    h('span', { class: 'switch' }, inp, h('span', { class: 'knob' })));
}
function rangeRow(label, { min, max, step, value, show, onInput }) {
  const out = h('span', { class: 'rv' }, show(value));
  const r = h('input', { type: 'range', min, max, step });
  r.value = value;
  r.addEventListener('input', () => { const v = +r.value; out.textContent = show(v); onInput(v); });
  return h('div', { class: 'prow' }, h('span', { class: 'rl' }, label), r, out);
}
function seg(options, value, onChange) {
  const box = h('div', { class: 'seg' });
  for (const [v, label] of options) {
    box.appendChild(h('button', { class: v === value ? 'on' : '', onclick: (e) => {
      box.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
      e.currentTarget.classList.add('on');
      onChange(v);
    } }, label));
  }
  return box;
}
function repeatBtn(icon, fn, title) {
  const b = h('button', { class: 'nudge', html: ICONS[icon], title });
  let t1 = 0, t2 = 0;
  const stopR = () => { clearTimeout(t1); clearInterval(t2); };
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); fn(); t1 = setTimeout(() => { t2 = setInterval(fn, 70); }, 420); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => b.addEventListener(ev, stopR));
  return b;
}

/* Datei-Auswahl */
function pickFiles(accept, multiple) {
  return new Promise((res) => {
    const inp = h('input', { type: 'file', style: 'position:fixed;left:-9999px;top:0' });
    if (accept) inp.accept = accept;
    if (multiple) inp.multiple = true;
    inp.addEventListener('change', () => { const files = [...(inp.files || [])]; inp.remove(); res(files); });
    document.body.appendChild(inp);
    inp.click();
  });
}
const AUDIO_ACCEPT = 'audio/*,.mp3,.m4a,.wav,.aif,.aiff,.aac,.caf,.flac,.ogg,.opus,.mp4,.m4v,.mov';
const PHOTO_ACCEPT = 'video/*,audio/*';

/* ---------- Ton aus Videos holen ----------
   Videos (MP4/MOV vom iPhone/iPad) sind oft mehrere hundert MB groß. Statt das ganze Video in den
   Speicher zu laden (dann stürzt die Seite auf dem iPad ab), wird nur die Tonspur (AAC) Stück für
   Stück herausgelesen und als AAC-Datei (ADTS) gespeichert – meist nur wenige MB. */
const fourcc = (dv, o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
const u64 = (dv, o) => dv.getUint32(o) * 4294967296 + dv.getUint32(o + 4);
async function readDV(file, pos, len) { return new DataView(await file.slice(pos, pos + len).arrayBuffer()); }
function boxesIn(dv, start, end) {
  const out = [];
  let p = start;
  while (p + 8 <= end) {
    let size = dv.getUint32(p), hdr = 8;
    const type = fourcc(dv, p + 4);
    if (size === 1) { size = u64(dv, p + 8); hdr = 16; } else if (size === 0) size = end - p;
    if (size < 8 || p + size > end) break;
    out.push({ type, start: p, body: p + hdr, end: p + size });
    p += size;
  }
  return out;
}
const child = (dv, box, type) => boxesIn(dv, box.body, box.end).find((b) => b.type === type);
function readDescLen(dv, p) { let len = 0, n = 0, b; do { b = dv.getUint8(p + n); len = (len << 7) | (b & 0x7f); n++; } while ((b & 0x80) && n < 4); return [len, n]; }
function parseEsds(dv, s, e) {
  // im mp4a-Eintrag nach „esds“ suchen (bei QuickTime steckt es manchmal in einem „wave“-Kasten)
  for (let i = s; i + 4 <= e; i++) {
    if (fourcc(dv, i) !== 'esds') continue;
    let p = i + 4 + 4; // Typ + Version/Flags
    if (dv.getUint8(p) !== 0x03) return null;
    let [, n] = readDescLen(dv, p + 1); p += 1 + n;
    const flags = dv.getUint8(p + 2); p += 3;
    if (flags & 0x80) p += 2;
    if (flags & 0x40) p += 1 + dv.getUint8(p);
    if (flags & 0x20) p += 2;
    if (dv.getUint8(p) !== 0x04) return null;
    [, n] = readDescLen(dv, p + 1); p += 1 + n;
    const oti = dv.getUint8(p); p += 13;
    if (oti !== 0x40 && oti !== 0x67) return null; // nur AAC
    if (dv.getUint8(p) !== 0x05) return null;
    [, n] = readDescLen(dv, p + 1); p += 1 + n;
    // AudioSpecificConfig lesen
    let bitPos = p * 8;
    const bits = (k) => { let v = 0; for (let j = 0; j < k; j++, bitPos++) v = (v << 1) | ((dv.getUint8(bitPos >> 3) >> (7 - (bitPos & 7))) & 1); return v; };
    let aot = bits(5); if (aot === 31) aot = 32 + bits(6);
    let fi = bits(4); let rate = 0;
    if (fi === 15) rate = bits(24);
    const ch = bits(4);
    if (aot === 5 || aot === 29) { const ef = bits(4); if (ef === 15) bits(24); aot = bits(5); }
    if (fi === 15) {
      const rates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
      fi = rates.reduce((best, r, k) => (Math.abs(r - rate) < Math.abs(rates[best] - rate) ? k : best), 0);
    }
    if (aot < 1 || aot > 4 || ch < 1 || ch > 7) return null;
    return { profile: aot - 1, fi, ch };
  }
  return null;
}
async function extractAacFromMp4(file, onProgress) {
  // 1. „moov“ finden (steht am Anfang oder am Ende der Datei)
  let pos = 0, moov = null;
  while (pos + 8 <= file.size) {
    const dv = await readDV(file, pos, 16);
    let size = dv.getUint32(0);
    const type = fourcc(dv, 4);
    if (size === 1) size = u64(dv, 8); else if (size === 0) size = file.size - pos;
    if (size < 8 || !/^[\x20-\x7e]{4}$/.test(type)) return null;
    if (type === 'moov') { moov = { pos, size }; break; }
    pos += size;
  }
  if (!moov || moov.size > 200e6) return null;
  const dv = await readDV(file, moov.pos, moov.size);
  const root = { body: 8, end: moov.size };
  // 2. Tonspur mit AAC suchen
  for (const trak of boxesIn(dv, root.body, root.end).filter((b) => b.type === 'trak')) {
    const mdia = child(dv, trak, 'mdia'); if (!mdia) continue;
    const hdlr = child(dv, mdia, 'hdlr'); if (!hdlr || fourcc(dv, hdlr.body + 8) !== 'soun') continue;
    const minf = child(dv, mdia, 'minf'); const stbl = minf && child(dv, minf, 'stbl'); if (!stbl) continue;
    const stsd = child(dv, stbl, 'stsd'); if (!stsd) continue;
    const entry = boxesIn(dv, stsd.body + 8, stsd.end)[0];
    if (!entry || entry.type !== 'mp4a') continue;
    const cfg = parseEsds(dv, entry.body, entry.end); if (!cfg) continue;
    // Größen der Pakete
    const sizes = [];
    const stsz = child(dv, stbl, 'stsz'), stz2 = child(dv, stbl, 'stz2');
    if (stsz) {
      const fixed = dv.getUint32(stsz.body + 4), cnt = dv.getUint32(stsz.body + 8);
      for (let i = 0; i < cnt; i++) sizes.push(fixed || dv.getUint32(stsz.body + 12 + i * 4));
    } else if (stz2) {
      const fs = dv.getUint8(stz2.body + 7), cnt = dv.getUint32(stz2.body + 8);
      for (let i = 0; i < cnt; i++) {
        if (fs === 16) sizes.push(dv.getUint16(stz2.body + 12 + i * 2));
        else if (fs === 8) sizes.push(dv.getUint8(stz2.body + 12 + i));
        else sizes.push((dv.getUint8(stz2.body + 12 + (i >> 1)) >> ((i & 1) ? 0 : 4)) & 15);
      }
    } else continue;
    // Lage der Blöcke
    const offs = [];
    const stco = child(dv, stbl, 'stco'), co64 = child(dv, stbl, 'co64');
    if (stco) { const n = dv.getUint32(stco.body + 4); for (let i = 0; i < n; i++) offs.push(dv.getUint32(stco.body + 8 + i * 4)); }
    else if (co64) { const n = dv.getUint32(co64.body + 4); for (let i = 0; i < n; i++) offs.push(u64(dv, co64.body + 8 + i * 8)); }
    else continue;
    const stsc = child(dv, stbl, 'stsc'); if (!stsc) continue;
    const sc = [];
    { const n = dv.getUint32(stsc.body + 4); for (let i = 0; i < n; i++) sc.push([dv.getUint32(stsc.body + 8 + i * 12), dv.getUint32(stsc.body + 12 + i * 12)]); }
    // 3. Blöcke einzeln lesen und mit ADTS-Kopf zusammensetzen
    const total = sizes.reduce((a, b) => a + b, 0) + 7 * sizes.length;
    const out = new Uint8Array(total);
    let o = 0, s = 0, k = 0;
    for (let c = 0; c < offs.length && s < sizes.length; c++) {
      while (k + 1 < sc.length && sc[k + 1][0] <= c + 1) k++;
      const per = sc[k][1];
      let len = 0;
      for (let j = 0; j < per && s + j < sizes.length; j++) len += sizes[s + j];
      const chunk = new Uint8Array(await file.slice(offs[c], offs[c] + len).arrayBuffer());
      let q = 0;
      for (let j = 0; j < per && s < sizes.length; j++, s++) {
        const sz = sizes[s], fl = sz + 7;
        out[o] = 0xff; out[o + 1] = 0xf1;
        out[o + 2] = ((cfg.profile & 3) << 6) | ((cfg.fi & 15) << 2) | ((cfg.ch >> 2) & 1);
        out[o + 3] = ((cfg.ch & 3) << 6) | ((fl >> 11) & 3);
        out[o + 4] = (fl >> 3) & 0xff;
        out[o + 5] = ((fl & 7) << 5) | 0x1f;
        out[o + 6] = 0xfc;
        out.set(chunk.subarray(q, q + sz), o + 7);
        o += fl; q += sz;
      }
      if (onProgress && (c & 15) === 0) onProgress(c / offs.length);
    }
    return o === total ? out.buffer : out.slice(0, o).buffer;
  }
  return null;
}
const isVideoLike = (file) => /^video\//.test(file.type) || /\.(mp4|m4v|mov|3gp)$/i.test(file.name || '');

async function importFile(file, onProgress) {
  let ab = null, type = file.type || '';
  if (isVideoLike(file) || /\.m4a$/i.test(file.name || '')) {
    try { ab = await extractAacFromMp4(file, onProgress); } catch (e) { ab = null; }
    if (ab) type = 'audio/aac';
  }
  if (!ab) {
    if (file.size > 250e6) {
      throw new Error('„' + file.name + '“ ist zu groß (' + mb(file.size) + ') und der Ton konnte nicht direkt herausgelesen werden. Tipp: Das Video in der Fotos-App kürzen oder als Audiodatei speichern.');
    }
    ab = await file.arrayBuffer();
  }
  // erst die Tondaten sichern (wird dabei kopiert), dann dekodieren – spart eine Kopie im Speicher
  const id = uid(), size = ab.byteLength;
  try { await idbPut('data', ab, id); }
  catch (e) { throw new Error('Speichern fehlgeschlagen – ist der Speicher voll? (' + e.message + ')'); }
  let buf;
  try { buf = await decode(ab); }
  catch (e) {
    idbDel('data', id).catch(() => {});
    throw new Error('„' + file.name + '“ konnte nicht gelesen werden. Bitte eine Audio- oder Videodatei (z. B. MP3, M4A, WAV, MOV, MP4) wählen.');
  }
  ab = null;
  const p = computePeaks(buf, 600);
  const rec = { id, name: file.name || 'Ton', type, size, duration: buf.duration, peaks: p.data, peakMax: p.max, added: Date.now() };
  try { await idbPut('audio', rec); }
  catch (e) { idbDel('data', id).catch(() => {}); throw new Error('Speichern fehlgeschlagen – ist der Speicher voll? (' + e.message + ')'); }
  // Kontrolle: Ist der Ton wirklich gespeichert?
  const check = await idbGet('data', id).catch(() => null);
  if (!check || check.byteLength !== size) throw new Error('Der Ton konnte nicht sicher gespeichert werden. Bitte nochmal versuchen.');
  audioMeta.set(rec.id, metaOf(rec));
  putBuf(rec.id, buf);
  return audioMeta.get(rec.id);
}
async function bulkImport() {
  const f = activeFolder();
  const files = await pickFiles(AUDIO_ACCEPT, true);
  if (!files.length) return;
  const b = busy('Töne werden importiert …');
  let ok = 0;
  for (let i = 0; i < files.length; i++) {
    b.set('Töne werden importiert … ' + (i + 1) + ' von ' + files.length);
    try {
      const m = await importFile(files[i], (fr) => b.set('Töne werden importiert … ' + (i + 1) + ' von ' + files.length + ' (' + Math.round(fr * 100) + ' %)'));
      const t = newTile(f);
      t.audioId = m.id; t.name = baseName(m.name);
      f.tiles.push(t);
      ok++;
    } catch (e) { toast(e.message, 4500); }
  }
  b.done();
  save();
  renderGrid();
  if (ok) toast(ok + (ok === 1 ? ' Kasten' : ' Kästen') + ' angelegt');
}

/* Kleine Vorhör-Taste für Listen */
function listPreviewBtn(m) {
  const b = h('button', { class: 'mini', html: ICONS.play });
  b.addEventListener('click', async (e) => {
    e.stopPropagation();
    ensureCtx();
    const cur = voices.get('libprev');
    const same = cur && cur.tile.audioId === m.id;
    if (cur) cur.stop();
    document.querySelectorAll('.mini').forEach((x) => { x.innerHTML = ICONS.play; });
    if (same) return;
    try {
      const buf = await getBuffer(m.id);
      const v = new Voice('libprev', { audioId: m.id, volume: 1, fadeIn: 0, fadeOut: 0, start: 0, end: null }, buf);
      voices.set('libprev', v);
      v.play(0, 0);
      b.innerHTML = ICONS.stop;
      const hook = () => { if (v.state === 'done') { b.innerHTML = ICONS.play; uiHooks.delete(hook); } };
      uiHooks.add(hook);
      changed();
    } catch (err) { toast('Ton konnte nicht geladen werden.'); }
  });
  return b;
}
const stopKey = (k) => { const v = voices.get(k); if (v) v.stop(); };

function chooseImported(onPick) {
  const items = [...audioMeta.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const list = h('div', { class: 'lib' });
  if (!items.length) list.append(h('p', { class: 'hint' }, 'Es wurden noch keine Töne importiert.'));
  let m;
  for (const a of items) {
    list.append(h('div', { class: 'librow pick', onclick: () => { stopKey('libprev'); m.close(); onPick(a.id); } },
      listPreviewBtn(a), h('div', { class: 'libname' }, baseName(a.name), h('small', null, fmt(a.duration) + ' · ' + a.name))));
  }
  m = modal({ title: 'Importierten Ton wählen', body: list, done: null, onCancel: () => stopKey('libprev'), small: true });
}

/* ---------- Eigenschaften eines Kastens ---------- */
function openTileDialog(folder, tile) {
  const isNew = !tile;
  const t = isNew ? newTile(folder) : JSON.parse(JSON.stringify(tile));
  let targetFolder = folder.id;
  const ed = { buf: null, hp: null, dur: 0, cursor: 0, v0: 0, v1: 1, token: 0 };
  const body = h('div');

  const nameIn = h('input', { class: 'inp', type: 'text', placeholder: 'Name des Kastens (z. B. Gong)' });
  nameIn.value = t.name;
  nameIn.addEventListener('input', () => { t.name = nameIn.value; });
  const fileLine = h('div', { class: 'fileline' });
  const updateFileLine = () => {
    const m = audioMeta.get(t.audioId);
    fileLine.textContent = m ? 'Datei: ' + m.name + ' (' + fmt(m.duration) + ')' : 'Noch kein Ton ausgewählt';
  };
  updateFileLine();

  const doImport = async (accept) => {
    const files = await pickFiles(accept, false);
    if (!files.length) return;
    const b = busy('Ton wird importiert …');
    try { const m = await importFile(files[0], (f) => b.set('Ton wird aus dem Video geholt … ' + Math.round(f * 100) + ' %')); setAudio(m.id); }
    catch (e) { toast(e.message, 4500); }
    finally { b.done(); }
  };
  const setAudio = (id) => {
    stopKey('preview');
    const prev = audioMeta.get(t.audioId);
    const m = audioMeta.get(id);
    const auto = !t.name.trim() || (prev && t.name === baseName(prev.name));
    t.audioId = id; t.start = 0; t.end = null;
    if (auto) { t.name = baseName(m.name); nameIn.value = t.name; }
    updateFileLine();
    loadEditor();
  };

  const dots = h('div', { class: 'colors' });
  const drawDots = () => {
    dots.textContent = '';
    for (const k of Object.keys(COLORS)) {
      const d = h('button', { class: 'dot' + (t.color === k ? ' sel' : ''), title: k, onclick: () => { t.color = k; drawDots(); drawEd(); } });
      d.style.background = COLORS[k].dot;
      d.style.color = COLORS[k].dot;
      dots.appendChild(d);
    }
  };
  drawDots();

  const folderSel = h('select', null, state.folders.map((f) => {
    const o = h('option', { value: f.id }, f.name);
    if (f.id === targetFolder) o.selected = true;
    return o;
  }));
  folderSel.addEventListener('change', () => { targetFolder = folderSel.value; });

  const edWrap = h('div', { class: 'editor' });

  body.append(
    nameIn,
    fileLine,
    h('div', { class: 'btnrow' },
      h('button', { class: 'btn', onclick: () => doImport(AUDIO_ACCEPT) }, 'Aus Dateien'),
      h('button', { class: 'btn', onclick: () => doImport(PHOTO_ACCEPT) }, 'Aus Fotos / Videos'),
      h('button', { class: 'btn', onclick: () => chooseImported(setAudio) }, 'Schon importiert …')),
    h('div', { class: 'prow' }, h('span', { class: 'rl' }, 'Farbe'), dots),
    rangeRow('Lautstärke', { min: 0, max: 100, step: 1, value: Math.round(t.volume * 100), show: (v) => v + ' %',
      onInput: (v) => { t.volume = v / 100; const p = voices.get('preview'); if (p) p.vol.gain.setTargetAtTime(volGain(t.volume), ctx.currentTime, 0.02); } }),
    rangeRow('Einblenden', { min: 0, max: 10, step: 0.1, value: t.fadeIn, show: secs, onInput: (v) => { t.fadeIn = v; } }),
    rangeRow('Ausblenden', { min: 0, max: 10, step: 0.1, value: t.fadeOut, show: secs, onInput: (v) => { t.fadeOut = v; } }),
    h('div', { class: 'toggles' },
      switchRow('Endlosschleife', t.loop, (v) => { t.loop = v; }, 'Spielt immer wieder von vorn, bis du stoppst'),
      switchRow('Solo', t.solo, (v) => { t.solo = v; }, 'Blendet beim Start alle anderen Töne aus'),
      switchRow('Nur solange gedrückt', t.hold, (v) => { t.hold = v; }, 'Spielt nur, solange der Finger drauf ist')),
    edWrap,
    h('div', { class: 'extra' },
      h('span', null, 'Ordner:'), folderSel, h('span', { class: 'grow' }),
      isNew ? null : h('button', { class: 'btn sm', onclick: duplicate }, 'Duplizieren'),
      isNew ? null : h('button', { class: 'btn sm danger', onclick: remove }, 'Löschen')));

  /* ----- Schnitt-Editor ----- */
  const reg = () => region(t, ed.dur);
  let cv, posL, remL, playB, lblS, lblL, lblE, pan, zoomL;
  const step = () => ((ed.v1 - ed.v0) < 6 ? 0.01 : 0.1);
  const r3 = (v) => Math.round(v * 1000) / 1000;
  function setStart(v) {
    const r = reg();
    t.start = r3(clamp(v, 0, r.end - 0.05));
    if (ed.cursor < t.start) ed.cursor = t.start;
    drawEd();
  }
  function setEnd(v) {
    const r = reg();
    const e = clamp(v, r.start + 0.05, ed.dur);
    t.end = e >= ed.dur - 0.0005 ? null : r3(e);
    if (ed.cursor > reg().end) ed.cursor = reg().start;
    drawEd();
  }
  function setView(v0, len) {
    len = clamp(len, Math.min(0.25, ed.dur), ed.dur);
    v0 = clamp(v0, 0, ed.dur - len);
    ed.v0 = v0; ed.v1 = v0 + len;
    drawEd();
  }
  function zoom(f) {
    const len = ed.v1 - ed.v0;
    const c = ed.cursor >= ed.v0 && ed.cursor <= ed.v1 ? ed.cursor : (ed.v0 + ed.v1) / 2;
    const nl = clamp(len / f, Math.min(0.25, ed.dur), ed.dur);
    setView(c - (c - ed.v0) * (nl / len), nl);
  }
  const lookAt = (time) => { const len = Math.min(ed.dur, 4); setView(time - len / 2, len); };

  async function loadEditor() {
    const token = ++ed.token;
    edWrap.textContent = '';
    const m = audioMeta.get(t.audioId);
    if (!m) { edWrap.append(h('p', { class: 'hint' }, 'Wähle oben einen Ton aus. Danach kannst du hier Anfang und Ende festlegen und reinhören.')); return; }
    edWrap.append(h('p', { class: 'hint' }, 'Ton wird geladen …'));
    let buf;
    try { buf = await getBuffer(m.id); }
    catch (e) { if (token === ed.token) edWrap.firstChild.textContent = 'Der Ton konnte nicht geladen werden.'; return; }
    if (token !== ed.token) return;
    ed.buf = buf; ed.hp = hiPeaks(m.id, buf); ed.dur = buf.duration; ed.v0 = 0; ed.v1 = ed.dur; ed.cursor = reg().start;
    buildEditor();
  }
  function buildEditor() {
    edWrap.textContent = '';
    posL = h('span', { class: 'tpos' }); remL = h('span', { class: 'trem' });
    playB = h('button', { class: 'round', title: 'Reinhören', html: ICONS.play, onclick: togglePreview });
    const toStart = h('button', { class: 'round', title: 'Zum Anfang', html: ICONS.prev, onclick: () => { ed.cursor = reg().start; if (previewing()) startPreview(); drawEd(); } });
    const toEnd = h('button', { class: 'round', title: 'Ende anhören (letzte 3 Sekunden)', html: ICONS.next, onclick: () => { const r = reg(); ed.cursor = Math.max(r.start, r.end - 3); startPreview(); } });
    lblS = h('span', { class: 'ls' }); lblL = h('span'); lblE = h('span', { class: 'le' });
    cv = h('canvas', { class: 'edcv' });
    pan = h('input', { type: 'range', class: 'pan', min: 0, max: 1000, step: 1 });
    pan.addEventListener('input', () => { const len = ed.v1 - ed.v0; setView((+pan.value / 1000) * (ed.dur - len), len); });
    zoomL = h('span');
    edWrap.append(
      h('div', { class: 'transport' }, posL, h('div', { class: 'tbtns' }, toStart, playB, toEnd), remL),
      h('div', { class: 'edlabels' }, lblS, lblL, lblE),
      cv, pan,
      h('div', { class: 'zoomrow' }, h('span', null, 'Ansicht:'),
        h('button', { class: 'btn sm', onclick: () => zoom(0.5) }, '− Weiter weg'),
        h('button', { class: 'btn sm', onclick: () => zoom(2) }, '+ Näher ran'),
        h('button', { class: 'btn sm', onclick: () => setView(0, ed.dur) }, 'Ganz'),
        h('button', { class: 'btn sm', onclick: () => lookAt(reg().start) }, 'Anfang genau'),
        h('button', { class: 'btn sm', onclick: () => lookAt(reg().end) }, 'Ende genau'),
        zoomL),
      h('div', { class: 'nudges' },
        h('div', { class: 'nudge-box s' }, h('span', { class: 'nl' }, 'Start'),
          repeatBtn('left', () => setStart(reg().start - step()), 'früher'),
          repeatBtn('right', () => setStart(reg().start + step()), 'später'),
          h('button', { class: 'btn sm', onclick: () => setStart(ed.cursor) }, 'auf Abspielstelle')),
        h('div', { class: 'nudge-box e' }, h('span', { class: 'nl' }, 'Ende'),
          repeatBtn('left', () => setEnd(reg().end - step()), 'früher'),
          repeatBtn('right', () => setEnd(reg().end + step()), 'später'),
          h('button', { class: 'btn sm', onclick: () => setEnd(ed.cursor) }, 'auf Abspielstelle'))),
      h('p', { class: 'hint' }, 'Grüne Linie = Start, rote Linie = Ende: einfach mit dem Finger verschieben. Tippen in die Wellenform setzt die Abspielstelle. Mit „Näher ran“ kannst du ganz genau schneiden.'));
    cv.addEventListener('pointerdown', onEdDown);
    requestAnimationFrame(drawEd);
  }
  const xOf = (time, w) => (time - ed.v0) / (ed.v1 - ed.v0) * w;
  const timeOf = (x, w) => ed.v0 + clamp(x / w, 0, 1) * (ed.v1 - ed.v0);
  function drawEd() {
    if (!cv || !cv.isConnected || !ed.hp) return;
    const s = setupCanvas(cv);
    if (!s) return;
    const { g, w } = s, hh = s.h, c = col(t.color), r = reg();
    g.fillStyle = c.bg; g.fillRect(0, 0, w, hh);
    paintPeaks(g, ed.hp.data, ed.hp.perSec, ed.v0, ed.v1, w, hh, r.start, r.end, c.ink, 'rgba(70,70,70,.6)', ed.hp.scale);
    const xs = xOf(r.start, w), xe = xOf(r.end, w);
    g.fillStyle = 'rgba(255,255,255,.42)';
    if (xs > 0) g.fillRect(0, 0, Math.min(w, xs), hh);
    if (xe < w) g.fillRect(Math.max(0, xe), 0, w - Math.max(0, xe), hh);
    const marker = (x, color, atTop) => {
      if (x < -20 || x > w + 20) return;
      g.fillStyle = color; g.fillRect(x - 1.5, 0, 3, hh);
      const ty = atTop ? 4 : hh - 30;
      g.beginPath(); g.roundRect ? g.roundRect(x - 17, ty, 34, 26, 8) : g.rect(x - 17, ty, 34, 26); g.fill();
      g.fillStyle = '#fff';
      g.beginPath(); g.moveTo(x - 4, ty + 7); g.lineTo(x - 11, ty + 13); g.lineTo(x - 4, ty + 19); g.fill();
      g.beginPath(); g.moveTo(x + 4, ty + 7); g.lineTo(x + 11, ty + 13); g.lineTo(x + 4, ty + 19); g.fill();
    };
    marker(xs, '#1f9d3a', false);
    marker(xe, '#d62d20', true);
    const xc = xOf(ed.cursor, w);
    if (xc >= 0 && xc <= w) { g.fillStyle = '#111'; g.fillRect(xc - 1, 0, 2, hh); }
    lblS.textContent = 'Start ' + fmt2(r.start);
    lblL.textContent = 'Länge ' + fmt2(r.end - r.start);
    lblE.textContent = 'Ende ' + fmt2(r.end);
    posL.textContent = fmt2(ed.cursor);
    remL.textContent = '-' + fmt2(Math.max(0, r.end - ed.cursor));
    const len = ed.v1 - ed.v0;
    pan.style.visibility = len < ed.dur - 0.001 ? 'visible' : 'hidden';
    pan.value = ed.dur - len > 0 ? Math.round(ed.v0 / (ed.dur - len) * 1000) : 0;
    zoomL.textContent = len < ed.dur - 0.001 ? 'Ausschnitt: ' + fmt(len) : '';
  }
  function onEdDown(e) {
    e.preventDefault();
    const rect = cv.getBoundingClientRect(), w = rect.width;
    const x0 = e.clientX - rect.left, r = reg();
    const ds = Math.abs(x0 - xOf(r.start, w)), de = Math.abs(x0 - xOf(r.end, w));
    let mode = 'tap';
    if (Math.min(ds, de) < 28) {
      if (ds < de) mode = 'start';
      else if (de < ds) mode = 'end';
      else mode = (e.clientY - rect.top) < rect.height / 2 ? 'end' : 'start';
    }
    const v0 = ed.v0, len = ed.v1 - ed.v0;
    let moved = false;
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
    const mv = (ev) => {
      const x = ev.clientX - rect.left;
      if (Math.abs(x - x0) > 6) moved = true;
      if (mode === 'start') setStart(timeOf(x, w));
      else if (mode === 'end') setEnd(timeOf(x, w));
      else if (moved && len < ed.dur) setView(v0 - (x - x0) / w * len, len);
    };
    const up = (ev) => {
      cv.removeEventListener('pointermove', mv);
      cv.removeEventListener('pointerup', up);
      cv.removeEventListener('pointercancel', up);
      if (mode === 'tap' && !moved && ev.type === 'pointerup') {
        const rr = reg();
        ed.cursor = clamp(timeOf(ev.clientX - rect.left, w), rr.start, rr.end);
        if (previewing()) startPreview();
        drawEd();
      }
    };
    cv.addEventListener('pointermove', mv);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
  }
  const previewing = () => { const v = voices.get('preview'); return v && v.state !== 'done' ? v : null; };
  function startPreview() {
    if (!ed.buf) return;
    ensureCtx();
    stopKey('preview');
    const r = reg();
    let pos = ed.cursor;
    if (pos < r.start || pos >= r.end - 0.02) pos = r.start;
    const v = new Voice('preview', t, ed.buf);
    voices.set('preview', v);
    v.play(pos, pos <= r.start + 0.01 ? +t.fadeIn || 0 : 0);
    watchVoice(v);
    changed();
  }
  function togglePreview() { if (previewing()) stopKey('preview'); else startPreview(); }
  let wasPlaying = false;
  const hook = () => {
    if (!playB) return;
    const v = previewing();
    if (v) {
      ed.cursor = v.position();
      const len = ed.v1 - ed.v0;
      if (len < ed.dur && (ed.cursor > ed.v1 || ed.cursor < ed.v0)) { ed.v0 = clamp(ed.cursor - len * 0.1, 0, ed.dur - len); ed.v1 = ed.v0 + len; }
      drawEd();
    } else if (wasPlaying) drawEd();
    if (!!v !== wasPlaying) { playB.innerHTML = v ? ICONS.stop : ICONS.play; wasPlaying = !!v; }
  };
  uiHooks.add(hook);
  const onResize = () => drawEd();
  window.addEventListener('resize', onResize);
  const cleanup = () => { stopKey('preview'); stopKey('libprev'); uiHooks.delete(hook); window.removeEventListener('resize', onResize); };

  function commit() {
    t.name = (t.name || '').trim() || (audioMeta.get(t.audioId) ? baseName(audioMeta.get(t.audioId).name) : 'Ohne Namen');
    const to = folderById(targetFolder) || folder;
    if (isNew) { to.tiles.push(t); return t; }
    const v = voices.get(tile.id);
    if (v && v.tile.audioId !== t.audioId) v.stop();
    Object.assign(tile, t);
    if (to !== folder) moveTile(tile, folder, to);
    return tile;
  }
  function duplicate() {
    const orig = commit();
    const copy = JSON.parse(JSON.stringify(orig));
    copy.id = uid(); copy.name = orig.name + ' Kopie';
    const f = folderOfTile(orig.id);
    f.tiles.splice(f.tiles.indexOf(orig) + 1, 0, copy);
    cleanup(); m.close(); save(); render();
    toast('Kopie angelegt');
  }
  async function remove() {
    if (!await confirmDlg('Kasten „' + (tile.name || 'Ohne Namen') + '“ löschen? Die Tondatei selbst bleibt erhalten.', 'Löschen', true)) return;
    stopKey(tile.id);
    const f = folderOfTile(tile.id);
    if (f) f.tiles.splice(f.tiles.indexOf(tile), 1);
    cleanup(); m.close(); save(); render();
  }

  const m = modal({
    title: isNew ? 'Neuer Kasten' : 'Kasten bearbeiten',
    body,
    onCancel: cleanup,
    onDone: () => {
      if (isNew && !t.audioId && !t.name.trim()) { cleanup(); return; }
      cleanup(); commit(); save(); render();
    },
  });
  loadEditor();
}

/* ---------- Ordner ---------- */
function addFolder() {
  const f = newFolder('Ordner ' + (state.folders.length + 1));
  state.folders.push(f);
  state.activeFolder = f.id;
  save();
  render();
  openFolderDialog(f, true);
}
function openFolderDialog(f, isNew) {
  let size = f.size || 'M';
  const nameIn = h('input', { class: 'inp', type: 'text' });
  nameIn.value = f.name;
  const moveBy = (d) => {
    const i = state.folders.indexOf(f), j = i + d;
    if (j < 0 || j >= state.folders.length) return;
    state.folders.splice(i, 1);
    state.folders.splice(j, 0, f);
    save();
    renderTop();
  };
  const body = h('div', null,
    h('div', { class: 'field' }, h('div', { class: 'flabel' }, 'Name des Ordners'), nameIn),
    h('div', { class: 'field' }, h('div', { class: 'flabel' }, 'Größe der Kästen'),
      seg([['S', 'Klein'], ['M', 'Mittel'], ['L', 'Groß']], size, (v) => { size = v; f.size = v; renderGrid(); })),
    h('div', { class: 'field' }, h('div', { class: 'flabel' }, 'Reihenfolge der Ordner'),
      h('div', { class: 'btnrow' },
        h('button', { class: 'btn', onclick: () => moveBy(-1) }, '← Nach links'),
        h('button', { class: 'btn', onclick: () => moveBy(1) }, 'Nach rechts →'))),
    h('div', { class: 'section' },
      h('button', { class: 'btn danger', onclick: async () => {
        const n = f.tiles.length;
        if (!await confirmDlg('Ordner „' + f.name + '“' + (n ? ' mit ' + n + (n === 1 ? ' Kasten' : ' Kästen') : '') + ' löschen? Die Tondateien bleiben erhalten.', 'Löschen', true)) return;
        f.tiles.forEach((t) => stopKey(t.id));
        state.folders.splice(state.folders.indexOf(f), 1);
        if (!state.folders.length) state.folders.push(newFolder('Vorstellung'));
        state.activeFolder = state.folders[0].id;
        m.close(); save(); render();
      } }, 'Ordner löschen')));
  const m = modal({
    title: isNew ? 'Neuer Ordner' : 'Ordner bearbeiten', body, small: true, cancel: null,
    onDone: () => { f.name = nameIn.value.trim() || f.name; f.size = size; save(); render(); },
  });
  if (isNew) setTimeout(() => { nameIn.focus(); nameIn.select(); }, 50);
}

/* ---------- Einstellungen ---------- */
function openSettings() {
  const s = state.settings;
  const storageL = h('p', { class: 'hint' }, '');
  if (navigator.storage && navigator.storage.estimate) {
    navigator.storage.estimate().then((e) => { storageL.textContent = 'Belegt: ' + mb(e.usage || 0) + (e.quota ? ' von ca. ' + mb(e.quota) : ''); }).catch(() => {});
  }
  const libBtn = h('button', { class: 'btn', onclick: openLibrary }, 'Tondateien verwalten (' + audioMeta.size + ')');
  const body = h('div', null,
    h('h3', { style: 'margin:0 0 4px' }, 'Wiedergabe'),
    rangeRow('Ausblenden', { min: 0.5, max: 10, step: 0.5, value: s.fadeAll, show: secs, onInput: (v) => { s.fadeAll = v; save(); } }),
    h('p', { class: 'hint', style: 'margin-top:-4px' }, 'So lange dauert es, bis beim Knopf „Ausblenden“ alle laufenden Töne leise geworden sind.'),
    switchRow('Sofort beim Berühren starten', s.instant, (v) => { s.instant = v; save(); }, 'Etwas schneller – aber beim Scrollen über die Kästen können dann Töne losgehen.'),
    switchRow('Bildschirm nicht ausschalten', s.keepAwake, (v) => { s.keepAwake = v; save(); updateWakeLock(); }, 'Das Gerät bleibt an, solange die App offen ist.'),
    h('div', { class: 'section' }, h('h3', null, 'Ein-Knopf-Modus'),
      switchRow('Ein-Knopf-Modus (WEITER-Knopf)', s.cueMode, (v) => { s.cueMode = v; save(); }, 'Im Spielmodus erscheint unten ein großer WEITER-Knopf: 1× drücken = Kasten 1, nochmal = Kasten 2, nochmal = Kasten 3 … (Reihenfolge wie im Ordner). Kästen antippen geht weiterhin.'),
      switchRow('Vorherigen Ton dabei ausblenden', s.cueFadePrev, (v) => { s.cueFadePrev = v; save(); }, 'Beim Drücken auf WEITER werden die gerade laufenden Töne ausgeblendet.'),
      h('p', { class: 'hint' }, 'Mit Tastatur (Windows/iPad-Tastatur) oder Präsentations-Fernbedienung: Leertaste/Enter/Pfeil rechts = WEITER, Pfeil links = zurück, Esc = alle stoppen, F = alle ausblenden, P = Pause.')),
    h('div', { class: 'section' }, h('h3', null, 'Tondateien'), libBtn, storageL),
    h('div', { class: 'section' }, h('h3', null, 'Teilen & Sichern'),
      h('p', { class: 'hint' }, 'Ein Paket enthält Ordner, Kästen und Töne in einer Datei. Schick es per WhatsApp, Mail, AirDrop, USB-Stick … an jemand anderen (iPad oder Windows). Er öffnet Bühnenton, tippt hier auf „Paket öffnen“ und hat alles – und kann es auch bearbeiten. Schickt er dir das Paket zurück, werden deine Ordner damit aktualisiert. Auch gut als Sicherung.'),
      h('div', { class: 'btnrow' },
        h('button', { class: 'btn primary', onclick: openShareDialog }, 'Paket verschicken / sichern'),
        h('button', { class: 'btn', onclick: importBackup }, 'Paket öffnen'))),
    installPrompt ? h('div', { class: 'section' }, h('button', { class: 'btn', onclick: installApp }, 'Als App auf diesem Computer installieren')) : null,
    h('div', { class: 'section' }, h('h3', null, 'So funktioniert’s'),
      h('ul', null,
        h('li', null, h('b', null, 'SPIELEN: '), 'Kasten antippen = Ton startet. Nochmal antippen = Ton stoppt (mit der eingestellten Ausblendzeit). Während er ausblendet nochmal tippen = sofort aus.'),
        h('li', null, 'Mehrere Töne können gleichzeitig laufen. ', h('b', null, 'Pause'), ' hält alle an (nochmal = weiter), ', h('b', null, 'Alle stoppen'), ' macht sofort alles aus, ', h('b', null, 'Ausblenden'), ' blendet alle zusammen sanft aus.'),
        h('li', null, h('b', null, 'BEARBEITEN: '), 'Kasten antippen = Name, Farbe, Lautstärke, Ein-/Ausblenden und Schnitt. Kasten gedrückt halten und ziehen = verschieben, auch auf einen anderen Ordner-Reiter.'),
        h('li', null, 'Den aktiven Ordner-Reiter im Bearbeiten-Modus antippen = Ordner umbenennen, Kastengröße ändern, löschen.'),
        h('li', null, 'Für die Vorstellung: iPad auf „Nicht stören“ stellen und die App nicht verlassen – im Hintergrund hält iPadOS die Töne an.'),
        h('li', null, 'Windows: In Chrome oder Edge öffnen und installieren. Bedienen mit Maus: klicken statt tippen, Kasten mit gedrückter Maustaste ziehen = verschieben. Pakete (.buehnenton) lassen sich nach der Installation per Doppelklick öffnen.'))),
    h('p', { class: 'hint', style: 'text-align:center;margin-top:18px' }, 'Bühnenton · Version ' + APP_VERSION + ' · alle Daten bleiben auf diesem Gerät'));
  modal({ title: 'Einstellungen', body, cancel: null, onDone: () => { stopKey('libprev'); render(); } });
}
function openLibrary() {
  const list = h('div', { class: 'lib' });
  const usage = () => {
    const u = new Map();
    for (const f of state.folders) for (const t of f.tiles) if (t.audioId) u.set(t.audioId, (u.get(t.audioId) || 0) + 1);
    return u;
  };
  const fill = () => {
    list.textContent = '';
    const u = usage();
    const items = [...audioMeta.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
    if (!items.length) list.append(h('p', { class: 'hint' }, 'Noch keine Tondateien importiert.'));
    const unused = items.filter((a) => !u.get(a.id));
    if (unused.length) {
      list.append(h('div', { style: 'margin-bottom:10px' }, h('button', { class: 'btn sm danger', onclick: async () => {
        if (!await confirmDlg(unused.length + ' unbenutzte Tondatei(en) löschen?', 'Löschen', true)) return;
        for (const a of unused) await deleteAudio(a.id);
        fill();
      } }, 'Alle unbenutzten löschen (' + unused.length + ')')));
    }
    for (const a of items) {
      const n = u.get(a.id) || 0;
      list.append(h('div', { class: 'librow' }, listPreviewBtn(a),
        h('div', { class: 'libname' }, a.name, h('small', null, fmt(a.duration) + ' · ' + mb(a.size || 0) + ' · ' + (n ? 'in ' + n + (n === 1 ? ' Kasten' : ' Kästen') : 'unbenutzt'))),
        h('button', { class: 'btn sm danger', onclick: async () => {
          if (!await confirmDlg(n ? '„' + a.name + '“ wird in ' + n + (n === 1 ? ' Kasten' : ' Kästen') + ' benutzt. Trotzdem löschen? Die Kästen bleiben dann ohne Ton.' : '„' + a.name + '“ löschen?', 'Löschen', true)) return;
          await deleteAudio(a.id);
          fill();
          renderGrid();
        } }, 'Löschen')));
    }
  };
  fill();
  modal({ title: 'Tondateien', body: list, cancel: null, small: true, onDone: () => stopKey('libprev') });
}
async function deleteAudio(id) {
  for (const v of [...voices.values()]) if (v.tile.audioId === id) v.stop();
  await idbDel('audio', id);
  await idbDel('data', id);
  missingAudio.delete(id);
  audioMeta.delete(id); bufCache.delete(id); hiPeakCache.delete(id);
  for (const f of state.folders) for (const t of f.tiles) if (t.audioId === id) { t.audioId = null; t.start = 0; t.end = null; }
  save();
}

/* ---------- Sicherung ---------- */
const MAGIC = 'BUEHNENTON1';
function openShareDialog() {
  const chosen = new Set(state.folders.map((f) => f.id));
  const list = h('div', null, state.folders.map((f) => switchRow(f.name, true, (v) => { if (v) chosen.add(f.id); else chosen.delete(f.id); },
    f.tiles.length + (f.tiles.length === 1 ? ' Kasten' : ' Kästen'))));
  const m = modal({
    title: 'Paket verschicken', small: true, done: 'Weiter',
    body: h('div', null, h('p', { class: 'hint', style: 'margin-top:0' }, 'Welche Ordner sollen ins Paket?'), list),
    onDone: () => {
      if (!chosen.size) { toast('Bitte mindestens einen Ordner auswählen.'); return false; }
      setTimeout(() => exportBackup([...chosen]), 0);
    },
  });
  return m;
}
async function exportBackup(folderIds) {
  const b = busy('Paket wird vorbereitet …');
  let file;
  try {
    const folders = folderIds ? state.folders.filter((f) => folderIds.includes(f.id)) : state.folders;
    const used = new Set();
    for (const f of folders) for (const t of f.tiles) if (t.audioId) used.add(t.audioId);
    const recs = ((await idbAll('audio')) || []).filter((r) => used.has(r.id) && audioMeta.has(r.id));
    const header = { app: 'buehnenton', version: 1, created: new Date().toISOString(),
      state: { folders, settings: state.settings }, audio: [] };
    const parts = [];
    let offset = 0;
    for (const r of recs) {
      const ab = await readAudioData(r.id);
      if (!ab) continue;
      const blob = new Blob([ab], { type: r.type || 'application/octet-stream' });
      header.audio.push({ id: r.id, name: r.name, type: r.type, duration: r.duration, peakMax: r.peakMax, added: r.added,
        peaks: Array.from(r.peaks || [], (x) => Math.round(x * 1000) / 1000), offset, size: blob.size });
      offset += blob.size;
      parts.push(blob);
    }
    const hj = new TextEncoder().encode(JSON.stringify(header));
    const len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(0, hj.length);
    const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
    const label = folders.length === 1 ? folders[0].name.replace(/[^\wäöüÄÖÜß -]+/g, '').trim().replace(/\s+/g, '-') || 'Ordner' : 'Paket';
    const name = 'Buehnenton-' + label + '-' + d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + '.buehnenton';
    file = new File([new TextEncoder().encode(MAGIC), len, hj, ...parts], name, { type: 'application/octet-stream' });
  } catch (e) { b.done(); toast('Paket konnte nicht erstellt werden: ' + e.message, 4500); return; }
  b.done();
  const canShare = navigator.canShare && navigator.canShare({ files: [file] });
  const download = () => {
    const url = URL.createObjectURL(file);
    const a = h('a', { href: url, download: file.name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  const m = modal({
    title: 'Paket ist fertig', small: true, done: null, cancel: 'Schließen',
    body: h('div', null,
      h('p', null, '„' + file.name + '“ (' + mb(file.size) + ')'),
      h('p', { class: 'hint' }, canShare
        ? '„Teilen …“ öffnet WhatsApp, Mail, AirDrop, „In Dateien sichern“ usw. „Herunterladen“ speichert die Datei auf diesem Gerät.'
        : '„Herunterladen“ speichert die Datei (meist im Ordner „Downloads“). Von dort kannst du sie per Mail, WhatsApp Web, USB-Stick usw. weitergeben.'),
      h('p', { class: 'hint' }, 'Hinweis: WhatsApp und Mail haben Größengrenzen (etwa 100 MB bzw. 20 MB). Für große Pakete AirDrop, USB-Stick oder einen Cloud-Ordner verwenden.'),
      h('div', { class: 'btnrow' },
        canShare ? h('button', { class: 'btn primary', onclick: () => {
          navigator.share({ files: [file], title: file.name }).then(() => m.close()).catch((e) => { if (e.name !== 'AbortError') download(); });
        } }, 'Teilen …') : null,
        h('button', { class: canShare ? 'btn' : 'btn primary', onclick: download }, 'Herunterladen'))),
  });
}
async function importBackup() {
  const files = await pickFiles('', false);
  if (files[0]) await importPackageFile(files[0]);
}
async function importPackageFile(file) {
  let header, base;
  try {
    const head = new Uint8Array(await file.slice(0, MAGIC.length + 4).arrayBuffer());
    if (new TextDecoder().decode(head.slice(0, MAGIC.length)) !== MAGIC) throw new Error('Das ist kein Bühnenton-Paket (Datei endet auf .buehnenton).');
    const len = new DataView(head.buffer).getUint32(MAGIC.length);
    base = MAGIC.length + 4 + len;
    header = JSON.parse(new TextDecoder().decode(await file.slice(MAGIC.length + 4, base).arrayBuffer()));
  } catch (e) { toast(e.message || 'Datei konnte nicht gelesen werden.', 4500); return; }
  const folders = (header.state && header.state.folders) || [];
  const nt = folders.reduce((n, f) => n + f.tiles.length, 0);
  const same = folders.filter((f) => folderById(f.id)).map((f) => '„' + f.name + '“');
  if (!await confirmDlg('Paket vom ' + new Date(header.created).toLocaleString('de-DE') + ' öffnen? Es enthält ' + folders.length + ' Ordner (' + folders.map((f) => f.name).join(', ') + '), ' + nt + ' Kästen und ' + header.audio.length + ' Töne.'
    + (same.length ? ' Diese Ordner gibt es schon und werden mit dem Stand aus dem Paket ersetzt: ' + same.join(', ') + '.' : '') + ' Alle anderen Ordner bleiben unverändert.', 'Öffnen')) return;
  const b = busy('Paket wird geöffnet …');
  try {
    let i = 0;
    for (const a of header.audio) {
      b.set('Töne werden übernommen … ' + (++i) + ' von ' + header.audio.length);
      const ab = await file.slice(base + a.offset, base + a.offset + a.size).arrayBuffer();
      const rec = { id: a.id, name: a.name, type: a.type, size: a.size, duration: a.duration, peakMax: a.peakMax || 1,
        peaks: Float32Array.from(a.peaks || []), added: a.added };
      await idbPut('data', ab, rec.id);
      await idbPut('audio', rec);
      audioMeta.set(rec.id, metaOf(rec));
      missingAudio.delete(rec.id);
      bufCache.delete(rec.id); hiPeakCache.delete(rec.id);
    }
    for (const f of folders) {
      const i2 = state.folders.findIndex((x) => x.id === f.id);
      if (i2 >= 0) state.folders[i2] = f; else state.folders.push(f);
    }
    // leeren Standard-Ordner entfernen, wenn er nie benutzt wurde
    if (state.folders.length > 1) state.folders = state.folders.filter((f) => f.tiles.length || folders.some((x) => x.id === f.id) || f.name !== 'Vorstellung');
    if (folders[0]) state.activeFolder = folders[0].id;
    dirty = true;
    await flushSave();
    b.done();
    document.querySelectorAll('.ov').forEach((o) => o.remove());
    render();
    toast('Paket geöffnet');
  } catch (e) { b.done(); toast('Laden fehlgeschlagen: ' + e.message, 5000); }
}

/* ===================== Bildschirm anlassen ===================== */
let wakeLock = null;
async function updateWakeLock() {
  const want = state.settings.keepAwake && document.visibilityState === 'visible';
  try {
    if (want && !wakeLock && navigator.wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!want && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) { /* nicht unterstützt */ }
}

/* ===================== Start ===================== */
async function main() {
  try { await load(); }
  catch (e) {
    $('#main').append(h('div', { class: 'empty' }, 'Die gespeicherten Daten konnten nicht geöffnet werden: ' + e.message));
    return;
  }
  render();
  preloadFolder(activeFolder());
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  // Audio auf iOS freischalten: zählt nur beim Loslassen des Fingers (touchend/click), nicht beim Aufsetzen
  const unlock = () => { ensureCtx(); updateWakeLock(); };
  document.addEventListener('touchend', unlock, true);
  document.addEventListener('click', unlock, true);
  document.addEventListener('touchstart', () => {}, { passive: true }); // :active auf iOS
  // Beim Verschieben von Kästen das Scrollen verhindern
  document.addEventListener('touchmove', (e) => { if (dragging) e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { flushSave(); wasHidden = true; }
    else sampleCtx();
    updateWakeLock();
  });
  if ('serviceWorker' in navigator) {
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) { hadController = true; return; }
      if (!liveVoices().length && !document.querySelector('.ov')) location.reload();
      else toast('Neue Version geladen – wird beim nächsten Öffnen aktiv.');
    });
  }
  window.addEventListener('pagehide', () => { flushSave(); wasHidden = true; });
  // Tastatur (Windows, iPad-Tastatur, Präsentations-Fernbedienung)
  const typing = (e) => e.target && e.target.closest && e.target.closest('input,textarea,select');
  document.addEventListener('keydown', (e) => {
    if (typing(e) || document.querySelector('.ov, .busy') || editMode || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    let done = true;
    if (k === ' ' || k === 'Enter' || k === 'ArrowRight' || k === 'PageDown' || k === 'ArrowDown') { if (state.settings.cueMode) { if (!e.repeat) cueGo(); } else done = false; }
    else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'ArrowUp') { if (state.settings.cueMode) cueStep(-1); else done = false; }
    else if (k === 'Escape') stopAll();
    else if (k === 'f' || k === 'F') fadeAll();
    else if (k === 'p' || k === 'P') pauseAll();
    else done = false;
    if (done) { e.preventDefault(); ensureCtx(); }
  }, true);
  document.addEventListener('keyup', (e) => { if (e.key === ' ' && !typing(e)) e.preventDefault(); }, true);
  // Knöpfe nach dem Klicken nicht im Fokus lassen (sonst löst die Leertaste sie erneut aus)
  document.addEventListener('click', (e) => { const btn = e.target.closest && e.target.closest('button'); if (btn) btn.blur(); });
  // Windows/Chrome/Edge: Installieren-Knopf anbieten
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; renderGrid(); });
  window.addEventListener('appinstalled', () => { installPrompt = null; renderGrid(); });
  // Windows: Paket per Doppelklick öffnen (installierte App)
  if ('launchQueue' in window) {
    window.launchQueue.setConsumer(async (params) => {
      for (const fh of params.files || []) { try { await importPackageFile(await fh.getFile()); } catch (e) { toast('Paket konnte nicht geöffnet werden.'); } }
    });
  }
  window.addEventListener('pageshow', () => { wasHidden = true; });
  let rt = 0;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(drawTileWaves, 120); });
}
main();
