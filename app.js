'use strict';

/* =========================================================
   Meine Rezepte – lokale Rezept-App (PWA, offline-fähig)
   Daten: Rezepte in IndexedDB, Kategorien in localStorage
   ========================================================= */

// ---------- Standard-Kategorien ----------
const DEFAULT_CATEGORIES = [
  { id: 'vorspeisen', name: 'Vorspeisen', emoji: '🥗', subs: ['Fisch', 'Fleisch', 'Vegetarisch', 'Vegan'] },
  { id: 'suppen', name: 'Suppen & Eintöpfe', emoji: '🍲', subs: ['Fisch', 'Fleisch', 'Vegetarisch', 'Vegan'] },
  { id: 'hauptgerichte', name: 'Hauptgerichte', emoji: '🍽️', subs: ['Fisch', 'Fleisch', 'Geflügel', 'Vegetarisch', 'Vegan', 'Nudeln', 'Aufläufe'] },
  { id: 'beilagen', name: 'Beilagen & Salate', emoji: '🥔', subs: ['Salate', 'Kartoffeln', 'Gemüse', 'Reis & Getreide', 'Saucen & Dips'] },
  { id: 'nachspeisen', name: 'Nachspeisen', emoji: '🍮', subs: ['Cremes & Puddings', 'Eis & Sorbet', 'Obst', 'Warme Desserts', 'Vegan'] },
  { id: 'kuchen', name: 'Kuchen & Torten', emoji: '🍰', subs: ['Blechkuchen', 'Torten', 'Rührkuchen', 'Obstkuchen', 'Käsekuchen', 'Muffins & Cupcakes', 'Ohne Backen'] },
  { id: 'gebaeck', name: 'Plätzchen & Gebäck', emoji: '🍪', subs: ['Weihnachtsplätzchen', 'Kekse', 'Hefegebäck', 'Herzhaftes Gebäck'] },
  { id: 'geburtstag', name: 'Geburtstag & Feste', emoji: '🎉', subs: ['Geburtstagskuchen', 'Kindergeburtstag', 'Fingerfood', 'Party-Buffet', 'Weihnachten', 'Ostern'] },
  { id: 'snacks', name: 'Snacks & Fingerfood', emoji: '🥨', subs: ['Herzhaft', 'Süß', 'Dips & Aufstriche'] },
  { id: 'fruehstueck', name: 'Frühstück & Brot', emoji: '🥐', subs: ['Brot', 'Brötchen', 'Süßes Frühstück', 'Herzhaftes Frühstück'] },
  { id: 'getraenke', name: 'Getränke', emoji: '🍹', subs: ['Ohne Alkohol', 'Mit Alkohol', 'Smoothies', 'Heißgetränke'] },
];

const TINTS = ['#f8e3dc', '#fbecd0', '#e3efd9', '#dcebf3', '#ece1f3', '#f6dde6', '#e0f0ea', '#f2e6d8'];

// ---------- Hilfsfunktionen ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid();
function norm(s) {
  return String(s ?? '').toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function plural(n, one, many) { return `${n} ${n === 1 ? one : many}`; }
function fmtTime(min) {
  min = Number(min);
  if (!min) return '';
  if (min < 60) return `${min} Min.`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- Speicher ----------
const DB = (() => {
  let dbp;
  function open() {
    if (!dbp) {
      dbp = new Promise((res, rej) => {
        const r = indexedDB.open('meine-rezepte', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('recipes', { keyPath: 'id' });
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    }
    return dbp;
  }
  async function run(mode, fn) {
    const db = await open();
    return new Promise((res, rej) => {
      const tx = db.transaction('recipes', mode);
      const req = fn(tx.objectStore('recipes'));
      tx.oncomplete = () => res(req ? req.result : undefined);
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
  }
  return {
    all: () => run('readonly', (s) => s.getAll()),
    put: (r) => run('readwrite', (s) => s.put(r)),
    del: (id) => run('readwrite', (s) => s.delete(id)),
  };
})();

const LS = {
  get(key, fallback) {
    try { const v = localStorage.getItem('rezepte.' + key); return v == null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(key, val) {
    try { localStorage.setItem('rezepte.' + key, JSON.stringify(val)); } catch { /* ignore */ }
  },
};

const state = {
  recipes: [],
  categories: [],
  lastList: '#/',
  sort: LS.get('sort', 'az'),
};

function buildDefaultCategories() {
  return DEFAULT_CATEGORIES.map((c) => ({
    id: c.id, name: c.name, emoji: c.emoji,
    subs: c.subs.map((s) => ({ id: slug(s), name: s })),
  }));
}
function saveCategories() { LS.set('categories', state.categories); }
const catById = (id) => state.categories.find((c) => c.id === id);
const subById = (cat, sid) => cat && cat.subs.find((s) => s.id === sid);
const recById = (id) => state.recipes.find((r) => r.id === id);

async function saveRecipe(r) {
  r.updated = Date.now();
  await DB.put(r);
  const i = state.recipes.findIndex((x) => x.id === r.id);
  if (i >= 0) state.recipes[i] = r; else state.recipes.push(r);
}
async function deleteRecipe(id) {
  await DB.del(id);
  state.recipes = state.recipes.filter((r) => r.id !== id);
}

// ---------- Rezept-Abfragen ----------
function recipesIn(catId, subId) {
  return state.recipes.filter((r) =>
    (r.cats || []).includes(catId) && (!subId || (r.subs || []).includes(`${catId}/${subId}`)));
}
function sortRecipes(list, mode = state.sort) {
  const l = [...list];
  if (mode === 'neu') l.sort((a, b) => (b.created || 0) - (a.created || 0));
  else if (mode === 'zeit') l.sort((a, b) => (Number(a.time) || 9999) - (Number(b.time) || 9999));
  else if (mode === 'gekocht') l.sort((a, b) => (b.lastCooked || 0) - (a.lastCooked || 0));
  else l.sort((a, b) => a.title.localeCompare(b.title, 'de'));
  return l;
}
function recipeSubLabels(r) {
  return (r.subs || []).map((key) => {
    const [cid, sid] = key.split('/');
    const s = subById(catById(cid), sid);
    return s ? s.name : null;
  }).filter(Boolean);
}
function recipeEmoji(r) {
  const c = catById((r.cats || [])[0]);
  return c ? c.emoji : '🍴';
}
function searchRecipes(q) {
  const terms = norm(q).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const scored = [];
  for (const r of state.recipes) {
    const title = norm(r.title);
    const cats = (r.cats || []).map((c) => catById(c)?.name || '').join(' ');
    const hay = norm([r.title, r.tags, cats, recipeSubLabels(r).join(' '), r.ingredients, r.notes].join(' '));
    if (!terms.every((t) => hay.includes(t))) continue;
    let score = 0;
    for (const t of terms) {
      if (title.startsWith(t)) score += 10;
      else if (title.includes(t)) score += 5;
      if (norm(r.tags).includes(t)) score += 3;
    }
    if (r.fav) score += 1;
    scored.push([score, r]);
  }
  return scored.sort((a, b) => b[0] - a[0] || a[1].title.localeCompare(b[1].title, 'de')).map((x) => x[1]);
}

// ---------- Mengen umrechnen ----------
const UNI_FRAC = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
const NUM = '\\d+\\s+\\d+\\/\\d+|\\d+[½¼¾⅓⅔⅛]|\\d+\\/\\d+|\\d+(?:[.,]\\d+)?|[½¼¾⅓⅔⅛]';
const QTY_RE = new RegExp(`^(${NUM})(?:\\s*(?:-|–|bis)\\s*(${NUM}))?`);
function toNum(s) {
  s = s.trim();
  let m;
  if ((m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/))) return +m[1] + m[2] / m[3];
  if ((m = s.match(/^(\d+)([½¼¾⅓⅔⅛])$/))) return +m[1] + UNI_FRAC[m[2]];
  if ((m = s.match(/^(\d+)\/(\d+)$/))) return m[1] / m[2];
  if (UNI_FRAC[s]) return UNI_FRAC[s];
  return parseFloat(s.replace(',', '.'));
}
function fmtNum(n) {
  if (n >= 20) return String(Math.round(n));
  const whole = Math.floor(n), f = n - whole;
  if (f < 0.04) return String(whole);
  if (f > 0.96) return String(whole + 1);
  for (const [sym, v] of Object.entries(UNI_FRAC)) {
    if (sym !== '⅛' && Math.abs(f - v) < 0.04) return (whole || '') + sym;
  }
  return (Math.round(n * 10) / 10).toString().replace('.', ',');
}
function isHeader(line) { return /^#/.test(line) || /:\s*$/.test(line); }
function cleanHeader(line) { return line.replace(/^#+\s*/, '').replace(/:\s*$/, ''); }
function splitLines(text) { return String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean); }

function renderIngredient(line, factor) {
  const m = line.match(QTY_RE);
  if (!m) return esc(line);
  const rest = line.slice(m[0].length);
  let q;
  if (factor === 1) q = m[0];
  else {
    q = fmtNum(toNum(m[1]) * factor);
    if (m[2]) q += '–' + fmtNum(toNum(m[2]) * factor);
  }
  return `<span class="qty">${esc(q)}</span>${esc(rest)}`;
}

// ---------- Timer in Schritten erkennen ----------
const TIME_RE = /(\d+(?:[.,]\d+)?)(?:\s*(?:-|–|bis)\s*(\d+(?:[.,]\d+)?))?\s*(Minuten|Minute|Min\.?|Stunden|Stunde|Std\.?|Sekunden|Sek\.?)(?![a-zäöü])/gi;
function renderStepText(text, stepLabel) {
  let out = '', last = 0;
  for (const m of text.matchAll(TIME_RE)) {
    out += esc(text.slice(last, m.index));
    const val = parseFloat((m[2] || m[1]).replace(',', '.'));
    const unit = m[3].toLowerCase();
    const secs = Math.round(val * (unit.startsWith('st') ? 3600 : unit.startsWith('se') ? 1 : 60));
    out += `<button class="timer-btn" data-action="timer" data-secs="${secs}" data-label="${esc(stepLabel)}">⏱ ${esc(m[0])}</button>`;
    last = m.index + m[0].length;
  }
  return out + esc(text.slice(last));
}

// ---------- Timer ----------
const timers = [];
let audioCtx;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audioCtx.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = 880;
      o.connect(g); g.connect(audioCtx.destination);
      g.gain.setValueAtTime(0.0001, t0 + i * 0.35);
      g.gain.exponentialRampToValueAtTime(0.4, t0 + i * 0.35 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.35 + 0.25);
      o.start(t0 + i * 0.35); o.stop(t0 + i * 0.35 + 0.3);
    }
  } catch { /* kein Audio */ }
  if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
}
function startTimer(secs, label) {
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch { /* */ }
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  timers.push({ id: uid(), label, end: Date.now() + secs * 1000, ringing: false });
  renderTimers();
  toast(`⏱ Timer gestartet: ${fmtDur(secs)}`);
}
function fmtDur(secs) {
  secs = Math.max(0, Math.round(secs));
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}
function renderTimers() {
  const inCook = !$('#cook').hidden;
  const host = inCook ? $('#cook-timers') : $('#timers');
  $('#timers').innerHTML = '';
  if (!host) return;
  host.innerHTML = timers.map((t) => {
    const left = (t.end - Date.now()) / 1000;
    return `<div class="timer ${t.ringing ? 'ring' : ''}">
      <span class="t">${t.ringing ? '⏰ Fertig!' : fmtDur(left)}</span>
      <span class="l">${esc(t.label)}</span>
      ${t.ringing ? '' : `<button data-action="timer-add" data-id="${t.id}">+1 Min</button>`}
      <button data-action="timer-stop" data-id="${t.id}">${t.ringing ? 'OK' : '✕'}</button>
    </div>`;
  }).join('');
}
setInterval(() => {
  if (!timers.length) return;
  for (const t of timers) {
    if (!t.ringing && Date.now() >= t.end) {
      t.ringing = true;
      if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
        try { new Notification('⏰ Timer fertig', { body: t.label, icon: 'icons/icon-192.png' }); } catch { /* */ }
      }
    }
  }
  if (timers.some((t) => t.ringing) && Math.floor(Date.now() / 1000) % 3 === 0) beep();
  renderTimers();
}, 1000);

// ---------- UI-Bausteine ----------
function topbar({ title = 'Meine Rezepte', back = null, actions = '' } = {}) {
  $('#topbar').innerHTML = `
    ${back ? `<a class="iconbtn" href="${esc(back)}" aria-label="Zurück">←</a>` : ''}
    <h1>${esc(title)}</h1>
    ${actions}`;
}
function setTab(tab) {
  $$('#tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
}
function recCard(r) {
  const subs = recipeSubLabels(r);
  const meta = [r.time ? `⏱ ${fmtTime(r.time)}` : '', subs[0] ? subs.slice(0, 2).join(' · ') : ''].filter(Boolean);
  return `<a class="rec-card" href="#/r/${encodeURIComponent(r.id)}">
    <div class="thumb">${r.image ? `<img src="${r.image}" alt="" loading="lazy">` : recipeEmoji(r)}</div>
    ${r.fav ? '<span class="fav">❤️</span>' : ''}
    <div class="body">
      <div class="title">${esc(r.title)}</div>
      <div class="meta">${meta.map((m) => `<span>${esc(m)}</span>`).join('')}</div>
    </div>
  </a>`;
}
function recGrid(list, emptyHtml) {
  if (!list.length) return emptyHtml || '<div class="empty"><span class="big">🍳</span>Noch keine Rezepte hier.</div>';
  return `<div class="rec-grid">${list.map(recCard).join('')}</div>`;
}
function sortSelect() {
  const opts = [['az', 'A–Z'], ['neu', 'Neueste'], ['zeit', 'Schnellste'], ['gekocht', 'Zuletzt gekocht']];
  return `<select data-action="sort" aria-label="Sortieren">
    ${opts.map(([v, l]) => `<option value="${v}" ${state.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
  </select>`;
}
function searchBox(value = '', autofocus = false) {
  return `<form class="searchbox" data-action="search-form" role="search">
    <span>🔍</span>
    <input type="search" name="q" placeholder="Rezept, Zutat oder Stichwort…" value="${esc(value)}"
      autocomplete="off" enterkeyhint="search" ${autofocus ? 'autofocus' : ''}>
    ${value ? '<button type="button" class="clear" data-action="search-clear" aria-label="Leeren">✕</button>' : ''}
  </form>`;
}

// ---------- Ansichten ----------
function viewHome() {
  topbar({ title: 'Meine Rezepte 🍳' });
  setTab('home');
  state.lastList = '#/';
  const favs = sortRecipes(state.recipes.filter((r) => r.fav), 'az');
  const recent = sortRecipes(state.recipes.filter((r) => r.lastCooked), 'gekocht').slice(0, 10);
  const total = state.recipes.length;
  return `
    ${searchBox()}
    <div class="section-title">Kategorien <small>${plural(total, 'Rezept', 'Rezepte')}</small></div>
    <div class="cat-grid">
      ${state.categories.map((c, i) => {
        const n = recipesIn(c.id).length;
        return `<a class="cat-tile" href="#/k/${encodeURIComponent(c.id)}" style="--tint:${TINTS[i % TINTS.length]}">
          <span class="emoji">${esc(c.emoji)}</span>
          <div><div class="name">${esc(c.name)}</div><div class="count">${plural(n, 'Rezept', 'Rezepte')}</div></div>
        </a>`;
      }).join('')}
    </div>
    ${favs.length ? `<div class="section-title">❤️ Favoriten <a class="muted" href="#/favoriten"><small>Alle →</small></a></div>
      <div class="scroller">${favs.slice(0, 12).map(recCard).join('')}</div>` : ''}
    ${recent.length ? `<div class="section-title">👩‍🍳 Zuletzt gekocht</div>
      <div class="scroller">${recent.map(recCard).join('')}</div>` : ''}
    ${!total ? `<div class="section-title"></div><div class="empty"><span class="big">📖</span>
      Dein Kochbuch ist noch leer.<br><br><a class="btn primary" href="#/neu">＋ Erstes Rezept anlegen</a></div>` : ''}
  `;
}

function viewCategory(catId, subId) {
  const cat = catById(catId);
  if (!cat) return viewNotFound();
  const sub = subId ? subById(cat, subId) : null;
  setTab('home');
  topbar({
    title: sub ? sub.name : cat.name,
    back: sub ? `#/k/${encodeURIComponent(cat.id)}` : '#/',
  });
  state.lastList = location.hash;
  const all = recipesIn(cat.id);
  const list = sortRecipes(sub ? recipesIn(cat.id, sub.id) : all);
  const newHref = `#/neu?k=${encodeURIComponent(cat.id)}${sub ? `&u=${encodeURIComponent(sub.id)}` : ''}`;
  const subTiles = cat.subs.map((s, i) => {
    const n = recipesIn(cat.id, s.id).length;
    return `<a class="cat-tile ${sub && sub.id === s.id ? 'selected' : ''}" style="--tint:${TINTS[(i + 2) % TINTS.length]}"
        href="#/k/${encodeURIComponent(cat.id)}/${encodeURIComponent(s.id)}">
      <span class="emoji">${esc(s.emoji || subEmoji(s.name, cat.emoji))}</span>
      <div><div class="name">${esc(s.name)}</div><div class="count">${plural(n, 'Rezept', 'Rezepte')}</div></div>
    </a>`;
  }).join('');
  return `
    <div class="cat-hero">
      <span class="emoji">${esc(cat.emoji)}</span>
      <div><h2>${esc(cat.name)}${sub ? ` · ${esc(sub.name)}` : ''}</h2>
      <p>${plural(list.length, 'Rezept', 'Rezepte')}</p></div>
    </div>
    ${cat.subs.length ? `<div class="section-title">Unterkategorien</div>
    <div class="cat-grid">
      <a class="cat-tile all ${!sub ? 'selected' : ''}" href="#/k/${encodeURIComponent(cat.id)}">
        <span class="emoji">📚</span>
        <div><div class="name">Alle anzeigen</div><div class="count">${plural(all.length, 'Rezept', 'Rezepte')}</div></div>
      </a>
      ${subTiles}
    </div>` : ''}
    <div class="toolbar"><h2>${sub ? esc(sub.name) : 'Alle Rezepte'}</h2>${list.length > 1 ? sortSelect() : ''}</div>
    ${recGrid(list, `<div class="empty"><span class="big">${esc(cat.emoji)}</span>
      Hier ist noch nichts drin.<br><br><a class="btn primary" href="${newHref}">＋ Rezept hinzufügen</a></div>`)}
  `;
}

function subEmoji(name, fallback) {
  const n = norm(name);
  const map = [
    ['fisch', '🐟'], ['fleisch', '🥩'], ['geflugel', '🍗'], ['vegan', '🌱'], ['vegetar', '🥦'], ['nudel', '🍝'],
    ['auflauf', '🫕'], ['salat', '🥗'], ['kartoffel', '🥔'], ['gemuse', '🥕'], ['reis', '🍚'], ['sauce', '🫙'], ['dip', '🫙'],
    ['creme', '🍮'], ['pudding', '🍮'], ['eis', '🍨'], ['obstkuchen', '🍓'], ['obst', '🍓'], ['warm', '🔥'],
    ['blech', '🟫'], ['torte', '🎂'], ['ruhr', '🧁'], ['kase', '🧀'], ['muffin', '🧁'], ['ohne backen', '❄️'],
    ['weihnacht', '🎄'], ['kekse', '🍪'], ['hefe', '🥯'], ['herzhaft', '🥨'], ['geburtstag', '🎂'], ['kinder', '🎈'],
    ['finger', '🍢'], ['buffet', '🍱'], ['ostern', '🐣'], ['suss', '🍬'], ['aufstrich', '🧈'], ['brotchen', '🥖'],
    ['brot', '🍞'], ['fruhstuck', '🍳'], ['ohne alkohol', '🧃'], ['mit alkohol', '🍷'], ['smoothie', '🥤'], ['heiss', '☕'],
  ];
  for (const [k, e] of map) if (n.includes(k)) return e;
  return fallback || '🍴';
}

function viewRecipe(id) {
  const r = recById(id);
  if (!r) return viewNotFound();
  setTab('');
  topbar({
    title: '',
    back: state.lastList || '#/',
    actions: `<button class="iconbtn" data-action="fav" data-id="${esc(r.id)}" aria-label="Favorit">${r.fav ? '❤️' : '🤍'}</button>
      <a class="iconbtn" href="#/bearbeiten/${encodeURIComponent(r.id)}" aria-label="Bearbeiten">✏️</a>`,
  });
  const chips = [];
  for (const cid of r.cats || []) {
    const c = catById(cid);
    if (!c) continue;
    const mySubs = (r.subs || []).filter((k) => k.startsWith(cid + '/')).map((k) => subById(c, k.split('/')[1])).filter(Boolean);
    chips.push(`<a class="chip accent" href="#/k/${encodeURIComponent(c.id)}">${esc(c.emoji)} ${esc(c.name)}</a>`);
    for (const s of mySubs) chips.push(`<a class="chip" href="#/k/${encodeURIComponent(c.id)}/${encodeURIComponent(s.id)}">${esc(s.name)}</a>`);
  }
  if (r.tags) for (const t of r.tags.split(',').map((x) => x.trim()).filter(Boolean)) {
    chips.push(`<a class="chip" href="#/suche?q=${encodeURIComponent(t)}">#${esc(t)}</a>`);
  }
  const servings = Number(r.servings) || 0;
  const ings = splitLines(r.ingredients);
  const steps = splitLines(r.steps);
  const src = r.source && /^https?:\/\//i.test(r.source)
    ? `<a href="${esc(r.source)}" target="_blank" rel="noopener" style="color:var(--accent);word-break:break-all">${esc(r.source)}</a>`
    : esc(r.source || '');
  return `
    <div class="hero">${r.image ? `<img src="${r.image}" alt="${esc(r.title)}">` : recipeEmoji(r)}</div>
    <div class="rec-head">
      <h2>${esc(r.title)}</h2>
      <div class="chips">${chips.join('')}</div>
    </div>
    <div class="facts">
      ${r.time ? `<div class="fact"><b>${esc(fmtTime(r.time))}</b><span>Zeit</span></div>` : ''}
      ${servings ? `<div class="fact"><b>${servings}</b><span>${esc(r.servingsUnit || 'Portionen')}</span></div>` : ''}
      <div class="fact"><b>${r.cookCount || 0}×</b><span>gekocht</span></div>
    </div>
    ${steps.length ? `<button class="btn primary block cook-cta" data-action="cook" data-id="${esc(r.id)}">👩‍🍳 Jetzt nachkochen – Schritt für Schritt</button>` : ''}
    ${ings.length ? `<section class="card">
      <h3>Zutaten
        ${servings ? `<span class="stepper">
          <button data-action="serv" data-d="-1" aria-label="Weniger">−</button>
          <span id="serv-label" data-base="${servings}" data-cur="${servings}">${servings} ${esc(r.servingsUnit || 'Portionen')}</span>
          <button data-action="serv" data-d="1" aria-label="Mehr">＋</button>
        </span>` : ''}
      </h3>
      <ul class="ingredients" id="ing-list">${ingList(ings, 1)}</ul>
    </section>` : ''}
    ${steps.length ? `<section class="card"><h3>Zubereitung</h3><ol class="steps">${stepList(steps)}</ol></section>` : ''}
    ${r.notes ? `<section class="card"><h3>💡 Tipps & Notizen</h3><p class="notes">${esc(r.notes)}</p></section>` : ''}
    ${r.source ? `<section class="card"><h3>📎 Quelle</h3><p class="notes">${src}</p></section>` : ''}
    <div class="rec-actions">
      <a class="btn" href="#/bearbeiten/${encodeURIComponent(r.id)}">✏️ Bearbeiten</a>
      <button class="btn" data-action="duplicate" data-id="${esc(r.id)}">📄 Duplizieren</button>
      <button class="btn danger" data-action="delete" data-id="${esc(r.id)}">🗑️ Löschen</button>
    </div>
  `;
}
function ingList(ings, factor) {
  return ings.map((l) => isHeader(l)
    ? `<li class="head"><span class="box"></span>${esc(cleanHeader(l))}</li>`
    : `<li data-action="tick"><span class="box"></span><span>${renderIngredient(l, factor)}</span></li>`).join('');
}
function stepList(steps) {
  let n = 0;
  return steps.map((l) => {
    if (isHeader(l) && l.length < 60) return `<li class="head">${esc(cleanHeader(l))}</li>`;
    n++;
    return `<li>${renderStepText(l, `Schritt ${n}`)}</li>`;
  }).join('');
}

function viewSearch(q) {
  setTab('search');
  topbar({ title: 'Suche' });
  state.lastList = location.hash;
  return `${searchBox(q, true)}<div id="search-results">${searchResults(q)}</div>`;
}
function searchResults(q) {
  if (!q.trim()) {
    const tags = [...new Set(state.recipes.flatMap((r) => (r.tags || '').split(',').map((t) => t.trim()).filter(Boolean)))].sort((a, b) => a.localeCompare(b, 'de'));
    const quick = ['Vegetarisch', 'Vegan', 'Fisch', 'Fleisch', 'Blechkuchen', 'Schnell', ...tags];
    return `<div class="section-title">Schnellsuche</div>
      <div class="chips" style="display:flex;flex-wrap:wrap;gap:8px">
        ${[...new Set(quick)].map((t) => `<a class="chip" href="#/suche?q=${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}
      </div>
      <p class="muted" style="margin-top:18px;font-size:.9rem">Tipp: Du kannst auch nach Zutaten suchen, z. B. „Zucchini Feta“.</p>`;
  }
  const res = norm(q) === 'schnell'
    ? sortRecipes(state.recipes.filter((r) => Number(r.time) && Number(r.time) <= 30 || norm(r.tags).includes('schnell')), 'zeit')
    : searchRecipes(q);
  return `<div class="toolbar"><h2>${plural(res.length, 'Treffer', 'Treffer')}</h2></div>
    ${recGrid(res, `<div class="empty"><span class="big">🤷</span>Nichts gefunden für „${esc(q)}“.</div>`)}`;
}

function viewFavorites() {
  setTab('fav');
  topbar({ title: 'Favoriten' });
  state.lastList = location.hash;
  const list = sortRecipes(state.recipes.filter((r) => r.fav));
  return `${list.length > 1 ? `<div class="toolbar"><h2>${plural(list.length, 'Rezept', 'Rezepte')}</h2>${sortSelect()}</div>` : ''}
    ${recGrid(list, '<div class="empty"><span class="big">🤍</span>Noch keine Favoriten.<br>Tippe in einem Rezept auf das Herz.</div>')}`;
}

let formImage = null;
function viewForm(id, params) {
  const r = id ? recById(id) : null;
  if (id && !r) return viewNotFound();
  setTab(r ? '' : 'new');
  topbar({ title: r ? 'Rezept bearbeiten' : 'Neues Rezept', back: r ? `#/r/${encodeURIComponent(r.id)}` : state.lastList });
  formImage = r ? r.image || null : null;
  const selCats = new Set(r ? r.cats : params.get('k') ? [params.get('k')] : []);
  const selSubs = new Set(r ? r.subs : params.get('k') && params.get('u') ? [`${params.get('k')}/${params.get('u')}`] : []);
  return `
  <form class="form" data-action="save" data-id="${r ? esc(r.id) : ''}" novalidate>
    <div class="field">
      <label for="f-title">Name des Rezepts *</label>
      <input type="text" id="f-title" name="title" required value="${esc(r?.title)}" placeholder="z. B. Omas Apfelkuchen">
    </div>
    <div class="field">
      <span class="label">Foto</span>
      <div class="photo-pick" id="photo-pick">${photoInner()}</div>
    </div>
    <div class="field">
      <span class="label">Kategorien * <span class="hint">– auch mehrere möglich, z. B. „Kuchen“ und „Geburtstag“</span></span>
      <div class="catpick">
        ${state.categories.map((c) => `
          <div class="cp">
            <label class="toggle"><input type="checkbox" name="cat" value="${esc(c.id)}" ${selCats.has(c.id) ? 'checked' : ''}> ${esc(c.emoji)} ${esc(c.name)}</label>
            ${c.subs.length ? `<div class="subs">${c.subs.map((s) => `
              <label class="subchip"><input type="checkbox" name="sub" value="${esc(c.id + '/' + s.id)}" ${selSubs.has(c.id + '/' + s.id) ? 'checked' : ''}><span>${esc(s.name)}</span></label>`).join('')}
            </div>` : ''}
          </div>`).join('')}
      </div>
    </div>
    <div class="row2">
      <div class="field">
        <label for="f-time">Zeit gesamt <span class="hint">(Min.)</span></label>
        <input type="number" id="f-time" name="time" min="0" inputmode="numeric" value="${esc(r?.time)}" placeholder="45">
      </div>
      <div class="field">
        <label for="f-serv">Menge</label>
        <div style="display:flex;gap:6px">
          <input type="number" id="f-serv" name="servings" min="0" step="1" inputmode="numeric" value="${esc(r?.servings ?? 4)}" style="width:40%">
          <input type="text" name="servingsUnit" value="${esc(r?.servingsUnit || 'Portionen')}" aria-label="Einheit" style="width:60%">
        </div>
      </div>
    </div>
    <div class="field">
      <label for="f-ing">Zutaten <span class="hint">– eine pro Zeile. Zwischenüberschriften mit Doppelpunkt, z. B. „Für den Teig:“</span></label>
      <textarea id="f-ing" name="ingredients" rows="8" placeholder="Für den Teig:\n250 g Mehl\n125 g Butter\n1 Prise Salz">${esc(r?.ingredients)}</textarea>
    </div>
    <div class="field">
      <label for="f-steps">Zubereitung <span class="hint">– ein Schritt pro Zeile. Zeiten wie „20 Min.“ werden zu Timern.</span></label>
      <textarea id="f-steps" name="steps" rows="8" placeholder="Ofen auf 180 °C vorheizen.\nMehl, Butter und Salz verkneten.\n30 Minuten kalt stellen.">${esc(r?.steps)}</textarea>
    </div>
    <div class="field">
      <label for="f-notes">Tipps & Notizen</label>
      <textarea id="f-notes" name="notes" rows="3" style="min-height:80px" placeholder="z. B. Schmeckt am nächsten Tag noch besser.">${esc(r?.notes)}</textarea>
    </div>
    <div class="field">
      <label for="f-tags">Stichwörter <span class="hint">– mit Komma getrennt</span></label>
      <input type="text" id="f-tags" name="tags" value="${esc(r?.tags)}" placeholder="schnell, Sommer, Oma">
    </div>
    <div class="field">
      <label for="f-src">Quelle <span class="hint">– Link, Buch oder von wem</span></label>
      <input type="text" id="f-src" name="source" value="${esc(r?.source)}" placeholder="https://… oder „Von Tante Anni“">
    </div>
    <button class="btn primary block" type="submit" style="padding:15px">💾 Speichern</button>
  </form>`;
}
function photoInner() {
  return formImage
    ? `<img src="${formImage}" alt=""><button type="button" class="rm" data-action="photo-rm">Entfernen</button>
       <input type="file" accept="image/*" data-action="photo" aria-label="Foto ändern">`
    : `<div>📷<br>Foto aufnehmen oder auswählen</div><input type="file" accept="image/*" data-action="photo" aria-label="Foto wählen">`;
}
function resizeImage(file, max = 1200) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Bild konnte nicht geladen werden')); };
    img.src = url;
  });
}

function viewSettings() {
  setTab('settings');
  topbar({ title: 'Mehr' });
  return `
    <div class="section-title">📂 Kategorien verwalten</div>
    <p class="muted" style="margin-top:-4px;font-size:.9rem">Namen und Emojis direkt antippen und ändern. Änderungen werden automatisch gespeichert.</p>
    <div id="cat-editor">${catEditor()}</div>
    <button class="btn block" data-action="cat-add">＋ Neue Kategorie</button>

    <div class="section-title">💾 Sicherung</div>
    <div class="card" style="margin-top:0">
      <p style="margin-top:0" class="muted">Deine Rezepte sind nur auf diesem Gerät gespeichert. Mach ab und zu eine Sicherung – damit kannst du sie auch auf ein anderes Gerät übertragen.</p>
      <div class="btn-row">
        <button class="btn primary" data-action="export">⬇️ Sicherung herunterladen</button>
        <label class="btn">⬆️ Sicherung einlesen<input type="file" accept="application/json,.json" data-action="import" hidden></label>
      </div>
    </div>

    <div class="section-title">ℹ️ Info</div>
    <div class="card" style="margin-top:0">
      <p style="margin-top:0">${plural(state.recipes.length, 'Rezept', 'Rezepte')} · ${plural(state.categories.length, 'Kategorie', 'Kategorien')}</p>
      <p class="muted" style="font-size:.9rem">Tipp: Über „Zum Startbildschirm hinzufügen“ im Browser-Menü wird die App wie eine normale App installiert und funktioniert auch offline.</p>
      <div class="btn-row">
        <button class="btn" data-action="seed">🍰 Beispielrezepte laden</button>
        <button class="btn danger" data-action="cat-reset">Kategorien zurücksetzen</button>
      </div>
    </div>`;
}
function catEditor() {
  return state.categories.map((c, i) => `
    <div class="set-cat" data-cat="${esc(c.id)}">
      <div class="line">
        <input class="em" value="${esc(c.emoji)}" data-action="cat-emoji" aria-label="Emoji" maxlength="4">
        <input class="nm" value="${esc(c.name)}" data-action="cat-name" aria-label="Name">
        <button class="mini" data-action="cat-up" ${i === 0 ? 'disabled' : ''} aria-label="Nach oben">↑</button>
        <button class="mini" data-action="cat-del" aria-label="Löschen">🗑️</button>
      </div>
      <div class="set-subs">
        ${c.subs.map((s) => `<span class="chip">${esc(s.name)}<button data-action="sub-del" data-sub="${esc(s.id)}" aria-label="${esc(s.name)} entfernen">×</button></span>`).join('')}
        <form class="add" data-action="sub-add"><input name="n" placeholder="＋ Unterkategorie" aria-label="Neue Unterkategorie"></form>
      </div>
    </div>`).join('');
}

function viewNotFound() {
  topbar({ title: 'Nicht gefunden', back: '#/' });
  return '<div class="empty"><span class="big">🫥</span>Das gibt es (nicht mehr).<br><br><a class="btn primary" href="#/">Zur Startseite</a></div>';
}

// ---------- Kochmodus ----------
const cook = { r: null, steps: [], i: 0, ings: false, wake: null };
function openCook(id) {
  const r = recById(id);
  if (!r) return;
  const steps = [];
  let head = '';
  let n = 0;
  for (const l of splitLines(r.steps)) {
    if (isHeader(l) && l.length < 60) { head = cleanHeader(l); continue; }
    steps.push({ text: l, head, n: ++n });
  }
  Object.assign(cook, { r, steps, i: 0, ings: false, factor: currentFactor() });
  $('#cook').hidden = false;
  document.body.style.overflow = 'hidden';
  requestWake();
  renderCook();
}
function currentFactor() {
  const l = $('#serv-label');
  return l ? Number(l.dataset.cur) / Number(l.dataset.base) : 1;
}
function closeCook() {
  $('#cook').hidden = true;
  document.body.style.overflow = '';
  releaseWake();
  renderTimers();
}
async function requestWake() {
  try { if ('wakeLock' in navigator) cook.wake = await navigator.wakeLock.request('screen'); } catch { /* */ }
}
function releaseWake() { try { cook.wake?.release(); } catch { /* */ } cook.wake = null; }
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !$('#cook').hidden) requestWake();
});
function renderCook() {
  const { r, steps, i } = cook;
  const done = i >= steps.length;
  const ings = splitLines(r.ingredients);
  const s = steps[i];
  $('#cook').innerHTML = `
    <div class="cook-top">
      <button class="iconbtn" data-action="cook-close" aria-label="Schließen">✕</button>
      <h2>${esc(r.title)}</h2>
      ${ings.length ? `<button class="btn" data-action="cook-ings">🧺 Zutaten</button>` : ''}
    </div>
    <div class="cook-progress"><div style="width:${steps.length ? Math.min(100, (i / steps.length) * 100) : 100}%"></div></div>
    <div class="cook-body" id="cook-body">
      ${done ? `<div class="cook-done"><div class="big">🎉</div><h2>Fertig! Guten Appetit!</h2>
          <p class="muted">Das Rezept wird als „gekocht“ gespeichert.</p></div>`
        : `<div class="cook-step-no">Schritt ${s.n} von ${steps.length}</div>
          ${s.head ? `<div class="cook-head">${esc(s.head)}</div>` : ''}
          <div class="cook-text">${renderStepText(s.text, `${r.title} – Schritt ${s.n}`)}</div>`}
    </div>
    <div id="cook-timers" class="timers timers-inline"></div>
    <div class="cook-nav">
      <button class="btn" data-action="cook-prev" ${i === 0 ? 'disabled style="opacity:.4"' : ''}>← Zurück</button>
      ${done ? `<button class="btn primary" data-action="cook-finish">✓ Schließen</button>`
        : `<button class="btn primary" data-action="cook-next">${i === steps.length - 1 ? 'Fertig 🎉' : 'Weiter →'}</button>`}
    </div>
    ${cook.ings ? `<div class="cook-ings"><h3 style="display:flex;justify-content:space-between;margin-top:0">🧺 Zutaten
      <button class="iconbtn" data-action="cook-ings" aria-label="Schließen">✕</button></h3>
      <ul class="ingredients">${ingList(ings, cook.factor || 1)}</ul></div>` : ''}`;
  renderTimers();
}
let touchX = null;
$('#cook').addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
$('#cook').addEventListener('touchend', (e) => {
  if (touchX == null || cook.ings) return;
  const dx = e.changedTouches[0].clientX - touchX;
  touchX = null;
  if (Math.abs(dx) < 70) return;
  if (dx < 0 && cook.i < cook.steps.length) { cook.i++; renderCook(); }
  if (dx > 0 && cook.i > 0) { cook.i--; renderCook(); }
});
document.addEventListener('keydown', (e) => {
  if ($('#cook').hidden || /input|textarea/i.test(e.target.tagName)) return;
  if (e.key === 'ArrowRight' && cook.i < cook.steps.length) { cook.i++; renderCook(); }
  if (e.key === 'ArrowLeft' && cook.i > 0) { cook.i--; renderCook(); }
  if (e.key === 'Escape') closeCook();
});

// ---------- Router ----------
function render() {
  const h = location.hash.slice(1) || '/';
  const [path, qs = ''] = h.split('?');
  const params = new URLSearchParams(qs);
  const p = path.split('/').filter(Boolean).map(decodeURIComponent);
  let html;
  if (!p.length) html = viewHome();
  else if (p[0] === 'k') html = viewCategory(p[1], p[2]);
  else if (p[0] === 'r') html = viewRecipe(p[1]);
  else if (p[0] === 'neu') html = viewForm(null, params);
  else if (p[0] === 'bearbeiten') html = viewForm(p[1], params);
  else if (p[0] === 'suche') html = viewSearch(params.get('q') || '');
  else if (p[0] === 'favoriten') html = viewFavorites();
  else if (p[0] === 'einstellungen') html = viewSettings();
  else html = viewNotFound();
  $('#app').innerHTML = html;
  if (!$('#cook').hidden) closeCook();
  window.scrollTo(0, 0);
  if (p[0] === 'suche') {
    const inp = $('#app input[name=q]');
    if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  }
}
window.addEventListener('hashchange', render);
window.addEventListener('scroll', () => $('#topbar').classList.toggle('scrolled', scrollY > 4), { passive: true });

// ---------- Events ----------
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  const id = el.dataset.id;
  switch (a) {
    case 'fav': {
      const r = recById(id);
      r.fav = !r.fav;
      await saveRecipe(r);
      el.textContent = r.fav ? '❤️' : '🤍';
      toast(r.fav ? 'Zu Favoriten hinzugefügt' : 'Aus Favoriten entfernt');
      break;
    }
    case 'tick': el.classList.toggle('done'); break;
    case 'serv': {
      const l = $('#serv-label');
      const base = Number(l.dataset.base);
      const step = base > 8 ? Math.ceil(base / 4) : 1;
      const cur = Math.max(step, Number(l.dataset.cur) + Number(el.dataset.d) * step);
      l.dataset.cur = cur;
      const r = recById(location.hash.split('/')[2] && decodeURIComponent(location.hash.split('/')[2]));
      l.textContent = `${cur} ${r?.servingsUnit || 'Portionen'}`;
      $('#ing-list').innerHTML = ingList(splitLines(r.ingredients), cur / base);
      break;
    }
    case 'timer': e.preventDefault(); startTimer(Number(el.dataset.secs), el.dataset.label); break;
    case 'timer-stop': {
      const i = timers.findIndex((t) => t.id === id);
      if (i >= 0) timers.splice(i, 1);
      renderTimers();
      break;
    }
    case 'timer-add': {
      const t = timers.find((x) => x.id === id);
      if (t) t.end += 60000;
      renderTimers();
      break;
    }
    case 'cook': openCook(id); break;
    case 'cook-close': closeCook(); break;
    case 'cook-ings': cook.ings = !cook.ings; renderCook(); break;
    case 'cook-next': cook.i++; renderCook(); break;
    case 'cook-prev': if (cook.i > 0) { cook.i--; renderCook(); } break;
    case 'cook-finish': {
      const r = cook.r;
      r.lastCooked = Date.now();
      r.cookCount = (r.cookCount || 0) + 1;
      await saveRecipe(r);
      closeCook();
      render();
      toast('Guten Appetit! 😋');
      break;
    }
    case 'delete': {
      const r = recById(id);
      if (!confirm(`„${r.title}“ wirklich löschen?`)) return;
      await deleteRecipe(id);
      toast('Rezept gelöscht');
      location.hash = state.lastList && !state.lastList.includes(id) ? state.lastList : '#/';
      break;
    }
    case 'duplicate': {
      const r = recById(id);
      const copy = { ...r, id: uid(), title: r.title + ' (Kopie)', created: Date.now(), fav: false, cookCount: 0, lastCooked: null };
      await saveRecipe(copy);
      location.hash = `#/bearbeiten/${copy.id}`;
      toast('Kopie erstellt');
      break;
    }
    case 'photo-rm': formImage = null; $('#photo-pick').innerHTML = photoInner(); break;
    case 'search-clear': location.hash = '#/suche'; break;
    case 'cat-add': {
      const name = prompt('Name der neuen Kategorie:');
      if (!name || !name.trim()) return;
      let cid = slug(name);
      while (catById(cid)) cid += '-' + Math.random().toString(36).slice(2, 4);
      state.categories.push({ id: cid, name: name.trim(), emoji: '🍴', subs: [] });
      saveCategories();
      $('#cat-editor').innerHTML = catEditor();
      toast('Kategorie angelegt');
      break;
    }
    case 'cat-del': {
      const cid = el.closest('[data-cat]').dataset.cat;
      const c = catById(cid);
      const n = recipesIn(cid).length;
      if (!confirm(`Kategorie „${c.name}“ löschen?${n ? `\n\n${plural(n, 'Rezept bleibt', 'Rezepte bleiben')} erhalten, sind aber nicht mehr in dieser Kategorie.` : ''}`)) return;
      state.categories = state.categories.filter((x) => x.id !== cid);
      saveCategories();
      $('#cat-editor').innerHTML = catEditor();
      break;
    }
    case 'cat-up': {
      const cid = el.closest('[data-cat]').dataset.cat;
      const i = state.categories.findIndex((x) => x.id === cid);
      if (i > 0) [state.categories[i - 1], state.categories[i]] = [state.categories[i], state.categories[i - 1]];
      saveCategories();
      $('#cat-editor').innerHTML = catEditor();
      break;
    }
    case 'sub-del': {
      const c = catById(el.closest('[data-cat]').dataset.cat);
      const s = subById(c, el.dataset.sub);
      if (!confirm(`Unterkategorie „${s.name}“ entfernen?`)) return;
      c.subs = c.subs.filter((x) => x.id !== s.id);
      saveCategories();
      $('#cat-editor').innerHTML = catEditor();
      break;
    }
    case 'cat-reset':
      if (!confirm('Alle Kategorien auf den Standard zurücksetzen? Eigene Kategorien gehen verloren (Rezepte bleiben erhalten).')) return;
      state.categories = buildDefaultCategories();
      saveCategories();
      render();
      toast('Kategorien zurückgesetzt');
      break;
    case 'seed': await seedExamples(true); render(); break;
    case 'export': exportBackup(); break;
  }
});

document.addEventListener('change', async (e) => {
  const el = e.target;
  const a = el.dataset.action;
  if (a === 'sort') {
    state.sort = el.value; LS.set('sort', state.sort); render();
  } else if (a === 'photo' && el.files[0]) {
    try {
      formImage = await resizeImage(el.files[0]);
      $('#photo-pick').innerHTML = photoInner();
    } catch (err) { toast(err.message); }
  } else if (a === 'import' && el.files[0]) {
    importBackup(el.files[0]);
    el.value = '';
  } else if (a === 'cat-name' || a === 'cat-emoji') {
    const c = catById(el.closest('[data-cat]').dataset.cat);
    const v = el.value.trim();
    if (!v) { el.value = a === 'cat-name' ? c.name : c.emoji; return; }
    if (a === 'cat-name') c.name = v; else c.emoji = v;
    saveCategories();
    toast('Gespeichert');
  } else if (el.name === 'sub' && el.checked) {
    // Unterkategorie gewählt → Hauptkategorie automatisch mit anhaken
    const main = el.closest('.cp').querySelector('input[name=cat]');
    if (main) main.checked = true;
  }
});

let searchDebounce;
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.name === 'q' && el.closest('[data-action=search-form]')) {
    if (!location.hash.startsWith('#/suche')) {
      location.hash = `#/suche?q=${encodeURIComponent(el.value)}`;
      return;
    }
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      const q = el.value;
      history.replaceState(null, '', q ? `#/suche?q=${encodeURIComponent(q)}` : '#/suche');
      state.lastList = location.hash;
      $('#search-results').innerHTML = searchResults(q);
    }, 120);
  }
});

document.addEventListener('submit', async (e) => {
  const f = e.target;
  const a = f.dataset.action;
  if (!a) return;
  e.preventDefault();
  if (a === 'search-form') {
    const q = f.q.value.trim();
    if (location.hash.startsWith('#/suche')) { f.q.blur(); return; }
    location.hash = q ? `#/suche?q=${encodeURIComponent(q)}` : '#/suche';
  } else if (a === 'sub-add') {
    const c = catById(f.closest('[data-cat]').dataset.cat);
    const name = f.n.value.trim();
    if (!name) return;
    let sid = slug(name);
    while (subById(c, sid)) sid += '-2';
    c.subs.push({ id: sid, name });
    saveCategories();
    $('#cat-editor').innerHTML = catEditor();
    const inp = $(`[data-cat="${CSS.escape(c.id)}"] .add input`);
    if (inp) inp.focus();
  } else if (a === 'save') {
    const fd = new FormData(f);
    const title = String(fd.get('title') || '').trim();
    const cats = fd.getAll('cat');
    if (!title) { toast('Bitte gib dem Rezept einen Namen'); f.title.focus(); return; }
    if (!cats.length) { toast('Bitte wähle mindestens eine Kategorie'); return; }
    const subs = fd.getAll('sub').filter((s) => cats.includes(s.split('/')[0]));
    const old = f.dataset.id ? recById(f.dataset.id) : null;
    const r = {
      ...(old || { id: uid(), created: Date.now(), fav: false, cookCount: 0 }),
      title, cats, subs,
      time: Number(fd.get('time')) || '',
      servings: Number(fd.get('servings')) || '',
      servingsUnit: String(fd.get('servingsUnit') || '').trim() || 'Portionen',
      ingredients: String(fd.get('ingredients') || '').trim(),
      steps: String(fd.get('steps') || '').trim(),
      notes: String(fd.get('notes') || '').trim(),
      tags: String(fd.get('tags') || '').trim(),
      source: String(fd.get('source') || '').trim(),
      image: formImage,
    };
    try {
      await saveRecipe(r);
    } catch (err) {
      toast('Speichern fehlgeschlagen: ' + (err?.message || err));
      return;
    }
    toast(old ? 'Änderungen gespeichert' : 'Rezept gespeichert 🎉');
    location.replace(`#/r/${encodeURIComponent(r.id)}`);
  }
});

// ---------- Sicherung ----------
function exportBackup() {
  const data = { app: 'meine-rezepte', version: 1, exported: new Date().toISOString(), categories: state.categories, recipes: state.recipes };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `rezepte-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('Sicherung heruntergeladen');
}
async function importBackup(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.recipes)) throw new Error('Keine gültige Sicherungsdatei');
    if (!confirm(`${plural(data.recipes.length, 'Rezept', 'Rezepte')} einlesen? Vorhandene Rezepte mit gleicher Kennung werden überschrieben.`)) return;
    if (Array.isArray(data.categories)) {
      for (const c of data.categories) {
        const mine = catById(c.id);
        if (!mine) state.categories.push(c);
        else for (const s of c.subs || []) if (!subById(mine, s.id)) mine.subs.push(s);
      }
      saveCategories();
    }
    for (const r of data.recipes) {
      if (!r || !r.id || !r.title) continue;
      await DB.put(r);
      const i = state.recipes.findIndex((x) => x.id === r.id);
      if (i >= 0) state.recipes[i] = r; else state.recipes.push(r);
    }
    toast('Sicherung eingelesen ✓');
    render();
  } catch (err) {
    toast('Fehler: ' + err.message);
  }
}

// ---------- Beispielrezepte ----------
const EXAMPLES = [
  {
    title: 'Zwetschgendatschi vom Blech', cats: ['kuchen'], subs: ['kuchen/blechkuchen', 'kuchen/obstkuchen'],
    time: 90, servings: 20, servingsUnit: 'Stück', tags: 'Herbst, Hefeteig',
    ingredients: 'Für den Hefeteig:\n500 g Mehl\n1 Würfel frische Hefe\n250 ml lauwarme Milch\n80 g Zucker\n80 g weiche Butter\n1 Ei\n1 Prise Salz\nFür den Belag:\n2 kg Zwetschgen\n2 EL Zucker\n1 TL Zimt\nFür die Streusel:\n200 g Mehl\n120 g Zucker\n130 g kalte Butter',
    steps: 'Hefe in der lauwarmen Milch mit 1 TL Zucker auflösen.\nMit Mehl, Zucker, Butter, Ei und Salz zu einem glatten Teig kneten.\nZugedeckt an einem warmen Ort 45 Minuten gehen lassen.\nZwetschgen waschen, entsteinen und vierteln.\nTeig auf einem gefetteten Blech ausrollen und die Zwetschgen dachziegelartig darauflegen.\nZucker und Zimt mischen und darüberstreuen.\nFür die Streusel alles mit den Fingern zu Streuseln verkneten und verteilen.\nIm vorgeheizten Ofen bei 180 °C Ober-/Unterhitze 35 Minuten backen.',
    notes: 'Mit Schlagsahne servieren. Lässt sich gut einfrieren.',
  },
  {
    title: 'Lachs mit Kräuterkruste', cats: ['hauptgerichte'], subs: ['hauptgerichte/fisch'],
    time: 30, servings: 2, tags: 'schnell',
    ingredients: '2 Lachsfilets (à 150 g)\n2 EL Semmelbrösel\n1 Bund Petersilie\n1 Zitrone (Abrieb und Saft)\n1 Knoblauchzehe\n2 EL Olivenöl\nSalz, Pfeffer',
    steps: 'Ofen auf 200 °C vorheizen.\nPetersilie fein hacken, Knoblauch pressen.\nMit Semmelbröseln, Zitronenabrieb und Olivenöl mischen, salzen und pfeffern.\nLachs in eine Auflaufform legen, mit Zitronensaft beträufeln und die Kräutermischung daraufdrücken.\nIm Ofen 15 Minuten backen, bis die Kruste goldbraun ist.',
    notes: 'Dazu passen Ofenkartoffeln oder Reis.',
  },
  {
    title: 'Tomaten-Bruschetta', cats: ['vorspeisen', 'snacks'], subs: ['vorspeisen/vegan', 'snacks/herzhaft'],
    time: 15, servings: 4, tags: 'schnell, Sommer, Italienisch',
    ingredients: '1 Baguette\n4 reife Tomaten\n1 Knoblauchzehe\n½ Bund Basilikum\n3 EL Olivenöl\nSalz, Pfeffer',
    steps: 'Baguette in Scheiben schneiden und im Ofen bei 200 °C 5 Minuten rösten.\nTomaten klein würfeln, Basilikum in Streifen schneiden.\nMit Olivenöl, Salz und Pfeffer mischen.\nBrotscheiben mit der halbierten Knoblauchzehe einreiben und mit den Tomaten belegen.',
  },
  {
    title: 'Schoko-Muffins', cats: ['kuchen', 'geburtstag'], subs: ['kuchen/muffins-cupcakes', 'geburtstag/kindergeburtstag'],
    time: 40, servings: 12, servingsUnit: 'Stück', tags: 'Kinder, Schokolade',
    ingredients: '200 g Mehl\n2 EL Kakao\n2 TL Backpulver\n150 g Zucker\n2 Eier\n120 ml Öl\n200 ml Milch\n100 g Schokotropfen',
    steps: 'Ofen auf 180 °C vorheizen und ein Muffinblech mit Förmchen auslegen.\nMehl, Kakao, Backpulver und Zucker mischen.\nEier, Öl und Milch verquirlen und kurz unter die trockenen Zutaten rühren.\nSchokotropfen unterheben und den Teig in die Förmchen füllen.\n20-25 Minuten backen und auf einem Gitter abkühlen lassen.',
    notes: 'Mit bunten Streuseln und Zuckerguss verzieren – perfekt für den Kindergeburtstag.',
  },
  {
    title: 'Tiramisu', cats: ['nachspeisen', 'geburtstag'], subs: ['nachspeisen/cremes-puddings', 'geburtstag/party-buffet'],
    time: 30, servings: 6, tags: 'Italienisch, ohne Backen',
    ingredients: '500 g Mascarpone\n3 frische Eier\n80 g Zucker\n200 g Löffelbiskuits\n300 ml starker Espresso (abgekühlt)\n2 EL Amaretto (optional)\nKakaopulver zum Bestäuben',
    steps: 'Eier trennen. Eigelb mit Zucker cremig schlagen und Mascarpone unterrühren.\nEiweiß steif schlagen und vorsichtig unterheben.\nEspresso mit Amaretto mischen.\nLöffelbiskuits kurz eintauchen und eine Form damit auslegen.\nHälfte der Creme darauf verteilen, dann noch eine Schicht Biskuits und die restliche Creme.\nMindestens 4 Stunden kalt stellen und vor dem Servieren mit Kakao bestäuben.',
  },
];
async function seedExamples(manual = false) {
  let n = 0;
  for (const ex of EXAMPLES) {
    if (manual && state.recipes.some((r) => r.title === ex.title)) continue;
    await saveRecipe({ ...ex, id: uid(), created: Date.now() - n * 1000, fav: n === 0, cookCount: 0, notes: ex.notes || '', source: '', image: null });
    n++;
  }
  LS.set('seeded', true);
  if (manual) toast(n ? `${plural(n, 'Beispielrezept', 'Beispielrezepte')} hinzugefügt` : 'Beispiele sind schon da');
}

// ---------- Start ----------
async function init() {
  state.categories = LS.get('categories', null) || buildDefaultCategories();
  if (!LS.get('categories', null)) saveCategories();
  try {
    state.recipes = await DB.all();
  } catch (err) {
    toast('Speicher nicht verfügbar: ' + err.message);
  }
  if (!state.recipes.length && !LS.get('seeded', false)) await seedExamples();
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
}
init();
