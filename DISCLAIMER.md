# Disclaimer — loxberry-maveo-connect

**Language:** [Deutsch](#deutsch) · [English](#english)

---

## Deutsch

Dieses Repository enthält ein **LoxBerry-Plugin** zur Anbindung von Marantec-Garagentoren über den **Maveo Connect Stick**. Es handelt sich um ein **unabhängiges** Community-Projekt: **keine** offizielle Anwendung von **Marantec**, **Maveo** oder verbundenen Unternehmen. Diese nehmen **weder** Stellung zu diesem Projekt **noch** prüfen, vertreiben, befürworten oder unterstützen es.

### Kein Support

- Es gibt **keinen** Anspruch auf technischen Support durch Marantec, Maveo oder deren Cloud-/App-Dienste.
- Die **Maintainer dieses Repos** bieten **keinen** verbindlichen Support für Endanwender an (best effort / Open-Source nach Verfügbarkeit).
- **Du** bist für die Nutzung in deiner Installation **selbst verantwortlich**.

### Technische Anbindung

Die Implementierung nutzt dieselbe **öffentlich erreichbare** Cloud-Infrastruktur wie die offizielle Maveo-App (u. a. **AWS Cognito**, **IoT Core / MQTT**). Dabei werden **nur** die Zugangsdaten verwendet, die du selbst eingibst (z. B. Maveo-Konto). Es gibt **keine** Garantie, dass sich Schnittstellen, Token-Lebensdauer, Themen oder Verhalten nicht ändern.

### Verfügbarkeit und Änderungen

Marantec bzw. Maveo können **Authentifizierung, APIs, Cloud-Dienste oder App-Verhalten jederzeit ändern, einschränken oder beenden**. Es gibt **keine** Garantie auf dauerhafte Funktion dieses Plugins. Die Nutzung erfolgt auf **eigenes Risiko**.

### Sitzungen / Fair Use

Pro Stick ist typischerweise **eine** aktive MQTT-Sitzung vorgesehen; gleichzeitige Nutzung mit der offiziellen App kann zu Konflikten führen. Bitte keine unnötige Last auf die Dienste erzeugen.

### Marken

Genannte Marken und Produktnamen (z. B. LoxBerry, Loxone, Marantec, Maveo, Amazon Web Services) gehören den jeweiligen Rechteinhabern.

---

## English

This repository provides a **LoxBerry plugin** that connects Marantec garage doors via the **Maveo Connect Stick**. It is an **independent** community project, **not** an official product from **Marantec**, **Maveo**, or related companies. Those parties do **not** review, distribute, endorse, or support this project.

### No support

- There is **no** entitlement to technical support from Marantec, Maveo, or their cloud/app services.
- **Repository maintainers** do **not** guarantee end-user support (best effort / open source as time allows).
- **You** are responsible for how you use the plugin on your system.

### Technical integration

The implementation uses the same **publicly reachable** cloud stack as the official Maveo app (including **AWS Cognito** and **IoT Core / MQTT**). It only uses credentials **you** supply (e.g. your Maveo account). There is **no** guarantee that interfaces, token lifetimes, topics, or behaviour will stay unchanged.

### Availability and changes

Marantec or Maveo may **change, restrict, or discontinue** authentication, APIs, cloud services, or app behaviour **at any time**. There is **no** warranty of continued plugin operation. Use is **at your own risk**.

### Sessions / fair use

Typically **one** active MQTT session per stick is expected; running alongside the official app may cause conflicts. Do not generate disproportionate load on upstream services.

### Trademarks

Named brands (e.g. LoxBerry, Loxone, Marantec, Maveo, Amazon Web Services) belong to their respective owners.
