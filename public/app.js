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
} from './fields.js';

import {
  cases,
  audit,
  vocab,
  savedQueries,
  sessionUser,
} from './repository.js';

import {
  runQuery,
  filterRecords,
  NUMERIC_FIELDS,
  GROUPABLE_FIELDS,
  FILTERABLE_FIELDS,
  AGGREGATIONS,
  operatorsFor,
  formatNumber,
} from './query-engine.js';

import { presetsForField } from './presets.js';

// ----------------------------------------------------------------------------

const VOCAB_HINT_BY_FIELD = {
  ecole_lycee: 'ecoles',
  ds_realise_par: 'staff',
  isa_realise_par: 'staff',
  cg_realise_par: 'staff',
  scolarisation_specialisee: 'institutions',
  autre_cc_implique: 'staff',
  diagnostics: 'diagnostics',
  verdachtsdiagnosen_profil: 'verdachts',
  autres_services: 'autres_services',
};

const LIST_DEFAULT_COLUMNS = [
  'matricule', 'nom', 'prenom', 'sexe', 'age', 'dir', 'ecole_lycee',
  'mesure_cdse_1', 'iq',
];

// Fields shown by default in the form's "Essentials" block. New cases start
// with only these visible; everything else lives behind a "Show all fields"
// toggle. Picked to cover what staff almost always know at first contact.
const ESSENTIAL_FIELD_KEYS = new Set([
  'matricule', 'nom', 'prenom',
  'sexe', 'date_naissance',
  'dir', 'ecole_lycee',
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
    quickFilters: { dir: '', sexe: '', mesure_cdse_1: '', ecole_lycee: '' },
    sortField: 'updated_at',
    sortDir: 'desc',
    visibleColumns: [...LIST_DEFAULT_COLUMNS],
    columnPickerOpen: false,

    // -- form view --------------------------------------------------------
    formMode: 'create',
    formData: blankCase(),
    formErrors: {},
    editingId: null,
    formCategoryOpen: {},
    tagDraft: {},
    showAdvanced: false,
    draftSaved: false,        // user-visible 'Draft saved …' indicator
    draftRestorePending: null, // {timestamp} when a previous draft is offered

    // -- detail view ------------------------------------------------------
    detailCase: null,

    // -- query builder ----------------------------------------------------
    query: {
      aggregations: [{ field: 'iq', fn: 'mean' }],
      filters: [],
      groupBy: '',
    },
    queryResult: null,
    queryMatches: null,

    // -- preset library — typical state-asked questions -------------------
    QUERY_PRESETS: [
      {
        id: 'count_by_sexe',
        label: 'Distribution by sex',
        description: 'Number of cases, girls vs boys.',
        config: { aggregations: [{ fn: 'count', field: null }], filters: [], groupBy: 'sexe' },
      },
      {
        id: 'count_by_dir',
        label: 'Cases by DIR',
        description: 'How many cases per regional directorate?',
        config: { aggregations: [{ fn: 'count', field: null }], filters: [], groupBy: 'dir' },
      },
      {
        id: 'avg_age',
        label: 'Overall average age',
        description: 'Average age across all cases.',
        config: { aggregations: [{ fn: 'mean', field: 'age' }], filters: [], groupBy: '' },
      },
      {
        id: 'avg_age_by_sexe',
        label: 'Average age by sex',
        description: 'Average age broken down by sex.',
        config: { aggregations: [{ fn: 'mean', field: 'age' }], filters: [], groupBy: 'sexe' },
      },
      {
        id: 'avg_age_by_dir',
        label: 'Average age by DIR',
        description: 'Average age in each directorate.',
        config: { aggregations: [{ fn: 'mean', field: 'age' }], filters: [], groupBy: 'dir' },
      },
      {
        id: 'avg_iq',
        label: 'Overall average IQ',
        description: 'Average IQ across all cases.',
        config: { aggregations: [{ fn: 'mean', field: 'iq' }], filters: [], groupBy: '' },
      },
      {
        id: 'avg_iq_by_sexe',
        label: 'Average IQ by sex',
        description: 'Average IQ broken down by sex.',
        config: { aggregations: [{ fn: 'mean', field: 'iq' }], filters: [], groupBy: 'sexe' },
      },
      {
        id: 'avg_iq_by_school',
        label: 'Average IQ by school',
        description: 'Average IQ per school.',
        config: { aggregations: [{ fn: 'mean', field: 'iq' }], filters: [], groupBy: 'ecole_lycee' },
      },
      {
        id: 'mesures_distribution',
        label: 'CDSE Measures distribution',
        description: 'How many cases per primary measure type?',
        config: { aggregations: [{ fn: 'count', field: null }], filters: [], groupBy: 'mesure_cdse_1' },
      },
      {
        id: 'mesures_by_dir',
        label: 'Measures by DIR',
        description: 'Which measure dominates in each directorate?',
        config: { aggregations: [{ fn: 'count', field: null }], filters: [], groupBy: 'dir' },
      },
      {
        id: 'languages',
        label: 'Languages spoken',
        description: 'Distribution of the first language.',
        config: { aggregations: [{ fn: 'count', field: null }], filters: [], groupBy: 'langue_1' },
      },
      {
        id: 'parents',
        label: 'Parental structure',
        description: 'Together / Separated / Other.',
        config: { aggregations: [{ fn: 'count', field: null }], filters: [], groupBy: 'parents' },
      },
      {
        id: 'scas',
        label: 'Cases with SCAS',
        description: 'How many and by directorate?',
        config: { aggregations: [{ fn: 'count', field: null }], filters: [{ field: 'scas', op: 'eq', value: 'Yes' }], groupBy: 'dir' },
      },
      {
        id: 'tutelle',
        label: 'Cases under foyer guardianship',
        description: 'How many pupils have a foyer as one of their guardianship holders?',
        config: { aggregations: [{ fn: 'count', field: null }], filters: [{ field: 'tutelle', op: 'contains', value: 'Foyer' }], groupBy: 'dir' },
      },
      {
        id: 'iq_distribution',
        label: 'IQ distribution',
        description: 'Histogram of IQ across all cases.',
        config: { aggregations: [{ fn: 'mean', field: 'iq' }], filters: [], groupBy: '' },
      },
      {
        id: 'age_distribution',
        label: 'Age distribution',
        description: 'Histogram of age across all cases.',
        config: { aggregations: [{ fn: 'mean', field: 'age' }], filters: [], groupBy: '' },
      },
      {
        id: 'diagnostics_distribution',
        label: 'Diagnoses — distribution',
        description: 'How often does each diagnosis appear? Cases with multiple diagnoses are counted in each.',
        config: { aggregations: [{ fn: 'count', field: null }], filters: [], groupBy: 'diagnostics' },
      },
      {
        id: 'avg_iq_by_diagnosis',
        label: 'Average IQ by diagnosis',
        description: 'Mean IQ in each diagnosis bucket.',
        config: { aggregations: [{ fn: 'mean', field: 'iq' }], filters: [], groupBy: 'diagnostics' },
      },
      {
        id: 'avg_age_by_diagnosis',
        label: 'Average age by diagnosis',
        description: 'Mean age in each diagnosis bucket.',
        config: { aggregations: [{ fn: 'mean', field: 'age' }], filters: [], groupBy: 'diagnostics' },
      },
      {
        id: 'suspected_distribution',
        label: 'Suspected profiles — distribution',
        description: 'How often does each suspected diagnosis or clinical profile appear?',
        config: { aggregations: [{ fn: 'count', field: null }], filters: [], groupBy: 'verdachtsdiagnosen_profil' },
      },
    ],
    savedQueriesList: [],
    saveQueryName: '',
    editingSavedQueryId: null,
    _chart: null,
    _dashCharts: [],

    // -- import / export --------------------------------------------------
    importMode: 'merge',
    importPreview: null,
    importError: '',

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
      { id: 'dashboard', label: 'Dashboard',       kicker: 'Overview',       title: 'Dash',       accent: 'board' },
      { id: 'cases',     label: 'Cases',           kicker: 'Registry',       title: 'Cases',      accent: '' },
      { id: 'query',     label: 'Queries',         kicker: 'Analysis',       title: 'Queries',    accent: '' },
      { id: 'io',        label: 'Import / Export', kicker: 'Exchange',       title: 'Import',     accent: ' / Export' },
      { id: 'audit',     label: 'Audit log',       kicker: 'Traceability',   title: 'Audit',      accent: ' log' },
      { id: 'settings',  label: 'Settings',        kicker: 'Configuration',  title: 'Settings',   accent: '' },
    ],

    get currentNav() {
      return this.nav.find((n) => n.id === this.view) || this.nav[0];
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
    labelOf(k)       { return getField(k)?.label || k; },
    optionsOf(k)     { return getField(k)?.options || []; },
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
        for (const k of ['mesure_cdse_1', 'mesure_cdse_2', 'mesure_cdse_3']) {
          if (c[k]) byMesure[c[k]] = (byMesure[c[k]] || 0) + 1;
        }
        for (const d of c.diagnostics || []) byDiag[d] = (byDiag[d] || 0) + 1;
      }
      const top = (obj, n2 = 5) =>
        Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n2);

      return {
        n,
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
          if (val && c[key] !== val) return false;
        }
        return true;
      });
    },

    get distinctValues() {
      const sets = { dir: new Set(), sexe: new Set(), mesure_cdse_1: new Set(), ecole_lycee: new Set() };
      for (const c of this.allCases) {
        if (c.dir) sets.dir.add(c.dir);
        if (c.sexe) sets.sexe.add(c.sexe);
        if (c.mesure_cdse_1) sets.mesure_cdse_1.add(c.mesure_cdse_1);
        if (c.ecole_lycee) sets.ecole_lycee.add(c.ecole_lycee);
      }
      return {
        dir: [...sets.dir].sort(),
        sexe: [...sets.sexe].sort(),
        mesure_cdse_1: [...sets.mesure_cdse_1].sort(),
        ecole_lycee: [...sets.ecole_lycee].sort((a, b) => a.localeCompare(b, 'fr')),
      };
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
      const spec = [
        { key: 'ISA',         label: 'ISA',         start: c.debut_isa,         end: c.fin_isa,         who: c.isa_realise_par },
        { key: 'CG',          label: 'C&G',         start: c.debut_cg,          end: c.fin_cg,          who: c.cg_realise_par },
        { key: 'ScolSpe',     label: 'Spec. School.',  start: c.debut_scol_spe,    end: c.fin_scol_spe,    who: c.scolarisation_specialisee },
        { key: 'Autre',       label: c.autre_mesure || 'Other', start: c.debut_autre_mesure, end: c.fin_autre_mesure, who: null },
        { key: 'DS',          label: 'DS',          start: c.date_ds,            end: c.date_ds,         who: c.ds_realise_par, singleDay: true },
      ];
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
      const todayPct = project(new Date().toISOString().slice(0, 10));
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
      // X-axis: year ticks
      const years = [];
      for (let y = minDate.getFullYear(); y <= maxDate.getFullYear(); y++) {
        years.push({ label: y, x: project(`${y}-01-01`) });
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
      this.detailCase = null;
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
      this.formData = { ...blank, ...c };
      for (const f of getEditableFields()) {
        if (f.type === 'tags' && !Array.isArray(this.formData[f.key])) this.formData[f.key] = [];
        if (f.type !== 'tags' && this.formData[f.key] == null) this.formData[f.key] = '';
      }
      this.formErrors = {};
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

    /** The 7 fields shown in the always-visible "Essentials" block. */
    essentialFields() {
      return getEditableFields().filter((f) => ESSENTIAL_FIELD_KEYS.has(f.key));
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
          _fields: this.essentialFields(),
        }];
      }
      return CATEGORIES.map((c) => ({
        key: c.key,
        label: c.label,
        _fields: getFieldsByCategory(c.key),
      }));
    },
    get nonEssentialFieldCount() {
      return getEditableFields().length - this.essentialFields().length;
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
      const e = {};
      const pairs = [
        ['debut_isa', 'fin_isa'],
        ['debut_cg', 'fin_cg'],
        ['debut_scol_spe', 'fin_scol_spe'],
        ['debut_autre_mesure', 'fin_autre_mesure'],
      ];
      for (const [s, ed] of pairs) {
        const a = data[s], b = data[ed];
        if (a && b && a > b) e[ed] = `Must be ≥ ${this.labelOf(s)} (${a}).`;
      }
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
      this.query.filters.push({ field: 'sexe', op: 'eq', value: '', value2: '' });
    },
    removeFilter(i) {
      this.query.filters.splice(i, 1);
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
      f.value = '';
      f.value2 = '';
    },

    runCurrentQuery() {
      // Cancel any debounced re-run so we never have two renders racing
      // (one from the direct call after a preset click, one from the
      // query-mutation watcher's debounce). Without this the second
      // render destroys the first chart while it's still drawing.
      clearTimeout(this._runTimer);

      // Drop incomplete filters silently
      const clean = (this.query.filters || []).filter((f) => {
        const op = operatorsFor(f.field).find((o) => o.key === f.op);
        if (!op) return false;
        if (op.needsValue && (f.value === '' || f.value === null || f.value === undefined)) return false;
        if (op.needsValue2 && (f.value2 === '' || f.value2 === null || f.value2 === undefined)) return false;
        return true;
      });
      const cleanAggs = (this.query.aggregations || []).filter((a) => a.fn === 'count' || !!a.field);
      const cfg = {
        filters: clean,
        aggregations: cleanAggs.length ? cleanAggs : [{ fn: 'count', field: null }],
        groupBy: this.query.groupBy || null,
      };
      this.queryResult = runQuery(this.allCases, cfg);
      (this._scheduleQuery || (() => window.Alpine.nextTick(() => this.renderQueryChart())))();
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
        // 1. group-by → bar chart (or doughnut for count-only with few groups)
        if (r.groupBy && r.groups.length) {
          const labels = r.groups.map((g) => g.key);
          const datasets = effectiveAggs.map((a, idx) => ({
            label: this.aggLabel(a),
            data: r.groups.map((g) => g.values[idx]),
            backgroundColor: idx === 0 ? '#0F3D3E' : idx === 1 ? '#B85C38' : '#6B6358',
          }));
          const isCountOnly = effectiveAggs.length === 1 && effectiveAggs[0].fn === 'count';
          const useDoughnut = isCountOnly && labels.length <= 8;
          this._chart = new window.Chart(ctx, {
            type: useDoughnut ? 'doughnut' : 'bar',
            data: useDoughnut
              ? { labels, datasets: [{ data: datasets[0].data, backgroundColor: ['#0F3D3E', '#B85C38', '#6B6358', '#143F40', '#C16C48', '#8B7E6C', '#3F5F5E', '#A04A2A'], borderColor: 'transparent' }] }
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
                backgroundColor: '#0F3D3E',
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

      const opts = chartOptions(this.theme);
      const optsNoLegend = { ...opts, plugins: { ...opts.plugins, legend: { display: false } } };
      // Doughnut charts must NOT carry x/y scales — otherwise Chart.js
      // draws an axis next to the ring (the "half-circle ruler" bug).
      const optsDoughnut = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: opts.plugins,
        cutout: '60%',
      };
      const palette = ['#0F3D3E', '#B85C38', '#6B6358', '#143F40', '#C16C48', '#8B7E6C', '#3F5F5E', '#A04A2A'];

      const make = (id, config) => {
        const el = document.getElementById(id);
        if (!el) { console.warn('CDSE: canvas missing', id); return; }
        try {
          this._dashCharts.push(new window.Chart(el, config));
        } catch (e) {
          console.error('CDSE: chart creation failed for', id, e);
        }
      };

      // 1. Sexe doughnut
      const sexeCounts = countBy(this.allCases, (c) => c.sexe);
      make('dashSexe', {
        type: 'doughnut',
        data: {
          labels: Object.keys(sexeCounts),
          datasets: [{ data: Object.values(sexeCounts), backgroundColor: palette, borderColor: 'transparent' }],
        },
        options: optsDoughnut,
      });

      // 2. Mesures doughnut (all three slots combined)
      const mesureCounts = {};
      for (const c of this.allCases) {
        for (const k of ['mesure_cdse_1', 'mesure_cdse_2', 'mesure_cdse_3']) {
          if (c[k]) mesureCounts[c[k]] = (mesureCounts[c[k]] || 0) + 1;
        }
      }
      const mesureEntries = Object.entries(mesureCounts).sort((a, b) => b[1] - a[1]);
      make('dashMesures', {
        type: 'doughnut',
        data: {
          labels: mesureEntries.map(([k]) => k),
          datasets: [{ data: mesureEntries.map(([, v]) => v), backgroundColor: palette, borderColor: 'transparent' }],
        },
        options: optsDoughnut,
      });

      // 3. Top schools horizontal bar (up to 8)
      const schoolEntries = topEntries(countBy(this.allCases, (c) => c.ecole_lycee), 8);
      make('dashSchools', {
        type: 'bar',
        data: {
          labels: schoolEntries.map(([k]) => shortLabelOf(k)),
          datasets: [{ data: schoolEntries.map(([, v]) => v), backgroundColor: '#0F3D3E', borderColor: 'transparent' }],
        },
        options: {
          ...optsNoLegend,
          indexAxis: 'y',
          plugins: {
            ...optsNoLegend.plugins,
            tooltip: {
              callbacks: { title: (items) => schoolEntries[items[0].dataIndex][0] },
            },
          },
        },
      });

      // 4. Top diagnoses horizontal bar (up to 10)
      const diagCounts = {};
      for (const c of this.allCases) {
        for (const d of c.diagnostics || []) diagCounts[d] = (diagCounts[d] || 0) + 1;
      }
      const diagEntries = topEntries(diagCounts, 10);
      make('dashDiag', {
        type: 'bar',
        data: {
          labels: diagEntries.map(([k]) => shortLabelOf(k)),
          datasets: [{ data: diagEntries.map(([, v]) => v), backgroundColor: '#B85C38', borderColor: 'transparent' }],
        },
        options: {
          ...optsNoLegend,
          indexAxis: 'y',
          plugins: {
            ...optsNoLegend.plugins,
            tooltip: {
              callbacks: { title: (items) => diagEntries[items[0].dataIndex][0] },
            },
          },
        },
      });

      // 5. Age histogram
      const ages = this.allCases.map((c) => c.age).filter((v) => Number.isFinite(v));
      if (ages.length) {
        const bins = histogram(ages, Math.min(12, Math.max(4, Math.ceil(Math.sqrt(ages.length)))));
        make('dashAge', {
          type: 'bar',
          data: {
            labels: bins.map((b) => `${Math.round(b.from)}–${Math.round(b.to)}`),
            datasets: [{ data: bins.map((b) => b.count), backgroundColor: '#0F3D3E', borderColor: 'transparent' }],
          },
          options: optsNoLegend,
        });
      }

      // 6. IQ histogram
      const iqs = this.allCases.map((c) => Number(c.iq)).filter((v) => Number.isFinite(v));
      if (iqs.length) {
        const bins = histogram(iqs, Math.min(12, Math.max(4, Math.ceil(Math.sqrt(iqs.length)))));
        make('dashIq', {
          type: 'bar',
          data: {
            labels: bins.map((b) => `${Math.round(b.from)}–${Math.round(b.to)}`),
            datasets: [{ data: bins.map((b) => b.count), backgroundColor: '#B85C38', borderColor: 'transparent' }],
          },
          options: optsNoLegend,
        });
      }
    },

    // ====================================================================
    // Query Builder: show matching cases
    // ====================================================================
    showMatchingCases() {
      const clean = (this.query.filters || []).filter((f) => {
        const op = operatorsFor(f.field).find((o) => o.key === f.op);
        if (!op) return false;
        if (op.needsValue && (f.value === '' || f.value === null || f.value === undefined)) return false;
        if (op.needsValue2 && (f.value2 === '' || f.value2 === null || f.value2 === undefined)) return false;
        return true;
      });
      this.queryMatches = filterRecords(this.allCases, clean);
    },

    hideMatchingCases() {
      this.queryMatches = null;
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
      this.query = JSON.parse(JSON.stringify(q.config));
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
    get filterableByCategory() {
      const out = [];
      for (const cat of CATEGORIES) {
        const fields = FIELD_DEFS.filter((f) => f.category === cat.key && f.type !== 'computed');
        if (cat.key === 'demographics') fields.splice(fields.length, 0, { key: 'age', label: 'Age (computed)', type: 'number', category: 'demographics' });
        if (fields.length) out.push({ ...cat, fields });
      }
      return out;
    },

    get groupableByCategory() {
      const out = [];
      for (const cat of CATEGORIES) {
        // Tags fields (diagnostics, guardianship, family measures, …) are
        // now groupable too — the engine fans them out, one bucket per tag.
        const fields = FIELD_DEFS.filter(
          (f) => f.category === cat.key && (f.type === 'select' || f.type === 'text' || f.type === 'tags'),
        );
        if (fields.length) out.push({ ...cat, fields });
      }
      return out;
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
      // Keep all-caps abbreviations as-is, otherwise leave the label's case alone
      // (so 'IQ' stays IQ, 'DIR' stays DIR, 'School' stays as written).
      const aggs = (this.query.aggregations || []).filter((a) => a.fn === 'count' || a.field);
      const filters = (this.query.filters || []).filter((f) => {
        const ops = operatorsFor(f.field);
        const op = ops.find((o) => o.key === f.op);
        if (!op) return false;
        if (op.needsValue && (f.value === '' || f.value == null)) return false;
        return true;
      });

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
          const op = operatorsFor(f.field).find((o) => o.key === f.op);
          const label = this.labelOf(f.field);
          if (!op.needsValue) return `${label} ${op.label}`;
          let val = f.value;
          if (op.needsValue2) val = `${f.value} and ${f.value2}`;
          return `${label} ${op.label} “${val}”`;
        });
        body += ' where ' + fp.join(' and ');
      }

      if (this.query.groupBy) {
        body += `, grouped by ${this.labelOf(this.query.groupBy)}`;
      }

      return body + '.';
    },

    /** Auto-run (debounced) on any query mutation. */
    queueRun() {
      clearTimeout(this._runTimer);
      this._runTimer = setTimeout(() => this.runCurrentQuery(), 250);
    },

    runPreset(id) {
      const p = this.QUERY_PRESETS.find((x) => x.id === id);
      if (!p) return;
      this.query = JSON.parse(JSON.stringify(p.config));
      this.editingSavedQueryId = null;
      this.saveQueryName = '';
      this.queryMatches = null;
      this.runCurrentQuery();
      window.Alpine.nextTick(() => {
        const el = document.getElementById('queryResultAnchor');
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    },

    newQuery() {
      this.query = { aggregations: [{ field: 'iq', fn: 'mean' }], filters: [], groupBy: '' };
      this.editingSavedQueryId = null;
      this.saveQueryName = '';
      this.queryResult = null;
      if (this._chart) { this._chart.destroy(); this._chart = null; }
    },

    exportQueryCSV() {
      const r = this.queryResult;
      if (!r) return;
      const aggs = (this.query.aggregations || []).filter((a) => a.fn === 'count' || !!a.field);
      const effectiveAggs = aggs.length ? aggs : [{ fn: 'count', field: null }];
      const header = ['Group', 'n', ...effectiveAggs.map((a) => this.aggLabel(a))];
      const rows = r.groups.map((g) => [g.key, g.n, ...g.values.map((v) => v ?? '')]);
      const csv = [header, ...rows].map((row) => row.map(csvEscape).join(';')).join('\n');
      downloadBlob(`cdse-query-${Date.now()}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
      audit.record({ action: 'export', user: this.user, summary: 'Query result (CSV)' });
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

    async onImportFile(ev) {
      this.importError = '';
      this.importPreview = null;
      const file = ev.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        let records;
        if (file.name.toLowerCase().endsWith('.json')) {
          records = JSON.parse(text);
          if (!Array.isArray(records)) throw new Error('The JSON must be an array.');
        } else {
          const rows = parseCSV(text.replace(/^﻿/, ''));
          if (!rows.length) throw new Error('CSV vide.');
          const header = rows[0].map((h) => h.trim());
          records = rows.slice(1).map((r) => {
            const obj = {};
            header.forEach((h, i) => {
              const def = getField(h);
              let v = r[i];
              if (v === undefined) v = '';
              if (def?.type === 'tags') v = v ? v.split(/[;|]\s*/).map((s) => s.trim()).filter(Boolean) : [];
              if (def?.type === 'number' && v !== '') v = Number(v);
              obj[h] = v;
            });
            return obj;
          });
        }
        const existing = await cases.list();
        const existingMatricules = new Set(existing.map((c) => c.matricule).filter(Boolean));
        let willAdd = 0, willConflict = 0;
        for (const r of records) {
          if (r.matricule && existingMatricules.has(r.matricule)) willConflict++;
          else willAdd++;
        }
        this.importPreview = { records, willAdd, willConflict, fileName: file.name };
      } catch (e) {
        this.importError = e.message || String(e);
      }
      ev.target.value = '';
    },

    async runImport() {
      if (!this.importPreview) return;
      const summary = await cases.importAll(this.importPreview.records, this.importMode);
      await audit.record({
        action: 'import',
        user: this.user,
        summary: `Import (${this.importMode}) — ${summary.added} added, ${summary.updated} updated, ${summary.skipped} skipped`,
      });
      this.notify(`Import : +${summary.added} · ↻${summary.updated} · –${summary.skipped}`);
      this.importPreview = null;
      await this.refreshAll();
    },

    cancelImport() { this.importPreview = null; this.importError = ''; },

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
    async wipeAll() {
      this.ask('Erase everything? This cannot be undone. Export a backup first.', async () => {
        localStorage.removeItem('cdse_cases_v1');
        localStorage.removeItem('cdse_vocab_v1');
        localStorage.removeItem('cdse_saved_queries_v1');
        localStorage.removeItem('cdse_audit_v1');
        localStorage.removeItem('cdse_demo_ids_v1');
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

// ----------------------------------------------------------------------------
// chart helpers
// ----------------------------------------------------------------------------
function chartOptions(theme) {
  const text = theme === 'dark' ? '#E8E4DC' : '#1A1814';
  const grid = theme === 'dark' ? 'rgba(232,228,220,0.08)' : 'rgba(26,24,20,0.08)';
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
      legend: { labels: { color: text, font: { family: 'Schibsted Grotesk' } } },
    },
    scales: {
      x: { ticks: { color: text, font: { family: 'JetBrains Mono' } }, grid: { color: grid } },
      y: { ticks: { color: text, font: { family: 'JetBrains Mono' } }, grid: { color: grid }, beginAtZero: true },
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
  // Clearly-fictive demo set covering enough variation to make every chart
  // and the query builder meaningful. Names obviously synthetic.
  const ecoles = [
    'Lycée Aline Mayrisch (LAML)',
    'Lënster Lycée International School — Junglinster (LLIS)',
    'Lycée Classique de Diekirch (LCD)',
    'Lycée Hubert-Clément (LHCE) — Esch',
    'Lycée Technique du Centre',
    'Athénée de Luxembourg',
  ];
  const dirs = [
    'DIR Capellen', 'DIR Clervaux/Wiltz', 'DIR Diekirch/Vianden', 'DIR Echternach',
    'DIR Esch-sur-Alzette', 'DIR Grevenmacher',
    'DIR Luxembourg-Est', 'DIR Luxembourg-Ouest', 'DIR Luxembourg-Ville',
    'DIR Mersch', 'DIR Pétange', 'DIR Redange/Rambrouch',
    'DIR Remich', 'DIR Strassen', 'DIR Wiltz',
  ];
  const mesures = ['DS', 'ISA', 'C&G', 'Spec. School.', 'Other'];
  const langs = ['LU', 'FR', 'DE', 'PT', 'EN'];
  const diags = [
    ['F90.0 — ADHD, predominantly inattentive'],
    ['F84.0 — Childhood autism'],
    ['F90.1 — ADHD, combined type', 'F32.0 — Mild depressive episode'],
    [],
    ['F32.1 — Moderate depressive episode'],
    ['F84.5 — Asperger syndrome'],
    ['F41.1 — Generalized anxiety'],
    ['F90.0 — ADHD, predominantly inattentive', 'F41.1 — Generalized anxiety'],
    ['F81.0 — Dyslexia'],
    ['F43.2 — Adjustment disorders'],
    ['F90.0 — ADHD, predominantly inattentive', 'F81.0 — Dyslexia'],
    ['GIP — Gifted / high intellectual potential'],
  ];
  const profils = [
    [], ['Mixed profile'], ['Suspected ADHD'], [],
    ['Attentional profile'], ['School refusal / school phobia'],
  ];
  const services = [
    [], ['ONE — Office National de l\'Enfance'], [], ['SPOS — Service Psycho-Social et d\'Orientation Scolaire'],
    ['ALUPSE — Aide aux victimes de maltraitance'], [],
  ];

  const today = new Date();
  const isoOf = (d) => d.toISOString().slice(0, 10);
  const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return isoOf(d); };
  const daysAhead = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return isoOf(d); };
  const yearOf = (y) => `${today.getFullYear() - y}-${String((y % 12) + 1).padStart(2, '0')}-${String((y * 3 % 27) + 1).padStart(2, '0')}`;

  const result = [];
  for (let i = 1; i <= 20; i++) {
    const sexe = ['F', 'M', 'F', 'M', 'F'][i % 5];
    const ageTarget = 10 + (i % 6); // 10..15
    const m1 = mesures[i % mesures.length];
    const m2 = i % 3 === 0 ? mesures[(i + 2) % mesures.length] : '';

    // sprinkle realistic-looking date pairs so the timeline and badges light up
    const dates = {};
    if (m1 === 'ISA' || m2 === 'ISA') {
      dates.debut_isa = daysAgo(120 + i * 5);
      dates.fin_isa = i % 4 === 0 ? daysAgo(10) : daysAhead(60 + i * 3);   // some ended, some active
    }
    if (m1 === 'C&G' || m2 === 'C&G') {
      dates.debut_cg = daysAgo(200 + i * 4);
      dates.fin_cg = i % 5 === 0 ? daysAhead(20) : daysAhead(180);  // a few "ending soon"
    }
    if (m1 === 'Spec. School.') {
      dates.debut_scol_spe = daysAgo(365 + i * 7);
      dates.fin_scol_spe = '';
    }
    if (i % 4 === 0) dates.date_ds = daysAgo(30 + i);

    result.push({
      matricule: String(2010000000000 + i),
      dossier_mfile: `MF-${1000 + i}`,
      nom: `Test ${String.fromCharCode(64 + (i % 26) + 1)}`,
      prenom: `Pupil ${i}`,
      sexe,
      date_naissance: yearOf(ageTarget),
      dir: dirs[i % dirs.length],
      ecole_lycee: ecoles[i % ecoles.length],
      mesure_cdse_1: m1,
      mesure_cdse_2: m2,
      mesure_cdse_3: '',
      ...dates,
      iq: 75 + ((i * 7) % 55),
      langue_1: langs[i % langs.length],
      parents: ['Together', 'Separated', 'Together', 'Other'][i % 4],
      scas: i % 3 === 0 ? 'Yes' : 'No',
      // New tags-style guardianship: most cases keep both parents; every
      // 5th case has a foyer placement layered on top.
      tutelle: i % 5 === 0 ? ['Mother', 'Foyer'] : (i % 4 === 0 ? ['Father'] : ['Both parents']),
      mesures_famille: i % 6 === 0 ? ['Assistance familiale (ONE)', 'Suivi SCAS']
                     : (i % 4 === 0 ? ['Aide éducative en milieu ouvert (AEMO)'] : []),
      school_type: i % 8 === 0 ? 'Privé' : 'Public',
      scol_etranger: i % 7 === 0 ? 'Yes' : 'No',
      diagnostics: diags[i % diags.length],
      verdachtsdiagnosen_profil: profils[i % profils.length],
      autres_services: services[i % services.length],
      ds_realise_par: i % 4 === 0 ? 'Fictional staff A' : '',
      isa_realise_par: dates.debut_isa ? 'Fictional staff B' : '',
      cg_realise_par: dates.debut_cg ? 'Fictional staff C' : '',
    });
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
