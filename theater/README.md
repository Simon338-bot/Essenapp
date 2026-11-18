# Bühnenton 🎭

Töne und Musik fürs Theater: Kästen antippen, abspielen, gemeinsam ausblenden. Funktioniert nach der Installation ganz ohne WLAN und Internet.

**App öffnen:** https://simon338-bot.github.io/Essenapp/theater/

## Installieren (iPad / iPhone)
1. Den Link oben in **Safari** öffnen.
2. Auf das **Teilen-Symbol** tippen → **„Zum Home-Bildschirm“**.
3. Ab jetzt Bühnenton über das Symbol auf dem Home-Bildschirm öffnen. Die App und alle Töne liegen dann auf dem Gerät.

## Spielen (während der Vorstellung)
- Kasten antippen = Ton startet, nochmal antippen = Ton stoppt (mit seiner Ausblendzeit; während des Ausblendens nochmal tippen = sofort aus).
- Beliebig viele Töne gleichzeitig.
- **Pause** (alle anhalten / weiter), **Alle stoppen** (sofort), **Ausblenden** (alle gemeinsam, Dauer einstellbar).
- Grüner Punkt am Ordner-Reiter = dort läuft gerade etwas.

## Bearbeiten
- Ordner anlegen (**+ Ordner**), aktiven Reiter antippen = umbenennen, Kastengröße (klein/mittel/groß), Reihenfolge, löschen.
- **+ Kasten** oder **Mehrere Töne** (legt für jede Datei einen Kasten an).
- Kasten antippen: Name, Ton aus Dateien oder Fotos/Videos, Farbe, Lautstärke, Einblenden und Ausblenden (je 0–10 s),
  Endlosschleife, Solo, „Nur solange gedrückt“, Start und Ende schneiden (mit Zoom und Feinschritten), reinhören.
- Am Griff ⠿ ziehen = Kasten verschieben, auch auf einen anderen Ordner-Reiter.
- Einstellungen: Tondateien verwalten, **Sicherung erstellen/laden** (eine Datei mit allem, z. B. für ein zweites iPad).

## Technik
Statische Web-App (HTML/CSS/JavaScript, keine Fremdbibliotheken). Wiedergabe mit der Web-Audio-API,
Töne in IndexedDB, App-Dateien im Service-Worker-Cache (`sw.js`). Bei Änderungen die Versionsnummer in
`index.html` (`?v=`), `app.js` (`APP_VERSION`) und `sw.js` (`CACHE`, `ASSETS`) erhöhen.
