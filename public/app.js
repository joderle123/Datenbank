// public/app.js
// ----------------------------------------------------------------------------
// CDSE Stats — Alpine.js application factory
// ----------------------------------------------------------------------------
// All UI state and behaviour. Data access is strictly through the repository
// singletons; nothing in here calls localStorage directly.
// ----------------------------------------------------------------------------

import {
  FIELD_DEFS,
  CATEGORIES,
  getField,
  getFieldsByCategory,
  getEditableFields,
  validateCase,
  computeAge,
  fieldVisible,
  categoryVisible,
  hasMeasure,
  specTypeOf,
  MEASURES,
  MEASURE_KEYS,
  measureInfo,
  DR_OPTIONS,
  DIR_LEGACY_MAP,
  CC_OPTIONS,
  CST_GROUPS,
  CG_TYPES,
} from './fields.js';

import {
  cases,
  audit,
  vocab,
  savedQueries,
  sessionUser,
  lists,
} from './repository.js';

import {
  runQuery,
  filterRecords,
  NUMERIC_FIELDS,
  GROUPABLE_FIELDS,
  FILTERABLE_FIELDS,
  AGGREGATIONS,
  operatorsFor,
  filterTypeOf,
  formatNumber,
} from './query-engine.js';

import { presetsForField, DEFAULT_LISTS } from './presets.js';
import { readSpreadsheet, guessMapping, convertRows, toIsoDate, IMPORT_TARGETS } from './importer.js';
import { parseQuestion, NATURAL_EXAMPLES } from './query-parser.js';

// ----------------------------------------------------------------------------

const VOCAB_HINT_BY_FIELD = {
  ecole_lycee: 'ecoles',
  previous_school: 'ecoles',
  ds_realise_par: 'staff',
  isa_realise_par: 'staff',
  cg_realise_par: 'staff',
  atelier_realise_par: 'staff',
  reeducation_realise_par: 'staff',
  atelier_type: 'ateliers',
  reeducation_type: 'reeducation',
  diagnostics: 'diagnostics',
  verdachtsdiagnosen_profil: 'verdachts',
  autres_services: 'autres_services',
};

const AGE_BANDS = ['up to 9', '10–11', '12–13', '14–15', '16 and older'];

// Colours of the CDSE product family (Hub, ELDiB, Toolbox)
const CHART_COLORS = ['#2E3A9C', '#1F6B6F', '#B4533A', '#8A6414', '#6E4A7E', '#3E6FB0', '#2F855A', '#7A8396', '#C9A227', '#A03E6B'];

let _uid = 0;
function uid() { _uid += 1; return 'q' + Date.now().toString(36) + _uid; }

/** Queries saved by an older version lack the newer keys — fill them in. */
function normalizeQuery(q) {
  const c = JSON.parse(JSON.stringify(q || {}));
  c.aggregations = Array.isArray(c.aggregations) && c.aggregations.length ? c.aggregations : [{ fn: 'count', field: null }];
  c.filters = (Array.isArray(c.filters) ? c.filters : []).map((f) => ({ value2: '', ...f, _id: f._id || uid() }));
  c.groupBy = c.groupBy || '';
  c.groupBy2 = c.groupBy2 || '';
  c.match = c.match === 'any' ? 'any' : 'all';
  // Older configs grouped by the first measure slot only
  return c;
}

// Line icons of the sidebar (same drawing style as the CDSE Hub)
const svgIcon = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const NAV_ICONS = {
  dashboard: svgIcon('<rect x="3.5" y="3.5" width="7" height="8" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="5" rx="1.6"/><rect x="13.5" y="11.5" width="7" height="9" rx="1.6"/><rect x="3.5" y="14.5" width="7" height="6" rx="1.6"/>'),
  cases:     svgIcon('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><path d="M15.5 5.2a3 3 0 0 1 0 5.6"/><path d="M17.5 14.8c1.7.6 2.7 2.2 3 4.7"/>'),
  query:     svgIcon('<path d="M4 20V11"/><path d="M9.5 20V5"/><path d="M15 20v-6"/><path d="M20.5 20V8"/>'),
  io:        svgIcon('<path d="M7 4v12"/><path d="m3.5 12.5 3.5 3.5 3.5-3.5"/><path d="M17 20V8"/><path d="m13.5 11.5 3.5-3.5 3.5 3.5"/>'),
  audit:     svgIcon('<path d="M7 3.5h8l4 4v13H7z"/><path d="M15 3.5v4h4"/><path d="M10 12h6M10 15.5h6"/><path d="M4.5 7v13.5H15" opacity=".6"/>'),
  settings:  svgIcon('<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2.1 1.2M17.7 15.3l2.1 1.2M4.2 16.5l2.1-1.2M17.7 8.7l2.1-1.2"/><circle cx="12" cy="12" r="7.2"/>'),
};

const LIST_DEFAULT_COLUMNS = [
  'matricule', 'nom', 'prenom', 'sexe', 'age', 'dir', 'ecole_lycee',
  'measures_all', 'iq',
];

// Editable pick lists (Settings → Lists) and the fields that use them.
const LIST_META = [
  { key: 'schools',     label: 'Schools',           fields: ['ecole_lycee', 'previous_school'],
    help: 'Suggested when typing a school. Add the écoles fondamentales you work with; use the full official name.' },
  { key: 'ateliers',    label: 'Ateliers',          fields: ['atelier_type'],
    help: 'The CDSE’s Ateliers d’apprentissage spécifique — offered under “Which atelier”.' },
  { key: 'reeducation', label: 'Rééducation types', fields: ['reeducation_type'],
    help: 'Kinds of rééducation — offered under “Which rééducation”.' },
];

// Fields offered in Settings → Clean up (fields where spelling variants and
// older values pile up).
const CLEANUP_FIELDS = [
  'dir', 'ecole_lycee', 'previous_school', 'mesure_cdse_1', 'mesure_cdse_2', 'mesure_cdse_3',
  'atelier_type', 'reeducation_type', 'cst_groupe', 'autres_cc', 'autres_services',
  'diagnostics', 'verdachtsdiagnosen_profil', 'tutelle', 'mesures_famille',
];

// Fields shown by default in the form's "Essentials" block. New cases start
// with only these visible; everything else lives behind a "Show all fields"
// toggle. Picked to cover what staff almost always know at first contact.
const ESSENTIAL_FIELD_KEYS = new Set([
  'matricule', 'nom', 'prenom',
  'sexe', 'date_naissance',
  'dir', 'ecole_lycee',
  'mesure_cdse_1',
]);

function blankCase() {
  const empty = {};
  for (const f of getEditableFields()) {
    if (f.type === 'tags') empty[f.key] = [];
    else empty[f.key] = '';
  }
  return empty;
}

function hasValue(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function diffCases(before, after) {
  const changes = {};
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const k of keys) {
    if (k === 'updated_at' || k === 'created_at' || k === 'id' || k === 'age') continue;
    const a = before?.[k];
    const b = after?.[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) changes[k] = { from: a ?? null, to: b ?? null };
  }
  return changes;
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  let s = Array.isArray(value) ? value.join('; ') : String(value);
  if (/[",;\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',' || c === ';') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ''));
}

function downloadBlob(filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// HTML-escape user-supplied text before injecting into innerHTML or a
// document.write payload (used by the PDF export window).
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ----------------------------------------------------------------------------
// Alpine component factory
// ----------------------------------------------------------------------------

function makeApp() {
  return {
    // -- routing / chrome -------------------------------------------------
    view: 'dashboard',
    theme: 'light',
    now: '',
    buildTag: '__BUILD_TAG__',

    // -- session user (NOT auth, just for the audit log) ------------------
    user: '',
    showUserPrompt: false,
    userPromptValue: '',

    // -- schema exposed to templates --------------------------------------
    FIELD_DEFS,
    CATEGORIES,
    NUMERIC_FIELDS,
    GROUPABLE_FIELDS,
    FILTERABLE_FIELDS,
    AGGREGATIONS,

    // -- data -------------------------------------------------------------
    allCases: [],
    vocabByCat: {},

    // -- list view --------------------------------------------------------
    search: '',
    quickFilters: { dir: '', sexe: '', measure: '', ecole_lycee: '' },
    sortField: 'updated_at',
    sortDir: 'desc',
    visibleColumns: [...LIST_DEFAULT_COLUMNS],
    columnPickerOpen: false,

    // -- form view --------------------------------------------------------
    formMode: 'create',
    formData: blankCase(),
    formErrors: {},
    formExtraSections: {},     // measure sections opened with "+ add" (not in a slot)
    editingId: null,
    formCategoryOpen: {},
    tagDraft: {},
    showAdvanced: false,
    draftSaved: false,        // user-visible 'Draft saved …' indicator
    draftRestorePending: null, // {timestamp} when a previous draft is offered

    // -- file-based sync (see exportSyncFile / importSyncFile) ------------
    syncMeta: { revision: 0, lastSyncedRevision: 0, lastSyncedAt: null, lastSyncedBy: null },
    conflictModal: null,
    // -- Excel backups (timestamp of last backup, ISO) --------------------
    lastBackupAt: (typeof localStorage !== 'undefined' && localStorage.getItem('cdse_last_backup_v1')) || null,

    // -- detail view ------------------------------------------------------
    detailCase: null,

    // -- query builder ----------------------------------------------------
    query: {
      aggregations: [{ field: 'iq', fn: 'mean' }],
      filters: [],
      match: 'all',
      groupBy: '',
      groupBy2: '',
    },
    matchColumns: null,        // columns of the "matching cases" table (null = list columns)
    crossAggIdx: 0,            // which measure the two-variable table shows
    queryResult: null,
    queryMatches: null,

    // -- preset library — typical state-asked questions -------------------
    QUERY_PRESETS: [
      // -- Measures and durations ------------------------------------------
      { id: 'mesures_distribution', group: 'Measures and durations', label: 'CDSE measures — how often', description: 'Every measure of every case: DS, ISA, C&G, Atelier, Rééducation, Annexe, CST, CdP.',
        config: { aggregations: [{ fn: 'count', field: null }], filters: [], groupBy: 'measures_all' } },
      { id: 'running_now', group: 'Measures and durations', label: 'Measures running today', description: 'Started and not yet ended.',
        config: { aggregations: [{ fn: 'count', field: null }], filters: [], groupBy: 'measures_running' } },
      { id: 'dur_each', group: 'Measures and durations', label: 'Average duration of each measure', description: 'Months per measure. A measure still running counts until today.',
        config: { aggregations: ['dur_isa', 'dur_cg', 'dur_atelier', 'dur_reeducation', 'dur_annexe', 'dur_cst', 'dur_cdp'].map((f) => ({ fn: 'mean', field: f })), filters: [], groupBy: '' } },
      { id: 'dur_isa_profile', group: 'Measures and durations', label: 'ISA duration by profile', description: 'Average and median months of ISA per profile / suspected diagnosis.',
        config: { aggregations: [{ fn: 'mean', field: 'dur_isa' }, { fn: 'median', field: 'dur_isa' }], filters: [{ field: 'measures_all', op: 'has', value: 'ISA' }], groupBy: 'verdachtsdiagnosen_profil' } },
      { id: 'dur_total_school', group: 'Measures and durations', label: 'Time with the CDSE by school', description: 'Average months from the first start to the last end, per school.',
        config: { aggregations: [{ fn: 'mean', field: 'dur_total' }], filters: [{ field: 'dur_total', op: 'notempty' }], groupBy: 'ecole_lycee' } },
      { id: 'dur_total_dir', group: 'Measures and durations', label: 'Time with the CDSE by DR', description: 'Average months per Direction de région.',
        config: { aggregations: [{ fn: 'mean', field: 'dur_total' }], filters: [{ field: 'dur_total', op: 'notempty' }], groupBy: 'dir' } },
      { id: 'dur_per_pupil', group: 'Measures and durations', label: 'Durations per pupil', description: 'List of pupils with the months of each measure.',
        config: { aggregations: [{ fn: 'count', field: null }], filters: [{ field: 'measures_all', op: 'notempty' }], groupBy: '' },
        columns: ['nom', 'prenom', 'measures_all', 'dur_isa', 'dur_cg', 'dur_atelier', 'dur_reeducation', 'dur_cst', 'dur_cdp', 'dur_annexe', 'dur_total'] },
      { id: 'mesures_by_dir', group: 'Measures and durations', label: 'Measures per DR', description: 'Two variables: Direction de région × measure.',
        config: { aggregations: [{ fn: 'count', field: null }], filters: [], groupBy: 'dir', groupBy2: 'measures_all' } },

      // -- Pupils -------------------------------------------------------------
      { id: 'count_by_dir', group: 'Pupils', label: 'Cases by Direction de région', description: 'How many cases per DR 01–15?',
        config: { aggregations: [{ fn: 'count', field: null }], filters: [], groupBy: 'dir' } },
      { id: 'sex_by_dir', group: 'Pupils', label: 'Girls and boys per DR', description: 'Two variables: DR × sex.',
        config: { aggregations: [{ fn: 'count', field: null }], filters: [], groupBy: 'dir', groupBy2: 'sexe' } },
      { id: 'count_by_sexe', group: 'Pupils', label: 'Distribution by sex', description: 'Number of cases, girls vs boys.',
        config: { aggregations: [{ fn: 'count', field: null }], filters: [], groupBy: 'sexe' } },
      { id: 'age_by_sex', group: 'Pupils', label: 'Age groups by sex', description: 'Two-year age groups × sex.',
        config: { aggregations: [{ fn: 'count', field: null }], filters: [], groupBy: 'age_band', groupBy2: 'sexe' } },
      { id: 'avg_age_by_dir', group: 'Pupils', label: 'Average age by DR', description: 'Average age in each Direction de région.',
        config: { aggregations: [{ fn: 'mean', field: 'age' }], filters: [], groupBy: 'dir' } },
      { id: 'languages', group: 'Pupils', label: 'Languages spoken', description: 'Distribution of the first language.',
        config: { aggregations: [{ fn: 'count', field: null }], filters: [], groupBy: 'langue_1' } },
      { id: 'scas', group: 'Pupils', label: 'Cases with SCAS', description: 'How many, and in which DR?',
        config: { aggregations: [{ fn: 'count', field: null }], filters: [{ field: 'scas', op: 'eq', value: 'Yes' }], groupBy: 'dir' } },
      { id: 'tutelle', group: 'Pupils', label: 'Cases under foyer guardianship', description: 'Pupils with a foyer among the guardianship holders.',
        config: { aggregations: [{ fn: 'count', field: null }], filters: [{ field: 'tutelle', op: 'has', value: 'Foyer' }], groupBy: 'dir' } },

      // -- Clinical profile and ELDiB -------------------------------------------
      { id: 'diagnostics_distribution', group: 'Clinical profile and ELDiB', label: 'Diagnoses — distribution', description: 'How often each diagnosis appears. Cases with several are counted in each.',
        config: { aggregations: [{ fn: 'count', field: null }], filters: [], groupBy: 'diagnostics' } },
      { id: 'suspected_distribution', group: 'Clinical profile and ELDiB', label: 'Profiles — distribution', description: 'Suspected diagnoses and clinical profiles.',
        config: { aggregations: [{ fn: 'count', field: null }], filters: [], groupBy: 'verdachtsdiagnosen_profil' } },
      { id: 'eldib_by_measure', group: 'Clinical profile and ELDiB', label: 'ELDiB stages by measure', description: 'Average stage in each ELDiB area, for each measure.',
        config: { aggregations: [{ fn: 'mean', field: 'eldib_v' }, { fn: 'mean', field: 'eldib_k' }, { fn: 'mean', field: 'eldib_soz' }, { fn: 'mean', field: 'eldib_kog' }], filters: [], groupBy: 'measures_all' } },
      { id: 'cc_involved', group: 'Clinical profile and ELDiB', label: 'Other competence centres', description: 'Which other CC are involved, and how often?',
        config: { aggregations: [{ fn: 'count', field: null }], filters: [], groupBy: 'autres_cc' } },
      { id: 'avg_iq_by_diagnosis', group: 'Clinical profile and ELDiB', label: 'Average IQ by diagnosis', description: 'Mean IQ in each diagnosis.',
        config: { aggregations: [{ fn: 'mean', field: 'iq' }], filters: [], groupBy: 'diagnostics' } },
      { id: 'iq_distribution', group: 'Clinical profile and ELDiB', label: 'IQ distribution', description: 'Histogram of IQ across all cases.',
        config: { aggregations: [{ fn: 'mean', field: 'iq' }], filters: [], groupBy: '' } },
    ],
    get presetGroups() {
      const out = [];
      for (const p of this.QUERY_PRESETS) {
        let g = out.find((x) => x.name === p.group);
        if (!g) { g = { name: p.group, items: [] }; out.push(g); }
        g.items.push(p);
      }
      return out;
    },
    savedQueriesList: [],
    saveQueryName: '',
    editingSavedQueryId: null,
    _chart: null,
    _dashCharts: [],

    // -- import / export --------------------------------------------------
    importMode: 'merge',
    importPreview: null,
    importError: '',
    importSheet: null,         // { fileName, sheets, sheetIdx, mapping } while columns are being assigned
    importStep: '',            // '' | 'map' | 'preview' — objects stay set, so templates never read null
    importBusy: false,

    // -- editable lists and clean-up (Settings) ---------------------------
    LIST_META,
    CLEANUP_FIELDS,
    listsState: { schools: null, ateliers: null, reeducation: null },
    listDraft: { schools: '', ateliers: '', reeducation: '' },
    cleanupField: 'dir',
    cleanupValues: [],
    cleanupTargets: {},
    cleanupLoaded: false,
    whatsNewHidden: (typeof localStorage !== 'undefined' && localStorage.getItem('cdse_whatsnew_v2') === 'hidden'),

    // -- audit log --------------------------------------------------------
    auditEntries: [],
    auditFilter: { user: '', action: '' },

    // -- global search (spotlight) ----------------------------------------
    spotlight: { open: false, query: '', results: [], activeIdx: 0 },

    // -- chart-library state ----------------------------------------------
    chartLibError: false,

    // -- modal / toast ----------------------------------------------------
    confirm: { show: false, message: '', onConfirm: null },
    toast: { show: false, message: '', kind: 'ok' },

    // -- nav meta ---------------------------------------------------------
    nav: [
      { id: 'dashboard', label: 'Dashboard',       kicker: 'Overview',      section: 'Statistics' },
      { id: 'cases',     label: 'Cases',           kicker: 'Registry' },
      { id: 'query',     label: 'Queries',         kicker: 'Analysis' },
      { id: 'io',        label: 'Import / Export', kicker: 'Exchange',      section: 'Data' },
      { id: 'audit',     label: 'Audit log',       kicker: 'Traceability' },
      { id: 'settings',  label: 'Settings',        kicker: 'Configuration' },
    ],
    navIcon(id) { return NAV_ICONS[id] || ''; },

    get currentNav() {
      // detail + form are sub-views of the cases registry, not of the dashboard
      const id = (this.view === 'detail' || this.view === 'form') ? 'cases' : this.view;
      return this.nav.find((n) => n.id === id) || this.nav[0];
    },

    // ====================================================================
    // Init — synchronous so Alpine's `$watch` / `$nextTick` magics stay
    // bound to `this`. Anything async goes through .then() instead of
    // await — using await would resume in a context where Alpine has
    // detached its proxy, and `this.$watch` becomes undefined.
    // ====================================================================
    init() {
      // theme
      const stored = localStorage.getItem('cdse:theme');
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.theme = stored || (prefersDark ? 'dark' : 'light');
      this.applyTheme();

      // clock
      this.tickClock();
      setInterval(() => this.tickClock(), 30_000);

      // user
      const u = sessionUser.get();
      if (!u) this.showUserPrompt = true;
      else this.user = u;

      // Open identification category by default in the form
      for (const c of CATEGORIES) this.formCategoryOpen[c.key] = c.key === 'identification';

      // Editable lists (schools, ateliers, rééducation types)
      this.loadLists();

      // dashboard charts: render whenever we land on dashboard or data changes.
      // Use the GLOBAL Alpine.watch / Alpine.nextTick (not this.$watch / window.Alpine.nextTick).
      // Alpine 3 exposes those as $-magics that are only resolvable in expressions,
      // NOT on `this` inside object-literal methods registered via x-data.
      const A = window.Alpine;
      // Coalesce repeated calls — Alpine.watch + .then(scheduleDash) would otherwise
      // both fire after refreshAll, leading to destroy-while-drawing in Chart.js.
      let dashPending = false;
      const scheduleDash = () => {
        if (dashPending) return;
        dashPending = true;
        A.nextTick(() => requestAnimationFrame(() => {
          dashPending = false;
          this.renderDashboardCharts();
        }));
      };
      let queryPending = false;
      const scheduleQuery = () => {
        if (queryPending) return;
        queryPending = true;
        A.nextTick(() => requestAnimationFrame(() => {
          queryPending = false;
          this.renderQueryChart();
        }));
      };
      this._scheduleQuery = scheduleQuery;
      this._scheduleDash = scheduleDash;

      A.watch(() => this.view, (v) => {
        if (v === 'dashboard') scheduleDash();
        if (v === 'query' && this.queryResult) scheduleQuery();
      });
      A.watch(() => this.theme, () => {
        if (this.view === 'dashboard') scheduleDash();
        if (this.view === 'query' && this.queryResult) scheduleQuery();
      });
      A.watch(() => JSON.stringify(this.query), () => {
        if (this.view === 'query') this.queueRun();
      });
      A.watch(() => this.crossAggIdx, () => {
        if (this.view === 'query' && this.queryResult) scheduleQuery();
      });

      // Autosave the form to localStorage on every change while the form is open.
      // Debounced 400 ms so we are not writing on every keystroke.
      A.watch(() => this.view === 'form' ? JSON.stringify(this.formData) : null, (next) => {
        if (next === null) return;
        clearTimeout(this._draftSaveTimer);
        this._draftSaveTimer = setTimeout(() => this.saveDraft(), 400);
      });

      // Warn the user if they try to close the tab with unsaved form changes.
      window.addEventListener('beforeunload', (e) => {
        if (this.view === 'form' && this.hasFormChanges()) {
          e.preventDefault();
          e.returnValue = '';
        }
      });

      // Load data, THEN render — single source of truth for the first render
      this.refreshAll().then(() => {
        // Give the DOM + layout one extra frame to settle before drawing.
        setTimeout(() => this.renderDashboardCharts(), 100);
      });

      // keyboard shortcuts
      window.addEventListener('keydown', (e) => this.handleShortcut(e));
    },

    async refreshAll() {
      this.allCases = await cases.list({ sort: { field: this.sortField, dir: this.sortDir } });
      this.vocabByCat = await vocab.all();
      this.auditEntries = await audit.list({ limit: 500 });
      this.savedQueriesList = await savedQueries.list();
      this.syncMeta = await cases.getSyncMeta();
    },

    // ====================================================================
    // File-based sync (shared JSON on a network drive)
    // ====================================================================
    // Every local mutation bumps cases.getSyncMeta().revision. lastSyncedRevision
    // is the revision at our last successful export or import. Their difference
    // is "how many local changes haven't been shared yet".
    //
    // The sync file format is `cdse-sync-v1`:
    //   { format, revision, last_edited_by, last_edited_at, cases: [...] }
    //
    // Three import outcomes:
    //   - incoming.revision == lastSyncedRevision && no local changes → noop
    //   - incoming.revision == lastSyncedRevision && local changes    → info only
    //   - incoming.revision >  lastSyncedRevision && no local changes → clean apply
    //   - incoming.revision >  lastSyncedRevision && local changes    → conflict
    // ====================================================================
    get hasUnsyncedChanges() {
      return (this.syncMeta?.revision || 0) > (this.syncMeta?.lastSyncedRevision || 0);
    },
    get unsyncedCount() {
      return (this.syncMeta?.revision || 0) - (this.syncMeta?.lastSyncedRevision || 0);
    },
    lastSyncedDisplay() {
      const t = this.syncMeta?.lastSyncedAt;
      if (!t) return 'never';
      try {
        const d = new Date(t);
        return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
      } catch { return t; }
    },

    async exportSyncFile() {
      const all = await cases.exportAll();
      const payload = {
        format: 'cdse-sync-v1',
        revision: this.syncMeta.revision || 0,
        last_edited_by: this.user || null,
        last_edited_at: new Date().toISOString(),
        cases: all,
      };
      // The browser saves to Downloads; the user moves/replaces the file on
      // the shared network drive. The filename is constant so File Explorer's
      // overwrite-prompt offers the right default.
      downloadBlob('cdse.json', JSON.stringify(payload, null, 2), 'application/json');

      // Auto-Excel-backup alongside the sync export. Two files land in the
      // download folder: the constant cdse.json (replaces previous) AND a
      // timestamped cdse-backup-*.csv that accumulates. Disaster-recovery
      // story: every publish point produces an audit-grade snapshot.
      const backupCsv = this._buildBackupCSV(all);
      const backupName = this._backupFilename();
      downloadBlob(backupName, backupCsv, 'text/csv;charset=utf-8');
      try { localStorage.setItem('cdse_last_backup_v1', new Date().toISOString()); } catch { /* quota */ }
      this.lastBackupAt = new Date().toISOString();

      await cases.markExported(this.user);
      this.syncMeta = await cases.getSyncMeta();
      await audit.record({ action: 'export', user: this.user, summary: `Sync export — revision ${payload.revision}, ${all.length} cases (+Excel backup)` });
      this.notify(`Sync file exported (revision ${payload.revision}) + Excel backup ${backupName}.`);
    },

    /** Triggered from a <input type="file"> change. */
    async importSyncFile(event) {
      const file = event?.target?.files?.[0];
      if (!file) return;
      let parsed;
      try { parsed = JSON.parse(await file.text()); }
      catch { this.notify('Invalid JSON file.', 'err'); event.target.value = ''; return; }
      event.target.value = '';  // reset the input so picking the same file again works
      if (!parsed || parsed.format !== 'cdse-sync-v1' || !Array.isArray(parsed.cases)) {
        this.notify('Not a CDSE sync file. Use Import / Export for other JSON imports.', 'err');
        return;
      }
      await this._processIncomingSync(parsed);
    },

    async _processIncomingSync(incoming) {
      const meta = this.syncMeta || { revision: 0, lastSyncedRevision: 0 };
      const localAdvanced = (meta.revision || 0) > (meta.lastSyncedRevision || 0);
      const remoteAdvanced = (incoming.revision || 0) > (meta.lastSyncedRevision || 0);

      if (!localAdvanced && !remoteAdvanced) {
        this.notify('Already in sync. The file matches your last sync point.');
        return;
      }
      if (!remoteAdvanced && localAdvanced) {
        this.notify(`The sync file is the version you started from. ${this.unsyncedCount} local change(s) ready to export.`);
        return;
      }
      if (remoteAdvanced && !localAdvanced) {
        // Clean apply
        await this._applyRemoteSync(incoming);
        return;
      }
      // Both branches advanced → conflict modal
      this.conflictModal = {
        remote: incoming,
        localCount: this.unsyncedCount,
        remoteAt: incoming.last_edited_at,
        remoteBy: incoming.last_edited_by,
        remoteRevision: incoming.revision,
      };
    },

    async _applyRemoteSync(incoming) {
      await cases.applyRemoteSync(
        incoming.cases,
        incoming.revision,
        incoming.last_edited_by,
        incoming.last_edited_at,
      );
      await this.refreshAll();
      await audit.record({
        action: 'import',
        user: this.user,
        summary: `Sync import — revision ${incoming.revision} from ${incoming.last_edited_by || '?'} (${incoming.cases.length} cases)`,
      });
      this.notify(`Synced from ${incoming.last_edited_by || 'sync file'}. ${incoming.cases.length} cases now match revision ${incoming.revision}.`);
    },

    async resolveConflictApplyRemote() {
      const remote = this.conflictModal?.remote;
      if (!remote) return;
      this.conflictModal = null;
      await this._applyRemoteSync(remote);
    },
    async resolveConflictKeepMine() {
      // Bump our revision past the rejected remote one, so our next export is
      // seen as NEWER by colleagues — otherwise their import would classify
      // our overwrite as stale and silently skip it.
      const remoteRev = this.conflictModal?.remoteRevision || 0;
      this.conflictModal = null;
      await cases.alignRevisionPast(remoteRev);
      this.syncMeta = await cases.getSyncMeta();
      this.notify('Your local changes are kept. Click Export to overwrite the sync file when ready.');
    },
    closeConflictModal() {
      this.conflictModal = null;
    },

    // ====================================================================
    // Theme + chrome
    // ====================================================================
    applyTheme() {
      document.documentElement.classList.toggle('dark', this.theme === 'dark');
    },
    toggleTheme() {
      this.theme = this.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('cdse:theme', this.theme);
      this.applyTheme();
    },
    tickClock() {
      this.now = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    },

    // ====================================================================
    // User prompt
    // ====================================================================
    saveUserPrompt() {
      const name = (this.userPromptValue || '').trim();
      if (!name) return;
      sessionUser.set(name);
      this.user = name;
      this.showUserPrompt = false;
      this.userPromptValue = '';
    },

    // ====================================================================
    // Toast + confirm
    // ====================================================================
    notify(message, kind = 'ok') {
      this.toast = { show: true, message, kind };
      setTimeout(() => { this.toast.show = false; }, 2800);
    },
    ask(message, onConfirm) {
      this.confirm = { show: true, message, onConfirm };
    },
    confirmYes() {
      const fn = this.confirm.onConfirm;
      this.confirm = { show: false, message: '', onConfirm: null };
      if (typeof fn === 'function') fn();
    },
    confirmNo() {
      this.confirm = { show: false, message: '', onConfirm: null };
    },

    // ====================================================================
    // Field helpers (for templates)
    // ====================================================================
    formAgePreview() {
      return computeAge(this.formData.date_naissance);
    },
    fieldsOf(catKey) { return getFieldsByCategory(catKey); },
    fieldByKey(k)    { return getField(k); },
    labelOf(k)       { return getField(k)?.label || NUMERIC_FIELDS.find((f) => f.key === k)?.label || k; },
    /** Values offered in query filters: the choices of a select field, the
     *  measure keys for measure lists, otherwise the values found in the data. */
    optionsOf(k) {
      const def = getField(k);
      if (!def) return [];
      if (def.type === 'select') return def.options || [];
      if (k === 'measures_all' || k === 'measures_running') return MEASURE_KEYS;
      if (k === 'age_band') return AGE_BANDS;
      const seen = new Set();
      for (const c of this.allCases) {
        const v = c[k];
        for (const x of Array.isArray(v) ? v : [v]) if (x !== null && x !== undefined && x !== '') seen.add(String(x));
      }
      return [...seen].sort((a, b) => a.localeCompare(b, 'fr'));
    },
    /** Choices for a select in the form — an older stored value stays visible. */
    formOptionsOf(f) {
      const cur = this.formData?.[f.key];
      const opts = f.options || [];
      return cur && !opts.includes(cur) ? [...opts, cur] : opts;
    },
    isOldValue(f, v) { return !!v && f?.type === 'select' && !(f.options || []).includes(v); },
    /** The field that says precisely which measure it is (which atelier …),
     *  shown right under the measure chosen in a slot. */
    measureDetailOf(slotKey) {
      const m = measureInfo(this.formData?.[slotKey]);
      return m && m.detail ? getField(m.detail) : null;
    },
    measureLabel(key) { return measureInfo(key)?.label || key; },
    /** Type-ahead suggestions: the editable list (schools, ateliers …) plus
     *  what has been typed before. */
    suggestionsFor(fieldKey) {
      const def = getField(fieldKey);
      const out = [];
      if (def?.listKey) out.push(...this.listValues(def.listKey));
      out.push(...this.vocabFor(fieldKey));
      return [...new Set(out.filter(Boolean))];
    },
    listValues(key) {
      const v = this.listsState?.[key];
      return Array.isArray(v) ? v : (DEFAULT_LISTS[key] || []);
    },
    vocabFor(fieldKey) {
      const cat = VOCAB_HINT_BY_FIELD[fieldKey];
      if (!cat) return [];
      const bucket = this.vocabByCat?.[cat] || {};
      return Object.entries(bucket).sort((a, b) => b[1] - a[1]).map(([v]) => v);
    },

    // ====================================================================
    // Preset chips — closed-set values rendered as clickable buttons
    // ====================================================================
    /** Combined list of preset values + user-added vocabulary, deduplicated.
     *  Vocabulary entries float to the top (frequently-used first). */
    presetsFor(fieldKey) {
      const presets = presetsForField(fieldKey);
      if (!presets.length) return [];
      const used = this.vocabFor(fieldKey);
      const seen = new Set();
      const out = [];
      for (const v of [...used, ...presets]) {
        const k = v.trim();
        if (!k || seen.has(k)) continue;
        seen.add(k);
        out.push(k);
      }
      return out;
    },

    isPresetActive(fieldKey, value) {
      const cur = this.formData[fieldKey];
      if (Array.isArray(cur)) return cur.includes(value);
      return cur === value;
    },

    /** Click on a chip: for text fields toggles the value (re-click clears),
     *  for tag fields toggles membership in the array. */
    pickPreset(fieldKey, value) {
      const def = getField(fieldKey);
      if (!def) return;
      if (def.type === 'tags') {
        const arr = Array.isArray(this.formData[fieldKey]) ? [...this.formData[fieldKey]] : [];
        const idx = arr.indexOf(value);
        if (idx === -1) arr.push(value);
        else arr.splice(idx, 1);
        this.formData[fieldKey] = arr;
      } else {
        this.formData[fieldKey] = this.formData[fieldKey] === value ? '' : value;
      }
    },

    /** Select fields with few options render as chip-toggle instead of <select>. */
    useChipsForSelect(field) {
      return field?.type === 'select' && (field.options || []).length <= 8;
    },
    selectPickerLayout(field) {
      // Two-option toggles (Oui/Non) get a compact 2-column grid;
      // larger sets flow naturally and wrap.
      return (field.options || []).length <= 2 ? 'compact' : 'flow';
    },

    // ====================================================================
    // Dashboard
    // ====================================================================
    get kpi() {
      const n = this.allCases.length;
      const ages = this.allCases.map((c) => c.age).filter((v) => Number.isFinite(v));
      const iqs = this.allCases.map((c) => c.iq).filter((v) => Number.isFinite(Number(v))).map(Number);
      const avgAge = ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : null;
      const avgIq = iqs.length ? iqs.reduce((a, b) => a + b, 0) / iqs.length : null;

      const bySexe = {};
      const bySchool = {};
      const byMesure = {};
      const byDiag = {};
      for (const c of this.allCases) {
        if (c.sexe) bySexe[c.sexe] = (bySexe[c.sexe] || 0) + 1;
        if (c.ecole_lycee) bySchool[c.ecole_lycee] = (bySchool[c.ecole_lycee] || 0) + 1;
        for (const k of c.measures_all || []) byMesure[k] = (byMesure[k] || 0) + 1;
        for (const d of c.diagnostics || []) byDiag[d] = (byDiag[d] || 0) + 1;
      }
      const nRunning = this.allCases.filter((c) => (c.measures_running || []).length > 0).length;
      const nWithMeasure = this.allCases.filter((c) => (c.measures_all || []).length > 0).length;
      const durs = this.allCases.map((c) => c.dur_total).filter((v) => Number.isFinite(v));
      const avgDurTotal = durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : null;
      const top = (obj, n2 = 5) =>
        Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n2);

      return {
        n,
        nRunning,
        nWithMeasure,
        avgDurTotal, nDurTotal: durs.length,
        avgAge, avgIq,
        nAge: ages.length, nIq: iqs.length,
        sexe: top(bySexe, 5),
        schools: top(bySchool, 5),
        mesures: top(byMesure, 5),
        diagnostics: top(byDiag, 10),
      };
    },

    // ====================================================================
    // List view
    // ====================================================================
    get filteredCases() {
      const q = this.search.trim().toLowerCase();
      const f = this.quickFilters;
      return this.allCases.filter((c) => {
        if (q) {
          const haystack = `${c.nom || ''} ${c.prenom || ''} ${c.matricule || ''}`.toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        for (const [key, val] of Object.entries(f)) {
          if (!val) continue;
          if (key === 'measure') { if (!(c.measures_all || []).includes(val)) return false; }
          else if (c[key] !== val) return false;
        }
        return true;
      });
    },

    /** Choices of the quick filters above the case list. */
    get distinctValues() {
      const sets = { dir: new Set(), sexe: new Set(), measure: new Set(), ecole_lycee: new Set() };
      for (const c of this.allCases) {
        if (c.dir) sets.dir.add(c.dir);
        if (c.sexe) sets.sexe.add(c.sexe);
        for (const m of c.measures_all || []) sets.measure.add(m);
        if (c.ecole_lycee) sets.ecole_lycee.add(c.ecole_lycee);
      }
      const byOrder = (order) => (a, b) => {
        const ia = order.indexOf(a); const ib = order.indexOf(b);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b, 'fr');
      };
      return {
        dir: [...sets.dir].sort(byOrder(DR_OPTIONS)),
        sexe: [...sets.sexe].sort(),
        measure: [...sets.measure].sort(byOrder(MEASURE_KEYS)),
        ecole_lycee: [...sets.ecole_lycee].sort((a, b) => a.localeCompare(b, 'fr')),
      };
    },
    quickFilterLabel(key) { return { measure: 'Measure', dir: 'DR' }[key] || this.labelOf(key); },
    resetQuickFilters() {
      this.search = '';
      this.quickFilters = { dir: '', sexe: '', measure: '', ecole_lycee: '' };
    },

    /** Columns offered in the case list: every field, calculated values
     *  included; older fields only when some case still holds a value. */
    get columnChoices() {
      return FIELD_DEFS.filter((f) => !f.legacy || this.allCases.some((c) => hasValue(c[f.key])));
    },

    setSort(field) {
      if (this.sortField === field) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortField = field;
        this.sortDir = 'asc';
      }
      this.refreshAll();
    },

    cellValue(c, fieldKey) {
      const v = c[fieldKey];
      if (v === null || v === undefined || v === '') return '—';
      if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
      return String(v);
    },

    // ====================================================================
    // Measure status — derived from the date pairs (debut_*, fin_*)
    // ====================================================================
    /**
     * Build the list of measures attached to a case, with computed status.
     * status: 'upcoming' (start in future) | 'active' (started, not ended,
     * or end in future) | 'ending' (active and ends within 30 days)
     * | 'ended' (end in past) | 'open' (start known, no end yet) | null
     */
    measuresOf(c) {
      const out = [];
      const today = new Date().toISOString().slice(0, 10);
      const spec = MEASURES.map((m) => {
        const detail = m.detail ? c[m.detail] : '';
        const label = m.key === 'Other' ? (c.autre_mesure || 'Other')
          : detail && m.key !== 'CdP' ? `${m.key} · ${detail}` : m.key;
        return { key: m.key, label, start: c[m.start], end: c[m.end], who: m.who ? c[m.who] : null, singleDay: !!m.singleDay };
      });
      // An older "specialized schooling" entry that could not be assigned to Annexe / CST / CdP
      if ((c.debut_scol_spe || c.fin_scol_spe) && !specTypeOf(c.scolarisation_specialisee || c.spec_school)) {
        spec.push({ key: 'ScolSpe', label: 'Spec. schooling (older entry)', start: c.debut_scol_spe, end: c.fin_scol_spe, who: c.scolarisation_specialisee });
      }
      for (const m of spec) {
        if (!m.start && !m.end) continue;
        let status = null;
        if (m.singleDay) {
          status = m.start && m.start <= today ? 'ended' : 'upcoming';
        } else if (m.start && !m.end) {
          status = m.start > today ? 'upcoming' : 'open';
        } else if (m.start && m.end) {
          if (m.start > today) status = 'upcoming';
          else if (m.end < today) status = 'ended';
          else {
            const days = (new Date(m.end) - new Date(today)) / 86400000;
            status = days <= 30 ? 'ending' : 'active';
          }
        }
        out.push({ ...m, status });
      }
      return out;
    },

    measureBadgeClass(status) {
      switch (status) {
        case 'active':   return 'bg-primary/10 text-primary';
        case 'open':     return 'bg-primary/10 text-primary';
        case 'ending':   return 'bg-accent/10 text-accent';
        case 'ended':    return 'bg-black/[0.06] dark:bg-white/[0.06] text-muted dark:text-muted-dark';
        case 'upcoming': return 'bg-black/[0.06] dark:bg-white/[0.06] text-ink dark:text-ink-dark';
        default:         return 'bg-black/[0.06] dark:bg-white/[0.06] text-muted dark:text-muted-dark';
      }
    },

    measureStatusLabel(status) {
      return {
        active:   'active',
        open:     'ongoing',
        ending:   'ending soon',
        ended:    'ended',
        upcoming: 'upcoming',
      }[status] || '';
    },

    /** Timeline geometry: maps date ranges to 0..1 positions for SVG drawing. */
    timelineFor(c) {
      const ms = this.measuresOf(c);
      const ranges = ms.filter((m) => m.start || m.end);
      if (!ranges.length) return null;
      const dates = [];
      for (const r of ranges) { if (r.start) dates.push(r.start); if (r.end) dates.push(r.end); }
      const min = dates.reduce((a, b) => a < b ? a : b);
      const max = dates.reduce((a, b) => a > b ? a : b);
      // Pad by 6 months on either side for breathing room
      const minDate = new Date(min); minDate.setMonth(minDate.getMonth() - 6);
      const maxDate = new Date(max); maxDate.setMonth(maxDate.getMonth() + 6);
      const span = maxDate - minDate || 1;
      const project = (iso) => ((new Date(iso) - minDate) / span);
      // null when today falls outside the padded range — template hides the line
      const todayRaw = project(new Date().toISOString().slice(0, 10));
      const todayPct = (todayRaw >= 0 && todayRaw <= 1) ? todayRaw : null;
      const lanes = ranges.map((r) => {
        const sIso = r.start || r.end;
        const eIso = r.end || r.start;
        return {
          ...r,
          xStart: Math.max(0, project(sIso)),
          xEnd: Math.min(1, project(eIso)),
          startLabel: r.start || '—',
          endLabel: r.end || (r.start ? '…' : '—'),
        };
      });
      // X-axis: year ticks — only those that fall INSIDE the padded range,
      // otherwise the Jan-1 tick of the first year projects to a negative x
      // and its label escapes the chart into the surrounding layout.
      const years = [];
      for (let y = minDate.getFullYear(); y <= maxDate.getFullYear() + 1; y++) {
        const x = project(`${y}-01-01`);
        if (x >= 0 && x <= 1) years.push({ label: y, x });
      }
      return { lanes, years, todayPct };
    },

    toggleColumn(key) {
      if (this.visibleColumns.includes(key)) {
        this.visibleColumns = this.visibleColumns.filter((k) => k !== key);
      } else {
        this.visibleColumns = [...this.visibleColumns, key];
      }
    },

    resetColumns() {
      this.visibleColumns = [...LIST_DEFAULT_COLUMNS];
    },

    /** Detail view: the sections that apply to this case — a measure's
     *  section only when the case has that measure, older fields only when
     *  they hold a value, calculated durations only when they can be worked out. */
    detailSections(c) {
      if (!c) return [];
      return CATEGORIES
        .filter((cat) => cat.computedOnly || categoryVisible(cat, c))
        .map((cat) => ({
          key: cat.key,
          label: cat.computedOnly ? 'Duration of measures (calculated)' : cat.label,
          fields: getFieldsByCategory(cat.key).filter((f) => {
            if (f.legacy) return hasValue(c[f.key]);
            if (f.showIf) return fieldVisible(f, c) && hasValue(c[f.key]);
            if (cat.computedOnly) return hasValue(c[f.key]) && c[f.key] !== 0;
            return true;
          }),
        }))
        .filter((s) => s.fields.length);
    },
    /** A value as shown in the detail view (full measure names). */
    displayValue(c, key) {
      const def = getField(key);
      const v = c?.[key];
      if (def?.measureSlot && v) {
        const m = measureInfo(v);
        const detail = m?.detail && m.key !== 'Other' ? c[m.detail] : '';
        return (m ? m.label : v) + (detail ? ` · ${detail}` : '') + (v === 'Other' && c.autre_mesure ? ` · ${c.autre_mesure}` : '');
      }
      if (def?.type === 'computed' && def.numeric && key !== 'age' && key !== 'n_measures' && Number.isFinite(v)) return `${formatNumber(v, 1)} months`;
      return this.cellValue(c, key);
    },

    // ====================================================================
    // Detail view
    // ====================================================================
    async showDetail(id) {
      const c = await cases.get(id);
      if (!c) { this.notify('Case not found', 'err'); return; }
      this.detailCase = c;
      this.view = 'detail';
    },

    backToList() {
      // detailCase stays set: the detail template is hidden, not torn down
      this.view = 'cases';
    },

    printDetail() {
      // The print stylesheet hides everything but #printArea.
      // Calling window.print() opens the browser's PDF / printer dialog.
      document.body.classList.add('printing');
      // give the browser a tick to render
      setTimeout(() => {
        window.print();
        // remove the class after a short delay so users see the layout restore
        setTimeout(() => document.body.classList.remove('printing'), 500);
      }, 50);
    },

    // ====================================================================
    // Form (create / edit)
    // ====================================================================
    startCreate() {
      this.formMode = 'create';
      this.editingId = null;
      this.formData = blankCase();
      this.formErrors = {};
      this.formExtraSections = {};
      this.tagDraft = {};
      this.showAdvanced = false;  // start with essentials only
      this.formCategoryOpen = { _essentials: true };
      for (const c of CATEGORIES) this.formCategoryOpen[c.key] = c.key === 'identification';
      this.draftSaved = false;
      // Offer to restore a previous draft if one exists for new cases.
      const draft = this.readDraft();
      this.draftRestorePending = (draft && draft.formMode === 'create') ? draft : null;
      this._formBaseline = JSON.stringify(this.formData);
      this.view = 'form';
    },

    async startEdit(id) {
      const c = await cases.get(id);
      if (!c) { this.notify('Case not found', 'err'); return; }
      this.formMode = 'edit';
      this.editingId = id;
      const blank = blankCase();
      const editable = {};
      for (const [k, v] of Object.entries(c)) if (getField(k)?.type !== 'computed') editable[k] = v;
      this.formData = { ...blank, ...editable };
      for (const f of getEditableFields()) {
        if (f.type === 'tags' && !Array.isArray(this.formData[f.key])) this.formData[f.key] = [];
        if (f.type !== 'tags' && this.formData[f.key] == null) this.formData[f.key] = '';
      }
      this.formErrors = {};
      this.formExtraSections = {};
      this.tagDraft = {};
      // When editing, auto-expand the advanced section if the case has any
      // non-essential fields already filled, so users see all their data.
      this.showAdvanced = getEditableFields().some(
        (f) => !ESSENTIAL_FIELD_KEYS.has(f.key) && hasValue(this.formData[f.key]),
      );
      this.formCategoryOpen = { _essentials: true };
      for (const c2 of CATEGORIES) this.formCategoryOpen[c2.key] = true;
      this.draftSaved = false;
      // Drafts apply to new cases only — clear any leftover.
      this.draftRestorePending = null;
      this._formBaseline = JSON.stringify(this.formData);
      this.view = 'form';
    },

    // ====================================================================
    // Form autosave — survive accidental tab closes and navigations
    // ====================================================================
    _draftKey() { return 'cdse_draft_v1'; },
    saveDraft() {
      // Only save non-empty drafts for new cases. Drafts for edits aren't
      // useful — the original record is already persisted.
      if (this.formMode !== 'create') return;
      if (!this.hasFormChanges()) {
        localStorage.removeItem(this._draftKey());
        this.draftSaved = false;
        return;
      }
      const payload = {
        formMode: this.formMode,
        formData: this.formData,
        showAdvanced: this.showAdvanced,
        timestamp: new Date().toISOString(),
      };
      try {
        localStorage.setItem(this._draftKey(), JSON.stringify(payload));
        this.draftSaved = true;
      } catch { /* quota or disabled */ }
    },
    readDraft() {
      try {
        const raw = localStorage.getItem(this._draftKey());
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    },
    restoreDraft() {
      const d = this.draftRestorePending;
      if (!d) return;
      this.formData = { ...blankCase(), ...d.formData };
      this.showAdvanced = !!d.showAdvanced;
      this.draftRestorePending = null;
      this.draftSaved = true;
      this._formBaseline = JSON.stringify(this.formData);
      this.notify('Draft restored.');
    },
    discardDraft() {
      localStorage.removeItem(this._draftKey());
      this.draftRestorePending = null;
      this.draftSaved = false;
    },
    clearDraft() {
      localStorage.removeItem(this._draftKey());
      this.draftSaved = false;
    },
    /** Has the user changed anything compared to the form's baseline? */
    hasFormChanges() {
      return this._formBaseline !== undefined && JSON.stringify(this.formData) !== this._formBaseline;
    },
    /** When was the draft last saved, as a relative-ish English phrase. */
    draftSavedAt() {
      const d = this.readDraft();
      if (!d || !d.timestamp) return '';
      try { return new Date(d.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
      catch { return ''; }
    },

    /** The fields shown in the always-visible "Essentials" block. */
    essentialFields() {
      return getEditableFields().filter((f) => ESSENTIAL_FIELD_KEYS.has(f.key));
    },
    /** Is this field shown in the form? Conditional fields ("Other" texts),
     *  older fields only with a value, and a measure's detail field is shown
     *  right under the measure slot instead of twice. */
    formFieldShown(f) {
      if (f.type === 'computed' && f.key !== 'age') return false;
      if (!fieldVisible(f, this.formData)) return false;
      // The fields of a measure chosen in a slot are shown right under the slot
      const shownUnderSlot = MEASURES.some((m) => m.category === f.category && hasMeasure(this.formData, m.key));
      return !shownUnderSlot;
    },
    /** The fields of the measure chosen in a slot (which one, dates, staff) —
     *  shown under the slot. Empty when an earlier slot has the same measure. */
    slotFields(slotKey) {
      const key = this.formData?.[slotKey];
      const m = measureInfo(key);
      if (!m) return [];
      const slots = ['mesure_cdse_1', 'mesure_cdse_2', 'mesure_cdse_3'];
      const idx = slots.indexOf(slotKey);
      if (slots.slice(0, idx).some((s2) => this.formData?.[s2] === key)) return [];
      const fields = getFieldsByCategory(m.category).filter((f) => f.type !== 'computed' && !f.legacy);
      return [...fields.filter((f) => f.key === m.detail), ...fields.filter((f) => f.key !== m.detail)];
    },
    /** Label of a choice in the form (full measure names; older values marked). */
    optionLabel(f, o) {
      const base = f?.measureSlot ? this.measureLabel(o) : o;
      return this.isOldValue(f, o) ? `${base} (older value)` : base;
    },
    /** "Show all fields": open every section that already holds a value. */
    toggleAdvanced() {
      this.showAdvanced = !this.showAdvanced;
      if (!this.showAdvanced) return;
      for (const c of CATEGORIES) {
        if (getFieldsByCategory(c.key).some((f) => f.type !== 'computed' && hasValue(this.formData[f.key]))) this.formCategoryOpen[c.key] = true;
      }
    },
    /** Non-essential fields in a category (used by the advanced accordion). */
    nonEssentialFieldsOf(catKey) {
      return getFieldsByCategory(catKey).filter((f) => !ESSENTIAL_FIELD_KEYS.has(f.key));
    },
    /** Categories that still have non-essential fields to show. */
    nonEssentialCategories() {
      return CATEGORIES.filter((c) => this.nonEssentialFieldsOf(c.key).length > 0);
    },
    /** Form sections to render, switched by `showAdvanced`.
     *  Simple mode: one virtual section "Essentials" with 7 picked fields.
     *  Advanced mode: all 12 categories, each with all their fields. */
    get formSections() {
      if (!this.showAdvanced) {
        return [{
          key: '_essentials',
          label: 'Essentials',
          _fields: this.essentialFields().filter((f) => this.formFieldShown(f)),
        }];
      }
      return CATEGORIES
        .filter((c) => !c.computedOnly && (categoryVisible(c, this.formData) || this.formExtraSections[c.key]))
        .map((c) => ({
          key: c.key,
          label: c.label,
          _fields: getFieldsByCategory(c.key).filter((f) => this.formFieldShown(f)),
        }))
        .filter((c) => c._fields.length);
    },
    get nonEssentialFieldCount() {
      return getEditableFields().filter((f) => !f.legacy && !f.showIf && !ESSENTIAL_FIELD_KEYS.has(f.key) && categoryVisible(CATEGORIES.find((c) => c.key === f.category), this.formData)).length;
    },
    /** Measure sections that are not shown yet (the case has more measures
     *  than the three slots) — offered as "+ add" buttons. */
    get hiddenMeasureSections() {
      if (!this.showAdvanced) return [];
      return MEASURES.filter((m) => !this.formExtraSections[m.category] && !categoryVisible(CATEGORIES.find((c) => c.key === m.category), this.formData));
    },
    /** Show a measure section although it is not chosen in a slot. */
    openMeasureSection(key) {
      const m = measureInfo(key);
      if (!m) return;
      this.formExtraSections = { ...this.formExtraSections, [m.category]: true };
      this.formCategoryOpen[m.category] = true;
    },

    addTag(fieldKey) {
      const val = (this.tagDraft[fieldKey] || '').trim();
      if (!val) return;
      const arr = Array.isArray(this.formData[fieldKey]) ? this.formData[fieldKey] : [];
      if (!arr.includes(val)) this.formData[fieldKey] = [...arr, val];
      this.tagDraft[fieldKey] = '';
    },
    removeTag(fieldKey, idx) {
      const arr = Array.isArray(this.formData[fieldKey]) ? [...this.formData[fieldKey]] : [];
      arr.splice(idx, 1);
      this.formData[fieldKey] = arr;
    },

    crossFieldErrors(data) {
      // Start/end order, "Other" texts … are checked in validateCase (fields.js).
      const e = {};
      if (data.debut_scol_spe && data.fin_scol_spe && data.debut_scol_spe > data.fin_scol_spe) e.fin_scol_spe = 'The end lies before the start.';
      return e;
    },

    async submitForm() {
      // Coerce types
      const payload = { ...this.formData };
      for (const f of getEditableFields()) {
        if (f.type === 'number' && payload[f.key] !== '' && payload[f.key] != null) {
          payload[f.key] = Number(payload[f.key]);
        }
      }

      const { valid, errors } = validateCase(payload);
      const crossErrors = this.crossFieldErrors(payload);
      const allErrors = { ...errors, ...crossErrors };
      if (!valid || Object.keys(crossErrors).length) {
        this.formErrors = allErrors;
        const firstBadCat = getEditableFields().find((f) => allErrors[f.key])?.category;
        if (firstBadCat) this.formCategoryOpen[firstBadCat] = true;
        if (Object.keys(allErrors).some((k) => !ESSENTIAL_FIELD_KEYS.has(k))) this.showAdvanced = true;
        this.notify('Please fix the errors.', 'err');
        return;
      }
      this.formErrors = {};

      // Persist vocab from text/autocomplete fields
      for (const [key, cat] of Object.entries(VOCAB_HINT_BY_FIELD)) {
        const v = payload[key];
        if (Array.isArray(v)) await vocab.registerMany(cat, v);
        else if (typeof v === 'string' && v.trim()) await vocab.register(cat, v.trim());
      }

      if (this.formMode === 'create') {
        const created = await cases.create(payload);
        await audit.record({
          action: 'create',
          caseId: created.id,
          user: this.user,
          summary: `${created.prenom || ''} ${created.nom || ''} (${created.matricule || '—'})`.trim(),
          changes: diffCases({}, created),
        });
        this.notify('Case created.');
      } else {
        const before = await cases.get(this.editingId);
        const updated = await cases.update(this.editingId, payload);
        await audit.record({
          action: 'update',
          caseId: updated.id,
          user: this.user,
          summary: `${updated.prenom || ''} ${updated.nom || ''} (${updated.matricule || '—'})`.trim(),
          changes: diffCases(before, updated),
        });
        this.notify('Case updated.');
      }

      await this.refreshAll();
      this.clearDraft();
      this._formBaseline = JSON.stringify(this.formData);
      this.view = 'cases';
    },

    cancelForm() {
      const closeNow = () => {
        this.formErrors = {};
        this.clearDraft();
        this._formBaseline = JSON.stringify(this.formData);
        this.view = 'cases';
      };
      if (this.hasFormChanges()) {
        this.ask('Discard your unsaved changes?', closeNow);
      } else {
        closeNow();
      }
    },

    async deleteCase(id) {
      this.ask('Permanently delete this case?', async () => {
        const before = await cases.get(id);
        const ok = await cases.delete(id);
        if (ok) {
          await audit.record({
            action: 'delete',
            caseId: id,
            user: this.user,
            summary: `${before?.prenom || ''} ${before?.nom || ''} (${before?.matricule || '—'})`.trim(),
            changes: diffCases(before, {}),
          });
          this.notify('Case deleted.');
          await this.refreshAll();
          if (this.view === 'detail') this.view = 'cases';
        }
      });
    },

    // ====================================================================
    // Query builder
    // ====================================================================
    addAggregation() {
      this.query.aggregations.push({ field: 'iq', fn: 'mean' });
    },
    removeAggregation(i) {
      this.query.aggregations.splice(i, 1);
      if (!this.query.aggregations.length) this.query.aggregations.push({ fn: 'count', field: null });
    },
    addFilter() {
      this.query.filters.push({ _id: uid(), field: 'sexe', op: 'eq', value: '', value2: '' });
    },
    removeFilter(i) {
      this.query.filters.splice(i, 1);
    },
    filterType(k) { return filterTypeOf(k); },
    opOf(f) { return operatorsFor(f.field).find((o) => o.key === f.op) || null; },
    /** Change of operator: "is one of" works on a list of values, the others on one value. */
    onFilterOpChange(i) {
      const f = this.query.filters[i];
      const op = this.opOf(f);
      if (op?.multi && !Array.isArray(f.value)) f.value = f.value !== '' && f.value != null ? [String(f.value)] : [];
      if (op && !op.multi && Array.isArray(f.value)) f.value = f.value[0] || '';
    },
    toggleFilterValue(i, v) {
      const f = this.query.filters[i];
      const cur = Array.isArray(f.value) ? f.value : [];
      f.value = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    },
    filterValueSummary(f) {
      const v = Array.isArray(f.value) ? f.value : [];
      if (!v.length) return 'choose…';
      return v.length <= 2 ? v.join(', ') : `${v.slice(0, 2).join(', ')} +${v.length - 2}`;
    },
    /** Filters that are complete enough to apply. */
    cleanFilters() {
      return (this.query.filters || []).filter((f) => {
        const op = this.opOf(f);
        if (!op) return false;
        if (op.multi) return Array.isArray(f.value) && f.value.length > 0;
        if (op.needsValue && (f.value === '' || f.value === null || f.value === undefined)) return false;
        if (op.needsValue2 && (f.value2 === '' || f.value2 === null || f.value2 === undefined)) return false;
        return true;
      });
    },
    operatorsForField(k) { return operatorsFor(k); },
    fmt(n, digits) { return formatNumber(n, digits ?? 1); },

    onAggFieldChange(i) {
      const a = this.query.aggregations[i];
      // when fn is count, field is irrelevant
      if (a.fn === 'count') a.field = null;
    },

    onFilterFieldChange(i) {
      const f = this.query.filters[i];
      const ops = operatorsFor(f.field);
      if (!ops.find((o) => o.key === f.op)) f.op = ops[0]?.key || 'eq';
      f.value = ops.find((o) => o.key === f.op)?.multi ? [] : '';
      f.value2 = '';
    },

    runCurrentQuery() {
      // Cancel any debounced re-run so we never have two renders racing
      // (one from the direct call after a preset click, one from the
      // query-mutation watcher's debounce). Without this the second
      // render destroys the first chart while it's still drawing.
      clearTimeout(this._runTimer);

      // Drop incomplete filters silently
      const clean = this.cleanFilters();
      const cleanAggs = (this.query.aggregations || []).filter((a) => a.fn === 'count' || !!a.field);
      const cfg = {
        filters: clean,
        match: this.query.match || 'all',
        aggregations: cleanAggs.length ? cleanAggs : [{ fn: 'count', field: null }],
        groupBy: this.query.groupBy || null,
        groupBy2: (this.query.groupBy && this.query.groupBy2) || null,
      };
      if (this.crossAggIdx >= cfg.aggregations.length) this.crossAggIdx = 0;
      this.queryResult = runQuery(this.allCases, cfg);
      (this._scheduleQuery || (() => window.Alpine.nextTick(() => this.renderQueryChart())))();
    },

    /** One cell of the two-variable table. */
    crossCell(row, col) {
      const r = this.queryResult;
      const cell = r?.cross?.cells?.[row]?.[col];
      const a = (this.query.aggregations || [])[this.crossAggIdx] || { fn: 'count' };
      if (!cell) return a.fn === 'count' ? '0' : '—';
      return this.fmt(cell.values[this.crossAggIdx], 1);
    },
    /** Light shading: the larger the value, the darker the cell. */
    crossCellStyle(row, col) {
      const r = this.queryResult;
      if (!r?.cross) return '';
      let max = 0;
      for (const rw of r.cross.rows) for (const c of r.cross.cols) {
        const v = r.cross.cells[rw]?.[c]?.values[this.crossAggIdx];
        if (Number.isFinite(v) && v > max) max = v;
      }
      const v = r.cross.cells[row]?.[col]?.values[this.crossAggIdx];
      if (!Number.isFinite(v) || !max || v <= 0) return '';
      return `background: rgb(var(--c-primary) / ${(0.06 + 0.3 * (v / max)).toFixed(3)})`;
    },

    renderQueryChart() {
      const ctx = document.getElementById('queryChart');
      if (!ctx) return;
      // Retry next frame if the canvas parent hasn't laid out yet.
      if (ctx.parentElement && !ctx.parentElement.clientWidth) {
        requestAnimationFrame(() => this.renderQueryChart());
        return;
      }
      if (this._chart) {
        try { this._chart.destroy(); } catch (e) { /* canvas may be gone */ }
        this._chart = null;
      }

      const r = this.queryResult;
      if (!r) return;
      const aggs = (this.query.aggregations || []).filter((a) => a.fn === 'count' || !!a.field);
      const effectiveAggs = aggs.length ? aggs : [{ fn: 'count', field: null }];
      const baseOpts = chartOptions(this.theme);
      const doughnutOpts = {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: baseOpts.plugins,
        cutout: '60%',
      };

      try {
        // 0. two variables → grouped bars (first measure), one colour per column
        if (r.cross && r.cross.rows.length) {
          const cols = r.cross.cols.slice(0, CHART_COLORS.length);
          const isCount = (effectiveAggs[this.crossAggIdx] || effectiveAggs[0]).fn === 'count';
          this._chart = new window.Chart(ctx, {
            type: 'bar',
            data: {
              labels: r.cross.rows.map((k) => (k.length > 28 ? k.slice(0, 26) + '…' : k)),
              datasets: cols.map((col, idx) => ({
                label: col,
                data: r.cross.rows.map((row) => r.cross.cells[row]?.[col]?.values[this.crossAggIdx] ?? null),
                backgroundColor: CHART_COLORS[idx % CHART_COLORS.length],
                borderRadius: 3,
                stack: isCount ? 's' : undefined,
              })),
            },
            options: {
              ...baseOpts,
              plugins: { ...baseOpts.plugins, legend: { display: true, position: 'bottom', labels: { boxWidth: 12 } } },
              scales: isCount ? { ...baseOpts.scales, x: { ...(baseOpts.scales?.x || {}), stacked: true }, y: { ...(baseOpts.scales?.y || {}), stacked: true } } : baseOpts.scales,
            },
          });
          return;
        }
        // 1. group-by → bar chart (or doughnut for count-only with few groups)
        if (r.groupBy && r.groups.length) {
          const labels = r.groups.map((g) => g.key);
          const datasets = effectiveAggs.map((a, idx) => ({
            label: this.aggLabel(a),
            data: r.groups.map((g) => g.values[idx]),
            backgroundColor: CHART_COLORS[idx % CHART_COLORS.length],
            borderRadius: 3,
          }));
          const isCountOnly = effectiveAggs.length === 1 && effectiveAggs[0].fn === 'count';
          const useDoughnut = isCountOnly && labels.length <= 8;
          this._chart = new window.Chart(ctx, {
            type: useDoughnut ? 'doughnut' : 'bar',
            data: useDoughnut
              ? { labels, datasets: [{ data: datasets[0].data, backgroundColor: CHART_COLORS, borderColor: 'transparent' }] }
              : { labels, datasets },
            options: useDoughnut ? doughnutOpts : baseOpts,
          });
          return;
        }

        // 2. single numeric aggregation without group-by → histogram
        if (r.rawValues && r.rawValues.length) {
          const bins = histogram(r.rawValues, 10);
          this._chart = new window.Chart(ctx, {
            type: 'bar',
            data: {
              labels: bins.map((b) => `${formatNumber(b.from, 0)}–${formatNumber(b.to, 0)}`),
              datasets: [{
                label: this.aggLabel(effectiveAggs[0]) + ' (distribution)',
                data: bins.map((b) => b.count),
                backgroundColor: CHART_COLORS[0],
                borderRadius: 3,
              }],
            },
            options: baseOpts,
          });
          return;
        }
        // 3. otherwise no chart, just metric text
      } catch (e) {
        console.error('CDSE: query chart creation failed', e);
      }
    },

    // ====================================================================
    // Dashboard charts
    // ====================================================================
    renderDashboardCharts(attempt = 0) {
      if (this._dashCharts && this._dashCharts.length) {
        this._dashCharts.forEach((c) => { try { c && c.destroy(); } catch {} });
      }
      this._dashCharts = [];
      if (!this.allCases.length) return;
      if (!window.Chart) {
        console.error('CDSE: Chart.js is not loaded. Charts disabled.');
        this.chartLibError = true;
        return;
      }
      this.chartLibError = false;
      // Retry if the canvas isn't in the DOM yet OR its parent has 0 width.
      // Capped at 10 attempts to avoid infinite loops if the dashboard is
      // hidden by an unexpected ancestor.
      const probe = document.getElementById('dashSexe');
      const needsRetry = !probe || (probe.parentElement && !probe.parentElement.clientWidth);
      if (needsRetry) {
        if (attempt >= 10) {
          console.warn('CDSE: gave up rendering charts after 10 attempts; container has no size.');
          return;
        }
        setTimeout(() => this.renderDashboardCharts(attempt + 1), 80);
        return;
      }

      // Fresh option objects for every chart: Chart.js writes resolved scale
      // types into the objects it is given, so sharing one object between a
      // vertical and a horizontal bar chart turned the horizontal one around.
      const theme = this.theme;
      const noLegend = (extra = {}) => {
        const o = chartOptions(theme);
        return { ...o, ...extra, plugins: { ...o.plugins, legend: { display: false }, ...(extra.plugins || {}) } };
      };
      const doughnut = (legendPos = 'right') => {
        const o = chartOptions(theme);
        return {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          cutout: '62%',
          plugins: { ...o.plugins, legend: { position: legendPos, labels: { ...o.plugins.legend.labels, boxWidth: 12, boxHeight: 12, padding: 10 } } },
        };
      };
      const palette = CHART_COLORS;

      const make = (id, config) => {
        const el = document.getElementById(id);
        if (!el) { console.warn('CDSE: canvas missing', id); return; }
        try {
          this._dashCharts.push(new window.Chart(el, config));
        } catch (e) {
          console.error('CDSE: chart creation failed for', id, e);
        }
      };

      // 1. Sex doughnut
      const sexeCounts = countBy(this.allCases, (c) => c.sexe);
      const SEX_LABEL = { F: 'Girls', M: 'Boys', D: 'Diverse' };
      const sexKeys = ['F', 'M', 'D'].filter((k) => sexeCounts[k]).concat(Object.keys(sexeCounts).filter((k) => !['F', 'M', 'D'].includes(k)));
      make('dashSexe', {
        type: 'doughnut',
        data: {
          labels: sexKeys.map((k) => SEX_LABEL[k] || k),
          datasets: [{ data: sexKeys.map((k) => sexeCounts[k]), backgroundColor: ['#B4533A', '#2E3A9C', '#1F6B6F', '#7A8396'], borderColor: 'transparent' }],
        },
        options: doughnut('right'),
      });

      // 2. Measures doughnut (every measure of every case)
      const mesureCounts = {};
      for (const c of this.allCases) {
        for (const k of c.measures_all || []) mesureCounts[k] = (mesureCounts[k] || 0) + 1;
      }
      const mesureEntries = Object.entries(mesureCounts).sort((a, b) => b[1] - a[1]);
      make('dashMesures', {
        type: 'doughnut',
        data: {
          labels: mesureEntries.map(([k]) => k),
          datasets: [{ data: mesureEntries.map(([, v]) => v), backgroundColor: palette, borderColor: 'transparent' }],
        },
        options: doughnut('right'),
      });

      // 3. Cases by Direction de région (natural order DR 01 … 15)
      const drCounts = countBy(this.allCases, (c) => c.dir);
      const drLabels = [...DR_OPTIONS.filter((d) => drCounts[d]), ...Object.keys(drCounts).filter((d) => !DR_OPTIONS.includes(d))];
      make('dashDr', {
        type: 'bar',
        data: {
          labels: drLabels.map((d) => d.replace(/^DR /, '')),
          datasets: [{ data: drLabels.map((d) => drCounts[d]), backgroundColor: CHART_COLORS[0], borderColor: 'transparent', borderRadius: 4, maxBarThickness: 16 }],
        },
        options: noLegend({ indexAxis: 'y', scales: { ...chartOptions(theme).scales, y: { ...chartOptions(theme).scales.y, ticks: { ...chartOptions(theme).scales.y.ticks, autoSkip: false, font: { family: CHART_FONT, size: 11 } } } } }),
      });

      // 4. Measures running today
      const runCounts = {};
      for (const c of this.allCases) for (const k of c.measures_running || []) runCounts[k] = (runCounts[k] || 0) + 1;
      const runKeys = MEASURE_KEYS.filter((k) => runCounts[k]);
      make('dashRunning', {
        type: 'bar',
        data: {
          labels: runKeys,
          datasets: [{ data: runKeys.map((k) => runCounts[k]), backgroundColor: CHART_COLORS[1], borderColor: 'transparent', borderRadius: 4, maxBarThickness: 38 }],
        },
        options: noLegend(),
      });

      // 5. Average duration per measure (months)
      const durKeys = [['ISA', 'dur_isa'], ['C&G', 'dur_cg'], ['Atelier', 'dur_atelier'], ['Rééducation', 'dur_reeducation'], ['Annexe', 'dur_annexe'], ['CST', 'dur_cst'], ['CdP', 'dur_cdp']]
        .map(([k, f]) => {
          const v = this.allCases.map((c) => c[f]).filter((x) => Number.isFinite(x));
          return [k, v.length ? v.reduce((a, b) => a + b, 0) / v.length : null, v.length];
        })
        .filter(([, m]) => m !== null);
      make('dashDur', {
        type: 'bar',
        data: {
          labels: durKeys.map(([k]) => k),
          datasets: [{ data: durKeys.map(([, m]) => Math.round(m * 10) / 10), backgroundColor: CHART_COLORS[4], borderColor: 'transparent', borderRadius: 4, maxBarThickness: 38 }],
        },
        options: noLegend({ plugins: { tooltip: { callbacks: { label: (it) => `${it.parsed.y} months (n = ${durKeys[it.dataIndex][2]})` } } } }),
      });

      // 6. Top schools — full names, no codes
      const schoolEntries = topEntries(countBy(this.allCases, (c) => c.ecole_lycee), 8);
      make('dashSchools', {
        type: 'bar',
        data: {
          labels: schoolEntries.map(([k]) => wrapLabel(k, 26)),
          datasets: [{ data: schoolEntries.map(([, v]) => v), backgroundColor: CHART_COLORS[0], borderColor: 'transparent', borderRadius: 4, maxBarThickness: 18 }],
        },
        options: noLegend({ indexAxis: 'y', plugins: { tooltip: { callbacks: { title: (items) => schoolEntries[items[0].dataIndex][0] } } } }),
      });

      // 7. Top diagnoses horizontal bar (up to 10)
      const diagCounts = {};
      for (const c of this.allCases) {
        for (const d of c.diagnostics || []) diagCounts[d] = (diagCounts[d] || 0) + 1;
      }
      const diagEntries = topEntries(diagCounts, 10);
      make('dashDiag', {
        type: 'bar',
        data: {
          labels: diagEntries.map(([k]) => shortLabelOf(k)),
          datasets: [{ data: diagEntries.map(([, v]) => v), backgroundColor: CHART_COLORS[2], borderColor: 'transparent', borderRadius: 4, maxBarThickness: 18 }],
        },
        options: noLegend({ indexAxis: 'y', plugins: { tooltip: { callbacks: { title: (items) => diagEntries[items[0].dataIndex][0] } } } }),
      });

      // Age histogram
      const ages = this.allCases.map((c) => c.age).filter((v) => Number.isFinite(v));
      if (ages.length) {
        const bins = histogram(ages, Math.min(12, Math.max(4, Math.ceil(Math.sqrt(ages.length)))));
        make('dashAge', {
          type: 'bar',
          data: {
            labels: bins.map((b) => `${Math.round(b.from)}–${Math.round(b.to)}`),
            datasets: [{ data: bins.map((b) => b.count), backgroundColor: CHART_COLORS[0], borderColor: 'transparent', borderRadius: 3 }],
          },
          options: noLegend(),
        });
      }

      // IQ histogram
      const iqs = this.allCases.map((c) => Number(c.iq)).filter((v) => Number.isFinite(v));
      if (iqs.length) {
        const bins = histogram(iqs, Math.min(12, Math.max(4, Math.ceil(Math.sqrt(iqs.length)))));
        make('dashIq', {
          type: 'bar',
          data: {
            labels: bins.map((b) => `${Math.round(b.from)}–${Math.round(b.to)}`),
            datasets: [{ data: bins.map((b) => b.count), backgroundColor: CHART_COLORS[2], borderColor: 'transparent', borderRadius: 3 }],
          },
          options: noLegend(),
        });
      }
    },

    // ====================================================================
    // Query Builder: show matching cases
    // ====================================================================
    showMatchingCases(columns) {
      if (Array.isArray(columns)) this.matchColumns = columns;
      this.queryMatches = filterRecords(this.allCases, this.cleanFilters(), this.query.match || 'all');
    },

    hideMatchingCases() {
      this.queryMatches = null;
      this.matchColumns = null;
    },

    get matchTableColumns() {
      return this.matchColumns || this.visibleColumns;
    },

    exportMatchesCSV() {
      if (!this.queryMatches) return;
      const cols = this.matchTableColumns;
      const rows = this.queryMatches.map((c) => cols.map((k) => (Array.isArray(c[k]) ? c[k].join('; ') : c[k] ?? '')));
      const csv = [cols.map((k) => this.labelOf(k)), ...rows].map((row) => row.map(csvEscape).join(';')).join('\r\n');
      downloadBlob(`cdse-cases-${Date.now()}.csv`, '\uFEFF' + csv, 'text/csv;charset=utf-8');
      audit.record({ action: 'export', user: this.user, summary: `Matching cases (CSV) — ${this.queryMatches.length} cases` });
    },

    aggLabel(a) {
      const fn = AGGREGATIONS.find((x) => x.key === a.fn)?.label || a.fn;
      if (a.fn === 'count') return fn;
      return `${fn} ${this.labelOf(a.field)}`;
    },

    async saveCurrentQuery() {
      const name = (this.saveQueryName || '').trim();
      if (!name) { this.notify('Give the query a name.', 'err'); return; }
      const saved = await savedQueries.save({
        id: this.editingSavedQueryId,
        name,
        config: JSON.parse(JSON.stringify(this.query)),
      });
      this.savedQueriesList = await savedQueries.list();
      this.editingSavedQueryId = saved.id;
      this.notify('Query saved.');
    },

    loadSavedQuery(id) {
      const q = this.savedQueriesList.find((x) => x.id === id);
      if (!q) return;
      this.query = normalizeQuery(q.config);
      this.saveQueryName = q.name;
      this.editingSavedQueryId = q.id;
      this.runCurrentQuery();
    },

    async deleteSavedQuery(id) {
      this.ask('Delete this saved query?', async () => {
        await savedQueries.delete(id);
        this.savedQueriesList = await savedQueries.list();
        if (this.editingSavedQueryId === id) { this.editingSavedQueryId = null; this.saveQueryName = ''; }
        this.notify('Query deleted.');
      });
    },

    // ====================================================================
    // Query builder UX helpers
    // ====================================================================
    /** Variables exposed in filter / group-by selects, grouped by category
     *  so the dropdowns are scannable instead of a wall of 38 options. */
    /** Variables exposed in the filter select, grouped by form section. */
    get filterableByCategory() {
      return groupFieldsByCategory(FILTERABLE_FIELDS);
    },

    /** Variables a result can be grouped by — multi-value ones (diagnoses,
     *  measures …) fan out, one bucket per value. */
    get groupableByCategory() {
      return groupFieldsByCategory(GROUPABLE_FIELDS);
    },

    /** Build the current query as a readable English sentence. */
    get questionPreview() {
      const FN_PHRASE = {
        count:  'the number',
        mean:   'the average',
        median: 'the median',
        min:    'the minimum',
        max:    'the maximum',
        sum:    'the sum',
        stddev: 'the std. deviation',
      };
      const aggs = (this.query.aggregations || []).filter((a) => a.fn === 'count' || a.field);
      const filters = this.cleanFilters();

      let measure;
      if (!aggs.length) {
        measure = 'the number';
      } else {
        const parts = aggs.map((a) => {
          if (a.fn === 'count') return 'the number';
          const phrase = FN_PHRASE[a.fn] || a.fn;
          return `${phrase} ${this.labelOf(a.field)}`;
        });
        measure = parts.length === 1 ? parts[0] : parts.slice(0, -1).join(', ') + ' and ' + parts.slice(-1);
      }

      let body = `${measure} of cases`;

      if (filters.length) {
        const fp = filters.map((f) => {
          const op = this.opOf(f);
          const label = this.labelOf(f.field);
          if (!op.needsValue) return `${label} ${op.label}`;
          if (op.multi) return `${label} ${op.label} ${(f.value || []).map((v) => `“${v}”`).join(', ')}`;
          if (op.needsValue2) return `${label} ${op.label} “${f.value}” and “${f.value2}”`;
          return `${label} ${op.label} “${f.value}”`;
        });
        const joiner = this.query.match === 'any' ? ' or ' : ' and ';
        body += (filters.length > 1 && this.query.match === 'any' ? ' where at least one holds: ' : ' where ') + fp.join(joiner);
      }

      if (this.query.groupBy) {
        body += `, grouped by ${this.labelOf(this.query.groupBy)}`;
        if (this.query.groupBy2 && this.query.groupBy2 !== this.query.groupBy) body += ` and by ${this.labelOf(this.query.groupBy2)}`;
      }

      return body + '.';
    },

    /** Auto-run (debounced) on any query mutation. */
    queueRun() {
      clearTimeout(this._runTimer);
      this._runTimer = setTimeout(() => this.runCurrentQuery(), 250);
    },

    // ====================================================================
    // Natural-language query bar — pattern-based, fully local (DSGVO-safe).
    // ====================================================================
    naturalQuestion: '',
    NATURAL_EXAMPLES,

    /** Live parse of whatever the user has typed so far. Cheap — runs on
     *  every keystroke because the parser is pure regex work, no I/O. */
    get naturalParse() {
      return parseQuestion(this.naturalQuestion || '', {
        fieldDefs: FIELD_DEFS,
        numericFields: NUMERIC_FIELDS,
        groupableFields: GROUPABLE_FIELDS,
        dirOptions: DR_OPTIONS,
        schoolPresets: this.listValues('schools'),
      });
    },

    /** Put a query into the builder, run it and scroll to the result. */
    _loadAndRun(config, columns) {
      this.query = normalizeQuery(config);
      this.editingSavedQueryId = null;
      this.saveQueryName = '';
      this.queryMatches = null;
      this.matchColumns = null;
      this.runCurrentQuery();
      if (Array.isArray(columns)) this.showMatchingCases(columns);
      window.Alpine.nextTick(() => {
        const el = document.getElementById('queryResultAnchor');
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    },

    /** Push the parsed config into the existing Query Builder state and run. */
    runNaturalQuery() {
      const r = this.naturalParse;
      if (!r.understood && !this.naturalQuestion.trim()) return;
      this._loadAndRun(r.config);
    },

    setNaturalExample(text) {
      this.naturalQuestion = text;
      this.runNaturalQuery();
    },

    runPreset(id) {
      const p = this.QUERY_PRESETS.find((x) => x.id === id);
      if (!p) return;
      this._loadAndRun(p.config, p.columns);
    },

    newQuery() {
      this.query = normalizeQuery({ aggregations: [{ fn: 'count', field: null }], filters: [], groupBy: '' });
      this.editingSavedQueryId = null;
      this.saveQueryName = '';
      this.queryResult = null;
      this.queryMatches = null;
      this.matchColumns = null;
      if (this._chart) { this._chart.destroy(); this._chart = null; }
    },

    /** Result as rows for CSV / PDF. With two variables: one row per first
     *  value, one column per second value (first measure of the query). */
    _resultTable() {
      const r = this.queryResult;
      const aggs = (this.query.aggregations || []).filter((a) => a.fn === 'count' || !!a.field);
      const effectiveAggs = aggs.length ? aggs : [{ fn: 'count', field: null }];
      const num = (v) => (v == null ? '' : (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 10) / 10 : v));
      if (r.cross) {
        const tables = effectiveAggs.map((a, ai) => ({
          title: `${this.aggLabel(a)} — ${this.labelOf(r.groupBy)} × ${this.labelOf(r.groupBy2)}`,
          header: [this.labelOf(r.groupBy), ...r.cross.cols, 'All'],
          rows: r.cross.rows.map((row) => [
            row,
            ...r.cross.cols.map((col) => num(r.cross.cells[row]?.[col]?.values[ai] ?? (a.fn === 'count' ? 0 : null))),
            num(r.groups.find((g) => g.key === row)?.values[ai]),
          ]),
        }));
        return tables;
      }
      return [{
        title: '',
        header: [r.groupBy ? this.labelOf(r.groupBy) : 'Group', 'n', ...effectiveAggs.map((a) => this.aggLabel(a))],
        rows: r.groups.map((g) => [g.key, g.n, ...g.values.map(num)]),
      }];
    },

    exportQueryCSV() {
      const r = this.queryResult;
      if (!r) return;
      const lines = [[this.questionPreview]];
      for (const t of this._resultTable()) {
        lines.push([]);
        if (t.title) lines.push([t.title]);
        lines.push(t.header, ...t.rows);
      }
      const csv = lines.map((row) => row.map(csvEscape).join(';')).join('\r\n');
      downloadBlob(`cdse-query-${Date.now()}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
      audit.record({ action: 'export', user: this.user, summary: 'Query result (CSV)' });
    },

    /**
     * Export the current Query Builder result as a print-ready PDF — chart
     * (rasterised from the live Chart.js canvas) on top, data table below,
     * CDSE wordmark and the query sentence as the page title. Pops a new
     * window with the print layout and triggers the browser's print dialog
     * so the user picks 'Save as PDF' from there. No extra dependency.
     */
    exportQueryPDF() {
      const r = this.queryResult;
      if (!r) return;
      const canvas = document.getElementById('queryChart');
      const chartUrl = (canvas && canvas.width > 0) ? canvas.toDataURL('image/png') : null;
      const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
      const sentence = this.questionPreview || 'Query result';
      const fanout = r.fannedOut
        ? '<p class="caption">Multi-value variable — a case with several values is counted once for each, so the totals can exceed the number of cases.</p>'
        : '';
      const tables = this._resultTable().map((t) => `
${t.title ? `<h2>${escapeHtml(t.title)}</h2>` : ''}
<table>
  <thead><tr>${t.header.map((h) => `<th>${escapeHtml(String(h))}</th>`).join('')}</tr></thead>
  <tbody>
    ${t.rows.map((row) => `<tr>${row.map((c, i) => `<td${i === 0 ? '' : ' class="num"'}>${escapeHtml(String(c))}</td>`).join('')}</tr>`).join('')}
  </tbody>
</table>`).join('');
      const html = `<!doctype html><html><head><meta charset="utf-8">
<title>CDSE Statistics — ${escapeHtml(sentence)}</title>
<style>
  @page { margin: 20mm 18mm; size: A4 portrait; }
  body { font-family: Inter, "Segoe UI", system-ui, -apple-system, sans-serif; color: #0E1628; font-size: 12px; }
  header { display:flex; align-items:center; gap:12px; padding-bottom:12px; border-bottom:2px solid #2E3A9C; margin-bottom:18px; }
  .mark { width:34px;height:34px;border-radius:9px;background:#2E3A9C;color:#fff;
          display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;letter-spacing:.02em; }
  .brand-title { font-size:17px;font-weight:700;line-height:1.1;margin:0; }
  .brand-sub { font-size:10px;color:#586277;margin-top:2px; }
  h1 { font-size:17px;margin:6px 0 4px 0;font-weight:600;line-height:1.3; }
  h2 { font-size:12px;margin:18px 0 4px 0;font-weight:600;color:#2E3A9C; }
  .meta { font-size:11px;color:#586277;margin-bottom:16px; }
  .chart-wrap { text-align:center;margin:6px 0 14px 0; }
  .chart-wrap img { max-width:100%;height:auto; }
  table { width:100%;border-collapse:collapse;font-size:11px;margin-top:6px; }
  th, td { text-align:left;padding:5px 7px;border-bottom:1px solid #E2E6EC; }
  th { background:#F3F5F9;font-weight:600;color:#586277;font-size:10px; }
  td.num, th:not(:first-child) { text-align:right; }
  td.num { font-variant-numeric: tabular-nums; }
  .caption { font-size:10px;color:#586277;font-style:italic;margin:6px 0 0 0; }
  footer { margin-top:24px;padding-top:8px;border-top:1px solid #E2E6EC;
           font-size:10px;color:#586277;display:flex;justify-content:space-between; }
  @media print { .no-print { display:none !important; } }
  .no-print { text-align:right;margin:0 0 16px 0; }
  .no-print button { font:inherit;background:#2E3A9C;color:#fff;border:0;padding:8px 14px;border-radius:6px;cursor:pointer; }
</style></head><body>
<div class="no-print"><button onclick="window.print()">Print / save as PDF</button></div>
<header>
  <div class="mark">CDSE</div>
  <div>
    <div class="brand-title">CDSE Statistics</div>
    <div class="brand-sub">Centre pour le développement socio-émotionnel · Luxembourg</div>
  </div>
</header>
<h1>${escapeHtml(sentence.charAt(0).toUpperCase() + sentence.slice(1))}</h1>
<div class="meta">${r.n} matching case(s) · generated ${today}</div>
${chartUrl ? `<div class="chart-wrap"><img src="${chartUrl}" alt="Chart"/></div>` : ''}
${fanout}
${tables}
<footer>
  <span>CDSE — Statistics · internal use only</span>
  <span>${today}</span>
</footer>
<script>window.addEventListener('load', () => setTimeout(() => window.print(), 250));<\/script>
</body></html>`;
      const w = window.open('', '_blank');
      if (!w) {
        this.notify('Pop-up blocked. Allow pop-ups for this page to export PDF.', 'err');
        return;
      }
      w.document.open();
      w.document.write(html);
      w.document.close();
      audit.record({ action: 'export', user: this.user, summary: `Query result (PDF) — ${sentence}` });
    },

    // ====================================================================
    // Import / Export
    // ====================================================================
    async exportAllJSON() {
      const all = await cases.exportAll();
      downloadBlob(`cdse-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(all, null, 2), 'application/json');
      await audit.record({ action: 'export', user: this.user, summary: `Full JSON — ${all.length} cases` });
      this.notify(`${all.length} cases exported.`);
    },

    async exportAllCSV() {
      const all = await cases.exportAll();
      const cols = getEditableFields().map((f) => f.key);
      const header = ['id', ...cols, 'age', 'created_at', 'updated_at'];
      const rows = all.map((r) => [r.id, ...cols.map((k) => r[k]), r.age, r.created_at, r.updated_at]);
      const csv = [header, ...rows].map((row) => row.map(csvEscape).join(';')).join('\n');
      downloadBlob(`cdse-cases-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
      await audit.record({ action: 'export', user: this.user, summary: `Full CSV — ${all.length} cases` });
      this.notify(`${all.length} cases exported.`);
    },

    // ====================================================================
    // Excel-compatible backup
    // ====================================================================
    // The format is a UTF-8 BOM + semicolon-delimited CSV — opens in Excel
    // (continental locale) on double-click without an Import Wizard. Headers
    // use the human FIELD_DEFS labels (not bare keys), and multi-tag fields
    // are joined with '; ' so they stay readable in a cell.
    //
    // Filenames carry a YYYY-MM-DD-HHMM timestamp so successive backups
    // accumulate side by side instead of overwriting each other. Each sync
    // export auto-triggers a backup; a standalone button in Settings does
    // the same on demand. lastBackupAt is tracked in localStorage so we can
    // remind staff if they have not backed up recently.

    _buildBackupCSV(cases) {
      const editable = getEditableFields();
      const headerKeys   = ['id', ...editable.map((f) => f.key), 'age', 'created_at', 'updated_at'];
      const headerLabels = ['ID', ...editable.map((f) => f.label || f.key), 'Age', 'Created at', 'Updated at'];
      const rows = cases.map((r) => headerKeys.map((k) => {
        const v = r[k];
        if (Array.isArray(v)) return v.join('; ');  // tags → "F90.0; F84.0"
        if (v === null || v === undefined) return '';
        return v;
      }));
      const csv = [headerLabels, ...rows].map((row) => row.map(csvEscape).join(';')).join('\r\n');
      return '﻿' + csv;  // UTF-8 BOM, Excel-friendly
    },

    _backupFilename() {
      const d = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      return `cdse-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.csv`;
    },

    async downloadExcelBackup() {
      const all = await cases.exportAll();
      const csv = this._buildBackupCSV(all);
      const filename = this._backupFilename();
      downloadBlob(filename, csv, 'text/csv;charset=utf-8');
      try { localStorage.setItem('cdse_last_backup_v1', new Date().toISOString()); } catch { /* quota */ }
      this.lastBackupAt = new Date().toISOString();
      await audit.record({ action: 'export', user: this.user, summary: `Excel backup — ${filename}, ${all.length} cases` });
      this.notify(`Backup saved: ${filename} (${all.length} cases).`);
    },

    /** Human-readable 'X days ago' / 'today' for the banner + Settings panel. */
    lastBackupDisplay() {
      const t = this.lastBackupAt;
      if (!t) return 'never';
      try {
        const ms = Date.now() - new Date(t).getTime();
        const days = Math.floor(ms / 86400000);
        if (days <= 0) return 'today';
        if (days === 1) return 'yesterday';
        if (days < 30) return `${days} days ago`;
        return new Date(t).toLocaleDateString('en-GB');
      } catch { return t; }
    },

    /** How many days since the last backup (∞ when never). */
    get backupAgeDays() {
      if (!this.lastBackupAt) return Infinity;
      try { return Math.floor((Date.now() - new Date(this.lastBackupAt).getTime()) / 86400000); }
      catch { return Infinity; }
    },

    get backupReminderVisible() {
      // Show the banner when there is data to back up AND no fresh backup.
      // 7 days is the threshold for the first nudge.
      return (this.allCases?.length || 0) > 0 && this.backupAgeDays >= 7;
    },

    // -- Import: Excel / CSV / JSON --------------------------------------
    // Excel and CSV go through a column-assignment step: every column of the
    // sheet is matched to a field (best guess first, the user can change it),
    // then values are converted (dates, sex, DR, measures …) and previewed.
    // Everything happens in this browser — the file is never uploaded.
    async onImportFile(ev) {
      this.importError = '';
      this.importStep = '';
      const file = ev.target.files?.[0];
      ev.target.value = '';
      if (!file) return;
      this.importBusy = true;
      try {
        if (file.name.toLowerCase().endsWith('.json')) {
          let records = JSON.parse(await file.text());
          if (records && records.format === 'cdse-sync-v1' && Array.isArray(records.cases)) records = records.cases;
          if (!Array.isArray(records)) throw new Error('The JSON must be a list of cases (an export of this tool).');
          this.importSheet = null;
          await this._prepareImportPreview(records, file.name, [], 0);
        } else {
          const { sheets } = await readSpreadsheet(file);
          const best = sheets.reduce((bi, sh, i) => (sh.rows.length > sheets[bi].rows.length ? i : bi), 0);
          this.importSheet = { fileName: file.name, sheets, sheetIdx: best, mapping: guessMapping(sheets[best].headers) };
          this.importStep = 'map';
        }
      } catch (e) {
        this.importError = e.message || String(e);
      }
      this.importBusy = false;
    },

    get importCurrentSheet() {
      const s = this.importSheet;
      return s ? s.sheets[s.sheetIdx] || s.sheets[0] : null;
    },
    onImportSheetChange() {
      const sh = this.importCurrentSheet;
      if (sh) this.importSheet.mapping = guessMapping(sh.headers);
    },
    /** A few example values of a column, so the user recognises it. */
    importExamples(col) {
      const sh = this.importCurrentSheet;
      if (!sh) return '';
      const out = [];
      for (const row of sh.rows) {
        let v = row[col];
        if (v && typeof v === 'object' && 'excelDate' in v) v = toIsoDate(v) || '';
        v = String(v ?? '').trim();
        if (v && !out.includes(v)) out.push(v.length > 28 ? v.slice(0, 26) + '…' : v);
        if (out.length >= 3) break;
      }
      return out.join(' · ');
    },
    get importTargetsByCategory() {
      return groupFieldsByCategory(IMPORT_TARGETS);
    },
    get importMappedCount() {
      return (this.importSheet?.mapping || []).filter(Boolean).length;
    },
    /** A field chosen for two columns — only allowed for multi-value fields. */
    importDuplicate(col) {
      const m = this.importSheet?.mapping || [];
      const k = m[col];
      if (!k || getField(k)?.type === 'tags') return false;
      return m.indexOf(k) !== col;
    },
    async confirmImportMapping() {
      const sh = this.importCurrentSheet;
      if (!sh) return;
      const mapping = [...this.importSheet.mapping];
      if (!mapping.some(Boolean)) { this.importError = 'Assign at least one column to a field.'; return; }
      // A second column for the same single-value field is ignored
      mapping.forEach((k, i) => { if (this.importDuplicate(i)) mapping[i] = ''; });
      this.importError = '';
      const { records, problems, skipped } = convertRows(sh.rows, mapping);
      await this._prepareImportPreview(records, `${this.importSheet.fileName} — ${sh.name}`, problems, skipped);
    },
    backToImportMapping() { this.importStep = this.importSheet ? 'map' : ''; },

    /** Count what the import will do. A row without National ID is matched to
     *  an existing case by last name + first name + date of birth. */
    async _prepareImportPreview(records, fileName, problems, skipped) {
      const existing = await cases.list();
      const byMatricule = new Map(existing.filter((c) => c.matricule).map((c) => [String(c.matricule), c]));
      const nameKey = (c) => [c.nom, c.prenom, c.date_naissance].map((x) => String(x || '').trim().toLowerCase()).join('|');
      const byName = new Map(existing.filter((c) => c.nom && c.prenom && c.date_naissance).map((c) => [nameKey(c), c]));
      // The same pupil on several rows (e.g. one row per measure) → one case
      const merged = [];
      const seen = new Map();
      let mergedRows = 0;
      for (const r of records) {
        const k = r.matricule ? 'id:' + String(r.matricule).trim()
          : (r.nom && r.prenom && r.date_naissance ? 'name:' + nameKey(r) : null);
        if (k && seen.has(k)) { mergeImportRow(merged[seen.get(k)], r); mergedRows++; continue; }
        if (k) seen.set(k, merged.length);
        merged.push({ ...r });
      }
      let willAdd = 0, willConflict = 0, noId = 0, noName = 0;
      const prepared = merged.map((r) => {
        const rec = { ...r };
        if (rec.matricule != null) rec.matricule = String(rec.matricule).trim();
        let match = rec.matricule ? byMatricule.get(rec.matricule) : null;
        if (!match && !rec.matricule && rec.nom && rec.prenom && rec.date_naissance) match = byName.get(nameKey(rec)) || null;
        if (match && !rec.id) rec.id = match.id;
        if (match) willConflict++; else willAdd++;
        if (!rec.matricule && !match) noId++;
        if (!rec.nom || !rec.prenom) noName++;
        return rec;
      });
      const cols = ['matricule', 'nom', 'prenom', 'sexe', 'date_naissance', 'dir', 'ecole_lycee', 'mesure_cdse_1']
        .filter((k) => prepared.some((r) => hasValue(r[k])));
      const extra = [...new Set(prepared.flatMap((r) => Object.keys(r)))].filter((k) => getField(k) && !cols.includes(k)).slice(0, Math.max(0, 9 - cols.length));
      this.importPreview = {
        records: prepared, fileName, willAdd, willConflict, noId, noName, mergedRows,
        problems: problems || [], skipped: skipped || 0,
        columns: [...cols, ...extra],
        sample: prepared.slice(0, 6),
        fromSheet: !!(this.importSheet && fileName.startsWith(this.importSheet.fileName)),
      };
      this.importStep = 'preview';
    },

    async runImport() {
      if (!this.importPreview) return;
      const run = async () => {
        const summary = await cases.importAll(this.importPreview.records, this.importMode);
        await audit.record({
          action: 'import',
          user: this.user,
          summary: `Import (${this.importMode}) from ${this.importPreview.fileName} — ${summary.added} added, ${summary.updated} updated, ${summary.skipped} skipped`,
        });
        this.notify(`Import: ${summary.added} added · ${summary.updated} updated · ${summary.skipped} skipped`);
        this.importStep = '';
        await this.refreshAll();
      };
      if (this.importMode === 'replace') this.ask('Replace deletes every case in this browser and loads the file instead. Continue?', run);
      else await run();
    },

    cancelImport() { this.importStep = ''; this.importError = ''; },

    // ====================================================================
    // Audit
    // ====================================================================
    get filteredAudit() {
      return this.auditEntries.filter((e) => {
        if (this.auditFilter.user && !(e.user || '').toLowerCase().includes(this.auditFilter.user.toLowerCase())) return false;
        if (this.auditFilter.action && e.action !== this.auditFilter.action) return false;
        return true;
      });
    },

    formatTs(iso) {
      if (!iso) return '—';
      try {
        const d = new Date(iso);
        return d.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      } catch { return iso; }
    },

    // ====================================================================
    // Settings
    // ====================================================================
    // -- Lists (schools, ateliers, rééducation types) --------------------
    loadLists() {
      try { this.listsState = lists ? lists.all() : { schools: null, ateliers: null, reeducation: null }; }
      catch { this.listsState = { schools: null, ateliers: null, reeducation: null }; }
      for (const m of LIST_META) this.listDraft[m.key] = this.listValues(m.key).join('\n');
    },
    listDraftCount(key) {
      return String(this.listDraft[key] || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean).length;
    },
    listChanged(key) {
      return this.listDraft[key] !== this.listValues(key).join('\n');
    },
    async saveList(key) {
      if (!lists) return;
      const meta = LIST_META.find((m) => m.key === key);
      const values = String(this.listDraft[key] || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
      const before = this.listValues(key);
      const saved = lists.set(key, values);
      this.listsState = { ...this.listsState, [key]: saved };
      this.listDraft[key] = saved.join('\n');
      const added = saved.filter((v) => !before.includes(v)).length;
      const removed = before.filter((v) => !saved.includes(v)).length;
      await audit.record({ action: 'settings', user: this.user, summary: `List “${meta?.label || key}” saved — ${saved.length} entries (+${added} / −${removed})` });
      this.notify(`List saved: ${saved.length} entries.`);
    },
    /** Add every value already typed in the cases to the list draft. */
    addUsedValuesToList(key) {
      const meta = LIST_META.find((m) => m.key === key);
      if (!meta) return;
      const cur = String(this.listDraft[key] || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
      const seen = new Set(cur.map((x) => x.toLowerCase()));
      const found = [];
      for (const c of this.allCases) {
        for (const f of meta.fields) {
          const v = String(c[f] || '').trim();
          if (v && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); found.push(v); }
        }
      }
      found.sort((a, b) => a.localeCompare(b, 'fr'));
      this.listDraft[key] = [...cur, ...found].join('\n');
      this.notify(found.length ? `${found.length} value(s) from the cases added — check them, then Save.` : 'No other values found in the cases.');
    },
    resetListDraft(key) {
      this.listDraft[key] = (DEFAULT_LISTS[key] || []).join('\n');
    },

    // -- Clean up: replace an old or misspelt value in every case ---------
    get cleanupFieldDef() { return getField(this.cleanupField); },
    async loadCleanup() {
      const def = getField(this.cleanupField);
      const rows = await cases.rawValueCounts(this.cleanupField);
      const known = this.cleanupKnownValues(def);
      this.cleanupValues = rows.map((r) => ({
        ...r,
        known: known.includes(r.value),
        mappedTo: this.cleanupField === 'dir' ? (DIR_LEGACY_MAP[r.value] || null) : null,
      }));
      const targets = {};
      for (const r of this.cleanupValues) targets[r.value] = r.mappedTo || '';
      this.cleanupTargets = targets;
      this.cleanupLoaded = true;
    },
    /** The values that count as correct for a field (its choices or its list). */
    cleanupKnownValues(def) {
      if (!def) return [];
      if (def.type === 'select') return def.options || [];
      if (def.listKey) return this.listValues(def.listKey);
      const presets = presetsForField(def.key);
      return presets.length ? presets : [];
    },
    cleanupNote(r) {
      if (r.mappedTo) return `old DIR name — already shown as “${r.mappedTo}”; replace to store it that way`;
      const def = getField(this.cleanupField);
      if (r.known) return '';
      if (def?.type === 'select') return this.cleanupField === 'dir' ? 'old DIR name — pick the right Direction de région' : 'no longer one of the choices';
      if (def?.listKey) return 'not in the list (Settings → Lists)';
      return presetsForField(this.cleanupField).length ? 'not one of the suggestions' : '';
    },
    cleanupChoices() {
      const def = getField(this.cleanupField);
      const known = this.cleanupKnownValues(def);
      const used = this.cleanupValues.map((r) => r.value);
      return [...new Set([...known, ...used])];
    },
    applyCleanup(from) {
      const to = String(this.cleanupTargets[from] ?? '').trim();
      if (to === from) { this.notify('Pick a different value first.', 'err'); return; }
      const def = getField(this.cleanupField);
      const n = this.cleanupValues.find((r) => r.value === from)?.n || 0;
      const what = to ? `“${from}” → “${to}”` : `remove “${from}”`;
      this.ask(`${def?.label || this.cleanupField}: ${what} in ${n} case(s)?`, async () => {
        const before = new Map(this.allCases.map((c) => [c.id, c]));
        const ids = await cases.replaceValue(this.cleanupField, from, to);
        for (const id of ids) {
          const b = before.get(id);
          await audit.record({
            action: 'update', caseId: id, user: this.user,
            summary: `Clean up — ${b ? `${b.prenom || ''} ${b.nom || ''}`.trim() : id}: ${def?.label || this.cleanupField} ${what}`,
            changes: { [this.cleanupField]: { from, to } },
          });
        }
        await this.refreshAll();
        await this.loadCleanup();
        this.notify(`${ids.length} case(s) updated.`);
      });
    },

    hideWhatsNew() {
      this.whatsNewHidden = true;
      try { localStorage.setItem('cdse_whatsnew_v2', 'hidden'); } catch { /* private mode */ }
    },

    async wipeAll() {
      this.ask('Erase everything? This cannot be undone. Export a backup first.', async () => {
        localStorage.removeItem('cdse_cases_v1');
        localStorage.removeItem('cdse_vocab_v1');
        localStorage.removeItem('cdse_saved_queries_v1');
        localStorage.removeItem('cdse_audit_v1');
        localStorage.removeItem('cdse_demo_ids_v1');
        localStorage.removeItem('cdse_lists_v1');
        this.loadLists();
        await this.refreshAll();
        this.notify('Data erased.', 'err');
      });
    },

    /** Are there any demo records currently in the database? */
    get hasDemoData() {
      try {
        const raw = localStorage.getItem('cdse_demo_ids_v1');
        const ids = raw ? JSON.parse(raw) : [];
        return Array.isArray(ids) && ids.length > 0;
      } catch { return false; }
    },

    async loadSample() {
      if (this.hasDemoData) {
        this.notify('Demo cases are already loaded.', 'err');
        return;
      }
      this.ask('Load 20 fictional demo cases?', async () => {
        const seed = sampleData();
        const ids = [];
        // create one by one so we get the assigned ids back
        for (const s of seed) {
          const created = await cases.create(s);
          ids.push(created.id);
          await audit.record({ action: 'create', user: this.user, caseId: created.id, summary: `[demo] ${s.prenom} ${s.nom}` });
        }
        localStorage.setItem('cdse_demo_ids_v1', JSON.stringify(ids));
        await this.refreshAll();
        this.notify(`${seed.length} fictional cases loaded.`);
      });
    },

    async removeSample() {
      if (!this.hasDemoData) return;
      this.ask('Remove all demo cases? Your real cases are not affected.', async () => {
        let ids = [];
        try { ids = JSON.parse(localStorage.getItem('cdse_demo_ids_v1') || '[]'); } catch {}
        let removed = 0;
        for (const id of ids) {
          const ok = await cases.delete(id);
          if (ok) {
            removed++;
            await audit.record({ action: 'delete', caseId: id, user: this.user, summary: `[demo removed]` });
          }
        }
        localStorage.removeItem('cdse_demo_ids_v1');
        await this.refreshAll();
        this.notify(`${removed} demo case(s) removed.`);
      });
    },

    changeUser() {
      sessionUser.clear();
      this.user = '';
      this.showUserPrompt = true;
    },

    // ====================================================================
    // Shortcuts
    // ====================================================================
    handleShortcut(e) {
      // Esc closes spotlight regardless of modifier
      if (e.key === 'Escape' && this.spotlight.open) {
        e.preventDefault();
        this.closeSpotlight();
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const target = e.target;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
      if (mod && e.key === 'k') {
        e.preventDefault();
        this.openSpotlight();
      }
      if (mod && e.key === 'n' && !isInput) {
        e.preventDefault();
        this.startCreate();
      }
    },

    // ====================================================================
    // Global search (spotlight)
    // ====================================================================
    openSpotlight() {
      this.spotlight = { open: true, query: '', results: this.computeSpotlight(''), activeIdx: 0 };
      window.Alpine.nextTick(() => document.getElementById('spotlightInput')?.focus());
    },
    closeSpotlight() {
      this.spotlight.open = false;
    },
    onSpotlightInput() {
      this.spotlight.results = this.computeSpotlight(this.spotlight.query);
      this.spotlight.activeIdx = 0;
    },
    onSpotlightKey(e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.spotlight.activeIdx = Math.min(this.spotlight.activeIdx + 1, this.spotlight.results.length - 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.spotlight.activeIdx = Math.max(this.spotlight.activeIdx - 1, 0);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const r = this.spotlight.results[this.spotlight.activeIdx];
        if (r) this.pickSpotlight(r);
      }
    },
    computeSpotlight(q) {
      const needle = (q || '').trim().toLowerCase();
      if (!needle) return this.allCases.slice(0, 12);
      const scored = [];
      for (const c of this.allCases) {
        const hay = [
          c.nom, c.prenom, c.matricule, c.dossier_mfile, c.ecole_lycee, c.dir,
          ...(c.diagnostics || []), ...(c.verdachtsdiagnosen_profil || []),
        ].filter(Boolean).join(' ').toLowerCase();
        const idx = hay.indexOf(needle);
        if (idx >= 0) scored.push({ c, score: idx });
      }
      scored.sort((a, b) => a.score - b.score);
      return scored.slice(0, 20).map((s) => s.c);
    },
    pickSpotlight(c) {
      this.closeSpotlight();
      this.showDetail(c.id);
    },
  };
}

/** Merge a second sheet row of the same pupil into the first: lists are
 *  combined, the measures fill the three slots, empty values are filled in. */
function mergeImportRow(into, row) {
  const slots = ['mesure_cdse_1', 'mesure_cdse_2', 'mesure_cdse_3'];
  const measures = [...slots.map((k) => into[k]), ...slots.map((k) => row[k])].filter(Boolean);
  for (const [k, v] of Object.entries(row)) {
    if (slots.includes(k)) continue;
    if (Array.isArray(v)) into[k] = [...new Set([...(Array.isArray(into[k]) ? into[k] : []), ...v])];
    else if (!hasValue(into[k]) && hasValue(v)) into[k] = v;
  }
  const distinct = [...new Set(measures)];
  slots.forEach((k, i) => { if (distinct[i]) into[k] = distinct[i]; });
}

/** Fields grouped by form section, for the grouped <select>s. */
function groupFieldsByCategory(fields) {
  const out = [];
  for (const cat of CATEGORIES) {
    const list = fields.filter((f) => f.category === cat.key);
    if (list.length) out.push({ key: cat.key, label: cat.computedOnly ? 'Measures and durations (calculated)' : cat.label, fields: list });
  }
  return out;
}

// ----------------------------------------------------------------------------
// chart helpers
// ----------------------------------------------------------------------------
const CHART_FONT = 'Inter, "Segoe UI", system-ui, sans-serif';

function chartOptions(theme) {
  const text = theme === 'dark' ? '#DCE1EA' : '#0E1628';
  const grid = theme === 'dark' ? 'rgba(220,225,234,0.08)' : 'rgba(14,22,40,0.07)';
  return {
    responsive: true,
    maintainAspectRatio: false,
    // No animations — they run asynchronously and lose draw cycles when a
    // chart is destroyed while still animating in (which happens whenever a
    // user clicks two presets in succession in the Query Builder).
    animation: false,
    animations: { colors: false, x: false, y: false },
    transitions: { active: { animation: { duration: 0 } } },
    plugins: {
      legend: { labels: { color: text, font: { family: CHART_FONT } } },
      tooltip: { titleFont: { family: CHART_FONT }, bodyFont: { family: CHART_FONT } },
    },
    scales: {
      x: { ticks: { color: text, font: { family: CHART_FONT }, precision: 0 }, grid: { color: grid } },
      y: { ticks: { color: text, font: { family: CHART_FONT }, precision: 0 }, grid: { color: grid }, beginAtZero: true },
    },
  };
}

/** Shorten a label for narrow horizontal-bar axes — prefer the parenthesised
 *  acronym if present (e.g. "Lycée Aline Mayrisch (LAML)" → "LAML"), then
 *  fall back to the first ICD code in a diagnostic string, then to ellipsis. */
function shortLabelOf(s) {
  if (!s || typeof s !== 'string') return s;
  // Diagnostic strings like "F90.0 — TDAH, type inattention" → keep the code
  const codeMatch = s.match(/^([A-Z]\d{2}(?:\.\d)?)\s*[—-]/);
  if (codeMatch) return codeMatch[1];
  // Acronym in parens
  const acro = s.match(/\(([^)]+)\)/);
  if (acro) return acro[1];
  if (s.length <= 22) return s;
  return s.slice(0, 20) + '…';
}

/** Split a long label into at most two lines for the chart axis, so full
 *  school names stay readable (Chart.js draws an array as several lines). */
function wrapLabel(text, max = 26) {
  const words = String(text || '').split(/\s+/);
  const lines = [''];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if (!cur) lines[lines.length - 1] = w;
    else if ((cur + ' ' + w).length <= max) lines[lines.length - 1] = cur + ' ' + w;
    else lines.push(w);
  }
  if (lines.length <= 2) return lines.length === 1 ? lines[0] : lines;
  const second = lines.slice(1).join(' ');
  return [lines[0], second.length > max ? second.slice(0, max - 1) + '…' : second];
}

function countBy(items, keyFn) {
  const out = {};
  for (const it of items) {
    const k = keyFn(it);
    if (!k) continue;
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

function topEntries(obj, n) {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);
}

function histogram(values, nBins = 10) {
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [{ from: min, to: max, count: values.length }];
  const step = (max - min) / nBins;
  const bins = Array.from({ length: nBins }, (_, i) => ({
    from: min + i * step,
    to: min + (i + 1) * step,
    count: 0,
  }));
  for (const v of values) {
    let idx = Math.floor((v - min) / step);
    if (idx >= nBins) idx = nBins - 1;
    bins[idx].count++;
  }
  return bins;
}

// ----------------------------------------------------------------------------
// Sample data — clearly fictive
// ----------------------------------------------------------------------------
function sampleData() {
  // Clearly fictional demo set: enough variation for every chart, the
  // durations and the two-variable queries. Names are obviously synthetic;
  // ateliers and rééducation types are placeholders ("Demo atelier A").
  const lycees = [
    'Lycée Aline Mayrisch (LAML)',
    'Lënster Lycée International School — Junglinster (LLIS)',
    'Lycée Classique de Diekirch (LCD)',
    'Lycée Hubert-Clément (LHCE) — Esch',
    'Lycée Technique du Centre',
    'Athénée de Luxembourg',
  ];
  const places = ['Luxembourg', 'Mamer', 'Pétange', 'Differdange', 'Sanem', 'Esch-sur-Alzette', 'Dudelange', 'Bettembourg',
    'Remich', 'Grevenmacher', 'Echternach', 'Mersch', 'Redange', 'Diekirch', 'Wiltz'];
  const langs = ['LU', 'FR', 'PT', 'DE', 'LU', 'EN', 'Other'];
  const diags = [
    ['F90.0 — ADHD, predominantly inattentive'],
    ['F84.0 — Childhood autism'],
    ['F90.1 — ADHD, combined type', 'F32.0 — Mild depressive episode'],
    [],
    ['F32.1 — Moderate depressive episode'],
    ['F41.1 — Generalized anxiety'],
    ['F90.0 — ADHD, predominantly inattentive', 'F81.0 — Dyslexia'],
    ['F43.2 — Adjustment disorders'],
    ['F93.0 — Separation anxiety'],
    [],
  ];
  const profils = [
    ['Behavioural disorder'], ['Emotional profile'], ['Suspected ADHD'], [],
    ['School refusal / school phobia'], ['Social difficulties'], ['Mixed profile'],
  ];
  const services = [
    [], ['ONE — Office National de l\'Enfance'], [], ['SePAS — Service psycho-social et d\'accompagnement scolaires'],
    ['ALUPSE — Aide aux victimes de maltraitance'], [], ['Maison Relais'],
  ];
  // Measures per case (the first three also go into the three slots)
  const plans = [
    ['ISA'], ['DS', 'ISA'], ['C&G'], ['ISA', 'C&G'], ['Atelier'], ['DS', 'Rééducation'],
    ['CST'], ['Annexe'], ['CdP'], ['ISA', 'Atelier'], ['DS', 'ISA', 'C&G'], ['CST', 'C&G'],
    ['Rééducation', 'Atelier'], ['ISA'], ['DS'], ['CdP', 'C&G'], ['Annexe', 'ISA'], ['ISA', 'Other'],
    ['C&G', 'Rééducation'], ['DS', 'CST'],
  ];

  const today = new Date();
  const isoOf = (d) => d.toISOString().slice(0, 10);
  const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return isoOf(d); };
  const daysAhead = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return isoOf(d); };
  const birth = (age, i) => `${today.getFullYear() - age - 1}-${String((i % 12) + 1).padStart(2, '0')}-${String((i * 3 % 27) + 1).padStart(2, '0')}`;

  const result = [];
  for (let i = 1; i <= 20; i++) {
    const sexe = ['F', 'M', 'M', 'F', 'M'][i % 5];
    const age = 7 + (i * 7) % 10;                   // 7 … 16
    const secondary = age >= 13;
    const dr = DR_OPTIONS[(i * 4) % DR_OPTIONS.length];
    const plan = plans[i - 1];
    const rec = {
      matricule: String(2010000000000 + i),
      dossier_mfile: `MF-${1000 + i}`,
      nom: `Test ${String.fromCharCode(64 + i)}`,
      prenom: `Pupil ${i}`,
      sexe,
      date_naissance: birth(age, i),
      dir: secondary ? '' : dr,
      ecole_lycee: secondary ? lycees[i % lycees.length] : `École fondamentale ${places[DR_OPTIONS.indexOf(dr)]} (demo)`,
      school_type: i % 9 === 0 ? 'Privé' : 'Public',
      mesure_cdse_1: plan[0] || '',
      mesure_cdse_2: plan[1] || '',
      mesure_cdse_3: plan[2] || '',
      iq: 72 + ((i * 7) % 50),
      langue_1: langs[i % langs.length],
      parents: ['Together', 'Separated', 'Together', 'Other'][i % 4],
      scas: i % 3 === 0 ? 'Yes' : 'No',
      tutelle: i % 5 === 0 ? ['Mother', 'Foyer'] : (i % 4 === 0 ? ['Father'] : ['Both parents']),
      mesures_famille: i % 6 === 0 ? ['Assistance familiale (ONE)', 'Suivi SCAS'] : (i % 4 === 0 ? ['Aide éducative en milieu ouvert (AEMO)'] : []),
      scol_etranger: i % 7 === 0 ? 'Yes' : 'No',
      diagnostics: diags[i % diags.length],
      verdachtsdiagnosen_profil: profils[i % profils.length],
      autres_services: services[i % services.length],
      autres_cc: i % 4 === 1 ? [CC_OPTIONS[(i >> 2) % CC_OPTIONS.length]] : (i % 6 === 0 ? [CC_OPTIONS[5], CC_OPTIONS[0]] : []),
    };
    if (rec.langue_1 === 'Other') rec.langue_1_autre = 'Albanian';
    if (rec.parents === 'Other') rec.parents_autre = 'Lives with the grandparents';

    // Dates: some measures ended, most still running, a few ending soon
    const s = 90 + (i * 23) % 500;                   // days since the start
    for (const m of plan) {
      if (m === 'DS') { rec.date_ds = daysAgo(s + 40); rec.ds_realise_par = 'Fictional staff A'; }
      if (m === 'ISA') { rec.debut_isa = daysAgo(s); rec.fin_isa = i % 4 === 0 ? daysAgo(20) : (i % 5 === 0 ? daysAhead(20) : ''); rec.isa_realise_par = 'Fictional staff B'; }
      if (m === 'C&G') { rec.debut_cg = daysAgo(s + 30); rec.fin_cg = i % 3 === 0 ? daysAgo(15) : ''; rec.cg_type = CG_TYPES[i % CG_TYPES.length]; rec.cg_realise_par = 'Fictional staff C'; }
      if (m === 'Atelier') { rec.debut_atelier = daysAgo(s - 30); rec.fin_atelier = i % 2 === 0 ? daysAhead(60) : ''; rec.atelier_type = i % 2 ? 'Demo atelier A' : 'Demo atelier B'; rec.atelier_realise_par = 'Fictional staff D'; }
      if (m === 'Rééducation') { rec.debut_reeducation = daysAgo(s - 20); rec.fin_reeducation = i % 3 === 0 ? daysAgo(5) : ''; rec.reeducation_type = i % 2 ? 'Demo rééducation A' : 'Demo rééducation B'; rec.reeducation_realise_par = 'Fictional staff E'; }
      if (m === 'Annexe') { rec.debut_annexe = daysAgo(s + 200); rec.fin_annexe = ''; }
      if (m === 'CST') { rec.debut_cst = daysAgo(s + 150); rec.fin_cst = i % 2 === 0 ? daysAgo(30) : ''; rec.cst_groupe = CST_GROUPS[i % CST_GROUPS.length]; }
      if (m === 'CdP') { rec.debut_cdp = daysAgo(s + 120); rec.fin_cdp = ''; rec.cdp_region = dr; }
      if (m === 'Other') { rec.autre_mesure = 'Demo other measure'; rec.debut_autre_mesure = daysAgo(s); }
    }
    // ELDiB for most pupils with an ISA, Annexe, CST or CdP
    if (plan.some((m) => ['ISA', 'Annexe', 'CST', 'CdP'].includes(m))) {
      rec.eldib_date = daysAgo(30 + (i * 11) % 200);
      rec.eldib_v = String(1 + (i % 4));
      rec.eldib_k = String(1 + ((i + 1) % 4));
      rec.eldib_soz = String(1 + ((i + 2) % 3));
      rec.eldib_kog = String(2 + (i % 3));
    }
    result.push(rec);
  }
  return result;
}

// ----------------------------------------------------------------------------
// Register with Alpine. Going through Alpine.data() gives methods proper
// access to magic accessors ($watch, $nextTick) via `this`. We register on
// alpine:init if Alpine isn't loaded yet, or immediately if it is.
// ----------------------------------------------------------------------------
function registerCdseApp() {
  if (window.Alpine && window.Alpine.data) {
    window.Alpine.data('cdseApp', makeApp);
    console.log('CDSE: registered via Alpine.data()');
  }
}
if (window.Alpine) {
  registerCdseApp();
} else {
  document.addEventListener('alpine:init', registerCdseApp);
}
