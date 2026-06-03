# CDSE Stats — Projekt-Kontext

Internes Statistik- und Datenbanktool für das **Centre pour le Développement
Social et Éducatif (CDSE)** in Luxemburg. Erfasst Fallakten von Jugendlichen
(10–15 J.) mit sozio-emotionalen Schwierigkeiten und ersetzt eine bisherige
Excel-Lösung.

## Aktueller Stand: HTML-Prototyp

Aktuell wird das Tool als **einzelne `index.html`-Datei** gebaut (Evaluations-Phase).
Persistenz im Browser via `localStorage`, Backups via JSON-Export. Daten sind beim
späteren Wechsel zu einem Node.js-Backend portierbar. Die Sektion „Architektur"
unten beschreibt die geplante Multi-User-Endform.

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

- **UI-Sprache**: Englisch (auf Wunsch des Auftraggebers von Französisch
  umgestellt). Alle sichtbaren Strings — Labels, Buttons, Meldungen, Query-
  Builder-Satzvorschau, Demo-Daten — sind Englisch. Offizielle Luxemburger
  Eigennamen (Schulnamen, Kompetenzzentren, Behörden wie ONE/SCAS/ALUPSE)
  bleiben in ihrer Originalsprache. Datums-Locale `en-GB`.
- **Code-Sprache**: Englisch (Kommentare, Variablen, Logs)
- **Schema-Keys bleiben wie sie sind** (`nom`, `prenom`, `dossier_mfile`,
  `ecole_lycee`, `debut_isa` …) — nur die `label`-Felder wurden übersetzt,
  damit bestehende Daten und Importe kompatibel bleiben.
- **Datums-Format auf der Wire**: ISO `YYYY-MM-DD`
- **Multi-Tag-Felder** (`diagnostics`, `verdachtsdiagnosen_profil`,
  `autres_services`) werden als JSON-Array in TEXT-Spalten gespeichert und beim
  Lesen geparsed
- **Prepared Statements überall** — better-sqlite3 default, kein String-Concat
- **Schema-Migrations**: Versions-Tabelle `_meta`, Migrationen idempotent in `db.js`

## Wichtige Architektur-Entscheidungen

### Disziplin (gilt JETZT, Prototyp-Phase)

- **Repository-Pattern ist Pflicht.** UI-Code ruft NIEMALS `localStorage`
  direkt auf. Alle Daten-Zugriffe laufen über `public/repository.js` →
  Singleton `cases`. Wenn wir später auf Node + SQLite migrieren, tauschen
  wir genau eine Zeile (`cases = new ApiCaseRepository()`) — der Rest der
  App bleibt unverändert.
- **`FIELD_DEFS` in `public/fields.js` ist Single Source of Truth.**
  Form-Sektionen, Liste-Spalten, Validierung, Import/Export, Query-Builder
  — alles liest von dort. Niemals Feldnamen hardcoden.
- **Versionierte Storage-Keys.** Aktuell `cdse_cases_v1`. Schema-Änderungen,
  die migrieren müssen, bekommen `_v2`, mit Migrations-Code, der `_v1`
  ausliest und neu schreibt. So funktionieren auch Browser-Migrations
  ohne Backend.
- **Sanitize on write.** `id`, `created_at`, `updated_at` und computed
  Felder (`age`) werden bei `create`/`update` aktiv aus dem Eingabeobjekt
  entfernt — kein Vertrauen, dass der Aufrufer brav ist.

### Endform-Entscheidungen (für spätere V2)

- **Single HTML-Datei** (`public/index.html`) — bewusst, für Wartbarkeit ohne
  Build-Step. Alpine-Komponenten in `public/app.js`
- **CSRF**: kein deprecated `csurf`. Session-gebundener Token, per
  `X-CSRF-Token`-Header bei mutierenden Requests
- **CSV-Import**: niemals stilles Überschreiben — Duplikate per `matricule`
  werden gemeldet, User wählt `skip | update | abort` (im LocalStorage-Repo
  bereits als `merge | update | replace`-Modi vorhanden)
- **Query Builder** ist das Kernfeature — Filter/Aggregation/Group-By
  server-side (parameterisierte SQL-Generierung mit Whitelist von Feldern und
  Operatoren), Charts client-side via Chart.js

### Migration-Pfad: Browser → Node-Backend (V2)

- Heutige `LocalStorageCaseRepository` exportiert/importiert JSON.
- Node-Backend bekommt einen `/api/cases/import` Endpoint, der genau dieses
  JSON akzeptiert.
- Frontend tauscht `cases`-Singleton gegen `ApiCaseRepository`, der dieselbe
  Contract-Schnittstelle implementiert (`list/get/create/update/delete/
  count/exportAll/importAll`).
- Keine Datenmigration nötig — JSON-Export ist das Migrations-Format.

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
