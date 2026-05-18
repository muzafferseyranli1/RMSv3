# SuitableRMS Loyalty Current Module Scope

Use this reference as the default current-state map before proposing loyalty changes.

## Core Files

- `src/lib/loyalty.js`
  Canonical loyalty data model, normalization, save/load helpers, campaign/rule persistence, coupon series, tiers, customer category helpers.
- `src/components/pages/LoyaltyManagement.jsx`
  Main backoffice loyalty management surface. Contains campaign editor behavior, rule editing UX, tier and coupon management, and workspace save flow.
- `src/components/loyalty/LoyaltyCampaignWizard.jsx`
  Wizard-style create flow that aims to mirror the loyalty campaign model.
- `src/components/pages/LoyaltyCampaignWizardPreview.jsx`
  Re-export entry for the wizard surface.
- `src/App.jsx`
  Route truth for list, create, detail, and wizard routes.

## Known Current Product Shape

- The product already supports:
  - campaign rules,
  - applicable and periodic rule scopes,
  - tiers,
  - customer categories,
  - coupon series,
  - many condition and action types,
  - channel-aware targeting,
  - campaign merge modes.
- The product is strongest in:
  - campaign modeling,
  - backoffice configuration,
  - loyalty persistence structure.
- The product is weaker in:
  - lifecycle automation,
  - ready-made marketing playbooks,
  - cross-surface execution confidence,
  - subscription and gamification,
  - fraud control depth,
  - frictionless identity and card-linking.

## Route Reality To Check

Always verify route wiring before promising a UX flow.

At the time this skill was created:

- `/sadakat` -> `LoyaltyManagement`
- `/sadakat/kampanya/yeni` -> verify whether it points to `LoyaltyManagement` or the wizard
- `/sadakat/kampanya/:campaignId` -> `LoyaltyManagement`
- `/sadakat/kampanya-sihirbazi-onizleme` -> wizard entry

Do not trust historical notes more than live route code.

## Surface Areas That Commonly Drift

- Wizard vs main editor parity
- Rule editor UI vs actual runtime support
- Audience/channel/application mode UI vs real normalized model
- Loyalty backoffice save support vs POS/kiosk/garson/mobile execution support
- Coupon lifecycle modeling vs true redemption behavior

## Loyalty-Specific Documents

- `OperationSync.md`
  Broader operational memory across agents.
- `LOYALTYMEMORY.md`
  Loyalty-focused cumulative memory created for this skill.
