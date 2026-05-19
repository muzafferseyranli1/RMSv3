import pg from 'pg'
import { randomUUID } from 'node:crypto'

const { Client } = pg

const DATABASE_URL = process.env.DATABASE_URL || ''
const DATABASE_SSL = process.env.DATABASE_SSL === 'true'

if (!DATABASE_URL) {
  console.error('DATABASE_URL zorunludur. Loyalty redemption smoke run icin Railway Postgres baglantisini env ile verin.')
  process.exit(1)
}

const FIXTURE = {
  programId: 'SMOKE-LOYALTY-REDEEM-PROGRAM-20260519',
  campaignId: 'SMOKE-LOYALTY-REDEEM-CAMPAIGN-20260519',
  ruleId: 'SMOKE-LOYALTY-REDEEM-RULE-20260519',
  customerId: '7f1d2e3a-8b6f-4d1a-9b6e-202605190001',
  customerName: 'Smoke Loyalty Redeem Musterisi',
  productId: 'b1040000-0000-4000-8000-000000000007',
  salesChannelName: 'Çağrı Merkezi',
  paymentMethod: 'nakit',
  runtimeChannel: 'call_center',
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

function roundPoints(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

function truncatePoints(value) {
  return Math.floor(Number(value || 0) * 100) / 100
}

function normalizeText(value) {
  return String(value || '').trim()
}

function formatAmount(value) {
  return `${roundMoney(value).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`
}

function logStep(message) {
  console.log(`\n[loyalty-redemption-smoke-run] ${message}`)
}

async function loadFixtureContext(client) {
  const programResult = await client.query(
    `select id, name, redemption_rate
     from loyalty_programs
     where id = $1
     limit 1`,
    [FIXTURE.programId],
  )
  const campaignResult = await client.query(
    `select id, program_id, name, audience_json
     from loyalty_campaigns
     where id = $1
     limit 1`,
    [FIXTURE.campaignId],
  )
  const ruleResult = await client.query(
    `select id, action_type, action_json
     from loyalty_campaign_rules
     where id = $1
     limit 1`,
    [FIXTURE.ruleId],
  )
  const customerResult = await client.query(
    `select id, ad_soyad
     from musteriler
     where id = $1
     limit 1`,
    [FIXTURE.customerId],
  )
  const walletResult = await client.query(
    `select id, customer_id, program_id, wallet_type, current_points_balance, lifetime_earned_points, lifetime_burned_points
     from loyalty_wallets
     where customer_id = $1
       and program_id = $2
       and wallet_type = 'points'
     limit 1`,
    [FIXTURE.customerId, FIXTURE.programId],
  )
  const productResult = await client.query(
    `select id, name, sku, sale_price, standard_price, channel_prices, sale_cat_l1, sale_cat_l2, sale_cat_l3, sale_cat_l4, sale_cat_l5
     from sale_items
     where id = $1
     limit 1`,
    [FIXTURE.productId],
  )
  const channelResult = await client.query(
    `select id, name
     from sales_channels
     where name = $1
     limit 1`,
    [FIXTURE.salesChannelName],
  )

  const program = programResult.rows[0] || null
  const campaign = campaignResult.rows[0] || null
  const rule = ruleResult.rows[0] || null
  const customer = customerResult.rows[0] || null
  const wallet = walletResult.rows[0] || null
  const product = productResult.rows[0] || null
  const salesChannel = channelResult.rows[0] || null

  if (!program?.id) throw new Error('Smoke program bulunamadi.')
  if (!campaign?.id) throw new Error('Smoke campaign bulunamadi.')
  if (!rule?.id) throw new Error('Smoke rule bulunamadi.')
  if (!customer?.id) throw new Error('Smoke musteri bulunamadi.')
  if (!wallet?.id) throw new Error('Smoke wallet bulunamadi.')
  if (!product?.id) throw new Error('Smoke sale item bulunamadi.')
  if (!salesChannel?.id) throw new Error('Çağrı Merkezi sales channel bulunamadi.')

  return { program, campaign, rule, customer, wallet, product, salesChannel }
}

function resolveUnitPrice(product, salesChannelId) {
  const channelPrices = Array.isArray(product?.channel_prices) ? product.channel_prices : []
  const channelMatch = channelPrices.find((row) => String(row?.channel_id || '') === String(salesChannelId || '') && row?.active !== false)
  return roundMoney(
    channelMatch?.price
    ?? channelMatch?.sale_price
    ?? product?.standard_price
    ?? product?.sale_price
    ?? 0,
  )
}

function buildRedemptionContext({ wallet, program, rule, orderTotal }) {
  const multiplier = Number(rule?.action_json?.multiplier || 1)
  const redemptionRate = Number(program?.redemption_rate || 0)
  const pointsBalance = Number(wallet?.current_points_balance || 0)
  const pointValue = redemptionRate * multiplier

  if (multiplier <= 0) throw new Error('Smoke rule multiplier <= 0.')
  if (redemptionRate <= 0) throw new Error('Smoke program redemption_rate <= 0.')
  if (pointsBalance <= 0) throw new Error('Smoke wallet puan bakiyesi <= 0.')
  if (orderTotal <= 0) throw new Error('Smoke order total <= 0.')
  if (pointValue <= 0) throw new Error('Smoke point value <= 0.')

  const maxPointsForOrder = truncatePoints(orderTotal / pointValue)
  const usedPoints = roundPoints(Math.min(pointsBalance, maxPointsForOrder))
  const discountAmount = roundMoney(Math.min(orderTotal, usedPoints * pointValue))

  if (usedPoints <= 0 || discountAmount <= 0) {
    throw new Error('Smoke redemption context indirim uretemedi.')
  }

  return {
    usedPoints,
    redemptionRate,
    multiplier,
    computedDiscount: discountAmount,
    discountAmount,
    walletId: wallet.id,
    walletStatus: 'ready',
    walletProgramId: wallet.program_id,
    walletType: wallet.wallet_type || 'points',
    pointsBalance: roundPoints(pointsBalance),
    redemptionUnit: '1 puan = redemption_rate TL',
  }
}

function buildLoyaltySnapshot({ campaign, rule, salesChannel, orderTotal, redemptionContext }) {
  const offerLabel = `${redemptionContext.usedPoints.toLocaleString('tr-TR')} puan ile ${formatAmount(redemptionContext.discountAmount)} indirim`
  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    applicationMode: normalizeText(campaign?.audience_json?.applicationMode) || 'auto',
    actionType: 'points_redeem_multiplier',
    sourceRuleId: rule.id,
    offerLabel,
    discountType: 'amount',
    discountValue: redemptionContext.discountAmount,
    discountAmount: redemptionContext.discountAmount,
    selectedCouponCode: null,
    usedPoints: redemptionContext.usedPoints,
    redemptionRate: redemptionContext.redemptionRate,
    multiplier: redemptionContext.multiplier,
    redemptionContext,
    appliedActionsSummary: [
      {
        type: 'points_redeem_multiplier',
        value: redemptionContext.multiplier,
        usedPoints: redemptionContext.usedPoints,
        redemptionRate: redemptionContext.redemptionRate,
        discountAmount: redemptionContext.discountAmount,
        label: `${redemptionContext.multiplier}x puan harcama`,
      },
    ],
    decisionContext: {
      campaignId: campaign.id,
      campaignName: campaign.name,
      ruleId: rule.id,
      ruleActionType: 'points_redeem_multiplier',
      conditionKey: 'always',
      runtimeChannel: FIXTURE.runtimeChannel,
      orderTotal,
      customerId: FIXTURE.customerId,
      redemptionContext,
      resolvedAt: new Date().toISOString(),
      salesChannelId: salesChannel.id,
      salesChannelName: salesChannel.name,
    },
  }
}

function serializeJson(value) {
  return JSON.stringify(value ?? null)
}

async function insertSmokeSale(client, context) {
  const { customer, product, salesChannel, campaign, rule, wallet, program } = context
  const saleDate = new Date().toISOString()
  const localId = `SMOKE-LYT-REDEEM-${Date.now()}`
  const unitPrice = resolveUnitPrice(product, salesChannel.id)
  const qty = 1
  const lineTotalBeforeDiscount = roundMoney(unitPrice * qty)
  const redemptionContext = buildRedemptionContext({
    wallet,
    program,
    rule,
    orderTotal: lineTotalBeforeDiscount,
  })
  const loyaltySnapshot = buildLoyaltySnapshot({
    campaign,
    rule,
    salesChannel,
    orderTotal: lineTotalBeforeDiscount,
    redemptionContext,
  })

  const discountAmount = roundMoney(redemptionContext.discountAmount)
  const totalAfterDiscount = roundMoney(Math.max(0, lineTotalBeforeDiscount - discountAmount))

  const saleInsert = await client.query(
    `
      insert into sales (
        local_id,
        sale_datetime,
        source,
        source_channel_type,
        sales_channel_id,
        sales_channel_name,
        customer_id,
        customer_name,
        cashier_name,
        order_note,
        currency_code,
        gross_total_before_discount,
        discount_type,
        discount_value,
        discount_amount,
        gross_total_after_discount,
        net_total_after_discount,
        cost_total,
        payment_total,
        change_amount,
        status,
        kds_status,
        kiosk_service_type,
        kiosk_table_number,
        pickup_called,
        loyalty_campaign_id,
        loyalty_campaign_name,
        loyalty_application_mode,
        loyalty_action_type,
        loyalty_offer_label,
        loyalty_source_rule_id,
        loyalty_selected_coupon_code,
        loyalty_applied_actions_json,
        loyalty_decision_context_json
      )
      values (
        $1, $2, 'call_center', 'call_center', $3, $4, $5, $6, $7, $8, 'TRY',
        $9, 'amount', $10, $11, $12, $12, 0, $12, 0, 'completed', 'pending',
        'takeaway', 'Gel-al', false,
        $13, $14, $15, $16, $17, $18, null, $19::jsonb, $20::jsonb
      )
      returning id
    `,
    [
      localId,
      saleDate,
      salesChannel.id,
      salesChannel.name,
      customer.id,
      customer.ad_soyad || FIXTURE.customerName,
      'Çağrı Merkezi',
      'Smoke loyalty redemption scripted sale',
      lineTotalBeforeDiscount,
      discountAmount,
      discountAmount,
      totalAfterDiscount,
      loyaltySnapshot.campaignId,
      loyaltySnapshot.campaignName,
      loyaltySnapshot.applicationMode,
      loyaltySnapshot.actionType,
      loyaltySnapshot.offerLabel,
      loyaltySnapshot.sourceRuleId,
      serializeJson(loyaltySnapshot.appliedActionsSummary),
      serializeJson(loyaltySnapshot.decisionContext),
    ],
  )

  const saleId = saleInsert.rows[0]?.id
  if (!saleId) throw new Error('Smoke sale olusturulamadi.')

  await client.query(
    `
      insert into sale_lines (
        sale_id,
        line_no,
        product_id,
        product_name,
        product_sku,
        top_category_id,
        sub_category_id,
        qty,
        unit_gross_before_discount,
        line_gross_before_discount,
        discount_allocated_amount,
        unit_gross_after_discount,
        line_gross_after_discount,
        tax_rate,
        line_net_after_discount,
        unit_cost_snapshot,
        line_cost_total,
        sales_channel_id,
        sales_channel_name,
        sale_datetime,
        loyalty_campaign_id,
        loyalty_campaign_name,
        loyalty_application_mode,
        loyalty_action_type,
        loyalty_offer_label,
        loyalty_source_rule_id,
        loyalty_selected_coupon_code,
        loyalty_applied_actions_json,
        loyalty_decision_context_json,
        loyalty_discount_allocated_amount
      )
      values (
        $1, 1, $2, $3, $4, $5, $5, 1,
        $6, $6, $7, $8, $8, 0, $8, 0, 0,
        $9, $10, $11,
        $12, $13, $14, $15, $16, $17, null, $18::jsonb, $19::jsonb, $7
      )
    `,
    [
      saleId,
      product.id,
      product.name,
      product.sku,
      product.sale_cat_l5 || product.sale_cat_l4 || product.sale_cat_l3 || product.sale_cat_l2 || product.sale_cat_l1 || null,
      lineTotalBeforeDiscount,
      discountAmount,
      totalAfterDiscount,
      salesChannel.id,
      salesChannel.name,
      saleDate,
      loyaltySnapshot.campaignId,
      loyaltySnapshot.campaignName,
      loyaltySnapshot.applicationMode,
      loyaltySnapshot.actionType,
      loyaltySnapshot.offerLabel,
      loyaltySnapshot.sourceRuleId,
      serializeJson(loyaltySnapshot.appliedActionsSummary),
      serializeJson(loyaltySnapshot.decisionContext),
    ],
  )

  await client.query(
    `
      insert into sale_payments (
        sale_id,
        payment_method,
        payment_method_label,
        amount
      )
      values ($1, $2, $3, $4)
    `,
    [
      saleId,
      FIXTURE.paymentMethod,
      'Nakit',
      totalAfterDiscount,
    ],
  )

  return {
    saleId,
    saleDate,
    localId,
    loyaltySnapshot,
    totals: {
      beforeDiscount: lineTotalBeforeDiscount,
      discountAmount,
      afterDiscount: totalAfterDiscount,
    },
  }
}

async function readExistingSaleBurnTransaction(client, customerId, saleId) {
  const { rows } = await client.query(
    `
      select id, source_ref_id, wallet_id, campaign_id, transaction_type, points_delta
      from loyalty_transactions
      where customer_id = $1
        and source_ref_id = $2
        and transaction_type = 'burn'
      order by occurred_at desc, created_at desc, id desc
      limit 1
    `,
    [customerId, saleId],
  )
  return rows[0] || null
}

async function readExistingSalePointsTransaction(client, customerId, saleId) {
  const burnTx = await readExistingSaleBurnTransaction(client, customerId, saleId)
  if (burnTx) return burnTx

  for (const txType of ['earn', 'campaign_bonus']) {
    const { rows } = await client.query(
      `
        select id, source_ref_id, wallet_id, campaign_id, transaction_type, points_delta
        from loyalty_transactions
        where customer_id = $1
          and source_ref_id = $2
          and transaction_type = $3
        order by occurred_at desc, created_at desc, id desc
        limit 1
      `,
      [customerId, saleId, txType],
    )
    if (rows[0]) return rows[0]
  }

  return null
}

async function postTransaction(client, {
  wallet,
  customerId,
  programId,
  campaignId,
  saleId,
  saleHeader,
  pointsDelta,
  metadata = {},
}) {
  const before = roundPoints(wallet.current_points_balance || 0)
  if (pointsDelta < 0 && Math.abs(pointsDelta) > before) {
    throw new Error(`Yetersiz puan bakiyesi: ${Math.abs(pointsDelta)} puan, mevcut bakiye ${before}.`)
  }

  const after = roundPoints(before + pointsDelta)
  const occurredAt = saleHeader.sale_datetime
  const monetaryAmount = roundMoney(saleHeader.gross_total_after_discount || saleHeader.payment_total || 0)
  const transactionType = pointsDelta < 0 ? 'burn' : 'earn'

  const { rows } = await client.query(
    `
      insert into loyalty_transactions (
        wallet_id,
        customer_id,
        program_id,
        campaign_id,
        tier_id,
        wallet_type,
        transaction_type,
        status,
        source_channel,
        source_type,
        source_ref_id,
        source_ref_no,
        branch_id,
        branch_name,
        points_delta,
        points_before,
        points_after,
        monetary_amount,
        occurred_at,
        note,
        metadata
      )
      values (
        $1, $2, $3, $4, null, 'points', $5, 'posted', 'call_center', 'sale', $6, $7,
        null, null, $8, $9, $10, $11, $12, $13, $14::jsonb
      )
      returning id
    `,
    [
      wallet.id,
      customerId,
      programId,
      campaignId,
      transactionType,
      saleId,
      saleHeader.local_id,
      pointsDelta,
      before,
      after,
      monetaryAmount,
      occurredAt,
      saleHeader.loyalty_offer_label || 'Smoke Loyalty Puan Kullanimi',
      serializeJson(metadata),
    ],
  )

  const lifetimeBurnedPoints = pointsDelta < 0
    ? roundPoints(Number(wallet.lifetime_burned_points || 0) + Math.abs(pointsDelta))
    : roundPoints(wallet.lifetime_burned_points || 0)
  const lifetimeEarnedPoints = pointsDelta > 0
    ? roundPoints(Number(wallet.lifetime_earned_points || 0) + pointsDelta)
    : roundPoints(wallet.lifetime_earned_points || 0)

  await client.query(
    `
      update loyalty_wallets
      set
        current_points_balance = $2,
        lifetime_earned_points = $3,
        lifetime_burned_points = $4,
        last_transaction_at = $5,
        updated_at = $5
      where id = $1
    `,
    [
      wallet.id,
      after,
      lifetimeEarnedPoints,
      lifetimeBurnedPoints,
      new Date().toISOString(),
    ],
  )

  return {
    transactionId: rows[0]?.id || null,
    pointsBefore: before,
    pointsAfter: after,
  }
}

async function postCampaignRedemption(client, {
  campaignId,
  customerId,
  walletId,
  transactionId,
  saleId,
  redeemedValue,
  metadata = {},
}) {
  const existing = await client.query(
    `
      select id
      from loyalty_campaign_redemptions
      where customer_id = $1
        and campaign_id = $2
        and source_ref_id = $3
      limit 1
    `,
    [customerId, campaignId, saleId],
  )
  if (existing.rows[0]?.id) return existing.rows[0]

  const { rows } = await client.query(
    `
      insert into loyalty_campaign_redemptions (
        campaign_id,
        customer_id,
        wallet_id,
        transaction_id,
        redemption_status,
        source_channel,
        source_ref_id,
        redeemed_value,
        redeemed_at,
        metadata
      )
      values (
        $1, $2, $3, $4, 'applied', 'call_center', $5, $6, $7, $8::jsonb
      )
      returning id
    `,
    [
      campaignId,
      customerId,
      walletId,
      transactionId,
      saleId,
      redeemedValue,
      new Date().toISOString(),
      serializeJson(metadata),
    ],
  )
  return rows[0] || null
}

async function postSmokeLoyaltyValueLedger(client, {
  saleId,
  saleHeader,
  campaignId,
  programId,
  customerId,
  customerName,
  wallet,
  redemptionContext,
}) {
  const existingPointsTx = await readExistingSalePointsTransaction(client, customerId, saleId)
  if (existingPointsTx?.id) {
    const redemption = await postCampaignRedemption(client, {
      campaignId,
      customerId,
      walletId: existingPointsTx.wallet_id || null,
      transactionId: existingPointsTx.id,
      saleId,
      redeemedValue: saleHeader.discount_amount,
      metadata: {
        customerName,
        offerLabel: saleHeader.loyalty_offer_label || '',
        redemptionContext,
        idempotentReadback: true,
        anchorTransactionType: existingPointsTx.transaction_type,
      },
    })
    return {
      skipped: true,
      reason: 'already_posted',
      transactionId: existingPointsTx.id,
      transactionType: existingPointsTx.transaction_type,
      redemptionId: redemption?.id || null,
    }
  }

  const transaction = await postTransaction(client, {
    wallet,
    customerId,
    programId,
    campaignId,
    saleId,
    saleHeader,
    pointsDelta: -roundPoints(redemptionContext.usedPoints),
    metadata: {
      actionType: 'points_redeem_multiplier',
      actionSource: 'smoke-script',
      customerName,
      saleLineCount: 1,
      redemptionContext,
    },
  })

  const redemption = await postCampaignRedemption(client, {
    campaignId,
    customerId,
    walletId: wallet.id,
    transactionId: transaction.transactionId,
    saleId,
    redeemedValue: saleHeader.discount_amount,
    metadata: {
      customerName,
      offerLabel: saleHeader.loyalty_offer_label || '',
      redemptionContext,
    },
  })

  return {
    skipped: false,
    transactionId: transaction.transactionId,
    redemptionId: redemption?.id || null,
    pointsBefore: transaction.pointsBefore,
    pointsAfter: transaction.pointsAfter,
  }
}

async function main() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
  })
  await client.connect()

  try {
    logStep('Fixture baglami okunuyor')
    const context = await loadFixtureContext(client)

    logStep('Smoke sale olusturuluyor')
    const smokeSale = await insertSmokeSale(client, context)

    logStep('Loyalty burn ledger ilk kez post ediliyor')
    const firstPass = await postSmokeLoyaltyValueLedger(client, {
      saleId: smokeSale.saleId,
      saleHeader: {
        local_id: smokeSale.localId,
        sale_datetime: smokeSale.saleDate,
        gross_total_after_discount: smokeSale.totals.afterDiscount,
        payment_total: smokeSale.totals.afterDiscount,
        discount_amount: smokeSale.totals.discountAmount,
        loyalty_offer_label: smokeSale.loyaltySnapshot.offerLabel,
      },
      campaignId: context.campaign.id,
      programId: context.program.id,
      customerId: context.customer.id,
      customerName: context.customer.ad_soyad || FIXTURE.customerName,
      wallet: context.wallet,
      redemptionContext: smokeSale.loyaltySnapshot.redemptionContext,
    })

    logStep('Ayni sale icin idempotency ikinci kez deneniyor')
    const refreshedWalletResult = await client.query(
      `select id, current_points_balance, lifetime_earned_points, lifetime_burned_points
       from loyalty_wallets
       where id = $1
       limit 1`,
      [context.wallet.id],
    )
    const refreshedWallet = refreshedWalletResult.rows[0] || context.wallet

    const secondPass = await postSmokeLoyaltyValueLedger(client, {
      saleId: smokeSale.saleId,
      saleHeader: {
        local_id: smokeSale.localId,
        sale_datetime: smokeSale.saleDate,
        gross_total_after_discount: smokeSale.totals.afterDiscount,
        payment_total: smokeSale.totals.afterDiscount,
        discount_amount: smokeSale.totals.discountAmount,
        loyalty_offer_label: smokeSale.loyaltySnapshot.offerLabel,
      },
      campaignId: context.campaign.id,
      programId: context.program.id,
      customerId: context.customer.id,
      customerName: context.customer.ad_soyad || FIXTURE.customerName,
      wallet: refreshedWallet,
      redemptionContext: smokeSale.loyaltySnapshot.redemptionContext,
    })

    console.log(JSON.stringify({
      saleId: smokeSale.saleId,
      localId: smokeSale.localId,
      offerLabel: smokeSale.loyaltySnapshot.offerLabel,
      totals: smokeSale.totals,
      redemptionContext: smokeSale.loyaltySnapshot.redemptionContext,
      firstPass,
      secondPass,
      verifyCommand: `npm.cmd run verify:loyalty-redemption-smoke -- --sale-id ${smokeSale.saleId}`,
    }, null, 2))
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error('\n[loyalty-redemption-smoke-run] Hata:', error?.message || error)
  process.exit(1)
})
