import { parseJsonValue, safeNumber, clamp } from './branchPurchasing.js'
import { getOrderUnitFactor } from './warehouseDemandPlanning.js'

/**
 * Reçete Bazlı Merkez Mutfak Talep Hesabı Motoru (Pure Function)
 */
export function calculateKitchenDemand({
  kitchenBranchId,
  flow = {},
  stockItems = [],                         // External raw material stock items to be purchased
  semiItems = [],                          // Kitchen produced semi items (with recipe_rows)
  connectedBranches = [],                  // Branches connected to this kitchen
  planningDays = 0,
  kitchenBalances = new Map(),             // Map: stockItemId -> availableQty at kitchen
  inboundKitchenQtyMap = new Map(),        // Map: stockItemId -> inboundQty to kitchen
  multiBranchSemiDemandMap = new Map(),    // Map: `${branchId}:${semiItemId}` -> grossSemiDemand
  multiBranchStockDemandMap = new Map(),   // Map: `${branchId}:${stockItemId}` -> grossStockDemand
  kitchenSettingsMap = new Map(),          // Map: stockItemId -> { min_stock, safety_stock, min_order, max_order, order_unit }
}) {
  const result = []

  // 1. Map of raw material (stock_item_id) -> total raw material requirement from all semi_items recipes
  const rawMaterialDemandFromSemis = new Map()

  for (const branch of connectedBranches) {
    const bId = branch.id
    for (const semi of semiItems) {
      const grossSemiQty = Number(multiBranchSemiDemandMap.get(`${bId}:${semi.id}`) || 0)
      if (grossSemiQty <= 0) continue

      const recipeRows = parseJsonValue(semi.recipe_rows, [])
      const outputQty = safeNumber(semi.recipe_output_unit === 'kg' ? 1 : semi.recipe_output_qty, 1)

      for (const row of recipeRows) {
        if (!row?.stock_item_id) continue
        const ingQty = safeNumber(row.qty, 0)
        const wastePct = safeNumber(row.waste_pct, 0)
        const ingredientNeeded = (grossSemiQty / outputQty) * ingQty * (1 + wastePct / 100)

        const currentTotal = rawMaterialDemandFromSemis.get(row.stock_item_id) || 0
        rawMaterialDemandFromSemis.set(row.stock_item_id, currentTotal + ingredientNeeded)
      }
    }
  }

  // 2. Iterate over raw material stock_items to calculate net purchase orders for the kitchen
  for (const item of stockItems) {
    const itemId = item.id
    const settings = kitchenSettingsMap.get(itemId) || {}
    
    const minStock = settings.min_stock != null ? Number(settings.min_stock) : Number(item.min_stock || 0)
    const safetyStock = settings.safety_stock != null ? Number(settings.safety_stock) : 0
    const orderUnit = settings.order_unit && settings.order_unit !== 'ana' ? settings.order_unit : (item.order_unit || 'ana')
    const minOrder = settings.min_order != null ? Number(settings.min_order) : Number(item.min_order || 0)
    const maxOrder = settings.max_order != null ? Number(settings.max_order) : Number(item.max_order || 0)
    const factor = getOrderUnitFactor(item, orderUnit)

    // Raw material demand from recipe explosions
    const recipeRawDemand = rawMaterialDemandFromSemis.get(itemId) || 0

    // Direct raw material demand from connected branches (if branches order raw materials directly from kitchen)
    let directRawDemand = 0
    for (const branch of connectedBranches) {
      directRawDemand += Number(multiBranchStockDemandMap.get(`${branch.id}:${itemId}`) || 0)
    }

    const totalRawDemand = recipeRawDemand + directRawDemand
    const currentKitchenStock = Number(kitchenBalances.get(itemId) || 0)
    const inboundKitchenQty = Number(inboundKitchenQtyMap.get(itemId) || 0)

    // Net demand calculation: Total Required + Safety Stock - Current Stock - Inbound
    const netNeeded = Math.max(0, totalRawDemand + safetyStock + minStock - currentKitchenStock - inboundKitchenQty)

    let finalOrderQty = netNeeded
    if (finalOrderQty > 0) {
      if (minOrder > 0 && finalOrderQty < minOrder) finalOrderQty = minOrder
      if (maxOrder > 0 && finalOrderQty > maxOrder) finalOrderQty = maxOrder
    }

    result.push({
      stock_item_id: itemId,
      item,
      recipe_raw_demand: recipeRawDemand,
      direct_raw_demand: directRawDemand,
      total_raw_demand: totalRawDemand,
      kitchen_stock: currentKitchenStock,
      inbound_qty: inboundKitchenQty,
      safety_stock: safetyStock,
      net_needed: netNeeded,
      order_unit: orderUnit,
      unit_factor: factor,
      suggested_order_qty: finalOrderQty
    })
  }

  return result
}
