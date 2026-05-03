====== Maveo Connect / Marantec (Connect Stick over MQTT) ======

++++ Version History |
{{VERSION_HISTORY}}

Ältere Releases und **ZIP‑Pakete** gibt es bei **[[https://github.com/spid3r/loxberry-maveo-connect/releases|GitHub Releases]]**. Der **Quelltext** liegt im **[[https://github.com/spid3r/loxberry-maveo-connect|Repository]]**.

++++


===== Überblick =====

Mit dem Plugin kannst du den **Garagentorantrieb über Marantec Maveo (Connect Stick / IoT)** an **LoxBerry** binden:

  * Ein **Node.js‑Daemon** im Plugin‑Ordner öffnet die **MQTT‑Sitzung zur Marantec‑Cloud**, liest Tür‑ und Lichtzustände und akzeptiert Befehle von der **PHP‑Oberfläche** sowie von der **Mini‑Daemon‑HTTP‑API** (mit Token‑Schutz).

  * Optional kann der Daemon **MQTT‑Nachrichten** an einen **lokalen Broker** weiterleiten (z. B. LoxBerry‑MQTT, Home Assistant).

**Disclaimer:** Das Projekt ist **öffentlich / community‑geführt**, **nicht** offiziell von Marantec oder Maveo. Die Cloud‑Anbindung (Cognito, IoT/MQTT) kann sich **jederzeit ändern** oder entfallen — das Plugin kann dadurch **ohne Vorankündigung** aufhören zu funktionieren. Volltext: **[[https://github.com/spid3r/loxberry-maveo-connect/blob/main/DISCLAIMER.md|DISCLAIMER auf GitHub]]**.

===== Download =====

[[https://github.com/spid3r/loxberry-maveo-connect/releases|ZIP der aktuellen Version (GitHub Releases)]]


===== Installation =====

Voraussetzung: **LoxBerry ab Version 3.x**. ZIP unter **System → Plugins** installieren, dann das Plugin öffnen.

  * Tab **Einstellungen**: Maveo‑Zugangsdaten (E‑Mail, Passwort, Cognito‑Pool, Stick‑Serie/Thing‑Name) eintragen und **speichern**.

  * Danach **Daemon** starten (LoxBerry startet den Dienst üblicherweise automatisch nach Speichern / Plugin‑Neustart).

===== Konfiguration (Auszug) =====

  * **HTTP‑API des Daemons** (nur von localhost / mit Token): Port und Host in den Einstellungen; das Token wird vom Plugin in ''api_token.txt'' gespeichert.

  * **MQTT‑Weiterleitung**: optional Broker‑URL, Topic‑Präfix; bei **LoxBerry‑Broker** (127.0.0.1:1883) ermittelt der Daemon Zugangsdaten wie das MQTT‑System (''general.json'' / ''cred.json''‑Pfade) — siehe Hilfetext in den Einstellungen.

  * **Erweiterte MQTT‑Sitzung**: Verhalten bei „App vs. Plugin“ (Session‑Contention / Reclaim) ist in der Library dokumentiert; die Standardeinstellungen sind für die meisten Installationen sinnvoll.

===== Screenshots =====

{{SCREENSHOT_GALLERY}}

===== Loxone-Anbindung (Beispiel) =====

{{LOXONE_GALLERY}}

===== MQTT-Weiterleitung =====

Nach Aktivierung in den Einstellungen publiziert der Daemon **nicht‑retained** Nachrichten unter dem **Topic‑Präfix** mit den Endungen ''door_position'', ''door_label'' und ''light_on'' (Klartext bzw. Zahlencode — **kein** kombiniertes JSON‑Sammeltopic, damit das LoxBerry‑MQTT‑Gateway keine doppelten flachen Namen mit ''#''‑Escapes erzeugt). Details und Loxone‑Hinweise: README im Repository und Tab **Einstellungen** im Plugin.

===== HTTP-Daemon (intern) =====

Die PHP‑Oberfläche spricht den Daemon mit dem in den Einstellungen verwalteten **API‑Token** an. Direkte Fernzugriffe von außen auf den Daemon‑Port sind üblicherweise durch die LoxBerry‑Konfiguration **nicht exponiert**.

===== Support / Fehler melden =====

Bitte Issues im GitHub‑Repository angeben (**[[https://github.com/spid3r/loxberry-maveo-connect/issues|Issues]]**), dort liegen auch **Logs**, Build‑ und Hinweise zur MQTT‑Konkurrenz mit der Marantec‑App.
