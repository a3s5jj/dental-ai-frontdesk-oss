/**
 * test_hours.mjs - offline unit test for the clinic hours guard.
 *
 *   node test_hours.mjs
 *
 * Pulls the `time_ok` expression straight out of the SHIPPED workflow JSON, the same way
 * test_matcher.mjs pulls the patient matcher, so this tests what is actually deployed rather
 * than a copy that can drift.
 *
 * Guards the two bugs found 2026-08-16:
 *   - hours were Mon-Fri 9-19 / Sat 9-17 when the clinic is Mon-Sat 8-17
 *   - an appointment could END after closing because only the start was checked
 *
 * Luxon is not a dependency of this folder, so it is borrowed from the global n8n install,
 * which is the same library the expression runs against in production.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const wfPath = resolve(here, '..', 'workflows', 'dental_front_desk.json');

function loadLuxon() {
  const req = createRequire(import.meta.url);
  try {
    return req('luxon');
  } catch {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return createRequire(resolve(globalRoot, 'n8n', 'node_modules', 'luxon', 'package.json'))('luxon');
  }
}

const { DateTime } = loadLuxon();

const wf = JSON.parse(readFileSync(wfPath, 'utf8'));

const prep = wf.nodes.find((n) => n.name === 'Prepare Conversation State');
const checkHours = wf.nodes.find((n) => n.name === 'Check Hours');
if (!prep || !checkHours) throw new Error('required nodes not found in the front desk workflow');

// Read the clinic profile back out of the Code node so the test uses the shipped values.
function profileValue(key, fallback) {
  const m = prep.parameters.jsCode.match(new RegExp(key + ":\\s*('([^']*)'|\\[([^\\]]*)\\]|(\\d+))"));
  if (!m) throw new Error(`clinic profile key ${key} not found in ${prep.name}`);
  if (m[2] !== undefined) return m[2];
  if (m[3] !== undefined) return m[3].split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n));
  return Number(m[4]);
}

const profile = {
  clinic_timezone: 'Asia/Manila',
  clinic_open_hour: profileValue('clinic_open_hour'),
  clinic_close_hour: profileValue('clinic_close_hour'),
  clinic_closed_weekdays: profileValue('clinic_closed_weekdays'),
};

const raw = checkHours.parameters.assignments.assignments.find((a) => a.name === 'time_ok').value;
const body = raw.replace(/^=\{\{\s*/, '').replace(/\s*\}\}$/, '');

// Stand-ins for the n8n runtime: $() resolves the profile node, $json is the item under test.
function run(appointmentStart, appointmentEnd) {
  const $ = () => ({ item: { json: profile } });
  const $json = { appointment_start: appointmentStart, appointment_end: appointmentEnd };
  // eslint-disable-next-line no-new-func
  const fn = new Function('DateTime', '$', '$json', `return ${body};`);
  return fn(DateTime, $, $json);
}

// A Monday well in the future, so "is it in the past" never flakes.
const MON = '2026-09-07'; // Monday
const SAT = '2026-09-12'; // Saturday
const SUN = '2026-09-13'; // Sunday

const cases = [
  // [label, start, end, expected]
  ['8AM Monday start, the exact opening hour', `${MON}T08:00:00+08:00`, `${MON}T09:00:00+08:00`, true],
  ['10AM Monday, ordinary slot', `${MON}T10:00:00+08:00`, `${MON}T11:00:00+08:00`, true],
  ['4PM Monday, last slot that ends at closing', `${MON}T16:00:00+08:00`, `${MON}T17:00:00+08:00`, true],
  ['4:30PM Monday, would end 5:30PM after closing', `${MON}T16:30:00+08:00`, `${MON}T17:30:00+08:00`, false],
  ['5PM Monday, starts at closing', `${MON}T17:00:00+08:00`, `${MON}T18:00:00+08:00`, false],
  ['6PM Monday, the slot the old rule wrongly allowed', `${MON}T18:00:00+08:00`, `${MON}T19:00:00+08:00`, false],
  ['7AM Monday, before opening', `${MON}T07:00:00+08:00`, `${MON}T08:00:00+08:00`, false],
  ['4PM Saturday, Saturday keeps full hours now', `${SAT}T16:00:00+08:00`, `${SAT}T17:00:00+08:00`, true],
  ['10AM Sunday, clinic closed', `${SUN}T10:00:00+08:00`, `${SUN}T11:00:00+08:00`, false],
  ['3AM Sunday, the reschedule hole', `${SUN}T03:00:00+08:00`, `${SUN}T04:00:00+08:00`, false],
  ['a date in the past', '2020-01-06T10:00:00+08:00', '2020-01-06T11:00:00+08:00', false],
  ['garbage start', 'not-a-date', `${MON}T11:00:00+08:00`, false],
  ['missing end falls back to one hour, still valid', `${MON}T10:00:00+08:00`, '', true],
  ['missing end at 4:30PM would overrun closing', `${MON}T16:30:00+08:00`, '', false],
  ['spans midnight into the next day', `${MON}T16:00:00+08:00`, '2026-09-08T09:00:00+08:00', false],
];

let pass = 0;
console.log(
  `clinic profile from workflow: open ${profile.clinic_open_hour}:00, close ${profile.clinic_close_hour}:00, closed weekdays [${profile.clinic_closed_weekdays}]\n`
);
for (const [label, start, end, expected] of cases) {
  let got;
  try {
    got = run(start, end);
  } catch (err) {
    got = `threw: ${err.message}`;
  }
  const ok = got === expected;
  if (ok) pass++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        expected ${expected}, got ${got}`);
}

console.log(`\n${pass}/${cases.length} passed`);
process.exit(pass === cases.length ? 0 : 1);
