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
    return hydrate(updated);
  }

  async delete(id) {
    const all = this._readAll();
    const next = all.filter((r) => r.id !== id);
    if (next.length === all.length) return false;
    this._writeAll(next);
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
    return summary;
  }

  /** Test-only helper: wipe storage. Not exposed via the contract. */
  _wipeForTests() {
    this._storage.removeItem(STORAGE_KEY);
  }
}

// ----------------------------------------------------------------------------
// Default singleton — what the UI imports
// ----------------------------------------------------------------------------
export const cases =
  typeof localStorage !== 'undefined'
    ? new LocalStorageCaseRepository()
    : null;
