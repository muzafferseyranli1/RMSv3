import { useEffect, useMemo, useState } from 'react'
import { loadCustomerAppConfig, getDefaultAppConfig } from '@/lib/customerMobileAppConfig'
import {
  buildCustomerMobileViewModel,
  bindCouponToCustomer,
  formatMobileDate,
  formatMobileMoney,
  formatMobileNumber,
  formatMobileRelativeDateLabel,
  loadCustomerMobileSnapshot,
  loadCustomerRoster,
  pickDefaultCustomer,
  getActiveReferralPrograms,
  checkReferralEligibility,
  generateReferralCode,
  validateReferralCode,
  applyReferralCode,
  getReferrerCodes,
  registerCustomer,
  updateCustomerCampaignSelections,
  updateCouponActivationStatus,
} from '@/lib/mobileCustomerApp'
import {
  clearStoredMobileCustomer,
  normalizeStoredMobileCustomer,
  readStoredMobileCustomer,
  searchMobileCustomers,
  writeStoredMobileCustomer,
} from '@/lib/mobileCustomerIdentity'
import {
  linkCustomerToPosLoyaltySession,
  loadCustomerLoyaltyCategoryIds,
  readPosLoyaltyLinkSession,
  selectCampaignInPosLoyaltySession,
} from '@/lib/posCustomerLink'
import {
  linkCustomerToKioskSession,
  readKioskLoyaltyLinkSession,
  selectCampaignInKioskLoyaltySession,
} from '@/lib/kioskSettings'

const TAB_ITEMS = [
  { key: 'home', label: 'Ana Sayfa', icon: 'fa-house' },
  { key: 'card', label: 'Kartım', icon: 'fa-id-card' },
  { key: 'coupons', label: 'Kuponlar', icon: 'fa-ticket' },
  { key: 'campaigns', label: 'Kampanyalar', icon: 'fa-bullhorn' },
  { key: 'account', label: 'Hesabım', icon: 'fa-user' },
]

const COUPON_TEMPLATES = [
  {
    gradient: 'linear-gradient(135deg, #fbcfe8 0%, #f472b6 100%)',
    textColor: '#4c0519',
    subColor: '#9d174d',
    stubBg: 'rgba(255,255,255,0.25)',
    accentColor: '#be185d',
    icon: 'fa-spa',
    pattern: 'radial-gradient(circle at 20% 30%, rgba(253, 244, 245, 0.4) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(253, 244, 245, 0.3) 0%, transparent 50%)'
  },
  {
    gradient: 'linear-gradient(135deg, #fef08a 0%, #d97706 100%)',
    textColor: '#451a03',
    subColor: '#78350f',
    stubBg: 'rgba(255,255,255,0.25)',
    accentColor: '#b45309',
    icon: 'fa-crown',
    pattern: 'radial-gradient(circle at 10% 20%, rgba(254, 253, 237, 0.4) 0%, transparent 60%)'
  },
  {
    gradient: 'linear-gradient(135deg, #a7f3d0 0%, #059669 100%)',
    textColor: '#064e3b',
    subColor: '#065f46',
    stubBg: 'rgba(255,255,255,0.25)',
    accentColor: '#047857',
    icon: 'fa-leaf',
    pattern: 'radial-gradient(circle at 50% 50%, rgba(209, 250, 229, 0.15) 0%, transparent 70%)'
  },
  {
    gradient: 'linear-gradient(135deg, #ec4899 0%, #3b82f6 100%)',
    textColor: '#ffffff',
    subColor: '#f1f5f9',
    stubBg: 'rgba(255,255,255,0.18)',
    accentColor: '#fdf2f8',
    icon: 'fa-bolt',
    pattern: 'radial-gradient(circle at 90% 10%, rgba(255, 255, 255, 0.25) 0%, transparent 40%)'
  },
  {
    gradient: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
    textColor: '#ffffff',
    subColor: '#f1f5f9',
    stubBg: 'rgba(255,255,255,0.18)',
    accentColor: '#ecfdf5',
    icon: 'fa-gem',
    pattern: 'radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.2) 0%, transparent 50%)'
  },
  {
    gradient: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
    textColor: '#fef08a',
    subColor: '#e2e8f0',
    stubBg: 'rgba(255,255,255,0.08)',
    accentColor: '#ca8a04',
    icon: 'fa-star',
    pattern: 'radial-gradient(circle at 50% 50%, rgba(254, 240, 138, 0.05) 0%, transparent 70%)'
  },
  {
    gradient: 'linear-gradient(135deg, #93c5fd 0%, #1d4ed8 100%)',
    textColor: '#ffffff',
    subColor: '#f1f5f9',
    stubBg: 'rgba(255,255,255,0.18)',
    accentColor: '#eff6ff',
    icon: 'fa-gift',
    pattern: 'radial-gradient(circle at 10% 90%, rgba(255, 255, 255, 0.15) 0%, transparent 40%)'
  },
  {
    gradient: 'linear-gradient(135deg, #fde047 0%, #dc2626 100%)',
    textColor: '#ffffff',
    subColor: '#fef2f2',
    stubBg: 'rgba(255,255,255,0.2)',
    accentColor: '#fef3c7',
    icon: 'fa-fire',
    pattern: 'radial-gradient(circle at 30% 80%, rgba(254, 243, 199, 0.3) 0%, transparent 55%)'
  },
  {
    gradient: 'linear-gradient(135deg, #a855f7 0%, #ec4899 50%, #f43f5e 100%)',
    textColor: '#ffffff',
    subColor: '#fdf2f8',
    stubBg: 'rgba(255,255,255,0.15)',
    accentColor: '#fae8ff',
    icon: 'fa-wand-magic-sparkles',
    pattern: 'radial-gradient(circle at 50% 10%, rgba(255, 255, 255, 0.2) 0%, transparent 40%)'
  },
  {
    gradient: 'linear-gradient(135deg, #e2e8f0 0%, #64748b 100%)',
    textColor: '#0f172a',
    subColor: '#334155',
    stubBg: 'rgba(255,255,255,0.3)',
    accentColor: '#1e293b',
    icon: 'fa-ticket',
    pattern: 'linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px) 0 0 / 10px 10px'
  }
]

const ACCOUNT_VIEWS = [
  { key: 'activity', label: 'Puan ve Hareketler' },
  { key: 'tier', label: 'Seviye / Tier' },
  { key: 'profile', label: 'Profil' },
]

function cardStyle(background = '#fff', border = 'rgba(148,163,184,.16)') {
  return {
    borderRadius: 20,
    border: `1px solid ${border}`,
    background,
    boxShadow: '0 16px 36px rgba(15,23,42,.06)',
  }
}

function badgeStyle(background, color) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    borderRadius: 999,
    background,
    color,
    fontSize: '.72rem',
    fontWeight: 800,
  }
}

function getCouponStatusMeta(status) {
  switch (status) {
    case 'reserved': return { label: 'Ayrildi', background: '#eff6ff', color: '#1d4ed8' }
    case 'used': return { label: 'Kullanildi', background: '#f1f5f9', color: '#475569' }
    case 'expired': return { label: 'Suresi doldu', background: '#fff7ed', color: '#c2410c' }
    case 'cancelled': return { label: 'Iptal', background: '#fef2f2', color: '#b91c1c' }
    default: return { label: 'Kullanima hazir', background: '#ecfdf5', color: '#166534' }
  }
}

function getCampaignBucketLabel(bucket) {
  switch (bucket) {
    case 'personalized': return 'Sana ozel'
    case 'upcoming': return 'Yakinda'
    case 'ending': return 'Bitmek uzere'
    default: return 'Herkese acik'
  }
}

function getTransactionLabel(type) {
  switch (type) {
    case 'earn': return 'Puan kazanimi'
    case 'burn': return 'Puan kullanimi'
    case 'campaign_bonus': return 'Kampanya bonusu'
    case 'welcome_bonus': return 'Hos geldin bonusu'
    case 'birthday_bonus': return 'Dogum gunu bonusu'
    case 'frequency_reward': return 'Frekans odulu'
    case 'card_load': return 'Bakiye yukleme'
    case 'card_spend': return 'Bakiye harcama'
    default: return type || 'Sadakat hareketi'
  }
}

function getTransactionValue(item) {
  if (item.wallet_type === 'stored_value') {
    const amount = Number(item.monetary_amount || 0)
    return {
      text: `${amount > 0 ? '+' : ''}${formatMobileMoney(amount)} TL`,
      color: amount > 0 ? '#166534' : amount < 0 ? '#b91c1c' : '#475569',
    }
  }
  const delta = Number(item.points_delta || 0)
  return {
    text: `${delta > 0 ? '+' : ''}${formatMobileNumber(delta)} puan`,
    color: delta > 0 ? '#166534' : delta < 0 ? '#b91c1c' : '#475569',
  }
}

function buildQrMatrix(seed) {
  const chars = String(seed || 'RMSLOYALTY').split('')
  return Array.from({ length: 11 }, (_, row) => (
    Array.from({ length: 11 }, (_, col) => {
      const char = chars[(row * 5 + col * 3) % chars.length] || 'R'
      const value = char.charCodeAt(0) + row * 13 + col * 17
      const finder = (
        (row < 3 && col < 3) ||
        (row < 3 && col > 7) ||
        (row > 7 && col < 3)
      )
      return finder || value % 4 <= 1
    })
  ))
}

function SummaryTile({ label, value, hint, color = '#0f172a' }) {
  return (
    <div style={{ ...cardStyle('#fff'), padding: 14, display: 'grid', gap: 6 }}>
      <div style={{ fontSize: '.72rem', color: '#64748b', fontWeight: 800 }}>{label}</div>
      <div style={{ fontSize: '1.1rem', color, fontWeight: 900 }}>{value}</div>
      {hint ? <div style={{ fontSize: '.72rem', color: '#94a3b8', lineHeight: 1.5 }}>{hint}</div> : null}
    </div>
  )
}

function resolveCampaignExclusivity(campaign) {
  const isStackable = campaign.stackable === true || 
                     campaign.stackable === 1 || 
                     campaign.metadata?.stackable === true || 
                     campaign.metadata?.stackMode === 'stackable';
  const group = String(
    campaign.metadata?.conflictGroupId || 
    campaign.exclusionGroup || 
    campaign.metadata?.exclusionGroup || 
    ''
  ).trim();

  return {
    id: String(campaign.id),
    stackable: isStackable,
    exclusionGroup: group || '__global__',
    name: campaign.name || 'Kampanya'
  }
}

function resolveCouponExclusivity(coupon, campaigns = []) {
  const associatedCampaign = campaigns.find(camp => {
    const rules = [
      ...(Array.isArray(camp.applicableRules) ? camp.applicableRules : []),
      ...(Array.isArray(camp.rules) ? camp.rules : []),
    ]
    return rules.some(rule => {
      const conditions = Array.isArray(rule.conditions) ? rule.conditions : []
      const matchesCondition = conditions.some(cond => {
        if (cond.conditionKey !== 'coupon_present') return false
        const cfg = cond.conditionConfig || cond.config || {}
        const ids = Array.isArray(cfg.seriesIds) ? cfg.seriesIds : []
        return ids.some(id => String(id) === String(coupon.series_id))
      })
      const singleKey = rule.conditionKey || ''
      const singleCfg = rule.conditionConfig || rule.condition_json || {}
      const singleIds = Array.isArray(singleCfg.seriesIds) ? singleCfg.seriesIds : []
      const matchesSingle = singleKey === 'coupon_present' && singleIds.some(id => String(id) === String(coupon.series_id))
      return matchesCondition || matchesSingle
    })
  }) || campaigns.find(camp => {
    const rules = [
      ...(Array.isArray(camp.applicableRules) ? camp.applicableRules : []),
      ...(Array.isArray(camp.rules) ? camp.rules : []),
    ]
    return rules.some(rule => {
      const config = rule.action_json || rule.actionConfig || {}
      if (String(config.couponSeriesId || '') === String(coupon.series_id) || String(config.seriesId || '') === String(coupon.series_id)) return true
      const actions = Array.isArray(rule.actions) ? rule.actions : []
      return actions.some(act => {
        const ac = act.actionConfig || act.action_json || {}
        return String(ac.couponSeriesId || '') === String(coupon.series_id) || String(ac.seriesId || '') === String(coupon.series_id)
      })
    })
  }) || campaigns.find(camp => {
    const meta = camp.metadata || {}
    return String(meta.couponSeriesId) === String(coupon.series_id) || String(camp.id) === String(coupon.series_id)
  })

  const isStackable = associatedCampaign 
    ? (associatedCampaign.stackable === true || 
       associatedCampaign.stackable === 1 || 
       associatedCampaign.metadata?.stackable === true || 
       associatedCampaign.metadata?.stackMode === 'stackable')
    : false;

  const group = associatedCampaign 
    ? String(
        associatedCampaign.metadata?.conflictGroupId || 
        associatedCampaign.exclusionGroup || 
        associatedCampaign.metadata?.exclusionGroup || 
        ''
      ).trim()
    : '';

  return {
    id: String(coupon.id),
    stackable: isStackable,
    exclusionGroup: group || '__global__',
    name: associatedCampaign?.name || coupon.seriesName || 'Kupon'
  }
}

function CouponCard({ coupon, index = 0, campaigns = [], appConfig = null, active = false, onClick = null }) {
  const statusMeta = getCouponStatusMeta(coupon.status)

  // Find associated campaign to get name, description and image
  const associatedCampaign = useMemo(() => {
    if (!Array.isArray(campaigns)) return null
    // Önce coupon_present koşulunda bu kupon serisini kullanan kampanyayı bul
    const byCouponCondition = campaigns.find(camp => {
      const rules = [
        ...(Array.isArray(camp.applicableRules) ? camp.applicableRules : []),
        ...(Array.isArray(camp.rules) ? camp.rules : []),
      ]
      return rules.some(rule => {
        // Çoklu koşul yapısı — conditions dizisi
        const conditions = Array.isArray(rule.conditions) ? rule.conditions : []
        const matchesCondition = conditions.some(cond => {
          if (cond.conditionKey !== 'coupon_present') return false
          const cfg = cond.conditionConfig || cond.config || {}
          const ids = Array.isArray(cfg.seriesIds) ? cfg.seriesIds : []
          return ids.some(id => String(id) === String(coupon.series_id))
        })
        // Tekli koşul yapısı (eski format)
        const singleKey = rule.conditionKey || ''
        const singleCfg = rule.conditionConfig || rule.condition_json || {}
        const singleIds = Array.isArray(singleCfg.seriesIds) ? singleCfg.seriesIds : []
        const matchesSingle = singleKey === 'coupon_present' && singleIds.some(id => String(id) === String(coupon.series_id))
        return matchesCondition || matchesSingle
      })
    })
    if (byCouponCondition) return byCouponCondition
    // Fallback: action'da couponSeriesId eşleşmesi
    return campaigns.find(camp => {
      const rules = [
        ...(Array.isArray(camp.applicableRules) ? camp.applicableRules : []),
        ...(Array.isArray(camp.rules) ? camp.rules : []),
      ]
      return rules.some(rule => {
        const config = rule.action_json || rule.actionConfig || {}
        if (String(config.couponSeriesId || '') === String(coupon.series_id) || String(config.seriesId || '') === String(coupon.series_id)) return true
        // Çoklu eylem yapısı
        const actions = Array.isArray(rule.actions) ? rule.actions : []
        return actions.some(act => {
          const ac = act.actionConfig || act.action_json || {}
          return String(ac.couponSeriesId || '') === String(coupon.series_id) || String(ac.seriesId || '') === String(coupon.series_id)
        })
      })
    }) || campaigns.find(camp => {
      const meta = camp.metadata || {}
      return String(meta.couponSeriesId) === String(coupon.series_id) || String(camp.id) === String(coupon.series_id)
    })
  }, [campaigns, coupon.series_id])

  const campaignName = associatedCampaign?.name || coupon.seriesName || 'Sadakat Kuponu'
  const campaignExpiry = associatedCampaign?.endsAt || associatedCampaign?.ends_at || coupon.expiresAt || null
  const isPassive = !['available', 'reserved'].includes(coupon.status)
  const bodyBgColor = appConfig?.branding?.bodyBackgroundColor || '#f8fafc'

  // Kampanya wizard'dan kupon görseli
  const couponImageUrl = useMemo(() => {
    if (!associatedCampaign?.metadata) return null
    const meta = associatedCampaign.metadata
    if (meta.mobileCouponImage?.url) return meta.mobileCouponImage.url
    if (meta.campaignImage?.url) return meta.campaignImage.url
    const images = Array.isArray(meta.campaignImages) ? meta.campaignImages : []
    const primary = images.find(img => img.isPrimary)
    if (primary?.url) return primary.url
    if (images[0]?.url) return images[0].url
    return null
  }, [associatedCampaign])

  // ── Kampanya eylemlerinden fayda metnini çıkar ──
  const benefitDisplay = useMemo(() => {
    if (associatedCampaign) {
      const allRules = [
        ...(Array.isArray(associatedCampaign.applicableRules) ? associatedCampaign.applicableRules : []),
        ...(Array.isArray(associatedCampaign.rules) ? associatedCampaign.rules : []),
      ]
      for (const rule of allRules) {
        // Çoklu eylem yapısı (yeni format)
        const actions = Array.isArray(rule.actions) ? rule.actions : []
        for (const act of actions) {
          const aType = act.actionType || ''
          const aCfg = act.actionConfig || act.action_json || {}
          const result = extractBenefitFromAction(aType, aCfg)
          if (result) return result
        }
        // Tekli eylem yapısı (eski format)
        const actionType = rule.actionType || ''
        const actionCfg = rule.actionConfig || rule.action_json || {}
        const result = extractBenefitFromAction(actionType, actionCfg)
        if (result) return result
      }
    }
    // Fallback: coupon.benefitText
    const text = coupon.benefitText || ''
    if (text.includes('%')) {
      const match = text.match(/\d+/)
      return match ? `%${match[0]}` : '%50'
    } else if (text.toLowerCase().includes('tl') || text.includes('try') || text.match(/\d+/)) {
      const match = text.match(/\d+/)
      return match ? `${match[0]}TL` : '50TL'
    }
    return 'HEDİYE'
  }, [associatedCampaign, coupon.benefitText])

  // Bilet gövdesi renk haritası
  const SOLID_COLORS = [
    '#dc2626', // Kırmızı
    '#f5ba13', // Sarı/Turuncu
    '#0d8197', // Teal
    '#7c3aed', // Mor
    '#059669', // Yeşil
    '#ea580c', // Turuncu
  ]
  const solidBg = isPassive ? '#64748b' : (SOLID_COLORS[index % SOLID_COLORS.length])

  // Scallop boyutu
  const scR = 6
  const scD = scR * 2
  const scGap = 4
  const scStep = scD + scGap

  // Kampanya adı font boyutu — uzun isimlerde küçült
  const titleFontSize = campaignName.length > 20 ? '1.3rem' : campaignName.length > 12 ? '1.6rem' : '2rem'

  const isSelected = active || coupon.status === 'reserved'

  return (
    <div
      onClick={onClick}
      style={{
        borderRadius: 16,
        display: 'flex',
        minHeight: 130,
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#ffffff',
        cursor: 'pointer',
        border: isSelected ? '3px solid #22c55e' : '1px solid rgba(148,163,184,.14)',
        boxShadow: isSelected ? '0 0 16px rgba(34,197,94,0.45)' : '0 4px 10px rgba(0,0,0,.03)',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        transform: isSelected ? 'scale(1.02)' : 'none',
      }}
    >
      {isSelected && (
        <div style={{
          position: 'absolute',
          top: 7,
          left: 14,
          fontWeight: 900,
          fontSize: '0.58rem',
          color: '#fff',
          background: '#22c55e',
          padding: '2px 6px',
          borderRadius: 4,
          letterSpacing: '0.04em',
          zIndex: 3,
          display: 'flex',
          alignItems: 'center',
          gap: 3,
        }}>
          <i className="fa-solid fa-circle-check" /> AKTİF
        </div>
      )}
      {/* ── Sol Kenar Tırtık (scallop) ── */}
      <div style={{
        position: 'absolute',
        left: -(scR),
        top: 0,
        bottom: 0,
        width: scD,
        backgroundImage: `radial-gradient(circle at center, ${bodyBgColor} ${scR}px, transparent ${scR + 0.5}px)`,
        backgroundSize: `${scD}px ${scStep}px`,
        backgroundRepeat: 'repeat-y',
        backgroundPosition: `0 ${scGap / 2}px`,
        zIndex: 10,
      }} />

      {/* ── Sağ Kenar Tırtık (scallop) ── */}
      <div style={{
        position: 'absolute',
        right: -(scR),
        top: 0,
        bottom: 0,
        width: scD,
        backgroundImage: `radial-gradient(circle at center, ${bodyBgColor} ${scR}px, transparent ${scR + 0.5}px)`,
        backgroundSize: `${scD}px ${scStep}px`,
        backgroundRepeat: 'repeat-y',
        backgroundPosition: `0 ${scGap / 2}px`,
        zIndex: 10,
      }} />

      {/* ══════════ Sol Koçan (Beyaz Stub) ══════════ */}
      <div style={{
        width: 105,
        backgroundColor: isPassive ? '#f1f5f9' : '#ffffff',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
        position: 'relative',
        zIndex: 2,
        padding: '12px 0',
        overflow: 'hidden',
      }}>
        <div style={{
          transform: 'rotate(-90deg)',
          whiteSpace: 'nowrap',
          color: 'transparent',
          WebkitTextStroke: `1.5px ${solidBg}`,
          fontWeight: 800,
          fontFamily: 'sans-serif',
          fontSize: benefitDisplay === 'HEDİYE' ? '2.2rem' : benefitDisplay.length > 4 ? '3rem' : '3.8rem',
          letterSpacing: '0.02em',
          lineHeight: 1,
        }}>
          {benefitDisplay}
        </div>
      </div>

      {/* ── Dikey Kesikli Ayırıcı ── */}
      <div style={{
        width: 0,
        alignSelf: 'stretch',
        borderLeft: '2.5px dashed rgba(255,255,255,0.6)',
        zIndex: 3,
      }} />

      {/* ══════════ Sağ Gövde ══════════ */}
      <div style={{
        flex: 1,
        background: couponImageUrl
          ? `linear-gradient(135deg, ${solidBg}dd 0%, ${solidBg}bb 100%)`
          : solidBg,
        backgroundImage: couponImageUrl
          ? `linear-gradient(135deg, ${solidBg}cc 0%, ${solidBg}99 100%), url(${couponImageUrl})`
          : undefined,
        backgroundSize: couponImageUrl ? 'cover' : undefined,
        backgroundPosition: couponImageUrl ? 'center' : undefined,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '18px 20px',
        minWidth: 0,
        zIndex: 2,
        position: 'relative',
      }}>
        {/* Kupon kodu — sağ üst rozet */}
        <div style={{
          position: 'absolute',
          top: 7,
          right: 14,
          fontFamily: 'monospace',
          fontWeight: 900,
          fontSize: '0.62rem',
          color: '#fff',
          background: 'rgba(0,0,0,0.2)',
          padding: '2px 7px',
          borderRadius: 4,
          letterSpacing: '0.04em',
          zIndex: 3,
        }}>
          {coupon.code}
        </div>

        {/* ── Ana içerik: kampanya adı ── */}
        <div style={{
          fontFamily: '"Impact", "Arial Black", sans-serif',
          fontWeight: 900,
          fontSize: titleFontSize,
          lineHeight: 1.1,
          color: '#ffffff',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          textShadow: '0 2px 8px rgba(0,0,0,0.15)',
          textAlign: 'center',
          maxWidth: '95%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}>
          {campaignName}
        </div>

        {/* ── Geçerlilik — blok ── */}
        <div style={{
          marginTop: 8,
          fontSize: '0.64rem',
          color: '#ffffff',
          background: 'rgba(0,0,0,0.18)',
          padding: '4px 10px',
          borderRadius: 4,
          letterSpacing: '0.01em',
          fontWeight: 700,
          textAlign: 'center',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {campaignExpiry ? (
            `${formatMobileDate(campaignExpiry, { day: '2-digit', month: 'short', year: 'numeric' })} tarihine kadar geçerlidir`
          ) : (
            'Süresiz geçerlidir'
          )}
        </div>
      </div>
    </div>
  )
}

// Kampanya eyleminden fayda metni çıkarma yardımcı fonksiyonu
function extractBenefitFromAction(actionType, actionConfig) {
  const cfg = actionConfig || {}
  switch (actionType) {
    case 'order_discount': {
      const vt = cfg.valueType || ''
      if (vt === 'percent' || (!vt && cfg.percent > 0)) {
        const p = Number(cfg.percent || 0)
        if (p > 0) return `%${p}`
      }
      if (vt === 'amount' || (!vt && cfg.amount > 0)) {
        const a = Number(cfg.amount || 0)
        if (a > 0) return `${a}TL`
      }
      return null
    }
    case 'special_discount':
    case 'order_discount_amount': {
      const a = Number(cfg.amount || 0)
      return a > 0 ? `${a}TL` : null
    }
    case 'total_order_discount_percent':
    case 'discount_percent':
    case 'order_discount_percent': {
      const p = Number(cfg.percent || 0)
      return p > 0 ? `%${p}` : null
    }
    case 'product_pricing': {
      const items = Array.isArray(cfg.items) ? cfg.items : []
      for (const item of items) {
        const pt = item.pricingType || ''
        if (pt === 'discount_percent' && Number(item.value) > 0) return `%${Number(item.value)}`
        if ((pt === 'discount_amount' || pt === 'fixed_price') && Number(item.value) > 0) return `${Number(item.value)}TL`
      }
      return null
    }
    case 'free_products': {
      return 'HEDİYE'
    }
    case 'bonus_points': {
      const pts = Number(cfg.points || 0)
      return pts > 0 ? `${pts}P` : null
    }
    case 'points_percent_of_order': {
      const pct = Number(cfg.percent || 0)
      return pct > 0 ? `%${pct}P` : null
    }
    case 'points_earn_multiplier':
    case 'points_redeem_multiplier': {
      const m = Number(cfg.multiplier || 0)
      return m > 1 ? `x${m}` : null
    }
    case 'combo_bundle': {
      const pv = Number(cfg.priceValue || 0)
      return pv > 0 ? `${pv}TL` : 'KOMBO'
    }
    default:
      return null
  }
}

function CouponsScreen({ model, onAddCoupon, appConfig = null }) {
  const [couponCode, setCouponCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState({ text: '', type: '' })

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!couponCode.trim()) return
    setLoading(true)
    setMessage({ text: '', type: '' })
    try {
      await onAddCoupon(couponCode)
      setMessage({ text: 'Kupon hesabınıza başarıyla tanımlandı!', type: 'success' })
      setCouponCode('')
    } catch (err) {
      setMessage({ text: err.message || 'Kupon eklenirken bir hata oluştu.', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Kupon Ekleme Formu */}
      <form onSubmit={handleSubmit} style={{ ...cardStyle('#fff'), padding: 16, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value)}
            placeholder="Kupon kodu girin"
            style={{
              flex: 1,
              minHeight: 40,
              borderRadius: 12,
              border: '1px solid rgba(148,163,184,.22)',
              background: '#fff',
              color: '#0f172a',
              padding: '0 12px',
              fontSize: '0.82rem',
              fontWeight: 700,
              textTransform: 'uppercase'
            }}
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !couponCode.trim()}
            style={{
              minWidth: 80,
              minHeight: 40,
              borderRadius: 12,
              border: 'none',
              background: 'linear-gradient(135deg,#f97316,#ea580c)',
              color: '#fff',
              fontWeight: 900,
              cursor: loading || !couponCode.trim() ? 'not-allowed' : 'pointer',
              opacity: loading || !couponCode.trim() ? 0.6 : 1,
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6
            }}
          >
            {loading ? (
              <i className="fa-solid fa-spinner fa-spin" />
            ) : (
              <>
                <i className="fa-solid fa-plus" />
                Ekle
              </>
            )}
          </button>
        </div>
        {message.text && (
          <div style={{
            fontSize: '.74rem',
            fontWeight: 700,
            color: message.type === 'success' ? '#166534' : '#b91c1c',
            background: message.type === 'success' ? '#ecfdf5' : '#fef2f2',
            padding: '8px 12px',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}>
            <i className={message.type === 'success' ? 'fa-solid fa-circle-check' : 'fa-solid fa-triangle-exclamation'} />
            {message.text}
          </div>
        )}
      </form>

      {model.activeCoupons.length ? (
        <div style={{ display: 'grid', gap: 0 }}>
          {model.activeCoupons.map((coupon, idx) => (
            <div key={coupon.id}>
              {idx > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', margin: '6px 0', color: '#94a3b8' }}>
                  <div style={{ flex: 1, borderTop: '2px dashed rgba(148,163,184,.35)' }} />
                  <i
                    className="fa-solid fa-scissors"
                    style={{
                      marginLeft: 8,
                      fontSize: '0.85rem',
                      opacity: 0.55,
                      transform: 'rotate(0deg)',
                    }}
                  />
                </div>
              )}
              <CouponCard
                coupon={coupon}
                index={idx}
                campaigns={model.campaigns}
                appConfig={appConfig}
                active={coupon.status === 'reserved'}
                onClick={() => onToggleCoupon && onToggleCoupon(coupon.id)}
              />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ ...cardStyle('#fff'), padding: 14, color: '#64748b', fontSize: '.8rem' }}>
          Kullanılabilir aktif kuponunuz bulunmamaktadır.
        </div>
      )}
    </div>
  )
}

function CampaignCard({ campaign, model = null, active = false, onClick = null }) {
  // ── Damga Kampanyası Kontrolü ──
  const stampRule = useMemo(() => {
    const rules = [
      ...(Array.isArray(campaign.applicableRules) ? campaign.applicableRules : []),
      ...(Array.isArray(campaign.rules) ? campaign.rules : []),
    ]
    return rules.find(rule => {
      const isProductStamp = rule.conditionKey === 'period_product_quantity' && rule.conditionConfig?.isStampMode !== false
      const isOrderStamp = rule.conditionKey === 'period_order_count'
      return isProductStamp || isOrderStamp
    })
  }, [campaign])

  const isStampCampaign = !!stampRule

  // ── İlerleme Bilgilerini Oku ──
  const stampProgress = useMemo(() => {
    if (!isStampCampaign || !model) return null
    const progressRow = model.progressRows?.find(p => String(p.campaign_id) === String(campaign.id))
    const current = progressRow?.current_count || 0
    
    let target = progressRow?.target_count || 5 // default fallback
    if (!progressRow?.target_count && stampRule) {
      const cfg = stampRule.conditionConfig || stampRule.condition_json || {}
      target = cfg.quantity || cfg.count || cfg.value || target
    }
    
    const completedCycles = progressRow?.completed_cycles || 0
    return { current, target, completedCycles }
  }, [isStampCampaign, model, campaign.id, stampRule])

  if (isStampCampaign) {
    const renderStamps = () => {
      if (!stampProgress) return null
      const { current, target, completedCycles } = stampProgress
      const slots = []
      const isCoffee = campaign.name?.toLowerCase().includes('kahve') || campaign.description?.toLowerCase().includes('kahve')
      const iconClass = isCoffee ? 'fa-mug-hot' : 'fa-stamp'
      
      for (let i = 0; i < target; i++) {
        const isEarned = i < current
        slots.push(
          <div
            key={i}
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              border: isEarned ? 'none' : '2px dashed rgba(148,163,184,.35)',
              background: isEarned ? 'linear-gradient(135deg,#f97316,#ea580c)' : '#f8fafc',
              color: isEarned ? '#ffffff' : '#94a3b8',
              fontSize: '0.9rem',
              boxShadow: isEarned ? '0 4px 10px rgba(234,88,12,.25)' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            {isEarned ? (
              <i className={`fa-solid ${iconClass}`} />
            ) : (
              <span style={{ fontSize: '0.7rem', fontWeight: 800 }}>{i + 1}</span>
            )}
          </div>
        )
      }
      
      return (
        <div style={{
          display: 'grid',
          gap: 8,
          margin: '6px 0 10px 0',
          padding: '10px 12px',
          background: 'rgba(249,115,22,0.04)',
          borderRadius: 14,
          border: '1px solid rgba(249,115,22,0.08)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.76rem', fontWeight: 900, color: '#ea580c', letterSpacing: '0.01em' }}>
              KAZANILAN DAMGALAR ({current} / {target})
            </span>
            {completedCycles > 0 && (
              <span style={{
                fontSize: '0.65rem',
                fontWeight: 900,
                background: '#dcfce7',
                color: '#15803d',
                padding: '3px 8px',
                borderRadius: 20,
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}>
                <i className="fa-solid fa-gift" /> {completedCycles} Hediye
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '4px 0' }}>
            {slots}
          </div>
        </div>
      )
    }

    return (
      <div style={{ ...cardStyle('#fff'), padding: 14, display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontWeight: 900, color: '#0f172a' }}>{campaign.name || 'Kampanya'}</div>
            <div style={{ marginTop: 4, color: '#64748b', fontSize: '.78rem', lineHeight: 1.55 }}>
              {campaign.description || 'Sadakat programina bagli kampanya.'}
            </div>
          </div>
          <span style={badgeStyle(campaign.personalized ? '#fee2e2' : '#eff6ff', campaign.personalized ? '#be123c' : '#1d4ed8')}>
            {getCampaignBucketLabel(campaign.bucket)}
          </span>
        </div>

        {renderStamps()}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={badgeStyle('rgba(15,23,42,.06)', '#475569')}>
            <i className="fa-solid fa-store" />
            {campaign.mobileEligible ? 'Mobil uyumlu' : 'Kanal sinirli'}
          </span>
          <span style={badgeStyle('rgba(15,23,42,.06)', '#475569')}>
            <i className="fa-solid fa-clock" />
            {campaign.activeNow ? 'Aktif' : 'Planli'}
          </span>
        </div>
        <div style={{ color: '#64748b', fontSize: '.76rem' }}>
          Baslangic: {formatMobileDate(campaign.startsAt, { day: '2-digit', month: 'short' })} •
          Bitis: {formatMobileDate(campaign.endsAt, { day: '2-digit', month: 'short' })}
        </div>
      </div>
    )
  }

  // Premium Ticket Style for standard campaigns
  const benefitDisplay = useMemo(() => {
    const allRules = [
      ...(Array.isArray(campaign.applicableRules) ? campaign.applicableRules : []),
      ...(Array.isArray(campaign.rules) ? campaign.rules : []),
    ]
    for (const rule of allRules) {
      const actions = Array.isArray(rule.actions) ? rule.actions : []
      for (const act of actions) {
        const aType = act.actionType || ''
        const aCfg = act.actionConfig || act.action_json || {}
        const result = extractBenefitFromAction(aType, aCfg)
        if (result) return result
      }
      const actionType = rule.actionType || ''
      const actionCfg = rule.actionConfig || rule.action_json || {}
      const result = extractBenefitFromAction(actionType, actionCfg)
      if (result) return result
    }
    return 'FIRSAT'
  }, [campaign])

  const SOLID_COLORS = [
    '#059669', // Zümrüt Yeşili
    '#0d8197', // Çivit Mavisi (Teal)
    '#7c3aed', // Eflatun/Mor
    '#ea580c', // Turuncu
    '#dc2626', // Kırmızı
  ]
  const index = Math.abs(String(campaign.id).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0))
  const solidBg = active ? '#15803d' : SOLID_COLORS[index % SOLID_COLORS.length]
  const bodyBgColor = '#f8fafc'

  const scR = 6
  const scD = scR * 2
  const scGap = 4
  const scStep = scD + scGap

  const campaignName = campaign.name || 'Sadakat Kampanyası'
  const titleFontSize = campaignName.length > 20 ? '1.2rem' : campaignName.length > 12 ? '1.5rem' : '1.8rem'

  return (
    <div
      onClick={onClick}
      style={{
        borderRadius: 16,
        display: 'flex',
        minHeight: 120,
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#ffffff',
        cursor: 'pointer',
        border: active ? '3px solid #22c55e' : '1px solid rgba(148,163,184,.14)',
        boxShadow: active ? '0 0 16px rgba(34,197,94,0.45)' : '0 4px 10px rgba(0,0,0,.03)',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        transform: active ? 'scale(1.02)' : 'none',
      }}
    >
      {/* Sol Kenar Scallop */}
      <div style={{
        position: 'absolute',
        left: -(scR),
        top: 0,
        bottom: 0,
        width: scD,
        backgroundImage: `radial-gradient(circle at center, ${bodyBgColor} ${scR}px, transparent ${scR + 0.5}px)`,
        backgroundSize: `${scD}px ${scStep}px`,
        backgroundRepeat: 'repeat-y',
        backgroundPosition: `0 ${scGap / 2}px`,
        zIndex: 10,
      }} />

      {/* Sağ Kenar Scallop */}
      <div style={{
        position: 'absolute',
        right: -(scR),
        top: 0,
        bottom: 0,
        width: scD,
        backgroundImage: `radial-gradient(circle at center, ${bodyBgColor} ${scR}px, transparent ${scR + 0.5}px)`,
        backgroundSize: `${scD}px ${scStep}px`,
        backgroundRepeat: 'repeat-y',
        backgroundPosition: `0 ${scGap / 2}px`,
        zIndex: 10,
      }} />

      {/* Sol Koçan */}
      <div style={{
        width: 100,
        backgroundColor: active ? '#ecfdf5' : '#ffffff',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
        position: 'relative',
        zIndex: 2,
        padding: '12px 0',
        overflow: 'hidden',
      }}>
        <div style={{
          transform: 'rotate(-90deg)',
          whiteSpace: 'nowrap',
          color: 'transparent',
          WebkitTextStroke: `1.5px ${solidBg}`,
          fontWeight: 900,
          fontFamily: 'sans-serif',
          fontSize: benefitDisplay.length > 5 ? '2rem' : '2.8rem',
          letterSpacing: '0.02em',
          lineHeight: 1,
        }}>
          {benefitDisplay}
        </div>
      </div>

      {/* Dikey Kesikli Ayırıcı */}
      <div style={{
        width: 0,
        alignSelf: 'stretch',
        borderLeft: '2px dashed rgba(15,23,42,0.12)',
        zIndex: 3,
      }} />

      {/* Sağ Gövde */}
      <div style={{
        flex: 1,
        background: solidBg,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '14px 18px',
        minWidth: 0,
        zIndex: 2,
        position: 'relative',
      }}>
        {active && (
          <div style={{
            position: 'absolute',
            top: 8,
            right: 14,
            fontWeight: 900,
            fontSize: '0.62rem',
            color: '#fff',
            background: '#22c55e',
            padding: '2px 8px',
            borderRadius: 20,
            letterSpacing: '0.04em',
            zIndex: 3,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            boxShadow: '0 2px 8px rgba(34,197,94,0.3)',
          }}>
            <i className="fa-solid fa-circle-check" /> AKTİF
          </div>
        )}

        <div style={{
          fontFamily: '"Impact", "Arial Black", sans-serif',
          fontWeight: 900,
          fontSize: titleFontSize,
          lineHeight: 1.15,
          color: '#ffffff',
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
          textShadow: '0 2px 6px rgba(0,0,0,0.1)',
          maxWidth: '90%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}>
          {campaignName}
        </div>

        <div style={{
          marginTop: 6,
          fontSize: '0.72rem',
          color: 'rgba(255,255,255,0.85)',
          maxWidth: '95%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {campaign.description || 'Sadakat programına bağlı kampanya.'}
        </div>

        <div style={{
          marginTop: 8,
          fontSize: '0.62rem',
          color: '#ffffff',
          background: 'rgba(0,0,0,0.14)',
          padding: '3px 8px',
          borderRadius: 4,
          alignSelf: 'flex-start',
          fontWeight: 700,
        }}>
          {campaign.startsAt ? (
            `${formatMobileDate(campaign.startsAt, { day: '2-digit', month: 'short' })} - ${formatMobileDate(campaign.endsAt, { day: '2-digit', month: 'short' })}`
          ) : (
            'Süresiz geçerlidir'
          )}
        </div>
      </div>
    </div>
  )
}

function LinkSelectionPill({ active, label, meta, onClick, accent = '#fb7185' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        borderRadius: 16,
        border: `1px solid ${active ? `${accent}55` : 'rgba(148,163,184,.18)'}`,
        background: active ? `${accent}12` : '#fff',
        padding: '12px 12px',
        textAlign: 'left',
        display: 'grid',
        gap: 4,
        cursor: 'pointer',
      }}
    >
      <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '.8rem' }}>{label}</div>
      {meta ? <div style={{ color: '#64748b', fontSize: '.72rem', lineHeight: 1.5 }}>{meta}</div> : null}
    </button>
  )
}

function LinkBanner({
  sessionState,
  selectionState,
  onSelectCampaign,
  onSelectCoupon,
  onConnect,
}) {
  if (!sessionState?.session && !sessionState?.loading && !sessionState?.errorText) return null

  if (sessionState.loading) {
    return (
      <div style={{ ...cardStyle('rgba(255,255,255,.96)', 'rgba(148,163,184,.16)'), padding: 12, color: '#475569', fontSize: '.78rem' }}>
        <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />
        Baglanti oturumu okunuyor...
      </div>
    )
  }

  if (sessionState.errorText) {
    return (
      <div style={{ ...cardStyle('rgba(254,242,242,.96)', 'rgba(248,113,113,.24)'), padding: 12, color: '#991b1b', fontSize: '.78rem', lineHeight: 1.6 }}>
        {sessionState.errorText}
      </div>
    )
  }

  const session = sessionState.session
  const isKiosk = sessionState.channel === 'kiosk'
  const label = isKiosk
    ? (session.kioskStationName || 'Kiosk')
    : (session.registerLabel || 'POS')
  const linked = session.status === 'linked'
  const selectedCampaign = selectionState?.campaigns.find(item => String(item.id) === String(selectionState.selectedCampaignId || '')) || null
  const selectedCoupon = selectionState?.coupons.find(item => (
    String(item.code || '').toUpperCase() === String(selectionState.selectedCouponId || '').toUpperCase()
    || String(item.id || '') === String(selectionState.selectedCouponId || '')
  )) || null
  const expiresLabel = session?.expiresAt
    ? formatMobileDate(session.expiresAt, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })
    : '-'

  return (
    <div style={{ ...cardStyle(linked ? 'rgba(236,253,245,.96)' : 'rgba(255,247,237,.96)', linked ? 'rgba(34,197,94,.24)' : 'rgba(251,191,36,.24)'), padding: 14, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '.7rem', fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase', color: linked ? '#15803d' : '#c2410c' }}>
            {isKiosk ? 'Kiosk baglantisi' : 'POS baglantisi'}
          </div>
          <div style={{ marginTop: 4, fontWeight: 900, color: '#0f172a' }}>{label}</div>
          <div style={{ marginTop: 4, fontSize: '.76rem', color: '#64748b' }}>{session.branchName || 'Sube'}</div>
        </div>
        <span style={badgeStyle(linked ? '#dcfce7' : '#ffedd5', linked ? '#166534' : '#c2410c')}>
          {linked ? 'Tanitildi' : 'Bekliyor'}
        </span>
      </div>
      <div style={{ color: '#475569', fontSize: '.78rem', lineHeight: 1.6 }}>
        {sessionState.statusText || (
          linked
            ? 'Bu cihazdaki hesap oturuma tanitildi. Siparise kiosk ya da kasadan devam edebilirsiniz.'
            : 'Bu QR, kiosk veya POS tarafinda uretilir; kamera kullanmadan telefonunda acilir. Buradan hesabinizi tanitip hangi avantajla devam edeceginizi secebilirsiniz.'
        )}
      </div>
      {!linked ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ ...cardStyle('rgba(255,255,255,.82)', 'rgba(251,191,36,.16)'), padding: 12, display: 'grid', gap: 8 }}>
            <div style={{ fontWeight: 900, color: '#0f172a' }}>Oturum ozeti</div>
            <div style={{ display: 'grid', gap: 4, color: '#475569', fontSize: '.76rem', lineHeight: 1.55 }}>
              <div>Sube: <strong>{session.branchName || 'Sube'}</strong></div>
              <div>Hedef: <strong>{label}</strong></div>
              <div>Kanal: <strong>{isKiosk ? 'Kiosk' : 'POS / Kasa'}</strong></div>
              <div>Son gecerlilik: <strong>{expiresLabel}</strong></div>
            </div>
          </div>

          {selectionState?.campaigns?.length ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontWeight: 900, color: '#0f172a', fontSize: '.82rem' }}>Bu baglanti icin kampanya sec</div>
              <div style={{ color: '#64748b', fontSize: '.74rem', lineHeight: 1.55 }}>
                Secim zorunlu degil. Kiosk veya POS kamerayla QR okumaz; bu secim telefondan oturuma yazilir.
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <LinkSelectionPill
                  active={!selectionState.selectedCampaignId}
                  label="Kampanya secmeden devam et"
                  meta="Kasada veya kioskte genel uygunluk kurallari degerlendirilir."
                  onClick={() => onSelectCampaign('')}
                  accent="#f97316"
                />
                {selectionState.campaigns.slice(0, 4).map(campaign => (
                  <LinkSelectionPill
                    key={campaign.id}
                    active={String(selectionState.selectedCampaignId || '') === String(campaign.id)}
                    label={campaign.name || 'Kampanya'}
                    meta={`${campaign.personalized ? 'Sana ozel' : 'Genel'} • ${campaign.description || 'Siparis sirasinda uygulanabilir kampanya'}`}
                    onClick={() => onSelectCampaign(String(campaign.id))}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {selectionState?.coupons?.length ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontWeight: 900, color: '#0f172a', fontSize: '.82rem' }}>Kupon ekle</div>
              <div style={{ display: 'grid', gap: 8 }}>
                <LinkSelectionPill
                  active={!selectionState.selectedCouponId}
                  label="Kupon secmeden devam et"
                  meta="Kuponu sonra kasada veya kioskte ayrica kullanabilirsin."
                  onClick={() => onSelectCoupon('')}
                  accent="#ea580c"
                />
                {selectionState.coupons.slice(0, 4).map(coupon => (
                  <LinkSelectionPill
                    key={coupon.id}
                    active={
                      String(selectionState.selectedCouponId || '').toUpperCase() === String(coupon.code || '').toUpperCase()
                      || String(selectionState.selectedCouponId || '') === String(coupon.id || '')
                    }
                    label={`${coupon.seriesName} ${coupon.code ? `• ${coupon.code}` : ''}`}
                    meta={`${coupon.benefitText} • ${coupon.channelLabel}`}
                    onClick={() => onSelectCoupon(String(coupon.code || coupon.id || ''))}
                    accent="#ea580c"
                  />
                ))}
              </div>
            </div>
          ) : null}

          {(selectedCampaign || selectedCoupon) ? (
            <div style={{ ...cardStyle('rgba(255,255,255,.82)', 'rgba(251,191,36,.18)'), padding: 12, display: 'grid', gap: 6 }}>
              <div style={{ fontWeight: 900, color: '#0f172a', fontSize: '.8rem' }}>Bu oturuma yazilacak secim</div>
              <div style={{ color: '#475569', fontSize: '.76rem', lineHeight: 1.55 }}>
                {selectedCampaign ? `Kampanya: ${selectedCampaign.name || 'Kampanya'}` : 'Kampanya secilmedi'}
                <br />
                {selectedCoupon ? `Kupon: ${selectedCoupon.code || selectedCoupon.seriesName}` : 'Kupon secilmedi'}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {!linked ? (
        <button
          type="button"
          onClick={onConnect}
          disabled={sessionState.linking}
          style={{
            minHeight: 42,
            borderRadius: 14,
            border: 'none',
            background: 'linear-gradient(135deg,#f97316,#fb7185)',
            color: '#fff',
            fontWeight: 900,
            cursor: sessionState.linking ? 'wait' : 'pointer',
            opacity: sessionState.linking ? 0.7 : 1,
          }}
        >
          {sessionState.linking ? 'Hesap tanitiliyor...' : (isKiosk ? 'Kioska hesabimi tanit' : 'Kasaya hesabimi tanit')}
        </button>
      ) : null}
    </div>
  )
}

function MobileHomeDashboard({ model, appConfig, onNavigate, onOrderAction }) {
  const { branding, homeButtons } = appConfig
  const bgImage = branding.backgroundImageUrl
  const logo = branding.logoUrl
  const primaryColor = branding.primaryColor || '#be185d'
  const bodyBgColor = branding.bodyBackgroundColor || '#f8fafc'
  const bodyBgImage = branding.bodyBackgroundImageUrl

  const stampProgresses = useMemo(() => {
    if (!Array.isArray(model.campaigns)) return []
    const stampCamps = model.campaigns.filter(camp => {
      const rules = [
        ...(Array.isArray(camp.applicableRules) ? camp.applicableRules : []),
        ...(Array.isArray(camp.rules) ? camp.rules : []),
      ]
      return rules.some(rule => {
        const isProductStamp = rule.conditionKey === 'period_product_quantity' && rule.conditionConfig?.isStampMode !== false
        const isOrderStamp = rule.conditionKey === 'period_order_count'
        return isProductStamp || isOrderStamp
      })
    })

    return stampCamps.map(camp => {
      const progress = model.progressRows?.find(p => String(p.campaign_id) === String(camp.id))
      const current = progress?.current_count || 0
      
      let target = progress?.target_count || 5
      if (!progress?.target_count) {
        const rules = [
          ...(Array.isArray(camp.applicableRules) ? camp.applicableRules : []),
          ...(Array.isArray(camp.rules) ? camp.rules : []),
        ]
        const rule = rules.find(r => r.conditionKey === 'period_product_quantity' || r.conditionKey === 'period_order_count')
        if (rule) {
          const cfg = rule.conditionConfig || rule.condition_json || {}
          target = cfg.quantity || cfg.count || cfg.value || target
        }
      }
      return { current, target }
    })
  }, [model.campaigns, model.progressRows])

  const hasStamps = stampProgresses.length > 0
  const stampsDisplay = useMemo(() => {
    if (stampProgresses.length === 1) {
      return `${stampProgresses[0].current}/${stampProgresses[0].target}`
    }
    return stampProgresses.map(p => `${p.current}/${p.target}`).slice(0, 2).join(' | ') + (stampProgresses.length > 2 ? '...' : '')
  }, [stampProgresses])

  function handleButtonPress(btn) {
    switch (btn.type) {
      case 'phone':
        if (btn.config?.phoneNumber) window.open(`tel:${btn.config.phoneNumber}`, '_self')
        break
      case 'weblink':
        if (btn.config?.url) window.open(btn.config.url, '_blank')
        break
      case 'order':
        onOrderAction(btn)
        break
      case 'app_page':
        if (btn.config?.pageKey) onNavigate(btn.config.pageKey)
        break
      default:
        break
    }
  }

  return (
    <div style={{ display: 'grid', gap: 0 }}>
      {/* Hero area with background image, logo, welcome */}
      <div style={{
        position: 'relative',
        minHeight: 260,
        background: bgImage
          ? `linear-gradient(180deg, rgba(0,0,0,.45) 0%, rgba(0,0,0,.65) 100%), url(${bgImage}) center/cover no-repeat`
          : `linear-gradient(150deg, ${branding.headerGradient?.[0] || '#111827'} 0%, ${branding.headerGradient?.[1] || '#312e81'} 45%, ${branding.headerGradient?.[2] || '#f97316'} 100%)`,
        borderRadius: '0 0 28px 28px',
        padding: '20px 20px 24px',
        display: 'grid',
        gap: 12,
        alignContent: 'end',
        color: '#fff',
      }}>
        {/* Top row: points badge + QR icon */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'absolute', top: 16, left: 20, right: 20 }}>
          <div style={{
            display: 'flex', gap: 8, alignItems: 'center',
          }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 999,
              background: 'rgba(255,255,255,.18)', backdropFilter: 'blur(8px)',
              color: '#fff', fontSize: '.74rem', fontWeight: 800,
            }}>
              <i className="fa-solid fa-star" style={{ color: '#fbbf24' }} />
              {model.pointBalance > 0 ? (
                model.combinedRedeemMultiplier > 1 ? (
                  `${model.pointBalance} Puan (Bugün ${model.pointBalance * model.combinedRedeemMultiplier})`
                ) : (
                  `${model.pointBalance} Puan`
                )
              ) : 'Sadakat'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button type="button" style={{ width: 38, height: 38, borderRadius: 12, border: 'none', background: 'rgba(255,255,255,.15)', backdropFilter: 'blur(8px)', color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
              <i className="fa-solid fa-qrcode" />
            </button>
          </div>
        </div>

        {/* Logo */}
        {logo ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 32 }}>
            <img src={logo} alt={branding.companyName || ''} style={{ maxHeight: 72, maxWidth: 180, objectFit: 'contain', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,.3))' }} />
          </div>
        ) : branding.companyName ? (
          <div style={{ textAlign: 'center', paddingTop: 32, fontSize: '1.6rem', fontWeight: 900, textShadow: '0 2px 8px rgba(0,0,0,.4)' }}>
            {branding.companyName}
          </div>
        ) : null}

        {/* Welcome banner */}
        <div style={{
          borderRadius: 14,
          background: primaryColor,
          padding: '10px 18px',
          textAlign: 'center',
          fontWeight: 800,
          fontSize: '.88rem',
          boxShadow: '0 4px 16px rgba(0,0,0,.25)',
        }}>
          {branding.welcomeText || 'Hoş Geldiniz'}, {model.displayName}
        </div>
      </div>

      {/* Body area with customizable background */}
      <div style={{
        background: bodyBgImage
          ? `url(${bodyBgImage}) center/cover no-repeat fixed`
          : bodyBgColor,
        minHeight: 'calc(100svh - 260px)',
      }}>
        {/* 4 Action Buttons - 2x2 grid */}
        <div style={{ padding: '20px 16px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {(homeButtons || []).slice(0, 4).map(btn => (
            <button
              key={btn.id}
              type="button"
              onClick={() => handleButtonPress(btn)}
              style={{
                minHeight: 120,
                borderRadius: 20,
                border: '1px solid rgba(148,163,184,.12)',
                background: 'linear-gradient(145deg, #1a1a2e, #16213e)',
                color: '#fff',
                display: 'grid',
                gap: 10,
                justifyItems: 'center',
                alignContent: 'center',
                padding: 16,
                cursor: 'pointer',
                boxShadow: '0 8px 24px rgba(0,0,0,.18)',
                transition: 'transform .15s ease, box-shadow .15s ease',
              }}
            >
              <span style={{
                width: 46, height: 46, borderRadius: 14,
                background: 'rgba(255,255,255,.1)',
                display: 'grid', placeItems: 'center',
                fontSize: '1.15rem',
              }}>
                <i className={`fa-solid ${btn.icon || 'fa-circle'}`} />
              </span>
              <span style={{ fontSize: '.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                {btn.label}
              </span>
            </button>
          ))}
        </div>

        {/* Quick summary tiles */}
        <div style={{ padding: '0 16px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <button
            type="button"
            onClick={() => onNavigate('card')}
            style={{
              borderRadius: 16,
              background: 'rgba(255,255,255,.85)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(148,163,184,.12)',
              padding: '12px 10px',
              textAlign: 'center',
              boxShadow: '0 4px 12px rgba(15,23,42,.05)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              width: '100%',
              outline: 'none',
            }}
          >
            <div style={{ fontSize: '.68rem', color: '#64748b', fontWeight: 800 }}>Puan</div>
            <div style={{ marginTop: 4, fontSize: '1rem', fontWeight: 900, color: '#0f172a' }}>
              {model.pointBalance > 0 ? (
                model.combinedRedeemMultiplier > 1 ? (
                  <span>{model.pointBalance} <span style={{ fontSize: '.74rem', color: '#f97316', fontWeight: 900 }}>({model.pointBalance * model.combinedRedeemMultiplier})</span></span>
                ) : (
                  model.pointBalance
                )
              ) : '0'}
            </div>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('coupons')}
            style={{
              borderRadius: 16,
              background: 'rgba(255,255,255,.85)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(148,163,184,.12)',
              padding: '12px 10px',
              textAlign: 'center',
              boxShadow: '0 4px 12px rgba(15,23,42,.05)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              width: '100%',
              outline: 'none',
            }}
          >
            <div style={{ fontSize: '.68rem', color: '#64748b', fontWeight: 800 }}>Kupon</div>
            <div style={{ marginTop: 4, fontSize: '1rem', fontWeight: 900, color: '#0f172a' }}>{model.activeCoupons.length}</div>
          </button>
          <button
            type="button"
            onClick={() => onNavigate(hasStamps ? 'campaigns' : 'account')}
            style={{
              borderRadius: 16,
              background: 'rgba(255,255,255,.85)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(148,163,184,.12)',
              padding: '12px 10px',
              textAlign: 'center',
              boxShadow: '0 4px 12px rgba(15,23,42,.05)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              width: '100%',
              outline: 'none',
            }}
          >
            <div style={{ fontSize: '.68rem', color: '#64748b', fontWeight: 800 }}>
              {hasStamps ? 'Damga' : 'Seviye'}
            </div>
            <div style={{
              marginTop: 4,
              fontSize: hasStamps ? '1rem' : '.78rem',
              fontWeight: 900,
              color: hasStamps ? '#ea580c' : '#7c3aed'
            }}>
              {hasStamps ? stampsDisplay : (model.tierSnapshot.currentTier?.name || 'Üyelik')}
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}

function OrderTypeModal({ visible, onClose, orderButtonConfig }) {
  if (!visible) return null
  const deliveryUrl = orderButtonConfig?.config?.deliveryUrl || ''
  const enableTableOrder = orderButtonConfig?.config?.enableTableOrder !== false

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(15,23,42,.5)', display: 'grid', alignItems: 'end' }}>
      <div style={{ borderRadius: '24px 24px 0 0', background: '#fff', padding: '24px 20px 32px', display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 900, fontSize: '1.05rem', color: '#0f172a' }}>Sipariş Türü</div>
          <button type="button" onClick={onClose} style={{ width: 36, height: 36, borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
        <div style={{ color: '#64748b', fontSize: '.82rem', lineHeight: 1.6 }}>
          Siparişinizi nasıl almak istersiniz?
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          {deliveryUrl ? (
            <button
              type="button"
              onClick={() => { window.open(deliveryUrl, '_blank'); onClose() }}
              style={{
                minHeight: 64, borderRadius: 18, border: '1px solid rgba(148,163,184,.14)',
                background: 'linear-gradient(135deg, #f97316, #ea580c)',
                color: '#fff', fontWeight: 900, fontSize: '.88rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                boxShadow: '0 4px 16px rgba(249,115,22,.25)',
              }}
            >
              <i className="fa-solid fa-motorcycle" style={{ fontSize: '1.1rem' }} />
              Adrese Teslim
            </button>
          ) : null}
          {enableTableOrder ? (
            <button
              type="button"
              onClick={() => onClose('table_order')}
              style={{
                minHeight: 64, borderRadius: 18, border: '1px solid rgba(148,163,184,.14)',
                background: 'linear-gradient(135deg, #0f172a, #1e293b)',
                color: '#fff', fontWeight: 900, fontSize: '.88rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                boxShadow: '0 4px 16px rgba(15,23,42,.2)',
              }}
            >
              <i className="fa-solid fa-qrcode" style={{ fontSize: '1.1rem' }} />
              Masadan Sipariş
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function HomeScreen({ model, onOpen }) {
  const featuredCampaign = model.campaigns.find(item => item.bucket === 'personalized' && item.activeNow) || model.campaigns[0]

  const stampProgresses = useMemo(() => {
    if (!Array.isArray(model.campaigns)) return []
    const stampCamps = model.campaigns.filter(camp => {
      const rules = [
        ...(Array.isArray(camp.applicableRules) ? camp.applicableRules : []),
        ...(Array.isArray(camp.rules) ? camp.rules : []),
      ]
      return rules.some(rule => {
        const isProductStamp = rule.conditionKey === 'period_product_quantity' && rule.conditionConfig?.isStampMode !== false
        const isOrderStamp = rule.conditionKey === 'period_order_count'
        return isProductStamp || isOrderStamp
      })
    })

    return stampCamps.map(camp => {
      const progress = model.progressRows?.find(p => String(p.campaign_id) === String(camp.id))
      const current = progress?.current_count || 0
      
      let target = progress?.target_count || 5
      if (!progress?.target_count) {
        const rules = [
          ...(Array.isArray(camp.applicableRules) ? camp.applicableRules : []),
          ...(Array.isArray(camp.rules) ? camp.rules : []),
        ]
        const rule = rules.find(r => r.conditionKey === 'period_product_quantity' || r.conditionKey === 'period_order_count')
        if (rule) {
          const cfg = rule.conditionConfig || rule.condition_json || {}
          target = cfg.quantity || cfg.count || cfg.value || target
        }
      }
      return { current, target }
    })
  }, [model.campaigns, model.progressRows])

  const hasStamps = stampProgresses.length > 0
  const stampsDisplay = useMemo(() => {
    if (stampProgresses.length === 1) {
      return `${stampProgresses[0].current}/${stampProgresses[0].target}`
    }
    return stampProgresses.map(p => `${p.current}/${p.target}`).slice(0, 2).join(' | ') + (stampProgresses.length > 2 ? '...' : '')
  }, [stampProgresses])

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ ...cardStyle('linear-gradient(150deg, #111827 0%, #312e81 45%, #f97316 100%)', 'rgba(255,255,255,.08)'), padding: 18, color: '#fff', display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '.76rem', letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.72)', fontWeight: 800 }}>
              Sadakat uyeligi aktif
            </div>
            <div style={{ marginTop: 8, fontSize: '1.34rem', fontWeight: 900 }}>Merhaba {model.displayName}</div>
            <div style={{ marginTop: 6, color: 'rgba(255,255,255,.82)', fontSize: '.82rem', lineHeight: 1.6 }}>
              Uygulamada gor, kasada kullan, kioska tanit, masada hesaba islet.
            </div>
          </div>
          <span style={badgeStyle('rgba(255,255,255,.14)', '#fff')}>
            <i className="fa-solid fa-crown" />
            {model.tierSnapshot.currentTier?.name || 'Uyelik'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
          <div>
            <div style={{ fontSize: '.72rem', color: 'rgba(255,255,255,.68)' }}>Puan</div>
            <div style={{ marginTop: 4, fontWeight: 900 }}>
              {model.combinedRedeemMultiplier > 1 ? (
                <span>{formatMobileNumber(model.pointBalance)} <span style={{ fontSize: '.74rem', color: '#fdba74', fontWeight: 900 }}>({formatMobileNumber(model.pointBalance * model.combinedRedeemMultiplier)})</span></span>
              ) : (
                formatMobileNumber(model.pointBalance)
              )}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '.72rem', color: 'rgba(255,255,255,.68)' }}>Bakiye</div>
            <div style={{ marginTop: 4, fontWeight: 900 }}>{formatMobileMoney(model.storedValueBalance)} TL</div>
          </div>
          <div>
            <div style={{ fontSize: '.72rem', color: 'rgba(255,255,255,.68)' }}>Kupon</div>
            <div style={{ marginTop: 4, fontWeight: 900 }}>{model.activeCoupons.length}</div>
          </div>
        </div>

        {featuredCampaign ? (
          <div style={{ ...cardStyle('rgba(255,255,255,.12)', 'rgba(255,255,255,.08)'), padding: 12 }}>
            <div style={{ fontSize: '.7rem', fontWeight: 900, color: '#fdba74', textTransform: 'uppercase', letterSpacing: '.08em' }}>
              One cikan kampanya
            </div>
            <div style={{ marginTop: 6, fontWeight: 900 }}>{featuredCampaign.name}</div>
            <div style={{ marginTop: 4, color: 'rgba(255,255,255,.8)', fontSize: '.76rem', lineHeight: 1.5 }}>
              {featuredCampaign.description || 'Sadakat uyelerine acik kampanya.'}
            </div>
          </div>
        ) : null}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
        {[
          { key: 'card', label: 'Kartim', icon: 'fa-id-card', color: '#1d4ed8' },
          { key: 'coupons', label: 'Kupon', icon: 'fa-ticket', color: '#ea580c' },
          { key: 'activity', label: 'Hareket', icon: 'fa-clock-rotate-left', color: '#047857' },
          { key: 'tier', label: 'Tier', icon: 'fa-layer-group', color: '#7c3aed' },
        ].map(action => (
          <button
            key={action.key}
            type="button"
            onClick={() => onOpen(action.key)}
            style={{ ...cardStyle('#fff'), border: 'none', padding: '14px 10px', display: 'grid', gap: 8, justifyItems: 'center', cursor: 'pointer' }}
          >
            <span style={{ width: 40, height: 40, borderRadius: 14, display: 'grid', placeItems: 'center', background: `${action.color}14`, color: action.color }}>
              <i className={`fa-solid ${action.icon}`} />
            </span>
            <span style={{ fontSize: '.7rem', fontWeight: 800, color: '#0f172a' }}>{action.label}</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {hasStamps ? (
          <button
            type="button"
            onClick={() => onOpen('campaigns')}
            style={{
              ...cardStyle('#fff'),
              border: 'none',
              padding: '14px 10px',
              display: 'grid',
              gap: 6,
              textAlign: 'left',
              cursor: 'pointer',
              width: '100%',
              fontFamily: 'inherit',
            }}
          >
            <div style={{ fontSize: '.72rem', color: '#64748b', fontWeight: 800 }}>Damgalarım</div>
            <div style={{ fontSize: '1.25rem', color: '#ea580c', fontWeight: 900 }}>{stampsDisplay}</div>
            <div style={{ fontSize: '.72rem', color: '#94a3b8', lineHeight: 1.5 }}>Kampanyalara git</div>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onOpen('tier')}
            style={{
              ...cardStyle('#fff'),
              border: 'none',
              padding: '14px 10px',
              display: 'grid',
              gap: 6,
              textAlign: 'left',
              cursor: 'pointer',
              width: '100%',
              fontFamily: 'inherit',
            }}
          >
            <div style={{ fontSize: '.72rem', color: '#64748b', fontWeight: 800 }}>Mevcut seviye</div>
            <div style={{ fontSize: '1.1rem', color: '#7c3aed', fontWeight: 900 }}>{model.tierSnapshot.currentTier?.name || 'Uyelik'}</div>
            {model.tierSnapshot.remainingLabel ? (
              <div style={{ fontSize: '.72rem', color: '#94a3b8', lineHeight: 1.5 }}>{model.tierSnapshot.remainingLabel}</div>
            ) : null}
          </button>
        )}
        <SummaryTile label="Favori sube" value={model.homeBranchName} hint={`Son hareket: ${formatMobileRelativeDateLabel(model.latestActivityDate)}`} color="#1d4ed8" />
      </div>

      <div style={{ ...cardStyle('#fff'), padding: 14, display: 'grid', gap: 10 }}>
        <div style={{ fontWeight: 900, color: '#0f172a' }}>Hizli aksiyonlar</div>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ color: '#475569', fontSize: '.8rem' }}>QR ile hesabini kasada goster.</div>
          <div style={{ color: '#475569', fontSize: '.8rem' }}>Kioskta kampanyani baglayip siparise devam et.</div>
          <div style={{ color: '#475569', fontSize: '.8rem' }}>Masa/POS kanalinda kupon ve puan avantajlarini kullan.</div>
        </div>
      </div>
    </div>
  )
}

function CardScreen({ model }) {
  const matrix = buildQrMatrix(model.memberCode)
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ ...cardStyle('linear-gradient(145deg,#0f172a,#1e293b)', 'rgba(255,255,255,.08)'), padding: 18, color: '#fff', display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '.72rem', letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.7)', fontWeight: 800 }}>
              Sadakat kartim
            </div>
            <div style={{ marginTop: 8, fontSize: '1.2rem', fontWeight: 900 }}>{model.customer.ad_soyad || 'Musteri'}</div>
            <div style={{ marginTop: 4, color: 'rgba(255,255,255,.78)', fontSize: '.8rem' }}>
              {model.tierSnapshot.currentTier?.name || 'Uyelik seviyesi'}
            </div>
          </div>
          <span style={badgeStyle('rgba(255,255,255,.14)', '#fff')}>
            <i className="fa-solid fa-star" />
            {model.memberCode}
          </span>
        </div>

        <div style={{ display: 'grid', placeItems: 'center' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(11, 1fr)', gap: 4, padding: 12, borderRadius: 18, background: '#fff' }}>
            {matrix.flatMap((row, rowIndex) => row.map((active, colIndex) => (
              <span
                key={`${rowIndex}-${colIndex}`}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: active ? '#0f172a' : 'rgba(226,232,240,.8)',
                }}
              />
            )))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div style={{ fontSize: '.72rem', color: 'rgba(255,255,255,.7)' }}>Puan bakiyesi</div>
            <div style={{ marginTop: 4, fontWeight: 900 }}>
              {model.combinedRedeemMultiplier > 1 ? (
                <span>{formatMobileNumber(model.pointBalance)} puan <span style={{ fontSize: '.74rem', color: '#fdba74', fontWeight: 900 }}>({formatMobileNumber(model.pointBalance * model.combinedRedeemMultiplier)} Bugün)</span></span>
              ) : (
                `${formatMobileNumber(model.pointBalance)} puan`
              )}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '.72rem', color: 'rgba(255,255,255,.7)' }}>Cuzdan</div>
            <div style={{ marginTop: 4, fontWeight: 900 }}>{formatMobileMoney(model.storedValueBalance)} TL</div>
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle('#fff'), padding: 14, color: '#475569', fontSize: '.8rem', lineHeight: 1.65 }}>
        Bu kart POS, kiosk ve masa kanalinda ayni musteriyi tanitmak icin kullanilir. Uye numarasi ve QR alanini kasada gostermeniz yeterlidir.
      </div>
    </div>
  )
}


function CampaignsScreen({ model, onToggleCampaign }) {
  const hasCouponCond = (campaign) => {
    const rules = [
      ...(Array.isArray(campaign.applicableRules) ? campaign.applicableRules : []),
      ...(Array.isArray(campaign.rules) ? campaign.rules : []),
    ]
    return rules.some(rule => {
      const conditions = Array.isArray(rule.conditions) ? rule.conditions : []
      const hasCond = conditions.some(cond => cond.conditionKey === 'coupon_present')
      const hasSingle = rule.conditionKey === 'coupon_present'
      return hasCond || hasSingle
    })
  }

  const isStampCamp = (campaign) => {
    const rules = [
      ...(Array.isArray(campaign.applicableRules) ? campaign.applicableRules : []),
      ...(Array.isArray(campaign.rules) ? campaign.rules : []),
    ]
    return rules.some(rule => {
      const isProductStamp = rule.conditionKey === 'period_product_quantity' && rule.conditionConfig?.isStampMode !== false
      const isOrderStamp = rule.conditionKey === 'period_order_count'
      return isProductStamp || isOrderStamp
    })
  }

  const allCampaigns = (model.campaigns || []).filter(c => !hasCouponCond(c))

  const sortByPriority = (arr) => {
    return [...arr].sort((left, right) => {
      const pLeft = Number(left.priority ?? left.metadata?.priority ?? 0)
      const pRight = Number(right.priority ?? right.metadata?.priority ?? 0)
      if (pLeft !== pRight) return pLeft - pRight
      return String(left.name || '').localeCompare(String(right.name || ''), 'tr')
    })
  }

  const stampCampaigns = sortByPriority(allCampaigns.filter(c => isStampCamp(c)))
  const standardCampaigns = allCampaigns.filter(c => !isStampCamp(c))

  const personalized = sortByPriority(standardCampaigns.filter(item => item.bucket === 'personalized'))
  const publicCampaigns = sortByPriority(standardCampaigns.filter(item => item.bucket === 'public'))
  const upcoming = sortByPriority(standardCampaigns.filter(item => item.bucket === 'upcoming'))
  const ending = sortByPriority(standardCampaigns.filter(item => item.bucket === 'ending'))

  const selectedIds = model.customer?.metadata?.selectedCampaignIds || []

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Damga kartları */}
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ fontWeight: 900, color: '#0f172a', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="fa-solid fa-stamp" style={{ color: '#ea580c' }} />
          Damga Kartlarım
        </div>
        {stampCampaigns.length ? (
          stampCampaigns.map(campaign => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              model={model}
            />
          ))
        ) : (
          <div style={{ ...cardStyle('#fff'), padding: 14, color: '#64748b', fontSize: '.8rem' }}>
            Aktif damga kartınız bulunmuyor.
          </div>
        )}
      </div>

      <div style={{ height: 1, background: 'rgba(15,23,42,.06)', margin: '4px 0' }} />

      {/* Standart kampanyalar */}
      {[
        { title: 'Sana özel fırsatlar', items: personalized },
        { title: 'Herkese açık kampanyalar', items: publicCampaigns },
        { title: 'Yakında başlayacaklar', items: upcoming },
        { title: 'Bitmek üzere olanlar', items: ending },
      ].map(group => (
        <div key={group.title} style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontWeight: 900, color: '#0f172a' }}>{group.title}</div>
          {group.items.length ? (
            group.items.map(campaign => {
              const active = selectedIds.includes(String(campaign.id))
              return (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  model={model}
                  active={active}
                  onClick={() => onToggleCampaign && onToggleCampaign(campaign.id)}
                />
              )
            })
          ) : (
            <div style={{ ...cardStyle('#fff'), padding: 14, color: '#64748b', fontSize: '.8rem' }}>
              Bu bölümde gösterilecek kampanya bulunmuyor.
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function AccountScreen({
  model,
  accountView,
  onChange,
  activePrograms = [],
  referralCodesByProgram = {},
  onTriggerReload,
}) {
  const [copiedCode, setCopiedCode] = useState('')
  const [retroCode, setRetroCode] = useState('')
  const [retroLoading, setRetroLoading] = useState(false)
  const [retroError, setRetroError] = useState('')
  const [retroSuccess, setRetroSuccess] = useState('')
  const [genLoading, setGenLoading] = useState({})
  const [genError, setGenError] = useState({})

  const handleCopy = (code) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code)
      setTimeout(() => setCopiedCode(''), 2000)
    })
  }

  const handleApplyRetroCode = async () => {
    setRetroError('')
    setRetroSuccess('')
    if (!retroCode.trim()) {
      setRetroError('Lütfen bir davet kodu girin.')
      return
    }
    setRetroLoading(true)
    try {
      const valRes = await validateReferralCode(model.customer.id, retroCode)
      if (valRes.isValid) {
        await applyReferralCode(model.customer.id, valRes)
        setRetroSuccess(`Referans başarıyla uygulandı! ${valRes.referrerName} tarafından davet edildiniz.`)
        setRetroCode('')
        if (onTriggerReload) {
          onTriggerReload()
        }
      }
    } catch (err) {
      setRetroError(err.message || 'Doğrulama veya uygulama sırasında hata oluştu.')
    } finally {
      setRetroLoading(false)
    }
  }

  const handleGenerateCode = async (programId) => {
    setGenError(prev => ({ ...prev, [programId]: '' }))
    setGenLoading(prev => ({ ...prev, [programId]: true }))
    try {
      await generateReferralCode(model.customer.id, programId)
      if (onTriggerReload) {
        onTriggerReload()
      }
    } catch (err) {
      setGenError(prev => ({ ...prev, [programId]: err.message || 'Kod üretilirken bir hata oluştu.' }))
    } finally {
      setGenLoading(prev => ({ ...prev, [programId]: false }))
    }
  }

  // Retrospective eligibility logic
  const orderCount = Number(model.customer.total_order_count ?? model.customer.siparis_sayisi ?? 0)
  const createdAt = model.customer.created_at ? new Date(model.customer.created_at) : new Date()
  const daysDiff = (new Date().getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
  const isRetrospectiveEligible = !model.customer.referred_by_customer_id && orderCount === 0 && daysDiff <= 7

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
        {ACCOUNT_VIEWS.map(view => {
          const active = view.key === accountView
          return (
            <button
              key={view.key}
              type="button"
              onClick={() => onChange(view.key)}
              style={{
                minHeight: 40,
                padding: '0 14px',
                borderRadius: 999,
                border: '1px solid rgba(148,163,184,.18)',
                background: active ? '#0f172a' : '#fff',
                color: active ? '#fff' : '#475569',
                fontWeight: 800,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {view.label}
            </button>
          )
        })}
      </div>

      {accountView === 'activity' ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {model.transactions.length ? model.transactions.map(item => {
            const valueMeta = getTransactionValue(item)
            return (
              <div key={item.id} style={{ ...cardStyle('#fff'), padding: 14, display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 900, color: '#0f172a' }}>{getTransactionLabel(item.transaction_type)}</div>
                    <div style={{ marginTop: 4, color: '#64748b', fontSize: '.76rem' }}>
                      {formatMobileDate(item.occurred_at, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} • {item.source_channel || item.branch_name || 'Loyalty'}
                    </div>
                  </div>
                  <div style={{ fontWeight: 900, color: valueMeta.color }}>{valueMeta.text}</div>
                </div>
                <div style={{ color: '#475569', fontSize: '.78rem', lineHeight: 1.55 }}>
                  {item.note || item.source_type || item.source_ref_no || 'Kampanya / puan hareketi kaydi'}
                </div>
              </div>
            )
          }) : (
            <div style={{ ...cardStyle('#fff'), padding: 14, color: '#64748b', fontSize: '.8rem' }}>
              Henuz puan veya cüzdan hareketi bulunmuyor.
            </div>
          )}
        </div>
      ) : null}

      {accountView === 'tier' ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ ...cardStyle('#fff'), padding: 16, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '.72rem', color: '#7c3aed', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em' }}>Mevcut seviye</div>
                <div style={{ marginTop: 6, fontSize: '1.18rem', fontWeight: 900, color: '#0f172a' }}>{model.tierSnapshot.currentTier?.name || 'Uyelik'}</div>
              </div>
              <span style={badgeStyle('#f3e8ff', '#7c3aed')}>{Math.max(0, Number(model.tierSnapshot.progressRatio || 0))}%</span>
            </div>
            <div style={{ height: 10, borderRadius: 999, background: '#ede9fe', overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(0, Math.min(100, Number(model.tierSnapshot.progressRatio || 0)))}%`, height: '100%', background: 'linear-gradient(90deg,#8b5cf6,#ec4899)' }} />
            </div>
            <div style={{ color: '#475569', fontSize: '.8rem', lineHeight: 1.6 }}>
              {model.tierSnapshot.progressLabel} • {model.tierSnapshot.remainingLabel}
            </div>
          </div>
          <div style={{ ...cardStyle('#fff'), padding: 16, display: 'grid', gap: 8 }}>
            <div style={{ fontWeight: 900, color: '#0f172a' }}>Seviye avantajlari</div>
            <div style={{ color: '#475569', fontSize: '.8rem' }}>Kampanyalarda oncelikli gorunurluk</div>
            <div style={{ color: '#475569', fontSize: '.8rem' }}>POS ve kioskta hizli musteri tanima</div>
            <div style={{ color: '#475569', fontSize: '.8rem' }}>Kupon, bonus ve frekans odullerine erisim</div>
          </div>
        </div>
      ) : null}

      {accountView === 'profile' ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {/* Retrospective Referral Entry */}
          {isRetrospectiveEligible && (
            <div style={{ ...cardStyle('linear-gradient(135deg, #fffbeb, #fef3c7)', '#fde68a'), padding: 16, display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: '1.2rem', color: '#d97706' }}><i className="fa-solid fa-gift" /></span>
                <div style={{ fontWeight: 900, color: '#92400e', fontSize: '.86rem' }}>Beni Kim Davet Etti?</div>
              </div>
              <div style={{ color: '#b45309', fontSize: '.76rem', lineHeight: 1.45 }}>
                Sizi davet eden bir arkadaşınızın referans kodunu girerek hoş geldin ödül puanınızı hemen kazanabilirsiniz.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={retroCode}
                  onChange={e => setRetroCode(e.target.value)}
                  placeholder="Ornek: REF-XXXXXX"
                  disabled={retroLoading}
                  style={{
                    flex: 1,
                    minHeight: 38,
                    borderRadius: 10,
                    border: '1px solid #fcd34d',
                    background: '#fff',
                    color: '#0f172a',
                    padding: '0 10px',
                    fontSize: '.8rem',
                    fontWeight: 700,
                  }}
                />
                <button
                  type="button"
                  onClick={handleApplyRetroCode}
                  disabled={retroLoading}
                  style={{
                    minWidth: 80,
                    borderRadius: 10,
                    border: 'none',
                    background: '#d97706',
                    color: '#fff',
                    fontWeight: 800,
                    fontSize: '.76rem',
                    cursor: 'pointer',
                    opacity: retroLoading ? 0.7 : 1,
                  }}
                >
                  {retroLoading ? 'Uygulanıyor' : 'Uygula'}
                </button>
              </div>
              {retroError && <div style={{ color: '#b91c1c', fontSize: '.74rem', fontWeight: 700 }}>{retroError}</div>}
              {retroSuccess && <div style={{ color: '#15803d', fontSize: '.74rem', fontWeight: 700 }}>{retroSuccess}</div>}
            </div>
          )}

          {/* Active Referral Programs Invitations & Codes */}
          {activePrograms.map(program => {
            const eligibility = checkReferralEligibility(model.customer, program)
            if (!eligibility.eligible) return null

            const programCodes = referralCodesByProgram[program.id] || []
            const config = program.config_json || {}
            const isUniqueMultiple = program.mode === 'unique_multiple'
            const isLimitMode = program.mode === 'single_reusable_limit'
            const isDateMode = program.mode === 'single_reusable_date'
            const pError = genError[program.id]
            const pLoading = genLoading[program.id]

            return (
              <div key={program.id} style={{ ...cardStyle('#fff'), padding: 16, display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: '1.2rem', color: '#be185d' }}><i className="fa-solid fa-users" /></span>
                    <div style={{ fontWeight: 900, color: '#0f172a', fontSize: '.86rem' }}>{program.name || 'Arkadaşlarını Davet Et'}</div>
                  </div>
                  <span style={badgeStyle('rgba(190,24,93,.12)', '#be185d')}>Aktif</span>
                </div>

                <div style={{ fontSize: '.74rem', color: '#64748b', background: '#f8fafc', padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(148,163,184,.08)' }}>
                  <i className="fa-solid fa-info-circle" style={{ marginRight: 6, color: '#8b5cf6' }} />
                  Kazanım Kriteri: {program.success_criteria === 'registration' ? 'Arkadaşınız üye olduğunda' : `Arkadaşınız üye olup en az ${program.success_purchase_count || 1} sipariş verdiğinde`}
                </div>

                {isUniqueMultiple ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ color: '#475569', fontSize: '.76rem', lineHeight: 1.45 }}>
                      Arkadaşlarınızla paylaşabileceğiniz tek kullanımlık benzersiz davet kodları oluşturun.
                    </div>
                    
                    {programCodes.length > 0 && (
                      <div style={{ display: 'grid', gap: 8 }}>
                        {programCodes.map(row => {
                          const isCopied = copiedCode === row.referral_code
                          return (
                            <div
                              key={row.id}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '8px 12px',
                                borderRadius: 12,
                                background: '#f8fafc',
                                border: '1px solid rgba(148,163,184,.12)',
                              }}
                            >
                              <div>
                                <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '.84rem', color: '#0f172a' }}>
                                  {row.referral_code}
                                </div>
                                <div style={{ fontSize: '.68rem', color: '#64748b', marginTop: 2 }}>
                                  {row.is_used ? (
                                    <span>Kullanıldı ({formatMobileDate(row.used_at, { day: '2-digit', month: 'short' })})</span>
                                  ) : (
                                    <span>Kullanıma hazır</span>
                                  )}
                                </div>
                              </div>
                              
                              {!row.is_used && (
                                <button
                                  type="button"
                                  onClick={() => handleCopy(row.referral_code)}
                                  style={{
                                    padding: '5px 10px',
                                    borderRadius: 8,
                                    border: 'none',
                                    background: isCopied ? '#10b981' : '#e2e8f0',
                                    color: isCopied ? '#fff' : '#475569',
                                    fontWeight: 800,
                                    fontSize: '.7rem',
                                    cursor: 'pointer',
                                  }}
                                >
                                  {isCopied ? 'Kopyalandı!' : 'Kopyala'}
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {programCodes.length < (config.max_unique_codes || 4) ? (
                      <div style={{ display: 'grid', gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => handleGenerateCode(program.id)}
                          disabled={pLoading}
                          style={{
                            minHeight: 38,
                            borderRadius: 12,
                            border: 'none',
                            background: 'linear-gradient(135deg, #be185d, #db2777)',
                            color: '#fff',
                            fontWeight: 950,
                            fontSize: '.78rem',
                            cursor: 'pointer',
                            opacity: pLoading ? 0.7 : 1,
                          }}
                        >
                          {pLoading ? 'Kod Üretiliyor...' : 'Yeni Davet Kodu Üret'}
                        </button>
                        <div style={{ color: '#64748b', fontSize: '.7rem', textAlign: 'center' }}>
                          Limit: {programCodes.length} / {config.max_unique_codes || 4} kod üretildi.
                        </div>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', color: '#ef4444', fontSize: '.72rem', fontWeight: 800 }}>
                        Maksimum davet kodu üretme limitine ulaştınız.
                      </div>
                    )}
                    {pError && <div style={{ color: '#b91c1c', fontSize: '.74rem', fontWeight: 700, textAlign: 'center' }}>{pError}</div>}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ color: '#475569', fontSize: '.76rem', lineHeight: 1.45 }}>
                      Aşağıdaki davet kodunu arkadaşlarınızla sınırsızca paylaşabilirsiniz.
                    </div>

                    {model.customer.referral_code ? (
                      <div
                        style={{
                          padding: 14,
                          borderRadius: 16,
                          background: 'linear-gradient(145deg, #f8fafc, #f1f5f9)',
                          border: '1px solid rgba(148,163,184,.14)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '.72rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>Davet Kodunuz</div>
                          <div style={{ marginTop: 4, fontFamily: 'monospace', fontWeight: 900, fontSize: '1.25rem', color: '#be185d' }}>{model.customer.referral_code}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopy(model.customer.referral_code)}
                          style={{
                            minHeight: 36,
                            padding: '0 14px',
                            borderRadius: 10,
                            border: 'none',
                            background: copiedCode === model.customer.referral_code ? '#10b981' : '#be185d',
                            color: '#fff',
                            fontWeight: 900,
                            fontSize: '.74rem',
                            cursor: 'pointer',
                          }}
                        >
                          {copiedCode === model.customer.referral_code ? 'Kopyalandı' : 'Kopyala'}
                        </button>
                      </div>
                    ) : (
                      <div style={{ color: '#64748b', fontSize: '.78rem', fontStyle: 'italic', textAlign: 'center' }}>
                        Davet kodunuz hazırlanıyor...
                      </div>
                    )}

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 14px',
                        borderRadius: 12,
                        background: '#fcf6f8',
                        border: '1px solid rgba(190,24,93,.08)',
                        fontSize: '.76rem',
                      }}
                    >
                      <span style={{ color: '#475569', fontWeight: 800 }}>Başarılı Davet Sayısı:</span>
                      <span style={{ color: '#be185d', fontWeight: 900, fontSize: '.84rem' }}>
                        {model.referredCount}
                        {isLimitMode && (
                          <span style={{ color: '#64748b', fontWeight: 700, fontSize: '.76rem' }}>
                            {' '}
                            / {config.max_redemptions_per_referrer || 4}
                          </span>
                        )}
                      </span>
                    </div>

                    {isDateMode && (
                      <div style={{ fontSize: '.7rem', color: '#64748b', textAlign: 'center' }}>
                        Geçerlilik: {config.valid_from ? formatMobileDate(config.valid_from, { day: '2-digit', month: 'short' }) : 'Başlangıç yok'} - {config.valid_until ? formatMobileDate(config.valid_until, { day: '2-digit', month: 'short' }) : 'Bitiş yok'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          <div style={{ ...cardStyle('#fff'), padding: 16, display: 'grid', gap: 10 }}>
            <div style={{ fontWeight: 900, color: '#0f172a' }}>Musteri bilgileri</div>
            <div style={{ color: '#475569', fontSize: '.8rem' }}>Ad Soyad: {model.customer.ad_soyad || '-'}</div>
            <div style={{ color: '#475569', fontSize: '.8rem' }}>Telefon: {(model.customer.telefon_ulke || '') + (model.customer.telefon || '') || '-'}</div>
            <div style={{ color: '#475569', fontSize: '.8rem' }}>E-posta: {model.customer.email || '-'}</div>
            <div style={{ color: '#475569', fontSize: '.8rem' }}>Dogum gunu: {formatMobileDate(model.customer.birth_date, { day: '2-digit', month: 'long' })}</div>
            <div style={{ color: '#475569', fontSize: '.8rem' }}>Favori sube: {model.homeBranchName}</div>
          </div>
          <div style={{ ...cardStyle('#fff'), padding: 16, display: 'grid', gap: 8 }}>
            <div style={{ fontWeight: 900, color: '#0f172a' }}>Iletisim tercihleri</div>
            <div style={{ color: '#475569', fontSize: '.8rem' }}>SMS: {model.customer.sms_opt_in ? 'Acik' : 'Kapali'}</div>
            <div style={{ color: '#475569', fontSize: '.8rem' }}>E-posta: {model.customer.email_opt_in ? 'Acik' : 'Kapali'}</div>
            <div style={{ color: '#475569', fontSize: '.8rem' }}>Push / kampanya: {model.customer.push_opt_in ? 'Acik' : 'Kapali'}</div>
          </div>
          <div style={{ ...cardStyle('#fff'), padding: 16, display: 'grid', gap: 8 }}>
            <div style={{ fontWeight: 900, color: '#0f172a' }}>Kategori ve etiketler</div>
            {model.profileTags.length ? model.profileTags.map(tag => (
              <span key={tag} style={badgeStyle('#f1f5f9', '#475569')}>{tag}</span>
            )) : (
              <div style={{ color: '#64748b', fontSize: '.8rem' }}>Ekstra musteri etiketi yok.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function LoginScreen({
  loading,
  searchText,
  onSearchTextChange,
  onSearch,
  matches,
  quickCustomers,
  statusText,
  errorText,
  onSelectCustomer,
  appConfig = null,
}) {
  const [isSignup, setIsSignup] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [refCode, setRefCode] = useState('')
  const [signupLoading, setSignupLoading] = useState(false)
  const [signupError, setSignupError] = useState('')

  async function handleRegister() {
    setSignupError('')
    if (!name.trim()) {
      setSignupError('Ad Soyad alanı zorunludur.')
      return
    }
    if (!phone.trim()) {
      setSignupError('Telefon alanı zorunludur.')
      return
    }
    setSignupLoading(true)
    try {
      const newCust = await registerCustomer(name, phone, email, refCode)
      onSelectCustomer(newCust)
    } catch (err) {
      setSignupError(err.message || 'Kayıt sırasında bir hata oluştu.')
    } finally {
      setSignupLoading(false)
    }
  }

  const bodyBgColor = appConfig?.branding?.bodyBackgroundColor || '#f8fafc'
  const bodyBgImage = appConfig?.branding?.bodyBackgroundImageUrl

  return (
    <div style={{
      height: '100%',
      maxHeight: '100%',
      background: bodyBgImage
        ? `url(${bodyBgImage}) center/cover no-repeat fixed`
        : bodyBgColor,
      display: 'grid',
      gridTemplateRows: 'auto 1fr',
      overflow: 'hidden'
    }}>
      <div style={{ padding: '24px 18px 14px', display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '.72rem', color: '#fb7185', fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase' }}>
              SuitableRMS Loyalty
            </div>
            <div style={{ marginTop: 4, fontSize: '1.12rem', color: '#0f172a', fontWeight: 900 }}>
              {isSignup ? 'Yeni Uye Ol' : 'Musteri girisi'}
            </div>
          </div>
          <span style={badgeStyle('rgba(251,113,133,.12)', '#be185d')}>
            <i className="fa-solid fa-mobile-screen" />
            Mobil
          </span>
        </div>

        <div style={{ ...cardStyle('linear-gradient(145deg,#111827,#312e81)', 'rgba(255,255,255,.08)'), padding: 16, color: '#fff', display: 'grid', gap: 8 }}>
          <div style={{ fontSize: '.76rem', fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.72)' }}>
            Bu cihazdaki aktif hesap
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 900 }}>
            {isSignup ? 'Hemen kayit ol ve kazan' : 'Sadakat hesabinla devam et'}
          </div>
          <div style={{ fontSize: '.82rem', lineHeight: 1.6, color: 'rgba(255,255,255,.82)' }}>
            {isSignup
              ? 'Sadakat programına katılarak özel fırsatlar, kuponlar ve sürpriz hediyeler kazanmaya hemen başlayabilirsiniz.'
              : 'Telefon hesabini hatirlar. Sonraki QR okutmalarinda kiosk ve POS seni ayni musteri olarak taniyabilir.'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '0 4px', marginTop: 4 }}>
          <button
            type="button"
            onClick={() => setIsSignup(false)}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: 12,
              border: 'none',
              background: !isSignup ? 'linear-gradient(145deg, #0f172a, #1e293b)' : 'transparent',
              color: !isSignup ? '#fff' : '#64748b',
              fontWeight: 800,
              fontSize: '.82rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Giris Yap
          </button>
          <button
            type="button"
            onClick={() => setIsSignup(true)}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: 12,
              border: 'none',
              background: isSignup ? 'linear-gradient(145deg, #be185d, #db2777)' : 'transparent',
              color: isSignup ? '#fff' : '#64748b',
              fontWeight: 800,
              fontSize: '.82rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Yeni Kayit
          </button>
        </div>
      </div>

      <div style={{ overflowY: 'auto', padding: '0 18px 18px', display: 'grid', gap: 14, alignContent: 'start' }}>
        {!isSignup ? (
          <>
            <div style={{ ...cardStyle('#fff'), padding: 14, display: 'grid', gap: 10 }}>
              <div style={{ fontWeight: 900, color: '#0f172a' }}>Telefon, uye no veya ad soyad ile bul</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={searchText}
                  onChange={event => onSearchTextChange(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter') onSearch() }}
                  placeholder="Ornek: 0532..., RMS-1042, Ayse Yilmaz"
                  style={{ flex: 1, minHeight: 46, borderRadius: 14, border: '1px solid rgba(148,163,184,.16)', background: '#fff', color: '#0f172a', padding: '0 14px' }}
                />
                <button
                  type="button"
                  onClick={onSearch}
                  disabled={loading}
                  style={{ minWidth: 92, minHeight: 46, borderRadius: 14, border: 'none', background: '#0f172a', color: '#fff', fontWeight: 900, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1 }}
                >
                  {loading ? 'Araniyor' : 'Bul'}
                </button>
              </div>
              {statusText ? <div style={{ color: '#0369a1', fontSize: '.78rem' }}>{statusText}</div> : null}
              {errorText ? <div style={{ color: '#b91c1c', fontSize: '.78rem' }}>{errorText}</div> : null}
              {matches.length ? matches.map(customer => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => onSelectCustomer(customer)}
                  style={{ ...cardStyle('#fff7f5', 'rgba(251,113,133,.18)'), padding: 14, display: 'grid', gap: 4, textAlign: 'left', cursor: 'pointer' }}
                >
                  <div style={{ fontWeight: 900, color: '#0f172a' }}>{customer.ad_soyad || 'Isimsiz Musteri'}</div>
                  <div style={{ color: '#64748b', fontSize: '.76rem' }}>
                    {customer.loyalty_member_no || ((customer.telefon_ulke || '') + (customer.telefon || '')) || '-'}
                  </div>
                </button>
              )) : null}
            </div>

            {quickCustomers.length ? (
              <div style={{ ...cardStyle('#fff'), padding: 14, display: 'grid', gap: 10 }}>
                <div style={{ fontWeight: 900, color: '#0f172a' }}>Hizli secim</div>
                {quickCustomers.map(customer => (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => onSelectCustomer(customer)}
                    style={{ borderRadius: 16, border: '1px solid rgba(148,163,184,.14)', background: '#fff', color: '#0f172a', padding: '12px 14px', textAlign: 'left', cursor: 'pointer' }}
                  >
                    <div style={{ fontWeight: 800 }}>{customer.ad_soyad || 'Isimsiz Musteri'}</div>
                    <div style={{ marginTop: 4, color: '#64748b', fontSize: '.76rem' }}>
                      {customer.loyalty_member_no || ((customer.telefon_ulke || '') + (customer.telefon || '')) || 'Uye'}
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div style={{ ...cardStyle('#fff'), padding: 16, display: 'grid', gap: 12 }}>
            <div style={{ fontWeight: 900, color: '#0f172a', fontSize: '1rem' }}>Uyelik Formu</div>
            
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontSize: '.74rem', color: '#475569', fontWeight: 800 }}>Ad Soyad *</label>
              <input
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="Ornek: Ahmet Yilmaz"
                style={{ minHeight: 44, borderRadius: 12, border: '1px solid rgba(148,163,184,.2)', background: '#fff', color: '#0f172a', padding: '0 12px', fontSize: '.84rem' }}
              />
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontSize: '.74rem', color: '#475569', fontWeight: 800 }}>Telefon Numarasi *</label>
              <input
                value={phone}
                onChange={event => setPhone(event.target.value)}
                placeholder="Ornek: 05321234567"
                style={{ minHeight: 44, borderRadius: 12, border: '1px solid rgba(148,163,184,.2)', background: '#fff', color: '#0f172a', padding: '0 12px', fontSize: '.84rem' }}
              />
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontSize: '.74rem', color: '#475569', fontWeight: 800 }}>E-posta Adresi (Istege Bagli)</label>
              <input
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="Ornek: ahmet@mail.com"
                style={{ minHeight: 44, borderRadius: 12, border: '1px solid rgba(148,163,184,.2)', background: '#fff', color: '#0f172a', padding: '0 12px', fontSize: '.84rem' }}
              />
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontSize: '.74rem', color: '#be185d', fontWeight: 900 }}>Davet / Referans Kodu (Istege Bagli)</label>
              <input
                value={refCode}
                onChange={event => setRefCode(event.target.value)}
                placeholder="Ornek: REF-XXXXXX"
                style={{ minHeight: 44, borderRadius: 12, border: '1px solid rgba(251,113,133,.4)', background: '#fff', color: '#0f172a', padding: '0 12px', fontSize: '.84rem', fontWeight: 700 }}
              />
            </div>

            {signupError ? <div style={{ color: '#b91c1c', fontSize: '.78rem', fontWeight: 700 }}>{signupError}</div> : null}

            <button
              type="button"
              onClick={handleRegister}
              disabled={signupLoading}
              style={{
                marginTop: 6,
                minHeight: 46,
                borderRadius: 14,
                border: 'none',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: '#fff',
                fontWeight: 900,
                cursor: signupLoading ? 'wait' : 'pointer',
                opacity: signupLoading ? 0.7 : 1,
                boxShadow: '0 4px 12px rgba(16,185,129,.2)'
              }}
            >
              {signupLoading ? 'Uye Kaydi Yapiliyor...' : 'Kaydet ve Aramiza Katil'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function PhoneChrome({
  children,
  standalone = false,
}) {
  if (standalone) {
    return (
      <div style={{ width: 'min(100%, 430px)', height: '100svh', overflow: 'hidden', background: '#fff' }}>
        {children}
      </div>
    )
  }

  return (
    <div
      style={{
        width: 'min(100%, 390px)',
        height: 780,
        borderRadius: 36,
        background: 'linear-gradient(180deg, rgba(255,255,255,.96), rgba(248,250,252,.98)), radial-gradient(circle at top right, rgba(251,113,133,.22), transparent 30%)',
        border: '1px solid rgba(148,163,184,.28)',
        boxShadow: '0 32px 80px rgba(15,23,42,.16)',
        padding: 18,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 128,
          height: 26,
          borderRadius: 999,
          background: '#0f172a',
          opacity: 0.96,
        }}
      />
      {children}
    </div>
  )
}

function AppViewport({
  model,
  activeTab,
  accountView,
  onTabChange,
  onAccountViewChange,
  onLogout,
  sessionState,
  selectionState,
  onSelectCampaign,
  onSelectCoupon,
  onConnectLink,
  onAddCoupon,
  onToggleCampaign,
  onToggleCoupon,
  standalone = false,
  activePrograms = [],
  referralCodesByProgram = {},
  onTriggerReload,
  appConfig,
  onOrderAction,
}) {
  const bodyBgColor = appConfig?.branding?.bodyBackgroundColor || '#f8fafc'
  const bodyBgImage = appConfig?.branding?.bodyBackgroundImageUrl

  return (
    <div style={{
      height: '100%',
      maxHeight: '100%',
      borderRadius: standalone ? 0 : 26,
      background: bodyBgImage
        ? `url(${bodyBgImage}) center/cover no-repeat fixed`
        : bodyBgColor,
      border: standalone ? 'none' : '1px solid rgba(226,232,240,.9)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {!standalone && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#0f172a', fontSize: '.82rem', fontWeight: 800, padding: '26px 18px 10px' }}>
          <span>{new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(new Date())}</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#64748b' }}>
            <i className="fa-solid fa-signal" />
            <i className="fa-solid fa-wifi" />
            <i className="fa-solid fa-battery-three-quarters" />
          </div>
        </div>
      )}

      {standalone ? (
        <div style={{ padding: '0 18px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '1rem', fontWeight: 900, color: '#0f172a' }}>
            {TAB_ITEMS.find(item => item.key === activeTab)?.label || 'Ana Sayfa'}
          </div>
          <button
            type="button"
            onClick={onLogout}
            style={{
              minHeight: 34, padding: '0 12px', borderRadius: 999,
              border: '1px solid rgba(148,163,184,.18)', background: '#fff',
              color: '#475569', fontWeight: 800, cursor: 'pointer',
            }}
          >
            <i className="fa-solid fa-right-from-bracket" style={{ marginRight: 6 }} />
            Çıkış
          </button>
        </div>
      ) : (
        <div style={{ padding: '0 18px 12px', display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '.72rem', color: '#fb7185', fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase' }}>
                SuitableRMS Loyalty
              </div>
              <div style={{ marginTop: 4, fontSize: '1.08rem', color: '#0f172a', fontWeight: 900 }}>
                {TAB_ITEMS.find(item => item.key === activeTab)?.label || 'Musteri'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={badgeStyle('rgba(251,113,133,.12)', '#be185d')}>
                <i className="fa-solid fa-qrcode" />
                Kasada goster
              </span>
              <button
                type="button"
                onClick={onLogout}
                style={{
                  minHeight: 34,
                  padding: '0 12px',
                  borderRadius: 999,
                  border: '1px solid rgba(148,163,184,.18)',
                  background: '#fff',
                  color: '#475569',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Cikis
              </button>
            </div>
          </div>

          <LinkBanner
            sessionState={sessionState}
            selectionState={selectionState}
            onSelectCampaign={onSelectCampaign}
            onSelectCoupon={onSelectCoupon}
            onConnect={onConnectLink}
          />

          {!model.schemaReady || model.errorText ? (
            <div style={{ ...cardStyle('rgba(255,247,237,.96)', 'rgba(251,146,60,.28)'), padding: 12, fontSize: '.74rem', color: '#9a3412', lineHeight: 1.55 }}>
              {!model.schemaReady ? `Canli loyalty tablosu eksik: ${model.missingTables.join(', ') || 'bilinmiyor'}.` : null}
              {model.errorText ? ` ${model.errorText}` : ''}
            </div>
          ) : null}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 18px 18px', display: 'grid', gap: 14, alignContent: 'start' }}>
        {activeTab === 'home' ? (
          standalone
            ? <MobileHomeDashboard
                model={model}
                appConfig={appConfig}
                onNavigate={target => {
                  if (['campaigns', 'coupons', 'card', 'account'].includes(target)) {
                    onTabChange(target === 'card' ? 'card' : target === 'coupons' ? 'coupons' : target === 'campaigns' ? 'campaigns' : 'account')
                  }
                }}
                onOrderAction={onOrderAction}
              />
            : <HomeScreen model={model} onOpen={target => {
                if (target === 'card') onTabChange('card')
                if (target === 'coupons') onTabChange('coupons')
                if (target === 'campaigns') onTabChange('campaigns')
                if (target === 'activity') {
                  onTabChange('account')
                  onAccountViewChange('activity')
                }
                if (target === 'tier') {
                  onTabChange('account')
                  onAccountViewChange('tier')
                }
              }} />
        ) : null}
        {activeTab === 'card' ? <CardScreen model={model} /> : null}
        {activeTab === 'coupons' ? <CouponsScreen model={model} onAddCoupon={onAddCoupon} appConfig={appConfig} onToggleCoupon={onToggleCoupon} /> : null}
        {activeTab === 'campaigns' ? <CampaignsScreen model={model} onToggleCampaign={onToggleCampaign} /> : null}
        {activeTab === 'account' ? (
          <AccountScreen
            model={model}
            accountView={accountView}
            onChange={onAccountViewChange}
            activePrograms={activePrograms}
            referralCodesByProgram={referralCodesByProgram}
            onTriggerReload={onTriggerReload}
          />
        ) : null}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
        gap: 4,
        padding: '6px 6px 8px',
        borderTop: '1px solid rgba(148,163,184,.15)',
        background: 'rgba(255,255,255,.94)',
        backdropFilter: 'blur(10px)'
      }}>
        {TAB_ITEMS.map(item => {
          const active = item.key === activeTab
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onTabChange(item.key)}
              style={{
                borderRadius: 12,
                border: 'none',
                background: active ? 'linear-gradient(145deg, rgba(251,113,133,.12), rgba(249,115,22,.1))' : 'transparent',
                color: active ? '#be185d' : '#64748b',
                padding: '6px 2px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <i className={`fa-solid ${item.icon}`} style={{ fontSize: '1.05rem' }} />
              <span style={{ fontSize: '.62rem', fontWeight: 800, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function CustomerLoyaltyMobileApp({
  mode = 'embedded',
  linkSession = null,
}) {
  const isStandalone = mode === 'standalone'
  const [customers, setCustomers] = useState([])
  const [selectedCustomerId, setSelectedCustomerId] = useState(() => readStoredMobileCustomer()?.id || '')
  const [snapshot, setSnapshot] = useState(null)
  const [activePrograms, setActivePrograms] = useState([])
  const [referralCodesByProgram, setReferralCodesByProgram] = useState({})
  const [reloadTrigger, setReloadTrigger] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingText, setLoadingText] = useState('Musteri profili hazirlaniyor...')
  const [errorText, setErrorText] = useState('')
  const [activeTab, setActiveTab] = useState('home')
  const [accountView, setAccountView] = useState('activity')
  const [searchText, setSearchText] = useState('')
  const [searchMatches, setSearchMatches] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchStatusText, setSearchStatusText] = useState('')
  const [searchErrorText, setSearchErrorText] = useState('')
  const [sessionState, setSessionState] = useState({
    channel: linkSession?.channel || '',
    session: null,
    loading: Boolean(linkSession?.token),
    linking: false,
    statusText: '',
    errorText: '',
  })
  const [lastLinkKey, setLastLinkKey] = useState('')
  const [selectedLinkCampaignId, setSelectedLinkCampaignId] = useState('')
  const [selectedLinkCouponId, setSelectedLinkCouponId] = useState('')
  const [appConfig, setAppConfig] = useState(getDefaultAppConfig())
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [activeOrderButton, setActiveOrderButton] = useState(null)
  const [showTableOrderEntry, setShowTableOrderEntry] = useState(false)
  const [tableNumberInput, setTableNumberInput] = useState('')

  useEffect(() => {
    let active = true

    async function loadCustomers() {
      setLoading(true)
      setErrorText('')
      setLoadingText(isStandalone ? 'Mobil hesaplar hazirlaniyor...' : 'Loyalty musterileri yukleniyor...')

      try {
        const roster = await loadCustomerRoster()
        if (!active) return
        setCustomers(roster)
        if (!isStandalone && !selectedCustomerId) {
          const defaultCustomer = pickDefaultCustomer(roster)
          if (defaultCustomer?.id) setSelectedCustomerId(defaultCustomer.id)
          else if (roster[0]?.id) setSelectedCustomerId(roster[0].id)
        }
      } catch (error) {
        if (!active) return
        setErrorText(error?.message || 'Musteri listesi okunamadi.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadCustomers()
    return () => { active = false }
  }, [isStandalone])

  useEffect(() => {
    let active = true
    loadCustomerAppConfig().then(config => {
      if (active) setAppConfig(config)
    }).catch(() => {})
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!linkSession?.token) {
      setSessionState({
        channel: '',
        session: null,
        loading: false,
        linking: false,
        statusText: '',
        errorText: '',
      })
      return
    }

    let active = true

    async function loadLinkState() {
      setSessionState(current => ({
        ...current,
        channel: linkSession.channel || '',
        loading: true,
        errorText: '',
      }))
      try {
        const nextSession = linkSession.channel === 'kiosk'
          ? await readKioskLoyaltyLinkSession(linkSession.token)
          : await readPosLoyaltyLinkSession(linkSession.token)
        if (!active) return
        setSessionState({
          channel: linkSession.channel || '',
          session: nextSession,
          loading: false,
          linking: false,
          statusText: nextSession?.status === 'linked' ? 'Bu oturumda musteri tanitimi tamamlanmis.' : '',
          errorText: nextSession ? '' : 'Bu baglanti bulunamadi veya suresi doldu.',
        })
        setSelectedLinkCampaignId(String(nextSession?.selectedCampaignId || ''))
        setSelectedLinkCouponId(String(nextSession?.selectedCouponCode || ''))
      } catch (error) {
        if (!active) return
        setSessionState({
          channel: linkSession.channel || '',
          session: null,
          loading: false,
          linking: false,
          statusText: '',
          errorText: error?.message || 'Baglanti okunamadi.',
        })
      }
    }

    loadLinkState()
    return () => { active = false }
  }, [linkSession?.channel, linkSession?.token])

  useEffect(() => {
    if (!selectedCustomerId) {
      setSnapshot(null)
      setLoading(false)
      return
    }

    let active = true

    async function loadSnapshot() {
      setLoading(true)
      setErrorText('')
      setLoadingText('Sadakat cuzdanı ve kampanyalar okunuyor...')
      try {
        const result = await loadCustomerMobileSnapshot(selectedCustomerId)
        if (!active) return
        setSnapshot(result)
        writeStoredMobileCustomer(normalizeStoredMobileCustomer(result.customer))

        // Load referral data
        try {
          const programs = await getActiveReferralPrograms()
          if (active) {
            setActivePrograms(programs)
          }
          const nextCodesByProgram = {}
          for (const program of programs) {
            const eligibility = checkReferralEligibility(result.customer, program)
            if (eligibility.eligible) {
              if (program.mode === 'unique_multiple') {
                const codes = await getReferrerCodes(selectedCustomerId, program.id)
                nextCodesByProgram[program.id] = codes
              } else if (!result.customer.referral_code) {
                // Auto generate single reusable code
                await generateReferralCode(selectedCustomerId, program.id)
                const updatedResult = await loadCustomerMobileSnapshot(selectedCustomerId)
                if (active) {
                  result.customer = updatedResult.customer
                  setSnapshot(updatedResult)
                  writeStoredMobileCustomer(normalizeStoredMobileCustomer(updatedResult.customer))
                }
              }
            }
          }
          if (active) {
            setReferralCodesByProgram(nextCodesByProgram)
          }
        } catch (refError) {
          console.error('Error loading referral info:', refError)
        }
      } catch (error) {
        if (!active) return
        if (isStandalone) {
          clearStoredMobileCustomer()
          setSelectedCustomerId('')
          setSnapshot(null)
          setSearchErrorText(error?.message || 'Musteri hesabi acilamadi.')
        } else {
          setErrorText(error?.message || 'Musteri sadakat verisi okunamadi.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    loadSnapshot()
    return () => { active = false }
  }, [isStandalone, selectedCustomerId, reloadTrigger])

  const model = useMemo(() => (
    snapshot ? buildCustomerMobileViewModel(snapshot) : null
  ), [snapshot])

  const quickCustomers = useMemo(() => customers.slice(0, 6), [customers])

  function activateCustomer(customer) {
    const normalized = normalizeStoredMobileCustomer(customer)
    if (!normalized?.id) return
    writeStoredMobileCustomer(normalized)
    setSelectedCustomerId(normalized.id)
    setSearchText('')
    setSearchMatches([])
      setSearchStatusText(`${normalized.ad_soyad || 'Musteri'} aktif hesaba alindi.`)
    setSearchErrorText('')
    setErrorText('')
    setActiveTab('home')
    setAccountView('activity')
  }

  function handleSimulationSelect(customerId) {
    setSelectedCustomerId(customerId)
    const customer = customers.find(item => String(item.id) === String(customerId))
    if (customer) writeStoredMobileCustomer(normalizeStoredMobileCustomer(customer))
  }

  async function handleSearch() {
    const query = searchText.trim()
    if (!query) {
      setSearchMatches([])
      setSearchStatusText('')
      setSearchErrorText('Aramak icin bir bilgi girin.')
      return
    }
    setSearching(true)
    setSearchStatusText('')
    setSearchErrorText('')
    try {
      const matches = await searchMobileCustomers(query)
      setSearchMatches(matches)
      if (!matches.length) setSearchStatusText('Eslesen musteri bulunamadi.')
    } catch (error) {
      setSearchMatches([])
      setSearchErrorText(error?.message || 'Musteri aramasi basarisiz.')
    } finally {
      setSearching(false)
    }
  }

  function handleLogout() {
    clearStoredMobileCustomer()
    setSelectedCustomerId('')
    setSnapshot(null)
    setActiveTab('home')
    setAccountView('activity')
    setSearchMatches([])
    setSearchText('')
    setSearchErrorText('')
    setSearchStatusText('Bu cihazdaki aktif hesap kapatildi.')
    setLastLinkKey('')
    setSessionState(current => ({
      ...current,
      linking: false,
      errorText: '',
      statusText: current.session ? 'Yeni giriste baglanti bu ekrandan devam eder.' : '',
    }))
  }

  const linkSelectionState = useMemo(() => {
    if (!model) {
      return {
        campaigns: [],
        coupons: [],
        selectedCampaignId: selectedLinkCampaignId,
        selectedCouponId: selectedLinkCouponId,
      }
    }

    const campaigns = model.campaigns
      .filter(item => item.activeNow && (item.personalized || item.bucket === 'public' || item.bucket === 'ending'))
      .sort((left, right) => {
        const leftScore = Number(left.personalized) * 10 + Number(left.bucket === 'ending') * 5 - Number(!left.mobileEligible)
        const rightScore = Number(right.personalized) * 10 + Number(right.bucket === 'ending') * 5 - Number(!right.mobileEligible)
        return rightScore - leftScore
      })

    return {
      campaigns,
      coupons: model.activeCoupons || [],
      selectedCampaignId: selectedLinkCampaignId,
      selectedCouponId: selectedLinkCouponId,
    }
  }, [model, selectedLinkCampaignId, selectedLinkCouponId])

  function handleSelectLinkCampaign(campaignId) {
    setSelectedLinkCampaignId(String(campaignId || ''))
  }

  function handleSelectLinkCoupon(couponId) {
    setSelectedLinkCouponId(String(couponId || ''))
  }

  async function connectLinkSession() {
    if (!linkSession?.token || !snapshot?.customer || !sessionState.session) return

    const selectedCampaign = linkSelectionState.campaigns.find(item => String(item.id) === String(selectedLinkCampaignId || '')) || null
    const selectedCoupon = linkSelectionState.coupons.find(item => String(item.code || '') === String(selectedLinkCouponId || '').toUpperCase()
      || String(item.id || '') === String(selectedLinkCouponId || '')) || null

    setSessionState(current => ({
      ...current,
      linking: true,
      errorText: '',
      statusText: 'Hesabiniz baglanti oturumuna tanitiliyor...',
    }))

    try {
      if (linkSession.channel === 'kiosk') {
        await selectCampaignInKioskLoyaltySession(linkSession.token, {
          campaignId: selectedCampaign?.id || '',
          campaignName: selectedCampaign?.name || '',
          couponCode: selectedCoupon?.code || '',
          couponLabel: selectedCoupon?.seriesName || '',
        })
        const customerCategoryIds = await loadCustomerLoyaltyCategoryIds(
          {
            branchId: sessionState.session.branchId || '',
            branchName: sessionState.session.branchName || '',
          },
          snapshot.customer.id,
        )
        await linkCustomerToKioskSession(linkSession.token, snapshot.customer, {
          customerCategoryIds,
          selectedCouponCode: selectedCoupon?.code || '',
          selectedCouponLabel: selectedCoupon?.seriesName || '',
        })
        const nextSession = await readKioskLoyaltyLinkSession(linkSession.token)
        setSessionState({
          channel: linkSession.channel,
          session: nextSession,
          loading: false,
          linking: false,
          statusText: `${snapshot.customer.ad_soyad || 'Musteri'} kiosk oturumuna tanitildi.${selectedCampaign ? ` Kampanya: ${selectedCampaign.name}.` : ''}${selectedCoupon ? ` Kupon: ${selectedCoupon.code || selectedCoupon.seriesName}.` : ''}`,
          errorText: '',
        })
      } else {
        await selectCampaignInPosLoyaltySession(linkSession.token, {
          campaignId: selectedCampaign?.id || '',
          campaignName: selectedCampaign?.name || '',
          couponCode: selectedCoupon?.code || '',
          couponLabel: selectedCoupon?.seriesName || '',
        })
        const nextSession = await linkCustomerToPosLoyaltySession(linkSession.token, snapshot.customer, {
          selectedCampaignId: selectedCampaign?.id || '',
          selectedCampaignName: selectedCampaign?.name || '',
          selectedCouponCode: selectedCoupon?.code || '',
          selectedCouponLabel: selectedCoupon?.seriesName || '',
        })
        setSessionState({
          channel: linkSession.channel,
          session: nextSession,
          loading: false,
          linking: false,
          statusText: `${snapshot.customer.ad_soyad || 'Musteri'} kasa oturumuna tanitildi.${selectedCampaign ? ` Kampanya: ${selectedCampaign.name}.` : ''}${selectedCoupon ? ` Kupon: ${selectedCoupon.code || selectedCoupon.seriesName}.` : ''}`,
          errorText: '',
        })
      }
      setLastLinkKey(`${linkSession.channel}:${linkSession.token}:${snapshot.customer.id}`)
    } catch (error) {
      setSessionState(current => ({
        ...current,
        loading: false,
        linking: false,
        statusText: '',
        errorText: error?.message || 'Baglanti tamamlanamadi.',
      }))
    }
  }

  async function handleToggleCampaign(campaignId) {
    if (!selectedCustomerId || !model) return
    
    const clickedCampaign = model.campaigns.find(c => String(c.id) === String(campaignId))
    if (!clickedCampaign) return

    const currentSelectedCampaignIds = model.customer.metadata?.selectedCampaignIds || []
    const isAlreadyActive = currentSelectedCampaignIds.includes(String(campaignId))

    let nextCampaignIds = []
    if (isAlreadyActive) {
      nextCampaignIds = currentSelectedCampaignIds.filter(id => String(id) !== String(campaignId))
    } else {
      const excl = resolveCampaignExclusivity(clickedCampaign)
      nextCampaignIds = currentSelectedCampaignIds.filter(id => {
        const otherCamp = model.campaigns.find(c => String(c.id) === String(id))
        if (!otherCamp) return false
        const otherExcl = resolveCampaignExclusivity(otherCamp)
        if (excl.stackable || otherExcl.stackable) return true
        if (excl.exclusionGroup === otherExcl.exclusionGroup) return false
        return true
      })
      nextCampaignIds.push(String(campaignId))

      const conflictingCouponIds = []
      for (const coupon of model.activeCoupons) {
        if (coupon.status !== 'reserved') continue
        const coupExcl = resolveCouponExclusivity(coupon, model.campaigns)
        if (!excl.stackable && !coupExcl.stackable && excl.exclusionGroup === coupExcl.exclusionGroup) {
          conflictingCouponIds.push(coupon.id)
        }
      }
      
      for (const id of conflictingCouponIds) {
        await updateCouponActivationStatus(id, 'available')
      }
    }

    await updateCustomerCampaignSelections(selectedCustomerId, nextCampaignIds)
    const result = await loadCustomerMobileSnapshot(selectedCustomerId)
    setSnapshot(result)

    if (sessionState.session && linkSession?.token) {
      const firstCampId = nextCampaignIds[0] || ''
      const firstCamp = model.campaigns.find(c => String(c.id) === String(firstCampId))
      const reservedCoupons = result.coupons.filter(c => c.redemption_status === 'reserved')
      const couponCodes = reservedCoupons.map(c => c.code).join(',')
      const couponLabel = reservedCoupons.map(c => c.seriesName || 'Kupon').join(', ')

      if (linkSession.channel === 'kiosk') {
        await selectCampaignInKioskLoyaltySession(linkSession.token, {
          campaignId: firstCampId,
          campaignName: firstCamp?.name || '',
          couponCode: couponCodes,
          couponLabel
        })
        const customerCategoryIds = await loadCustomerLoyaltyCategoryIds(
          { branchId: sessionState.session.branchId, branchName: sessionState.session.branchName },
          selectedCustomerId
        )
        await linkCustomerToKioskSession(linkSession.token, result.customer, {
          customerCategoryIds,
          selectedCouponCode: couponCodes,
          selectedCouponLabel: couponLabel,
          selectedCampaignId: firstCampId,
          selectedCampaignIds: nextCampaignIds
        })
      } else {
        await selectCampaignInPosLoyaltySession(linkSession.token, {
          campaignId: firstCampId,
          campaignName: firstCamp?.name || '',
          couponCode: couponCodes,
          couponLabel
        })
        await linkCustomerToPosLoyaltySession(linkSession.token, result.customer, {
          selectedCampaignId: firstCampId,
          selectedCampaignName: firstCamp?.name || '',
          selectedCouponCode: couponCodes,
          selectedCouponLabel: couponLabel,
          selectedCampaignIds: nextCampaignIds
        })
      }
    }
  }

  async function handleToggleCoupon(couponId) {
    if (!selectedCustomerId || !model) return

    const clickedCoupon = model.activeCoupons.find(c => String(c.id) === String(couponId))
    if (!clickedCoupon) return

    const isAlreadyActive = clickedCoupon.status === 'reserved'
    
    if (isAlreadyActive) {
      await updateCouponActivationStatus(couponId, 'available')
    } else {
      const excl = resolveCouponExclusivity(clickedCoupon, model.campaigns)
      
      const currentSelectedCampaignIds = model.customer.metadata?.selectedCampaignIds || []
      const nextCampaignIds = currentSelectedCampaignIds.filter(id => {
        const camp = model.campaigns.find(c => String(c.id) === String(id))
        if (!camp) return false
        const campExcl = resolveCampaignExclusivity(camp)
        if (excl.stackable || campExcl.stackable) return true
        if (excl.exclusionGroup === campExcl.exclusionGroup) return false
        return true
      })

      if (nextCampaignIds.length !== currentSelectedCampaignIds.length) {
        await updateCustomerCampaignSelections(selectedCustomerId, nextCampaignIds)
      }

      const conflictingCouponIds = []
      for (const coupon of model.activeCoupons) {
        if (coupon.status !== 'reserved' || String(coupon.id) === String(couponId)) continue
        const otherExcl = resolveCouponExclusivity(coupon, model.campaigns)
        if (!excl.stackable && !otherExcl.stackable && excl.exclusionGroup === otherExcl.exclusionGroup) {
          conflictingCouponIds.push(coupon.id)
        }
      }

      for (const id of conflictingCouponIds) {
        await updateCouponActivationStatus(id, 'available')
      }

      await updateCouponActivationStatus(couponId, 'reserved')
    }

    const result = await loadCustomerMobileSnapshot(selectedCustomerId)
    setSnapshot(result)

    if (sessionState.session && linkSession?.token) {
      const nextSelectedCampaignIds = result.customer.metadata?.selectedCampaignIds || []
      const firstCampId = nextSelectedCampaignIds[0] || ''
      const firstCamp = model.campaigns.find(c => String(c.id) === String(firstCampId))
      const reservedCoupons = result.coupons.filter(c => c.redemption_status === 'reserved')
      const couponCodes = reservedCoupons.map(c => c.code).join(',')
      const couponLabel = reservedCoupons.map(c => c.seriesName || 'Kupon').join(', ')

      if (linkSession.channel === 'kiosk') {
        await selectCampaignInKioskLoyaltySession(linkSession.token, {
          campaignId: firstCampId,
          campaignName: firstCamp?.name || '',
          couponCode: couponCodes,
          couponLabel
        })
        const customerCategoryIds = await loadCustomerLoyaltyCategoryIds(
          { branchId: sessionState.session.branchId, branchName: sessionState.session.branchName },
          selectedCustomerId
        )
        await linkCustomerToKioskSession(linkSession.token, result.customer, {
          customerCategoryIds,
          selectedCouponCode: couponCodes,
          selectedCouponLabel: couponLabel,
          selectedCampaignId: firstCampId,
          selectedCampaignIds: nextSelectedCampaignIds
        })
      } else {
        await selectCampaignInPosLoyaltySession(linkSession.token, {
          campaignId: firstCampId,
          campaignName: firstCamp?.name || '',
          couponCode: couponCodes,
          couponLabel
        })
        await linkCustomerToPosLoyaltySession(linkSession.token, result.customer, {
          selectedCampaignId: firstCampId,
          selectedCampaignName: firstCamp?.name || '',
          selectedCouponCode: couponCodes,
          selectedCouponLabel: couponLabel,
          selectedCampaignIds: nextSelectedCampaignIds
        })
      }
    }
  }

  async function handleAddCoupon(couponCode) {
    if (!selectedCustomerId) throw new Error('Müşteri seçilmemiş.')
    await bindCouponToCustomer(selectedCustomerId, couponCode)
    const result = await loadCustomerMobileSnapshot(selectedCustomerId)
    setSnapshot(result)
  }

  function renderBody() {
    if (loading) {
      return (
        <div style={{
          height: '100%',
          borderRadius: isStandalone ? 0 : 26,
          background: appConfig?.branding?.bodyBackgroundImageUrl
            ? `url(${appConfig.branding.bodyBackgroundImageUrl}) center/cover no-repeat fixed`
            : (appConfig?.branding?.bodyBackgroundColor || '#ffffff'),
          border: isStandalone ? 'none' : '1px solid rgba(226,232,240,.9)',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          textAlign: 'center',
        }}>
          <div style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 18, background: 'rgba(251,113,133,.12)', color: '#fb7185', display: 'grid', placeItems: 'center', fontSize: '1.3rem' }}>
              <i className="fa-solid fa-spinner fa-spin" />
            </div>
            <div style={{ fontWeight: 900, color: '#0f172a' }}>Musteri uygulamasi hazirlaniyor</div>
            <div style={{ fontSize: '.8rem', color: '#64748b', lineHeight: 1.6 }}>{loadingText}</div>
          </div>
        </div>
      )
    }

    if (!selectedCustomerId) {
      return (
        <LoginScreen
          loading={searching}
          searchText={searchText}
          onSearchTextChange={setSearchText}
          onSearch={handleSearch}
          matches={searchMatches}
          quickCustomers={quickCustomers}
          statusText={searchStatusText}
          errorText={searchErrorText}
          onSelectCustomer={activateCustomer}
          appConfig={appConfig}
        />
      )
    }

    if (errorText) {
      return (
        <div style={{
          height: '100%',
          borderRadius: isStandalone ? 0 : 26,
          background: appConfig?.branding?.bodyBackgroundImageUrl
            ? `url(${appConfig.branding.bodyBackgroundImageUrl}) center/cover no-repeat fixed`
            : (appConfig?.branding?.bodyBackgroundColor || '#ffffff'),
          border: isStandalone ? 'none' : '1px solid rgba(226,232,240,.9)',
          padding: 24,
          display: 'grid',
          alignContent: 'center',
          gap: 14,
          textAlign: 'center',
        }}>
          <div style={{ width: 60, height: 60, margin: '0 auto', borderRadius: 18, background: 'rgba(239,68,68,.12)', color: '#dc2626', display: 'grid', placeItems: 'center', fontSize: '1.5rem' }}>
            <i className="fa-solid fa-triangle-exclamation" />
          </div>
          <div style={{ fontWeight: 900, color: '#0f172a' }}>Musteri sadakat ekrani acilamadi</div>
          <div style={{ fontSize: '.82rem', color: '#64748b', lineHeight: 1.6 }}>{errorText}</div>
        </div>
      )
    }

    if (!model) return null

    return (
      <AppViewport
        model={model}
        activeTab={activeTab}
        accountView={accountView}
        onTabChange={next => {
          setActiveTab(next)
          if (next !== 'account') setAccountView('activity')
        }}
        onAccountViewChange={setAccountView}
        onLogout={handleLogout}
        sessionState={sessionState}
        selectionState={linkSelectionState}
        onSelectCampaign={handleSelectLinkCampaign}
        onSelectCoupon={handleSelectLinkCoupon}
        onConnectLink={() => { void connectLinkSession() }}
        onAddCoupon={handleAddCoupon}
        onToggleCampaign={handleToggleCampaign}
        onToggleCoupon={handleToggleCoupon}
        standalone={isStandalone}
        activePrograms={activePrograms}
        referralCodesByProgram={referralCodesByProgram}
        onTriggerReload={() => setReloadTrigger(prev => prev + 1)}
        appConfig={appConfig}
        onOrderAction={(btn) => {
          setActiveOrderButton(btn)
          setShowOrderModal(true)
        }}
      />
    )
  }

  if (isStandalone) {
    return (
      <div style={{
        height: '100svh',
        width: '100%',
        maxWidth: 430,
        margin: '0 auto',
        background: appConfig?.branding?.bodyBackgroundImageUrl
          ? `url(${appConfig.branding.bodyBackgroundImageUrl}) center/cover no-repeat fixed`
          : (appConfig?.branding?.bodyBackgroundColor || '#f8fafc'),
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {renderBody()}
        <OrderTypeModal
          visible={showOrderModal}
          onClose={(action) => {
            setShowOrderModal(false)
            if (action === 'table_order') setShowTableOrderEntry(true)
          }}
          orderButtonConfig={activeOrderButton}
        />
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {customers.length > 0 ? (
        <div className="card" style={{ padding: 18, borderColor: 'rgba(251,113,133,.22)', background: 'linear-gradient(135deg, rgba(251,113,133,.09), rgba(255,255,255,.98))' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '.76rem', color: '#be185d', fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase' }}>
                Musteri Simulasyonu
              </div>
              <div style={{ marginTop: 8, color: '#475569', fontSize: '.9rem', lineHeight: 1.65 }}>
                Telefon ici deneyim canli musteri ve loyalty verilerini okur. Bu secici yalnizca admin simulasyonunda gorunur.
              </div>
            </div>
            <div style={{ minWidth: 260 }}>
              <select
                className="f-input"
                value={selectedCustomerId || ''}
                onChange={event => handleSimulationSelect(event.target.value)}
                style={{ background: '#fff', fontWeight: 700 }}
              >
                {customers.map(customer => (
                  <option key={customer.id} value={customer.id}>
                    {customer.ad_soyad} {customer.loyalty_member_no ? `- ${customer.loyalty_member_no}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <PhoneChrome>{renderBody()}</PhoneChrome>
      </div>
    </div>
  )
}
