import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWorkspace } from '@/context/WorkspaceContext'
import { db } from '@/lib/db'
import {
  KIOSK_DEFAULT_SETTINGS,
  asUuidOrNull,
  consumeKioskLoyaltyLinkSession,
  createKioskLoyaltyLinkSession,
  evaluateCheckoutSuggestion,
  evaluateCoupon,
  getKioskChannelPrice,
  getKioskChannelPriceEntry,
  getKioskLoyaltyUrl,
  getKioskOperatingState,
  getNextKioskDisplayNo,
  loadKioskDeviceStationCode,
  loadKioskSettings,
  matchProductSuggestion,
  readKioskLoyaltyLinkSession,
  resolveKioskCategories,
  resolveKioskDeviceStation,
  saveKioskDeviceStationCode,
  linkCustomerToKioskSession,
} from '@/lib/kioskSettings'
import {
  lookupCustomerByQrCode,
  revertExpiredCouponReservations,
} from '@/lib/mobileCustomerApp'
import { loadCustomerLoyaltyCategoryIds } from '@/lib/posCustomerLink'
import {
  ensureComboMenuCategory,
  resolveComboMenuCategoryId,
  sortSaleCategoriesWithComboFirst,
} from '@/lib/comboMenuCategory'
import { displayText, repairTurkishText } from '@/lib/turkishText'
import {
  evaluateRuntimeOrderCampaignsAsync,
  evaluateRuntimeOrderCampaigns,
  loadCachedRuntimeLoyaltyCampaignCatalog,
} from '@/lib/posLoyalty'
import {
  attachLoyaltyToSaleHeader,
  attachLoyaltyToSaleLines,
  createSaleLoyaltySnapshot,
  isLoyaltyPersistenceColumnError,
  resolveSaleDiscountType,
} from '@/lib/checkoutLoyalty'
import { resolvePreparedLoyaltyAdvantage } from '@/lib/loyaltyPreparedAdvantage'
import { postSaleLoyaltyValueLedger } from '@/lib/loyaltyValueLedger'
import { buildExpandedComboPayload, findComboDefinitionForProduct } from '@/components/pos/ComboBuilderModal'

// ---- constants ----
const CANVAS_W = 480
const CANVAS_H = 854
const COUPON_KEYS = [
  ['1', '2', '3', '4', '5', '6'],
  ['7', '8', '9', '0', 'Q', 'W'],
  ['E', 'R', 'T', 'Y', 'U', 'I'],
  ['O', 'P', 'A', 'S', 'D', 'F'],
  ['G', 'H', 'J', 'K', 'L', 'DEL'],
  ['Z', 'X', 'C', 'V', 'B', 'N'],
  ['M', '-', 'CLR', 'OK'],
]
const CART_DOCK_MIN_Y = 116
const CART_DOCK_POINTER_OFFSET = 46
const CART_DOCK_BOTTOM_GAP = 96
const SECRET_STATION_UNLOCK_TAP_COUNT = 7
const SECRET_STATION_UNLOCK_WINDOW_MS = 4000
const CART_DOCK_SIZE = 88
const CART_DOCK_RIGHT = 8
const CART_DOCK_VIEWPORT_MARGIN_RATIO = 6
const CART_MOVE_DURATION_MS = 520
const CART_FLY_DURATION_MS = 1000
const CART_PULSE_DURATION_MS = 760

function PreparedAdvantageCard({ preparedAdvantage, statusText = '', accentColor = '#f59e0b' }) {
  if (!preparedAdvantage?.hasPreparedAdvantage) return null

  return (
    <div style={{ borderRadius: 16, padding: '12px 14px', background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.18)', display: 'grid', gap: 8 }}>
      <div style={{ color: '#92400e', fontSize: '.72rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em' }}>
        Mobilde seçildi
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {preparedAdvantage.hasPreparedCampaign ? (
          <div style={{ padding: '6px 10px', borderRadius: 999, background: 'rgba(245,158,11,.14)', color: '#9a3412', fontSize: '.74rem', fontWeight: 800 }}>
            {`Kampanya: ${preparedAdvantage.resolvedSelectedCampaignName}`}
          </div>
        ) : null}
        {preparedAdvantage.hasPreparedCoupon ? (
          <div style={{ padding: '6px 10px', borderRadius: 999, background: 'rgba(59,130,246,.12)', color: '#1d4ed8', fontSize: '.74rem', fontWeight: 800 }}>
            {`Kupon: ${preparedAdvantage.resolvedSelectedCouponLabel}`}
          </div>
        ) : null}
      </div>
      <div style={{ color: accentColor, fontSize: '.78rem', fontWeight: 800 }}>
        {statusText}
      </div>
    </div>
  )
}
const CART_CHECK_DURATION_MS = 680
const DRAWER_OPEN_MS = 560
const DRAWER_CLOSE_MS = 420
const DRAWER_OVERLAY_OPEN_MS = 440
const DRAWER_OVERLAY_CLOSE_MS = 360
const CATEGORY_SYNC_LOCK_MS = 640
const CATEGORY_SYNC_RELEASE_DELTA = 18

function getViewportMetrics() {
  if (typeof window === 'undefined') {
    return { width: CANVAS_W, height: CANVAS_H, offsetTop: 0, offsetLeft: 0 }
  }
  const viewport = window.visualViewport
  if (viewport?.width && viewport?.height) {
    return {
      width: viewport.width,
      height: viewport.height,
      offsetTop: viewport.offsetTop || 0,
      offsetLeft: viewport.offsetLeft || 0,
    }
  }
  return {
    width: window.innerWidth || document.documentElement?.clientWidth || CANVAS_W,
    height: window.innerHeight || document.documentElement?.clientHeight || CANVAS_H,
    offsetTop: 0,
    offsetLeft: 0,
  }
}

function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}
function fmt(n) { return (parseFloat(n) || 0).toFixed(2) }
function roundMoney(n) { return Math.round((parseFloat(n) || 0) * 100) / 100 }
function tl(n) { return `${fmt(n)} TL` }
function maskCustomerName(name = '') {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  return parts.map(part => `${part.slice(0, 1).toLocaleUpperCase('tr-TR')}**`).join(' ')
}

function buildGiftStatusLabel(giftQty = 0, totalQty = 0, campaignName = '') {
  if (giftQty <= 0) return ''
  const safeCampaignName = displayText(String(campaignName || '').trim(), 'Sadakat kampanyası')
  if (giftQty >= totalQty) return `Hediye: ${safeCampaignName}`
  return `Hediye: ${giftQty} adet ${safeCampaignName}`
}
function allocateDiscountAcrossLines(lines = [], totalDiscount = 0) {
  const safeDiscount = roundMoney(Math.max(0, totalDiscount))
  if (safeDiscount <= 0 || !Array.isArray(lines) || lines.length === 0) {
    return Array.isArray(lines) ? lines.map(() => 0) : []
  }
  const totalGross = roundMoney(lines.reduce((sum, line) => sum + roundMoney((line?.unitPrice || 0) * (line?.qty || 0)), 0))
  if (totalGross <= 0) return lines.map(() => 0)

  let remainingDiscount = Math.min(safeDiscount, totalGross)
  let remainingGross = totalGross

  return lines.map((line, index) => {
    const lineGross = roundMoney((line?.unitPrice || 0) * (line?.qty || 0))
    if (lineGross <= 0 || remainingDiscount <= 0 || remainingGross <= 0) return 0
    if (index === lines.length - 1) return roundMoney(Math.min(lineGross, remainingDiscount))
    const allocated = roundMoney(Math.min(lineGross, remainingDiscount * (lineGross / remainingGross)))
    remainingDiscount = roundMoney(remainingDiscount - allocated)
    remainingGross = roundMoney(remainingGross - lineGross)
    return allocated
  })
}
function hexToRgb(hex) {
  const normalized = String(hex || '').replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  }
}
function rgba(hex, alpha) {
  const rgb = hexToRgb(hex)
  if (!rgb) return `rgba(15,23,42,${alpha})`
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`
}

function cardSurface(color = '#ffffff') {
  return {
    background: color,
    border: '1px solid rgba(15,23,42,.08)',
    boxShadow: '0 18px 36px rgba(15,23,42,.08)',
  }
}

function PromoBannerCard({ title, subtitle, image, tone, compact = false, onClick = null }) {
  return (
    <button
      type="button"
      onClick={onClick || undefined}
      style={{
        ...cardSurface('#fff'),
        minHeight: compact ? 62 : 122,
        borderRadius: 20,
        overflow: 'hidden',
        display: 'grid',
        gridTemplateColumns: compact && image ? '1fr 92px' : '1fr',
        background: tone,
        position: 'relative',
        animation: 'altBannerIn 420ms cubic-bezier(.2,.8,.2,1)',
        width: '100%',
        border: 'none',
        padding: 0,
        textAlign: 'left',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          background: 'linear-gradient(100deg, transparent 0%, rgba(255,255,255,.22) 50%, transparent 100%)',
          transform: 'translateX(-120%)',
          animation: 'altSheen 5.2s ease-in-out infinite',
          pointerEvents: 'none',
        }}
      />
      {compact ? <div style={{ padding: 10, color: '#fff', display: 'grid', alignContent: 'space-between', position: 'relative', zIndex: 2 }}>
        <div>
          <div style={{ fontSize: compact ? '.68rem' : '.72rem', fontWeight: 900, letterSpacing: '.1em', textTransform: 'uppercase', opacity: .92 }}>
            {displayText('Öneri')}
          </div>
          <div style={{ marginTop: compact ? 4 : 8, fontSize: compact ? '.88rem' : '1.08rem', lineHeight: 1.02, fontWeight: 900 }}>
            {title}
          </div>
        </div>
        {subtitle ? <div style={{ marginTop: 8, fontSize: '.74rem', lineHeight: 1.35, opacity: .92 }}>{subtitle}</div> : null}
      </div> : null}
      {image ? <img src={image} alt={title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : null}
    </button>
  )
}

function FlyImage({ flyer, accentColor = '#f59e0b' }) {
  const imageRef = useRef(null)

  useEffect(() => {
    const node = imageRef.current
    if (!flyer || !node) return undefined

    const animation = node.animate([
      { transform: 'translate3d(0, 0, 0) scale(1)', opacity: .96 },
      { transform: `translate3d(${flyer.curveX}px, ${flyer.curveY}px, 0) scale(.82)`, opacity: .9, offset: 0.64 },
      { transform: `translate3d(${flyer.tx}px, ${flyer.ty}px, 0) scale(.38)`, opacity: .06 },
    ], {
      duration: CART_FLY_DURATION_MS,
      easing: 'cubic-bezier(.2,.76,.22,1)',
      fill: 'forwards',
    })

    return () => animation.cancel()
  }, [flyer])

  if (!flyer) return null
  const flySize = Math.max(28, flyer.size || 36)
  return (
    <div
      ref={imageRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        left: flyer.x,
        top: flyer.y,
        width: flySize,
        height: flySize,
        borderRadius: 999,
        pointerEvents: 'none',
        zIndex: 9999,
        transform: 'translate3d(0,0,0) scale(1)',
        transformOrigin: 'center center',
        opacity: .96,
        willChange: 'transform, opacity',
        background: `radial-gradient(circle at 30% 28%, rgba(255,255,255,.95) 0%, ${accentColor} 46%, rgba(249,115,22,.96) 100%)`,
        border: '1px solid rgba(255,255,255,.66)',
        boxShadow: `0 16px 30px ${rgba(accentColor, .34)}, 0 0 0 3px ${rgba('#ffffff', .28)} inset`,
      }}
    />
  )
}

function CategoryRailButton({ category, active, accent, onClick, buttonRef, height, showLabel = true }) {
  const imageUrl = category?.kioskImageUrl || ''

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      style={{
        ...cardSurface(active ? rgba(accent, .16) : '#fff'),
        width: '100%',
        minWidth: 0,
        minHeight: height,
        boxSizing: 'border-box',
        borderRadius: 18,
        border: active ? `1px solid ${rgba(accent, .68)}` : '1px solid rgba(15,23,42,.08)',
        cursor: 'pointer',
        padding: showLabel ? 6 : 0,
        display: 'grid',
        gap: showLabel ? 6 : 0,
        alignContent: 'stretch',
        color: '#0f172a',
        boxShadow: active ? `0 18px 32px ${rgba(accent, .28)}, 0 0 0 3px ${rgba('#ffffff', .78)} inset` : '0 10px 18px rgba(15,23,42,.06)',
        overflow: 'hidden',
        transform: active ? 'translate3d(0,-2px,0) scale(1.035)' : 'translate3d(0,0,0) scale(1)',
        transition: 'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease, background 180ms ease',
        position: 'relative',
        isolation: 'isolate',
        background: active
          ? `linear-gradient(180deg, ${rgba('#fff8dc', .98)} 0%, ${rgba('#ffffff', .94)} 26%, ${rgba(accent, .14)} 100%)`
          : '#fff',
      }}
    >
      {active ? (
        <>
          <div style={{ position: 'absolute', inset: 0, borderRadius: 18, background: `linear-gradient(135deg, ${rgba('#fff', .66)} 0%, rgba(255,255,255,0) 38%, ${rgba(accent, .12)} 100%)`, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: 6, right: 6, top: 5, height: 3, borderRadius: 999, background: `linear-gradient(90deg, ${rgba('#fff4b8', .1)} 0%, ${rgba('#fff4b8', .95)} 30%, ${rgba('#fff4b8', .1)} 100%)`, boxShadow: `0 0 14px ${rgba('#fff4b8', .7)}`, pointerEvents: 'none' }} />
        </>
      ) : null}
      <div
        style={{
          width: '100%',
          height: showLabel ? 'auto' : '100%',
          aspectRatio: showLabel ? '1 / 1' : undefined,
          borderRadius: showLabel ? 14 : 18,
          overflow: 'hidden',
          background: active ? rgba(accent, .12) : 'linear-gradient(135deg,#fff4d4,#f8fafc)',
          display: 'grid',
          placeItems: 'center',
          border: showLabel ? (active ? `1px solid ${rgba(accent, .24)}` : '1px solid rgba(15,23,42,.06)') : 'none',
          boxShadow: active ? `inset 0 1px 0 ${rgba('#fff', .72)}, 0 8px 18px ${rgba(accent, .18)}` : 'none',
        }}
      >
        {imageUrl ? (
          <img src={imageUrl} alt={category.kioskButtonLabel || category.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ width: 28, height: 28, borderRadius: 999, background: active ? accent : '#ffe9bf', display: 'grid', placeItems: 'center', color: active ? '#fff' : '#8a5a00', fontSize: '.76rem', fontWeight: 900 }}>
            {String(category.name || '?').slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>
      {showLabel ? (
        <div style={{ display: 'grid', gap: 4, justifyItems: 'center' }}>
          <div style={{ fontSize: '.66rem', fontWeight: active ? 900 : 800, lineHeight: 1.15, textAlign: 'center', color: active ? '#7c2d12' : '#0f172a', textShadow: active ? `0 1px 0 ${rgba('#fff', .85)}` : 'none' }}>
            {category.kioskButtonLabel || category.name}
          </div>
          {active ? (
            <div style={{ minHeight: 16, padding: '0 8px', borderRadius: 999, background: `linear-gradient(180deg, ${rgba('#fff7cc', .98)} 0%, ${rgba('#fde68a', .96)} 100%)`, color: '#7c2d12', fontSize: '.52rem', letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 900, display: 'grid', placeItems: 'center', boxShadow: `0 6px 12px ${rgba(accent, .2)}` }}>
              Secili
            </div>
          ) : null}
        </div>
      ) : null}
    </button>
  )
}

function KioskMotionStyles() {
  return (
    <style>{`
      @keyframes altHeroRise {
        from { opacity: 0; transform: translateY(18px) scale(.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes altPulse {
        0%, 100% { transform: scale(1); box-shadow: 0 20px 44px rgba(0,0,0,.34); }
        50% { transform: scale(1.04); box-shadow: 0 24px 54px rgba(0,0,0,.38); }
      }
      @keyframes altBannerIn {
        from { opacity: 0; transform: translateY(14px) scale(.985); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes altCardIn {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes altFlyArc {
        0% { transform: translate3d(0, 0, 0) scale(1) rotate(0deg); opacity: 1; filter: blur(0px); }
        28% { transform: translate3d(calc(var(--fly-curve-x) * .62), calc(var(--fly-curve-y) * .78), 0) scale(.92) rotate(-3deg); opacity: .99; filter: blur(.2px); }
        56% { transform: translate3d(var(--fly-curve-x), var(--fly-curve-y), 0) scale(.72) rotate(-9deg); opacity: .96; filter: blur(.5px); }
        84% { transform: translate3d(var(--fly-settle-x), var(--fly-settle-y), 0) scale(.38) rotate(-15deg); opacity: .74; filter: blur(.9px); }
        100% { transform: translate3d(var(--fly-x), var(--fly-y), 0) scale(.18) rotate(-18deg); opacity: .08; filter: blur(1.2px); }
      }
      @keyframes altCartPulse {
        0% { transform: scale(1); }
        24% { transform: scale(1.18); }
        58% { transform: scale(.96); }
        100% { transform: scale(1); }
      }
      @keyframes altCartFloat {
        0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); }
        32% { transform: translate3d(-1px, -2px, 0) rotate(-2deg); }
        68% { transform: translate3d(1px, 1px, 0) rotate(2deg); }
      }
      @keyframes altCartWave {
        0% { transform: scale(.78); opacity: 0; }
        18% { opacity: .26; }
        100% { transform: scale(1.82); opacity: 0; }
      }
      @keyframes altCartConfirm {
        0% { opacity: 0; transform: scale(.28) rotate(-16deg); }
        22% { opacity: 1; transform: scale(1.16) rotate(0deg); }
        68% { opacity: 1; transform: scale(1) rotate(0deg); }
        100% { opacity: 0; transform: scale(.82) rotate(8deg); }
      }
      @keyframes altCartConfirmRing {
        0% { transform: scale(.54); opacity: 0; }
        18% { opacity: .34; }
        100% { transform: scale(1.66); opacity: 0; }
      }
      @keyframes altDrawerOverlayIn {
        0% { opacity: 0; backdrop-filter: blur(0px); }
        100% { opacity: 1; backdrop-filter: blur(14px); }
      }
      @keyframes altDrawerOverlayOut {
        0% { opacity: 1; backdrop-filter: blur(14px); }
        100% { opacity: 0; backdrop-filter: blur(0px); }
      }
      @keyframes altDrawerIn {
        0% { opacity: 0; transform: translate3d(72px, 0, 0) scale(.94); }
        54% { opacity: 1; transform: translate3d(-14px, 0, 0) scale(1.012); }
        78% { opacity: 1; transform: translate3d(4px, 0, 0) scale(.998); }
        100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
      }
      @keyframes altDrawerOut {
        0% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
        28% { opacity: 1; transform: translate3d(-4px, 0, 0) scale(.994); }
        100% { opacity: 0; transform: translate3d(48px, 0, 0) scale(.96); }
      }
      @keyframes altDrawerSideIn {
        0% { opacity: 0; transform: translate3d(22px, -50%, 0) scale(.94); }
        62% { opacity: 1; transform: translate3d(-6px, -50%, 0) scale(1.02); }
        100% { opacity: 1; transform: translate3d(0, -50%, 0) scale(1); }
      }
      @keyframes altDrawerSideOut {
        0% { opacity: 1; transform: translate3d(0, -50%, 0) scale(1); }
        100% { opacity: 0; transform: translate3d(30px, -50%, 0) scale(.94); }
      }
      @keyframes altSheen {
        0% { transform: translateX(-120%); opacity: 0; }
        22% { opacity: .28; }
        100% { transform: translateX(160%); opacity: 0; }
      }
    `}</style>
  )
}

function idsEqual(left, right) {
  const normalizedLeft = String(left ?? '').trim()
  const normalizedRight = String(right ?? '').trim()
  return Boolean(normalizedLeft) && normalizedLeft === normalizedRight
}

function parseJsonValue(value, fallback = null) {
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

function readComboRecords(settingsRow) {
  const parsed = parseJsonValue(settingsRow?.value, settingsRow?.value)
  if (Array.isArray(parsed)) return parsed
  if (Array.isArray(parsed?.records)) return parsed.records
  return []
}

function buildKioskComboProducts(comboDefinitions = [], saleItems = [], kioskChannelId = null, comboCategoryId = null) {
  const productMap = new Map((saleItems || []).map(item => [String(item.id), item]))

  return (comboDefinitions || [])
    .filter(combo => combo?.active !== false && !combo?.deleted)
    .map(combo => {
      const form = combo?.form || {}
      const groups = Array.isArray(combo?.groups) ? combo.groups : []
      const config = kioskChannelId ? combo?.channelConfig?.[String(kioskChannelId)] || {} : {}
      const baseTotal = groups.reduce((sum, group) => {
        const item = productMap.get(String(group?.primaryItemId || ''))
        return sum + getKioskChannelPrice(item, kioskChannelId)
      }, 0)

      const pricingStrategy = form.pricingStrategy || 'set-price'
      let price = baseTotal
      if (pricingStrategy === 'percent') {
        const percent = Number(config.percent ?? form.defaultPercent) || 0
        price = Math.max(baseTotal * (1 - percent / 100), 0)
      } else if (pricingStrategy === 'fixed') {
        const fixed = Number(config.fixed ?? form.defaultFixed) || 0
        price = Math.max(baseTotal - fixed, 0)
      } else {
        price = Number(config.comboPrice ?? form.defaultComboPrice) || 0
      }

      return {
        id: `combo-${combo.id}`,
        comboDefinitionId: String(combo.id),
        is_combo_menu: true,
        name: combo.name || form.name || 'Combo Menu',
        sku: combo.sku || form.sku || '',
        sale_cat_l1: null,
        sale_cat_l2: null,
        sale_cat_l3: null,
        sale_cat_l4: null,
        sale_cat_l5: comboCategoryId || form.catId || combo.catId || null,
        standard_price: roundMoney(price),
        channel_prices: kioskChannelId ? [{ channel_id: kioskChannelId, price: roundMoney(price), active: config.active !== false }] : [],
        portions: [],
        option_groups: [],
        channel_image: form.channel_image || null,
        channel_description: form.channel_description || '',
        prep_time_minutes: 0,
      }
    })
}

function extractSelectionRules(options) {
  const list = Array.isArray(options) ? options : []
  const meta = list.find(item => item && item.__meta_type === 'selection_rules')
  return {
    minSelect: Math.max(0, parseInt(meta?.min_select, 10) || 0),
    maxSelect: Math.max(0, parseInt(meta?.max_select, 10) || 1),
    options: list.filter(item => item?.__meta_type !== 'selection_rules'),
  }
}

function getChannelBasePrice(item, channelId) {
  const rows = parseJsonValue(item?.channel_prices, [])
  const match = (rows || []).find(entry => String(entry?.channel_id) === String(channelId) && entry?.active !== false)
  return parseFloat(match?.price) || parseFloat(item?.standard_price) || 0
}

function getKioskComboAlternativeDelta(comboDefinition, group, selectedItemId, channelId, itemMap) {
  if (!selectedItemId || String(selectedItemId) === String(group?.primaryItemId || '')) return 0
  const alternative = (group?.alternatives || []).find(item => String(item?.itemId || '') === String(selectedItemId))
  if (!alternative) return 0

  const primary = itemMap.get(String(group?.primaryItemId || ''))
  const selected = itemMap.get(String(selectedItemId))
  return Math.max(0, roundMoney(getKioskChannelPrice(selected, channelId) - getKioskChannelPrice(primary, channelId)))
}

function buildKioskOptionSteps(comboDefinition, optionGroupDefs, groupSelections) {
  const defsById = new Map()
  for (const def of optionGroupDefs || []) {
    if (def.id) defsById.set(String(def.id), def)
    if (def.slug) defsById.set(String(def.slug), def)
    if (def.name) defsById.set(normalizeText(def.name), def)
    if (def.group_name) defsById.set(normalizeText(def.group_name), def)
  }
  const steps = []

  for (const group of comboDefinition?.groups || []) {
    steps.push({ type: 'group', group })
    const selectedItemId = groupSelections[String(group.id)]
    if (!selectedItemId) continue

    for (const link of group.optionGroups || []) {
      const optionGroupId = String(link?.optionGroupId || link?.option_group_id || '')
      const def = defsById.get(optionGroupId) || defsById.get(normalizeText(optionGroupId))
      if (!def) continue
      steps.push({
        type: 'option',
        scope: 'group',
        key: `group:${group.id}:${optionGroupId}`,
        groupId: String(group.id),
        def,
      })
    }
  }

  for (const link of comboDefinition?.form?.comboOptionGroups || []) {
    const optionGroupId = String(link?.optionGroupId || link?.option_group_id || '')
    const def = defsById.get(optionGroupId) || defsById.get(normalizeText(optionGroupId))
    if (!def) continue
    steps.push({
      type: 'option',
      scope: 'combo',
      key: `combo:${comboDefinition?.id || 'combo'}:${optionGroupId}`,
      groupId: null,
      def,
    })
  }

  return steps
}

function KioskComboModal({ comboProduct, comboDefinition, saleItems, optionGroupDefs, channelId, onClose, onConfirm }) {
  const itemMap = useMemo(
    () => new Map((saleItems || []).map(item => [String(item.id), item])),
    [saleItems]
  )
  const [groupSelections, setGroupSelections] = useState({})
  const [optionSelections, setOptionSelections] = useState({})
  const [stepIndex, setStepIndex] = useState(0)
  const [qty, setQty] = useState(1)
  const [isClosing, setIsClosing] = useState(false)
  const closeTimerRef = useRef(null)

  useEffect(() => {
    const defaults = {}
    for (const group of comboDefinition?.groups || []) {
      if (group?.primaryItemId) defaults[String(group.id)] = String(group.primaryItemId)
    }
    setGroupSelections(defaults)
    setOptionSelections({})
    setStepIndex(0)
    setQty(1)
  }, [comboDefinition])

  useEffect(() => () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
  }, [])

  const steps = useMemo(
    () => buildKioskOptionSteps(comboDefinition, optionGroupDefs, groupSelections),
    [comboDefinition, optionGroupDefs, groupSelections]
  )
  const currentStep = steps[stepIndex] || null

  const calculation = useMemo(
    () => buildExpandedComboPayload({
      comboProduct,
      comboDefinition,
      channelId,
      saleItems,
      optionGroupDefs,
      groupSelections,
      optionSelections,
    }),
    [channelId, comboDefinition, comboProduct, groupSelections, optionGroupDefs, optionSelections, saleItems]
  )
  const kioskAlternativeTotal = useMemo(
    () => (comboDefinition?.groups || []).reduce((sum, group) => (
      sum + getKioskComboAlternativeDelta(
        comboDefinition,
        group,
        groupSelections[String(group.id)],
        channelId,
        itemMap
      )
    ), 0),
    [channelId, comboDefinition, groupSelections, itemMap]
  )
  const kioskComboUnitPrice = useMemo(
    () => roundMoney(Math.max(0, (calculation.comboBasePrice || 0) + kioskAlternativeTotal + ((calculation.comboLevelOptions || []).reduce((sum, option) => sum + (parseFloat(option.price) || 0), 0)))),
    [calculation.comboBasePrice, calculation.comboLevelOptions, kioskAlternativeTotal]
  )
  const kioskExpandedLines = useMemo(() => {
    const lines = calculation.expandedLines || []
    if (!lines.length) return []
    const realTotal = lines.reduce((sum, item) => sum + (parseFloat(item.baseUnitPrice) || 0), 0)
    let allocated = 0
    return lines.map((line, index) => {
      const isLast = index === lines.length - 1
      const unitPrice = isLast
        ? roundMoney(kioskComboUnitPrice - allocated)
        : roundMoney(realTotal > 0 ? ((parseFloat(line.baseUnitPrice) || 0) / realTotal) * kioskComboUnitPrice : kioskComboUnitPrice / Math.max(lines.length, 1))
      allocated = roundMoney(allocated + unitPrice)
      return {
        ...line,
        unitPrice: Math.max(0, unitPrice),
      }
    })
  }, [calculation.expandedLines, kioskComboUnitPrice])

  const summaryLines = useMemo(() => {
    const lines = []
    for (const group of comboDefinition?.groups || []) {
      const selectedId = String(groupSelections[String(group.id)] || '')
      const item = itemMap.get(selectedId)
      if (item?.name) lines.push({ title: item.name, active: currentStep?.type === 'group' && String(currentStep.group?.id || '') === String(group.id) })
      const groupOptionSteps = steps.filter(step => step.type === 'option' && step.scope === 'group' && step.groupId === String(group.id))
      for (const step of groupOptionSteps) {
        const rules = extractSelectionRules(parseJsonValue(step.def?.options, []))
        const selectedIds = optionSelections[step.key] || []
        const selectedOptions = rules.options.filter(option => selectedIds.includes(String(option.option_id || option.id || option.name)))
        for (const option of selectedOptions) lines.push({ title: option.name || 'Seçenek', active: currentStep?.type === 'option' && currentStep.key === step.key })
      }
    }
    const comboSteps = steps.filter(step => step.type === 'option' && step.scope === 'combo')
    for (const step of comboSteps) {
      const rules = extractSelectionRules(parseJsonValue(step.def?.options, []))
      const selectedIds = optionSelections[step.key] || []
      const selectedOptions = rules.options.filter(option => selectedIds.includes(String(option.option_id || option.id || option.name)))
      for (const option of selectedOptions) lines.push({ title: option.name || 'Seçenek', active: currentStep?.type === 'option' && currentStep.key === step.key })
    }
    return lines
  }, [comboDefinition, currentStep, groupSelections, itemMap, optionSelections, steps])

  const canAdvance = useMemo(() => {
    if (!currentStep) return false
    if (currentStep.type === 'group') return Boolean(groupSelections[String(currentStep.group.id)])
    const rules = extractSelectionRules(parseJsonValue(currentStep.def?.options, []))
    const selectedIds = optionSelections[currentStep.key] || []
    const maxSelect = rules.maxSelect > 0 ? rules.maxSelect : Number.POSITIVE_INFINITY
    return selectedIds.length >= rules.minSelect && selectedIds.length <= maxSelect
  }, [currentStep, groupSelections, optionSelections])

  function closeWithAnimation(callback) {
    if (isClosing) return
    setIsClosing(true)
    closeTimerRef.current = window.setTimeout(() => callback?.(), DRAWER_CLOSE_MS)
  }

  function toggleOption(step, optionId, maxSelect) {
    setOptionSelections(current => {
      const currentIds = current[step.key] || []
      
      if (maxSelect <= 1) {
        const count = currentIds.filter(id => id === optionId).length
        return count > 0 
          ? { ...current, [step.key]: currentIds.filter(id => id !== optionId) }
          : { ...current, [step.key]: [optionId] }
      }

      if (maxSelect > 0 && currentIds.length >= maxSelect) return current
      return { ...current, [step.key]: [...currentIds, optionId] }
    })
  }

  function removeOption(step, optionId) {
    setOptionSelections(current => {
      const currentIds = current[step.key] || []
      const index = currentIds.lastIndexOf(optionId)
      if (index === -1) return current
      const nextIds = [...currentIds]
      nextIds.splice(index, 1)
      return { ...current, [step.key]: nextIds }
    })
  }

  function handleSubmit() {
    closeWithAnimation(() => onConfirm?.({
      unitPrice: kioskComboUnitPrice,
      qty,
      comboBundle: {
        comboId: comboDefinition?.id,
        comboSku: comboDefinition?.sku,
        comboName: comboProduct?.name || comboDefinition?.name || comboDefinition?.form?.name || 'Combo Menu',
        comboBasePrice: calculation.comboBasePrice,
        realTotal: calculation.realTotal,
        adjustmentTotal: kioskAlternativeTotal,
        expandedLines: kioskExpandedLines,
        displayLines: calculation.displayLines,
        signature: calculation.signature,
      },
      cartKeySuffix: calculation.signature,
    }))
  }

  if (!comboDefinition) return null

  const footerLabel = stepIndex < steps.length - 1 ? 'Ilerle' : 'Sepete ekle'

  return (
    <div
      onPointerDown={event => {
        if (isClosing) return
        if (event.target !== event.currentTarget) return
        closeWithAnimation(onClose)
      }}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(2,6,23,.26)',
        backdropFilter: 'blur(10px)',
        zIndex: 40,
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        padding: '96px 0 12px 68px',
        pointerEvents: isClosing ? 'none' : 'auto',
        animation: isClosing
          ? `altDrawerOverlayOut ${DRAWER_OVERLAY_CLOSE_MS}ms ease-in forwards`
          : `altDrawerOverlayIn ${DRAWER_OVERLAY_OPEN_MS}ms cubic-bezier(.2,.82,.2,1) forwards`,
      }}
    >
      <div style={{ position: 'relative', width: 334, minHeight: 0 }}>
        <div
          style={{
            position: 'absolute',
            left: -130,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 112,
            minHeight: 252,
            maxHeight: 332,
            borderRadius: 22,
            background: 'linear-gradient(180deg,rgba(82,82,82,.94) 0%, rgba(15,23,42,.98) 42%, rgba(2,6,23,1) 100%)',
            boxShadow: '0 18px 32px rgba(15,23,42,.2)',
            padding: '16px 12px',
            display: 'grid',
            alignContent: 'start',
            gap: 10,
            overflow: 'auto',
            transformOrigin: 'right center',
            animation: isClosing
              ? `altDrawerSideOut ${DRAWER_CLOSE_MS}ms cubic-bezier(.4,0,.2,1) forwards`
              : `altDrawerSideIn ${DRAWER_OPEN_MS}ms cubic-bezier(.18,.86,.22,1) forwards`,
            willChange: 'transform, opacity',
          }}
        >
          {summaryLines.length === 0 ? (
            <div style={{ color: '#cbd5e1', fontSize: '.68rem', lineHeight: 1.28, fontWeight: 700 }}>
              Secim bekleniyor
            </div>
          ) : summaryLines.map((item, index) => (
              <div
                key={`${item.title}-${index}`}
                style={{
                  color: item.active ? '#fde68a' : '#f8fafc',
                  fontSize: '.76rem',
                  lineHeight: 1.26,
                  fontWeight: item.active ? 900 : 800,
                }}
              >
              {item.title}
            </div>
          ))}
        </div>

        <div
          style={{
            width: 350,
            maxHeight: 618,
            borderRadius: '28px 0 0 28px',
            overflow: 'hidden',
            background: '#fff',
            boxShadow: '-36px 0 72px rgba(15,23,42,.24)',
            animation: isClosing
              ? `altDrawerOut ${DRAWER_CLOSE_MS}ms cubic-bezier(.4,0,.2,1) forwards`
              : `altDrawerIn ${DRAWER_OPEN_MS}ms cubic-bezier(.18,.86,.22,1) forwards`,
            willChange: 'transform, opacity',
            display: 'flex',
            flexDirection: 'column',
            transformOrigin: 'right center',
          }}
        >
          <div style={{ position: 'relative', padding: 8 }}>
            <img
              src={comboProduct?.channel_image || comboProduct?.image_url || ''}
              alt={comboProduct?.name}
              style={{ width: '100%', height: 118, objectFit: 'cover', display: 'block', borderRadius: 16, background: '#f1f5f9' }}
            />
            <button
              type="button"
              onClick={() => closeWithAnimation(onClose)}
              style={{
                position: 'absolute',
                top: 18,
                right: 18,
                width: 32,
                height: 32,
                borderRadius: '50%',
                border: 'none',
                background: 'rgba(255,255,255,.94)',
                color: '#0f172a',
                cursor: 'pointer',
              }}
            >
              <i className="fa-solid fa-xmark" />
            </button>
          </div>

          <div style={{ padding: '0 12px 12px' }}>
            <div style={{ fontSize: '.95rem', fontWeight: 900, lineHeight: 1.15, color: '#0f172a' }}>{comboProduct?.name}</div>
          </div>

          {steps.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, opacity: 0.7 }}>
              <i className="fa-solid fa-circle-exclamation" style={{ fontSize: '2.5rem', color: '#fca5a5', marginBottom: 12 }} />
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#334155', marginBottom: 6 }}>Seçenek Bulunamadı</div>
              <div style={{ fontSize: '.8rem', color: '#64748b', textAlign: 'center', lineHeight: 1.5 }}>Bu menü için bir yapılandırma bulunamadı. Lütfen daha sonra tekrar deneyin.</div>
            </div>
          ) : (
          <div style={{ padding: '0 12px 12px', overflowY: 'auto', flex: 1 }}>
            {currentStep?.type === 'group' ? (
              <>
                <div style={{ fontSize: '.72rem', letterSpacing: '.1em', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 800, marginBottom: 8 }}>
                  {currentStep.group?.name || 'Secim'}
                </div>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: 14 }}>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {[{
                      itemId: String(currentStep.group?.primaryItemId || ''),
                      isPrimary: true,
                    }, ...((currentStep.group?.alternatives || []).map(alternative => ({
                      itemId: String(alternative?.itemId || ''),
                      isPrimary: false,
                    })))].map(choice => {
                      const item = itemMap.get(choice.itemId)
                      const active = String(groupSelections[String(currentStep.group?.id || '')] || '') === choice.itemId
                      const delta = getKioskComboAlternativeDelta(comboDefinition, currentStep.group, choice.itemId, channelId, itemMap)
                      return (
                        <button
                          key={`${currentStep.group?.id}:${choice.itemId}`}
                          type="button"
                          onClick={() => setGroupSelections(current => ({ ...current, [String(currentStep.group.id)]: choice.itemId }))}
                          style={{
                            borderRadius: 14,
                            border: `1px solid ${active ? '#f59e0b' : '#e2e8f0'}`,
                            background: active ? '#fffbeb' : '#fff',
                            padding: '12px 14px',
                            textAlign: 'left',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                            <div>
                              <div style={{ fontWeight: 900, color: '#0f172a', fontSize: '.9rem' }}>{item?.name || 'Secilen urun'}</div>
                              {delta > 0 ? (
                                <div style={{ marginTop: 4, fontSize: '.72rem', color: '#f59e0b', fontWeight: 800 }}>
                                  +{fmt(delta)} TL
                                </div>
                              ) : null}
                            </div>
                            <div
                              style={{
                                width: 24,
                                height: 24,
                                borderRadius: 999,
                                border: `2px solid ${active ? '#f59e0b' : '#cbd5e1'}`,
                                background: active ? '#f59e0b' : '#fff',
                                color: '#fff',
                                display: 'grid',
                                placeItems: 'center',
                                flexShrink: 0,
                              }}
                            >
                              {active ? <i className="fa-solid fa-check" style={{ fontSize: '.68rem' }} /> : null}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </>
            ) : currentStep?.type === 'option' ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: '.72rem', letterSpacing: '.1em', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 800 }}>
                    {currentStep.def?.group_name || currentStep.def?.name || 'Seçenek'}
                  </div>
                  {(() => {
                    const rules = extractSelectionRules(parseJsonValue(currentStep.def?.options, []))
                    const min = rules.minSelect
                    const max = rules.maxSelect
                    if (!min && !max) return null
                    let note = ""
                    if (min > 0 && max > 0) note = min === max ? `${min} Zorunlu` : `En az ${min}, En fazla ${max}`
                    else if (min > 0) note = `En az ${min} Seçim`
                    else if (max > 0) note = `En fazla ${max} Seçim`
                    
                    return (
                      <div style={{
                        fontSize: '.68rem', fontWeight: 800, color: '#f59e0b', 
                        background: 'rgba(245, 158, 11, 0.12)', padding: '2px 8px', borderRadius: 8
                      }}>
                        {note}
                      </div>
                    )
                  })()}
                </div>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: 14 }}>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {extractSelectionRules(parseJsonValue(currentStep.def?.options, [])).options.map(option => {
                      const optionId = String(option.option_id || option.id || option.name)
                      const currentIds = optionSelections[currentStep.key] || []
                      const count = currentIds.filter(id => id === optionId).length
                      const active = count > 0
                      const price = roundMoney(option.price)
                      const maxS = extractSelectionRules(parseJsonValue(currentStep.def?.options, [])).maxSelect
                      
                      return (
                        <div
                          key={optionId}
                          style={{
                            borderRadius: 14,
                            border: `1px solid ${active ? '#f59e0b' : '#e2e8f0'}`,
                            background: active ? '#fffbeb' : '#fff',
                            padding: '4px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => toggleOption(currentStep, optionId, maxS)}
                            style={{
                              background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                              padding: '8px 10px', flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10
                            }}
                          >
                            <div style={{ fontWeight: 900, color: '#0f172a', fontSize: '.9rem' }}>{option.name || 'Seçenek'}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              {price > 0 ? <div style={{ fontSize: '.72rem', color: '#f59e0b', fontWeight: 800 }}>+{fmt(price)} TL</div> : null}
                              {maxS <= 1 && (
                                <div
                                  style={{
                                    width: 24, height: 24, borderRadius: 999, border: `2px solid ${active ? '#f59e0b' : '#cbd5e1'}`,
                                    background: active ? '#f59e0b' : '#fff', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0,
                                  }}
                                >
                                  {active ? <i className="fa-solid fa-check" style={{ fontSize: '.68rem' }} /> : null}
                                </div>
                              )}
                            </div>
                          </button>
                          
                          {maxS > 1 && active && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(245,158,11,.1)', borderRadius: 10, padding: '4px', alignSelf: 'flex-end', marginRight: 4, marginBottom: 4 }}>
                              <button
                                type="button"
                                onClick={() => removeOption(currentStep, optionId)}
                                style={{
                                  width: 28, height: 28, borderRadius: 8, border: 'none', background: 'rgba(245,158,11,.2)', color: '#d97706', cursor: 'pointer',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900
                                }}
                              >
                                -
                              </button>
                              <div style={{ minWidth: 20, textAlign: 'center', color: '#d97706', fontWeight: 900, fontSize: '.9rem' }}>
                                {count}
                              </div>
                              <button
                                type="button"
                                onClick={() => toggleOption(currentStep, optionId, maxS)}
                                style={{
                                  width: 28, height: 28, borderRadius: 8, border: 'none', background: '#f59e0b', color: '#fff', cursor: 'pointer',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900
                                }}
                              >
                                +
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            ) : null}
          </div>
          )}

          <div style={{ padding: 12, borderTop: '1px solid #e2e8f0', background: '#fff', display: 'grid', gridTemplateColumns: '62px 34px 20px 34px minmax(64px, 1fr) minmax(74px, auto)', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <button
              type="button"
              onClick={() => setStepIndex(current => Math.max(0, current - 1))}
              disabled={stepIndex === 0}
              style={{
                minHeight: 38,
                padding: '0 10px',
                borderRadius: 999,
                border: '1px solid #dbe2ea',
                background: stepIndex === 0 ? '#f8fafc' : '#fff',
                color: stepIndex === 0 ? '#94a3b8' : '#475569',
                cursor: stepIndex === 0 ? 'default' : 'pointer',
                fontWeight: 800,
                fontSize: '.86rem',
              }}
            >
              Geri
            </button>
            <button type="button" onClick={() => setQty(current => Math.max(1, current - 1))} style={{ width: 34, height: 34, borderRadius: 999, border: '1px solid #dbe2ea', background: '#fff', color: '#64748b', cursor: 'pointer', fontWeight: 900 }}>-</button>
            <div style={{ textAlign: 'center', fontWeight: 900, color: '#0f172a', fontSize: '.96rem' }}>{qty}</div>
            <button type="button" onClick={() => setQty(current => current + 1)} style={{ width: 34, height: 34, borderRadius: 999, border: 'none', background: '#f59e0b', color: '#fff', cursor: 'pointer', fontWeight: 900 }}>+</button>
            <div style={{ fontSize: '.94rem', fontWeight: 900, color: '#0f172a', textAlign: 'center', minWidth: 0, whiteSpace: 'nowrap' }}>{fmt(kioskComboUnitPrice)} TL</div>
            <button
              type="button"
              onClick={() => {
                if (stepIndex < steps.length - 1) setStepIndex(current => current + 1)
                else handleSubmit()
              }}
              disabled={!canAdvance}
              style={{
                minHeight: 42,
                padding: '0 14px',
                borderRadius: 999,
                border: 'none',
                background: canAdvance ? '#f59e0b' : '#cbd5e1',
                color: '#fff',
                fontWeight: 900,
                cursor: canAdvance ? 'pointer' : 'default',
                fontSize: '.9rem',
                width: '100%',
                minWidth: 0,
                whiteSpace: 'nowrap',
              }}
            >
              {footerLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- aspect-ratio scale hook ----
function useCanvasScale(targetW, targetH) {
  const [scale, setScale] = useState(1)
  useEffect(() => {
    function calc() {
      const viewport = getViewportMetrics()
      setScale(Math.min(viewport.width / targetW, viewport.height / targetH))
    }
    calc()
    window.addEventListener('resize', calc)
    window.visualViewport?.addEventListener('resize', calc)
    window.visualViewport?.addEventListener('scroll', calc)
    return () => {
      window.removeEventListener('resize', calc)
      window.visualViewport?.removeEventListener('resize', calc)
      window.visualViewport?.removeEventListener('scroll', calc)
    }
  }, [targetW, targetH])
  return scale
}

// ---- virtual keyboard ----
function NumKeyboard({ value, onChange, onConfirm, onCancel, label }) {
  function press(k) {
    if (k === 'DEL') onChange(value.slice(0, -1))
    else if (value.length < 8) onChange(value + k)
  }
  const keys = ['1','2','3','4','5','6','7','8','9','','0','DEL']
  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(0,0,0,.85)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', zIndex: 20, gap: 16,
    }}>
      <div style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 700 }}>{label}</div>
      <div style={{
        background: '#1e293b', borderRadius: 12, padding: '14px 20px',
        fontSize: 32, fontWeight: 800, color: '#f1f5f9', minWidth: 200,
        textAlign: 'center', letterSpacing: 4, minHeight: 56,
      }}>{value || <span style={{ color: '#475569' }}>-</span>}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        {keys.map((k, i) => (
          <button key={i} onClick={() => k && press(k)} style={{
            width: 80, height: 80, borderRadius: 16, border: 'none',
            background: k === 'DEL' ? '#dc2626' : k === '' ? 'transparent' : '#334155',
            color: '#f1f5f9', fontSize: k === 'DEL' ? 16 : 28, fontWeight: 700,
            cursor: k ? 'pointer' : 'default',
            transition: 'background .1s',
          }}>{k === 'DEL' ? 'Sil' : k}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <button onClick={onCancel} style={{
          padding: '14px 32px', borderRadius: 12, border: 'none',
          background: '#475569', color: '#f1f5f9', fontSize: 16, fontWeight: 700, cursor: 'pointer',
        }}>Vazgeç</button>
        <button onClick={onConfirm} disabled={!value} style={{
          padding: '14px 32px', borderRadius: 12, border: 'none',
          background: value ? '#22c55e' : '#334155',
          color: '#f1f5f9', fontSize: 16, fontWeight: 700,
          cursor: value ? 'pointer' : 'default',
        }}>Onayla</button>
      </div>
    </div>
  )
}

function AlphaKeyboard({ value, onChange, onConfirm, onCancel, label, error }) {
  function press(key) {
    if (key === 'DEL') onChange(value.slice(0, -1))
    else if (key === 'CLR') onChange('')
    else if (key === 'OK') onConfirm()
    else if (value.length < 16) onChange(`${value}${key}`)
  }

  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(0,0,0,.88)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', zIndex: 26, gap: 14, padding: 16,
    }}>
      <div style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 700 }}>{label}</div>
      <div style={{
        background: '#1e293b', borderRadius: 12, padding: '14px 20px',
        fontSize: 26, fontWeight: 800, color: '#f1f5f9', minWidth: 240,
        textAlign: 'center', letterSpacing: 3, minHeight: 56,
      }}>{value || <span style={{ color: '#475569' }}>-</span>}</div>

      {error && (
        <div style={{
          color: '#fca5a5', background: 'rgba(127,29,29,.4)',
          border: '1px solid rgba(248,113,113,.3)', padding: '10px 14px',
          borderRadius: 12, fontSize: '.9rem', lineHeight: 1.4, maxWidth: 320,
          textAlign: 'center'
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {COUPON_KEYS.map((row, index) => (
          <div key={index} style={{ display: 'grid', gridTemplateColumns: `repeat(${row.length}, 1fr)`, gap: 8 }}>
            {row.map(key => (
              <button key={key} onClick={() => press(key)} style={{
                minWidth: 48, height: 48, borderRadius: 14, border: 'none',
                background: key === 'DEL' ? '#dc2626' : key === 'OK' ? '#16a34a' : key === 'CLR' ? '#475569' : '#334155',
                color: '#f8fafc', fontSize: key.length > 1 ? 12 : 18, fontWeight: 800, cursor: 'pointer',
              }}>
                {key === 'DEL' ? 'Sil' : key === 'CLR' ? 'Temizle' : key === 'OK' ? 'Onayla' : key}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <button onClick={onCancel} style={{
          padding: '14px 32px', borderRadius: 12, border: 'none',
          background: '#475569', color: '#f1f5f9', fontSize: 16, fontWeight: 700, cursor: 'pointer',
        }}>Vazgeç</button>
        <button onClick={onConfirm} disabled={!value} style={{
          padding: '14px 32px', borderRadius: 12, border: 'none',
          background: value ? '#22c55e' : '#334155',
          color: '#f1f5f9', fontSize: 16, fontWeight: 700,
          cursor: value ? 'pointer' : 'default',
        }}>Onayla</button>
      </div>
    </div>
  )
}

function SuggestionModal({ suggestion, accentColor, onClose, onAction }) {
  if (!suggestion) return null

  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(2,6,23,.84)', zIndex: 40,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18,
    }}>
      <div style={{
        width: 330, borderRadius: 20, padding: 22, background: '#0f172a',
        border: `1px solid ${rgba(accentColor, .32)}`, boxShadow: `0 24px 60px ${rgba(accentColor, .16)}`,
        display: 'grid', gap: 14,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 18, display: 'grid', placeItems: 'center',
          background: rgba(accentColor, .18), color: accentColor, fontSize: 22,
        }}>
          <i className="fa-solid fa-star" />
        </div>
        <div style={{ color: '#f8fafc', fontSize: 22, fontWeight: 800 }}>{suggestion.title}</div>
        {suggestion.message && <div style={{ color: '#94a3b8', lineHeight: 1.6 }}>{suggestion.message}</div>}
        {suggestion.actionLabel && (
          <button onClick={onAction} style={{
            minHeight: 50, borderRadius: 14, border: 'none', cursor: 'pointer',
            background: accentColor, color: '#111827', fontWeight: 900, fontSize: 16,
          }}>{suggestion.actionLabel}</button>
        )}
        <button onClick={onClose} style={{
          minHeight: 46, borderRadius: 14, border: '1px solid rgba(148,163,184,.16)', cursor: 'pointer',
          background: 'rgba(15,23,42,.9)', color: '#cbd5e1', fontWeight: 800,
        }}>
          Devam et
        </button>
      </div>
    </div>
  )
}

function LoyaltyModal({
  open,
  accentColor,
  onClose,
  loyaltySessionToken,
  branchId,
  branchName,
  customerName,
  onCustomerLinked,
  onClearCustomer,
  settings,
  loyaltyAdjustedSubtotal,
  onCouponApplied,
  onEnterCouponClick,
}) {
  const [isKeypadOpen, setIsKeypadOpen] = useState(false)
  const [phoneDigits, setPhoneDigits] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [scanInputVal, setScanInputVal] = useState('')
  const [sampleCustomers, setSampleCustomers] = useState([])
  const scanInputRef = useRef(null)

  useEffect(() => {
    if (open) {
      setIsKeypadOpen(false)
      setPhoneDigits('')
      setErrorMsg('')
      setScanInputVal('')
      
      // Load sample customers dynamically
      db.from('musteriler')
        .select('id, ad_soyad, telefon, loyalty_member_no, metadata')
        .is('deleted_at', null)
        .not('loyalty_member_no', 'is', null)
        .limit(3)
        .then(({ data }) => {
          if (data) setSampleCustomers(data)
        })
        .catch(() => {})
    }
  }, [open])

  useEffect(() => {
    if (open && !isKeypadOpen && scanInputRef.current) {
      scanInputRef.current.focus()
    }
  }, [open, isKeypadOpen])

  if (!open) return null

  const handleScanChange = (e) => {
    setScanInputVal(e.target.value)
  }

  const linkCustomerProcess = async (customer) => {
    setLoading(true)
    setErrorMsg('')
    try {
      await revertExpiredCouponReservations(customer.id)
      const categoryIds = await loadCustomerLoyaltyCategoryIds(
        { branchId, branchName },
        customer.id
      )
      const selectedCampaignIds = customer.metadata?.selectedCampaignIds || []
      
      // Reserved coupons
      const { data: reservedCoupons } = await db
        .from('loyalty_coupons')
        .select('code, series_id')
        .eq('customer_id', customer.id)
        .eq('redemption_status', 'reserved')
        .is('deleted_at', null)
      const couponCodes = reservedCoupons?.map(c => c.code).join(',') || ''
      const couponLabel = reservedCoupons?.map(c => c.code).join(', ') || ''
      
      if (loyaltySessionToken) {
        await linkCustomerToKioskSession(loyaltySessionToken, customer, {
          customerCategoryIds: categoryIds,
          selectedCouponCode: couponCodes,
          selectedCouponLabel: couponLabel,
          selectedCampaignId: selectedCampaignIds[0] || '',
          selectedCampaignIds: selectedCampaignIds,
        })
      }
      
      onCustomerLinked({
        customerId: customer.id,
        customerName: customer.ad_soyad,
        phone: customer.telefon,
        customerCategoryIds: categoryIds,
        selectedCampaignId: selectedCampaignIds[0] || '',
        selectedCampaignIds: selectedCampaignIds,
        selectedCouponCode: couponCodes,
        selectedCouponLabel: couponLabel,
        status: 'linked',
      })
    } catch (err) {
      setErrorMsg(err?.message || 'Müşteri bağlantısı sırasında bir hata oluştu.')
    } finally {
      setLoading(false)
    }
  }

  const handleScanKeyDown = async (e) => {
    if (e.key === 'Enter') {
      const code = scanInputVal.trim()
      setScanInputVal('')
      if (!code) return
      
      setLoading(true)
      // 1. Önce müşteri QR kodunu sorgula
      const customer = await lookupCustomerByQrCode(code)
      if (customer) {
        await linkCustomerProcess(customer)
        return
      }

      // 2. Müşteri bulunamadıysa kupon kodunu sorgula (Hem local hem veritabanından)
      const upperCode = code.toUpperCase()
      // Yerel statik kuponları kontrol et
      const localResult = evaluateCoupon(upperCode, settings, loyaltyAdjustedSubtotal)
      if (localResult && !localResult.error) {
        onCouponApplied?.(upperCode, `${localResult.coupon.label || upperCode} kuponu uygulandı.`)
        setLoading(false)
        return
      }

      // Yerelde yoksa sadakat veritabanından dinamik kuponu sorgula
      try {
        const res = await db.from('loyalty_coupons')
          .select('id,code,series_id,is_used,active,redemption_status,expires_at')
          .ilike('code', upperCode)
          .maybeSingle()

        if (res?.data) {
          const coupon = res.data
          if (coupon.active === false) {
            setErrorMsg('Bu kupon pasif durumdadır.')
            setLoading(false)
            return
          }

          const isUsedStatus = ['used', 'expired', 'cancelled'].includes(String(coupon.redemption_status || '').toLowerCase())
          if (coupon.is_used || isUsedStatus) {
            setErrorMsg('Bu kupon daha önce kullanılmıştır.')
            setLoading(false)
            return
          }

          if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
            setErrorMsg('Bu kuponun kullanım süresi dolmuştur.')
            setLoading(false)
            return
          }

          onCouponApplied?.(upperCode, `Sadakat kuponu (${upperCode}) uygulandı.`)
          setLoading(false)
          return
        }
      } catch (err) {
        console.error(err)
      }

      setErrorMsg('QR kod geçerli bir müşteri veya kupon koduyla eşleşmedi.')
      setLoading(false)
    }
  }

  const handleScanBlur = () => {
    if (open && !isKeypadOpen) {
      setTimeout(() => {
        if (scanInputRef.current) scanInputRef.current.focus()
      }, 150)
    }
  }

  const handleKeyPress = (char) => {
    setErrorMsg('')
    if (phoneDigits.length === 0 && char !== '5') {
      setErrorMsg('Telefon numarası 5 ile başlamalıdır.')
      return
    }
    if (phoneDigits.length < 10) {
      setPhoneDigits(prev => prev + char)
    }
  }

  const handleBackspace = () => {
    setErrorMsg('')
    setPhoneDigits(prev => prev.slice(0, -1))
  }

  const handleClear = () => {
    setErrorMsg('')
    setPhoneDigits('')
  }

  const handlePhoneSubmit = async () => {
    if (phoneDigits.length < 10) {
      setErrorMsg('Lütfen 10 haneli telefon numarasını girin.')
      return
    }
    setLoading(true)
    const customer = await lookupCustomerByQrCode(phoneDigits)
    if (!customer) {
      setErrorMsg('Müşteri bulunamadı.')
      setLoading(false)
      return
    }
    await linkCustomerProcess(customer)
  }

  const formatMaskedPhone = (digits) => {
    const d = digits.replace(/\D/g, '')
    if (d.length === 0) return ''
    let parts = '('
    const p1 = d.substring(0, 3)
    if (p1.length > 0) {
      parts += '5'
      if (p1.length > 1) parts += '•'
      if (p1.length > 2) parts += '•'
    }
    if (d.length > 3) {
      parts += ') '
      const p2 = d.substring(3, 6)
      for (let i = 0; i < p2.length; i++) {
        parts += '•'
      }
    }
    if (d.length > 6) {
      parts += ' '
      const p3 = d.substring(6)
      if (p3.length === 1) {
        parts += p3
      } else if (p3.length >= 2) {
        parts += p3.slice(-2)
      }
    }
    return parts
  }

  const handleSimulateSelect = async (cust) => {
    await linkCustomerProcess(cust)
  }

  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(2,6,23,.88)', zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18,
    }}>
      <div style={{
        width: 380, borderRadius: 24, padding: 22, background: '#0f172a',
        border: '1px solid rgba(148,163,184,.16)', display: 'flex', flexDirection: 'column', gap: 16,
        boxShadow: '0 24px 60px rgba(0,0,0,.6)', position: 'relative'
      }}>
        
        {/* Visual Focus/Input for QR code */}
        {!isKeypadOpen && (
          <input
            ref={scanInputRef}
            type="text"
            value={scanInputVal}
            onChange={handleScanChange}
            onKeyDown={handleScanKeyDown}
            onBlur={handleScanBlur}
            style={{
              position: 'absolute',
              opacity: 0,
              pointerEvents: 'none',
              top: 0, left: 0
            }}
          />
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ color: '#f8fafc', fontSize: 20, fontWeight: 900 }}>
            {isKeypadOpen ? displayText('Telefonla Devam Et') : displayText('Sadakat & Kupon')}
          </div>
          {isKeypadOpen && (
            <button
              onClick={() => { setIsKeypadOpen(false); setErrorMsg(''); }}
              style={{
                background: 'transparent', border: 'none', color: '#64748b',
                fontSize: '.9rem', fontWeight: 700, cursor: 'pointer'
              }}
            >
              Geri
            </button>
          )}
        </div>

        {errorMsg && (
          <div style={{
            color: '#fca5a5', background: 'rgba(127,29,29,.2)',
            border: '1px solid rgba(248,113,113,.2)', padding: '10px 12px',
            borderRadius: 12, fontSize: '.8rem', lineHeight: 1.4
          }}>
            {errorMsg}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 40, gap: 12 }}>
            <i className="fa-solid fa-circle-notch fa-spin" style={{ color: accentColor, fontSize: 32 }} />
            <div style={{ color: '#94a3b8', fontSize: '.85rem' }}>İşlem yapılıyor...</div>
          </div>
        ) : !isKeypadOpen ? (
          <>
            {customerName ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{
                  borderRadius: 16, padding: '14px',
                  background: 'rgba(22,163,74,.14)',
                  color: '#86efac',
                  border: '1px solid rgba(34,197,94,.22)',
                  textAlign: 'center', fontWeight: 800,
                  fontSize: '1.05rem',
                }}>
                  {customerName} Bağlı
                </div>
                <button
                  onClick={() => {
                    if (loyaltySessionToken) {
                      consumeKioskLoyaltyLinkSession(loyaltySessionToken).catch(() => {})
                    }
                    onClearCustomer?.()
                  }}
                  style={{
                    minHeight: 46, borderRadius: 14, border: 'none', cursor: 'pointer',
                    background: '#ef4444', color: '#fff', fontWeight: 900,
                  }}
                >
                  {displayText('Bağlantıyı Kaldır')}
                </button>
              </div>
            ) : (
              <>
                <div style={{ color: '#94a3b8', fontSize: '.88rem', lineHeight: 1.5 }}>
                  {displayText('Sadakat QR okutun, telefon numaranızı veya kupon kodunuzu girin.')}
                </div>

                {/* Modern Scanner Animation */}
                <div style={{
                  height: 180, background: '#070a13', borderRadius: 20,
                  border: '1px solid rgba(56,189,248,.18)', position: 'relative',
                  overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  {/* Laser Sweeper */}
                  <div style={{
                    position: 'absolute', left: 0, right: 0, height: 3,
                    background: 'linear-gradient(90deg, transparent, #38bdf8, transparent)',
                    boxShadow: '0 0 10px #38bdf8, 0 0 20px #38bdf8',
                    animation: 'laserSweep 3s infinite linear'
                  }} />
                  <i className="fa-solid fa-qrcode" style={{ color: 'rgba(56,189,248,.15)', fontSize: 72 }} />
                  <div style={{ position: 'absolute', bottom: 12, color: 'rgba(56,189,248,.6)', fontSize: '.76rem', fontWeight: 700 }}>
                    TARAMA BEKLENİYOR
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button
                    onClick={() => setIsKeypadOpen(true)}
                    style={{
                      minHeight: 52, borderRadius: 16, border: `1.5px solid ${accentColor}33`,
                      background: 'rgba(255,255,255,.02)', color: accentColor, fontWeight: 900,
                      cursor: 'pointer', transition: '.2s',
                    }}
                  >
                    {displayText('Telefonla Giriş Yap')}
                  </button>

                  <button
                    onClick={onEnterCouponClick}
                    style={{
                      minHeight: 52, borderRadius: 16, border: `1.5px solid rgba(255,255,255,.08)`,
                      background: 'rgba(255,255,255,.04)', color: '#cbd5e1', fontWeight: 900,
                      cursor: 'pointer', transition: '.2s',
                    }}
                  >
                    {displayText('Kupon Kodu Gir')}
                  </button>
                </div>
              </>
            )}

            {/* Quick simulation panel for testing */}
            {sampleCustomers.length > 0 && !customerName && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,.07)', paddingTop: 12 }}>
                <div style={{ color: '#64748b', fontSize: '.72rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                  Test Simülasyonu (Tıklayın)
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {sampleCustomers.map(cust => (
                    <button
                      key={cust.id}
                      onClick={() => handleSimulateSelect(cust)}
                      style={{
                        padding: '8px 12px', background: 'rgba(255,255,255,.03)',
                        border: '1px solid rgba(255,255,255,.05)', borderRadius: 10,
                        color: '#cbd5e1', fontSize: '.78rem', cursor: 'pointer',
                        textAlign: 'left', display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <strong style={{ color: '#fff' }}>{cust.ad_soyad}</strong>
                      <span style={{ color: '#64748b', fontSize: '.72rem' }}>{cust.loyalty_member_no || cust.telefon}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          /* Phone Entry Keypad View */
          <div style={{ display: 'grid', gap: 14 }}>
            {/* Phone Display */}
            <div style={{
              background: '#070a13', border: '1px solid rgba(148,163,184,.14)',
              borderRadius: 16, height: 60, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '1.45rem', fontWeight: 900,
              color: phoneDigits ? '#fff' : '#475569', fontVariantNumeric: 'tabular-nums'
            }}>
              {phoneDigits ? formatMaskedPhone(phoneDigits) : '(5__) ___ __ __'}
            </div>

            {/* Virtual Keypad Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                <button
                  key={num}
                  onClick={() => handleKeyPress(num)}
                  style={{
                    height: 52, borderRadius: 12, border: 'none', background: 'rgba(255,255,255,.05)',
                    color: '#fff', fontSize: '1.25rem', fontWeight: 800, cursor: 'pointer'
                  }}
                >
                  {num}
                </button>
              ))}
              <button
                onClick={handleClear}
                style={{
                  height: 52, borderRadius: 12, border: 'none', background: 'rgba(239,68,68,.1)',
                  color: '#ef4444', fontSize: '.85rem', fontWeight: 800, cursor: 'pointer'
                }}
              >
                C
              </button>
              <button
                onClick={() => handleKeyPress('0')}
                style={{
                  height: 52, borderRadius: 12, border: 'none', background: 'rgba(255,255,255,.05)',
                  color: '#fff', fontSize: '1.25rem', fontWeight: 800, cursor: 'pointer'
                }}
              >
                0
              </button>
              <button
                onClick={handleBackspace}
                style={{
                  height: 52, borderRadius: 12, border: 'none', background: 'rgba(255,255,255,.05)',
                  color: '#fff', fontSize: '1.1rem', fontWeight: 800, cursor: 'pointer'
                }}
              >
                ⌫
              </button>
            </div>

            <button
              onClick={handlePhoneSubmit}
              disabled={phoneDigits.length < 10}
              style={{
                minHeight: 52, borderRadius: 16, border: 'none',
                background: phoneDigits.length === 10 ? accentColor : 'rgba(255,255,255,.03)',
                color: phoneDigits.length === 10 ? '#111827' : '#475569',
                fontWeight: 900, fontSize: '1.05rem', cursor: phoneDigits.length === 10 ? 'pointer' : 'default',
                transition: '.15s'
              }}
            >
              Tamam
            </button>
          </div>
        )}

        <button onClick={onClose} style={{
          minHeight: 46, borderRadius: 14, border: 'none', cursor: 'pointer',
          background: 'rgba(255,255,255,.06)', color: '#cbd5e1', fontWeight: 800,
        }}>{displayText('Kapat')}</button>
      </div>

      <style>{`
        @keyframes laserSweep {
          0% { top: 0%; }
          50% { top: 100%; }
          100% { top: 0%; }
        }
      `}</style>
    </div>
  )
}

function formatKioskStationLabel(station, code = '') {
  if (station?.kiosk_number) return `Kiosk ${station.kiosk_number}`
  if (code) return `ID ${code}`
  return 'Kiosk seçilmedi'
}

function KioskStationSetupModal({
  open,
  mode = 'initial',
  accentColor,
  stationCode,
  stations,
  selectedStation,
  onSelectCode,
  onSave,
  onClose,
}) {
  if (!open) return null

  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(2,6,23,.88)', zIndex: 44,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18,
    }}>
      <div style={{
        width: 360, maxWidth: '100%', borderRadius: 22, padding: 22, background: '#0f172a',
        border: '1px solid rgba(148,163,184,.18)', display: 'grid', gap: 16,
      }}>
        <div style={{ color: '#f8fafc', fontSize: 22, fontWeight: 800 }}>
          {mode === 'hidden' ? 'Kiosk numarasini degistir' : 'Kiosk kurulumu'}
        </div>
        <div style={{ color: '#94a3b8', lineHeight: 1.6 }}>
          {mode === 'hidden'
            ? 'Bu gizli erisim ekrani cihazin eslestigi kiosk numarasini degistirmek icindir. Yalnizca yonetim ihtiyacinda kullanin.'
            : 'Bu cihazin hangi kiosk oldugunu belirlemek icin yonetim panelinde tanimli Kiosk ID\'yi girin veya listeden secin.'}
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ color: '#cbd5e1', fontSize: '.78rem', fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>
            Kiosk ID
          </div>
          <input
            value={stationCode}
            onChange={event => onSelectCode(event.target.value)}
            placeholder="KIOSK-01"
            style={{
              minHeight: 50,
              borderRadius: 14,
              border: '1px solid rgba(148,163,184,.22)',
              background: 'rgba(15,23,42,.9)',
              color: '#f8fafc',
              padding: '0 14px',
              fontSize: 16,
              fontWeight: 700,
            }}
          />
        </div>

        <div style={{
          borderRadius: 16,
          padding: '12px 14px',
          background: selectedStation
            ? 'rgba(22,163,74,.16)'
            : stationCode
              ? 'rgba(245,158,11,.14)'
              : 'rgba(15,23,42,.9)',
          color: selectedStation ? '#86efac' : (stationCode ? '#fcd34d' : '#94a3b8'),
          border: `1px solid ${selectedStation ? 'rgba(34,197,94,.24)' : (stationCode ? 'rgba(245,158,11,.24)' : 'rgba(148,163,184,.16)')}`,
          lineHeight: 1.5,
        }}>
          {selectedStation
            ? `${selectedStation.name} / Kiosk ${selectedStation.kiosk_number} / ${selectedStation.code}`
            : stationCode
              ? 'Bu ID henuz merkezi kiosk listesiyle eslesmedi. Yine de cihazda saklanabilir.'
              : 'Bu cihaz için henüz bir kiosk seçilmedi.'}
        </div>

        <div style={{ display: 'grid', gap: 10, maxHeight: 220, overflowY: 'auto' }}>
          {(stations || []).length === 0 ? (
            <div style={{
              borderRadius: 16,
              border: '1px dashed rgba(148,163,184,.24)',
              padding: 14,
              color: '#94a3b8',
              lineHeight: 1.55,
            }}>
              Yonetim panelinde henuz kiosk tanimi yok. Once merkezde kiosk ekleyip sonra bu cihazda eslestirebilirsiniz.
            </div>
          ) : (stations || []).map(station => (
            <button
              key={station.id}
              type="button"
              onClick={() => onSelectCode(station.code)}
              style={{
                borderRadius: 16,
                border: station.code === selectedStation?.code
                  ? `1px solid ${rgba(accentColor, .45)}`
                  : '1px solid rgba(148,163,184,.16)',
                background: station.code === selectedStation?.code
                  ? rgba(accentColor, .18)
                  : 'rgba(15,23,42,.92)',
                color: '#f8fafc',
                padding: '12px 14px',
                display: 'grid',
                gap: 4,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <strong>{station.name}</strong>
                <span style={{ color: station.active !== false ? '#86efac' : '#fca5a5', fontSize: '.74rem', fontWeight: 800 }}>
                  {station.active !== false ? 'Aktif' : 'Pasif'}
                </span>
              </div>
              <div style={{ color: '#cbd5e1', fontSize: '.82rem' }}>Kiosk {station.kiosk_number} / {station.code}</div>
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button onClick={onClose} style={{
            minHeight: 48, borderRadius: 14, border: '1px solid rgba(148,163,184,.16)', cursor: 'pointer',
            background: 'rgba(15,23,42,.9)', color: '#cbd5e1', fontWeight: 800,
          }}>
            Vazgec
          </button>
          <button onClick={onSave} style={{
            minHeight: 48, borderRadius: 14, border: 'none', cursor: 'pointer',
            background: accentColor, color: '#111827', fontWeight: 900,
          }}>
            Kaydet
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- product options drawer ----
function ProductOptionsModal({ prod, channelId, accentColor, anchorY, onConfirm, onCancel }) {
  const pJ = (value, fallback = []) => {
    if (!value) return fallback
    if (typeof value === 'string') {
      try { return JSON.parse(value) } catch { return fallback }
    }
    return Array.isArray(value) ? value : fallback
  }

  const portions = pJ(prod?.portions, [])
  const optGroups = pJ(prod?.option_groups, [])
  const chPrices = pJ(prod?.channel_prices, [])

  const basePrice = (() => {
    const priceRow = chPrices.find(item => item.channel_id === channelId && item.active !== false)
      || chPrices.find(item => item.active !== false)
    return parseFloat(priceRow?.price) || 0
  })()

  const [selPortion, setSelPortion] = useState(portions[0]?.id || null)
  const [selOpts, setSelOpts] = useState({})
  const [qty, setQty] = useState(1)
  const [isClosing, setIsClosing] = useState(false)
  const [panelTop, setPanelTop] = useState(18)
  const overlayRef = useRef(null)
  const panelRef = useRef(null)
  const imageRef = useRef(null)
  const closeTimerRef = useRef(null)

  const portionOffset = parseFloat(portions.find(item => item.id === selPortion)?.price_offset) || 0
  const optionTotal = Object.values(selOpts).flat().reduce((sum, key) => {
    const [groupIndex, optionIndex] = String(key).split(':').map(Number)
    return sum + (parseFloat(optGroups[groupIndex]?.options?.[optionIndex]?.price) || 0)
  }, 0)
  const total = roundMoney((basePrice + portionOffset + optionTotal) * qty)
  const groupsWithOptions = optGroups.filter(group => Array.isArray(group?.options) && group.options.length > 0)
  const autoPortionMode = portions.length === 2 && groupsWithOptions.length === 0

  function toggleOpt(groupIndex, optionIndex, maxSelect) {
    const key = `${groupIndex}:${optionIndex}`
    setSelOpts(current => {
      const list = current[groupIndex] || []
      if (maxSelect > 0 && list.length >= maxSelect && !list.includes(key)) return current
      return { ...current, [groupIndex]: [...list, key] }
    })
  }

  function removeOpt(groupIndex, optionIndex) {
    const key = `${groupIndex}:${optionIndex}`
    setSelOpts(current => {
      const list = current[groupIndex] || []
      const index = list.lastIndexOf(key)
      if (index === -1) return current
      const nextArr = [...list]
      nextArr.splice(index, 1)
      return { ...current, [groupIndex]: nextArr }
    })
  }

  function closeWithAnimation(callback) {
    if (isClosing) return
    setIsClosing(true)
    closeTimerRef.current = window.setTimeout(() => callback?.(), DRAWER_CLOSE_MS)
  }

  function confirm(nextPortionId = selPortion) {
    const portion = portions.find(item => item.id === nextPortionId) || null
    const nextPortionOffset = parseFloat(portion?.price_offset) || 0
    const options = Object.values(selOpts).flat().map(key => {
      const [groupIndex, optionIndex] = String(key).split(':').map(Number)
      const option = optGroups[groupIndex]?.options?.[optionIndex]
      return option ? { id: option.id || null, name: option.name || '', price: parseFloat(option.price) || 0 } : null
    }).filter(Boolean)
    closeWithAnimation(() => onConfirm({
      qty: autoPortionMode ? 1 : qty,
      unitPrice: roundMoney(basePrice + nextPortionOffset + optionTotal),
      portionId: nextPortionId,
      portionName: portion?.name || null,
      options,
    }, imageRef.current?.getBoundingClientRect?.() || null))
  }

  useEffect(() => {
    const overlayEl = overlayRef.current
    const panelEl = panelRef.current
    if (!overlayEl || !panelEl) return

    const overlayHeight = overlayEl.clientHeight
    const panelHeight = panelEl.offsetHeight
    const safeTop = 10
    const safeBottom = 10
    const anchorCenter = typeof anchorY === 'number' ? anchorY + 36 : overlayHeight / 2
    const centeredTop = anchorCenter - (panelHeight / 2)
    const maxTop = Math.max(safeTop, overlayHeight - panelHeight - safeBottom)
    setPanelTop(Math.max(safeTop, Math.min(centeredTop, maxTop)))
  }, [anchorY, prod?.id, portions.length, optGroups.length, prod?.channel_description])

  useEffect(() => () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
  }, [])

  return (
    <div
      ref={overlayRef}
      onPointerDown={event => {
        if (isClosing) return
        if (event.target !== event.currentTarget) return
        closeWithAnimation(onCancel)
      }}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 40,
        background: 'rgba(2,6,23,.22)',
        backdropFilter: 'blur(10px)',
        paddingLeft: 20,
        pointerEvents: isClosing ? 'none' : 'auto',
        animation: isClosing
          ? `altDrawerOverlayOut ${DRAWER_OVERLAY_CLOSE_MS}ms ease-in forwards`
          : `altDrawerOverlayIn ${DRAWER_OVERLAY_OPEN_MS}ms cubic-bezier(.2,.82,.2,1) forwards`,
      }}
    >
      <div
        ref={panelRef}
        style={{
          position: 'absolute',
          right: 0,
          top: panelTop,
          width: '100%',
          maxWidth: 334,
          borderRadius: '28px 0 0 28px',
          background: '#fff',
          color: '#0f172a',
          boxShadow: '-36px 0 72px rgba(15,23,42,.24)',
          animation: isClosing
            ? `altDrawerOut ${DRAWER_CLOSE_MS}ms cubic-bezier(.4,0,.2,1) forwards`
            : `altDrawerIn ${DRAWER_OPEN_MS}ms cubic-bezier(.18,.86,.22,1) forwards`,
          willChange: 'transform, opacity',
          transformOrigin: 'right center',
        }}
      >
        <div style={{ position: 'relative', padding: 8 }}>
          <img
            ref={imageRef}
            src={prod?.channel_image || ''}
            alt={prod?.name}
            style={{ width: '100%', height: 118, objectFit: 'cover', display: 'block', borderRadius: 16, background: '#f1f5f9' }}
          />
          <button
            type="button"
            onClick={() => closeWithAnimation(onCancel)}
            style={{
              position: 'absolute',
              top: 18,
              right: 18,
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(255,255,255,.94)',
              color: '#0f172a',
              cursor: 'pointer',
            }}
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div style={{ padding: '0 12px 12px' }}>
          <div style={{ fontSize: '.95rem', fontWeight: 900, lineHeight: 1.15 }}>{prod?.name}</div>
          {prod?.channel_description ? (
            <div style={{ marginTop: 6, color: '#64748b', lineHeight: 1.4, fontSize: '.78rem' }}>{prod.channel_description}</div>
          ) : null}

          {portions.length > 0 ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: '.72rem', letterSpacing: '.1em', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 800 }}>Boy seç</div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(portions.length, 3)}, 1fr)`, gap: 8, marginTop: 8 }}>
                {portions.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelPortion(item.id)
                      if (autoPortionMode) confirm(item.id)
                    }}
                    style={{
                      minHeight: autoPortionMode ? 50 : 54,
                      borderRadius: 12,
                      border: item.id === selPortion ? `2px solid ${accentColor}` : '1px solid rgba(15,23,42,.1)',
                      background: item.id === selPortion ? rgba(accentColor, .14) : '#fff',
                      color: '#0f172a',
                      cursor: 'pointer',
                      textAlign: 'left',
                      padding: 8,
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: '.78rem' }}>{item.name}</div>
                    <div style={{ marginTop: 4, color: accentColor, fontWeight: 800, fontSize: '.78rem' }}>{tl(basePrice + (parseFloat(item.price_offset) || 0))}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {optGroups.map((group, groupIndex) => {
            const options = Array.isArray(group?.options) ? group.options : []
            if (!options.length) return null
            const maxSelect = parseInt(group?.max_select, 10) || 1
            return (
              <div key={`${group?.name || 'group'}-${groupIndex}`} style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '.72rem', letterSpacing: '.1em', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 800 }}>
                    {group.group_name || group.name || `Seçim ${groupIndex + 1}`}
                  </div>
                  {(() => {
                    const min = parseInt(group.min_select) || (group.required ? 1 : 0)
                    const max = parseInt(group.max_select) || 0
                    if (!min && !max) return null
                    let note = ""
                    if (min > 0 && max > 0) note = min === max ? `${min} Zorunlu` : `En az ${min}, En fazla ${max}`
                    else if (min > 0) note = `En az ${min} Seçim`
                    else if (max > 0) note = `En fazla ${max} Seçim`
                    
                    return (
                      <div style={{
                        fontSize: '.68rem', fontWeight: 800, color: accentColor, 
                        background: rgba(accentColor, 0.12), padding: '2px 8px', borderRadius: 8
                      }}>
                        {note}
                      </div>
                    )
                  })()}
                </div>
                <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                  {options.map((option, optionIndex) => {
                    const key = `${groupIndex}:${optionIndex}`
                    const curSel = selOpts[groupIndex] || []
                    const count = curSel.filter(k => k === key).length
                    const active = count > 0
                    const price = parseFloat(option.price) || 0
                    const maxS = parseInt(group.max_select) || 1
                    return (
                      <div key={optionIndex} style={{
                        borderRadius: 14,
                        border: `1px solid ${active ? accentColor : 'rgba(15,23,42,.1)'}`,
                        background: active ? rgba(accentColor, .12) : '#fff',
                        padding: '4px',
                        display: 'flex', flexDirection: 'column', gap: 4,
                        transition: '.15s',
                      }}>
                        <button
                          type="button"
                          onClick={() => toggleOpt(groupIndex, optionIndex, maxS)}
                          style={{
                            flex: 1, padding: '6px 8px', background: 'transparent', border: 'none', cursor: 'pointer',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                          }}
                        >
                          <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '.9rem' }}>{option.name}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {price > 0 && <span style={{ color: accentColor, fontWeight: 800, fontSize: '.78rem' }}>+{tl(price)}</span>}
                            {maxS <= 1 && (
                              <div style={{
                                width: 22, height: 22, borderRadius: 999,
                                border: `2px solid ${active ? accentColor : '#cbd5e1'}`,
                                background: active ? accentColor : '#fff',
                                color: '#fff', display: 'grid', placeItems: 'center'
                              }}>
                                {active ? <i className="fa-solid fa-check" style={{ fontSize: '.6rem' }} /> : null}
                              </div>
                            )}
                          </div>
                        </button>

                        {maxS > 1 && active ? (
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            background: rgba(accentColor, 0.1), borderRadius: 10, padding: '4px',
                            alignSelf: 'flex-end', marginRight: 4, marginBottom: 4
                          }}>
                            <button
                              type="button"
                              onClick={() => removeOpt(groupIndex, optionIndex)}
                              style={{
                                width: 26, height: 26, borderRadius: 8, border: 'none',
                                background: rgba(accentColor, 0.2), color: accentColor, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900
                              }}
                            >
                              -
                            </button>
                            <div style={{ minWidth: 16, textAlign: 'center', color: accentColor, fontWeight: 900, fontSize: '.9rem' }}>
                              {count}
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleOpt(groupIndex, optionIndex, maxS)}
                              style={{
                                width: 26, height: 26, borderRadius: 8, border: 'none',
                                background: accentColor, color: '#fff', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900
                              }}
                            >
                              +
                            </button>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {!autoPortionMode ? (
            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button type="button" onClick={() => setQty(current => Math.max(1, current - 1))} style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid rgba(15,23,42,.12)', background: '#fff', cursor: 'pointer', fontSize: 14 }}>-</button>
                <span style={{ minWidth: 18, textAlign: 'center', fontWeight: 900, fontSize: '.92rem' }}>{qty}</span>
                <button type="button" onClick={() => setQty(current => current + 1)} style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: accentColor, color: '#fff', cursor: 'pointer', fontSize: 14 }}>+</button>
              </div>
              <div style={{ justifySelf: 'center', color: '#0f172a', fontWeight: 900, fontSize: '.92rem' }}>{tl(total)}</div>
              <button
                type="button"
                onClick={() => confirm()}
                style={{
                  minWidth: 104,
                  minHeight: 40,
                  borderRadius: 999,
                  border: 'none',
                  background: accentColor,
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 900,
                  fontSize: '.84rem',
                }}
              >
                Sepete ekle
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
// ---- cart item row ----
function CartRow({ item, onInc, onDec, onRemove }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 0', borderBottom: '1px solid #1e293b',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#f1f5f9', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.name}
        </div>
        {item.portionName && <div style={{ color: '#94a3b8', fontSize: 11 }}>{item.portionName}</div>}
        {(item.options || []).length > 0 && (
          <div style={{ color: '#94a3b8', fontSize: 11 }}>+{item.options.map(o => o.name).join(', ')}</div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={onDec} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#334155', color: '#f1f5f9', fontSize: 18, cursor: 'pointer' }}>-</button>
        <span style={{ color: '#f1f5f9', fontSize: 16, fontWeight: 700, width: 24, textAlign: 'center' }}>{item.qty}</span>
        <button onClick={onInc} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#334155', color: '#f1f5f9', fontSize: 18, cursor: 'pointer' }}>+</button>
      </div>
      <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: 14, width: 64, textAlign: 'right' }}>
        {tl(item.unitPrice * item.qty)}
      </div>
      <button onClick={onRemove} style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: '#dc2626', color: '#fff', fontSize: 14, cursor: 'pointer' }}><i className="fa-solid fa-trash" /></button>
    </div>
  )
}

// ---- main component ----
export default function KioskBig() {
  const { branchId, branchName } = useWorkspace()
  const legacyQrRedirect = useMemo(() => {
    if (typeof window === 'undefined') return { href: '' }
    const params = new URLSearchParams(window.location.search)
    const legacyBranch = params.get('branch') || ''
    const tableToken = params.get('tableToken') || ''
    if (!legacyBranch || !tableToken) return { href: '' }
    const nextParams = new URLSearchParams({ branch: legacyBranch, tableToken })
    const customerPhone = String(params.get('customerPhone') || '').replace(/\D/g, '').slice(-10)
    if (customerPhone) nextParams.set('customerPhone', customerPhone)
    return { href: `/mobil-app/qr-menu?${nextParams.toString()}` }
  }, [])
  const effectiveBranchId = branchId
  const scale = useCanvasScale(CANVAS_W, CANVAS_H)

  useEffect(() => {
    if (!legacyQrRedirect.href || typeof window === 'undefined') return
    window.location.replace(legacyQrRedirect.href)
  }, [legacyQrRedirect.href])

  const [settings, setSettings] = useState(KIOSK_DEFAULT_SETTINGS)
  const [deviceStations, setDeviceStations] = useState([])
  const [deviceKioskCode, setDeviceKioskCode] = useState('')
  const [kioskStationDraft, setKioskStationDraft] = useState('')
  const [kioskStationModalMode, setKioskStationModalMode] = useState('initial')
  const [kioskStationModalOpen, setKioskStationModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Catalog data
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [comboDefinitions, setComboDefinitions] = useState([])
  const [optionGroupDefs, setOptionGroupDefs] = useState([])
  const [channel, setChannel] = useState(null)
  const [taxes, setTaxes] = useState([])

  // UI state
  const [screen, setScreen] = useState('idle') // idle | menu | cart_review | service_type | table_input | coupon | payment | processing | success
  const [selectedCatId, setSelectedCatId] = useState(null)
  const [cart, setCart] = useState([])
  const [serviceType, setServiceType] = useState('takeaway')
  const [tableNumber, setTableNumber] = useState('')
  const [tableInputDraft, setTableInputDraft] = useState('')
  const [couponCode, setCouponCode] = useState('')
  const [couponInputDraft, setCouponInputDraft] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [orderResult, setOrderResult] = useState(null)
  const [flyer, setFlyer] = useState(null)
  const [addedProdId, setAddedProdId] = useState(null)
  const [selectedProduct, setSelectedProduct] = useState(null) // product awaiting portion/option selection
  const [selectedComboProduct, setSelectedComboProduct] = useState(null)
  const [couponMessage, setCouponMessage] = useState('')
  const [suggestionModal, setSuggestionModal] = useState(null)
  const [productSuggestionHits, setProductSuggestionHits] = useState({})
  const [checkoutSuggestionHits, setCheckoutSuggestionHits] = useState({})
  const [loyaltyModalOpen, setLoyaltyModalOpen] = useState(false)
  const [loyaltyQrUrl, setLoyaltyQrUrl] = useState('')
  const [idleLoyaltyQrUrl, setIdleLoyaltyQrUrl] = useState('')
  const [loyaltySession, setLoyaltySession] = useState(null)
  const [loyaltyCustomer, setLoyaltyCustomer] = useState(null)
  const [loyaltyCampaignCatalog, setLoyaltyCampaignCatalog] = useState([])
  const [clockNow, setClockNow] = useState(() => new Date())
  const [cartDockY, setCartDockY] = useState(164)
  const [cartPulse, setCartPulse] = useState(false)
  const [cartCheckVisible, setCartCheckVisible] = useState(false)
  const [cartFeedbackToken, setCartFeedbackToken] = useState(0)

  const catalogRef = useRef(null)
  const productsScrollRef = useRef(null)
  const productsContentRef = useRef(null)
  const catSectionRefs = useRef({})
  const catHeaderRefs = useRef({})
  const catGridRefs = useRef({})
  const catButtonRefs = useRef({})
  const categoryAlignFrameRef = useRef(null)
  const categoryAlignTimerRef = useRef(null)
  const categorySyncIntentRef = useRef({ id: null, expiresAt: 0 })
  const idleTimerRef = useRef(null)
  const successTimerRef = useRef(null)
  const loyaltyPollRef = useRef(null)
  const cartRef = useRef(null)
  const cartDockYRef = useRef(164)
  const cartMoveStateRef = useRef({ targetY: 164, movedAt: 0, headStartMs: 0 })
  const flyLaunchTimerRef = useRef(null)
  const flyCleanupTimerRef = useRef(null)
  const addedProdTimerRef = useRef(null)
  const cartFeedbackTimerRef = useRef(null)
  const cartCheckTimerRef = useRef(null)
  const secretStationTapRef = useRef({ count: 0, lastAt: 0 })
  const secretStationTapTimerRef = useRef(null)

  const accentColor = settings.accent_color || '#f59e0b'
  const textColor = settings.text_color || '#f8fafc'
  const panelColor = settings.panel_color || '#0f172a'
  const categoryBgColor = settings.category_bg_color || '#0b1221'
  const categoryActiveColor = settings.category_active_color || accentColor
  const kioskStationConfig = useMemo(
    () => resolveKioskDeviceStation({ ...settings, kiosk_stations: deviceStations }, deviceKioskCode),
    [settings, deviceStations, deviceKioskCode],
  )
  const selectedKioskStation = kioskStationConfig.station
  const kioskStationLabel = formatKioskStationLabel(selectedKioskStation, kioskStationConfig.stationCode)
  const branchDisplayLabel = branchName ? displayText(`Şube: ${branchName}`) : displayText('Şube bilgisi bekleniyor')
  // Show modal when not yet paired OR when paired but code no longer exists in current device list
  const needsPairing = !deviceKioskCode || (deviceKioskCode && deviceStations.length > 0 && !kioskStationConfig.hasMatch)
  const showVisibleStationSetup = needsPairing
  const kioskOperatingState = useMemo(
    () => getKioskOperatingState(settings, clockNow),
    [settings, clockNow],
  )
  const kioskInteractive = settings.enabled !== false && kioskOperatingState.isOpen !== false
  const loyaltyQrAvailable = kioskInteractive
    && Boolean(branchId || branchName)
    && kioskStationConfig.hasMatch
  const idleTitle = kioskInteractive
    ? (displayText(settings.idle_title, 'Hoş geldiniz!'))
    : (displayText(settings.closed_title, 'Kiosk şu anda kapalı'))
  const idleSubtitle = kioskInteractive
    ? (displayText(settings.idle_subtitle, 'Sipariş vermek için ekrana dokunun'))
    : (displayText(settings.closed_subtitle, 'Lütfen hizmet saatlerinde tekrar deneyin.'))
  const idleImageSrc = screen === 'idle'
    ? (
        settings.idle_media_type !== 'video'
          ? (settings.idle_media_url || settings.idle_background_image || settings.kiosk_bg_image || '')
          : (settings.idle_background_image || settings.kiosk_bg_image || '')
      )
    : ''
  const idleHasImage = Boolean(idleImageSrc)
  const idleHasVideo = screen === 'idle' && settings.idle_media_type === 'video' && settings.idle_media_url
  const showBaseBackground = settings.kiosk_bg_image && !idleHasImage && !idleHasVideo

  const startLoyaltyPolling = useCallback((token) => {
    if (!token) return
    clearInterval(loyaltyPollRef.current)
    loyaltyPollRef.current = setInterval(async () => {
      if (document.hidden) return
      const next = await readKioskLoyaltyLinkSession(token)
      if (!next) {
        clearInterval(loyaltyPollRef.current)
        return
      }
      if (next.status !== 'linked') return
      setLoyaltySession(next)
      setLoyaltyCustomer(next)
      clearInterval(loyaltyPollRef.current)
    }, 2500)
  }, [])

  const createSharedLoyaltySession = useCallback(async () => {
    const qrModule = await import('qrcode')
    const QRCodeLib = qrModule?.default || qrModule
    const session = await createKioskLoyaltyLinkSession({
      branchId,
      branchName,
      timeoutSec: 86400,
      kioskStationCode: selectedKioskStation?.code || kioskStationConfig.stationCode || '',
      kioskStationNumber: selectedKioskStation?.kiosk_number || null,
      kioskStationName: selectedKioskStation?.name || '',
    })
    const qrUrl = await QRCodeLib.toDataURL(getKioskLoyaltyUrl(session.token), { width: 420, margin: 1 })
    setLoyaltySession(session)
    setLoyaltyQrUrl(qrUrl)
    setIdleLoyaltyQrUrl(qrUrl)
    startLoyaltyPolling(session.token)
    return { session, qrUrl }
  }, [
    branchId,
    branchName,
    settings.loyalty_session_timeout_sec,
    selectedKioskStation?.code,
    selectedKioskStation?.kiosk_number,
    selectedKioskStation?.name,
    kioskStationConfig.stationCode,
    startLoyaltyPolling,
  ])

  // ---- load data ----
  const loadAll = useCallback(async () => {
    if (!effectiveBranchId && !branchName) return
    try {
      setLoading(true)
      const settingsPromise = loadKioskSettings().catch(() => KIOSK_DEFAULT_SETTINGS)
      const nextDeviceCode = loadKioskDeviceStationCode()
      setDeviceKioskCode(nextDeviceCode)
      setKioskStationDraft(nextDeviceCode)

      const [settingsData, catRes, prodRes, chanRes, taxRes, comboRes, optionGroupsRes, devicesRes] = await Promise.all([
        settingsPromise,
        db.from('sale_categories').select('id,name,parent_id').is('deleted_at', null),
        db.from('sale_items').select('id,name,sku,sale_cat_l1,sale_cat_l2,sale_cat_l3,sale_cat_l4,sale_cat_l5,channel_prices,portions,option_groups,channel_image,channel_description,prep_time_minutes').is('deleted_at', null).eq('active', true),
        db.from('sales_channels').select('id,name').is('deleted_at', null).ilike('name', 'kiosk').maybeSingle(),
        db.from('taxes').select('id,name,rate').is('deleted_at', null),
        db.from('settings').select('value').eq('key', 'combo_menus_v1').maybeSingle(),
        db.from('option_groups').select('id,name,options').is('deleted_at', null),
        effectiveBranchId ? db.from('pos_terminals').select('*').eq('branch_id', effectiveBranchId).in('device_type', ['kiosk', 'kiosk_tablet']) : Promise.resolve({ data: [] }),
      ])
      if (catRes.error) throw catRes.error
      if (prodRes.error) throw prodRes.error
      if (taxRes.error) throw taxRes.error
      if (comboRes.error) throw comboRes.error
      if (optionGroupsRes.error) throw optionGroupsRes.error
      const categorySnapshot = await ensureComboMenuCategory(catRes.data || [])
      const safeCategories = categorySnapshot.categories || sortSaleCategoriesWithComboFirst(catRes.data || [])
      
      if (settingsData && devicesRes?.data) {
        const stations = (devicesRes.data || []).sort((left, right) => (
          String(left.terminal_name || '').localeCompare(String(right.terminal_name || ''), 'tr')
        )).map((device, index) => ({
          id: device.id,
          code: device.pair_key,
          name: device.terminal_name || (device.device_type === 'kiosk_tablet' ? `Kiosk Tablet ${index + 1}` : `Kiosk ${index + 1}`),
          kiosk_number: index + 1,
          active: true,
          order: index + 1,
          device_type: device.device_type
        }))
        setDeviceStations(stations)
        settingsData.kiosk_stations = stations
      }
      setSettings(settingsData || KIOSK_DEFAULT_SETTINGS)
      setCategories(safeCategories
        .map(item => ({
          ...item,
          name: repairTurkishText(item?.name),
          kioskButtonLabel: repairTurkishText(item?.kioskButtonLabel),
        }))
        .sort((left, right) => String(left?.name || '').localeCompare(String(right?.name || ''), 'tr')))
      setProducts((prodRes.data || [])
        .map(item => ({
          ...item,
          name: repairTurkishText(item?.name),
          channel_description: repairTurkishText(item?.channel_description),
        }))
        .sort((left, right) => String(left?.name || '').localeCompare(String(right?.name || ''), 'tr')))
      setComboDefinitions(readComboRecords(comboRes.data))
      setOptionGroupDefs((optionGroupsRes.data || [])
        .map(def => ({
          ...def,
          name: repairTurkishText(def?.name),
          group_name: repairTurkishText(def?.group_name || def?.name || ''),
          options: Array.isArray(def?.options)
            ? def.options.map(option => ({
              ...option,
              name: repairTurkishText(option?.name),
            }))
            : [],
        }))
        .sort((left, right) => String(left?.name || '').localeCompare(String(right?.name || ''), 'tr')))
      setChannel(chanRes.data || null)
      setTaxes(taxRes.data || [])
      loadCachedRuntimeLoyaltyCampaignCatalog({ branchId, branchName, preferFresh: false })
        .then(snapshot => setLoyaltyCampaignCatalog(snapshot?.campaigns || []))
        .catch(() => {})
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [branchName, effectiveBranchId])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  useEffect(() => {
    function refreshRuntimeConfig() {
      if (document.hidden) return
      loadKioskSettings().then(setSettings).catch(() => {})
      setDeviceKioskCode(loadKioskDeviceStationCode())
      // Also refresh device stations from pos_terminals
      if (effectiveBranchId) {
        db.from('pos_terminals').select('*').eq('branch_id', effectiveBranchId).in('device_type', ['kiosk', 'kiosk_tablet'])
          .then(({ data }) => {
            if (!data) return
            const stations = (data || []).sort((left, right) => (
              String(left.terminal_name || '').localeCompare(String(right.terminal_name || ''), 'tr')
            )).map((device, index) => ({
              id: device.id,
              code: device.pair_key,
              name: device.terminal_name || (device.device_type === 'kiosk_tablet' ? `Kiosk Tablet ${index + 1}` : `Kiosk ${index + 1}`),
              kiosk_number: index + 1,
              active: true,
              order: index + 1,
              device_type: device.device_type
            }))
            setDeviceStations(stations)
          }).catch(() => {})
      }
    }

    function onStorage(event) {
      if (event.key && !['kiosk_settings_local_cache_v1', 'kiosk_device_station_code_v1'].includes(event.key)) return
      refreshRuntimeConfig()
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') refreshRuntimeConfig()
    }

    function onDeviceStationChange() {
      setDeviceKioskCode(loadKioskDeviceStationCode())
    }

    function onKioskSettingsChange() {
      refreshRuntimeConfig()
    }

    const interval = setInterval(refreshRuntimeConfig, 30000)
    window.addEventListener('focus', refreshRuntimeConfig)
    window.addEventListener('storage', onStorage)
    window.addEventListener('kiosk-device-station-change', onDeviceStationChange)
    window.addEventListener('kiosk-settings-change', onKioskSettingsChange)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', refreshRuntimeConfig)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('kiosk-device-station-change', onDeviceStationChange)
      window.removeEventListener('kiosk-settings-change', onKioskSettingsChange)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  useEffect(() => {
    if (!branchId && !branchName) return
    let cancelled = false

    loadCachedRuntimeLoyaltyCampaignCatalog({ branchId, branchName, preferFresh: false })
      .then(snapshot => {
        if (!cancelled) setLoyaltyCampaignCatalog(snapshot?.campaigns || [])
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [branchId, branchName])

  useEffect(() => {
    if (screen !== 'idle') return
    if (!loyaltyQrAvailable) return
    if (loyaltyCustomer) return
    if (!branchId && !branchName) return
    if (loyaltySession?.token) {
      if (loyaltyQrUrl && !idleLoyaltyQrUrl) setIdleLoyaltyQrUrl(loyaltyQrUrl)
      return
    }

    let cancelled = false

    async function startIdleSession() {
      try {
        await createSharedLoyaltySession()
      } catch (err) {
        if (!cancelled) {
          setIdleLoyaltyQrUrl(`ERROR:${err?.message || 'fail'}`)
        }
      }
    }

    startIdleSession()

    return () => {
      cancelled = true
    }
  }, [
    screen,
    loyaltyCustomer,
    loyaltySession?.token,
    loyaltyQrUrl,
    idleLoyaltyQrUrl,
    loyaltyQrAvailable,
    branchId,
    branchName,
    createSharedLoyaltySession,
  ])

  useEffect(() => {
    const interval = setInterval(() => setClockNow(new Date()), 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!cartPulse) return undefined
    const timer = window.setTimeout(() => setCartPulse(false), CART_PULSE_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [cartPulse])

  useEffect(() => {
    cartDockYRef.current = cartDockY
  }, [cartDockY])

  useEffect(() => () => {
    if (flyLaunchTimerRef.current) window.clearTimeout(flyLaunchTimerRef.current)
    if (flyCleanupTimerRef.current) window.clearTimeout(flyCleanupTimerRef.current)
    if (addedProdTimerRef.current) window.clearTimeout(addedProdTimerRef.current)
    if (cartFeedbackTimerRef.current) window.clearTimeout(cartFeedbackTimerRef.current)
    if (cartCheckTimerRef.current) window.clearTimeout(cartCheckTimerRef.current)
  }, [])

  // ---- idle timer ----
  const resetIdleTimer = useCallback(() => {
    clearTimeout(idleTimerRef.current)
    if (screen !== 'idle') {
      idleTimerRef.current = setTimeout(() => {
        resetOrder()
        setScreen('idle')
      }, (settings.idle_timeout_sec || 60) * 1000)
    }
  }, [screen, settings.idle_timeout_sec])

  useEffect(() => {
    resetIdleTimer()
    return () => clearTimeout(idleTimerRef.current)
  }, [screen, resetIdleTimer])

  useEffect(() => () => clearInterval(loyaltyPollRef.current), [])
  useEffect(() => () => {
    if (secretStationTapTimerRef.current) {
      window.clearTimeout(secretStationTapTimerRef.current)
      secretStationTapTimerRef.current = null
    }
  }, [])

  // ---- success countdown ----
  useEffect(() => {
    if (screen === 'success') {
      successTimerRef.current = setTimeout(() => {
        resetOrder()
        setScreen('idle')
      }, (settings.order_display_duration_sec || 30) * 1000)
    }
    return () => clearTimeout(successTimerRef.current)
  }, [screen, settings.order_display_duration_sec])

  useEffect(() => {
    if (kioskInteractive) return
    if (!['menu', 'cart_review', 'service_type', 'table_input', 'coupon', 'payment'].includes(screen)) return
    resetOrder()
    setScreen('idle')
  }, [kioskInteractive, screen])

  function resetOrder() {
    clearCartFeedbackTimers()
    setCart([])
    setServiceType('takeaway')
    setTableNumber('')
    setTableInputDraft('')
    setCouponCode('')
    setCouponInputDraft('')
    setPaymentMethod('cash')
    setOrderResult(null)
    setSelectedProduct(null)
    setSelectedComboProduct(null)
    setCouponMessage('')
    setSuggestionModal(null)
    setLoyaltyQrUrl('')
    setIdleLoyaltyQrUrl('')
    setLoyaltySession(null)
    setLoyaltyCustomer(null)
    setCartPulse(false)
    setCartCheckVisible(false)
    clearInterval(loyaltyPollRef.current)
  }

  // ---- catalog helpers ----
  const topCategories = useMemo(
    () => resolveKioskCategories(categories.filter(c => !c.parent_id), settings, clockNow),
    [categories, settings, clockNow],
  )
  const comboMenuCategoryId = useMemo(
    () => resolveComboMenuCategoryId(categories),
    [categories],
  )

  const allProducts = useMemo(() => {
    const comboProducts = buildKioskComboProducts(comboDefinitions, products, channel?.id || null, comboMenuCategoryId)
    return [...products, ...comboProducts]
  }, [comboDefinitions, products, channel?.id, comboMenuCategoryId])
  const selectedComboDefinition = useMemo(
    () => (selectedComboProduct ? findComboDefinitionForProduct(selectedComboProduct, comboDefinitions) : null),
    [comboDefinitions, selectedComboProduct]
  )

  useEffect(() => {
    if (!topCategories.length) return
    if (selectedCatId && topCategories.some(cat => cat.id === selectedCatId)) return
    setSelectedCatId(topCategories[0].id)
  }, [topCategories, selectedCatId])

  const categorySections = useMemo(
    () => topCategories
      .map(category => ({ category, products: getProductsForCategory(category.id) }))
      .filter(section => section.products.length > 0),
    [topCategories, categories, allProducts, channel?.id],
  )

  const activeCategory = useMemo(
    () => categorySections.find(section => section.category.id === selectedCatId)?.category || categorySections[0]?.category || null,
    [categorySections, selectedCatId],
  )

  const activeProducts = useMemo(
    () => categorySections.find(section => section.category.id === activeCategory?.id)?.products || [],
    [categorySections, activeCategory],
  )

  const mainBannerProduct = categorySections[0]?.products?.[0] || activeProducts[0] || allProducts[0] || null
  const configuredBannerProduct = allProducts.find(item => idsEqual(item.id, settings.main_banner_product_id)) || null
  const configuredBannerCategory = categorySections.find(section => idsEqual(section.category.id, settings.main_banner_category_id))?.category
    || categories.find(category => idsEqual(category.id, settings.main_banner_category_id))
    || null
  const bannerTitle = settings.main_banner_title || ''
  const bannerSubtitle = settings.main_banner_subtitle || ''
  const bannerImage = settings.main_banner_image || mainBannerProduct?.channel_image || categorySections[0]?.category?.kioskImageUrl || ''
  const bannerAltText = mainBannerProduct?.name || `${branchName || 'Kiosk'} vitrini`
  const bannerActionType = settings.main_banner_action_type || 'none'
  const bannerHasAction = (
    (bannerActionType === 'product' && configuredBannerProduct)
    || (bannerActionType === 'category' && configuredBannerCategory)
    || (bannerActionType === 'message' && (settings.main_banner_message_title || settings.main_banner_message_body))
  )
  const quickPicks = useMemo(() => {
    const configuredIds = Array.isArray(settings.quick_pick_product_ids)
      ? settings.quick_pick_product_ids.map(item => String(item || '').trim()).filter(Boolean)
      : []

    if (configuredIds.length > 0) {
      const configuredProducts = configuredIds
        .map(id => allProducts.find(product => idsEqual(product.id, id)))
        .filter(Boolean)
      if (configuredProducts.length > 0) return configuredProducts.slice(0, 2)
    }

    const picked = []
    const seen = new Set()
    for (const section of categorySections) {
      for (const product of section.products) {
        if (seen.has(product.id)) continue
        seen.add(product.id)
        picked.push(product)
        if (picked.length >= 2) return picked
      }
    }
    return picked
  }, [categorySections, allProducts, settings.quick_pick_product_ids])
  const showPromoBlocks = settings.kiosk_show_banners !== false && Boolean(bannerImage || mainBannerProduct)
  const showBannerMessage = Boolean(bannerTitle || bannerSubtitle)
  const showQuickPicks = settings.kiosk_show_quick_picks !== false && quickPicks.length > 0
  const categoryButtonHeight = Math.max(74, Math.min(settings.category_button_height || 112, Math.floor(520 / Math.max(categorySections.length || 1, 1))))
  const productGridCols = Math.max(2, Math.min(6, settings.product_grid_cols || 4))

  function onMainBannerClick(event) {
    if (bannerActionType === 'product' && configuredBannerProduct) {
      addToCart(configuredBannerProduct, event)
      return
    }
    if (bannerActionType === 'category' && configuredBannerCategory) {
      setScreen('menu')
      scrollToCategory(configuredBannerCategory.id)
      return
    }
    if (bannerActionType === 'message' && (settings.main_banner_message_title || settings.main_banner_message_body)) {
      setSuggestionModal({
        stage: 'banner',
        title: settings.main_banner_message_title || bannerTitle || bannerAltText,
        message: settings.main_banner_message_body || bannerSubtitle,
        actionLabel: '',
        action: null,
      })
    }
  }

  function getItemPrice(item) {
    return getKioskChannelPrice(item, channel?.id)
  }

  function getProductsForCategory(catId) {
    const childCatIds = new Set(
      categories.filter(c => c.id === catId || c.parent_id === catId).map(c => c.id)
    )
    return allProducts.filter(p => {
      const prices = Array.isArray(p.channel_prices) ? p.channel_prices : []
      const visible = channel?.id
        ? prices.some(price => price.channel_id === channel.id && price.active !== false)
        : getItemPrice(p) > 0
      if (!visible) return false
      return [p.sale_cat_l1, p.sale_cat_l2, p.sale_cat_l3, p.sale_cat_l4, p.sale_cat_l5]
        .some(cid => cid && childCatIds.has(cid))
    })
  }

  function parseJ(v, def = []) {
    if (!v) return def
    if (typeof v === 'string') { try { return JSON.parse(v) } catch { return def } }
    return Array.isArray(v) ? v : def
  }

  function needsModal(prod) {
    return parseJ(prod.portions, []).length > 1 || parseJ(prod.option_groups, []).length > 0
  }

  const cartSubtotal = useMemo(
    () => roundMoney(cart.reduce((sum, item) => sum + item.unitPrice * item.qty, 0)),
    [cart],
  )
  const maskedLoyaltyCustomerName = useMemo(
    () => maskCustomerName(displayText(loyaltyCustomer?.customerName || '')),
    [loyaltyCustomer?.customerName],
  )
  const loyaltyCustomerContext = useMemo(() => (
    loyaltyCustomer
      ? {
          customerId: String(loyaltyCustomer.customerId || ''),
          customerName: displayText(loyaltyCustomer.customerName || ''),
          customerCategoryIds: loyaltyCustomer.customerCategoryIds || [],
        }
      : {}
  ), [loyaltyCustomer])
  const preparedLoyaltyAdvantage = useMemo(
    () => resolvePreparedLoyaltyAdvantage(loyaltyCustomer, loyaltyCampaignCatalog),
    [loyaltyCustomer, loyaltyCampaignCatalog],
  )
  const selectedLoyaltyCampaignId = String(loyaltyCustomer?.selectedCampaignId || '').trim()
  const [loyaltyEvaluation, setLoyaltyEvaluation] = useState({ visibleCampaigns: [], applicableOffers: [], walletReadiness: null })
  const [selectedCampaignCompatibilityEvaluation, setSelectedCampaignCompatibilityEvaluation] = useState({ visibleCampaigns: [], applicableOffers: [], walletReadiness: null })
  const selectedLoyaltyProgramId = useMemo(() => {
    const selectedCampaign = loyaltyEvaluation.visibleCampaigns.find(item => String(item.id || '') === selectedLoyaltyCampaignId)
      || selectedCampaignCompatibilityEvaluation.visibleCampaigns.find(item => String(item.id || '') === selectedLoyaltyCampaignId)
    if (selectedCampaign?.programId) return String(selectedCampaign.programId).trim()

    const candidateProgramIds = [
      ...new Set(
        (loyaltyCampaignCatalog || [])
          .map(campaign => String(campaign.programId || campaign.program_id || '').trim())
          .filter(Boolean),
      ),
    ]
    return candidateProgramIds.length === 1 ? candidateProgramIds[0] : ''
  }, [loyaltyCampaignCatalog, loyaltyEvaluation.visibleCampaigns, selectedCampaignCompatibilityEvaluation.visibleCampaigns, selectedLoyaltyCampaignId])
  useEffect(() => {
    let ignore = false
    if (!loyaltyCampaignCatalog.length || cartSubtotal <= 0) {
      setLoyaltyEvaluation({ visibleCampaigns: [], applicableOffers: [], walletReadiness: null })
      setSelectedCampaignCompatibilityEvaluation({ visibleCampaigns: [], applicableOffers: [], walletReadiness: null })
      return
    }

    const syncMain = evaluateRuntimeOrderCampaigns(loyaltyCampaignCatalog, {
      runtimeChannel: 'kiosk',
      orderTotal: cartSubtotal,
      customerContext: loyaltyCustomerContext,
      selectedCampaignId: selectedLoyaltyCampaignId,
      cartLines: cart,
      manuallyTriggeredCampaignIds: loyaltyCustomer?.selectedCampaignIds || [],
      selectedCouponCode: loyaltyCustomer?.selectedCouponCode || couponCode || '',
    })
    const syncCompat = selectedLoyaltyCampaignId
      ? evaluateRuntimeOrderCampaigns(loyaltyCampaignCatalog, {
        runtimeChannel: 'pos',
        orderTotal: cartSubtotal,
        customerContext: loyaltyCustomerContext,
        selectedCampaignId: selectedLoyaltyCampaignId,
        cartLines: cart,
        manuallyTriggeredCampaignIds: loyaltyCustomer?.selectedCampaignIds || [],
        selectedCouponCode: loyaltyCustomer?.selectedCouponCode || couponCode || '',
      })
      : { visibleCampaigns: [], applicableOffers: [], walletReadiness: null }

    ;(async () => {
      try {
        const [mainEval, compatEval] = await Promise.all([
          evaluateRuntimeOrderCampaignsAsync(loyaltyCampaignCatalog, {
            runtimeChannel: 'kiosk',
            orderTotal: cartSubtotal,
            customerContext: loyaltyCustomerContext,
            selectedCampaignId: selectedLoyaltyCampaignId,
            programId: selectedLoyaltyProgramId,
            cartLines: cart,
            manuallyTriggeredCampaignIds: loyaltyCustomer?.selectedCampaignIds || [],
            selectedCouponCode: loyaltyCustomer?.selectedCouponCode || couponCode || '',
          }),
          selectedLoyaltyCampaignId
            ? evaluateRuntimeOrderCampaignsAsync(loyaltyCampaignCatalog, {
              runtimeChannel: 'pos',
              orderTotal: cartSubtotal,
              customerContext: loyaltyCustomerContext,
              selectedCampaignId: selectedLoyaltyCampaignId,
              programId: selectedLoyaltyProgramId,
              cartLines: cart,
              manuallyTriggeredCampaignIds: loyaltyCustomer?.selectedCampaignIds || [],
              selectedCouponCode: loyaltyCustomer?.selectedCouponCode || couponCode || '',
            })
            : Promise.resolve({ visibleCampaigns: [], applicableOffers: [], walletReadiness: null }),
        ])
        if (ignore) return
        setLoyaltyEvaluation(mainEval)
        setSelectedCampaignCompatibilityEvaluation(compatEval)
      } catch {
        if (ignore) return
        setLoyaltyEvaluation({ ...syncMain, walletReadiness: null })
        setSelectedCampaignCompatibilityEvaluation({ ...syncCompat, walletReadiness: null })
      }
    })()

    return () => { ignore = true }
  }, [loyaltyCustomer, loyaltyCampaignCatalog, cartSubtotal, loyaltyCustomerContext, selectedLoyaltyCampaignId, selectedLoyaltyProgramId, couponCode, cart])
  const selectedLoyaltyOffer = useMemo(() => {
    const selectedId = selectedLoyaltyCampaignId
    if (!selectedId) return null
    const selectedCard = loyaltyEvaluation.visibleCampaigns.find(item => String(item.id || '') === selectedId)
      || selectedCampaignCompatibilityEvaluation.visibleCampaigns.find(item => String(item.id || '') === selectedId)
    if (!selectedCard?.orderEligible || !selectedCard?.offer) return null
    return {
      ...selectedCard.offer,
      campaignName: displayText(
        selectedCard.name || selectedCard.offer.campaignName || loyaltyCustomer?.selectedCampaignName || '',
        'Sadakat kampanyası',
      ),
    }
  }, [
    selectedLoyaltyCampaignId,
    loyaltyCustomer?.selectedCampaignName,
    loyaltyEvaluation.visibleCampaigns,
    selectedCampaignCompatibilityEvaluation.visibleCampaigns,
  ])
  const autoApplicableLoyaltyOffer = useMemo(() => {
    if (selectedLoyaltyOffer) return null
    return loyaltyEvaluation.applicableOffers.find(item => 
      item.applicationMode === 'auto' || 
      item.decisionContext?.conditionKey === 'coupon_present'
    ) || null
  }, [loyaltyEvaluation.applicableOffers, selectedLoyaltyOffer])
  const appliedLoyaltyOffer = selectedLoyaltyOffer || autoApplicableLoyaltyOffer || null
  const preparedAdvantageStatusText = useMemo(() => {
    if (!preparedLoyaltyAdvantage.hasPreparedAdvantage) return ''
    if (preparedLoyaltyAdvantage.hasPreparedCampaign) {
      return selectedLoyaltyOffer
        ? 'Bu sipariste uygulanabilir'
        : 'Secildi, bu sepette henuz uygun degil'
    }
    if (preparedLoyaltyAdvantage.hasPreparedCoupon) return 'Kupon baglandi, odeme adiminda uygulanir'
    return ''
  }, [preparedLoyaltyAdvantage, selectedLoyaltyOffer])
  const pricedCart = useMemo(() => {
    const expandedUnits = []
    const summaryByItemId = new Map()

    cart.forEach(item => {
      const qty = Math.max(1, parseInt(item.qty, 10) || 1)
      summaryByItemId.set(item.id, {
        giftQty: 0,
        giftUnitIndexes: [],
        giftCampaignId: '',
        giftCampaignName: '',
      })
      for (let unitIndex = 0; unitIndex < qty; unitIndex += 1) {
        expandedUnits.push({
          itemId: item.id,
          unitIndex,
          prodId: item.prodId,
          name: item.name,
          unitPrice: roundMoney(item.unitPrice),
          isGift: false,
          giftCampaignId: '',
          giftCampaignName: '',
          options: item.options || [],
          portionId: item.portionId || null,
        })
      }
    })

    if (appliedLoyaltyOffer?.discountType === 'free_products') {
      const giftItems = Array.isArray(appliedLoyaltyOffer.giftItems) ? appliedLoyaltyOffer.giftItems : []
      giftItems.forEach(giftItem => {
        let remaining = Math.max(1, parseInt(giftItem?.qty, 10) || 1)
        for (let index = 0; index < expandedUnits.length && remaining > 0; index += 1) {
          const unit = expandedUnits[index]
          if (unit.isGift) continue
          const matchById = giftItem?.productId && unit.prodId && String(unit.prodId) === String(giftItem.productId)
          const matchByName = !matchById
            && giftItem?.name
            && unit.name
            && String(unit.name).trim().toLocaleLowerCase('tr-TR') === String(giftItem.name).trim().toLocaleLowerCase('tr-TR')
          if (!matchById && !matchByName) continue

          const optionTotal = (unit.options || []).reduce((sum, option) => sum + (parseFloat(option.price) || 0), 0)
          const prod = (products || []).find(p => String(p.id) === String(unit.prodId))
          const portions = prod ? pJ(prod.portions, []) : []
          const portion = portions.find(p => p.id === unit.portionId) || null
          const portionOffset = parseFloat(portion?.price_offset) || 0

          const freeOptions = appliedLoyaltyOffer.freeOptions !== false
          const freeSizes = appliedLoyaltyOffer.freeSizes !== false
          const unpaidPart = (freeOptions ? 0 : optionTotal) + (freeSizes ? 0 : portionOffset)
          const unitDiscount = Math.max(0, unit.unitPrice - unpaidPart)

          unit.isGift = true
          unit.giftCampaignId = String(appliedLoyaltyOffer.campaignId || '')
          unit.giftCampaignName = appliedLoyaltyOffer.campaignName || ''
          const summary = summaryByItemId.get(unit.itemId)
          if (summary) {
            summary.giftQty += 1
            summary.giftUnitIndexes.push(unit.unitIndex)
            summary.giftCampaignId = unit.giftCampaignId
            summary.giftCampaignName = unit.giftCampaignName
            summary.giftDiscount = (summary.giftDiscount || 0) + unitDiscount
          }
          remaining -= 1
        }
      })
    }

    return cart.map(item => {
      const qty = Math.max(1, parseInt(item.qty, 10) || 1)
      const unitPrice = roundMoney(item.unitPrice)
      const summary = summaryByItemId.get(item.id) || {
        giftQty: 0,
        giftUnitIndexes: [],
        giftCampaignId: '',
        giftCampaignName: '',
        giftDiscount: 0,
      }
      const lineBaseTotal = roundMoney(unitPrice * qty)
      const lineGiftDiscount = roundMoney(summary.giftDiscount || 0)
      const lineEffectiveTotal = roundMoney(Math.max(0, lineBaseTotal - lineGiftDiscount))
      return {
        ...item,
        giftQty: summary.giftQty,
        giftUnitIndexes: summary.giftUnitIndexes,
        giftCampaignId: summary.giftCampaignId,
        giftCampaignName: summary.giftCampaignName,
        giftLabel: buildGiftStatusLabel(summary.giftQty, qty, summary.giftCampaignName),
        payableQty: Math.max(0, qty - summary.giftQty),
        lineBaseTotal,
        lineGiftDiscount,
        lineEffectiveTotal,
        isGift: summary.giftQty >= qty && qty > 0,
        hasGift: summary.giftQty > 0,
      }
    })
  }, [cart, appliedLoyaltyOffer, products])
  const loyaltyGiftDiscountAmount = useMemo(
    () => roundMoney(pricedCart.reduce((sum, item) => sum + (item.lineGiftDiscount || 0), 0)),
    [pricedCart],
  )
  const loyaltyOrderDiscountAmount = useMemo(() => {
    if (!appliedLoyaltyOffer || appliedLoyaltyOffer.discountType === 'free_products') return 0
    return roundMoney(appliedLoyaltyOffer.discountAmount || 0)
  }, [appliedLoyaltyOffer])
  const loyaltyAdjustedSubtotal = roundMoney(Math.max(0, cartSubtotal - loyaltyGiftDiscountAmount - loyaltyOrderDiscountAmount))
  const couponResult = useMemo(
    () => (couponCode ? evaluateCoupon(couponCode, settings, loyaltyAdjustedSubtotal) : null),
    [couponCode, settings, loyaltyAdjustedSubtotal],
  )
  const couponDiscountAmount = couponResult?.discountAmount || 0
  const loyaltyDiscountAmount = roundMoney(loyaltyGiftDiscountAmount + loyaltyOrderDiscountAmount)
  const totalDiscountAmount = roundMoney(loyaltyDiscountAmount + couponDiscountAmount)
  const orderTotal = roundMoney(Math.max(0, cartSubtotal - totalDiscountAmount))
  const isZeroTotalOrder = cart.length > 0 && orderTotal <= 0.009
  const primaryCheckoutLabel = isZeroTotalOrder ? 'Sipari\u015fi g\u00f6nder' : '\u00d6demeye ge\u00e7'
  const paymentConfirmLabel = isZeroTotalOrder ? 'Sipari\u015fi g\u00f6nder' : 'Sipari\u015fi Tamamla'
  const saleLoyaltySnapshot = useMemo(() => {
    const multipliersActive = (loyaltyEvaluation.combinedEarnMultiplier && loyaltyEvaluation.combinedEarnMultiplier !== 1) ||
                              (loyaltyEvaluation.combinedRedeemMultiplier && loyaltyEvaluation.combinedRedeemMultiplier !== 1);
    const loyaltyCampaignPayload = appliedLoyaltyOffer || (multipliersActive ? {
      decisionContext: {
        combinedEarnMultiplier: loyaltyEvaluation.combinedEarnMultiplier,
        combinedRedeemMultiplier: loyaltyEvaluation.combinedRedeemMultiplier,
        tierPointsMultiplier: (loyaltyCustomer?.tierPointsMultiplier || loyaltyCustomer?.pointsMultiplier || loyaltyCustomer?.points_multiplier || 1)
      }
    } : null);
    return createSaleLoyaltySnapshot(loyaltyCampaignPayload);
  }, [appliedLoyaltyOffer, loyaltyEvaluation.combinedEarnMultiplier, loyaltyEvaluation.combinedRedeemMultiplier, loyaltyCustomer])
  const activeLoyaltyLabel = useMemo(() => displayText(
    appliedLoyaltyOffer?.campaignName || loyaltyCustomer?.selectedCampaignName || '',
    'Sadakat kampanyası',
  ), [appliedLoyaltyOffer, loyaltyCustomer])
  const activeLoyaltyNote = displayText(
    appliedLoyaltyOffer?.offerLabel || activeLoyaltyLabel,
    '',
  )
  const expandedCart = useMemo(() => {
    const lines = []
    pricedCart.forEach(item => {
      const qty = Math.max(1, parseInt(item.qty, 10) || 1)
      const giftUnitIndexes = new Set(Array.isArray(item.giftUnitIndexes) ? item.giftUnitIndexes : [])
      for (let unitIndex = 0; unitIndex < qty; unitIndex += 1) {
        const isGiftUnit = giftUnitIndexes.has(unitIndex)
        if (item?.comboBundle?.expandedLines?.length) {
          item.comboBundle.expandedLines.forEach(line => {
            const lineUnitPrice = roundMoney(line.unitPrice)
            lines.push({
              id: `${item.id}:${unitIndex}:${line.product_id}:${line.groupName || ''}`,
              prodId: line.product_id,
              name: line.product_name,
              sku: line.prod?.sku || null,
              qty: 1,
              unitPrice: isGiftUnit ? 0 : lineUnitPrice,
              originalUnitPrice: lineUnitPrice,
              taxId: item.taxId,
              options: line.options || [],
              portionId: null,
              portionName: null,
              prepTimeMinutes: Math.max(0, parseInt(line.prod?.prep_time_minutes, 10) || 0),
              isGift: isGiftUnit,
              giftCampaignId: isGiftUnit ? item.giftCampaignId : '',
              giftCampaignName: isGiftUnit ? item.giftCampaignName : '',
            })
          })
          continue
        }
        const baseUnitPrice = roundMoney(item.unitPrice)
        lines.push({
          id: `${item.id}:${unitIndex}`,
          prodId: item.prodId,
          name: item.name,
          sku: item.sku || null,
          qty: 1,
          unitPrice: isGiftUnit ? 0 : baseUnitPrice,
          originalUnitPrice: baseUnitPrice,
          taxId: item.taxId,
          options: item.options || [],
          portionId: item.portionId || null,
          portionName: item.portionName || null,
          prepTimeMinutes: Math.max(0, parseInt(item.prepTimeMinutes, 10) || 0),
          isGift: isGiftUnit,
          giftCampaignId: isGiftUnit ? item.giftCampaignId : '',
          giftCampaignName: isGiftUnit ? item.giftCampaignName : '',
        })
      }
    })
    return lines
  }, [pricedCart])
  const orderLevelDiscountAmount = roundMoney(couponDiscountAmount + loyaltyOrderDiscountAmount)
  const expandedOrderLevelDiscounts = useMemo(
    () => allocateDiscountAcrossLines(expandedCart, orderLevelDiscountAmount),
    [expandedCart, orderLevelDiscountAmount],
  )

  function surface(extra = {}) {
    return {
      background: rgba(panelColor, .84),
      border: '1px solid rgba(148,163,184,.12)',
      borderRadius: 18,
      ...extra,
    }
  }

  function resolveSuggestionCategoryTarget(categoryId) {
    const rawTarget = categories.find(item => idsEqual(item.id, categoryId))
    if (!rawTarget) return null

    const topTarget = topCategories.find(item => idsEqual(item.id, rawTarget.id))
    if (topTarget) {
      return {
        rawTarget,
        scrollTarget: topTarget,
      }
    }

    let parentId = rawTarget.parent_id
    while (parentId) {
      const parentTop = topCategories.find(item => idsEqual(item.id, parentId))
      if (parentTop) {
        return {
          rawTarget,
          scrollTarget: parentTop,
        }
      }
      const parentNode = categories.find(item => idsEqual(item.id, parentId))
      parentId = parentNode?.parent_id || null
    }

    return {
      rawTarget,
      scrollTarget: null,
    }
  }

  function buildSuggestion(rule, stage) {
    if (rule.suggestionType === 'product' && rule.suggestionProductId) {
    const product = allProducts.find(item => idsEqual(item.id, rule.suggestionProductId))
      if (!product) return null
      return {
        stage,
        title: rule.title || `${product.name} ekleyelim mi?`,
        message: rule.message || product.channel_description || '',
        actionLabel: 'Sepete ekle',
        action() {
          if (needsModal(product)) setSelectedProduct(product)
          else addToCartDirect(product, null, null, [], null)
        },
      }
    }

    if (rule.suggestionType === 'category' && rule.suggestionCategoryId) {
      const target = resolveSuggestionCategoryTarget(rule.suggestionCategoryId)
      if (!target?.rawTarget) return null
      return {
        stage,
        title: rule.title || `${target.rawTarget.name} kategorisine bak`,
        message: rule.message || target.scrollTarget?.kioskScheduleNote || '',
        actionLabel: target.scrollTarget ? 'Kategoriye git' : '',
        action() {
          if (!target.scrollTarget) return
          setScreen('menu')
          scrollToCategory(target.scrollTarget.id)
        },
      }
    }

    return {
      stage,
      title: displayText(rule.title, 'Kısa bir önerimiz var'),
      message: rule.message || '',
      actionLabel: '',
      action: null,
    }
  }

  function maybeShowProductSuggestion(prod) {
    const match = (settings.product_suggestions || []).find(rule => (
      (productSuggestionHits[rule.id] || 0) < (settings.suggestion_limits?.productFlow || 2)
      && matchProductSuggestion(rule, prod, allProducts)
    ))
    if (!match) return
    const suggestion = buildSuggestion(match, 'product')
    if (!suggestion) return
    setProductSuggestionHits(current => ({ ...current, [match.id]: (current[match.id] || 0) + 1 }))
    setSuggestionModal(suggestion)
  }

  function continueCheckoutFlow() {
    if (settings.table_service_enabled) setScreen('service_type')
    else setScreen('payment')
  }

  function maybeShowCheckoutSuggestion() {
    const match = (settings.checkout_suggestions || []).find(rule => (
      (checkoutSuggestionHits[rule.id] || 0) < (settings.suggestion_limits?.checkout || 1)
      && evaluateCheckoutSuggestion(rule, cart, allProducts, orderTotal)
    ))
    if (!match) {
      continueCheckoutFlow()
      return
    }
    const suggestion = buildSuggestion(match, 'checkout')
    if (!suggestion) {
      continueCheckoutFlow()
      return
    }
    setCheckoutSuggestionHits(current => ({ ...current, [match.id]: (current[match.id] || 0) + 1 }))
    setSuggestionModal(suggestion)
  }

  function openKioskStationModal() {
    setKioskStationModalMode('initial')
    setKioskStationDraft(deviceKioskCode || '')
    setKioskStationModalOpen(true)
  }

  function openHiddenKioskStationModal() {
    setKioskStationModalMode('hidden')
    setKioskStationDraft(deviceKioskCode || '')
    setKioskStationModalOpen(true)
  }

  function closeKioskStationModal() {
    setKioskStationDraft(deviceKioskCode || '')
    setKioskStationModalMode('initial')
    setKioskStationModalOpen(false)
  }

  function saveKioskStationSelection() {
    const savedCode = saveKioskDeviceStationCode(kioskStationDraft)
    setDeviceKioskCode(savedCode)
    setKioskStationDraft(savedCode)
    setKioskStationModalMode('initial')
    setKioskStationModalOpen(false)
  }

  function resetSecretStationUnlock() {
    secretStationTapRef.current = { count: 0, lastAt: 0 }
    if (secretStationTapTimerRef.current) {
      window.clearTimeout(secretStationTapTimerRef.current)
      secretStationTapTimerRef.current = null
    }
  }

  function handleSecretStationUnlock(event) {
    if (showVisibleStationSetup) return
    event?.stopPropagation?.()
    const now = Date.now()
    const previous = secretStationTapRef.current
    const withinWindow = now - previous.lastAt <= SECRET_STATION_UNLOCK_WINDOW_MS
    const nextCount = withinWindow ? previous.count + 1 : 1
    secretStationTapRef.current = { count: nextCount, lastAt: now }

    if (secretStationTapTimerRef.current) {
      window.clearTimeout(secretStationTapTimerRef.current)
    }
    secretStationTapTimerRef.current = window.setTimeout(() => {
      resetSecretStationUnlock()
    }, SECRET_STATION_UNLOCK_WINDOW_MS)

    if (nextCount >= SECRET_STATION_UNLOCK_TAP_COUNT) {
      resetSecretStationUnlock()
      openHiddenKioskStationModal()
    }
  }

  async function openLoyaltyModal() {
    try {
      if (loyaltyCustomer?.customerName) return
      if (!loyaltyQrAvailable) return
      setLoyaltyModalOpen(true)
      if (loyaltySession?.token && loyaltyQrUrl) {
        if (!idleLoyaltyQrUrl) setIdleLoyaltyQrUrl(loyaltyQrUrl)
        startLoyaltyPolling(loyaltySession.token)
        return
      }
      await createSharedLoyaltySession()
    } catch (err) {
      alert(`Sadakat bağlantısı başlatılamadı: ${err.message}`)
    }
  }

  async function applyCouponDraft() {
    const code = couponInputDraft.trim().toUpperCase()
    if (!code) return

    // 1. Önce yerel statik kuponları kontrol et
    const localResult = evaluateCoupon(code, settings, loyaltyAdjustedSubtotal)
    if (localResult) {
      if (localResult.error) {
        setCouponMessage(localResult.error)
        return
      }
      setCouponCode(code)
      setCouponMessage(`${localResult.coupon.label || code} kuponu uygulandı.`)
      if (cart.length > 0) {
        setScreen('cart_review')
      } else {
        setScreen('menu')
      }
      return
    }

    // 2. Yerelde yoksa sadakat veritabanından dinamik kuponu sorgula
    try {
      setCouponMessage('Kupon kontrol ediliyor...')
      const res = await db.from('loyalty_coupons')
        .select('id,code,series_id,is_used,active,redemption_status,expires_at')
        .ilike('code', code)
        .maybeSingle()

      if (!res?.data) {
        setCouponMessage('Bu kupon bulunamadı.')
        return
      }

      const coupon = res.data
      if (coupon.active === false) {
        setCouponMessage('Bu kupon pasif durumdadır.')
        return
      }

      const isUsedStatus = ['used', 'expired', 'cancelled'].includes(String(coupon.redemption_status || '').toLowerCase())
      if (coupon.is_used || isUsedStatus) {
        setCouponMessage('Bu kupon daha önce kullanılmıştır.')
        return
      }

      if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
        setCouponMessage('Bu kuponun kullanım süresi dolmuştur.')
        return
      }

      setCouponCode(code)
      setCouponMessage(`Sadakat kuponu (${code}) uygulandı.`)
      if (cart.length > 0) {
        setScreen('cart_review')
      } else {
        setScreen('menu')
      }
    } catch (err) {
      setCouponMessage('Kupon sorgulanamadı, lütfen tekrar deneyin.')
      console.error(err)
    }
  }

  function clearCategorySyncIntent() {
    categorySyncIntentRef.current = { id: null, expiresAt: 0 }
  }

  function holdCategorySyncIntent(catId, duration = CATEGORY_SYNC_LOCK_MS) {
    categorySyncIntentRef.current = {
      id: catId == null ? null : String(catId),
      expiresAt: Date.now() + duration,
    }
  }

  const getContainerPaddingTop = useCallback(() => {
    const container = productsScrollRef.current
    if (!container) return 0
    return Number.parseFloat(window.getComputedStyle(container).paddingTop || '0') || 0
  }, [])

  const getCategoryAlignmentOffset = useCallback((catId, fallback = 8) => {
    const container = productsScrollRef.current
    const button = catButtonRefs.current[catId]
    if (!container || !button) return fallback
    const containerTop = container.getBoundingClientRect().top
    const paddingTop = getContainerPaddingTop()
    return Math.max(fallback, button.getBoundingClientRect().top - containerTop - paddingTop)
  }, [getContainerPaddingTop])

  const getCategoryAnchorNode = useCallback((catId, target = 'header') => {
    if (target === 'grid') return catGridRefs.current[catId] || null
    if (target === 'section') return catSectionRefs.current[catId] || null
    return catHeaderRefs.current[catId] || catSectionRefs.current[catId] || null
  }, [])

  const getCategoryScrollOffset = useCallback((catId, target = 'header') => {
    const content = productsContentRef.current
    const anchor = getCategoryAnchorNode(catId, target)
    if (!content || !anchor) return null
    return anchor.getBoundingClientRect().top - content.getBoundingClientRect().top
  }, [getCategoryAnchorNode])

  const getCategoryViewportDelta = useCallback((catId, target = 'header') => {
    const button = catButtonRefs.current[catId]
    const anchor = getCategoryAnchorNode(catId, target)
    if (!button || !anchor) return null
    return anchor.getBoundingClientRect().top - button.getBoundingClientRect().top
  }, [getCategoryAnchorNode])

  const syncCategoryFromScroll = useCallback(() => {
    const container = productsScrollRef.current
    if (!container || !categorySections.length) return
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
    if (container.scrollTop >= maxScrollTop - 2) {
      clearCategorySyncIntent()
      const lastId = categorySections[categorySections.length - 1]?.category?.id
      if (lastId != null) {
        setSelectedCatId(current => (current === lastId ? current : lastId))
      }
      return
    }
    const activationSlack = 8
    let nextId = categorySections[0].category.id
    for (const section of categorySections) {
      const targetOffset = getCategoryScrollOffset(section.category.id, 'header')
      if (targetOffset == null) continue
      const top = targetOffset - container.scrollTop
      const activationOffset = getCategoryAlignmentOffset(section.category.id, 8) + activationSlack
      if (top <= activationOffset) nextId = section.category.id
      else break
    }

    const pendingIntent = categorySyncIntentRef.current
    const pendingId = pendingIntent?.id
    if (pendingId) {
      if (Date.now() <= (pendingIntent.expiresAt || 0)) {
        const pendingTargetOffset = getCategoryScrollOffset(pendingId, 'header')
        if (pendingTargetOffset != null) {
          const pendingTop = pendingTargetOffset - container.scrollTop
          const pendingAlignmentOffset = getCategoryAlignmentOffset(pendingId, 8)
          const pendingDelta = Math.abs(pendingTop - pendingAlignmentOffset)
          if (nextId !== pendingId && pendingDelta > CATEGORY_SYNC_RELEASE_DELTA) return
          if (pendingDelta <= CATEGORY_SYNC_RELEASE_DELTA || nextId === pendingId) {
            nextId = pendingId
            clearCategorySyncIntent()
          }
        } else {
          clearCategorySyncIntent()
        }
      } else {
        clearCategorySyncIntent()
      }
    }

    setSelectedCatId(current => (current === nextId ? current : nextId))
  }, [categorySections, getCategoryAlignmentOffset, getCategoryScrollOffset])

  function clearCategoryAlignTasks() {
    if (categoryAlignFrameRef.current) {
      window.cancelAnimationFrame(categoryAlignFrameRef.current)
      categoryAlignFrameRef.current = null
    }
    if (categoryAlignTimerRef.current) {
      window.clearTimeout(categoryAlignTimerRef.current)
      categoryAlignTimerRef.current = null
    }
  }

  function alignCategoryToButton(catId, behavior = 'smooth') {
    const container = productsScrollRef.current
    if (!container) return
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
    const viewportDelta = getCategoryViewportDelta(catId, 'header')
    if (viewportDelta != null) {
      container.scrollTo({
        top: Math.max(0, Math.min(maxScrollTop, container.scrollTop + viewportDelta)),
        behavior,
      })
      return
    }
    const targetOffset = getCategoryScrollOffset(catId, 'header')
    if (targetOffset == null) return
    const alignmentOffset = getCategoryAlignmentOffset(catId, 8)
    container.scrollTo({
      top: Math.max(0, Math.min(maxScrollTop, targetOffset - alignmentOffset)),
      behavior,
    })
  }

  function scrollToCategory(catId) {
    setSelectedCatId(catId)
    holdCategorySyncIntent(catId)
    clearCategoryAlignTasks()
    categoryAlignFrameRef.current = window.requestAnimationFrame(() => {
      categoryAlignFrameRef.current = null
      alignCategoryToButton(catId, 'smooth')
      categoryAlignTimerRef.current = window.setTimeout(() => {
        categoryAlignTimerRef.current = null
        alignCategoryToButton(catId, 'auto')
      }, 280)
    })
  }

  useEffect(() => {
    if (screen !== 'menu') return
    syncCategoryFromScroll()
  }, [screen, syncCategoryFromScroll])

  useEffect(() => () => {
    clearCategoryAlignTasks()
    clearCategorySyncIntent()
  }, [])

  function getCartFlyHeadStart(distance) {
    if (distance < 24) return 0
    return Math.min(CART_MOVE_DURATION_MS + 90, 220 + Math.round(distance * 0.22))
  }

  function getCartDockBounds(hostRect) {
    const viewport = getViewportMetrics()
    const viewportHeight = viewport.height || hostRect.height
    const safeMargin = Math.round(viewportHeight / CART_DOCK_VIEWPORT_MARGIN_RATIO)
    const minY = Math.max(CART_DOCK_MIN_Y, safeMargin + viewport.offsetTop - hostRect.top)
    const maxByViewport = viewportHeight - safeMargin + viewport.offsetTop - hostRect.top - CART_DOCK_SIZE
    const maxByContainer = hostRect.height - CART_DOCK_BOTTOM_GAP - CART_DOCK_SIZE
    const maxY = Math.max(minY, Math.min(maxByContainer, maxByViewport))
    return { minY, maxY }
  }

  function clampCartDockY(nextY) {
    const host = catalogRef.current
    if (!host) return nextY
    const bounds = getCartDockBounds(host.getBoundingClientRect())
    return Math.max(bounds.minY, Math.min(nextY, bounds.maxY))
  }

  function getCartFlightCenter(targetDockY = cartDockYRef.current) {
    const cartEl = cartRef.current
    if (cartEl) {
      const rect = cartEl.getBoundingClientRect()
      return {
        x: rect.left + (rect.width / 2),
        y: rect.top + (rect.height / 2),
      }
    }
    const host = catalogRef.current
    if (host) {
      const rect = host.getBoundingClientRect()
      const clampedDockY = Math.max(0, Math.min(clampCartDockY(targetDockY), rect.height - CART_DOCK_SIZE))
      return {
        x: rect.right - CART_DOCK_RIGHT - (CART_DOCK_SIZE / 2),
        y: rect.top + clampedDockY + (CART_DOCK_SIZE / 2),
      }
    }
    return null
  }

  function resolveCartFlyPlan(targetDockY = cartDockYRef.current) {
    const state = cartMoveStateRef.current
    const resolvedTargetY = targetDockY ?? state?.targetY ?? cartDockYRef.current
    if (!state || Math.abs((state.targetY ?? resolvedTargetY) - resolvedTargetY) > 1 || !state.headStartMs) {
      return { targetDockY: resolvedTargetY, delayMs: 0 }
    }
    const now = window.performance?.now?.() || Date.now()
    return {
      targetDockY: resolvedTargetY,
      delayMs: Math.max(0, Math.round(state.headStartMs - (now - state.movedAt))),
    }
  }

  function clearFlyAnimationTimers() {
    if (flyLaunchTimerRef.current) {
      window.clearTimeout(flyLaunchTimerRef.current)
      flyLaunchTimerRef.current = null
    }
    if (flyCleanupTimerRef.current) {
      window.clearTimeout(flyCleanupTimerRef.current)
      flyCleanupTimerRef.current = null
    }
  }

  function clearCartFeedbackTimers() {
    if (cartFeedbackTimerRef.current) {
      window.clearTimeout(cartFeedbackTimerRef.current)
      cartFeedbackTimerRef.current = null
    }
    if (cartCheckTimerRef.current) {
      window.clearTimeout(cartCheckTimerRef.current)
      cartCheckTimerRef.current = null
    }
  }

  function moveCartTowardPointer(event) {
    const host = catalogRef.current
    const currentY = cartDockYRef.current
    if (!host || !event?.clientY) return { targetY: currentY, distance: 0, headStartMs: 0 }
    if (event.target?.closest?.('[data-cart-ignore="true"]')) return { targetY: currentY, distance: 0, headStartMs: 0 }
    const rect = host.getBoundingClientRect()
    const pointerY = event.clientY - rect.top
    const nextY = clampCartDockY(pointerY - CART_DOCK_POINTER_OFFSET)
    const distance = Math.abs(nextY - currentY)
    const headStartMs = getCartFlyHeadStart(distance)
    if (distance > 0) {
      cartDockYRef.current = nextY
      cartMoveStateRef.current = {
        targetY: nextY,
        movedAt: window.performance?.now?.() || Date.now(),
        headStartMs,
      }
      setCartDockY(nextY)
    }
    return { targetY: nextY, distance, headStartMs }
  }

  useEffect(() => {
    if (screen !== 'menu') return undefined

    const syncCartDockToViewport = () => {
      const clampedY = clampCartDockY(cartDockYRef.current)
      if (Math.abs(clampedY - cartDockYRef.current) <= 1) return
      cartDockYRef.current = clampedY
      setCartDockY(clampedY)
    }

    syncCartDockToViewport()
    window.addEventListener('resize', syncCartDockToViewport)
    window.visualViewport?.addEventListener('resize', syncCartDockToViewport)
    window.visualViewport?.addEventListener('scroll', syncCartDockToViewport)
    return () => {
      window.removeEventListener('resize', syncCartDockToViewport)
      window.visualViewport?.removeEventListener('resize', syncCartDockToViewport)
      window.visualViewport?.removeEventListener('scroll', syncCartDockToViewport)
    }
  }, [screen])

  // ---- cart operations ----
  function createFlyFromRect(sourceRect, options = {}) {
    if (!sourceRect) return { delayMs: 0, totalMs: 0 }
    const plan = resolveCartFlyPlan(options.targetDockY)
    const delayMs = options.delayMs ?? plan.delayMs
    clearFlyAnimationTimers()

    const start = () => {
      const end = getCartFlightCenter(plan.targetDockY)
      if (!end) return
      const sourceCenterX = sourceRect.left + (sourceRect.width / 2)
      const sourceCenterY = sourceRect.top + (sourceRect.height / 2)
      const sourceSize = Math.max(30, Math.min(56, Math.round(Math.min(sourceRect.width, sourceRect.height) * 0.34)))
      const tx = end.x - sourceCenterX
      const ty = end.y - sourceCenterY
      const travel = Math.hypot(tx, ty)
      const lift = Math.max(52, Math.min(132, 42 + (travel * 0.1)))

      setFlyer({
        x: sourceCenterX - (sourceSize / 2),
        y: sourceCenterY - (sourceSize / 2),
        size: sourceSize,
        tx,
        ty,
        curveX: tx * 0.54,
        curveY: Math.min((ty * 0.18) - lift, -42),
      })

      flyCleanupTimerRef.current = window.setTimeout(() => {
        flyCleanupTimerRef.current = null
        setFlyer(null)
      }, CART_FLY_DURATION_MS + 40)
    }

    if (delayMs > 0) {
      flyLaunchTimerRef.current = window.setTimeout(() => {
        flyLaunchTimerRef.current = null
        start()
      }, delayMs)
      return { delayMs, totalMs: delayMs + CART_FLY_DURATION_MS }
    }

    start()
    return { delayMs, totalMs: delayMs + CART_FLY_DURATION_MS }
  }

  function createFly(e) {
    const sourceEl = e?.currentTarget?.querySelector?.('img') || e?.currentTarget
    const rect = sourceEl?.getBoundingClientRect?.()
    if (!rect) return { delayMs: 0, totalMs: 0 }
    return createFlyFromRect(rect)
  }

  function flashCartFeedback(prodId, options = {}) {
    const delayMs = Math.max(0, options.delayMs || 0)
    setAddedProdId(prodId)
    setCartPulse(false)
    setCartCheckVisible(false)
    if (addedProdTimerRef.current) window.clearTimeout(addedProdTimerRef.current)
    addedProdTimerRef.current = window.setTimeout(() => {
      addedProdTimerRef.current = null
      setAddedProdId(current => (current === prodId ? null : current))
    }, 520)
    clearCartFeedbackTimers()
    const revealFeedback = () => {
      setCartFeedbackToken(current => current + 1)
      setCartPulse(true)
      setCartCheckVisible(true)
      cartCheckTimerRef.current = window.setTimeout(() => {
        cartCheckTimerRef.current = null
        setCartCheckVisible(false)
      }, CART_CHECK_DURATION_MS)
    }
    if (delayMs > 0) {
      cartFeedbackTimerRef.current = window.setTimeout(() => {
        cartFeedbackTimerRef.current = null
        revealFeedback()
      }, delayMs)
    } else {
      revealFeedback()
    }
    resetIdleTimer()
  }

  function triggerFly(e, prod) {
    const flyPlan = e ? createFly(e) : { delayMs: 0, totalMs: 0 }
    flashCartFeedback(prod.id, { delayMs: flyPlan.totalMs })
  }

  function addToCart(prod, e) {
    if (e) moveCartTowardPointer(e)
    if (prod?.is_combo_menu) {
      setSelectedComboProduct(prod)
      return
    }
    if (needsModal(prod)) {
      setSelectedProduct(prod)
      return
    }
    addToCartDirect(prod, null, null, [], e)
  }

  function addToCartDirect(prod, portionId, portionName, options, e) {
    const { price: basePrice, taxId } = getKioskChannelPriceEntry(prod, channel?.id)
    const portions = parseJ(prod.portions, [])
    const portion = portions.find(p => p.id === portionId) || null
    const portionOffset = parseFloat(portion?.price_offset) || 0
    const optionTotal = (options || []).reduce((s, o) => s + (parseFloat(o.price) || 0), 0)
    const unitPrice = roundMoney(basePrice + portionOffset + optionTotal)

    setCart(prev => {
      const existing = !options?.length && !portionId
        ? prev.find(ci => ci.prodId === prod.id && !ci.options?.length && !ci.portionId)
        : null
      if (existing) return prev.map(ci => ci === existing ? { ...ci, qty: ci.qty + 1 } : ci)
      return [...prev, {
        id: uid(),
        prod,
        prodId: prod.id,
        name: prod.name,
        image: prod.channel_image || '',
        sku: prod.sku || null,
        unitPrice,
        taxId,
        qty: 1,
        options: options || [],
        portionId: portionId || null,
        portionName: portionName || null,
        prepTimeMinutes: Math.max(0, parseInt(prod.prep_time_minutes, 10) || 0),
      }]
    })
    triggerFly(e, prod)
    maybeShowProductSuggestion(prod)
  }

  function cartItemCount() { return cart.reduce((s, i) => s + i.qty, 0) }
  function cartTotal() { return roundMoney(cart.reduce((s, i) => s + i.unitPrice * i.qty, 0)) }

  function updateQty(id, delta) {
    setCart(prev => prev.map(i => i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i))
  }
  function removeCartItem(id) {
    setCart(prev => prev.filter(i => i.id !== id))
  }

  // ---- checkout flow ----
  function startCheckout() {
    if (cart.length === 0) return
    if (!kioskInteractive) {
      resetOrder()
      setScreen('idle')
      return
    }
    maybeShowCheckoutSuggestion()
  }

  function onServiceTypeChosen(type) {
    setServiceType(type)
    if (type === 'table_service') {
      setTableInputDraft('')
      setScreen('table_input')
    } else {
      setScreen('payment')
    }
  }

  function onTableConfirm() {
    setTableNumber(tableInputDraft)
    setScreen('payment')
  }

  async function submitOrder() {
    if (!effectiveBranchId) return
    setScreen('processing')
    try {
      const displayNo = await getNextKioskDisplayNo(effectiveBranchId, branchName)
      const saleDate = new Date().toISOString()
      const total = orderTotal
      const appliedCoupon = couponResult?.coupon || null
      const discountType = resolveSaleDiscountType(
        appliedCoupon?.type,
        appliedLoyaltyOffer?.discountType,
      )
      const headerNetTotal = roundMoney(expandedCart.reduce((sum, item, index) => {
        const tax = taxes.find(t => t.id === item.taxId) || null
        const taxRate = parseFloat(tax?.rate) || 0
        const lineGross = roundMoney(item.unitPrice * item.qty)
        const lineAfterDiscount = roundMoney(Math.max(0, lineGross - (expandedOrderLevelDiscounts[index] || 0)))
        return sum + (taxRate > 0 ? roundMoney(lineAfterDiscount / (1 + taxRate / 100)) : lineAfterDiscount)
      }, 0))
      const kioskIdentityNote = selectedKioskStation
        ? `Kiosk: ${selectedKioskStation.name} (#${selectedKioskStation.kiosk_number}${selectedKioskStation.code ? ` / ${selectedKioskStation.code}` : ''})`
        : (kioskStationConfig.stationCode ? `Kiosk ID: ${kioskStationConfig.stationCode}` : '')

      const salesHeader = {
        sale_datetime: saleDate,
        source: 'kiosk',
        source_channel_type: 'kiosk',
        sales_channel_id: asUuidOrNull(channel?.id),
        sales_channel_name: channel?.name || 'Kiosk',
        branch_id: asUuidOrNull(effectiveBranchId),
        branch_name: branchName || null,
        customer_id: asUuidOrNull(loyaltyCustomer?.customerId),
        customer_name: loyaltyCustomer?.customerName || null,
        currency_code: 'TRY',
        gross_total_before_discount: cartSubtotal,
        discount_type: discountType,
        discount_value: appliedCoupon?.value || appliedLoyaltyOffer?.discountValue || 0,
        discount_amount: totalDiscountAmount,
        gross_total_after_discount: total,
        net_total_after_discount: headerNetTotal,
        cost_total: 0,
        payment_total: total,
        change_amount: 0,
        status: 'completed',
        order_note: [
          couponCode ? `Kupon: ${couponCode}` : '',
          maskedLoyaltyCustomerName ? `Sadakat: ${maskedLoyaltyCustomerName}` : '',
          activeLoyaltyNote ? `Kampanya: ${activeLoyaltyNote}` : '',
          kioskIdentityNote,
        ]
          .filter(Boolean)
          .join(' | ') || null,
      }

      const persistedSalesHeader = attachLoyaltyToSaleHeader(salesHeader, saleLoyaltySnapshot, totalDiscountAmount)
      let saleInsertResult = await db
        .from('sales')
        .insert({ ...persistedSalesHeader, updated_at: new Date().toISOString() })
        .select('id')
        .single()
      if (saleInsertResult.error && isLoyaltyPersistenceColumnError(saleInsertResult.error)) {
        saleInsertResult = await db
          .from('sales')
          .insert({ ...salesHeader, updated_at: new Date().toISOString() })
          .select('id')
          .single()
      }
      const { data: saleRow, error: saleErr } = saleInsertResult
      if (saleErr) throw saleErr

      const saleId = saleRow.id

        // kiosk-specific columns - silently skip if migration not yet applied
      try {
        await db.from('sales').update({
          kds_status: 'pending',
          pickup_called: false,
          kiosk_service_type: settings.table_service_enabled ? serviceType : 'takeaway',
          kiosk_table_number: serviceType === 'table_service' ? tableNumber : null,
          kiosk_display_no: displayNo,
          kiosk_station_code: selectedKioskStation?.code || kioskStationConfig.stationCode || null,
          kiosk_station_number: selectedKioskStation?.kiosk_number || null,
          kiosk_station_name: selectedKioskStation?.name || null,
        }).eq('id', saleId)
      } catch (_) { /* migration not applied yet */ }
      const lines = expandedCart.map((item, idx) => {
        const tax = taxes.find(t => t.id === item.taxId) || null
        const taxRate = parseFloat(tax?.rate) || 0
        const lineGrossBeforeDiscount = roundMoney((item.originalUnitPrice ?? item.unitPrice) * item.qty)
        const inlineGiftDiscount = roundMoney(Math.max(0, lineGrossBeforeDiscount - roundMoney(item.unitPrice * item.qty)))
        const lineDiscount = roundMoney(inlineGiftDiscount + (expandedOrderLevelDiscounts[idx] || 0))
        const lineGross = roundMoney(item.unitPrice * item.qty)
        const lineAfterDiscount = roundMoney(Math.max(0, lineGross - (expandedOrderLevelDiscounts[idx] || 0)))
        const lineNet = taxRate > 0 ? roundMoney(lineAfterDiscount / (1 + taxRate / 100)) : lineAfterDiscount
        return {
          sale_id: saleId,
          line_no: idx + 1,
          product_id: asUuidOrNull(item.prodId),
          product_name: item.name,
          product_sku: item.sku || null,
          qty: item.qty,
          unit_gross_before_discount: item.originalUnitPrice ?? item.unitPrice,
          line_gross_before_discount: lineGrossBeforeDiscount,
          discount_allocated_amount: lineDiscount,
          unit_gross_after_discount: roundMoney(lineAfterDiscount / item.qty),
          line_gross_after_discount: lineAfterDiscount,
          tax_id: asUuidOrNull(item.taxId),
          tax_name: tax?.name || null,
          tax_rate: taxRate,
          line_net_after_discount: lineNet,
          unit_cost_snapshot: 0,
          line_cost_total: 0,
          options_json: item.options || [],
          portion_id: asUuidOrNull(item.portionId),
          portion_name: item.portionName || null,
          branch_id: asUuidOrNull(effectiveBranchId),
          branch_name: branchName || null,
          sale_datetime: saleDate,
          sales_channel_id: asUuidOrNull(channel?.id),
          kds_completed: false,
          prep_time_minutes: Math.max(0, parseInt(item.prepTimeMinutes, 10) || 0),
        }
      })

      const persistedLines = attachLoyaltyToSaleLines(lines, saleLoyaltySnapshot, totalDiscountAmount)
      let linesInsertResult = await db.from('sale_lines').insert(persistedLines)
      if (linesInsertResult.error && isLoyaltyPersistenceColumnError(linesInsertResult.error)) {
        linesInsertResult = await db.from('sale_lines').insert(lines)
      }
      const { error: linesErr } = linesInsertResult
      if (linesErr) throw linesErr

      const { error: payErr } = await db.from('sale_payments').insert([{
        sale_id: saleId,
        payment_method: total > 0.009 ? paymentMethod : 'free',
        payment_method_label: total > 0.009 ? (paymentMethod === 'cash' ? 'Nakit' : 'Kart') : 'Ucretsiz',
        amount: total > 0.009 ? total : 0,
        payment_datetime: saleDate,
      }])
      if (payErr) throw payErr

      await postSaleLoyaltyValueLedger({
        saleId,
        saleHeader: { ...persistedSalesHeader, id: saleId },
        saleLines: persistedLines,
        customer: loyaltyCustomer
          ? {
              id: loyaltyCustomer.customerId,
              name: loyaltyCustomer.customerName,
              customerId: loyaltyCustomer.customerId,
              customerName: loyaltyCustomer.customerName,
              selectedCampaignId: loyaltyCustomer.selectedCampaignId || '',
              selectedCampaignName: loyaltyCustomer.selectedCampaignName || '',
              selectedCouponCode: loyaltyCustomer.selectedCouponCode || '',
              selectedCouponLabel: loyaltyCustomer.selectedCouponLabel || '',
              customerCategoryIds: loyaltyCustomer.customerCategoryIds || [],
            }
          : null,
        loyaltyCampaign: saleLoyaltySnapshot,
        selectedCouponCode: loyaltyCustomer?.selectedCouponCode || couponCode || '',
        sourceChannel: 'kiosk',
      })

      if (loyaltySession?.token) {
        await consumeKioskLoyaltyLinkSession(loyaltySession.token)
      }

      setOrderResult({ displayNo, total, saleId })
      setScreen('success')
    } catch (err) {
      console.error('Kiosk order error:', err)
      setScreen('payment')
      alert('Sipariş kaydedilemedi: ' + err.message)
    }
  }

  function closeSuggestion() {
    const stage = suggestionModal?.stage
    setSuggestionModal(null)
    if (stage === 'checkout') continueCheckoutFlow()
  }

  function runSuggestionAction() {
    const action = suggestionModal?.action
    const stage = suggestionModal?.stage
    setSuggestionModal(null)
    action?.()
    if (stage === 'checkout') {
      setTimeout(() => continueCheckoutFlow(), 80)
    }
  }

  // ---- render ----
  if (legacyQrRedirect.href) {
    return (
      <div style={{ width: '100dvw', height: '100dvh', minWidth: '100vw', minHeight: '100vh', background: '#0f172a', display: 'grid', placeItems: 'center', color: '#e2e8f0', padding: 24 }}>
        <div style={{ maxWidth: 340, textAlign: 'center', display: 'grid', gap: 14 }}>
          <i className="fa-solid fa-mobile-screen-button" style={{ color: '#f59e0b', fontSize: 34 }} />
          <div style={{ fontSize: 18, fontWeight: 900 }}>QR masa siparisi mobil ekrana tasindi</div>
          <div style={{ color: '#94a3b8', lineHeight: 1.6, fontSize: 14 }}>Sizi telefon odakli QR menuye yonlendiriyoruz.</div>
          <a href={legacyQrRedirect.href} style={{ minHeight: 44, borderRadius: 14, background: '#f59e0b', color: '#111827', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', fontWeight: 900 }}>
            Mobil QR menuye gec
          </a>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ width: '100dvw', height: '100dvh', minWidth: '100vw', minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 20 }}>
        <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 12 }} />{displayText('Yükleniyor...')}
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ width: '100dvw', height: '100dvh', minWidth: '100vw', minHeight: '100vh', background: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#ef4444', gap: 16 }}>
        <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: 40 }} />
        <div style={{ fontSize: 16, color: '#94a3b8' }}>{error}</div>
      </div>
    )
  }

  return (
    <div
      style={{ width: '100dvw', height: '100dvh', minWidth: '100vw', minHeight: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', userSelect: 'none' }}
      onPointerDown={resetIdleTimer}
    >
      <FlyImage flyer={flyer} accentColor={accentColor} />

      <style>{`
        @keyframes popIn {
          0% { transform: scale(.9); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .kiosk-prod-btn:active { transform: scale(.95); }
      `}</style>
      <KioskMotionStyles />

      {/* canvas wrapper */}
      <div style={{
        width: CANVAS_W,
        height: CANVAS_H,
        transform: `scale(${scale})`,
        transformOrigin: 'center center',
        position: 'relative',
        overflow: 'hidden',
        background: settings.kiosk_bg_color || '#0f172a',
        borderRadius: scale < 1 ? 0 : 20,
      }}>
        {showBaseBackground && (
          <img
            src={settings.kiosk_bg_image}
            alt="Kiosk arka plan"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', opacity: .96 }}
          />
        )}
        {idleHasVideo && (
          <video
            src={settings.idle_media_url}
            autoPlay
            loop
            muted
            playsInline
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 1 }}
          />
        )}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: idleHasImage || idleHasVideo
            ? 'rgba(3,7,18,.34)'
            : showBaseBackground
              ? 'rgba(3,7,18,.42)'
              : (settings.kiosk_bg_overlay || 'rgba(3,7,18,.72)'),
        }} />

        {/* ============ IDLE SCREEN ============ */}
        {screen === 'idle' && (
          <div
            onClick={() => {
              if (!kioskInteractive) return
              setScreen('menu')
            }}
            style={{
              position: 'absolute',
              inset: 0,
              background: '#1f1914',
              cursor: kioskInteractive ? 'pointer' : 'default',
              animation: 'popIn .3s ease',
            }}
          >
            {idleImageSrc ? (
              <img
                src={idleImageSrc}
                alt="Kiosk açılışı"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : null}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(118deg, rgba(0,0,0,.08) 0%, rgba(0,0,0,.18) 34%, rgba(20,17,14,.82) 34.5%, rgba(20,17,14,.96) 100%)' }} />
            <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', padding: 26, color: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div
                  onClick={handleSecretStationUnlock}
                  style={{ fontSize: '.68rem', fontWeight: 900, letterSpacing: '.14em', textTransform: 'uppercase', opacity: .82 }}
                >
                  {branchDisplayLabel}
                </div>
                {showVisibleStationSetup ? (
                  <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
                    <div style={{
                      padding: '8px 12px',
                      borderRadius: 999,
                      border: '1px solid rgba(255,255,255,.18)',
                      background: selectedKioskStation
                        ? 'rgba(22,163,74,.18)'
                        : (kioskStationConfig.stationCode ? 'rgba(245,158,11,.16)' : 'rgba(15,23,42,.42)'),
                      color: selectedKioskStation ? '#dcfce7' : (kioskStationConfig.stationCode ? '#fde68a' : '#e2e8f0'),
                      fontSize: '.72rem',
                      fontWeight: 800,
                      letterSpacing: '.04em',
                    }}>
                      {kioskStationLabel}
                    </div>
                    <button
                      type="button"
                      onClick={event => {
                        event.stopPropagation()
                        openKioskStationModal()
                      }}
                      style={{
                        minHeight: 36,
                        padding: '0 12px',
                        borderRadius: 999,
                        border: '1px solid rgba(255,255,255,.18)',
                        background: 'rgba(15,23,42,.42)',
                        color: '#f8fafc',
                        cursor: 'pointer',
                        fontWeight: 800,
                      }}
                    >
                      <i className="fa-solid fa-gear" style={{ marginRight: 6 }} />
                      Kurulum
                    </button>
                  </div>
                ) : null}
              </div>
              {settings.kiosk_logo_url ? (
                <img src={settings.kiosk_logo_url} alt="Kiosk logo" style={{ width: 74, height: 74, objectFit: 'contain', marginTop: 18 }} />
              ) : null}
              <div style={{ marginTop: 'auto', maxWidth: 258, animation: 'altHeroRise 520ms cubic-bezier(.2,.8,.2,1)' }}>
                <div style={{ fontSize: '3rem', lineHeight: .92, fontWeight: 900, textTransform: 'uppercase', textShadow: '0 10px 24px rgba(0,0,0,.44)' }}>
                  {idleTitle}
                </div>
                <div style={{ marginTop: 16, lineHeight: 1.6, color: 'rgba(255,255,255,.78)' }}>
                  {idleSubtitle}
                </div>
              </div>
              <div style={{ marginTop: 28, display: 'flex', alignItems: 'center', gap: 16 }}>
                {kioskInteractive ? (
                  <button
                    type="button"
                    style={{ width: 102, height: 102, borderRadius: '50%', border: '6px solid rgba(255,255,255,.16)', background: '#fff', color: '#1f1914', cursor: 'pointer', fontWeight: 900, boxShadow: '0 20px 44px rgba(0,0,0,.34)', animation: 'altPulse 2.8s ease-in-out infinite' }}
                  >
                    {displayText(settings.idle_cta_label, 'Başlat')}
                  </button>
                ) : (
                  <div style={{ padding: '12px 18px', borderRadius: 999, border: '1px solid rgba(255,255,255,.16)', background: 'rgba(15,23,42,.46)', color: '#e2e8f0', fontSize: '.74rem', fontWeight: 900, letterSpacing: '.08em' }}>
                    GEÇİCİ OLARAK KAPALI
                  </div>
                )}
                {maskedLoyaltyCustomerName ? (
                  <div style={{ color: 'rgba(255,255,255,.9)', fontSize: '.84rem', lineHeight: 1.55, maxWidth: 180, fontWeight: 700 }}>
                    {maskedLoyaltyCustomerName}
                  </div>
                ) : null}
              </div>

              {loyaltyQrAvailable && (
                <div
                  onClick={() => { if (!loyaltyCustomer && loyaltyQrAvailable) openLoyaltyModal() }}
                  style={{
                    position: 'absolute',
                    right: 24,
                    bottom: 20,
                    minWidth: loyaltyCustomer ? 148 : 132,
                    maxWidth: 158,
                    borderRadius: 20,
                    border: loyaltyCustomer
                      ? '1px solid rgba(134,239,172,.32)'
                      : '1px solid rgba(255,255,255,.16)',
                    background: loyaltyCustomer
                      ? 'rgba(20,83,45,.42)'
                      : 'rgba(15,23,42,.58)',
                    boxShadow: '0 16px 28px rgba(0,0,0,.24)',
                    backdropFilter: 'blur(10px)',
                    padding: loyaltyCustomer ? '12px 13px' : '10px 10px 9px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    cursor: loyaltyCustomer ? 'default' : 'pointer',
                  }}
                >
                  {loyaltyCustomer ? (
                    <>
                      <div style={{ fontSize: '.56rem', fontWeight: 900, color: '#86efac', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                        <i className="fa-solid fa-circle-check" style={{ marginRight: 4 }} />{displayText('Bağlandı')}
                      </div>
                      <div style={{ color: '#f0fdf4', fontWeight: 900, fontSize: '.84rem', lineHeight: 1.22, textAlign: 'center' }}>
                        {maskedLoyaltyCustomerName}
                      </div>
                      {preparedLoyaltyAdvantage.hasPreparedCampaign ? (
                        <div style={{ color: '#fbbf24', fontSize: '.66rem', fontWeight: 800, textAlign: 'center' }}>
                            <i className="fa-solid fa-gift" style={{ marginRight: 4 }} />{displayText(preparedLoyaltyAdvantage.resolvedSelectedCampaignName)}
                        </div>
                      ) : null}
                      {preparedLoyaltyAdvantage.hasPreparedCoupon ? (
                        <div style={{ color: '#bfdbfe', fontSize: '.62rem', fontWeight: 800, textAlign: 'center' }}>
                          <i className="fa-solid fa-ticket" style={{ marginRight: 4 }} />{displayText(preparedLoyaltyAdvantage.resolvedSelectedCouponLabel)}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <div style={{
                        width: 72,
                        height: 72,
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.06)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid rgba(255,255,255,0.1)',
                        marginBottom: 2
                      }}>
                        <i className="fa-solid fa-qrcode" style={{ fontSize: 32, color: accentColor }} />
                      </div>
                      <div style={{ color: '#fff7ed', fontSize: '.58rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em', textAlign: 'center' }}>
                        {displayText('Sadakat / Kupon')}
                      </div>
                      <div style={{ color: 'rgba(255,255,255,.72)', fontSize: '.54rem', lineHeight: 1.3, textAlign: 'center', maxWidth: 112 }}>
                        {displayText('QR okutun, telefon veya kupon girin')}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============ MENU SCREEN ============ */}
        {screen === 'menu' && (
          <div
            ref={catalogRef}
            onPointerDownCapture={moveCartTowardPointer}
            style={{ position: 'absolute', inset: 0, background: '#f4f3ee' }}
          >
            <div style={{ position: 'absolute', inset: '0 auto 0 0', width: 92, padding: '12px 8px', display: 'grid', gridTemplateRows: 'auto minmax(0,1fr) auto', gap: 10, background: '#f7f6f2', borderRight: '1px solid rgba(15,23,42,.06)', zIndex: 2 }}>
              <button type="button" onClick={() => { resetOrder(); setScreen('idle') }} style={{ ...cardSurface('#fff'), width: '100%', height: 40, borderRadius: 14, border: 'none', cursor: 'pointer' }}>
                <i className="fa-solid fa-house" />
              </button>
              <div style={{ minHeight: 0, display: 'flex', alignItems: 'center' }}>
                <div style={{ display: 'grid', gap: 10, width: '100%' }}>
                  {categorySections.map(section => (
                    <CategoryRailButton
                      key={section.category.id}
                      category={section.category}
                      active={activeCategory?.id === section.category.id}
                      accent={accentColor}
                      buttonRef={el => { catButtonRefs.current[section.category.id] = el }}
                      height={categoryButtonHeight}
                      showLabel={settings.kiosk_show_category_labels !== false}
                      onClick={() => scrollToCategory(section.category.id)}
                    />
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!maskedLoyaltyCustomerName && loyaltyQrAvailable) openLoyaltyModal()
                }}
                style={{ ...cardSurface('#fff'), width: '100%', minHeight: 46, borderRadius: 14, border: 'none', cursor: !maskedLoyaltyCustomerName && loyaltyQrAvailable ? 'pointer' : 'default', padding: 6, color: '#0f172a' }}
              >
                        <div style={{ fontSize: '.62rem', fontWeight: 900, lineHeight: 1.15 }}>{maskedLoyaltyCustomerName || displayText(loyaltyQrAvailable ? 'Sadakat' : 'Şube')}</div>
              </button>
            </div>

            <div
              style={{
                marginLeft: 92,
                display: 'grid',
                gridTemplateRows: 'minmax(0,1fr)',
                minWidth: 0,
                minHeight: 0,
                height: '100%',
                overflow: 'hidden',
              }}
            >

              {false ? (
                <div style={{ padding: '6px 12px 0', display: 'grid', gap: 10 }}>
                  <PromoBannerCard
                    title={displayText(mainBannerProduct?.name, `${displayText(activeCategory?.kioskButtonLabel || activeCategory?.name, 'Kategori')} vitrini`)}
                    subtitle=""
                    image={mainBannerProduct?.channel_image || activeCategory?.kioskImageUrl}
                    tone="linear-gradient(135deg,#ed3b3b,#f46c22)"
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <PromoBannerCard compact title={displayText(promoA?.name, `${displayText(activeCategory?.name, 'Menü')} fırsatı`)} subtitle={displayText('Kategoriye özel kampanya alanı')} image={promoA?.channel_image || activeCategory?.kioskImageUrl} tone="linear-gradient(135deg,#d81f2a,#ea7a18)" />
                    <PromoBannerCard compact title={displayText(promoB?.name, `${displayText(activeCategory?.name, 'Menü')} önerisi`)} subtitle={displayText('Kategoriye özel kampanya alanı')} image={promoB?.channel_image || activeCategory?.kioskImageUrl} tone="linear-gradient(135deg,#f08f22,#f5b12b)" />
                  </div>
                </div>
              ) : null}

              {false ? (
                <div style={{ padding: '8px 12px 0' }}>
                  <div style={{ fontSize: '.8rem', fontWeight: 900, color: '#0f172a' }}>{displayText('Hızlı seçimler')}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                    {quickPicks.map(item => (
                      <button
                        key={`quick-${item.id}`}
                        type="button"
                        onClick={event => addToCart(item, event)}
                        style={{ ...cardSurface('#fff'), minHeight: 74, borderRadius: 16, padding: 12, display: 'grid', gridTemplateColumns: '1fr 54px', gap: 10, alignItems: 'center', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                      >
                        <div>
                          <div style={{ fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>{item.name}</div>
                          <div style={{ marginTop: 8, color: '#64748b', fontSize: '.76rem' }}>{tl(getItemPrice(item))}</div>
                        </div>
                        {item.channel_image ? <img src={item.channel_image} alt={item.name} style={{ width: 54, height: 42, objectFit: 'cover', display: 'block', borderRadius: 10 }} /> : null}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div
                ref={productsScrollRef}
                onScroll={syncCategoryFromScroll}
                style={{
                  minHeight: 0,
                  height: '100%',
                  padding: '6px 12px 12px',
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  scrollBehavior: 'smooth',
                  WebkitOverflowScrolling: 'touch',
                }}
              >
                <div ref={productsContentRef} style={{ display: 'grid', gap: 18 }}>
                  {showPromoBlocks ? (
                    <PromoBannerCard
                      title={bannerAltText}
                      subtitle=""
                      image={bannerImage}
                      tone="linear-gradient(135deg,#ed3b3b,#f46c22)"
                      onClick={bannerHasAction ? onMainBannerClick : null}
                    />
                  ) : null}
                  {showBannerMessage ? (
                    <div
                      style={{
                        marginTop: showPromoBlocks ? -8 : 0,
                        borderRadius: 14,
                        background: 'rgba(59,130,246,.10)',
                        border: '1px solid rgba(59,130,246,.16)',
                        padding: '10px 12px',
                        color: '#1e3a8a',
                        display: 'grid',
                        gap: bannerTitle && bannerSubtitle ? 3 : 0,
                      }}
                    >
                      {bannerTitle ? <div style={{ fontWeight: 800, fontSize: '.84rem', lineHeight: 1.25 }}>{bannerTitle}</div> : null}
                      {bannerSubtitle ? <div style={{ fontSize: '.76rem', lineHeight: 1.45, color: '#475569' }}>{bannerSubtitle}</div> : null}
                    </div>
                  ) : null}
                  {showQuickPicks ? (
                    <div>
                      <div style={{ fontSize: '.8rem', fontWeight: 900, color: '#0f172a' }}>{displayText('Hızlı seçimler')}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                        {quickPicks.map(item => (
                          <button
                            key={`quick-scroll-${item.id}`}
                            type="button"
                            onClick={event => addToCart(item, event)}
                            style={{ ...cardSurface('#fff'), minHeight: 74, borderRadius: 16, padding: 12, display: 'grid', gridTemplateColumns: '1fr 54px', gap: 10, alignItems: 'center', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                          >
                            <div>
                              <div style={{ fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>{item.name}</div>
                              <div style={{ marginTop: 8, color: '#64748b', fontSize: '.76rem' }}>{tl(getItemPrice(item))}</div>
                            </div>
                            {item.channel_image ? <img src={item.channel_image} alt={item.name} style={{ width: 54, height: 42, objectFit: 'cover', display: 'block', borderRadius: 10 }} /> : null}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {categorySections.map((section, sectionIndex) => (
                    <section
                      key={section.category.id}
                      ref={el => { catSectionRefs.current[section.category.id] = el }}
                      style={{ display: 'grid', gap: 10 }}
                    >
                      {sectionIndex > 0 ? (
                        <div style={{ height: 1, background: 'linear-gradient(90deg, rgba(15,23,42,0) 0%, rgba(15,23,42,.14) 18%, rgba(15,23,42,.14) 82%, rgba(15,23,42,0) 100%)' }} />
                      ) : null}
                      <div
                        ref={el => { catHeaderRefs.current[section.category.id] = el }}
                        style={{ display: 'grid', gap: 10 }}
                      >
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                          <div style={{ fontSize: '.86rem', fontWeight: 900, color: '#0f172a' }}>{displayText(section.category.kioskButtonLabel || section.category.name)}</div>
                          <div style={{ fontSize: '.66rem', letterSpacing: '.08em', textTransform: 'uppercase', color: activeCategory?.id === section.category.id ? accentColor : '#94a3b8', fontWeight: 800 }}>
                            {section.products.length} {displayText('ürün')}
                          </div>
                        </div>
                      </div>
                      <div
                        ref={el => { catGridRefs.current[section.category.id] = el }}
                        style={{ display: 'grid', gridTemplateColumns: `repeat(${productGridCols}, minmax(0,1fr))`, gap: 10 }}
                      >
                        {section.products.map((prod, index) => {
                          const isAdded = addedProdId === prod.id
                          const hasVariants = needsModal(prod)
                          return (
                            <button
                              key={prod.id}
                              type="button"
                              className="kiosk-prod-btn"
                              onClick={event => addToCart(prod, event)}
                              style={{ position: 'relative', aspectRatio: '1 / 1.08', borderRadius: 14, overflow: 'hidden', border: isAdded ? `2px solid ${rgba(accentColor, .48)}` : '1px solid rgba(15,23,42,.08)', padding: 0, cursor: 'pointer', background: '#ddd', animation: `altCardIn 420ms cubic-bezier(.2,.8,.2,1) ${index * 36}ms both` }}
                            >
                              {prod.channel_image ? <img src={prod.channel_image} alt={prod.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#d7dce3,#eef2f7)' }} />}
                              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(15,23,42,.06) 34%, rgba(15,23,42,.82) 100%)' }} />
                              <div style={{ position: 'absolute', inset: 'auto 8px 8px 8px', color: '#fff', textAlign: 'left' }}>
                                <div style={{ fontSize: '.68rem', lineHeight: 1.18, fontWeight: 800, textShadow: '0 2px 10px rgba(0,0,0,.35)' }}>{prod.name}</div>
                                <div style={{ marginTop: 5, fontSize: '.66rem', opacity: .92 }}>{tl(getItemPrice(prod))}</div>
                              </div>
                              <div style={{ position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 999, background: '#fff', color: '#ef4444', display: 'grid', placeItems: 'center', fontSize: '.64rem', boxShadow: '0 10px 18px rgba(15,23,42,.16)' }}>
                                <i className={`fa-solid ${hasVariants ? 'fa-sliders' : 'fa-plus'}`} />
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            </div>

            <div data-cart-ignore="true" style={{ position: 'absolute', right: CART_DOCK_RIGHT, top: cartDockY, width: CART_DOCK_SIZE, height: CART_DOCK_SIZE, zIndex: 12, transition: `top ${CART_MOVE_DURATION_MS}ms cubic-bezier(.22,1,.36,1)`, willChange: 'top' }}>
              <div style={{ position: 'absolute', inset: -14, borderRadius: 999, border: `2px solid ${rgba(accentColor, .16)}`, animation: 'altCartWave 4.2s ease-out infinite', pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', inset: -22, borderRadius: 999, border: `2px solid ${rgba(accentColor, .1)}`, animation: 'altCartWave 4.2s ease-out 1.6s infinite', pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', inset: 8, borderRadius: 999, background: 'linear-gradient(180deg, rgba(255,255,255,.95) 0%, rgba(241,245,249,.95) 100%)', boxShadow: '0 12px 20px rgba(15,23,42,.14)', pointerEvents: 'none' }} />
              <button
                ref={cartRef}
                type="button"
                onClick={() => { if (cart.length > 0) setScreen('cart_review') }}
                style={{ position: 'absolute', inset: 0, borderRadius: 999, border: 'none', background: `linear-gradient(180deg, ${rgba('#ffffff', .98)} 0%, ${accentColor} 26%, ${accentColor} 100%)`, color: '#fff', cursor: cart.length > 0 ? 'pointer' : 'default', boxShadow: `0 12px 18px rgba(255,255,255,.56) inset, 0 -10px 16px rgba(0,0,0,.16) inset, 0 20px 36px ${rgba(accentColor, .34)}, 0 32px 40px rgba(15,23,42,.16)`, animation: 'altCartFloat 4.8s cubic-bezier(.37,0,.22,1) infinite', transform: 'translateZ(0)' }}
              >
                <div style={{ position: 'absolute', inset: 5, borderRadius: 999, background: 'linear-gradient(180deg, rgba(255,255,255,.14) 0%, rgba(255,255,255,0) 58%)', pointerEvents: 'none' }} />
                <div key={`cart-icon-${cartFeedbackToken}`} style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', animation: cartPulse ? `altCartPulse ${CART_PULSE_DURATION_MS}ms cubic-bezier(.22,1,.36,1)` : 'none' }}>
                  <i className="fa-solid fa-basket-shopping" style={{ fontSize: '1.42rem', textShadow: '0 2px 10px rgba(0,0,0,.22)', opacity: cartCheckVisible ? .16 : 1, transform: cartCheckVisible ? 'scale(.72)' : 'scale(1)', transition: 'opacity 260ms ease, transform 320ms ease' }} />
                </div>
                {cartCheckVisible ? (
                  <div key={`cart-check-${cartFeedbackToken}`} style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
                    <div style={{ position: 'absolute', width: 40, height: 40, borderRadius: 999, background: 'rgba(34,197,94,.18)', animation: `altCartConfirmRing ${CART_CHECK_DURATION_MS}ms ease-out forwards` }} />
                    <div style={{ width: 32, height: 32, borderRadius: 999, background: 'linear-gradient(180deg,#34d399 0%,#16a34a 100%)', boxShadow: '0 10px 20px rgba(22,163,74,.28)', display: 'grid', placeItems: 'center', animation: `altCartConfirm ${CART_CHECK_DURATION_MS}ms cubic-bezier(.22,1,.36,1) forwards` }}>
                      <i className="fa-solid fa-check" style={{ fontSize: '.78rem', color: '#fff' }} />
                    </div>
                  </div>
                ) : null}
                {cart.length > 0 ? (
                  <span style={{ position: 'absolute', top: -5, right: -2, minWidth: 24, height: 24, borderRadius: 999, background: '#ef4444', color: '#fff', fontSize: '.68rem', fontWeight: 900, display: 'grid', placeItems: 'center', padding: '0 5px', boxShadow: '0 10px 18px rgba(239,68,68,.34)' }}>
                    {cartItemCount()}
                  </span>
                ) : null}
              </button>
            </div>
          </div>
        )}

        {/* ============ CART REVIEW ============ */}
        {screen === 'cart_review' && (
          <div style={{ position: 'absolute', inset: 0, background: '#f4f3ee', display: 'grid', gridTemplateRows: 'auto minmax(0,1fr) auto' }}>
            <div style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(15,23,42,.06)' }}>
              <button type="button" onClick={() => setScreen('menu')} style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: '#fff', cursor: 'pointer' }}>
                <i className="fa-solid fa-arrow-left" />
              </button>
              <div style={{ fontWeight: 900, color: '#0f172a', flex: 1 }}>Sepet özeti</div>
              <button type="button" onClick={() => setCart([])} style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontWeight: 800 }}>
                Temizle
              </button>
            </div>

            <div style={{ padding: 12, overflowY: 'auto', display: 'grid', gap: 10 }}>
              {cart.length === 0 ? (
                <div style={{ ...cardSurface('#fff'), borderRadius: 18, padding: 20, color: '#64748b', textAlign: 'center' }}>Sepetiniz boş.</div>
              ) : pricedCart.map(item => (
                <div key={item.id} style={{ ...cardSurface('#fff'), borderRadius: 18, padding: 12, display: 'grid', gridTemplateColumns: '68px 1fr auto', gap: 12, alignItems: 'center' }}>
                  <div style={{ width: 68, height: 68, borderRadius: 14, overflow: 'hidden', background: '#eef2f7' }}>
                    {item.image ? <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : null}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: '#0f172a', fontSize: '.86rem', fontWeight: 800, lineHeight: 1.2 }}>{item.name}</div>
                    {item.portionName ? <div style={{ color: '#64748b', fontSize: '.72rem', marginTop: 4 }}>{item.portionName}</div> : null}
                    {(item.options || []).length > 0 ? <div style={{ color: '#64748b', fontSize: '.72rem', marginTop: 4 }}>{item.options.map(option => option.name).join(', ')}</div> : null}
                    {item.giftLabel ? <div style={{ color: '#16a34a', fontSize: '.72rem', marginTop: 4, fontWeight: 800 }}>{item.giftLabel}</div> : null}
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button type="button" onClick={() => item.qty > 1 ? updateQty(item.id, -1) : removeCartItem(item.id)} style={{ width: 28, height: 28, borderRadius: 999, border: '1px solid rgba(15,23,42,.12)', background: '#fff', cursor: 'pointer' }}>-</button>
                      <span style={{ minWidth: 16, textAlign: 'center', fontWeight: 900, color: '#0f172a' }}>{item.qty}</span>
                      <button type="button" onClick={() => updateQty(item.id, 1)} style={{ width: 28, height: 28, borderRadius: 999, border: 'none', background: accentColor, color: '#fff', cursor: 'pointer' }}>+</button>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
                    {item.hasGift && item.lineBaseTotal !== item.lineEffectiveTotal ? (
                      <div style={{ color: '#94a3b8', fontSize: '.72rem', textDecoration: 'line-through' }}>{tl(item.lineBaseTotal)}</div>
                    ) : null}
                    <div style={{ color: item.hasGift ? '#16a34a' : '#0f172a', fontWeight: 900 }}>{tl(item.lineEffectiveTotal)}</div>
                    <button type="button" onClick={() => removeCartItem(item.id)} style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}>
                      <i className="fa-solid fa-trash" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: 12, display: 'grid', gap: 12, background: 'rgba(255,255,255,.86)', borderTop: '1px solid rgba(15,23,42,.06)', backdropFilter: 'blur(10px)' }}>
              {true && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <button onClick={() => { setCouponInputDraft(couponCode); setCouponMessage(''); setScreen('coupon') }} style={{ minHeight: 46, borderRadius: 14, border: '1px solid rgba(15,23,42,.08)', cursor: 'pointer', background: '#fff', color: '#0f172a', fontWeight: 800 }}>
                    {couponCode ? `Kupon: ${couponCode}` : 'Kupon gir'}
                  </button>
                  <button onClick={() => { if (!maskedLoyaltyCustomerName) openLoyaltyModal() }} disabled={Boolean(maskedLoyaltyCustomerName)} style={{ minHeight: 46, borderRadius: 14, border: '1px solid rgba(15,23,42,.08)', cursor: !maskedLoyaltyCustomerName ? 'pointer' : 'default', background: maskedLoyaltyCustomerName ? 'rgba(22,163,74,.08)' : '#fff', color: maskedLoyaltyCustomerName ? '#166534' : '#0f172a', fontWeight: 800 }}>
                    {maskedLoyaltyCustomerName || 'Sadakat ba\u011fla'}
                  </button>
                </div>
              )}
              {couponMessage ? (
                <div style={{ borderRadius: 12, padding: '10px 12px', background: couponCode ? 'rgba(22,163,74,.12)' : 'rgba(245,158,11,.12)', color: couponCode ? '#166534' : '#b45309', fontSize: 13, fontWeight: 700 }}>
                  {couponMessage}
                </div>
              ) : null}
              <PreparedAdvantageCard
                preparedAdvantage={preparedLoyaltyAdvantage}
                statusText={preparedAdvantageStatusText}
                accentColor={preparedLoyaltyAdvantage.hasPreparedCampaign && !selectedLoyaltyOffer ? '#b45309' : '#166534'}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '.86rem' }}>
                <span>Ara toplam</span>
                <span>{tl(cartSubtotal)}</span>
              </div>
              {loyaltyDiscountAmount > 0 ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#166534', fontSize: '.86rem', gap: 10 }}>
                  <span>{activeLoyaltyLabel}</span>
                  <span>-{tl(loyaltyDiscountAmount)}</span>
                </div>
              ) : null}
              {couponDiscountAmount > 0 ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#166534', fontSize: '.86rem' }}>
                  <span>Kupon indirimi</span>
                  <span>-{tl(couponDiscountAmount)}</span>
                </div>
              ) : null}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#0f172a', fontSize: '1rem', fontWeight: 800 }}>Toplam</span>
                <span style={{ color: accentColor, fontSize: '1.42rem', fontWeight: 900 }}>{tl(orderTotal)}</span>
              </div>
              <button onClick={startCheckout} disabled={cart.length === 0} style={{ width: '100%', minHeight: 54, borderRadius: 18, border: 'none', background: accentColor, color: '#fff', cursor: cart.length > 0 ? 'pointer' : 'default', fontWeight: 900, opacity: cart.length > 0 ? 1 : .6 }}>
                {primaryCheckoutLabel}
              </button>
            </div>
          </div>
        )}
        {/* ============ SERVICE TYPE ============ */}
        {screen === 'service_type' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f172a', gap: 24, padding: 32 }}>
            <div style={{ color: '#f1f5f9', fontSize: 22, fontWeight: 800, textAlign: 'center', marginBottom: 12 }}>
              Siparişi nasıl almak istiyorsunuz?
            </div>
            <button onClick={() => onServiceTypeChosen('takeaway')} style={{
              width: '100%', padding: 28, borderRadius: 16, border: '2px solid #334155',
              background: '#1e293b', color: '#f1f5f9', fontSize: 18, fontWeight: 700, cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
            }}>
              <i className="fa-solid fa-bag-shopping" style={{ fontSize: 30 }} />
              Siparişi kendim alacağım
            </button>
            <button onClick={() => onServiceTypeChosen('table_service')} style={{
              width: '100%', padding: 28, borderRadius: 16, border: '2px solid #334155',
              background: '#1e293b', color: '#f1f5f9', fontSize: 18, fontWeight: 700, cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
            }}>
              <i className="fa-solid fa-bell-concierge" style={{ fontSize: 30 }} />
              Masama servis istiyorum
            </button>
            <button onClick={() => setScreen('cart_review')} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 15, cursor: 'pointer', marginTop: 8 }}>
              Geri dön
            </button>
          </div>
        )}

        {/* ============ TABLE NUMBER INPUT ============ */}
        {screen === 'table_input' && (
          <div style={{ position: 'absolute', inset: 0, background: '#0f172a' }}>
            <NumKeyboard
              value={tableInputDraft}
              onChange={setTableInputDraft}
              onConfirm={onTableConfirm}
              onCancel={() => setScreen('service_type')}
              label="Masa / Etiket numaranızı giriniz"
            />
          </div>
        )}

        {screen === 'coupon' && (
          <div style={{ position: 'absolute', inset: 0, background: '#0f172a' }}>
            <AlphaKeyboard
              value={couponInputDraft}
              onChange={value => { setCouponInputDraft(value.toUpperCase()); setCouponMessage(''); }}
              onConfirm={applyCouponDraft}
              onCancel={() => { setScreen('cart_review'); setCouponMessage(''); }}
              label="Kupon kodu"
              error={couponMessage}
            />
          </div>
        )}

        {/* ============ PAYMENT ============ */}
        {screen === 'payment' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: 'transparent' }}>
            <div style={{ padding: '14px 16px', background: rgba(panelColor, .88), display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(148,163,184,.12)' }}>
              <button onClick={() => setScreen(settings.table_service_enabled ? 'service_type' : 'cart_review')} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}>
                <i className="fa-solid fa-arrow-left" />
              </button>
              <span style={{ color: textColor, fontWeight: 700, fontSize: 18 }}>{isZeroTotalOrder ? 'Sipariş Onayı' : 'Ödeme'}</span>
            </div>

            <div style={{ flex: 1, padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* order summary */}
              <div style={surface({ padding: 16 })}>
                <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 10 }}>Sipariş özeti</div>
                {pricedCart.map(item => (
                  <div key={item.id} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', fontSize: 13, gap: 10 }}>
                      <span>{item.qty}x {item.name}</span>
                      <div style={{ textAlign: 'right' }}>
                        {item.hasGift && item.lineBaseTotal !== item.lineEffectiveTotal ? (
                          <div style={{ color: '#64748b', fontSize: 11, textDecoration: 'line-through' }}>{tl(item.lineBaseTotal)}</div>
                        ) : null}
                        <div style={{ color: item.hasGift ? '#86efac' : '#cbd5e1' }}>{tl(item.lineEffectiveTotal)}</div>
                      </div>
                    </div>
                    {item.giftLabel ? (
                      <div style={{ color: '#34d399', fontSize: 12, marginTop: 4 }}>{item.giftLabel}</div>
                    ) : null}
                  </div>
                ))}
                {loyaltyDiscountAmount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#86efac', fontSize: 13, marginBottom: 6 }}>
                    <span>{activeLoyaltyLabel}</span>
                    <span>-{fmt(loyaltyDiscountAmount)} TL</span>
                  </div>
                )}
                {couponCode && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#86efac', fontSize: 13, marginBottom: 6 }}>
                    <span>Kupon: {couponCode}</span>
                    <span>-{fmt(couponDiscountAmount)} TL</span>
                  </div>
                )}
                {maskedLoyaltyCustomerName && (
                  <div style={{ color: '#86efac', fontSize: 12, marginTop: 8 }}>{maskedLoyaltyCustomerName} ba\u011fl\u0131</div>
                )}
                {serviceType === 'table_service' && tableNumber && (
                  <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 8 }}>Masa: {tableNumber}</div>
                )}
              </div>

              {/* total */}
              <div style={surface({ padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
                <span style={{ color: textColor, fontSize: 18, fontWeight: 700 }}>Toplam</span>
                <span style={{ color: '#fbbf24', fontSize: 26, fontWeight: 800 }}>{tl(orderTotal)}</span>
              </div>

              {/* payment method */}
              {isZeroTotalOrder ? (
                <div style={surface({ padding: 16, color: '#86efac', fontSize: 14, lineHeight: 1.6 })}>
                  Bu sipariş sadakat kampanyasıyla ücretsiz oldu. Ödeme almadan siparişi gönderebilirsiniz.
                </div>
              ) : (
                <div>
                  <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 10 }}>Ödeme yöntemi</div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {['cash', 'card'].map(m => (
                      <button key={m} onClick={() => setPaymentMethod(m)} style={{
                        flex: 1, padding: 18, borderRadius: 14, border: '2px solid',
                        borderColor: paymentMethod === m ? '#7c3aed' : '#334155',
                        background: paymentMethod === m ? '#312e81' : '#1e293b',
                        color: '#f1f5f9', fontSize: 15, fontWeight: 700, cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                      }}>
                        <span style={{ fontSize: 28 }}><i className={m === 'cash' ? 'fa-solid fa-money-bill-wave' : 'fa-solid fa-credit-card'} /></span>
                        {m === 'cash' ? 'Nakit' : 'Kart'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: 16 }}>
              <button onClick={submitOrder} style={{
                width: '100%', padding: 20, borderRadius: 14, border: 'none',
                background: '#22c55e', color: '#fff', fontSize: 20, fontWeight: 800, cursor: 'pointer',
              }}>
                <i className="fa-solid fa-check" style={{ marginRight: 8 }} />
                {paymentConfirmLabel}
              </button>
            </div>
          </div>
        )}

        {/* ============ PROCESSING ============ */}
        {screen === 'processing' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, background: '#0f172a' }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: 48, color: '#7c3aed' }} />
            <div style={{ color: '#f1f5f9', fontSize: 20, fontWeight: 700 }}>Siparişiniz işleniyor...</div>
          </div>
        )}

        {/* ============ SUCCESS ============ */}
        {screen === 'success' && orderResult && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 24,
            background: 'linear-gradient(160deg, #0f172a 0%, #14532d 100%)',
            animation: 'popIn .4s ease',
          }}>
            <div style={{ fontSize: 80 }}><i className="fa-solid fa-circle-check" /></div>
            <div style={{ color: '#f1f5f9', fontSize: 24, fontWeight: 800, textAlign: 'center' }}>
              Siparişiniz alındı!
            </div>
            <div style={{
              background: '#1e293b', borderRadius: 20, padding: '20px 40px', textAlign: 'center',
            }}>
              <div style={{ color: '#94a3b8', fontSize: 14, marginBottom: 8 }}>Sipariş Numaranız</div>
              <div style={{ color: '#fbbf24', fontSize: 56, fontWeight: 900 }}>
                {String(orderResult.displayNo).padStart(3, '0')}
              </div>
            </div>
            {serviceType === 'table_service' && tableNumber ? (
              <div style={{ color: '#86efac', fontSize: 16, textAlign: 'center' }}>
                Masanıza servis yapılacaktır.<br />
                <span style={{ color: '#94a3b8' }}>Masa: {tableNumber}</span>
              </div>
            ) : (
              <div style={{ color: '#86efac', fontSize: 16, textAlign: 'center' }}>
                Siparişiniz mutfağa iletildi.<br />
                Lütfen ekranı takip edin.
              </div>
            )}
            <div style={{ color: '#475569', fontSize: 13 }}>Toplam: {tl(orderResult.total)}</div>
            <button onClick={() => { resetOrder(); setScreen('menu') }} style={{
              marginTop: 12, padding: '14px 36px', borderRadius: 30, border: 'none',
              background: '#7c3aed', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer',
            }}>
              Yeni Sipariş Ver
            </button>
            <div style={{ color: '#475569', fontSize: 12 }}>
              {settings.order_display_duration_sec || 30} saniye sonra ana ekrana dönersiniz
            </div>
          </div>
        )}

        {/* ============ PRODUCT OPTIONS MODAL ============ */}
        {selectedProduct && (
          <ProductOptionsModal
            prod={selectedProduct}
            channelId={channel?.id}
            accentColor={accentColor}
            anchorY={cartDockY}
            onCancel={() => setSelectedProduct(null)}
            onConfirm={(draft, flyRect) => {
              const chosenProduct = selectedProduct
              const { taxId } = getKioskChannelPriceEntry(selectedProduct, channel?.id)
              setCart(prev => [...prev, {
                id: uid(),
                prod: selectedProduct,
                prodId: selectedProduct.id,
                name: selectedProduct.name,
                image: selectedProduct.channel_image || '',
                sku: selectedProduct.sku || null,
                unitPrice: draft.unitPrice,
                taxId,
                qty: draft.qty || 1,
                options: draft.options || [],
                portionId: draft.portionId || null,
                portionName: draft.portionName || null,
                prepTimeMinutes: Math.max(0, parseInt(selectedProduct.prep_time_minutes, 10) || 0),
              }])
              const flyPlan = flyRect ? createFlyFromRect(flyRect) : { delayMs: 0, totalMs: 0 }
              setSelectedProduct(null)
              flashCartFeedback(selectedProduct.id, { delayMs: flyPlan.totalMs })
              maybeShowProductSuggestion(chosenProduct)
            }}
          />
        )}

        {selectedComboProduct && selectedComboDefinition && (
          <KioskComboModal
            comboProduct={selectedComboProduct}
            comboDefinition={selectedComboDefinition}
            saleItems={products}
            optionGroupDefs={optionGroupDefs}
            channelId={channel?.id}
            onClose={() => setSelectedComboProduct(null)}
            onConfirm={(draft, flyRect) => {
              const chosenProduct = selectedComboProduct
              const { taxId } = getKioskChannelPriceEntry(chosenProduct, channel?.id)
              setCart(prev => [...prev, {
                id: uid(),
                prod: chosenProduct,
                prodId: chosenProduct.id,
                name: chosenProduct.name,
                image: chosenProduct.channel_image || '',
                sku: chosenProduct.sku || null,
                unitPrice: draft.unitPrice,
                taxId,
                qty: draft.qty || 1,
                options: [],
                portionId: null,
                portionName: null,
                prepTimeMinutes: Math.max(0, parseInt(chosenProduct.prep_time_minutes, 10) || 0),
                comboBundle: draft.comboBundle || null,
                cartKeySuffix: draft.cartKeySuffix || null,
              }])
              const flyPlan = flyRect ? createFlyFromRect(flyRect) : { delayMs: 0, totalMs: 0 }
              setSelectedComboProduct(null)
              flashCartFeedback(chosenProduct.id, { delayMs: flyPlan.totalMs })
              maybeShowProductSuggestion(chosenProduct)
            }}
          />
        )}

        <SuggestionModal
          suggestion={suggestionModal}
          accentColor={accentColor}
          onClose={closeSuggestion}
          onAction={runSuggestionAction}
        />

        <KioskStationSetupModal
          open={kioskStationModalOpen}
          mode={kioskStationModalMode}
          accentColor={accentColor}
          stationCode={kioskStationDraft}
          stations={kioskStationConfig.stations}
          selectedStation={resolveKioskDeviceStation(settings, kioskStationDraft).station}
          onSelectCode={value => setKioskStationDraft(String(value || '').toUpperCase())}
          onSave={saveKioskStationSelection}
          onClose={closeKioskStationModal}
        />

        <LoyaltyModal
          open={loyaltyModalOpen}
          accentColor={accentColor}
          onClose={() => setLoyaltyModalOpen(false)}
          loyaltySessionToken={loyaltySession?.token}
          branchId={branchId}
          branchName={branchName}
          customerName={maskedLoyaltyCustomerName}
          onCustomerLinked={(linkedCust) => {
            setLoyaltyCustomer(linkedCust)
            setLoyaltyModalOpen(false)
          }}
          onClearCustomer={() => {
            setLoyaltyCustomer(null)
            setLoyaltyModalOpen(false)
          }}
          settings={settings}
          loyaltyAdjustedSubtotal={loyaltyAdjustedSubtotal}
          onCouponApplied={(appliedCode, msg) => {
            setCouponCode(appliedCode)
            setCouponMessage(msg)
            setLoyaltyModalOpen(false)
            if (cart.length > 0) {
              setScreen('cart_review')
            } else {
              setScreen('menu')
            }
          }}
          onEnterCouponClick={() => {
            setLoyaltyModalOpen(false)
            setCouponInputDraft(couponCode)
            setCouponMessage('')
            setScreen('coupon')
          }}
        />

      </div>
    </div>
  )
}

