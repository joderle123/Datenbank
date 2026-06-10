// public/query-parser.js
// ----------------------------------------------------------------------------
// Natural-language → Query Builder config.
// ----------------------------------------------------------------------------
// A small, pattern-based parser. NOT a language model. Everything happens
// locally in the browser; no text leaves the client. DSGVO-safe by
// construction.
//
// Scope: the questions CDSE staff actually ask in a hallway conversation.
// English-first with the most obvious German/French/Luxembourgish keywords
// thrown in (girls = filles = Mädchen, average = moyenne = Durchschnitt).
//
// Pipeline (six passes, each can fail without aborting the rest):
//   1. tokenize + lowercase, preserve the original string for echoing
//   2. detect aggregation function — mean, count, sum, max, min, median, stddev
//   3. detect numeric variable for non-count aggregations
//   4. detect 'by X' / 'per X' → group-by candidate
//   5. detect filter clauses: sex synonyms, 'aged N to M', 'in <DIR>',
//      'with <diagnosis>', schools
//   6. assemble the Query Builder config + an English sentence preview +
//      the list of unmatched tokens (so the UI can be honest about what was
//      not understood)
//
// Output shape:
//   {
//     understood: boolean,           // did we extract anything actionable?
//     config:     { aggregations, filters, groupBy },
//     sentence:   'Average IQ for cases where Sex = F and ...',
//     unmatched:  ['foobar'],        // tokens not consumed
//     suggestions:['Try "average iq by sex"', ...],
//     confidence: 'high' | 'low' | 'none',
//   }
// ----------------------------------------------------------------------------

const AGG_KEYWORDS = [
  // longest patterns first so 'how many' wins over 'how' alone
  { fn: 'count',  patterns: ['how many', 'number of cases', 'count of', 'how much', 'wie viele', 'wieviel', 'wéivill', 'combien'] },
  { fn: 'count',  patterns: ['count', 'total cases', 'tally'] },
  { fn: 'mean',   patterns: ['average', 'avg', 'mean', 'durchschnitt', 'durchschnittlich', 'moyenne', 'moyen', 'duerchschnëtt'] },
  { fn: 'median', patterns: ['median'] },
  { fn: 'sum',    patterns: ['sum', 'total', 'gesamt', 'insgesamt', 'somme'] },
  { fn: 'max',    patterns: ['max', 'maximum', 'highest', 'largest', 'most', 'höchste', 'maximale', 'plus haut'] },
  { fn: 'min',    patterns: ['min', 'minimum', 'lowest', 'smallest', 'least', 'niedrigste', 'minimale', 'plus bas'] },
  { fn: 'stddev', patterns: ['standard deviation', 'std deviation', 'stddev', 'standardabweichung'] },
];

const GROUP_BY_KEYWORDS = ['grouped by', 'broken down by', 'aufgeteilt nach', 'aufgesplittet nach', 'par', 'by', 'per', 'nach', 'a per'];

const FILTER_INTROS = ['where', 'for', 'in', 'with', 'having', 'from', 'avec', 'pour', 'für', 'mat', 'fir'];

// 'girls' → sexe = F, etc. Includes Luxembourgish and the common German /
// French spellings staff actually type.
const VALUE_SYNONYMS = {
  sexe: {
    F: ['girl', 'girls', 'female', 'females', 'mädchen', 'meedercher', 'meedchen', 'fille', 'filles', 'f', 'wëblech'],
    M: ['boy', 'boys', 'male', 'males', 'jungen', 'junge', 'jongen', 'garçon', 'garçons', 'm', 'männlech'],
    D: ['diverse', 'non-binary', 'nonbinary', 'd'],
  },
};

// Diagnostic shorthands → search needles for the diagnostics tag field.
const DIAGNOSIS_SHORTHANDS = [
  { search: 'ADHD',    aliases: ['adhd', 'add', 'hyperactivity', 'hyperaktivität', 'tdah'] },
  { search: 'autism',  aliases: ['autism', 'autistic', 'asd', 'autismus', 'autisme'] },
  { search: 'Asperger',aliases: ['asperger'] },
  { search: 'dyslexia',aliases: ['dyslexia', 'legasthenie', 'dyslexie'] },
  { search: 'dyscalc', aliases: ['dyscalculia', 'dyskalkulie'] },
  { search: 'anxiety', aliases: ['anxiety', 'anxieux', 'angst', 'angststörung'] },
  { search: 'depres',  aliases: ['depression', 'depressiv', 'dépression'] },
  { search: 'PTSD',    aliases: ['ptsd', 'trauma', 'post-traumatic'] },
  { search: 'phobia',  aliases: ['phobia', 'phobie', 'school refusal'] },
  { search: 'GIP',     aliases: ['gifted', 'giftedness', 'hochbegabt'] },
];

// Pre-baked example questions surfaced as clickable chips in the UI.
export const NATURAL_EXAMPLES = [
  'count by DIR',
  'average IQ of girls',
  'how many boys with ADHD',
  'mean age by sex',
  'count by diagnosis',
  'girls aged 12 to 14',
  'average IQ of boys with autism in DIR Esch',
];

// ----------------------------------------------------------------------------

function normalise(text) {
  // strip leading question words and trailing punctuation; keep slashes and
  // dashes because DIR names contain them ('DIR Clervaux/Wiltz')
  return text
    .toLowerCase()
    .replace(/[?!.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find a keyword match in the text (longest patterns first).
 *   mode 'first' — leftmost match (used for the aggregation function)
 *   mode 'last'  — rightmost match (used for group-by, because 'X per case
 *                  by Y' should snap to the trailing 'by Y' instead of the
 *                  idiomatic 'per case')
 * Returns { matched, startsAt, endsAt } or null.
 */
function findKeyword(text, patterns, mode = 'first') {
  // longest first so 'broken down by' wins over 'by'
  const sorted = [...patterns].sort((a, b) => b.length - a.length);
  let best = null;
  for (const p of sorted) {
    const re = new RegExp(`(?:^|\\s)(${escapeRe(p)})(?=\\s|$)`, 'gi');
    for (const m of text.matchAll(re)) {
      const start = m.index + (m[0].length - m[1].length);
      const cand = { matched: m[1], startsAt: start, endsAt: start + m[1].length };
      if (!best) { best = cand; continue; }
      if (mode === 'first' && start < best.startsAt) best = cand;
      if (mode === 'last'  && start > best.startsAt) best = cand;
    }
  }
  return best;
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// ----------------------------------------------------------------------------
// Field resolvers — fuzzy match a fragment ('esch', 'sex', 'diagnosis')
// against the actual schema.
// ----------------------------------------------------------------------------

/** Score how well the user's fragment matches a field's label or key.
 *  Higher is better. 0 = no match. */
function scoreField(fragment, field) {
  const frag = fragment.toLowerCase().trim();
  if (!frag) return 0;
  const label = (field.label || '').toLowerCase();
  const key   = (field.key   || '').toLowerCase();
  if (label === frag || key === frag) return 100;
  // 'sex' → 'sexe', 'diagnosis' → 'diagnoses' (drop trailing s/e)
  const stem = frag.replace(/(es|s)$/, '');
  if (label.startsWith(frag) || key.startsWith(frag)) return 80;
  if (label.startsWith(stem) || key.startsWith(stem)) return 70;
  if (label.includes(' ' + frag) || label.includes('-' + frag)) return 60;
  if (label.includes(frag) || key.includes(frag)) return 40;
  if (stem.length >= 3 && (label.includes(stem) || key.includes(stem))) return 30;
  return 0;
}

function resolveGroupableField(fragment, groupableFields) {
  const ranked = groupableFields
    .map((f) => ({ f, s: scoreField(fragment, f) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  // friendly synonyms first: 'sex' → 'sexe', 'diagnosis' → 'diagnostics'
  const SYN = {
    sex: 'sexe', gender: 'sexe',
    diagnosis: 'diagnostics', diagnoses: 'diagnostics',
    school: 'ecole_lycee', lycee: 'ecole_lycee', lycée: 'ecole_lycee',
    language: 'langue_1',
    guardian: 'tutelle', guardianship: 'tutelle',
  };
  const direct = SYN[fragment.toLowerCase().trim()];
  if (direct) {
    const f = groupableFields.find((x) => x.key === direct);
    if (f) return f;
  }
  return ranked[0]?.f || null;
}

function resolveNumericVariable(fragment, numericFields) {
  const frag = fragment.toLowerCase().trim();
  // 'iq', 'age' → exact key
  for (const nf of numericFields) {
    if (nf.key.toLowerCase() === frag) return nf;
    if ((nf.label || '').toLowerCase() === frag) return nf;
  }
  // 'number of diagnoses', 'diagnoses count' → n_diagnostics
  const SYN = {
    'iq': 'iq',
    'age': 'age',
    'number of diagnoses': 'n_diagnostics',
    'count of diagnoses':  'n_diagnostics',
    'diagnoses count':     'n_diagnostics',
    'number of suspected diagnoses': 'n_verdachts',
    'number of family measures': 'n_mesures_famille',
    'number of services': 'n_autres_services',
    'number of guardians':'n_tutelle',
    'guardianship holders': 'n_tutelle',
  };
  if (SYN[frag]) {
    const f = numericFields.find((x) => x.key === SYN[frag]);
    if (f) return f;
  }
  // fuzzy fallback
  const ranked = numericFields
    .map((f) => ({ f, s: scoreField(fragment, f) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  return ranked[0]?.f || null;
}

/**
 * Match a fragment ('esch', 'capellen') against a select field's option list,
 * preferring word-boundary hits over mid-token substrings so 'esch' picks
 * 'DIR Esch-sur-Alzette' instead of mistakenly matching 'DIR Echternach'.
 */
function resolveSelectValue(fragment, options) {
  const target = fragment.toLowerCase().trim();
  if (!target) return null;
  const scored = options.map((opt) => {
    const lo = opt.toLowerCase();
    if (lo === target) return { opt, score: 100 };
    // Split on spaces, dashes and slashes so each option chunk is a word
    const tokens = lo.split(/[\s/\-]/).filter(Boolean);
    if (tokens.some((t) => t === target)) return { opt, score: 90 };
    if (tokens.some((t) => t.startsWith(target))) return { opt, score: 70 };
    if (lo.includes(' ' + target) || lo.includes('-' + target) || lo.includes('/' + target)) return { opt, score: 50 };
    if (lo.includes(target)) return { opt, score: 20 };
    return { opt, score: 0 };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  if (!scored.length) return null;
  // Unambiguous (single top score or clear winner)
  const top = scored[0];
  const tied = scored.filter((x) => x.score === top.score);
  return { value: top.opt, ambiguous: tied.length > 1 ? tied.map((x) => x.opt) : null };
}

// ----------------------------------------------------------------------------
// Main parser
// ----------------------------------------------------------------------------

export function parseQuestion(rawText, opts) {
  const {
    fieldDefs = [],
    numericFields = [],
    presets = {},
    dirOptions = [],
    schoolPresets = [],
  } = opts || {};

  // An always-valid baseline so consumers can call the parser with an empty
  // string without special-casing: empty input yields 'count all cases'.
  const config = { aggregations: [{ fn: 'count', field: null }], filters: [], groupBy: '' };
  const text = normalise(rawText || '');
  if (!text) {
    return {
      understood: false, config,
      sentence: 'Count of cases.',
      unmatched: [], suggestions: NATURAL_EXAMPLES.slice(0, 3), confidence: 'none',
    };
  }

  const groupableFields = fieldDefs.filter(
    (f) => ['select', 'text', 'tags'].includes(f.type),
  );

  // ----- Pass 1: aggregation function -------------------------------------
  let agg = null;
  let aggHit = null;
  for (const k of AGG_KEYWORDS) {
    const hit = findKeyword(text, k.patterns);
    if (hit && (!aggHit || hit.startsAt < aggHit.startsAt)) {
      agg = k.fn;
      aggHit = hit;
    }
  }
  // Default: count
  if (!agg) agg = 'count';

  // ----- Pass 2: 'by X' / 'per X' group-by --------------------------------
  // Cut the text into segments around the first group-by keyword. Everything
  // BEFORE it informs the aggregation; everything AFTER, the group-by.
  let groupBySegment = '';
  let preGroupText = text;
  // 'last' so 'X per case by Y' lands on the trailing 'by Y'
  const gbHit = findKeyword(text, GROUP_BY_KEYWORDS, 'last');
  if (gbHit) {
    preGroupText = text.slice(0, gbHit.startsAt).trim();
    groupBySegment = text.slice(gbHit.endsAt).trim();
  }

  // ----- Pass 3: numeric variable (only for non-count aggs) ---------------
  let numVar = null;
  if (agg !== 'count') {
    // The variable is usually the noun right after the agg keyword:
    //   'average IQ of girls' → 'iq'
    //   'mean age by sex'     → 'age'
    //   'sum of number of diagnoses by dir' → 'number of diagnoses'
    // aggHit positions are indexed into `text`; preGroupText is text[0..gbHit.startsAt],
    // so aggHit.endsAt is valid inside preGroupText too.
    let after = preGroupText;
    if (aggHit) after = preGroupText.slice(aggHit.endsAt).trim();
    // strip leading 'of'
    after = after.replace(/^of\s+/, '');
    // strip everything after first filter intro
    const filterCut = findKeyword(' ' + after, FILTER_INTROS);
    if (filterCut) after = after.slice(0, filterCut.startsAt - 1).trim();
    // Try every prefix length, longest first. Catches multi-word
    // synonyms like 'number of guardians' (3 tokens) without needing
    // an entry for every possible 'X per case' suffix the user might type.
    const toks = after.split(' ').filter(Boolean);
    for (let n = toks.length; n >= 1; n--) {
      const found = resolveNumericVariable(toks.slice(0, n).join(' '), numericFields);
      if (found) { numVar = found; break; }
    }
  }

  // ----- Pass 4: group-by resolution --------------------------------------
  let groupBy = '';
  if (groupBySegment) {
    // chop at next filter intro
    const filterCut = findKeyword(' ' + groupBySegment, FILTER_INTROS);
    const piece = filterCut ? groupBySegment.slice(0, filterCut.startsAt - 1).trim() : groupBySegment;
    // Same prefix-shrinking strategy as for the numeric variable.
    const toks = piece.split(' ').filter(Boolean);
    for (let n = toks.length; n >= 1; n--) {
      const found = resolveGroupableField(toks.slice(0, n).join(' '), groupableFields);
      if (found) { groupBy = found.key; break; }
    }
  }

  // ----- Pass 5: filter detection -----------------------------------------
  // Operate on the full text — filter words can appear anywhere.
  const filters = [];

  // Sex synonyms
  for (const [sexValue, words] of Object.entries(VALUE_SYNONYMS.sexe)) {
    for (const w of words) {
      // Skip the single-letter ambiguous codes ('f', 'm', 'd') unless surrounded by 'sex'
      if (w.length === 1) continue;
      const re = new RegExp(`(^|\\s)${escapeRe(w)}(?=\\s|$)`, 'i');
      if (re.test(text)) {
        filters.push({ field: 'sexe', op: 'eq', value: sexValue });
        break;
      }
    }
  }

  // Age ranges and equalities
  const ageRange = text.match(/aged?\s+(\d+)\s*(?:to|-|until|bis|à)\s+(\d+)/i)
                || text.match(/between\s+(\d+)\s+and\s+(\d+)\s+years?/i)
                || text.match(/(\d+)\s+to\s+(\d+)\s+years?\s+old/i);
  if (ageRange) {
    filters.push({ field: 'age', op: 'between', value: Number(ageRange[1]), value2: Number(ageRange[2]) });
  } else {
    const ageEq = text.match(/aged\s+(\d+)\b/i) || text.match(/(\d+)\s+years?\s+old/i);
    if (ageEq) filters.push({ field: 'age', op: 'eq', value: Number(ageEq[1]) });
  }

  // Diagnoses ('with ADHD', 'having autism', 'asd kids')
  for (const d of DIAGNOSIS_SHORTHANDS) {
    for (const alias of d.aliases) {
      const re = new RegExp(`(^|\\s)${escapeRe(alias)}(?=\\s|$)`, 'i');
      if (re.test(text)) {
        filters.push({ field: 'diagnostics', op: 'contains', value: d.search });
        break;
      }
    }
  }

  // DIR / region — 'in dir esch', 'in capellen', 'dir clervaux'.
  // Important: the optional second segment must only allow '/' and '-' (not
  // whitespace), otherwise greedy matching pulls trailing context like ' with
  // adhd' into the captured region name.
  const dirMatch = text.match(/(?:^|\s)dir\s+([a-zà-ÿ]+(?:[/\-][a-zà-ÿ]+)*)/i)
                || text.match(/(?:^|\s)in\s+([a-zà-ÿ]+)(?=\s|$)/i);
  if (dirMatch && dirOptions.length) {
    const found = resolveSelectValue(dirMatch[1], dirOptions);
    if (found && !found.ambiguous) {
      filters.push({ field: 'dir', op: 'eq', value: found.value });
    } else if (found && found.ambiguous) {
      // ambiguous → use the user fragment with contains
      filters.push({ field: 'dir', op: 'contains', value: dirMatch[1].charAt(0).toUpperCase() + dirMatch[1].slice(1) });
    }
  }

  // School — look for 'school <name>' or known school keyword
  // (kept light: only triggers on explicit 'school' prefix to avoid false positives)
  const schoolMatch = text.match(/(?:^|\s)(?:school|lycee|lycée|gymnasium)\s+([\wÀ-ſ-]+(?:\s[\wÀ-ſ-]+){0,3})/i);
  if (schoolMatch && schoolPresets.length) {
    const found = resolveSelectValue(schoolMatch[1], schoolPresets);
    if (found && !found.ambiguous) {
      filters.push({ field: 'ecole_lycee', op: 'eq', value: found.value });
    } else if (found) {
      filters.push({ field: 'ecole_lycee', op: 'contains', value: schoolMatch[1] });
    }
  }

  // ----- Pass 6: assemble config + English sentence + honest unmatched ----
  if (agg === 'count') {
    config.aggregations = [{ fn: 'count', field: null }];
  } else if (numVar) {
    config.aggregations = [{ fn: agg, field: numVar.key }];
  } else {
    // numeric agg without a recognizable variable → default to IQ
    config.aggregations = [{ fn: agg, field: 'iq' }];
  }
  config.filters = filters;
  config.groupBy = groupBy || '';

  // English sentence preview
  const aggPhrase = {
    count:  'count of cases',
    mean:   `average ${numVar ? numVar.label : 'IQ'}`,
    median: `median ${numVar ? numVar.label : 'IQ'}`,
    sum:    `total ${numVar ? numVar.label : 'IQ'}`,
    max:    `maximum ${numVar ? numVar.label : 'IQ'}`,
    min:    `minimum ${numVar ? numVar.label : 'IQ'}`,
    stddev: `std. deviation of ${numVar ? numVar.label : 'IQ'}`,
  }[agg];
  const filterPhrases = filters.map((f) => {
    const fld = fieldDefs.find((x) => x.key === f.field);
    const fName = fld?.label || f.field;
    if (f.op === 'eq')       return `${fName} = ${f.value}`;
    if (f.op === 'contains') return `${fName} contains "${f.value}"`;
    if (f.op === 'between')  return `${fName} between ${f.value} and ${f.value2}`;
    return `${fName} ${f.op} ${f.value}`;
  });
  const groupPhrase = groupBy
    ? ` grouped by ${(fieldDefs.find((x) => x.key === groupBy)?.label) || groupBy}`
    : '';
  const wherePhrase = filterPhrases.length ? ` for cases where ${filterPhrases.join(' and ')}` : '';
  const sentence = (aggPhrase + wherePhrase + groupPhrase).replace(/^./, (c) => c.toUpperCase()) + '.';

  // Confidence heuristic: 'high' when we found agg OR (filters or group-by);
  // 'low' when we only matched the default 'count'; 'none' if literally
  // nothing was extracted.
  const extractedSomething =
    (numVar) || filters.length > 0 || groupBy || (aggHit && agg !== 'count');
  const confidence =
    !extractedSomething ? 'low'
    : (filters.length + (groupBy ? 1 : 0) + (numVar ? 1 : 0) >= 2) ? 'high'
    : 'medium';

  return {
    understood: confidence !== 'none',
    config,
    sentence,
    unmatched: [],  // future: surface tokens not consumed
    suggestions: confidence === 'low' ? NATURAL_EXAMPLES.slice(0, 3) : [],
    confidence,
  };
}
