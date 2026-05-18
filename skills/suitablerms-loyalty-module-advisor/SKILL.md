---
name: suitablerms-loyalty-module-advisor
description: Analyze, audit, plan, and implement phased SuitableRMS loyalty module improvements. Use when working on loyalty campaigns, tiers, rewards, customer categories, omnichannel readiness, fraud controls, loyalty UX, or cross-module impact across POS, kiosk, garson, mobile, and related backoffice surfaces.
---

# Suitablerms Loyalty Module Advisor

## Overview

Use this skill to act like a loyalty-domain specialist for SuitableRMS. Combine product-gap analysis, technical readiness auditing, phased recommendation design, and cross-module implementation discipline while staying inside project governance, design rules, `OperationSync.md`, and `LOYALTYMEMORY.md`.

## Mandatory Reads

Read these files in this order before making recommendations or code changes:

1. `SUITABLERMS_PROJECT_GOVERNANCE.md`
2. `OperationSync.md`
3. `LOYALTYMEMORY.md`
4. `DESIGN_HANDBOOK_V3_TR.md`
5. The most relevant loyalty code and routes
   Start with:
   - `src/lib/loyalty.js`
   - `src/components/pages/LoyaltyManagement.jsx`
   - `src/components/loyalty/LoyaltyCampaignWizard.jsx`
   - `src/components/pages/LoyaltyCampaignWizardPreview.jsx`
   - `src/App.jsx`

If `LOYALTYMEMORY.md` does not exist, create it in the repo root before continuing.

## Memory-First Startup Protocol

Do not blindly re-scan the whole loyalty surface on every task.

Start each loyalty task like this:

1. Read `SUITABLERMS_PROJECT_GOVERNANCE.md`, `OperationSync.md`, and `LOYALTYMEMORY.md`.
2. Check whether the latest loyalty entries already identify:
   - the active feature or phase,
   - the last changed files,
   - the remaining next step,
   - any open risk or blocker.
3. If that memory is still specific enough for the user's current ask, continue from memory first and inspect only the files directly related to the next step.
4. Only fall back to broader codebase re-scanning when:
   - the memory is stale,
   - the current ask changes scope,
   - route/runtime truth may have drifted,
   - the previous handoff is ambiguous,
   - or there is a concrete reason to doubt the recorded state.

Use `LOYALTYMEMORY.md` as the default continuation anchor for loyalty work. Re-read broad loyalty surfaces only when needed for verification, drift detection, or a new scope.

## Ground Rules

- Treat Railway Postgres as the only source of truth. Never propose Supabase, AWS, or local mock persistence.
- Respect the no-auth governance model. Do not invent login, JWT, or OAuth dependencies unless the user explicitly changes project policy.
- Keep all loyalty work DB-first and production-realistic. Do not paper over missing backend behavior with fake UI states.
- Follow `DESIGN_HANDBOOK_V3_TR.md` for UI-facing proposals and implementations.
- Update both `OperationSync.md` and `LOYALTYMEMORY.md` after meaningful findings, decisions, plans, or implementations.
- Preserve existing user changes. Never revert unrelated work.

## Current Product Priorities

Use `references/backlog-priorities.md` as the default product lens.

Treat these as immediate loyalty priorities unless the user explicitly overrides them:

- Ready-made customer segments
- Lifecycle campaign templates
- Reward model consistency
- Stronger tier behavior
- Omnichannel consistency across channel surfaces
- Basic abuse and fraud controls
- Ready-made campaign templates for operations and marketing

Treat these as valuable but phase-later items:

- Subscription loyalty
- Advanced gamification
- Experiential rewards
- Richer customer profile intelligence
- Campaign performance analytics
- A/B testing
- Offline-to-digital bridges such as receipt/QR capture

## Working Modes

### 1. Gap Analysis Mode

Use this when the user asks what is missing, weak, overbuilt, or phase-worthy.

Do this:

1. Inspect the current loyalty surface map from `references/current-module-scope.md`.
2. Compare the ask against:
   - current code reality,
   - existing persistence and runtime support,
   - affected UI surfaces,
   - the immediate and later-phase backlog.
3. Return findings grouped as:
   - `Bizde var`
   - `Kismen var`
   - `Eksik`
   - `Hemen backlog'a girsin`
   - `Bekleyebilir`
   - `Simdilik dokunmayalim`

### 2. Recommendation Mode

Use this when the user asks for phased proposals.

Return phase-based proposals in this shape:

1. `Phase goal`
2. `Business value`
3. `Required surfaces`
4. `Technical dependencies`
5. `Risks`
6. `Why now / why later`

Bias toward phases that are valuable without requiring speculative enterprise-only infrastructure.

### 3. Readiness Audit Mode

Use this after the user approves a proposal and wants to know whether the system is ready for it.

Inspect and report on all of these dimensions:

- `UI readiness`
  Are the relevant backoffice, POS, kiosk, garson, mobile, or public-order flows already present?
- `Database readiness`
  Do tables, fields, relationships, and existing persistence helpers support the feature?
- `Runtime readiness`
  Can the loyalty evaluator, save/load flow, and downstream execution path actually enforce it?
- `Cross-module readiness`
  Will POS, kiosk, garson, mobile, or online package/order flows understand the new behavior?
- `Operational readiness`
  Are logs, approvals, staff controls, or analytics needed?
- `Design readiness`
  Can the UX be implemented without violating the design handbook?

Use the audit template in `references/readiness-audit-template.md`.

Always mark each area with one of:

- `Ready`
- `Partial`
- `Missing`
- `Blocked by governance`

### 4. Planning Mode

Use this when the user wants implementation planning.

In Plan mode, produce a concrete plan that includes:

- loyalty module changes,
- cross-module follow-up work,
- validation steps,
- documentation updates,
- `OperationSync.md` and `LOYALTYMEMORY.md` updates.

Split work into phases and list the module owners implicitly by file or subsystem:

- loyalty engine
- backoffice loyalty UI
- wizard/create flow
- POS
- garson
- kiosk
- mobile
- supporting DB/schema or API work

### 5. Implementation Mode

Use this when the user wants the approved plan executed.

Implementation workflow:

1. Re-read the approved recommendation and readiness audit.
2. Verify prerequisites again in code before editing.
3. Implement the loyalty-side change first.
4. Implement required fixes in affected modules.
5. Validate with build/tests or the strongest available local checks.
6. Update `OperationSync.md`.
7. Update `LOYALTYMEMORY.md`.

Never stop at only the backoffice loyalty UI if the approved feature also needs POS, kiosk, garson, or mobile support.

## Required Audit Outputs

When preparing a readiness report, include:

- `Feature`
- `Approved phase`
- `Business intent`
- `Current support`
- `Files inspected`
- `UI readiness`
- `Database readiness`
- `Runtime readiness`
- `Surface impact`
- `Risks and blockers`
- `Suggested implementation order`
- `Can start now?`

## Cross-Module Surface Checklist

For each meaningful loyalty enhancement, explicitly inspect whether it affects:

- `src/components/pages/LoyaltyManagement.jsx`
- `src/components/loyalty/LoyaltyCampaignWizard.jsx`
- `src/components/pages/LoyaltyCampaignWizardPreview.jsx`
- `src/lib/loyalty.js`
- POS-facing order and checkout surfaces
- Garson / Masa flows
- Kiosk flows
- Mobile app shells or mobile customer surfaces
- Coupon, reward, customer category, or staff approval flows

Do not assume a loyalty feature is complete just because the campaign editor can save it.

## Memory Protocol

Use `LOYALTYMEMORY.md` as loyalty-specific working memory.

Before broad exploration, first ask:

- `Can I continue from the latest LOYALTYMEMORY entry?`
- `Do the last affected surfaces and next step already match this request?`

If yes, continue from that state and inspect only the minimum required files.
If no, explicitly note the drift or missing context, then expand to a wider scan.

Append entries for:

- product conclusions,
- approved phase decisions,
- readiness audit results,
- cross-module blockers,
- implementation outcomes,
- unresolved loyalty debt.

Keep `OperationSync.md` broader and operational. Keep `LOYALTYMEMORY.md` loyalty-specific and cumulative.

## References

Use these bundled references instead of re-deriving the same context every time:

- `references/current-module-scope.md`
- `references/backlog-priorities.md`
- `references/readiness-audit-template.md`

Create only the resource directories this skill actually needs. Delete this section if no resources are required.

### scripts/
Executable code (Python/Bash/etc.) that can be run directly to perform specific operations.

**Examples from other skills:**
- PDF skill: `fill_fillable_fields.py`, `extract_form_field_info.py` - utilities for PDF manipulation
- DOCX skill: `document.py`, `utilities.py` - Python modules for document processing

**Appropriate for:** Python scripts, shell scripts, or any executable code that performs automation, data processing, or specific operations.

**Note:** Scripts may be executed without loading into context, but can still be read by Codex for patching or environment adjustments.

### references/
Documentation and reference material intended to be loaded into context to inform Codex's process and thinking.

**Examples from other skills:**
- Product management: `communication.md`, `context_building.md` - detailed workflow guides
- BigQuery: API reference documentation and query examples
- Finance: Schema documentation, company policies

**Appropriate for:** In-depth documentation, API references, database schemas, comprehensive guides, or any detailed information that Codex should reference while working.

### assets/
Files not intended to be loaded into context, but rather used within the output Codex produces.

**Examples from other skills:**
- Brand styling: PowerPoint template files (.pptx), logo files
- Frontend builder: HTML/React boilerplate project directories
- Typography: Font files (.ttf, .woff2)

**Appropriate for:** Templates, boilerplate code, document templates, images, icons, fonts, or any files meant to be copied or used in the final output.

---

**Not every skill requires all three types of resources.**
