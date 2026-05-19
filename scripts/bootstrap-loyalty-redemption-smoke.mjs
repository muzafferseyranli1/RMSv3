import pg from 'pg'

const { Client } = pg

const DATABASE_URL = process.env.DATABASE_URL || ''
const DATABASE_SSL = process.env.DATABASE_SSL === 'true'
const argv = new Set(process.argv.slice(2))
const verifyOnly = argv.has('--verify-only')

if (!DATABASE_URL) {
  console.error('DATABASE_URL zorunludur. Loyalty redemption smoke fixture icin Railway Postgres baglantisini env ile verin.')
  process.exit(1)
}

const FIXTURE = {
  prefix: 'SMOKE-LOYALTY-REDEEM-20260519',
  programId: 'SMOKE-LOYALTY-REDEEM-PROGRAM-20260519',
  campaignId: 'SMOKE-LOYALTY-REDEEM-CAMPAIGN-20260519',
  ruleId: 'SMOKE-LOYALTY-REDEEM-RULE-20260519',
  customerId: '7f1d2e3a-8b6f-4d1a-9b6e-202605190001',
  loyaltyMemberNo: 'SMOKE-LYT-20260519',
  externalRef: 'SMOKE-LOYALTY-REDEEM-CUSTOMER',
  customerName: 'Smoke Loyalty Redeem Musterisi',
  phone: '0555 202 60 51',
  normalizedPhone: '905552026051',
  email: 'smoke.loyalty.redeem@suitablerms.local',
  programName: 'Smoke Loyalty Redemption Program',
  campaignName: 'Smoke Loyalty Puan Kullanimi',
  targetPointsBalance: 100,
  redemptionRate: 0.10,
  multiplier: 1,
}

function logStep(message) {
  console.log(`\n[loyalty-redemption-smoke] ${message}`)
}

function asJson(value) {
  return JSON.stringify(value ?? {})
}

async function upsertCustomer(client) {
  const now = new Date().toISOString()
  await client.query(
    `
      insert into musteriler (
        id,
        ad_soyad,
        cari,
        musteri_tipi,
        email,
        telefon,
        telefon_ulke,
        normalized_phone,
        normalized_email,
        loyalty_member_no,
        loyalty_status,
        loyalty_enrolled_at,
        sms_opt_in,
        email_opt_in,
        push_opt_in,
        acquisition_source,
        signup_channel,
        external_customer_ref,
        metadata,
        created_at,
        updated_at,
        deleted_at
      )
      values (
        $1, $2, false, 'gercek', $3, $4, '+90', $5, $3, $6, 'active', $7,
        true, true, true, 'call_center', 'call_center', $8, $9::jsonb, $7, $7, null
      )
      on conflict (id) do update
      set
        ad_soyad = excluded.ad_soyad,
        email = excluded.email,
        telefon = excluded.telefon,
        normalized_phone = excluded.normalized_phone,
        normalized_email = excluded.normalized_email,
        loyalty_member_no = excluded.loyalty_member_no,
        loyalty_status = excluded.loyalty_status,
        loyalty_enrolled_at = excluded.loyalty_enrolled_at,
        external_customer_ref = excluded.external_customer_ref,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at,
        deleted_at = null
    `,
    [
      FIXTURE.customerId,
      FIXTURE.customerName,
      FIXTURE.email,
      FIXTURE.phone,
      FIXTURE.normalizedPhone,
      FIXTURE.loyaltyMemberNo,
      now,
      FIXTURE.externalRef,
      asJson({
        source: 'loyalty-redemption-smoke-bootstrap',
        fixturePrefix: FIXTURE.prefix,
      }),
    ],
  )
}

async function upsertProgram(client) {
  const now = new Date().toISOString()
  await client.query(
    `
      insert into loyalty_programs (
        id,
        scope_type,
        scope_branch_id,
        scope_branch_name,
        name,
        description,
        program_type,
        program_family,
        earn_model,
        redemption_model,
        redemption_rate,
        active,
        chain_wide_active,
        notify_balance_change,
        notification_channel,
        webhook_enabled,
        frequency_goal,
        frequency_reset_period,
        frequency_reward_json,
        metadata,
        created_at,
        updated_at,
        deleted_at
      )
      values (
        $1,
        'global',
        null,
        null,
        $2,
        $3,
        'mixed',
        'points',
        'points_per_amount',
        'points_to_discount',
        $4,
        true,
        false,
        false,
        'push_or_sms',
        false,
        0,
        'never',
        '{}'::jsonb,
        $5::jsonb,
        $6,
        $6,
        null
      )
      on conflict (id) do update
      set
        name = excluded.name,
        description = excluded.description,
        redemption_model = excluded.redemption_model,
        redemption_rate = excluded.redemption_rate,
        active = true,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at,
        deleted_at = null
    `,
    [
      FIXTURE.programId,
      FIXTURE.programName,
      'Canli smoke icin points_redeem_multiplier fixture programi.',
      FIXTURE.redemptionRate,
      asJson({
        source: 'loyalty-redemption-smoke-bootstrap',
        fixturePrefix: FIXTURE.prefix,
        smoke: true,
      }),
      now,
    ],
  )
}

async function upsertCampaign(client) {
  const now = new Date().toISOString()
  await client.query(
    `
      insert into loyalty_campaigns (
        id,
        program_id,
        scope_type,
        scope_branch_id,
        scope_branch_name,
        name,
        code,
        description,
        campaign_type,
        trigger_type,
        reward_type,
        reward_value,
        priority,
        stackable,
        active,
        status,
        starts_at,
        ends_at,
        channel_targets,
        audience_json,
        conditions_json,
        actions_json,
        budget_json,
        limits_json,
        metadata,
        created_at,
        updated_at,
        deleted_at
      )
      values (
        $1,
        $2,
        'global',
        null,
        null,
        $3,
        $4,
        $5,
        'special_discount',
        'manual',
        'discount_amount',
        $6,
        1,
        false,
        true,
        'active',
        now() - interval '1 day',
        null,
        '["call_center"]'::jsonb,
        $7::jsonb,
        '[]'::jsonb,
        $8::jsonb,
        '{}'::jsonb,
        '{}'::jsonb,
        $9::jsonb,
        $10,
        $10,
        null
      )
      on conflict (id) do update
      set
        program_id = excluded.program_id,
        name = excluded.name,
        code = excluded.code,
        description = excluded.description,
        reward_value = excluded.reward_value,
        active = true,
        status = 'active',
        channel_targets = excluded.channel_targets,
        audience_json = excluded.audience_json,
        actions_json = excluded.actions_json,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at,
        deleted_at = null
    `,
    [
      FIXTURE.campaignId,
      FIXTURE.programId,
      FIXTURE.campaignName,
      FIXTURE.prefix,
      'Call Center loyalty smoke icin puan kullanim kampanyasi.',
      FIXTURE.multiplier,
      asJson({
        audienceType: 'all',
        applicationMode: 'auto',
      }),
      asJson([
        {
          actionType: 'points_redeem_multiplier',
          actionConfig: { multiplier: FIXTURE.multiplier },
        },
      ]),
      asJson({
        source: 'loyalty-redemption-smoke-bootstrap',
        fixturePrefix: FIXTURE.prefix,
        applicationMode: 'auto',
      }),
      now,
    ],
  )
}

async function upsertRule(client) {
  const now = new Date().toISOString()
  await client.query(
    `
      insert into loyalty_campaign_rules (
        id,
        campaign_id,
        rule_scope,
        condition_key,
        operator,
        threshold_value,
        period_window,
        action_type,
        action_summary,
        condition_json,
        action_json,
        stop_processing,
        active,
        sort_order,
        created_at,
        updated_at,
        deleted_at
      )
      values (
        $1,
        $2,
        'applicable',
        'always',
        'gte',
        0,
        'all_time',
        'points_redeem_multiplier',
        'Smoke puan kullanimi',
        '{}'::jsonb,
        $3::jsonb,
        false,
        true,
        10,
        $4,
        $4,
        null
      )
      on conflict (id) do update
      set
        campaign_id = excluded.campaign_id,
        action_type = excluded.action_type,
        action_summary = excluded.action_summary,
        condition_json = excluded.condition_json,
        action_json = excluded.action_json,
        active = true,
        updated_at = excluded.updated_at,
        deleted_at = null
    `,
    [
      FIXTURE.ruleId,
      FIXTURE.campaignId,
      asJson({
        multiplier: FIXTURE.multiplier,
      }),
      now,
    ],
  )
}

async function findWallet(client) {
  const { rows } = await client.query(
    `
      select id
      from loyalty_wallets
      where customer_id = $1
        and coalesce(program_id, '') = coalesce($2, '')
        and wallet_type = 'points'
      limit 1
    `,
    [FIXTURE.customerId, FIXTURE.programId],
  )
  return rows[0] || null
}

async function ensureWallet(client) {
  const now = new Date().toISOString()
  const wallet = await findWallet(client)
  if (wallet?.id) {
    await client.query(
      `
        update loyalty_wallets
        set
          current_points_balance = $2,
          lifetime_earned_points = greatest(lifetime_earned_points, $2),
          updated_at = $3,
          metadata = coalesce(metadata, '{}'::jsonb) || $4::jsonb
        where id = $1
      `,
      [
        wallet.id,
        FIXTURE.targetPointsBalance,
        now,
        asJson({
          smokeFixture: true,
          smokeSeedBalance: FIXTURE.targetPointsBalance,
          smokeSeededAt: now,
        }),
      ],
    )
    return wallet.id
  }

  const { rows } = await client.query(
    `
      insert into loyalty_wallets (
        customer_id,
        program_id,
        wallet_type,
        current_points_balance,
        lifetime_earned_points,
        lifetime_burned_points,
        lifetime_expired_points,
        last_transaction_at,
        created_at,
        updated_at,
        metadata
      )
      values (
        $1,
        $2,
        'points',
        $3,
        $3,
        0,
        0,
        null,
        $4,
        $4,
        $5::jsonb
      )
      returning id
    `,
    [
      FIXTURE.customerId,
      FIXTURE.programId,
      FIXTURE.targetPointsBalance,
      now,
      asJson({
        smokeFixture: true,
        smokeSeedBalance: FIXTURE.targetPointsBalance,
        smokeSeededAt: now,
      }),
    ],
  )

  return rows[0]?.id || null
}

async function loadSampleSaleItem(client) {
  const { rows } = await client.query(
    `
      select id, name
      from sale_items
      where deleted_at is null
        and active = true
        and sale_status = true
      order by name
      limit 1
    `,
  )
  return rows[0] || null
}

async function loadFixtureAudit(client) {
  const [program, campaign, rule, customer, wallet, saleItem] = await Promise.all([
    client.query(`select id, name, redemption_rate, active from loyalty_programs where id = $1 limit 1`, [FIXTURE.programId]),
    client.query(`select id, name, status, active, program_id from loyalty_campaigns where id = $1 limit 1`, [FIXTURE.campaignId]),
    client.query(`select id, campaign_id, action_type, active from loyalty_campaign_rules where id = $1 limit 1`, [FIXTURE.ruleId]),
    client.query(`select id, ad_soyad, telefon, external_customer_ref, loyalty_status from musteriler where id = $1 limit 1`, [FIXTURE.customerId]),
    client.query(`select id, current_points_balance, lifetime_earned_points, lifetime_burned_points from loyalty_wallets where customer_id = $1 and coalesce(program_id, '') = coalesce($2, '') and wallet_type = 'points' limit 1`, [FIXTURE.customerId, FIXTURE.programId]),
    loadSampleSaleItem(client),
  ])

  return {
    program: program.rows[0] || null,
    campaign: campaign.rows[0] || null,
    rule: rule.rows[0] || null,
    customer: customer.rows[0] || null,
    wallet: wallet.rows[0] || null,
    saleItem,
  }
}

function printAudit(audit) {
  logStep('Fixture audit')
  console.log(JSON.stringify(audit, null, 2))
}

function printManualSteps(audit) {
  const saleItemHint = audit.saleItem?.name
    ? `Sepete test icin "${audit.saleItem.name}" urununu veya uygun baska bir satis urununu ekleyin.`
    : 'Sepete test icin herhangi bir satis urununu ekleyin.'

  logStep('Call Center smoke adimlari')
  console.log(`1. Call Center ekraninda musteri olarak "${FIXTURE.customerName}" kaydini secin.`)
  console.log(`   Telefon: ${FIXTURE.phone} | Ref: ${FIXTURE.externalRef}`)
  console.log(`2. ${saleItemHint}`)
  console.log(`3. Loyalty alaninda "${FIXTURE.campaignName}" kampanyasini secin veya otomatik uygulandigini dogrulayin.`)
  console.log('4. Siparisi tamamlayin ve olusan saleId degerini not edin.')
  console.log('5. Ardindan su komutu calistirin:')
  console.log(`   node scripts/verify-loyalty-redemption-smoke.mjs --sale-id <SALE_ID>`)
}

async function main() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
  })

  await client.connect()

  try {
    if (!verifyOnly) {
      logStep('Smoke fixture kayitlari olusturuluyor / guncelleniyor')
      await upsertCustomer(client)
      await upsertProgram(client)
      await upsertCampaign(client)
      await upsertRule(client)
      await ensureWallet(client)
    }

    const audit = await loadFixtureAudit(client)
    printAudit(audit)

    if (!verifyOnly) {
      printManualSteps(audit)
    }
  } finally {
    await client.end()
  }
}

main().catch(error => {
  console.error('\n[loyalty-redemption-smoke] Hata:', error?.message || error)
  process.exit(1)
})
