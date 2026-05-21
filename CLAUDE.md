# CDSE Stats — Projekt-Kontext

Internes Statistik- und Datenbanktool für das **Centre pour le Développement
Social et Éducatif (CDSE)** in Luxemburg. Erfasst Fallakten von Jugendlichen
(10–15 J.) mit sozio-emotionalen Schwierigkeiten und ersetzt eine bisherige
Excel-Lösung.

## Architektur

| Schicht   | Tech                                          |
| --------- | --------------------------------------------- |
| Backend   | Node.js + Express + better-sqlite3            |
| Frontend  | Vanilla HTML + Tailwind CDN + Alpine.js + Chart.js |
| Auth      | express-session (SQLite-Store) + bcrypt       |
| Backups   | node-cron, täglich, 30 Tage Retention         |
| Deploy    | `npm start` → `0.0.0.0:3000`, hinter Reverse-Proxy |

**Kein Build-Step**, keine externen Cloud-Calls, keine Telemetrie.

## Sensibilität — DSGVO

Die Datenbank enthält besondere Kategorien personenbezogener Daten von
Minderjährigen (IQ, Diagnosen, SCAS, Tutelle). Anforderungen:

- **Alles lokal**: kein externes CDN außer Tailwind/Lucide/Chart.js (auf eigenen
  Hosts via npm-Bundling reversibel)
- **Audit-Log** über `create | update | delete | export` (Pflicht aus Art. 30)
- **Keine** `view`-Events ins Audit-Log (würde die Tabelle in Tagen sprengen)
- **Sessions**: HTTP-Only, SameSite=Strict, 60 min Inaktivitäts-Timeout
- **Login**: bcrypt cost ≥ 12, Rate-Limit 5 Versuche / 15 min
- **PII-Encryption-at-rest** (`nom`, `prenom`) als Feature-Flag (`ENCRYPT_PII=1`)
  vorgesehen — MVP läuft Plaintext

## Datenmodell

- `cases` — Schüler-Datensatz (~40 Felder, Multi-Tag-Felder als JSON-Arrays in TEXT)
- `users` — `admin | editor | viewer`
- `audit_log` — Wer hat wann was geändert (changes_json mit Diff)
- `vocabularies` — Autocomplete-Quelle (Schulen, Mitarbeiternamen, Diagnose-Codes),
  lernt aus Eingaben dazu
- `saved_queries` — User-spezifische gespeicherte Query-Builder-Abfragen
- `sessions` — von better-sqlite3-session-store verwaltet

`age` ist NICHT gespeichert — server-side aus `date_naissance` berechnet.

## Konventionen

- **UI-Sprache**: Französisch (mit etablierten deutschen Begriffen wie
  "Verdachtsdiagnosen", "Profil")
- **Code-Sprache**: Englisch (Kommentare, Variablen, Logs)
- **Datums-Format auf der Wire**: ISO `YYYY-MM-DD`
- **Multi-Tag-Felder** (`diagnostics`, `verdachtsdiagnosen_profil`,
  `autres_services`) werden als JSON-Array in TEXT-Spalten gespeichert und beim
  Lesen geparsed
- **Prepared Statements überall** — better-sqlite3 default, kein String-Concat
- **Schema-Migrations**: Versions-Tabelle `_meta`, Migrationen idempotent in `db.js`

## Wichtige Architektur-Entscheidungen

- **Single HTML-Datei** (`public/index.html`) — bewusst, für Wartbarkeit ohne
  Build-Step. Alpine-Komponenten in `public/app.js`
- **CSRF**: kein deprecated `csurf`. Session-gebundener Token, per
  `X-CSRF-Token`-Header bei mutierenden Requests
- **CSV-Import**: niemals stilles Überschreiben — Duplikate per `matricule`
  werden gemeldet, User wählt `skip | update | abort`
- **Query Builder** ist das Kernfeature — Filter/Aggregation/Group-By
  server-side (parameterisierte SQL-Generierung mit Whitelist von Feldern und
  Operatoren), Charts client-side via Chart.js

## Projektstruktur

```
cdse-stats/
├── server.js          # Express-Setup + Route-Registrierung
├── db.js              # SQLite + Schema + Migrations
├── auth.js            # Login/Session/Rollen-Middleware
├── backup.js          # cron-basierte Auto-Backups
├── routes/            # Modulare Route-Handler
├── public/            # Statische SPA-Dateien
├── data/cdse.db       # SQLite-Datei (gitignored)
└── backups/           # Auto-Backups (gitignored)
```

## Build-Reihenfolge

1. Setup ✓
2. DB-Schema
3. Auth
4. CRUD-API für `cases`
5. Frontend-Shell + Login-View + Design-System
6. Liste + Detail-View
7. Formular (Create/Edit)
8. Dashboard
9. Query Builder ⭐
10. Import / Export
11. Audit-Log Viewer
12. Polish (Dark-Mode, Shortcuts, Empty-States)
13. README für CDSE-IT

## Lokal starten

```bash
npm install
cp .env.example .env
# edit .env (mind. SESSION_SECRET ändern!)
npm start
# beim ersten Start wird ein Admin-Account interaktiv angelegt
```
