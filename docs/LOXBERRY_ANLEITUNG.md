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

## 6. Log & Support

- **Protokoll**: letzte Zeilen des Daemon-Logs; Log-Level unter *Einstellungen → Erweitert* (z. B. `debug` für mehr Detail).
- **Issues / Entwicklung**: [GitHub Issues](https://github.com/spid3r/loxberry-maveo-connect/issues) — dieses Plugin ist **Community-Best-Effort**, kein offizieller Marantec-Support.
