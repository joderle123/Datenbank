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
//   computed  — derived at read time, never stored (e.g. `age`)
//
// Categories group fields into accordion sections of the create/edit form.
// The order of CATEGORIES is the display order; the order of FIELD_DEFS
// within a category is the order inside that section.
// ----------------------------------------------------------------------------

export const CATEGORIES = [
  { key: 'identification', label: 'Identification' },
  { key: 'demographics',   label: 'Demographics' },
  { key: 'structure',      label: 'School structure' },
  { key: 'mesures_cdse',   label: 'CDSE Measures' },
  { key: 'ds',             label: 'DS — Specialized Diagnostic' },
  { key: 'isa',            label: 'ISA — Socio-emotional Intervention' },
  { key: 'cg',             label: 'C&G — Counseling & Guidance' },
  { key: 'scol_spe',       label: 'Specialized Schooling' },
  { key: 'autre_mesure',   label: 'Other Measure' },
  { key: 'externe',        label: 'External Services' },
  { key: 'klinik',         label: 'Clinical Profile' },
  { key: 'background',     label: 'Family / Language Background' },
];

export const FIELD_DEFS = [
  // -- Identification -------------------------------------------------------
  { key: 'matricule',       label: 'National ID',         type: 'text', category: 'identification', required: true, unique: true, helpText: 'Luxembourg national ID (13 digits)' },
  { key: 'dossier_mfile',   label: 'M-File No.',          type: 'text', category: 'identification', helpText: 'Internal M-File case number' },
  { key: 'nom',             label: 'Last name',           type: 'text', category: 'identification', required: true },
  { key: 'prenom',          label: 'First name',          type: 'text', category: 'identification', required: true },
  { key: 'dito',            label: 'Alias',               type: 'text', category: 'identification', helpText: 'Other name the pupil is known by (nickname, second first name)' },

  // -- Demographics ---------------------------------------------------------
  { key: 'sexe',            label: 'Sex',                 type: 'select', category: 'demographics', options: ['M', 'F', 'D'] },
  { key: 'date_naissance',  label: 'Date of birth',       type: 'date',   category: 'demographics' },
  { key: 'age',             label: 'Age',                 type: 'computed', category: 'demographics', helpText: 'Computed from the date of birth' },

  // -- School structure -----------------------------------------------------
  { key: 'dir',             label: 'DIR',                 type: 'select', category: 'structure', options: ['DIR Centre', 'DIR East', 'DIR West', 'DIR South', 'DIR North'], helpText: 'Regional directorate — the geographic area the school belongs to' },
  { key: 'ecole_lycee',     label: 'School',              type: 'text',   category: 'structure', autocomplete: 'ecoles' },

  // -- CDSE Measures --------------------------------------------------------
  { key: 'mesure_cdse_1',   label: 'CDSE Measure 1',      type: 'select', category: 'mesures_cdse', options: ['DS', 'ISA', 'C&G', 'Spec. School.', 'Other'], helpText: 'Primary CDSE measure. DS = Specialized Diagnostic · ISA = Socio-emotional Intervention · C&G = Counseling & Guidance' },
  { key: 'mesure_cdse_2',   label: 'CDSE Measure 2',      type: 'select', category: 'mesures_cdse', options: ['DS', 'ISA', 'C&G', 'Spec. School.', 'Other'], helpText: 'Secondary CDSE measure, if any' },
  { key: 'mesure_cdse_3',   label: 'CDSE Measure 3',      type: 'select', category: 'mesures_cdse', options: ['DS', 'ISA', 'C&G', 'Spec. School.', 'Other'], helpText: 'Third CDSE measure, if any' },
  { key: 'date_decision_cni', label: 'CNI decision date', type: 'date', category: 'mesures_cdse', helpText: 'Date of the Commission Nationale d\'Inclusion decision' },

  // -- DS -------------------------------------------------------------------
  { key: 'ds_realise_par',  label: 'DS performed by',     type: 'text', category: 'ds', autocomplete: 'staff', helpText: 'DS = Specialized Diagnostic. Staff member who carried it out' },
  { key: 'date_ds',         label: 'DS date',             type: 'date', category: 'ds' },

  // -- ISA ------------------------------------------------------------------
  { key: 'isa_realise_par', label: 'ISA performed by',    type: 'text', category: 'isa', autocomplete: 'staff', helpText: 'ISA = Socio-emotional Intervention. Staff member in charge' },
  { key: 'debut_isa',       label: 'ISA start',           type: 'date', category: 'isa' },
  { key: 'fin_isa',         label: 'ISA end',             type: 'date', category: 'isa' },

  // -- C&G ------------------------------------------------------------------
  { key: 'cg_realise_par',  label: 'C&G performed by',    type: 'text', category: 'cg', autocomplete: 'staff', helpText: 'C&G = Counseling & Guidance. Staff member in charge' },
  { key: 'debut_cg',        label: 'C&G start',           type: 'date', category: 'cg' },
  { key: 'fin_cg',          label: 'C&G end',             type: 'date', category: 'cg' },

  // -- Specialized Schooling ------------------------------------------------
  { key: 'scolarisation_specialisee', label: 'Institution', type: 'text', category: 'scol_spe', autocomplete: 'institutions' },
  { key: 'debut_scol_spe',  label: 'Spec. schooling start', type: 'date', category: 'scol_spe' },
  { key: 'fin_scol_spe',    label: 'Spec. schooling end',   type: 'date', category: 'scol_spe' },

  // -- Other Measure --------------------------------------------------------
  { key: 'autre_mesure',       label: 'Other measure',        type: 'text', category: 'autre_mesure' },
  { key: 'debut_autre_mesure', label: 'Other measure start',  type: 'date', category: 'autre_mesure' },
  { key: 'fin_autre_mesure',   label: 'Other measure end',    type: 'date', category: 'autre_mesure' },

  // -- External Services ----------------------------------------------------
  { key: 'autre_cc_implique', label: 'Other C&C involved',  type: 'text',   category: 'externe', helpText: 'Other Centre de Compétences (specialised competence centre) involved with the case' },
  { key: 'autres_services',   label: 'Other services',      type: 'tags',   category: 'externe', helpText: 'Multiple values allowed (Enter to add)' },
  { key: 'scol_etranger',     label: 'Schooling abroad',    type: 'select', category: 'externe', options: ['Yes', 'No'] },

  // -- Clinical Profile -----------------------------------------------------
  { key: 'diagnostics',              label: 'Diagnoses',                type: 'tags',   category: 'klinik', helpText: 'ICD-10 / DSM-5 codes or free text' },
  { key: 'verdachtsdiagnosen_profil', label: 'Suspected diagnoses / Profile', type: 'tags', category: 'klinik', helpText: 'Working hypotheses or clinical profile, not yet a confirmed diagnosis' },
  { key: 'iq',                       label: 'IQ',                       type: 'number', category: 'klinik', min: 40, max: 160, helpText: 'Total IQ score (40–160 range)' },

  // -- Family / Language Background ------------------------------------------
  { key: 'langue_1', label: 'First language', type: 'select', category: 'background', options: ['LU', 'FR', 'DE', 'PT', 'EN', 'IT', 'ES', 'Other'], helpText: 'Main language spoken at home' },
  { key: 'parents',  label: 'Parents',  type: 'select', category: 'background', options: ['Together', 'Separated', 'Other'], helpText: 'Parental living situation' },
  { key: 'scas',     label: 'SCAS',     type: 'select', category: 'background', options: ['Yes', 'No'], helpText: 'SCAS = Service Central d\'Assistance Sociale. Is the SCAS involved in this case?' },
  { key: 'tutelle',  label: 'Guardianship',  type: 'select', category: 'background', options: ['Yes', 'No'], helpText: 'Is the pupil under legal guardianship?' },
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

// ----------------------------------------------------------------------------
// Validation
// ----------------------------------------------------------------------------
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
      if (!def.options || !def.options.includes(value)) {
        return `Value not allowed. Choices: ${def.options.join(', ')}.`;
      }
      return null;

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
 * Field-local only at this stage — cross-field rules (e.g. `fin_isa >= debut_isa`)
 * are layered on top in the form step.
 */
export function validateCase(caseObj) {
  const errors = {};
  const editable = getEditableFields();
  for (const def of editable) {
    const err = validateField(def.key, caseObj?.[def.key]);
    if (err) errors[def.key] = err;
  }
  return { valid: Object.keys(errors).length === 0, errors };
}
