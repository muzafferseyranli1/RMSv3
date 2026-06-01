import crypto from 'node:crypto'
import pg from 'pg'

const { Client } = pg

const DEFAULT_PHONE = '5332760534'
const DEFAULT_CAMPAIGN_NAME = '5 Kahveye 1 Kahve'
const DATABASE_URL = process.env.DATABASE_URL || ''
const DATABASE_SSL = process.env.DATABASE_SSL === 'true'

function readArg(name, fallback = '') {
  const index = process.argv.indexOf(name)
  if (index === -1) return fallback
  return String(process.argv[index + 1] || '').trim() || fallback
}

function hasArg(name) {
  return process.argv.includes(name)
}

function asJson(value) {
  return JSON.stringify(value ?? {})
}

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

function phoneCandidates(phone) {
  const digits = normalizeDigits(phone)
  const values = new Set([digits])
  if (digits.length === 10 && digits.startsWith('5')) {
    values.add(`90${digits}`)
    values.add(`0${digits}`)
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    values.add(digits.slice(1))
    values.add(`90${digits.slice(1)}`)
  }
  if (digits.length === 12 && digits.startsWith('90')) {
    values.add(digits.slice(2))
    values.add(`0${digits.slice(2)}`)
  }
  return [...values].filter(Boolean)
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function toInt(value, fallback = 0) {
  const parsed = parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function resolveCharset(charset) {
  const normalized = String(charset || '').trim().toLowerCase()
  if (!normalized || normalized === 'numeric' || normalized === 'number' || normalized === 'digits') return '0123456789'
  if (normalized === 'alpha' || normalized === 'letters') return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  if (normalized === 'alphanumeric' || normalized === 'alpha_numeric' || normalized === 'letters_digits') return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  return String(charset)
}

function buildCouponCode(series) {
  const prefix = String(series?.prefix || '').trim().toUpperCase()
  const randomLength = Math.max(1, toInt(series?.random_length, 6))
  const charset = resolveCharset(series?.charset || 'numeric')
  let randomPart = ''
  for (let i = 0; i < randomLength; i += 1) {
    randomPart += charset.charAt(Math.floor(Math.random() * charset.length))
  }
  return `${prefix}${randomPart}`.toUpperCase()
}

function resolveExpiresAt(series) {
  if (series?.valid_until) return series.valid_until
  const expiresInDays = toInt(series?.expires_in_days, 0)
  if (expiresInDays <= 0) return null
  const expiresAt = new Date()
  expiresAt.setUTCDate(expiresAt.getUTCDate() + expiresInDays)
  return expiresAt.toISOString()
}

function buildCycleSourceRefId({ customerId, campaignId, cycleNo }) {
  return `stamp_cycle:${campaignId}:${customerId}:${cycleNo}`
}

function normalizeCycleList(value) {
  const source = Array.isArray(value) ? value : []
  return [...new Set(source.map(item => toInt(item, 0)).filter(item => item > 0))].sort((a, b) => a - b)
}

function conditionTarget(conditionJson) {
  return Math.max(0, toInt(conditionJson?.quantity ?? conditionJson?.threshold ?? conditionJson?.count, 0))
}

function productMaskMatches(line, masks) {
  if (!Array.isArray(masks) || masks.length === 0) return true
  return masks.some(mask => {
    const type = String(mask?.type || '').trim()
    const itemId = String(mask?.itemId || mask?.id || '').trim()
    if (!itemId) return false
    if (type === 'product') return String(line.product_id || '') === itemId
    if (type === 'category') {
      return String(line.top_category_id || '') === itemId || String(line.sub_category_id || '') === itemId
    }
    return false
  })
}

function computeStampPlan({ actualCount, targetCount, existingEntitlements = [], progress = null }) {
  const expectedCoupons = targetCount > 0 ? Math.floor(actualCount / targetCount) : 0
  const remainder = targetCount > 0 ? actualCount % targetCount : 0
  const issuedFromMetadata = normalizeCycleList(progress?.metadata?.issuedCycles)
  const explicitCycleEntitlements = normalizeCycleList(
    existingEntitlements
      .map(row => parseJson(row.metadata, {})?.stampCycleNo || parseJson(row.reward_payload, {})?.stampCycleNo)
  )
  const existingCount = existingEntitlements.length
  const coveredCycles = new Set([...issuedFromMetadata, ...explicitCycleEntitlements])

  for (let cycleNo = 1; cycleNo <= existingCount; cycleNo += 1) {
    coveredCycles.add(cycleNo)
  }

  const missingCycles = []
  for (let cycleNo = 1; cycleNo <= expectedCoupons; cycleNo += 1) {
    if (!coveredCycles.has(cycleNo)) missingCycles.push(cycleNo)
  }

  return {
    expectedCoupons,
    remainder,
    existingCount,
    missingCycles,
    missingCount: missingCycles.length,
  }
}

async function loadCustomer(client, phone) {
  const candidates = phoneCandidates(phone)
  const { rows } = await client.query(
    `
      select id, ad_soyad, telefon, normalized_phone, loyalty_status, loyalty_member_no
      from musteriler
      where regexp_replace(coalesce(telefon, ''), '\\D', '', 'g') = any($1::text[])
         or regexp_replace(coalesce(normalized_phone, ''), '\\D', '', 'g') = any($1::text[])
      order by updated_at desc nulls last, created_at desc nulls last
      limit 1
    `,
    [candidates],
  )
  return rows[0] || null
}

async function loadCampaignRule(client, { campaignId, campaignName }) {
  const params = []
  const filters = ['c.deleted_at is null', 'r.deleted_at is null', 'r.active = true']
  if (campaignId) {
    params.push(campaignId)
    filters.push(`c.id = $${params.length}`)
  } else {
    params.push(campaignName)
    filters.push(`c.name ilike $${params.length}`)
  }

  const { rows } = await client.query(
    `
      select
        c.id as campaign_id,
        c.name as campaign_name,
        c.program_id,
        c.active as campaign_active,
        c.status as campaign_status,
        r.id as rule_id,
        r.condition_key,
        r.condition_json,
        r.action_type,
        r.action_json
      from loyalty_campaigns c
      join loyalty_campaign_rules r on r.campaign_id = c.id
      where ${filters.join(' and ')}
      order by c.priority asc, r.sort_order asc
      limit 1
    `,
    params,
  )
  return rows[0] || null
}

async function loadQualifyingLines(client, { customerId, conditionJson }) {
  const masks = Array.isArray(conditionJson.productMasks) ? conditionJson.productMasks : []
  const excludeFreeItems = Boolean(conditionJson.excludeFreeItems)

  const { rows } = await client.query(
    `
      select
        s.id as sale_id,
        s.local_id,
        s.sale_datetime,
        s.sales_channel_name,
        s.payment_total,
        l.id as line_id,
        l.product_id,
        l.product_name,
        l.top_category_id,
        l.sub_category_id,
        l.qty,
        l.line_gross_after_discount
      from sales s
      join sale_lines l on l.sale_id = s.id
      where s.customer_id = $1
        and s.status = 'completed'
        and s.deleted_at is null
      order by s.sale_datetime asc, l.id asc
    `,
    [customerId],
  )

  return rows.filter(line => {
    if (excludeFreeItems && Number(line.line_gross_after_discount || 0) <= 0) return false
    return productMaskMatches(line, masks)
  })
}

async function loadSeries(client, seriesId) {
  const { rows } = await client.query(
    `
      select id, name, prefix, random_length, charset, coupon_count, valid_until, expires_in_days, use_after_checkout, metadata
      from loyalty_coupon_series
      where id = $1
      limit 1
    `,
    [seriesId],
  )
  return rows[0] || null
}

async function loadProgress(client, { customerId, campaignId }) {
  const { rows } = await client.query(
    `
      select id, customer_id, program_id, campaign_id, progress_type, current_count, target_count, completed_cycles, metadata
      from loyalty_frequency_progress
      where customer_id = $1
        and campaign_id = $2
        and progress_type = 'products'
      order by updated_at desc
      limit 1
    `,
    [customerId, campaignId],
  )
  return rows[0] || null
}

async function loadExistingEntitlements(client, { customerId, campaignId }) {
  const { rows } = await client.query(
    `
      select id, source_ref_id, entitlement_status, reward_payload, metadata, earned_at
      from loyalty_reward_entitlements
      where customer_id = $1
        and campaign_id = $2
        and entitlement_type = 'coupon'
        and entitlement_status <> 'cancelled'
        and deleted_at is null
      order by earned_at asc, created_at asc
    `,
    [customerId, campaignId],
  )
  return rows
}

async function loadExistingCoupons(client, { customerId, seriesId }) {
  const { rows } = await client.query(
    `
      select id, code, redemption_status, is_used, active, issued_at, created_at, metadata
      from loyalty_coupons
      where customer_id = $1
        and series_id = $2
        and deleted_at is null
      order by created_at asc
    `,
    [customerId, seriesId],
  )
  return rows
}

async function generateUniqueCouponCode(client, series) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = buildCouponCode(series)
    const { rows } = await client.query('select id from loyalty_coupons where code = $1 limit 1', [code])
    if (rows.length === 0) return code
  }
  throw new Error('Benzersiz kupon kodu uretilemedi.')
}

async function insertCycleCoupon(client, { customer, campaign, series, cycleNo }) {
  const sourceRefId = buildCycleSourceRefId({
    customerId: customer.id,
    campaignId: campaign.campaign_id,
    cycleNo,
  })

  const existing = await client.query(
    `
      select id
      from loyalty_reward_entitlements
      where customer_id = $1
        and source_ref_id = $2
        and entitlement_type = 'coupon'
      limit 1
    `,
    [customer.id, sourceRefId],
  )
  if (existing.rows[0]?.id) return { cycleNo, entitlementId: existing.rows[0].id, sourceRefId, existing: true }

  const code = await generateUniqueCouponCode(client, series)
  const couponId = `coupon-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  const expiresAt = resolveExpiresAt(series)
  const now = new Date().toISOString()

  await client.query(
    `
      insert into loyalty_coupons (
        id, series_id, customer_id, code, is_used, use_after_checkout, active,
        redemption_status, expires_at, issued_at, created_at, updated_at, metadata
      )
      values ($1, $2, $3, $4, false, $5, true, 'available', $6, $7, $7, $7, $8::jsonb)
    `,
    [
      couponId,
      series.id,
      customer.id,
      code,
      Boolean(series.use_after_checkout),
      expiresAt,
      now,
      asJson({
        generatedBy: 'backfill_loyalty_stamp_cycles',
        seriesName: series.name,
        stampCycleNo: cycleNo,
        sourceRefId,
      }),
    ],
  )

  const entitlement = await client.query(
    `
      insert into loyalty_reward_entitlements (
        customer_id, program_id, campaign_id, wallet_id, entitlement_type, entitlement_status,
        title, description, source_channel, source_ref_id, source_ref_no,
        target_scope_type, target_scope_json, reward_payload, quantity, earned_at, note, metadata
      )
      values (
        $1, $2, $3, null, 'coupon', 'available',
        $4, $5, 'backfill', $6, $6,
        'any', '{}'::jsonb, $7::jsonb, 1, $8, $5, $9::jsonb
      )
      returning id
    `,
    [
      customer.id,
      campaign.program_id,
      campaign.campaign_id,
      '5 Kahve Tamamlandi - Ucretsiz Kahve',
      '5 Sutlu Kahve satin alarak ucretsiz kahve kazandiniz.',
      sourceRefId,
      asJson({
        type: 'issue_coupon',
        seriesId: series.id,
        couponCode: code,
        stampCycleNo: cycleNo,
      }),
      now,
      asJson({
        createdBy: 'backfill_loyalty_stamp_cycles',
        couponCode: code,
        stampCycleNo: cycleNo,
        stampCycleSourceRefId: sourceRefId,
      }),
    ],
  )

  await client.query(
    'update loyalty_coupon_series set coupon_count = coalesce(coupon_count, 0) + 1, updated_at = $1 where id = $2',
    [now, series.id],
  )

  return { cycleNo, entitlementId: entitlement.rows[0]?.id || null, couponId, couponCode: code, sourceRefId, existing: false }
}

async function upsertProgress(client, { customer, campaign, progress, targetCount, actualCount, plan, issuedCycles }) {
  const now = new Date().toISOString()
  const currentCount = targetCount > 0 ? actualCount % targetCount : 0
  const completedCycles = targetCount > 0 ? Math.floor(actualCount / targetCount) : 0
  const existingMetadata = parseJson(progress?.metadata, {})
  const mergedIssuedCycles = normalizeCycleList([
    ...normalizeCycleList(existingMetadata.issuedCycles),
    ...issuedCycles,
  ])
  const metadata = {
    ...existingMetadata,
    lastSourceRefId: 'backfill_loyalty_stamp_cycles',
    period: 'all_time',
    periodDays: 30,
    lastActualCount: actualCount,
    lastIssuedCycle: mergedIssuedCycles.length ? Math.max(...mergedIssuedCycles) : plan.existingCount,
    issuedCycles: mergedIssuedCycles,
  }

  if (progress?.id) {
    await client.query(
      `
        update loyalty_frequency_progress
        set current_count = $1,
            target_count = $2,
            completed_cycles = $3,
            last_qualified_at = $4,
            metadata = $5::jsonb,
            updated_at = $4
        where id = $6
      `,
      [currentCount, targetCount, completedCycles, now, asJson(metadata), progress.id],
    )
    return progress.id
  }

  const inserted = await client.query(
    `
      insert into loyalty_frequency_progress (
        customer_id, program_id, campaign_id, progress_type, current_count, target_count,
        completed_cycles, last_qualified_at, metadata, created_at, updated_at
      )
      values ($1, $2, $3, 'products', $4, $5, $6, $7, $8::jsonb, $7, $7)
      returning id
    `,
    [customer.id, campaign.program_id, campaign.campaign_id, currentCount, targetCount, completedCycles, now, asJson(metadata)],
  )
  return inserted.rows[0]?.id || null
}

async function buildReport(client, options) {
  const customer = await loadCustomer(client, options.phone)
  if (!customer) throw new Error(`Musteri bulunamadi: ${options.phone}`)

  const campaign = await loadCampaignRule(client, {
    campaignId: options.campaignId,
    campaignName: options.campaignName,
  })
  if (!campaign) throw new Error(`Damga kampanyasi bulunamadi: ${options.campaignId || options.campaignName}`)

  const conditionJson = parseJson(campaign.condition_json, {})
  const actionJson = parseJson(campaign.action_json, {})
  const targetCount = conditionTarget(conditionJson)
  const seriesIds = Array.isArray(actionJson.seriesIds) ? actionJson.seriesIds : []
  const seriesId = seriesIds[0] || actionJson.seriesId || null
  if (!seriesId) throw new Error('Kampanya issue_coupon action_json icinde seriesId tasimiyor.')

  const lines = await loadQualifyingLines(client, { customerId: customer.id, conditionJson })
  const progress = await loadProgress(client, { customerId: customer.id, campaignId: campaign.campaign_id })
  const entitlements = await loadExistingEntitlements(client, { customerId: customer.id, campaignId: campaign.campaign_id })
  const coupons = await loadExistingCoupons(client, { customerId: customer.id, seriesId })
  const series = await loadSeries(client, seriesId)
  if (!series) throw new Error(`Kupon serisi bulunamadi: ${seriesId}`)

  const actualCount = lines.reduce((sum, line) => sum + Number(line.qty || 0), 0)
  const plan = computeStampPlan({ actualCount, targetCount, existingEntitlements: entitlements, progress })

  return {
    mode: options.apply ? 'apply' : 'dry-run',
    customer,
    campaign,
    series,
    targetCount,
    actualCount,
    saleLineCount: lines.length,
    sales: lines.map(line => ({
      saleId: line.sale_id,
      localId: line.local_id,
      saleDatetime: line.sale_datetime,
      channel: line.sales_channel_name,
      productId: line.product_id,
      productName: line.product_name,
      qty: Number(line.qty || 0),
    })),
    progress,
    entitlements,
    coupons,
    plan,
  }
}

function summarize(report, applied = []) {
  return {
    mode: report.mode,
    customer: {
      id: report.customer.id,
      name: report.customer.ad_soyad,
      phone: report.customer.telefon,
      normalizedPhone: report.customer.normalized_phone,
    },
    campaign: {
      id: report.campaign.campaign_id,
      name: report.campaign.campaign_name,
      ruleId: report.campaign.rule_id,
      seriesId: report.series.id,
      seriesName: report.series.name,
    },
    calculation: {
      qualifyingCoffeeCount: report.actualCount,
      targetCount: report.targetCount,
      expectedCoupons: report.plan.expectedCoupons,
      existingCouponEntitlements: report.plan.existingCount,
      missingCoupons: report.plan.missingCount,
      remainder: report.plan.remainder,
      missingCycles: report.plan.missingCycles,
      saleLineCount: report.saleLineCount,
    },
    currentState: {
      progress: report.progress
        ? {
            currentCount: Number(report.progress.current_count || 0),
            targetCount: Number(report.progress.target_count || 0),
            completedCycles: Number(report.progress.completed_cycles || 0),
            metadata: report.progress.metadata,
          }
        : null,
      coupons: report.coupons.map(row => ({
        id: row.id,
        code: row.code,
        status: row.redemption_status,
        isUsed: row.is_used,
        active: row.active,
      })),
    },
    applied,
  }
}

function assertSelfTest(condition, message) {
  if (!condition) throw new Error(message)
}

function runSelfTest() {
  const plan = computeStampPlan({
    actualCount: 18,
    targetCount: 5,
    existingEntitlements: [{ id: 'existing-cycle-1' }],
    progress: { metadata: {} },
  })
  assertSelfTest(plan.expectedCoupons === 3, '18/5 expected coupon count failed')
  assertSelfTest(plan.remainder === 3, '18/5 remainder failed')
  assertSelfTest(plan.missingCount === 2, 'missing coupon count failed')
  assertSelfTest(JSON.stringify(plan.missingCycles) === JSON.stringify([2, 3]), 'missing cycles failed')
  assertSelfTest(/^\d+$/.test(buildCouponCode({ prefix: '', random_length: 8, charset: 'numeric' })), 'numeric charset failed')
  assertSelfTest(/^KHV\d{4}$/.test(buildCouponCode({ prefix: 'KHV', random_length: 4, charset: 'numeric' })), 'prefix numeric charset failed')
  console.log('[backfill-loyalty-stamp-cycles] SELF TEST PASS')
}

async function main() {
  if (hasArg('--self-test')) {
    runSelfTest()
    return
  }

  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL zorunludur. Railway Postgres baglantisini env ile verin.')
  }

  const options = {
    phone: readArg('--phone', DEFAULT_PHONE),
    campaignId: readArg('--campaign-id', ''),
    campaignName: readArg('--campaign-name', DEFAULT_CAMPAIGN_NAME),
    apply: hasArg('--apply'),
    expectActualCount: toInt(readArg('--expect-actual-count', ''), NaN),
    expectMissingCoupons: toInt(readArg('--expect-missing-coupons', ''), NaN),
  }

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
  })

  await client.connect()
  try {
    const report = await buildReport(client, options)

    if (Number.isFinite(options.expectActualCount) && Number(report.actualCount) !== Number(options.expectActualCount)) {
      throw new Error(`Beklenen kahve adedi ${options.expectActualCount}, hesaplanan ${report.actualCount}. Apply durduruldu.`)
    }
    if (Number.isFinite(options.expectMissingCoupons) && Number(report.plan.missingCount) !== Number(options.expectMissingCoupons)) {
      throw new Error(`Beklenen eksik kupon ${options.expectMissingCoupons}, hesaplanan ${report.plan.missingCount}. Apply durduruldu.`)
    }

    const applied = []
    if (options.apply && report.plan.missingCycles.length > 0) {
      await client.query('begin')
      try {
        for (const cycleNo of report.plan.missingCycles) {
          applied.push(await insertCycleCoupon(client, {
            customer: report.customer,
            campaign: report.campaign,
            series: report.series,
            cycleNo,
          }))
        }
        await upsertProgress(client, {
          customer: report.customer,
          campaign: report.campaign,
          progress: report.progress,
          targetCount: report.targetCount,
          actualCount: report.actualCount,
          plan: report.plan,
          issuedCycles: [
            ...Array.from({ length: report.plan.existingCount }, (_, index) => index + 1),
            ...applied.map(item => item.cycleNo),
          ],
        })
        await client.query('commit')
      } catch (error) {
        await client.query('rollback')
        throw error
      }
    }

    const readback = options.apply ? await buildReport(client, { ...options, apply: false }) : null
    console.log(JSON.stringify({
      ok: true,
      dryRun: summarize(report, applied),
      readback: readback ? summarize(readback) : null,
    }, null, 2))
  } finally {
    await client.end()
  }
}

main().catch(error => {
  console.error(`[backfill-loyalty-stamp-cycles] FAIL: ${error.message}`)
  process.exit(1)
})
