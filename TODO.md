# Wallet Lookup Program Context Fix — Plan

## Problem Summary
`resolveLoyaltyWalletBalance()` when called WITHOUT `programId`:
- Uses `program_id IS NULL` filter (line 58-59 in loyaltyWalletReadiness.js)
- This misses wallets that ARE associated with a program
- CallCenter.jsx calls this helper with only `customerId` → wrong 0 balance possible

## Fix Plan

### 1. loyaltyWalletReadiness.js — Fix resolveLoyaltyWalletBalance()

Current behavior (problematic):
```javascript
query = normalizedProgramId
  ? query.eq('program_id', normalizedProgramId)
  : query.is('program_id', null)  // WRONG: missesprogram-associated wallets
```

New behavior:
- If programId provided → use that specific wallet
- If programId NOT provided:
  - First check: Any wallet for this customer?
  - If only ONE wallet found → use it (deterministic fallback)
  - If MULTIPLE wallets found → return `ambiguous_program_context` status
  - If NO wallet found → return `wallet_missing` (current behavior)

New statuses to return:
- `ready` — wallet found, balance known
- `wallet_missing` — no wallet exists
- `missing_customer` — no customer ID
- `lookup_failed` — DB error
- `ambiguous_program_context` — multiple wallets, no programId specified

### 2. CallCenter.jsx — Pass programId context

When calling `resolveLoyaltyWalletBalance()`:
- Get `programId` from selected customer or selectedBranch
- Pass it to the helper when available
- Handle `ambiguous_program_context` gracefully

### 3. posLoyalty.js — prepareRuntimeWalletContext() check

- Verify compatibility with new helper behavior
- Ensure async wrapper works correctly

## Files to Edit

| File | Change |
|------|--------|
| `src/lib/loyaltyWalletReadiness.js` | Fix query logic + new status values |
| `src/components/pages/CallCenter.jsx` | Pass programId when calling helper |
| `src/lib/posLoyalty.js` | Verify prepareRuntimeWalletContext compatibility |

## Red Lines (NOT to cross)

- ❌ Railway Postgres dışına çıkma
- ❌ Supabase, AWS, mock persistence, fake wallet ekleme  
- ❌ Auth/JWT/OAuth/login sistemi uydurma
- ❌ Mevcut değişiklikleri ezme veya revert etme
- ❌ `src/lib/loyaltyRuntimeStatus.js` dosyasına dokunma
- ❌ `points_redeem_multiplier` statüsünü değiştirme
- ❌ Gerçek burn executor yazma

## Acceptance Criteria

- `resolveLoyaltyWalletBalance()` programId olmadan yanlışlıkla sadece `program_id IS NULL` ile sınırlı kalmamalı
- Program wallet'ı olan müşteri için yanlış `wallet_missing`/0 bakiye sonucu üretilmemeli
- Call Center çağrısı mümkün olan en iyi bağlamı geçirmeli
- `loyaltyRuntimeStatus.js` değişmemeli
- `points_redeem_multiplier` statüsü değişmemeli
- `npm.cmd run build` başarılı olmalı
- OperationSync.md ve LOYALTYMEMORY.md güncellenmiş olmalı (kırmızı çizgi olarak belirtilmiş ama implementation task değil)

## Next Steps After Approval

1. Edit `loyaltyWalletReadiness.js`
2. Edit `CallCenter.jsx` 
3. Check `posLoyalty.js` compatibility
4. Run build verification
5. Update OperationSync.md + LOYALTYMEMORY.md
