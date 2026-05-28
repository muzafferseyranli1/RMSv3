import {
  DEMO_WEEKDAY_FIELDS,
  normalizeDemoSalesSettings,
  normalizeDayWeights,
} from './demoSalesSettings.js'

export function roundMoney(value) {
  return Math.round((parseFloat(value) || 0) * 100) / 100
}

function parseJ(value, fallback) {
  if (value == null) return fallback
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return fallback
    }
  }
  return value
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function localDateFromIso(isoDay) {
  const [year, month, day] = String(isoDay || '').split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0)
}

function formatIsoDay(input) {
  const date = input instanceof Date ? input : new Date(input)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(isoDay, days) {
  const date = localDateFromIso(isoDay)
  date.setDate(date.getDate() + days)
  return formatIsoDay(date)
}

function listIsoDays(startIsoDay, endIsoDay) {
  const result = []
  let cursor = startIsoDay
  while (cursor <= endIsoDay) {
    result.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return result
}

function hashString(value) {
  let hash = 2166136261
  const text = String(value || '')
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function createRandom(seedText) {
  let seed = hashString(seedText) || 1
  return function nextRandom() {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomBetween(random, min, max) {
  if (max <= min) return min
  return min + (max - min) * random()
}

function randomIntBetween(random, min, max) {
  const safeMin = Math.round(min)
  const safeMax = Math.round(max)
  if (safeMax <= safeMin) return safeMin
  return safeMin + Math.floor(random() * (safeMax - safeMin + 1))
}

function pickOne(random, list) {
  if (!Array.isArray(list) || list.length === 0) return null
  return list[Math.floor(random() * list.length)] || list[0]
}

function pickWeighted(random, list, getWeight = item => item?.weight ?? 1) {
  const safeList = (list || []).filter(Boolean)
  if (!safeList.length) return null

  const weighted = safeList.map(item => ({
    item,
    weight: Math.max(0, Number(getWeight(item)) || 0),
  }))
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0)

  if (total <= 0) return pickOne(random, safeList)

  let threshold = random() * total
  for (const entry of weighted) {
    threshold -= entry.weight
    if (threshold <= 0) return entry.item
  }

  return weighted[weighted.length - 1]?.item || safeList[0]
}

function shuffle(random, list) {
  const next = [...list]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

function makeUuid() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const random = Math.floor(Math.random() * 16)
    const value = char === 'x' ? random : ((random & 0x3) | 0x8)
    return value.toString(16)
  })
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function asUuidOrNull(value) {
  const text = String(value || '').trim()
  if (!text) return null
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null
}

function getBranchPresenceKey(branchId, branchName) {
  const uuid = asUuidOrNull(branchId)
  if (uuid) return `id:${uuid}`
  const nameKey = normalizeText(branchName)
  return nameKey ? `name:${nameKey}` : null
}

export function collectBranchContexts(tree) {
  const result = []

  function walk(nodes, ctx = {}) {
    for (const node of nodes || []) {
      const nextCtx = { ...ctx }
      if (node.type === 'sirket') {
        nextCtx.company = { id: node.id, name: node.name }
      } else if (node.type === 'tuzel') {
        nextCtx.legalEntity = { id: node.id, name: node.name }
      } else if (node.type === 'org') {
        nextCtx.orgUnit = { id: node.id, name: node.name }
      } else if (node.type === 'sube') {
        result.push({
          branchId: node.id,
          branchName: node.name,
          companyId: nextCtx.company?.id || null,
          companyName: nextCtx.company?.name || null,
          legalEntityId: nextCtx.legalEntity?.id || null,
          legalEntityName: nextCtx.legalEntity?.name || null,
          orgUnitId: nextCtx.orgUnit?.id || null,
          orgUnitName: nextCtx.orgUnit?.name || null,
        })
      }
      walk(node.children || [], nextCtx)
    }
  }

  walk(tree, {})
  return result
}

export function calcRecipeUnitCost(item, channelId, portionId) {
  const rows = parseJ(item?.recipe_rows, [])
  if (!rows.length) return 0

  const totalCost = rows.reduce((sum, row) => {
    const rowChannels = Array.isArray(row?.channels) ? row.channels : []
    const rowPortions = Array.isArray(row?.portions) ? row.portions : []
    const inChannel = rowChannels.length === 0 || rowChannels.includes(channelId)
    const inPortion = !portionId || rowPortions.length === 0 || rowPortions.includes(portionId)
    if (!inChannel || !inPortion) return sum

    const qty = parseFloat(row?.qty) || 0
    const wastePct = parseFloat(row?.waste_pct) || 0
    const unitCost = parseFloat(row?.cost) || 0
    const usedQty = qty * (1 + wastePct / 100)
    return sum + unitCost * usedQty
  }, 0)

  const outputQty = parseFloat(item?.recipe_output_qty) || 1
  if (outputQty <= 0) return 0
  return totalCost / outputQty
}

function getProductCategoryId(item) {
  return item?.sale_cat_l5 || item?.sale_cat_l4 || item?.sale_cat_l3 || item?.sale_cat_l2 || item?.sale_cat_l1 || null
}

function getTopCategory(categoryById, categoryId) {
  let node = categoryById.get(categoryId || null) || null
  while (node?.parent_id) {
    const parent = categoryById.get(node.parent_id)
    if (!parent) break
    node = parent
  }
  return node
}

function getChannelPrice(product, channelId) {
  return parseJ(product?.channel_prices, []).find(item => item?.channel_id === channelId && item?.active)
}

function classifyCategoryType(...values) {
  const text = normalizeText(values.filter(Boolean).join(' '))
  if (!text) return 'misc'

  if (
    text.includes('icecek') ||
    text.includes('mesrubat') ||
    text.includes('cola') ||
    text.includes('fanta') ||
    text.includes('kahve') ||
    text.includes('coffee') ||
    text.includes('su ') ||
    text.endsWith(' su') ||
    text.includes('ayran')
  ) {
    return 'drink'
  }

  if (
    text.includes('yan urun') ||
    text.includes('patates') ||
    text.includes('sogan halkasi') ||
    text.includes('fries') ||
    text.includes('nugget')
  ) {
    return 'side'
  }

  if (
    text.includes('hamburger') ||
    text.includes('burger') ||
    text.includes('sandvic') ||
    text.includes('wrap') ||
    text.includes('taco') ||
    text.includes('pizza')
  ) {
    return 'main'
  }

  return 'misc'
}

function getCategoryTypeWeight(categoryType) {
  if (categoryType === 'main') return 4.8
  if (categoryType === 'drink') return 2.35
  if (categoryType === 'side') return 1.95
  return 1.2
}

function getProductBaseWeight(productCtx) {
  const text = normalizeText(`${productCtx?.product?.name || ''} ${productCtx?.topCategoryName || ''} ${productCtx?.categoryName || ''}`)
  let weight = 1

  if (productCtx?.categoryType === 'main') weight *= 1.15
  if (text.includes('klasik') || text.includes('classic')) weight *= 1.2
  if (text.includes('double')) weight *= 0.92
  if (text.includes('smoky') || text.includes('bbq')) weight *= 0.9
  if (text.includes('pastirma') || text.includes('acili')) weight *= 0.88
  if (text.includes('turk kahvesi')) weight *= 0.62
  if (text.includes('su ')) weight *= 0.86

  return weight
}

function resolveInventoryItem(itemId, stockById, semiById) {
  if (stockById?.has(itemId)) {
    const item = stockById.get(itemId)
    return {
      itemType: 'stock_item',
      stockItemId: item.id,
      semiItemId: null,
      itemName: item.name,
      itemSku: item.sku || null,
      unit: item.unit || null,
    }
  }
  if (semiById?.has(itemId)) {
    const item = semiById.get(itemId)
    return {
      itemType: 'semi_item',
      stockItemId: null,
      semiItemId: item.id,
      itemName: item.name,
      itemSku: item.sku || null,
      unit: item.recipe_output_unit || item.unit || null,
    }
  }
  return null
}

function buildInventoryMovementCandidates(normalizedLines, saleId, saleDate, branch, channel, stockById, semiById) {
  return normalizedLines.flatMap((line, index) => {
    const recipeRows = parseJ(line?.productCtx?.product?.recipe_rows, [])
    const outputQty = parseFloat(line?.productCtx?.product?.recipe_output_qty) || 1
    if (outputQty <= 0) return []

    return recipeRows.flatMap(recipeRow => {
      const channelIds = Array.isArray(recipeRow?.channels) ? recipeRow.channels.filter(Boolean) : []
      const portionIds = Array.isArray(recipeRow?.portions) ? recipeRow.portions.filter(Boolean) : []
      const inChannel = channelIds.length === 0 || channelIds.includes(channel.id)
      const inPortion = !line?.portion?.id || portionIds.length === 0 || portionIds.includes(line.portion.id)
      if (!inChannel || !inPortion) return []

      const inventoryItem = resolveInventoryItem(recipeRow?.stock_item_id, stockById, semiById)
      if (!inventoryItem) return []

      const baseQty = parseFloat(recipeRow?.qty) || 0
      const wastePct = parseFloat(recipeRow?.waste_pct) || 0
      const usedQtyPerUnit = baseQty * (1 + wastePct / 100)
      const movementQty = (usedQtyPerUnit / outputQty) * (parseFloat(line.qty) || 0)
      if (movementQty <= 0) return []

      return [{
        saleId,
        saleLineId: line.id,
        saleItemId: line.productCtx?.product?.id || null,
        branchId: asUuidOrNull(branch.branchId),
        branchName: branch.branchName,
        companyId: asUuidOrNull(branch.companyId),
        companyName: branch.companyName || null,
        legalEntityId: asUuidOrNull(branch.legalEntityId),
        legalEntityName: branch.legalEntityName || null,
        orgUnitId: asUuidOrNull(branch.orgUnitId),
        orgUnitName: branch.orgUnitName || null,
        salesChannelId: asUuidOrNull(channel.id),
        salesChannelName: channel.name,
        portionId: line.portion?.id || null,
        portionName: line.portion?.name || null,
        movementAt: saleDate,
        lineNo: index + 1,
        quantity: movementQty,
        unitCost: parseFloat(recipeRow?.cost) || 0,
        note: null,
        recipeRowId: recipeRow?.id || null,
        meta: {
          source: 'demo-sales-tool',
          waste_pct: wastePct,
          recipe_output_qty: outputQty,
          sale_qty: parseFloat(line.qty) || 0,
        },
        ...inventoryItem,
      }]
    })
  })
}

function getBranchContextForSale(sale, branchesById, branchesByName) {
  const saleBranchId = String(sale?.branch_id || '').trim()
  if (saleBranchId && branchesById.has(saleBranchId)) return branchesById.get(saleBranchId)

  const saleBranchNameKey = normalizeText(sale?.branch_name)
  if (saleBranchNameKey && branchesByName.has(saleBranchNameKey)) return branchesByName.get(saleBranchNameKey)

  return {
    branchId: sale?.branch_id || sale?.branch_name || 'demo-branch',
    branchName: sale?.branch_name || 'Demo Sube',
    companyId: null,
    companyName: null,
    legalEntityId: null,
    legalEntityName: null,
    orgUnitId: null,
    orgUnitName: null,
  }
}

export function buildMovementCandidatesForSales({ sales, saleLines, generator, branches }) {
  const branchList = Array.isArray(branches) ? branches : []
  const branchesById = new Map(branchList.map(branch => [String(branch.branchId || '').trim(), branch]).filter(([key]) => key))
  const branchesByName = new Map(branchList.map(branch => [normalizeText(branch.branchName), branch]).filter(([key]) => key))
  const productCtxById = new Map((generator?.productContexts || []).map(ctx => [ctx?.product?.id, ctx]).filter(([key]) => key))
  const productCtxByName = new Map((generator?.productContexts || []).map(ctx => [normalizeText(ctx?.product?.name), ctx]).filter(([key]) => key))
  const linesBySaleId = new Map()

  ;(saleLines || []).forEach(line => {
    const key = line?.sale_id
    if (!key) return
    if (!linesBySaleId.has(key)) linesBySaleId.set(key, [])
    linesBySaleId.get(key).push(line)
  })

  return (sales || []).flatMap(sale => {
    const branch = getBranchContextForSale(sale, branchesById, branchesByName)
    const channel = {
      id: sale?.sales_channel_id || generator?.channel?.id || null,
      name: sale?.sales_channel_name || generator?.channel?.name || 'Hizli Satis',
    }

    const normalizedLines = (linesBySaleId.get(sale.id) || []).flatMap(line => {
      const productCtx = productCtxById.get(line?.product_id) || productCtxByName.get(normalizeText(line?.product_name))
      if (!productCtx) return []

      const portionId = line?.portion_id || null
      const portion = portionId
        ? (productCtx.portions || []).find(item => item?.id === portionId) || { id: portionId, name: line?.portion_name || null }
        : null

      return [{
        id: line.id,
        qty: parseFloat(line?.qty) || 0,
        portion,
        productCtx,
      }]
    })

    return buildInventoryMovementCandidates(
      normalizedLines,
      sale.id,
      sale.sale_datetime,
      branch,
      channel,
      generator?.stockById,
      generator?.semiById
    )
  })
}

function buildProductContexts(products, channel, categoryById, taxById) {
  return products
    .filter(product => !product?.deleted_at && product?.sale_status !== false && product?.setting_active !== false)
    .map(product => {
      const channelPrice = getChannelPrice(product, channel.id)
      if (!channelPrice) return null
      const basePrice = parseFloat(channelPrice?.price) || parseFloat(product?.standard_price) || 0
      if (basePrice <= 0) return null

      const categoryId = product?.category_id || getProductCategoryId(product)
      const category = categoryById.get(categoryId) || null
      const topCategory = getTopCategory(categoryById, categoryId)
      const tax = taxById.get(channelPrice?.tax_id) || null
      const categoryType = classifyCategoryType(
        topCategory?.name,
        category?.name,
        product?.name
      )

      return {
        product,
        channelPrice,
        basePrice,
        categoryId,
        categoryName: category?.name || 'Diger',
        topCategoryId: topCategory?.id || category?.id || null,
        topCategoryName: topCategory?.name || category?.name || 'Diger',
        taxId: channelPrice?.tax_id || null,
        taxName: tax?.name || null,
        taxRate: parseFloat(tax?.rate) || 0,
        categoryType,
        portions: parseJ(product?.portions, []).filter(Boolean),
        optionGroups: parseJ(product?.option_groups, []).filter(Boolean),
      }
    })
    .filter(Boolean)
}

function choosePortion(random, productCtx) {
  const portions = productCtx.portions
  if (!portions.length) return null
  if (portions.length === 1) return portions[0]
  if (random() < 0.65) return portions[0]
  return pickOne(random, portions)
}

function chooseOptions(random, productCtx) {
  return productCtx.optionGroups.flatMap(group => {
    const options = Array.isArray(group?.options) ? group.options.filter(Boolean) : []
    if (!options.length) return []

    const minSelect = Math.max(0, parseInt(group?.min_select, 10) || 0)
    const maxSelect = Math.max(minSelect, parseInt(group?.max_select, 10) || options.length || 1)
    const required = !!group?.required || minSelect > 0
    const shouldPick = required || random() < 0.33
    if (!shouldPick) return []

    const maxAllowed = Math.min(options.length, maxSelect)
    const minAllowed = Math.min(maxAllowed, Math.max(required ? 1 : 0, minSelect))
    const pickCount = maxAllowed <= minAllowed
      ? maxAllowed
      : minAllowed + Math.floor(random() * (maxAllowed - minAllowed + 1))

    return shuffle(random, options).slice(0, pickCount).map(option => ({
      id: option?.option_id || option?.id || null,
      name: option?.name || 'Secenek',
      price: roundMoney(option?.price || 0),
    }))
  })
}

function createLineSelection(random, productCtx) {
  const portion = choosePortion(random, productCtx)
  const options = chooseOptions(random, productCtx)
  const portionOffset = roundMoney(portion?.price_offset || 0)
  const optionsTotal = roundMoney(options.reduce((sum, option) => sum + (parseFloat(option?.price) || 0), 0))
  const unitPrice = roundMoney(productCtx.basePrice + portionOffset + optionsTotal)
  return {
    productCtx,
    portion,
    options,
    unitPrice,
  }
}

function buildCategoryPools(productContexts) {
  const map = new Map()
  productContexts.forEach(ctx => {
    const key = ctx.topCategoryId || ctx.categoryId || 'misc'
    if (!map.has(key)) {
      map.set(key, {
        key,
        label: ctx.topCategoryName || ctx.categoryName || 'Diger',
        categoryType: ctx.categoryType || 'misc',
        items: [],
      })
    }
    map.get(key).items.push(ctx)
  })
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'tr'))
}

function createBranchProfiles(branches, settings) {
  const sorted = [...branches].sort((a, b) => String(a.branchName).localeCompare(String(b.branchName), 'tr'))
  const bandCount = clamp(Math.min(4, sorted.length || 1), 1, 4)
  const receiptAverageSpan = Math.max(1, settings.receiptAverageMax - settings.receiptAverageMin)
  const receiptAverageBandWidth = receiptAverageSpan / bandCount
  const receiptCountSpan = Math.max(1, settings.receiptCountMax - settings.receiptCountMin)
  const receiptCountBandWidth = receiptCountSpan / bandCount

  return sorted.reduce((map, branch, index) => {
    const seedRandom = createRandom(`branch-profile:${branch.branchId}:${index}`)
    const bandIndex = index % bandCount
    const averageBandMin = settings.receiptAverageMin + receiptAverageBandWidth * bandIndex
    const averageBandMax = bandIndex === bandCount - 1
      ? settings.receiptAverageMax
      : settings.receiptAverageMin + receiptAverageBandWidth * (bandIndex + 1)
    const countBandMin = settings.receiptCountMin + receiptCountBandWidth * bandIndex
    const countBandMax = bandIndex === bandCount - 1
      ? settings.receiptCountMax
      : settings.receiptCountMin + receiptCountBandWidth * (bandIndex + 1)

    const averageCenter = randomBetween(seedRandom, averageBandMin, averageBandMax)
    const averageSpread = Math.max(35, receiptAverageBandWidth * randomBetween(seedRandom, 0.55, 1.25))
    const branchAverageMin = roundMoney(clamp(
      averageCenter - averageSpread * randomBetween(seedRandom, 0.4, 0.8),
      settings.receiptAverageMin,
      settings.receiptAverageMax
    ))
    const branchAverageMax = roundMoney(clamp(
      averageCenter + averageSpread * randomBetween(seedRandom, 0.45, 0.95),
      Math.min(settings.receiptAverageMax, branchAverageMin + 25),
      settings.receiptAverageMax
    ))

    const countCenter = randomBetween(seedRandom, countBandMin, countBandMax)
    const countSpread = Math.max(12, receiptCountBandWidth * randomBetween(seedRandom, 0.5, 1.35))
    const branchReceiptCountMin = Math.round(clamp(
      countCenter - countSpread * randomBetween(seedRandom, 0.45, 0.8),
      settings.receiptCountMin,
      settings.receiptCountMax
    ))
    const branchReceiptCountMax = Math.round(clamp(
      countCenter + countSpread * randomBetween(seedRandom, 0.5, 1.05),
      Math.min(settings.receiptCountMax, branchReceiptCountMin + 8),
      settings.receiptCountMax
    ))
    const receiptAverageBase = roundMoney(randomBetween(seedRandom, branchAverageMin, branchAverageMax))
    const receiptCountBase = Math.round(randomBetween(seedRandom, branchReceiptCountMin, branchReceiptCountMax))

    map.set(branch.branchId, {
      receiptAverageMin: clamp(branchAverageMin, settings.receiptAverageMin, settings.receiptAverageMax),
      receiptAverageMax: clamp(Math.max(branchAverageMin, branchAverageMax), settings.receiptAverageMin, settings.receiptAverageMax),
      receiptAverageBase,
      receiptCountMin: clamp(branchReceiptCountMin, settings.receiptCountMin, settings.receiptCountMax),
      receiptCountMax: clamp(Math.max(branchReceiptCountMin, branchReceiptCountMax), settings.receiptCountMin, settings.receiptCountMax),
      receiptCountBase,
      preferredPayments: seedRandom() < 0.55 ? ['kredi_karti', 'nakit'] : ['nakit', 'kredi_karti'],
      bundleBias: randomBetween(seedRandom, 0.92, 1.28),
      quantityBias: randomBetween(seedRandom, 0.9, 1.22),
    })
    return map
  }, new Map())
}

function getWeightKeyForIsoDay(isoDay) {
  const day = localDateFromIso(isoDay).getDay()
  return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][day]
}

function buildWeeklyWeightMap(settings, weekSeed) {
  const random = createRandom(`week-weights:${weekSeed}`)
  const drifted = DEMO_WEEKDAY_FIELDS.reduce((acc, field) => {
    const base = settings.dayWeights[field.key] || 0
    const drift = randomBetween(random, 0.85, 1.15)
    acc[field.key] = Math.max(0.1, base * drift)
    return acc
  }, {})
  return normalizeDayWeights(drifted)
}

function getWeekSeed(isoDay) {
  const date = localDateFromIso(isoDay)
  const jan1 = new Date(date.getFullYear(), 0, 1)
  const diff = Math.floor((date - jan1) / 86400000)
  const week = Math.floor((diff + jan1.getDay()) / 7)
  return `${date.getFullYear()}-${week}`
}

function getDailyReceiptPlan(branchProfile, isoDay, settings) {
  const weeklyWeights = buildWeeklyWeightMap(settings, getWeekSeed(isoDay))
  const weekdayKey = getWeightKeyForIsoDay(isoDay)
  const weekdayFactor = clamp(((weeklyWeights[weekdayKey] || 0) / 100) * 7, 0.7, 1.3)
  // Rastgelelik katmak için Math.random() değerini seede ekliyoruz
  const countRandom = createRandom(`receipt-count:${isoDay}:${branchProfile.receiptCountBase}:${Math.random()}`)
  const averageRandom = createRandom(`receipt-average:${isoDay}:${branchProfile.receiptAverageBase}:${Math.random()}`)

  // Fiş sayıları ve ortalamalarındaki dalgalanma aralıklarını esnetiyoruz (count: ±35%, average: ±25%)
  const weightedCount = branchProfile.receiptCountBase * weekdayFactor * randomBetween(countRandom, 0.65, 1.35)
  const receiptCount = Math.round(clamp(weightedCount, branchProfile.receiptCountMin, branchProfile.receiptCountMax))
  const weightedAverage = branchProfile.receiptAverageBase * randomBetween(averageRandom, 0.75, 1.25)
  const receiptAverage = roundMoney(clamp(weightedAverage, branchProfile.receiptAverageMin, branchProfile.receiptAverageMax))

  return {
    receiptCount,
    receiptAverage,
  }
}

function buildReceiptTargets(branchProfile, receiptCount, receiptAverage, seedText) {
  // Rastgelelik için Math.random() ekliyoruz
  const random = createRandom(`receipt-targets:${seedText}:${Math.random()}`)
  return Array.from({ length: receiptCount }, (_, index) => {
    const spread = index % 7 === 0
      ? [0.65, 1.38]
      : index % 3 === 0
        ? [0.76, 1.26]
        : [0.84, 1.18]
    const amount = receiptAverage * randomBetween(random, spread[0], spread[1])
    return roundMoney(clamp(amount, branchProfile.receiptAverageMin, branchProfile.receiptAverageMax))
  })
}

function buildBranchDayMenuProfile(branch, isoDay, categoryPools) {
  // Her gün farklı ürünlerin öne çıkması için Math.random() ekliyoruz
  const random = createRandom(`menu-profile:${branch.branchId}:${isoDay}:${Math.random()}`)
  const poolProfiles = categoryPools
    .map(pool => {
      const poolSizeFactor = Math.max(0.9, Math.sqrt(pool.items.length || 1))
      const itemProfiles = shuffle(random, pool.items).map(productCtx => ({
        productCtx,
        weight: getProductBaseWeight(productCtx) * randomBetween(random, 0.68, 1.65),
      }))

      return {
        ...pool,
        weight: getCategoryTypeWeight(pool.categoryType) * poolSizeFactor * randomBetween(random, 0.72, 1.38),
        items: itemProfiles,
      }
    })
    .filter(pool => pool.items.length > 0)

  return {
    poolProfiles,
    availableTypes: Array.from(new Set(poolProfiles.map(pool => pool.categoryType))),
  }
}

function pickPoolByType(random, menuProfile, categoryType, usedPoolKeys) {
  const candidates = (menuProfile?.poolProfiles || []).filter(pool => pool.categoryType === categoryType)
  if (!candidates.length) return null

  const fresh = candidates.filter(pool => !usedPoolKeys.has(pool.key))
  return pickWeighted(random, fresh.length ? fresh : candidates, pool => pool.weight)
}

function pickProductForReceipt(random, poolProfile, selectedProductIds) {
  if (!poolProfile?.items?.length) return null

  const fresh = poolProfile.items.filter(entry => {
    const productId = entry?.productCtx?.product?.id
    return productId ? !selectedProductIds.has(productId) : true
  })

  const picked = pickWeighted(random, fresh.length ? fresh : poolProfile.items, entry => {
    // Ürün çeşitliliğini artırmak için ağırlıklara rastgele dalgalanma (jitter) ekliyoruz
    const jitter = 0.4 + (random() * 1.6) // 0.4x ile 2.0x arası dalgalanma
    return entry.weight * jitter
  })
  return picked?.productCtx || null
}

function getDesiredLineCount(random, targetAmount, branchProfile) {
  const bundleBias = clamp(branchProfile?.bundleBias || 1, 0.9, 1.3)

  if (targetAmount < 350) return randomIntBetween(random, 1, 2)
  if (targetAmount < 700) return randomIntBetween(random, 1, Math.max(2, Math.round(3 * bundleBias)))
  if (targetAmount < 1200) return randomIntBetween(random, 2, Math.max(3, Math.round(4 * bundleBias)))
  if (targetAmount < 1800) return randomIntBetween(random, 2, Math.max(4, Math.round(5 * bundleBias)))
  return randomIntBetween(random, 3, Math.max(5, Math.round(6 * bundleBias)))
}

function buildReceiptCategoryPlan(random, targetAmount, branchProfile, menuProfile) {
  const availableTypes = menuProfile?.availableTypes || []
  const desiredLineCount = getDesiredLineCount(random, targetAmount, branchProfile)
  const plan = []

  if (availableTypes.includes('main') && (targetAmount >= 360 || random() < 0.82)) {
    plan.push('main')
  }

  if (availableTypes.includes('drink') && random() < (targetAmount >= 450 ? 0.58 : 0.26)) {
    plan.push('drink')
  }

  if (availableTypes.includes('side') && random() < (targetAmount >= 600 ? 0.48 : 0.18)) {
    plan.push('side')
  }

  if (availableTypes.includes('main') && targetAmount >= 1400 && random() < 0.2 * (branchProfile?.bundleBias || 1)) {
    plan.push('main')
  }

  while (plan.length < desiredLineCount) {
    const choice = pickWeighted(
      random,
      availableTypes.map(type => ({
        type,
        weight: getCategoryTypeWeight(type) * randomBetween(random, 0.8, 1.2),
      })),
      entry => entry.weight
    )
    plan.push(choice?.type || pickOne(random, availableTypes) || 'misc')
  }

  return shuffle(random, plan).slice(0, desiredLineCount)
}

function getMaxQtyForSelection(selection, targetAmount, branchProfile) {
  const categoryType = selection?.productCtx?.categoryType || 'misc'
  const quantityBias = clamp(branchProfile?.quantityBias || 1, 0.85, 1.25)

  if (categoryType === 'main') {
    return clamp(Math.round((targetAmount >= 1800 ? 3 : 2) * quantityBias), 1, 4)
  }

  if (categoryType === 'drink') {
    return clamp(Math.round((targetAmount >= 900 ? 2 : 1.35) * quantityBias), 1, 3)
  }

  if (categoryType === 'side') {
    return clamp(Math.round((targetAmount >= 1100 ? 2 : 1.5) * quantityBias), 1, 3)
  }

  return clamp(Math.round(2 * quantityBias), 1, 3)
}

function buildReceiptLines({ branch, isoDay, receiptIndex, targetAmount, productContexts, branchProfile, menuProfile }) {
  // Her fişte farklı ürün kombinasyonları olması için Math.random() ekliyoruz
  const random = createRandom(`receipt-lines:${branch.branchId}:${isoDay}:${receiptIndex}:${branchProfile.receiptAverageBase}:${Math.random()}`)
  const categoryPlan = buildReceiptCategoryPlan(random, targetAmount, branchProfile, menuProfile)
  const selectedProductIds = new Set()
  const usedPoolKeys = new Set()
  const lines = []
  let running = 0

  for (const categoryType of categoryPlan) {
    const poolProfile = pickPoolByType(random, menuProfile, categoryType, usedPoolKeys)
      || pickWeighted(random, menuProfile?.poolProfiles || [], pool => pool.weight)
    const productCtx = pickProductForReceipt(random, poolProfile, selectedProductIds)
      || pickOne(random, productContexts)
    if (!productCtx) continue

    const selection = createLineSelection(random, productCtx)
    if (!selection.unitPrice || selection.unitPrice <= 0) continue

    const maxQty = getMaxQtyForSelection(selection, targetAmount, branchProfile)
    const remaining = Math.max(selection.unitPrice, targetAmount - running)
    const idealQty = clamp(Math.round(remaining / Math.max(selection.unitPrice, 1)), 1, maxQty)
    const qtyLow = Math.max(1, idealQty - (random() < 0.45 ? 1 : 0))
    const qtyHigh = Math.max(qtyLow, Math.min(maxQty, idealQty + (random() < 0.22 ? 1 : 0)))
    const qty = randomIntBetween(random, qtyLow, qtyHigh)
    const lineTotal = roundMoney(selection.unitPrice * qty)

    lines.push({
      ...selection,
      qty,
      lineTotal,
    })

    running = roundMoney(running + lineTotal)
    if (poolProfile?.key) usedPoolKeys.add(poolProfile.key)
    if (productCtx?.product?.id) selectedProductIds.add(productCtx.product.id)

    if (running >= targetAmount * 0.93 && lines.length >= Math.max(1, categoryPlan.length - 1)) {
      break
    }
  }

  let topUpGuard = 0
  while (running < targetAmount * 0.82 && topUpGuard < 5 && productContexts.length) {
    const poolProfile = pickWeighted(random, menuProfile?.poolProfiles || [], pool => pool.weight)
    const productCtx = pickProductForReceipt(random, poolProfile, selectedProductIds)
      || pickOne(random, productContexts)
    if (!productCtx) break

    const selection = createLineSelection(random, productCtx)
    if (!selection.unitPrice || selection.unitPrice <= 0) break

    const maxQty = getMaxQtyForSelection(selection, targetAmount, branchProfile)
    const qty = clamp(Math.round((targetAmount - running) / Math.max(selection.unitPrice, 1)), 1, maxQty)
    const lineTotal = roundMoney(selection.unitPrice * qty)

    lines.push({
      ...selection,
      qty,
      lineTotal,
    })

    running = roundMoney(running + lineTotal)
    if (productCtx?.product?.id) selectedProductIds.add(productCtx.product.id)
    topUpGuard += 1
  }

  let bumpGuard = 0
  while (running < targetAmount * 0.9 && bumpGuard < 4 && lines.length) {
    const candidate = pickWeighted(random, lines, line => {
      const maxQty = getMaxQtyForSelection(line, targetAmount, branchProfile)
      if (line.qty >= maxQty) return 0
      return line.productCtx?.categoryType === 'main' ? 2.4 : 1.4
    })
    if (!candidate) break

    candidate.qty += 1
    candidate.lineTotal = roundMoney(candidate.unitPrice * candidate.qty)
    running = roundMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0))
    bumpGuard += 1
  }

  if (!lines.length && productContexts.length) {
    const fallback = createLineSelection(random, pickOne(random, productContexts))
    lines.push({
      ...fallback,
      qty: 1,
      lineTotal: fallback.unitPrice,
    })
  }

  return lines
}

function buildDiscount(lines, settings, seedText) {
  if (!settings.discountEnabled) {
    return { discountType: null, discountValue: 0, discountAmount: 0 }
  }

  const random = createRandom(`discount:${seedText}:${Math.random()}`)
  if (random() > 0.34) {
    return { discountType: null, discountValue: 0, discountAmount: 0 }
  }

  const grossBefore = roundMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0))
  if (grossBefore <= 0) {
    return { discountType: null, discountValue: 0, discountAmount: 0 }
  }

  const rate = roundMoney(randomBetween(random, settings.discountRateMin, settings.discountRateMax))
  return {
    discountType: 'percent',
    discountValue: rate,
    discountAmount: roundMoney(grossBefore * (rate / 100)),
  }
}

function splitPaymentAmount(total, random) {
  const first = roundMoney(total * randomBetween(random, 0.35, 0.65))
  const second = roundMoney(total - first)
  return [first, second].filter(amount => amount > 0)
}

function buildPayments(total, branchProfile, settings, seedText) {
  const random = createRandom(`payments:${seedText}:${Math.random()}`)
  const preferred = branchProfile.preferredPayments
  const labels = {
    nakit: 'Nakit',
    kredi_karti: 'Kredi Karti',
    transfer: 'Transfer',
    yemek_ceki: 'Yemek Ceki',
  }

  if (settings.splitPaymentEnabled && total > 400 && random() < 0.28) {
    const methods = shuffle(random, ['nakit', 'kredi_karti', 'transfer', 'yemek_ceki']).slice(0, 2)
    const amounts = splitPaymentAmount(total, random)
    return methods.map((method, index) => ({
      payment_method: method,
      payment_method_label: labels[method] || method,
      amount: amounts[index] || 0,
      reference_no: null,
    }))
  }

  const method = random() < 0.72 ? preferred[0] : pickOne(random, ['nakit', 'kredi_karti', 'transfer', 'yemek_ceki'])
  return [{
    payment_method: method,
    payment_method_label: labels[method] || method,
    amount: roundMoney(total),
    reference_no: null,
  }]
}

function allocateDiscount(lines, discountAmount) {
  const grossBefore = roundMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0))
  let allocated = 0

  return lines.map((line, index) => {
    const lineDiscount = index === lines.length - 1
      ? roundMoney(discountAmount - allocated)
      : roundMoney(grossBefore > 0 ? (line.lineTotal / grossBefore) * discountAmount : 0)

    allocated = roundMoney(allocated + lineDiscount)
    const lineAfter = roundMoney(line.lineTotal - lineDiscount)
    const unitAfter = line.qty > 0 ? roundMoney(lineAfter / line.qty) : 0
    const unitCost = roundMoney(calcRecipeUnitCost(line.productCtx.product, line.productCtx.channelPrice.channel_id, line.portion?.id || null))
    const lineCost = roundMoney(unitCost * line.qty)
    const lineNet = line.productCtx.taxRate > 0
      ? roundMoney(lineAfter / (1 + line.productCtx.taxRate / 100))
      : lineAfter

    return {
      ...line,
      discountAllocatedAmount: lineDiscount,
      lineGrossAfterDiscount: lineAfter,
      unitGrossAfterDiscount: unitAfter,
      unitCostSnapshot: unitCost,
      lineCostTotal: lineCost,
      lineNetAfterDiscount: lineNet,
    }
  })
}

export function resolveScanWindow(settingsOrEndDate = {}, maybeEndDate = new Date()) {
  const settings = settingsOrEndDate instanceof Date ? {} : settingsOrEndDate || {}
  const safeEndDate = settingsOrEndDate instanceof Date ? settingsOrEndDate : maybeEndDate
  const normalizedSettings = normalizeDemoSalesSettings(settings)
  const endIsoDay = formatIsoDay(safeEndDate)
  const startIsoDay = normalizedSettings.baseDate > endIsoDay
    ? endIsoDay
    : normalizedSettings.baseDate

  return {
    startIsoDay,
    endIsoDay,
  }
}

export function buildMissingSalesSummary(branches, salesRows, startIsoDay, endIsoDay, settings) {
  const safeSettings = normalizeDemoSalesSettings(settings || {})
  const minRequiredSales = Math.max(1, Math.round(Number(safeSettings.receiptCountMin) * 0.4))
  
  const allDays = listIsoDays(startIsoDay, endIsoDay)
  const existingCounts = new Map()
  
  ;(salesRows || []).forEach(row => {
    const branchKey = getBranchPresenceKey(row?.branch_id, row?.branch_name)
    if (!branchKey || !row?.sale_datetime) return
    const key = `${branchKey}::${formatIsoDay(new Date(row.sale_datetime))}`
    const count = Number(row.sale_count) || 1
    existingCounts.set(key, (existingCounts.get(key) || 0) + count)
  })

  const missingBranchDays = []
  const missingByBranch = new Map()
  const missingDaySet = new Set()

  branches.forEach(branch => {
    const branchKey = getBranchPresenceKey(branch.branchId, branch.branchName)
    if (!branchKey) return
    allDays.forEach(isoDay => {
      const key = `${branchKey}::${isoDay}`
      const currentCount = existingCounts.get(key) || 0
      
      // If it has enough sales, skip it
      if (currentCount >= minRequiredSales) return
      
      missingBranchDays.push({ 
        branchId: branch.branchId, 
        branchName: branch.branchName, 
        isoDay,
        existingCount: currentCount 
      })
      
      missingByBranch.set(branch.branchId, {
        branch,
        count: (missingByBranch.get(branch.branchId)?.count || 0) + 1,
      })
      missingDaySet.add(isoDay)
    })
  })

  return {
    branchCount: branches.length,
    scannedDayCount: allDays.length,
    missingBranchDayCount: missingBranchDays.length,
    missingCalendarDayCount: missingDaySet.size,
    missingBranchDays,
    topMissingBranches: Array.from(missingByBranch.values())
      .sort((a, b) => b.count - a.count || a.branch.branchName.localeCompare(b.branch.branchName, 'tr'))
      .slice(0, 10),
  }
}

function buildSaleRecord({
  branch,
  channel,
  branchProfile,
  menuProfile,
  isoDay,
  receiptIndex,
  receiptTarget,
  productContexts,
  stockById,
  semiById,
}) {
  const linesBeforeDiscount = buildReceiptLines({
    branch,
    isoDay,
    receiptIndex,
    targetAmount: receiptTarget,
    productContexts,
    branchProfile,
    menuProfile,
  })

  const discount = buildDiscount(linesBeforeDiscount, branchProfile.settings, `${branch.branchId}:${isoDay}:${receiptIndex}`)
  const normalizedLines = allocateDiscount(linesBeforeDiscount, discount.discountAmount)
  const grossBefore = roundMoney(normalizedLines.reduce((sum, line) => sum + line.lineTotal, 0))
  const grossAfter = roundMoney(normalizedLines.reduce((sum, line) => sum + line.lineGrossAfterDiscount, 0))
  const netAfter = roundMoney(normalizedLines.reduce((sum, line) => sum + line.lineNetAfterDiscount, 0))
  const costTotal = roundMoney(normalizedLines.reduce((sum, line) => sum + line.lineCostTotal, 0))
  const saleId = makeUuid()
  const saleDate = new Date(`${isoDay}T${String(9 + (receiptIndex % 12)).padStart(2, '0')}:${String((receiptIndex * 7) % 60).padStart(2, '0')}:00`).toISOString()
  const payments = buildPayments(grossAfter, branchProfile, branchProfile.settings, `${branch.branchId}:${isoDay}:${receiptIndex}`)

  const header = {
    id: saleId,
    local_id: `demo-${branch.branchId}-${isoDay}-${receiptIndex + 1}-${Math.abs(hashString(saleId))}`,
    sale_no: null,
    sale_datetime: saleDate,
    source: 'pos',
    source_channel_type: 'hizli_satis',
    sales_channel_id: asUuidOrNull(channel.id),
    sales_channel_name: channel.name,
    company_id: asUuidOrNull(branch.companyId),
    company_name: branch.companyName || null,
    legal_entity_id: asUuidOrNull(branch.legalEntityId),
    legal_entity_name: branch.legalEntityName || null,
    org_unit_id: asUuidOrNull(branch.orgUnitId),
    org_unit_name: branch.orgUnitName || null,
    branch_id: asUuidOrNull(branch.branchId),
    branch_name: branch.branchName,
    table_no: null,
    customer_id: null,
    customer_name: null,
    cashier_id: null,
    cashier_name: null,
    order_note: null,
    currency_code: 'TRY',
    gross_total_before_discount: grossBefore,
    discount_type: discount.discountType,
    discount_value: discount.discountValue,
    discount_amount: discount.discountAmount,
    gross_total_after_discount: grossAfter,
    net_total_after_discount: netAfter,
    cost_total: costTotal,
    payment_total: grossAfter,
    change_amount: 0,
    status: 'completed',
    integration_ref: 'demo-sales-tool',
  }

  const lines = normalizedLines.map((line, index) => ({
    id: makeUuid(),
    sale_id: saleId,
    line_no: index + 1,
    product_id: asUuidOrNull(line.productCtx.product.id),
    product_name: line.productCtx.product.name,
    product_sku: line.productCtx.product.sku || null,
    top_category_id: asUuidOrNull(line.productCtx.topCategoryId),
    top_category_name: line.productCtx.topCategoryName,
    sub_category_id: asUuidOrNull(line.productCtx.categoryId),
    sub_category_name: line.productCtx.categoryName,
    portion_id: line.portion?.id || null,
    portion_name: line.portion?.name || null,
    options_json: line.options.map(option => ({ id: option.id || null, name: option.name || '' })),
    options_summary: line.options.map(option => option.name).filter(Boolean).join(' + ') || null,
    line_note: null,
    qty: line.qty,
    unit_gross_before_discount: line.unitPrice,
    line_gross_before_discount: line.lineTotal,
    discount_allocated_amount: line.discountAllocatedAmount,
    unit_gross_after_discount: line.unitGrossAfterDiscount,
    line_gross_after_discount: line.lineGrossAfterDiscount,
    tax_id: asUuidOrNull(line.productCtx.taxId),
    tax_name: line.productCtx.taxName,
    tax_rate: line.productCtx.taxRate,
    line_net_after_discount: line.lineNetAfterDiscount,
    unit_cost_snapshot: line.unitCostSnapshot,
    line_cost_total: line.lineCostTotal,
    sales_channel_id: asUuidOrNull(channel.id),
    sales_channel_name: channel.name,
    branch_id: asUuidOrNull(branch.branchId),
    branch_name: branch.branchName,
    sale_datetime: saleDate,
  }))

  const salePayments = payments.map(payment => ({
    id: makeUuid(),
    sale_id: saleId,
    payment_method: payment.payment_method,
    payment_method_label: payment.payment_method_label,
    amount: payment.amount,
    reference_no: payment.reference_no,
    payment_datetime: saleDate,
  }))

  const movementCandidates = buildInventoryMovementCandidates(normalizedLines, saleId, saleDate, branch, channel, stockById, semiById)

  return { header, lines, payments: salePayments, movementCandidates }
}

export function prepareDemoGeneration({ branches, products, categories, taxes, channel, settings, stockItems, semiItems }) {
  const safeSettings = normalizeDemoSalesSettings(settings)
  const categoryById = new Map((categories || []).filter(row => !row?.deleted_at).map(row => [row.id, row]))
  const taxById = new Map((taxes || []).filter(row => !row?.deleted_at).map(row => [row.id, row]))
  const productContexts = buildProductContexts(products || [], channel, categoryById, taxById)
  const categoryPools = buildCategoryPools(productContexts)
  const branchProfiles = createBranchProfiles(branches, safeSettings)
  const stockById = new Map((stockItems || []).filter(row => row?.id).map(row => [row.id, row]))
  const semiById = new Map((semiItems || []).filter(row => row?.id).map(row => [row.id, row]))

  return {
    settings: safeSettings,
    channel,
    productContexts,
    categoryPools,
    branchProfiles,
    categoryById,
    taxById,
    stockById,
    semiById,
  }
}

export function findFastSalesChannel(channels) {
  const list = channels || []
  return list.find(channel => normalizeText(channel?.name).includes('hizli')) || list[0] || null
}

export function buildBranchDayReceipts({ branch, isoDay, existingCount = 0, generator }) {
  const branchProfile = generator.branchProfiles.get(branch.branchId)
  if (!branchProfile) return []

  branchProfile.settings = generator.settings
  const menuProfile = buildBranchDayMenuProfile(branch, isoDay, generator.categoryPools)
  const { receiptCount, receiptAverage } = getDailyReceiptPlan(branchProfile, isoDay, generator.settings)
  
  const targetCount = Math.max(0, receiptCount - existingCount)
  if (targetCount <= 0) return []

  const targets = buildReceiptTargets(branchProfile, targetCount, receiptAverage, `${branch.branchId}:${isoDay}`)

  return targets
    .filter(amount => amount > 0)
    .map((receiptTarget, receiptIndex) => buildSaleRecord({
      branch,
      channel: generator.channel,
      branchProfile,
      menuProfile,
      isoDay,
      receiptIndex,
      receiptTarget,
      productContexts: generator.productContexts,
      stockById: generator.stockById,
      semiById: generator.semiById,
    }))
}
