# Setup and go-live

For whoever is standing this up. Budget two to three hours for the first one, most of it
waiting on Google OAuth consent screens.

Work top to bottom. Every step has a way to check it worked before you move on. **Keep the
workflow inactive until the very last step.**

---

## Before you start

You need accounts for all of these. All have free tiers except the two AI providers, which
bill per use and will cost you cents during setup.

- **n8n**, self-hosted (`npm install -g n8n`) or cloud
- **Anthropic** API key
- **OpenAI** API key (embeddings only)
- **Supabase** project
- A **Google account** for Calendar, Sheets and Gmail
- A **Meta** app, only if you want Messenger or Instagram

---

## 1. Set the n8n timezone

Do this first. It is the single most common cause of a broken install, and it fails silently.

Set both of these in the environment n8n runs in, **not** in the workflow:

```bash
GENERIC_TIMEZONE=Asia/Manila
TZ=Asia/Manila
```

Use your own IANA timezone. Without these, n8n falls back to `America/New_York`. Bookings
land at the wrong hour, and reschedule and cancel lookups stop finding appointments with no
error message at all.

**Check:** restart n8n, open any workflow, and confirm the timezone shown in Settings is
yours.

---

## 2. Create the knowledge store

1. Open your Supabase project, go to **SQL Editor**, **New query**.
2. Paste the whole of [`supabase/schema.sql`](../supabase/schema.sql) and run it.

This creates the `documents` table, the vector index, and the `match_documents` function the
agent calls.

**Check:** in **Table Editor** you should see an empty `documents` table with an `embedding`
column.

---

## 3. Import the workflows

```bash
n8n import:workflow --input=workflows/dental_front_desk.json
n8n import:workflow --input=workflows/knowledge_ingestion.json
```

The JSONs carry their own ids, so re-running this updates in place rather than creating
duplicates.

> **Do not save from the n8n editor after an import if you also plan to re-import.** The
> editor writes the whole workflow back, so your next import will overwrite whatever you
> changed in the UI, or your UI edit will overwrite the import. Pick one direction and stick
> to it. Editing the JSON and re-importing is the more repeatable of the two.

**Check:** both workflows appear in the n8n workflow list, and both are **inactive**.

---

## 4. Create the credentials

In n8n, go to **Credentials** and create these. The names do not matter, but you have to
attach each one to its nodes by hand after creating it.

| Credential type | Nodes that need it |
|---|---|
| Anthropic | `Anthropic Chat Model`, `Anthropic Fixer Model` |
| OpenAI | `OpenAI Embeddings` (and the one in the ingestion workflow) |
| Supabase | `Supabase RAG Tool` (and the vector store in the ingestion workflow) |
| Google Calendar OAuth2 | `Check Availability`, `Create Calendar Appointment`, `Find Appointment`, `Find Conflicts`, `Slot Still Free?`, `Update Appointment`, `Delete Appointment` |
| Google Sheets OAuth2 | `Append Bookings`, `Append All Chats`, `Append To Do`, `Append Reminder Checklist` |
| Gmail OAuth2 | `Send Staff Email`, `Email Workflow Error To Staff` |
| Google Drive OAuth2 | ingestion workflow only |

The three Google OAuth credentials can reuse the same Google Cloud project and client
id/secret. You still create them separately in n8n because they request different scopes.

**Check:** open each node listed above. None should show a red "credentials not set"
warning.

---

## 5. Build the CRM spreadsheet

Create one Google Sheet with **three tabs**. The tab names and the header spelling have to
match exactly, character for character. The workflow maps values by header name, so a typo
means that field silently never lands.

**Tab `Bookings`**

```
Event ID | Appointment | Patient | Age | Service | Phone | Status | Notes
```

`Event ID` is the match key. Google Calendar assigns it per appointment and keeps it stable
across reschedules, so a reschedule updates the existing row instead of adding a new one.
Matching on `Phone` instead would merge a family who share a number into one row.

**Tab `All Chats`**

```
Date | Patient | Channel | Type | Summary | Outcome
```

**Tab `To Do`**

```
Date | Patient | Phone | What they need | Details | Priority | Status | Notes | 1st Reminder | 2nd Reminder
```

Make the last two **checkbox** columns. The workflow never writes them: staff tick them by
hand. See [SOP_STAFF.md](SOP_STAFF.md).

> **Do not change the cell format setting in the Sheets nodes.** They use `RAW` on purpose.
> `USER_ENTERED` strips the leading zero off mobile numbers that have one.

**Check:** the sheet has three tabs and the headers match above.

---

## 6. Create the calendar

Use a dedicated Google Calendar for appointments, not a personal one. Note its calendar id
(Calendar settings, "Integrate calendar", **Calendar ID**).

**Check:** the calendar is empty and you can see its id.

---

## 7. Fill in the placeholders

Run this to see everything still outstanding:

```bash
cd tools && npm test
```

It prints each `REPLACE_` placeholder with the nodes it appears in. Work the list:

| Placeholder | Where | What to put |
|---|---|---|
| `REPLACE_CALENDAR_ID` | 7 Calendar nodes | your calendar id from step 6 |
| `REPLACE_CRM_SHEET_ID` | 4 Sheets nodes | the spreadsheet id from its URL |
| `REPLACE_STAFF_ALERT_EMAIL` | 2 Gmail nodes | who gets escalations and errors |
| `REPLACE_CLINIC_ID` | `Normalize Meta Message`, `Normalize Generic Message` | any short slug, e.g. `smile-dental` |
| `REPLACE_META_VERIFY_TOKEN` | `Check Meta Verify Token` | a random string you invent, Messenger only |
| `REPLACE_META_PAGE_TOKEN` | `Send Meta Reply` | Meta Page Access Token, Messenger only |
| `REPLACE_CRED_*` | various | these clear themselves when you attach credentials in step 4 |

Skip the two Meta ones if you are only using a website widget.

**Check:** `npm test` says `placeholders: none left, workflow is configured`.

---

## 8. Enter your clinic details

Open the `Prepare Conversation State` node and edit the clinic profile block. This is the
only place your clinic's identity lives.

**Get the values from the clinic's FAQ rather than typing them.** You need that FAQ anyway
for step 9, and it already contains all ten fields. Ask the clinic for it first, then:

```bash
cd tools
node clinic_from_faq.mjs ../clinic_faq.md
```

It prints a paste-ready block and shows the line each value came from, so you can check them.
Anything it could not find is reported `MISSING` rather than guessed, and you fill those in by
hand. Add `--write` to also save `config/clinic.json` as your written record.

It reads only the document you point it at. No API keys, no network.

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

`clinic_hours_text` is shown to patients word for word and is **not** checked against the
three numeric fields above it. If they disagree, the bot tells patients one thing and enforces
another. Read them together before moving on.

Record what you set in `config/clinic.json` (copy `config/clinic.example.json`) so the next
person knows.

`clinic_timezone` is the one field the FAQ will not have. Set it yourself.

If you are outside the Philippines, also read the "Defaults you will probably want to change"
section of the [README](../README.md). Timezone, the Taglish detector and the "po" politeness
rule all need attention.

**Check:** `cd tools && npm test` still passes.

---

## 9. Load the knowledge base

The bot only knows what you give it. Write your clinic FAQ as a document and export it to
PDF. Cover, at minimum:

- services and prices
- opening hours and holidays
- address and parking
- insurance and payment methods
- what to bring to a first visit
- cancellation policy
- whether you see children
- emergency and after-hours instructions

Then:

```bash
cd tools
node kb_ingest.mjs plan   clinic_faq.pdf --tag faq_v1    # dry run, writes nothing
node kb_ingest.mjs ingest clinic_faq.pdf --tag faq_v1
node kb_ingest.mjs status
node kb_ingest.mjs query "how much is a cleaning"
```

`query` shows what retrieval actually returns. Try five or six real questions. If the right
chunk does not come back, the bot will not find it either, and the fix is better source
material rather than a better prompt.

**Check:** `status` shows your chunks, and `query` returns the relevant one at the top.

---

## 10. Test in the chat panel

Open the workflow and use the n8n chat panel. Work through all of these. This costs a few
cents in API calls and is the most important step in this document.

- [ ] Just "hi", confirm your clinic greeting comes back
- [ ] A question your knowledge base answers
- [ ] A question it does not answer, confirm the staff escalation email fires
- [ ] Start a booking with no details, confirm it asks for all five: full name, contact
      number, age, preferred schedule, reason for visit
- [ ] Book a slot that is already taken, confirm it offers alternatives
- [ ] Ask for a time outside opening hours, confirm it refuses and says the real hours
- [ ] Ask for a day you are closed, confirm it refuses
- [ ] Complete a booking, then **open Google Calendar and confirm the event is really there**
      at the right time, and that the `Bookings` row landed with `Age` filled in
- [ ] Reschedule it, confirm the calendar event moved and the **existing** `Bookings` row was
      updated rather than a second one added
- [ ] Cancel it, confirm the event is gone from the calendar
- [ ] Ask a symptom question ("my tooth hurts, what medicine should I take"), confirm it does
      not diagnose or name a medication

> **Verify every booking from the calendar itself, never from what the bot says it did.** They
> can disagree. The calendar is the truth.

---

## 11. Connect a channel

**Website or app:** POST to `/webhook/frontdesk/inquiry` with the message text, a stable
`source_user_id` for the conversation, and your clinic id.

**Messenger or Instagram:** in your Meta app, point the webhook at
`/webhook/frontdesk/meta`, using the verify token you set in step 7. Meta calls the GET
endpoint first to verify, then POSTs messages to the same path.

**Check:** Meta's webhook screen shows the subscription as verified.

---

## 12. Activate

Only now. Toggle the workflow to **Active**.

Then send one real message from a real account and watch it work end to end.

---

## After go-live

- **Watch the first week of executions.** n8n's execution list shows every conversation.
- **Watch the To Do tab.** Rows that are not `Appointment reminder` are things the bot could
  not handle and are your best guide to what is missing from the knowledge base.
- **Expect to add to the knowledge base.** The questions patients actually ask are never quite
  the ones you predicted.
- **Re-run `npm test` after every workflow edit.** It is offline and free.
