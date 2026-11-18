'use strict';
/* Bühnenton – Töne fürs Theater.
   Alles läuft auf dem Gerät: Tondateien liegen in IndexedDB, die App selbst im Service-Worker-Cache. */

const APP_VERSION = 1;

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
      const r = indexedDB.open('buehnenton', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        if (!d.objectStoreNames.contains('audio')) d.createObjectStore('audio', { keyPath: 'id' });
      };
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

/* ===================== Zustand ===================== */
const defaultSettings = () => ({ fadeAll: 3, instant: false, keepAwake: true });
let state = { folders: [], activeFolder: null, settings: defaultSettings() };
const audioMeta = new Map(); // id -> {id,name,type,size,duration,peaks,peakMax}
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

let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 200);
}
function flushSave() {
  clearTimeout(saveTimer);
  return idbPut('kv', JSON.parse(JSON.stringify(state)), 'state').catch((e) => toast('Speichern fehlgeschlagen: ' + e.message));
}
const metaOf = (r) => ({ id: r.id, name: r.name, type: r.type, size: r.size, duration: r.duration, peaks: r.peaks, peakMax: r.peakMax || 1 });

async function load() {
  const s = await idbGet('kv', 'state');
  if (s && Array.isArray(s.folders)) {
    state = { folders: s.folders, activeFolder: s.activeFolder, settings: Object.assign(defaultSettings(), s.settings || {}) };
  }
  for (const r of (await idbAll('audio')) || []) audioMeta.set(r.id, metaOf(r));
  if (!state.folders.length) state.folders.push(newFolder('Vorstellung'));
  if (!folderById(state.activeFolder)) state.activeFolder = state.folders[0].id;
}

/* ===================== Audio-Grundlagen ===================== */
let ctx = null, master = null, unlocked = false;
function getCtx() {
  if (!ctx) {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* ältere Geräte */ }
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  return ctx;
}
function ensureCtx() { // nur aus einer Berührung heraus aufrufen
  getCtx();
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  if (!unlocked) { // iOS: einmal einen stillen Ton abspielen, damit Audio freigeschaltet ist
    unlocked = true;
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
    const p = c.decodeAudioData(ab, res, (e) => rej(e || new Error('decode')));
    if (p && p.then) p.then(res, rej);
  });
}

/* Dekodierte Töne im Arbeitsspeicher halten (damit sie sofort starten) */
const bufCache = new Map(); // audioId -> {buf, bytes, used}
const bufLoading = new Map();
const BUF_LIMIT = 450e6;
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
    const rec = await idbGet('audio', id);
    if (!rec || !rec.blob) throw new Error('Tondatei fehlt');
    const buf = await decode(await rec.blob.arrayBuffer());
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
  if (!tile.audioId || !audioMeta.has(tile.audioId)) { toast('Diesem Kasten ist noch kein Ton zugeordnet.'); return; }
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
  changed();
}
function toggleTile(tile) {
  ensureCtx();
  const v = voices.get(tile.id);
  if (!v) { startTile(tile); return; }
  if (v.state === 'paused') v.resume();
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
  else vs.filter((v) => v.state === 'paused').forEach((v) => v.resume());
  changed();
}
function stopAll() {
  startGen++;
  held.clear();
  liveVoices().forEach((v) => v.stop());
  changed();
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
  main.appendChild(grid);
  if (!f.tiles.length && !editMode) {
    main.appendChild(h('div', { class: 'empty' }, 'In diesem Ordner sind noch keine Kästen.', h('br'),
      'Tippe oben rechts auf ', h('b', null, 'BEARBEITEN'), ' und dann auf ', h('b', null, '+ Kasten'), ' oder ', h('b', null, 'Mehrere Töne'), '.'));
  }
  if (!isStandalone() && !localStorage.getItem('bt-hide-install')) {
    const b = h('div', { class: 'banner' }, h('b', null, 'Als App installieren: '),
      'In Safari unten bzw. oben auf das Teilen-Symbol tippen und „Zum Home-Bildschirm“ wählen. Danach öffnest du Bühnenton über das Symbol auf dem Home-Bildschirm – es funktioniert dann auch ganz ohne WLAN und Internet.',
      h('button', { onclick: () => { try { localStorage.setItem('bt-hide-install', '1'); } catch (e) { /* egal */ } b.remove(); } }, '×'));
    main.appendChild(b);
  }
  main.scrollTop = keepScroll;
  for (const [id, ref] of tileRefs) updateTileRef(ref, voices.get(id));
  requestAnimationFrame(drawTileWaves);
  updateStatus();
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
  const badges = h('div', { class: 'badges' },
    t.loop ? h('span', { class: 'badge', html: ICONS.loop }) : null,
    t.solo ? h('span', { class: 'badge' }, 'S') : null,
    t.hold ? h('span', { class: 'badge' }, 'Halten') : null);
  el.append(prog, h('div', { class: 'stateic', html: ICONS.pause }), h('div', { class: 'thead' }, t.name || 'Ohne Namen'), badges,
    h('div', { class: 'wwrap' }, meta ? cv : h('div', { class: 'nofile' }, 'kein Ton')),
    h('div', { class: 'times' }, elp, rem));
  if (editMode) {
    el.append(h('div', { class: 'grip', html: ICONS.grip }), h('div', { class: 'pen', html: ICONS.pen }));
  }
  if (t.hold && !editMode) el.style.touchAction = 'none';
  el.addEventListener('pointerdown', (e) => onTileDown(e, t, el));
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  tileRefs.set(t.id, { el, prog, elp, rem, cv, tile: t, idleRem, st: 'idle', on: false });
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
    if (e.target.closest('.grip')) { startDrag(e, t, el); return; }
    tapDetect(e, () => openTileDialog(activeFolder(), t));
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

/* Kästen verschieben (Bearbeiten-Modus, am Griff ziehen) */
function startDrag(e, t, el) {
  e.preventDefault();
  const id = e.pointerId, main = $('#main');
  const r0 = el.getBoundingClientRect();
  const ox = e.clientX - r0.left, oy = e.clientY - r0.top;
  let x = e.clientX, y = e.clientY, target = null, before = false, tabTarget = null;
  el.classList.add('dragging');
  const place = () => {
    el.style.transform = '';
    const b = el.getBoundingClientRect();
    el.style.transform = `translate(${x - ox - b.left}px, ${y - oy - b.top}px) scale(1.04)`;
  };
  const clearMarks = () => document.querySelectorAll('.drop-before,.drop-after,.drop-tab')
    .forEach((n) => n.classList.remove('drop-before', 'drop-after', 'drop-tab'));
  const findTarget = () => {
    clearMarks(); target = null; tabTarget = null;
    const under = document.elementFromPoint(x, y);
    const tab = under && under.closest('.tab[data-folder]');
    if (tab) {
      if (tab.dataset.folder !== state.activeFolder) { tabTarget = tab.dataset.folder; tab.classList.add('drop-tab'); }
      return;
    }
    const tl = under && under.closest('.tile[data-id]');
    if (tl && tl !== el) {
      const tr = tl.getBoundingClientRect();
      before = x < tr.left + tr.width / 2;
      target = tl.dataset.id;
      tl.classList.add(before ? 'drop-before' : 'drop-after');
    }
  };
  place();
  const scroller = setInterval(() => {
    const mr = main.getBoundingClientRect();
    let d = 0;
    if (y < mr.top + 70) d = -14; else if (y > mr.bottom - 70) d = 14;
    if (d) { const before0 = main.scrollTop; main.scrollTop += d; if (main.scrollTop !== before0) { place(); findTarget(); } }
  }, 16);
  const mv = (ev) => {
    if (ev.pointerId !== id) return;
    ev.preventDefault();
    x = ev.clientX; y = ev.clientY;
    place(); findTarget();
  };
  const up = (ev) => {
    if (ev.pointerId !== id) return;
    clearInterval(scroller);
    window.removeEventListener('pointermove', mv);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    clearMarks();
    el.classList.remove('dragging');
    el.style.transform = '';
    const f = activeFolder();
    if (ev.type === 'pointerup' && tabTarget) {
      const to = folderById(tabTarget);
      moveTile(t, f, to);
      toast('Nach „' + to.name + '“ verschoben');
    } else if (ev.type === 'pointerup' && target) {
      f.tiles.splice(f.tiles.indexOf(t), 1);
      let to = f.tiles.findIndex((x2) => x2.id === target);
      if (to < 0) to = f.tiles.length; else if (!before) to++;
      f.tiles.splice(to, 0, t);
    }
    save();
    render();
  };
  window.addEventListener('pointermove', mv, { passive: false });
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
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

async function importFile(file) {
  const ab = await file.arrayBuffer();
  let buf;
  try { buf = await decode(ab.slice(0)); }
  catch (e) { throw new Error('„' + file.name + '“ konnte nicht gelesen werden. Bitte eine Audiodatei (z. B. MP3, M4A, WAV) wählen.'); }
  const p = computePeaks(buf, 600);
  const rec = { id: uid(), name: file.name || 'Ton', type: file.type || '', size: ab.byteLength, duration: buf.duration,
    peaks: p.data, peakMax: p.max, added: Date.now(), blob: new Blob([ab], { type: file.type || 'application/octet-stream' }) };
  try { await idbPut('audio', rec); }
  catch (e) { throw new Error('Speichern fehlgeschlagen – ist der Speicher voll? (' + e.message + ')'); }
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
      const m = await importFile(files[i]);
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
    try { const m = await importFile(files[0]); setAudio(m.id); }
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
    switchRow('Bildschirm nicht ausschalten', s.keepAwake, (v) => { s.keepAwake = v; save(); updateWakeLock(); }, 'Das iPad bleibt an, solange die App offen ist.'),
    h('div', { class: 'section' }, h('h3', null, 'Tondateien'), libBtn, storageL),
    h('div', { class: 'section' }, h('h3', null, 'Sicherung'),
      h('p', { class: 'hint' }, 'Speichert alle Ordner, Kästen und Töne in eine Datei (z. B. in „Dateien“ oder iCloud). Damit kannst du alles auf ein anderes Gerät übertragen oder wiederherstellen.'),
      h('div', { class: 'btnrow' },
        h('button', { class: 'btn', onclick: exportBackup }, 'Sicherung erstellen'),
        h('button', { class: 'btn', onclick: importBackup }, 'Sicherung laden'))),
    h('div', { class: 'section' }, h('h3', null, 'So funktioniert’s'),
      h('ul', null,
        h('li', null, h('b', null, 'SPIELEN: '), 'Kasten antippen = Ton startet. Nochmal antippen = Ton stoppt (mit der eingestellten Ausblendzeit). Während er ausblendet nochmal tippen = sofort aus.'),
        h('li', null, 'Mehrere Töne können gleichzeitig laufen. ', h('b', null, 'Pause'), ' hält alle an (nochmal = weiter), ', h('b', null, 'Alle stoppen'), ' macht sofort alles aus, ', h('b', null, 'Ausblenden'), ' blendet alle zusammen sanft aus.'),
        h('li', null, h('b', null, 'BEARBEITEN: '), 'Kasten antippen = Name, Farbe, Lautstärke, Ein-/Ausblenden und Schnitt. Am Griff oben links ziehen = Kasten verschieben, auch auf einen anderen Ordner-Reiter.'),
        h('li', null, 'Den aktiven Ordner-Reiter im Bearbeiten-Modus antippen = Ordner umbenennen, Kastengröße ändern, löschen.'),
        h('li', null, 'Für die Vorstellung: iPad auf „Nicht stören“ stellen und die App nicht verlassen – im Hintergrund hält iPadOS die Töne an.'))),
    h('p', { class: 'hint', style: 'text-align:center;margin-top:18px' }, 'Bühnenton · Version ' + APP_VERSION + ' · alle Daten bleiben auf diesem Gerät'));
  modal({ title: 'Einstellungen', body, cancel: null, onDone: () => { stopKey('libprev'); renderTop(); } });
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
  audioMeta.delete(id); bufCache.delete(id); hiPeakCache.delete(id);
  for (const f of state.folders) for (const t of f.tiles) if (t.audioId === id) { t.audioId = null; t.start = 0; t.end = null; }
  save();
}

/* ---------- Sicherung ---------- */
const MAGIC = 'BUEHNENTON1';
async function exportBackup() {
  const b = busy('Sicherung wird vorbereitet …');
  let file;
  try {
    const recs = (await idbAll('audio')) || [];
    const header = { app: 'buehnenton', version: 1, created: new Date().toISOString(),
      state: { folders: state.folders, settings: state.settings }, audio: [] };
    const parts = [];
    let offset = 0;
    for (const r of recs) {
      header.audio.push({ id: r.id, name: r.name, type: r.type, duration: r.duration, peakMax: r.peakMax, added: r.added,
        peaks: Array.from(r.peaks || [], (x) => Math.round(x * 1000) / 1000), offset, size: r.blob.size });
      offset += r.blob.size;
      parts.push(r.blob);
    }
    const hj = new TextEncoder().encode(JSON.stringify(header));
    const len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(0, hj.length);
    const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
    const name = 'Buehnenton-Sicherung-' + d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + '.buehnenton';
    file = new File([new TextEncoder().encode(MAGIC), len, hj, ...parts], name, { type: 'application/octet-stream' });
  } catch (e) { b.done(); toast('Sicherung fehlgeschlagen: ' + e.message, 4500); return; }
  b.done();
  const canShare = navigator.canShare && navigator.canShare({ files: [file] });
  const download = () => {
    const url = URL.createObjectURL(file);
    const a = h('a', { href: url, download: file.name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  const m = modal({
    title: 'Sicherung', small: true, done: null, cancel: 'Schließen',
    body: h('div', null,
      h('p', null, 'Die Sicherung ist fertig (' + mb(file.size) + ').'),
      h('p', { class: 'hint' }, canShare ? 'Tippe auf „Sichern …“ und wähle dann „In Dateien sichern“ (oder AirDrop, iCloud …).' : 'Tippe auf „Herunterladen“.'),
      h('div', { class: 'btnrow' },
        canShare ? h('button', { class: 'btn primary', onclick: () => {
          navigator.share({ files: [file], title: file.name }).then(() => m.close()).catch((e) => { if (e.name !== 'AbortError') download(); });
        } }, 'Sichern …') : null,
        h('button', { class: 'btn', onclick: download }, 'Herunterladen'))),
  });
}
async function importBackup() {
  const files = await pickFiles('', false);
  const file = files[0];
  if (!file) return;
  let header, base;
  try {
    const head = new Uint8Array(await file.slice(0, MAGIC.length + 4).arrayBuffer());
    if (new TextDecoder().decode(head.slice(0, MAGIC.length)) !== MAGIC) throw new Error('Das ist keine Bühnenton-Sicherung.');
    const len = new DataView(head.buffer).getUint32(MAGIC.length);
    base = MAGIC.length + 4 + len;
    header = JSON.parse(new TextDecoder().decode(await file.slice(MAGIC.length + 4, base).arrayBuffer()));
  } catch (e) { toast(e.message || 'Datei konnte nicht gelesen werden.', 4500); return; }
  const folders = (header.state && header.state.folders) || [];
  const nt = folders.reduce((n, f) => n + f.tiles.length, 0);
  if (!await confirmDlg('Sicherung vom ' + new Date(header.created).toLocaleString('de-DE') + ' laden? Sie enthält ' + folders.length + ' Ordner, ' + nt + ' Kästen und ' + header.audio.length + ' Töne. Ordner mit gleichem Ursprung werden ersetzt, alle anderen bleiben erhalten.', 'Laden')) return;
  const b = busy('Sicherung wird geladen …');
  try {
    let i = 0;
    for (const a of header.audio) {
      b.set('Töne werden übernommen … ' + (++i) + ' von ' + header.audio.length);
      const ab = await file.slice(base + a.offset, base + a.offset + a.size).arrayBuffer();
      const rec = { id: a.id, name: a.name, type: a.type, size: a.size, duration: a.duration, peakMax: a.peakMax || 1,
        peaks: Float32Array.from(a.peaks || []), added: a.added, blob: new Blob([ab], { type: a.type || 'application/octet-stream' }) };
      await idbPut('audio', rec);
      audioMeta.set(rec.id, metaOf(rec));
      bufCache.delete(rec.id); hiPeakCache.delete(rec.id);
    }
    for (const f of folders) {
      const i2 = state.folders.findIndex((x) => x.id === f.id);
      if (i2 >= 0) state.folders[i2] = f; else state.folders.push(f);
    }
    // leeren Standard-Ordner entfernen, wenn er nie benutzt wurde
    if (state.folders.length > 1) state.folders = state.folders.filter((f) => f.tiles.length || folders.some((x) => x.id === f.id) || f.name !== 'Vorstellung');
    if (folders[0]) state.activeFolder = folders[0].id;
    await flushSave();
    b.done();
    document.querySelectorAll('.ov').forEach((o) => o.remove());
    render();
    toast('Sicherung geladen');
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

  // Audio auf iOS bei der ersten Berührung freischalten
  const unlock = () => { ensureCtx(); updateWakeLock(); };
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('touchend', unlock, true);
  document.addEventListener('touchstart', () => {}, { passive: true }); // :active auf iOS
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
    updateWakeLock();
  });
  window.addEventListener('pagehide', flushSave);
  let rt = 0;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(drawTileWaves, 120); });
}
main();
