#!/usr/bin/env node
/* =========================================================
   Automatische Tests für „Meine Rezepte“
   Start:  node tests/run-tests.js
   Braucht: Node, Python 3 und Playwright mit Chromium.
   Erzeugt Test-Scans, startet die App lokal und einen
   GitHub-Nachbau, prüft alle wichtigen Funktionen.
   Ergebnis: Zusammenfassung + Exit-Code 0 (alles ok) / 1 (Fehler)
   ========================================================= */
'use strict';
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const FIX = path.join(__dirname, '.fixtures');
const APP_PORT = 8200, GH_PORT = 8201;
const APP = `http://localhost:${APP_PORT}/`;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? '✅' : '❌'} ${name}${ok ? '' : '  →  ' + detail}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer(args, cwd) {
  const p = spawn('python3', args, { cwd, stdio: 'ignore', detached: true });
  return p;
}
async function waitFor(url) {
  for (let i = 0; i < 50; i++) {
    const ok = await new Promise((res) => http.get(url, (r) => { r.resume(); res(true); }).on('error', () => res(false)));
    if (ok) return;
    await sleep(200);
  }
  throw new Error('Server startet nicht: ' + url);
}

// ---------- Test-Scans erzeugen ----------
const page = (body, pad = '110px 120px') => `<html><body style="margin:0;background:#fff;font-family:'DejaVu Serif',serif;color:#111;padding:${pad};font-size:30px;line-height:1.55">${body}</body></html>`;
const recipePage = (t, sub, ing, steps) => page(`<h1 style="font-size:58px;margin:0 0 10px">${t}</h1><p style="font-style:italic">${sub}</p><h2 style="font-size:34px">Zutaten</h2><ul>${ing.map((i) => `<li>${i}</li>`).join('')}</ul><h2 style="font-size:34px">Zubereitung</h2><p>${steps}</p>`);
async function makeFixtures(browser) {
  fs.mkdirSync(FIX, { recursive: true });
  const p = await browser.newPage({ viewport: { width: 1240, height: 1754 } });
  const shot = async (html, file, opts = {}) => { await p.setContent(html); await p.screenshot({ path: path.join(FIX, file), type: 'jpeg', quality: 80, ...opts }); };
  await shot(recipePage('Omas gedeckter Apfelkuchen', 'Für 1 Springform (26 cm)', ['300 g Mehl', '150 g Butter', '100 g Zucker', '1 Ei', '1 TL Backpulver', '1 kg Äpfel', '1 TL Zimt'], 'Mehl, Butter, Zucker, Ei und Backpulver zu einem Mürbeteig verkneten und 30 Minuten kalt stellen. Äpfel schälen und in Scheiben schneiden. Teig in die Springform geben, Äpfel darauf verteilen und mit Teig abdecken. Bei 180 °C etwa 50 Minuten backen.'), 'apfelkuchen.jpg');
  await shot(recipePage('Lachsfilet mit Senf-Dill-Soße', 'Für 4 Personen', ['4 Lachsfilets', '2 EL Senf', '1 Bund Dill', '200 ml Sahne', '800 g Kartoffeln'], 'Kartoffeln kochen. Lachs salzen und in der Pfanne braten. Sahne mit Senf aufkochen, Dill unterrühren. Mit den Kartoffeln servieren.'), 'lachs.jpg');
  await shot(recipePage('Rote Linsensuppe', 'Für 4 Personen', ['250 g rote Linsen', '1 Zwiebel', '2 Karotten', '1 Liter Gemüsebrühe', '1 Dose Kokosmilch', '1 TL Curry'], 'Zwiebel und Karotten würfeln und anschwitzen. Linsen und Curry dazugeben, mit Brühe ablöschen und 20 Minuten köcheln lassen. Kokosmilch einrühren und pürieren.'), 'linsensuppe.jpg');
  await shot(page(`<h1 style="font-size:60px;margin:0 0 20px">Bienenstich</h1><p><i>Für 1 Backblech</i></p><h2>Zutaten</h2><p>Für den Teig:<br>500 g Mehl<br>1 Würfel Hefe<br>250 ml Milch<br>80 g Zucker<br>80 g Butter<br>1 Ei</p><p>Für den Belag:<br>150 g Butter<br>150 g Zucker<br>200 g Mandelblättchen<br>3 EL Honig</p><p>Für die Füllung:<br>2 Päckchen Vanillepudding<br>800 ml Milch<br>400 ml Sahne</p>`), 'bienenstich-1.jpg');
  await shot(page(`<h2>Zubereitung</h2><p>Hefe in lauwarmer Milch auflösen, mit Mehl, Zucker, Butter und Ei zu einem glatten Teig kneten und 45 Minuten gehen lassen. Den Teig auf dem Backblech ausrollen.</p><p>Butter, Zucker und Honig aufkochen, Mandeln unterrühren und auf dem Teig verteilen. Bei 180 °C etwa 25 Minuten backen.</p><p>Pudding kochen, Sahne steif schlagen und unterheben. Den Kuchen waagerecht halbieren, mit der Creme füllen und kalt stellen.</p>`), 'bienenstich-2.jpg');
  // Foto mit Schatten und Zierschrift
  await p.setViewportSize({ width: 1500, height: 2000 });
  await shot(`<html><body style="margin:0;width:1500px;height:2000px;background:radial-gradient(ellipse at 20% 10%, #f4efe4 0%, #cfc6b3 55%, #8d8574 100%);font-family:'DejaVu Serif',serif;color:#2a2622">
    <div style="padding:120px 150px;transform:rotate(-1.2deg);filter:blur(0.7px)"><h1 style="font-style:italic;font-size:84px;margin:0 0 20px">Frau Holle Kuchen</h1><p style="font-size:30px;font-style:italic">Blechkuchen / Tassenkuchen</p>
    <h2 style="font-size:36px">Zutaten</h2><ul style="font-size:30px;line-height:1.5"><li>2 Tassen Mehl</li><li>1 Tasse Zucker</li><li>4 Eier</li><li>1 Päckchen Backpulver</li><li>1 Glas Kirschen</li><li>2 Päckchen Vanillepudding</li><li>400 ml Sahne, 2 Päckchen Sahnesteif</li></ul>
    <h2 style="font-size:36px">Zubereitung</h2><p style="font-size:30px;line-height:1.55">Eier und Zucker schaumig rühren, Mehl und Backpulver unterrühren. Den Teig auf ein gefettetes Backblech streichen und die Kirschen darauf verteilen. Pudding kochen und auf die Kirschen streichen. Bei 180 °C etwa 35 Minuten backen. Sahne mit Sahnesteif steif schlagen und als Schicht auf den Kuchen streichen.</p></div></body></html>`, 'frau-holle-foto.jpg', { quality: 70 });
  // Zeitschriftenseite: kleiner Text oben, große fette Überschrift darunter
  await p.setViewportSize({ width: 1400, height: 1900 });
  await shot(`<html><body style="margin:0;background:#fbfaf6;font-family:'DejaVu Sans',sans-serif;color:#222;padding:70px 110px;filter:blur(0.9px) contrast(0.85)">
    <div style="font-size:22px;letter-spacing:3px;color:#666">AUS OMAS KÜCHE · HEFT 12 · SEITE 34</div><div style="font-size:24px;margin-top:40px;color:#555">Ein Klassiker für jede Kaffeetafel – saftig und schnell gemacht.</div>
    <h1 style="font-weight:900;font-size:72px;margin:30px 0 10px">Rhabarber-Cheesecake</h1><div style="font-size:26px;color:#666">Für 1 Springform (26 cm) · 75 Minuten</div>
    <div style="columns:2;column-gap:60px;margin-top:40px;font-size:25px;line-height:1.5"><b>Zutaten</b><br>200 g Butterkekse<br>80 g Butter<br>500 g Rhabarber<br>600 g Frischkäse<br>150 g Zucker<br>3 Eier<br>200 g Schmand<br><br><b>Zubereitung</b><br>Kekse zerbröseln, mit Butter mischen und als Boden in die Springform drücken. Frischkäse, Zucker, Eier und Schmand glatt rühren, auf den Boden geben und den Rhabarber darauf verteilen. Bei 170 °C etwa 60 Minuten backen.</div></body></html>`, 'zeitschrift.jpg', { quality: 55 });
  // Zeitschriftenseite auf dem Holztisch: Titel über 4 Zeilen rechts neben einem Foto, Zeitschriftenname oben
  const zeit = (masthead, mastSize) => `<html><body style="margin:0;width:1500px;height:2000px;overflow:hidden;background:repeating-linear-gradient(8deg,#8a5a32 0 18px,#9b6a3e 18px 40px,#7d5230 40px 52px)">
    <div style="position:absolute;left:150px;top:260px;width:1220px;height:1800px;background:#f3f1ec;transform:rotate(-0.8deg);box-shadow:0 0 30px rgba(0,0,0,.4);font-family:'DejaVu Sans',sans-serif;color:#2a2a2a;filter:blur(0.6px)">
      <div style="text-align:center;font-family:'DejaVu Serif';font-weight:bold;font-size:${mastSize}px;letter-spacing:2px;margin-top:40px">${masthead}</div>
      <div style="position:absolute;left:70px;top:${mastSize + 80}px;width:780px;height:600px;background:linear-gradient(135deg,#3a8fc4,#e0a040 60%,#2f6f9f)"></div>
      <div style="position:absolute;left:880px;top:${mastSize + 90}px;width:310px;font-family:'DejaVu Serif';font-weight:bold;font-size:40px;line-height:1.25;letter-spacing:1px">Salat mit<br>Erdnuss-<br>Chili-Soße<br><span style="font-size:32px">(Gado Gado)</span>
        <div style="border-top:2px solid #444;margin:20px 0 14px"></div>
        <div style="font-size:20px;color:#2a7a6a;font-family:'DejaVu Sans'">ZUTATEN FÜR<br>3 BIS 4 PERSONEN</div>
        <div style="font-size:19px;font-weight:normal;font-family:'DejaVu Sans';line-height:1.35;margin-top:6px">100 g geschälte, ungesalzene Erdnüsse<br>1 Knoblauchzehe<br>30 ml Sojasoße<br>Saft von 1 Limette<br>Chili nach Geschmack<br>200 g Kokosmilch<br>1 Brokkoli<br>4 mittelgroße Kartoffeln<br>Salz<br>3–4 Eier<br>3 Frühlingszwiebeln</div></div>
      <div style="position:absolute;left:70px;top:${mastSize + 730}px;width:500px;font-size:19px;line-height:1.45">Ich wusste nicht, dass man Erdnüsse auch freiwillig essen kann. Aber dann habe ich dieses Rezept für Gado Gado gefunden: einen aus Indonesien stammenden Salat aus verschiedenen Gemüsen, der mit einer Erdnusssoße angemacht wird.</div>
      <div style="position:absolute;left:620px;top:${mastSize + 730}px;width:540px;font-size:19px;line-height:1.45">Die Erdnüsse auf ein Backblech legen und im Ofen bei 180 °C ungefähr 6 Minuten rösten. Mit Knoblauch, Sojasoße, Limettensaft und Chili zu einer Paste mixen. Kokosmilch dazugießen. Brokkoli dünsten, Kartoffeln kochen, Eier hart kochen. Alles mit dem Dressing vermengen.</div>
    </div></body></html>`;
  await p.setViewportSize({ width: 1500, height: 2000 });
  await shot(zeit('ZEIT MAGAZIN', 30), 'zeit-holztisch.jpg', { quality: 72 });
  await shot(zeit('BRIGITTE', 90), 'brigitte-holztisch.jpg', { quality: 72 });
  // PDF mit Textebene + Bild-PDF (zweite Seite leer)
  await p.setViewportSize({ width: 1240, height: 1754 });
  await p.setContent(recipePage('Bunte Muffins zum Kindergeburtstag', 'Für 12 Stück', ['200 g Mehl', '2 TL Backpulver', '150 g Zucker', '2 Eier', '120 ml Öl', '200 ml Milch', 'bunte Smarties'], 'Den Ofen auf 180 °C vorheizen. Alle Zutaten verrühren, in Muffinförmchen füllen und 20 Minuten backen.').replace('padding:110px 120px', 'padding:40px'));
  await p.pdf({ path: path.join(FIX, 'muffins.pdf'), format: 'A4' });
  await p.setContent(recipePage('Marmorkuchen', 'Für 1 Kastenform', ['250 g Butter', '200 g Zucker', '4 Eier', '375 g Mehl', '1 Päckchen Backpulver', '125 ml Milch', '2 EL Kakao'], 'Butter und Zucker schaumig rühren, Eier einzeln unterrühren. Mehl und Backpulver mit der Milch unterrühren. Die Hälfte des Teigs mit Kakao verrühren und marmorieren. Bei 175 °C 60 Minuten backen.'));
  const buf = await p.screenshot({ type: 'jpeg', quality: 80 });
  await p.setContent(`<html><body style="margin:0"><img style="width:100%" src="data:image/jpeg;base64,${buf.toString('base64')}"></body></html>`);
  await p.pdf({ path: path.join(FIX, 'scan_0001.pdf'), format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
  await p.close();
}

// ---------- Hilfen für die App ----------
async function newApp(browser, { syncApi } = {}) {
  const ctx = await browser.newContext({ ...devices['iPad Mini'] });
  if (syncApi) await ctx.addInitScript((u) => localStorage.setItem('rezepte.syncApi', JSON.stringify(u)), syncApi);
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  p.on('dialog', (d) => d.accept());
  await p.goto(APP);
  await p.waitForFunction(() => window.APP_STARTED === true, null, { timeout: 20000 });
  return p;
}
async function scan(p, files, { combine = false } = {}) {
  await p.goto(APP + '#/neu');
  await p.waitForSelector('.scan-drop');
  const before = await p.$$eval('.job.done, .job.error, .job.skip', (e) => e.length);
  if (combine) await p.check('#combine');
  await p.setInputFiles('input[data-action=scan-files]', files.map((f) => path.join(FIX, f)));
  await p.waitForFunction(({ before, n }) => document.querySelectorAll('.job.done, .job.error, .job.skip').length >= before + n && !document.querySelector('.job.work, .job.wait'),
    { before, n: combine ? 1 : files.length }, { timeout: 300000 }).catch(() => {});
  await p.waitForFunction(() => !document.querySelector('.job.work, .job.wait'), null, { timeout: 300000 });
}
const recipes = (p) => p.evaluate(() => state.recipes.map((r) => ({ id: r.id, title: r.title, cats: r.cats, subs: r.subs, pages: (r.pages || []).length })));
const find = (list, re) => list.find((r) => re.test(r.title));
const has = (r, ...keys) => r && keys.every((k) => (k.includes('/') ? r.subs.includes(k) : r.cats.includes(k)));

// ---------- Testfälle ----------
async function testScanning(browser) {
  console.log('\n— Scannen, Titel, Kategorien —');
  const p = await newApp(browser);
  await scan(p, ['apfelkuchen.jpg', 'lachs.jpg', 'linsensuppe.jpg', 'muffins.pdf', 'scan_0001.pdf', 'frau-holle-foto.jpg', 'zeitschrift.jpg', 'zeit-holztisch.jpg']);
  const list = await recipes(p);
  const exp = [
    [/^Omas gedeckter Apfelkuchen$/, ['kuchen/obstkuchen']],
    [/^Lachsfilet mit Senf-Dill-Soße$/, ['hauptgerichte/fisch', 'beilagen/kartoffeln']],
    [/^Rote Linsensuppe$/, ['suppen/vegetarisch', 'suppen/vegan']],
    [/^Bunte Muffins zum Kindergeburtstag$/, ['kuchen/muffins-cupcakes', 'geburtstag/kindergeburtstag']],
    [/^Marmorkuchen$/, ['kuchen/ruhrkuchen']],
    [/^Frau Holle Kuchen$/, ['kuchen/blechkuchen']],
    [/^Rhabarber-Cheesecake$/, ['kuchen/kasekuchen']],
    [/^Salat mit Erdnuss-Chili-Soße \(Gado Gado\)$/, ['beilagen/salate']],
  ];
  for (const [re, subs] of exp) {
    const r = find(list, re);
    check(`Scan erkannt: ${re.source.replace(/[\^$]/g, '')}`, has(r, ...subs), r ? `${r.title} → ${r.subs.join(', ')}` : 'nicht gefunden. Titel: ' + list.map((x) => x.title).join(' | '));
  }
  check('Frau Holle nicht unter Torten', !has(find(list, /Frau Holle/), 'kuchen/torten'));
  check('Leere PDF-Seite übersprungen', list.length === 8, `${list.length} Rezepte`);
  // Großer Zeitschriftenname über dem Titel darf nicht Titel werden (eigener Scan-Durchlauf)
  const p3 = await newApp(browser);
  await scan(p3, ['brigitte-holztisch.jpg']);
  const bt = (await recipes(p3))[0];
  check('Zeitschriftenname wird nicht Titel', bt && bt.title === 'Salat mit Erdnuss-Chili-Soße (Gado Gado)', bt && bt.title);
  await p3.context().close();
  // Suche
  const search = async (q) => { await p.goto(APP + '#/suche?q=' + encodeURIComponent(q)); await sleep(250); return p.$$eval('.rec-card .title', (e) => e.map((x) => x.textContent)); };
  const sq = [['Ich suche einen Apfelkuchen', 'Omas gedeckter Apfelkuchen'], ['Apfelkuhcen', 'Omas gedeckter Apfelkuchen'], ['etwas mit Lachs', 'Lachsfilet mit Senf-Dill-Soße'], ['Kokosmilch', 'Rote Linsensuppe'], ['Suppe ohne Fleisch', 'Rote Linsensuppe'], ['Kindergeburtstag', 'Bunte Muffins zum Kindergeburtstag']];
  for (const [q, want] of sq) { const res = await search(q); check(`Suche „${q}“`, res[0] === want, res.join(' | ') || 'keine Treffer'); }
  const veg = await search('vegan');
  check('Suche „vegan“ findet nur Veganes', veg.length === 1 && veg[0] === 'Rote Linsensuppe', veg.join(' | '));
  // Rezeptansicht, Neu lesen, Drehen
  const apfel = find(list, /Apfelkuchen/);
  await p.goto(APP + '#/r/' + apfel.id); await sleep(300);
  check('Rezept zeigt Scan-Bild', await p.$eval('.scan-page img', (i) => i.complete && i.naturalWidth > 100).catch(() => false));
  await p.click('[data-action=reread]');
  await p.waitForFunction(() => !document.querySelector('[data-action=reread][disabled]'), null, { timeout: 120000 });
  check('„Neu lesen“ behält Titel', (await recipes(p)).some((r) => r.title === 'Omas gedeckter Apfelkuchen'));
  check('Keine JavaScript-Fehler beim Scannen', p.errors.length === 0, p.errors.join(' | '));
  await p.context().close();
}

async function testMultiPage(browser) {
  console.log('\n— Mehrseitige Rezepte —');
  const p = await newApp(browser);
  await scan(p, ['bienenstich-1.jpg', 'bienenstich-2.jpg', 'linsensuppe.jpg']);
  let list = await recipes(p);
  const b = find(list, /^Bienenstich$/);
  check('Fortsetzungsseite automatisch angehängt', b && b.pages === 2 && list.length === 2, list.map((r) => `${r.title}[${r.pages}]`).join(' | '));
  check('Bienenstich ist Blechkuchen', has(b, 'kuchen/blechkuchen') && !has(b, 'kuchen/torten'), b && b.subs.join(','));
  await p.click('[data-action=split-job]');
  await p.waitForFunction(() => state.recipes.length === 3, null, { timeout: 60000 }).catch(() => {});
  list = await recipes(p);
  check('„Doch eigenes Rezept“ trennt Seite ab', list.length === 3, list.map((r) => `${r.title}[${r.pages}]`).join(' | '));
  const other = list.find((r) => r.id !== b.id && !/Linsen/.test(r.title));
  await p.goto(APP + '#/zusammen/' + b.id); await sleep(300);
  await p.click(`[data-action=merge-pick][data-other="${other.id}"]`);
  await sleep(800);
  list = await recipes(p);
  check('Zusammenführen ergibt ein Rezept mit 2 Seiten', list.length === 2 && find(list, /^Bienenstich$/).pages === 2, list.map((r) => `${r.title}[${r.pages}]`).join(' | '));
  await p.goto(APP + '#/r/' + b.id); await sleep(300);
  await p.setInputFiles('input[data-action=add-pages]', [path.join(FIX, 'apfelkuchen.jpg')]);
  await p.waitForFunction((id) => state.recipes.find((r) => r.id === id).pages.length === 3, b.id, { timeout: 120000 }).catch(() => {});
  check('„Seite hinzufügen“', find(await recipes(p), /^Bienenstich$/).pages === 3);
  await sleep(500);
  await p.click('[data-action=page-del][data-i="2"]'); await sleep(600);
  check('Seite löschen', find(await recipes(p), /^Bienenstich$/).pages === 2);
  check('Keine JavaScript-Fehler (mehrseitig)', p.errors.length === 0, p.errors.join(' | '));
  await p.context().close();
}

async function testLogic(browser) {
  console.log('\n— Einordnung, Titel, Wortkorrektur (ohne Scan) —');
  const p = await newApp(browser);
  const cls = [
    ['Auberginenpüree', 'Auberginen rösten, das Fruchtfleisch herauslösen und pürieren. Als Vorspeise servieren. Knoblauch, Olivenöl.', ['vorspeisen/vegetarisch'], ['vorspeisen/fleisch']],
    ['Wildkräutersuppe', 'Wildkräuter, 1 Zwiebel, 2 Kartoffeln, 1 l Gemüsebrühe, Sahne. 20 Minuten köcheln und pürieren.', ['suppen/vegetarisch'], ['suppen/fleisch', 'beilagen/kartoffeln']],
    ['Tomatensalat', '4 Fleischtomaten, Zwiebel, Essig, Öl.', ['beilagen/salate'], ['hauptgerichte/fleisch']],
    ['Blumenkohlsteaks', 'Blumenkohl in Scheiben schneiden und im Ofen backen. Als Hauptgericht.', ['hauptgerichte/vegetarisch'], ['hauptgerichte/fleisch']],
    ['Linsen-Bolognese', 'Rote Linsen, Tomaten, Spaghetti. Statt Hackfleisch Linsen verwenden. Als Hauptgericht.', ['hauptgerichte/vegetarisch', 'hauptgerichte/nudeln'], ['hauptgerichte/fleisch']],
    ['Wildschweinbraten', '1,5 kg Wildschwein, Rotwein, Wacholder. Als Hauptgericht schmoren.', ['hauptgerichte/fleisch'], []],
    ['Spaghetti Carbonara', '400 g Spaghetti, 150 g Speck, Eigelb, Parmesan.', ['hauptgerichte/fleisch', 'hauptgerichte/nudeln'], []],
    ['Kartoffelsalat', '1 kg Kartoffeln, Gurke, Zwiebel, Brühe, Essig, Öl.', ['beilagen/kartoffeln', 'beilagen/salate'], []],
    ['Saftiger Schokokuchen', 'Schokolade, Butter, Zucker, Eier, Mehl, Backpulver. Eier schaumig schlagen. In der Springform bei 180 °C backen.', ['kuchen/ruhrkuchen'], ['kuchen/torten']],
    ['Schwarzwälder Kirschtorte', 'Biskuitboden aus Eiern, Zucker, Mehl, Kakao. Boden waagerecht durchschneiden. Sahne steif schlagen, Kirschen einschichten.', ['kuchen/torten'], []],
    ['Streuselkuchen', 'Hefeteig auf dem Backblech ausrollen, Streusel darauf verteilen, bei 180 °C backen. Zucker, Mehl, Butter.', ['kuchen/blechkuchen'], []],
    ['Erdnussbutter-Brownies', '200 g Erdnussbutter, Zucker, Eier, Mehl, Schokolade. Verrühren und backen.', ['kuchen'], ['kuchen/ohne-backen', 'gebaeck']],
  ];
  for (const [t, x, want, notWant] of cls) {
    const r = await p.evaluate(([t, x]) => classify(x, t), [t, x]);
    const all = [...r.cats, ...r.subs];
    check(`Einordnung: ${t}`, want.every((w) => all.includes(w)) && notWant.every((w) => !all.includes(w)), all.join(', '));
  }
  const titles = [
    [[['DE Erdnussbutter - Brownies', 50]], 'Erdnussbutter, Zucker, Eier. Die Erdnussbutter verrühren und backen.', 'Erdnussbutter-Brownies'],
    [[['| Omas Apfelkuchen ®', 50]], 'Äpfel, Mehl, Zucker, Butter, Springform', 'Omas Apfelkuchen'],
    [[['Kirschkuchcn vom Blech', 50]], 'Kirschen, Mehl. Den Kirschkuchen auf dem Backblech backen.', 'Kirschkuchen vom Blech'],
    [[['Das ist Omas bestes Gericht!', 60], ['Hefezopf', 30]], 'Für den Hefezopf: Mehl, Hefe, Milch. Den Hefezopf flechten.', 'Omas Hefezopf'],
    [[['Das ist Omas genialer Hefezopf', 60]], 'Mehl, Hefe, Milch. Den Zopf flechten.', 'Omas genialer Hefezopf'],
    [[['So gelingt er garantiert!', 60]], 'Äpfel, Mehl. Den Apfelstrudel einrollen und backen. Der Apfelstrudel mit Vanillesauce.', 'Apfelstrudel'],
    [[['Unser Lieblingsrezept für den Sommer', 60]], 'Gurken, Dill, Joghurt. Den Gurkensalat kalt servieren. Gurkensalat passt zu Fisch.', 'Gurkensalat'],
    [[['ii | ~ ,.', 50, 20]], 'Rote Linsen, Zwiebel, Gemüsebrühe, Kokosmilch. Die Suppe 20 Minuten köcheln.', 'Vegane Suppe mit Linsen'],
  ];
  for (const [ls, x, want] of titles) {
    const r = await p.evaluate(([ls, x]) => titleAndCats(ls.map(([t, h, c]) => ({ text: t, h, conf: c || 85 })), x, null), [ls, x]);
    check(`Titel: „${ls.map((l) => l[0]).join(' / ')}“`, r.title === want, `bekam „${r.title}“, erwartet „${want}“`);
  }
  const words = [['Zwetschgcn', 'Zwetschgen'], ['Strcuselkuchen', 'Streuselkuchen'], ['Butterrnilch', 'Buttermilch'], ['Springforrn', 'Springform'], ['Käsekuchcn', 'Käsekuchen'], ['Mchl', 'Mehl'],
    ['Holle', 'Holle'], ['Omas', 'Omas'], ['Brownies', 'Brownies'], ['Annegret', 'Annegret'], ['Sauerrahmkuchen', 'Sauerrahmkuchen']];
  for (const [w, want] of words) {
    const r = await p.evaluate((w) => { const c = correctNorm(norm(w)); return c ? restoreWord(c, w) : w; }, w);
    check(`Wortkorrektur: ${w}`, r === want, `bekam ${r}`);
  }
  check('Keine JavaScript-Fehler (Logik)', p.errors.length === 0, p.errors.join(' | '));
  await p.context().close();
}

async function testStorageAndUpdate(browser) {
  console.log('\n— Speicher, Update, Kategorien —');
  const p = await newApp(browser);
  await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 60; c.height = 40; c.getContext('2d').fillRect(0, 0, 30, 40);
    const jpg = await new Promise((r) => c.toBlob(r, 'image/jpeg'));
    const odd = new Blob([await jpg.arrayBuffer()], { type: 'application/octet-stream' });
    await DB.put({ id: 'alt1', title: 'Altes Rezept', cats: ['kuchen'], subs: [], text: 'Kuchen', pages: [odd], thumb: odd, created: 1, scanned: true, manualTitle: true, manualCats: true });
  });
  await p.reload(); await p.waitForFunction(() => window.APP_STARTED === true);
  const raw = await p.evaluate(async () => (await DB.all()).find((r) => r.id === 'alt1').pages[0].__img ? 'ok' : 'blob');
  check('Alte Bilder werden robust umgespeichert', raw === 'ok');
  await p.goto(APP + '#/r/alt1'); await sleep(400);
  check('Altes Bild wird angezeigt', await p.$eval('.scan-page img', (i) => i.complete && i.naturalWidth === 60).catch(() => false));
  check('Selbst gesetzte Kategorie bleibt', (await recipes(p)).find((r) => r.id === 'alt1').cats.join() === 'kuchen');
  // Kategorie anlegen
  await p.goto(APP + '#/einstellungen'); await sleep(300);
  await p.evaluate(() => { window.prompt = () => 'Grillen'; });
  await p.click('[data-action=cat-add]'); await sleep(300);
  check('Neue Kategorie anlegen', await p.evaluate(() => state.categories.some((c) => c.name === 'Grillen')));
  // Sicherung exportieren/importieren (Daten-Rundlauf)
  const json = await p.evaluate(async () => {
    const recipes = [];
    for (const r of state.recipes) recipes.push({ ...r, pages: await Promise.all((r.pages || []).map(blobToDataUrl)), thumb: await blobToDataUrl(r.thumb) });
    return JSON.stringify({ app: 'meine-rezepte', version: 2, categories: state.categories, recipes });
  });
  const p2 = await newApp(browser);
  const f = path.join(FIX, 'sicherung.json'); fs.writeFileSync(f, json);
  await p2.goto(APP + '#/einstellungen'); await sleep(300);
  await p2.setInputFiles('input[data-action=import]', f); await sleep(1500);
  check('Sicherung einlesen', (await recipes(p2)).some((r) => r.id === 'alt1'));
  check('Keine JavaScript-Fehler (Speicher)', p.errors.length + p2.errors.length === 0, [...p.errors, ...p2.errors].join(' | '));
  await p.context().close(); await p2.context().close();
}

async function testSync(browser) {
  console.log('\n— Familien-Rezeptbuch (mit GitHub-Nachbau) —');
  const api = `http://localhost:${GH_PORT}`;
  const A = await newApp(browser, { syncApi: api }), B = await newApp(browser, { syncApi: api });
  const idle = (p) => p.waitForFunction(() => !Sync.busy, null, { timeout: 120000 });
  const titles = async (p) => (await recipes(p)).map((r) => `${r.title}[${r.pages}]`).sort().join(' | ');
  await scan(A, ['apfelkuchen.jpg', 'lachs.jpg']);
  await A.goto(APP + '#/einstellungen'); await sleep(300);
  await A.click('#sync-card details summary');
  await A.fill('#f-repo', 'fam/rezepte'); await A.fill('#f-token', 'github_pat_TESTTESTTESTTESTTEST');
  await A.click('form[data-action=sync-connect] button[type=submit]');
  await sleep(800); await idle(A);
  check('Verbinden + Hochladen', !(await A.evaluate(() => Sync.error)), await A.evaluate(() => Sync.error));
  const code = await A.evaluate(() => encodeInvite(Sync.cfg));
  await B.goto(APP + '#/einstellungen'); await sleep(300);
  await B.fill('#f-code', code);
  await B.click('form[data-action=sync-join] button[type=submit]');
  await sleep(800); await idle(B);
  check('Familienmitglied bekommt alle Rezepte mit Bildern', (await titles(B)) === (await titles(A)) && (await titles(B)).includes('[1]'), `A: ${await titles(A)} / B: ${await titles(B)}`);
  await scan(B, ['linsensuppe.jpg']);
  await B.evaluate(async () => {
    await deleteRecipe(state.recipes.find((r) => r.title.startsWith('Lachs')).id);
    const a = state.recipes.find((r) => r.title.includes('Apfel')); a.title = 'Apfelkuchen von Oma'; a.manualTitle = true; await saveRecipe(a);
  });
  await sleep(2500); await idle(B);
  await scan(A, ['muffins.pdf']); await sleep(2500); await idle(A);
  await A.evaluate(() => sync()); await idle(A);
  await B.evaluate(() => sync()); await idle(B);
  const ta = await titles(A), tb = await titles(B);
  check('Neu, geändert, gelöscht und gleichzeitig gespeichert – überall gleich', ta === tb && /Apfelkuchen von Oma/.test(ta) && !/Lachs/.test(ta) && /Muffins/.test(ta) && /Linsensuppe/.test(ta), `A: ${ta} / B: ${tb}`);
  await A.evaluate(async () => { const r = state.recipes[0]; r.fav = true; await saveRecipe(r, { quiet: true }); await sync(); });
  await B.evaluate(() => sync()); await idle(B);
  check('Favoriten bleiben persönlich', (await B.evaluate(() => state.recipes.filter((r) => r.fav).length)) === 0);
  check('Keine JavaScript-Fehler (Abgleich)', A.errors.length + B.errors.length === 0, [...A.errors, ...B.errors].join(' | '));
  await A.context().close(); await B.context().close();
}

async function testUpdatePath(browser) {
  console.log('\n— Startseite, Update-Schutz —');
  const p = await newApp(browser);
  for (const h of ['#/', '#/suche', '#/favoriten', '#/einstellungen', '#/neu', '#/k/kuchen', '#/k/kuchen/blechkuchen', '#/gibtsnicht']) {
    await p.goto(APP + h); await sleep(200);
    check(`Seite ${h} lädt`, (await p.$eval('#app', (e) => e.innerText.length)) > 10);
  }
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const v = (html.match(/app\.js\?v=(\d+)/) || [])[1];
  check(`Versionsnummern in index.html und sw.js passen zusammen', v && sw.includes(`app.js?v=${v}`) && html.includes(`vocab.js?v=${v}`) && html.includes(`styles.css?v=${v}`) && sw.includes(`rezepte-v${v}`), `index v=${v}`);
  check('Keine JavaScript-Fehler (Seiten)', p.errors.length === 0, p.errors.join(' | '));
  await p.context().close();
}

(async () => {
  const app = startServer(['-m', 'http.server', String(APP_PORT)], ROOT);
  const gh = startServer([path.join(__dirname, 'mock_github.py'), String(GH_PORT)], __dirname);
  let browser;
  try {
    await waitFor(APP); await waitFor(`http://localhost:${GH_PORT}/`);
    browser = await chromium.launch();
    await makeFixtures(browser);
    const only = process.argv[2];
    const suites = { logic: testLogic, scan: testScanning, multi: testMultiPage, storage: testStorageAndUpdate, sync: testSync, pages: testUpdatePath };
    for (const [name, fn] of Object.entries(suites)) {
      if (only && only !== name) continue;
      try { await fn(browser); } catch (err) { check(`Testblock „${name}“ ohne Absturz`, false, err.stack || err.message); }
    }
  } finally {
    if (browser) await browser.close();
    try { process.kill(-app.pid); } catch { /* */ }
    try { process.kill(-gh.pid); } catch { /* */ }
  }
  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length} von ${results.length} Prüfungen bestanden.`);
  if (bad.length) { console.log('Fehlgeschlagen:\n' + bad.map((b) => ` - ${b.name}: ${b.detail}`).join('\n')); process.exit(1); }
})();
