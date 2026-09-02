/**
 * test_text.mjs - offline tests for the two deterministic text helpers.
 *
 *   node test_text.mjs
 *
 * Both are pulled out of the SHIPPED workflow JSON rather than copied here, so the test cannot
 * drift from what is deployed. Same approach as test_matcher.mjs and test_hours.mjs.
 *
 *   normalizeLists  (Parse Agent Decision)      - QA problem 7, run-on lists
 *   Taglish markers (Prepare Conversation State) - QA problems 8 and 9, language mirroring
 *
 * The regression these guard against is a formatting regex that overreaches. stripDashes once
 * turned the clinic's "Monday-Friday 9 AM - 7 PM" into "Monday, Friday 9 AM, 7 PM", so several
 * cases below exist purely to prove the new rule leaves ordinary prose alone.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const wf = JSON.parse(readFileSync(resolve(here, '..', 'workflows', 'dental_front_desk.json'), 'utf8'));

/* ---------------------------------------------------------------- normalizeLists */

const parseCode = wf.nodes.find((n) => n.name === 'Parse Agent Decision').parameters.jsCode;
const fnStart = parseCode.indexOf('function normalizeLists');
if (fnStart === -1) throw new Error('normalizeLists not found in Parse Agent Decision');
const fnEnd = parseCode.indexOf('\n}', fnStart) + 2;
const normalizeLists = new Function(parseCode.slice(fnStart, fnEnd) + '\nreturn normalizeLists;')();

const BULLET = '•';
const listCases = [
  [
    'dot bullets on their own lines become markdown items',
    `We accept:\n${BULLET} Cash\n${BULLET} GCash\n${BULLET} Bank transfer`,
    'We accept:\n\n- Cash\n- GCash\n- Bank transfer',
  ],
  [
    'a blank line is inserted between the lead-in and the list',
    'Here is what we offer:\n- Consultations\n- Veneers',
    'Here is what we offer:\n\n- Consultations\n- Veneers',
  ],
  [
    'an already correct list is left alone',
    'We accept:\n\n- Cash\n- GCash',
    'We accept:\n\n- Cash\n- GCash',
  ],
  [
    'indentation is preserved',
    `Options:\n  ${BULLET} One\n  ${BULLET} Two`,
    'Options:\n\n  - One\n  - Two',
  ],
  // Regressions: ordinary prose and ranges must survive untouched.
  [
    'clinic hours with a day range are untouched',
    'We are open Monday-Saturday, 8AM-5PM. We are closed on Sundays.',
    'We are open Monday-Saturday, 8AM-5PM. We are closed on Sundays.',
  ],
  [
    'a hyphen mid sentence is untouched',
    'Your follow-up visit is next week.',
    'Your follow-up visit is next week.',
  ],
  [
    'ordinary paragraphs are untouched',
    'Hello!\n\nHow may I help you today?',
    'Hello!\n\nHow may I help you today?',
  ],
  ['empty string survives', '', ''],
];

/* ---------------------------------------------------------------- language detection */

const prepCode = wf.nodes.find((n) => n.name === 'Prepare Conversation State').parameters.jsCode;
const markerLine = prepCode.split('\n').find((l) => l.includes('const TAGALOG_MARKERS'));
if (!markerLine) throw new Error('TAGALOG_MARKERS not found in Prepare Conversation State');
const makeMarkers = new Function(markerLine + '\nreturn TAGALOG_MARKERS;');

function detect(text) {
  const re = makeMarkers();
  const hits = new Set(String(text || '').toLowerCase().match(re) || []);
  return hits.size >= 2 ? 'Taglish' : 'English';
}

const langCases = [
  ['plain English booking request', 'Hi, I would like to book an appointment for teeth cleaning', 'English'],
  ['plain English question', 'What are your clinic hours and where are you located?', 'English'],
  ['clear Taglish', 'Magkano po ang pabunot ng ngipin?', 'Taglish'],
  ['the conversation 7 opener that was answered in English', 'sige book ako today', 'Taglish'],
  ['Taglish follow-up', 'Ano pong oras kayo bukas? Pwede po ba ako mag walk-in?', 'Taglish'],
  ['English with one loanword does not flip', 'Thanks po', 'English'],
  ['English sentence containing "at" is not misread', 'I will arrive at the clinic at 9am', 'English'],
  ['English sentence containing "na" fragments is not misread', 'My name is Anna and I need a cleaning', 'English'],
  ['empty message defaults to English', '', 'English'],
  ['symptom Taglish', 'masakit po ang ngipin ko', 'Taglish'],
];

/* ---------------------------------------------------------------- run */

let pass = 0;
let total = 0;

console.log('normalizeLists');
for (const [label, input, expected] of listCases) {
  total++;
  const got = normalizeLists(input);
  const ok = got === expected;
  if (ok) pass++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(got)}`);
}

console.log('\nlanguage detection');
for (const [label, input, expected] of langCases) {
  total++;
  const got = detect(input);
  const ok = got === expected;
  if (ok) pass++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label} -> ${got}`);
}

console.log(`\n${pass}/${total} passed`);
process.exit(pass === total ? 0 : 1);
