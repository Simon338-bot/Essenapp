# Änderungen

## 2026-11-04
- Texterkennung liest jetzt immer im gleichen Modus (Spaltenerkennung) – vorher wurde die erste Seite eines Stapels anders gelesen als die übrigen
- Schriftgröße für die Titelwahl wird an den Buchstaben gemessen; Fließtextzeilen werden nicht mehr als Titel gewählt; Titel werden auch nach oben zusammengesetzt
- Alle Scans werden einmal automatisch neu gelesen
- Titel hören vor Zutaten- und Mengenzeilen auf („Zutaten für 2 bis 3 Personen: …“); richtig geschriebene Titelwörter werden nicht mehr „korrigiert“
- Salate mit „Backblech“ im Text werden nicht mehr als herzhafter Kuchen eingeordnet
- Lasagne & Co.: „fleischlos“, „Wer mag, kann auch Schinken dazugeben“ oder „Für Fleischesser …“ machen ein Gericht nicht mehr zum Fleischgericht; Béchamel zählt als nicht vegan
- Deftige Kuchen (Spinatkuchen, Zwiebelkuchen, Quiche …) kommen unter Hauptgerichte und die neue Unterkategorie „Kuchen & Torten › Herzhafte Kuchen & Quiches“
- Fotos von Zeitschriftenseiten: Hintergrund (z. B. Holztisch) wird vor dem Lesen abgeschnitten
- Titel über mehrere Zeilen werden zusammengesetzt (z. B. „Salat mit / Erdnuss- / Chili-Soße / (Gado Gado)“)
- Zeitschriftennamen wie „ZEIT MAGAZIN“ oder „BRIGITTE“ werden nicht mehr als Titel genommen
- Alle Scans werden einmal automatisch neu gelesen

## 2026-11-03
- Rezepte einscannen (Fotos/PDFs), Texterkennung auf dem Gerät, automatische Kategorien
- Suche in ganzen Sätzen, Familien-Rezeptbuch, mehrseitige Rezepte
- Bessere Titel, Wortkorrektur, Fleisch/vegetarisch-Erkennung, Kartoffelgerichte
- Automatische Tests (`node tests/run-tests.js`) und tägliche Prüfung (siehe `WARTUNG.md`)
- Knopf „Falsch erkannt? Melden“
