'use strict';

/* =========================================================
   Meine Rezepte – eingescannte Rezepte automatisch sortieren
   - Texterkennung (OCR) läuft lokal im Browser (Tesseract.js)
   - PDFs werden mit pdf.js gelesen
   - Rezepte + Scans in IndexedDB, Kategorien in localStorage
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
  { id: 'sonstiges', name: 'Noch nicht zugeordnet', emoji: '📄', subs: [] },
];
const TINTS = ['#f8e3dc', '#fbecd0', '#e3efd9', '#dcebf3', '#ece1f3', '#f6dde6', '#e0f0ea', '#f2e6d8'];

// ---------- Hilfsfunktionen ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
function norm(s) {
  return String(s ?? '').normalize('NFKC').toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid();
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const fmtDate = (t) => new Date(t).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
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
    try { const v = localStorage.getItem('rezepte.' + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, val) { try { localStorage.setItem('rezepte.' + key, JSON.stringify(val)); } catch { /* */ } },
};

const state = { recipes: [], categories: [], lastList: '#/', sort: LS.get('sort', 'neu') };

function buildDefaultCategories() {
  return DEFAULT_CATEGORIES.map((c) => ({ id: c.id, name: c.name, emoji: c.emoji, subs: c.subs.map((s) => ({ id: slug(s), name: s })) }));
}
function saveCategories() {
  LS.set('categories', state.categories);
  LS.set('catsUpdated', Date.now());
  LS.set('catsDirty', true);
  scheduleSync();
}
const catById = (id) => state.categories.find((c) => c.id === id);
const subById = (cat, sid) => cat && cat.subs.find((s) => s.id === sid);
const recById = (id) => state.recipes.find((r) => r.id === id);

// remote: Daten kommen aus dem Familien-Rezeptbuch · quiet: nur lokal (z. B. Favorit)
async function saveRecipe(r, { remote = false, quiet = false } = {}) {
  if (!remote && !quiet) { r.updated = Date.now(); r.dirty = true; }
  await DB.put(r);
  const i = state.recipes.findIndex((x) => x.id === r.id);
  if (i >= 0) state.recipes[i] = r; else state.recipes.push(r);
  delete searchCache[r.id];
  if (!remote && !quiet) scheduleSync();
}
async function deleteRecipe(id, { remote = false } = {}) {
  const r = recById(id);
  await DB.del(id);
  state.recipes = state.recipes.filter((x) => x.id !== id);
  dropUrls(id);
  if (!remote && r && r.synced) {
    LS.set('pendingDeletes', [...LS.get('pendingDeletes', []), id]);
    scheduleSync();
  }
}

// Bild-URLs für gespeicherte Scans (Blobs)
const urlCache = new Map();
function blobUrl(key, blob) {
  if (!blob) return '';
  if (typeof blob === 'string') return blob; // ältere Daten: data-URL
  if (!urlCache.has(key)) urlCache.set(key, URL.createObjectURL(blob));
  return urlCache.get(key);
}
function dropUrls(id) {
  for (const [k, u] of urlCache) if (k.startsWith(id + ':')) { URL.revokeObjectURL(u); urlCache.delete(k); }
}
const thumbUrl = (r) => r.thumb ? blobUrl(`${r.id}:thumb`, r.thumb) : (r.image || '');
const pageUrl = (r, i) => blobUrl(`${r.id}:p${i}`, r.pages[i]);

// ---------- Abfragen ----------
function recipesIn(catId, subId) {
  return state.recipes.filter((r) => (r.cats || []).includes(catId) && (!subId || (r.subs || []).includes(`${catId}/${subId}`)));
}
function sortRecipes(list, mode = state.sort) {
  const l = [...list];
  if (mode === 'neu') l.sort((a, b) => (b.created || 0) - (a.created || 0));
  else l.sort((a, b) => a.title.localeCompare(b.title, 'de'));
  return l;
}
function recipeSubLabels(r) {
  return (r.subs || []).map((key) => {
    const [cid, sid] = key.split('/');
    return subById(catById(cid), sid)?.name;
  }).filter(Boolean);
}
const recipeEmoji = (r) => catById((r.cats || [])[0])?.emoji || '📄';
const recipeText = (r) => r.text || [r.ingredients, r.steps, r.notes].filter(Boolean).join('\n');

/* =========================================================
   Automatische Kategorie-Erkennung
   Schlüsselwörter (normalisiert: klein, ohne Umlaute, ß→ss)
   "=wort" → ganzes Wort, "^wort" → Wortanfang, sonst Teilwort
   ========================================================= */
const FISH = { fisch: 5, lachs: 5, forelle: 5, thunfisch: 5, kabeljau: 5, dorsch: 5, zander: 5, hering: 5, matjes: 5, garnele: 5, shrimp: 5, scampi: 5, krabbe: 5, muschel: 5, tintenfisch: 5, calamar: 5, sardine: 5, sardelle: 5, scholle: 5, barsch: 5, karpfen: 5, meeresfrucht: 5, rollmops: 5, dorade: 5, '^hummer': 5 };
const MEAT = { fleisch: 4, '^rind': 4, schwein: 5, '^kalb': 4, '^lamm': 5, hackfleisch: 5, '=gehacktes': 4, speck: 4, schinken: 4, wurst: 4, salami: 4, bacon: 4, gulasch: 4, schnitzel: 3, steak: 4, kotelett: 4, '^leber': 4, hirsch: 4, '=reh': 4, chorizo: 4, pancetta: 4, kassler: 5, kasseler: 5, frikadelle: 3, '^mett': 3, rouladen: 3, ochsen: 4, '^wild': 2 };
const POULTRY = { hahnchen: 5, '^huhn': 5, huhnerbrust: 5, '^pute': 5, '=ente': 5, entenbrust: 5, '^gans': 5, gansebraten: 5, geflugel: 5, chicken: 5, poulet: 5, hendl: 5 };
const ANIMAL = { milch: 1, sahne: 1, butter: 1, kase: 1, quark: 1, joghurt: 1, '=ei': 1, '=eier': 1, eigelb: 1, eiweiss: 1, honig: 1, schmand: 1, 'creme fraiche': 1, mascarpone: 1, mozzarella: 1, parmesan: 1, '=feta': 1, gelatine: 1, ricotta: 1 };

const RULES = {
  kuchen: {
    kw: { kuchen: 5, torte: 5, springform: 4, tortenboden: 4, biskuit: 3, gugelhupf: 5, napfkuchen: 5, kastenform: 3, muffin: 5, cupcake: 5, '^tarte': 4, streusel: 2, tortenguss: 4, zuckerguss: 2, kuvertur: 1, backblech: 1 },
    subs: {
      blechkuchen: { blechkuchen: 6, '^blech': 4, backblech: 3, fettpfanne: 3, 'vom blech': 4, 'auf dem blech': 4 },
      torten: { torte: 5, sahnetorte: 6, tortenring: 4, tortenboden: 3, biskuit: 4, 'steif schlagen': 3, 'steif geschlagen': 3, buttercreme: 4, fullung: 2, '^schicht': 2, waagerecht: 3, 'boden halbieren': 4, 'einmal durchschneiden': 4, sahnesteif: 3 },
      ruhrkuchen: {
        ruhrkuchen: 6, ruhrteig: 5, gugelhupf: 5, napfkuchen: 5, kastenform: 3, marmorkuchen: 6, kastenkuchen: 5,
        zitronenkuchen: 4, schokokuchen: 4, schokoladenkuchen: 4, schokoladekuchen: 4, nusskuchen: 4, rotweinkuchen: 5,
        eierlikorkuchen: 5, kokoskuchen: 3, mandelkuchen: 3, joghurtkuchen: 4, saftkuchen: 4, sandkuchen: 5, topfkuchen: 5,
        '^schaumig': 3, '^ruhrgerat': 2, handruhrgerat: 2, '^mixer': 1, unterruhren: 2, '^verruhren': 1, '^glatt ruhren': 2,
        springform: 2, '^backpulver': 2, 'eier einzeln': 3, 'stabchenprobe': 3, 'holzstabchen': 2,
      },
      obstkuchen: { apfel: 3, kirsch: 3, zwetschg: 4, pflaum: 4, erdbeer: 3, rhabarber: 4, aprikos: 3, '^birne': 3, johannisbeer: 3, heidelbeer: 3, himbeer: 3, stachelbeer: 3, obst: 3, pfirsich: 3, mirabell: 3 },
      kasekuchen: { kasekuchen: 6, '^quark': 4, magerquark: 4, frischkase: 3, cheesecake: 6 },
      'muffins-cupcakes': { muffin: 6, cupcake: 6, formchen: 2 },
      'ohne-backen': { 'ohne backen': 6, kuhlschrank: 2, gelatine: 2 },
    },
  },
  gebaeck: {
    kw: { platzchen: 6, '^keks': 5, kekse: 5, ausstech: 5, vanillekipferl: 6, kipferl: 5, lebkuchen: 5, stollen: 4, makrone: 5, spritzgeback: 6, zimtstern: 6, hefezopf: 5, '^zopf': 3, brezel: 3, schnecken: 3, plunder: 4, croissant: 3, '^berliner': 3, krapfen: 4, cookie: 5, geback: 4, spekulatius: 5, florentiner: 5 },
    subs: {
      weihnachtsplatzchen: { weihnacht: 4, platzchen: 3, zimtstern: 5, vanillekipferl: 5, lebkuchen: 4, spekulatius: 5, advent: 3, stollen: 4 },
      kekse: { '^keks': 5, kekse: 5, cookie: 5 },
      hefegeback: { '^hefe': 4, hefeteig: 4, zopf: 3, schnecken: 2, berliner: 3, krapfen: 3, dampfnudel: 4 },
      'herzhaftes-geback': { schinken: 2, brezel: 3, pizza: 3, quiche: 3, '^kase': 1 },
    },
  },
  nachspeisen: {
    kw: { dessert: 5, nachspeise: 6, nachtisch: 6, pudding: 5, mousse: 5, tiramisu: 6, 'panna cotta': 6, parfait: 5, '=eis': 4, speiseeis: 5, eiscreme: 5, sorbet: 6, kompott: 5, crumble: 4, grutze: 6, vanillesauce: 4, vanillesosse: 4, souffle: 4, kaiserschmarrn: 6, strudel: 3, trifle: 5, schichtdessert: 6, 'creme brulee': 6, milchreis: 4, griessbrei: 4, quarkspeise: 6, '^creme': 2, mascarpone: 1 },
    subs: {
      'cremes-puddings': { '^creme': 3, pudding: 5, mousse: 4, tiramisu: 4, 'panna cotta': 4, quarkspeise: 4, mascarpone: 2, grutze: 3 },
      'eis-sorbet': { '=eis': 5, speiseeis: 5, sorbet: 6, parfait: 4, eismaschine: 6, gefrier: 3 },
      obst: { '^obst': 3, beeren: 3, kompott: 4, obstsalat: 6, erdbeer: 2 },
      'warme-desserts': { kaiserschmarrn: 5, strudel: 4, crumble: 4, souffle: 4, 'warm servier': 3, dampfnudel: 4, pfannkuchen: 3, crepe: 3, milchreis: 3, griessbrei: 3 },
      vegan: { vegan: 6 },
    },
  },
  vorspeisen: {
    kw: { vorspeise: 6, antipast: 5, carpaccio: 6, bruschetta: 6, terrine: 4, '^tatar': 4, amuse: 5, crostini: 5, vitello: 5, tapas: 4, 'zum auftakt': 4 },
    savory: true,
  },
  suppen: {
    kw: { suppe: 6, eintopf: 6, '^bruhe': 3, gemusebruhe: 2, bouillon: 3, gazpacho: 6, minestrone: 6, borschtsch: 6, consomme: 5, chowder: 6 },
    savory: true,
  },
  hauptgerichte: {
    kw: { hauptgericht: 6, '^braten': 4, schweinebraten: 5, gulasch: 5, schnitzel: 5, auflauf: 4, lasagne: 5, '^nudel': 3, pasta: 3, spaghetti: 4, risotto: 4, curry: 4, geschnetzelt: 5, rouladen: 5, frikadelle: 4, '^filet': 2, steak: 4, burger: 4, pizza: 3, gratin: 3, spatzle: 3, kasspatzle: 5, ragout: 4, sauerbraten: 6, hackbraten: 6, bratling: 4, '=wok': 3, chili: 3, quiche: 3, flammkuchen: 4, maultasche: 5, tacos: 4, paella: 5, hackfleisch: 3, hahnchen: 3, lachs: 2, '^fisch': 2, '^rind': 2, '^gnocchi': 3, '^tagliatelle': 4, '^penne': 4, 'als hauptgericht': 4 },
    savory: true,
    subs: {
      nudeln: { '^nudel': 4, pasta: 4, spaghetti: 5, lasagne: 4, tagliatelle: 5, penne: 5, spatzle: 3, gnocchi: 3, maultasche: 3, makkaroni: 5 },
      auflaufe: { auflauf: 6, gratin: 5, lasagne: 3, uberbacken: 3 },
    },
  },
  beilagen: {
    kw: { beilage: 6, salat: 4, kartoffelsalat: 6, pommes: 4, '^knodel': 4, kartoffelknodel: 4, '^klosse': 4, '^pure': 3, kartoffelpure: 4, dressing: 4, vinaigrette: 4, rotkohl: 5, blaukraut: 5, sauerkraut: 4, kroketten: 5, bratkartoffel: 6, '^rosti': 4, couscous: 3, bulgur: 3, quinoa: 3, pesto: 3, remoulade: 4, aioli: 4, mayonnaise: 2, '^sosse': 2, '^sauce': 2 },
    subs: {
      salate: { salat: 6, dressing: 3, vinaigrette: 3 },
      kartoffeln: { kartoffel: 5, pommes: 4, knodel: 3, klosse: 3, rosti: 4, kroketten: 4 },
      gemuse: { gemuse: 4, rotkohl: 4, blaukraut: 4, karotte: 2, mohre: 2, brokkoli: 3, spargel: 3, blumenkohl: 3, rosenkohl: 3 },
      'reis-getreide': { '^reis': 4, couscous: 4, bulgur: 4, quinoa: 4, polenta: 4, hirse: 4, graupen: 4 },
      'saucen-dips': { '^sosse': 4, '^sauce': 4, '^dip': 4, pesto: 4, mayonnaise: 3, aioli: 4, remoulade: 4, dressing: 2 },
    },
  },
  snacks: {
    kw: { snack: 6, fingerfood: 6, '^dip': 3, aufstrich: 5, '^chips': 4, popcorn: 5, nachos: 4, '^wrap': 3, spiesschen: 4, riegel: 3, cracker: 4, hummus: 5, guacamole: 5, obatzda: 6, tzatziki: 5, 'kleine happen': 5 },
    subs: {
      herzhaft: { '^kase': 1, schinken: 2, cracker: 3, nachos: 3, chips: 3, salzig: 2, '^wrap': 2 },
      suss: { '^zucker': 1, schoko: 2, riegel: 3, karamell: 3, popcorn: 2 },
      'dips-aufstriche': { '^dip': 5, aufstrich: 5, hummus: 5, guacamole: 5, obatzda: 5, tzatziki: 5 },
    },
  },
  fruehstueck: {
    kw: { fruhstuck: 6, '^brot': 4, brotchen: 5, sauerteig: 6, vollkornbrot: 6, brotbackform: 5, baguette: 3, musli: 5, granola: 5, porridge: 6, 'overnight oats': 6, pancake: 5, waffel: 5, ruhrei: 5, omelett: 4, marmelade: 5, konfitur: 5, semmel: 5, weckle: 5 },
    subs: {
      brot: { '^brot': 5, sauerteig: 5, '=laib': 3, brotbackform: 4, vollkorn: 2 },
      brotchen: { brotchen: 6, semmel: 6, weckle: 6, laugen: 3 },
      'susses-fruhstuck': { pancake: 5, waffel: 5, marmelade: 5, konfitur: 5, musli: 4, granola: 4, porridge: 4, 'french toast': 5 },
      'herzhaftes-fruhstuck': { ruhrei: 5, omelett: 5, spiegelei: 5, bacon: 3 },
    },
  },
  getraenke: {
    kw: { getrank: 6, cocktail: 6, bowle: 6, punsch: 6, gluhwein: 6, likor: 4, limonade: 6, smoothie: 6, '^shake': 4, milchshake: 6, eistee: 6, '^sirup': 4, aperitif: 5, mocktail: 6, '=tee': 2, '^kakao': 1 },
    subs: {
      'ohne-alkohol': { limonade: 5, eistee: 5, '^sirup': 3, alkoholfrei: 6, mocktail: 6 },
      'mit-alkohol': { likor: 5, '=rum': 4, wodka: 5, '=gin': 4, '=sekt': 4, '=wein': 3, rotwein: 3, weisswein: 3, prosecco: 5, schnaps: 5, aperol: 5, cocktail: 2, bowle: 2 },
      smoothies: { smoothie: 6, '^shake': 4 },
      heissgetranke: { gluhwein: 5, punsch: 4, '^kakao': 4, '^kaffee': 4, '=tee': 4, chai: 5, 'heiss servieren': 3 },
    },
  },
  geburtstag: {
    kw: { geburtstag: 8, kindergeburtstag: 8, '^party': 5, buffet: 5, feier: 3, festtag: 4, weihnacht: 3, '^oster': 4, silvester: 5, hochzeit: 5, jubilaum: 5, einschulung: 6, kommunion: 6, konfirmation: 6, '^taufe': 5 },
    subs: {
      geburtstagskuchen: { geburtstagskuchen: 6, geburtstagstorte: 6, geburtstag: 2, kerzen: 3 },
      kindergeburtstag: { kindergeburtstag: 6, '^kinder': 3, smarties: 3 },
      fingerfood: { fingerfood: 6, happchen: 4, spiess: 3 },
      'party-buffet': { buffet: 6, '^party': 4 },
      weihnachten: { weihnacht: 6, advent: 4, nikolaus: 4 },
      ostern: { '^oster': 6 },
    },
  },
};

const CLASSIFIER_VERSION = 2; // erhöhen, wenn sich die Erkennung ändert → alte Rezepte werden neu einsortiert
const kwCache = new Map();
function kwRegex(k) {
  if (!kwCache.has(k)) {
    const body = k.replace(/^[=^]/, '').replace(/[.*+?()[\]{}|\\]/g, '\\$&').replace(/ /g, '\\s+');
    const re = k[0] === '=' ? new RegExp(`\\b${body}\\b`) : k[0] === '^' ? new RegExp(`\\b${body}`) : new RegExp(body);
    kwCache.set(k, re);
  }
  return kwCache.get(k);
}
function kwScore(dict, body, title) {
  let s = 0;
  for (const [k, w] of Object.entries(dict)) {
    const re = kwRegex(k);
    if (re.test(title)) s += w * 3;
    else if (re.test(body)) s += w;
  }
  return s;
}

function classify(text, title) {
  const body = norm(text).replace(/-\s*\n\s*/g, '').replace(/\s+/g, ' ');
  const ti = norm(title);
  const has = (re) => re.test(body);
  const scores = {};
  for (const [cid, rule] of Object.entries(RULES)) {
    if (!catById(cid)) continue;
    scores[cid] = kwScore(rule.kw, body, ti);
  }
  // Allgemeine Hinweise: Backen + Süßes → Kuchen/Gebäck
  const baking = has(/backofen|vorheizen|backen|umluft|unterhitze|°\s*c|\bgrad\b/) && has(/\bmehl\b|weizenmehl|backpulver/);
  const sweet = has(/\bzucker\b|puderzucker|vanille|schokolade|kakao/);
  if (scores.kuchen != null && baking && sweet) scores.kuchen += 3;
  if (scores.gebaeck != null && baking && sweet) scores.gebaeck += 1;
  // Fleisch/Fisch spricht eher für herzhafte Gerichte
  const fish = kwScore(FISH, body, ti), meat = kwScore(MEAT, body, ti), poultry = kwScore(POULTRY, body, ti);
  if (scores.hauptgerichte != null && (fish || meat || poultry) && !(baking && sweet)) scores.hauptgerichte += 2;

  const main = Object.entries(scores).filter(([c]) => c !== 'geburtstag').sort((a, b) => b[1] - a[1]);
  const cats = [];
  if (main.length && main[0][1] >= 3) {
    cats.push(main[0][0]);
    if (main[1] && main[1][1] >= 6 && main[1][1] >= main[0][1] * 0.8) cats.push(main[1][0]);
  }
  if ((scores.geburtstag || 0) >= 5) cats.push('geburtstag');
  if (!cats.length) cats.push(catById('sonstiges') ? 'sonstiges' : state.categories[0]?.id);

  // Unterkategorien
  const subs = [];
  const isVegan = /\bvegan/.test(body + ' ' + ti);
  const plant = /(kokos|hafer|soja|mandel|reis|dinkel|cashew)(milch|sahne|joghurt|drink)|(erdnuss|kakao|mandel|nuss)butter|vegane?\s*(butter|margarine)/g;
  const animal = kwScore(ANIMAL, body.replace(plant, ' '), ti.replace(plant, ' '));
  for (const cid of cats) {
    const cat = catById(cid), rule = RULES[cid];
    if (!cat || !rule) continue;
    const add = (sid) => { if (subById(cat, sid) && !subs.includes(`${cid}/${sid}`)) subs.push(`${cid}/${sid}`); };
    if (rule.savory) {
      if (fish) add('fisch');
      if (poultry) subById(cat, 'geflugel') ? add('geflugel') : add('fleisch');
      if (meat) add('fleisch');
      if (!fish && !meat && !poultry) {
        add('vegetarisch');
        if (isVegan || !animal) add('vegan');
      }
    }
    if (rule.subs) {
      const ss = Object.entries(rule.subs).map(([sid, d]) => [sid, kwScore(d, body, ti)]).filter(([, s]) => s >= 3).sort((a, b) => b[1] - a[1]);
      if (ss.length) ss.filter(([, s]) => s >= ss[0][1] * 0.6).slice(0, 2).forEach(([sid]) => add(sid));
      // Nichts Eindeutiges gefunden? Dann die beste Unterkategorie mit schwächeren Hinweisen nehmen
      if (!subs.some((k) => k.startsWith(cid + '/'))) {
        const weak = Object.entries(rule.subs).map(([sid, d]) => [sid, kwScore(d, body, ti)]).filter(([, sc]) => sc >= 1).sort((a, b) => b[1] - a[1]);
        if (weak.length) add(weak[0][0]);
        else if (cid === 'kuchen' && baking) add('ruhrkuchen'); // gebackener Kuchen ohne weitere Hinweise: meist ein Rührkuchen
      }
    }
    if (cid === 'nachspeisen' && isVegan) add('vegan');
    if (cid === 'geburtstag' && cats.includes('kuchen') && !subs.some((s) => s.startsWith('geburtstag/'))) add('geburtstagskuchen');
  }
  return { cats, subs };
}

// ---------- Titel aus dem erkannten Text bestimmen ----------
const NOT_TITLE = /^(zutaten|zubereitung|fur\s|für\s|menge|portion|personen|rezept\b|seite\s|zubereitungszeit|backzeit|tipp)/i;
function pickTitle(lines, fallback) {
  // lines: [{text, h}] in Lesereihenfolge
  const cands = lines.slice(0, 8)
    .map((l, i) => ({ ...l, i, text: cleanTitle(l.text) }))
    .filter((l) => (l.text.match(/[a-zäöüß]/gi) || []).length >= 4 && !NOT_TITLE.test(l.text) && !/^\d/.test(l.text));
  if (!cands.length) return fallback;
  const maxH = Math.max(...cands.map((c) => c.h || 0));
  const best = { ...(cands.find((c) => (c.h || 0) >= maxH * 0.85) || cands[0]) };
  const next = cands.find((c) => c.i === best.i + 1);
  if (next && best.h && next.h >= best.h * 0.85 && (best.text + next.text).length <= 60) best.text += ' ' + next.text;
  return best.text.length > 70 ? best.text.slice(0, 70).replace(/\s+\S*$/, '') + '…' : best.text;
}
function cleanTitle(s) {
  s = String(s || '').replace(/\s+/g, ' ').replace(/^[^A-Za-zÄÖÜäöüß0-9]+|[^A-Za-zÄÖÜäöüß0-9!)]+$/g, '').trim();
  // GROSSBUCHSTABEN-Titel schöner darstellen
  if (s.length > 3 && s === s.toUpperCase()) s = s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  return s;
}
function fileTitle(name) {
  const b = String(name || '').replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
  if (!b || /^(img|scan|dsc|image|dokument|document|photo|foto|pxl|bild)[\s\d-]*$/i.test(b) || /^[\d\s-]+$/.test(b)) return '';
  return b;
}

/* =========================================================
   Scannen: Bilder/PDFs einlesen, Text erkennen, einsortieren
   ========================================================= */
const BASE = new URL('./', location.href).href;
let ocrWorkerP = null;
let ocrProgress = () => {};
function getOcr() {
  if (!ocrWorkerP) {
    ocrWorkerP = (async () => {
      await loadScript('vendor/tesseract/tesseract.min.js');
      return Tesseract.createWorker('deu', 1, {
        workerPath: BASE + 'vendor/tesseract/worker.min.js',
        corePath: BASE + 'vendor/tesseract/',
        langPath: BASE + 'vendor/lang',
        workerBlobURL: false,
        logger: (m) => ocrProgress(m),
      });
    })();
    ocrWorkerP.catch(() => { ocrWorkerP = null; });
  }
  return ocrWorkerP;
}
const scripts = {};
function loadScript(src) {
  if (!scripts[src]) {
    scripts[src] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => { delete scripts[src]; rej(new Error('Konnte ' + src + ' nicht laden')); };
      document.head.appendChild(s);
    });
  }
  return scripts[src];
}
async function getPdfjs() {
  await loadScript('vendor/pdfjs/pdf.min.js');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = BASE + 'vendor/pdfjs/pdf.worker.min.js';
  return window.pdfjsLib;
}

const canvasToBlob = (canvas, q = 0.85) => new Promise((res) => canvas.toBlob(res, 'image/jpeg', q));
function scaleCanvas(src, max) {
  const w = src.width, h = src.height;
  const s = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * s); c.height = Math.round(h * s);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
async function imageToCanvas(fileOrBlob, max = 2200) {
  let bmp = null;
  try { bmp = await createImageBitmap(fileOrBlob, { imageOrientation: 'from-image' }); } catch { /* Fallback unten */ }
  if (!bmp) {
    bmp = await new Promise((res, rej) => {
      const img = new Image();
      const u = URL.createObjectURL(fileOrBlob);
      img.onload = () => { URL.revokeObjectURL(u); res(img); };
      img.onerror = () => { URL.revokeObjectURL(u); rej(new Error('Bild konnte nicht gelesen werden')); };
      img.src = u;
    });
  }
  return scaleCanvas(bmp, max);
}
function rotateCanvas(src, deg) {
  const c = document.createElement('canvas');
  const quarter = deg % 180 !== 0;
  c.width = quarter ? src.height : src.width;
  c.height = quarter ? src.width : src.height;
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

// Zerlegt die ausgewählten Dateien in Seiten: [{canvas, text?, lines?, name}]
async function filesToPages(files, onStatus) {
  const pages = [];
  for (const f of files) {
    if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
      onStatus(`PDF wird geöffnet: ${f.name}`);
      const pdfjs = await getPdfjs();
      const pdf = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise;
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const vp0 = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: Math.min(3, 2000 / Math.max(vp0.width, vp0.height)) });
        const c = document.createElement('canvas');
        c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        // Hat die PDF schon eine Textebene? Dann brauchen wir keine Texterkennung.
        const tc = await page.getTextContent();
        const lines = pdfLines(tc.items);
        const text = lines.map((l) => l.text).join('\n');
        pages.push({ canvas: c, name: f.name, text: text.replace(/\s/g, '').length > 40 ? text : null, lines });
      }
    } else {
      pages.push({ canvas: await imageToCanvas(f), name: f.name });
    }
  }
  return pages;
}
function pdfLines(items) {
  const rows = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const y = Math.round(it.transform[5]);
    const h = Math.abs(it.transform[3]) || it.height || 0;
    let row = rows.find((r) => Math.abs(r.y - y) <= Math.max(2, h * 0.4));
    if (!row) rows.push(row = { y, h: 0, parts: [] });
    row.parts.push({ x: it.transform[4], w: it.width || 0, s: it.str.normalize('NFKC') });
    row.h = Math.max(row.h, h);
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => {
    const parts = r.parts.sort((a, b) => a.x - b.x);
    let t = '', end = null;
    for (const pt of parts) {
      const gap = end == null ? 0 : pt.x - end;
      t += (end != null && gap > r.h * 0.2 && !/\s$/.test(t) && !/^\s/.test(pt.s)) ? ' ' + pt.s : pt.s;
      end = pt.x + pt.w;
    }
    return { text: t.replace(/\s+/g, ' ').trim(), h: r.h };
  });
}

async function ocrCanvas(canvas, onPct) {
  ocrProgress = (m) => { if (m.status === 'recognizing text') onPct(Math.round(m.progress * 100)); else if (/load|init/.test(m.status)) onPct(-1); };
  const w = await getOcr();
  const { data } = await w.recognize(canvas);
  const lines = (data.lines || []).map((l) => ({ text: l.text.trim(), h: l.bbox ? l.bbox.y1 - l.bbox.y0 : 0 })).filter((l) => l.text);
  return { text: data.text || '', lines, conf: data.confidence };
}

// Warteschlange der Scans (bleibt beim Navigieren erhalten)
const queue = [];
let queueBusy = false;
function renderQueue() {
  const el = $('#scan-queue');
  if (!el) return;
  el.innerHTML = queue.slice().reverse().map((j) => {
    const r = j.recipeId ? recById(j.recipeId) : null;
    const where = r ? (r.cats || []).map((c) => {
      const cat = catById(c);
      const subs = (r.subs || []).filter((k) => k.startsWith(c + '/')).map((k) => subById(cat, k.split('/')[1])?.name).filter(Boolean);
      return cat ? `${esc(cat.emoji)} ${esc(cat.name)}${subs.length ? ' › ' + esc(subs.join(', ')) : ''}` : '';
    }).filter(Boolean).join('<br>') : '';
    return `<div class="job ${j.state}">
      <div class="job-ico">${j.state === 'done' ? '✅' : j.state === 'error' ? '⚠️' : j.state === 'skip' ? '⚪️' : '<span class="spin"></span>'}</div>
      <div class="job-main">
        <div class="job-title">${r ? `<a href="#/r/${encodeURIComponent(r.id)}">${esc(r.title)}</a>` : esc(j.label)}</div>
        <div class="job-sub">${j.state === 'done' ? where : esc(j.status)}</div>
        ${j.state === 'work' ? `<div class="bar"><div style="width:${j.pct}%"></div></div>` : ''}
      </div>
    </div>`;
  }).join('');
}
async function enqueue(files, combine) {
  const job = { id: uid(), label: files.length > 1 ? `${files.length} Dateien` : files[0].name, state: 'work', status: 'Wird vorbereitet…', pct: 0 };
  queue.push(job);
  renderQueue();
  try {
    const pages = await filesToPages(files, (s) => { job.status = s; renderQueue(); });
    // Ein Rezept pro Seite – oder alle zusammen
    const groups = combine ? [pages] : pages.map((p) => [p]);
    if (groups.length > 1) {
      queue.splice(queue.indexOf(job), 1);
      const perFile = {};
      queue.push(...groups.map((g) => {
        const n = (perFile[g[0].name] = (perFile[g[0].name] || 0) + 1);
        const multi = pages.filter((p) => p.name === g[0].name).length > 1;
        return { id: uid(), label: g[0].name + (multi ? ` – Seite ${n}` : ''), state: 'wait', status: 'Wartet…', pct: 0, group: g };
      }));
    } else {
      job.group = groups[0];
      job.state = 'wait';
    }
    renderQueue();
    processQueue();
  } catch (err) {
    job.state = 'error';
    job.status = 'Fehler: ' + (err?.message || err);
    renderQueue();
  }
}
async function processQueue() {
  if (queueBusy) return;
  queueBusy = true;
  try {
    let job;
    while ((job = queue.find((j) => j.state === 'wait'))) {
      job.state = 'work';
      try {
        await processGroup(job);
        job.state = job.skipped ? 'skip' : 'done';
      } catch (err) {
        console.error(err);
        job.state = 'error';
        job.status = 'Fehler: ' + (err?.message || err);
      }
      job.group = null;
      renderQueue();
      const h = location.hash;
      if (h === '' || h === '#/' || h.startsWith('#/k/')) { render.keepScroll = true; render(); }
    }
  } finally {
    queueBusy = false;
  }
}
function isBlank(canvas) {
  const c = scaleCanvas(canvas, 300);
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let dark = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 450) dark++;
  return dark / (d.length / 4) < 0.002;
}
async function processGroup(job) {
  job.group = job.group.filter((p) => p.text || !isBlank(p.canvas));
  if (!job.group.length) { job.status = 'Leere Seite – übersprungen'; job.skipped = true; return; }
  const texts = [], allLines = [];
  for (let i = 0; i < job.group.length; i++) {
    const p = job.group[i];
    const prefix = job.group.length > 1 ? `Seite ${i + 1}/${job.group.length}: ` : '';
    if (p.text) {
      texts.push(p.text);
      allLines.push(...(p.lines || []));
      continue;
    }
    job.status = prefix + 'Text wird gelesen…';
    renderQueue();
    const res = await ocrCanvas(p.canvas, (pct) => {
      if (pct < 0) { job.status = 'Texterkennung wird vorbereitet (nur beim ersten Mal)…'; job.pct = 5; }
      else { job.status = `${prefix}Text wird gelesen… ${pct}%`; job.pct = Math.round(((i + pct / 100) / job.group.length) * 100); }
      renderQueue();
    });
    texts.push(res.text);
    allLines.push(...res.lines);
  }
  job.status = 'Wird einsortiert…';
  renderQueue();
  const text = texts.join('\n\n').trim();
  const title = pickTitle(allLines, fileTitle(job.group[0].name) || `Rezept vom ${fmtDate(Date.now())}`);
  const { cats, subs } = classify(text, title);
  const pages = [];
  for (const p of job.group) pages.push(await canvasToBlob(scaleCanvas(p.canvas, 1800), 0.82));
  const thumb = await canvasToBlob(scaleCanvas(job.group[0].canvas, 480), 0.75);
  const r = { id: uid(), title, cats, subs, text, pages, thumb, created: Date.now(), fav: false, scanned: true, imgv: Date.now() };
  await saveRecipe(r);
  job.recipeId = r.id;
}

// Bestehendes Rezept: drehen und neu lesen
async function rotateRecipe(r, deg) {
  const canvases = [];
  for (const b of r.pages) canvases.push(rotateCanvas(await imageToCanvas(b, 2200), deg));
  const texts = [], lines = [];
  for (const c of canvases) {
    const res = await ocrCanvas(c, () => {});
    texts.push(res.text); lines.push(...res.lines);
  }
  r.pages = [];
  for (const c of canvases) r.pages.push(await canvasToBlob(c, 0.82));
  r.thumb = await canvasToBlob(scaleCanvas(canvases[0], 480), 0.75);
  r.text = texts.join('\n\n').trim();
  if (!r.manualTitle) r.title = pickTitle(lines, r.title);
  if (!r.manualCats) Object.assign(r, classify(r.text, r.title));
  r.imgv = Date.now();
  dropUrls(r.id);
  await saveRecipe(r);
}

/* =========================================================
   Suche – versteht auch Sätze wie „Ich suche einen Apfelkuchen“
   ========================================================= */
const STOP = new Set(('ich du wir suche such suchen sucht einen ein eine einer eines einem nach rezept rezepte rezepten '
  + 'fur mit und oder bitte zeig zeige zeigt mir uns alle alles gibt es habe hast haben hatte was wie welche welches welcher '
  + 'der die das den dem des von vom zum zur mal gern gerne irgendwas irgendein irgendeinen etwas mochte mochten will wollen '
  + 'brauche brauchen finde finden find hatten gibts lust auf heute morgen leckeren leckere lecker leckeres guten gute gutes '
  + 'schones schoner schonen ist sind war im in am an zu so noch auch mein meine meinen meiner kann konnen essen kochen backen').split(' '));
const stem = (w) => (w.length > 5 ? w.replace(/(en|er|es|em|n|e|s)$/, '') : w);
function parseQuery(q) {
  const words = norm(q).replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean);
  const terms = [], minus = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w === 'ohne' && words[i + 1]) { minus.push(stem(words[++i])); continue; }
    if (STOP.has(w) || w.length < 2) continue;
    terms.push(w);
  }
  return { terms, minus };
}
const searchCache = {};
function searchIndex(r) {
  if (!searchCache[r.id]) {
    const cats = (r.cats || []).map((c) => catById(c)?.name || '').join(' ');
    const join = (s) => norm(s).replace(/-\s*/g, '').replace(/\s+/g, ' ');
    const text = join(recipeText(r));
    const title = join(r.title);
    searchCache[r.id] = {
      title, meta: join(cats + ' ' + recipeSubLabels(r).join(' ') + ' ' + (r.tags || '')), text,
      tokens: [...new Set((text + ' ' + title).split(/[^a-z0-9]+/).filter((t) => t.length >= 4))],
    };
  }
  return searchCache[r.id];
}
function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
function termScore(term, ix) {
  const st = stem(term);
  const all = ix.title + ' ' + ix.meta + ' ' + ix.text;
  if (ix.title.includes(st)) return { s: 10, hit: st };
  if (ix.meta.includes(st)) return { s: 7, hit: null };
  if (ix.text.includes(st)) return { s: 3 + Math.min(3, ix.text.split(st).length - 1), hit: st };
  // Zusammengesetzte Wörter: „apfelkuchen“ → „apfel“ + „kuchen“
  for (let i = 3; i <= st.length - 3; i++) {
    const a = stem(st.slice(0, i)), b = st.slice(i);
    if (a.length >= 3 && b.length >= 3 && all.includes(a) && all.includes(b)) {
      return { s: (ix.title.includes(a) || ix.title.includes(b)) ? 4 : 2, hit: a };
    }
  }
  // Tippfehler / Lesefehler beim Scannen
  if (st.length >= 5) {
    const max = st.length >= 9 ? 2 : 1;
    for (const t of ix.tokens) {
      for (const cand of [t, t.slice(0, st.length)]) {
        if (lev(st, cand, max) <= max) return { s: 1.5, hit: cand };
      }
    }
  }
  return null;
}
function searchRecipes(q) {
  const { terms, minus } = parseQuery(q);
  if (!terms.length && !minus.length) return { list: [], partial: false, terms };
  const res = [];
  for (const r of state.recipes) {
    const ix = searchIndex(r);
    const all = ix.title + ' ' + ix.meta + ' ' + ix.text;
    if (minus.some((m) => all.includes(m))) continue;
    let score = 0, matched = 0;
    const hits = [];
    for (const t of terms) {
      const m = termScore(t, ix);
      if (m) { score += m.s; matched++; if (m.hit) hits.push(m.hit); }
    }
    if (terms.length && !matched) continue;
    if (r.fav) score += 0.5;
    res.push({ r, score, matched, hits });
  }
  const full = res.filter((x) => x.matched === terms.length);
  const list = (full.length ? full : res).sort((a, b) => b.matched - a.matched || b.score - a.score || a.r.title.localeCompare(b.r.title, 'de'));
  return { list, partial: !full.length && res.length > 0, terms };
}
// Textausschnitt mit markiertem Treffer
function snippet(r, hits) {
  const text = recipeText(r);
  if (!text || !hits.length) return '';
  let nt = '';
  const map = [];
  for (let i = 0; i < text.length; i++) {
    const n = norm(text[i]).replace(/-/g, '');
    for (const ch of n) { nt += /\s/.test(ch) ? ' ' : ch; map.push(i); }
  }
  let pos = -1, hit = '';
  for (const h of hits) { const p = nt.indexOf(h); if (p >= 0 && (pos < 0 || p < pos)) { pos = p; hit = h; } }
  if (pos < 0) return '';
  const s = map[pos];
  let e = map[Math.min(map.length - 1, pos + hit.length - 1)] + 1;
  while (e < text.length && /[\p{L}\p{N}]/u.test(text[e])) e++;
  const from = Math.max(0, s - 50), to = Math.min(text.length, e + 70);
  const clean = (x) => esc(x.replace(/\s+/g, ' '));
  return `${from > 0 ? '…' : ''}${clean(text.slice(from, s))}<mark>${clean(text.slice(s, e))}</mark>${clean(text.slice(e, to))}${to < text.length ? '…' : ''}`;
}

/* =========================================================
   UI
   ========================================================= */
function topbar({ title = 'Meine Rezepte', back = null, actions = '' } = {}) {
  $('#topbar').innerHTML = `${back ? `<a class="iconbtn" href="${esc(back)}" aria-label="Zurück">←</a>` : ''}<h1>${esc(title)}</h1>${actions}`;
}
const setTab = (tab) => $$('#tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
function recCard(r, snip = '') {
  const subs = recipeSubLabels(r);
  const cat = catById((r.cats || [])[0]);
  const meta = subs.length ? subs.slice(0, 2).join(' · ') : cat ? cat.name : '';
  const t = thumbUrl(r);
  return `<a class="rec-card" href="#/r/${encodeURIComponent(r.id)}">
    <div class="thumb ${t ? 'scan' : ''}">${t ? `<img src="${t}" alt="" loading="lazy">` : recipeEmoji(r)}</div>
    ${r.fav ? '<span class="fav">❤️</span>' : ''}
    <div class="body">
      <div class="title">${esc(r.title)}</div>
      <div class="meta"><span>${esc(meta)}</span></div>
      ${snip ? `<div class="snip">${snip}</div>` : ''}
    </div>
  </a>`;
}
function recGrid(list, emptyHtml) {
  if (!list.length) return emptyHtml || '<div class="empty"><span class="big">📄</span>Noch keine Rezepte hier.</div>';
  return `<div class="rec-grid">${list.map((r) => recCard(r)).join('')}</div>`;
}
function sortSelect() {
  const opts = [['neu', 'Neueste zuerst'], ['az', 'A–Z']];
  return `<select data-action="sort" aria-label="Sortieren">${opts.map(([v, l]) => `<option value="${v}" ${state.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
}
function searchBox(value = '', autofocus = false) {
  return `<form class="searchbox" data-action="search-form" role="search">
    <span>🔍</span>
    <input type="search" name="q" placeholder="Was suchst du? z. B. „Apfelkuchen“" value="${esc(value)}"
      autocomplete="off" enterkeyhint="search" ${autofocus ? 'autofocus' : ''}>
    ${value ? '<button type="button" class="clear" data-action="search-clear" aria-label="Leeren">✕</button>' : ''}
  </form>`;
}
const visibleCats = () => state.categories.filter((c) => c.id !== 'sonstiges' || recipesIn('sonstiges').length);

function viewHome() {
  topbar({ title: 'Meine Rezepte 🍳' });
  setTab('home');
  state.lastList = '#/';
  const total = state.recipes.length;
  const favs = sortRecipes(state.recipes.filter((r) => r.fav), 'az');
  const recent = sortRecipes(state.recipes, 'neu').slice(0, 10);
  const working = queue.some((j) => j.state === 'work' || j.state === 'wait');
  return `
    ${searchBox()}
    ${Sync.cfg ? `<a class="sync-line" href="#/einstellungen" id="sync-line">${syncLine()}</a>` : ''}
    ${working ? '<a class="banner" href="#/neu"><span class="spin"></span> Rezepte werden gerade eingelesen …</a>' : ''}
    ${!total ? `<div class="empty" style="margin-top:18px"><span class="big">📄</span>
      Noch keine Rezepte eingescannt.<br>Wähle Fotos oder PDFs aus – die App liest sie und sortiert sie automatisch ein.<br><br>
      <a class="btn primary" href="#/neu">📷 Erstes Rezept einscannen</a></div>` : ''}
    <div class="section-title">Kategorien <small>${plural(total, 'Rezept', 'Rezepte')}</small></div>
    <div class="cat-grid">
      ${visibleCats().map((c, i) => `<a class="cat-tile" href="#/k/${encodeURIComponent(c.id)}" style="--tint:${TINTS[i % TINTS.length]}">
          <span class="emoji">${esc(c.emoji)}</span>
          <div><div class="name">${esc(c.name)}</div><div class="count">${plural(recipesIn(c.id).length, 'Rezept', 'Rezepte')}</div></div>
        </a>`).join('')}
    </div>
    ${favs.length ? `<div class="section-title">❤️ Favoriten <a class="muted" href="#/favoriten"><small>Alle →</small></a></div>
      <div class="scroller">${favs.slice(0, 12).map((r) => recCard(r)).join('')}</div>` : ''}
    ${recent.length ? `<div class="section-title">🆕 Zuletzt eingescannt</div>
      <div class="scroller">${recent.map((r) => recCard(r)).join('')}</div>` : ''}`;
}

function subEmoji(name, fallback) {
  const n = norm(name);
  const map = [['fisch', '🐟'], ['fleisch', '🥩'], ['geflugel', '🍗'], ['vegan', '🌱'], ['vegetar', '🥦'], ['nudel', '🍝'], ['auflauf', '🫕'],
    ['salat', '🥗'], ['kartoffel', '🥔'], ['gemuse', '🥕'], ['reis', '🍚'], ['sauce', '🫙'], ['dip', '🫙'], ['creme', '🍮'], ['eis', '🍨'],
    ['obstkuchen', '🍓'], ['obst', '🍓'], ['warm', '🔥'], ['blech', '🟫'], ['geburtstagskuchen', '🎂'], ['torte', '🎂'], ['ruhr', '🧁'],
    ['kase', '🧀'], ['muffin', '🧁'], ['ohne backen', '❄️'], ['weihnacht', '🎄'], ['kekse', '🍪'], ['hefe', '🥯'], ['herzhaft', '🥨'],
    ['kinder', '🎈'], ['finger', '🍢'], ['buffet', '🍱'], ['ostern', '🐣'], ['suss', '🍬'], ['aufstrich', '🧈'], ['brotchen', '🥖'], ['brot', '🍞'],
    ['fruhstuck', '🍳'], ['ohne alkohol', '🧃'], ['mit alkohol', '🍷'], ['smoothie', '🥤'], ['heiss', '☕']];
  for (const [k, e] of map) if (n.includes(k)) return e;
  return fallback || '🍴';
}

function viewCategory(catId, subId) {
  const cat = catById(catId);
  if (!cat) return viewNotFound();
  const sub = subId ? subById(cat, subId) : null;
  setTab('home');
  topbar({ title: sub ? sub.name : cat.name, back: sub ? `#/k/${encodeURIComponent(cat.id)}` : '#/' });
  state.lastList = location.hash;
  const all = recipesIn(cat.id);
  const list = sortRecipes(sub ? recipesIn(cat.id, sub.id) : all);
  return `
    <div class="cat-hero">
      <span class="emoji">${esc(cat.emoji)}</span>
      <div><h2>${esc(cat.name)}${sub ? ` · ${esc(sub.name)}` : ''}</h2><p>${plural(list.length, 'Rezept', 'Rezepte')}</p></div>
    </div>
    ${cat.subs.length ? `<div class="section-title">Unterkategorien</div>
    <div class="cat-grid">
      <a class="cat-tile all ${!sub ? 'selected' : ''}" href="#/k/${encodeURIComponent(cat.id)}">
        <span class="emoji">📚</span><div><div class="name">Alle anzeigen</div><div class="count">${plural(all.length, 'Rezept', 'Rezepte')}</div></div>
      </a>
      ${cat.subs.map((s, i) => `<a class="cat-tile ${sub && sub.id === s.id ? 'selected' : ''}" style="--tint:${TINTS[(i + 2) % TINTS.length]}" href="#/k/${encodeURIComponent(cat.id)}/${encodeURIComponent(s.id)}">
          <span class="emoji">${esc(s.emoji || subEmoji(s.name, cat.emoji))}</span>
          <div><div class="name">${esc(s.name)}</div><div class="count">${plural(recipesIn(cat.id, s.id).length, 'Rezept', 'Rezepte')}</div></div>
        </a>`).join('')}
    </div>` : ''}
    <div class="toolbar"><h2>${sub ? esc(sub.name) : 'Alle Rezepte'}</h2>${list.length > 1 ? sortSelect() : ''}</div>
    ${recGrid(list, `<div class="empty"><span class="big">${esc(cat.emoji)}</span>Hier ist noch nichts drin.<br><br><a class="btn primary" href="#/neu">📷 Rezepte einscannen</a></div>`)}`;
}

function catChips(r) {
  const chips = [];
  for (const cid of r.cats || []) {
    const c = catById(cid);
    if (!c) continue;
    chips.push(`<a class="chip accent" href="#/k/${encodeURIComponent(c.id)}">${esc(c.emoji)} ${esc(c.name)}</a>`);
    for (const k of (r.subs || []).filter((x) => x.startsWith(cid + '/'))) {
      const s = subById(c, k.split('/')[1]);
      if (s) chips.push(`<a class="chip" href="#/k/${encodeURIComponent(c.id)}/${encodeURIComponent(s.id)}">${esc(s.name)}</a>`);
    }
  }
  return chips.join('');
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
  const pages = r.pages || [];
  const oldText = !pages.length && recipeText(r);
  return `
    <div class="rec-head">
      <h2>${esc(r.title)}</h2>
      <div class="chips">${catChips(r)}</div>
      <p class="muted" style="font-size:.85rem;margin:8px 0 0">Eingescannt am ${fmtDate(r.created || Date.now())}${r.manualCats ? '' : ' · automatisch einsortiert'} ·
        <a href="#/bearbeiten/${encodeURIComponent(r.id)}" style="color:var(--accent)">ändern</a></p>
    </div>
    ${pages.map((_, i) => `<figure class="scan-page"><img src="${pageUrl(r, i)}" alt="${esc(r.title)} – Seite ${i + 1}" data-action="zoom"></figure>`).join('')}
    ${!pages.length && r.image ? `<figure class="scan-page"><img src="${r.image}" alt="" data-action="zoom"></figure>` : ''}
    ${oldText ? `<section class="card"><p class="notes">${esc(oldText)}</p></section>` : ''}
    ${pages.length ? '<p class="muted center" style="font-size:.85rem">Tippe auf das Bild zum Vergrößern.</p>' : ''}
    ${r.text ? `<details class="card ocr"><summary>🔤 Erkannter Text <span class="muted">(für die Suche)</span></summary><p class="notes">${esc(r.text)}</p></details>` : ''}
    <div class="rec-actions">
      ${pages.length ? `<button class="btn" data-action="rotate" data-id="${esc(r.id)}">↻ Drehen</button>` : ''}
      <a class="btn" href="#/bearbeiten/${encodeURIComponent(r.id)}">✏️ Titel & Kategorie</a>
      <button class="btn danger" data-action="delete" data-id="${esc(r.id)}">🗑️ Löschen</button>
    </div>`;
}

function viewScan() {
  setTab('new');
  topbar({ title: 'Rezepte einscannen', back: state.lastList });
  return `
    <label class="scan-drop">
      <input type="file" accept="image/*,application/pdf,.pdf" multiple data-action="scan-files">
      <span class="big">📷</span>
      <b>Scans auswählen</b>
      <span class="muted">Fotos oder PDFs vom Scanner – gerne mehrere auf einmal</span>
    </label>
    <label class="toggle" style="margin:14px 2px 4px">
      <input type="checkbox" id="combine"> <span>Alle ausgewählten Seiten gehören zu <b>einem</b> Rezept</span>
    </label>
    <p class="muted" style="font-size:.85rem;margin:4px 2px 0">Sonst wird jede Seite ein eigenes Rezept. Die App erkennt Titel und Kategorie automatisch – falls mal etwas nicht stimmt, kannst du es im Rezept unter „✏️“ ändern.</p>
    <div id="scan-queue" class="queue"></div>
    <details class="card" style="margin-top:22px">
      <summary><b>💡 Tipps für gute Ergebnisse</b></summary>
      <ul class="tips">
        <li>Gedruckte und sauber geschriebene Rezepte werden am besten erkannt.</li>
        <li>Am Scanner 300 dpi und „Farbe“ oder „Graustufen“ wählen.</li>
        <li>Am iPad geht's auch ohne Scanner: In der <b>Dateien</b>-App oben rechts auf „…“ → <b>Dokumente scannen</b>, als PDF speichern und hier auswählen.</li>
        <li>Steht ein Rezept auf dem Kopf? Im Rezept auf „↻ Drehen“ tippen.</li>
      </ul>
    </details>`;
}

function viewSearch(q) {
  setTab('search');
  topbar({ title: 'Suche' });
  state.lastList = location.hash;
  return `${searchBox(q, true)}<div id="search-results">${searchResults(q)}</div>`;
}
function searchResults(q) {
  if (!q.trim()) {
    const quick = ['Apfelkuchen', 'Blechkuchen', 'Vegetarisch', 'Vegan', 'Fisch', 'Suppe', 'Plätzchen', 'Nudeln', 'Salat', 'Kindergeburtstag'];
    return `<div class="section-title">Ideen</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">${quick.map((t) => `<a class="chip" href="#/suche?q=${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}</div>
      <p class="muted" style="margin-top:18px;font-size:.9rem">Du kannst ganz normal schreiben, z. B. „Ich suche einen Apfelkuchen“, „Suppe ohne Fleisch“ oder nach Zutaten wie „Zucchini Feta“. Gesucht wird im ganzen eingescannten Text.</p>`;
  }
  const { list, partial, terms } = searchRecipes(q);
  if (!list.length) return `<div class="empty" style="margin-top:16px"><span class="big">🤷</span>Nichts gefunden für „${esc(q)}“.</div>`;
  return `<div class="toolbar"><h2>${plural(list.length, 'Treffer', 'Treffer')}</h2>${terms.length ? `<span class="muted" style="font-size:.85rem">gesucht: ${terms.map(esc).join(', ')}</span>` : ''}</div>
    ${partial ? '<p class="muted" style="margin-top:-4px">Nichts passt genau – diese Rezepte passen teilweise:</p>' : ''}
    <div class="rec-grid">${list.map((x) => recCard(x.r, snippet(x.r, x.hits))).join('')}</div>`;
}

function viewFavorites() {
  setTab('fav');
  topbar({ title: 'Favoriten' });
  state.lastList = location.hash;
  const list = sortRecipes(state.recipes.filter((r) => r.fav));
  return `${list.length > 1 ? `<div class="toolbar"><h2>${plural(list.length, 'Rezept', 'Rezepte')}</h2>${sortSelect()}</div>` : ''}
    ${recGrid(list, '<div class="empty"><span class="big">🤍</span>Noch keine Favoriten.<br>Tippe in einem Rezept auf das Herz.</div>')}`;
}

function viewEdit(id) {
  const r = recById(id);
  if (!r) return viewNotFound();
  setTab('');
  topbar({ title: 'Titel & Kategorie', back: `#/r/${encodeURIComponent(r.id)}` });
  const selCats = new Set(r.cats || []), selSubs = new Set(r.subs || []);
  return `
  <form class="form" data-action="save" data-id="${esc(r.id)}" novalidate>
    <div class="field">
      <label for="f-title">Name des Rezepts</label>
      <input type="text" id="f-title" name="title" required value="${esc(r.title)}">
    </div>
    <div class="field">
      <span class="label">Kategorien <span class="hint">– auch mehrere möglich</span></span>
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
    <div class="field">
      <label for="f-tags">Eigene Stichwörter <span class="hint">– helfen bei der Suche, z. B. „Oma, schnell“</span></label>
      <input type="text" id="f-tags" name="tags" value="${esc(r.tags)}">
    </div>
    <div class="field">
      <label for="f-text">Erkannter Text <span class="hint">– hier kannst du Lesefehler korrigieren</span></label>
      <textarea id="f-text" name="text" rows="10">${esc(recipeText(r))}</textarea>
    </div>
    <div class="btn-row">
      <button class="btn" type="button" data-action="reclassify">🤖 Automatisch neu einsortieren</button>
    </div>
    <button class="btn primary block" type="submit" style="padding:15px">💾 Speichern</button>
  </form>`;
}

function viewSettings() {
  setTab('settings');
  topbar({ title: 'Mehr' });
  return `
    <div class="section-title">👨‍👩‍👧 Familien-Rezeptbuch</div>
    <div class="card" style="margin-top:0" id="sync-card">${syncCard()}</div>

    <div class="section-title">📂 Kategorien verwalten</div>
    <p class="muted" style="margin-top:-4px;font-size:.9rem">Namen und Emojis direkt antippen und ändern. Wird automatisch gespeichert.</p>
    <div id="cat-editor">${catEditor()}</div>
    <button class="btn block" data-action="cat-add">＋ Neue Kategorie</button>

    <div class="section-title">🤖 Automatisch sortieren</div>
    <div class="card" style="margin-top:0">
      <p style="margin-top:0" class="muted">Sortiert alle Rezepte noch einmal neu ein. Rezepte, die du selbst geändert hast, bleiben, wie sie sind.</p>
      <button class="btn" data-action="reclassify-all">Alle neu einsortieren</button>
    </div>

    <div class="section-title">💾 Sicherung</div>
    <div class="card" style="margin-top:0">
      <p style="margin-top:0" class="muted">Die Rezepte sind nur auf diesem Gerät gespeichert. Mach ab und zu eine Sicherung – damit kannst du sie auch auf ein anderes Gerät übertragen.</p>
      <div class="btn-row">
        <button class="btn primary" data-action="export">⬇️ Sicherung herunterladen</button>
        <label class="btn">⬆️ Sicherung einlesen<input type="file" accept="application/json,.json" data-action="import" hidden></label>
      </div>
    </div>

    <div class="section-title">ℹ️ Info</div>
    <div class="card" style="margin-top:0">
      <p style="margin-top:0">${plural(state.recipes.length, 'Rezept', 'Rezepte')} · ${plural(state.categories.length, 'Kategorie', 'Kategorien')}</p>
      <p class="muted" style="font-size:.9rem">Die Texterkennung läuft direkt auf deinem Gerät – kostenlos und ohne dass deine Rezepte irgendwohin geschickt werden.</p>
      <button class="btn danger" data-action="cat-reset">Kategorien zurücksetzen</button>
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

// ---------- Bild-Zoom ----------
function openZoom(src) {
  const z = $('#zoom');
  z.innerHTML = `<button class="iconbtn zclose" data-action="zoom-close" aria-label="Schließen">✕</button><div class="zwrap"><img src="${esc(src)}" alt=""></div>`;
  z.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeZoom() {
  $('#zoom').hidden = true;
  $('#zoom').innerHTML = '';
  document.body.style.overflow = '';
}

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
  else if (p[0] === 'neu') html = viewScan();
  else if (p[0] === 'bearbeiten') html = viewEdit(p[1]);
  else if (p[0] === 'suche') html = viewSearch(params.get('q') || '');
  else if (p[0] === 'favoriten') html = viewFavorites();
  else if (p[0] === 'einstellungen') html = viewSettings();
  else if (p[0] === 'verbinden') html = viewJoin(params.get('c') || '');
  else html = viewNotFound();
  const y = render.keepScroll ? scrollY : 0;
  $('#app').innerHTML = html;
  if (!$('#zoom').hidden) closeZoom();
  window.scrollTo(0, y);
  render.keepScroll = false;
  if (p[0] === 'neu') renderQueue();
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
  const a = el.dataset.action, id = el.dataset.id;
  switch (a) {
    case 'fav': {
      const r = recById(id);
      r.fav = !r.fav;
      await saveRecipe(r, { quiet: true });
      el.textContent = r.fav ? '❤️' : '🤍';
      toast(r.fav ? 'Zu Favoriten hinzugefügt' : 'Aus Favoriten entfernt');
      break;
    }
    case 'zoom': openZoom(el.src); break;
    case 'zoom-close': closeZoom(); break;
    case 'rotate': {
      const r = recById(id);
      el.disabled = true;
      el.innerHTML = '<span class="spin"></span> Wird gedreht…';
      try { await rotateRecipe(r, 90); toast('Gedreht ✓'); } catch (err) { toast('Fehler: ' + err.message); }
      render.keepScroll = true;
      render();
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
    case 'reclassify': {
      const f = el.closest('form');
      const { cats, subs } = classify(f.elements.text.value, f.elements.title.value);
      $$('input[name=cat]', f).forEach((i) => { i.checked = cats.includes(i.value); });
      $$('input[name=sub]', f).forEach((i) => { i.checked = subs.includes(i.value); });
      f.dataset.auto = '1';
      toast('Neu einsortiert – zum Übernehmen speichern');
      break;
    }
    case 'reclassify-all': {
      let n = 0;
      for (const r of state.recipes) {
        if (r.manualCats) continue;
        const res = classify(recipeText(r), r.title);
        if (JSON.stringify(res) !== JSON.stringify({ cats: r.cats, subs: r.subs })) { Object.assign(r, res); await saveRecipe(r); n++; }
      }
      toast(n ? `${plural(n, 'Rezept', 'Rezepte')} neu einsortiert` : 'Alles war schon richtig einsortiert');
      break;
    }
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
      if (!confirm(`Kategorie „${c.name}“ löschen?${n ? `\n\n${plural(n, 'Rezept bleibt', 'Rezepte bleiben')} erhalten.` : ''}`)) return;
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
    case 'export': exportBackup(); break;
    case 'sync-now': sync(true); break;
    case 'sync-invite': shareInvite(); break;
    case 'sync-copy': {
      const t = $('#invite-text');
      try { await navigator.clipboard.writeText(t.value); toast('Kopiert ✓'); } catch { t.select(); document.execCommand('copy'); toast('Kopiert ✓'); }
      break;
    }
    case 'sync-leave':
      if (!confirm('Dieses Gerät vom Familien-Rezeptbuch trennen? Die Rezepte bleiben auf dem Gerät, werden aber nicht mehr abgeglichen.')) return;
      Sync.cfg = null; LS.set('sync', null);
      for (const r of state.recipes) if (r.synced) { r.synced = false; await saveRecipe(r, { quiet: true }); }
      LS.set('pendingDeletes', []);
      render();
      toast('Getrennt');
      break;
  }
});
$('#zoom').addEventListener('click', (e) => { if (e.target.id === 'zoom' || e.target.classList.contains('zwrap')) closeZoom(); });
$('#zoom').addEventListener('dblclick', (e) => { const img = e.target.closest('img'); if (img) img.classList.toggle('big'); });

document.addEventListener('change', async (e) => {
  const el = e.target, a = el.dataset.action;
  if (a === 'sort') {
    state.sort = el.value; LS.set('sort', state.sort); render();
  } else if (a === 'scan-files' && el.files.length) {
    const files = [...el.files];
    const combine = $('#combine')?.checked;
    el.value = '';
    enqueue(files, combine);
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
    const main = el.closest('.cp')?.querySelector('input[name=cat]');
    if (main) main.checked = true;
  }
});

let searchDebounce;
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.name === 'q' && el.closest('[data-action=search-form]')) {
    if (!location.hash.startsWith('#/suche')) { location.hash = `#/suche?q=${encodeURIComponent(el.value)}`; return; }
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      const q = el.value;
      history.replaceState(null, '', q ? `#/suche?q=${encodeURIComponent(q)}` : '#/suche');
      state.lastList = location.hash;
      $('#search-results').innerHTML = searchResults(q);
    }, 150);
  }
});

document.addEventListener('submit', async (e) => {
  const f = e.target, a = f.dataset.action;
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
    $(`[data-cat="${CSS.escape(c.id)}"] .add input`)?.focus();
  } else if (a === 'sync-connect' || a === 'sync-join') {
    let cfg;
    if (a === 'sync-join') cfg = decodeInvite(f.elements.code.value);
    else cfg = { repo: f.elements.repo.value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, ''), token: f.elements.token.value.trim() };
    if (!cfg || !/^[\w.-]+\/[\w.-]+$/.test(cfg.repo) || cfg.token.length < 20) { toast(a === 'sync-join' ? 'Der Einladungscode ist ungültig' : 'Bitte Namen und Schlüssel prüfen'); return; }
    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Wird verbunden…';
    try {
      await connectSync(cfg);
      toast('Verbunden ✓ Rezepte werden abgeglichen…');
      if (location.hash.startsWith('#/verbinden')) location.replace('#/'); else render();
      sync(true);
    } catch (err) {
      toast('Verbinden fehlgeschlagen: ' + err.message);
      btn.disabled = false; btn.textContent = 'Verbinden';
    }
  } else if (a === 'save') {
    const r = recById(f.dataset.id);
    const fd = new FormData(f);
    const title = String(fd.get('title') || '').trim();
    const cats = fd.getAll('cat');
    if (!title) { toast('Bitte gib dem Rezept einen Namen'); return; }
    if (!cats.length) { toast('Bitte wähle mindestens eine Kategorie'); return; }
    const subs = fd.getAll('sub').filter((s) => cats.includes(s.split('/')[0]));
    const catsChanged = JSON.stringify([cats, subs]) !== JSON.stringify([r.cats, r.subs]);
    if (title !== r.title) r.manualTitle = true;
    if (f.dataset.auto) r.manualCats = false;
    else if (catsChanged) r.manualCats = true;
    const text = String(fd.get('text') || '').trim();
    if (text !== recipeText(r)) { r.text = text; r.ingredients = ''; r.steps = ''; r.notes = ''; }
    Object.assign(r, { title, cats, subs, tags: String(fd.get('tags') || '').trim() });
    await saveRecipe(r);
    toast('Gespeichert ✓');
    location.replace(`#/r/${encodeURIComponent(r.id)}`);
  }
});

// ---------- Sicherung ----------
const blobToDataUrl = (b) => new Promise((res) => {
  if (!b || typeof b === 'string') return res(b || null);
  const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b);
});
const dataUrlToBlob = async (d) => (typeof d === 'string' && d.startsWith('data:') ? (await fetch(d)).blob() : d);
async function exportBackup() {
  toast('Sicherung wird erstellt…');
  const recipes = [];
  for (const r of state.recipes) {
    const pages = [];
    for (const p of r.pages || []) pages.push(await blobToDataUrl(p));
    recipes.push({ ...r, pages, thumb: await blobToDataUrl(r.thumb) });
  }
  const data = { app: 'meine-rezepte', version: 2, exported: new Date().toISOString(), categories: state.categories, recipes };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `rezepte-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  toast('Sicherung heruntergeladen');
}
async function importBackup(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.recipes)) throw new Error('Keine gültige Sicherungsdatei');
    if (!confirm(`${plural(data.recipes.length, 'Rezept', 'Rezepte')} einlesen? Gleiche Rezepte werden überschrieben.`)) return;
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
      const pages = [];
      for (const p of r.pages || []) pages.push(await dataUrlToBlob(p));
      if (pages.length) r.pages = pages; else delete r.pages;
      r.thumb = await dataUrlToBlob(r.thumb);
      dropUrls(r.id);
      await saveRecipe(r);
    }
    toast('Sicherung eingelesen ✓');
    render();
  } catch (err) {
    toast('Fehler: ' + err.message);
  }
}


/* =========================================================
   Familien-Rezeptbuch: Abgleich aller Geräte über ein
   privates GitHub-Repository (kostenlos)
   Aufbau im Repository:
     rezepte.json            – Liste aller Rezepte (ohne Bilder)
     bilder/<id>/p0.jpg …    – eingescannte Seiten
     bilder/<id>/thumb.jpg   – Vorschaubild
   ========================================================= */
const Sync = { cfg: LS.get('sync', null), busy: false, again: false, timer: null, error: null, progress: '', last: LS.get('syncLast', 0) };
const syncApi = () => LS.get('syncApi', 'https://api.github.com');
const repoPath = () => '/repos/' + Sync.cfg.repo;
const SYNC_META = ['id', 'title', 'cats', 'subs', 'text', 'tags', 'manualCats', 'manualTitle', 'created', 'updated', 'imgv', 'ingredients', 'steps', 'notes', 'image'];

async function gh(path, { method = 'GET', body, raw = false, cfg = Sync.cfg } = {}) {
  let res;
  try {
    res = await fetch(syncApi() + path, {
      method, cache: 'no-store',
      headers: {
        Authorization: 'Bearer ' + cfg.token,
        Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    const e = new Error('Keine Internetverbindung'); e.offline = true; throw e;
  }
  if (!res.ok) {
    const msg = { 401: 'Der Schlüssel ist ungültig oder abgelaufen', 403: 'Der Schlüssel hat keine Berechtigung für das Rezeptbuch', 404: 'Rezeptbuch nicht gefunden – Name oder Schlüssel prüfen' }[res.status] || 'GitHub-Fehler ' + res.status;
    const e = new Error(msg); e.status = res.status; throw e;
  }
  if (raw) return res;
  return res.status === 204 ? null : res.json();
}
const encodeInvite = (cfg) => 'REZEPTE-' + btoa(unescape(encodeURIComponent(JSON.stringify({ r: cfg.repo, k: cfg.token })))).replace(/=+$/, '');
function decodeInvite(code) {
  try {
    const c = String(code || '').replace(/\s+/g, '').replace(/^.*REZEPTE-/, '');
    const o = JSON.parse(decodeURIComponent(escape(atob(c))));
    return o.r && o.k ? { repo: o.r, token: o.k } : null;
  } catch { return null; }
}
async function connectSync(cfg) {
  const repo = await gh('/repos/' + cfg.repo, { cfg });
  if (repo.permissions && repo.permissions.push === false) throw new Error('Der Schlüssel darf nichts speichern (Berechtigung „Contents: Read and write“ fehlt)');
  Sync.cfg = { repo: repo.full_name || cfg.repo, token: cfg.token, branch: repo.default_branch || 'main' };
  LS.set('sync', Sync.cfg);
  // Alles, was schon auf diesem Gerät ist, wird ins gemeinsame Rezeptbuch übernommen
  for (const r of state.recipes) if (!r.synced) r.dirty = true;
}
function scheduleSync(delay = 1500) {
  if (!Sync.cfg) return;
  clearTimeout(Sync.timer);
  Sync.timer = setTimeout(() => sync(), delay);
}
async function sync(manual = false) {
  if (!Sync.cfg) return;
  if (Sync.busy) { Sync.again = true; return; }
  Sync.busy = true; Sync.error = null; Sync.progress = 'Wird abgeglichen…';
  updateSyncUI();
  try {
    const local = state.recipes.some((r) => r.dirty || !r.synced) || LS.get('pendingDeletes', []).length || LS.get('catsDirty', false);
    if (local) await pushChanges();
    await pullRemote();
    Sync.last = Date.now(); LS.set('syncLast', Sync.last);
    if (manual) toast('Rezeptbuch ist auf dem neuesten Stand ✓');
  } catch (err) {
    console.error(err);
    Sync.error = err.message;
    if (manual || err.status === 401 || err.status === 403) toast('Abgleich fehlgeschlagen: ' + err.message);
  } finally {
    Sync.busy = false; Sync.progress = '';
    updateSyncUI();
    if (Sync.again) { Sync.again = false; scheduleSync(300); }
  }
}
async function fetchRemote() {
  try {
    const res = await gh(`${repoPath()}/contents/rezepte.json`, { raw: true });
    const data = await res.json();
    return { recipes: [], ...data };
  } catch (err) {
    if (err.status === 404) return { version: 1, recipes: [] };
    throw err;
  }
}
const fetchRemoteBlob = async (path) => (await gh(`${repoPath()}/contents/${path}`, { raw: true })).blob();
async function toBlob(x) { return typeof x === 'string' ? dataUrlToBlob(x) : x; }
function blobToBase64(b) {
  return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(b); });
}
async function getHead() {
  const branch = Sync.cfg.branch || 'main';
  try {
    return { branch, sha: (await gh(`${repoPath()}/git/ref/heads/${branch}`)).object.sha };
  } catch (err) {
    if (err.status !== 409 && err.status !== 404) throw err;
    // Leeres Repository: ersten Eintrag anlegen
    await gh(`${repoPath()}/contents/README.md`, { method: 'PUT', body: { message: 'Familien-Rezeptbuch anlegen', content: btoa(unescape(encodeURIComponent('# Familien-Rezeptbuch\n\nHier speichert die App „Meine Rezepte“ die gemeinsamen Rezepte.\n'))) } });
    return { branch, sha: (await gh(`${repoPath()}/git/ref/heads/${branch}`)).object.sha };
  }
}
const blobShaCache = new Map();
async function uploadBlob(key, blob) {
  if (!blobShaCache.has(key)) {
    const res = await gh(`${repoPath()}/git/blobs`, { method: 'POST', body: { content: await blobToBase64(blob), encoding: 'base64' } });
    blobShaCache.set(key, res.sha);
  }
  return blobShaCache.get(key);
}
async function pushChanges() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const head = await getHead();
    const commit = await gh(`${repoPath()}/git/commits/${head.sha}`);
    const remote = await fetchRemote();
    const map = new Map(remote.recipes.map((m) => [m.id, m]));
    const tree = [];
    const dirty = state.recipes.filter((r) => r.dirty || !r.synced);
    const deletes = LS.get('pendingDeletes', []);
    const done = [];
    let n = 0;
    for (const r of dirty) {
      const prev = map.get(r.id);
      if (prev && (prev.updated || 0) > (r.updated || 0)) continue; // dort ist eine neuere Fassung
      const meta = {};
      for (const k of SYNC_META) if (r[k] !== undefined && r[k] !== null && r[k] !== '') meta[k] = r[k];
      if (typeof meta.image === 'string' && meta.image.length > 200000) delete meta.image;
      meta.pageCount = (r.pages || []).length;
      meta.imgv = r.imgv || r.created || 1;
      const imagesChanged = !prev || prev.imgv !== meta.imgv;
      if (imagesChanged && meta.pageCount) {
        Sync.progress = `Lade hoch: ${++n} von ${dirty.length}`; updateSyncUI();
        for (let i = 0; i < r.pages.length; i++) {
          tree.push({ path: `bilder/${r.id}/p${i}.jpg`, mode: '100644', type: 'blob', sha: await uploadBlob(`${r.id}:${meta.imgv}:p${i}`, await toBlob(r.pages[i])) });
        }
        if (r.thumb) tree.push({ path: `bilder/${r.id}/thumb.jpg`, mode: '100644', type: 'blob', sha: await uploadBlob(`${r.id}:${meta.imgv}:t`, await toBlob(r.thumb)) });
      }
      if (prev && imagesChanged) {
        for (let i = meta.pageCount; i < (prev.pageCount || 0); i++) tree.push({ path: `bilder/${r.id}/p${i}.jpg`, mode: '100644', type: 'blob', sha: null });
        if (prev.pageCount && !meta.pageCount) tree.push({ path: `bilder/${r.id}/thumb.jpg`, mode: '100644', type: 'blob', sha: null });
      }
      map.set(r.id, meta);
      done.push(r);
    }
    for (const id of deletes) {
      const prev = map.get(id);
      if (!prev) continue;
      map.delete(id);
      for (let i = 0; i < (prev.pageCount || 0); i++) tree.push({ path: `bilder/${id}/p${i}.jpg`, mode: '100644', type: 'blob', sha: null });
      if (prev.pageCount) tree.push({ path: `bilder/${id}/thumb.jpg`, mode: '100644', type: 'blob', sha: null });
    }
    const catsDirty = LS.get('catsDirty', false);
    if (catsDirty || !remote.categories) { remote.categories = state.categories; remote.catsUpdated = LS.get('catsUpdated', 0) || Date.now(); }
    remote.version = 1;
    remote.updated = Date.now();
    remote.recipes = [...map.values()].sort((a, b) => (a.created || 0) - (b.created || 0));
    tree.push({ path: 'rezepte.json', mode: '100644', type: 'blob', content: JSON.stringify(remote, null, 1) });
    const newTree = await gh(`${repoPath()}/git/trees`, { method: 'POST', body: { base_tree: commit.tree.sha, tree } });
    const msg = done.length === 1 ? `Rezept: ${done[0].title}` : `${done.length} Rezepte aktualisiert`;
    const newCommit = await gh(`${repoPath()}/git/commits`, { method: 'POST', body: { message: msg, tree: newTree.sha, parents: [head.sha] } });
    try {
      await gh(`${repoPath()}/git/refs/heads/${head.branch}`, { method: 'PATCH', body: { sha: newCommit.sha } });
    } catch (err) {
      if (err.status === 422 || err.status === 409) continue; // ein anderes Gerät war schneller – neu versuchen
      throw err;
    }
    for (const r of done) {
      const cur = recById(r.id);
      if (!cur) continue;
      cur.synced = true;
      if (cur.updated === r.updated) cur.dirty = false;
      await saveRecipe(cur, { quiet: true });
    }
    // Rezepte, bei denen die Fassung im Rezeptbuch neuer war, werden gleich danach übernommen
    for (const r of dirty) if (!done.includes(r)) { r.dirty = false; r.synced = true; await saveRecipe(r, { quiet: true }); }
    LS.set('pendingDeletes', LS.get('pendingDeletes', []).filter((id) => !deletes.includes(id)));
    if (catsDirty) LS.set('catsDirty', false);
    LS.set('catsUpdated', remote.catsUpdated);
    return;
  }
  throw new Error('Gerade speichern mehrere Geräte gleichzeitig – bitte gleich noch einmal versuchen');
}
async function pullRemote() {
  const remote = await fetchRemote();
  const ids = new Set(remote.recipes.map((m) => m.id));
  const pendingDel = new Set(LS.get('pendingDeletes', []));
  let changed = false;
  for (const l of [...state.recipes]) {
    if (l.synced && !l.dirty && !ids.has(l.id)) { await deleteRecipe(l.id, { remote: true }); changed = true; } // woanders gelöscht
  }
  const todo = remote.recipes.filter((m) => {
    if (pendingDel.has(m.id)) return false;
    const l = recById(m.id);
    if (l && l.dirty) return false;
    return !l || !l.synced || (m.updated || 0) > (l.updated || 0) || (m.imgv || 0) !== (l.imgv || 0);
  });
  let n = 0;
  for (const m of todo) {
    const l = recById(m.id);
    const sameImages = l && (l.imgv || 0) === (m.imgv || 0) && (l.pages || []).length === (m.pageCount || 0);
    let pages = sameImages ? l.pages : [], thumb = sameImages ? l.thumb : null;
    if (!sameImages && m.pageCount) {
      Sync.progress = `Neue Rezepte werden geladen: ${++n} von ${todo.length}`; updateSyncUI();
      for (let i = 0; i < m.pageCount; i++) pages.push(await fetchRemoteBlob(`bilder/${m.id}/p${i}.jpg`));
      try { thumb = await fetchRemoteBlob(`bilder/${m.id}/thumb.jpg`); } catch { thumb = null; }
      dropUrls(m.id);
    }
    const r = { ...m, pages, thumb, fav: l ? !!l.fav : false, synced: true, dirty: false };
    delete r.pageCount;
    await saveRecipe(r, { remote: true });
    changed = true;
  }
  if (remote.categories && (remote.catsUpdated || 0) > LS.get('catsUpdated', 0) && !LS.get('catsDirty', false)) {
    state.categories = remote.categories;
    if (!catById('sonstiges')) state.categories.push({ id: 'sonstiges', name: 'Noch nicht zugeordnet', emoji: '📄', subs: [] });
    LS.set('categories', state.categories);
    LS.set('catsUpdated', remote.catsUpdated);
    changed = true;
  }
  if (changed) {
    const h = location.hash;
    if (!/^#\/(bearbeiten|neu|einstellungen)/.test(h)) { render.keepScroll = true; render(); }
  }
}
function ago(t) {
  if (!t) return 'noch nie';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'gerade eben';
  if (m < 60) return `vor ${m} Min.`;
  const h = Math.round(m / 60);
  return h < 24 ? `vor ${h} Std.` : `am ${fmtDate(t)}`;
}
function syncLine() {
  if (Sync.busy) return `<span class="spin"></span> ${esc(Sync.progress || 'Wird abgeglichen…')}`;
  if (Sync.error) return `⚠️ Familien-Rezeptbuch: ${esc(Sync.error)}`;
  return `👨‍👩‍👧 Familien-Rezeptbuch · abgeglichen ${ago(Sync.last)}`;
}
function syncCard() {
  if (Sync.cfg) {
    return `<p style="margin-top:0">✅ Verbunden mit <b>${esc(Sync.cfg.repo)}</b></p>
      <p class="muted" id="sync-status" style="font-size:.9rem">${syncLine()}</p>
      <p class="muted" style="font-size:.9rem">Alle verbundenen Geräte haben dieselben Rezepte. Neue Scans, Änderungen und Löschungen werden automatisch abgeglichen. Favoriten bleiben bei jedem persönlich.</p>
      <div class="btn-row">
        <button class="btn primary" data-action="sync-invite">📨 Familie einladen</button>
        <button class="btn" data-action="sync-now">🔄 Jetzt abgleichen</button>
      </div>
      <div id="invite-box"></div>
      <p style="margin-bottom:0"><button class="btn danger" data-action="sync-leave" style="padding:8px 14px;font-size:.9rem">Dieses Gerät trennen</button></p>`;
  }
  const owner = /^([\w-]+)\.github\.io$/i.test(location.hostname) ? location.hostname.split('.')[0] : '';
  return `<p style="margin-top:0" class="muted">Damit alle in der Familie dieselben Rezepte haben, werden sie in einem privaten Speicher bei GitHub abgelegt – kostenlos und nur für euch sichtbar.</p>
    <form class="form" data-action="sync-join" style="gap:10px">
      <div class="field"><label for="f-code">Ich habe einen Einladungscode</label>
        <textarea id="f-code" name="code" rows="2" style="min-height:64px" placeholder="REZEPTE-…" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea></div>
      <button class="btn primary" type="submit">Verbinden</button>
    </form>
    <details style="margin-top:16px">
      <summary><b>Ich richte das Rezeptbuch ein</b> <span class="muted">(nur einmal nötig)</span></summary>
      <form class="form" data-action="sync-connect" style="gap:10px;margin-top:12px">
        <div class="field"><label for="f-repo">Name des Speichers</label>
          <input type="text" id="f-repo" name="repo" value="${esc(owner ? owner + '/Essenapp-Rezepte' : '')}" placeholder="benutzername/Essenapp-Rezepte" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
        <div class="field"><label for="f-token">Schlüssel <span class="hint">(beginnt mit „github_pat_“)</span></label>
          <input type="text" id="f-token" name="token" placeholder="github_pat_…" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
        <button class="btn primary" type="submit">Verbinden</button>
      </form>
    </details>`;
}
function updateSyncUI() {
  const l = $('#sync-line'); if (l) l.innerHTML = syncLine();
  const s = $('#sync-status'); if (s) s.innerHTML = syncLine();
}
function inviteText() {
  return `Hallo! Hier ist unser Familien-Rezeptbuch 🍳\n\n1. Diesen Link öffnen: ${BASE}\n2. Am iPhone/iPad: Teilen → „Zum Home-Bildschirm“ (Android: Menü ⋮ → „App installieren“)\n3. Die App öffnen → ⚙️ Mehr → Familien-Rezeptbuch → diesen Einladungscode einfügen:\n\n${encodeInvite(Sync.cfg)}\n\nBitte den Code nicht weitergeben – damit kann man die Rezepte ändern.`;
}
async function shareInvite() {
  const text = inviteText();
  if (navigator.share) {
    try { await navigator.share({ title: 'Familien-Rezeptbuch', text }); return; } catch (err) { if (err && err.name === 'AbortError') return; }
  }
  $('#invite-box').innerHTML = `<div class="field" style="margin-top:12px"><label for="invite-text">Diesen Text an die Familie schicken:</label>
    <textarea id="invite-text" rows="9" readonly>${esc(text)}</textarea></div>
    <button class="btn" data-action="sync-copy">📋 Kopieren</button>`;
}
function viewJoin(code) {
  setTab('settings');
  topbar({ title: 'Familien-Rezeptbuch', back: '#/' });
  const cfg = decodeInvite(code);
  if (!cfg) return '<div class="empty"><span class="big">🤔</span>Der Einladungslink ist unvollständig.</div>';
  return `<div class="card" style="text-align:center"><div style="font-size:3rem">👨‍👩‍👧</div>
    <h2 style="margin:6px 0">Familien-Rezeptbuch beitreten</h2>
    <p class="muted">Danach hast du auf diesem Gerät alle Rezepte der Familie – und deine eigenen Scans sehen die anderen auch.</p>
    <form data-action="sync-join"><input type="hidden" name="code" value="${esc(code)}"><button class="btn primary" type="submit">Jetzt verbinden</button></form></div>`;
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleSync(300); });
window.addEventListener('online', () => scheduleSync(300));
setInterval(() => { if (!document.hidden) sync(); }, 120000);

// ---------- Start ----------
const OLD_EXAMPLES = ['Zwetschgendatschi vom Blech', 'Lachs mit Kräuterkruste', 'Tomaten-Bruschetta', 'Schoko-Muffins', 'Tiramisu'];
async function init() {
  state.categories = LS.get('categories', null) || buildDefaultCategories();
  if (!catById('sonstiges')) state.categories.push({ id: 'sonstiges', name: 'Noch nicht zugeordnet', emoji: '📄', subs: [] });
  LS.set('categories', state.categories);
  try {
    state.recipes = await DB.all();
  } catch (err) {
    toast('Speicher nicht verfügbar: ' + err.message);
  }
  // Umstellung auf die Scan-Version: alte Beispielrezepte entfernen
  if (!LS.get('v2', false)) {
    for (const r of [...state.recipes]) if (!r.pages && OLD_EXAMPLES.includes(r.title)) await deleteRecipe(r.id);
    LS.set('v2', true);
  }
  if (LS.get('classifier', 0) < CLASSIFIER_VERSION) {
    for (const r of state.recipes) {
      if (r.manualCats || !recipeText(r)) continue;
      const res = classify(recipeText(r), r.title);
      if (JSON.stringify(res) !== JSON.stringify({ cats: r.cats, subs: r.subs })) { Object.assign(r, res); await saveRecipe(r); }
    }
    LS.set('classifier', CLASSIFIER_VERSION);
  }
  render();
  window.APP_STARTED = true;
  try { sessionStorage.removeItem('repair'); } catch { /* */ }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  sync();
}
init();
