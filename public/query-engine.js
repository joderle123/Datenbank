// public/query-engine.js
// ----------------------------------------------------------------------------
// CDSE Stats — query engine for the Query Builder
// ----------------------------------------------------------------------------
// Pure functions. Takes records + a query config, returns aggregated results.
// Operators are whitelisted by field type so the UI can never produce an
// invalid query, and so a future SQL-backed implementation can mirror the
// same operator set exactly.
//
// Records are expected in their hydrated form (see repository.js): computed
// values such as `age`, `dur_isa` or `measures_all` are already present.
// ----------------------------------------------------------------------------

import { FIELD_DEFS, getField, computeField } from './fields.js';

// ----- field meta -----------------------------------------------------------

/** Fields that can be the subject of a numeric aggregation. Besides IQ and
 *  Age: the duration of each measure (months), the ELDiB stages (1–5) and the
 *  LENGTHS of the multi-tag fields as derived per-case counts. */
export const NUMERIC_FIELDS = [
  { key: 'iq',                 label: 'IQ' },
  { key: 'age',                label: 'Age', computed: true },
  ...FIELD_DEFS.filter((f) => f.type === 'computed' && f.numeric && f.key !== 'age').map((f) => ({ key: f.key, label: f.label, computed: true })),
  { key: 'eldib_v',            label: 'ELDiB stage — Behaviour (V)' },
  { key: 'eldib_k',            label: 'ELDiB stage — Communication (K)' },
  { key: 'eldib_soz',          label: 'ELDiB stage — Socialisation (SOZ)' },
  { key: 'eldib_kog',          label: 'ELDiB stage — Cognition (KOG)' },
  { key: 'n_diagnostics',      label: 'Number of diagnoses (per case)',         computed: true },
  { key: 'n_verdachts',        label: 'Number of suspected diagnoses',           computed: true },
  { key: 'n_mesures_famille',  label: 'Number of family measures',               computed: true },
  { key: 'n_autres_services',  label: 'Number of other services',                computed: true },
  { key: 'n_tutelle',          label: 'Number of guardianship holders',          computed: true },
];

/** Source keys for the derived per-case array-length numerics. */
const ARRAY_LEN_NUMERICS = {
  n_diagnostics:     'diagnostics',
  n_verdachts:       'verdachtsdiagnosen_profil',
  n_mesures_famille: 'mesures_famille',
  n_autres_services: 'autres_services',
  n_tutelle:         'tutelle',
};

const isListComputed = (f) => f.type === 'computed' && f.list;
const isNumericComputed = (f) => f.type === 'computed' && f.numeric;

/** Fields a user can group results by. Multi-value fields fan out. */
export const GROUPABLE_FIELDS = FIELD_DEFS.filter((f) =>
  !f.legacy && (['select', 'text', 'tags'].includes(f.type) || isListComputed(f) || f.key === 'age_band'),
);

/** Fields a user can filter on. */
export const FILTERABLE_FIELDS = FIELD_DEFS.filter((f) =>
  !f.legacy && (f.type !== 'computed' || f.numeric || f.list || f.key === 'age_band'),
);

/** Aggregation functions. `field: null` means counts the rows themselves. */
export const AGGREGATIONS = [
  { key: 'count',  label: 'Count',             needsNumeric: false },
  { key: 'mean',   label: 'Average',           needsNumeric: true  },
  { key: 'median', label: 'Median',            needsNumeric: true  },
  { key: 'min',    label: 'Minimum',           needsNumeric: true  },
  { key: 'max',    label: 'Maximum',           needsNumeric: true  },
  { key: 'sum',    label: 'Sum',               needsNumeric: true  },
  { key: 'stddev', label: 'Std. deviation',    needsNumeric: true  },
];

/** How a field behaves in filters: text | select | number | date | tags. */
export function filterTypeOf(fieldKey) {
  const def = getField(fieldKey);
  if (!def) return null;
  if (def.type === 'computed') {
    if (def.numeric) return 'number';
    if (def.list) return 'tags';
    return 'select';
  }
  return def.type;
}

/** Operators available per field type. Labels are intentionally written
 *  as natural English ("is" rather than "equals", "greater than" rather than
 *  ">") so the assembled query reads like a sentence in the preview. */
export function operatorsFor(fieldKey) {
  switch (filterTypeOf(fieldKey)) {
    case 'text':
      return [
        { key: 'eq',       label: 'is',               needsValue: true  },
        { key: 'neq',      label: 'is not',           needsValue: true  },
        { key: 'in',       label: 'is one of',        needsValue: true, multi: true },
        { key: 'contains', label: 'contains',         needsValue: true  },
        { key: 'empty',    label: 'is empty',         needsValue: false },
        { key: 'notempty', label: 'is filled in',     needsValue: false },
      ];
    case 'select':
      return [
        { key: 'eq',       label: 'is',               needsValue: true  },
        { key: 'in',       label: 'is one of',        needsValue: true, multi: true },
        { key: 'neq',      label: 'is not',           needsValue: true  },
        { key: 'notin',    label: 'is none of',       needsValue: true, multi: true },
        { key: 'empty',    label: 'is empty',         needsValue: false },
        { key: 'notempty', label: 'is filled in',     needsValue: false },
      ];
    case 'number':
      return [
        { key: 'eq',       label: 'is equal to',          needsValue: true  },
        { key: 'neq',      label: 'is not equal to',      needsValue: true  },
        { key: 'gt',       label: 'is greater than',      needsValue: true  },
        { key: 'gte',      label: 'is at least',          needsValue: true  },
        { key: 'lt',       label: 'is less than',         needsValue: true  },
        { key: 'lte',      label: 'is at most',           needsValue: true  },
        { key: 'between',  label: 'is between',           needsValue: true, needsValue2: true },
        { key: 'empty',    label: 'is empty',             needsValue: false },
        { key: 'notempty', label: 'is filled in',         needsValue: false },
      ];
    case 'date':
      return [
        { key: 'eq',       label: 'is on',               needsValue: true  },
        { key: 'gt',       label: 'is after',            needsValue: true  },
        { key: 'gte',      label: 'is from',             needsValue: true  },
        { key: 'lt',       label: 'is before',           needsValue: true  },
        { key: 'lte',      label: 'is until',            needsValue: true  },
        { key: 'between',  label: 'is between',          needsValue: true, needsValue2: true },
        { key: 'empty',    label: 'is empty',            needsValue: false },
        { key: 'notempty', label: 'is filled in',        needsValue: false },
      ];
    case 'tags':
      return [
        { key: 'has',      label: 'includes',                  needsValue: true  },
        { key: 'hasany',   label: 'includes one of',           needsValue: true, multi: true },
        { key: 'hasnot',   label: 'does not include',          needsValue: true  },
        { key: 'empty',    label: 'none',                      needsValue: false },
        { key: 'notempty', label: 'at least one',              needsValue: false },
      ];
    default:
      return [];
  }
}

// ----- evaluation -----------------------------------------------------------

function valueOf(record, fieldKey) {
  // Derived per-case counters: length of a multi-tag array (or 0 when empty).
  if (Object.prototype.hasOwnProperty.call(ARRAY_LEN_NUMERICS, fieldKey)) {
    const src = record[ARRAY_LEN_NUMERICS[fieldKey]];
    return Array.isArray(src) ? src.length : 0;
  }
  const def = getField(fieldKey);
  if (def && def.type === 'computed' && !(fieldKey in record)) return computeField(record, fieldKey);
  return record[fieldKey];
}

function isEmpty(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

function asList(value) {
  if (Array.isArray(value)) return value.map(String);
  if (value === null || value === undefined || value === '') return [];
  return [String(value)];
}

function evaluateFilter(record, filter) {
  const { field, op, value, value2 } = filter;
  const v = valueOf(record, field);

  switch (op) {
    case 'empty':    return isEmpty(v);
    case 'notempty': return !isEmpty(v);
    case 'eq':       return String(v ?? '') === String(value ?? '');
    case 'neq':      return String(v ?? '') !== String(value ?? '');
    case 'in':       return asList(value).includes(String(v ?? ''));
    case 'notin':    return !asList(value).includes(String(v ?? ''));
    case 'contains': {
      // Polymorphic 'contains':
      //   strings → case-insensitive substring match (original behaviour)
      //   arrays  → case-insensitive substring against ANY element, so a case
      //             tagged ['F90.0 — ADHD, combined type'] matches 'adhd'.
      // The 'tutelle: Foyer' built-in chart and the natural-language query
      // parser both rely on this. The strict-equality alternative is 'has'.
      if (value == null || value === '') return true;
      const needle = String(value).toLowerCase();
      if (typeof v === 'string') return v.toLowerCase().includes(needle);
      if (Array.isArray(v)) return v.some((x) => String(x ?? '').toLowerCase().includes(needle));
      return false;
    }
    case 'gt':       return !isEmpty(v) && Number(v) > Number(value);
    case 'gte':      return !isEmpty(v) && Number(v) >= Number(value);
    case 'lt':       return !isEmpty(v) && Number(v) < Number(value);
    case 'lte':      return !isEmpty(v) && Number(v) <= Number(value);
    case 'between':  return !isEmpty(v) && Number(v) >= Number(value) && Number(v) <= Number(value2);
    case 'has':      return Array.isArray(v) && v.includes(value);
    case 'hasany':   { const want = asList(value); return Array.isArray(v) && v.some((x) => want.includes(String(x))); }
    case 'hasnot':   return !Array.isArray(v) || !v.includes(value);
    default:         return true;
  }
}

/** Dates compare as ISO strings, numbers as numbers. */
function evaluateDateAware(record, filter) {
  if (filterTypeOf(filter.field) !== 'date' || !['gt', 'gte', 'lt', 'lte', 'between'].includes(filter.op)) {
    return evaluateFilter(record, filter);
  }
  const v = valueOf(record, filter.field);
  if (isEmpty(v)) return false;
  const a = String(filter.value ?? '');
  const b = String(filter.value2 ?? '');
  switch (filter.op) {
    case 'gt':      return v > a;
    case 'gte':     return v >= a;
    case 'lt':      return v < a;
    case 'lte':     return v <= a;
    case 'between': return v >= a && v <= b;
    default:        return true;
  }
}

/** Apply filter rows to records. `match` = 'all' (AND, default) or 'any'
 *  (OR). Exported so the UI can show "matching cases" without duplicating the
 *  operator logic. */
export function filterRecords(records, filters, match = 'all') {
  const list = filters || [];
  if (!list.length) return records.slice();
  if (match === 'any') return records.filter((r) => list.some((f) => evaluateDateAware(r, f)));
  return records.filter((r) => list.every((f) => evaluateDateAware(r, f)));
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

/** Group keys of a record for a field — multi-value fields fan out. */
function groupKeysOf(record, fieldKey) {
  const v = valueOf(record, fieldKey);
  if (Array.isArray(v)) return { keys: v.length ? v.map(formatGroupKey) : ['(empty)'], multi: v.length > 1 };
  return { keys: [formatGroupKey(v)], multi: false };
}

/** Sort group keys: counts descending, "(empty)" last; ordered option lists
 *  (DR 01…15, age groups, ELDiB stages) keep their natural order. */
function orderKeys(keys, fieldKey, sizes) {
  const def = getField(fieldKey);
  const order = def?.options || (fieldKey === 'age_band' ? ['up to 9', '10–11', '12–13', '14–15', '16 and older'] : null);
  const natural = order && (fieldKey === 'dir' || fieldKey === 'age_band' || /^eldib_/.test(fieldKey) || fieldKey === 'cdp_region');
  return [...keys].sort((a, b) => {
    if (a === '(empty)') return 1;
    if (b === '(empty)') return -1;
    if (natural) {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia !== ib) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    }
    return (sizes.get(b) || 0) - (sizes.get(a) || 0) || a.localeCompare(b, 'fr');
  });
}

// ----- main entry -----------------------------------------------------------

/**
 * Run a query against an array of case records.
 *
 * query = {
 *   filters:      [{ field, op, value, value2? }, ...]
 *   match:        'all' | 'any'                        // how filters combine
 *   aggregations: [{ field, fn }, ...]                 // field ignored for fn=count
 *   groupBy:      'fieldKey' | null
 *   groupBy2:     'fieldKey' | null                    // second variable → cross table
 * }
 *
 * Returns:
 *   {
 *     n, groupBy, groupBy2,
 *     groups: [{ key, n, values: [number|null, ...] }],
 *     cross?: { rows: [..], cols: [..], cells: { [row]: { [col]: { n, values } } } },
 *     rawValues?: number[],   // single numeric aggregation, no grouping → histogram
 *     fannedOut?: boolean,
 *   }
 */
export function runQuery(records, query) {
  const filtered = filterRecords(records, query.filters, query.match);

  const aggs = query.aggregations || [];
  const g1 = query.groupBy || null;
  const g2 = g1 && query.groupBy2 && query.groupBy2 !== g1 ? query.groupBy2 : null;
  if (!aggs.length) {
    return { n: filtered.length, groupBy: g1, groupBy2: g2, groups: [] };
  }

  if (g1) {
    const buckets = new Map();
    let fannedOut = false;
    for (const r of filtered) {
      const k = groupKeysOf(r, g1);
      if (k.multi) fannedOut = true;
      for (const key of k.keys) {
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(r);
      }
    }
    const sizes = new Map([...buckets.entries()].map(([k, v]) => [k, v.length]));
    const groups = orderKeys([...buckets.keys()], g1, sizes).map((key) => ({
      key,
      n: buckets.get(key).length,
      values: aggs.map((a) => aggregate(buckets.get(key), a)),
    }));
    const out = { n: filtered.length, groupBy: g1, groupBy2: g2, groups, fannedOut };

    if (g2) {
      const colSizes = new Map();
      const cells = {};
      for (const [rowKey, items] of buckets.entries()) {
        const sub = new Map();
        for (const r of items) {
          const k = groupKeysOf(r, g2);
          if (k.multi) out.fannedOut = true;
          for (const key of k.keys) {
            if (!sub.has(key)) sub.set(key, []);
            sub.get(key).push(r);
            colSizes.set(key, (colSizes.get(key) || 0) + 1);
          }
        }
        cells[rowKey] = {};
        for (const [colKey, sItems] of sub.entries()) {
          cells[rowKey][colKey] = { n: sItems.length, values: aggs.map((a) => aggregate(sItems, a)) };
        }
      }
      out.cross = { rows: groups.map((g) => g.key), cols: orderKeys([...colSizes.keys()], g2, colSizes), cells };
    }
    return out;
  }

  const values = aggs.map((a) => aggregate(filtered, a));
  const out = { n: filtered.length, groupBy: null, groupBy2: null, groups: [{ key: 'Total', n: filtered.length, values }] };

  // If single numeric aggregation without group-by, include raw values for histogram
  if (aggs.length === 1 && aggs[0].fn !== 'count') {
    out.rawValues = toNumbers(filtered.map((r) => valueOf(r, aggs[0].field)));
  }
  return out;
}

function formatGroupKey(value) {
  if (value === null || value === undefined || value === '') return '(empty)';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '(empty)';
  return String(value);
}

// ----- formatting helpers (UI consumes these) -------------------------------

export function formatNumber(n, fractionDigits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  if (Number.isInteger(n)) return n.toLocaleString('en-GB');
  return Number(n).toLocaleString('en-GB', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
}
