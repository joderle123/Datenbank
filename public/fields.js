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
  { key: 'demographics',   label: 'Démographie' },
  { key: 'structure',      label: 'Structure scolaire' },
  { key: 'mesures_cdse',   label: 'Mesures CDSE' },
  { key: 'ds',             label: 'DS — Diagnostic spécialisé' },
  { key: 'isa',            label: 'ISA — Intervention socio-affective' },
  { key: 'cg',             label: 'C&G — Counseling & Guidance' },
  { key: 'scol_spe',       label: 'Scolarisation spécialisée' },
  { key: 'autre_mesure',   label: 'Autre mesure' },
  { key: 'externe',        label: 'Services externes' },
  { key: 'klinik',         label: 'Profil clinique' },
  { key: 'background',     label: 'Contexte familial / linguistique' },
];

export const FIELD_DEFS = [
  // -- Identification -------------------------------------------------------
  { key: 'matricule',       label: 'Matricule',           type: 'text', category: 'identification', required: true, unique: true, helpText: 'Matricule luxembourgeois (13 chiffres)' },
  { key: 'dossier_mfile',   label: 'Dossier M-File',      type: 'text', category: 'identification' },
  { key: 'nom',             label: 'Nom',                 type: 'text', category: 'identification', required: true },
  { key: 'prenom',          label: 'Prénom',              type: 'text', category: 'identification', required: true },
  { key: 'dito',            label: 'Dito',                type: 'text', category: 'identification' },

  // -- Demographics ---------------------------------------------------------
  { key: 'sexe',            label: 'Sexe',                type: 'select', category: 'demographics', options: ['M', 'F', 'D'] },
  { key: 'date_naissance',  label: 'Date de naissance',   type: 'date',   category: 'demographics' },
  { key: 'age',             label: 'Âge',                 type: 'computed', category: 'demographics', helpText: 'Calculé à partir de la date de naissance' },

  // -- Structure scolaire ---------------------------------------------------
  { key: 'dir',             label: 'DIR',                 type: 'select', category: 'structure', options: ['DIR Centre', 'DIR Est', 'DIR Ouest', 'DIR Sud', 'DIR Nord'] },
  { key: 'ecole_lycee',     label: 'École / Lycée',       type: 'text',   category: 'structure', autocomplete: 'ecoles' },

  // -- Mesures CDSE ---------------------------------------------------------
  { key: 'mesure_cdse_1',   label: 'Mesure CDSE 1',       type: 'select', category: 'mesures_cdse', options: ['DS', 'ISA', 'C&G', 'Scol. Spé.', 'Autre'] },
  { key: 'mesure_cdse_2',   label: 'Mesure CDSE 2',       type: 'select', category: 'mesures_cdse', options: ['DS', 'ISA', 'C&G', 'Scol. Spé.', 'Autre'] },
  { key: 'mesure_cdse_3',   label: 'Mesure CDSE 3',       type: 'select', category: 'mesures_cdse', options: ['DS', 'ISA', 'C&G', 'Scol. Spé.', 'Autre'] },
  { key: 'date_decision_cni', label: 'Date de décision CNI', type: 'date', category: 'mesures_cdse' },

  // -- DS -------------------------------------------------------------------
  { key: 'ds_realise_par',  label: 'DS réalisé par',      type: 'text', category: 'ds', autocomplete: 'staff' },
  { key: 'date_ds',         label: 'Date DS',             type: 'date', category: 'ds' },

  // -- ISA ------------------------------------------------------------------
  { key: 'isa_realise_par', label: 'ISA réalisé par',     type: 'text', category: 'isa', autocomplete: 'staff' },
  { key: 'debut_isa',       label: 'Début ISA',           type: 'date', category: 'isa' },
  { key: 'fin_isa',         label: 'Fin ISA',             type: 'date', category: 'isa' },

  // -- C&G ------------------------------------------------------------------
  { key: 'cg_realise_par',  label: 'C&G réalisé par',     type: 'text', category: 'cg', autocomplete: 'staff' },
  { key: 'debut_cg',        label: 'Début C&G',           type: 'date', category: 'cg' },
  { key: 'fin_cg',          label: 'Fin C&G',             type: 'date', category: 'cg' },

  // -- Scolarisation spécialisée -------------------------------------------
  { key: 'scolarisation_specialisee', label: 'Établissement', type: 'text', category: 'scol_spe', autocomplete: 'institutions' },
  { key: 'debut_scol_spe',  label: 'Début scolarisation spé.', type: 'date', category: 'scol_spe' },
  { key: 'fin_scol_spe',    label: 'Fin scolarisation spé.',   type: 'date', category: 'scol_spe' },

  // -- Autre mesure ---------------------------------------------------------
  { key: 'autre_mesure',       label: 'Autre mesure',         type: 'text', category: 'autre_mesure' },
  { key: 'debut_autre_mesure', label: 'Début autre mesure',   type: 'date', category: 'autre_mesure' },
  { key: 'fin_autre_mesure',   label: 'Fin autre mesure',     type: 'date', category: 'autre_mesure' },

  // -- Services externes ----------------------------------------------------
  { key: 'autre_cc_implique', label: 'Autre C&C impliqué',  type: 'text',   category: 'externe' },
  { key: 'autres_services',   label: 'Autres services',     type: 'tags',   category: 'externe', helpText: 'Plusieurs valeurs possibles (Enter pour ajouter)' },
  { key: 'scol_etranger',     label: "Scolarisation à l'étranger", type: 'select', category: 'externe', options: ['Oui', 'Non'] },

  // -- Profil clinique ------------------------------------------------------
  { key: 'diagnostics',              label: 'Diagnostics',              type: 'tags',   category: 'klinik', helpText: 'Codes ICD-10 / DSM-5 ou texte libre' },
  { key: 'verdachtsdiagnosen_profil', label: 'Verdachtsdiagnosen / Profil', type: 'tags', category: 'klinik' },
  { key: 'iq',                       label: 'QI',                       type: 'number', category: 'klinik', min: 40, max: 160 },

  // -- Contexte familial / linguistique ------------------------------------
  { key: 'langue_1', label: 'Langue 1', type: 'select', category: 'background', options: ['LU', 'FR', 'DE', 'PT', 'EN', 'IT', 'ES', 'Autre'] },
  { key: 'parents',  label: 'Parents',  type: 'select', category: 'background', options: ['Ensemble', 'Séparés', 'Autre'] },
  { key: 'scas',     label: 'SCAS',     type: 'select', category: 'background', options: ['Oui', 'Non'] },
  { key: 'tutelle',  label: 'Tutelle',  type: 'select', category: 'background', options: ['Oui', 'Non'] },
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
 * Returns null when valid, or a French error message string.
 */
export function validateField(key, value) {
  const def = getField(key);
  if (!def) return `Champ inconnu: ${key}`;
  if (def.type === 'computed') return null;

  // Required check — empty + required = error; empty + optional = OK
  if (isEmpty(value)) {
    return def.required ? 'Ce champ est obligatoire.' : null;
  }

  switch (def.type) {
    case 'text':
      if (typeof value !== 'string') return 'Valeur textuelle attendue.';
      return null;

    case 'number': {
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n)) return 'Nombre invalide.';
      if (def.min !== undefined && n < def.min) return `Minimum: ${def.min}.`;
      if (def.max !== undefined && n > def.max) return `Maximum: ${def.max}.`;
      return null;
    }

    case 'date':
      if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) {
        return 'Date invalide (format AAAA-MM-JJ attendu).';
      }
      if (Number.isNaN(new Date(value).getTime())) {
        return 'Date invalide.';
      }
      return null;

    case 'select':
      if (!def.options || !def.options.includes(value)) {
        return `Valeur non autorisée. Choix: ${def.options.join(', ')}.`;
      }
      return null;

    case 'tags':
      if (!Array.isArray(value)) return 'Liste de valeurs attendue.';
      if (value.some((t) => typeof t !== 'string')) return 'Chaque tag doit être une chaîne.';
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
 * are layered on top in the form step (Step 7).
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

