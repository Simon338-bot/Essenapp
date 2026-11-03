# Meine Rezepte 🍳

Eine kleine Web-App für die eigenen Rezepte – schnell gefunden, einfach nachgekocht.
Läuft im Browser auf Handy, Tablet und PC, lässt sich als App installieren und funktioniert offline.

## Funktionen

- **Kategorien** auf der Startseite: Vorspeisen, Suppen, Hauptgerichte, Beilagen & Salate, Nachspeisen,
  Kuchen & Torten, Plätzchen & Gebäck, Geburtstag & Feste, Snacks, Frühstück & Brot, Getränke
- **Unterkategorien** beim Antippen, z. B. Fisch / Fleisch / Vegetarisch / Vegan oder bei Kuchen
  Blechkuchen / Torten / Rührkuchen / Obstkuchen / Käsekuchen / Muffins …
- Ein Rezept kann in **mehreren Kategorien** stehen (z. B. Kuchen *und* Geburtstag)
- **Suche** nach Name, Zutat, Stichwort oder Kategorie
- **Kochmodus**: Schritt für Schritt in großer Schrift, Bildschirm bleibt an, Wischen zum Blättern
- **Timer**: Zeitangaben wie „20 Minuten“ im Rezept antippen → Timer mit Ton
- **Portionen umrechnen**: Mengen passen sich automatisch an
- Zutaten zum Abhaken, Fotos, Favoriten, „zuletzt gekocht“, Notizen, Quelle
- Kategorien und Unterkategorien selbst anlegen, umbenennen, löschen
- **Sicherung** als Datei herunterladen und wieder einlesen (auch zum Übertragen auf ein anderes Gerät)

Die Rezepte werden lokal im Browser des Geräts gespeichert (kein Konto, kein Server).

## Starten

Keine Installation nötig – es sind nur statische Dateien.

- **Online (empfohlen):** Im GitHub-Repository unter *Settings → Pages* bei „Source“
  den Branch `main` und Ordner `/ (root)` wählen. Nach kurzer Zeit ist die App unter
  `https://<benutzername>.github.io/Essenapp/` erreichbar. Auf dem Handy öffnen und
  im Browser-Menü „Zum Startbildschirm hinzufügen“ wählen.
- **Lokal:** `python3 -m http.server` im Ordner ausführen und `http://localhost:8000` öffnen.
