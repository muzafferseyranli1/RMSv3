import { useCallback, useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import { db } from '@/lib/db'
import { useToast } from '@/hooks/useToast'
import {
  attachLoyaltyToSaleHeader,
  attachLoyaltyToSaleLines,
  buildProportionalDiscountMap,
  createSaleLoyaltySnapshot,
} from '@/lib/checkoutLoyalty'
import {
  evaluateRuntimeOrderCampaignsAsync,
  evaluateRuntimeOrderCampaigns,
  getRuntimeChannelLabel,
  loadCachedRuntimeLoyaltyCampaignCatalog,
} from '@/lib/posLoyalty'
import { loadLoyaltyCustomerCategoryAssignments } from '@/lib/loyalty'
import { postSaleLoyaltyValueLedger } from '@/lib/loyaltyValueLedger'
import {
  buildCallCenterOrderNote,
  formatCallCenterDateTime,
  getCallCenterAddressSummary,
  getCallCenterFulfillmentLabel,
  getCallCenterFulfillmentType,
  getCallCenterKdsReleaseAt,
  getCallCenterStatusMeta,
  isMissingCallCenterScheduleColumn,
  normalizeLegacyCallCenterOrder,
  normalizeLegacyCallCenterOrders,
  toDateTimeLocalValue,
} from '@/lib/callCenterOrders'
import { OPEN_TABLE_TICKETS_SETTING_KEY } from '@/lib/posTablePersistence'
import { resolveTableRecord } from '@/lib/tableLayoutDirectory'
import {
  getOrderHubFlowLabel,
  getOrderHubSourceMeta,
  getOrderHubStatusMeta,
  getOrderHubSummary,
  getOrderHubTimingLabel,
  normalizeOrderHubOpenTicket,
  normalizeOrderHubSale,
} from '@/lib/orderHub'

const STEPS = [
  { key: 'customer', label: 'Müşteri', icon: 'fa-user' },
  { key: 'fulfillment', label: 'Adres / Alış', icon: 'fa-location-dot' },
  { key: 'order', label: 'Sipariş', icon: 'fa-cart-shopping' },
  { key: 'payment', label: 'Ödeme', icon: 'fa-credit-card' },
]

const PAYMENT_METHODS = [
  { method: 'nakit', label: 'Nakit', icon: 'fa-money-bill-wave' },
  { method: 'kart', label: 'Banka Kartı', icon: 'fa-credit-card' },
  { method: 'yemek_ceki', label: 'Yemek Çeki', icon: 'fa-ticket' },
  { method: 'online', label: 'Online Ödeme', icon: 'fa-globe' },
]

const EMPTY_CUSTOMER_FORM = {
  phone: '+90 ',
  firstName: '',
  lastName: '',
  note: '',
}

const EMPTY_ADDRESS_FORM = {
  label: '',
  cityId: '',
  cityName: '',
  districtId: '',
  districtName: '',
  neighborhoodId: '',
  neighborhoodName: '',
  street: '',
  buildingName: '',
  buildingNo: '',
  floorNo: '',
  doorNo: '',
  directions: '',
}

function uid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID()
  return `cc-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function safeNumber(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function money(value) {
  return safeNumber(value).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function isMissingColumnError(error, columnName) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes(String(columnName || '').toLowerCase())
}

function nowInputValue() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '')
}

function normalizeText(value) {
  return String(value || '').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim()
}

function toDbUuid(value) {
  const text = String(value || '').trim()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null
}

function parseJson(value, fallback = []) {
  if (Array.isArray(value) || (value && typeof value === 'object')) return value
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function addressLabel(address) {
  return [
    address?.neighborhood_name,
    address?.street,
    address?.building_no,
    address?.floor_no ? `${address.floor_no}. kat` : '',
    address?.door_no ? `Daire ${address.door_no}` : '',
  ].filter(Boolean).join(', ')
}


const BRANCH_SOURCE_LABELS = {
  saved: 'Bu adrese kayıtlı',
  history: 'Geçmiş siparişten önerildi',
  coverage: 'Kapsama alanından önerildi',
  physical_address: 'Şube adresinden önerildi',
  manual_temporary: 'Bu sipariş için seçildi',
  fallback: 'Varsayılan şube',
}

function readAddressMetadata(address) {
  return address?.metadata && typeof address.metadata === 'object' && !Array.isArray(address.metadata)
    ? address.metadata
    : {}
}

function readServiceBranchMeta(address) {
  const metadata = readAddressMetadata(address)
  return {
    branchId: String(metadata.serviceBranchId || '').trim(),
    branchName: String(metadata.serviceBranchName || '').trim(),
    source: String(metadata.serviceBranchSource || '').trim(),
    updatedAt: String(metadata.serviceBranchUpdatedAt || '').trim(),
  }
}

function buildAddressMetadata(address, extra = {}) {
  return {
    ...readAddressMetadata(address),
    ...extra,
  }
}

function toBranchKey(branchId, branchName) {
  const id = String(branchId || '').trim()
  if (id) return `id:${id}`
  const name = normalizeText(branchName)
  return name ? `name:${name}` : ''
}

function resolveBranchByIdentity(branches, branchId, branchName) {
  const idText = String(branchId || '').trim()
  if (idText) {
    const byId = branches.find(branch => String(branch.id) === idText)
    if (byId) return byId
  }
  const nameText = normalizeText(branchName)
  if (!nameText) return null
  return branches.find(branch => normalizeText(branch.name) === nameText) || null
}

function buildRoutingAddressCandidate(address, form) {
  if (address?.id) {
    return {
      id: address.id,
      cityId: String(address.city_id || ''),
      cityName: address.city_name || '',
      districtId: String(address.district_id || ''),
      districtName: address.district_name || '',
      neighborhoodId: String(address.neighborhood_id || ''),
      neighborhoodName: address.neighborhood_name || '',
    }
  }
  if (!form?.cityId && !form?.districtId && !form?.neighborhoodId) return null
  return {
    id: '',
    cityId: String(form.cityId || ''),
    cityName: form.cityName || '',
    districtId: String(form.districtId || ''),
    districtName: form.districtName || '',
    neighborhoodId: String(form.neighborhoodId || ''),
    neighborhoodName: form.neighborhoodName || '',
  }
}

function computeAuthorityMatchScore(row, candidate) {
  if (!candidate?.cityId || String(row.city_id || '') !== String(candidate.cityId || '')) return 0
  let score = 1
  if (candidate.districtId && String(row.district_id || '') === String(candidate.districtId)) score += 1
  if (candidate.neighborhoodId && String(row.neighborhood_id || '') === String(candidate.neighborhoodId)) score += 1
  return score
}

function buildDeliveryAddressSnapshot(address) {
  if (!address) return null
  return {
    id: address.id || null,
    label: address.label || null,
    city_id: address.city_id || null,
    city_name: address.city_name || null,
    district_id: address.district_id || null,
    district_name: address.district_name || null,
    neighborhood_id: address.neighborhood_id || null,
    neighborhood_name: address.neighborhood_name || null,
    street: address.street || null,
    building_no: address.building_no || null,
    floor_no: address.floor_no || null,
    door_no: address.door_no || null,
    directions: address.directions || null,
    line_1: address.line_1 || addressLabel(address) || null,
  }
}

function customerDisplayName(customer, form) {
  if (customer?.ad_soyad) return customer.ad_soyad
  return [form.firstName, form.lastName].filter(Boolean).join(' ').trim()
}

function getProductPrice(product, channelId) {
  const channelPrices = parseJson(product.channel_prices, [])
  const channelPrice = channelPrices.find(row => String(row?.channel_id || '') === String(channelId || '') && row?.active !== false)
  return safeNumber(channelPrice?.price  -  channelPrice?.sale_price  -  product.standard_price  -  product.price)
}

function getProductCategoryId(product) {
  return product.sale_cat_l5 || product.sale_cat_l4 || product.sale_cat_l3 || product.sale_cat_l2 || product.sale_cat_l1 || product.cat_l5 || product.cat_l4 || product.cat_l3 || product.cat_l2 || product.cat_l1 || null
}

function buildLineRows({ saleId, cart, channel, branch, saleDate, discountMap = new Map() }) {
  return cart.map((item, index) => {
    const lineTotal = safeNumber(item.qty) * safeNumber(item.unitPrice)
    const discountRow = discountMap.get(String(item.id)) || null
    return {
      sale_id: saleId,
      line_no: index + 1,
      product_id: toDbUuid(item.product.id),
      product_name: item.product.name || item.product.short_name || 'Ürün',
      product_sku: item.product.sku || null,
      top_category_id: toDbUuid(getProductCategoryId(item.product)),
      top_category_name: item.categoryName || null,
      sub_category_id: toDbUuid(getProductCategoryId(item.product)),
      sub_category_name: item.categoryName || null,
      portion_id: null,
      portion_name: null,
      options_json: [],
      options_summary: null,
      line_note: item.note || null,
      qty: safeNumber(item.qty, 1),
      unit_gross_before_discount: safeNumber(item.unitPrice),
      line_gross_before_discount: lineTotal,
      discount_allocated_amount: safeNumber(discountRow?.lineDiscountAmount),
      unit_gross_after_discount: safeNumber(discountRow?.unitPriceAfterDiscount, safeNumber(item.unitPrice)),
      line_gross_after_discount: safeNumber(discountRow?.lineTotalAfterDiscount, lineTotal),
      tax_id: null,
      tax_name: null,
      tax_rate: 0,
      line_net_after_discount: safeNumber(discountRow?.lineTotalAfterDiscount, lineTotal),
      unit_cost_snapshot: 0,
      line_cost_total: 0,
      sales_channel_id: toDbUuid(channel?.id),
      sales_channel_name: channel?.name || 'Çağrı Merkezi',
      branch_id: toDbUuid(branch?.id),
      branch_name: branch?.name || null,
      sale_datetime: saleDate,
    }
  })
}

function SidebarCard({ title, value, icon }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, color: '#475569', fontSize: '.78rem', lineHeight: 1.35 }}>
      <i className={`fa-solid ${icon}`} style={{ width: 16, color: '#64748b', marginTop: 2 }} />
      <div>
        <div style={{ fontWeight: 800, color: '#0f172a' }}>{title}</div>
        <div>{value || '-'}</div>
      </div>
    </div>
  )
}

function getCampaignToneStyles(tone = 'muted') {
  if (tone === 'success') {
    return {
      borderColor: '#86efac',
      background: '#f0fdf4',
      badgeBackground: '#dcfce7',
      badgeColor: '#166534',
    }
  }
  if (tone === 'warning') {
    return {
      borderColor: '#fde68a',
      background: '#fffbeb',
      badgeBackground: '#fef3c7',
      badgeColor: '#92400e',
    }
  }
  return {
    borderColor: '#e2e8f0',
    background: '#fff',
    badgeBackground: '#f1f5f9',
    badgeColor: '#475569',
  }
}

function CallCenterLoyaltyCampaignCard({
  campaign,
  runtimeChannelLabel,
  isSelected = false,
  onToggleManualTrigger,
  onToggleSelection,
}) {
  const tone = getCampaignToneStyles(campaign.statusTone)
  const canApply = Boolean(campaign.orderEligible && campaign.offer)

  return (
    <div style={{ border: `1px solid ${tone.borderColor}`, borderRadius: 10, padding: 14, background: tone.background, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 900, color: '#0f172a' }}>{campaign.name}</div>
          <div style={{ color: '#64748b', marginTop: 4, fontSize: '.84rem' }}>
            {campaign.offer?.offerLabel || campaign.description || `${campaign.reward_type} · ${campaign.reward_value || 0}`}
          </div>
        </div>
        <span style={{ alignSelf: 'flex-start', padding: '6px 10px', borderRadius: 999, background: tone.badgeBackground, color: tone.badgeColor, fontSize: '.72rem', fontWeight: 900 }}>
          {campaign.statusLabel}
        </span>
      </div>
      <div style={{ display: 'grid', gap: 4, color: '#475569', fontSize: '.78rem' }}>
        <div><strong>Kanal:</strong> {campaign.channelLabel || runtimeChannelLabel}</div>
        <div><strong>Kitle:</strong> {campaign.audienceLabel}</div>
        <div><strong>Kosul:</strong> {campaign.requirementLabel}</div>
        <div><strong>Not:</strong> {campaign.runtimeReason || 'Genel kampanya kurallari'}</div>
        {campaign.offer?.applicationModeLabel && <div><strong>Uygulama:</strong> {campaign.offer.applicationModeLabel}</div>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {campaign.manualTriggerRequired && (
          <button
            type="button"
            onClick={onToggleManualTrigger}
            style={{ border: `1px solid ${campaign.manualTriggerArmed ? '#16a34a' : '#cbd5e1'}`, background: campaign.manualTriggerArmed ? '#dcfce7' : '#fff', color: campaign.manualTriggerArmed ? '#166534' : '#334155', borderRadius: 8, padding: '8px 12px', fontWeight: 800, cursor: 'pointer' }}
          >
            {campaign.manualTriggerArmed ? 'Manuel tetikleme hazir' : 'Manuel tetikle'}
          </button>
        )}
        {canApply && (
          <button
            type="button"
            onClick={onToggleSelection}
            style={{ border: `1px solid ${isSelected ? '#0284c7' : '#bae6fd'}`, background: isSelected ? '#0ea5e9' : '#e0f2fe', color: isSelected ? '#fff' : '#0369a1', borderRadius: 8, padding: '8px 12px', fontWeight: 900, cursor: 'pointer' }}
          >
            {isSelected ? 'Secimi kaldir' : 'Hazir avantaj olarak uygula'}
          </button>
        )}
      </div>
    </div>
  )
}

export default function OrderHub() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [isComposerOpen, setIsComposerOpen] = useState(false)
  const [step, setStep] = useState('customer')
  const [orderTab, setOrderTab] = useState('menu')
  const [fulfillmentType, setFulfillmentType] = useState('delivery')
  const [customerForm, setCustomerForm] = useState(EMPTY_CUSTOMER_FORM)
  const [customerSearch, setCustomerSearch] = useState('')
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false)
  const [customers, setCustomers] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [customerAddresses, setCustomerAddresses] = useState([])
  const [selectedAddressId, setSelectedAddressId] = useState('')
  const [addressEditorMode, setAddressEditorMode] = useState('none')
  const [addressForm, setAddressForm] = useState(EMPTY_ADDRESS_FORM)
  const [pickupAt, setPickupAt] = useState(nowInputValue())
  const [deliveryAt, setDeliveryAt] = useState(nowInputValue())
  const [branchSearch, setBranchSearch] = useState('')
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [selectedChannelId, setSelectedChannelId] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState('all')
  const [cart, setCart] = useState([])
  const [paymentMethod, setPaymentMethod] = useState('nakit')
  const [sadakatUseMode, setSadakatUseMode] = useState('all')
  const [sadakatUseAmountTl, setSadakatUseAmountTl] = useState('')

  const [orders, setOrders] = useState([])
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [selectedOrderLines, setSelectedOrderLines] = useState([])
  const [orderDetailLoading, setOrderDetailLoading] = useState(false)
  const [orderActionBusy, setOrderActionBusy] = useState(false)
  const [orderEditMode, setOrderEditMode] = useState(false)
  const [orderEditForm, setOrderEditForm] = useState({ fulfillmentType: 'delivery', promisedAt: '', lines: [] })
  const [drafts, setDrafts] = useState([])
  const [branches, setBranches] = useState([])
  const [branchAddresses, setBranchAddresses] = useState([])
  const [branchCoverageRows, setBranchCoverageRows] = useState([])
  const [channels, setChannels] = useState([])
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [saleTemplates, setSaleTemplates] = useState([])
  const [campaignCatalogIssues, setCampaignCatalogIssues] = useState([])
  const [customerCategoryIds, setCustomerCategoryIds] = useState([])
  const [manualTriggeredCampaignIds, setManualTriggeredCampaignIds] = useState([])
  const [selectedLoyaltyCampaignId, setSelectedLoyaltyCampaignId] = useState('')
  const [history, setHistory] = useState([])
  const [cities, setCities] = useState([])
  const [districts, setDistricts] = useState([])
  const [neighborhoods, setNeighborhoods] = useState([])
  const [streets, setStreets] = useState([])
  const [selectedBranchSource, setSelectedBranchSource] = useState('fallback')
  const [hasManualBranchSelection, setHasManualBranchSelection] = useState(false)
  const [pendingBranchOverride, setPendingBranchOverride] = useState(null)
  const [hubSearch, setHubSearch] = useState('')
  const [hubBranchFilter, setHubBranchFilter] = useState('all')
  const [hubStatusFilter, setHubStatusFilter] = useState('all')
  const [hubSourceFilter, setHubSourceFilter] = useState('all')
  const [hubFulfillmentFilter, setHubFulfillmentFilter] = useState('all')
  const [rawStatusFilter, setRawStatusFilter] = useState('all')
  const [rawKdsStatusFilter, setRawKdsStatusFilter] = useState('all')
  const [rawSourceTypeFilter, setRawSourceTypeFilter] = useState('all')
  const [rawSalesChannelFilter, setRawSalesChannelFilter] = useState('all')

  const [pointsBalance, setPointsBalance] = useState(0)
  const [walletLoading, setWalletLoading] = useState(false)
  const [walletReadiness, setWalletReadiness] = useState(null)
  const [evaluatedRuntimeCampaigns, setEvaluatedRuntimeCampaigns] = useState({
    visibleCampaigns: [],
    applicableOffers: [],
    walletReadiness: null,
  })

  const selectedBranch = branches.find(branch => String(branch.id) === String(selectedBranchId)) || null

  const selectedChannel = channels.find(channel => String(channel.id) === String(selectedChannelId)) || channels[0] || null
  const selectedExistingAddress = customerAddresses.find(address => String(address.id) === String(selectedAddressId)) || null
  const routingAddressCandidate = buildRoutingAddressCandidate(
    selectedExistingAddress,
    fulfillmentType === 'delivery' && addressEditorMode !== 'none' ? addressForm : null,
  )
  const customerSearchPhoneDigits = normalizePhone(customerSearch)
  const promisedAt = fulfillmentType === 'delivery' ? deliveryAt : pickupAt
  const total = cart.reduce((sum, item) => sum + safeNumber(item.qty) * safeNumber(item.unitPrice), 0)
  const activeCustomerName = customerDisplayName(selectedCustomer, customerForm)
  const hasLocationReferenceData = cities.length > 0
  const runtimeLoyaltyChannel = 'call_center'

  const categoryRows = useMemo(() => {
    const byId = new Map(categories.map(category => [String(category.id), category]))
    const used = new Set(products.map(product => String(getProductCategoryId(product) || '')).filter(Boolean))
    return [{ id: 'all', name: 'Tümü' }, ...[...used].map(id => byId.get(id)).filter(Boolean)]
  }, [categories, products])

  const filteredProducts = useMemo(() => {
    const text = normalizeText(productSearch)
    return products.filter(product => {
      const inCategory = selectedCategoryId === 'all' || String(getProductCategoryId(product) || '') === String(selectedCategoryId)
      if (!inCategory) return false
      if (!text) return true
      return normalizeText([product.name, product.short_name, product.sku].filter(Boolean).join(' ')).includes(text)
    })
  }, [products, productSearch, selectedCategoryId])

  const hubSourceOptions = useMemo(() => {
    const optionMap = new Map()
    orders.forEach(order => {
      const meta = getOrderHubSourceMeta(order)
      if (!meta.group || optionMap.has(meta.group)) return
      optionMap.set(meta.group, meta.label)
    })
    return Array.from(optionMap.entries()).map(([value, label]) => ({ value, label }))
  }, [orders])

  const rawStatusOptions = useMemo(
    () => Array.from(new Set(orders.map(order => String(order.status || '').trim()).filter(Boolean))),
    [orders]
  )
  const rawKdsStatusOptions = useMemo(
    () => Array.from(new Set(orders.map(order => String(order.kds_status || '').trim()).filter(Boolean))),
    [orders]
  )
  const rawSourceTypeOptions = useMemo(
    () => Array.from(new Set(orders.map(order => String(order.source_channel_type || '').trim()).filter(Boolean))),
    [orders]
  )
  const rawSalesChannelOptions = useMemo(
    () => Array.from(new Set(orders.map(order => String(order.sales_channel_name || '').trim()).filter(Boolean))),
    [orders]
  )

  const filteredOrders = useMemo(() => {
    const searchText = normalizeText(hubSearch)
    return orders.filter(order => {
      if (hubBranchFilter !== 'all' && String(order.branch_id || '') !== String(hubBranchFilter)) return false
      if (hubStatusFilter !== 'all' && getOrderHubStatusMeta(order).label !== hubStatusFilter) return false
      if (hubSourceFilter !== 'all' && getOrderHubSourceMeta(order).group !== hubSourceFilter) return false
      if (rawStatusFilter !== 'all' && String(order.status || '') !== rawStatusFilter) return false
      if (rawKdsStatusFilter !== 'all' && String(order.kds_status || '') !== rawKdsStatusFilter) return false
      if (rawSourceTypeFilter !== 'all' && String(order.source_channel_type || '') !== rawSourceTypeFilter) return false
      if (rawSalesChannelFilter !== 'all' && String(order.sales_channel_name || '') !== rawSalesChannelFilter) return false

      if (hubFulfillmentFilter !== 'all') {
        const flowLabel = normalizeText(getOrderHubFlowLabel(order))
        if (hubFulfillmentFilter === 'masa' && getOrderHubSourceMeta(order).group !== 'masa') return false
        if (hubFulfillmentFilter === 'pickup' && !flowLabel.includes('gel al')) return false
        if (hubFulfillmentFilter === 'delivery' && !flowLabel.includes('adrese teslim')) return false
      }

      if (!searchText) return true
      return normalizeText(order.searchableText || '').includes(searchText)
    })
  }, [
    orders,
    hubSearch,
    hubBranchFilter,
    hubStatusFilter,
    hubSourceFilter,
    hubFulfillmentFilter,
    rawStatusFilter,
    rawKdsStatusFilter,
    rawSourceTypeFilter,
    rawSalesChannelFilter,
  ])

  const branchRecommendations = useMemo(() => {
    if (fulfillmentType !== 'delivery') return []
    const items = []
    const seen = new Set()
    const addRecommendation = (branch, source, score = 0) => {
      if (!branch?.id) return
      const key = String(branch.id)
      if (seen.has(key)) return
      seen.add(key)
      items.push({ branchId: branch.id, source, score, branch })
    }

    if (selectedExistingAddress?.id) {
      const savedMeta = readServiceBranchMeta(selectedExistingAddress)
      const savedBranch = resolveBranchByIdentity(branches, savedMeta.branchId, savedMeta.branchName)
      if (savedBranch) addRecommendation(savedBranch, 'saved', 999)

      const exactHistoryRow = history.find(row => {
        if (!row?.customer_address_id) return false
        return String(row.customer_address_id) === String(selectedExistingAddress.id)
      })
      const legacyHistoryRow = exactHistoryRow || history[0] || null
      const historyBranch = resolveBranchByIdentity(branches, legacyHistoryRow?.branch_id, legacyHistoryRow?.branch_name)
      if (historyBranch) addRecommendation(historyBranch, 'history', exactHistoryRow ? 850 : 800)
    }

    if (routingAddressCandidate?.cityId) {
      const coverageMatches = branchCoverageRows
        .map(row => ({ row, score: computeAuthorityMatchScore(row, routingAddressCandidate) }))
        .filter(item => item.score > 0)
        .sort((left, right) => right.score - left.score || safeNumber(left.row.priority, 999) - safeNumber(right.row.priority, 999))

      if (coverageMatches.length > 0) {
        coverageMatches.forEach(item => {
          const branch = resolveBranchByIdentity(branches, item.row.branch_id, item.row.branch_name)
          addRecommendation(branch, 'coverage', 600 + item.score * 10 - safeNumber(item.row.priority, 0))
        })
      } else {
        const physicalMatches = branchAddresses
          .map(row => ({ row, score: computeAuthorityMatchScore(row, routingAddressCandidate) }))
          .filter(item => item.score > 0)
          .sort((left, right) => right.score - left.score)
        physicalMatches.forEach(item => {
          const branch = resolveBranchByIdentity(branches, item.row.branch_id, item.row.branch_name)
          addRecommendation(branch, 'physical_address', 400 + item.score * 10)
        })
      }
    }

    return items.sort((left, right) => right.score - left.score || String(left.branch?.name || '').localeCompare(String(right.branch?.name || ''), 'tr'))
  }, [fulfillmentType, selectedExistingAddress, history, routingAddressCandidate, branchCoverageRows, branchAddresses, branches])

  const filteredBranches = useMemo(() => {
    const text = normalizeText(branchSearch)
    const rows = branches.filter(branch => {
      if (!text) return true
      return normalizeText([branch.name, branch.parentName, branch.address].filter(Boolean).join(' ')).includes(text)
    })
    return rows
  }, [branches, branchSearch])

  const groupedBranches = useMemo(() => {
    const recommendationMap = new Map(branchRecommendations.map(item => [String(item.branchId), item]))
    const recommended = []
    const others = []
    filteredBranches.forEach(branch => {
      const recommendation = recommendationMap.get(String(branch.id))
      if (recommendation) recommended.push({ ...branch, recommendationSource: recommendation.source, recommendationScore: recommendation.score })
      else others.push(branch)
    })
    return { recommended, others }
  }, [filteredBranches, branchRecommendations])

  const selectedBranchBadge = BRANCH_SOURCE_LABELS[selectedBranchSource] || ''

  const selectedAddressSummary = selectedExistingAddress
    ? addressLabel(selectedExistingAddress)
    : addressLabel({
        city_name: addressForm.cityName,
        district_name: addressForm.districtName,
        neighborhood_name: addressForm.neighborhoodName,
        street: addressForm.street,
        building_no: addressForm.buildingNo,
        floor_no: addressForm.floorNo,
        door_no: addressForm.doorNo,
      })

  const visibleRuntimeCampaigns = evaluatedRuntimeCampaigns.visibleCampaigns || []
  const applicableRuntimeOffers = evaluatedRuntimeCampaigns.applicableOffers || []

  const appliedLoyaltyCampaign = useMemo(() => {
    const selectedOffer = applicableRuntimeOffers.find(offer => String(offer.campaignId || '') === String(selectedLoyaltyCampaignId || ''))
    if (selectedOffer) return selectedOffer
    if (applicableRuntimeOffers.length === 1 && applicableRuntimeOffers[0]?.applicationMode === 'auto') {
      return applicableRuntimeOffers[0]
    }
    return null
  }, [applicableRuntimeOffers, selectedLoyaltyCampaignId])

  const selectedLoyaltyProgramId = useMemo(() => {
    const selectedCampaign = visibleRuntimeCampaigns.find(campaign => (
      String(campaign.id || '') === String(selectedLoyaltyCampaignId || '')
    ))
    if (selectedCampaign?.programId) return String(selectedCampaign.programId).trim()

    const appliedCampaign = visibleRuntimeCampaigns.find(campaign => (
      String(campaign.id || '') === String(appliedLoyaltyCampaign?.campaignId || '')
    ))
    if (appliedCampaign?.programId) return String(appliedCampaign.programId).trim()

    const candidateProgramIds = [
      ...new Set(
        campaigns
          .map(campaign => String(campaign.programId || campaign.program_id || '').trim())
          .filter(Boolean),
      ),
    ]
    return candidateProgramIds.length === 1 ? candidateProgramIds[0] : ''
  }, [visibleRuntimeCampaigns, campaigns, selectedLoyaltyCampaignId, appliedLoyaltyCampaign?.campaignId])

  useEffect(() => {
    let ignore = false
    const customerContext = {
      customerId: selectedCustomer?.id || '',
      customerName: activeCustomerName,
      customerCategoryIds,
      tierPointsMultiplier: selectedCustomer?.tierPointsMultiplier || selectedCustomer?.pointsMultiplier || selectedCustomer?.points_multiplier || 1,
    }
    const syncFallback = evaluateRuntimeOrderCampaigns(campaigns, {
      runtimeChannel: runtimeLoyaltyChannel,
      orderTotal: total,
      customerContext,
      selectedCampaignId: selectedLoyaltyCampaignId,
      manuallyTriggeredCampaignIds: manualTriggeredCampaignIds,
      cartLines: cart,
      saleTemplates,
    })

    setWalletLoading(true)

    ;(async () => {
      try {
        const evaluated = await evaluateRuntimeOrderCampaignsAsync(campaigns, {
          runtimeChannel: runtimeLoyaltyChannel,
          orderTotal: total,
          customerContext,
          selectedCampaignId: selectedLoyaltyCampaignId,
          manuallyTriggeredCampaignIds: manualTriggeredCampaignIds,
          programId: selectedLoyaltyProgramId,
          cartLines: cart,
          saleTemplates,
        })
        if (ignore) return
        setEvaluatedRuntimeCampaigns(evaluated)
        setWalletReadiness(evaluated.walletReadiness || null)
        setPointsBalance(
          evaluated.walletReadiness?.balanceKnown
            ? safeNumber(evaluated.walletReadiness.pointsBalance, 0)
            : 0,
        )
      } catch {
        if (ignore) return
        setEvaluatedRuntimeCampaigns({
          ...syncFallback,
          walletReadiness: null,
        })
        setWalletReadiness(null)
        setPointsBalance(0)
      } finally {
        if (!ignore) setWalletLoading(false)
      }
    })()

    return () => { ignore = true }
  }, [
    campaigns,
    runtimeLoyaltyChannel,
    total,
    selectedCustomer?.id,
    activeCustomerName,
    customerCategoryIds,
    selectedLoyaltyCampaignId,
    manualTriggeredCampaignIds,
    selectedLoyaltyProgramId,
    cart,
    saleTemplates,
  ])

  const walletBalanceLabel = walletLoading
    ? '...'
    : (walletReadiness?.status === 'ambiguous_program_context'
      ? 'Program secimi gerekli'
      : `${Math.round(pointsBalance)} puan`)

  const loyaltyDiscountAmount = useMemo(() => {
    if (!appliedLoyaltyCampaign) return 0
    if (appliedLoyaltyCampaign.discountType === 'free_products') {
      const giftItems = Array.isArray(appliedLoyaltyCampaign.giftItems) ? appliedLoyaltyCampaign.giftItems : []
      let totalDiscount = 0
      const cartStates = cart.map(item => ({
        productId: String(item.product?.id || '').trim(),
        name: String(item.product?.name || '').trim(),
        qty: safeNumber(item.qty),
        unitPrice: safeNumber(item.unitPrice),
        options: item.options || [],
        portionId: item.portionId || null,
        productObj: item.product,
      }))

      for (const giftItem of giftItems) {
        let remainingQty = safeNumber(giftItem.qty)
        for (const state of cartStates) {
          if (remainingQty <= 0) break
          if (state.qty <= 0) continue

          const matchById = giftItem.productId && state.productId && String(state.productId) === String(giftItem.productId)
          const matchByName = !matchById && giftItem.name && state.name
            && String(state.name).toLowerCase() === String(giftItem.name).toLowerCase()

          if (matchById || matchByName) {
            const take = Math.min(remainingQty, state.qty)
            state.qty -= take
            remainingQty -= take

            const optionTotal = (state.options || []).reduce((sum, opt) => sum + (safeNumber(opt.price) || 0), 0)
            const portions = Array.isArray(state.productObj?.portions) ? state.productObj.portions : []
            const portion = portions.find(p => p.id === state.portionId) || null
            const portionOffset = safeNumber(portion?.price_offset)

            const freeOptions = appliedLoyaltyCampaign.freeOptions !== false
            const freeSizes = appliedLoyaltyCampaign.freeSizes !== false
            const unpaidPart = (freeOptions ? 0 : optionTotal) + (freeSizes ? 0 : portionOffset)

            const unitDiscount = Math.max(0, state.unitPrice - unpaidPart)
            totalDiscount += unitDiscount * take
          }
        }
      }
      return totalDiscount
    }
    return safeNumber(appliedLoyaltyCampaign.discountAmount)
  }, [appliedLoyaltyCampaign, cart])
  const payableTotal = Math.max(0, safeNumber(total) - loyaltyDiscountAmount)
  const loyaltyDiscountMap = useMemo(() => (
    buildProportionalDiscountMap(cart, {
      discountAmount: loyaltyDiscountAmount,
      getKey: item => item.id,
      getLineTotal: item => safeNumber(item.qty) * safeNumber(item.unitPrice),
      getQty: item => item.qty,
    })
  ), [cart, loyaltyDiscountAmount])

  const loadBase = useCallback(async () => {
    setLoading(true)
    try {
      const [
        branchesResult,
        branchAddressesResult,
        branchCoverageResult,
        channelsResult,
        productsResult,
        categoriesResult,
        ordersResult,
        citiesResult,
        posTablesResult,
        openTicketSettingsResult,
      ] = await Promise.all([
        db.from('company_nodes').select('id,name,type,parent_id,can_sell').order('sort_order'),
        db.from('branch_addresses').select('branch_id,branch_name,city_id,city_name,district_id,district_name,neighborhood_id,neighborhood_name,street,line_1,active').is('deleted_at', null).order('branch_name'),
        db.from('branch_service_coverage').select('branch_id,branch_name,city_id,city_name,district_id,district_name,neighborhood_id,neighborhood_name,priority,active').is('deleted_at', null).order('priority'),
        db.from('sales_channels').select('id,name,active,show_in_kds,show_in_queue').is('deleted_at', null).order('sort_order'),
        db.from('sale_items').select('id,name,short_name,sku,channel_prices,standard_price,pos_color,pos_text_color,pos_image,channel_image,sale_cat_l1,sale_cat_l2,sale_cat_l3,sale_cat_l4,sale_cat_l5,cat_l1,cat_l2,cat_l3,cat_l4,cat_l5,sale_status').is('deleted_at', null).limit(500),
        db.from('sale_categories').select('id,name,parent_id').is('deleted_at', null).limit(500),
        db.from('sales')
          .select('id,sale_no,sale_datetime,source,status,source_channel_type,sales_channel_name,customer_name,branch_id,branch_name,customer_address_id,kds_status,gross_total_after_discount,payment_total,order_note,kiosk_table_number,fulfillment_type,promised_at,kds_release_at,delivery_address_snapshot')
          .in('status', ['completed', 'cancelled'])
          .is('deleted_at', null)
          .order('sale_datetime', { ascending: false })
          .limit(240),
        db.from('tr_iller').select('id,ad').order('ad').limit(100),
        db.from('pos_tables').select('id,branch_id,table_name,table_number').is('deleted_at', null).eq('is_active', true),
        db.from('settings').select('value').eq('key', OPEN_TABLE_TICKETS_SETTING_KEY).maybeSingle(),
      ])
      if (branchesResult.error) throw branchesResult.error
      if (branchAddressesResult.error) throw branchAddressesResult.error
      if (branchCoverageResult.error) throw branchCoverageResult.error
      if (channelsResult.error) throw channelsResult.error
      if (productsResult.error) throw productsResult.error
      let resolvedOrders = ordersResult.data || []
      if (ordersResult.error) {
        if (!isMissingCallCenterScheduleColumn(ordersResult.error)) throw ordersResult.error
        const legacyOrdersResult = await db.from('sales')
          .select('id,sale_no,sale_datetime,source,status,source_channel_type,sales_channel_name,customer_name,branch_id,branch_name,customer_address_id,kds_status,gross_total_after_discount,payment_total,order_note,kiosk_table_number')
          .in('status', ['completed', 'cancelled'])
          .is('deleted_at', null)
          .order('sale_datetime', { ascending: false })
          .limit(240)
        if (legacyOrdersResult.error) throw legacyOrdersResult.error
        resolvedOrders = legacyOrdersResult.data || []
      }
      if (posTablesResult.error) throw posTablesResult.error
      if (openTicketSettingsResult.error) throw openTicketSettingsResult.error

      const nodeMap = new Map((branchesResult.data || []).map(node => [String(node.id), node]))
      const branchAddressMap = new Map((branchAddressesResult.data || []).filter(row => row.active !== false).map(row => [String(row.branch_id), row]))
      const branchRows = (branchesResult.data || [])
        .filter(node => node.can_sell === true || normalizeText(node.type).includes('şube') || normalizeText(node.type).includes('sube'))
        .map(node => ({
          id: node.id,
          name: node.name,
          parentName: nodeMap.get(String(node.parent_id))?.name || '',
          address: branchAddressMap.get(String(node.id))?.line_1 || '',
        }))
      setBranches(branchRows)
      setBranchAddresses((branchAddressesResult.data || []).filter(row => row.active !== false))
      setBranchCoverageRows((branchCoverageResult.data || []).filter(row => row.active !== false))
      setSelectedBranchId(current => current || branchRows[0]?.id || '')

      const channelRows = (channelsResult.data || []).filter(channel => channel.active !== false)
      setChannels(channelRows)
      const callCenterChannel = channelRows.find(channel => normalizeText(channel.name).includes('çağrı') || normalizeText(channel.name).includes('cagri'))
      const deliveryChannel = channelRows.find(channel => normalizeText(channel.name).includes('gel') || normalizeText(channel.name).includes('paket') || normalizeText(channel.name).includes('hızlı'))
      setSelectedChannelId(current => current || callCenterChannel?.id || deliveryChannel?.id || channelRows[0]?.id || '')

      setProducts((productsResult.data || []).filter(product => product.sale_status !== false))
      setCategories(categoriesResult.data || [])
      const normalizedSales = normalizeLegacyCallCenterOrders(resolvedOrders).map(normalizeOrderHubSale)
      const posTableMap = new Map((posTablesResult.data || []).map(table => [String(table.id), table]))
      const openTicketState = openTicketSettingsResult.data?.value && typeof openTicketSettingsResult.data.value === 'object'
        ? openTicketSettingsResult.data.value
        : {}
      const openTicketRows = Object.entries(openTicketState || {}).flatMap(([branchId, branchTickets]) => {
        const branchName = branchRows.find(branch => String(branch.id) === String(branchId))?.name || ''
        return Object.entries(branchTickets || {}).flatMap(([tableKey, ticket]) => {
          const cart = Array.isArray(ticket?.cart) ? ticket.cart : []
          if (!cart.length && !String(ticket?.orderNote || '').trim()) return []
          const mappedTable = posTableMap.get(String(tableKey))
          const fallbackTable = resolveTableRecord(tableKey)
          const tableLabel = mappedTable?.table_name || mappedTable?.table_number || fallbackTable?.label || `Masa ${tableKey}`
          return [normalizeOrderHubOpenTicket({
            branchId,
            branchName,
            tableKey,
            tableLabel,
            ticket,
          })]
        })
      })
      setOrders(
        [...openTicketRows, ...normalizedSales]
          .sort((left, right) => new Date(right.updatedAt || right.sale_datetime || 0) - new Date(left.updatedAt || left.sale_datetime || 0))
      )
      setCities(citiesResult.data || [])
    } catch (error) {
      toast(`Siparis merkezi verileri yuklenemedi: ${error?.message || 'Bilinmeyen hata'}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadBase()
  }, [loadBase])

  useEffect(() => {
    if (!selectedOrder?.id) return
    const nextOrder = orders.find(order => String(order.id) === String(selectedOrder.id))
    if (!nextOrder) {
      setSelectedOrder(null)
      setSelectedOrderLines([])
      return
    }
    if (nextOrder !== selectedOrder) {
      setSelectedOrder(nextOrder)
    }
  }, [orders, selectedOrder])

  useEffect(() => {
    let ignore = false
    ;(async () => {
      try {
        const snapshot = await loadCachedRuntimeLoyaltyCampaignCatalog({
          branchId: selectedBranch?.id || '',
          branchName: selectedBranch?.name || '',
        })
        if (ignore) return
        setCampaigns(snapshot.campaigns || [])
        setSaleTemplates(snapshot.saleTemplates || [])
        setCampaignCatalogIssues(snapshot.issues || [])
      } catch (error) {
        if (!ignore) {
          setCampaigns([])
          setSaleTemplates([])
          setCampaignCatalogIssues([error?.message || 'Loyalty kampanya katalogu yuklenemedi'])
        }
      }
    })()
    return () => { ignore = true }
  }, [selectedBranch?.id, selectedBranch?.name])

  useEffect(() => {
    const text = customerSearch.trim()
    if (text.length < 3) {
      setCustomers([])
      return
    }
    let ignore = false
    ;(async () => {
      const phone = normalizePhone(text)
      const query = phone.length >= 3
        ? db.from('musteriler').select('id,ad_soyad,telefon,telefon_ulke,email,siparis_sayisi,total_order_count,total_order_amount,home_branch_id,home_branch_name').is('deleted_at', null).ilike('normalized_phone', `%${phone}%`).limit(8)
        : db.from('musteriler').select('id,ad_soyad,telefon,telefon_ulke,email,siparis_sayisi,total_order_count,total_order_amount,home_branch_id,home_branch_name').is('deleted_at', null).ilike('ad_soyad', `%${text}%`).limit(8)
      const { data, error } = await query
      if (!ignore && !error) setCustomers(data || [])
    })()
    return () => { ignore = true }
  }, [customerSearch])

  useEffect(() => {
    if (!selectedCustomer?.id) {
      setCustomerAddresses([])
      setSelectedAddressId('')
      setAddressEditorMode('none')
      setHistory([])
      setPendingBranchOverride(null)
      setHasManualBranchSelection(false)
      setSelectedBranchSource('fallback')
      return
    }
    let ignore = false
    ;(async () => {
      const [addressResult, historyResult] = await Promise.all([
        db.from('customer_addresses').select('*').eq('customer_id', selectedCustomer.id).is('deleted_at', null).order('is_primary', { ascending: false }).order('created_at', { ascending: false }).limit(20),
        db.from('sales').select('id,sale_no,sale_datetime,branch_id,branch_name,customer_address_id,gross_total_after_discount,order_note,source_channel_type').eq('customer_id', selectedCustomer.id).is('deleted_at', null).order('sale_datetime', { ascending: false }).limit(20),
      ])
      if (ignore) return
      const addresses = addressResult.data || []
      setCustomerAddresses(addresses)
      setSelectedAddressId(current => current || addresses[0]?.id || '')
      setAddressEditorMode('none')
      setPendingBranchOverride(null)
      setHasManualBranchSelection(false)
      if (addresses[0]?.id) syncAddressForm(addresses[0])
      else setAddressForm(EMPTY_ADDRESS_FORM)
      setHistory(historyResult.data || [])
    })()
    return () => { ignore = true }
  }, [selectedCustomer?.id])

  useEffect(() => {
    if (!selectedCustomer?.id) {
      setCustomerCategoryIds([])
      return
    }
    let ignore = false
    ;(async () => {
      try {
        const globalAssignmentsPromise = loadLoyaltyCustomerCategoryAssignments({ scope: 'global' }, selectedCustomer.id)
        const branchAssignmentsPromise = selectedBranch?.id || selectedBranch?.name
          ? loadLoyaltyCustomerCategoryAssignments({
            scope: 'branch',
            branchId: selectedBranch?.id || '',
            branchName: selectedBranch?.name || '',
          }, selectedCustomer.id)
          : Promise.resolve(null)
        const [globalAssignments, branchAssignments] = await Promise.all([
          globalAssignmentsPromise,
          branchAssignmentsPromise,
        ])
        if (ignore) return
        setCustomerCategoryIds([
          ...new Set([
            ...(globalAssignments?.selectedCategoryIds || []),
            ...(branchAssignments?.selectedCategoryIds || []),
          ].map(value => String(value || '').trim()).filter(Boolean)),
        ])
      } catch {
        if (!ignore) setCustomerCategoryIds([])
      }
    })()
    return () => { ignore = true }
  }, [selectedCustomer?.id, selectedBranch?.id, selectedBranch?.name])

  useEffect(() => {
    setManualTriggeredCampaignIds([])
    setSelectedLoyaltyCampaignId('')
  }, [selectedCustomer?.id, selectedBranchId, selectedChannelId, fulfillmentType])

  useEffect(() => {
    if (!selectedLoyaltyCampaignId) return
    const stillEligible = applicableRuntimeOffers.some(offer => String(offer.campaignId || '') === String(selectedLoyaltyCampaignId))
    if (!stillEligible) {
      setSelectedLoyaltyCampaignId('')
    }
  }, [selectedLoyaltyCampaignId, applicableRuntimeOffers])

  useEffect(() => {
    if (fulfillmentType === 'delivery') return
    setPendingBranchOverride(null)
    setSelectedBranchSource('manual_temporary')
  }, [fulfillmentType])

  useEffect(() => {
    if (fulfillmentType !== 'delivery') return
    if (pendingBranchOverride) return
    if (hasManualBranchSelection) return

    let nextBranch = null
    let nextSource = 'fallback'

    if (selectedExistingAddress?.id) {
      const savedMeta = readServiceBranchMeta(selectedExistingAddress)
      nextBranch = resolveBranchByIdentity(branches, savedMeta.branchId, savedMeta.branchName)
      if (nextBranch) {
        nextSource = 'saved'
      } else {
        const exactHistoryRow = history.find(row => String(row?.customer_address_id || '') === String(selectedExistingAddress.id))
        const legacyHistoryRow = exactHistoryRow || history[0] || null
        nextBranch = resolveBranchByIdentity(branches, legacyHistoryRow?.branch_id, legacyHistoryRow?.branch_name)
        if (nextBranch) {
          nextSource = 'history'
        } else {
          nextBranch = resolveBranchByIdentity(branches, selectedCustomer?.home_branch_id, selectedCustomer?.home_branch_name) || branches[0] || null
          nextSource = 'fallback'
        }
      }
    } else if (branchRecommendations[0]?.branch) {
      nextBranch = branchRecommendations[0].branch
      nextSource = branchRecommendations[0].source
    } else {
      nextBranch = branches[0] || null
      nextSource = 'fallback'
    }

    if (!nextBranch?.id) return
    if (String(selectedBranchId) !== String(nextBranch.id)) {
      setSelectedBranchId(nextBranch.id)
    }
    if (selectedBranchSource !== nextSource) {
      setSelectedBranchSource(nextSource)
    }
  }, [
    fulfillmentType,
    pendingBranchOverride,
    hasManualBranchSelection,
    selectedExistingAddress,
    history,
    selectedCustomer?.home_branch_id,
    selectedCustomer?.home_branch_name,
    branchRecommendations,
    branches,
    selectedBranchId,
    selectedBranchSource,
  ])

  useEffect(() => {
    if (addressEditorMode === 'none') return
    if (selectedExistingAddress?.id) return
    setPendingBranchOverride(null)
    setHasManualBranchSelection(false)
  }, [addressEditorMode, selectedExistingAddress?.id, addressForm.cityId, addressForm.districtId, addressForm.neighborhoodId])

  useEffect(() => {
    if (!hasLocationReferenceData) {
      setDistricts([])
      return
    }
    if (!addressForm.cityId) {
      setDistricts([])
      return
    }
    let ignore = false
    ;(async () => {
      const { data } = await db.from('tr_ilceler').select('id,ad,il_id').eq('il_id', Number(addressForm.cityId)).order('ad').limit(300)
      if (!ignore) setDistricts(data || [])
    })()
    return () => { ignore = true }
  }, [addressForm.cityId, hasLocationReferenceData])

  useEffect(() => {
    if (!hasLocationReferenceData) {
      setNeighborhoods([])
      return
    }
    if (!addressForm.districtId) {
      setNeighborhoods([])
      return
    }
    let ignore = false
    ;(async () => {
      const { data } = await db.from('tr_mahalleler').select('id,ad,ilce_id').eq('ilce_id', Number(addressForm.districtId)).order('ad').limit(500)
      if (!ignore) setNeighborhoods(data || [])
    })()
    return () => { ignore = true }
  }, [addressForm.districtId, hasLocationReferenceData])

  useEffect(() => {
    if (!hasLocationReferenceData) {
      setStreets([])
      return
    }
    if (!addressForm.neighborhoodId) {
      setStreets([])
      return
    }
    let ignore = false
    ;(async () => {
      const { data } = await db.from('tr_sokaklar').select('id,ad,mahalle_id').eq('mahalle_id', Number(addressForm.neighborhoodId)).order('ad').limit(300)
      if (!ignore) setStreets(data || [])
    })()
    return () => { ignore = true }
  }, [addressForm.neighborhoodId, hasLocationReferenceData])

  function syncAddressForm(address) {
    setAddressForm({
      label: address?.label || '',
      cityId: address?.city_id ? String(address.city_id) : '',
      cityName: address?.city_name || '',
      districtId: address?.district_id ? String(address.district_id) : '',
      districtName: address?.district_name || '',
      neighborhoodId: address?.neighborhood_id ? String(address.neighborhood_id) : '',
      neighborhoodName: address?.neighborhood_name || '',
      street: address?.street || '',
      buildingName: address?.metadata?.buildingName || '',
      buildingNo: address?.building_no || '',
      floorNo: address?.floor_no || '',
      doorNo: address?.door_no || address?.apartment_no || '',
      directions: address?.directions || '',
    })
    setStreets([])
  }

  async function persistAddressServiceBranch(address, branch, source = 'manual') {
    if (!address?.id || !branch?.id) return address
    const metadata = buildAddressMetadata(address, {
      serviceBranchId: branch.id,
      serviceBranchName: branch.name || '',
      serviceBranchSource: source,
      serviceBranchUpdatedAt: new Date().toISOString(),
    })
    const { data, error } = await db.from('customer_addresses').update({
      metadata,
      updated_at: new Date().toISOString(),
    }).eq('id', address.id).select('*').single()
    if (error) throw error
    setCustomerAddresses(current => current.map(item => String(item.id) === String(data.id) ? data : item))
    return data
  }

  function applyBranchSelection(branch, source = 'manual_temporary', markManual = true) {
    if (!branch?.id) return
    setSelectedBranchId(branch.id)
    setSelectedBranchSource(source)
    setPendingBranchOverride(null)
    if (markManual) setHasManualBranchSelection(true)
  }

  function promptBranchOverride(branch, address, mode = 'existing') {
    if (!branch?.id || !address?.id) return
    setPendingBranchOverride({
      branchId: branch.id,
      branchName: branch.name || '',
      addressId: address.id,
      mode,
      source: mode === 'existing' ? 'manual_temporary' : selectedBranchSource,
    })
  }

  async function confirmBranchOverride(persistForAddress) {
    if (!pendingBranchOverride?.branchId) return
    const branch = resolveBranchByIdentity(branches, pendingBranchOverride.branchId, pendingBranchOverride.branchName)
    if (!branch) {
      setPendingBranchOverride(null)
      return
    }
    const address = customerAddresses.find(item => String(item.id) === String(pendingBranchOverride.addressId)) || null
    try {
      if (persistForAddress && address?.id) {
        const updatedAddress = await persistAddressServiceBranch(address, branch, 'manual')
        if (String(selectedAddressId) === String(updatedAddress.id)) {
          setSelectedAddressId(updatedAddress.id)
        }
        applyBranchSelection(branch, 'saved')
      } else {
        applyBranchSelection(branch, pendingBranchOverride.source || 'manual_temporary')
      }
      toast(
        persistForAddress
          ? 'Şube bu adres için varsayılan olarak kaydedildi'
          : 'Şube yalnız bu sipariş için değiştirildi',
        'success',
      )
    } catch (error) {
      toast(error?.message || 'Şube tercihi kaydedilemedi', 'error')
    } finally {
      setPendingBranchOverride(null)
    }
  }

  function handleBranchSelection(branch) {
    if (!branch?.id) return
    if (fulfillmentType !== 'delivery') {
      applyBranchSelection(branch, 'manual_temporary')
      return
    }
    if (String(selectedBranchId) === String(branch.id) && !pendingBranchOverride) return
    if (selectedExistingAddress?.id) {
      promptBranchOverride(branch, selectedExistingAddress, 'existing')
      return
    }
    applyBranchSelection(branch, branchRecommendations.find(item => String(item.branchId) === String(branch.id))?.source || 'manual_temporary')
  }

  function selectExistingAddress(address) {
    setSelectedAddressId(address.id)
    setAddressEditorMode('none')
    setPendingBranchOverride(null)
    setHasManualBranchSelection(false)
    syncAddressForm(address)
  }

  function startNewAddress() {
    setSelectedAddressId('')
    setAddressEditorMode('create')
    setPendingBranchOverride(null)
    setHasManualBranchSelection(false)
    setAddressForm(EMPTY_ADDRESS_FORM)
  }

  function startEditAddress(address) {
    setSelectedAddressId(address.id)
    setAddressEditorMode('edit')
    setPendingBranchOverride(null)
    setHasManualBranchSelection(false)
    syncAddressForm(address)
  }

  function selectCustomer(customer) {
    setShowNewCustomerForm(false)
    setSelectedCustomer(customer)
    setCustomerForm({
      phone: [customer.telefon_ulke || '+90', customer.telefon || ''].join(' ').trim(),
      firstName: customer.ad_soyad || '',
      lastName: '',
      note: '',
    })
    setStep('fulfillment')
  }

  function prepareNewCustomer() {
    setShowNewCustomerForm(true)
    setSelectedCustomer(null)
    setAddressEditorMode('none')
    setCustomerCategoryIds([])
    setPendingBranchOverride(null)
    setHasManualBranchSelection(false)
    setSelectedBranchSource('fallback')
    setCustomerForm(current => ({
      ...current,
      phone: current.phone || customerSearch || '+90 ',
    }))
  }

  async function saveAddressEditor() {
    try {
      const editorMode = addressEditorMode
      const customer = await ensureCustomer()
      const address = await ensureAddress(customer)
      if (editorMode === 'create' && address?.id && selectedBranch?.id && selectedBranchSource !== 'fallback') {
        setPendingBranchOverride({
          branchId: selectedBranch.id,
          branchName: selectedBranch.name || '',
          addressId: address.id,
          mode: 'new-address',
          source: selectedBranchSource,
        })
        setHasManualBranchSelection(true)
        toast('Adres kaydedildi. Şube seçiminin yalnız bu sipariş için mi yoksa adres varsayılanı olarak mı kullanılacağını seçin.', 'success')
        return
      }
      toast(editorMode === 'edit' ? 'Adres güncellendi' : 'Adres kaydedildi', 'success')
    } catch (error) {
      toast(error?.message || 'Adres kaydedilemedi', 'error')
    }
  }

  function addProduct(product) {
    const unitPrice = getProductPrice(product, selectedChannelId)
    if (unitPrice <= 0) {
      toast('Bu ürün için seçili kanalda fiyat bulunamadı', 'error')
      return
    }
    setCart(current => {
      const existing = current.find(row => row.product.id === product.id)
      if (existing) {
        return current.map(row => row.product.id === product.id ? { ...row, qty: row.qty + 1 } : row)
      }
      const category = categories.find(row => String(row.id) === String(getProductCategoryId(product)))
      return [...current, { id: uid(), product, qty: 1, unitPrice, categoryName: category?.name || '' }]
    })
  }

  function updateCartQty(id, delta) {
    setCart(current => current
      .map(row => row.id === id ? { ...row, qty: Math.max(0, row.qty + delta) } : row)
      .filter(row => row.qty > 0))
  }

  async function ensureCustomer() {
    if (selectedCustomer?.id) return selectedCustomer
    const adSoyad = [customerForm.firstName, customerForm.lastName].filter(Boolean).join(' ').trim()
    if (!adSoyad) throw new Error('Müşteri adı soyadı zorunlu')
    const phoneDigits = normalizePhone(customerForm.phone)
    const { data, error } = await db.from('musteriler').insert({
      ad_soyad: adSoyad,
      telefon: phoneDigits ? phoneDigits.slice(-10) : null,
      telefon_ulke: '+90',
      normalized_phone: phoneDigits || null,
      notlar: customerForm.note || null,
      signup_channel: 'call_center',
      acquisition_source: 'call_center',
      metadata: { source: 'call_center' },
    }).select('*').single()
    if (error) throw error
    setSelectedCustomer(data)
    return data
  }

  async function ensureAddress(customer) {
    if (fulfillmentType !== 'delivery') return null
    if (addressEditorMode === 'none' && selectedExistingAddress?.id) return selectedExistingAddress
    if (addressEditorMode === 'none') {
      throw new Error('Teslimat için kayıtlı bir adres seçin veya yeni adres ekleyin')
    }
    if (!addressForm.label.trim()) {
      throw new Error('Adres başlığı zorunlu')
    }
    if (!addressForm.cityId || !addressForm.districtId || !addressForm.neighborhoodId || !addressForm.street.trim()) {
      throw new Error('Teslimat için şehir, ilçe, mahalle ve sokak/cadde zorunlu')
    }
    const payload = {
      customer_id: customer.id,
      label: addressForm.label.trim(),
      address_type: 'delivery',
      city_id: String(addressForm.cityId),
      city_name: addressForm.cityName,
      district_id: String(addressForm.districtId),
      district_name: addressForm.districtName,
      neighborhood_id: String(addressForm.neighborhoodId),
      neighborhood_name: addressForm.neighborhoodName,
      street: addressForm.street.trim(),
      building_no: [addressForm.buildingName, addressForm.buildingNo].filter(Boolean).join(' ').trim() || null,
      floor_no: addressForm.floorNo || null,
      door_no: addressForm.doorNo || null,
      directions: addressForm.directions || null,
      line_1: addressLabel({
        city_name: addressForm.cityName,
        district_name: addressForm.districtName,
        neighborhood_name: addressForm.neighborhoodName,
        street: addressForm.street,
        building_no: addressForm.buildingNo,
        floor_no: addressForm.floorNo,
        door_no: addressForm.doorNo,
      }),
      source_channel: 'call_center',
      metadata: buildAddressMetadata(selectedExistingAddress, {
        buildingName: addressForm.buildingName || null,
      }),
    }
    if (addressEditorMode === 'edit' && selectedExistingAddress?.id) {
      const { data, error } = await db.from('customer_addresses').update({
        ...payload,
        updated_at: new Date().toISOString(),
      }).eq('id', selectedExistingAddress.id).select('*').single()
      if (error) throw error
      setCustomerAddresses(current => current.map(address => String(address.id) === String(data.id) ? data : address))
      setSelectedAddressId(data.id)
      setAddressEditorMode('none')
      return data
    }
    const { data, error } = await db.from('customer_addresses').insert(payload).select('*').single()
    if (error) throw error
    setCustomerAddresses(current => [data, ...current])
    setSelectedAddressId(data.id)
    setAddressEditorMode('none')
    return data
  }

  function validateBeforeOrder() {
    if (!activeCustomerName) return 'Müşteri seçin veya yeni müşteri bilgilerini tamamlayın'
    if (!selectedBranchId) return 'Siparişin gideceği şubeyi seçin'
    if (pendingBranchOverride) return 'Devam etmeden önce şube tercihini tamamlayın'
    if (fulfillmentType === 'delivery' && addressEditorMode !== 'none') {
      return 'Devam etmeden önce adresi kaydedin'
    }
    if (fulfillmentType === 'delivery' && !selectedExistingAddress) {
      return 'Teslimat için kayıtlı bir adres seçin veya yeni adres ekleyin'
    }
    return ''
  }

  async function sendOrder() {
    if (!cart.length) {
      toast('Siparişe ürün ekleyin', 'error')
      return
    }
    if (!paymentMethod) {
      toast('Ödeme tipini seçin', 'error')
      return
    }
    if (paymentMethod === 'sadakat_points') {
      toast('Sadakat puan ile odeme burn executor tamamlanana kadar kapali.', 'error')
      return
    }
    setSubmitting(true)
    try {
      const customer = await ensureCustomer()
      const address = await ensureAddress(customer)
      const now = new Date()
      const promisedDate = new Date(promisedAt)
      const safePromisedDate = Number.isNaN(promisedDate.getTime()) ? now : promisedDate
      const releaseDate = getCallCenterKdsReleaseAt(safePromisedDate, now)
      const saleDate = now.toISOString()
      const multipliersActive = (evaluatedRuntimeCampaigns.combinedEarnMultiplier && evaluatedRuntimeCampaigns.combinedEarnMultiplier !== 1) ||
                                (evaluatedRuntimeCampaigns.combinedRedeemMultiplier && evaluatedRuntimeCampaigns.combinedRedeemMultiplier !== 1);
      const loyaltyCampaignPayload = appliedLoyaltyCampaign || (multipliersActive ? {
        decisionContext: {
          combinedEarnMultiplier: evaluatedRuntimeCampaigns.combinedEarnMultiplier,
          combinedRedeemMultiplier: evaluatedRuntimeCampaigns.combinedRedeemMultiplier,
          tierPointsMultiplier: (selectedCustomer?.tierPointsMultiplier || selectedCustomer?.pointsMultiplier || selectedCustomer?.points_multiplier || 1)
        }
      } : null);
      const saleLoyaltySnapshot = createSaleLoyaltySnapshot(loyaltyCampaignPayload)
      const campaignNotes = (evaluatedRuntimeCampaigns.applicableOffers || [])
        .filter(offer => {
          const isApplied = String(offer.campaignId || '') === String(appliedLoyaltyCampaign?.campaignId || '') ||
                            (offer.applicationMode === 'auto' && String(offer.campaignId || '') === String(selectedLoyaltyCampaignId || ''));
          return isApplied && offer.actionType === 'write_customer_note' && offer.customerNote;
        })
        .map(offer => offer.customerNote);
      const baseOrderNote = buildCallCenterOrderNote({
        fulfillmentType,
        promisedAt: safePromisedDate,
        addressText: addressLabel(address),
        branchName: selectedBranch?.name || '',
        loyaltyName: appliedLoyaltyCampaign?.campaignName || '',
      })
      const orderNote = [baseOrderNote, ...campaignNotes].filter(Boolean).join('\n')
      const header = {
        local_id: uid(),
        sale_datetime: saleDate,
        source: 'call_center',
        source_channel_type: 'call_center',
        sales_channel_id: toDbUuid(selectedChannel?.id),
        sales_channel_name: selectedChannel?.name || 'Çağrı Merkezi',
        branch_id: toDbUuid(selectedBranch?.id),
        branch_name: selectedBranch?.name || null,
        customer_id: toDbUuid(customer.id),
        customer_address_id: toDbUuid(address?.id),
        customer_name: customer.ad_soyad || activeCustomerName,
        cashier_name: 'Çağrı Merkezi',
        order_note: orderNote,
        currency_code: 'TRY',
        gross_total_before_discount: total,
        discount_type: appliedLoyaltyCampaign?.discountType || null,
        discount_value: safeNumber(appliedLoyaltyCampaign?.discountValue),
        discount_amount: loyaltyDiscountAmount,
        gross_total_after_discount: payableTotal,
        net_total_after_discount: payableTotal,
        cost_total: 0,
        payment_total: payableTotal,
        change_amount: 0,
        status: 'completed',
        kds_status: 'pending',
        fulfillment_type: fulfillmentType,
        promised_at: safePromisedDate.toISOString(),
        kds_release_at: releaseDate.toISOString(),
        kiosk_service_type: 'takeaway',
        kiosk_table_number: fulfillmentType === 'delivery' ? 'Teslimat' : 'Gel-al',
        pickup_called: false,
        delivery_address_snapshot: fulfillmentType === 'delivery' ? buildDeliveryAddressSnapshot(address) : null,
      }

      let persistedSalesHeader = attachLoyaltyToSaleHeader(header, saleLoyaltySnapshot, loyaltyDiscountAmount)
      let saleInsertResult = await db.from('sales').insert(persistedSalesHeader).select('id').single()
      if (saleInsertResult.error && isMissingCallCenterScheduleColumn(saleInsertResult.error)) {
        const {
          fulfillment_type: _fulfillmentType,
          promised_at: _promisedAt,
          kds_release_at: _kdsReleaseAt,
          delivery_address_snapshot: _deliveryAddressSnapshot,
          ...legacyHeader
        } = header
        // Eski semada planli siparis KDS'ye zamaninda dussun diye sale_datetime release zamanina cekilir.
        persistedSalesHeader = attachLoyaltyToSaleHeader({
          ...legacyHeader,
          sale_datetime: releaseDate.toISOString(),
        }, saleLoyaltySnapshot, loyaltyDiscountAmount)
        saleInsertResult = await db.from('sales').insert(persistedSalesHeader).select('id').single()
      }
      if (saleInsertResult.error) throw saleInsertResult.error

      const saleId = saleInsertResult.data.id
      const lineRows = buildLineRows({
        saleId,
        cart,
        channel: selectedChannel,
        branch: selectedBranch,
        saleDate,
        discountMap: loyaltyDiscountMap,
      })
      const persistedSalesLines = attachLoyaltyToSaleLines(lineRows, saleLoyaltySnapshot, loyaltyDiscountAmount)
      const { error: lineError } = await db.from('sale_lines').insert(persistedSalesLines)
      if (lineError) throw lineError

      const resolvedPayments = (() => {
        // Not: Bu CallCenter akışında parçalı ödeme altyapısı yoktu; bu kısım sadece UI seçimine uyum için
        // "sadakat_points" seçilince tutarı tek payment'a dönüştürür (gösterim/planlama).
        // Tam parçalı ödeme (2 veya daha fazla sale_payments satırı) için backend/closure akışı ayrıca genişletilmelidir.
        if (paymentMethod !== 'sadakat_points') {
          const selectedPayment = PAYMENT_METHODS.find(method => method.method === paymentMethod)
          return [{
            payment_method: paymentMethod,
            payment_method_label: selectedPayment?.label || paymentMethod,
            amount: payableTotal,
          }]
        }

        const wantedTl = Number(sadakatUseAmountTl)
        const requestedUseTl = sadakatUseMode === 'partial'
          ? (Number.isFinite(wantedTl) && wantedTl > 0 ? wantedTl : 0)
          : payableTotal

        // "Puan yetersizse kalanını diğer tiplerle tamamlar" davranışı burada yok.
        // Şimdilik puan seçimi ile toplam tutarı 1 satır olarak closure'a aktarır.
        return [{
          payment_method: 'sadakat_points',
          payment_method_label: 'Sadakat Puan',
          amount: Math.min(payableTotal, requestedUseTl),
        }]
      })()

      for (const p of resolvedPayments) {
        const { error: paymentError } = await db.from('sale_payments').insert({
          sale_id: saleId,
          payment_method: p.payment_method,
          payment_method_label: p.payment_method_label,
          amount: p.amount,
        })
        if (paymentError) throw paymentError
      }


      await postSaleLoyaltyValueLedger({
        saleId,
        saleHeader: persistedSalesHeader,
        saleLines: persistedSalesLines,
        loyaltyCampaign: saleLoyaltySnapshot,
        sourceChannel: runtimeLoyaltyChannel,
        customer: customer?.id
          ? {
            id: customer.id,
            name: customer.ad_soyad || activeCustomerName,
            customerId: customer.id,
            customerName: customer.ad_soyad || activeCustomerName,
            customerCategoryIds,
            selectedCampaignId: appliedLoyaltyCampaign?.campaignId || '',
            selectedCampaignName: appliedLoyaltyCampaign?.campaignName || '',
          }
          : null,
        selectedCouponCode: '',
      })

      await db.from('musteriler').update({
        last_order_at: new Date().toISOString(),
        total_order_count: safeNumber(customer.total_order_count) + 1,
        total_order_amount: safeNumber(customer.total_order_amount) + payableTotal,
        siparis_sayisi: safeNumber(customer.siparis_sayisi) + 1,
        home_branch_id: toDbUuid(selectedBranch?.id),
        home_branch_name: selectedBranch?.name || null,
        updated_at: new Date().toISOString(),
      }).eq('id', customer.id)

      toast('Siparis akisa gonderildi', 'success')
      resetComposer()
      setDrafts([])
      await loadBase()
    } catch (error) {
      toast(`Sipariş gönderilemedi: ${error?.message || 'Bilinmeyen hata'}`, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  async function openOrderDetail(order) {
    setSelectedOrder(order)
    setSelectedOrderLines([])
    setOrderEditMode(false)
    if (order?.kind === 'open_ticket') {
      const openTicketLines = (order.cart_snapshot || []).map((line, index) => ({
        id: line.id || `${order.id}-line-${index + 1}`,
        sale_id: order.id,
        line_no: index + 1,
        product_name: line?.prod?.name || line?.product_name || line?.name || 'Ürün',
        qty: safeNumber(line?.qty, 1),
        unit_gross_before_discount: safeNumber(line?.unitPrice || line?.unit_price),
        line_gross_before_discount: safeNumber(line?.qty, 1) * safeNumber(line?.unitPrice || line?.unit_price),
        unit_gross_after_discount: safeNumber(line?.unitPrice || line?.unit_price),
        line_gross_after_discount: safeNumber(line?.qty, 1) * safeNumber(line?.unitPrice || line?.unit_price),
        line_net_after_discount: safeNumber(line?.qty, 1) * safeNumber(line?.unitPrice || line?.unit_price),
        discount_allocated_amount: 0,
        kds_completed: false,
        line_note: line?.note || null,
      }))
      setSelectedOrderLines(openTicketLines)
      setOrderEditForm({ fulfillmentType: 'table_service', promisedAt: '', lines: [] })
      return
    }
    setOrderDetailLoading(true)
    try {
      const [orderResult, lineResult] = await Promise.all([
        db.from('sales')
          .select('id,sale_no,sale_datetime,status,source_channel_type,sales_channel_name,customer_name,branch_id,branch_name,customer_address_id,kds_status,gross_total_after_discount,payment_total,order_note,kiosk_table_number,fulfillment_type,promised_at,kds_release_at,delivery_address_snapshot')
          .eq('id', order.id)
          .maybeSingle(),
        db.from('sale_lines')
          .select('id,sale_id,line_no,product_name,qty,unit_gross_before_discount,line_gross_before_discount,unit_gross_after_discount,line_gross_after_discount,line_net_after_discount,discount_allocated_amount,kds_completed,line_note')
          .eq('sale_id', order.id)
          .order('line_no', { ascending: true }),
      ])
      let freshOrder = orderResult.data || order
      if (orderResult.error) {
        if (!isMissingCallCenterScheduleColumn(orderResult.error)) throw orderResult.error
        const legacyOrderResult = await db.from('sales')
          .select('id,sale_no,sale_datetime,status,source_channel_type,sales_channel_name,customer_name,branch_id,branch_name,customer_address_id,kds_status,gross_total_after_discount,payment_total,order_note,kiosk_table_number')
          .eq('id', order.id)
          .maybeSingle()
        if (legacyOrderResult.error) throw legacyOrderResult.error
        freshOrder = legacyOrderResult.data || order
      }
      let freshLines = lineResult.data || []
      if (lineResult.error) {
        if (!isMissingColumnError(lineResult.error, 'kds_completed')) throw lineResult.error
        const legacyLineResult = await db.from('sale_lines')
          .select('id,sale_id,line_no,product_name,qty,unit_gross_before_discount,line_gross_before_discount,unit_gross_after_discount,line_gross_after_discount,line_net_after_discount,discount_allocated_amount,line_note')
          .eq('sale_id', order.id)
          .order('line_no', { ascending: true })
        if (legacyLineResult.error) throw legacyLineResult.error
        freshLines = (legacyLineResult.data || []).map(line => ({ ...line, kds_completed: false }))
      }
      freshOrder = normalizeOrderHubSale(normalizeLegacyCallCenterOrder(freshOrder))
      setSelectedOrder(freshOrder)
      setSelectedOrderLines(freshLines)
      setOrderEditForm({
        fulfillmentType: getCallCenterFulfillmentType(freshOrder),
        promisedAt: toDateTimeLocalValue(freshOrder.promised_at || freshOrder.sale_datetime),
        lines: freshLines.map(line => ({
          id: line.id,
          qty: String(safeNumber(line.qty, 1)),
          removed: false,
        })),
      })
    } catch (error) {
      toast(`Siparis detayi acilamadi: ${error?.message || 'Bilinmeyen hata'}`, 'error')
    } finally {
      setOrderDetailLoading(false)
    }
  }

  function selectedOrderEditable(order = selectedOrder, lines = selectedOrderLines) {
    return order?.status === 'completed'
      && order?.kds_status === 'pending'
      && !(lines || []).some(line => line.kds_completed === true)
  }

  function updateOrderEditLine(lineId, patch) {
    setOrderEditForm(current => ({
      ...current,
      lines: current.lines.map(line => line.id === lineId ? { ...line, ...patch } : line),
    }))
  }

  async function saveOrderEdits() {
    if (!selectedOrder?.id || selectedOrder.kind !== 'sale') return
    const promisedDate = new Date(orderEditForm.promisedAt)
    if (Number.isNaN(promisedDate.getTime())) {
      toast('Teslim/alis zamani gecersiz', 'error')
      return
    }
    const nextLineEdits = orderEditForm.lines
      .map(line => ({
        ...line,
        qtyNumber: Math.max(0, safeNumber(line.qty)),
      }))
      .filter(line => !line.removed && line.qtyNumber > 0)
    if (!nextLineEdits.length) {
      toast('Sipariste en az bir urun kalmali', 'error')
      return
    }

    setOrderActionBusy(true)
    try {
      const [latestOrderResult, latestLinesResult] = await Promise.all([
        db.from('sales').select('id,status,kds_status').eq('id', selectedOrder.id).maybeSingle(),
        db.from('sale_lines').select('id,kds_completed').eq('sale_id', selectedOrder.id),
      ])
      if (latestOrderResult.error) throw latestOrderResult.error
      let latestLines = latestLinesResult.data || []
      if (latestLinesResult.error) {
        if (!isMissingColumnError(latestLinesResult.error, 'kds_completed')) throw latestLinesResult.error
        const legacyLatestLinesResult = await db.from('sale_lines').select('id').eq('sale_id', selectedOrder.id)
        if (legacyLatestLinesResult.error) throw legacyLatestLinesResult.error
        latestLines = (legacyLatestLinesResult.data || []).map(line => ({ ...line, kds_completed: false }))
      }
      if (!selectedOrderEditable(latestOrderResult.data, latestLines)) {
        toast('KDS uretime basladigi icin siparis degistirilemez', 'error')
        await openOrderDetail(selectedOrder)
        return
      }

      const editMap = new Map(orderEditForm.lines.map(line => [line.id, line]))
      const keptLines = selectedOrderLines
        .map(line => {
          const edit = editMap.get(line.id) || {}
          const qty = Math.max(0, safeNumber(edit.qty, line.qty))
          if (edit.removed || qty <= 0) return null
          const unitBefore = safeNumber(line.unit_gross_before_discount)
          const unitAfter = safeNumber(line.unit_gross_after_discount, unitBefore)
          const lineBefore = unitBefore * qty
          const lineAfter = unitAfter * qty
          return {
            ...line,
            qty,
            line_gross_before_discount: lineBefore,
            line_gross_after_discount: lineAfter,
            line_net_after_discount: lineAfter,
          }
        })
        .filter(Boolean)
      const removedIds = selectedOrderLines
        .filter(line => !keptLines.some(nextLine => nextLine.id === line.id))
        .map(line => line.id)
      const grossBefore = keptLines.reduce((sum, line) => sum + safeNumber(line.line_gross_before_discount), 0)
      const grossAfter = keptLines.reduce((sum, line) => sum + safeNumber(line.line_gross_after_discount), 0)
      const releaseDate = getCallCenterKdsReleaseAt(promisedDate)
      const nextOrderNote = buildCallCenterOrderNote({
        fulfillmentType: orderEditForm.fulfillmentType,
        promisedAt: promisedDate,
        addressText: getCallCenterAddressSummary(selectedOrder),
        branchName: selectedOrder.branch_name || '',
      })

      const lineUpdateResults = await Promise.all(keptLines.map((line, index) => db.from('sale_lines').update({
        line_no: index + 1,
        qty: line.qty,
        line_gross_before_discount: line.line_gross_before_discount,
        line_gross_after_discount: line.line_gross_after_discount,
        line_net_after_discount: line.line_net_after_discount,
      }).eq('id', line.id)))
      const lineUpdateError = lineUpdateResults.find(result => result.error)?.error
      if (lineUpdateError) throw lineUpdateError
      if (removedIds.length) {
        const deleteResult = await db.from('sale_lines').delete().in('id', removedIds)
        if (deleteResult.error) throw deleteResult.error
      }

      const updatePayload = {
        fulfillment_type: orderEditForm.fulfillmentType,
        promised_at: promisedDate.toISOString(),
        kds_release_at: releaseDate.toISOString(),
        kiosk_table_number: orderEditForm.fulfillmentType === 'delivery' ? 'Teslimat' : 'Gel-al',
        order_note: nextOrderNote,
        gross_total_before_discount: grossBefore,
        gross_total_after_discount: grossAfter,
        net_total_after_discount: grossAfter,
        payment_total: grossAfter,
        updated_at: new Date().toISOString(),
      }
      let updateResult = await db.from('sales').update(updatePayload).eq('id', selectedOrder.id)
      if (updateResult.error && isMissingCallCenterScheduleColumn(updateResult.error)) {
        const {
          fulfillment_type: _fulfillmentType,
          promised_at: _promisedAt,
          kds_release_at: _kdsReleaseAt,
          delivery_address_snapshot: _deliveryAddressSnapshot,
          ...legacyUpdatePayload
        } = updatePayload
        updateResult = await db.from('sales').update({
          ...legacyUpdatePayload,
          sale_datetime: releaseDate.toISOString(),
        }).eq('id', selectedOrder.id)
      }
      if (updateResult.error) throw updateResult.error

      toast('Siparis guncellendi', 'success')
      setOrderEditMode(false)
      await openOrderDetail(selectedOrder)
      await loadBase()
    } catch (error) {
      toast(`Siparis guncellenemedi: ${error?.message || 'Bilinmeyen hata'}`, 'error')
    } finally {
      setOrderActionBusy(false)
    }
  }

  async function cancelSelectedOrder() {
    if (!selectedOrder?.id || selectedOrder.kind !== 'sale') return
    setOrderActionBusy(true)
    try {
      const [latestOrderResult, latestLinesResult] = await Promise.all([
        db.from('sales').select('id,status,kds_status').eq('id', selectedOrder.id).maybeSingle(),
        db.from('sale_lines').select('id,kds_completed').eq('sale_id', selectedOrder.id),
      ])
      if (latestOrderResult.error) throw latestOrderResult.error
      let latestLines = latestLinesResult.data || []
      if (latestLinesResult.error) {
        if (!isMissingColumnError(latestLinesResult.error, 'kds_completed')) throw latestLinesResult.error
        const legacyLatestLinesResult = await db.from('sale_lines').select('id').eq('sale_id', selectedOrder.id)
        if (legacyLatestLinesResult.error) throw legacyLatestLinesResult.error
        latestLines = (legacyLatestLinesResult.data || []).map(line => ({ ...line, kds_completed: false }))
      }
      if (!selectedOrderEditable(latestOrderResult.data, latestLines)) {
        toast('KDS uretime basladigi icin siparis iptal edilemez', 'error')
        await openOrderDetail(selectedOrder)
        return
      }
      const result = await db.from('sales').update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      }).eq('id', selectedOrder.id)
      if (result.error) throw result.error
      toast('Siparis iptal edildi', 'success')
      setSelectedOrder(null)
      setSelectedOrderLines([])
      await loadBase()
    } catch (error) {
      toast(`Siparis iptal edilemedi: ${error?.message || 'Bilinmeyen hata'}`, 'error')
    } finally {
      setOrderActionBusy(false)
    }
  }

  function saveDraft() {
    const draft = {
      id: uid(),
      customerName: activeCustomerName || customerSearch || 'Müşteri seçilmedi',
      branchName: selectedBranch?.name || '',
      fulfillmentType,
      total,
      createdAt: new Date().toISOString(),
      cartCount: cart.length,
    }
    setDrafts(current => [draft, ...current])
    toast('Taslak bu oturumda saklandı', 'success')
  }

  function resetComposer() {
    setIsComposerOpen(false)
    setStep('customer')
    setOrderTab('menu')
    setFulfillmentType('delivery')
    setCart([])
    setCustomerSearch('')
    setShowNewCustomerForm(false)
    setSelectedCustomer(null)
    setCustomerCategoryIds([])
    setCustomers([])
    setCustomerAddresses([])
    setSelectedAddressId('')
    setAddressEditorMode('none')
    setSelectedBranchSource('fallback')
    setHasManualBranchSelection(false)
    setPendingBranchOverride(null)
    setManualTriggeredCampaignIds([])
    setSelectedLoyaltyCampaignId('')
    setCustomerForm(EMPTY_CUSTOMER_FORM)
    setAddressForm(EMPTY_ADDRESS_FORM)
    setPickupAt(nowInputValue())
    setDeliveryAt(nowInputValue())
    setBranchSearch('')
    setProductSearch('')
    setSelectedCategoryId('all')
    setPaymentMethod('nakit')
    setHistory([])
  }

  const canGoOrder = !validateBeforeOrder()

  if (loading) {
    return (
      <div>
        <Header title="Siparisler" subtitle="Merkez işlemleri altında telefonla sipariş alma" />
        <div className="card" style={{ padding: 40, color: '#64748b', textAlign: 'center' }}>
          <i className="fa-solid fa-spinner fa-spin" /> Siparisler yukleniyor...
        </div>
      </div>
    )
  }

  const selectedOrderStatusMeta = selectedOrder ? getOrderHubStatusMeta(selectedOrder) : null
  const selectedOrderCanEdit = selectedOrder?.kind === 'sale' && getOrderHubSourceMeta(selectedOrder).group === 'call_center' && selectedOrderEditable()

  return (
    <div>
      <Header
        title="Siparisler"
        subtitle="Tum satis kanallarini izle, filtrele ve gerekirse yeni siparis olustur"
        actions={(
          <>
            <button className="btn-o" onClick={loadBase} title="Yenile">
              <i className="fa-solid fa-rotate-right" />
            </button>
            <button className="btn-p" onClick={() => {
              resetComposer()
              setIsComposerOpen(true)
            }}>
              <i className="fa-solid fa-plus" /> Yeni Siparis
            </button>
          </>
        )}
      />

      <div style={{
        display: isComposerOpen ? 'grid' : 'none',
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        background: 'rgba(15,23,42,.55)',
        backdropFilter: 'blur(3px)',
        padding: 24,
        gridTemplateColumns: 'minmax(0,1fr) 380px',
        gap: 16,
        alignItems: 'start',
        overflowY: 'auto',
      }}>
        <main className="card" style={{ overflow: 'hidden', minHeight: 680 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '10px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {STEPS.map((item, index) => {
                const active = step === item.key
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setStep(item.key)}
                    style={{
                      border: 'none',
                      background: active ? '#fff' : 'transparent',
                      color: active ? '#2563eb' : '#64748b',
                      padding: '9px 12px',
                      borderRadius: 8,
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <i className={`fa-solid ${item.icon}`} /> {item.label}
                    {index < STEPS.length - 1 && <span style={{ color: '#cbd5e1', marginLeft: 4 }}><i className="fa-solid fa-chevron-right" /></span>}
                  </button>
                )
              })}
            </div>
            <button className="btn-o" onClick={resetComposer}>İptal</button>
          </div>

          {step === 'customer' && (
            <section style={{ padding: 24, display: 'grid', placeItems: 'center', minHeight: 560 }}>
              <div style={{ width: 'min(540px, 100%)' }}>
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                  <i className="fa-solid fa-magnifying-glass" style={{ fontSize: 36, color: '#64748b' }} />
                  <h2 style={{ fontSize: '1.1rem', margin: '14px 0 4px', color: '#0f172a' }}>Müşterinin telefon numarasını veya adını girin</h2>
                  <p style={{ margin: 0, color: '#94a3b8', fontSize: '.86rem' }}>Kayıtlı müşteri bulunursa seçin; bulunamazsa yeni müşteri oluşturun.</p>
                </div>
                <input
                  className="f-input"
                  value={customerSearch}
                  onChange={event => {
                    setCustomerSearch(event.target.value)
                    if (event.target.value.trim()) setShowNewCustomerForm(false)
                    setCustomerForm(current => ({ ...current, phone: event.target.value.startsWith('+') ? event.target.value : current.phone }))
                  }}
                  placeholder="+90 5xx xxx xx xx veya müşteri adı"
                  style={{ height: 48, fontSize: '1rem' }}
                />
                {customerSearch.trim().length >= 3 && (
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, marginTop: 8, overflow: 'hidden', background: '#fff', boxShadow: '0 12px 26px rgba(15,23,42,.08)' }}>
                    {customerSearchPhoneDigits.length >= 10 && customers.length > 1 && (
                      <div style={{ padding: '12px 16px', background: '#fff7ed', color: '#9a3412', fontSize: '.8rem', borderBottom: '1px solid #fed7aa', fontWeight: 700 }}>
                        Bu numarayla birden fazla müşteri kaydı bulundu. Devam etmek için doğru ismi seçin.
                      </div>
                    )}
                    {customers.length === 0 ? (
                      <div>
                        <div style={{ padding: 16, color: '#94a3b8', fontStyle: 'italic' }}>Hiçbir şey bulunamadı</div>
                        <button type="button" onClick={prepareNewCustomer} style={{ width: '100%', border: 'none', borderTop: '1px solid #f1f5f9', padding: 16, textAlign: 'left', background: '#f8fafc', color: '#2563eb', fontWeight: 800, cursor: 'pointer' }}>
                          <i className="fa-solid fa-user-plus" /> Yeni müşteri ekle
                        </button>
                      </div>
                    ) : customers.map(customer => (
                      <button key={customer.id} type="button" onClick={() => selectCustomer(customer)} style={{ width: '100%', border: 'none', borderBottom: '1px solid #f1f5f9', padding: 14, background: '#fff', textAlign: 'left', cursor: 'pointer' }}>
                        <div style={{ fontWeight: 900, color: '#0f172a' }}>{customer.ad_soyad}</div>
                        <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: 3 }}>{customer.telefon_ulke || '+90'} {customer.telefon || ''} · {customer.total_order_count || customer.siparis_sayisi || 0} sipariş</div>
                      </button>
                    ))}
                  </div>
                )}

                {showNewCustomerForm && !selectedCustomer && (
                  <div style={{ marginTop: 22, display: 'grid', gap: 12 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <label>
                        <span className="f-label">Ad *</span>
                        <input className="f-input" value={customerForm.firstName} onChange={event => setCustomerForm(current => ({ ...current, firstName: event.target.value }))} />
                      </label>
                      <label>
                        <span className="f-label">Soyad *</span>
                        <input className="f-input" value={customerForm.lastName} onChange={event => setCustomerForm(current => ({ ...current, lastName: event.target.value }))} />
                      </label>
                    </div>
                    <label>
                      <span className="f-label">Telefon</span>
                      <input className="f-input" value={customerForm.phone} onChange={event => setCustomerForm(current => ({ ...current, phone: event.target.value }))} />
                    </label>
                    <label>
                      <span className="f-label">Not</span>
                      <textarea className="f-input" value={customerForm.note} onChange={event => setCustomerForm(current => ({ ...current, note: event.target.value }))} rows={4} />
                    </label>
                    <div style={{ textAlign: 'right' }}>
                      <button className="btn-p" onClick={() => setStep('fulfillment')} disabled={!customerDisplayName(null, customerForm)}>
                        İleri
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {step === 'fulfillment' && (
            <section>
              <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid #e2e8f0', padding: '0 16px' }}>
                {[
                  ['delivery', 'Teslimat'],
                  ['pickup', 'Gel-al'],
                ].map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setFulfillmentType(key)} style={{ border: 'none', background: 'transparent', padding: '14px 2px 12px', marginRight: 22, borderBottom: fulfillmentType === key ? '3px solid #0ea5e9' : '3px solid transparent', color: fulfillmentType === key ? '#0284c7' : '#334155', fontWeight: 800, cursor: 'pointer' }}>
                    {label}
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: fulfillmentType === 'delivery' ? '1fr 1fr 1fr' : '1fr 1fr', minHeight: 560 }}>
                {fulfillmentType === 'delivery' && (
                  <div style={{ padding: 16, borderRight: '1px solid #e2e8f0' }}>
                    <h3 style={{ margin: '0 0 14px', fontSize: '.86rem', color: '#0f172a' }}>Nereye</h3>
                    {customerAddresses.length > 0 && (
                      <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
                        {customerAddresses.map(address => {
                          const active = selectedAddressId === address.id && addressEditorMode === 'none'
                          const editing = selectedAddressId === address.id && addressEditorMode === 'edit'
                          const serviceBranchMeta = readServiceBranchMeta(address)
                          return (
                            <div key={address.id} style={{ border: `1px solid ${editing ? '#f59e0b' : active ? '#0ea5e9' : '#e2e8f0'}`, background: editing ? '#fffbeb' : active ? '#f0f9ff' : '#fff', borderRadius: 10, padding: 12 }}>
                              <div style={{ fontSize: '.74rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>{address.label || 'Adres'}</div>
                              <div style={{ fontWeight: 800, color: '#0f172a', lineHeight: 1.45 }}>{addressLabel(address)}</div>
                              {serviceBranchMeta.branchName && (
                                <div style={{ marginTop: 8, fontSize: '.76rem', color: '#475569' }}>
                                  Varsayılan şube: <strong>{serviceBranchMeta.branchName}</strong>
                                </div>
                              )}
                              <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button className={active ? 'btn-p' : 'btn-o'} type="button" onClick={() => selectExistingAddress(address)}>
                                  {active ? 'Seçili Adres' : 'Bu Adresi Seç'}
                                </button>
                                <button className="btn-o" type="button" onClick={() => startEditAddress(address)}>
                                  Düzenle
                                </button>
                              </div>
                            </div>
                          )
                        })}
                        <button className="btn-o" onClick={startNewAddress}>Yeni adres ekle</button>
                      </div>
                    )}
                    {customerAddresses.length === 0 && addressEditorMode === 'none' && (
                      <div style={{ border: '1px dashed #cbd5e1', borderRadius: 10, padding: 14, marginBottom: 14, color: '#64748b', fontSize: '.82rem', lineHeight: 1.5 }}>
                        Kayıtlı adres yok. Yeni adres ekle ile ilk teslimat adresini oluşturabilirsiniz.
                        <div style={{ marginTop: 12 }}>
                          <button className="btn-o" type="button" onClick={startNewAddress}>Yeni adres ekle</button>
                        </div>
                      </div>
                    )}
                    {addressEditorMode !== 'none' && (
                      <div style={{ display: 'grid', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <div style={{ fontSize: '.82rem', fontWeight: 800, color: '#0f172a' }}>
                            {addressEditorMode === 'edit' ? 'Adres düzenle' : 'Yeni adres ekle'}
                          </div>
                          {customerAddresses.length > 0 && (
                            <button className="btn-o" type="button" onClick={() => {
                              setAddressEditorMode('none')
                              if (selectedExistingAddress?.id) syncAddressForm(selectedExistingAddress)
                            }}>
                              Vazgeç
                            </button>
                          )}
                        </div>
                        <input className="f-input" placeholder="Adres başlığı (Ev, İş, Yazlık) *" value={addressForm.label} onChange={event => setAddressForm(current => ({ ...current, label: event.target.value }))} />
                        {!hasLocationReferenceData && (
                          <div style={{ border: '1px solid #fecaca', background: '#fef2f2', color: '#991b1b', borderRadius: 10, padding: '10px 12px', fontSize: '.8rem', lineHeight: 1.45 }}>
                            Adres referans verisi Railway Postgres tarafinda eksik. tr_iller, tr_ilceler ve tr_mahalleler
                            tablolarina canli veri yazilmadan bu demo akisi DB-first olarak tamamlanmis sayilamaz.
                          </div>
                        )}
                        <select className="f-input" value={addressForm.cityId} onChange={event => {
                          const city = cities.find(row => String(row.id) === event.target.value)
                          setAddressForm(current => ({ ...current, cityId: event.target.value, cityName: city?.ad || '', districtId: '', districtName: '', neighborhoodId: '', neighborhoodName: '', street: '' }))
                        }} disabled={!hasLocationReferenceData}>
                          <option value="">Şehir *</option>
                          {cities.map(city => <option key={city.id} value={city.id}>{city.ad}</option>)}
                        </select>
                        <select className="f-input" value={addressForm.districtId} onChange={event => {
                          const district = districts.find(row => String(row.id) === event.target.value)
                          setAddressForm(current => ({ ...current, districtId: event.target.value, districtName: district?.ad || '', neighborhoodId: '', neighborhoodName: '', street: '' }))
                        }} disabled={!hasLocationReferenceData || !addressForm.cityId}>
                          <option value="">İlçe *</option>
                          {districts.map(district => <option key={district.id} value={district.id}>{district.ad}</option>)}
                        </select>
                        <select className="f-input" value={addressForm.neighborhoodId} onChange={event => {
                          const neighborhood = neighborhoods.find(row => String(row.id) === event.target.value)
                          setAddressForm(current => ({ ...current, neighborhoodId: event.target.value, neighborhoodName: neighborhood?.ad || '', street: '' }))
                        }} disabled={!hasLocationReferenceData || !addressForm.districtId}>
                          <option value="">Mahalle *</option>
                          {neighborhoods.map(neighborhood => <option key={neighborhood.id} value={neighborhood.id}>{neighborhood.ad}</option>)}
                        </select>
                        <select
                          className="f-input"
                          value={addressForm.street}
                          onChange={event => setAddressForm(current => ({ ...current, street: event.target.value }))}
                          disabled={!hasLocationReferenceData || !addressForm.neighborhoodId || !streets.length}
                        >
                          <option value="">{streets.length ? 'Sokak / Cadde *' : 'Bu mahalle için sokak/cadde verisi yok'}</option>
                          {streets.map(street => <option key={street.id} value={street.ad}>{street.ad}</option>)}
                        </select>
                        <input className="f-input" placeholder="Bina adı" value={addressForm.buildingName} onChange={event => setAddressForm(current => ({ ...current, buildingName: event.target.value }))} />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                          <input className="f-input" placeholder="Kapı no" value={addressForm.buildingNo} onChange={event => setAddressForm(current => ({ ...current, buildingNo: event.target.value }))} />
                          <input className="f-input" placeholder="Kat" value={addressForm.floorNo} onChange={event => setAddressForm(current => ({ ...current, floorNo: event.target.value }))} />
                          <input className="f-input" placeholder="Daire" value={addressForm.doorNo} onChange={event => setAddressForm(current => ({ ...current, doorNo: event.target.value }))} />
                        </div>
                        <textarea className="f-input" placeholder="Serbest adres tarifi" rows={4} value={addressForm.directions} onChange={event => setAddressForm(current => ({ ...current, directions: event.target.value }))} />
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <button className="btn-p" type="button" onClick={saveAddressEditor}>
                            {addressEditorMode === 'edit' ? 'Adresi Güncelle' : 'Adresi Kaydet'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ padding: 16, borderRight: '1px solid #e2e8f0' }}>
                  <h3 style={{ margin: '0 0 14px', fontSize: '.86rem', color: '#0f172a' }}>Ne zaman</h3>
                  <button type="button" className="btn-o" onClick={() => fulfillmentType === 'delivery' ? setDeliveryAt(nowInputValue()) : setPickupAt(nowInputValue())} style={{ width: '100%', justifyContent: 'center', marginBottom: 10 }}>
                    Olabildiğince çabuk
                  </button>
                  <input className="f-input" type="datetime-local" value={fulfillmentType === 'delivery' ? deliveryAt : pickupAt} onChange={event => fulfillmentType === 'delivery' ? setDeliveryAt(event.target.value) : setPickupAt(event.target.value)} />
                </div>

                <div style={{ padding: 16 }}>
                  <h3 style={{ margin: '0 0 14px', fontSize: '.86rem', color: '#0f172a' }}>Nereden</h3>
                  <input className="f-input" placeholder="Şube adı, cadde veya sokak ara" value={branchSearch} onChange={event => setBranchSearch(event.target.value)} />
                  {selectedBranch?.id && (
                    <div style={{ marginTop: 10, marginBottom: 10, border: '1px solid #dbe4ef', borderRadius: 10, padding: 12, background: '#f8fafc' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 900, color: '#0f172a' }}>{selectedBranch.name}</div>
                          <div style={{ fontSize: '.76rem', color: '#64748b', marginTop: 4 }}>{selectedBranchBadge || 'Şube seçildi'}</div>
                        </div>
                        {selectedBranchBadge && (
                          <span style={{ padding: '6px 10px', borderRadius: 999, background: '#e0f2fe', color: '#0369a1', fontSize: '.7rem', fontWeight: 900 }}>
                            {selectedBranchBadge}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {pendingBranchOverride && (
                    <div style={{ marginTop: 10, marginBottom: 10, border: '1px solid #fcd34d', background: '#fffbeb', borderRadius: 10, padding: 12 }}>
                      <div style={{ fontSize: '.82rem', fontWeight: 800, color: '#92400e', lineHeight: 1.45 }}>
                        Bu değişiklik yalnız bu sipariş için mi geçerli olsun, yoksa bu adresin varsayılan şubesi olarak kaydedilsin mi?
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                        <button className="btn-o" type="button" onClick={() => confirmBranchOverride(false)}>
                          Sadece bu sipariş
                        </button>
                        <button className="btn-p" type="button" onClick={() => confirmBranchOverride(true)}>
                          Bu adres için varsayılan yap
                        </button>
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                    {groupedBranches.recommended.length > 0 && (
                      <>
                        <div style={{ fontSize: '.74rem', fontWeight: 900, color: '#0284c7', textTransform: 'uppercase', letterSpacing: '.04em' }}>Önerilen Şubeler</div>
                        {groupedBranches.recommended.map(branch => {
                          const active = selectedBranchId === branch.id
                          const badge = BRANCH_SOURCE_LABELS[branch.recommendationSource] || ''
                          return (
                            <button key={branch.id} type="button" onClick={() => handleBranchSelection(branch)} style={{ textAlign: 'left', border: `1px solid ${active ? '#0ea5e9' : '#bae6fd'}`, background: active ? '#0ea5e9' : '#f8fbff', color: active ? '#fff' : '#0f172a', borderRadius: 9, padding: 12, cursor: 'pointer' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                <div style={{ fontWeight: 900 }}>{branch.name}</div>
                                {badge && <span style={{ fontSize: '.68rem', fontWeight: 900, opacity: active ? .95 : .8 }}>{badge}</span>}
                              </div>
                              <div style={{ fontSize: '.76rem', marginTop: 3, opacity: .8 }}>{branch.parentName || 'Şube'} · 7/24</div>
                              {branch.address && <div style={{ fontSize: '.74rem', marginTop: 5, opacity: .78 }}>{branch.address}</div>}
                            </button>
                          )
                        })}
                      </>
                    )}
                    {groupedBranches.others.length > 0 && (
                      <>
                        <div style={{ fontSize: '.74rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em', marginTop: groupedBranches.recommended.length > 0 ? 6 : 0 }}>Diğer Şubeler</div>
                        {groupedBranches.others.map(branch => {
                          const active = selectedBranchId === branch.id
                          return (
                            <button key={branch.id} type="button" onClick={() => handleBranchSelection(branch)} style={{ textAlign: 'left', border: `1px solid ${active ? '#0ea5e9' : '#e2e8f0'}`, background: active ? '#0ea5e9' : '#fff', color: active ? '#fff' : '#0f172a', borderRadius: 9, padding: 12, cursor: 'pointer' }}>
                              <div style={{ fontWeight: 900 }}>{branch.name}</div>
                              <div style={{ fontSize: '.76rem', marginTop: 3, opacity: .8 }}>{branch.parentName || 'Şube'} · 7/24</div>
                              {branch.address && <div style={{ fontSize: '.74rem', marginTop: 5, opacity: .78 }}>{branch.address}</div>}
                            </button>
                          )
                        })}
                      </>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', marginTop: 16 }}>
                    <button className="btn-p" onClick={() => {
                      const message = validateBeforeOrder()
                      if (message) toast(message, 'error')
                      else setStep('order')
                    }}>
                      İleri
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {step === 'order' && (
            <section>
              <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid #e2e8f0', padding: '0 16px' }}>
                {[
                  ['menu', 'Menü'],
                  ['campaigns', 'Kampanyalar'],
                  ['history', 'Geçmiş'],
                ].map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setOrderTab(key)} style={{ border: 'none', background: 'transparent', padding: '14px 2px 12px', marginRight: 22, borderBottom: orderTab === key ? '3px solid #0ea5e9' : '3px solid transparent', color: orderTab === key ? '#0284c7' : '#334155', fontWeight: 800, cursor: 'pointer' }}>
                    {label}
                  </button>
                ))}
              </div>
              {orderTab === 'menu' && (
                <div style={{ padding: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, marginBottom: 16 }}>
                    <select className="f-input" value={selectedCategoryId} onChange={event => setSelectedCategoryId(event.target.value)}>
                      {categoryRows.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </select>
                    <input className="f-input" placeholder="Ürün ara" value={productSearch} onChange={event => setProductSearch(event.target.value)} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px,1fr))', gap: 12 }}>
                    {filteredProducts.map(product => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => addProduct(product)}
                        style={{
                          minHeight: 96,
                          border: '1px solid #dbe4ef',
                          borderRadius: 8,
                          background: product.pos_color || '#fff',
                          color: product.pos_text_color || '#0f172a',
                          textAlign: 'left',
                          padding: 12,
                          cursor: 'pointer',
                          boxShadow: '0 1px 3px rgba(15,23,42,.08)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'stretch', gap: 12 }}>
                          <div
                            style={{
                              width: 86,
                              height: 76,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              borderRadius: 10,
                              overflow: 'hidden',
                              background: 'rgba(15,23,42,.04)',
                            }}
                          >
                            {product.pos_image ? (
                              <img
                                src={product.pos_image}
                                alt={product.name || product.short_name || ''}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                              />
                            ) : null}
                          </div>
                          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
                            <div style={{ fontWeight: 900, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {product.short_name || product.name}
                            </div>
                            <div style={{ textAlign: 'right', fontWeight: 900 }}>
                              ₺{money(getProductPrice(product, selectedChannelId))}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {orderTab === 'campaigns' && (
                <div style={{ padding: 16, display: 'grid', gap: 10 }}>
                  {campaignCatalogIssues.length > 0 && (
                    <div style={{ border: '1px solid #fde68a', background: '#fffbeb', color: '#92400e', borderRadius: 8, padding: 12, fontSize: '.82rem' }}>
                      {campaignCatalogIssues[0]}
                    </div>
                  )}
                  {visibleRuntimeCampaigns.length === 0 ? (
                    <div style={{ color: '#94a3b8', padding: 24 }}>Sadakat modülünden gelen uygun kampanya bulunamadı.</div>
                  ) : visibleRuntimeCampaigns.map(campaign => {
                    const campaignId = String(campaign.id || '').trim()
                    const alreadyTriggered = manualTriggeredCampaignIds.includes(campaignId)
                    return (
                      <>
                      <CallCenterLoyaltyCampaignCard
                        key={campaign.id}
                        campaign={campaign}
                        runtimeChannelLabel={getRuntimeChannelLabel(runtimeLoyaltyChannel)}
                        isSelected={String(selectedLoyaltyCampaignId || '') === campaignId}
                        onToggleManualTrigger={() => {
                          setManualTriggeredCampaignIds(prev => (
                            alreadyTriggered
                              ? prev.filter(value => value !== campaignId)
                              : [...prev, campaignId]
                          ))
                        }}
                        onToggleSelection={() => setSelectedLoyaltyCampaignId(
                          String(selectedLoyaltyCampaignId || '') === campaignId ? '' : campaignId,
                        )}
                      />
                      <div style={{ color: '#64748b', marginTop: 4, fontSize: '.84rem' }}>{campaign.description || `${campaign.reward_type} · ${campaign.reward_value || 0}`}</div>
                      </>
                    )
                  })}
                </div>
              )}
              {orderTab === 'history' && (
                <div style={{ padding: 16 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
                    <thead><tr style={{ background: '#f8fafc' }}>{['Sipariş No', 'Tarih', 'Şube', 'Detay', 'Toplam'].map(label => <th key={label} style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid #e2e8f0' }}>{label}</th>)}</tr></thead>
                    <tbody>
                      {history.length === 0 ? <tr><td colSpan={5} style={{ padding: 22, color: '#94a3b8' }}>Geçmiş sipariş bulunamadı.</td></tr> : history.map(row => (
                        <tr key={row.id}>
                          <td style={{ padding: 10, borderBottom: '1px solid #f1f5f9' }}>{row.sale_no || row.id.slice(0, 8)}</td>
                          <td style={{ padding: 10, borderBottom: '1px solid #f1f5f9' }}>{new Date(row.sale_datetime).toLocaleString('tr-TR')}</td>
                          <td style={{ padding: 10, borderBottom: '1px solid #f1f5f9' }}>{row.branch_name || '-'}</td>
                          <td style={{ padding: 10, borderBottom: '1px solid #f1f5f9' }}>{row.order_note || '-'}</td>
                          <td style={{ padding: 10, borderBottom: '1px solid #f1f5f9', fontWeight: 900 }}>₺{money(row.gross_total_after_discount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {step === 'payment' && (
            <section style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, minHeight: 560 }}>
              <div>
                <h3 style={{ margin: '0 0 14px', fontSize: '.86rem', color: '#0f172a' }}>Ödeme Tipleri</h3>
                <div style={{ display: 'grid', gap: 10 }}>
                  {PAYMENT_METHODS.map(method => (
                    <button key={method.method} type="button" onClick={() => setPaymentMethod(method.method)} style={{ border: `1px solid ${paymentMethod === method.method ? '#0ea5e9' : '#e2e8f0'}`, background: paymentMethod === method.method ? '#e0f2fe' : '#fff', borderRadius: 8, padding: 14, textAlign: 'left', fontWeight: 900, color: '#0f172a', cursor: 'pointer' }}>
                      <i className={`fa-solid ${method.icon}`} style={{ color: '#0284c7', marginRight: 8 }} /> {method.label}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => {
                      toast('Sadakat puan ile odeme burn executor tamamlanana kadar kapali.', 'error')
                    }}
                    disabled={walletLoading}
                    style={{
                      border: `1px solid ${paymentMethod === 'sadakat_points' ? '#0ea5e9' : '#e2e8f0'}`,
                      background: paymentMethod === 'sadakat_points' ? '#e0f2fe' : '#fff',
                      borderRadius: 8,
                      padding: 14,
                      textAlign: 'left',
                      fontWeight: 900,
                      color: '#0f172a',
                      cursor: walletLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <i className="fa-solid fa-coins" style={{ color: '#0284c7', marginRight: 8 }} /> Sadakat Puan
                    <div style={{ fontSize: '.78rem', color: '#64748b', fontWeight: 800, marginTop: 6 }}>
                      {walletBalanceLabel}
                    </div>
                    <div style={{ fontSize: '.76rem', color: '#94a3b8', fontWeight: 800, marginTop: 6 }}>
                      {walletLoading
                        ? ''
                        : (walletReadiness?.status === 'ambiguous_program_context'
                          ? `${walletReadiness.candidateWalletCount || 0} wallet bulundu`
                          : `Açık kalan: ₺${money(payableTotal)}`)}
                    </div>
                  </button>

                  {paymentMethod === 'sadakat_points' && (
                    <div style={{ border: '1px dashed #cbd5e1', borderRadius: 10, padding: 12, marginTop: 4, background: '#fff' }}>
                      <div style={{ fontSize: '.78rem', color: '#64748b', fontWeight: 900, marginBottom: 8 }}>Sadakat puanı kullanımı</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => setSadakatUseMode('all')}
                          style={{
                            border: `1px solid ${sadakatUseMode === 'all' ? '#0ea5e9' : '#e2e8f0'}`,
                            background: sadakatUseMode === 'all' ? '#e0f2fe' : '#fff',
                            borderRadius: 8,
                            padding: '8px 10px',
                            fontWeight: 900,
                            color: '#0f172a',
                            cursor: 'pointer',
                          }}
                        >
                          Hepsini kullan
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSadakatUseMode('partial')
                            if (!sadakatUseAmountTl) setSadakatUseAmountTl(String(Math.floor(payableTotal * 100) / 100))
                          }}
                          style={{
                            border: `1px solid ${sadakatUseMode === 'partial' ? '#0ea5e9' : '#e2e8f0'}`,
                            background: sadakatUseMode === 'partial' ? '#e0f2fe' : '#fff',
                            borderRadius: 8,
                            padding: '8px 10px',
                            fontWeight: 900,
                            color: '#0f172a',
                            cursor: 'pointer',
                          }}
                        >
                          Kısmını kullan
                        </button>
                      </div>

                      {sadakatUseMode === 'partial' && (
                        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                          <label style={{ display: 'grid', gap: 6 }}>
                            <span style={{ fontSize: '.78rem', fontWeight: 900, color: '#475569' }}>Puan karşılığı kullanılacak tutar (₺)</span>
                            <input
                              className="f-input"
                              value={sadakatUseAmountTl}
                              onChange={e => setSadakatUseAmountTl(e.target.value)}
                              placeholder="Örn: 500"
                            />
                          </label>
                          <div style={{ fontSize: '.76rem', color: '#94a3b8', fontWeight: 800 }}>
                            Puan bakiyesi yaklaşık olarak ₺{money(pointsBalance)} karşılığı kabul ediliyor.
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              </div>
              <div style={{ borderLeft: '1px solid #e2e8f0', paddingLeft: 16 }}>
                <h3 style={{ margin: '0 0 14px', fontSize: '.86rem', color: '#0f172a' }}>Sipariş Özeti</h3>
                <SidebarCard icon="fa-user" title="Müşteri" value={activeCustomerName} />
                <SidebarCard icon="fa-location-dot" title={fulfillmentType === 'delivery' ? 'Teslimat' : 'Gel-al'} value={fulfillmentType === 'delivery' ? selectedAddressSummary : selectedBranch?.name} />
                <div style={{ height: 12 }} />
                <SidebarCard icon="fa-clock" title="Zaman" value={new Date(promisedAt).toLocaleString('tr-TR')} />
                <div style={{ height: 12 }} />
                <SidebarCard icon="fa-clock" title="Zaman" value={new Date(promisedAt).toLocaleString('tr-TR')} />

                {appliedLoyaltyCampaign && (
                  <>
                    <div style={{ height: 12 }} />
                    <SidebarCard icon="fa-gift" title="Sadakat avantajı" value={`${appliedLoyaltyCampaign.campaignName} · ${appliedLoyaltyCampaign.offerLabel || appliedLoyaltyCampaign.discountType || 'Hazır avantaj'}`} />
                  </>
                )}

                <div style={{ height: 22 }} />

                {loyaltyDiscountAmount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#0284c7', fontWeight: 800, marginBottom: 10 }}>
                    <span>Sadakat indirimi</span>
                    <span>-₺{money(loyaltyDiscountAmount)}</span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: 16, fontWeight: 900, fontSize: '1.15rem' }}>
                  <span>Ödenecek</span>
                  <span>₺{money(payableTotal)}</span>
                </div>

              </div>
            </section>
          )}

        </main>

        <aside className="card" style={{ overflow: 'hidden', position: 'sticky', top: 24 }}>
          <div style={{ background: '#e8eef7', padding: 16, display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 900, color: '#0f172a' }}>
              <span>{selectedBranch?.name ? `${selectedBranch.name} | ` : ''}Yeni Sipariş</span>
              <span>{promisedAt ? new Date(promisedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
            </div>
            <SidebarCard icon="fa-user" title={activeCustomerName || '-'} value={customerForm.phone || selectedCustomer?.telefon || '-'} />
            <SidebarCard icon="fa-utensils" title="Müşteri sayısı" value="1" />
            {appliedLoyaltyCampaign && (
              <SidebarCard icon="fa-gift" title="Seçili sadakat" value={appliedLoyaltyCampaign.campaignName || appliedLoyaltyCampaign.offerLabel} />
            )}
            <SidebarCard icon="fa-location-dot" title="Adres / Şube" value={fulfillmentType === 'delivery' ? selectedAddressSummary : selectedBranch?.name} />
          </div>

          <div style={{ minHeight: 430, padding: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 90px', color: '#64748b', fontSize: '.74rem', fontWeight: 800, borderBottom: '1px solid #e2e8f0', paddingBottom: 8 }}>
              <span>Ad</span><span style={{ textAlign: 'right' }}>Miktar</span><span style={{ textAlign: 'right' }}>Fiyat</span>
            </div>
            {cart.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>Sepet boş</div>
            ) : cart.map(item => (
              <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 90px', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: '1px solid #f1f5f9', fontSize: '.82rem' }}>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>{item.product.short_name || item.product.name}</div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 5 }}>
                  <button type="button" onClick={() => updateCartQty(item.id, -1)} style={{ width: 22, height: 22, border: '1px solid #cbd5e1', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>-</button>
                  <span>{item.qty}</span>
                  <button type="button" onClick={() => updateCartQty(item.id, 1)} style={{ width: 22, height: 22, border: '1px solid #cbd5e1', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>+</button>
                </div>
                <div style={{ textAlign: 'right', fontWeight: 900 }}>₺{money(item.qty * item.unitPrice)}</div>
              </div>
            ))}
          </div>

          <div style={{ background: '#e8eef7', padding: '13px 16px', display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '1.05rem' }}>
            <span>TOPLAM</span>
            <span>₺{money(payableTotal)}</span>
          </div>
          <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, alignItems: 'center' }}>
            <button className="btn-o" onClick={saveDraft} title="Taslak olarak kaydet"><i className="fa-solid fa-note-sticky" /></button>
            <button className="btn-o" disabled={!cart.length} onClick={() => setStep(step === 'payment' ? 'payment' : canGoOrder ? 'payment' : 'fulfillment')}>
              Taslak Olarak Kaydet
            </button>
            {step === 'payment' ? (
              <button className="btn-p" disabled={submitting || !cart.length} onClick={sendOrder}>
                {submitting ? 'Gönderiliyor...' : 'Gönder'}
              </button>
            ) : (
              <button className="btn-p" disabled={step === 'order' && !cart.length} onClick={() => {
                if (step === 'customer') setStep('fulfillment')
                else if (step === 'fulfillment') {
                  const message = validateBeforeOrder()
                  if (message) toast(message, 'error')
                  else setStep('order')
                } else setStep('payment')
              }}>
                İleri
              </button>
            )}
          </div>
        </aside>
      </div>

      <div className="card" style={{ marginTop: 16, overflow: 'hidden' }}>
        <div style={{ padding: 18, borderBottom: '1px solid #e2e8f0', display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 900, color: '#0f172a', fontSize: '1.05rem' }}>Siparis Listesi</div>
              <div style={{ color: '#64748b', fontSize: '.82rem', marginTop: 4 }}>
                {filteredOrders.length} kayit gosteriliyor. Toplam kaynak: {orders.length}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {['Bekliyor', 'Acik', 'Kapali', 'Iptal'].map(label => {
                const active = hubStatusFilter === label
                return (
                  <button
                    key={label}
                    type="button"
                    className={active ? 'btn-p' : 'btn-o'}
                    onClick={() => setHubStatusFilter(active ? 'all' : label)}
                    style={{ minWidth: 92 }}
                  >
                    {label}
                  </button>
                )
              })}
              <button
                type="button"
                className="btn-o"
                onClick={() => {
                  setHubSearch('')
                  setHubBranchFilter('all')
                  setHubStatusFilter('all')
                  setHubSourceFilter('all')
                  setHubFulfillmentFilter('all')
                  setRawStatusFilter('all')
                  setRawKdsStatusFilter('all')
                  setRawSourceTypeFilter('all')
                  setRawSalesChannelFilter('all')
                }}
              >
                Filtreleri Temizle
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10 }}>
            <input
              className="f-input"
              value={hubSearch}
              onChange={event => setHubSearch(event.target.value)}
              placeholder="Siparis no, musteri, masa, not ara"
            />
            <select className="f-input" value={hubSourceFilter} onChange={event => setHubSourceFilter(event.target.value)}>
              <option value="all">Tum Kanallar</option>
              {hubSourceOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select className="f-input" value={hubBranchFilter} onChange={event => setHubBranchFilter(event.target.value)}>
              <option value="all">Tum Subeler</option>
              {branches.map(branch => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
            <select className="f-input" value={hubFulfillmentFilter} onChange={event => setHubFulfillmentFilter(event.target.value)}>
              <option value="all">Tum Akislar</option>
              <option value="delivery">Adrese Teslim</option>
              <option value="pickup">Gel Al</option>
              <option value="masa">Masa</option>
            </select>
            <select className="f-input" value={hubStatusFilter} onChange={event => setHubStatusFilter(event.target.value)}>
              <option value="all">Tum Durumlar</option>
              <option value="Bekliyor">Bekliyor</option>
              <option value="Acik">Acik</option>
              <option value="Kapali">Kapali</option>
              <option value="Iptal">Iptal</option>
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
            <select className="f-input" value={rawStatusFilter} onChange={event => setRawStatusFilter(event.target.value)}>
              <option value="all">Ham Status</option>
              {rawStatusOptions.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
            <select className="f-input" value={rawKdsStatusFilter} onChange={event => setRawKdsStatusFilter(event.target.value)}>
              <option value="all">Ham KDS Status</option>
              {rawKdsStatusOptions.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
            <select className="f-input" value={rawSourceTypeFilter} onChange={event => setRawSourceTypeFilter(event.target.value)}>
              <option value="all">Ham Source Type</option>
              {rawSourceTypeOptions.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
            <select className="f-input" value={rawSalesChannelFilter} onChange={event => setRawSalesChannelFilter(event.target.value)}>
              <option value="all">Ham Sales Channel</option>
              {rawSalesChannelOptions.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
            <thead>
              <tr style={{ background: '#eef4ff' }}>
                {['Durum', 'Kanal', 'No / Masa', 'Zaman', 'Musteri', 'Akis', 'Ozet', 'Sube', 'Tutar'].map(label => (
                  <th key={label} style={{ padding: 12, textAlign: 'left', borderBottom: '1px solid #dbe4ef', whiteSpace: 'nowrap' }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: 28, textAlign: 'center', color: '#64748b' }}>
                    Filtreye uyan siparis bulunamadi.
                  </td>
                </tr>
              ) : filteredOrders.slice(0, 160).map(order => {
                const statusMeta = getOrderHubStatusMeta(order)
                const sourceMeta = getOrderHubSourceMeta(order)
                return (
                  <tr
                    key={order.id}
                    onClick={() => openOrderDetail(order)}
                    style={{ cursor: 'pointer', background: selectedOrder?.id === order.id ? '#f8fbff' : '#fff' }}
                  >
                    <td style={{ padding: 12, borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ display: 'inline-flex', padding: '5px 9px', borderRadius: 999, background: statusMeta.bg, color: statusMeta.color, fontWeight: 900, fontSize: '.72rem' }}>
                        {statusMeta.label}
                      </span>
                    </td>
                    <td style={{ padding: 12, borderBottom: '1px solid #f1f5f9', fontWeight: 800 }}>{sourceMeta.label}</td>
                    <td style={{ padding: 12, borderBottom: '1px solid #f1f5f9', fontWeight: 800 }}>
                      {order.sale_no || order.table_label || order.kiosk_table_number || order.id.slice(0, 8)}
                    </td>
                    <td style={{ padding: 12, borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>{getOrderHubTimingLabel(order)}</td>
                    <td style={{ padding: 12, borderBottom: '1px solid #f1f5f9' }}>{order.customer_name || '-'}</td>
                    <td style={{ padding: 12, borderBottom: '1px solid #f1f5f9' }}>{getOrderHubFlowLabel(order)}</td>
                    <td style={{ padding: 12, borderBottom: '1px solid #f1f5f9', maxWidth: 320, color: '#334155' }}>{getOrderHubSummary(order)}</td>
                    <td style={{ padding: 12, borderBottom: '1px solid #f1f5f9' }}>{order.branch_name || '-'}</td>
                    <td style={{ padding: 12, borderBottom: '1px solid #f1f5f9', fontWeight: 900, whiteSpace: 'nowrap' }}>TL {money(order.gross_total_after_discount)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedOrder && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 80, display: 'grid', placeItems: 'center', padding: 20 }}>
          <div className="card" style={{ width: 760, maxWidth: '96vw', maxHeight: '90vh', overflow: 'hidden', display: 'grid', gridTemplateRows: 'auto 1fr auto', padding: 0 }}>
            <div style={{ padding: 18, borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 900, color: '#0f172a', fontSize: '1.1rem' }}>Sipariş Detayı</div>
                <div style={{ marginTop: 6, color: '#64748b', fontSize: '.84rem' }}>{selectedOrder.sale_no || selectedOrder.table_label || selectedOrder.id.slice(0, 8)} - {selectedOrder.customer_name || 'Kayıt'}</div>
              </div>
              <button type="button" className="btn-o" onClick={() => setSelectedOrder(null)}>Kapat</button>
            </div>
            <div style={{ overflowY: 'auto', padding: 18, display: 'grid', gap: 16 }}>
              {orderDetailLoading ? (
                <div style={{ padding: 30, textAlign: 'center', color: '#64748b', fontWeight: 800 }}><i className="fa-solid fa-spinner fa-spin" /> Detay yukleniyor...</div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
                    <SidebarCard title="Durum" value={selectedOrderStatusMeta?.label || '-'} icon="fa-signal" />
                    <SidebarCard title="Kanal" value={getOrderHubSourceMeta(selectedOrder).label} icon="fa-store" />
                    <SidebarCard title="Akış" value={getOrderHubFlowLabel(selectedOrder)} icon="fa-location-dot" />
                    <SidebarCard title="Zaman" value={getOrderHubTimingLabel(selectedOrder)} icon="fa-clock" />
                  </div>
                  {orderEditMode ? (
                    <div style={{ display: 'grid', gap: 14 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div><label className="f-label">Teslim tipi</label><select className="f-input" value={orderEditForm.fulfillmentType} onChange={event => setOrderEditForm(current => ({ ...current, fulfillmentType: event.target.value }))}><option value="delivery">Adrese teslim</option><option value="pickup">Gel-al</option></select></div>
                        <div><label className="f-label">Teslim / alis zamani</label><input className="f-input" type="datetime-local" value={orderEditForm.promisedAt} onChange={event => setOrderEditForm(current => ({ ...current, promisedAt: event.target.value }))} /></div>
                      </div>
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
                        {selectedOrderLines.map(line => {
                          const editLine = orderEditForm.lines.find(item => item.id === line.id) || {}
                          return (
                            <div key={line.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 90px', gap: 10, alignItems: 'center', padding: 12, borderBottom: '1px solid #f1f5f9', opacity: editLine.removed ? .45 : 1 }}>
                              <div><div style={{ fontWeight: 900, color: '#0f172a' }}>{line.product_name}</div><div style={{ color: '#64748b', fontSize: '.78rem' }}>Birim: TL {money(line.unit_gross_after_discount || line.unit_gross_before_discount)}</div></div>
                              <input className="f-input" type="number" min="0" step="1" value={editLine.qty  -  line.qty} onChange={event => updateOrderEditLine(line.id, { qty: event.target.value, removed: false })} />
                              <button type="button" className="btn-o" onClick={() => updateOrderEditLine(line.id, { removed: !editLine.removed })}>{editLine.removed ? 'Geri Al' : 'Sil'}</button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: 12 }}>
                      <div style={{ color: '#334155', lineHeight: 1.55 }}>{getOrderHubSummary(selectedOrder)}</div>
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
                        {selectedOrderLines.map(line => (
                          <div key={line.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, padding: 12, borderBottom: '1px solid #f1f5f9', alignItems: 'center' }}>
                            <div style={{ fontWeight: 900, color: '#0f172a' }}>{line.product_name}</div>
                            <div style={{ color: '#64748b', fontWeight: 800 }}>{line.qty} adet</div>
                            <div style={{ fontWeight: 900 }}>TL {money(line.line_gross_after_discount)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {!selectedOrderCanEdit && selectedOrder.kind === 'sale' && selectedOrder.status !== 'cancelled' && (
                    <div style={{ border: '1px solid #fde68a', background: '#fffbeb', color: '#92400e', borderRadius: 12, padding: 12, fontWeight: 800, fontSize: '.84rem' }}>
                      Bu sipariş artık düzenlenebilir durumda değil.
                    </div>
                  )}
                  {selectedOrder.kind === 'open_ticket' && (
                    <div style={{ border: '1px solid #dbeafe', background: '#eff6ff', color: '#1d4ed8', borderRadius: 12, padding: 12, fontWeight: 800, fontSize: '.84rem' }}>
                      Açık masa adisyonları Garson veya POS masa akışından yönetilir.
                    </div>
                  )}
                </>
              )}
            </div>
            <div style={{ padding: 16, borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <button type="button" className="btn-o" onClick={() => setOrderEditMode(false)} disabled={!orderEditMode || orderActionBusy}>Vazgec</button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn-o" disabled={!selectedOrderCanEdit || orderActionBusy || selectedOrder.status === 'cancelled'} onClick={cancelSelectedOrder}>Iptal Et</button>
                {orderEditMode ? <button type="button" className="btn-p" disabled={!selectedOrderCanEdit || orderActionBusy} onClick={saveOrderEdits}>{orderActionBusy ? 'Kaydediliyor...' : 'Kaydet'}</button> : <button type="button" className="btn-p" disabled={!selectedOrderCanEdit || orderActionBusy || selectedOrder.status === 'cancelled'} onClick={() => setOrderEditMode(true)}>Duzenle</button>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


