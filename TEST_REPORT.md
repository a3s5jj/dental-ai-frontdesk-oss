# Test Report

Public export checked: 2026-09-02

Verification level: `OFFLINE_VERIFIED`

## Command

```bash
cd tools
npm test
```

## Result

- `dental_front_desk.json`: structural validation passed, 78 nodes, inactive
- `knowledge_ingestion.json`: structural validation passed, 8 nodes, inactive
- appointment matcher: 18 / 18 passed
- clinic-hours behavior: 15 / 15 passed
- reply and language handling: 18 / 18 passed
- FAQ-to-profile extraction: 7 / 7 passed
- deterministic workflow layouts: 11 / 11 passed

The validator reported 12 `REPLACE_*` configuration values. That is intentional:
the repository contains no bound credential, account, calendar, spreadsheet,
folder, email, or Meta token.

The two public JSON files were also imported into a blank, isolated n8n 2.27.4
profile on 2026-09-02. The 78-node front desk and 8-node knowledge workflow were
accepted and remained inactive. See
[`evidence/public_export_import_verification.json`](evidence/public_export_import_verification.json).

## Evidence boundary

The offline checks execute deterministic code and inspect the exported workflow
graphs. The import check confirms schema acceptance only. Neither contacts Meta,
Google, Anthropic, OpenAI, or Supabase. Verify each external integration in an
account-owned test environment before any activation.
