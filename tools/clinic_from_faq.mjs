/**
 * clinic_from_faq.mjs - read a clinic's FAQ document and produce its profile block.
 *
 *   node clinic_from_faq.mjs <faq.md|faq.txt|faq.pdf>            report only, writes nothing
 *   node clinic_from_faq.mjs <faq.md> --write                    also write config/clinic.json
 *
 * WHY THIS EXISTS
 *   Setting up a clinic means typing ten fields into the profile block in
 *   `Prepare Conversation State`. Every one of them is already written down in the clinic's
 *   own FAQ, which you need anyway for the knowledge base. Typing them a second time is how
 *   a clinic ends up advertising hours it then refuses to book.
 *
 *   So: same document, both jobs. Feed the FAQ to `kb_ingest.mjs` for the knowledge base, and
 *   to this for the profile block.
 *
 * NO API KEYS, NO NETWORK. This is deterministic text extraction, not a model call. It reads
 * the document you point it at and nothing else. It never opens .env.
 *
 * PRECISION OVER RECALL. A wrong clinic profile is worse than a blank one, because a blank
 * is obvious and a wrong one quietly misinforms patients. Every field is either found with
 * the line it came from, or reported MISSING for you to fill in by hand. It does not guess,
 * and it does not infer a value from a value it already guessed.
 */

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

/* ---------------------------------------------------------------- input */

const args = process.argv.slice(2);
const write = args.includes('--write');
const file = args.find((a) => !a.startsWith('--'));

if (!file) {
  console.error(
    [
      'Usage:',
      '  node clinic_from_faq.mjs <faq.md|faq.txt|faq.pdf>          report only',
      '  node clinic_from_faq.mjs <faq.md> --write                  also write config/clinic.json',
      '',
      'Reads a clinic FAQ and extracts the ten profile fields the workflow needs.',
      'Deterministic text extraction. No API keys, no network.',
    ].join('\n')
  );
  process.exit(1);
}

function readDoc(path) {
  if (!existsSync(path)) throw new Error(`No such file: ${path}`);
  if (extname(path).toLowerCase() !== '.pdf') return readFileSync(path, 'utf8');
  // PDFs go through the same extractor kb_ingest.mjs uses, borrowed from the global n8n
  // install, so both tools read a document the same way.
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
    const entry = resolve(globalRoot, 'n8n', 'node_modules', 'pdf-parse', 'package.json');
    const { PDFParse } = createRequire(entry)('pdf-parse');
    const parser = new PDFParse({ data: readFileSync(path) });
    return parser.getText().then((r) => r.text);
  } catch {
    throw new Error(
      [
        'Could not read that PDF.',
        '',
        'PDF support borrows pdf-parse from the global n8n install:',
        '',
        '  npm install -g n8n',
        '',
        'Or export your FAQ to .md or .txt, which needs nothing extra.',
      ].join('\n')
    );
  }
}

/* ---------------------------------------------------------------- helpers */

const found = {};
const evidence = {};
const missing = [];
const warnings = [];

/** Record a field only if we actually have a value. Never overwrite an earlier, better hit. */
function record(field, value, line) {
  if (value === undefined || value === null || value === '') return false;
  if (field in found) return false;
  found[field] = value;
  evidence[field] = (line || '').trim().slice(0, 110);
  return true;
}

/** Strip markdown emphasis, links and stray punctuation from a captured value. */
function clean(s) {
  return String(s)
    .replace(/\*\*/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[.,;]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const DAYS = {
  monday: 1, mon: 1,
  tuesday: 2, tues: 2, tue: 2,
  wednesday: 3, weds: 3, wed: 3,
  thursday: 4, thurs: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
  sunday: 7, sun: 7,
};
const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** "8AM" -> 8, "5 PM" -> 17, "17:00" -> 17, "12:30PM" -> 12. Hour only; minutes are ignored. */
function parseHour(raw) {
  const m = String(raw).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const mer = (m[3] || '').toLowerCase().replace(/\./g, '');
  if (mer === 'am') { if (h === 12) h = 0; }
  else if (mer === 'pm') { if (h !== 12) h += 12; }
  else if (h > 23) return null;
  return h >= 0 && h <= 23 ? h : null;
}

/* ---------------------------------------------------------------- extract */

const raw = await readDoc(resolve(process.cwd(), file));
const lines = raw.split(/\r?\n/);

for (const line of lines) {
  const L = clean(line);
  if (!L) continue;

  // --- labelled lines, e.g. "**Address:** 123 Example Street"
  const label = L.match(/^[-*\s]*([A-Za-z][A-Za-z /]{2,30}?)\s*:\s*(.+)$/);
  if (label) {
    const key = label[1].toLowerCase().trim();
    const val = clean(label[2]);
    if (/^address|^location/.test(key)) record('clinic_address', val, line);
    else if (/mobile|phone|contact|tel|viber|sms/.test(key)) {
      const digits = val.match(/[+()\d][\d\s()+-]{5,}\d/);
      if (digits) record('clinic_mobile', clean(digits[0]), line);
    } else if (/e-?mail/.test(key)) {
      const em = val.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
      if (em) record('clinic_email', em[0], line);
    } else if (/^dentist|^doctor|^practitioner/.test(key)) {
      record('clinic_dentist', val, line);
    }
  }

  // --- email anywhere, as a fallback
  if (!('clinic_email' in found)) {
    const em = L.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    if (em) record('clinic_email', em[0], line);
  }

  // --- the dentist: "Your dentist ... is Dra. Jane Cruz"
  // Do not exclude periods from the gap. A clinic name like "A. B. Dental Clinic" sits in
  // it, and an earlier version of this pattern missed every such clinic because of that.
  if (!('clinic_dentist' in found)) {
    const d = L.match(/\b(?:dentist|doctor)\b.{0,80}?\bis\b\s+((?:Dr|Dra|Doctor)\.?\s+[^,(]{2,50})/i);
    if (d) record('clinic_dentist', clean(d[1]), line);
  }

  // --- last walk-in: "The last walk-in we accept is 4:30PM"
  if (!('clinic_last_walk_in' in found)) {
    const w = L.match(/last\s+walk[\s-]?in[^.]*?\b(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))/i);
    if (w) record('clinic_last_walk_in', clean(w[1]).toUpperCase().replace(/\s+/g, ''), line);
  }

  // --- opening hours: "Monday to Saturday, 8AM to 5PM"
  if (!('clinic_open_hour' in found)) {
    const h = L.match(
      new RegExp(
        String.raw`\b(${Object.keys(DAYS).join('|')})\b\s*(?:to|through|-|–|—|until)\s*` +
          String.raw`\b(${Object.keys(DAYS).join('|')})\b[\s,]*` +
          String.raw`(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)\s*(?:to|-|–|—|until)\s*` +
          String.raw`(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)`,
        'i'
      )
    );
    if (h) {
      const from = DAYS[h[1].toLowerCase()];
      const to = DAYS[h[2].toLowerCase()];
      const open = parseHour(h[3]);
      const close = parseHour(h[4]);
      if (from && to && open !== null && close !== null && close > open) {
        const openDays = [];
        for (let d = from; ; d = (d % 7) + 1) {
          openDays.push(d);
          if (d === to) break;
          if (openDays.length > 7) break;
        }
        const closed = [1, 2, 3, 4, 5, 6, 7].filter((d) => !openDays.includes(d));
        record('clinic_open_hour', open, line);
        record('clinic_close_hour', close, line);
        record('clinic_closed_weekdays', closed, line);
        const closedText = closed.length
          ? `, closed ${closed.map((d) => DAY_NAMES[d]).join(' and ')}`
          : '';
        record(
          'clinic_hours_text',
          `${DAY_NAMES[from]} to ${DAY_NAMES[to]}, ${clean(h[3]).toUpperCase().replace(/\s+/g, '')} to ${clean(h[4]).toUpperCase().replace(/\s+/g, '')}${closedText}`,
          line
        );
      }
    }
  }
}

// --- clinic name: the first heading, minus a trailing "FAQ" style suffix
for (const line of lines) {
  const h = line.match(/^#\s+(.+)$/);
  if (h) {
    const name = clean(h[1])
      .replace(/\s*[-–—:|]\s*(patient\s+)?(faq|faqs|frequently asked questions|knowledge base|handbook).*$/i, '')
      .trim();
    if (name) record('clinic_name', name, line);
    break;
  }
}

/* ---------------------------------------------------------------- checks */

const FIELDS = [
  'clinic_name',
  'clinic_open_hour',
  'clinic_close_hour',
  'clinic_closed_weekdays',
  'clinic_hours_text',
  'clinic_address',
  'clinic_mobile',
  'clinic_email',
  'clinic_dentist',
  'clinic_last_walk_in',
];

for (const f of FIELDS) if (!(f in found)) missing.push(f);

// A "still confirming" section means the FAQ is knowingly incomplete. The bot will deflect
// every one of those questions to a human, so it is worth saying out loud.
const openSection = lines.findIndex((l) =>
  /^#{1,3}\s.*\b(still\s+confirming|to\s+be\s+confirmed|not\s+yet\s+confirmed|pending|unconfirmed)\b/i.test(l)
);
if (openSection !== -1) {
  const rest = lines.slice(openSection + 1);
  const nextTop = rest.findIndex((l) => /^#{1,2}\s/.test(l));
  const block = nextTop === -1 ? rest : rest.slice(0, nextTop);
  const count = block.filter((l) => /^#{3,}\s/.test(l)).length;
  if (count) {
    warnings.push(
      `The FAQ has a "still confirming" section with ${count} unanswered question${count === 1 ? '' : 's'}. ` +
        `The bot will deflect every one of those to a human. Answer them before go-live.`
    );
  }
}

if ('clinic_last_walk_in' in found && 'clinic_close_hour' in found) {
  const w = parseHour(found.clinic_last_walk_in.replace(/([AP]M)/i, ' $1'));
  if (w !== null && w >= found.clinic_close_hour) {
    warnings.push(
      `clinic_last_walk_in (${found.clinic_last_walk_in}) is not before closing ` +
        `(${found.clinic_close_hour}:00). Check both.`
    );
  }
}

/* ---------------------------------------------------------------- output */

const q = (v) => (typeof v === 'string' ? `'${v.replace(/'/g, "\\'")}'` : JSON.stringify(v));
const label = (f) => (f in found ? 'found  ' : 'MISSING');

console.log(`\nRead ${file}\n`);
for (const f of FIELDS) {
  const val = f in found ? q(found[f]) : '';
  console.log(`  ${label(f)}  ${f.padEnd(24)} ${val}`);
  if (f in found && evidence[f]) console.log(`${' '.repeat(37)}from: ${evidence[f]}`);
}

if (missing.length) {
  console.log(`\n${missing.length} field${missing.length === 1 ? '' : 's'} not found. Fill in by hand:`);
  for (const f of missing) console.log(`  - ${f}`);
  console.log('\nNothing is guessed. A blank you notice beats a wrong value you do not.');
}

for (const w of warnings) console.log(`\nWARNING: ${w}`);

console.log('\n--- paste into Prepare Conversation State ---\n');
console.log(`    clinic_name: ${q(found.clinic_name ?? 'FILL ME IN')},`);
console.log(`    clinic_open_hour: ${found.clinic_open_hour ?? 'null /* FILL ME IN */'},`);
console.log(`    clinic_close_hour: ${found.clinic_close_hour ?? 'null /* FILL ME IN */'},`);
console.log(`    clinic_closed_weekdays: ${q(found.clinic_closed_weekdays ?? [])},`);
console.log(`    clinic_hours_text: ${q(found.clinic_hours_text ?? 'FILL ME IN')},`);
console.log(`    clinic_address: ${q(found.clinic_address ?? 'FILL ME IN')},`);
console.log(`    clinic_mobile: ${q(found.clinic_mobile ?? 'FILL ME IN')},`);
console.log(`    clinic_email: ${q(found.clinic_email ?? 'FILL ME IN')},`);
console.log(`    clinic_dentist: ${q(found.clinic_dentist ?? 'FILL ME IN')},`);
console.log(`    clinic_last_walk_in: ${q(found.clinic_last_walk_in ?? 'FILL ME IN')}`);
console.log('\n--- end ---');

console.log(
  '\nCheck clinic_hours_text against the two hour fields before you paste. Patients are told' +
    '\nthat text word for word, and nothing verifies it matches what the workflow enforces.'
);

if (write) {
  const outPath = resolve(root, 'config', 'clinic.json');
  const payload = {
    _comment: `Extracted from ${file} by tools/clinic_from_faq.mjs. Reference copy: the live values live in the Prepare Conversation State node. Check every field before trusting it.`,
    clinic_timezone: 'Asia/Manila',
  };
  for (const f of FIELDS) payload[f] = found[f] ?? null;
  writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n');
  console.log(`\nWrote ${outPath}`);
  console.log('Set clinic_timezone yourself. It is not in the FAQ, and it defaults to Asia/Manila.');
} else {
  console.log('\nRe-run with --write to save this to config/clinic.json.');
}

process.exit(missing.length ? 2 : 0);
