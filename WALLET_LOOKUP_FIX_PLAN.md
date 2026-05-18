# Wallet Lookup Program Context Fix - Plan

## Proj

## Problem Summary

`resolveLoyaltyWalletBalance()` currently narrows the query to `program_id IS NULL` when programId is not provided. This causes program-linked loyalty wallets to be missed, resulting in false 0 balances.

### Affected Files:
- `src/lib/loyaltyWalletReadiness.js` - Main helper with the bug
- `src/components/pages/CallCenter.jsx` - Caller that doesn't pass programId
- `src/lib/posLoyalty.js` - prepareRuntimeWalletContext() uses the helper

## Current Behavior Problem

```javascript
// Current (BUGGY):
query = normalizedProgramId
  ? query.eq('program_id', normalizedProgramId)
  : query.is('program_id', null)  // Only finds NULL program wallets!
```

When programId is not passed:
- Query searches only `program_id IS NULL` wallets
- Program-linked wallets (which are common) are completely missed
- This can show 0 balance even when customer has points

## Fix Requirements

### 1. Fix resolveLoyaltyWalletBalance() Behavior

**When programId IS provided:**
- Query that specific program wallet

**When programId is NOT provided:**
- Add fallback rules:
  - **Single wallet exists** → use that wallet
  - **Multiple wallets exist** → deterministic selection OR return `ambiguous_program_context`
  - **No wallet** → return `wallet_missing`

### 2. Add Explicit Statuses

Add these statuses to the response:
- `ready` - Wallet found and balance known
- `wallet_missing` - No wallet record found  
- `missing_customer` - Customer context not provided
- `lookup_failed` - DB error
- `ambiguous_program_context` - Multiple wallets, no programId specified

### 3. Update CallCenter.jsx

Pass appropriate programId context when available:
- Check if selectedCustomer has programId/loyaltyProgramId
- Pass it to resolveLoyaltyWalletBalance()

### 4. Verify prepareRuntimeWalletContext() Compatibility

Ensure the new helper behavior works with:
- `prepareRuntimeWalletContext()` in posLoyalty.js
- Any other callers

### 5. Verification Items

- [ ] `src/lib/loyaltyRuntimeStatus.js` MUST NOT be modified
- [ ] `points_redeem_multiplier` status MUST remain unchanged
- [ ] `npm.cmd run build` must pass
- [ ] OperationSync.md updated
- [ ] LOYALTYMEMORY.md updated

## Execution Steps

### Step 1: Fix loyaltyWalletReadiness.js
- Modify resolveLoyaltyWalletBalance() query logic
- Add fallback: when no programId, fetch ALL wallets for customer
- Add deterministic selection logic
- Add new status values

### Step 2: Update CallCenter.jsx  
- Add programId context extraction from customer
- Pass programId to helper call

### Step 3: Verify Other Callers
- Check posLoyalty.js prepareRuntimeWalletContext()
- Verify no breaking changes

### Step 4: Build and Test
- Run `npm.cmd run build`
- Verify no errors

### Step 5: Documentation
- Update OperationSync.md with entry
- Update LOYALTYMEMORY.md with entry

## Red Lines (MUST NOT DO)

- [ ] Do NOT exit Railway Postgres database
- [ ] Do NOT add Supabase, AWS, mock persistence, fake wallet
- [ ] Do NOT add Auth/JWT/OAuth/login system
- [ ] Do NOT overwrite user's existing changes
- [ ] Do NOT modify `src/lib/loyaltyRuntimeStatus.js`
- [ ] Do NOT change `points_redeem_multiplier` status

## Deliverables

- Fixed `resolveLoyaltyWalletBalance()` with safe fallback
- Updated CallCenter.jsx with program context
- Passi

## Execution Steps

### Step 1: Fix loyaltyWalletReadiness.js
- Modify resolveLoyaltyWalletBalance() query logic
- Add fallback: when no programId, fetch ALL wallets for customer
- Add deterministic selection logic
- Add new status values

### Step 2: Update CallCenter.jsx  
- Add programId context extraction from customer
- Pass programId to helper call

### Step 3: Verify Other Callers
- Check posLoyalty.js prepareRuntimeWalletContext()
- Verify no breaking changes

### Step 4: Build and Test
- Run `npm.cmd run build`
- Verify no errors

### Step 5: Documentation
- Update OperationSync.md with entry
- Update LOYALTYMEMORY.md with entry

## Red Lines (MUST NOT DO)

- [ ] Do NOT exit Railway Postgres database
- [ ] Do NOT add Supabase, AWS, mock persistence, fake wallet
- [ ] Do NOT add Auth/JWT/OAuth/login system
- [ ] Do NOT overwrite user's existing changes
- [ ] Do NOT modify `src/lib/loyaltyRuntimeStatus.js`
- [ ] Do NOT change `points_redeem_multiplier` status

## Deliverables

- Fixed `resolveLoyaltyWalletBalance()` with safe fallback
- Updated CallCenter.jsx with program context
- Passing build
- Updated documentation

## Status: WAITING FOR USER APPROVAL
