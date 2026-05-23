import Header from '@/components/layout/Header'
import CustomerLoyaltyMobileApp from '@/components/mobile/CustomerLoyaltyMobileApp'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { loadCustomerAppConfig, saveCustomerAppConfig, getDefaultAppConfig } from '@/lib/customerMobileAppConfig'
import { useWorkspace } from '@/context/WorkspaceContext'
import { db } from '@/lib/db'
import { postSaleLoyaltyValueLedger } from '@/lib/loyaltyValueLedger'
import StaffPinGate from '@/components/pos/StaffPinGate'
import { getPersonnelDisplayName } from '@/lib/posStaffAuth'
import { loadTableByQrToken, loadTableManagementCatalog } from '@/lib/posTableCatalogService'
import { searchMobileCustomers } from '@/lib/mobileCustomerIdentity'
import { appendItemsToOpenTableTicket, hydrateOpenTableTicketsFromDb } from '@/lib/posTablePersistence'
import { createTableServiceRequest, loadActiveTableServiceRequests, summarizeTableServiceRequests, TABLE_REQUEST_TYPES } from '@/lib/tableServiceRequests'
import { clearMobileQrSession, readMobileQrSession, updateMobileQrAdvantage, writeMobileQrSession } from '@/lib/mobileQrSession'
import { asUuidOrNull, getNextKioskDisplayNo } from '@/lib/kioskSettings'
import { loadCustomerLoyaltyCategoryIds } from '@/lib/posCustomerLink'
import { evaluateRuntimeOrderCampaigns, evaluateRuntimeOrderCampaignsAsync, loadCachedRuntimeLoyaltyCampaignCatalog } from '@/lib/posLoyalty'
import { resolvePreparedLoyaltyAdvantage } from '@/lib/loyaltyPreparedAdvantage'
import {
  attachLoyaltyToSaleHeader,
  attachLoyaltyToSaleLines,
  buildProportionalDiscountAllocations,
  createSaleLoyaltySnapshot,
  isLoyaltyPersistenceColumnError,
} from '@/lib/checkoutLoyalty'

const SCREEN_MAP = {
  personnel: {
    pageTitle: 'Mobil App Personel',
    pageSubtitle: 'Mobil personel drawer ve uzaktan Garson kontrol yüzeyi.',
    phoneTitle: 'Personel',
    accent: '#38bdf8',
    icon: 'fa-user-tie',
  },
  qrMenu: {
    pageTitle: 'Mobil App QR Menu',
    pageSubtitle: 'Masa QR girisi, siparis ve servis talepleri.',
    phoneTitle: 'QR Menu',
    accent: '#f59e0b',
    icon: 'fa-qrcode',
  },
  customer: {
    pageTitle: 'Mobil App Musteri',
    pageSubtitle: 'Mobil uygulama musteri yuzeyi.',
    phoneTitle: 'Musteri',
    accent: '#fb7185',
    icon: 'fa-user-group',
  },
  boss: {
    pageTitle: 'Mobil App Boss',
    pageSubtitle: 'Mobil uygulama yonetici yuzeyi icin bos telefon ekrani.',
    phoneTitle: 'Boss',
    accent: '#a78bfa',
    icon: 'fa-crown',
  },
}

const MOBILE_GARSON_STAFF_SESSION_KEY = 'suitable_garson_staff_session_v1'
const MOBILE_GARSON_POLL_MS = 4000
const MOBILE_PRODUCT_SELECT = 'id,name,short_name,sku,standard_price,channel_prices,portions,option_groups,channel_image,pos_image,prep_time_minutes,sale_cat_l1,sale_cat_l2,sale_cat_l3,sale_cat_l4,sale_cat_l5,cat_l1,cat_l2,cat_l3,cat_l4,cat_l5'

function buildPhoneShellStyle(accent) {
  return {
    width: 'min(100%, 390px)',
    height: 'clamp(620px, calc(100vh - 120px), 780px)',
    borderRadius: 36,
    background: `
      linear-gradient(180deg, rgba(255,255,255,.96), rgba(248,250,252,.98)),
      radial-gradient(circle at top right, ${accent}22, transparent 30%)
    `,
    border: '1px solid rgba(148,163,184,.28)',
    boxShadow: '0 32px 80px rgba(15,23,42,.16)',
    padding: 18,
    position: 'relative',
    overflow: 'hidden',
  }
}

function PhoneShellFrame({ accent, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <div style={buildPhoneShellStyle(accent)}>
        <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', width: 128, height: 26, borderRadius: 999, background: '#0f172a', opacity: 0.96 }} />
        <div style={{ height: '100%', borderRadius: 26, background: '#fff', border: '1px solid rgba(226,232,240,.9)', overflow: 'hidden' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

function PhoneStatusBar({ title, accent }) {
  return (
    <div style={{ padding: '18px 16px 10px', display: 'grid', gap: 12, background: `linear-gradient(180deg, ${accent}12, rgba(255,255,255,.96))`, borderBottom: '1px solid rgba(226,232,240,.8)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#0f172a', fontSize: '.82rem', fontWeight: 800 }}>
        <span>09:41</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#64748b' }}>
          <i className="fa-solid fa-signal" />
          <i className="fa-solid fa-wifi" />
          <i className="fa-solid fa-battery-three-quarters" />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 42, height: 42, borderRadius: 14, background: `${accent}18`, color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="fa-solid fa-mobile-screen-button" />
        </div>
        <div>
          <div style={{ color: '#0f172a', fontWeight: 900, fontSize: '1rem' }}>{title}</div>
          <div style={{ color: '#64748b', fontSize: '.76rem' }}>Telefon simulasyonu</div>
        </div>
      </div>
    </div>
  )
}

function EmptyPhoneScreen({ screen }) {
  return (
    <PhoneShellFrame accent={screen.accent}>
      <div style={{ height: '100%', display: 'grid', gridTemplateRows: 'auto 1fr auto' }}>
        <PhoneStatusBar title={screen.phoneTitle} accent={screen.accent} />
        <div style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
          <div style={{ textAlign: 'center', maxWidth: 220 }}>
            <div style={{ width: 72, height: 72, margin: '0 auto 14px', borderRadius: 22, background: `${screen.accent}16`, color: screen.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.45rem' }}>
              <i className={`fa-solid ${screen.icon}`} />
            </div>
            <div style={{ fontSize: '.98rem', fontWeight: 800, color: '#0f172a' }}>Bos ekran hazir</div>
            <div style={{ marginTop: 8, fontSize: '.84rem', color: '#64748b', lineHeight: 1.65 }}>
              Bu alan bilerek bos birakildi. Islevler daha sonra role ozel olarak eklenecek.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 16 }}>
          <div style={{ width: 120, height: 6, borderRadius: 999, background: 'rgba(15,23,42,.16)' }} />
        </div>
      </div>
    </PhoneShellFrame>
  )
}

function uid(prefix = 'mob') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function parseJson(value, fallback = []) {
  if (!value) return fallback
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : fallback
    } catch {
      return fallback
    }
  }
  return fallback
}

function fmtMoney(value) {
  return `${(parseFloat(value) || 0).toFixed(2)} TL`
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

function normalizeCouponCode(value) {
  return String(value || '').trim().toUpperCase()
}

function normalizeChannelName(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/Ä±/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function getMobileProductCategoryId(item) {
  return item?.sale_cat_l5
    || item?.sale_cat_l4
    || item?.sale_cat_l3
    || item?.sale_cat_l2
    || item?.sale_cat_l1
    || item?.cat_l5
    || item?.cat_l4
    || item?.cat_l3
    || item?.cat_l2
    || item?.cat_l1
    || null
}

function getMobileBasePrice(item, channelId) {
  const channelPrice = parseJson(item?.channel_prices, []).find(price => price.channel_id === channelId && price.active !== false)
  if (channelPrice) return parseFloat(channelPrice.price) || 0
  return parseFloat(item?.standard_price) || 0
}

function getMobileOptionPrice(option) {
  return parseFloat(option?.price_delta ?? option?.price ?? option?.priceOffset ?? 0) || 0
}

function buildMobileTicketItems(cart = []) {
  return cart.map(item => ({
    id: item.id || uid('mob_line'),
    cartKey: item.cartKey || `${item.product?.id || item.name}_${item.portion?.id || ''}_${(item.options || []).map(option => option.name).sort().join(',')}`,
    prod: item.product,
    portion: item.portion || null,
    options: item.options || [],
    unitPrice: parseFloat(item.unitPrice) || 0,
    qty: Math.max(1, parseFloat(item.qty) || 1),
    note: item.note || '',
  }))
}

function getMobileCouponEntries(couponSeries = [], customerId = '') {
  const safeCustomerId = String(customerId || '').trim()
  const now = Date.now()
  return (couponSeries || []).flatMap(series => (
    (series?.coupons || []).map(coupon => {
      const expiresAt = coupon?.expiresAt ? new Date(coupon.expiresAt).getTime() : null
      const status = String(coupon?.redemptionStatus || '').toLowerCase()
      const assignedCustomerId = String(coupon?.customerId || '').trim()
      const usable = series?.active !== false
        && coupon?.active !== false
        && coupon?.isUsed !== true
        && !['used', 'expired', 'cancelled'].includes(status)
        && (!expiresAt || expiresAt > now)
        && (!assignedCustomerId || assignedCustomerId === safeCustomerId)
      return {
        code: normalizeCouponCode(coupon?.code),
        label: `${series?.name || 'Kupon'}${coupon?.code ? ` / ${coupon.code}` : ''}`,
        seriesId: series?.id || '',
        seriesName: series?.name || '',
        benefitConfig: series?.benefitConfig || {},
        customerId: assignedCustomerId,
        usable,
      }
    })
  )).filter(item => item.code && item.usable)
}

function resolveCouponSelection(couponSeries = [], selectedCouponCode = '') {
  const safeCode = normalizeCouponCode(selectedCouponCode)
  if (!safeCode) return null
  for (const series of couponSeries || []) {
    const coupon = (series?.coupons || []).find(item => normalizeCouponCode(item?.code) === safeCode)
    if (!coupon) continue
    return {
      code: safeCode,
      label: `${series?.name || 'Kupon'} / ${safeCode}`,
      seriesId: series?.id || '',
      seriesName: series?.name || '',
      benefitConfig: series?.benefitConfig || {},
    }
  }
  return {
    code: safeCode,
    label: safeCode,
    seriesId: '',
    seriesName: '',
    benefitConfig: {},
  }
}

function resolveMobileOfferDiscount(offer, subtotal) {
  if (!offer) return 0
  if (offer.discountType === 'amount') return roundMoney(Math.min(subtotal, Number(offer.discountValue || offer.discountAmount || 0)))
  if (offer.discountType === 'percent') return roundMoney(Math.min(subtotal, subtotal * (Number(offer.discountValue || 0) / 100)))
  return 0
}

function resolveMobileCouponDiscount(couponSelection, subtotal) {
  const benefit = couponSelection?.benefitConfig || {}
  const type = String(benefit.type || '').trim()
  if (!couponSelection?.code || subtotal <= 0) return 0
  if (type === 'order_discount_amount') return roundMoney(Math.min(subtotal, Number(benefit.amount || 0)))
  if (type === 'order_discount_percent') {
    const rawDiscount = subtotal * (Number(benefit.percent || 0) / 100)
    const maxDiscount = Number(benefit.maxDiscountAmount || 0)
    return roundMoney(Math.min(subtotal, maxDiscount > 0 ? Math.min(rawDiscount, maxDiscount) : rawDiscount))
  }
  return 0
}

function MobileOrderSurface({
  mode = 'waiter',
  branchId,
  branchName,
  table,
  customerPhone = '',
  customerId = '',
  customerName = '',
  linkedCustomer = null,
  selectedCampaignId = '',
  selectedCouponCode = '',
  loyaltyCampaigns = [],
  saleTemplates = [],
  couponContext = {},
  onBack,
  onDone,
}) {
  const [loading, setLoading] = useState(Boolean(branchId))
  const [error, setError] = useState('')
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [channels, setChannels] = useState([])
  const [taxes, setTaxes] = useState([])
  const [activeCategoryId, setActiveCategoryId] = useState('')
  const [cart, setCart] = useState([])
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [selectedPortionId, setSelectedPortionId] = useState('')
  const [selectedOptions, setSelectedOptions] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!branchId) {
      setLoading(false)
      setError('Sube baglami bulunamadi.')
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')

    Promise.all([
      db.from('sale_categories').select('id,name,parent_id').is('deleted_at', null).order('name'),
      db.from('sale_items').select(MOBILE_PRODUCT_SELECT).is('deleted_at', null).eq('active', true).limit(240),
      db.from('sales_channels').select('id,name,show_in_kds').is('deleted_at', null),
      db.from('taxes').select('id,name,rate').is('deleted_at', null).limit(20),
    ])
      .then(([categoryResult, productResult, channelResult, taxResult]) => {
        if (cancelled) return
        if (categoryResult.error) throw categoryResult.error
        if (productResult.error) throw productResult.error
        if (channelResult.error) throw channelResult.error
        if (taxResult.error) throw taxResult.error
        const nextCategories = categoryResult.data || []
        const nextProducts = productResult.data || []
        setCategories(nextCategories)
        setProducts(nextProducts)
        setChannels(channelResult.data || [])
        setTaxes(taxResult.data || [])
        const firstCategoryId = nextCategories.find(category => nextProducts.some(product => getMobileProductCategoryId(product) === category.id))?.id || ''
        setActiveCategoryId(current => current || firstCategoryId)
      })
      .catch(loadError => {
        if (!cancelled) setError(loadError?.message || 'Urun katalogu yuklenemedi.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [branchId])

  const selectedChannel = useMemo(() => {
    const preferredNames = mode === 'qr' ? ['qr menu', 'qr menü', 'qr'] : ['masa', 'hizli satis', 'hızlı satış']
    return preferredNames
      .map(name => channels.find(channel => normalizeChannelName(channel?.name) === normalizeChannelName(name)))
      .find(Boolean)
      || channels[0]
      || null
  }, [channels, mode])
  const visibleCategories = useMemo(
    () => categories.filter(category => products.some(product => getMobileProductCategoryId(product) === category.id)),
    [categories, products],
  )
  const visibleProducts = useMemo(
    () => products.filter(product => !activeCategoryId || getMobileProductCategoryId(product) === activeCategoryId),
    [activeCategoryId, products],
  )
  const cartTotal = useMemo(
    () => roundMoney(cart.reduce((sum, item) => sum + ((parseFloat(item.unitPrice) || 0) * (parseFloat(item.qty) || 0)), 0)),
    [cart],
  )
  const cartQty = useMemo(
    () => cart.reduce((sum, item) => sum + (parseFloat(item.qty) || 0), 0),
    [cart],
  )
  const customerContext = useMemo(() => {
    if (!linkedCustomer && !customerId && !customerName) return {}
    return {
      customerId: linkedCustomer?.customerId || customerId || '',
      customerName: linkedCustomer?.customerName || customerName || '',
      customerCategoryIds: linkedCustomer?.customerCategoryIds || [],
      tierPointsMultiplier: linkedCustomer?.tierPointsMultiplier || linkedCustomer?.pointsMultiplier || linkedCustomer?.points_multiplier || 1,
    }
  }, [customerId, customerName, linkedCustomer])
  const [loyaltyEvaluation, setLoyaltyEvaluation] = useState({ visibleCampaigns: [], applicableOffers: [], walletReadiness: null })
  const selectedLoyaltyProgramId = useMemo(() => {
    const selectedCampaign = loyaltyEvaluation.visibleCampaigns.find(campaign => (
      String(campaign.id || '') === String(selectedCampaignId || '')
    ))
    if (selectedCampaign?.programId) return String(selectedCampaign.programId).trim()

    const candidateProgramIds = [
      ...new Set(
        (loyaltyCampaigns || [])
          .map(campaign => String(campaign.programId || campaign.program_id || '').trim())
          .filter(Boolean),
      ),
    ]
    return candidateProgramIds.length === 1 ? candidateProgramIds[0] : ''
  }, [loyaltyCampaigns, loyaltyEvaluation.visibleCampaigns, selectedCampaignId])
  useEffect(() => {
    let ignore = false
    const syncFallback = evaluateRuntimeOrderCampaigns(loyaltyCampaigns, {
      runtimeChannel: mode === 'qr' ? 'mobile' : 'masa',
      orderTotal: cartTotal,
      customerContext,
      selectedCampaignId,
      cartLines: buildMobileTicketItems(cart),
      saleTemplates,
    })

    ;(async () => {
      try {
        const evaluated = await evaluateRuntimeOrderCampaignsAsync(loyaltyCampaigns, {
          runtimeChannel: mode === 'qr' ? 'mobile' : 'masa',
          orderTotal: cartTotal,
          customerContext,
          selectedCampaignId,
          programId: selectedLoyaltyProgramId,
          cartLines: buildMobileTicketItems(cart),
          saleTemplates,
        })
        if (ignore) return
        setLoyaltyEvaluation(evaluated)
      } catch {
        if (ignore) return
        setLoyaltyEvaluation({ ...syncFallback, walletReadiness: null })
      }
    })()

    return () => { ignore = true }
  }, [cart, cartTotal, customerContext, loyaltyCampaigns, mode, selectedCampaignId, selectedLoyaltyProgramId, saleTemplates])
  const selectedLoyaltyOffer = useMemo(
    () => loyaltyEvaluation.applicableOffers.find(offer => String(offer.campaignId || '') === String(selectedCampaignId || ''))
      || loyaltyEvaluation.applicableOffers.find(offer => offer.applicationMode === 'auto')
      || null,
    [loyaltyEvaluation.applicableOffers, selectedCampaignId],
  )
  const selectedCoupon = useMemo(
    () => resolveCouponSelection(couponContext?.couponSeries || [], selectedCouponCode),
    [couponContext?.couponSeries, selectedCouponCode],
  )
  const campaignDiscountAmount = useMemo(
    () => resolveMobileOfferDiscount(selectedLoyaltyOffer, cartTotal),
    [cartTotal, selectedLoyaltyOffer],
  )
  const couponDiscountAmount = useMemo(
    () => resolveMobileCouponDiscount(selectedCoupon, Math.max(0, cartTotal - campaignDiscountAmount)),
    [campaignDiscountAmount, cartTotal, selectedCoupon],
  )
  const loyaltyDiscountAmount = roundMoney(Math.min(cartTotal, campaignDiscountAmount + couponDiscountAmount))
  const netCartTotal = roundMoney(Math.max(0, cartTotal - loyaltyDiscountAmount))

  function openProduct(product) {
    const portions = parseJson(product?.portions, [])
    setSelectedProduct(product)
    setSelectedPortionId(portions[0]?.id || '')
    setSelectedOptions([])
  }

  function addSelectedProduct() {
    if (!selectedProduct) return
    const portions = parseJson(selectedProduct.portions, [])
    const portion = portions.find(item => item.id === selectedPortionId) || null
    const basePrice = getMobileBasePrice(selectedProduct, selectedChannel?.id)
    const unitPrice = basePrice
      + (parseFloat(portion?.price_offset ?? portion?.priceOffset ?? 0) || 0)
      + selectedOptions.reduce((sum, option) => sum + getMobileOptionPrice(option), 0)
    const cartKey = `${selectedProduct.id}_${portion?.id || ''}_${selectedOptions.map(option => option.name).sort().join(',')}`

    setCart(current => {
      const existing = current.find(item => item.cartKey === cartKey)
      if (existing) {
        return current.map(item => item.cartKey === cartKey ? { ...item, qty: item.qty + 1 } : item)
      }
      return [
        ...current,
        {
          id: uid('mob_cart'),
          cartKey,
          product: selectedProduct,
          name: selectedProduct.short_name || selectedProduct.name,
          image: selectedProduct.channel_image || selectedProduct.pos_image || '',
          portion,
          options: selectedOptions,
          unitPrice,
          qty: 1,
          note: '',
        },
      ]
    })
    setSelectedProduct(null)
  }

  function updateQty(itemId, delta) {
    setCart(current => current
      .map(item => item.id === itemId ? { ...item, qty: Math.max(0, item.qty + delta) } : item)
      .filter(item => item.qty > 0))
  }

  async function submitOrder() {
    if (!table?.id || cart.length === 0) return
    setSubmitting(true)
    setNotice('')
    try {
      const ticketItems = buildMobileTicketItems(cart)
      if (mode === 'waiter') {
        await appendItemsToOpenTableTicket({
          branchId,
          tableKey: table.id,
          items: ticketItems,
          orderNote: `Kaynak: Mobil Garson | Masa: ${table.table_number || table.table_name || ''}`,
          sourceSessionId: uid('waiter'),
          sourceChannel: 'masa',
          sourceLabel: 'Mobil Garson',
          createdFromQr: false,
        })
        setCart([])
        setNotice('Urunler masanin adisyonuna eklendi.')
        onDone?.()
        return
      }

      const displayNo = await getNextKioskDisplayNo(branchId, branchName)
      const saleDate = new Date().toISOString()
      const loyaltyCampaignPayload = selectedLoyaltyOffer
        ? {
            ...selectedLoyaltyOffer,
            selectedCouponCode: selectedLoyaltyOffer.selectedCouponCode || (selectedCoupon?.code || ''),
            decisionContext: loyaltyEvaluation?.decisionContext || null,
          }
        : (linkedCustomer || customerId)
          ? {
              decisionContext: {
                combinedEarnMultiplier: loyaltyEvaluation?.combinedEarnMultiplier || 1,
                combinedRedeemMultiplier: loyaltyEvaluation?.combinedRedeemMultiplier || 1,
                tierPointsMultiplier: (linkedCustomer?.tierPointsMultiplier || linkedCustomer?.pointsMultiplier || linkedCustomer?.points_multiplier || 1),
              }
            }
          : null
      const saleLoyaltySnapshot = createSaleLoyaltySnapshot(loyaltyCampaignPayload)
      const discountAllocations = buildProportionalDiscountAllocations(cart, {
        discountAmount: loyaltyDiscountAmount,
        getKey: item => item.id,
        getLineTotal: item => (parseFloat(item.unitPrice) || 0) * (parseFloat(item.qty) || 0),
        getQty: item => item.qty,
      })
      const discountMap = new Map(discountAllocations.map(item => [item.key, item]))
      const loyaltyNote = [
        saleLoyaltySnapshot?.campaignName ? `Kampanya: ${saleLoyaltySnapshot.campaignName}` : '',
        selectedCoupon?.code ? `Kupon: ${selectedCoupon.code}` : '',
        loyaltyDiscountAmount > 0 ? `Avantaj indirimi: ${fmtMoney(loyaltyDiscountAmount)}` : '',
      ].filter(Boolean).join(' | ')
      const baseSaleHeader = {
        sale_datetime: saleDate,
        source: 'qr_menu',
        source_channel_type: 'qr',
        sales_channel_id: asUuidOrNull(selectedChannel?.id),
        sales_channel_name: selectedChannel?.name || 'QR Menu',
        branch_id: asUuidOrNull(branchId),
        branch_name: branchName || null,
        customer_id: asUuidOrNull(customerId),
        customer_name: customerName || null,
        currency_code: 'TRY',
        gross_total_before_discount: cartTotal,
        gross_total_after_discount: netCartTotal,
        net_total_after_discount: netCartTotal,
        payment_total: 0,
        status: 'completed',
        kds_status: 'pending',
        pickup_called: false,
        kiosk_service_type: 'table_service',
        kiosk_table_number: table.table_number || table.table_name || null,
        kiosk_display_no: displayNo,
        order_note: [
          'Kaynak: QR Siparisi',
          table.table_number ? `Masa: ${table.table_number}` : '',
          customerPhone ? `Telefon: ${customerPhone}` : '',
          loyaltyNote,
        ].filter(Boolean).join(' | '),
      }
      const saleHeader = attachLoyaltyToSaleHeader(baseSaleHeader, saleLoyaltySnapshot, loyaltyDiscountAmount)
      let saleResult = await db.from('sales').insert({ ...saleHeader, updated_at: saleDate }).select('id').single()
      if (saleResult.error && isLoyaltyPersistenceColumnError(saleResult.error)) {
        saleResult = await db.from('sales').insert({ ...baseSaleHeader, updated_at: saleDate }).select('id').single()
      }
      if (saleResult.error) throw saleResult.error
      const saleId = saleResult.data.id
      const defaultTax = taxes[0] || null
      const baseLines = cart.map((item, index) => {
        const lineTotal = roundMoney((parseFloat(item.unitPrice) || 0) * (parseFloat(item.qty) || 0))
        const discountRow = discountMap.get(String(item.id)) || {}
        const lineAfterDiscount = roundMoney(discountRow.lineTotalAfterDiscount ?? lineTotal)
        return {
          sale_id: saleId,
          line_no: index + 1,
          product_id: asUuidOrNull(item.product?.id),
          product_name: item.name || item.product?.name || 'Urun',
          product_sku: item.product?.sku || null,
          qty: item.qty,
          unit_gross_before_discount: item.unitPrice,
          line_gross_before_discount: lineTotal,
          discount_allocated_amount: discountRow.lineDiscountAmount || 0,
          unit_gross_after_discount: discountRow.unitPriceAfterDiscount ?? item.unitPrice,
          line_gross_after_discount: lineAfterDiscount,
          tax_id: asUuidOrNull(defaultTax?.id),
          tax_name: defaultTax?.name || null,
          tax_rate: parseFloat(defaultTax?.rate) || 0,
          line_net_after_discount: lineAfterDiscount,
          unit_cost_snapshot: 0,
          line_cost_total: 0,
          options_json: item.options || [],
          portion_id: asUuidOrNull(item.portion?.id),
          portion_name: item.portion?.name || null,
          branch_id: asUuidOrNull(branchId),
          branch_name: branchName || null,
          sale_datetime: saleDate,
          sales_channel_id: asUuidOrNull(selectedChannel?.id),
          kds_completed: false,
          prep_time_minutes: Math.max(0, parseInt(item.product?.prep_time_minutes, 10) || 0),
        }
      })
      const lines = attachLoyaltyToSaleLines(baseLines, saleLoyaltySnapshot, loyaltyDiscountAmount)
      let lineResult = await db.from('sale_lines').insert(lines)
      if (lineResult.error && isLoyaltyPersistenceColumnError(lineResult.error)) {
        lineResult = await db.from('sale_lines').insert(baseLines)
      }
      if (lineResult.error) throw lineResult.error
      await appendItemsToOpenTableTicket({
        branchId,
        tableKey: table.id,
        items: ticketItems,
        orderNote: saleHeader.order_note,
        customerPhone,
        customerId,
        customerName,
        sourceSessionId: saleId,
        sourceChannel: 'qr',
        sourceLabel: 'QR Siparisi',
        createdFromQr: true,
      })
      let loyaltyWarning = ''
      try {
        if (customerId || saleLoyaltySnapshot || selectedCoupon?.code) {
          await postSaleLoyaltyValueLedger({
            saleId,
            saleHeader: { ...saleHeader, id: saleId },
            saleLines: lines,
            customer: customerId
              ? {
                  id: customerId,
                  name: customerName,
                  customerId,
                  customerName,
                  selectedCampaignId: selectedCampaignId || '',
                  selectedCampaignName: selectedLoyaltyOffer?.campaignName || linkedCustomer?.selectedCampaignName || '',
                  selectedCouponCode: selectedCoupon?.code || selectedCouponCode || '',
                  selectedCouponLabel: selectedCoupon?.label || linkedCustomer?.selectedCouponLabel || '',
                  customerCategoryIds: linkedCustomer?.customerCategoryIds || [],
                }
              : null,
            loyaltyCampaign: saleLoyaltySnapshot,
            selectedCouponCode: selectedCoupon?.code || selectedCouponCode || '',
            sourceChannel: 'qr',
          })
        }
      } catch (ledgerError) {
        loyaltyWarning = ledgerError?.message || 'Sadakat kaydi daha sonra kontrol edilecek.'
      }
      setCart([])
      setNotice(loyaltyWarning
        ? 'Siparisiniz alindi. Sadakat kaydi daha sonra kontrol edilecek.'
        : 'Siparisiniz mutfaga ve garsona iletildi.')
      onDone?.({ loyaltyWarning })
    } catch (submitError) {
      setNotice(submitError?.message || 'Siparis gonderilemedi.')
    } finally {
      setSubmitting(false)
    }
  }

  const selectedGroups = parseJson(selectedProduct?.option_groups, [])
  const selectedPortions = parseJson(selectedProduct?.portions, [])
  const selectedBasePrice = selectedProduct ? getMobileBasePrice(selectedProduct, selectedChannel?.id) : 0

  return (
    <div style={{ height: '100%', display: 'grid', gridTemplateRows: 'auto auto 1fr auto', background: '#f8fafc' }}>
      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(226,232,240,.9)', background: '#fff' }}>
        <button type="button" onClick={onBack} style={{ width: 38, height: 38, borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff', color: '#0f172a', cursor: 'pointer' }}>
          <i className="fa-solid fa-arrow-left" />
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 900, color: '#0f172a', fontSize: '.95rem' }}>{table?.table_name || 'Masa Siparisi'}</div>
          <div style={{ color: '#64748b', fontSize: '.72rem' }}>{mode === 'qr' ? 'Masadasin, siparis masaya islenecek' : 'Mobil garson'} / {selectedChannel?.name || 'Kanal'}</div>
        </div>
        <div style={{ minWidth: 42, height: 38, borderRadius: 12, background: '#0f172a', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 900 }}>
          {cartQty}
        </div>
      </div>

      {notice ? (
        <div style={{ margin: '10px 12px 0', borderRadius: 14, padding: '10px 12px', background: notice.includes('iletil') || notice.includes('eklendi') ? 'rgba(22,163,74,.1)' : 'rgba(239,68,68,.1)', color: notice.includes('iletil') || notice.includes('eklendi') ? '#166534' : '#dc2626', fontWeight: 800, fontSize: '.76rem', lineHeight: 1.5 }}>
          {notice}
        </div>
      ) : <div />}

      <div style={{ minHeight: 0, display: 'grid', gridTemplateColumns: '82px 1fr', gap: 10, padding: 12 }}>
        <div style={{ minHeight: 0, overflowY: 'auto', display: 'grid', gap: 8, alignContent: 'start' }}>
          {visibleCategories.map(category => (
            <button
              key={category.id}
              type="button"
              onClick={() => setActiveCategoryId(category.id)}
              style={{ minHeight: 64, borderRadius: 16, border: activeCategoryId === category.id ? '1px solid #0f172a' : '1px solid #e2e8f0', background: activeCategoryId === category.id ? '#0f172a' : '#fff', color: activeCategoryId === category.id ? '#fff' : '#475569', fontWeight: 900, fontSize: '.68rem', cursor: 'pointer', padding: 8 }}
            >
              {category.name}
            </button>
          ))}
        </div>

        <div style={{ minHeight: 0, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignContent: 'start' }}>
          {loading ? (
            <div style={{ gridColumn: '1/-1', color: '#64748b', fontWeight: 800, padding: 20 }}>Urunler yukleniyor...</div>
          ) : error ? (
            <div style={{ gridColumn: '1/-1', color: '#dc2626', fontWeight: 800, padding: 20 }}>{error}</div>
          ) : visibleProducts.map(product => {
            const price = getMobileBasePrice(product, selectedChannel?.id)
            const image = product.channel_image || product.pos_image || ''
            return (
              <button
                key={product.id}
                type="button"
                onClick={() => openProduct(product)}
                style={{ minHeight: 148, borderRadius: 18, border: '1px solid #e2e8f0', background: '#fff', padding: 8, textAlign: 'left', display: 'grid', gridTemplateRows: '74px auto auto', gap: 7, cursor: 'pointer', boxShadow: '0 10px 22px rgba(15,23,42,.06)' }}
              >
                <div style={{ borderRadius: 14, background: '#eef2f7', overflow: 'hidden' }}>
                  {image ? <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : null}
                </div>
                <div style={{ color: '#0f172a', fontWeight: 900, fontSize: '.74rem', lineHeight: 1.2, minHeight: 34 }}>{product.short_name || product.name}</div>
                <div style={{ color: '#f59e0b', fontWeight: 900, fontSize: '.76rem' }}>{fmtMoney(price)}</div>
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ padding: 12, borderTop: '1px solid #e2e8f0', background: '#fff', display: 'grid', gap: 10 }}>
        {mode === 'qr' && (selectedLoyaltyOffer || selectedCoupon?.code) ? (
          <div style={{ borderRadius: 14, padding: '9px 11px', background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.2)', color: '#92400e', fontSize: '.72rem', fontWeight: 800, lineHeight: 1.45 }}>
            <i className="fa-solid fa-badge-percent" style={{ marginRight: 6 }} />
            Hazir avantajin: {[selectedLoyaltyOffer?.campaignName, selectedCoupon?.code].filter(Boolean).join(' + ')}
            {loyaltyDiscountAmount > 0 ? ` / -${fmtMoney(loyaltyDiscountAmount)}` : ''}
          </div>
        ) : null}
        {cart.length > 0 ? (
          <div style={{ maxHeight: 116, overflowY: 'auto', display: 'grid', gap: 8 }}>
            {cart.map(item => (
              <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', color: '#0f172a' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, fontSize: '.76rem' }}>{item.name}</div>
                  <div style={{ color: '#64748b', fontSize: '.7rem' }}>{item.qty} x {fmtMoney(item.unitPrice)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button type="button" onClick={() => updateQty(item.id, -1)} style={{ width: 28, height: 28, borderRadius: 999, border: '1px solid #cbd5e1', background: '#fff' }}>-</button>
                  <button type="button" onClick={() => updateQty(item.id, 1)} style={{ width: 28, height: 28, borderRadius: 999, border: 'none', background: '#0f172a', color: '#fff' }}>+</button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          onClick={submitOrder}
          disabled={cart.length === 0 || submitting}
          style={{ minHeight: 52, borderRadius: 16, border: 'none', background: cart.length === 0 ? '#cbd5e1' : 'linear-gradient(135deg, #0f172a, #1f2937)', color: '#fff', fontWeight: 900, cursor: cart.length === 0 ? 'default' : 'pointer' }}
        >
          {submitting ? 'Gonderiliyor...' : `${mode === 'qr' ? 'Sepeti masama gonder' : 'Adisyona ekle'} / ${fmtMoney(netCartTotal)}`}
        </button>
      </div>

      {selectedProduct ? (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.46)', display: 'grid', alignItems: 'end', zIndex: 5 }}>
          <div style={{ borderRadius: '26px 26px 0 0', background: '#fff', padding: 16, display: 'grid', gap: 14, maxHeight: '78%', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
              <div>
                <div style={{ color: '#0f172a', fontSize: '1rem', fontWeight: 900 }}>{selectedProduct.short_name || selectedProduct.name}</div>
                <div style={{ marginTop: 4, color: '#f59e0b', fontWeight: 900 }}>{fmtMoney(selectedBasePrice)}</div>
              </div>
              <button type="button" onClick={() => setSelectedProduct(null)} style={{ width: 36, height: 36, borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff' }}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            {selectedPortions.length > 0 ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ color: '#475569', fontSize: '.76rem', fontWeight: 900 }}>Porsiyon</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {selectedPortions.map(portion => (
                    <button key={portion.id || portion.name} type="button" onClick={() => setSelectedPortionId(portion.id || '')} style={{ minHeight: 38, borderRadius: 999, border: selectedPortionId === portion.id ? '1px solid #0f172a' : '1px solid #cbd5e1', background: selectedPortionId === portion.id ? '#0f172a' : '#fff', color: selectedPortionId === portion.id ? '#fff' : '#0f172a', padding: '0 12px', fontWeight: 900 }}>
                      {portion.name || 'Porsiyon'}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {selectedGroups.map(group => (
              <div key={group.id || group.name} style={{ display: 'grid', gap: 8 }}>
                <div style={{ color: '#475569', fontSize: '.76rem', fontWeight: 900 }}>{group.name || 'Secenekler'}</div>
                {(group.options || []).map(option => {
                  const checked = selectedOptions.some(item => item.id === option.id || item.name === option.name)
                  return (
                    <button key={option.id || option.name} type="button" onClick={() => setSelectedOptions(current => checked ? current.filter(item => item.id !== option.id && item.name !== option.name) : [...current, option])} style={{ minHeight: 42, borderRadius: 14, border: checked ? '1px solid #0f172a' : '1px solid #e2e8f0', background: checked ? 'rgba(15,23,42,.06)' : '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '0 12px', color: '#0f172a', fontWeight: 800 }}>
                      <span>{option.name}</span>
                      <span>{getMobileOptionPrice(option) > 0 ? `+${fmtMoney(getMobileOptionPrice(option))}` : ''}</span>
                    </button>
                  )
                })}
              </div>
            ))}

            <button type="button" onClick={addSelectedProduct} style={{ minHeight: 50, borderRadius: 16, border: 'none', background: '#f59e0b', color: '#111827', fontWeight: 900 }}>
              Sepete ekle
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function PersonnelPhone() {
  const { branchId, branchName } = useWorkspace()
  const [activeTab, setActiveTab] = useState('garson')
  const [drawerOpen, setDrawerOpen] = useState(false)

  const menuItems = [
    { key: 'home', label: 'Ana Sayfa', icon: 'fa-house', subtitle: 'Bugunluk bos' },
    { key: 'garson', label: 'Garson', icon: 'fa-user-tie', subtitle: 'Uzaktan masa ve adisyon yonetimi' },
  ]

  return (
    <PhoneShellFrame accent="#38bdf8">
      <div style={{ height: '100%', display: 'grid', gridTemplateRows: 'auto 1fr' }}>
        <div style={{ padding: '18px 16px 12px', display: 'grid', gap: 12, background: 'linear-gradient(180deg, rgba(56,189,248,.12), rgba(255,255,255,.98))', borderBottom: '1px solid rgba(226,232,240,.8)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#0f172a', fontSize: '.82rem', fontWeight: 800 }}>
            <span>09:41</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#64748b' }}>
              <i className="fa-solid fa-signal" />
              <i className="fa-solid fa-wifi" />
              <i className="fa-solid fa-battery-three-quarters" />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                style={{ width: 42, height: 42, borderRadius: 14, border: 'none', background: 'rgba(56,189,248,.16)', color: '#0284c7', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-bars" />
              </button>
              <div>
                <div style={{ fontSize: '1.02rem', fontWeight: 900, color: '#0f172a' }}>Personel Mobil</div>
                <div style={{ fontSize: '.76rem', color: '#64748b' }}>
                  {activeTab === 'home' ? 'Telefon ana sayfa kabugu' : 'Garson modulunun uzaktan uzantisi'}
                </div>
              </div>
            </div>
            <div style={{ padding: '6px 10px', borderRadius: 999, background: 'rgba(2,132,199,.1)', color: '#0284c7', fontSize: '.72rem', fontWeight: 900 }}>
              Beta
            </div>
          </div>
        </div>

        <div style={{ position: 'relative', minHeight: 0, background: '#f8fafc' }}>
          {activeTab === 'home' ? (
            <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: 24 }}>
              <div style={{ textAlign: 'center', maxWidth: 230 }}>
                <div style={{ width: 76, height: 76, margin: '0 auto 16px', borderRadius: 24, background: 'rgba(56,189,248,.14)', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem' }}>
                  <i className="fa-solid fa-house" />
                </div>
                <div style={{ color: '#0f172a', fontWeight: 900, fontSize: '1rem' }}>Ana sayfa simdilik bos</div>
                <div style={{ marginTop: 10, color: '#64748b', fontSize: '.84rem', lineHeight: 1.65 }}>
                  Bugunku gelistirme icin sidebara sadece giris noktasi olarak eklendi. Sonraki fazlarda diger mobil moduller buraya baglanacak.
                </div>
              </div>
            </div>
          ) : (
            <StaffPinGate
              storageKey={MOBILE_GARSON_STAFF_SESSION_KEY}
              branchId={branchId || ''}
              branchName={branchName || ''}
              title="Mobil Garson Girisi"
              subtitle="Telefon ekranini kullanmak icin PIN ile giris yapin."
              embeddedPin
            >
              {(activeStaff, helpers) => (
                <MobileGarsonRuntime
                  branchId={branchId || ''}
                  branchName={branchName || ''}
                  activeStaff={activeStaff}
                  onStaffLogout={helpers?.logout}
                />
              )}
            </StaffPinGate>
          )}

          {drawerOpen ? (
            <>
              <button
                type="button"
                aria-label="Drawer kapat"
                onClick={() => setDrawerOpen(false)}
                style={{ position: 'absolute', inset: 0, border: 'none', background: 'rgba(15,23,42,.42)', cursor: 'pointer' }}
              />
              <div style={{ position: 'absolute', inset: '0 auto 0 0', width: 276, background: 'linear-gradient(180deg, #081226, #0f172a)', color: '#fff', padding: 18, display: 'grid', gridTemplateRows: 'auto auto 1fr', gap: 16, boxShadow: '24px 0 50px rgba(2,6,23,.35)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '.74rem', letterSpacing: '.08em', textTransform: 'uppercase', color: '#7dd3fc', fontWeight: 900 }}>Mobil App</div>
                    <div style={{ marginTop: 6, fontSize: '1.08rem', fontWeight: 900 }}>Personel</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(false)}
                    style={{ width: 36, height: 36, borderRadius: 12, border: 'none', background: 'rgba(255,255,255,.08)', color: '#cbd5e1', cursor: 'pointer' }}
                  >
                    <i className="fa-solid fa-xmark" />
                  </button>
                </div>

                <div style={{ borderRadius: 18, padding: '12px 14px', background: 'rgba(56,189,248,.12)', border: '1px solid rgba(56,189,248,.18)' }}>
                  <div style={{ fontSize: '.72rem', color: '#7dd3fc', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em' }}>Bugun</div>
                  <div style={{ marginTop: 8, color: '#e2e8f0', fontSize: '.82rem', lineHeight: 1.6 }}>
                    Garson sekmesi ile sabit Garson modulunun ayni acik masa ve adisyon verisine uzaktan ulasabilirsiniz.
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
                  {menuItems.map(item => {
                    const active = item.key === activeTab
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => {
                          setActiveTab(item.key)
                          setDrawerOpen(false)
                        }}
                        style={{
                          minHeight: 68,
                          borderRadius: 18,
                          border: active ? '1px solid rgba(56,189,248,.34)' : '1px solid rgba(255,255,255,.08)',
                          background: active ? 'linear-gradient(135deg, rgba(56,189,248,.18), rgba(14,165,233,.12))' : 'rgba(255,255,255,.04)',
                          color: '#fff',
                          cursor: 'pointer',
                          padding: '12px 14px',
                          display: 'grid',
                          gridTemplateColumns: '40px 1fr',
                          gap: 12,
                          textAlign: 'left',
                        }}
                      >
                        <div style={{ width: 40, height: 40, borderRadius: 14, background: active ? 'rgba(56,189,248,.2)' : 'rgba(255,255,255,.08)', color: active ? '#7dd3fc' : '#cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <i className={`fa-solid ${item.icon}`} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 900, fontSize: '.9rem' }}>{item.label}</div>
                          <div style={{ marginTop: 4, color: '#94a3b8', fontSize: '.74rem', lineHeight: 1.5 }}>{item.subtitle}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </PhoneShellFrame>
  )
}

function MobileGarsonRuntime({ branchId, branchName, activeStaff, onStaffLogout }) {
  const [loading, setLoading] = useState(Boolean(branchId))
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [catalog, setCatalog] = useState({ halls: [], sections: [], tables: [] })
  const [tableTickets, setTableTickets] = useState({})
  const [tableRequests, setTableRequests] = useState([])
  const [selectedTableKey, setSelectedTableKey] = useState('')
  const [activeView, setActiveView] = useState('tables')
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  useEffect(() => {
    if (!branchId) {
      setLoading(false)
      setRefreshing(false)
      setError('Sube baglami bulunamadi.')
      return
    }

    let cancelled = false
    let inFlight = false

    async function hydrateRuntime({ background = false } = {}) {
      if (inFlight) return
      inFlight = true
      try {
        if (background) {
          setRefreshing(true)
        } else {
          setLoading(true)
          setError('')
        }
        const nextCatalog = await loadTableManagementCatalog(branchId)
        if (cancelled) return
        setCatalog(nextCatalog)
        const nextTickets = await hydrateOpenTableTicketsFromDb(nextCatalog.tables || [])
        if (cancelled) return
        setTableTickets(nextTickets || {})
        const nextRequests = await loadActiveTableServiceRequests(branchId)
        if (cancelled) return
        setTableRequests(nextRequests || [])
        setError('')
        setSelectedTableKey(current => {
          const activeNextTables = (nextCatalog.tables || []).filter(table => table.status === 'active' && table.is_active !== false)
          if (current && activeNextTables.some(table => table.id === current)) return current
          return activeNextTables[0]?.id || ''
        })
      } catch (runtimeError) {
        if (!cancelled && !background) setError(runtimeError?.message || 'Mobil Garson verileri yuklenemedi.')
      } finally {
        inFlight = false
        if (!cancelled) {
          if (background) setRefreshing(false)
          else setLoading(false)
        }
      }
    }

    hydrateRuntime()
    return () => {
      cancelled = true
    }
  }, [branchId, refreshTrigger])

  const activeTables = useMemo(
    () => (catalog.tables || []).filter(table => table.status === 'active' && table.is_active !== false),
    [catalog.tables],
  )
  const hallMap = useMemo(() => new Map((catalog.halls || []).map(hall => [hall.id, hall])), [catalog.halls])
  const sectionMap = useMemo(() => new Map((catalog.sections || []).map(section => [section.id, section])), [catalog.sections])
  const branchTickets = tableTickets?.[branchId] || {}
  const requestsByTableKey = useMemo(
    () => (tableRequests || []).reduce((accumulator, request) => {
      const tableKey = String(request?.tableId || '').trim()
      if (!tableKey) return accumulator
      if (!accumulator[tableKey]) accumulator[tableKey] = []
      accumulator[tableKey].push(request)
      return accumulator
    }, {}),
    [tableRequests],
  )
  const selectedTable = activeTables.find(table => table.id === selectedTableKey) || activeTables[0] || null
  const selectedTicket = branchTickets?.[selectedTable?.id] || { cart: [], orderNote: '', guestCounts: { women: 0, men: 0, children: 0 } }
  const selectedRequestSummary = summarizeTableServiceRequests(requestsByTableKey?.[selectedTable?.id] || [])
  if (activeView === 'order' && selectedTable) {
    return (
      <MobileOrderSurface
        mode="waiter"
        branchId={branchId}
        branchName={branchName}
        table={selectedTable}
        onBack={() => setActiveView('tables')}
        onDone={() => setActiveView('tables')}
      />
    )
  }

  if (loading) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: 24, background: '#f8fafc' }}>
        <div style={{ textAlign: 'center', color: '#475569', fontWeight: 800 }}>
          <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />
          Mobil Garson hazirlaniyor...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: 24, background: '#f8fafc' }}>
        <div style={{ textAlign: 'center', color: '#dc2626', fontWeight: 800, lineHeight: 1.6 }}>{error}</div>
      </div>
    )
  }

  const selectedTableHall = selectedTable ? hallMap.get(selectedTable.hall_id) : null
  const selectedTableSection = selectedTable ? sectionMap.get(selectedTable.section_id) : null
  const selectedItemCount = Array.isArray(selectedTicket?.cart)
    ? selectedTicket.cart.reduce((sum, item) => sum + (parseFloat(item?.qty) || 0), 0)
    : 0

  return (
    <div style={{ height: '100%', display: 'grid', gridTemplateRows: 'auto 1fr auto', background: 'linear-gradient(180deg, #f8fbff 0%, #eef4ff 100%)' }}>
      <div style={{ padding: '14px 14px 10px', display: 'grid', gap: 12, borderBottom: '1px solid rgba(226,232,240,.8)', background: 'linear-gradient(180deg, rgba(56,189,248,.14), rgba(255,255,255,.96))' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: '#0284c7', fontWeight: 900, fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.08em' }}>{branchName || 'Sube'}</div>
            <div style={{ marginTop: 4, color: '#0f172a', fontWeight: 900, fontSize: '1rem' }}>{getPersonnelDisplayName(activeStaff)}</div>
            <div style={{ marginTop: 2, color: '#64748b', fontSize: '.74rem' }}>Masa sec, sonra siparisi telefondan al.</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setRefreshTrigger(prev => prev + 1)}
              style={{
                width: 42,
                height: 42,
                borderRadius: 14,
                border: '1px solid rgba(14,165,233,.18)',
                background: 'rgba(224,242,254,.7)',
                color: '#0284c7',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
              }}
              title="Yenile"
            >
              <i className={`fa-solid fa-rotate ${refreshing ? 'fa-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onStaffLogout}
              style={{ width: 42, height: 42, borderRadius: 14, border: '1px solid rgba(239,68,68,.18)', background: 'rgba(254,226,226,.7)', color: '#dc2626', cursor: 'pointer' }}
            >
              <i className="fa-solid fa-right-from-bracket" />
            </button>
          </div>
        </div>

        {selectedTable ? (
          <div style={{ borderRadius: 22, padding: 16, background: 'linear-gradient(135deg, #0f172a, #172554)', color: '#fff', display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <div style={{ color: '#7dd3fc', fontSize: '.72rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                  {(selectedTableHall?.name || 'Salon').toUpperCase()} / {(selectedTableSection?.name || 'Bolge').toUpperCase()}
                </div>
                <div style={{ marginTop: 6, fontSize: '1.24rem', fontWeight: 900 }}>{selectedTable.table_name}</div>
                <div style={{ marginTop: 4, color: '#cbd5e1', fontSize: '.74rem' }}>Masa No: {selectedTable.table_number || '-'} / {selectedTable.capacity || '-'} kisilik</div>
              </div>
              <div style={{ padding: '8px 10px', borderRadius: 14, background: 'rgba(255,255,255,.08)', color: '#fbbf24', fontWeight: 900, fontSize: '.74rem' }}>
                {selectedItemCount} urun
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <MobileStatCard label="Adisyon" value={selectedItemCount} icon="fa-receipt" tone="#38bdf8" />
              <MobileStatCard label="Cagri" value={selectedRequestSummary.pendingCount || 0} icon="fa-bell-concierge" tone="#ef4444" />
              <MobileStatCard label="Hesap" value={selectedRequestSummary.hasBillRequest ? 1 : 0} icon="fa-money-bill-wave" tone="#f59e0b" />
            </div>

            <button
              type="button"
              onClick={() => setActiveView('order')}
              style={{ minHeight: 54, borderRadius: 18, border: 'none', background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#111827', fontWeight: 900, cursor: 'pointer', fontSize: '.92rem' }}
            >
              <i className="fa-solid fa-utensils" style={{ marginRight: 8 }} />
              Bu masa icin siparis al
            </button>
          </div>
        ) : null}
      </div>

      <div style={{ minHeight: 0, overflowY: 'auto', padding: 14, display: 'grid', gap: 12, alignContent: 'start' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ color: '#0f172a', fontWeight: 900, fontSize: '.92rem' }}>Masalar</div>
          <div style={{ color: '#64748b', fontSize: '.74rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            {refreshing ? <i className="fa-solid fa-rotate fa-spin" style={{ color: '#0284c7' }} /> : null}
            {activeTables.length} aktif masa
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {activeTables.map(table => {
            const ticket = branchTickets?.[table.id] || {}
            const itemCount = Array.isArray(ticket?.cart) ? ticket.cart.reduce((sum, item) => sum + (parseFloat(item?.qty) || 0), 0) : 0
            const requestSummary = summarizeTableServiceRequests(requestsByTableKey?.[table.id] || [])
            const hall = hallMap.get(table.hall_id)
            const section = sectionMap.get(table.section_id)
            return (
              <button
                key={table.id}
                type="button"
                onClick={() => setSelectedTableKey(table.id)}
                style={{
                  minHeight: 132,
                  borderRadius: 20,
                  border: selectedTableKey === table.id ? '1px solid rgba(14,165,233,.42)' : '1px solid rgba(226,232,240,.92)',
                  background: selectedTableKey === table.id ? 'linear-gradient(135deg, rgba(14,165,233,.16), rgba(255,255,255,.98))' : 'rgba(255,255,255,.95)',
                  boxShadow: requestSummary.pendingCount > 0 ? '0 0 0 2px rgba(248,113,113,.12), 0 12px 24px rgba(248,113,113,.16)' : '0 10px 24px rgba(15,23,42,.06)',
                  padding: 12,
                  display: 'grid',
                  gap: 8,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: '#0f172a', fontWeight: 900, fontSize: '.9rem' }}>{table.table_name}</div>
                    <div style={{ marginTop: 3, color: '#64748b', fontSize: '.68rem' }}>{hall?.name || 'Salon'} / {section?.name || 'Bolge'}</div>
                  </div>
                  {requestSummary.pendingCount > 0 ? (
                    <span style={{ width: 10, height: 10, borderRadius: 999, background: '#ef4444', boxShadow: '0 0 0 6px rgba(239,68,68,.12)' }} />
                  ) : (
                    <span style={{ width: 10, height: 10, borderRadius: 999, background: '#22c55e', boxShadow: '0 0 0 6px rgba(34,197,94,.12)' }} />
                  )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <MiniBadge tone="#38bdf8" text={`${table.table_number || '-'} no`} />
                  <MiniBadge tone="#0f172a" text={`${table.capacity || '-'} kisi`} />
                  {itemCount > 0 ? <MiniBadge tone="#f59e0b" text={`${itemCount} urun`} /> : null}
                  {requestSummary.hasCallWaiter ? <MiniBadge tone="#ef4444" text="Cagri" /> : null}
                  {requestSummary.hasBillRequest ? <MiniBadge tone="#7c3aed" text="Hesap" /> : null}
                </div>
                <div style={{ marginTop: 'auto', color: '#475569', fontSize: '.72rem', fontWeight: 700 }}>
                  {itemCount > 0 ? 'Adisyon acik' : 'Siparis bekliyor'}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ padding: 14, borderTop: '1px solid rgba(226,232,240,.84)', background: 'rgba(255,255,255,.92)' }}>
        <button
          type="button"
          onClick={() => selectedTable && setActiveView('order')}
          disabled={!selectedTable}
          style={{ width: '100%', minHeight: 50, borderRadius: 18, border: 'none', background: selectedTable ? '#0f172a' : '#cbd5e1', color: '#fff', fontWeight: 900, cursor: selectedTable ? 'pointer' : 'default' }}
        >
          {selectedTable ? `${selectedTable.table_name} icin siparis ekranini ac` : 'Once bir masa secin'}
        </button>
      </div>
    </div>
  )
}

function MobileStatCard({ label, value, icon, tone }) {
  return (
    <div style={{ borderRadius: 18, padding: '10px 8px', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.08)', display: 'grid', gap: 6, justifyItems: 'center' }}>
      <div style={{ width: 34, height: 34, borderRadius: 12, background: `${tone}24`, color: tone, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <i className={`fa-solid ${icon}`} />
      </div>
      <div style={{ color: '#fff', fontSize: '1rem', fontWeight: 900 }}>{value}</div>
      <div style={{ color: '#cbd5e1', fontSize: '.68rem', fontWeight: 800 }}>{label}</div>
    </div>
  )
}

function MiniBadge({ tone, text }) {
  return (
    <span style={{ borderRadius: 999, padding: '4px 8px', background: `${tone}18`, color: tone, fontSize: '.64rem', fontWeight: 900 }}>
      {text}
    </span>
  )
}

function QrPrimaryButton({ icon, title, subtitle, tone = '#f59e0b', onClick, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        minHeight: 112,
        borderRadius: 24,
        border: '1px solid rgba(226,232,240,.92)',
        background: disabled ? 'rgba(226,232,240,.66)' : `linear-gradient(135deg, ${tone}18, rgba(255,255,255,.98))`,
        color: '#0f172a',
        padding: '16px 14px',
        display: 'grid',
        gap: 8,
        alignContent: 'space-between',
        textAlign: 'left',
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <div style={{ width: 44, height: 44, borderRadius: 16, background: `${tone}20`, color: tone, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.05rem' }}>
        <i className={`fa-solid ${icon}`} />
      </div>
      <div>
        <div style={{ fontWeight: 900, fontSize: '.96rem' }}>{title}</div>
        <div style={{ marginTop: 6, color: '#64748b', fontSize: '.76rem', lineHeight: 1.5 }}>{subtitle}</div>
      </div>
    </button>
  )
}

function RatingStars({ rating, onChange }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
      {Array.from({ length: 5 }, (_, index) => {
        const value = index + 1
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            style={{ width: 44, height: 44, borderRadius: 14, border: 'none', background: value <= rating ? 'rgba(245,158,11,.16)' : 'rgba(226,232,240,.9)', color: value <= rating ? '#f59e0b' : '#94a3b8', cursor: 'pointer', fontSize: '1.1rem' }}
          >
            <i className="fa-solid fa-star" />
          </button>
        )
      })}
    </div>
  )
}

function QrMenuPhone() {
  const [searchParams] = useSearchParams()
  const branchId = searchParams.get('branch') || ''
  const tableToken = searchParams.get('tableToken') || ''
  const [loading, setLoading] = useState(Boolean(branchId && tableToken))
  const [error, setError] = useState('')
  const [context, setContext] = useState(null)
  const [notice, setNotice] = useState('')
  const [noticeTone, setNoticeTone] = useState('info')
  const [customerPhone, setCustomerPhone] = useState('')
  const [activeView, setActiveView] = useState('home')
  const [customerSummary, setCustomerSummary] = useState(null)
  const [feedbackRating, setFeedbackRating] = useState(5)
  const [feedbackComment, setFeedbackComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loyaltyCampaigns, setLoyaltyCampaigns] = useState([])
  const [couponSeries, setCouponSeries] = useState([])
  const [saleTemplates, setSaleTemplates] = useState([])
  const [loyaltyLoading, setLoyaltyLoading] = useState(false)
  const [loyaltyError, setLoyaltyError] = useState('')
  const [selectedCampaignId, setSelectedCampaignId] = useState('')
  const [selectedCampaignName, setSelectedCampaignName] = useState('')
  const [selectedCouponCode, setSelectedCouponCode] = useState('')
  const [selectedCouponLabel, setSelectedCouponLabel] = useState('')
  const [couponInput, setCouponInput] = useState('')

  useEffect(() => {
    if (!branchId || !tableToken) {
      setLoading(false)
      setError('Masa QR bilgisi eksik.')
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')

    loadTableByQrToken({ branchId, tableToken })
      .then(result => {
        if (cancelled) return
        if (!result) {
          setContext(null)
          setError('Bu masa QR kodu aktif degil veya yenilenmis.')
          return
        }
        setContext(result)
        const existingSession = readMobileQrSession({ branchId, tableToken })
        if (existingSession?.phone) {
          setCustomerPhone(existingSession.phone)
          setCustomerSummary(existingSession.customerId ? {
            customerId: existingSession.customerId,
            customerName: existingSession.customerName,
            customerPhone: existingSession.customerPhone || existingSession.phone,
            customerCategoryIds: existingSession.customerCategoryIds || [],
          } : null)
          setSelectedCampaignId(existingSession.selectedCampaignId || '')
          setSelectedCampaignName(existingSession.selectedCampaignName || '')
          setSelectedCouponCode(existingSession.selectedCouponCode || '')
          setSelectedCouponLabel(existingSession.selectedCouponLabel || '')
          setCouponInput(existingSession.selectedCouponCode || '')
        }
      })
      .catch(loadError => {
        if (!cancelled) setError(loadError?.message || 'Masa bilgisi okunamadi.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [branchId, tableToken])

  useEffect(() => {
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(''), 3200)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (!branchId || !context?.table?.id) return undefined
    let cancelled = false
    setLoyaltyLoading(true)
    setLoyaltyError('')

    loadCachedRuntimeLoyaltyCampaignCatalog({ branchId, branchName: '' })
      .then(snapshot => {
        if (cancelled) return
        setLoyaltyCampaigns(snapshot?.campaigns || [])
        setCouponSeries(snapshot?.couponSeries || [])
        setSaleTemplates(snapshot?.saleTemplates || [])
        const schemaIssueText = (snapshot?.issues || []).filter(Boolean).join(' | ')
        setLoyaltyError(snapshot?.stale || snapshot?.schemaReady === false ? schemaIssueText : '')
      })
      .catch(loadError => {
        if (!cancelled) {
          setLoyaltyCampaigns([])
          setCouponSeries([])
          setSaleTemplates([])
          setLoyaltyError(loadError?.message || 'Sadakat avantajlari yuklenemedi.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoyaltyLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [branchId, context?.table?.id])

  async function rememberCustomerPhone() {
    const digits = String(customerPhone || '').replace(/\D/g, '').slice(-10)
    if (!digits) {
      clearMobileQrSession({ branchId, tableToken })
      setCustomerSummary(null)
      return null
    }

    const results = await searchMobileCustomers(digits)
    const matched = results.find(item => String(item?.telefon || '').includes(digits)) || results[0] || null
    const customerCategoryIds = matched?.id
      ? await loadCustomerLoyaltyCategoryIds({ branchId, branchName: '' }, matched.id)
      : []
    const session = writeMobileQrSession({
      branchId,
      tableToken,
      phone: digits,
      customerId: matched?.id || '',
      customerName: matched?.ad_soyad || '',
      customerPhone: matched?.telefon || digits,
      customerCategoryIds,
      selectedCampaignId,
      selectedCampaignName,
      selectedCouponCode,
      selectedCouponLabel,
    })
    setCustomerSummary(matched ? {
      customerId: matched.id,
      customerName: matched.ad_soyad,
      customerPhone: matched.telefon || digits,
      customerCategoryIds,
    } : null)
    return session
  }

  async function handleSkipPhone() {
    clearMobileQrSession({ branchId, tableToken })
    setCustomerPhone('')
    setCustomerSummary(null)
    setSelectedCampaignId('')
    setSelectedCampaignName('')
    setSelectedCouponCode('')
    setSelectedCouponLabel('')
    setCouponInput('')
    setNotice('Telefon girmeden devam edebilirsiniz. Kampanya faydalari bu adimda baglanmayacak.')
    setNoticeTone('info')
  }

  async function handleSavePhone() {
    try {
      const session = await rememberCustomerPhone()
      if (session?.customerId) {
        setNotice('Kayitli musteri bulundu. Kampanya baglami siparis akisina tasinacak.')
      } else {
        setNotice('Telefon kaydedildi. Dilerseniz kampanya baglantisi sonraki adimlarda kullanilabilir.')
      }
      setNoticeTone('success')
    } catch (saveError) {
      setNotice(saveError?.message || 'Telefon bilgisi kaydedilemedi.')
      setNoticeTone('error')
    }
  }

  async function handleCreateRequest(requestType, successMessage) {
    if (!context?.table?.id) return
    setSubmitting(true)
    try {
      const session = await rememberCustomerPhone()
      await createTableServiceRequest({
        branchId,
        tableId: context.table.id,
        requestType,
        requestedPhone: session?.customerPhone || customerPhone,
        customerId: session?.customerId || '',
      })
      setNotice(successMessage)
      setNoticeTone('success')
      setActiveView('home')
    } catch (requestError) {
      setNotice(requestError?.message || 'Masa talebi gonderilemedi.')
      setNoticeTone('error')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSubmitFeedback() {
    if (!context?.table?.id) return
    setSubmitting(true)
    try {
      const session = await rememberCustomerPhone()
      const { error: insertError } = await db.from('table_feedback').insert({
        branch_id: branchId,
        table_id: context.table.id,
        rating: feedbackRating,
        comment: String(feedbackComment || '').trim() || null,
        customer_phone: session?.customerPhone || customerPhone || null,
        customer_id: session?.customerId || null,
        source: 'qr_menu',
      })
      if (insertError) throw insertError
      setFeedbackComment('')
      setFeedbackRating(5)
      setActiveView('home')
      setNotice('Degerlendirmeniz kaydedildi. Tesekkur ederiz.')
      setNoticeTone('success')
    } catch (feedbackError) {
      setNotice(feedbackError?.message || 'Degerlendirme kaydedilemedi.')
      setNoticeTone('error')
    } finally {
      setSubmitting(false)
    }
  }

  const loyaltyCustomer = useMemo(() => {
    if (!customerSummary?.customerId) return null
    return {
      ...customerSummary,
      customerCategoryIds: customerSummary.customerCategoryIds || [],
      selectedCampaignId,
      selectedCampaignName,
      selectedCouponCode,
      selectedCouponLabel,
    }
  }, [customerSummary, selectedCampaignId, selectedCampaignName, selectedCouponCode, selectedCouponLabel])
  const advantagePreview = useMemo(
    () => evaluateRuntimeOrderCampaigns(loyaltyCampaigns, {
      runtimeChannel: 'mobile',
      orderTotal: 0,
      customerContext: loyaltyCustomer
        ? {
            customerId: loyaltyCustomer.customerId,
            customerName: loyaltyCustomer.customerName,
            customerCategoryIds: loyaltyCustomer.customerCategoryIds || [],
            tierPointsMultiplier: loyaltyCustomer.tierPointsMultiplier || loyaltyCustomer.pointsMultiplier || loyaltyCustomer.points_multiplier || 1,
          }
        : {},
      selectedCampaignId,
      cartLines: [],
      saleTemplates,
    }),
    [loyaltyCampaigns, loyaltyCustomer, selectedCampaignId, saleTemplates],
  )
  const visibleAdvantageCampaigns = advantagePreview.visibleCampaigns.filter(campaign => campaign.audienceSupported !== false)
  const preparedAdvantage = resolvePreparedLoyaltyAdvantage(loyaltyCustomer, loyaltyCampaigns)
  const availableCoupons = useMemo(
    () => getMobileCouponEntries(couponSeries, loyaltyCustomer?.customerId || ''),
    [couponSeries, loyaltyCustomer?.customerId],
  )

  function persistAdvantageSelection({
    campaignId = selectedCampaignId,
    campaignName = selectedCampaignName,
    couponCode = selectedCouponCode,
    couponLabel = selectedCouponLabel,
  } = {}) {
    const nextSession = updateMobileQrAdvantage({
      branchId,
      tableToken,
      selectedCampaignId: campaignId,
      selectedCampaignName: campaignName,
      selectedCouponCode: couponCode,
      selectedCouponLabel: couponLabel,
    })
    return nextSession
  }

  function handleToggleCampaign(campaign) {
    const isSelected = selectedCampaignId === String(campaign?.id || '')
    const nextId = isSelected ? '' : String(campaign?.id || '')
    const nextName = isSelected ? '' : String(campaign?.name || '')
    setSelectedCampaignId(nextId)
    setSelectedCampaignName(nextName)
    persistAdvantageSelection({ campaignId: nextId, campaignName: nextName })
  }

  function handleSelectCoupon(coupon) {
    const nextCode = selectedCouponCode === coupon.code ? '' : coupon.code
    const nextLabel = nextCode ? coupon.label : ''
    setSelectedCouponCode(nextCode)
    setSelectedCouponLabel(nextLabel)
    setCouponInput(nextCode)
    persistAdvantageSelection({ couponCode: nextCode, couponLabel: nextLabel })
  }

  function handleApplyCouponInput() {
    const code = normalizeCouponCode(couponInput)
    const matchedCoupon = availableCoupons.find(coupon => coupon.code === code)
    const nextLabel = matchedCoupon?.label || code
    setSelectedCouponCode(code)
    setSelectedCouponLabel(nextLabel)
    persistAdvantageSelection({ couponCode: code, couponLabel: nextLabel })
  }

  const noticeColor = noticeTone === 'error' ? '#dc2626' : noticeTone === 'success' ? '#15803d' : '#0f766e'
  const isReady = !loading && !error && context?.table?.id

  return (
    <PhoneShellFrame accent="#f59e0b">
      <div style={{ height: '100%', display: 'grid', gridTemplateRows: 'auto 1fr' }}>
        <div style={{ padding: '18px 16px 12px', display: 'grid', gap: 12, background: 'linear-gradient(180deg, rgba(245,158,11,.12), rgba(255,255,255,.98))', borderBottom: '1px solid rgba(226,232,240,.8)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#0f172a', fontSize: '.82rem', fontWeight: 800 }}>
            <span>09:41</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#64748b' }}>
              <i className="fa-solid fa-signal" />
              <i className="fa-solid fa-wifi" />
              <i className="fa-solid fa-battery-three-quarters" />
            </div>
          </div>
          <div>
            <div style={{ fontSize: '.74rem', letterSpacing: '.08em', textTransform: 'uppercase', color: '#f59e0b', fontWeight: 900 }}>
              {context?.hall?.name || 'Salon'} / {context?.section?.name || 'Bolge'}
            </div>
            <div style={{ marginTop: 6, fontSize: '1.15rem', fontWeight: 900, color: '#0f172a' }}>
              {context?.table?.table_name || 'Masa Siparisi'}
            </div>
            <div style={{ marginTop: 4, fontSize: '.78rem', color: '#64748b' }}>
              Masa No: {context?.table?.table_number || '-'} / {context?.table?.capacity || '-'} kisilik
            </div>
          </div>
        </div>

        <div style={{ position: 'relative', minHeight: 0, background: '#fff' }}>
          {activeView === 'order' ? (
            <MobileOrderSurface
              mode="qr"
              branchId={branchId}
              branchName=""
              table={context?.table}
              customerPhone={customerPhone}
              customerId={customerSummary?.customerId || ''}
              customerName={customerSummary?.customerName || ''}
              linkedCustomer={loyaltyCustomer}
              selectedCampaignId={selectedCampaignId}
              selectedCouponCode={selectedCouponCode}
              loyaltyCampaigns={loyaltyCampaigns}
              saleTemplates={saleTemplates}
              couponContext={{ couponSeries }}
              onBack={() => setActiveView('home')}
              onDone={(result) => {
                setNotice(result?.loyaltyWarning
                  ? 'Siparisiniz alindi. Sadakat kaydi daha sonra kontrol edilecek.'
                  : 'Siparisiniz mutfaga ve garsona iletildi.')
                setNoticeTone('success')
                setActiveView('home')
              }}
            />
          ) : (
            <div style={{ height: '100%', overflowY: 'auto', padding: 16, display: 'grid', gap: 14, alignContent: 'start' }}>
              <div style={{ borderRadius: 22, border: '1px solid #e2e8f0', background: '#f8fafc', padding: 16, display: 'grid', gap: 10 }}>
                {loading ? (
                  <div style={{ color: '#64748b', fontWeight: 800 }}><i className="fa-solid fa-spinner fa-spin" /> Masa okunuyor...</div>
                ) : error ? (
                  <div style={{ color: '#dc2626', fontWeight: 800, lineHeight: 1.5 }}>{error}</div>
                ) : (
                  <>
                    <div style={{ color: '#475569', fontSize: '.82rem', lineHeight: 1.55 }}>
                      QR kod masanizi tanir. Siparis, cagri ve yorumlar bu masa baglaminda acilir.
                    </div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      <label style={{ fontSize: '.78rem', fontWeight: 900, color: '#0f172a' }}>
                        Kampanyalardan faydalanmak icin telefonunuzu girin
                      </label>
                      <input
                        value={customerPhone}
                        onChange={event => setCustomerPhone(event.target.value.replace(/\D/g, '').slice(0, 10))}
                        placeholder="5xx xxx xx xx"
                        style={{ minHeight: 46, borderRadius: 14, border: '1px solid #cbd5e1', padding: '0 14px', outline: 'none', fontWeight: 700 }}
                      />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <button
                          type="button"
                          onClick={handleSavePhone}
                          disabled={!isReady}
                          style={{ minHeight: 44, borderRadius: 14, border: 'none', background: '#0f172a', color: '#fff', fontWeight: 900, cursor: isReady ? 'pointer' : 'default' }}
                        >
                          Telefonu Kaydet
                        </button>
                        <button
                          type="button"
                          onClick={handleSkipPhone}
                          style={{ minHeight: 44, borderRadius: 14, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 900, cursor: 'pointer' }}
                        >
                          Simdilik Atla
                        </button>
                      </div>
                      {customerSummary ? (
                        <div style={{ borderRadius: 14, padding: '10px 12px', background: 'rgba(21,128,61,.08)', border: '1px solid rgba(21,128,61,.14)', color: '#166534', fontSize: '.76rem', lineHeight: 1.55 }}>
                          {customerSummary.customerName || 'Kayitli musteri'} baglandi. Siparis akisi sadakat baglamini kullanabilecek.
                        </div>
                      ) : null}
                      {customerSummary ? (
                        <div style={{ borderRadius: 18, padding: 12, background: 'linear-gradient(135deg, rgba(245,158,11,.13), rgba(255,255,255,.98))', border: '1px solid rgba(245,158,11,.22)', display: 'grid', gap: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
                            <div>
                              <div style={{ color: '#92400e', fontSize: '.72rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em' }}>Hazir Avantajin</div>
                              <div style={{ marginTop: 4, color: '#0f172a', fontWeight: 900, fontSize: '.86rem' }}>
                                {preparedAdvantage.hasPreparedAdvantage
                                  ? [preparedAdvantage.resolvedSelectedCampaignName, preparedAdvantage.resolvedSelectedCouponLabel].filter(Boolean).join(' + ')
                                  : 'Kampanya veya kupon sec'}
                              </div>
                            </div>
                            {loyaltyLoading ? <i className="fa-solid fa-spinner fa-spin" style={{ color: '#f59e0b' }} /> : null}
                          </div>
                          {loyaltyError ? (
                            <div style={{ color: '#b45309', fontSize: '.72rem', lineHeight: 1.45 }}>{loyaltyError}</div>
                          ) : null}
                          {visibleAdvantageCampaigns.length > 0 ? (
                            <div style={{ display: 'grid', gap: 7 }}>
                              {visibleAdvantageCampaigns.slice(0, 3).map(campaign => {
                                const selected = selectedCampaignId === String(campaign.id || '')
                                return (
                                  <button
                                    key={campaign.id}
                                    type="button"
                                    onClick={() => handleToggleCampaign(campaign)}
                                    style={{ minHeight: 42, borderRadius: 13, border: selected ? '1px solid rgba(245,158,11,.55)' : '1px solid #e2e8f0', background: selected ? 'rgba(245,158,11,.16)' : '#fff', color: '#0f172a', padding: '8px 10px', textAlign: 'left', fontWeight: 850, cursor: 'pointer' }}
                                  >
                                    <div style={{ fontSize: '.76rem' }}>{campaign.name || 'Kampanya'}</div>
                                    <div style={{ marginTop: 2, color: '#64748b', fontSize: '.68rem', fontWeight: 700 }}>{campaign.statusLabel || campaign.runtimeReason || 'Mobil siparis icin degerlendirilecek'}</div>
                                  </button>
                                )
                              })}
                            </div>
                          ) : (
                            <div style={{ color: '#64748b', fontSize: '.72rem', lineHeight: 1.45 }}>Bu musteri icin su anda secilebilir kampanya bulunamadi.</div>
                          )}
                          <div style={{ display: 'grid', gap: 8 }}>
                            {availableCoupons.slice(0, 2).map(coupon => (
                              <button
                                key={coupon.code}
                                type="button"
                                onClick={() => handleSelectCoupon(coupon)}
                                style={{ minHeight: 38, borderRadius: 12, border: selectedCouponCode === coupon.code ? '1px solid rgba(15,23,42,.45)' : '1px solid #e2e8f0', background: selectedCouponCode === coupon.code ? 'rgba(15,23,42,.06)' : '#fff', color: '#0f172a', fontWeight: 850, cursor: 'pointer' }}
                              >
                                {selectedCouponCode === coupon.code ? 'Secili kupon: ' : 'Kupon: '}{coupon.code}
                              </button>
                            ))}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                              <input
                                value={couponInput}
                                onChange={event => setCouponInput(normalizeCouponCode(event.target.value))}
                                placeholder="Kupon kodu"
                                style={{ minHeight: 38, borderRadius: 12, border: '1px solid #cbd5e1', padding: '0 10px', fontWeight: 800, outline: 'none' }}
                              />
                              <button type="button" onClick={handleApplyCouponInput} style={{ minHeight: 38, borderRadius: 12, border: 'none', background: '#f59e0b', color: '#111827', fontWeight: 900, padding: '0 12px', cursor: 'pointer' }}>
                                Uygula
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </>
                )}
              </div>

              {notice ? (
                <div style={{ borderRadius: 16, padding: '12px 14px', background: `${noticeColor}14`, border: `1px solid ${noticeColor}22`, color: noticeColor, fontWeight: 800, fontSize: '.78rem', lineHeight: 1.55 }}>
                  {notice}
                </div>
              ) : null}

              {activeView === 'home' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <QrPrimaryButton icon="fa-utensils" title="Siparis Ver" subtitle="Telefona ozel menu ve sepet deneyimi" onClick={() => setActiveView('order')} disabled={!isReady} />
                  <QrPrimaryButton icon="fa-bell-concierge" title="Garson Cagir" subtitle="Acik Garson ekranlarina anlik masa talebi gonder" tone="#ef4444" onClick={() => handleCreateRequest(TABLE_REQUEST_TYPES.call_waiter, 'Garsona cagri gonderildi. Masa karti alarm moduna alindi.')} disabled={!isReady || submitting} />
                  <QrPrimaryButton icon="fa-receipt" title="Hesap Iste / Ode" subtitle="Garson hesap getirsin veya online odeme ilgisini belirt" tone="#38bdf8" onClick={() => setActiveView('bill')} disabled={!isReady} />
                  <QrPrimaryButton icon="fa-star" title="Degerlendirme / Yorum" subtitle="5 yildiz ve yorum birakin" tone="#fb7185" onClick={() => setActiveView('feedback')} disabled={!isReady} />
                </div>
              ) : null}

              {activeView === 'bill' ? (
                <div style={{ display: 'grid', gap: 12 }}>
                  <button
                    type="button"
                    onClick={() => setActiveView('home')}
                    style={{ width: 'fit-content', minHeight: 36, padding: '0 10px', borderRadius: 999, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 800, cursor: 'pointer' }}
                  >
                    <i className="fa-solid fa-arrow-left" style={{ marginRight: 6 }} />
                    Geri
                  </button>
                  <div style={{ borderRadius: 22, border: '1px solid #e2e8f0', background: '#f8fafc', padding: 14, display: 'grid', gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => handleCreateRequest(TABLE_REQUEST_TYPES.bill_request, 'Hesap istegi Garson ekranlarina gonderildi.')}
                      disabled={!isReady || submitting}
                      style={{ minHeight: 66, borderRadius: 18, border: 'none', background: 'linear-gradient(135deg, rgba(56,189,248,.16), rgba(255,255,255,.98))', color: '#0f172a', fontWeight: 900, cursor: isReady ? 'pointer' : 'default' }}
                    >
                      Garson hesabi getirsin
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCreateRequest(TABLE_REQUEST_TYPES.online_payment_interest, 'Online kart odeme isteginiz not edildi. Odeme akisi yakinda eklenecek.')}
                      disabled={!isReady || submitting}
                      style={{ minHeight: 66, borderRadius: 18, border: '1px dashed rgba(245,158,11,.5)', background: 'rgba(245,158,11,.08)', color: '#92400e', fontWeight: 900, cursor: isReady ? 'pointer' : 'default' }}
                    >
                      Ben online kredi kartimla odeyecegim
                      <div style={{ marginTop: 6, fontSize: '.72rem', fontWeight: 700, color: '#b45309' }}>
                        Bu fazda sadece yer tutucu kayit olusur.
                      </div>
                    </button>
                  </div>
                </div>
              ) : null}

              {activeView === 'feedback' ? (
                <div style={{ display: 'grid', gap: 12 }}>
                  <button
                    type="button"
                    onClick={() => setActiveView('home')}
                    style={{ width: 'fit-content', minHeight: 36, padding: '0 10px', borderRadius: 999, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 800, cursor: 'pointer' }}
                  >
                    <i className="fa-solid fa-arrow-left" style={{ marginRight: 6 }} />
                    Geri
                  </button>
                  <div style={{ borderRadius: 22, border: '1px solid #e2e8f0', background: '#f8fafc', padding: 16, display: 'grid', gap: 14 }}>
                    <div style={{ color: '#0f172a', fontWeight: 900, textAlign: 'center' }}>Deneyiminizi puanlayin</div>
                    <RatingStars rating={feedbackRating} onChange={setFeedbackRating} />
                    <textarea
                      value={feedbackComment}
                      onChange={event => setFeedbackComment(event.target.value)}
                      placeholder="Yorumunuz (opsiyonel)"
                      style={{ minHeight: 120, borderRadius: 18, border: '1px solid #cbd5e1', padding: 14, resize: 'none', outline: 'none', fontFamily: 'inherit' }}
                    />
                    <button
                      type="button"
                      onClick={handleSubmitFeedback}
                      disabled={submitting || !isReady}
                      style={{ minHeight: 48, borderRadius: 16, border: 'none', background: '#0f172a', color: '#fff', fontWeight: 900, cursor: isReady ? 'pointer' : 'default' }}
                    >
                      Degerlendirmeyi Gonder
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </PhoneShellFrame>
  )
}

function CustomerAppConfigPanel() {
  const [config, setConfig] = useState(null)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('branding')
  const [uploading, setUploading] = useState('')

  const apiBase = import.meta.env.VITE_API_URL || ''

  async function uploadFile(file, fieldKey) {
    setUploading(fieldKey)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await fetch(`${apiBase}/api/upload`, { method: 'POST', body: formData })
      const result = await response.json()
      if (result.error) throw new Error(result.error.message || 'Yükleme başarısız')
      const fileUrl = `${apiBase}${result.data.file_url}`
      handleBrandingChange(fieldKey, fileUrl)
    } catch (err) {
      setError(err.message || 'Dosya yüklenirken hata oluştu')
    } finally {
      setUploading('')
    }
  }

  useEffect(() => {
    let active = true
    loadCustomerAppConfig().then(c => { if (active) setConfig(c) })
    return () => { active = false }
  }, [])

  if (!config) return null

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess(false)
    try {
      await saveCustomerAppConfig(config)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
      window.location.reload() // Reload to reflect changes in the phone preview
    } catch (err) {
      setError(err.message || 'Konfigürasyon kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  const handleBrandingChange = (key, value) => {
    setConfig(prev => ({ ...prev, branding: { ...prev.branding, [key]: value } }))
  }

  const handleButtonChange = (btnId, field, value) => {
    setConfig(prev => ({
      ...prev,
      homeButtons: prev.homeButtons.map(btn => 
        btn.id === btnId ? { ...btn, [field]: value } : btn
      )
    }))
  }

  const handleButtonConfigChange = (btnId, key, value) => {
    setConfig(prev => ({
      ...prev,
      homeButtons: prev.homeButtons.map(btn => 
        btn.id === btnId ? { ...btn, config: { ...btn.config, [key]: value } } : btn
      )
    }))
  }

  const inputStyle = { width: '100%', minHeight: 38, padding: '0 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontSize: '.88rem' }
  const labelStyle = { display: 'block', marginBottom: 4, fontSize: '.78rem', fontWeight: 800, color: '#475569' }

  return (
    <div className="card" style={{ padding: 24, display: 'grid', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#0f172a' }}>Müşteri Mobil Uygulama Ayarları</div>
          <div style={{ marginTop: 4, color: '#64748b', fontSize: '.9rem' }}>Standalone mobil uygulama görünümünü ve buton işlevlerini yapılandırın.</div>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{ minWidth: 120, minHeight: 40, borderRadius: 12, border: 'none', background: '#f5a623', color: '#fff', fontWeight: 900, cursor: saving ? 'wait' : 'pointer' }}
        >
          {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
        </button>
      </div>

      {success && <div style={{ padding: '10px 14px', background: '#ecfdf5', color: '#065f46', borderRadius: 10, fontWeight: 800 }}>Başarıyla kaydedildi ve güncellendi.</div>}
      {error && <div style={{ padding: '10px 14px', background: '#fef2f2', color: '#991b1b', borderRadius: 10, fontWeight: 800 }}>Hata: {error}</div>}

      <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid #e2e8f0', paddingBottom: 12 }}>
        <button type="button" onClick={() => setActiveTab('branding')} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: activeTab === 'branding' ? '#0f172a' : 'transparent', color: activeTab === 'branding' ? '#fff' : '#64748b', fontWeight: 800, cursor: 'pointer' }}>Marka & Görünüm</button>
        <button type="button" onClick={() => setActiveTab('buttons')} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: activeTab === 'buttons' ? '#0f172a' : 'transparent', color: activeTab === 'buttons' ? '#fff' : '#64748b', fontWeight: 800, cursor: 'pointer' }}>Ana Sayfa Butonları</button>
      </div>

      {activeTab === 'branding' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <label style={labelStyle}>Şirket/Uygulama Adı</label>
            <input style={inputStyle} value={config.branding.companyName || ''} onChange={e => handleBrandingChange('companyName', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Hoş Geldiniz Metni</label>
            <input style={inputStyle} value={config.branding.welcomeText || ''} onChange={e => handleBrandingChange('welcomeText', e.target.value)} />
          </div>

          {/* Logo Yükleme */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Logo Görseli</label>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              {config.branding.logoUrl ? (
                <div style={{ position: 'relative', borderRadius: 12, border: '1px solid #e2e8f0', padding: 8, background: '#f8fafc' }}>
                  <img src={config.branding.logoUrl} alt="Logo" style={{ maxHeight: 72, maxWidth: 180, objectFit: 'contain', display: 'block' }} />
                  <button
                    type="button"
                    onClick={() => handleBrandingChange('logoUrl', '')}
                    style={{ position: 'absolute', top: -8, right: -8, width: 24, height: 24, borderRadius: 999, border: '1px solid #fca5a5', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: '.7rem', fontWeight: 900 }}
                  >✕</button>
                </div>
              ) : null}
              <label style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '10px 18px', borderRadius: 10,
                border: '1px dashed #94a3b8', background: '#f8fafc',
                color: '#475569', fontWeight: 800, fontSize: '.82rem',
                cursor: 'pointer',
              }}>
                <i className="fa-solid fa-cloud-arrow-up" />
                {config.branding.logoUrl ? 'Değiştir' : 'Logo Yükle'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  style={{ display: 'none' }}
                  disabled={!!uploading}
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    if (file.size > 10 * 1024 * 1024) { setError('Logo dosyası 10MB\'dan küçük olmalı.'); return }
                    uploadFile(file, 'logoUrl')
                    e.target.value = ''
                  }}
                />
              </label>
              {uploading === 'logoUrl' && <span style={{ fontSize: '.78rem', color: '#f5a623', fontWeight: 800, alignSelf: 'center' }}><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }} />Yükleniyor...</span>}
              <span style={{ fontSize: '.72rem', color: '#94a3b8', alignSelf: 'center' }}>PNG, JPG, SVG, WebP — Railway volume'a yüklenir</span>
            </div>
          </div>

          {/* Arka Plan Görseli Yükleme */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Arka Plan Görseli</label>
            <div style={{ display: 'grid', gap: 10 }}>
              {config.branding.backgroundImageUrl ? (
                <div style={{ position: 'relative', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', maxWidth: 420 }}>
                  <img src={config.branding.backgroundImageUrl} alt="Arka plan" style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} />
                  <button
                    type="button"
                    onClick={() => handleBrandingChange('backgroundImageUrl', '')}
                    style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,.5)', color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: '.72rem', fontWeight: 900 }}
                  >✕</button>
                </div>
              ) : null}
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <label style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '10px 18px', borderRadius: 10,
                  border: '1px dashed #94a3b8', background: '#f8fafc',
                  color: '#475569', fontWeight: 800, fontSize: '.82rem',
                  cursor: 'pointer',
                }}>
                  <i className="fa-solid fa-image" />
                  {config.branding.backgroundImageUrl ? 'Değiştir' : 'Arka Plan Yükle'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    style={{ display: 'none' }}
                    disabled={!!uploading}
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      if (file.size > 10 * 1024 * 1024) { setError('Arka plan görseli 10MB\'dan küçük olmalı.'); return }
                      uploadFile(file, 'backgroundImageUrl')
                      e.target.value = ''
                    }}
                  />
                </label>
                {uploading === 'backgroundImageUrl' && <span style={{ fontSize: '.78rem', color: '#f5a623', fontWeight: 800 }}><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }} />Yükleniyor...</span>}
                <span style={{ fontSize: '.72rem', color: '#94a3b8' }}>PNG, JPG, WebP — Railway volume'a yüklenir</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'buttons' && (
        <div style={{ display: 'grid', gap: 16 }}>
          {config.homeButtons.map((btn, i) => (
            <div key={btn.id} style={{ padding: 16, border: '1px solid #e2e8f0', borderRadius: 12, display: 'grid', gap: 14 }}>
              <div style={{ fontWeight: 900, color: '#334155' }}>Buton {i + 1}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Etiket</label>
                  <input style={inputStyle} value={btn.label} onChange={e => handleButtonChange(btn.id, 'label', e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>İkon (FontAwesome)</label>
                  <input style={inputStyle} value={btn.icon} onChange={e => handleButtonChange(btn.id, 'icon', e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Aksiyon Tipi</label>
                  <select style={inputStyle} value={btn.type} onChange={e => handleButtonChange(btn.id, 'type', e.target.value)}>
                    <option value="order">Sipariş Ver Modalı</option>
                    <option value="phone">Telefon Et</option>
                    <option value="weblink">Web Sitesi Aç</option>
                    <option value="app_page">Uygulama İçi Sayfa</option>
                  </select>
                </div>
              </div>

              {btn.type === 'phone' && (
                <div>
                  <label style={labelStyle}>Telefon Numarası</label>
                  <input style={inputStyle} value={btn.config.phoneNumber || ''} onChange={e => handleButtonConfigChange(btn.id, 'phoneNumber', e.target.value)} placeholder="+905551234567" />
                </div>
              )}
              {btn.type === 'weblink' && (
                <div>
                  <label style={labelStyle}>Yönlendirilecek URL</label>
                  <input style={inputStyle} value={btn.config.url || ''} onChange={e => handleButtonConfigChange(btn.id, 'url', e.target.value)} placeholder="https://..." />
                </div>
              )}
              {btn.type === 'app_page' && (
                <div>
                  <label style={labelStyle}>Açılacak Sekme</label>
                  <select style={inputStyle} value={btn.config.pageKey || ''} onChange={e => handleButtonConfigChange(btn.id, 'pageKey', e.target.value)}>
                    <option value="campaigns">Kampanyalar</option>
                    <option value="coupons">Kuponlar</option>
                    <option value="card">Sadakat Kartım</option>
                    <option value="account">Hesabım</option>
                  </select>
                </div>
              )}
              {btn.type === 'order' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Adrese Teslim URL (Boşsa gizlenir)</label>
                    <input style={inputStyle} value={btn.config.deliveryUrl || ''} onChange={e => handleButtonConfigChange(btn.id, 'deliveryUrl', e.target.value)} placeholder="Getir/Yemeksepeti vb." />
                  </div>
                  <div>
                    <label style={labelStyle}>Masadan Sipariş QR İzni</label>
                    <select style={inputStyle} value={btn.config.enableTableOrder !== false ? 'yes' : 'no'} onChange={e => handleButtonConfigChange(btn.id, 'enableTableOrder', e.target.value === 'yes')}>
                      <option value="yes">Aktif</option>
                      <option value="no">Kapalı</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function MobileAppShells({ screenKey = 'personnel' }) {
  const screen = SCREEN_MAP[screenKey] || SCREEN_MAP.personnel
  const isCustomerScreen = screenKey === 'customer'
  const isQrMenuScreen = screenKey === 'qrMenu'
  const isPersonnelScreen = screenKey === 'personnel'

  return (
    <>
      <Header title={screen.pageTitle} subtitle={screen.pageSubtitle} />

      <div style={{ display: 'grid', gap: 20 }}>
        {isCustomerScreen ? (
          <div
            className="card"
            style={{
              padding: 18,
              borderColor: `${screen.accent}33`,
              background: `linear-gradient(135deg, ${screen.accent}10, rgba(255,255,255,.98))`,
            }}
          >
            <div style={{ fontSize: '.75rem', fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase', color: screen.accent }}>
              Mobil App Musteri
            </div>
            <div style={{ marginTop: 8, fontSize: '.96rem', color: '#475569', lineHeight: 1.7 }}>
              Bu ekran bos shell degil; musteri sadakat deneyimini cuzdan, kupon, kampanya ve capraz kanal kullanim mantigi ile simule eder.
            </div>
          </div>
        ) : (
          <div
            className="card"
            style={{
              padding: 18,
              borderColor: `${screen.accent}33`,
              background: `linear-gradient(135deg, ${screen.accent}10, rgba(255,255,255,.98))`,
            }}
          >
            <div style={{ fontSize: '.75rem', fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase', color: screen.accent }}>
              Mobil App
            </div>
            <div style={{ marginTop: 8, fontSize: '.96rem', color: '#475569', lineHeight: 1.7 }}>
              {isPersonnelScreen
                ? 'Telefon icinde drawer tabanli personel shell kuruldu; Garson sekmesi mevcut Garson runtimeina uzaktan erisim saglar.'
                : isQrMenuScreen
                  ? 'QR menusu artik masa tanima, telefon onerisi ve 4 aksiyonlu giris ekrani ile calisir.'
                  : 'Bu yuzey simdilik rol bazli bos telefon ekrani olarak korunuyor.'}
            </div>
          </div>
        )}

        {isCustomerScreen && <CustomerAppConfigPanel />}

        {isCustomerScreen
          ? <CustomerLoyaltyMobileApp />
          : isQrMenuScreen
            ? <QrMenuPhone />
            : isPersonnelScreen
              ? <PersonnelPhone />
              : <EmptyPhoneScreen screen={screen} />}
      </div>
    </>
  )
}
