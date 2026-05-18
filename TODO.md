# SuitableRMS v3 - TODO

## Active Tasks

### Faz 5.1 — Wallet Lookup Program Context Fix

**Status:** IN PROGRESS  
**Priority:** HIGH

#### Files to Modify:
- [ ] `src/lib/loyaltyWalletReadiness.js` — resolveLoyaltyWalletBalance fallback logic fix
- [ ] `src/components/pages/CallCenter.jsx` — pass programId when available
- [ ] `src/lib/posLoyalty.js` — verify prepareRuntimeWalletContext compatibility

#### Tasks:
1. [IN PROGRESS] Fix resolveLoyaltyWalletBalance() behavior:
   - programId provided → use that program wallet
   - programId NOT provided:
     - Single wallet found → use it
     - Multiple wallets found → return ambiguous_program_context
     - No wallet found → return wallet_missing (0 balance)
2. [ ] Add explicit status outcomes in response:
   - ready
   - wallet_missing  
   - missing_customer
   - lookup_failed
   - ambiguous_program_context (NEW)
3. [ ] Update CallCenter.jsx to pass programId from customer context when available
4. [ ] Run npm.cmd build to verify no regressions

#### Verification:
- [ ] Build passes without errors
- [ ] Program-connected wallets are NOT shown as 0 balance when programId missing
- [ ] CallCenter passes best available program context

#### Kırmızı Çizgiler (RESPEECTED):
- [NO] Railway Postgres dışına çıkma
- [NO] Supabase/AWS ekleme  
- [NO] Mock persistence ekleme
- [NO] Auth/JWT/OAuth ekleme
- [NO] Mevcut değişiklikleri ezme
- [NO] src/lib/loyaltyRuntimeStatus.js dosyasına dokunma
- [NO] points_redeem_multiplier statüsünü değiştirme

---

### Completed (Recent)

- [x] Loyalty wallet readiness Phase 5 readiness (Entry 021)
- [x] Loyalty burn-safe guard (Entry 019)  
- [x] Loyalty executive gap closure (Entry 016, 017)

---

### Next After This

- [ ] Faz 6: Async wallet evaluation channel migration
- [ ] Burn executor implementation (points_redeem_multiplier completion)

---

Generated: 2026-05-20  
Last Updated: 2026-05-20
