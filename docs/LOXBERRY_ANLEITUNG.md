# Maveo Connect — Kurzanleitung für LoxBerry

Diese Anleitung richtet sich an **Nutzer** auf einem LoxBerry 3.x mit installiertem Plugin **Maveo Connect**. Technische Details zum Aufbau des ZIP finden sich im [README](../README.md).

## 1. Installation

1. Aktuelle **`loxberry-plugin-maveoconnect-*.zip`** von [GitHub Releases](https://github.com/spid3r/loxberry-maveo-connect/releases) laden (Asset **ZIP**, nicht „Source code“).
2. LoxBerry → **Plugin-Verwaltung** → ZIP hochladen oder **Installation per URL** (empfohlen, wenn der Browser-Upload fehlschlägt — siehe auch [LoxBerry Wiki / Plugin lässt sich nicht installieren](https://wiki.loxberry.de/loxberry_english/english_faq_and_knowledge_base/plugin_cannot_be_installed)).
3. Nach erfolgreicher Installation erscheint **Maveo Connect** in der Plugin-Liste.

Hinweise zu fehlgeschlagenen Installationen (korrupte Uploads, parallele Installer) sind beim Schwester-Plugin dokumentiert: [troubleshooting-plugin-install (Abfall.io)](https://github.com/spid3r/loxberry-api-abfall-io/blob/main/docs/troubleshooting-plugin-install.md) — die gleichen Grundsätze gelten hier.

## 2. Ersteinrichtung (Pflicht)

1. Plugin öffnen → **Einstellungen**.
2. **E-Mail** und **Passwort** des Maveo-Kontos eintragen.
3. **Anmeldung prüfen & Geräte laden** — bei Erfolg erscheint eine Bestätigung und die Stick-Liste.
4. **Thing (Stick)** aus der Dropdown-Liste wählen (oder Namen manuell eintragen, wenn bekannt).
5. **Speichern** — der Daemon lädt die Konfiguration neu (`POST /api/reload` über die Web-Oberfläche).

Wenn MQTT nach dem Speichern nicht sofort verbunden ist: auf der Seite **Status & Steuerung** einmal **Daemon neu starten** (oder per SSH das Plugin-Daemon-Skript `restart` ausführen — je nach LoxBerry-Image). Für automatisierte Tests kann optional `E2E_SSH_RESTART_CMD` gesetzt werden (siehe README / Entwickler-Doku).

## 3. Nur eine MQTT-Session

Pro **Maveo Connect Stick** ist nur **eine** gleichzeitige MQTT-Verbindung zur Marantec-Cloud möglich — wie in der offiziellen Maveo-App. Wenn die **Maveo-App** auf dem Smartphone offen ist oder sich verbindet, kann der LoxBerry-Daemon die Session verlieren.

## 3b. Automatische Wiederherstellung und „Burst“-Pause

Wenn die **Maveo-App** die MQTT-Session **mehrfach kurz hintereinander** übernimmt (typisch: drei Verluste innerhalb von 10 Sekunden), schaltet die Bibliothek die **automatische** Wiederanmeldung für **zwei Minuten** ab — das steht so im Log als `MQTT session contention burst — auto-reclaim paused` inkl. Zeitstempel `backoffUntilIso`. In dieser Zeit musst du **selbst** eine der MQTT-Schaltflächen auf der Status-Seite nutzen oder warten, bis die Pause vorbei ist. Das ist kein Fehler, sondern soll „Ping-Pong“ zwischen App und LoxBerry reduzieren.

## 4. Session manuell zurückholen (Reclaim)

Auf **Status & Steuerung** gibt es zwei Schaltflächen mit derselben technischen Aktion (POST an den Daemon mit **`/api/reconnect`**):

- **MQTT neu verbinden**
- **Session von App zurückholen**

Beide bewirken: **neue Anmeldung** bei Maveo, **Zurücksetzen** des internen Session-Contention-Backoffs und **neuer MQTT-Aufbau** (inkl. frischer Credentials, soweit der Daemon das vorsieht). Schließe die **offizielle Maveo-App** vorher bzw. beende sie dort, sonst kann sie die Session sofort wieder übernehmen.

Wenn die **automatische** Wiederherstellung wegen häufiger Konflikte mit der App **pausiert** ist, zeigt die Status-Seite einen **Hinweis mit Countdown** — danach kannst du trotzdem jederzeit eine der beiden MQTT-Schaltflächen nutzen.

## 5. Live-Aktualisierung der Status-Seite

Die Werte (Tor, Licht, Badge) werden im Browser **etwa alle 2 Sekunden** per AJAX vom Daemon abgefragt. Eine Browser-**WebSocket**-Verbindung zum Node-Port ist auf einem Standard-LoxBerry ohne zusätzlichen Apache-Proxy nicht vorgesehen.

## 6. Loxone-Steuerung über Virtuelle Ausgänge

Das Plugin bringt eine kleine, **opt-in** HTTP-API mit, die du aus Loxone direkt mit **Virtuellen Ausgängen** (HTTP-GET) ansprechen kannst. Vorteile:

- **Kein Token in Loxone** — das interne Daemon-Token bleibt auf dem LoxBerry.
- **Kein zusätzlicher Netzwerkport** — der Node-Daemon hört weiterhin nur auf `127.0.0.1`. Die PHP-Wrapper laufen unter dem normalen LoxBerry-Apache.
- **Standard-LoxBerry-Auth** — geschützt durch die übliche **Basic-Auth** des LoxBerry-Plugin-Bereichs (z. B. `loxberry:loxberry` — das, was du auch zum Öffnen der Plugin-Seite eingibst).

### 6.1 Aktivieren

1. Plugin → **Einstellungen**.
2. Im Block **„MQTT & Loxone-Anbindung“** den Schalter **„Loxone-Steuer-API aktivieren“** einschalten und **Speichern**.
3. Solange der Schalter aus ist, antworten die Endpunkte mit HTTP `503 disabled` — nichts kann versehentlich das Tor öffnen.

### 6.2 URLs für Virtuelle Ausgänge

Ersetze `LB-IP` durch die LAN-Adresse deines LoxBerry und `loxberry:loxberry` durch deine LoxBerry-Plugin-Anmeldedaten:

```text
http://loxberry:loxberry@LB-IP/admin/plugins/maveoconnect/api/door.php?cmd=open
http://loxberry:loxberry@LB-IP/admin/plugins/maveoconnect/api/door.php?cmd=close
http://loxberry:loxberry@LB-IP/admin/plugins/maveoconnect/api/door.php?cmd=stop
http://loxberry:loxberry@LB-IP/admin/plugins/maveoconnect/api/door.php?cmd=ventilate
http://loxberry:loxberry@LB-IP/admin/plugins/maveoconnect/api/light.php?state=on
http://loxberry:loxberry@LB-IP/admin/plugins/maveoconnect/api/light.php?state=off
http://loxberry:loxberry@LB-IP/admin/plugins/maveoconnect/api/light.php?state=toggle
http://loxberry:loxberry@LB-IP/admin/plugins/maveoconnect/api/reclaim.php
http://loxberry:loxberry@LB-IP/admin/plugins/maveoconnect/api/status.php
```

Erfolgreiche Aktionen liefern HTTP `200` mit dem Body `OK`. `status.php` liefert ein kompaktes JSON, das du als Fallback für reine HTTP-Statusabfragen aus Loxone nutzen kannst (z. B. wenn du kein MQTT-Gateway laufen hast).

### 6.3 Tor-Statuscodes (für den Loxone-Statusbaustein)

`door_position` (über MQTT) bzw. `doorPosition` (über `status.php`) ist eine Zahl 0…6. Du findest die Tabelle 1:1 auch in der Plugin-Oberfläche unter **Einstellungen** und **Status & Steuerung**:

| Code | Bezeichnung | Bedeutung |
|------|-------------|-----------|
| 0 | `stopped` | Motor zwischen den Endlagen angehalten |
| 1 | `opening` | Tor öffnet |
| 2 | `closing` | Tor schließt |
| 3 | `open` | Vollständig offen |
| 4 | `closed` | Vollständig geschlossen |
| 5 | `intermediateOpen` | Zwischenstellung / Lüftungsposition |
| 6 | `intermediateClosed` | Zwischenstellung Richtung geschlossen |

Übliches Mapping im Loxone-Statusbaustein **Tor**: „offen“ = 3 oder 5, „zu“ = 4, „fährt“ = 1 oder 2. `light_on` ist `1`/`0`.

### 6.4 Sicherheitshinweis

Die Loxone-Steuer-API ist für dein **Heimnetz** gedacht — die Basic-Auth schützt sie auf demselben Niveau wie alle anderen LoxBerry-Plugin-Seiten. Mache sie **nicht** ohne weiteren Schutz aus dem Internet erreichbar; das gilt für jedes LoxBerry-Plugin gleichermaßen.

## 7. Log & Support

- **Protokoll**: letzte Zeilen des Daemon-Logs; Log-Level unter *Einstellungen → Erweitert* (z. B. `debug` für mehr Detail).
- **Log-Rotation**: Das Plugin rotiert `daemon.log` automatisch bei ca. **1 MiB** auf `daemon.log.1` (eine Sicherung; Gesamtbedarf ~2 MiB). Auch `daemon.shell.log` (nohup-Ausgabe von Start/Stop) wird beim Daemon-Start ab ~1 MiB rotiert. Werte sind über `settings.json → logging.maxBytes` und `logging.keepFiles` änderbar (`keepFiles: 0` schaltet die Rotation ab).
- **„Log löschen“**: Auf der Seite **Protokoll** steht ein Button, der `daemon.log` und alle Sicherungen sofort leert und den Live-Puffer in der Web-Oberfläche zurücksetzt — praktisch nach einem Debug-Lauf.
- **Issues / Entwicklung**: [GitHub Issues](https://github.com/spid3r/loxberry-maveo-connect/issues) — dieses Plugin ist **Community-Best-Effort**, kein offizieller Marantec-Support.
