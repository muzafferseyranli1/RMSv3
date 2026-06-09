import { parseJsonValue, safeNumber, clamp } from './branchPurchasing.js';

const DEMAND_METHOD_PRIORITY = [
  'recipe_forecast',
  'usage_average',
  'stock_topup',
  'repeat_last_order',
  'manual',
];

function normalizeForecastRatio(value) {
  const raw = safeNumber(value, 1.1);
  const normalized = raw > 10 ? raw / 100 : raw;
  return clamp(normalized || 1.1, 0.35, 3);
}

function pickDominantDemandMethod(methodTotals, fallback) {
  let bestMethod = fallback;
  let bestQty = -1;

  for (const method of DEMAND_METHOD_PRIORITY) {
    const qty = Number(methodTotals.get(method) || 0);
    if (qty > bestQty) {
      bestMethod = method;
      bestQty = qty;
    }
  }

  return bestMethod || fallback || 'manual';
}

function getDemandSourceLabel(qtyMode, demandMethod) {
  if (qtyMode === 'stok') return 'Stok seviyesi tamamlama';
  if (qtyMode === 'son') return 'Son depo satinalma siparisi';
  if (qtyMode === 'manuel') return 'Manuel miktar girisi';
  if (demandMethod === 'recipe_forecast') return 'Bagli subeler recete tahmini';
  return 'Bagli subeler kullanim ortalamasi';
}

/**
 * Stok kartÄ± paketleme birimi Ã§arpanÄ±nÄ± hesaplar.
 */
export function getOrderUnitFactor(item, orderUnit) {
  if (!item || !orderUnit || orderUnit === 'ana') return 1;
  const units = parseJsonValue(item.packaging_units, []);
  const row = units.find(unit => unit?.unit === orderUnit);
  const factor = Number(row?.qty || 0);
  return factor > 0 ? factor : 1;
}

/**
 * WMS talep tahmini ve satÄ±nalma planlama motoru.
 * pure function (veritabanÄ± eriÅŸimi yoktur, test edilmesi kolaydÄ±r).
 */
export function calculateWarehouseDemand({
  warehouseBranchId,
  flow = {},
  stockItems = [],
  connectedBranches = [],
  planningDays = 0,
  multiBranchBalances = new Map(),        // Map: `${branchId}:${stockItemId}` -> availableQty
  warehouseBalances = new Map(),          // Map: stockItemId -> availableQty
  inboundWarehouseQtyMap = new Map(),     // Map: stockItemId -> inboundQty (external purchase orders to warehouse)
  outboundReplenishingQtyMap = new Map(),  // Map: `${branchId}:${stockItemId}` -> inTransitQty (warehouse to branch)
  multiBranchDailyUsageMap = new Map(),   // Map: `${branchId}:${stockItemId}` -> dailyUsage
  multiBranchRecipeForecastMap = new Map(), // Map: `${branchId}:${stockItemId}` -> recipeUsage (sum of forecast lookahead period)
  lastOrderQtyMap = new Map(),            // Map: `${branchId}:${stockItemId}` -> lastOrderQty
  warehouseLastOrderQtyMap = new Map(), // Map: stockItemId -> last warehouse purchase qty
  warehouseSettingsMap = new Map(),       // Map: stockItemId -> { min_stock, safety_stock, min_order, max_order, order_unit }
}) {
  const result = [];

  for (const item of stockItems) {
    const itemId = item.id;
    
    // 1. Depo Parametrelerinin Ã‡Ã¶zÃ¼mlenmesi (Ã–ncelik depo ayarlarÄ±, fallback global stok kartÄ±)
    const whSettings = warehouseSettingsMap.get(itemId) || {};
    const minStock = whSettings.min_stock != null ? Number(whSettings.min_stock) : Number(item.min_stock || 0);
    const safetyStock = whSettings.safety_stock != null ? Number(whSettings.safety_stock) : 0;
    const orderUnit = whSettings.order_unit && whSettings.order_unit !== 'ana' ? whSettings.order_unit : (item.order_unit || 'ana');
    const minOrder = whSettings.min_order != null ? Number(whSettings.min_order) : Number(item.min_order || 0);
    const maxOrder = whSettings.max_order != null ? Number(whSettings.max_order) : Number(item.max_order || 0);
    const factor = getOrderUnitFactor(item, orderUnit);

    const safetyQty = safetyStock;

    // 2. Åube BazlÄ± BrÃ¼t Talep ve Kapsama HesaplamasÄ±
    const qtyMode = flow.qty_mode || 'tahmin';
    const methodTotals = new Map();
    let demandMethod = qtyMode === 'stok'
      ? 'stock_topup'
      : qtyMode === 'son'
        ? 'repeat_last_order'
        : qtyMode === 'manuel'
          ? 'manual'
          : 'usage_average';

    let totalGrossDemand = 0;
    let totalNetBranchDemand = 0;
    const branchDetails = [];

    for (const branch of (qtyMode === 'tahmin' ? connectedBranches : [])) {
      const branchId = branch.id;
      const key = `${branchId}:${itemId}`;

      // Åube stok durumlarÄ±
      const branchAvail = Number(multiBranchBalances.get(key) || 0);
      const outboundYolda = Number(outboundReplenishingQtyMap.get(key) || 0);
      const branchCoverage = branchAvail + outboundYolda;

      // Åube brÃ¼t talebi
      let gross = 0;
      let source = 'manual';

      const recipeUsage = Number(multiBranchRecipeForecastMap.get(key) || 0);
      const isRecipeLinked = !!item.recipe_linked;

      if (isRecipeLinked && recipeUsage > 0.0001) {
        gross = recipeUsage;
        source = 'recipe_forecast';
      } else {
        const dailyUsage = Number(multiBranchDailyUsageMap.get(key) || 0);
        gross = dailyUsage * planningDays * normalizeForecastRatio(flow.forecast_ratio);
        source = 'usage_average';
      }

      // Net ÅŸube ihtiyacÄ± (kapsama dÃ¼ÅŸtÃ¼kten sonra)
      const netBranch = Math.max(gross - branchCoverage, 0);

      totalGrossDemand += gross;
      totalNetBranchDemand += netBranch;
      methodTotals.set(source, (methodTotals.get(source) || 0) + gross);

      branchDetails.push({
        branchId,
        branchName: branch.name,
        gross: Number(gross.toFixed(4)),
        available: branchAvail,
        outboundYolda,
        coverage: branchCoverage,
        netBranch: Number(netBranch.toFixed(4)),
        source,
        demand_method: source,
      });
    }

    if (qtyMode === 'tahmin') {
      demandMethod = pickDominantDemandMethod(methodTotals, demandMethod);
    }

    // 3. Depo Envanter Pozisyonu
    const warehouseAvail = Number(warehouseBalances.get(itemId) || 0);
    const inboundYolda = Number(inboundWarehouseQtyMap.get(itemId) || 0);
    const expectedReturn = 0; // iadeler (varsayÄ±lan 0)
    const reserved = 0; // rezerve stok (varsayÄ±lan 0)
    const warehousePosition = warehouseAvail + inboundYolda + expectedReturn - reserved;

    // 4. SipariÅŸ Ã–nerisi FormÃ¼lÃ¼
    let suggestedQty = 0;
    let qtyModeExplanation = '';

    if (qtyMode === 'stok') {
      // Faz 8.2: Stok Seviyesini Tamamla Modu
      const maxStock = Number(item.max_stock || 0);
      const target = maxStock > 0 ? maxStock : (minStock + safetyStock);
      suggestedQty = Math.max(target - warehouseAvail - inboundYolda, 0);
      qtyModeExplanation = `Stok Tamamlama (Hedef: ${target}, Depo Mevcut: ${warehouseAvail}, Yolda: ${inboundYolda})`;
    } else if (qtyMode === 'son') {
      const repeatedQty = Math.max(Number(warehouseLastOrderQtyMap.get(itemId) || 0), 0);
      totalGrossDemand = repeatedQty;
      totalNetBranchDemand = repeatedQty;
      suggestedQty = repeatedQty;
      qtyModeExplanation = `Son depo satinalma miktari tekrarlandi (${repeatedQty})`;
    } else if (qtyMode === 'manuel') {
      suggestedQty = 0;
      qtyModeExplanation = 'Manuel miktar girisi bekleniyor';
    } else {
      // Tahmin, Son SipariÅŸ ve Manuel modlarÄ±
      // Oneri = brut_talep_net + guvenlik_stogu - depo_envanter_pozisyonu
      suggestedQty = totalNetBranchDemand + safetyQty - warehousePosition;
      suggestedQty = Math.max(0, suggestedQty);
      qtyModeExplanation = `Net Talep: ${totalNetBranchDemand.toFixed(2)}, GÃ¼venlik: ${safetyQty}, Depo Pozisyon: ${warehousePosition.toFixed(2)}`;
    }

    // 5. Yuvarlama KÄ±sÄ±tlarÄ± (Koli iÃ§i / min-max)
    let roundedSuggestedQty = suggestedQty;
    let roundingReason = 'Yuvarlama uygulanmadÄ±';

    if (suggestedQty > 0) {
      if (flow.round_box_qty && factor > 1) {
        const threshold = Number(flow.round_box_threshold || 0.25);
        const packageCount = suggestedQty / factor;
        const whole = Math.floor(packageCount);
        const fraction = packageCount - whole;
        const nextPackages = whole + (fraction >= threshold ? 1 : 0);
        roundedSuggestedQty = Math.max(nextPackages, 1) * factor;
        roundingReason = `Koli iÃ§eriÄŸine yuvarlandÄ± (Ã‡arpan: ${factor}, EÅŸik: %${threshold * 100})`;
      }

      if (flow.round_min_qty && minOrder > 0) {
        const minBaseQty = minOrder * factor;
        if (factor > 1) {
          const minimumPackages = Math.ceil(minOrder);
          const currentPackages = Math.ceil(roundedSuggestedQty / factor);
          roundedSuggestedQty = Math.max(currentPackages, minimumPackages) * factor;
        } else {
          roundedSuggestedQty = Math.max(roundedSuggestedQty, minOrder);
        }
        roundingReason += ` + Minimum sipariÅŸ miktarÄ± uygulandÄ± (${minOrder} koli/birim)`;
      }

      if (maxOrder > 0) {
        const maxBaseQty = maxOrder * factor;
        if (roundedSuggestedQty > maxBaseQty) {
          roundedSuggestedQty = maxBaseQty;
          roundingReason += ` + Maksimum sipariÅŸ seviyesiyle sÄ±nÄ±rlandÄ± (${maxOrder} koli/birim)`;
        }
      }

      if (factor <= 1) {
        roundedSuggestedQty = Math.ceil(roundedSuggestedQty);
      }
      roundedSuggestedQty = Number(roundedSuggestedQty.toFixed(4));
    }

    result.push({
      stock_item_id: itemId,
      item_name: item.name,
      item_sku: item.sku || '',
      unit: item.unit || '',
      order_unit: orderUnit,
      min_stock: minStock,
      safety_stock: safetyStock,
      current_stock: warehousePosition, // Depo envanter pozisyonu
      calculated_need: totalNetBranchDemand, // Toplam net ÅŸube talebi
      demand_method: demandMethod,
      suggested_qty: roundedSuggestedQty,
      ordered_qty: roundedSuggestedQty,
      price_source: 'stock_card', // VarsayÄ±lan stok kartÄ± fiyatÄ±
      unit_price: Number(item.purchase_price || 0),
      line_total: 0, // DÄ±ÅŸarÄ±da birim fiyat ile Ã§arpÄ±lacak
      meta: {
        warehouse_settings: {
          min_stock: minStock,
          safety_stock: safetyStock,
          order_unit: orderUnit,
          min_order: minOrder,
          max_order: maxOrder,
        },
        forecast: {
          applied: qtyMode === 'tahmin',
          ratio: normalizeForecastRatio(flow.forecast_ratio),
          demand_method: demandMethod,
          source_label: getDemandSourceLabel(qtyMode, demandMethod),
          warehouse_avail: warehouseAvail,
          inbound_yolda: inboundYolda,
          total_gross_demand: totalGrossDemand,
          total_net_branch_demand: totalNetBranchDemand,
          qty_mode_explanation: qtyModeExplanation,
          rounding_reason: roundingReason,
          branch_details: branchDetails,
        }
      }
    });
  }

  return result;
}
