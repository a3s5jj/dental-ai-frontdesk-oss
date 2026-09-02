/**
 * test_matcher.mjs - exercise the Match Patient To Event expression that is actually embedded in
 * the workflow JSON, rather than a copy of it, so the test cannot drift from the shipped code.
 *
 *   node test_matcher.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const wf = JSON.parse(
  readFileSync(resolve(here, '..', 'workflows', 'dental_front_desk.json'), 'utf8')
);
const expr = wf.nodes.find((n) => n.name === 'Match Patient To Event').parameters.jsonOutput;

// Strip the n8n `={{ ... }}` wrapper and run the body with mocked node references.
const body = expr.replace(/^=\{\{/, '').replace(/\}\}$/, '');

function run(clientName, events) {
  const $ = (node) => {
    if (node === 'Parse Agent Decision') return { item: { json: { client_name: clientName } } };
    if (node === 'Find Appointment') return { all: () => events.map((e) => ({ json: e })) };
    throw new Error('unexpected node ref: ' + node);
  };
  return new Function('$', 'return (' + body + ');')($);
}

const ev = (id, name, service = 'Cleaning') => ({
  id,
  summary: `Appointment - ${name} - ${service}`,
});

const cases = [
  // The exact failure observed live on 2026-07-28.
  ['live bug: family shared phone', 'Rina Santos', [ev('evMARIA', 'Maria Cruz'), ev('evRINA', 'Rina Santos')], 'evRINA'],
  ['own single booking', 'Rina Santos', [ev('evRINA', 'Rina Santos')], 'evRINA'],
  ['first name only', 'Rina', [ev('evRINA', 'Rina Santos')], 'evRINA'],
  ['case and punctuation', 'rina  SANTOS.', [ev('evRINA', 'Rina Santos')], 'evRINA'],
  ['substring trap: Ana vs Joana', 'Ana', [ev('evJOANA', 'Joana Reyes')], null],
  ['only another patient', 'Rina Santos', [ev('evMARIA', 'Maria Cruz')], null],
  ['no upcoming events', 'Rina Santos', [], null],
  ['blank calendar item', 'Rina Santos', [{}], null],
  // The live 2026-08-16 failure (exec 714): reschedule asks only for the mobile number, so
  // client_name is empty. This used to return no-name-on-request and refuse an appointment the
  // workflow had already found, which made reschedule-by-number impossible for every patient.
  ['no name, one booking, matches on mobile alone', '', [ev('evRINA', 'Rina Santos')], 'evRINA'],
  ['no name, two bookings, must ask for the name', '', [ev('evMARIA', 'Maria Cruz'), ev('evRINA', 'Rina Santos')], null],
  ['no name, three bookings, must ask for the name', '', [ev('evA', 'Maria Cruz'), ev('evB', 'Ben Tan'), ev('evC', 'Joana Reyes')], null],
  ['null name behaves like an empty one', null, [ev('evRINA', 'Rina Santos')], 'evRINA'],
  ['whitespace-only name behaves like an empty one', '   ', [ev('evRINA', 'Rina Santos')], 'evRINA'],
  // Mother and daughter, shared phone AND shared name fragment.
  ['exact beats partial', 'Maria Teresa Cruz', [ev('evMOM', 'Maria Cruz'), ev('evKID', 'Maria Teresa Cruz')], 'evKID'],
  ['ambiguous first name refuses', 'Maria', [ev('evMOM', 'Maria Cruz'), ev('evKID', 'Maria Teresa Cruz')], null],
  ['partial with one candidate is fine', 'Maria Teresa Cruz', [ev('evMOM', 'Maria Cruz')], 'evMOM'],
  ['three bookings, one is mine', 'Ben Tan', [ev('evA', 'Maria Cruz'), ev('evB', 'Ben Tan'), ev('evC', 'Joana Reyes')], 'evB'],
  ['duplicate identical names refuses', 'Maria Cruz', [ev('evX', 'Maria Cruz'), ev('evY', 'Maria Cruz')], null],
];

let pass = 0;
for (const [label, name, events, want] of cases) {
  const got = run(name, events);
  const id = got.matched ? got.id : null;
  const ok = id === want;
  if (ok) pass++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(34)} -> ${(id || 'no match').padEnd(10)} ${got.match_reason}`
  );
}
console.log(`\n${pass}/${cases.length} passed`);
process.exit(pass === cases.length ? 0 : 1);
