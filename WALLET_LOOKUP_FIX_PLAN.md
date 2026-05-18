# Wallet Lookup Program Context Fix - Implementation Plan

## Task Overview
**Phase 5.1** - Fix async wallet readiness helper to properly handle cases where programId is missing.

### Current Problem
- `resolveLoyaltyWalletBalance()` when `programId` is not provided, queries only with `program_id IS NULL`
- This misses many real program-linked wallets, showing 0 balance even when valid balance exists
- `CallCenter.jsx` calls helper with only `customerId`, causing false zero balances

### Files to Modify
1. `src/lib/loyaltyWalletReadiness.js` - Core fix
2. `src/components/pages/CallCenter.jsx` - Pass program context
3. `src/lib/posLoyalty.js` - Verify integration
4. `OperationSync.md` - Update with changes
5. `LOYALTYMEMORY.md` - Document changes

## Implementation Steps

### Step 1: Fix resolveLoyaltyWalletBalance
**Current behavior (problematic):**
```javascript
query = normalizedProgramId
  ? query.eq('program_id', normalizedProgramId)
  : query.is('program_id', null)
```

**New behavior:**
- If programId is provided → query with that program_id
- If programId is NOT provided:
  1. First try: program_id IS NULL (for backward compatibility)
  2. If NO result, try: fetch ALL wallets for this customer
  3. 
- If multiple wallets found → return `ambiguous_program_context`
- If any wallet found → use it
- If NO wallet found anywhere → return `wallet_missing`

### Step 2: Update Status Returns
Add new status: `ambiguous_program_context`

### Step 3: Update Call Center
Pass `loyaltyProgramId` from customer context when available.

### Step 4: Verify prepareRuntimeWalletContext
Ensure proper integration with updated helper.

### Step 5: Build Test
Run `npm.cmd run build` to verify no breaking changes.

### Step 6: Documentation
- Update OperationSync.md with changes
- Update LOYALTYMEMORY.md for this fix
- Document acceptance criteria

## Acceptance Criteria
- [ ] Helper no longer returns false 0 balances for program-linked wallets
- [ ] When programId is missing and multiple wallets exist, status is `ambiguous_program_context`
- [ ] CallCenter passes best available program context
- [ ] Build passes without errors
- [ ] Documentation updated
