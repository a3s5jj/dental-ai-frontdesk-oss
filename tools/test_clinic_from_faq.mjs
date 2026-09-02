/**
 * test_clinic_from_faq.mjs - fixtures for the FAQ profile extractor.
 *
 *   node test_clinic_from_faq.mjs
 *
 * Offline, no API calls. Runs the real CLI against synthetic FAQs written to a temp
 * directory, so it tests what a user actually invokes rather than an internal function.
 *
 * The fixtures deliberately vary the wording, because every clinic writes its FAQ
 * differently and the extractor has to survive that. The last two check the property that
 * matters most: when it cannot find a field it says so, instead of inventing one.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cli = resolve(here, 'clinic_from_faq.mjs');
const dir = mkdtempSync(join(tmpdir(), 'faq-'));

let pass = 0;
let fail = 0;

function run(name, markdown, expected, expectMissing = []) {
  const file = join(dir, `${name.replace(/\W+/g, '_')}.md`);
  writeFileSync(file, markdown);

  let out;
  try {
    out = execFileSync(process.execPath, [cli, file], { encoding: 'utf8' });
  } catch (err) {
    // exit code 2 just means some field was missing, which several fixtures expect
    out = (err.stdout || '') + (err.stderr || '');
  }

  const block = out.slice(out.indexOf('--- paste into'), out.indexOf('--- end ---'));
  const problems = [];

  for (const [field, value] of Object.entries(expected)) {
    const line = block.split('\n').find((l) => l.trim().startsWith(`${field}:`));
    const got = line ? line.trim().replace(`${field}:`, '').replace(/,$/, '').trim() : '(absent)';
    if (got !== value) problems.push(`${field}\n      expected ${value}\n      got      ${got}`);
  }

  for (const field of expectMissing) {
    if (!new RegExp(`MISSING\\s+${field}\\b`).test(out)) {
      problems.push(`${field} should have been reported MISSING, but was not`);
    }
  }

  if (problems.length) {
    fail++;
    console.log(`  FAIL  ${name}`);
    for (const p of problems) console.log(`        ${p}`);
  } else {
    pass++;
    console.log(`  PASS  ${name}`);
  }
}

console.log('\nclinic_from_faq');

run(
  'labelled contact lines, 12h clock, closed Sunday',
  `# Bright Smile Dental - Patient FAQ

- **Address:** 12 Example Road, Springfield
- **Mobile:** 0917 555 1234
- **Email:** hello@brightsmile.test

## Hours

Bright Smile Dental is open **Monday to Saturday, 8AM to 5PM**. We are closed on Sundays.

The last walk-in we accept is **4:30PM**.

### Which dentist will I see?

Your dentist at Bright Smile Dental is **Dra. Maria Santos**, who is on duty during all hours.
`,
  {
    clinic_name: `'Bright Smile Dental'`,
    clinic_open_hour: '8',
    clinic_close_hour: '17',
    clinic_closed_weekdays: '[7]',
    clinic_hours_text: `'Monday to Saturday, 8AM to 5PM, closed Sunday'`,
    clinic_address: `'12 Example Road, Springfield'`,
    clinic_mobile: `'0917 555 1234'`,
    clinic_email: `'hello@brightsmile.test'`,
    clinic_dentist: `'Dra. Maria Santos'`,
    clinic_last_walk_in: `'4:30PM'`,
  }
);

run(
  '24h clock, weekend closed, Dentist label',
  `# Northside Dental Care

- **Location:** 400 Oak Avenue, Portland
- **Phone:** (503) 555-0142
- **Email:** front@northside.test
- **Dentist:** Dr. Alan Reeve

We are open Monday to Friday, 09:00 to 18:00.

The last walk-in we accept is 17:30.
`,
  {
    clinic_name: `'Northside Dental Care'`,
    clinic_open_hour: '9',
    clinic_close_hour: '18',
    clinic_closed_weekdays: '[6,7]',
    clinic_dentist: `'Dr. Alan Reeve'`,
    clinic_mobile: `'(503) 555-0142'`,
  }
);

run(
  'open every day produces an empty closed list',
  `# All Days Dental

We are open Monday to Sunday, 8AM to 8PM.
`,
  {
    clinic_open_hour: '8',
    clinic_close_hour: '20',
    clinic_closed_weekdays: '[]',
  }
);

run(
  'a clinic name containing periods does not break the dentist match',
  `# A. B. Dental Clinic - FAQ

Your dentist at A. B. Dental Clinic is **Dra. Jane Cruz**, available all week.
`,
  { clinic_name: `'A. B. Dental Clinic'`, clinic_dentist: `'Dra. Jane Cruz'` }
);

run(
  'a sparse FAQ reports blanks rather than guessing',
  `# Tiny Dental

We do cleanings and fillings. Message us to book.
`,
  { clinic_name: `'Tiny Dental'` },
  [
    'clinic_open_hour',
    'clinic_close_hour',
    'clinic_hours_text',
    'clinic_address',
    'clinic_mobile',
    'clinic_email',
    'clinic_dentist',
    'clinic_last_walk_in',
  ]
);

run(
  'no false hours from an unrelated day-and-time sentence',
  `# Vague Dental

Please arrive 10 minutes early. Our busiest day is Monday.
`,
  { clinic_name: `'Vague Dental'` },
  ['clinic_open_hour', 'clinic_close_hour']
);

// The "still confirming" warning is the honesty check: an incomplete FAQ should say so.
{
  const file = join(dir, 'unconfirmed.md');
  writeFileSync(
    file,
    `# Half Ready Dental

We are open Monday to Friday, 9AM to 5PM.

## Questions we are still confirming

### Do you accept cards?

Not confirmed yet.

### Are you accredited with HMOs?

Not confirmed yet.
`
  );
  let out;
  try {
    out = execFileSync(process.execPath, [cli, file], { encoding: 'utf8' });
  } catch (err) {
    out = (err.stdout || '') + (err.stderr || '');
  }
  if (/still confirming.*section with 2 unanswered questions/s.test(out)) {
    pass++;
    console.log('  PASS  warns about an FAQ with unanswered questions');
  } else {
    fail++;
    console.log('  FAIL  warns about an FAQ with unanswered questions');
  }
}

console.log(`\n${pass}/${pass + fail} passed`);
if (fail) process.exit(1);
