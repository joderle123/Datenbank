// public/presets.js
// ----------------------------------------------------------------------------
// CDSE Stats — preset value libraries
// ----------------------------------------------------------------------------
// Closed (or nearly-closed) sets of values for fields where typing is wasteful:
// schools, specialized centres, common diagnostic codes, social services.
//
// Conventions
//   - Lists are stable and ordered the way users want to read them
//     (most commonly used near the top where it matters).
//   - User-added values (via the autocomplete vocab) extend these
//     transparently at the UI layer — presets are *suggestions*, never
//     a forced whitelist. Free text remains possible everywhere.
//   - Diagnostics are stored as "F90.0 — Trouble de l'attention/hyperactivité"
//     so exports and the detail view stay human-readable. Staff who prefer
//     bare codes can still type them.
// ----------------------------------------------------------------------------

import { CC_OPTIONS } from './fields.js';

// Default school suggestions: Luxembourg secondary schools (public + main
// private), the European Schools and ISL. Suggestions only — the list is
// edited under Settings → Lists (écoles fondamentales can be added there),
// and any other name can be typed in the form.
export const LYCEES_LUXEMBOURG = [
  // Public — Luxembourg-Ville
  'Athénée de Luxembourg',
  'Lycée de Garçons de Luxembourg (LGL)',
  'Lycée Aline Mayrisch (LAML)',
  'Lycée Michel-Rodange Luxembourg (LMRL)',
  'Lycée Robert-Schuman',
  'Lycée Technique du Centre',
  'Lycée des Arts et Métiers (LAM)',
  'Lycée Technique de Bonnevoie',
  'Lycée Technique École de Commerce et de Gestion (ECG)',
  'Lycée Michel-Lucius (LML)',
  'Lycée Technique pour Professions de Santé (LTPS)',
  'Sportlycée Luxembourg',

  // Public — Sud
  'Lycée Hubert-Clément (LHCE) — Esch',
  'Lycée de Garçons d\'Esch (LGE)',
  'Lycée Technique d\'Esch (LTE)',
  'Lycée Nic-Biever — Dudelange',
  'Lycée Bel-Val — Esch',
  'Lycée Guillaume Kroll — Esch',
  'Lycée Technique Mathias-Adam (LTMA) — Pétange / Lamadelaine',

  // Public — Centre / Ouest
  'Lycée Josy-Barthel — Mamer (LJBM)',
  'Lycée Ermesinde — Mersch',
  'Atert-Lycée — Redange',
  'Lënster Lycée International School — Junglinster (LLIS)',

  // Public — Est
  'Lycée Classique d\'Echternach (LCE)',
  'Lycée Technique Joseph-Bech — Grevenmacher',
  'Maacher Lycée — Grevenmacher',

  // Public — Nord
  'Lycée Classique de Diekirch (LCD)',
  'Lycée Technique d\'Ettelbruck (LTEtt)',
  'Nordstad-Lycée — Diekirch',
  'Lycée Edward Steichen — Clervaux (LESC)',
  'Lycée Technique Agricole — Ettelbruck',

  // Privé (Luxembourg)
  'École Privée Fieldgen',
  'École Privée Marie-Consolatrice — Esch',
  'École Privée Notre-Dame Sainte-Sophie',
  'Lycée Privé Emile-Metz',
  'Lycée Privé Sainte-Anne — Ettelbruck',

  // International
  'École Européenne Luxembourg I (Kirchberg)',
  'École Européenne Luxembourg II (Mamer / Bertrange)',
  'International School of Luxembourg (ISL)',
  'St George\'s International School',

];

// The other Centres de compétences — see CC_OPTIONS in fields.js.

// Common social services / referrers in Luxembourg
export const AUTRES_SERVICES_COMMUNS = [
  'ONE — Office National de l\'Enfance',
  'SCAS — Service Central d\'Assistance Sociale',
  'ALUPSE — Aide aux victimes de maltraitance',
  'KannerJugendTelefon (KJT)',
  'Caritas Jeunes & Familles',
  'Croix-Rouge — Aide à l\'enfance',
  'Inter-Actions',
  'ANCES — Aide à l\'Enfance',
  'Pro Familia',
  'SePAS — Service psycho-social et d\'accompagnement scolaires',
  'Maison Relais',
  'Foyer de jour',
  'Médecin scolaire',
  'Service d\'éducation et d\'accueil (SEA)',
];

// ICD-10 codes common in child & adolescent psycho-pediatric work.
// Stored as the full string so exports stay readable.
export const DIAGNOSTICS_COMMUNS = [
  'F90.0 — ADHD, predominantly inattentive',
  'F90.1 — ADHD, combined type',
  'F90.9 — ADHD, unspecified',
  'F84.0 — Childhood autism',
  'F84.5 — Asperger syndrome',
  'F84.9 — ASD, unspecified',
  'F81.0 — Dyslexia',
  'F81.2 — Dyscalculia',
  'F81.3 — Mixed disorder of scholastic skills',
  'F81.9 — Learning disorder, unspecified',
  'F32.0 — Mild depressive episode',
  'F32.1 — Moderate depressive episode',
  'F32.2 — Severe depressive episode',
  'F33.x — Recurrent depressive disorder',
  'F41.0 — Panic disorder',
  'F41.1 — Generalized anxiety',
  'F41.2 — Mixed anxiety-depressive disorder',
  'F43.1 — Post-traumatic stress disorder',
  'F43.2 — Adjustment disorders',
  'F92.0 — Depressive conduct disorder',
  'F93.0 — Separation anxiety',
  'F94.0 — Selective mutism',
  'F95.0 — Transient tic',
  'F95.2 — Tourette',
  'F98.0 — Non-organic enuresis',
  'F98.1 — Non-organic encopresis',
  'Z73.0 — Burn-out',
  'GIP — Gifted / high intellectual potential',
];

// Suspicions and clinical profiles (less formal than ICD-10)
export const VERDACHTSDIAGNOSEN_COMMUNS = [
  'Suspected ADHD',
  'Suspected ASD',
  'Suspected giftedness',
  'Suspected dyslexia',
  'Suspected dyscalculia',
  'Mixed profile',
  'Executive profile',
  'Attentional profile',
  'Emotional profile',
  'Behavioural disorder',
  'School refusal / school phobia',
  'Performance anxiety',
  'Social difficulties',
  'Family difficulties',
];

// Common holders of legal guardianship in the CDSE population.
// Stored as plain strings so multiple holders can be picked at once
// (e.g. "Mother" + "Foyer" for shared custody with a residential placement).
export const TUTELLE_COMMUNS = [
  'Mother',
  'Father',
  'Both parents',
  'Foyer',
  'Foster family',
  'Legal guardian',
  'ONE — Office National de l\'Enfance',
  'Other',
];

// Family-side support measures commonly attached to a CDSE case.
// French institutional names kept as-is (official terminology).
export const MESURES_FAMILLE_COMMUNS = [
  'Assistance familiale (ONE)',
  'Aide éducative en milieu ouvert (AEMO)',
  'Foyer / placement résidentiel',
  'Famille d\'accueil',
  'Suivi SCAS',
  'Suivi ONE',
  'ALUPSE',
  'Thérapie familiale',
  'Médiation familiale',
  'Other',
];

// Mapping from field key → preset list. Consumed by the form UI.
// Shown as clickable chips above the input. Long lists (schools, ateliers)
// are offered as type-ahead suggestions instead — see DEFAULT_LISTS.
export const FIELD_PRESETS = {
  autres_cc:                 CC_OPTIONS,
  autres_services:           AUTRES_SERVICES_COMMUNS,
  diagnostics:               DIAGNOSTICS_COMMUNS,
  verdachtsdiagnosen_profil: VERDACHTSDIAGNOSEN_COMMUNS,
  tutelle:                   TUTELLE_COMMUNS,
  mesures_famille:           MESURES_FAMILLE_COMMUNS,
};

export function presetsForField(fieldKey) {
  return FIELD_PRESETS[fieldKey] || [];
}

// Editable lists (Settings → Lists). Until someone edits a list, these are
// the suggestions. Ateliers and rééducation types start empty: the CDSE
// fills in its own offer.
export const DEFAULT_LISTS = {
  schools: LYCEES_LUXEMBOURG,
  ateliers: [],
  reeducation: [],
};
