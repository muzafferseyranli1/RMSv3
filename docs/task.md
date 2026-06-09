# Task List: WMS Faz 8 Demand Method Cila

- `[x]` Add real `demand_method` generation to the WMS warehouse demand engine.
- `[x]` Support `recipe_forecast`, `usage_average`, `stock_topup`, `repeat_last_order`, and `manual`.
- `[x]` Persist demand method inside purchase order line meta (`meta.forecast.demand_method`).
- `[x]` Show demand method in the purchase order detail UI.
- `[x]` Make warehouse repeat-last-order mode use warehouse purchase history instead of branch order history.
- `[x]` Prevent warehouse purchase flows from creating internal supplier replenishment orders.
- `[x]` Split inbound warehouse purchase quantities and outbound branch replenishment quantities in the WMS calculation.
- `[x]` Remove touched runtime first-branch/Kadikoy fallback paths from warehouse purchase flow.
- `[x]` Remove hardcoded DATABASE_URL fallback from new Faz 8 scratch scripts.
- `[x]` Run branch purchasing regression test to confirm existing branch algorithm remains intact.
- `[x]` Run syntax checks, WMS engine smoke test, static fallback scan, and production build.

## Not Run

- `[ ]` Live WMS DB integration test was not run because `DATABASE_URL` was intentionally not present in the environment.
