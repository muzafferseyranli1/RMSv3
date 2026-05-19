import pg from 'pg'

const { Client } = pg

const DATABASE_URL = process.env.DATABASE_URL || ''
const DATABASE_SSL = process.env.DATABASE_SSL === 'true'

if (!DATABASE_URL) {
  console.error('DATABASE_URL zorunludur. Loyalty redemption smoke verify icin Railway Postgres baglantisini env ile verin.')
  process.exit(1)
}

function readArg(name) {
  const index = process.argv.indexOf(name)
  if (index === -1) return ''
  return String(process.argv[index + 1] || '').trim()
}

const saleId = readArg('--sale-id')
const campaignId = readArg('--campaign-id') || 'SMOKE-LOYALTY-REDEEM-CAMPAIGN-20260519'
const customerId = readArg('--customer-id') || '7f1d2e3a-8b6f-4d1a-9b6e-202605190001'

if (!saleId) {
  console.error('Kullanim: node scripts/verify-loyalty-redemption-smoke.mjs --sale-id <SALE_ID> [--campaign-id <ID>] [--customer-id <UUID>]')
  process.exit(1)
}

function fail(message, details = null) {
  console.error(`\n[loyalty-redemption-smoke-verify] FAIL: ${message}`)
  if (details) console.error(JSON.stringify(details, null, 2))
  process.exit(1)
}

function pass(summary) {
  console.log('\n[loyalty-redemption-smoke-verify] PASS')
  console.log(JSON.stringify(summary, null, 2))
}

async function loadSale(client) {
  const { rows } = await client.query(
    `
      select
        id,
        status,
        sale_datetime,
        gross_total_after_discount,
        net_total_after_discount,
        discount_amount,
        loyalty_campaign_id,
        loyalty_campaign_name,
        loyalty_action_type,
        loyalty_offer_label,
        loyalty_source_rule_id,
        loyalty_selected_coupon_code,
        loyalty_applied_actions_json,
        loyalty_decision_context_json
      from sales
      where id = $1
      limit 1
    `,
    [saleId],
  )
  return rows[0] || null
}

async function loadTransactions(client) {
  const { rows } = await client.query(
    `
      select
        id,
        wallet_id,
        customer_id,
        program_id,
        campaign_id,
        wallet_type,
        transaction_type,
        status,
        source_ref_id,
        points_delta,
        points_before,
        points_after,
        monetary_amount,
        occurred_at,
        metadata
      from loyalty_transactions
      where customer_id = $1
        and source_ref_id = $2
      order by occurred_at desc, created_at desc, id desc
    `,
    [customerId, saleId],
  )
  return rows
}

async function loadRedemption(client) {
  const { rows } = await client.query(
    `
      select
        id,
        campaign_id,
        customer_id,
        wallet_id,
        transaction_id,
        redemption_status,
        source_ref_id,
        redeemed_value,
        redeemed_at,
        metadata
      from loyalty_campaign_redemptions
      where customer_id = $1
        and source_ref_id = $2
        and campaign_id = $3
      order by redeemed_at desc, id desc
      limit 1
    `,
    [customerId, saleId, campaignId],
  )
  return rows[0] || null
}

async function loadWallet(client, walletId) {
  const { rows } = await client.query(
    `
      select
        id,
        customer_id,
        program_id,
        wallet_type,
        current_points_balance,
        lifetime_earned_points,
        lifetime_burned_points,
        updated_at,
        metadata
      from loyalty_wallets
      where id = $1
      limit 1
    `,
    [walletId],
  )
  return rows[0] || null
}

async function loadLatestPointsTxForWallet(client, walletId) {
  const { rows } = await client.query(
    `
      select id, transaction_type, points_after, occurred_at
      from loyalty_transactions
      where wallet_id = $1
        and wallet_type = 'points'
      order by occurred_at desc, created_at desc, id desc
      limit 1
    `,
    [walletId],
  )
  return rows[0] || null
}

async function main() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
  })
  await client.connect()

  try {
    const sale = await loadSale(client)
    if (!sale) fail('sales kaydi bulunamadi', { saleId })
    if (String(sale.loyalty_campaign_id || '') !== campaignId) {
      fail('sale loyalty campaign beklenen smoke campaign ile eslesmiyor', {
        saleId,
        expectedCampaignId: campaignId,
        actualCampaignId: sale.loyalty_campaign_id,
      })
    }
    if (String(sale.loyalty_action_type || '') !== 'points_redeem_multiplier') {
      fail('sale loyalty action type points_redeem_multiplier degil', {
        saleId,
        actualActionType: sale.loyalty_action_type,
      })
    }

    const transactions = await loadTransactions(client)
    const burnTransactions = transactions.filter(row => row.transaction_type === 'burn')
    if (burnTransactions.length !== 1) {
      fail('sale icin tekil burn transaction bekleniyordu', {
        saleId,
        burnCount: burnTransactions.length,
        transactionTypes: transactions.map(row => row.transaction_type),
      })
    }

    const burnTx = burnTransactions[0]
    if (Number(burnTx.points_delta || 0) >= 0) {
      fail('burn transaction negative points_delta tasimiyor', burnTx)
    }

    const computedAfter = Number(burnTx.points_before || 0) + Number(burnTx.points_delta || 0)
    if (Number(computedAfter.toFixed(2)) !== Number(Number(burnTx.points_after || 0).toFixed(2))) {
      fail('burn transaction points_before/after denklemi tutarsiz', {
        transactionId: burnTx.id,
        pointsBefore: burnTx.points_before,
        pointsDelta: burnTx.points_delta,
        pointsAfter: burnTx.points_after,
      })
    }

    const redemption = await loadRedemption(client)
    if (!redemption) {
      fail('loyalty_campaign_redemptions kaydi bulunamadi', { saleId, campaignId })
    }
    if (String(redemption.transaction_id || '') !== String(burnTx.id || '')) {
      fail('redemption kaydi burn transaction a bagli degil', {
        redemptionId: redemption.id,
        redemptionTransactionId: redemption.transaction_id,
        burnTransactionId: burnTx.id,
      })
    }
    if (String(redemption.wallet_id || '') !== String(burnTx.wallet_id || '')) {
      fail('redemption wallet_id burn wallet_id ile eslesmiyor', {
        redemptionId: redemption.id,
        redemptionWalletId: redemption.wallet_id,
        burnWalletId: burnTx.wallet_id,
      })
    }
    if (Number(redemption.redeemed_value || 0) <= 0) {
      fail('redemption redeemed_value pozitif degil', redemption)
    }

    const frequencyStepTx = transactions.find(row => row.transaction_type === 'frequency_step')
    if (frequencyStepTx && String(frequencyStepTx.id) === String(redemption.transaction_id)) {
      fail('redemption kaydi frequency_step transaction ina baglanmis', {
        redemptionId: redemption.id,
        transactionId: redemption.transaction_id,
      })
    }

    const wallet = await loadWallet(client, burnTx.wallet_id)
    if (!wallet) fail('burn wallet kaydi okunamadi', { walletId: burnTx.wallet_id })

    if (Number(wallet.lifetime_burned_points || 0) < Math.abs(Number(burnTx.points_delta || 0))) {
      fail('wallet lifetime_burned_points burn miktarindan dusuk', {
        walletId: wallet.id,
        lifetimeBurnedPoints: wallet.lifetime_burned_points,
        burnPoints: Math.abs(Number(burnTx.points_delta || 0)),
      })
    }

    const latestWalletTx = await loadLatestPointsTxForWallet(client, wallet.id)
    const latestWalletMatchesBurn = String(latestWalletTx?.id || '') === String(burnTx.id || '')
    if (latestWalletMatchesBurn) {
      if (Number(Number(wallet.current_points_balance || 0).toFixed(2)) !== Number(Number(burnTx.points_after || 0).toFixed(2))) {
        fail('wallet current_points_balance burn sonrası bakiye ile uyumsuz', {
          walletId: wallet.id,
          walletBalance: wallet.current_points_balance,
          burnPointsAfter: burnTx.points_after,
        })
      }
    }

    const summary = {
      saleId,
      campaignId,
      customerId,
      sale: {
        loyaltyCampaignName: sale.loyalty_campaign_name,
        loyaltyActionType: sale.loyalty_action_type,
        loyaltyOfferLabel: sale.loyalty_offer_label,
        discountAmount: sale.discount_amount,
        appliedActionsStored: Boolean(sale.loyalty_applied_actions_json),
        decisionContextStored: Boolean(sale.loyalty_decision_context_json),
      },
      burnTransaction: {
        id: burnTx.id,
        walletId: burnTx.wallet_id,
        pointsDelta: burnTx.points_delta,
        pointsBefore: burnTx.points_before,
        pointsAfter: burnTx.points_after,
      },
      redemption: {
        id: redemption.id,
        redeemedValue: redemption.redeemed_value,
        transactionId: redemption.transaction_id,
      },
      wallet: {
        id: wallet.id,
        currentPointsBalance: wallet.current_points_balance,
        lifetimeBurnedPoints: wallet.lifetime_burned_points,
      },
      frequencyStepPresent: Boolean(frequencyStepTx),
      latestWalletMatchesBurn,
    }

    pass(summary)
  } finally {
    await client.end()
  }
}

main().catch(error => {
  fail(error?.message || 'Beklenmeyen hata')
})
