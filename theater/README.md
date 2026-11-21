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

## Ein-Knopf-Modus
Einstellungen → „Ein-Knopf-Modus“: Im Spielmodus erscheint unten ein großer **WEITER**-Knopf. Jeder Druck spielt den
nächsten Kasten des Ordners (1, 2, 3 …). Pfeile = zurück/überspringen, „Von vorn“ = wieder bei 1.
Jeder Ton spielt bis zu seinem Ende und hört dann auf – der nächste kommt erst beim nächsten Druck.
**Stopp & zurück** (roter Knopf / Rücktaste): aus Versehen gedrückt? Der Ton stoppt sofort, WEITER spielt ihn nochmal.
Schutz vor Doppeldruck: ein zweiter Druck innerhalb einer halben Sekunde zählt nicht (abschaltbar).
Tastatur: Leertaste/Enter = nächster Ton · Rücktaste = Stopp & zurück · Pfeil links/rechts = Ton auswählen ·
Esc = alles stoppen · F = alles ausblenden · P = Pause. Präsentations-Fernbedienung: Weiter = nächster Ton,
Zurück = Stopp & zurück.

## Pakete teilen
Einstellungen → „Paket verschicken / sichern“: gewählte Ordner samt Tönen als eine `.buehnenton`-Datei
(WhatsApp, Mail, AirDrop, USB-Stick …). Der Empfänger öffnet sie mit „Paket öffnen“ (Windows: nach der Installation
auch per Doppelklick) und kann alles bearbeiten. Kommt das Paket zurück, werden gleiche Ordner aktualisiert.

## Windows
In Google Chrome oder Microsoft Edge öffnen und über „App installieren“ installieren. Bedienung mit der Maus wie am iPad.

## Bearbeiten
- Ordner anlegen (**+ Ordner**), aktiven Reiter antippen = umbenennen, Kastengröße (klein/mittel/groß), Reihenfolge, löschen.
- **+ Kasten** oder **Mehrere Töne** (legt für jede Datei einen Kasten an).
- Kasten antippen: Name, Ton aus Dateien oder Fotos/Videos, Farbe, Lautstärke, Einblenden und Ausblenden (je 0–10 s),
  Endlosschleife, Solo, „Nur solange gedrückt“, Start und Ende schneiden (mit Zoom und Feinschritten), reinhören.
- Kasten gedrückt halten und ziehen = verschieben, auch auf einen anderen Ordner-Reiter.
- Einstellungen: Tondateien verwalten, **Sicherung erstellen/laden** (eine Datei mit allem, z. B. für ein zweites iPad).

## Technik
Statische Web-App (HTML/CSS/JavaScript, keine Fremdbibliotheken). Wiedergabe mit der Web-Audio-API,
Töne in IndexedDB, App-Dateien im Service-Worker-Cache (`sw.js`). Bei Änderungen die Versionsnummer in
`index.html` (`?v=`), `app.js` (`APP_VERSION`) und `sw.js` (`CACHE`, `ASSETS`) erhöhen.
