---
name: rmsv3-demo-builder
description: Use when creating, planning, auditing, or repairing SuitableRMS demo data for a module, flow, or showcase dataset. This skill treats Railway Postgres as the only authority, requires demo writes to land through the current RMSv3 stack, checks dependency readiness before any generation starts, expands related second-layer records, preserves Turkish-market realism, and refuses silent local-only fallback demos.
metadata:
  short-description: Build dependency-aware SuitableRMS demos on Railway Postgres
---

# SuitableRMS Demo Builder

Use this skill when the user asks to create demo records, prepare a showcase
dataset, repair a demo flow, or verify whether a demo is truly DB-first in
`C:\RMSggl\Dropbox\RMSv3`.

This skill is for real RMSv3 demo work, not browser-only fake data.

## Required Preflight

1. Read `C:\RMSggl\Dropbox\RMSv3\SUITABLERMS_PROJECT_GOVERNANCE.md`.
2. Read `C:\RMSggl\Dropbox\RMSv3\OperationSync.md` if it exists.
3. Treat `SUITABLERMS_PROJECT_GOVERNANCE.md` as higher priority than
   `README.md` or any historical note.
4. Identify the requested demo scope:
   - one module
   - one workflow
   - one screen family
   - one showcase dataset
5. Ask for the intended demo quantity before generation starts:
   - exact record count
   - exact branch-day set count
   - or exact grouped coverage count
6. Identify all upstream dependencies before any write starts.

## Canonical Project Truth

- Production data authority is Railway Postgres.
- Frontend DB access goes through `src/lib/db.js`.
- Backend query authority goes through `server/index.js`.
- Auth is bypassed; do not design demo flows around login.
- PIN-driven staff context is not full auth.
- README content about Supabase or AWS is historical and cannot override the
  governance file.

## References

Load only what the task needs:

- `src/lib/db.js`
- `server/index.js`
- `src/lib/demoSalesGenerator.js`
- `src/lib/demoSalesSettings.js`
- `src/hooks/useDemoSalesJob.jsx`
- `src/lib/personnelConfig.js`
- `src/lib/posStaffAuth.js`
- `sales-model.sql`
- `inventory-movements-model.sql`
- `inventory-recalc-functions.sql`
- `demo-sales-presence-rpc.sql`
- `count-flows-model.sql`
- `shift-schedule.sql`

## Historical Artifact Rules

These files may exist, but they are not canonical RMSv3 production authority:

- `README.md` lines that mention Supabase or AWS
- `scripts/run-demo-sales.mjs`
- `scripts/duplicate-sale-items.mjs`
- `supabase-schema.sql`
- `supabase-cloud-quota-triage.sql`
- `supabase-selfhosted-hygiene-audit.sql`

If a demo task depends on one of these legacy artifacts:

- call out the mismatch explicitly
- do not present the legacy path as the current blessed path
- propose the smallest RMSv3-compatible path forward

## User Source Exclusion Rules

Do not use any `.sql` or `.md` file whose filename or file content contains
any of these case-insensitive tokens:

- `aws`
- `supabase`
- `auth`
- `demo-customers`
- `seed`
- `hosted`

Required behavior:

- treat matching files as disallowed sources
- do not cite them, open them for task planning, or use them as implementation
  authority
- if a task appears to depend on one, state that the source is excluded by user
  rule and continue from RMSv3-safe sources only

## Core DB-First Rules

- Demo data must be written to Railway Postgres.
- Local JSON, browser-only arrays, temp files, and local-only seed artifacts do
  not count as demo completion.
- If the UI works only because of local fallback data, mark the demo blocked or
  failed.
- If the target module has no live RMSv3 DB counterpart yet, do not pretend the
  demo is ready.
- If the app cannot reach DB-backed reads or writes, show or report that failure
  explicitly.

## Controlled Write Rules

Demo writes must be traffic-aware and controlled.

Required behavior:

- do not push large demo payloads in one oversized write
- split inserts or upserts into small batches
- prefer ordered batch writes over parallel burst writes
- verify each batch before moving to the next batch
- stop and report if a batch fails instead of flooding retries

Default batching guidance:

- start with small batches such as 25 to 100 records depending on row size and
  table complexity
- use smaller batches for wide rows, JSON-heavy rows, or relation-heavy writes
- write parent entities before dependent child entities
- avoid writing multiple heavy related tables at the exact same time unless the
  path is already proven safe

After each batch:

- record how many rows were attempted
- record how many rows succeeded
- confirm reads or counts match expectations before continuing when practical
- note any retry, throttle, or pause decision in `OperationSync.md`

Not allowed:

- uncontrolled bulk insert storms
- fire-and-forget demo writes
- claiming completion when only part of the batch plan landed
- hiding partial failure behind a final success summary

## Dependency Readiness Rules

Before creating demo data:

1. Check whether the module's own DB model exists.
2. Check whether upstream tables, RPCs, settings keys, or write paths exist.
3. Check whether branch, category, tax, channel, stock, recipe, supplier, or
   personnel context is required.
4. Check whether the demo depends on settings stored in the `settings` table.
5. Check whether the demo depends on legacy Supabase-only tooling that must be
   migrated first.
6. Check whether the requested quantity is explicitly defined.

If any dependency is missing:

- do not silently continue
- state the missing dependency
- propose the smallest prerequisite set

## Demo Completeness Rules

Prefer realistic breadth over toy examples.

The demo should exercise real system behavior when relevant:

- multiple branches
- multiple categories and subcategories
- multiple sale items, stock items, or semi-products
- realistic tax and payment mixes
- varied branch-day or lifecycle states
- supplier, recipe, or inventory relations when the domain needs them
- settings-backed flows that read back from DB after writes

Do not satisfy a meaningful module with a one-record placeholder set unless the
user explicitly asks for the smallest possible sample.

## Turkish Market Rules

All demo data must reflect items that can realistically be used in Turkey.

Use:

- Turkish product names
- Turkish supplier names
- Turkish branch or location naming
- Turkish UI-facing labels and short notes
- TRY-based price context when price-bearing records are involved

Avoid:

- foreign-only product mixes with no Turkish context
- lorem-style placeholder inventory
- repeated clone identities used only to inflate quantity
- long explanatory text inside UI-facing record labels unless requested

## Local Cache Boundary Rules

Some RMSv3 modules use local cache or session convenience state. This does not
change DB authority.

Allowed only as mirrors or convenience layers:

- personnel cache in `src/lib/posStaffAuth.js`
- workspace or branch preference caches
- UI layout/view preferences
- transient job/session mirrors

Not allowed as final demo truth:

- sales truth
- stock truth
- branch master truth
- personnel master truth
- payments or accounting truth

## Default Demo Procedure

1. Identify the target module or flow.
2. Lock the requested demo quantity.
3. Read governance and current operation memory.
4. Trace required DB entities, settings keys, and write paths.
5. Verify that RMSv3, not legacy Supabase tooling, can support the requested
   flow.
6. Design the smallest broad-coverage Turkish-market demo set.
7. Expand second-layer records the flow logically needs.
8. Create a batch plan that keeps DB traffic controlled.
9. Write records to Railway-backed persistence in small verified batches.
10. Verify the UI or query path reads those records back through RMSv3.
11. Record exact actions, commands, files, batch sizes, and blockers in `OperationSync.md`.

## Required Verdicts

Every demo task must end with one of:

- `DEMO_READY`
- `DEMO_READY_WITH_NOTES`
- `DEMO_BLOCKED_BY_DEPENDENCY`
- `DEMO_FAIL_DB_FIRST`

## Output Style

Lead with readiness findings.

Always state:

- target module or flow
- requested demo quantity
- required dependencies
- which dependencies are ready
- which dependencies are missing
- whether legacy artifacts were involved
- what records were created or planned
- what batch plan or batch sizes were used
- whether records were truly written through RMSv3 persistence
- what second-layer relations were included
- what was written into `OperationSync.md`

If blocked, say exactly what must exist before demo creation can continue.
