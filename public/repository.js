// public/repository.js
// ----------------------------------------------------------------------------
// CDSE Stats — case persistence abstraction
// ----------------------------------------------------------------------------
// All UI code MUST go through this module. Never call localStorage directly
// from a view or component. The Repository contract below is what a future
// HTTP-backed implementation will satisfy when we migrate to Node + SQLite,
// so swapping `cases` for `new ApiCaseRepository()` is the only change the
// rest of the app should ever need.
// ----------------------------------------------------------------------------

import { computeAge, getField } from './fields.js';

/** Contract every concrete repository must implement. */
export class CaseRepository {
  /* eslint-disable no-unused-vars */
  async list({ filter, sort, search } = {}) { throw new Error('not implemented'); }
  async get(id)                              { throw new Error('not implemented'); }
  async create(caseData)                     { throw new Error('not implemented'); }
  async update(id, patch)                    { throw new Error('not implemented'); }
  async delete(id)                           { throw new Error('not implemented'); }
  async count(filter = {})                   { throw new Error('not implemented'); }
  async exportAll()                          { throw new Error('not implemented'); }
  async importAll(records, mode = 'merge')   { throw new Error('not implemented'); }
  /* eslint-enable no-unused-vars */
}

// ----------------------------------------------------------------------------
// Storage layout — versioned key so future migrations are explicit
// ----------------------------------------------------------------------------
const STORAGE_KEY = 'cdse_cases_v1';
// Sync metadata — see exportSyncFile / importSyncFile in app.js.
//   revision            : local Lamport counter, bumped on every mutation
//   lastSyncedRevision  : revision at the last successful export OR import
//   lastSyncedAt        : ISO timestamp of last export OR import
//   lastSyncedBy        : name of the user who last touched the synced file
const SYNC_META_KEY = 'cdse_sync_v1';

// ----------------------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------------------
function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for very old runtimes — RFC4122 v4-ish, not crypto-grade
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function nowIso() {
  return new Date().toISOString();
}

/** Hydrate a stored case with derived (read-only) fields like `age`. */
function hydrate(record) {
  if (!record) return record;
  return { ...record, age: computeAge(record.date_naissance) };
}

/** Strip computed / unknown fields before persisting. */
function sanitize(input) {
  const out = {};
  for (const [k, v] of Object.entries(input || {})) {
    if (k === 'id' || k === 'created_at' || k === 'updated_at') continue;
    const def = getField(k);
    if (!def || def.type === 'computed') continue;
    out[k] = v;
  }
  return out;
}

function matchesFilter(record, filter) {
  if (!filter) return true;
  for (const [key, expected] of Object.entries(filter)) {
    const actual = record[key];
    if (Array.isArray(expected)) {
      if (!expected.includes(actual)) return false;
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}

function matchesSearch(record, q) {
  if (!q) return true;
  const needle = q.toLowerCase();
  return ['nom', 'prenom', 'matricule'].some((k) => {
    const v = record[k];
    return typeof v === 'string' && v.toLowerCase().includes(needle);
  });
}

function sortRecords(records, sort) {
  if (!sort || !sort.field) return records;
  const dir = sort.dir === 'desc' ? -1 : 1;
  return [...records].sort((a, b) => {
    const av = a[sort.field];
    const bv = b[sort.field];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;  // empty values sink to the bottom regardless of dir
    if (bv == null) return -1;
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}

// ----------------------------------------------------------------------------
// LocalStorage implementation
// ----------------------------------------------------------------------------
export class LocalStorageCaseRepository extends CaseRepository {
  constructor(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    super();
    if (!storage) throw new Error('LocalStorageCaseRepository: no storage available');
    this._storage = storage;
  }

  _readAll() {
    const raw = this._storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // Corrupt blob — refuse to lose data silently
      throw new Error(`Storage corrupted at key "${STORAGE_KEY}". Restore from a JSON backup.`);
    }
  }

  _writeAll(records) {
    this._storage.setItem(STORAGE_KEY, JSON.stringify(records));
  }

  // -- Sync metadata --------------------------------------------------------
  _readSyncMeta() {
    const raw = this._storage.getItem(SYNC_META_KEY);
    if (raw) { try { return JSON.parse(raw); } catch { /* corrupt -> reset */ } }
    return { revision: 0, lastSyncedRevision: 0, lastSyncedAt: null, lastSyncedBy: null };
  }
  _writeSyncMeta(meta) {
    this._storage.setItem(SYNC_META_KEY, JSON.stringify(meta));
  }
  _bumpRevision() {
    const meta = this._readSyncMeta();
    meta.revision = (meta.revision || 0) + 1;
    this._writeSyncMeta(meta);
    return meta.revision;
  }
  async getSyncMeta() {
    return { ...this._readSyncMeta() };
  }
  /**
   * Apply a remote sync payload — fully replaces local cases and aligns the
   * local revision counter with the incoming revision so subsequent mutations
   * continue past the remote one (monotonic).
   */
  async applyRemoteSync(remoteCases, remoteRevision, remoteEditedBy, remoteEditedAt) {
    if (!Array.isArray(remoteCases)) throw new Error('applyRemoteSync expects an array');
    this._writeAll(remoteCases);
    this._writeSyncMeta({
      revision: Math.max(remoteRevision || 0, this._readSyncMeta().revision || 0),
      lastSyncedRevision: remoteRevision || 0,
      lastSyncedAt: remoteEditedAt || nowIso(),
      lastSyncedBy: remoteEditedBy || null,
    });
  }
  /** Mark the current local state as exported (sets lastSyncedRevision = revision). */
  async markExported(currentUser) {
    const meta = this._readSyncMeta();
    this._writeSyncMeta({
      ...meta,
      lastSyncedRevision: meta.revision,
      lastSyncedAt: nowIso(),
      lastSyncedBy: currentUser || null,
    });
  }

  async list({ filter, sort, search } = {}) {
    const all = this._readAll();
    const filtered = all.filter((r) => matchesFilter(r, filter) && matchesSearch(r, search));
    return sortRecords(filtered, sort).map(hydrate);
  }

  async get(id) {
    const found = this._readAll().find((r) => r.id === id);
    return found ? hydrate(found) : null;
  }

  async create(caseData) {
    const all = this._readAll();
    const record = {
      id: newId(),
      ...sanitize(caseData),
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    all.push(record);
    this._writeAll(all);
    this._bumpRevision();
    return hydrate(record);
  }

  async update(id, patch) {
    const all = this._readAll();
    const idx = all.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    const updated = {
      ...all[idx],
      ...sanitize(patch),
      id: all[idx].id,
      created_at: all[idx].created_at,
      updated_at: nowIso(),
    };
    all[idx] = updated;
    this._writeAll(all);
    this._bumpRevision();
    return hydrate(updated);
  }

  async delete(id) {
    const all = this._readAll();
    const next = all.filter((r) => r.id !== id);
    if (next.length === all.length) return false;
    this._writeAll(next);
    this._bumpRevision();
    return true;
  }

  async count(filter = {}) {
    return this._readAll().filter((r) => matchesFilter(r, filter)).length;
  }

  async exportAll() {
    return this._readAll().map(hydrate);
  }

  /**
   * Bulk import. `mode`:
   *   'merge'   — keep existing, add new (by id); existing kept untouched
   *   'replace' — wipe storage and replace with `records`
   *   'update'  — by matricule: update if matricule matches, else add
   * Records without an id get one. Returns a summary object.
   */
  async importAll(records, mode = 'merge') {
    if (!Array.isArray(records)) throw new Error('importAll expects an array');
    const summary = { added: 0, updated: 0, skipped: 0 };

    if (mode === 'replace') {
      const next = records.map((r) => ({
        id: r.id || newId(),
        ...sanitize(r),
        created_at: r.created_at || nowIso(),
        updated_at: nowIso(),
      }));
      this._writeAll(next);
      this._bumpRevision();
      summary.added = next.length;
      return summary;
    }

    const all = this._readAll();
    const byId = new Map(all.map((r) => [r.id, r]));
    const byMatricule = new Map(
      all.filter((r) => r.matricule).map((r) => [r.matricule, r]),
    );

    for (const incoming of records) {
      const existing =
        (incoming.id && byId.get(incoming.id)) ||
        (incoming.matricule && byMatricule.get(incoming.matricule));

      if (existing) {
        if (mode === 'update') {
          Object.assign(existing, sanitize(incoming), { updated_at: nowIso() });
          summary.updated++;
        } else {
          summary.skipped++;
        }
      } else {
        const record = {
          id: incoming.id || newId(),
          ...sanitize(incoming),
          created_at: incoming.created_at || nowIso(),
          updated_at: nowIso(),
        };
        all.push(record);
        byId.set(record.id, record);
        if (record.matricule) byMatricule.set(record.matricule, record);
        summary.added++;
      }
    }

    this._writeAll(all);
    if (summary.added > 0 || summary.updated > 0) this._bumpRevision();
    return summary;
  }

  /** Test-only helper: wipe storage. Not exposed via the contract. */
  _wipeForTests() {
    this._storage.removeItem(STORAGE_KEY);
  }
}

// ============================================================================
// Audit log — minimal, browser-local. Will be replaced by a server-side log
// when we migrate; the contract stays.
// ============================================================================
const AUDIT_KEY = 'cdse_audit_v1';
const AUDIT_MAX_ENTRIES = 5000;

export class AuditRepository {
  /* eslint-disable no-unused-vars */
  async record(entry)        { throw new Error('not implemented'); }
  async list({ limit } = {}) { throw new Error('not implemented'); }
  async clear()              { throw new Error('not implemented'); }
  /* eslint-enable no-unused-vars */
}

export class LocalStorageAuditRepository extends AuditRepository {
  constructor(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    super();
    if (!storage) throw new Error('LocalStorageAuditRepository: no storage');
    this._storage = storage;
  }
  _readAll() {
    const raw = this._storage.getItem(AUDIT_KEY);
    if (!raw) return [];
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; }
    catch { return []; }
  }
  _writeAll(entries) {
    // Cap to avoid unbounded growth in the prototype
    const trimmed = entries.slice(-AUDIT_MAX_ENTRIES);
    this._storage.setItem(AUDIT_KEY, JSON.stringify(trimmed));
  }
  async record({ action, caseId, user, summary, changes }) {
    const entries = this._readAll();
    entries.push({
      id: newId(),
      timestamp: nowIso(),
      action,           // 'create' | 'update' | 'delete' | 'export' | 'import'
      case_id: caseId || null,
      user: user || 'inconnu',
      summary: summary || '',
      changes: changes || null,
    });
    this._writeAll(entries);
  }
  async list({ limit } = {}) {
    const all = this._readAll().slice().reverse();
    return limit ? all.slice(0, limit) : all;
  }
  async clear() { this._storage.removeItem(AUDIT_KEY); }
}

// ============================================================================
// Vocabulary — autocomplete sources that grow as the user types.
// Categories: 'ecoles', 'staff', 'institutions', 'diagnostics',
//             'verdachts', 'autres_services'
// ============================================================================
const VOCAB_KEY = 'cdse_vocab_v1';

export class VocabularyRepository {
  /* eslint-disable no-unused-vars */
  async list(category)            { throw new Error('not implemented'); }
  async register(category, value) { throw new Error('not implemented'); }
  async all()                     { throw new Error('not implemented'); }
  /* eslint-enable no-unused-vars */
}

export class LocalStorageVocabularyRepository extends VocabularyRepository {
  constructor(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    super();
    if (!storage) throw new Error('LocalStorageVocabularyRepository: no storage');
    this._storage = storage;
  }
  _read() {
    const raw = this._storage.getItem(VOCAB_KEY);
    if (!raw) return {};
    try { return JSON.parse(raw) || {}; } catch { return {}; }
  }
  _write(data) { this._storage.setItem(VOCAB_KEY, JSON.stringify(data)); }

  async list(category) {
    const data = this._read();
    const bucket = data[category] || {};
    // Sort by usage count desc, then alphabetically
    return Object.entries(bucket)
      .sort(([a, ca], [b, cb]) => cb - ca || a.localeCompare(b, 'fr'))
      .map(([value]) => value);
  }
  async register(category, value) {
    if (!category || !value || typeof value !== 'string') return;
    const v = value.trim();
    if (!v) return;
    const data = this._read();
    if (!data[category]) data[category] = {};
    data[category][v] = (data[category][v] || 0) + 1;
    this._write(data);
  }
  async registerMany(category, values) {
    for (const v of values || []) await this.register(category, v);
  }
  async all() { return this._read(); }
}

// ============================================================================
// Saved queries — the user's stored Query Builder configurations
// ============================================================================
const SAVED_QUERIES_KEY = 'cdse_saved_queries_v1';

export class SavedQueryRepository {
  /* eslint-disable no-unused-vars */
  async list()        { throw new Error('not implemented'); }
  async save(query)   { throw new Error('not implemented'); }
  async delete(id)    { throw new Error('not implemented'); }
  /* eslint-enable no-unused-vars */
}

export class LocalStorageSavedQueryRepository extends SavedQueryRepository {
  constructor(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    super();
    if (!storage) throw new Error('LocalStorageSavedQueryRepository: no storage');
    this._storage = storage;
  }
  _read() {
    const raw = this._storage.getItem(SAVED_QUERIES_KEY);
    if (!raw) return [];
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; }
    catch { return []; }
  }
  _write(items) { this._storage.setItem(SAVED_QUERIES_KEY, JSON.stringify(items)); }

  async list() { return this._read(); }
  async save({ id, name, config }) {
    const items = this._read();
    if (id) {
      const idx = items.findIndex((q) => q.id === id);
      if (idx >= 0) { items[idx] = { ...items[idx], name, config, updated_at: nowIso() }; this._write(items); return items[idx]; }
    }
    const created = { id: newId(), name, config, created_at: nowIso(), updated_at: nowIso() };
    items.push(created);
    this._write(items);
    return created;
  }
  async delete(id) {
    const items = this._read();
    const next = items.filter((q) => q.id !== id);
    if (next.length === items.length) return false;
    this._write(next);
    return true;
  }
}

// ============================================================================
// Session user — the current operator's name, used only for the audit log
// in this prototype. NOT auth. Real auth lands with the Node backend.
// ============================================================================
const USER_KEY = 'cdse_user_v1';

export class SessionUserRepository {
  /* eslint-disable no-unused-vars */
  get()         { throw new Error('not implemented'); }
  set(name)     { throw new Error('not implemented'); }
  clear()       { throw new Error('not implemented'); }
  /* eslint-enable no-unused-vars */
}

export class LocalStorageSessionUserRepository extends SessionUserRepository {
  constructor(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    super();
    if (!storage) throw new Error('LocalStorageSessionUserRepository: no storage');
    this._storage = storage;
  }
  get()       { return this._storage.getItem(USER_KEY) || ''; }
  set(name)   { this._storage.setItem(USER_KEY, String(name || '').trim()); }
  clear()     { this._storage.removeItem(USER_KEY); }
}

// ============================================================================
// Default singletons — what the UI imports
// ============================================================================
const hasLS = typeof localStorage !== 'undefined';
export const cases         = hasLS ? new LocalStorageCaseRepository()         : null;
export const audit         = hasLS ? new LocalStorageAuditRepository()        : null;
export const vocab         = hasLS ? new LocalStorageVocabularyRepository()   : null;
export const savedQueries  = hasLS ? new LocalStorageSavedQueryRepository()   : null;
export const sessionUser   = hasLS ? new LocalStorageSessionUserRepository()  : null;
