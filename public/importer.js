// public/importer.js
// ----------------------------------------------------------------------------
// CDSE Stats — reading Excel (.xlsx) and CSV files for the import
// ----------------------------------------------------------------------------
// Everything happens in this browser: the file is read with the File API and
// unpacked with the built-in DecompressionStream — nothing is uploaded, no
// library, no network, no AI. The import then works in three steps:
//
//   1. readSpreadsheet(file)  → { sheets: [{ name, headers, rows }] }
//   2. guessMapping(headers)  → which column feeds which field (editable)
//   3. convertRows(rows, map) → case records + a list of warnings
//
// Conversions are deliberately forgiving: dates as Excel serial numbers or
// dd.mm.yyyy, "garçon"/"fille" for sex, "6" or "Esch" for the Direction de
// région, "oui"/"ja" for Yes, several diagnoses in one cell separated by ";".
// ----------------------------------------------------------------------------

import { FIELD_DEFS, getField, DR_OPTIONS, MEASURES, MEASURE_KEYS } from './fields.js';

// ----- small helpers ------------------------------------------------------------

function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9&]+/g, ' ')
    .trim();
}

function pad2(n) { return String(n).padStart(2, '0'); }

// ----- ZIP (xlsx is a zip file) ---------------------------------------------------

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot unpack Excel files. Please use a current Edge or Chrome, or save the sheet as CSV.');
  }
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Read the entries of a zip archive: { name → Uint8Array } (lazy inflate). */
function zipEntries(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // End of central directory: search backwards for 0x06054b50
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This is not a valid Excel file (.xlsx).');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const dec = new TextDecoder('utf-8');
  const entries = {};
  for (let k = 0; k < count; k++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const csize = view.getUint32(p + 20, true);
    const nlen = view.getUint16(p + 28, true);
    const elen = view.getUint16(p + 30, true);
    const clen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nlen));
    const lnlen = view.getUint16(local + 26, true);
    const lelen = view.getUint16(local + 28, true);
    const start = local + 30 + lnlen + lelen;
    const data = buf.subarray(start, start + csize);
    entries[name] = { method, data };
    p += 46 + nlen + elen + clen;
  }
  return {
    has: (name) => !!entries[name],
    async text(name) {
      const e = entries[name];
      if (!e) return null;
      const bytes = e.method === 0 ? e.data : e.method === 8 ? await inflateRaw(e.data) : null;
      if (!bytes) throw new Error(`Unsupported compression in ${name}.`);
      return dec.decode(bytes);
    },
  };
}

// ----- XLSX ---------------------------------------------------------------------

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

function colIndex(ref) {
  const letters = String(ref).replace(/[0-9]/g, '');
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function xmlDoc(text) {
  return new DOMParser().parseFromString(text, 'application/xml');
}

/** Elements by local name — namespace prefixes differ between Excel versions. */
function byTag(node, name) {
  return Array.from(node.getElementsByTagNameNS('*', name));
}

async function readXlsx(buffer) {
  const zip = zipEntries(new Uint8Array(buffer));
  const wb = await zip.text('xl/workbook.xml');
  if (!wb) throw new Error('This is not a valid Excel file (.xlsx).');
  const rels = xmlDoc(await zip.text('xl/_rels/workbook.xml.rels') || '<Relationships/>');
  const relTarget = {};
  for (const r of byTag(rels, 'Relationship')) relTarget[r.getAttribute('Id')] = r.getAttribute('Target');

  // shared strings
  const shared = [];
  const sst = await zip.text('xl/sharedStrings.xml');
  if (sst) {
    for (const si of byTag(xmlDoc(sst), 'si')) shared.push(byTag(si, 't').map((t) => t.textContent).join(''));
  }

  // which cell styles are dates
  const dateStyles = new Set();
  const stylesXml = await zip.text('xl/styles.xml');
  if (stylesXml) {
    const st = xmlDoc(stylesXml);
    const custom = {};
    for (const f of byTag(st, 'numFmt')) custom[f.getAttribute('numFmtId')] = f.getAttribute('formatCode') || '';
    const xfsParent = byTag(st, 'cellXfs')[0];
    if (xfsParent) {
      byTag(xfsParent, 'xf').forEach((xf, i) => {
        const id = Number(xf.getAttribute('numFmtId') || 0);
        const code = custom[id] || '';
        const isDate = BUILTIN_DATE_FORMATS.has(id) || (/[dmy]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]/g, '')) && !/^[#0.,%\s]+$/.test(code));
        if (isDate) dateStyles.add(i);
      });
    }
  }

  const sheets = [];
  for (const s of byTag(xmlDoc(wb), 'sheet')) {
    const name = s.getAttribute('name') || 'Sheet';
    const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    let target = relTarget[rid] || '';
    if (!target) continue;
    target = target.replace(/^\/?xl\//, '').replace(/^\//, '');
    const xml = await zip.text('xl/' + target);
    if (!xml) continue;
    const grid = [];
    for (const row of byTag(xmlDoc(xml), 'row')) {
      const cells = [];
      for (const c of byTag(row, 'c')) {
        const idx = colIndex(c.getAttribute('r') || '');
        const t = c.getAttribute('t') || 'n';
        const s2 = Number(c.getAttribute('s') || 0);
        const v = byTag(c, 'v')[0]?.textContent ?? '';
        let val;
        if (t === 's') val = shared[Number(v)] ?? '';
        else if (t === 'inlineStr') val = byTag(c, 't').map((x) => x.textContent).join('');
        else if (t === 'b') val = v === '1' ? 'Yes' : 'No';
        else if (t === 'str' || t === 'e') val = v;
        else if (v !== '' && dateStyles.has(s2)) val = { excelDate: Number(v) };
        else val = v;
        if (idx >= 0) cells[idx] = val;
      }
      grid.push(cells);
    }
    const nonEmpty = grid.filter((r) => r.some((x) => x !== undefined && x !== ''));
    if (!nonEmpty.length) continue;
    const width = Math.max(...nonEmpty.map((r) => r.length));
    const filledRows = nonEmpty.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
    sheets.push({ name, headers: filledRows[0].map((h) => String(h?.excelDate ?? h).trim()), rows: filledRows.slice(1) });
  }
  if (!sheets.length) throw new Error('The Excel file has no filled sheet.');
  return sheets;
}

// ----- CSV ------------------------------------------------------------------------

function detectDelimiter(text) {
  const first = text.split(/\r?\n/).find((l) => l.trim()) || '';
  const counts = { ';': (first.match(/;/g) || []).length, ',': (first.match(/,/g) || []).length, '\t': (first.match(/\t/g) || []).length };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0 ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] : ';';
}

export function parseDelimited(text, delimiter = detectDelimiter(text)) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delimiter) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

/** Read an .xlsx, .csv or .txt file → { sheets: [{ name, headers, rows }] }. */
export async function readSpreadsheet(file) {
  const name = String(file?.name || '').toLowerCase();
  if (name.endsWith('.xls')) throw new Error('Old .xls files cannot be read. In Excel: File → Save as → Excel workbook (.xlsx).');
  if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) {
    return { sheets: await readXlsx(await file.arrayBuffer()) };
  }
  const text = (await file.text()).replace(/^﻿/, '');
  const rows = parseDelimited(text);
  if (!rows.length) throw new Error('The file is empty.');
  const width = Math.max(...rows.map((r) => r.length));
  const full = rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
  return { sheets: [{ name: file.name || 'CSV', headers: full[0].map((h) => String(h).trim()), rows: full.slice(1) }] };
}

// ----- column → field --------------------------------------------------------------

/** Words people use in column headers, per field (compared after norm()). */
const HEADER_WORDS = {
  matricule: ['matricule', 'national id', 'id national', 'numero matricule', 'n matricule', 'no matricule', 'nr matricule', 'social security', 'secu'],
  dossier_mfile: ['m file', 'mfile', 'm files', 'dossier', 'numero dossier', 'no dossier', 'case number'],
  nom: ['nom', 'name', 'last name', 'family name', 'nachname', 'familienname', 'numm', 'nom de famille'],
  prenom: ['prenom', 'first name', 'vorname', 'virnumm', 'given name'],
  sexe: ['sexe', 'sex', 'gender', 'geschlecht', 'genre', 'geschlech'],
  date_naissance: ['date de naissance', 'naissance', 'date of birth', 'birth date', 'birthdate', 'dob', 'geburtsdatum', 'gebuertsdatum', 'ne le', 'nee le'],
  dir: ['direction', 'direction de region', 'direction regionale', 'dr', 'dir', 'region', 'directorate', 'direktion'],
  ecole_lycee: ['ecole', 'school', 'schule', 'schoul', 'lycee', 'etablissement', 'ecole lycee', 'school name'],
  school_type: ['secteur', 'school sector', 'public prive', 'public ou prive'],
  previous_school: ['ecole precedente', 'previous school', 'ancienne ecole', 'fruehere schule'],
  date_school_change: ['changement ecole', 'school change', 'date changement'],
  mesure_cdse_1: ['mesure', 'mesure cdse', 'measure', 'mesure 1', 'measure 1', 'massnahme', 'mesure principale'],
  mesure_cdse_2: ['mesure 2', 'measure 2', 'mesure secondaire'],
  mesure_cdse_3: ['mesure 3', 'measure 3'],
  date_decision_cni: ['decision cni', 'cni', 'date cni', 'date decision cni'],
  ds_realise_par: ['ds realise par', 'ds par', 'ds performed by'],
  date_ds: ['date ds', 'ds date', 'diagnostic date'],
  isa_realise_par: ['isa realise par', 'isa par', 'intervenant isa', 'isa performed by'],
  debut_isa: ['debut isa', 'isa debut', 'isa start', 'start isa', 'isa von', 'isa depuis'],
  fin_isa: ['fin isa', 'isa fin', 'isa end', 'end isa', 'isa bis'],
  cg_realise_par: ['cg realise par', 'c&g par', 'c&g realise par'],
  debut_cg: ['debut cg', 'debut c&g', 'c&g start', 'cg start'],
  fin_cg: ['fin cg', 'fin c&g', 'c&g end', 'cg end'],
  atelier_type: ['atelier', 'type atelier', 'quel atelier'],
  debut_atelier: ['debut atelier', 'atelier start'],
  fin_atelier: ['fin atelier', 'atelier end'],
  reeducation_type: ['reeducation', 'type reeducation'],
  debut_reeducation: ['debut reeducation', 'reeducation start'],
  fin_reeducation: ['fin reeducation', 'reeducation end'],
  debut_annexe: ['debut annexe', 'annexe start', 'annexe debut'],
  fin_annexe: ['fin annexe', 'annexe end'],
  cst_groupe: ['groupe cst', 'cst groupe', 'cst group', 'cst'],
  debut_cst: ['debut cst', 'cst start'],
  fin_cst: ['fin cst', 'cst end'],
  cdp_region: ['cdp', 'classe de participation', 'cdp region'],
  debut_cdp: ['debut cdp', 'cdp start'],
  fin_cdp: ['fin cdp', 'cdp end'],
  autre_mesure: ['autre mesure', 'other measure'],
  eldib_date: ['date eldib', 'eldib date', 'eldib'],
  eldib_v: ['eldib v', 'stufe v', 'eldib verhalten', 'eldib comportement'],
  eldib_k: ['eldib k', 'stufe k', 'eldib kommunikation', 'eldib communication'],
  eldib_soz: ['eldib soz', 'stufe soz', 'eldib sozialisation', 'eldib socialisation'],
  eldib_kog: ['eldib kog', 'stufe kog', 'eldib kognition', 'eldib cognition'],
  autres_cc: ['autre cc', 'autres cc', 'other cc', 'centre de competences', 'autre centre de competences'],
  autres_services: ['autres services', 'other services', 'services', 'intervenants'],
  scol_etranger: ['scolarite etranger', 'schooling abroad', 'etranger'],
  diagnostics: ['diagnostic', 'diagnostics', 'diagnose', 'diagnosen', 'diagnosis', 'diagnoses', 'cim 10', 'icd 10', 'icd'],
  verdachtsdiagnosen_profil: ['profil', 'profile', 'verdacht', 'verdachtsdiagnose', 'suspected', 'hypothese'],
  iq: ['qi', 'iq', 'quotient intellectuel', 'qit'],
  langue_1: ['langue', 'premiere langue', 'langue maternelle', 'language', 'first language', 'sprache', 'muttersprache', 'sprooch'],
  parents: ['parents', 'situation parents', 'situation familiale', 'eltern'],
  scas: ['scas'],
  tutelle: ['tutelle', 'guardianship', 'sorgerecht', 'garde'],
  mesures_famille: ['mesures famille', 'family measures', 'mesures familiales'],
};

/** Fields an import column can feed (editable fields, older ones excluded). */
export const IMPORT_TARGETS = FIELD_DEFS.filter((f) => f.type !== 'computed' && !f.legacy);

/** Best guess for every column. Also accepts the schema keys and the English
 *  labels themselves, so an export of this tool maps back 1:1. */
export function guessMapping(headers) {
  const used = new Set();
  return headers.map((h) => {
    const raw = String(h || '').trim();
    const n = norm(raw);
    if (!n) return '';
    let best = '';
    let score = 0;
    for (const f of IMPORT_TARGETS) {
      if (used.has(f.key)) continue;
      let s = 0;
      if (raw === f.key || n === norm(f.key)) s = 100;
      else if (n === norm(f.label)) s = 95;
      else if ((HEADER_WORDS[f.key] || []).includes(n)) s = 90;
      else if ((HEADER_WORDS[f.key] || []).some((w) => w.length > 3 && (n.startsWith(w + ' ') || n.endsWith(' ' + w)))) s = 60;
      if (s > score) { score = s; best = f.key; }
    }
    if (best) used.add(best);
    return best;
  });
}

// ----- value conversion --------------------------------------------------------------

/** Excel serial day number → ISO date (1900 date system). */
export function excelSerialToIso(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num < 1 || num > 80000) return null;
  const ms = Math.round((num - 25569) * 86400000);   // 25569 = 1970-01-01
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Year, month, day → ISO date, or null when that day does not exist (31.02.). */
function ymd(y, mo, d) {
  const Y = +y, M = +mo, D = +d;
  if (!(M >= 1 && M <= 12 && D >= 1 && D <= 31 && Y >= 1900 && Y <= 2100)) return null;
  const dt = new Date(Date.UTC(Y, M - 1, D));
  if (dt.getUTCMonth() !== M - 1 || dt.getUTCDate() !== D) return null;
  return `${Y}-${pad2(M)}-${pad2(D)}`;
}

export function toIsoDate(v) {
  if (v && typeof v === 'object' && 'excelDate' in v) return excelSerialToIso(v.excelDate);
  const s = String(v ?? '').trim();
  if (!s) return '';
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return ymd(m[1], m[2], m[3]);
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
  if (m) return ymd(m[3], m[2], m[1]);
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2})$/.exec(s);
  if (m) return ymd(+m[3] < 50 ? 2000 + +m[3] : 1900 + +m[3], m[2], m[1]);
  if (/^\d{4,5}(\.\d+)?$/.test(s)) return excelSerialToIso(s);
  return null;
}

const SEX = {
  M: ['m', 'male', 'boy', 'man', 'masculin', 'garcon', 'homme', 'mannlich', 'maennlich', 'junge', 'jong', 'h'],
  F: ['f', 'female', 'girl', 'woman', 'feminin', 'fille', 'femme', 'weiblich', 'madchen', 'maedchen', 'meedchen', 'w'],
  D: ['d', 'divers', 'diverse', 'x', 'non binary'],
};
const YES = ['yes', 'y', 'oui', 'o', 'ja', 'j', '1', 'true', 'x', 'vrai'];
const NO = ['no', 'n', 'non', 'nein', '0', 'false', 'faux'];
const LANG = {
  LU: ['lu', 'lb', 'lux', 'luxembourgeois', 'luxemburgisch', 'letzebuergesch', 'luxembourgish'],
  FR: ['fr', 'francais', 'french', 'franzosisch', 'franzoesisch'],
  DE: ['de', 'allemand', 'german', 'deutsch'],
  PT: ['pt', 'portugais', 'portuguese', 'portugiesisch', 'portugues'],
  EN: ['en', 'anglais', 'english', 'englisch'],
  IT: ['it', 'italien', 'italian', 'italienisch', 'italiano'],
  ES: ['es', 'espagnol', 'spanish', 'spanisch', 'espanol'],
};
const DR_PLACES = [
  ['luxembourg', 'luxemburg', 'letzebuerg', 'ville'], ['mamer'], ['petange', 'petingen'], ['differdange', 'differdingen', 'deifferdeng'],
  ['sanem', 'suessem', 'sassenheim'], ['esch', 'alzette'], ['dudelange', 'dudelingen', 'diddeleng'], ['bettembourg', 'bettemburg', 'beetebuerg'],
  ['remich', 'reimech'], ['grevenmacher', 'maacher'], ['echternach', 'iechternach'], ['mersch', 'miersch'],
  ['redange', 'rambrouch', 'attert', 'redingen', 'reiden'], ['diekirch', 'dikrech'], ['wiltz', 'wolz'],
];

export function toDr(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (DR_OPTIONS.includes(s)) return s;
  const n = norm(s).replace(/^(dr|dir|direction( de region| regionale)?|direktion|region)\s*/, '');
  const num = /^(\d{1,2})\b/.exec(n);
  if (num && +num[1] >= 1 && +num[1] <= 15) return DR_OPTIONS[+num[1] - 1];
  const words = n.split(/\s+/);
  for (let i = 0; i < DR_PLACES.length; i++) if (words.some((w) => DR_PLACES[i].includes(w))) return DR_OPTIONS[i];
  return null;
}

const MEASURE_IMPORT_WORDS = {
  DS: ['ds', 'diagnostic', 'diagnostic specialise', 'diagnostique'],
  ISA: ['isa', 'intervention specialisee ambulatoire'],
  'C&G': ['c&g', 'cg', 'c g', 'conseil et guidance', 'guidance'],
  Atelier: ['atelier', 'ateliers', 'atelier d apprentissage specifique'],
  'Rééducation': ['reeducation', 'rehabilitation'],
  Annexe: ['annexe', 'annexe junglinster'],
  CST: ['cst', 'centre socio therapeutique'],
  CdP: ['cdp', 'classe de participation', 'clapa'],
  Other: ['other', 'autre', 'andere'],
};

export function toMeasure(v) {
  const n = norm(v);
  if (!n) return '';
  for (const [key, words] of Object.entries(MEASURE_IMPORT_WORDS)) if (words.includes(n)) return key;
  for (const [key, words] of Object.entries(MEASURE_IMPORT_WORDS)) if (words.some((w) => w.length > 2 && n.startsWith(w))) return key;
  return null;
}

function matchOption(v, options) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (options.includes(s)) return s;
  const n = norm(s);
  return options.find((o) => norm(o) === n) || null;
}

/**
 * Convert one cell to the stored form of a field. Returns
 * { value, extra?, problem? } — `extra` fills a second field (e.g. the text
 * of "Other"), `problem` explains a value that could not be read.
 */
export function convertValue(fieldKey, raw) {
  const def = getField(fieldKey);
  if (!def) return { value: raw };
  const text = raw && typeof raw === 'object' && 'excelDate' in raw ? excelSerialToIso(raw.excelDate) : String(raw ?? '').trim();
  if (text === '' || text === null) return { value: def.type === 'tags' ? [] : '' };
  switch (def.type) {
    case 'date': {
      const d = toIsoDate(raw);
      return d ? { value: d } : { value: '', problem: `“${text}” is not a date` };
    }
    case 'number': {
      const num = Number(String(text).replace(',', '.').replace(/[^\d.-]/g, ''));
      return Number.isFinite(num) ? { value: num } : { value: '', problem: `“${text}” is not a number` };
    }
    case 'tags':
      return { value: String(text).split(/\s*[;|\n]\s*|\s*,\s+(?=[A-Z0-9])/).map((x) => x.trim()).filter(Boolean) };
    case 'select': {
      if (fieldKey === 'sexe') {
        const n = norm(text);
        for (const [k, words] of Object.entries(SEX)) if (words.includes(n)) return { value: k };
        return { value: '', problem: `sex “${text}” unknown` };
      }
      if (fieldKey === 'dir' || fieldKey === 'cdp_region') {
        const d = toDr(text);
        return d ? { value: d } : { value: '', problem: `Direction “${text}” unknown` };
      }
      if (def.measureSlot) {
        const m = toMeasure(text);
        if (m === 'Other' || m === null) return { value: 'Other', extra: { autre_mesure: text } };
        return { value: m };
      }
      if (fieldKey === 'langue_1') {
        const n = norm(text);
        for (const [k, words] of Object.entries(LANG)) if (words.includes(n)) return { value: k };
        return { value: 'Other', extra: { langue_1_autre: text } };
      }
      if (def.options?.includes('Yes') && def.options?.includes('No')) {
        const n = norm(text);
        if (YES.includes(n)) return { value: 'Yes' };
        if (NO.includes(n)) return { value: 'No' };
      }
      if (fieldKey === 'school_type') {
        const n = norm(text);
        if (/^pub/.test(n)) return { value: 'Public' };
        if (/^priv/.test(n)) return { value: 'Privé' };
      }
      if (fieldKey === 'parents') {
        const n = norm(text);
        if (/ensemble|together|zesummen|zusammen|maries|married/.test(n)) return { value: 'Together' };
        if (/separe|divorce|getrennt|geschieden|separated|divorced/.test(n)) return { value: 'Separated' };
        return { value: 'Other', extra: { parents_autre: text } };
      }
      const opt = matchOption(text, def.options || []);
      return opt ? { value: opt } : { value: '', problem: `“${text}” is not one of the choices for ${def.label}` };
    }
    default:
      return { value: String(text) };
  }
}

/**
 * Turn sheet rows into case records using the column mapping. Rows without
 * any mapped value are skipped. Returns { records, problems, skipped }.
 */
export function convertRows(rows, mapping) {
  const records = [];
  const problems = [];
  let skipped = 0;
  rows.forEach((row, i) => {
    const rec = {};
    let any = false;
    mapping.forEach((fieldKey, col) => {
      if (!fieldKey) return;
      const { value, extra, problem } = convertValue(fieldKey, row[col]);
      if (problem) problems.push({ row: i + 2, field: fieldKey, message: problem });
      const empty = value === '' || (Array.isArray(value) && !value.length);
      if (!empty) {
        any = true;
        const def = getField(fieldKey);
        // Several columns into one tag field (e.g. "Diagnosis 1", "Diagnosis 2") are merged
        if (def?.type === 'tags' && Array.isArray(rec[fieldKey])) rec[fieldKey] = [...new Set([...rec[fieldKey], ...value])];
        else rec[fieldKey] = value;
      }
      if (extra) Object.assign(rec, extra);
    });
    if (any) records.push(rec);
    else skipped++;
  });
  return { records, problems, skipped };
}

/** Which measure fields exist — handy for the mapping dropdown's grouping. */
export const MEASURE_FIELD_KEYS = new Set(MEASURES.flatMap((m) => [m.start, m.end, m.who, m.detail].filter(Boolean)));
export { MEASURE_KEYS };
