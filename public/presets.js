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

// All Luxembourg secondary establishments (public + main private), plus the
// European Schools and ISL, and the cycle-4 fondamental option for younger
// referrals. Not exhaustive — extend on demand.
export const LYCEES_LUXEMBOURG = [
  // Public — Luxembourg-Ville
  'Athénée de Luxembourg',
  'Lycée de Garçons de Luxembourg (LGL)',
  'Lycée Aline Mayrisch (LAML)',
  'Lycée Michel-Rodange Luxembourg (LMRL)',
  'Lycée Robert-Schuman',
  'Lycée Technique du Centre',
  'Lycée Technique des Arts et Métiers',
  'Lycée Technique de Bonnevoie',
  'Lycée Technique École de Commerce et de Gestion (ECG)',
  'Lycée Technique Michel-Lucius',
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

  // Younger referrals
  'Enseignement fondamental — Cycle 4',
];

// Centres de compétences spécialisés (référencement officiel MENJE)
// Used for the `scolarisation_specialisee` field.
export const INSTITUTIONS_SPECIALISEES = [
  'Centre de Logopédie (CL)',
  'Centre pour le Développement Intellectuel (CDI)',
  'Centre pour le Développement Moteur (CDM)',
  'Centre pour le Développement des Apprentissages (CDA Schweech)',
  'Centre pour le Développement Socio-Émotionnel (CDSE)',
  'Centre pour le Développement des Compétences relatives à la Vue (CDV)',
  'Centre pour le Développement des Compétences relatives à l\'Ouïe (CDA)',
  'Centre pour Enfants et Jeunes Présentant un Trouble du Spectre de l\'Autisme (CTSA)',
  'Institut Robert-Schuman',
  'Institut pour Enfants Autistiques et Psychotiques (IEAP)',
  'École Spécialisée Différenciée',
];

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
  'SPOS — Service Psycho-Social et d\'Orientation Scolaire',
  'Maison Relais',
  'Foyer de jour',
  'Médecin scolaire',
  'Service d\'éducation et d\'accueil (SEA)',
];

// ICD-10 codes common in child & adolescent psycho-pediatric work.
// Stored as the full string so exports stay readable.
export const DIAGNOSTICS_COMMUNS = [
  'F90.0 — TDAH, type inattention',
  'F90.1 — TDAH, type combiné',
  'F90.9 — TDAH, non spécifié',
  'F84.0 — Autisme infantile',
  'F84.5 — Syndrome d\'Asperger',
  'F84.9 — TSA, non spécifié',
  'F81.0 — Dyslexie',
  'F81.2 — Dyscalculie',
  'F81.3 — Troubles mixtes des acquisitions scolaires',
  'F81.9 — Trouble des apprentissages, non spécifié',
  'F32.0 — Épisode dépressif léger',
  'F32.1 — Épisode dépressif moyen',
  'F32.2 — Épisode dépressif sévère',
  'F33.x — Trouble dépressif récurrent',
  'F41.0 — Trouble panique',
  'F41.1 — Anxiété généralisée',
  'F41.2 — Trouble anxio-dépressif mixte',
  'F43.1 — État de stress post-traumatique',
  'F43.2 — Troubles de l\'adaptation',
  'F92.0 — Trouble des conduites, dépressif',
  'F93.0 — Anxiété de séparation',
  'F94.0 — Mutisme sélectif',
  'F95.0 — Tic transitoire',
  'F95.2 — Tourette',
  'F98.0 — Énurésie non organique',
  'F98.1 — Encoprésie non organique',
  'Z73.0 — Surmenage / Burn-out',
  'HPI — Haut potentiel intellectuel',
];

// Suspicions and clinical profiles (less formal than ICD-10)
export const VERDACHTSDIAGNOSEN_COMMUNS = [
  'Suspicion TDAH',
  'Suspicion TSA',
  'Suspicion HPI',
  'Suspicion dyslexie',
  'Suspicion dyscalculie',
  'Profil mixte',
  'Profil exécutif',
  'Profil attentionnel',
  'Profil émotionnel',
  'Trouble du comportement',
  'Refus scolaire / phobie scolaire',
  'Anxiété de performance',
  'Difficultés sociales',
  'Difficultés familiales',
];

// Mapping from field key → preset list. Consumed by the form UI.
export const FIELD_PRESETS = {
  ecole_lycee:               LYCEES_LUXEMBOURG,
  scolarisation_specialisee: INSTITUTIONS_SPECIALISEES,
  autres_services:           AUTRES_SERVICES_COMMUNS,
  diagnostics:               DIAGNOSTICS_COMMUNS,
  verdachtsdiagnosen_profil: VERDACHTSDIAGNOSEN_COMMUNS,
};

export function presetsForField(fieldKey) {
  return FIELD_PRESETS[fieldKey] || [];
}
