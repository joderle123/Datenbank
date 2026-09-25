// public/fields.js
// ----------------------------------------------------------------------------
// CDSE Stats — canonical schema definition
// ----------------------------------------------------------------------------
// Single source of truth for the case record shape. The form, the list view,
// the query builder, validation and import/export all read from this file —
// nothing else hard-codes field names or types.
//
// Supported field types:
//   text      — free-text input (single line)
//   number    — numeric input (with optional min/max)
//   date      — ISO date YYYY-MM-DD on the wire
//   select    — single choice from `options`
//   tags      — array of free-text values (multi-tag input)
//   computed  — derived at read time, never stored (e.g. `age`, durations)
//
// Optional field properties:
//   legacy         — kept so older records stay loadable and exportable; only
//                    shown where the record actually holds a value
//   legacyOptions  — older select values that stay valid (shown as "old")
//   otherField     — select with an "Other" option: key of the text field
//                    that says what "Other" means
//   showIf(data)   — form shows the field only when this returns true
//   listKey        — suggestions come from an editable list in Settings
//                    (schools, ateliers, rééducation types)
//
// Categories group fields into sections of the create/edit form and the
// detail view. The order of CATEGORIES is the display order.
//
// Official names and lists follow the CDSE's own "Fiche de renseignement"
// (directions de région, measures, CST groups) and the Luxembourg law of
// 20 July 2018 on the Centres de compétences en psycho-pédagogie spécialisée.
// ----------------------------------------------------------------------------

// ----- official lists ---------------------------------------------------------

/** The 15 regional directorates of the enseignement fondamental, numbered as
 *  on the CDSE Fiche de renseignement. */
export const DR_OPTIONS = [
  'DR 01 Luxembourg', 'DR 02 Mamer', 'DR 03 Pétange', 'DR 04 Differdange',
  'DR 05 Sanem', 'DR 06 Esch/Alzette', 'DR 07 Dudelange', 'DR 08 Bettembourg',
  'DR 09 Remich', 'DR 10 Grevenmacher', 'DR 11 Echternach', 'DR 12 Mersch',
  'DR 13 Rédange/Attert', 'DR 14 Diekirch', 'DR 15 Wiltz',
];

/** Values of the first prototype's (incorrect) DIR list. Records that still
 *  hold one of them stay valid; unambiguous ones are mapped on read. */
export const DIR_LEGACY_OPTIONS = [
  'DIR Capellen', 'DIR Clervaux/Wiltz', 'DIR Diekirch/Vianden', 'DIR Echternach',
  'DIR Esch-sur-Alzette', 'DIR Grevenmacher', 'DIR Luxembourg-Est', 'DIR Luxembourg-Ouest',
  'DIR Luxembourg-Ville', 'DIR Mersch', 'DIR Pétange', 'DIR Redange/Rambrouch',
  'DIR Remich', 'DIR Strassen', 'DIR Wiltz',
];
export const DIR_LEGACY_MAP = {
  'DIR Luxembourg-Ville': 'DR 01 Luxembourg',
  'DIR Pétange': 'DR 03 Pétange',
  'DIR Esch-sur-Alzette': 'DR 06 Esch/Alzette',
  'DIR Remich': 'DR 09 Remich',
  'DIR Grevenmacher': 'DR 10 Grevenmacher',
  'DIR Echternach': 'DR 11 Echternach',
  'DIR Mersch': 'DR 12 Mersch',
  'DIR Redange/Rambrouch': 'DR 13 Rédange/Attert',
  'DIR Diekirch/Vianden': 'DR 14 Diekirch',
  'DIR Wiltz': 'DR 15 Wiltz',
  // 'DIR Capellen', 'DIR Clervaux/Wiltz', 'DIR Luxembourg-Est',
  // 'DIR Luxembourg-Ouest', 'DIR Strassen' are ambiguous → Settings → Clean up
};

/** CST groups as listed on the Fiche de renseignement. */
export const CST_GROUPS = ['Moveo', 'iami', 'X-Track', 'Attivo', 'Switch', 'Twist', 'Kautenbach', 'Passo', 'Nobu', 'Klick-Klack'];

/** Conseil et guidance: for whom (the Fiche distinguishes both). */
export const CG_TYPES = ['Professionals', 'Parents', 'Professionals and parents'];

/** The other Centres de compétences (the CDSE itself is not listed). */
export const CC_OPTIONS = [
  'CDA — Centre pour le développement des apprentissages Grande-Ile',
  'CDI — Centre pour le développement intellectuel',
  'CDM — Centre pour le développement moteur',
  'CDV — Centre pour le développement des compétences relatives à la vue',
  'CEJHP — Centre pour enfants et jeunes à haut potentiel',
  'CL — Centre de logopédie',
  'CTSA — Centre pour enfants et jeunes présentant un trouble du spectre de l’autisme',
];

/** ETEP developmental stages as used in the ELDiB. */
export const ELDIB_STAGES = ['1', '2', '3', '4', '5'];

/** CDSE measures. `key` is what is stored in mesure_cdse_1..3. Each measure has
 *  its own form section (dates, staff, details); `detail` is the field that
 *  says precisely which measure it is (which atelier, which CST group …). */
export const MEASURES = [
  { key: 'DS',          label: 'DS — Diagnostic spécialisé',                 category: 'ds',           start: 'date_ds',           end: 'date_ds',           who: 'ds_realise_par', singleDay: true },
  { key: 'ISA',         label: 'ISA — Intervention spécialisée ambulatoire', category: 'isa',          start: 'debut_isa',         end: 'fin_isa',           who: 'isa_realise_par' },
  { key: 'C&G',         label: 'C&G — Conseil et guidance',                  category: 'cg',           start: 'debut_cg',          end: 'fin_cg',            who: 'cg_realise_par',  detail: 'cg_type' },
  { key: 'Atelier',     label: 'Atelier d’apprentissage spécifique',         category: 'atelier',      start: 'debut_atelier',     end: 'fin_atelier',       who: 'atelier_realise_par', detail: 'atelier_type' },
  { key: 'Rééducation', label: 'Rééducation',                                category: 'reeducation',  start: 'debut_reeducation', end: 'fin_reeducation',   who: 'reeducation_realise_par', detail: 'reeducation_type' },
  { key: 'Annexe',      label: 'Annexe Junglinster',                         category: 'annexe',       start: 'debut_annexe',      end: 'fin_annexe',        who: null },
  { key: 'CST',         label: 'CST — Centre socio-thérapeutique',           category: 'cst',          start: 'debut_cst',         end: 'fin_cst',           who: null, detail: 'cst_groupe' },
  { key: 'CdP',         label: 'CdP — Classe de participation',              category: 'cdp',          start: 'debut_cdp',         end: 'fin_cdp',           who: null, detail: 'cdp_region' },
  { key: 'Other',       label: 'Other measure',                              category: 'autre_mesure', start: 'debut_autre_mesure', end: 'fin_autre_mesure', who: null, detail: 'autre_mesure' },
];
export const MEASURE_KEYS = MEASURES.map((m) => m.key);
const MEASURE_BY_KEY = Object.fromEntries(MEASURES.map((m) => [m.key, m]));
export function measureInfo(key) { return MEASURE_BY_KEY[key] || null; }

const MEASURE_SLOTS = ['mesure_cdse_1', 'mesure_cdse_2', 'mesure_cdse_3'];

/** Is this measure chosen in one of the three slots? */
export function hasMeasure(data, key) {
  return MEASURE_SLOTS.some((s) => data?.[s] === key);
}

function filled(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/** A measure section is shown when the measure is chosen or already has data. */
function measureShown(key) {
  return (data) => {
    if (hasMeasure(data, key)) return true;
    const cat = MEASURE_BY_KEY[key].category;
    return FIELD_DEFS.some((f) => f.category === cat && f.type !== 'computed' && filled(data?.[f.key]));
  };
}

// ----- categories -------------------------------------------------------------

export const CATEGORIES = [
  { key: 'identification', label: 'Identification' },
  { key: 'demographics',   label: 'Demographics' },
  { key: 'structure',      label: 'School' },
  { key: 'mesures_cdse',   label: 'CDSE measures' },
  { key: 'ds',             label: 'DS — Diagnostic spécialisé',                 showIf: measureShown('DS') },
  { key: 'isa',            label: 'ISA — Intervention spécialisée ambulatoire', showIf: measureShown('ISA') },
  { key: 'cg',             label: 'C&G — Conseil et guidance',                  showIf: measureShown('C&G') },
  { key: 'atelier',        label: 'Atelier d’apprentissage spécifique',         showIf: measureShown('Atelier') },
  { key: 'reeducation',    label: 'Rééducation',                                showIf: measureShown('Rééducation') },
  { key: 'annexe',         label: 'Annexe Junglinster',                         showIf: measureShown('Annexe') },
  { key: 'cst',            label: 'CST — Centre socio-thérapeutique',           showIf: measureShown('CST') },
  { key: 'cdp',            label: 'CdP — Classe de participation',              showIf: measureShown('CdP') },
  { key: 'autre_mesure',   label: 'Other measure',                              showIf: measureShown('Other') },
  { key: 'scol_spe',       label: 'Specialized schooling (older entries)',      legacy: true },
  { key: 'durations',      label: 'Duration of measures',                       computedOnly: true },
  { key: 'eldib',          label: 'ELDiB' },
  { key: 'externe',        label: 'External services' },
  { key: 'klinik',         label: 'Clinical profile' },
  { key: 'background',     label: 'Family / language background' },
];

const MEASURE_HELP = 'DS = Diagnostic spécialisé · ISA = Intervention spécialisée ambulatoire · C&G = Conseil et guidance · Atelier = Atelier d’apprentissage spécifique · Annexe = Annexe Junglinster · CST = Centre socio-thérapeutique · CdP = Classe de participation';

// ----- fields -----------------------------------------------------------------

export const FIELD_DEFS = [
  // -- Identification -------------------------------------------------------
  { key: 'matricule',       label: 'National ID',         type: 'text', category: 'identification', required: true, unique: true, helpText: 'Luxembourg national ID (13 digits)' },
  { key: 'dossier_mfile',   label: 'M-File No.',          type: 'text', category: 'identification', helpText: 'Internal M-File case number' },
  { key: 'nom',             label: 'Last name',           type: 'text', category: 'identification', required: true },
  { key: 'prenom',          label: 'First name',          type: 'text', category: 'identification', required: true },

  // -- Demographics ---------------------------------------------------------
  { key: 'sexe',            label: 'Sex',                 type: 'select', category: 'demographics', options: ['M', 'F', 'D'] },
  { key: 'date_naissance',  label: 'Date of birth',       type: 'date',   category: 'demographics' },
  { key: 'age',             label: 'Age',                 type: 'computed', category: 'demographics', numeric: true, helpText: 'Computed from the date of birth' },
  { key: 'age_band',        label: 'Age group',           type: 'computed', category: 'demographics', helpText: 'Age in two-year bands, for grouping' },

  // -- School ---------------------------------------------------------------
  { key: 'dir',             label: 'Direction de région', type: 'select', category: 'structure',
    options: DR_OPTIONS, legacyOptions: DIR_LEGACY_OPTIONS,
    helpText: 'Direction de région de l’enseignement fondamental (15 regions, numbered as on the Fiche de renseignement). Leave empty for secondary schools.' },
  { key: 'ecole_lycee',     label: 'School',              type: 'text',   category: 'structure', autocomplete: 'ecoles', listKey: 'schools', helpText: 'Pick from the list or type. The list can be edited under Settings → Lists.' },
  { key: 'school_type',     label: 'School sector',       type: 'select', category: 'structure', options: ['Public', 'Privé'], helpText: 'Public versus private (école privée)' },
  { key: 'spec_school',     label: 'Specialized school (old field)', type: 'select', category: 'structure', legacy: true, options: ['Annexe Junglinster', 'CST (Centre socio-thérapeutique)', 'Classe de participation'], helpText: 'Replaced by the measures Annexe, CST and CdP.' },
  { key: 'previous_school', label: 'Previous school',     type: 'text',   category: 'structure', autocomplete: 'ecoles', listKey: 'schools', helpText: 'If the pupil changed schools — name of the previous one' },
  { key: 'date_school_change', label: 'School change date', type: 'date', category: 'structure', helpText: 'Date of the move to the current school' },

  // -- CDSE measures --------------------------------------------------------
  { key: 'mesure_cdse_1',   label: 'CDSE measure 1',      type: 'select', category: 'mesures_cdse', options: MEASURE_KEYS, legacyOptions: ['Spec. School.'], measureSlot: true, helpText: 'Primary measure. ' + MEASURE_HELP },
  { key: 'mesure_cdse_2',   label: 'CDSE measure 2',      type: 'select', category: 'mesures_cdse', options: MEASURE_KEYS, legacyOptions: ['Spec. School.'], measureSlot: true, helpText: 'Second measure, if any' },
  { key: 'mesure_cdse_3',   label: 'CDSE measure 3',      type: 'select', category: 'mesures_cdse', options: MEASURE_KEYS, legacyOptions: ['Spec. School.'], measureSlot: true, helpText: 'Third measure, if any' },
  { key: 'date_decision_cni', label: 'CNI decision date', type: 'date', category: 'mesures_cdse', helpText: 'Date of the Commission nationale d’inclusion decision' },

  // -- DS -------------------------------------------------------------------
  { key: 'ds_realise_par',  label: 'DS performed by',     type: 'text', category: 'ds', autocomplete: 'staff', helpText: 'Staff member who carried out the Diagnostic spécialisé' },
  { key: 'date_ds',         label: 'DS date',             type: 'date', category: 'ds' },

  // -- ISA ------------------------------------------------------------------
  { key: 'isa_realise_par', label: 'ISA performed by',    type: 'text', category: 'isa', autocomplete: 'staff', helpText: 'Staff member in charge of the Intervention spécialisée ambulatoire' },
  { key: 'debut_isa',       label: 'ISA start',           type: 'date', category: 'isa' },
  { key: 'fin_isa',         label: 'ISA end',             type: 'date', category: 'isa', helpText: 'Leave empty while the ISA is still running' },

  // -- C&G ------------------------------------------------------------------
  { key: 'cg_type',         label: 'C&G for',             type: 'select', category: 'cg', options: CG_TYPES, helpText: 'Conseil et guidance des professionnel·le·s and/or des parents' },
  { key: 'cg_realise_par',  label: 'C&G performed by',    type: 'text', category: 'cg', autocomplete: 'staff' },
  { key: 'debut_cg',        label: 'C&G start',           type: 'date', category: 'cg' },
  { key: 'fin_cg',          label: 'C&G end',             type: 'date', category: 'cg' },

  // -- Atelier --------------------------------------------------------------
  { key: 'atelier_type',    label: 'Which atelier',       type: 'text', category: 'atelier', listKey: 'ateliers', helpText: 'Pick from the list or type. The list can be edited under Settings → Lists.' },
  { key: 'atelier_realise_par', label: 'Atelier led by',  type: 'text', category: 'atelier', autocomplete: 'staff' },
  { key: 'debut_atelier',   label: 'Atelier start',       type: 'date', category: 'atelier' },
  { key: 'fin_atelier',     label: 'Atelier end',         type: 'date', category: 'atelier' },

  // -- Rééducation ----------------------------------------------------------
  { key: 'reeducation_type', label: 'Which rééducation',  type: 'text', category: 'reeducation', listKey: 'reeducation', helpText: 'Pick from the list or type. The list can be edited under Settings → Lists.' },
  { key: 'reeducation_realise_par', label: 'Rééducation by', type: 'text', category: 'reeducation', autocomplete: 'staff' },
  { key: 'debut_reeducation', label: 'Rééducation start', type: 'date', category: 'reeducation' },
  { key: 'fin_reeducation', label: 'Rééducation end',     type: 'date', category: 'reeducation' },

  // -- Annexe Junglinster ---------------------------------------------------
  { key: 'debut_annexe',    label: 'Annexe start',        type: 'date', category: 'annexe' },
  { key: 'fin_annexe',      label: 'Annexe end',          type: 'date', category: 'annexe' },

  // -- CST ------------------------------------------------------------------
  { key: 'cst_groupe',      label: 'CST group',           type: 'select', category: 'cst', options: CST_GROUPS, helpText: 'Groups as listed on the Fiche de renseignement' },
  { key: 'debut_cst',       label: 'CST start',           type: 'date', category: 'cst' },
  { key: 'fin_cst',         label: 'CST end',             type: 'date', category: 'cst' },

  // -- CdP ------------------------------------------------------------------
  { key: 'cdp_region',      label: 'CdP class in',        type: 'select', category: 'cdp', options: DR_OPTIONS, helpText: 'Region of the Classe de participation' },
  { key: 'debut_cdp',       label: 'CdP start',           type: 'date', category: 'cdp' },
  { key: 'fin_cdp',         label: 'CdP end',             type: 'date', category: 'cdp' },

  // -- Other measure --------------------------------------------------------
  { key: 'autre_mesure',       label: 'Other measure — which', type: 'text', category: 'autre_mesure', helpText: 'Say what the other measure is' },
  { key: 'debut_autre_mesure', label: 'Other measure start',  type: 'date', category: 'autre_mesure' },
  { key: 'fin_autre_mesure',   label: 'Other measure end',    type: 'date', category: 'autre_mesure' },

  // -- Specialized schooling, older entries (before Annexe/CST/CdP) ----------
  { key: 'scolarisation_specialisee', label: 'Institution', type: 'text', category: 'scol_spe', legacy: true },
  { key: 'debut_scol_spe',  label: 'Spec. schooling start', type: 'date', category: 'scol_spe', legacy: true },
  { key: 'fin_scol_spe',    label: 'Spec. schooling end',   type: 'date', category: 'scol_spe', legacy: true },

  // -- Duration of measures (computed) ---------------------------------------
  { key: 'dur_isa',         label: 'ISA duration (months)',          type: 'computed', category: 'durations', numeric: true, measure: 'ISA' },
  { key: 'dur_cg',          label: 'C&G duration (months)',          type: 'computed', category: 'durations', numeric: true, measure: 'C&G' },
  { key: 'dur_atelier',     label: 'Atelier duration (months)',      type: 'computed', category: 'durations', numeric: true, measure: 'Atelier' },
  { key: 'dur_reeducation', label: 'Rééducation duration (months)',  type: 'computed', category: 'durations', numeric: true, measure: 'Rééducation' },
  { key: 'dur_annexe',      label: 'Annexe duration (months)',       type: 'computed', category: 'durations', numeric: true, measure: 'Annexe' },
  { key: 'dur_cst',         label: 'CST duration (months)',          type: 'computed', category: 'durations', numeric: true, measure: 'CST' },
  { key: 'dur_cdp',         label: 'CdP duration (months)',          type: 'computed', category: 'durations', numeric: true, measure: 'CdP' },
  { key: 'dur_autre',       label: 'Other measure duration (months)', type: 'computed', category: 'durations', numeric: true, measure: 'Other' },
  { key: 'dur_total',       label: 'Time with the CDSE (months)',    type: 'computed', category: 'durations', numeric: true, helpText: 'From the first start of any measure to the last end — or until today while one is running' },
  { key: 'n_measures',      label: 'Number of CDSE measures',        type: 'computed', category: 'durations', numeric: true },
  { key: 'measures_all',    label: 'CDSE measures (all)',            type: 'computed', category: 'durations', list: true, helpText: 'Every measure with a date or chosen in a slot' },
  { key: 'measures_running', label: 'Measures running today',        type: 'computed', category: 'durations', list: true },

  // -- ELDiB ----------------------------------------------------------------
  { key: 'eldib_date',      label: 'ELDiB date',                   type: 'date',   category: 'eldib', helpText: 'Date of the most recent ELDiB' },
  { key: 'eldib_v',         label: 'Stage — Behaviour (V)',        type: 'select', category: 'eldib', options: ELDIB_STAGES, helpText: 'ETEP stage 1–5 reached in this area' },
  { key: 'eldib_k',         label: 'Stage — Communication (K)',    type: 'select', category: 'eldib', options: ELDIB_STAGES },
  { key: 'eldib_soz',       label: 'Stage — Socialisation (SOZ)',  type: 'select', category: 'eldib', options: ELDIB_STAGES },
  { key: 'eldib_kog',       label: 'Stage — Cognition (KOG)',      type: 'select', category: 'eldib', options: ELDIB_STAGES },

  // -- External services ----------------------------------------------------
  { key: 'autres_cc',         label: 'Other competence centres (CC)', type: 'tags', category: 'externe', helpText: 'Pick every other Centre de compétences involved. Several are possible.' },
  { key: 'autre_cc_implique', label: 'Other CC involved (old text)',  type: 'text', category: 'externe', legacy: true, helpText: 'Older free-text entry — now picked from the list above' },
  { key: 'autres_services',   label: 'Other services',      type: 'tags',   category: 'externe', helpText: 'Multiple values allowed (Enter to add)' },
  { key: 'scol_etranger',     label: 'Schooling abroad',    type: 'select', category: 'externe', options: ['Yes', 'No'] },

  // -- Clinical profile -----------------------------------------------------
  { key: 'diagnostics',              label: 'Diagnoses',                type: 'tags',   category: 'klinik', helpText: 'ICD-10 / DSM-5 codes or free text' },
  { key: 'verdachtsdiagnosen_profil', label: 'Suspected diagnoses / Profile', type: 'tags', category: 'klinik', helpText: 'Working hypotheses or clinical profile, not yet a confirmed diagnosis' },
  { key: 'iq',                       label: 'IQ',                       type: 'number', category: 'klinik', min: 40, max: 160, helpText: 'Total IQ score (40–160 range)' },

  // -- Family / language background ------------------------------------------
  { key: 'langue_1', label: 'First language', type: 'select', category: 'background', options: ['LU', 'FR', 'DE', 'PT', 'EN', 'IT', 'ES', 'Other'], otherField: 'langue_1_autre', helpText: 'Main language spoken at home' },
  { key: 'langue_1_autre', label: 'First language — which', type: 'text', category: 'background', showIf: (d) => d?.langue_1 === 'Other', otherOf: 'langue_1' },
  { key: 'parents',  label: 'Parents',  type: 'select', category: 'background', options: ['Together', 'Separated', 'Other'], otherField: 'parents_autre', helpText: 'Parental living situation' },
  { key: 'parents_autre', label: 'Parents — which situation', type: 'text', category: 'background', showIf: (d) => d?.parents === 'Other', otherOf: 'parents' },
  { key: 'scas',     label: 'SCAS',     type: 'select', category: 'background', options: ['Yes', 'No'], helpText: 'SCAS = Service central d’assistance sociale. Is the SCAS involved in this case?' },
  { key: 'tutelle',  label: 'Guardianship by',  type: 'tags',   category: 'background', helpText: 'Who currently holds guardianship (mother, father, foyer …). Multiple values allowed.' },
  { key: 'mesures_famille', label: 'Family measures', type: 'tags', category: 'background', helpText: 'Family-side support measures currently in place (Assistance familiale, Aide éducative, ONE …)' },
];

// ----------------------------------------------------------------------------
// Indexed lookup tables (built once at module load)
// ----------------------------------------------------------------------------
const FIELDS_BY_KEY = Object.fromEntries(FIELD_DEFS.map((f) => [f.key, f]));
const FIELDS_BY_CATEGORY = CATEGORIES.reduce((acc, c) => {
  acc[c.key] = FIELD_DEFS.filter((f) => f.category === c.key);
  return acc;
}, {});

// ----------------------------------------------------------------------------
// Accessors
// ----------------------------------------------------------------------------
export function getField(key) {
  return FIELDS_BY_KEY[key] || null;
}

export function getFieldsByCategory(categoryKey) {
  return FIELDS_BY_CATEGORY[categoryKey] || [];
}

export function getEditableFields() {
  return FIELD_DEFS.filter((f) => f.type !== 'computed');
}

export function getCategory(key) {
  return CATEGORIES.find((c) => c.key === key) || null;
}

/** Is the field shown in the form for this record? Legacy fields only when
 *  they hold a value; conditional fields only when their condition holds. */
export function fieldVisible(def, data) {
  if (!def) return false;
  if (def.legacy) return filled(data?.[def.key]);
  if (typeof def.showIf === 'function') return !!def.showIf(data || {});
  return true;
}

/** Is a whole category shown for this record? */
export function categoryVisible(cat, data) {
  if (!cat) return false;
  if (cat.legacy) return getFieldsByCategory(cat.key).some((f) => filled(data?.[f.key]));
  if (typeof cat.showIf === 'function') return !!cat.showIf(data || {});
  return true;
}

// ----------------------------------------------------------------------------
// Computed values
// ----------------------------------------------------------------------------
/**
 * Compute age in completed years from an ISO date string (YYYY-MM-DD).
 * Returns null when the input is empty, malformed or in the future.
 */
export function computeAge(dateNaissance, referenceDate = new Date()) {
  if (!dateNaissance) return null;
  const dob = new Date(dateNaissance);
  if (Number.isNaN(dob.getTime())) return null;
  if (dob > referenceDate) return null;
  let age = referenceDate.getFullYear() - dob.getFullYear();
  const m = referenceDate.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && referenceDate.getDate() < dob.getDate())) age--;
  return age;
}

function isoToday(referenceDate = new Date()) {
  const d = referenceDate;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAYS_PER_MONTH = 30.4375;

/**
 * Duration of a measure in months (one decimal). A measure without an end —
 * or with an end in the future — counts until today. Not started yet → null.
 */
export function durationMonths(start, end, referenceDate = new Date()) {
  if (!start || !ISO_DATE_RE.test(start)) return null;
  const today = isoToday(referenceDate);
  if (start > today) return null;
  const stop = end && ISO_DATE_RE.test(end) && end <= today ? end : today;
  const days = (new Date(stop) - new Date(start)) / 86400000;
  if (!Number.isFinite(days) || days < 0) return null;
  return Math.round((days / DAYS_PER_MONTH) * 10) / 10;
}

/** Measures present on a record: chosen in a slot or with a date. */
export function measuresPresent(c) {
  return MEASURES.filter((m) => hasMeasure(c, m.key) || filled(c?.[m.start]) || filled(c?.[m.end])).map((m) => m.key);
}

/** Measures running today (started, not ended). DS counts on its day only. */
export function measuresRunning(c, referenceDate = new Date()) {
  const today = isoToday(referenceDate);
  return MEASURES.filter((m) => {
    if (m.singleDay) return false;
    const s = c?.[m.start];
    const e = c?.[m.end];
    return !!s && s <= today && (!e || e >= today);
  }).map((m) => m.key);
}

/** Value of a computed field for a record (age, durations, measure lists). */
export function computeField(c, key, referenceDate = new Date()) {
  if (key === 'age') return computeAge(c?.date_naissance, referenceDate);
  const def = FIELDS_BY_KEY[key];
  if (!def || def.type !== 'computed') return c?.[key];
  if (def.measure) {
    const m = MEASURE_BY_KEY[def.measure];
    return durationMonths(c?.[m.start], c?.[m.end], referenceDate);
  }
  switch (key) {
    case 'dur_total': {
      const today = isoToday(referenceDate);
      const starts = MEASURES.filter((m) => !m.singleDay).map((m) => c?.[m.start]).filter((v) => v && ISO_DATE_RE.test(v) && v <= today);
      if (!starts.length) return null;
      const first = starts.sort()[0];
      const running = measuresRunning(c, referenceDate).length > 0;
      const ends = MEASURES.filter((m) => !m.singleDay).map((m) => c?.[m.end]).filter((v) => v && ISO_DATE_RE.test(v) && v <= today);
      const last = running || !ends.length ? today : ends.sort().slice(-1)[0];
      return durationMonths(first, last, referenceDate);
    }
    case 'age_band': {
      const a = computeAge(c?.date_naissance, referenceDate);
      if (a === null) return '';
      if (a <= 9) return 'up to 9';
      if (a >= 16) return '16 and older';
      const lo = a % 2 === 0 ? a : a - 1;
      return `${lo}–${lo + 1}`;
    }
    case 'n_measures':      return measuresPresent(c).length;
    case 'measures_all':    return measuresPresent(c);
    case 'measures_running': return measuresRunning(c, referenceDate);
    default:                return null;
  }
}

/** All computed values of a record (used when reading from storage). */
export function computedValues(c, referenceDate = new Date()) {
  const out = {};
  for (const f of FIELD_DEFS) if (f.type === 'computed') out[f.key] = computeField(c, f.key, referenceDate);
  return out;
}

// ----------------------------------------------------------------------------
// Older records → current schema (applied on read, never destructive)
// ----------------------------------------------------------------------------
/** Which specialised setting does an older free-text entry mean? */
export function specTypeOf(text) {
  const t = String(text || '').toLowerCase();
  if (!t) return null;
  if (/annexe|junglinster/.test(t)) return 'Annexe';
  if (/\bcst\b|socio-th/.test(t)) return 'CST';
  if (/participation|\bcdp\b|clapa/.test(t)) return 'CdP';
  return null;
}

const CC_BY_ACRONYM = Object.fromEntries(CC_OPTIONS.map((o) => [o.split(' — ')[0].toLowerCase(), o]));

/** Split an older free-text "Other CC" entry into list values. */
export function splitCcText(text) {
  return String(text || '')
    .split(/[,;\/+]|\s+(?:and|und|et)\s+/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const acr = s.replace(/[()]/g, ' ').trim().split(/\s+/)[0].toLowerCase();
      if (CC_BY_ACRONYM[acr]) return CC_BY_ACRONYM[acr];
      const full = CC_OPTIONS.find((o) => s.length > 6 && o.toLowerCase().includes(s.toLowerCase()));
      return full || s;
    })
    .filter((v, i, a) => a.indexOf(v) === i);
}

/**
 * Bring an older record up to the current schema — in memory only. Stored data
 * changes only when the case is saved again. Nothing is removed: the older
 * fields stay in the record (and in exports) for reference.
 */
export function normalizeCase(record) {
  if (!record || typeof record !== 'object') return record;
  const c = { ...record };
  // 1. Directions: the first prototype's list → official DR where unambiguous
  if (c.dir && DIR_LEGACY_MAP[c.dir]) c.dir = DIR_LEGACY_MAP[c.dir];
  // 2. One "specialized schooling" block → Annexe / CST / CdP
  const typ = specTypeOf(c.scolarisation_specialisee) || specTypeOf(c.spec_school);
  if (typ && (filled(c.debut_scol_spe) || filled(c.fin_scol_spe))) {
    const m = MEASURE_BY_KEY[typ];
    if (!filled(c[m.start]) && !filled(c[m.end])) {
      c[m.start] = c.debut_scol_spe || '';
      c[m.end] = c.fin_scol_spe || '';
    }
  }
  // 3. Measure slots that said "Spec. School."
  for (const s of MEASURE_SLOTS) if (c[s] === 'Spec. School.' && typ) c[s] = typ;
  // 4. "Other CC" free text → list
  if ((!Array.isArray(c.autres_cc) || !c.autres_cc.length) && filled(c.autre_cc_implique)) {
    c.autres_cc = splitCcText(c.autre_cc_implique);
  }
  return c;
}

// ----------------------------------------------------------------------------
// Validation
// ----------------------------------------------------------------------------
function isEmpty(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

/**
 * Validate a single field value against its definition.
 * Returns null when valid, or an English error message string.
 */
export function validateField(key, value) {
  const def = getField(key);
  if (!def) return `Unknown field: ${key}`;
  if (def.type === 'computed') return null;

  // Required check — empty + required = error; empty + optional = OK
  if (isEmpty(value)) {
    return def.required ? 'This field is required.' : null;
  }

  switch (def.type) {
    case 'text':
      if (typeof value !== 'string') return 'Text value expected.';
      return null;

    case 'number': {
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n)) return 'Invalid number.';
      if (def.min !== undefined && n < def.min) return `Minimum: ${def.min}.`;
      if (def.max !== undefined && n > def.max) return `Maximum: ${def.max}.`;
      return null;
    }

    case 'date':
      if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) {
        return 'Invalid date (format YYYY-MM-DD expected).';
      }
      if (Number.isNaN(new Date(value).getTime())) {
        return 'Invalid date.';
      }
      return null;

    case 'select':
      if (def.options?.includes(value) || def.legacyOptions?.includes(value)) return null;
      return `Value not allowed. Choices: ${def.options.join(', ')}.`;

    case 'tags':
      if (!Array.isArray(value)) return 'List of values expected.';
      if (value.some((t) => typeof t !== 'string')) return 'Each tag must be a string.';
      return null;

    default:
      return null;
  }
}

/**
 * Validate an entire case object. Returns:
 *   { valid: boolean, errors: { [key]: 'message' } }
 *
 * Field-local rules plus a few cross-field rules: an "Other" choice needs its
 * text, and end dates may not lie before start dates.
 */
export function validateCase(caseObj) {
  const errors = {};
  const editable = getEditableFields();
  for (const def of editable) {
    const err = validateField(def.key, caseObj?.[def.key]);
    if (err) errors[def.key] = err;
  }
  for (const def of editable) {
    if (def.otherField && caseObj?.[def.key] === 'Other' && isEmpty(caseObj?.[def.otherField])) {
      errors[def.otherField] = 'Please say what “Other” means.';
    }
  }
  if (MEASURE_SLOTS.some((s) => caseObj?.[s] === 'Other') && isEmpty(caseObj?.autre_mesure)) {
    errors.autre_mesure = 'Please say what the other measure is.';
  }
  for (const m of MEASURES) {
    if (m.singleDay) continue;
    const s = caseObj?.[m.start];
    const e = caseObj?.[m.end];
    if (s && e && ISO_DATE_RE.test(s) && ISO_DATE_RE.test(e) && e < s) errors[m.end] = 'The end lies before the start.';
  }
  return { valid: Object.keys(errors).length === 0, errors };
}
