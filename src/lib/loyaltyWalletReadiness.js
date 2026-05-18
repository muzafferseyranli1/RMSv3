import { db } from '@/lib/db'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeText(value) {
  return String(value || '').trim()
}

function toUuidOrNull(value) {
  const text = normalizeText(value)
  return UUID_PATTERN.test(text) ? text : null
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function roundPoints(value) {
  return Math.round((toNumber(value, 0) + Number.EPSILON) * 100) / 100
}

function resolveCustomerId(customer = {}, explicitCustomerId = '') {
  return toUuidOrNull(
    explicitCustomerId
    || customer.customerId
    || customer.id
    || customer.customer_id
  )
}

export function buildUnsupportedWalletReadiness(reason, extra = {}) {
  return {
    supported: false,
    ok: false,
    status: reason,
    reason,
    customerId: null,
    programId: null,
    walletType: 'points',
    walletId: null,
    pointsBalance: null,
    balanceKnown: false,
    source: 'loyalty_wallets',
    errorMessage: '',
    ...extra,
  }
}

export async function resolveLoyaltyWalletBalance({
  customer = {},
  customerId = '',
  programId = '',
  walletType = 'points',
  missingWalletBalance = 0,
} = {}) {
  const normalizedCustomerId = resolveCustomerId(customer, customerId)
  const normalizedProgramId = normalizeText(programId || customer.programId || customer.program_id)
  const normalizedWalletType = normalizeText(walletType) || 'points'

  if (!normalizedCustomerId) {
    return buildUnsupportedWalletReadiness('missing_customer', {
      walletType: normalizedWalletType,
      reason: 'Musteri baglami yok; wallet bakiyesi okunamaz.',
    })
  }

  try {
    // Adım 1: programId varsa direkt o program wallet'ini bul
    if (normalizedProgramId) {
      const programQuery = db
        .from('loyalty_wallets')
        .select('id,customer_id,program_id,wallet_type,current_points_balance,lifetime_earned_points,lifetime_burned_points,lifetime_expired_points,last_transaction_at')
        .eq('customer_id', normalizedCustomerId)
        .eq('wallet_type', normalizedWalletType)
        .eq('program_id', normalizedProgramId)
        .limit(1)

      const { data: programData, error: programError } = await programQuery
      if (programError) throw programError

      const programWallet = Array.isArray(programData) ? programData[0] || null : programData || null
      if (programWallet?.id) {
        return {
          supported: true,
          ok: true,
          status: 'ready',
          reason: 'Program wallet bakiyesi canli DB kaydindan okundu.',
          customerId: normalizedCustomerId,
          programId: programWallet.program_id || normalizedProgramId,
          walletType: programWallet.wallet_type || normalizedWalletType,
          walletId: programWallet.id,
          wallet: programWallet,
          pointsBalance: roundPoints(programWallet.current_points_balance),
          balanceKnown: true,
          source: 'loyalty_wallets',
          errorMessage: '',
        }
      }
    }

    // Adım 2: programId yoksa veya yukarıda bulunamadıysa, önce program_id IS NULL wallet'ı dene
    const nullProgramQuery = db
      .from('loyalty_wallets')
      .select('id,customer_id,program_id,wallet_type,current_points_balance,lifetime_earned_points,lifetime_burned_points,lifetime_expired_points,last_transaction_at')
      .eq('customer_id', normalizedCustomerId)
      .eq('wallet_type', normalizedWalletType)
      .is('program_id', null)
      .limit(1)

    const { data: nullProgramData, error: nullProgramError } = await nullProgramQuery
    if (nullProgramError) throw nullProgramError

    const nullProgramWallet = Array.isArray(nullProgramData) ? nullProgramData[0] || null : nullProgramData || null

    // Eğer null program wallet varsa kullan
    if (nullProgramWallet?.id) {
      return {
        supported: true,
        ok: true,
        status: 'ready',
        reason: 'Wallet bakiyesi canli DB kaydindan okundu (program_id NULL).',
        customerId: normalizedCustomerId,
        programId: null,
        walletType: nullProgramWallet.wallet_type || normalizedWalletType,
        walletId: nullProgramWallet.id,
        wallet: nullProgramWallet,
        pointsBalance: roundPoints(nullProgramWallet.current_points_balance),
        balanceKnown: true,
        source: 'loyalty_wallets',
        errorMessage: '',
      }
    }

    // Adım 3: Fallback - hiçbiri bulunamadıysa, müşterinin TÜM wallet'larını al ve tek wallet varsa kullan
    const allWalletsQuery = db
      .from('loyalty_wallets')
      .select('id,customer_id,program_id,wallet_type,current_points_balance,lifetime_earned_points,lifetime_burned_points,lifetime_expired_points,last_transaction_at')
      .eq('customer_id', normalizedCustomerId)
      .eq('wallet_type', normalizedWalletType)
      .order('last_transaction_at', { ascending: false })

    const { data: allWalletsData, error: allWalletsError } = await allWalletsQuery
    if (allWalletsError) throw allWalletsError

    const allWallets = Array.isArray(allWalletsData) ? allWalletsData : []
    const activeWallets = (allWallets || []).filter(w => w && w.id)

    // Birden fazla wallet varsa ve programId verilmediyse ambiguous durumu döndür
    if (activeWallets.length > 1) {
      return {
        supported: true,
        ok: true,
        status: 'ambiguous_program_context',
        reason: 'Birden fazla wallet var; hangi program wallet\'inin kullanilacagi belirsiz.',
        customerId: normalizedCustomerId,
        programId: null,
        walletType: normalizedWalletType,
        walletId: null,
        wallet: null,
        pointsBalance: null,
        balanceKnown: false,
        source: 'loyalty_wallets',
        errorMessage: '',
        availableWallets: activeWallets.map(w => ({
          walletId: w.id,
          programId: w.program_id,
          balance: w.current_points_balance,
        })),
      }
    }

    // Tek wallet varsa onu kullan
    if (activeWallets.length === 1) {
      const singleWallet = activeWallets[0]
      return {
        supported: true,
        ok: true,
        status: 'ready',
        reason: 'Tek wallet bakiyesi canli DB kaydindan okundu (fallback).',
        customerId: normalizedCustomerId,
        programId: singleWallet.program_id || null,
        walletType: singleWallet.wallet_type || normalizedWalletType,
        walletId: singleWallet.id,
        wallet: singleWallet,
        pointsBalance: roundPoints(singleWallet.current_points_balance),
        balanceKnown: true,
        source: 'loyalty_wallets',
        errorMessage: '',
      }
    }

    // Hiç wallet yoksa
    return {
      supported: true,
      ok: true,
      status: 'wallet_missing',
      reason: 'Wallet kaydi bulunamadi; mevcut bakiye 0 kabul edilir.',
      customerId: normalizedCustomerId,
      programId: normalizedProgramId || null,
      walletType: normalizedWalletType,
      walletId: null,
      wallet: null,
      pointsBalance: roundPoints(missingWalletBalance),
      balanceKnown: true,
      source: 'loyalty_wallets',
      errorMessage: '',
    }
  } catch (error) {
    return buildUnsupportedWalletReadiness('lookup_failed', {
      customerId: normalizedCustomerId,
      programId: normalizedProgramId || null,
      walletType: normalizedWalletType,
      reason: 'Wallet bakiyesi okunamadi; burn/redemption uygulanamaz.',
      errorMessage: error?.message || String(error || ''),
    })
  }
}

export async function resolveLoyaltyProgramRedemptionModel({
  program = null,
  programId = '',
} = {}) {
  const normalizedProgramId = normalizeText(programId || program?.id || program?.programId)
  if (!normalizedProgramId) {
    return {
      supported: false,
      ok: false,
      status: 'missing_program',
      reason: 'Program baglami yok; redemption rate okunamaz.',
      programId: null,
      redemptionModel: '',
      redemptionRate: null,
      unit: '1 puan = redemption_rate TL',
      errorMessage: '',
    }
  }

  if (program && Object.prototype.hasOwnProperty.call(program, 'redemptionRate')) {
    const redemptionRate = toNumber(program.redemptionRate, 0)
    return {
      supported: redemptionRate > 0,
      ok: true,
      status: redemptionRate > 0 ? 'ready' : 'rate_not_configured',
      reason: redemptionRate > 0
        ? 'Program redemption rate hazir.'
        : 'Program redemption rate 0; puan harcama kapali kabul edilir.',
      programId: normalizedProgramId,
      redemptionModel: normalizeText(program.redemptionModel || 'points_to_discount'),
      redemptionRate,
      unit: '1 puan = redemption_rate TL',
      errorMessage: '',
    }
  }

  try {
    const { data, error } = await db
      .from('loyalty_programs')
      .select('id,redemption_model,redemption_rate')
      .eq('id', normalizedProgramId)
      .limit(1)

    if (error) throw error
    const row = Array.isArray(data) ? data[0] || null : data || null
    const redemptionRate = toNumber(row?.redemption_rate, 0)

    return {
      supported: Boolean(row?.id) && redemptionRate > 0,
      ok: Boolean(row?.id),
      status: !row?.id ? 'program_not_found' : (redemptionRate > 0 ? 'ready' : 'rate_not_configured'),
      reason: !row?.id
        ? 'Program kaydi bulunamadi.'
        : (redemptionRate > 0
          ? 'Program redemption rate canli DB kaydindan okundu.'
          : 'Program redemption rate 0; puan harcama kapali kabul edilir.'),
      programId: row?.id || normalizedProgramId,
      redemptionModel: normalizeText(row?.redemption_model || 'points_to_discount'),
      redemptionRate,
      unit: '1 puan = redemption_rate TL',
      errorMessage: '',
    }
  } catch (error) {
    return {
      supported: false,
      ok: false,
      status: 'lookup_failed',
      reason: 'Program redemption modeli okunamadi; burn/redemption uygulanamaz.',
      programId: normalizedProgramId,
      redemptionModel: '',
      redemptionRate: null,
      unit: '1 puan = redemption_rate TL',
      errorMessage: error?.message || String(error || ''),
    }
  }
}
