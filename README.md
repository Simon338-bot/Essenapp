# Meine Rezepte 🍳

Eingescannte Rezepte – automatisch sortiert und schnell gefunden.

**App öffnen:** https://simon338-bot.github.io/Essenapp/

## So funktioniert's

1. Unten auf **📷 Scannen** tippen und Fotos oder PDFs vom Scanner auswählen (gerne mehrere auf einmal).
2. Die App liest den Text der Rezepte (Texterkennung direkt auf dem Gerät – kostenlos, nichts wird verschickt).
3. Sie erkennt den **Titel** und sortiert das Rezept automatisch in die passende **Kategorie** und
   **Unterkategorie** ein, z. B. *Kuchen & Torten › Obstkuchen* oder *Hauptgerichte › Vegetarisch*.
4. Oben in der **Suche** einfach schreiben, was du suchst: „Ich suche einen Apfelkuchen“,
   „Suppe ohne Fleisch“, „etwas mit Lachs“ oder Zutaten wie „Kokosmilch“. Kleine Tipp- und Lesefehler
   werden verziehen.

Stimmt eine Zuordnung mal nicht, lässt sie sich im Rezept unter ✏️ ändern.

## Funktionen

- Kategorien: Vorspeisen, Suppen, Hauptgerichte, Beilagen & Salate, Nachspeisen, Kuchen & Torten,
  Plätzchen & Gebäck, Geburtstag & Feste, Snacks, Frühstück & Brot, Getränke – jeweils mit Unterkategorien
  (Fisch, Fleisch, Vegetarisch, Vegan, Blechkuchen, Torten, Rührkuchen, …)
- Ein Rezept kann in mehreren Kategorien stehen (z. B. Kuchen *und* Kindergeburtstag)
- PDFs mit mehreren Seiten: jede Seite ein Rezept – oder alle Seiten zusammen als ein Rezept
- Scans vergrößern, drehen, Favoriten, erkannten Text korrigieren
- Kategorien selbst anlegen, umbenennen, löschen
- Sicherung als Datei herunterladen und wieder einlesen

Die Rezepte werden lokal im Browser des Geräts gespeichert (kein Konto, kein Server).

## Technik

Reine statische Web-App (HTML/CSS/JavaScript), läuft auf GitHub Pages, installierbar als App und offline-fähig.
Texterkennung mit [Tesseract.js](https://github.com/naptha/tesseract.js) (Apache-2.0), PDFs mit
[pdf.js](https://github.com/mozilla/pdf.js) (Apache-2.0) – beide liegen im Ordner `vendor/`.

Lokal starten: `python3 -m http.server` im Ordner ausführen und `http://localhost:8000` öffnen.
