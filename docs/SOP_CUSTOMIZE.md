# Customizing

How to change the things people actually want to change. Each entry names the exact node.

**After any change:** `cd tools && npm test`. It is offline, free, and catches the breakages
that do not announce themselves.

**A note on editing.** You can edit in the n8n UI or edit the JSON and re-import. Do not
alternate between the two on the same workflow, because whichever you do last silently
discards the other. Editing the JSON is more repeatable and reviews better in git.

---

## Clinic name, hours, address, contact details

**Node:** `Prepare Conversation State`, the clinic profile block.

This is the one that matters. Everything downstream reads from it, including the agent's own
system prompt, so changing it here changes the greeting, the opening hours enforcement, the
rejection messages and the answers to "where are you?" all at once.

```js
clinic_name: 'Example Dental Clinic',
clinic_open_hour: 8,               // 24h clock, first bookable hour
clinic_close_hour: 17,             // every appointment must END by this hour
clinic_closed_weekdays: [7],       // ISO weekdays, 1=Mon ... 7=Sun
clinic_hours_text: 'Monday to Saturday, 8AM to 5PM, closed Sunday',
clinic_address: '...',
clinic_mobile: '...',
clinic_email: '...',
clinic_dentist: '...',
clinic_last_walk_in: '4:30PM',
```

Worked examples:

- **Closed weekends:** `clinic_closed_weekdays: [6, 7]`
- **Open seven days:** `clinic_closed_weekdays: []`
- **Half day Saturday:** not supported by these fields. Opening hours are one range applied to
  every open day. See "Different hours on different days" below.

> `clinic_hours_text` is what patients are told, word for word. Nothing checks it against the
> three fields above it. Change them together or the bot will advertise hours it then refuses
> to book.

**Onboarding a new clinic?** Do not type these ten fields. `tools/clinic_from_faq.mjs` reads
them out of the clinic's own FAQ document, which you need anyway for the knowledge base:

```bash
cd tools
node clinic_from_faq.mjs ../their_faq.md --write
```

It shows the source line for every value it found, reports anything it could not find instead
of guessing, and warns you if the FAQ has a "still confirming" section full of questions the
bot will end up deflecting to a human. Deterministic text extraction, no API calls.

`config/clinic.example.json` has the same field list with notes. Copy it to
`config/clinic.json` and keep it updated as your written record. The workflow does not read
it: n8n cannot load a local file at runtime.

---

## Timezone

**Nodes:** 12 of them, plus the environment n8n runs in.

The timezone is a literal string, not a variable, so it has to be changed everywhere at once:

```bash
grep -rl "Asia/Manila" workflows/ | xargs sed -i "s|Asia/Manila|America/New_York|g"
cd tools && npm test
```

`npm test` fails if any node disagrees with `clinic_timezone`. That check exists because
getting this half-right is the worst failure mode in the whole system: bookings land at the
wrong hour and reschedule lookups quietly stop matching, with no error anywhere.

Also set `GENERIC_TIMEZONE` and `TZ` in n8n's own environment to the same value.

---

## The knowledge base

**Tool:** `tools/kb_ingest.mjs`.

This is where prices, services, insurance, policies and directions live. The agent searches it
on every question it cannot answer from the clinic profile.

```bash
cd tools
node kb_ingest.mjs status                              # what is in there now
node kb_ingest.mjs plan   new_faq.pdf --tag faq_v2     # dry run
node kb_ingest.mjs ingest new_faq.pdf --tag faq_v2     # write
node kb_ingest.mjs query  "do you accept walk ins"     # what retrieval returns
node kb_ingest.mjs purge  --source faq_v1              # remove the old version
```

**Always ingest the new version first, verify retrieval, then purge the old one.** In that
order the knowledge base is never empty in between, and the delete stays scoped to one tag.
`purge` refuses to empty the table entirely.

`--tag` sets `metadata.source`, which is the only handle `purge` has. Give every version a new
tag.

If the bot answers a question wrongly, run `query` with the patient's exact wording first.
Nine times out of ten the chunk is not being retrieved at all, and no amount of prompt editing
fixes that. Rewrite the source document so the answer is stated plainly, with the words
patients actually use.

---

## What the bot must collect before booking

**Node:** `AI RAG Front Desk Agent`, system message.

The default five are full name, contact number, age, preferred schedule, and reason for
visit. Search the system message for "Required booking details" and edit the list.

If you **add** a field and want it stored, you also need to:

1. add it to the output schema in `Structured Decision Parser`
2. add it to `Build Booking Row` (the `Bookings` tab) or `Build ToDo Row`
3. add the matching column header to the Google Sheet, spelled identically

Miss step 3 and the value is collected, passed along, and silently dropped at the sheet.

If you **remove** a field, take it out of the system message only. The downstream nodes handle
a missing value.

---

## Language and tone

**Nodes:** `Prepare Conversation State` (detection), `AI RAG Front Desk Agent` (behaviour).

Detection is deterministic on purpose. The agent is *told* what language the patient used
rather than asked to notice, because in testing it mirrored Taglish in one conversation and
answered the same opener in English in another.

```js
const TAGALOG_MARKERS = /\b(po|opo|ako|ikaw|...)\b/g;
// two DISTINCT markers required, so one loanword does not flip the whole reply
const patientLanguage = markerHits.size >= 2 ? 'Taglish' : 'English';
```

- **One language only:** delete the regex and set `patient_language` to a fixed string.
- **A different second language:** replace the marker list with that language's common short
  words. Leave out any word that is also common in your primary language, and keep the
  two-marker threshold, or a single loanword will flip every reply.
- **Politeness particle:** the system message requires "po" in every reply. If you are not in
  the Philippines, delete that rule or the bot will sound absurd.

The greeting stays in the primary language regardless, because the first message arrives
before there is anything to detect from.

---

## Reply formatting

**Node:** `Parse Agent Decision`, the `cleanText()` function.

This strips things the model does that look wrong to patients: wrapping the whole reply in
quotation marks, writing a literal backslash-n instead of a line break, and using dashes in
ways that read oddly.

Two things worth knowing before you touch it:

- **Do not remove `cleanText()`.** Replies come out quoted and full of literal `\n` without it.
- **New rules go above the catch-all, not below.** A dash-range rule added at the bottom once
  turned "Monday to Friday 9 AM to 7 PM" into "Monday, Friday 9 AM, 7 PM" because the general
  rule matched first.

Relatedly, in the agent's system message, **never wrap an example reply in quotation marks**.
The model copies the quotes into its actual output.

---

## Adding a channel

**Nodes:** the webhook entry points, and `Reply Via Meta?`.

The workflow ships with two entry paths that both converge on `Prepare Conversation State`:

- `POST /webhook/frontdesk/meta` for Messenger and Instagram
- `POST /webhook/frontdesk/inquiry` for a website or app

To add a third (WhatsApp, SMS, a live chat vendor):

1. Add a webhook node on a new path.
2. Add a Code node modelled on `Normalize Generic Message` that maps the incoming payload to
   the fields the rest of the workflow expects: `message_text`, `source_channel`,
   `source_user_id`, `clinic_id`.
3. Connect it into `Prepare Conversation State`.
4. For the reply, either extend the `Reply Via Meta?` branch or respond on the webhook.

Everything from `Prepare Conversation State` onward is channel-agnostic and needs no changes.

---

## Opening hours enforcement

**Nodes:** `Check Hours`, `Check Move Hours`, `Build Reject Reply`.

These read the clinic profile and nothing else, so ordinary changes belong in the profile
block, not here.

They enforce three things: the appointment starts no earlier than `clinic_open_hour`, **ends**
no later than `clinic_close_hour`, and does not fall on a closed weekday. An appointment that
starts before closing but would run past it is rejected, which is why a 4:30pm booking against
a 5pm close is refused.

**Different hours on different days** is not supported by the profile fields. It means editing
the comparison logic in both `Check Hours` and `Check Move Hours` to switch on the weekday.
Change both, or reschedules will accept times that new bookings reject.

---

## The confirmation gate

**Nodes:** `Booking Confirmed?`, `Manage Confirmed?`, `Build Booking Confirm Prompt`,
`Build Manage Confirm Prompt`.

Nothing is written to the calendar until the patient explicitly says yes to a specific time.
The bot quotes the slot, waits, and only then books.

This is worth leaving alone. Without it the bot books on any sentence that mentions a time,
including "is 3pm usually busy?".

---

## Which model

**Nodes:** `Anthropic Chat Model`, `Anthropic Fixer Model`.

Ships with `claude-haiku-4-5`, chosen for latency. A patient waiting on Messenger notices a
slow reply.

If replies are good but occasionally miss an instruction, a larger model will help and will
cost more per message. Change both nodes. The fixer model repairs malformed JSON output, so
leaving them mismatched gives you a fixer weaker than the model whose mistakes it repairs.

---

## Agent iteration cap

**Node:** `AI RAG Front Desk Agent`, `maxIterations` (default 8).

This counts model calls per turn, not tool calls. If it is hit mid-conversation the turn ends
with nothing written, which has silently eaten a real confirmed booking before.

Raise it if you add tools. Do not lower it below 8.

---

## Things not to change

- **`outputFormat` on `Slot Still Free?`.** Adding one breaks the availability recheck.
- **`cellFormat: RAW` on the Sheets nodes.** `USER_ENTERED` strips the leading zero from
  mobile numbers.
- **`Event ID` as the match column on `Append Bookings`.** Matching on phone merges families
  who share a number into a single row.
- **`Match Patient To Event`.** It name-verifies a calendar hit before a reschedule or cancel
  touches it, and refuses when two patients are plausible. Removing it means moving strangers'
  appointments.
- **The 14-day date lookup table** at the end of the agent's Context block. The agent reads
  weekdays out of it instead of calculating them, because calculating them put every booking
  one day late.
