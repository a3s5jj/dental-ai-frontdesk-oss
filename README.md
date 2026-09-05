# Dental AI Front Desk

An AI receptionist for dental clinics, built in n8n.

It answers patient messages on Messenger, Instagram, and web chat, then books,
reschedules, and cancels appointments directly in Google Calendar. The model
decides what to say. Plain workflow code decides what gets written.

> **Runnable template.** For the engineering write-up of the production build,
> see [Clinic AI Front Desk: Case Study](https://github.com/a3s5jj/clinic-ai-frontdesk-case-study).

## Problem

A front desk has to do more than reply politely. It has to keep weekdays and dates
aligned, tell apart two patients who share a phone number, refuse to double-book,
decline medical questions it cannot answer, treat the calendar as the source of
truth, and say so when it has reached its limit.

Most of those failures are silent. A friendly reply that books the wrong day still
looks like success.

## What is included

- a 78-node front-desk workflow for webhooks and text channels
- an 8-node knowledge-ingestion workflow
- deterministic booking, reschedule, cancellation, and escalation safeguards
- a Supabase pgvector schema
- offline behavior, structure, and layout tests
- setup, customization, and staff-operation guides

## How it works

```mermaid
flowchart TD
  A[Messenger, Instagram, or website] --> B[Normalize conversation]
  B --> C[AI front desk]
  C <--> D[(Clinic knowledge)]
  C --> E{Requested action}
  E -->|Answer| R[Send reply]
  E -->|Book or move| G[Deterministic guards]
  G --> H[Recheck hours and slot]
  H --> I[(Google Calendar)]
  I --> J[(Google Sheets log)]
  J --> R
  E -->|Needs staff| K[Escalation and task]
  K --> R

  classDef entry fill:#dbeafe,stroke:#1d4ed8,color:#0f172a
  classDef ai fill:#ede9fe,stroke:#6d28d9,color:#0f172a
  classDef logic fill:#dcfce7,stroke:#15803d,color:#0f172a
  classDef ext fill:#fef3c7,stroke:#b45309,color:#0f172a
  classDef stop fill:#fee2e2,stroke:#b91c1c,color:#0f172a
  class A entry
  class C,E ai
  class B,G,H,R logic
  class D,I,J ext
  class K stop
```

The model interprets the conversation and proposes an action. Plain workflow nodes
decide whether a write is allowed. That split keeps calendar and CRM changes behind
explicit confirmation, hours, identity, and availability checks.

## Key decisions

- The workflow rechecks the requested slot immediately before writing to the calendar.
- Every booking, move, or cancellation needs the patient to confirm the exact action.
- Calendar event IDs key the booking rows. Phone numbers do not, because families share them.
- Ambiguous shared-number matches stop and ask for a name instead of guessing a person.
- Unsupported clinic facts go to staff rather than becoming a plausible guess.
- The workflow never diagnoses symptoms and never discusses medication.
- A completion message goes out only after the calendar write returns success.

## Verification

I tested the public copy on 2026-09-02.

| Check | Result |
|---|---:|
| Main workflow structure | passed, 78 nodes |
| Knowledge workflow structure | passed, 8 nodes |
| Focused behavior checks | 58 / 58 passed |
| Workflow layout checks | 11 / 11 passed |
| Export active state | inactive |
| Configuration placeholders | 12 remain by design |
| Blank-profile n8n import | 2 / 2 accepted, inactive |

See [TEST_REPORT.md](TEST_REPORT.md) and the sanitized
[import result](evidence/public_export_import_verification.json).

## Prerequisites

- Node.js 20 or later
- n8n 2.27.4 or a version you have tested for compatibility
- Anthropic for the chat model
- OpenAI for embeddings
- Supabase with pgvector for clinic knowledge
- Google Calendar, Sheets, and Gmail credentials
- a Meta app only when using Messenger or Instagram

## Quick start

1. Import the inactive workflows.
   ```bash
   n8n import:workflow --input="workflows/dental_front_desk.json"
   n8n import:workflow --input="workflows/knowledge_ingestion.json"
   ```
2. Run the offline checks.
   ```bash
   cd tools
   npm test
   ```
3. Follow [docs/SOP_SETUP.md](docs/SOP_SETUP.md), attach credentials in n8n,
   and replace every value the validator reports.
4. Test with synthetic patient conversations and a dedicated calendar. Keep both
   workflows inactive until calendar, CRM, escalation, and privacy checks pass.

The test tools deliberately reuse Luxon from a global n8n installation so their
date behavior matches the target runtime.

## Configuration

Clinic name, hours, address, contact details, dentist, timezone, and walk-in cutoff
live together in the `Prepare Conversation State` node. A reference shape is in
[`config/clinic.example.json`](config/clinic.example.json).

Credentials belong in n8n's encrypted credential store. The optional local
knowledge-ingestion tool reads only these values from a private `.env` file:

```text
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
OPENAI_API_KEY=
```

Use [`.env.example`](.env.example) as the inventory and never commit the filled file.

## Knowledge base

[`tools/kb_ingest.mjs`](tools/kb_ingest.mjs) gives PDF knowledge updates a reviewable
path: plan the chunks, ingest a tagged version, query it, and only then purge the old
tag. The n8n ingestion workflow stays available for teams that prefer a watched Drive
folder.

## Scope and limits

This export ships inactive. It carries example clinic details and `REPLACE_*`
placeholders, never a clinic account, patient data, or production credentials. The
checks above test the template offline. They do not show that your Meta, Google,
Anthropic, OpenAI, or Supabase integration works.

- Handles text messages, not phone calls.
- Writes appointment reminders as staff tasks. It does not send them.
- Defaults follow a Philippine dental-clinic workflow and need localization.
- Stores names, phone numbers, and conversation context. Whoever deploys it owns
  lawful handling, retention, access control, and consent.
- Still needs monitoring. The deterministic guards narrow the failure surface. They
  do not make the system clinically authoritative.
- Makes no cost, conversion, response-time, or production-volume claim.

## Repository map

- `workflows/` - inactive n8n exports
- `tools/` - validation, tests, and knowledge utilities
- `docs/` - setup, customization, and staff SOPs
- `config/` - synthetic clinic-profile example
- `supabase/` - knowledge-store schema

## License

MIT. See [LICENSE](LICENSE). Do not include real patient data in issues, pull
requests, screenshots, or test fixtures.
