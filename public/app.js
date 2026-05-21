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

function blankCase() {
  const empty = {};
  for (const f of getEditableFields()) {
    if (f.type === 'tags') empty[f.key] = [];
    else empty[f.key] = '';
  }
  return empty;
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
        label: 'Répartition par sexe',
        description: 'Nombre de dossiers, filles vs garçons.',
        config: { aggregations: [{ fn: 'count', field: null }], filters: [], groupBy: 'sexe' },
      },
      {
        id: 'count_by_dir',
        label: 'Dossiers par DIR',
        description: 'Combien de dossiers par direction régionale ?',
        config: { aggregations: [{ fn: 'count', field: null }], filters: [], groupBy: 'dir' },
      },
      {
        id: 'avg_age',
        label: 'Âge moyen global',
        description: 'Moyenne d’âge de l’ensemble des dossiers.',
        config: { aggregations: [{ fn: 'mean', field: 'age' }], filters: [], groupBy: '' },
      },
      {
        id: 'avg_age_by_sexe',
        label: 'Âge moyen par sexe',
        description: 'Moyenne d’âge selon le sexe.',
        config: { aggregations: [{ fn: 'mean', field: 'age' }], filters: [], groupBy: 'sexe' },
      },
      {
        id: 'avg_age_by_dir',
        label: 'Âge moyen par DIR',
        description: 'Moyenne d’âge dans chaque direction.',
        config: { aggregations: [{ fn: 'mean', field: 'age' }], filters: [], groupBy: 'dir' },
      },
      {
        id: 'avg_iq',
        label: 'QI moyen global',
        description: 'Moyenne du QI sur l’ensemble.',
        config: { aggregations: [{ fn: 'mean', field: 'iq' }], filters: [], groupBy: '' },
      },
      {
        id: 'avg_iq_by_sexe',
        label: 'QI moyen par sexe',
        description: 'Moyenne du QI selon le sexe.',
        config: { aggregations: [{ fn: 'mean', field: 'iq' }], filters: [], groupBy: 'sexe' },
      },
      {
        id: 'avg_iq_by_school',
        label: 'QI moyen par école / lycée',
        description: 'Moyenne du QI par établissement scolaire.',
        config: { aggregations: [{ fn: 'mean', field: 'iq' }], filters: [], groupBy: 'ecole_lycee' },
      },
      {
        id: 'mesures_distribution',
        label: 'Répartition des Mesures CDSE',
        description: 'Combien de dossiers par type de mesure principale ?',
        config: { aggregations: [{ fn: 'count', field: null }], filters: [], groupBy: 'mesure_cdse_1' },
      },
      {
        id: 'mesures_by_dir',
        label: 'Mesures par DIR',
        description: 'Quelle mesure domine dans chaque direction ?',
        config: { aggregations: [{ fn: 'count', field: null }], filters: [], groupBy: 'dir' },
      },
      {
        id: 'languages',
        label: 'Langues parlées',
        description: 'Répartition de la langue principale.',
        config: { aggregations: [{ fn: 'count', field: null }], filters: [], groupBy: 'langue_1' },
      },
      {
        id: 'parents',
        label: 'Structure parentale',
        description: 'Ensemble / Séparés / Autre.',
        config: { aggregations: [{ fn: 'count', field: null }], filters: [], groupBy: 'parents' },
      },
      {
        id: 'scas',
        label: 'Dossiers avec SCAS',
        description: 'Combien et par direction ?',
        config: { aggregations: [{ fn: 'count', field: null }], filters: [{ field: 'scas', op: 'eq', value: 'Oui' }], groupBy: 'dir' },
      },
      {
        id: 'tutelle',
        label: 'Dossiers sous tutelle',
        description: 'Combien et par direction ?',
        config: { aggregations: [{ fn: 'count', field: null }], filters: [{ field: 'tutelle', op: 'eq', value: 'Oui' }], groupBy: 'dir' },
      },
      {
        id: 'iq_distribution',
        label: 'Distribution du QI',
        description: 'Histogramme du QI sur l’ensemble des dossiers.',
        config: { aggregations: [{ fn: 'mean', field: 'iq' }], filters: [], groupBy: '' },
      },
      {
        id: 'age_distribution',
        label: 'Distribution des âges',
        description: 'Histogramme d’âge sur l’ensemble.',
        config: { aggregations: [{ fn: 'mean', field: 'age' }], filters: [], groupBy: '' },
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

    // -- modal / toast ----------------------------------------------------
    confirm: { show: false, message: '', onConfirm: null },
    toast: { show: false, message: '', kind: 'ok' },

    // -- nav meta ---------------------------------------------------------
    nav: [
      { id: 'dashboard', label: 'Tableau de bord', kicker: "Vue d'ensemble", title: 'Tableau de', accent: ' bord' },
      { id: 'cases',     label: 'Dossiers',        kicker: 'Registre',        title: 'Dossiers',   accent: '' },
      { id: 'query',     label: 'Requêtes',        kicker: 'Analyse',         title: 'Requêtes',   accent: '' },
      { id: 'io',        label: 'Import / Export', kicker: 'Échange',         title: 'Import',     accent: ' / Export' },
      { id: 'audit',     label: 'Journal',         kicker: 'Traçabilité',     title: 'Journal',    accent: '' },
      { id: 'settings',  label: 'Paramètres',      kicker: 'Configuration',   title: 'Paramètres', accent: '' },
    ],

    get currentNav() {
      return this.nav.find((n) => n.id === this.view) || this.nav[0];
    },

    // ====================================================================
    // Init
    // ====================================================================
    async init() {
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

      // initial data
      await this.refreshAll();

      // open all form categories by default
      for (const c of CATEGORIES) this.formCategoryOpen[c.key] = c.key === 'identification';

      // dashboard charts: render whenever we land on dashboard or data changes
      this.$watch('view', (v) => {
        if (v === 'dashboard') this.$nextTick(() => this.renderDashboardCharts());
      });
      this.$watch('allCases', () => {
        if (this.view === 'dashboard') this.$nextTick(() => this.renderDashboardCharts());
      });
      this.$watch('theme', () => {
        if (this.view === 'dashboard') this.$nextTick(() => this.renderDashboardCharts());
        if (this.view === 'query' && this.queryResult) this.$nextTick(() => this.renderQueryChart());
      });

      // first render — after the section becomes visible
      this.$nextTick(() => this.renderDashboardCharts());

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
      this.now = new Date().toLocaleDateString('fr-LU', { day: '2-digit', month: 'long', year: 'numeric' });
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
        { key: 'ScolSpe',     label: 'Scol. Spé.',  start: c.debut_scol_spe,    end: c.fin_scol_spe,    who: c.scolarisation_specialisee },
        { key: 'Autre',       label: c.autre_mesure || 'Autre', start: c.debut_autre_mesure, end: c.fin_autre_mesure, who: null },
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
        open:     'en cours',
        ending:   'fin imminente',
        ended:    'terminée',
        upcoming: 'à venir',
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
      if (!c) { this.notify('Dossier introuvable', 'err'); return; }
      this.detailCase = c;
      this.view = 'detail';
    },

    backToList() {
      this.detailCase = null;
      this.view = 'cases';
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
      for (const c of CATEGORIES) this.formCategoryOpen[c.key] = c.key === 'identification';
      this.view = 'form';
    },

    async startEdit(id) {
      const c = await cases.get(id);
      if (!c) { this.notify('Dossier introuvable', 'err'); return; }
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
      for (const c2 of CATEGORIES) this.formCategoryOpen[c2.key] = true;
      this.view = 'form';
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
        if (a && b && a > b) e[ed] = `Doit être ≥ ${this.labelOf(s)} (${a}).`;
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
        this.notify('Veuillez corriger les erreurs.', 'err');
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
        this.notify('Dossier créé.');
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
        this.notify('Dossier mis à jour.');
      }

      await this.refreshAll();
      this.view = 'cases';
    },

    cancelForm() {
      this.formErrors = {};
      this.view = this.formMode === 'edit' ? 'cases' : 'cases';
    },

    async deleteCase(id) {
      this.ask('Supprimer définitivement ce dossier ?', async () => {
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
          this.notify('Dossier supprimé.');
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
      this.$nextTick(() => this.renderQueryChart());
    },

    renderQueryChart() {
      const ctx = document.getElementById('queryChart');
      if (!ctx) return;
      if (this._chart) { this._chart.destroy(); this._chart = null; }

      const r = this.queryResult;
      if (!r) return;
      const aggs = (this.query.aggregations || []).filter((a) => a.fn === 'count' || !!a.field);
      const effectiveAggs = aggs.length ? aggs : [{ fn: 'count', field: null }];

      // 1. group-by → bar chart
      if (r.groupBy && r.groups.length) {
        const labels = r.groups.map((g) => g.key);
        const datasets = effectiveAggs.map((a, idx) => ({
          label: this.aggLabel(a),
          data: r.groups.map((g) => g.values[idx]),
          backgroundColor: idx === 0 ? '#0F3D3E' : idx === 1 ? '#B85C38' : '#6B6358',
        }));
        const isCountOnly = effectiveAggs.length === 1 && effectiveAggs[0].fn === 'count';
        this._chart = new window.Chart(ctx, {
          type: isCountOnly && labels.length <= 8 ? 'doughnut' : 'bar',
          data: { labels, datasets },
          options: chartOptions(this.theme),
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
          options: chartOptions(this.theme),
        });
        return;
      }
      // 3. otherwise no chart, just metric text
    },

    // ====================================================================
    // Dashboard charts
    // ====================================================================
    renderDashboardCharts() {
      if (this._dashCharts && this._dashCharts.length) {
        this._dashCharts.forEach((c) => c && c.destroy());
      }
      this._dashCharts = [];
      if (!this.allCases.length || !window.Chart) return;

      const opts = chartOptions(this.theme);
      const optsNoLegend = { ...opts, plugins: { ...opts.plugins, legend: { display: false } } };
      const palette = ['#0F3D3E', '#B85C38', '#6B6358', '#143F40', '#C16C48', '#8B7E6C', '#3F5F5E', '#A04A2A'];

      const make = (id, config) => {
        const el = document.getElementById(id);
        if (!el) return;
        this._dashCharts.push(new window.Chart(el, config));
      };

      // 1. Sexe doughnut
      const sexeCounts = countBy(this.allCases, (c) => c.sexe);
      make('dashSexe', {
        type: 'doughnut',
        data: {
          labels: Object.keys(sexeCounts),
          datasets: [{ data: Object.values(sexeCounts), backgroundColor: palette, borderColor: 'transparent' }],
        },
        options: { ...opts, cutout: '60%' },
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
        options: { ...opts, cutout: '60%' },
      });

      // 3. Top schools horizontal bar (up to 8)
      const schoolEntries = topEntries(countBy(this.allCases, (c) => c.ecole_lycee), 8);
      make('dashSchools', {
        type: 'bar',
        data: {
          labels: schoolEntries.map(([k]) => k),
          datasets: [{ data: schoolEntries.map(([, v]) => v), backgroundColor: '#0F3D3E', borderColor: 'transparent' }],
        },
        options: { ...optsNoLegend, indexAxis: 'y' },
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
          labels: diagEntries.map(([k]) => k),
          datasets: [{ data: diagEntries.map(([, v]) => v), backgroundColor: '#B85C38', borderColor: 'transparent' }],
        },
        options: { ...optsNoLegend, indexAxis: 'y' },
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
      if (!name) { this.notify('Donnez un nom à la requête.', 'err'); return; }
      const saved = await savedQueries.save({
        id: this.editingSavedQueryId,
        name,
        config: JSON.parse(JSON.stringify(this.query)),
      });
      this.savedQueriesList = await savedQueries.list();
      this.editingSavedQueryId = saved.id;
      this.notify('Requête sauvegardée.');
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
      this.ask('Supprimer cette requête sauvegardée ?', async () => {
        await savedQueries.delete(id);
        this.savedQueriesList = await savedQueries.list();
        if (this.editingSavedQueryId === id) { this.editingSavedQueryId = null; this.saveQueryName = ''; }
        this.notify('Requête supprimée.');
      });
    },

    runPreset(id) {
      const p = this.QUERY_PRESETS.find((x) => x.id === id);
      if (!p) return;
      this.query = JSON.parse(JSON.stringify(p.config));
      this.editingSavedQueryId = null;
      this.saveQueryName = '';
      this.queryMatches = null;
      this.runCurrentQuery();
      this.$nextTick(() => {
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
      const header = ['Groupe', 'n', ...effectiveAggs.map((a) => this.aggLabel(a))];
      const rows = r.groups.map((g) => [g.key, g.n, ...g.values.map((v) => v ?? '')]);
      const csv = [header, ...rows].map((row) => row.map(csvEscape).join(';')).join('\n');
      downloadBlob(`cdse-requete-${Date.now()}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
      audit.record({ action: 'export', user: this.user, summary: 'Résultat de requête (CSV)' });
    },

    // ====================================================================
    // Import / Export
    // ====================================================================
    async exportAllJSON() {
      const all = await cases.exportAll();
      downloadBlob(`cdse-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(all, null, 2), 'application/json');
      await audit.record({ action: 'export', user: this.user, summary: `JSON complet — ${all.length} dossiers` });
      this.notify(`${all.length} dossiers exportés.`);
    },

    async exportAllCSV() {
      const all = await cases.exportAll();
      const cols = getEditableFields().map((f) => f.key);
      const header = ['id', ...cols, 'age', 'created_at', 'updated_at'];
      const rows = all.map((r) => [r.id, ...cols.map((k) => r[k]), r.age, r.created_at, r.updated_at]);
      const csv = [header, ...rows].map((row) => row.map(csvEscape).join(';')).join('\n');
      downloadBlob(`cdse-dossiers-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
      await audit.record({ action: 'export', user: this.user, summary: `CSV complet — ${all.length} dossiers` });
      this.notify(`${all.length} dossiers exportés.`);
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
          if (!Array.isArray(records)) throw new Error('Le JSON doit être un tableau.');
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
        summary: `Import (${this.importMode}) — ${summary.added} ajoutés, ${summary.updated} mis à jour, ${summary.skipped} ignorés`,
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
        return d.toLocaleString('fr-LU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      } catch { return iso; }
    },

    // ====================================================================
    // Settings
    // ====================================================================
    async wipeAll() {
      this.ask('Tout effacer ? Cette opération est irréversible. Exportez d\'abord un backup.', async () => {
        localStorage.removeItem('cdse_cases_v1');
        localStorage.removeItem('cdse_vocab_v1');
        localStorage.removeItem('cdse_saved_queries_v1');
        localStorage.removeItem('cdse_audit_v1');
        await this.refreshAll();
        this.notify('Données effacées.', 'err');
      });
    },

    async loadSample() {
      this.ask('Charger des données fictives de démonstration ?', async () => {
        const seed = sampleData();
        await cases.importAll(seed, 'merge');
        for (const s of seed) {
          await audit.record({ action: 'create', user: this.user, caseId: null, summary: `[seed] ${s.prenom} ${s.nom}` });
        }
        await this.refreshAll();
        this.notify(`${seed.length} dossiers fictifs chargés.`);
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
      this.$nextTick(() => document.getElementById('spotlightInput')?.focus());
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
    plugins: {
      legend: { labels: { color: text, font: { family: 'Schibsted Grotesk' } } },
    },
    scales: {
      x: { ticks: { color: text, font: { family: 'JetBrains Mono' } }, grid: { color: grid } },
      y: { ticks: { color: text, font: { family: 'JetBrains Mono' } }, grid: { color: grid }, beginAtZero: true },
    },
  };
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
  const ecoles = ['Lycée Junglinster', 'Lycée Echternach', 'Lycée Vauban', 'École fictive A'];
  const dirs = ['DIR Centre', 'DIR Est', 'DIR Ouest', 'DIR Sud', 'DIR Nord'];
  const mesures = ['DS', 'ISA', 'C&G', 'Scol. Spé.'];
  const langs = ['LU', 'FR', 'DE', 'PT'];
  const diags = [
    ['F90.0'], ['F84.0'], ['F90.0', 'F32.0'], [], ['F32.0'], ['F84.0', 'F90.0'],
    ['F41.1'], ['F90.1'], ['F84.5'], ['F90.0', 'F41.1'],
  ];
  const result = [];
  const yearNow = new Date().getFullYear();
  for (let i = 1; i <= 24; i++) {
    const sexe = ['F', 'M', 'F', 'M', 'F'][i % 5];
    const year = yearNow - (10 + (i % 6));
    result.push({
      matricule: String(2010000000000 + i),
      dossier_mfile: `MF-${1000 + i}`,
      nom: `Test ${String.fromCharCode(64 + ((i - 1) % 26) + 1)}`,
      prenom: `Élève ${i}`,
      sexe,
      date_naissance: `${year}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`,
      dir: dirs[i % dirs.length],
      ecole_lycee: ecoles[i % ecoles.length],
      mesure_cdse_1: mesures[i % mesures.length],
      iq: 70 + (i * 7 % 60),
      langue_1: langs[i % langs.length],
      parents: ['Ensemble', 'Séparés', 'Ensemble', 'Autre'][i % 4],
      scas: i % 3 === 0 ? 'Oui' : 'Non',
      tutelle: i % 5 === 0 ? 'Oui' : 'Non',
      scol_etranger: 'Non',
      diagnostics: diags[i % diags.length],
      verdachtsdiagnosen_profil: i % 4 === 0 ? ['Profil mixte'] : [],
      autres_services: [],
    });
  }
  return result;
}

// ----------------------------------------------------------------------------
// Expose
// ----------------------------------------------------------------------------
window.cdseApp = makeApp;
