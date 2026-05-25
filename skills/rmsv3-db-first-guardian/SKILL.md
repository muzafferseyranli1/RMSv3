---
name: rmsv3-db-first-guardian
description: Use when auditing SuitableRMS modules, features, demos, scripts, migrations, or cleanup candidates for DB-first architecture and safe repo hygiene. This skill treats Railway Postgres as the only production authority, verifies that frontend reads and writes flow through the current RMSv3 stack, separates allowed local convenience caches from forbidden local truth, flags historical Supabase or AWS artifacts as non-canonical, and protects active memory and governance documents during cleanup.
metadata:
  short-description: Audit SuitableRMS for Railway-first persistence and safe cleanup
---

# SuitableRMS DB First Guardian

Use this skill to audit RMSv3 for persistence authority, live DB parity,
demo-data correctness, local cache boundaries, historical artifact handling,
and safe repo cleanup.

This skill has two modes:

1. `DB-first audit`
2. `Repo hygiene cleanup`

## Required Preflight

1. Read `C:\RMSv3\SUITABLERMS_PROJECT_GOVERNANCE.md`.
2. Read `C:\RMSv3\OperationSync.md` if it exists.
3. Treat the governance file as canonical when it conflicts with `README.md`
   or historical artifacts.
4. Identify the audit target:
   - one module
   - one feature
   - one demo flow
   - one script
   - the whole repo
5. Decide the mode:
   - DB-first audit
   - cleanup
   - combined pass

## Canonical RMSv3 Truth

- Railway Postgres is the only production database.
- `src/lib/db.js` is the canonical frontend DB client abstraction.
- `server/index.js` is the canonical query gateway.
- Auth is bypassed and cannot be used as a dependency excuse.
- Supabase and AWS references are historical unless explicitly re-approved in
  writing.

## References

Load only what the task needs:

- `src/lib/db.js`
- `server/index.js`
- `src/lib/settingsStore.js`
- `src/lib/personnelConfig.js`
- `src/lib/posStaffAuth.js`
- `scripts/check-hosted-supabase-decommission.mjs`
- `scripts/check-protected-docs.mjs`
- `protected-docs.json`
- `README.md`
- `package.json`
- `src/`
- `server/`
- `scripts/`

## DB Authority Rules

Treat these as hard rules unless the user explicitly changes architecture:

- Live Railway Postgres is the primary source of truth.
- Browser storage, in-memory state, temp JSON, and demo seed files are not
  authority.
- Local persistence may exist only as cache, device-local convenience state, or
  transient session mirror.
- Demo data must land in the live RMSv3 persistence path.
- A UI module is not operationally complete if its required RMSv3 DB
  counterpart does not exist.

## Allowed Local Persistence

Local-only persistence is allowed only for narrow cases such as:

- branch or workspace preference selection
- POS or garson device-local UI preferences
- transient job mirrors
- personnel/session convenience cache after server-backed truth exists
- kiosk station/device-local settings

Local-only persistence is not allowed for:

- business master data truth
- branch/company master truth
- personnel master truth
- sales, orders, payments, stock, or accounting truth
- demo completion claims

## Historical Artifact Rules

When auditing RMSv3, treat these as historical or transitional until proven
otherwise:

- Supabase references in `README.md`
- `scripts/run-demo-sales.mjs`
- `scripts/duplicate-sale-items.mjs`
- `supabase-*.sql`
- any path, env var, or script that assumes `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`, or direct Supabase client authority

Required behavior:

- do not let historical artifacts override governance
- do not delete them blindly if they still document migration history
- flag them as migration residue or cleanup candidates only after checking live
  dependencies

## Demo Data Rules

- Demo flows must hit Railway-backed persistence.
- Helper SQL or scripts count only if they are actually applied to the current
  RMSv3 path.
- If a demo works only because of local mocks, local JSON, or browser state,
  mark it `FAIL_DB_FIRST`.
- If a demo tool is still Supabase-only, mark it mismatched with governance
  until migrated or replaced.

## Repo Hygiene Rules

Protected files and folders must not be deleted during cleanup unless the user
explicitly names them:

- `SUITABLERMS_PROJECT_GOVERNANCE.md`
- `DESIGN_HANDBOOK_V3_TR.md`
- `DEPLOY_MANAGER_TR.md`
- `schema-railway-master.sql`
- `OperationSync.md`
- `protected-docs.json`
- active `skills/`
- protected docs already listed in `protected-docs.json`
- SQL model files that still describe active RMSv3 domains
- migration, handoff, decision, or policy artifacts still referenced by active
  work

Default cleanup candidates may include:

- reproducible temp build outputs
- stale throwaway reports
- obsolete scratch notes that are not referenced anywhere active
- historical artifacts only after their purpose is confirmed as complete

Extra caution:

- `temp-dist-verify-kiosk-cleanup/` may be reproducible, but verify usage before
  deletion
- ambiguous `.md` files should be reported before deletion

## Default Audit Procedure

1. Identify the target module or repo area.
2. Read governance and current operation memory.
3. Trace where the data comes from:
   - Railway-backed RMSv3 path
   - browser storage
   - static JSON
   - historical Supabase tooling
   - memory-only state
4. Check whether the implemented module has a live DB counterpart.
5. Check whether writes reach RMSv3 persistence.
6. Check whether reads depend on live DB or only local state.
7. Check whether local cache can be dropped without losing truth.
8. Check whether historical artifacts create false confidence.
9. If cleanup mode is active, classify files as:
   - protected
   - active
   - historical but still needed
   - safe cleanup candidate
10. Record findings and next steps in `OperationSync.md`.

## Required Verdicts

For DB-first audit, end with one of:

- `PASS_DB_FIRST`
- `PASS_WITH_NOTES`
- `FAIL_DB_FIRST`
- `BLOCKED`

For cleanup mode, end with one of:

- `NO_CLEANUP_NEEDED`
- `CLEANUP_CANDIDATES_FOUND`
- `CLEANUP_DONE`
- `BLOCKED`

## Output Style

Lead with findings.

Always state:

- which module, repo area, or script was checked
- whether live RMSv3 DB parity exists
- whether local storage is authority or only cache
- whether demo data truly lands in Railway-backed persistence
- whether historical artifacts affect the result
- whether cleanup candidates were found
- what is protected and must remain
- what was written into `OperationSync.md`

When cleanup is requested, separate:

- safe-to-delete now
- historical but review first
- protected, never delete by default
