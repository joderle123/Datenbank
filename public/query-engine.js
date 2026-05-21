// public/query-engine.js
// ----------------------------------------------------------------------------
// CDSE Stats — query engine for the Query Builder
// ----------------------------------------------------------------------------
// Pure functions. Takes records + a query config, returns aggregated results.
// Operators are whitelisted by field type so the UI can never produce an
// invalid query, and so a future SQL-backed implementation can mirror the
// same operator set exactly.
// ----------------------------------------------------------------------------

import { FIELD_DEFS, getField, computeAge } from './fields.js';

// ----- field meta -----------------------------------------------------------

/** Fields that can be the subject of a numeric aggregation. */
export const NUMERIC_FIELDS = [
  { key: 'iq',  label: 'QI' },
  { key: 'age', label: 'Âge', computed: true },
];

/** Fields a user can group results by. */
export const GROUPABLE_FIELDS = FIELD_DEFS.filter((f) =>
  ['select', 'text'].includes(f.type) || f.key === 'dir' || f.key === 'ecole_lycee',
);

/** Fields a user can filter on (anything except computed age, which is computed below). */
export const FILTERABLE_FIELDS = [
  ...FIELD_DEFS.filter((f) => f.type !== 'computed'),
  { key: 'age', label: 'Âge', type: 'number', category: 'demographics', computed: true },
];

/** Aggregation functions. `field: null` means counts the rows themselves. */
export const AGGREGATIONS = [
  { key: 'count',  label: 'Nombre',           needsNumeric: false },
  { key: 'mean',   label: 'Moyenne',          needsNumeric: true  },
  { key: 'median', label: 'Médiane',          needsNumeric: true  },
  { key: 'min',    label: 'Minimum',          needsNumeric: true  },
  { key: 'max',    label: 'Maximum',          needsNumeric: true  },
  { key: 'sum',    label: 'Somme',            needsNumeric: true  },
  { key: 'stddev', label: 'Écart-type',       needsNumeric: true  },
];

/** Operators available per field type. */
export function operatorsFor(fieldKey) {
  const def = fieldKey === 'age'
    ? { type: 'number' }
    : getField(fieldKey);
  if (!def) return [];
  switch (def.type) {
    case 'text':
      return [
        { key: 'eq',       label: 'égale',       needsValue: true  },
        { key: 'neq',      label: 'différent',   needsValue: true  },
        { key: 'contains', label: 'contient',    needsValue: true  },
        { key: 'empty',    label: 'est vide',    needsValue: false },
        { key: 'notempty', label: 'non vide',    needsValue: false },
      ];
    case 'select':
      return [
        { key: 'eq',       label: 'égale',     needsValue: true  },
        { key: 'neq',      label: 'différent', needsValue: true  },
        { key: 'empty',    label: 'est vide',  needsValue: false },
        { key: 'notempty', label: 'non vide',  needsValue: false },
      ];
    case 'number':
      return [
        { key: 'eq',       label: '=',         needsValue: true  },
        { key: 'neq',      label: '≠',         needsValue: true  },
        { key: 'gt',       label: '>',         needsValue: true  },
        { key: 'gte',      label: '≥',         needsValue: true  },
        { key: 'lt',       label: '<',         needsValue: true  },
        { key: 'lte',      label: '≤',         needsValue: true  },
        { key: 'between',  label: 'entre',     needsValue: true, needsValue2: true },
        { key: 'empty',    label: 'est vide',  needsValue: false },
        { key: 'notempty', label: 'non vide',  needsValue: false },
      ];
    case 'date':
      return [
        { key: 'eq',       label: 'le',         needsValue: true  },
        { key: 'gt',       label: 'après',      needsValue: true  },
        { key: 'gte',      label: 'à partir de',needsValue: true  },
        { key: 'lt',       label: 'avant',      needsValue: true  },
        { key: 'lte',      label: "jusqu'à",    needsValue: true  },
        { key: 'between',  label: 'entre',      needsValue: true, needsValue2: true },
        { key: 'empty',    label: 'est vide',   needsValue: false },
        { key: 'notempty', label: 'non vide',   needsValue: false },
      ];
    case 'tags':
      return [
        { key: 'has',      label: 'contient',         needsValue: true  },
        { key: 'hasnot',   label: 'ne contient pas',  needsValue: true  },
        { key: 'empty',    label: 'est vide',         needsValue: false },
        { key: 'notempty', label: 'non vide',         needsValue: false },
      ];
    default:
      return [];
  }
}

// ----- evaluation -----------------------------------------------------------

function valueOf(record, fieldKey) {
  if (fieldKey === 'age') return computeAge(record.date_naissance);
  return record[fieldKey];
}

function isEmpty(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

function evaluateFilter(record, filter) {
  const { field, op, value, value2 } = filter;
  const v = valueOf(record, field);

  switch (op) {
    case 'empty':    return isEmpty(v);
    case 'notempty': return !isEmpty(v);
    case 'eq':       return String(v ?? '') === String(value ?? '');
    case 'neq':      return String(v ?? '') !== String(value ?? '');
    case 'contains': return typeof v === 'string' && v.toLowerCase().includes(String(value).toLowerCase());
    case 'gt':       return v != null && Number(v) > Number(value);
    case 'gte':      return v != null && Number(v) >= Number(value);
    case 'lt':       return v != null && Number(v) < Number(value);
    case 'lte':      return v != null && Number(v) <= Number(value);
    case 'between':  return v != null && Number(v) >= Number(value) && Number(v) <= Number(value2);
    case 'has':      return Array.isArray(v) && v.includes(value);
    case 'hasnot':   return !Array.isArray(v) || !v.includes(value);
    default:         return true;
  }
}

// ----- numeric helpers ------------------------------------------------------

function toNumbers(values) {
  return values.map((v) => (v == null || v === '' ? null : Number(v))).filter((v) => Number.isFinite(v));
}

function mean(nums) {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function stddev(nums) {
  if (nums.length < 2) return null;
  const m = mean(nums);
  const variance = nums.reduce((a, b) => a + (b - m) ** 2, 0) / (nums.length - 1);
  return Math.sqrt(variance);
}

function aggregate(items, agg) {
  if (agg.fn === 'count') return items.length;
  const values = toNumbers(items.map((r) => valueOf(r, agg.field)));
  switch (agg.fn) {
    case 'mean':   return mean(values);
    case 'median': return median(values);
    case 'min':    return values.length ? Math.min(...values) : null;
    case 'max':    return values.length ? Math.max(...values) : null;
    case 'sum':    return values.length ? values.reduce((a, b) => a + b, 0) : null;
    case 'stddev': return stddev(values);
    default:       return null;
  }
}

// ----- main entry -----------------------------------------------------------

/**
 * Run a query against an array of case records.
 *
 * query = {
 *   filters:      [{ field, op, value, value2? }, ...]
 *   aggregations: [{ field, fn }, ...]   // field ignored for fn=count
 *   groupBy:      'fieldKey' | null
 * }
 *
 * Returns:
 *   {
 *     n: number,                                  // rows after filtering
 *     groupBy: string|null,
 *     groups: [
 *       { key, n, values: [number|null, ...] },
 *     ],
 *     // helpers for histogram view (single numeric agg, no group-by)
 *     rawValues?: number[],
 *   }
 */
export function runQuery(records, query) {
  const filtered = records.filter((r) => (query.filters || []).every((f) => evaluateFilter(r, f)));

  const aggs = query.aggregations || [];
  if (!aggs.length) {
    return { n: filtered.length, groupBy: query.groupBy || null, groups: [] };
  }

  if (query.groupBy) {
    const buckets = new Map();
    for (const r of filtered) {
      const k = formatGroupKey(valueOf(r, query.groupBy));
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(r);
    }
    const groups = [...buckets.entries()]
      .map(([key, items]) => ({
        key,
        n: items.length,
        values: aggs.map((a) => aggregate(items, a)),
      }))
      .sort((a, b) => b.n - a.n);
    return { n: filtered.length, groupBy: query.groupBy, groups };
  }

  const values = aggs.map((a) => aggregate(filtered, a));
  const out = { n: filtered.length, groupBy: null, groups: [{ key: 'Total', n: filtered.length, values }] };

  // If single numeric aggregation without group-by, include raw values for histogram
  if (aggs.length === 1 && aggs[0].fn !== 'count') {
    out.rawValues = toNumbers(filtered.map((r) => valueOf(r, aggs[0].field)));
  }
  return out;
}

function formatGroupKey(value) {
  if (value === null || value === undefined || value === '') return '(vide)';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '(vide)';
  return String(value);
}

// ----- formatting helpers (UI consumes these) -------------------------------

export function formatNumber(n, fractionDigits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  if (Number.isInteger(n)) return n.toLocaleString('fr-LU');
  return Number(n).toLocaleString('fr-LU', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
}
