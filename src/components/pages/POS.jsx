import { Component, useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '@/context/WorkspaceContext'
import StaffPinGate from '@/components/pos/StaffPinGate'
import UnifiedPosStaffScreen, { useUnifiedPosCatalogBootstrap } from '@/components/pos/UnifiedPosStaffScreen'
import FavoriteProductsModal from '@/components/pos/FavoriteProductsModal'
import LoyaltyCampaignCatalog from '@/components/pos/LoyaltyCampaignCatalog'
import LoyaltyCheckoutPrompt from '@/components/pos/LoyaltyCheckoutPrompt'
import PosCustomerLinkModal from '@/components/pos/PosCustomerLinkModal'
import PosTableLayoutFromCatalog from '@/components/pos/PosTableLayoutFromCatalog'
import ComboBuilderModal, {
  expandCartItemsForPayload,
  findComboDefinitionForProduct,
  flattenCartItems,
} from '@/components/pos/ComboBuilderModal'
import { writePosStaffSession } from '@/lib/posStaffAuth'
import {
  buildTableDirectory as buildTableDirectorySafe,
  normalizeOpenTableTicketsState,
  readLayoutTableDirectory as readLayoutTableDirectorySafe,
  resolveTableKey as resolveTableKeySafe,
  resolveTableRecord as resolveTableRecordSafe,
} from '@/lib/tableLayoutDirectory'
import { loadTableManagementCatalog } from '@/lib/posTableCatalogService'
import {
  OPEN_TABLE_TICKETS_SETTING_KEY,
  OPEN_TABLE_TICKETS_UPDATED_EVENT,
  TABLE_LAYOUT_UPDATED_EVENT,
  extractTableDirectoryFromLayoutValue,
  hydrateOpenTableTicketsFromDb,
  hydrateTableLayoutFromDb,
  isPersistenceEventFromCurrentTab,
  persistOpenTableTicketsToDb,
  readLocalLayoutSnapshot,
  readLocalOpenTableTicketsSnapshot,
} from '@/lib/posTablePersistence'
import {
  FAVORITE_ORDER_UPDATED_EVENT,
  FAVORITE_PRODUCT_IDS_UPDATED_EVENT,
  appendVoidLogToDb,
  hydrateFavoriteOrderFromDb,
  hydrateFavoriteProductIdsFromDb,
  hydrateVoidLogsFromDb,
  persistFavoriteOrderToDb,
  persistFavoriteProductIdsToDb,
  readLocalFavoriteOrderSnapshot,
  readLocalFavoriteProductIdsSnapshot,
} from '@/lib/posUiPersistence'
import { isBranchScopedScope } from '@/lib/workspace'
import {
  RUNTIME_LOYALTY_CACHE_TTL_MS,
  evaluateRuntimeOrderCampaignsAsync,
  evaluateRuntimeOrderCampaigns,
  getRuntimeChannelLabel,
  loadCachedRuntimeLoyaltyCampaignCatalog,
} from '@/lib/posLoyalty'
import {
  consumePosLoyaltyLinkSession,
  createPosLoyaltyLinkSession,
  getPosLoyaltyLinkUrl,
  readPosLoyaltyLinkSession,
} from '@/lib/posCustomerLink'
import {
  attachLoyaltyToSaleHeader,
  attachLoyaltyToSaleLines,
  buildLegacySaleItemsSnapshot,
  buildSaleLoyaltyFields,
  buildProportionalDiscountAllocations,
  buildProportionalDiscountMap,
  createSaleLoyaltySnapshot,
  isLoyaltyPersistenceColumnError,
} from '@/lib/checkoutLoyalty'
import { resolvePreparedLoyaltyAdvantage } from '@/lib/loyaltyPreparedAdvantage'
import { postSaleLoyaltyValueLedger } from '@/lib/loyaltyValueLedger'
import { resolveComboMenuCategoryId } from '@/lib/comboMenuCategory'
import {
  formatCallCenterDateTime,
  getCallCenterAddressSummary,
  getCallCenterFulfillmentLabel,
  isMissingCallCenterScheduleColumn,
  isCallCenterChannelName,
  normalizeLegacyCallCenterOrders,
} from '@/lib/callCenterOrders'
import {
  getOrderHubFlowLabel,
  getOrderHubSourceMeta,
  getOrderHubStatusMeta,
  getOrderHubSummary,
  getOrderHubTimingLabel,
  normalizeOrderHubOpenTicket,
  normalizeOrderHubSale,
} from '@/lib/orderHub'
import { db } from '@/lib/db'



function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6) }
function dbUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}
function toDbUuidOrNull(value) {
  const text = String(value || '').trim()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null
}
function fmt(n) { return (parseFloat(n)||0).toFixed(2) }
function parseJ(v, def=[]) {
  if (!v) return def
  if (typeof v === 'string') { try { return JSON.parse(v) } catch(e) { return def } }
  return v
}

const POS_BRANCH_KEY = 'suitable_pos_branch_id'
const POS_CHANNEL_KEY = 'suitable_pos_channel_id'
const POS_STAFF_SESSION_KEY = 'suitable_pos_staff_session_v1'
const GARSON_STAFF_SESSION_KEY = 'suitable_garson_staff_session_v1'
const POS_HIDDEN_HEADER_CHANNEL_NAMES = new Set(['qr', 'kiosk', 'call center', 'suitable yemek', 'online yemek'])
const POS_CATEGORY_BOOT_SELECT = 'id,name,parent_id,bg,text_color'
const POS_PRODUCT_BOOT_SELECT = 'id,name,short_name,sku,is_favorite,pos_color,pos_text_color,pos_image,channel_image,channel_prices,portions,option_groups,recipe_rows,recipe_output_qty,cat_l1,cat_l2,cat_l3,cat_l4,cat_l5,sale_cat_l1,sale_cat_l2,sale_cat_l3,sale_cat_l4,sale_cat_l5'
const DEFAULT_GUEST_COUNTS = Object.freeze({ women: 0, men: 0, children: 0 })
const GUEST_META = [
  { key: 'women', label: 'Kadin', icon: 'fa-person-dress', color: '#f472b6' },
  { key: 'men', label: 'Erkek', icon: 'fa-person', color: '#60a5fa' },
  { key: 'children', label: 'Cocuk', icon: 'fa-child-reaching', color: '#fbbf24' },
]
const EMPTY_OPEN_TICKET = Object.freeze({ cart: [], orderNote: '', guestCounts: DEFAULT_GUEST_COUNTS })
const TABLE_STATUS_META = {
  empty: { label: 'Bos', color: '#22c55e' },
  occupied: { label: 'Dolu', color: '#ef4444' },
  reserved: { label: 'Rezerve', color: '#3b82f6' },
}

function readPosBranchId() {
  try {
    return localStorage.getItem(POS_BRANCH_KEY) || ''
  } catch {
    return ''
  }
}

function writePosBranchId(branchId) {
  try {
    if (branchId) localStorage.setItem(POS_BRANCH_KEY, branchId)
    else localStorage.removeItem(POS_BRANCH_KEY)
  } catch {
    // Branch selection persistence is best-effort only.
  }
}

function readPosChannelId() {
  try {
    return localStorage.getItem(POS_CHANNEL_KEY) || ''
  } catch {
    return ''
  }
}

function writePosChannelId(channelId) {
  try {
    if (channelId) localStorage.setItem(POS_CHANNEL_KEY, channelId)
    else localStorage.removeItem(POS_CHANNEL_KEY)
  } catch {
    // Channel selection persistence is best-effort only.
  }
}

function normalizeChannelName(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function shouldShowPosHeaderChannel(channel) {
  return !POS_HIDDEN_HEADER_CHANNEL_NAMES.has(normalizeChannelName(channel?.name))
}

function isQuickSaleChannel(channel) {
  return normalizeChannelName(channel?.name) === 'hizli satis'
}

function isPickupChannel(channel) {
  const name = normalizeChannelName(channel?.name)
  return name === 'gel al' || name === 'gel-al'
}

function isMasaChannel(channel) {
  return normalizeChannelName(channel?.name) === 'masa'
}

function isPrimaryPosSalesChannel(channel) {
  return isQuickSaleChannel(channel) || isPickupChannel(channel) || isMasaChannel(channel)
}

function normalizeMasaNo(value) {
  const match = String(value || '').match(/(\d+)/)
  if (match?.[1]) return match[1].padStart(2, '0')
  const trimmed = String(value || '').trim()
  return trimmed || '01'
}

function normalizeGuestCounts(counts) {
  return {
    women: Math.max(0, parseInt(counts?.women, 10) || 0),
    men: Math.max(0, parseInt(counts?.men, 10) || 0),
    children: Math.max(0, parseInt(counts?.children, 10) || 0),
  }
}

function getGuestCoverCount(counts) {
  const safeCounts = normalizeGuestCounts(counts)
  return safeCounts.women + safeCounts.men + safeCounts.children
}

function getPosTableOwnerId(staff) {
  return String(staff?.id || '').trim()
}

function canPosUserEditTableItem(item, staff) {
  const ownerId = getPosTableOwnerId(staff)
  if (!ownerId) return false
  return item?.entrySource === 'pos_masa' && String(item?.posOwnerId || '').trim() === ownerId
}

function sanitizeOpenTicket(ticket) {
  return {
    cart: Array.isArray(ticket?.cart) ? ticket.cart : [],
    orderNote: typeof ticket?.orderNote === 'string' ? ticket.orderNote : '',
    guestCounts: normalizeGuestCounts(ticket?.guestCounts),
    ownerId: typeof ticket?.ownerId === 'string' ? ticket.ownerId : '',
    ownerName: typeof ticket?.ownerName === 'string' ? ticket.ownerName : '',
    updatedAt: typeof ticket?.updatedAt === 'string' ? ticket.updatedAt : null,
  }
}

function hasOpenTicketContent(ticket) {
  const safeTicket = sanitizeOpenTicket(ticket)
  return safeTicket.cart.length > 0 || Boolean(safeTicket.orderNote.trim()) || getGuestCoverCount(safeTicket.guestCounts) > 0
}

function readLayoutTableDirectory() {
  return readLayoutTableDirectorySafe()
}

function buildTableDirectory(layoutTables, branchTickets, currentTableKey) {
  return buildTableDirectorySafe(layoutTables, branchTickets, currentTableKey)
}

function normalizeAllTableTickets(tableTickets, layoutTables) {
  return normalizeOpenTableTicketsState(tableTickets, layoutTables)
}

function resolveTableKey(layoutTables, tableRef) {
  return resolveTableKeySafe(tableRef, layoutTables)
}

function resolveTableRecord(layoutTables, tableRef) {
  return resolveTableRecordSafe(tableRef, layoutTables)
}

function cloneCartItemsForTransfer(items) {
  return (items || []).map(item => {
    const nextItem = {
      ...item,
      id: uid(),
      qty: Math.max(1, parseFloat(item?.qty) || 1),
    }

    if ('sourceCartId' in nextItem) delete nextItem.sourceCartId
    return nextItem
  })
}

function sameStringList(left = [], right = []) {
  return JSON.stringify((left || []).map(value => String(value))) === JSON.stringify((right || []).map(value => String(value)))
}

function buildTree(cats, parentId = null) {
  return cats
    .filter(cat => (cat.parent_id || null) === parentId)
    .map(cat => ({ ...cat, children: buildTree(cats, cat.id) }))
}

function getDescIds(cats, id) {
  const kids = cats.filter(cat => cat.parent_id === id)
  return [id, ...kids.flatMap(child => getDescIds(cats, child.id))]
}

function pickButtonColors(item) {
  return {
    bg: item?.pos_color || '#1e293b',
    text: item?.pos_text_color || '#ffffff',
  }
}

function getProductCategoryId(item) {
  return item.sale_cat_l5
    || item.sale_cat_l4
    || item.sale_cat_l3
    || item.sale_cat_l2
    || item.sale_cat_l1
    || item.cat_l5
    || item.cat_l4
    || item.cat_l3
    || item.cat_l2
    || item.cat_l1
    || null
}

function PreparedAdvantageRows({ preparedAdvantage, tone = 'light' }) {
  if (!preparedAdvantage?.hasPreparedAdvantage) return null

  const isLight = tone === 'light'
  const badgeBackground = isLight ? 'rgba(34,197,94,.12)' : 'rgba(250,204,21,.14)'
  const badgeBorder = isLight ? '1px solid rgba(34,197,94,.22)' : '1px solid rgba(250,204,21,.24)'
  const badgeTextColor = isLight ? '#dcfce7' : '#fef3c7'
  const labelColor = isLight ? '#86efac' : '#fcd34d'
  const helperColor = isLight ? '#bbf7d0' : '#e2e8f0'

  return (
    <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {preparedAdvantage.hasPreparedCampaign ? (
          <div style={{ padding: '6px 10px', borderRadius: 999, background: badgeBackground, border: badgeBorder, color: badgeTextColor, fontSize: '.72rem', fontWeight: 800 }}>
            {`Hazır kampanya: ${preparedAdvantage.resolvedSelectedCampaignName}`}
          </div>
        ) : null}
        {preparedAdvantage.hasPreparedCoupon ? (
          <div style={{ padding: '6px 10px', borderRadius: 999, background: 'rgba(59,130,246,.12)', border: '1px solid rgba(59,130,246,.22)', color: isLight ? '#dbeafe' : '#bfdbfe', fontSize: '.72rem', fontWeight: 800 }}>
            {`Hazır kupon: ${preparedAdvantage.resolvedSelectedCouponLabel}`}
          </div>
        ) : null}
      </div>
      <div style={{ display: 'grid', gap: 2 }}>
        <div style={{ color: labelColor, fontSize: '.72rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.06em' }}>
          Kasada bu avantajla devam edecek
        </div>
        <div style={{ color: helperColor, fontSize: '.76rem', lineHeight: 1.45 }}>
          Sipariş uygun olursa uygulanır.
        </div>
      </div>
    </div>
  )
}

function getChannelBasePrice(item, channelId) {
  const cp = parseJ(item?.channel_prices, []).find(x => x.channel_id === channelId && x.active)
  return parseFloat(cp?.price) || 0
}

function getPortionOffset(item, portionId) {
  if (!portionId) return 0
  const portion = parseJ(item?.portions, []).find(x => x.id === portionId)
  return parseFloat(portion?.price_offset) || 0
}

function getPortionFinalPrice(item, channelId, portionId) {
  return getChannelBasePrice(item, channelId) + getPortionOffset(item, portionId)
}

function getCartLineTotal(item) {
  return (parseFloat(item?.unitPrice) || 0) * (parseFloat(item?.qty) || 0)
}

function getOptionTotal(options) {
  return (options || []).reduce((sum, option) => sum + (parseFloat(option?.price) || 0), 0)
}

function getCartItemUnitPriceForChannel(item, channelId, fallbackUnitPrice = 0) {
  const portionId = item?.portion?.id || null
  const channelBasedPrice = getPortionFinalPrice(item?.prod, channelId, portionId) + getOptionTotal(item?.options)
  if (channelBasedPrice > 0) return channelBasedPrice
  return parseFloat(fallbackUnitPrice) || 0
}

function getCartLineLabel(item) {
  const details = [
    item?.portion?.name,
    ...((item?.options || []).map(option => option.name)),
  ].filter(Boolean)

  return details.length > 0
    ? `${item?.prod?.name || ''} - ${details.join(' - ')}`
    : (item?.prod?.name || '')
}

function calcDiscountAmount(baseAmount, discountMode, discountValue) {
  const base = parseFloat(baseAmount) || 0
  const raw = parseFloat(discountValue) || 0

  if (base <= 0 || raw <= 0) return 0
  if (discountMode === 'percent') return Math.min(base, (base * raw) / 100)
  if (discountMode === 'amount') return Math.min(base, raw)
  return 0
}

function roundMoney(value) {
  return Math.round((parseFloat(value) || 0) * 100) / 100
}

function calcRecipeUnitCost(item, channelId, portionId) {
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

function expandCartForPayment(cartItems) {
  return cartItems.flatMap(item => {
    const qty = Math.max(1, parseInt(item?.qty, 10) || 1)
    if (qty === 1) return [{ ...item, sourceCartId: item.id }]

    return Array.from({ length: qty }, (_, index) => ({
      ...item,
      id: `${item.id}__pay_${index + 1}_${uid()}`,
      qty: 1,
      sourceCartId: item.id,
    }))
  })
}

function getPaymentGroupId(item) {
  return item?.sourceCartId || item?.id
}

function collapsePaymentItems(items) {
  const grouped = new Map()

  for (const item of items || []) {
    const groupId = getPaymentGroupId(item)
    const nextQty = parseFloat(item?.qty) || 1

    if (grouped.has(groupId)) {
      const current = grouped.get(groupId)
      grouped.set(groupId, {
        ...current,
        qty: (parseFloat(current?.qty) || 0) + nextQty,
      })
      continue
    }

    grouped.set(groupId, {
      ...item,
      id: groupId,
      sourceCartId: groupId,
      qty: nextQty,
    })
  }

  return Array.from(grouped.values())
}

function applyPaidItemsToCart(cartItems, paidItems) {
  const paidQtyBySource = paidItems.reduce((map, item) => {
    const sourceId = item?.sourceCartId || item?.id
    const paidQty = parseFloat(item?.qty) || 1
    map.set(sourceId, (map.get(sourceId) || 0) + paidQty)
    return map
  }, new Map())

  return cartItems.flatMap(item => {
    const nextQty = (parseFloat(item?.qty) || 0) - (paidQtyBySource.get(item.id) || 0)
    if (nextQty <= 0) return []
    if (nextQty === item.qty) return [item]
    return [{ ...item, qty: nextQty }]
  })
}

function getSplitExpectedAmount(amount, partsRemaining) {
  const safeAmount = Math.max(0, parseFloat(amount) || 0)
  const safeParts = Math.max(1, parseInt(partsRemaining, 10) || 1)
  if (safeParts <= 1) return safeAmount
  return Math.round((safeAmount / safeParts) * 100) / 100
}

function buildSplitPreviewAmounts(totalAmount, totalParts, completedParts, completedAmount) {
  const safeTotalParts = Math.max(0, parseInt(totalParts, 10) || 0)
  const safeCompletedParts = Math.max(0, parseInt(completedParts, 10) || 0)
  let partsRemaining = Math.max(0, safeTotalParts - safeCompletedParts)
  let amountRemaining = Math.max(0, roundMoney(totalAmount) - roundMoney(completedAmount))
  const preview = []

  while (partsRemaining > 0) {
    const nextAmount = roundMoney(getSplitExpectedAmount(amountRemaining, partsRemaining))
    preview.push(nextAmount)
    amountRemaining = Math.max(0, roundMoney(amountRemaining - nextAmount))
    partsRemaining -= 1
  }

  return preview
}

const UI_TEXT = {
  searchPlaceholder: '\u00dcr\u00fcn ara...',
  priced: 'Fiyatl\u0131',
  dash: '\u2014',
  tlSuffix: ' \u20BA',
  basePrice: 'Taban',
  close: '\u00d7',
  sizeSelection: 'Boyut Se\u00e7imi',
  required: 'Zorunlu',
  optional: 'Opsiyonel',
  free: '\u00dccretsiz',
  totalAmount: 'Toplam Tutar',
  addToCart: 'Sepete Ekle',
  paymentTitle: '\u00d6deme Al',
  cash: 'Nakit',
  card: 'Kart',
  transfer: 'Transfer',
  receivedAmount: 'ALINAN M\u0130KTAR',
  changeDue: 'Para \u00dcst\u00fc',
  cancel: '\u0130ptal',
  completeSale: 'Sat\u0131\u015f\u0131 Tamamla',
  noSearchResult: 'Arama sonucu bulunamad\u0131',
  noProductsInCategory: 'Bu kategoride \u00fcr\u00fcn yok',
  forFree: '\u00dccretsiz',
  differenceSuffix: ' fark',
  minSelectionPrefix: 'Bu grup i\u00e7in en az ',
  minSelectionSuffix: ' se\u00e7im yap\u0131n.',
  editCartItem: 'D\u00fczenle',
  itemNote: '\u00dcr\u00fcn Notu',
  orderNote: 'Sipari\u015f Notu',
  addNote: 'Not Ekle',
  saveNote: 'Notu Kaydet',
  clearOrder: 'Sipari\u015fi Sil',
  clearOrderTitle: 'Sipari\u015fi Sil',
  clearOrderReason: 'Silme a\u00e7\u0131klamas\u0131',
  clearOrderPlaceholder: 'Sipari\u015f neden silindi?',
  confirmDelete: 'Sil ve Kaydet',
  moveTable: 'Masaya Aktar',
  noTableDefined: 'Aktarim icin bos masa bulunamadi.',
  moveTablePriceWarning: 'Siparis masa satis fiyatlariyla masaya aktarilacaktir.',
  stockOutList: 'Stok D\u0131\u015f\u0131 Liste',
  featurePending: 'Bu i\u015flev daha sonra tan\u0131mlanacak.',
  favorites: 'Favoriler',
  loyaltyCampaigns: 'Kampanyalar',
  addFavorite: 'Favori Ekle',
  favoriteListPlaceholder: 'Sat\u0131\u015f mal\u0131 listesi ba\u011flant\u0131s\u0131 sonraki ad\u0131mda eklenecek.',
  orderDeleted: 'Sipari\u015f silindi',
  orderDeleteReasonRequired: 'Silme a\u00e7\u0131klamas\u0131 zorunlu',
  itemUpdated: '\u00dcr\u00fcn g\u00fcncellendi',
  noteSaved: 'Not kaydedildi',
}

class POSRuntimeBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, errorMessage: '' }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error?.message || 'POS ekranı açılırken beklenmeyen bir hata oluştu.',
    }
  }

  componentDidCatch(error, errorInfo) {
    console.error('POS runtime error', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position:'fixed',
          inset:0,
          background:'#00003a',
          display:'flex',
          alignItems:'center',
          justifyContent:'center',
          padding:24,
          fontFamily:"'Roboto',sans-serif",
        }}>
          <div style={{
            width:'min(520px, 100%)',
            background:'rgba(15,23,42,.92)',
            border:'1px solid rgba(248,113,113,.35)',
            borderRadius:20,
            boxShadow:'0 30px 80px rgba(0,0,0,.45)',
            padding:'24px 22px',
            color:'#fff',
          }}>
            <div style={{ color:'#fca5a5', fontWeight:900, fontSize:'1.2rem' }}>POS açılamadı</div>
            <div style={{ color:'#cbd5e1', marginTop:10, lineHeight:1.5 }}>
              {this.state.errorMessage}
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                marginTop:18,
                minHeight:46,
                padding:'0 18px',
                borderRadius:14,
                border:'1px solid rgba(255,255,255,.12)',
                background:'#1d4ed8',
                color:'#fff',
                fontWeight:800,
                cursor:'pointer',
              }}
            >
              Sayfayı Yenile
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}


function OptionsModal(props) {
  return <OptionsModalSafe {...props} />
}

function OdemeModal({ total, onConfirm, onClose }) {
  const methods = [
    { value: 'nakit', label: UI_TEXT.cash, color: '#22c55e' },
    { value: 'kart', label: 'Kredi Kart\u0131', color: '#60a5fa' },
  ]

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(2,6,23,.74)', zIndex:130, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div className="touch-modal" style={{ width:460, maxWidth:'94vw', background:'#0b1249', border:'1px solid rgba(255,255,255,.12)', borderRadius:22, boxShadow:'0 30px 80px rgba(0,0,0,.55)', overflow:'hidden' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 20px', borderBottom:'1px solid rgba(255,255,255,.08)' }}>
          <div>
            <div style={{ color:'#fff', fontWeight:900, fontSize:'1.1rem' }}>{UI_TEXT.paymentTitle}</div>
            <div style={{ color:'#94a3b8', fontSize:'.82rem', marginTop:4 }}>{'H\u0131zl\u0131 tahsilat'}</div>
          </div>
          <button type="button" onClick={onClose} style={{ width:36, height:36, borderRadius:999, border:'none', background:'rgba(255,255,255,.08)', color:'#fff', cursor:'pointer' }}>{UI_TEXT.close}</button>
        </div>

        <div style={{ padding:'24px 20px', display:'grid', gap:16 }}>
          <div style={{ border:'1px solid rgba(251,191,36,.22)', borderRadius:18, background:'rgba(251,191,36,.08)', padding:'18px 20px' }}>
            <div style={{ color:'#fcd34d', textTransform:'uppercase', letterSpacing:'.08em', fontSize:'.72rem', fontWeight:800 }}>{UI_TEXT.totalAmount}</div>
            <div style={{ color:'#fff', fontWeight:900, fontSize:'2.4rem', marginTop:8 }}>{fmt(total)}{UI_TEXT.tlSuffix}</div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0,1fr))', gap:12 }}>
            {methods.map(method => (
              <button
                key={method.value}
                type="button"
                onClick={() => onConfirm({ method: method.value, amount: total })}
                style={{ minHeight:84, border:'none', borderRadius:16, background:method.color, color:'#08111f', fontWeight:900, display:'grid', gap:6, cursor:'pointer' }}
              >
                <span>{method.label}</span>
                <span>{fmt(total)}{UI_TEXT.tlSuffix}</span>
              </button>
            ))}
          </div>

          <button type="button" onClick={onClose} style={{ minHeight:52, borderRadius:14, border:'1px solid rgba(255,255,255,.14)', background:'transparent', color:'#cbd5e1', fontWeight:800, cursor:'pointer' }}>{UI_TEXT.cancel}</button>
        </div>
      </div>
    </div>
  )
}


function OptionsModalSafe({
  item,
  channelId,
  onConfirm,
  onClose,
  initialPortionId = null,
  initialOptions = [],
  confirmLabel = UI_TEXT.addToCart,
}) {
  const portions = parseJ(item.portions, [])
  const optGroups = parseJ(item.option_groups, [])
  const chPrices = parseJ(item.channel_prices, [])

  const basePrice = (() => {
    const cp = chPrices.find(x => x.channel_id === channelId && x.active)
    return parseFloat(cp?.price) || 0
  })()

  const [selPortion, setSelPortion] = useState(initialPortionId ?? (portions.length ? portions[0].id : null))
  const [selOpts, setSelOpts] = useState(() => {
    if (!initialOptions.length) return {}

    return optGroups.reduce((acc, grp, gi) => {
      const selectedKeys = (grp.options || []).reduce((keys, opt, oi) => {
        if (initialOptions.some(selected => selected?.name === opt?.name)) {
          keys.push(`${gi}-${oi}`)
        }
        return keys
      }, [])

      if (selectedKeys.length) {
        acc[gi] = selectedKeys
      }

      return acc
    }, {})
  })

  const total = basePrice +
    (selPortion ? (parseFloat(portions.find(x => x.id === selPortion)?.price_offset) || 0) : 0) +
    Object.values(selOpts).flat().reduce((acc, key) => {
      const [gi, oi] = key.split('-').map(Number)
      const opt = optGroups[gi]?.options?.[oi]
      return acc + (parseFloat(opt?.price) || 0)
    }, 0)

  const invalidGroups = optGroups.reduce((acc, grp, gi) => {
    const count = (selOpts[gi] || []).length
    const min = Math.max(grp.required ? 1 : 0, parseInt(grp.min_select) || 0)
    if (count < min) acc.push(gi)
    return acc
  }, [])

  const canConfirm = invalidGroups.length === 0
  const hasOptionChoices = optGroups.some(grp => (grp.options || []).length > 0)

  function toggleOpt(groupIdx, optIdx, maxSelect) {
    const key = `${groupIdx}-${optIdx}`
    setSelOpts(prev => {
      const cur = prev[groupIdx] || []
      const count = cur.filter(k => k === key).length

      if (maxSelect <= 1) {
        return count > 0
          ? { ...prev, [groupIdx]: cur.filter(k => k !== key) }
          : { ...prev, [groupIdx]: [key] }
      }

      if (cur.length >= maxSelect) return prev
      return { ...prev, [groupIdx]: [...cur, key] }
    })
  }

  function removeOpt(groupIdx, optIdx) {
    const key = `${groupIdx}-${optIdx}`
    setSelOpts(prev => {
      const cur = prev[groupIdx] || []
      const index = cur.lastIndexOf(key)
      if (index === -1) return prev
      const nextArr = [...cur]
      nextArr.splice(index, 1)
      return { ...prev, [groupIdx]: nextArr }
    })
  }

  function confirm() {
    if (!canConfirm) return
    const portion = portions.find(p => p.id === selPortion) || null
    const options = Object.values(selOpts).flat().map(key => {
      const [gi, oi] = key.split('-').map(Number)
      return optGroups[gi]?.options?.[oi]
    }).filter(Boolean)
    onConfirm({ portion, options, unitPrice: total })
  }

  function handlePortionSelect(portionId) {
    setSelPortion(portionId)
    if (hasOptionChoices) return

    const portion = portions.find(p => p.id === portionId) || null
    onConfirm({
      portion,
      options: [],
      unitPrice: getPortionFinalPrice(item, channelId, portionId),
    })
  }

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,.65)', backdropFilter:'blur(4px)',
      zIndex:100, display:'flex', alignItems:'center', justifyContent:'center'
    }}>
      <div className="touch-modal" style={{
        background:'#0a0f44', border:'1px solid rgba(255,255,255,.12)', borderRadius:20,
        width:500, maxWidth:'94vw', maxHeight:'88vh', display:'flex', flexDirection:'column',
        boxShadow:'0 25px 60px rgba(0,0,0,.6)'
      }}>
        <div style={{
          padding:'18px 22px', borderBottom:'1px solid rgba(255,255,255,.08)',
          display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16
        }}>
          <div style={{minWidth:0}}>
            <div style={{fontSize:'1.15rem', fontWeight:900, color:'#fff'}}>{item.name}</div>
            <div style={{fontSize:'.82rem', color:'#a5b4fc', marginTop:3, fontWeight:700}}>
              {UI_TEXT.basePrice}: {fmt(basePrice)}{UI_TEXT.tlSuffix}
            </div>
          </div>
          <button className="touch-btn" onClick={onClose} style={{
            width:42, height:42, borderRadius:99, border:'none',
            background:'rgba(255,255,255,.1)', color:'#fff', cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.35rem',
            flexShrink:0
          }}>
            {UI_TEXT.close}
          </button>
        </div>

        <div className="hide-scrollbar" style={{
          flex:1, overflowY:'auto', padding:'18px 22px', display:'flex', flexDirection:'column', gap:20
        }}>
          {portions.length > 0 && (
            <div>
              <div style={{
                fontSize:'.72rem', fontWeight:800, color:'#a5b4fc',
                textTransform:'uppercase', letterSpacing:'.12em', marginBottom:10
              }}>
                {UI_TEXT.sizeSelection}
              </div>
              <div style={{display:'grid', gridTemplateColumns:`repeat(${Math.min(portions.length, 3)},1fr)`, gap:8}}>
                {portions.map(p => (
                  <button className="touch-btn touch-card" key={p.id} onClick={() => handlePortionSelect(p.id)} style={{
                    minHeight:72, padding:'12px 8px', borderRadius:14,
                    border:`1.5px solid ${selPortion===p.id?'#fbbf24':'rgba(255,255,255,.1)'}`,
                    background:selPortion===p.id?'rgba(251,191,36,.12)':'rgba(255,255,255,.03)',
                    color:selPortion===p.id?'#fbbf24':'#fff', cursor:'pointer', textAlign:'center', transition:'.15s'
                  }}>
                    <div style={{fontWeight:700, fontSize:'.9rem'}}>{p.name}</div>
                    <div style={{fontSize:'.74rem', opacity:.92, marginTop:4, fontWeight:800}}>
                      {fmt(getPortionFinalPrice(item, channelId, p.id))}{UI_TEXT.tlSuffix}
                    </div>
                    {parseFloat(p.price_offset) !== 0 && (
                      <div style={{fontSize:'.68rem', opacity:.65, marginTop:2}}>
                        {parseFloat(p.price_offset) > 0 ? '+' : ''}{fmt(p.price_offset)}{UI_TEXT.tlSuffix}{UI_TEXT.differenceSuffix}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {optGroups.map((grp, gi) => {
            const opts = grp.options || []
            if (!opts.length) return null
            const minRequired = Math.max(grp.required ? 1 : 0, parseInt(grp.min_select) || 0)

            return (
              <div key={gi}>
                <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10, gap:12}}>
                  <div style={{
                    fontSize:'.72rem', fontWeight:800, color:'#a5b4fc',
                    textTransform:'uppercase', letterSpacing:'.12em'
                  }}>
                    {grp.group_name}
                  </div>
                  {(() => {
                    const min = parseInt(grp.min_select) || (grp.required ? 1 : 0)
                    const max = parseInt(grp.max_select) || 0
                    if (!min && !max) return (
                      <div style={{fontSize:'.7rem', color:'rgba(165,180,252,.6)', fontWeight:600, flexShrink:0}}>
                        {UI_TEXT.optional}
                      </div>
                    )
                    let note = ""
                    if (min > 0 && max > 0) note = min === max ? `${min} Zorunlu` : `En az ${min}, En fazla ${max}`
                    else if (min > 0) note = `En az ${min} Seçim`
                    else if (max > 0) note = `En fazla ${max} Seçim`
                    
                    return (
                      <div style={{
                        fontSize: '.68rem', fontWeight: 800, color: '#818cf8', 
                        background: 'rgba(129, 140, 248, 0.12)', padding: '2px 8px', borderRadius: 8, flexShrink:0
                      }}>
                        {note}
                      </div>
                    )
                  })()}
                </div>
                {invalidGroups.includes(gi) && (
                  <div style={{fontSize:'.74rem', color:'#fca5a5', fontWeight:700, marginBottom:8}}>
                    {UI_TEXT.minSelectionPrefix}{minRequired}{UI_TEXT.minSelectionSuffix}
                  </div>
                )}
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:7}}>
                  {opts.map((opt, oi) => {
                    const key = `${gi}-${oi}`
                    const curSel = selOpts[gi] || []
                    const count = curSel.filter(k => k === key).length
                    const isOn = count > 0
                    const optPrice = parseFloat(opt.price) || 0
                    const maxS = parseInt(grp.max_select) || 1
                    
                    return maxS > 1 && isOn ? (
                      <div className="touch-card" key={oi} style={{
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'stretch',
                        minHeight: 68,
                        borderRadius: 14,
                        border: `1.5px solid #10b981`,
                        background: 'rgba(16,185,129,.12)',
                        padding: 0
                      }}>
                        <div style={{
                          position: 'absolute', top: -6, right: -6,
                          background: '#ef4444', color: '#fff', fontSize: '.75rem', fontWeight: 900,
                          width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: '0 2px 4px rgba(0,0,0,.3)', zIndex: 2
                        }}>
                          {count}
                        </div>

                        <button
                          type="button"
                          onClick={() => removeOpt(gi, oi)}
                          style={{
                            width: 38, border: 'none', background: '#334155', color: '#fff', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900,
                            fontSize: '1.4rem', transition: '.15s', flexShrink: 0,
                            borderTopLeftRadius: 12, borderBottomLeftRadius: 12
                          }}
                        >
                          -
                        </button>

                        <div style={{
                          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          padding: '6px 4px', color: '#10b981'
                        }}>
                          <div style={{ fontWeight: 700, fontSize: '.9rem', textAlign: 'center', lineHeight: 1.2 }}>{opt.name}</div>
                          <div style={{ fontSize: '.75rem', fontWeight: 800, marginTop: 4, opacity: 0.9 }}>
                            {optPrice > 0 ? `+${fmt(optPrice)}${UI_TEXT.tlSuffix}` : UI_TEXT.free}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleOpt(gi, oi, maxS)}
                          style={{
                            width: 38, border: 'none', background: '#10b981', color: '#fff', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900,
                            fontSize: '1.4rem', transition: '.15s', flexShrink: 0,
                            borderTopRightRadius: 12, borderBottomRightRadius: 12
                          }}
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <button className="touch-card" key={oi} type="button" onClick={() => toggleOpt(gi, oi, maxS)} style={{
                        minHeight:68, padding:'7px 12px', borderRadius:14,
                        border:`1.5px solid ${isOn?'#10b981':'rgba(255,255,255,.1)'}`,
                        background:isOn?'rgba(16,185,129,.12)':'rgba(255,255,255,.03)',
                        color:isOn?'#10b981':'#fff',
                        display:'flex', justifyContent:'space-between', alignItems:'center', transition:'.15s', gap:8,
                        cursor: 'pointer', width: '100%', position: 'relative'
                      }}>
                        {isOn && maxS === 1 && (
                          <div style={{
                            position: 'absolute', top: -6, right: -6,
                            background: '#10b981', color: '#fff', fontSize: '.7rem', fontWeight: 900,
                            width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 2px 4px rgba(0,0,0,.2)'
                          }}>
                            <i className="fa-solid fa-check" style={{ fontSize: '.6rem' }} />
                          </div>
                        )}
                        <span style={{fontWeight:600, fontSize:'.87rem', textAlign:'left', flex: 1}}>{opt.name}</span>
                        <span style={{
                          fontSize:'.75rem', fontWeight:700, flexShrink:0,
                          color:optPrice > 0 ? (isOn ? '#10b981' : 'rgba(255,255,255,.4)') : (isOn ? 'rgba(16,185,129,.8)' : 'rgba(255,255,255,.4)')
                        }}>
                          {optPrice > 0 ? `+${fmt(optPrice)}${UI_TEXT.tlSuffix}` : UI_TEXT.free}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <div style={{
          padding:'16px 22px', borderTop:'1px solid rgba(255,255,255,.08)',
          background:'#05082b', borderRadius:'0 0 20px 20px',
          display:'flex', justifyContent:'space-between', alignItems:'center', gap:12
        }}>
          <div>
            <div style={{fontSize:'.75rem', color:'#94a3b8', fontWeight:700}}>{UI_TEXT.totalAmount}</div>
            <div style={{fontSize:'1.7rem', fontWeight:900, color:'#fbbf24', lineHeight:1}}>
              {fmt(total)}{UI_TEXT.tlSuffix}
            </div>
          </div>
          <button className="touch-btn" onClick={confirm} disabled={!canConfirm} style={{
            background:canConfirm?'linear-gradient(135deg,#f59e0b,#fbbf24)':'rgba(255,255,255,.12)',
            color:canConfirm?'#0f172a':'#94a3b8',
            border:'none', borderRadius:14, padding:'16px 28px', fontWeight:800, fontSize:'1rem',
            cursor:canConfirm?'pointer':'not-allowed', display:'flex', alignItems:'center', gap:8, minHeight:56
          }}>
            <i className="fa-solid fa-cart-plus" /> {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function NoteModalSafe({ title, initialValue = '', placeholder, onConfirm, onClose }) {
  const [value, setValue] = useState(initialValue)

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,.65)', backdropFilter:'blur(4px)',
      zIndex:110, display:'flex', alignItems:'center', justifyContent:'center'
    }}>
      <div className="touch-modal" style={{
        background:'#0a0f44', border:'1px solid rgba(255,255,255,.12)', borderRadius:20,
        width:460, maxWidth:'94vw', boxShadow:'0 25px 60px rgba(0,0,0,.6)'
      }}>
        <div style={{
          padding:'18px 22px', borderBottom:'1px solid rgba(255,255,255,.08)',
          display:'flex', justifyContent:'space-between', alignItems:'center'
        }}>
          <div style={{fontSize:'1.05rem', fontWeight:900, color:'#fff'}}>{title}</div>
          <button className="touch-btn" onClick={onClose} style={{
            width:38, height:38, borderRadius:99, border:'none', background:'rgba(255,255,255,.1)',
            color:'#fff', cursor:'pointer', fontSize:'1.2rem'
          }}>
            {UI_TEXT.close}
          </button>
        </div>

        <div style={{padding:'20px 22px'}}>
          <textarea
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={placeholder}
            rows={5}
            style={{
              width:'100%', resize:'vertical', minHeight:120,
              background:'rgba(255,255,255,.06)', border:'1.5px solid rgba(255,255,255,.15)',
              borderRadius:14, padding:'14px 16px', color:'#fff', fontSize:'.95rem', outline:'none'
            }}
            autoFocus
          />
        </div>

        <div style={{
          padding:'14px 22px', borderTop:'1px solid rgba(255,255,255,.08)', background:'#05082b',
          borderRadius:'0 0 20px 20px', display:'flex', justifyContent:'flex-end', gap:10
        }}>
          <button className="touch-btn" onClick={onClose} style={{
            padding:'10px 18px', borderRadius:10, border:'1.5px solid rgba(255,255,255,.15)',
            background:'transparent', color:'#94a3b8', fontWeight:700, cursor:'pointer'
          }}>
            {UI_TEXT.cancel}
          </button>
          <button className="touch-btn" onClick={() => onConfirm(value.trim())} style={{
            background:'linear-gradient(135deg,#f59e0b,#fbbf24)', color:'#0f172a', border:'none',
            borderRadius:12, padding:'10px 22px', fontWeight:800, cursor:'pointer'
          }}>
            {UI_TEXT.saveNote}
          </button>
        </div>
      </div>
    </div>
  )
}

function InfoModalSafe({ title, message, onClose }) {
  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,.65)', backdropFilter:'blur(4px)',
      zIndex:110, display:'flex', alignItems:'center', justifyContent:'center'
    }}>
      <div className="touch-modal" style={{
        background:'#0a0f44', border:'1px solid rgba(255,255,255,.12)', borderRadius:20,
        width:420, maxWidth:'94vw', boxShadow:'0 25px 60px rgba(0,0,0,.6)'
      }}>
        <div style={{padding:'22px'}}>
          <div style={{fontSize:'1.05rem', fontWeight:900, color:'#fff', marginBottom:10}}>{title}</div>
          <div style={{fontSize:'.92rem', color:'#cbd5e1', lineHeight:1.5}}>{message}</div>
        </div>
        <div style={{
          padding:'14px 22px', borderTop:'1px solid rgba(255,255,255,.08)', background:'#05082b',
          borderRadius:'0 0 20px 20px', display:'flex', justifyContent:'flex-end'
        }}>
          <button className="touch-btn" onClick={onClose} style={{
            background:'linear-gradient(135deg,#f59e0b,#fbbf24)', color:'#0f172a',
            border:'none', borderRadius:12, padding:'10px 22px', fontWeight:800, cursor:'pointer'
          }}>
            Tamam
          </button>
        </div>
      </div>
    </div>
  )
}

function MoveToTableModalSafe({ tableOptions, onConfirm, onClose }) {
  const [targetTableKey, setTargetTableKey] = useState('')
  const emptyTables = useMemo(
    () => (tableOptions || []).filter(table => !table.occupied),
    [tableOptions]
  )

  useEffect(() => {
    if (targetTableKey && !emptyTables.some(table => table.tableKey === targetTableKey)) {
      setTargetTableKey('')
    }
  }, [targetTableKey, emptyTables])

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(2,6,23,.74)', zIndex:140,
      display:'flex', alignItems:'center', justifyContent:'center', padding:20,
    }}>
      <div className="touch-modal" style={{
        width:760, maxWidth:'96vw', maxHeight:'88vh', overflow:'hidden',
        background:'#0b1249', border:'1px solid rgba(255,255,255,.12)',
        borderRadius:24, boxShadow:'0 30px 80px rgba(0,0,0,.55)',
        display:'flex', flexDirection:'column',
      }}>
        <div style={{
          padding:'18px 20px', borderBottom:'1px solid rgba(255,255,255,.08)',
          display:'flex', justifyContent:'space-between', alignItems:'center', gap:16,
        }}>
          <div>
            <div style={{ color:'#fff', fontWeight:900, fontSize:'1.1rem' }}>{UI_TEXT.moveTable}</div>
            <div style={{ color:'#94a3b8', fontSize:'.82rem', marginTop:6 }}>
              {'Hizli servis siparisini bos bir masaya aktar.'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ width:38, height:38, borderRadius:999, border:'none', background:'rgba(255,255,255,.08)', color:'#fff', cursor:'pointer', fontSize:'1.1rem' }}
          >
            {UI_TEXT.close}
          </button>
        </div>

        <div style={{ padding:'18px 20px', overflowY:'auto', display:'grid', gap:16 }}>
          <div style={{
            padding:'12px 14px',
            borderRadius:16,
            border:'1px solid rgba(251,191,36,.24)',
            background:'rgba(251,191,36,.1)',
            color:'#fde68a',
            fontSize:'.82rem',
            lineHeight:1.55,
            fontWeight:700,
          }}>
            {UI_TEXT.moveTablePriceWarning}
          </div>

          {emptyTables.length === 0 ? (
            <div style={{
              padding:'20px 18px',
              borderRadius:18,
              border:'1px dashed rgba(255,255,255,.14)',
              background:'rgba(255,255,255,.03)',
              color:'#94a3b8',
              textAlign:'center',
              lineHeight:1.6,
            }}>
              {UI_TEXT.noTableDefined}
              <div style={{ marginTop:8, fontSize:'.8rem', color:'#64748b' }}>{'Tum katlar tarandi.'}</div>
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(170px, 1fr))', gap:12 }}>
              {emptyTables.map(table => {
                const selected = table.tableKey === targetTableKey
                return (
                  <button
                    key={table.tableKey}
                    type="button"
                    onClick={() => setTargetTableKey(table.tableKey)}
                    style={{
                      textAlign:'left',
                      borderRadius:18,
                      border:`1px solid ${selected ? 'rgba(251,191,36,.46)' : 'rgba(255,255,255,.08)'}`,
                      background:selected ? 'rgba(251,191,36,.12)' : 'rgba(255,255,255,.03)',
                      color:'#fff',
                      padding:'16px 16px',
                      cursor:'pointer',
                      display:'grid',
                      gap:8,
                      boxShadow:selected ? '0 12px 28px rgba(245,158,11,.12)' : 'none',
                    }}
                  >
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10 }}>
                      <div style={{ fontWeight:900, fontSize:'1rem' }}>{table.label || `Masa ${table.masaNo}`}</div>
                      <div style={{ fontSize:'.72rem', color:selected ? '#fde68a' : '#64748b', fontWeight:800 }}>
                        {selected ? 'Secili' : 'Bos'}
                      </div>
                    </div>
                    <div style={{ color:'#cbd5e1', fontSize:'.8rem' }}>{table.floorName || 'Kat bilgisi yok'}</div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div style={{
          padding:'14px 20px',
          borderTop:'1px solid rgba(255,255,255,.08)',
          background:'#05082b',
          display:'flex',
          justifyContent:'flex-end',
          gap:10,
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              minHeight:46,
              padding:'0 18px',
              borderRadius:12,
              border:'1px solid rgba(255,255,255,.12)',
              background:'transparent',
              color:'#cbd5e1',
              fontWeight:800,
              cursor:'pointer',
            }}
          >
            {UI_TEXT.cancel}
          </button>
          <button
            type="button"
            onClick={() => targetTableKey && onConfirm?.(targetTableKey)}
            disabled={!targetTableKey}
            style={{
              minHeight:46,
              padding:'0 20px',
              borderRadius:12,
              border:'none',
              background:!targetTableKey ? 'rgba(255,255,255,.08)' : 'linear-gradient(135deg,#f59e0b,#fbbf24)',
              color:!targetTableKey ? '#64748b' : '#111827',
              fontWeight:900,
              cursor:!targetTableKey ? 'not-allowed' : 'pointer',
            }}
          >
            {'Aktar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ClearOrderModalSafe({ onConfirm, onClose }) {
  const [reason, setReason] = useState('')

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,.65)', backdropFilter:'blur(4px)',
      zIndex:110, display:'flex', alignItems:'center', justifyContent:'center'
    }}>
      <div className="touch-modal" style={{
        background:'#0a0f44', border:'1px solid rgba(255,255,255,.12)', borderRadius:20,
        width:460, maxWidth:'94vw', boxShadow:'0 25px 60px rgba(0,0,0,.6)'
      }}>
        <div style={{padding:'18px 22px', borderBottom:'1px solid rgba(255,255,255,.08)'}}>
          <div style={{fontSize:'1.05rem', fontWeight:900, color:'#fff'}}>{UI_TEXT.clearOrderTitle}</div>
          <div style={{fontSize:'.84rem', color:'#94a3b8', marginTop:4}}>{UI_TEXT.clearOrderReason}</div>
        </div>

        <div style={{padding:'20px 22px'}}>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder={UI_TEXT.clearOrderPlaceholder}
            rows={5}
            style={{
              width:'100%', resize:'vertical', minHeight:120,
              background:'rgba(255,255,255,.06)', border:'1.5px solid rgba(255,255,255,.15)',
              borderRadius:14, padding:'14px 16px', color:'#fff', fontSize:'.95rem', outline:'none'
            }}
            autoFocus
          />
        </div>

        <div style={{
          padding:'14px 22px', borderTop:'1px solid rgba(255,255,255,.08)', background:'#05082b',
          borderRadius:'0 0 20px 20px', display:'flex', justifyContent:'flex-end', gap:10
        }}>
          <button className="touch-btn" onClick={onClose} style={{
            padding:'10px 18px', borderRadius:10, border:'1.5px solid rgba(255,255,255,.15)',
            background:'transparent', color:'#94a3b8', fontWeight:700, cursor:'pointer'
          }}>
            {UI_TEXT.cancel}
          </button>
          <button className="touch-btn" onClick={() => onConfirm(reason.trim())} style={{
            background:'linear-gradient(135deg,#ef4444,#f87171)', color:'#fff', border:'none',
            borderRadius:12, padding:'10px 22px', fontWeight:800, cursor:'pointer'
          }}>
            {UI_TEXT.confirmDelete}
          </button>
        </div>
      </div>
    </div>
  )
}

function DebtSaveModalSafe({ amount, onConfirm, onClose, onOpenCustomers }) {
  const [customers, setCustomers] = useState([])
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function loadCustomers() {
      setLoading(true)
      const { data, error } = await db
        .from('musteriler')
        .select('id,ad_soyad,telefon,cari,toplam_borc')
        .is('deleted_at', null)
        .order('ad_soyad')

      if (!active) return

      if (error) {
        setCustomers([])
        setSelectedId(null)
        setLoading(false)
        return
      }

      const nextCustomers = data || []
      setCustomers(nextCustomers)
      setSelectedId(nextCustomers[0]?.id || null)
      setLoading(false)
    }

    loadCustomers()
    return () => { active = false }
  }, [])

  const query = search.trim().toLowerCase()
  const filteredCustomers = customers.filter(customer => {
    if (!query) return true
    return (customer.ad_soyad || '').toLowerCase().includes(query)
      || (customer.telefon || '').includes(query)
  })
  const selectedCustomer = customers.find(customer => customer.id === selectedId) || null
  const emptyMessage = query
    ? 'Aramaya uygun m\u00fc\u015fteri bulunamad\u0131.'
    : 'Kay\u0131tl\u0131 m\u00fc\u015fteri bulunamad\u0131.'

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(2,6,23,.74)', zIndex:140, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div className="touch-modal" style={{ width:560, maxWidth:'96vw', maxHeight:'88vh', overflow:'hidden', background:'#0b1249', border:'1px solid rgba(255,255,255,.12)', borderRadius:22, boxShadow:'0 30px 80px rgba(0,0,0,.55)', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'18px 20px', borderBottom:'1px solid rgba(255,255,255,.08)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ color:'#fff', fontWeight:900, fontSize:'1.1rem' }}>{'Bor\u00e7 Kaydet'}</div>
            <div style={{ color:'#94a3b8', fontSize:'.8rem', marginTop:6 }}>{fmt(amount)}{UI_TEXT.tlSuffix} {'tutar\u0131 se\u00e7ili m\u00fc\u015fterinin hesab\u0131na yaz\u0131lacak.'}</div>
          </div>
          <button type="button" onClick={onClose} style={{ width:36, height:36, borderRadius:999, border:'none', background:'rgba(255,255,255,.08)', color:'#fff', cursor:'pointer' }}>{UI_TEXT.close}</button>
        </div>

        <div style={{ padding:'18px 20px', display:'grid', gap:16, overflowY:'auto' }}>
          <div style={{ display:'flex', gap:10 }}>
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder={'M\u00fc\u015fteri ara...'}
              style={{ flex:1, background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.12)', borderRadius:12, padding:'12px 14px', color:'#fff', outline:'none' }}
            />
            <button type="button" onClick={onOpenCustomers} style={{ padding:'0 16px', borderRadius:12, border:'1px solid rgba(96,165,250,.35)', background:'rgba(96,165,250,.12)', color:'#bfdbfe', fontWeight:800, cursor:'pointer' }}>{'M\u00fc\u015fteriler'}</button>
          </div>

          <div style={{ display:'grid', gap:10 }}>
            <div style={{ color:'#fff', fontWeight:800 }}>{'M\u00fc\u015fteri Se\u00e7imi'}</div>
            <div style={{ border:'1px solid rgba(255,255,255,.08)', borderRadius:18, background:'rgba(255,255,255,.03)', overflow:'hidden' }}>
              {loading ? (
                <div style={{ padding:'18px', color:'#94a3b8' }}>{'M\u00fc\u015fteriler y\u00fckleniyor...'}</div>
              ) : filteredCustomers.length === 0 ? (
                <div style={{ padding:'18px', color:'#94a3b8' }}>{emptyMessage}</div>
              ) : (
                <div style={{ display:'grid', gap:10, padding:12, maxHeight:280, overflowY:'auto' }}>
                  {filteredCustomers.map(customer => {
                    const selected = customer.id === selectedId
                    return (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => setSelectedId(customer.id)}
                        style={{ textAlign:'left', border:'1px solid ' + (selected ? 'rgba(251,191,36,.38)' : 'rgba(255,255,255,.08)'), borderRadius:14, padding:'12px 14px', background:selected ? 'rgba(251,191,36,.12)' : 'rgba(255,255,255,.03)', color:'#fff', cursor:'pointer', display:'grid', gap:6 }}
                      >
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
                          <div style={{ fontWeight:800 }}>{customer.ad_soyad || '\u0130simsiz M\u00fc\u015fteri'}</div>
                          {selected && <div style={{ fontSize:'.72rem', color:'#fde68a', fontWeight:800 }}>{'Se\u00e7ili'}</div>}
                        </div>
                        <div style={{ color:'#94a3b8', fontSize:'.8rem' }}>{customer.telefon || UI_TEXT.dash}</div>
                        <div style={{ color:'#fbbf24', fontSize:'.78rem', fontWeight:800 }}>{'Toplam Bor\u00e7:'} {fmt(customer.toplam_borc || customer.cari || 0)}{UI_TEXT.tlSuffix}</div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div style={{ display:'grid', gap:8 }}>
            <div style={{ color:'#cbd5e1', fontWeight:800 }}>{'A\u00e7\u0131klama Notu'}</div>
            <textarea
              value={note}
              onChange={event => setNote(event.target.value)}
              rows={4}
              placeholder={'A\u00e7\u0131klama notu...'}
              style={{ width:'100%', resize:'vertical', borderRadius:14, border:'1px solid rgba(255,255,255,.12)', background:'rgba(255,255,255,.04)', color:'#fff', padding:'12px 14px', outline:'none' }}
            />
          </div>
        </div>

        <div style={{ padding:'16px 20px', borderTop:'1px solid rgba(255,255,255,.08)', display:'flex', justifyContent:'flex-end', gap:10 }}>
          <button type="button" onClick={onClose} style={{ minWidth:120, minHeight:48, borderRadius:12, border:'1px solid rgba(255,255,255,.12)', background:'transparent', color:'#cbd5e1', fontWeight:800, cursor:'pointer' }}>{'Vazge\u00e7'}</button>
          <button
            type="button"
            disabled={!selectedCustomer}
            onClick={() => selectedCustomer && onConfirm({ customer: selectedCustomer, note })}
            style={{ minWidth:140, minHeight:48, borderRadius:12, border:'none', background:!selectedCustomer ? 'rgba(255,255,255,.08)' : 'linear-gradient(135deg,#f59e0b,#fbbf24)', color:!selectedCustomer ? '#64748b' : '#111827', fontWeight:900, cursor:!selectedCustomer ? 'not-allowed' : 'pointer' }}
          >
            {'Borca Yaz'}
          </button>
        </div>
      </div>
    </div>
  )
}
function BranchSelectModal({ branches, selectedId, onSelect }) {
  const [search, setSearch] = useState('')

  const query = search.trim().toLowerCase()
  const filteredBranches = branches.filter(branch => {
    if (!query) return true

    return (branch.branchName || '').toLowerCase().includes(query)
      || (branch.legalEntityName || '').toLowerCase().includes(query)
      || (branch.companyName || '').toLowerCase().includes(query)
  })

  const metaSeparator = ' \u2022 '

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(2,6,23,.78)', zIndex:150, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div className="touch-modal" style={{ width:680, maxWidth:'96vw', maxHeight:'90vh', overflow:'hidden', background:'#0b1249', border:'1px solid rgba(255,255,255,.12)', borderRadius:24, boxShadow:'0 30px 80px rgba(0,0,0,.55)', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'20px 22px', borderBottom:'1px solid rgba(255,255,255,.08)' }}>
          <div style={{ color:'#fff', fontWeight:900, fontSize:'1.18rem' }}>{'\u015eube Se\u00e7in'}</div>
          <div style={{ color:'#94a3b8', fontSize:'.84rem', marginTop:8 }}>{'POS sat\u0131\u015flar\u0131n\u0131n hangi \u015fube i\u00e7in i\u015flenece\u011fini se\u00e7in. Se\u00e7im bu cihazda hat\u0131rlan\u0131r.'}</div>
        </div>

        <div style={{ padding:'18px 22px', display:'grid', gap:16, overflowY:'auto' }}>
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder={'\u015eube, t\u00fczel ki\u015filik veya \u015firket ara...'}
            style={{ width:'100%', background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.12)', borderRadius:14, padding:'14px 16px', color:'#fff', outline:'none' }}
          />

          <div style={{ display:'grid', gap:12 }}>
            {filteredBranches.length === 0 ? (
              <div style={{ border:'1px solid rgba(255,255,255,.08)', borderRadius:18, background:'rgba(255,255,255,.03)', color:'#94a3b8', textAlign:'center', padding:'24px 18px' }}>{'E\u015fle\u015fen \u015fube bulunamad\u0131.'}</div>
            ) : (
              filteredBranches.map(branch => {
                const selected = branch.branchId === selectedId
                const meta = [branch.legalEntityName, branch.companyName].filter(Boolean).join(metaSeparator)

                return (
                  <button
                    key={branch.branchId}
                    type="button"
                    onClick={() => onSelect(branch.branchId)}
                    style={{ textAlign:'left', border:'1px solid ' + (selected ? 'rgba(251,191,36,.4)' : 'rgba(255,255,255,.08)'), borderRadius:18, padding:'16px 18px', background:selected ? 'rgba(251,191,36,.12)' : 'rgba(255,255,255,.03)', color:'#fff', cursor:'pointer', display:'grid', gap:8 }}
                  >
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:16 }}>
                      <div style={{ fontWeight:900, fontSize:'1rem' }}>{branch.branchName || '\u0130simsiz \u015eube'}</div>
                      {selected && <div style={{ fontSize:'.72rem', color:'#fde68a', fontWeight:800 }}>{'Se\u00e7ili'}</div>}
                    </div>
                    <div style={{ color:'#cbd5e1', fontSize:'.82rem' }}>{meta || '\u015eube ba\u011flant\u0131 tan\u0131m\u0131 yok'}</div>
                    <div style={{ color:'#64748b', fontSize:'.76rem' }}>{branch.orgUnitName || UI_TEXT.dash}</div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
function OdemeModalSafe(props) {
  return <OdemeModalFlow {...props} />
}
function OdemeModalFlow({
  cart,
  orderNote,
  masaNo,
  channelName,
  branchId = '',
  branchName = '',
  registerNo = '1',
  registerLabel = 'POS 1',
  loyaltyCampaigns = [],
  manuallyTriggeredCampaignIds = [],
  runtimeLoyaltyChannel = 'pos',
  externalLinkedCustomer = null,
  saleTemplates = [],
  onConfirm,
  onSaveDebt,
  onOpenCustomers,
  onClose,
  manualCouponCode = '',
  selectedLoyaltyProgramId = '',
}) {
  const timerRef = useRef(null)
  const loyaltyPollRef = useRef(null)
  const lastLoyaltyContextKeyRef = useRef('')
  const [unpaidItems, setUnpaidItems] = useState(() => expandCartForPayment(cart))
  const [selectedIds, setSelectedIds] = useState(() => expandCartForPayment(cart).map(item => item.id))
  const [scope, setScope] = useState('all')
  const [amountInput, setAmountInput] = useState('')
  const [discountMode, setDiscountMode] = useState(null)
  const [discountValue, setDiscountValue] = useState('')
  const [draftPayments, setDraftPayments] = useState([])
  const [completedPayments, setCompletedPayments] = useState([])
  const [completedSteps, setCompletedSteps] = useState([])
  const [busy, setBusy] = useState(false)
  const [showOtherPayments, setShowOtherPayments] = useState(false)
  const [showDebtModal, setShowDebtModal] = useState(false)
  const [splitCountInput, setSplitCountInput] = useState('')
  const [splitPlan, setSplitPlan] = useState(null)
  const [selectedSplitSlots, setSelectedSplitSlots] = useState([])
  const [autoCloseText, setAutoCloseText] = useState('')
  const [loyaltyDecisionMap, setLoyaltyDecisionMap] = useState({})
  const [appliedLoyaltyCampaignId, setAppliedLoyaltyCampaignId] = useState('')
  const [showLoyaltyLinkModal, setShowLoyaltyLinkModal] = useState(false)
  const [loyaltySession, setLoyaltySession] = useState(null)
  const [loyaltyQrUrl, setLoyaltyQrUrl] = useState('')
  const [linkedLoyaltyCustomer, setLinkedLoyaltyCustomer] = useState(() => externalLinkedCustomer || null)
  const [loyaltyLinkError, setLoyaltyLinkError] = useState('')
  const [loyaltyLinkStatus, setLoyaltyLinkStatus] = useState('')
  const [giftPaymentItemIds, setGiftPaymentItemIds] = useState([])
  const [acknowledgedWarningCampaignIds, setAcknowledgedWarningCampaignIds] = useState(new Set())

  useEffect(() => {
    const nextExpanded = expandCartForPayment(cart)
    setUnpaidItems(nextExpanded)
    setSelectedIds(prev => {
      const validIds = new Set(nextExpanded.map(item => item.id))
      const nextSelected = prev.filter(id => validIds.has(id))
      return nextSelected.length > 0 ? nextSelected : nextExpanded.map(item => item.id)
    })
  }, [cart])

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    if (loyaltyPollRef.current) window.clearInterval(loyaltyPollRef.current)
  }, [])

  // Ödeme modalı açılmadan önce kasiyer müşteriyi tanımladıysa bağla
  useEffect(() => {
    if (externalLinkedCustomer?.customerId) {
      setLinkedLoyaltyCustomer(externalLinkedCustomer)
    }
  }, [externalLinkedCustomer])

  const groupedUnpaidItems = useMemo(
    () => collapsePaymentItems(unpaidItems),
    [unpaidItems]
  )
  const linkedPreparedAdvantage = useMemo(
    () => resolvePreparedLoyaltyAdvantage(linkedLoyaltyCustomer, loyaltyCampaigns),
    [linkedLoyaltyCustomer, loyaltyCampaigns],
  )
  const availableIds = unpaidItems.map(item => item.id)
  const effectiveSelectedIds = scope === 'selected'
    ? selectedIds.filter(id => availableIds.includes(id))
    : availableIds
  const selectedTargetItems = unpaidItems.filter(item => effectiveSelectedIds.includes(item.id))
  const targetItems = scope === 'selected' ? selectedTargetItems : groupedUnpaidItems
  const displayItems = scope === 'selected' ? unpaidItems : groupedUnpaidItems
  const targetBaseTotal = targetItems.reduce((sum, item) => sum + getCartLineTotal(item), 0)
  const discountAmount = calcDiscountAmount(targetBaseTotal, discountMode, discountValue)
  const targetNetTotal = Math.max(0, targetBaseTotal - discountAmount)
  const completedPaidAmount = completedPayments.reduce((sum, payment) => sum + payment.amount, 0)
  const draftPaidAmount = draftPayments.reduce((sum, payment) => sum + payment.amount, 0)
  const totalPaidAmount = completedPaidAmount + draftPaidAmount
  const discountLocked = totalPaidAmount > 0
  const totalRemainingAmount = Math.max(0, targetNetTotal - totalPaidAmount)
  const splitSetupPending = scope === 'split' && (!splitPlan || splitPlan.totalParts === 0)
  const splitFlowStarted = splitPlan?.totalParts > 0
  const splitPreviewAmounts = useMemo(
    () => splitPlan?.totalParts > 0
      ? buildSplitPreviewAmounts(targetNetTotal, splitPlan.totalParts, splitPlan.completedParts, completedPaidAmount)
      : [],
    [splitPlan, targetNetTotal, completedPaidAmount]
  )
  const selectedSplitTargetAmount = splitPlan?.totalParts > 0
    ? roundMoney(
        selectedSplitSlots.reduce(
          (sum, slotIndex) => sum + (splitPreviewAmounts[slotIndex] || 0),
          0
        )
      )
    : 0
  const splitSelectionMissing = splitPlan?.totalParts > 0 && selectedSplitSlots.length === 0
  const currentDueAmount = splitPlan ? selectedSplitTargetAmount : totalRemainingAmount
  const currentDraftRemaining = Math.max(0, currentDueAmount - draftPaidAmount)
  const currentDraftDelta = splitPlan ? roundMoney(draftPaidAmount - currentDueAmount) : 0
  const splitHasCollectedPayment = splitFlowStarted && totalPaidAmount > 0.009
  const totalUnpaid = groupedUnpaidItems.reduce((sum, item) => sum + getCartLineTotal(item), 0)
  const orderLabel = `${channelName || 'H\u0131zl\u0131 Sat\u0131\u015f'} - Masa ${masaNo}`
  const [loyaltyEvaluation, setLoyaltyEvaluation] = useState(() =>
    evaluateRuntimeOrderCampaigns(loyaltyCampaigns, {
      runtimeChannel: runtimeLoyaltyChannel,
      orderTotal: targetBaseTotal,
      customerContext: linkedLoyaltyCustomer
        ? {
            customerId: linkedLoyaltyCustomer.customerId,
            customerName: linkedLoyaltyCustomer.customerName,
            customerCategoryIds: linkedLoyaltyCustomer.customerCategoryIds || [],
            customerCreatedAt: linkedLoyaltyCustomer.customerCreatedAt || linkedLoyaltyCustomer.created_at || null,
            customerFirstOrderAt: linkedLoyaltyCustomer.customerFirstOrderAt || linkedLoyaltyCustomer.first_order_at || null,
            tierPointsMultiplier: linkedLoyaltyCustomer.tierPointsMultiplier || linkedLoyaltyCustomer.pointsMultiplier || linkedLoyaltyCustomer.points_multiplier || 1,
          }
        : {},
      manuallyTriggeredCampaignIds,
      selectedCouponCode: linkedLoyaltyCustomer?.selectedCouponCode || manualCouponCode || '',
      cartLines: targetItems,
      saleTemplates,
    })
  )

  useEffect(() => {
    let ignore = false
    const customerContext = linkedLoyaltyCustomer
      ? {
          customerId: linkedLoyaltyCustomer.customerId,
          customerName: linkedLoyaltyCustomer.customerName,
          customerCategoryIds: linkedLoyaltyCustomer.customerCategoryIds || [],
          customerCreatedAt: linkedLoyaltyCustomer.customerCreatedAt || linkedLoyaltyCustomer.created_at || null,
          customerFirstOrderAt: linkedLoyaltyCustomer.customerFirstOrderAt || linkedLoyaltyCustomer.first_order_at || null,
          tierPointsMultiplier: linkedLoyaltyCustomer.tierPointsMultiplier || linkedLoyaltyCustomer.pointsMultiplier || linkedLoyaltyCustomer.points_multiplier || 1,
        }
      : {}

    const syncFallback = evaluateRuntimeOrderCampaigns(loyaltyCampaigns, {
      runtimeChannel: runtimeLoyaltyChannel,
      orderTotal: targetBaseTotal,
      customerContext,
      manuallyTriggeredCampaignIds,
      selectedCouponCode: linkedLoyaltyCustomer?.selectedCouponCode || manualCouponCode || '',
      cartLines: targetItems,
      saleTemplates,
    })
    setLoyaltyEvaluation(syncFallback)

    ;(async () => {
      try {
        const evaluated = await evaluateRuntimeOrderCampaignsAsync(loyaltyCampaigns, {
          runtimeChannel: runtimeLoyaltyChannel,
          orderTotal: targetBaseTotal,
          customerContext,
          manuallyTriggeredCampaignIds,
          selectedCouponCode: linkedLoyaltyCustomer?.selectedCouponCode || manualCouponCode || '',
          programId: selectedLoyaltyProgramId,
          cartLines: targetItems,
          saleTemplates,
        })
        if (ignore) return
        setLoyaltyEvaluation(evaluated)
      } catch (err) {
        console.error('Async loyalty evaluation failed in OdemeModalFlow:', err)
      }
    })()

    return () => { ignore = true }
  }, [
    linkedLoyaltyCustomer,
    loyaltyCampaigns,
    runtimeLoyaltyChannel,
    targetBaseTotal,
    manuallyTriggeredCampaignIds,
    targetItems,
    saleTemplates,
    manualCouponCode,
    selectedLoyaltyProgramId,
  ])
  const applicableLoyaltyOffers = loyaltyEvaluation.applicableOffers
  const activeWarningOffer = useMemo(() => {
    return (applicableLoyaltyOffers || []).find(
      offer => offer.actionType === 'warning_message' &&
      (offer.applicationMode === 'auto' || offer.campaignId === appliedLoyaltyCampaignId) &&
      !acknowledgedWarningCampaignIds.has(String(offer.campaignId))
    )
  }, [applicableLoyaltyOffers, appliedLoyaltyCampaignId, acknowledgedWarningCampaignIds])

  useEffect(() => {
    setAcknowledgedWarningCampaignIds(new Set())
  }, [linkedLoyaltyCustomer?.id, cart.length === 0])

  const autoApplicableLoyaltyCampaign = applicableLoyaltyOffers.find(
    offer => offer.applicationMode === 'auto' && loyaltyDecisionMap[offer.campaignId] !== 'skipped'
  ) || null
  const appliedLoyaltyCampaign = applicableLoyaltyOffers.find(
    offer => offer.campaignId === appliedLoyaltyCampaignId
  ) || null
  const pendingLoyaltyCampaign = appliedLoyaltyCampaign
    ? null
    : applicableLoyaltyOffers.find(
      offer => offer.applicationMode !== 'auto' && !loyaltyDecisionMap[offer.campaignId]
    ) || null
  const loyaltyDecisionRequired = Boolean(pendingLoyaltyCampaign)
  const manualDiscountLocked = discountLocked || loyaltyDecisionRequired || Boolean(appliedLoyaltyCampaign)
  const loyaltyContextKey = useMemo(
    () => {
      const originalTotal = roundMoney(
        targetItems.reduce((sum, item) => {
          const price = item.isGift ? (item.originalUnitPrice ?? 0) : (item.unitPrice ?? 0)
          return sum + price * (item.qty || 1)
        }, 0)
      )
      return `${scope}|${targetItems.map(item => getPaymentGroupId(item)).join(',')}|${originalTotal}|${linkedLoyaltyCustomer?.customerId || ''}|${(linkedLoyaltyCustomer?.customerCategoryIds || []).join(',')}`
    },
    [linkedLoyaltyCustomer, scope, targetItems]
  )
  const manualSelectableLoyaltyOffers = applicableLoyaltyOffers.filter(
    offer => offer.applicationMode !== 'auto',
  )
  const displayItemDiscountMap = useMemo(() => {
    const eligibleItems = scope === 'selected'
      ? displayItems.filter(item => effectiveSelectedIds.includes(item.id))
      : displayItems

    return buildProportionalDiscountMap(eligibleItems, {
      discountAmount,
      getKey: item => (scope === 'selected' ? item.id : getPaymentGroupId(item)),
      getLineTotal: item => getCartLineTotal(item),
      getQty: item => item?.qty || 1,
    })
  }, [discountAmount, displayItems, effectiveSelectedIds, scope])
  const paymentMethods = [
    { value: 'nakit', label: 'Nakit', color: '#22c55e' },
    { value: 'kart', label: 'Kredi Kart\u0131', color: '#60a5fa' },
  ]
  const otherPaymentMethods = [
    { value: 'transfer', label: 'Transfer', color: '#a78bfa' },
    { value: 'yemek_ceki', label: 'Yemek \u00c7eki', color: '#f59e0b' },
  ]

  useEffect(() => {
    if (!(splitPlan?.totalParts > 0)) {
      if (selectedSplitSlots.length > 0) setSelectedSplitSlots([])
      return
    }

    const nextValidSlots = selectedSplitSlots.filter(
      slotIndex => slotIndex >= 0 && slotIndex < splitPreviewAmounts.length
    )

    if (nextValidSlots.length !== selectedSplitSlots.length) {
      setSelectedSplitSlots(nextValidSlots)
    }
  }, [splitPlan, splitPreviewAmounts.length, selectedSplitSlots])

  useEffect(() => {
    const validCampaignIds = new Set(applicableLoyaltyOffers.map(offer => String(offer.campaignId)))

    setLoyaltyDecisionMap(prev => {
      const nextEntries = Object.entries(prev).filter(([campaignId]) => validCampaignIds.has(String(campaignId)))
      if (nextEntries.length === Object.keys(prev).length) return prev
      return Object.fromEntries(nextEntries)
    })

    if (appliedLoyaltyCampaignId && !validCampaignIds.has(String(appliedLoyaltyCampaignId))) {
      setAppliedLoyaltyCampaignId('')
      setDiscountMode(null)
      setDiscountValue('')
    }
  }, [applicableLoyaltyOffers, appliedLoyaltyCampaignId])

  useEffect(() => {
    if (!appliedLoyaltyCampaign) return
    if (appliedLoyaltyCampaign.discountType === 'free_products') return
    const nextDiscountType = appliedLoyaltyCampaign.discountType === 'amount' ? 'amount' : 'percent'
    const nextDiscountValue = String(appliedLoyaltyCampaign.discountValue ?? '')
    setDiscountMode(current => (current === nextDiscountType ? current : nextDiscountType))
    setDiscountValue(current => (current === nextDiscountValue ? current : nextDiscountValue))
  }, [appliedLoyaltyCampaign])

  useEffect(() => {
    if (!autoApplicableLoyaltyCampaign) return
    if (busy || discountLocked || totalPaidAmount > 0.009) return
    if (appliedLoyaltyCampaignId === autoApplicableLoyaltyCampaign.campaignId) return
    handleApplyLoyaltyCampaign(autoApplicableLoyaltyCampaign)
  }, [autoApplicableLoyaltyCampaign, appliedLoyaltyCampaignId, busy, discountLocked, totalPaidAmount])

  useEffect(() => {
    if (!lastLoyaltyContextKeyRef.current) {
      lastLoyaltyContextKeyRef.current = loyaltyContextKey
      return
    }

    if (lastLoyaltyContextKeyRef.current === loyaltyContextKey) return
    lastLoyaltyContextKeyRef.current = loyaltyContextKey

    if (totalPaidAmount > 0.009) return
    if (!appliedLoyaltyCampaignId && Object.keys(loyaltyDecisionMap).length === 0) return

    setAppliedLoyaltyCampaignId('')
    setLoyaltyDecisionMap({})
    setDiscountMode(null)
    setDiscountValue('')
    setGiftPaymentItemIds([])
    setUnpaidItems(prev => prev.map(item =>
      item.isGift
        ? { ...item, isGift: false, unitPrice: item.originalUnitPrice ?? item.unitPrice, giftCampaignId: undefined, giftCampaignName: undefined, originalUnitPrice: undefined }
        : item
    ))
  }, [loyaltyContextKey, totalPaidAmount, appliedLoyaltyCampaignId, loyaltyDecisionMap])

  async function openLoyaltyLinkModal() {
    if (busy || !branchId) return
    setLoyaltyLinkError('')
    setLoyaltyLinkStatus('')
    setShowLoyaltyLinkModal(true)
  }

  async function clearLinkedLoyaltyCustomer() {
    setLinkedLoyaltyCustomer(null)
    setLoyaltySession(null)
    setLoyaltyQrUrl('')
    setLoyaltyLinkError('')
    setLoyaltyLinkStatus('Musteri baglantisi kaldirildi.')
    if (loyaltyPollRef.current) {
      window.clearInterval(loyaltyPollRef.current)
      loyaltyPollRef.current = null
    }
  }

  function closeLoyaltyLinkModal() {
    setShowLoyaltyLinkModal(false)
  }

  function resetSelectionState(nextItems) {
    const nextIds = nextItems.map(item => item.id)
    lastLoyaltyContextKeyRef.current = ''
    setScope('all')
    setSelectedIds(nextIds)
    setAmountInput('')
    setDiscountMode(null)
    setDiscountValue('')
    setDraftPayments([])
    setCompletedPayments([])
    setCompletedSteps([])
    setSplitCountInput('')
    setSplitPlan(null)
    setSelectedSplitSlots([])
    setShowOtherPayments(false)
    setShowDebtModal(false)
    setLoyaltyDecisionMap({})
    setAppliedLoyaltyCampaignId('')
    setGiftPaymentItemIds([])
    setUnpaidItems(prev => prev.map(item =>
      item.isGift
        ? { ...item, isGift: false, unitPrice: item.originalUnitPrice ?? item.unitPrice, giftCampaignId: undefined, giftCampaignName: undefined, originalUnitPrice: undefined }
        : item
    ))
  }

  function clearDraftState() {
    setAmountInput('')
    setDraftPayments([])
    setCompletedPayments([])
    setCompletedSteps([])
    setSplitCountInput('')
    setSplitPlan(null)
    setSelectedSplitSlots([])
    setShowOtherPayments(false)
  }

  function clearAmountInput() {
    setAmountInput('')
  }

  function clearSplitCountInput() {
    setSplitCountInput('')
  }

  function handleApplyLoyaltyCampaign(offer = pendingLoyaltyCampaign) {
    if (!offer || busy || discountLocked) return
    setAppliedLoyaltyCampaignId(offer.campaignId)
    setLoyaltyDecisionMap(Object.fromEntries(
      applicableLoyaltyOffers.map(item => [item.campaignId, item.campaignId === offer.campaignId ? 'applied' : 'skipped'])
    ))

    if (offer.discountType === 'free_products') {
      const giftItemsDef = Array.isArray(offer.giftItems) ? offer.giftItems : []
      const newUnpaid = [...unpaidItems]
      const newGiftIds = []
      for (const giftItem of giftItemsDef) {
        let remaining = Math.max(1, giftItem.qty || 1)
        for (let i = 0; i < newUnpaid.length && remaining > 0; i++) {
          const item = newUnpaid[i]
          if (item.isGift) continue
          const matchById = giftItem.productId && item.prod?.id && String(item.prod.id) === String(giftItem.productId)
          const matchByName = !matchById && giftItem.name && item.prod?.name
            && String(item.prod.name).trim().toLowerCase() === String(giftItem.name).trim().toLowerCase()
          if (matchById || matchByName) {
            const optionTotal = getOptionTotal(item.options)
            const portionOffset = getPortionOffset(item.prod, item.portion?.id)
            const freeOptions = offer.freeOptions !== false
            const freeSizes = offer.freeSizes !== false
            const unpaidUnitPrice = (freeOptions ? 0 : optionTotal) + (freeSizes ? 0 : portionOffset)

            newUnpaid[i] = {
              ...item,
              isGift: true,
              giftCampaignId: offer.campaignId,
              giftCampaignName: offer.campaignName,
              originalUnitPrice: item.unitPrice,
              unitPrice: unpaidUnitPrice,
            }
            newGiftIds.push(item.id)
            remaining--
          }
        }
      }
      setUnpaidItems(newUnpaid)
      setGiftPaymentItemIds(newGiftIds)
      setShowOtherPayments(false)
      return
    }

    setDiscountMode(offer.discountType === 'amount' ? 'amount' : 'percent')
    setDiscountValue(String(offer.discountValue ?? ''))
    setShowOtherPayments(false)
  }

  function handleSkipLoyaltyCampaign() {
    if (!pendingLoyaltyCampaign || busy || discountLocked) return
    setLoyaltyDecisionMap(prev => ({
      ...prev,
      [pendingLoyaltyCampaign.campaignId]: 'skipped',
    }))
  }

  function handleClearAppliedLoyaltyCampaign() {
    if (!appliedLoyaltyCampaign || busy || totalPaidAmount > 0.009) return
    if (appliedLoyaltyCampaign.applicationMode === 'auto') {
      setLoyaltyDecisionMap(prev => ({
        ...prev,
        [appliedLoyaltyCampaign.campaignId]: 'skipped',
      }))
    } else {
      setLoyaltyDecisionMap({})
    }
    setAppliedLoyaltyCampaignId('')
    setDiscountMode(null)
    setDiscountValue('')
    if (giftPaymentItemIds.length > 0) {
      setUnpaidItems(prev => prev.map(item =>
        item.isGift
          ? { ...item, isGift: false, unitPrice: item.originalUnitPrice ?? item.unitPrice, giftCampaignId: undefined, giftCampaignName: undefined, originalUnitPrice: undefined }
          : item
      ))
      setGiftPaymentItemIds([])
    }
  }

  function handleScopeChange(nextScope) {
    if (busy || splitFlowStarted) return

    if (nextScope === 'all') {
      setScope('all')
      setSelectedIds(availableIds)
      clearDraftState()
      return
    }

    if (nextScope === 'selected') {
      setScope('selected')
      clearDraftState()
      return
    }

    if (nextScope === 'split') {
      setScope('split')
      setSelectedIds(availableIds)
      clearDraftState()
    }
  }

  function abortSplitFlow() {
    if (busy || splitHasCollectedPayment) return
    setScope('all')
    setSelectedIds(availableIds)
    cancelSplitFlow()
  }

  function toggleItem(itemId) {
    setScope('selected')
    setSelectedIds(prev => {
      if (prev.includes(itemId)) return prev.filter(id => id !== itemId)
      return [...prev, itemId]
    })
    setAmountInput('')
    setDraftPayments([])
    setCompletedPayments([])
    setCompletedSteps([])
    setSplitCountInput('')
    setSplitPlan(null)
    setSelectedSplitSlots([])
  }

  function pushKey(value) {
    if (busy) return
    if (splitSetupPending) {
      if (value === 'clear') {
        setSplitCountInput('')
        return
      }
      if (value === 'backspace') {
        setSplitCountInput(prev => prev.slice(0, -1))
        return
      }
      if (value === '.' ) return
      const safeValue = value.replace(/[^0-9]/g, '')
      if (!safeValue) return
      setSplitCountInput(prev => `${prev}${safeValue}`)
      return
    }
    if (value === 'clear') {
      setAmountInput('')
      return
    }
    if (value === 'backspace') {
      setAmountInput(prev => prev.slice(0, -1))
      return
    }
    if (value === '.' && amountInput.includes('.')) return
    setAmountInput(prev => `${prev}${value}`)
  }

  function setFullAmount() {
    if (splitSetupPending) return
    const targetAmount = splitPlan
      ? (currentDueAmount > 0 ? currentDueAmount : currentDraftRemaining)
      : totalRemainingAmount
    setAmountInput(targetAmount > 0 ? fmt(targetAmount) : '')
  }

  function startSplitFlow() {
    const parsedCount = parseInt(splitCountInput, 10)
    if (busy || targetItems.length === 0) return
    if (!parsedCount || parsedCount < 2) return
    const initialPreview = buildSplitPreviewAmounts(targetNetTotal, parsedCount, 0, 0)
    const initialTarget = initialPreview[0] || 0
    setDraftPayments([])
    setCompletedPayments([])
    setCompletedSteps([])
    setAmountInput(initialTarget > 0 ? fmt(initialTarget) : '')
    setSplitPlan({ totalParts: parsedCount, completedParts: 0 })
    setSelectedSplitSlots(initialPreview.length > 0 ? [0] : [])
    setShowOtherPayments(false)
  }

  function cancelSplitFlow() {
    setSplitPlan(null)
    setSplitCountInput('')
    setSelectedSplitSlots([])
    setDraftPayments([])
    setCompletedPayments([])
    setCompletedSteps([])
    setAmountInput('')
    setShowOtherPayments(false)
  }

  function toggleSplitSlot(slotIndex) {
    if (!(splitPlan?.totalParts > 0)) return

    setSelectedSplitSlots(prev => {
      const nextSlots = prev.includes(slotIndex)
        ? prev.filter(value => value !== slotIndex)
        : [...prev, slotIndex].sort((a, b) => a - b)
      const nextTargetAmount = roundMoney(
        nextSlots.reduce((sum, value) => sum + (splitPreviewAmounts[value] || 0), 0)
      )
      setDraftPayments([])
      setAmountInput(nextTargetAmount > 0 ? fmt(nextTargetAmount) : '')
      setShowOtherPayments(false)
      return nextSlots
    })
  }

  async function finalizeCurrentSelection(allPayments, mode = 'payment', debtPayload = null) {
    if (busy || targetItems.length === 0) return
    setBusy(true)
    const multipliersActive = (loyaltyEvaluation.combinedEarnMultiplier && loyaltyEvaluation.combinedEarnMultiplier !== 1) ||
                              (loyaltyEvaluation.combinedRedeemMultiplier && loyaltyEvaluation.combinedRedeemMultiplier !== 1);
    const loyaltyCampaignPayload = appliedLoyaltyCampaign || (multipliersActive ? {
      decisionContext: {
        combinedEarnMultiplier: loyaltyEvaluation.combinedEarnMultiplier,
        combinedRedeemMultiplier: loyaltyEvaluation.combinedRedeemMultiplier,
        tierPointsMultiplier: (linkedLoyaltyCustomer?.tierPointsMultiplier || linkedLoyaltyCustomer?.pointsMultiplier || linkedLoyaltyCustomer?.points_multiplier || 1)
      }
    } : null);
    const payload = {
      items: targetItems.map(item => ({ ...item })),
      payments: allPayments,
      discountType: discountMode,
      discountValue,
      discountAmount,
      total: targetNetTotal,
      loyaltyCampaign: createSaleLoyaltySnapshot(loyaltyCampaignPayload),
      customer: linkedLoyaltyCustomer
        ? {
            id: linkedLoyaltyCustomer.customerId,
            name: linkedLoyaltyCustomer.customerName,
            customerId: linkedLoyaltyCustomer.customerId,
            customerName: linkedLoyaltyCustomer.customerName,
            selectedCampaignId: linkedLoyaltyCustomer.selectedCampaignId || '',
            selectedCampaignName: linkedLoyaltyCustomer.selectedCampaignName || '',
            selectedCouponCode: linkedLoyaltyCustomer.selectedCouponCode || '',
            selectedCouponLabel: linkedLoyaltyCustomer.selectedCouponLabel || '',
            customerCategoryIds: linkedLoyaltyCustomer.customerCategoryIds || [],
          }
        : null,
    }
    const result = mode === 'debt'
      ? await onSaveDebt({ ...payload, debt: debtPayload })
      : await onConfirm(payload)

    if (!result?.success) {
      setBusy(false)
      return
    }

    const nextUnpaidItems = scope === 'selected'
      ? unpaidItems.filter(item => !effectiveSelectedIds.includes(item.id))
      : unpaidItems.filter(item => !targetItems.some(targetItem => getPaymentGroupId(targetItem) === getPaymentGroupId(item)))
    setUnpaidItems(nextUnpaidItems)
    resetSelectionState(nextUnpaidItems)

    if (nextUnpaidItems.length === 0) {
      if (loyaltySession?.token) {
        await consumePosLoyaltyLinkSession(loyaltySession.token)
      }
      setLinkedLoyaltyCustomer(null)
      setLoyaltySession(null)
      setLoyaltyQrUrl('')
      setAutoCloseText('\u00d6deme tamamland\u0131. POS ekran\u0131na d\u00f6n\u00fcl\u00fcyor...')
      timerRef.current = window.setTimeout(() => onClose(), 2000)
    }

    setBusy(false)
  }

  async function commitCurrentDraft() {
    if (busy || targetItems.length === 0) return
    if (splitPlan) {
      if (splitSelectionMissing || draftPaidAmount <= 0.009) return

      const mergedPayments = [...completedPayments, ...draftPayments]
      const selectedPartCount = Math.max(1, selectedSplitSlots.length)
      const nextCompletedParts = Math.min(
        splitPlan.totalParts,
        splitPlan.completedParts + selectedPartCount
      )
      const paidThisStep = roundMoney(
        draftPayments.reduce((sum, payment) => sum + payment.amount, 0)
      )
      const stepLabel = draftPayments.map(payment => payment.label).join(' + ') || '\u00d6deme'
      const stepTitle = selectedPartCount > 1
        ? `B\u00f6l\u00fcmler ${splitPlan.completedParts + 1}-${nextCompletedParts}/${splitPlan.totalParts}`
        : `B\u00f6l\u00fcm ${nextCompletedParts}/${splitPlan.totalParts}`

      setCompletedPayments(mergedPayments)
      setCompletedSteps(prev => [
        ...prev,
        {
          id: uid(),
          title: stepTitle,
          label: stepLabel,
          amount: paidThisStep,
        },
      ])
      setDraftPayments([])
      setShowOtherPayments(false)

      const mergedTotal = mergedPayments.reduce((sum, payment) => sum + payment.amount, 0)
      const nextRemainingTotal = Math.max(0, targetNetTotal - mergedTotal)

      if (nextCompletedParts >= splitPlan.totalParts || nextRemainingTotal <= 0.009) {
        await finalizeCurrentSelection(mergedPayments)
        return
      }

      const nextPreview = buildSplitPreviewAmounts(
        targetNetTotal,
        splitPlan.totalParts,
        nextCompletedParts,
        mergedTotal
      )
      setSplitPlan(prev => ({ ...prev, completedParts: nextCompletedParts }))
      setSelectedSplitSlots(nextPreview.length > 0 ? [0] : [])
      setAmountInput(nextPreview.length > 0 ? fmt(nextPreview[0]) : '')
      return
    }

    if (totalRemainingAmount > 0.009) return
    await finalizeCurrentSelection(draftPayments)
  }

  async function handleMethodClick(method) {
    if (busy || targetItems.length === 0) return
    if (splitPlan && splitSelectionMissing) return

    const remainingForThisStep = splitPlan ? currentDraftRemaining : totalRemainingAmount
    if (remainingForThisStep <= 0) {
      if (splitPlan) await commitCurrentDraft()
      return
    }

    const enteredAmount = parseFloat(amountInput)
    const amount = splitPlan
      ? (enteredAmount > 0
          ? enteredAmount
          : (draftPaidAmount > 0
              ? currentDraftRemaining
              : currentDueAmount))
      : (enteredAmount > 0 ? Math.min(enteredAmount, remainingForThisStep) : remainingForThisStep)
    if (amount <= 0) return

    const nextDraftPayments = [...draftPayments, { id: uid(), method: method.value, label: method.label, amount }]
    setDraftPayments(nextDraftPayments)
    setAmountInput('')
    setShowOtherPayments(false)

    const nextDraftTotal = nextDraftPayments.reduce((sum, payment) => sum + payment.amount, 0)
    const nextRemainingForStep = Math.max(0, remainingForThisStep - nextDraftTotal)
    if (nextRemainingForStep <= 0.009 && !splitPlan) {
      await finalizeCurrentSelection(nextDraftPayments)
    }
  }

  const debtDisabled = busy || targetItems.length === 0 || totalPaidAmount > 0 || splitPlan || loyaltyDecisionRequired
  const splitPaymentLocked = splitSetupPending || (splitPlan && splitSelectionMissing) || loyaltyDecisionRequired
  const splitCommitDisabled = busy
    || targetItems.length === 0
    || splitPaymentLocked
    || (splitPlan ? splitSelectionMissing || draftPaidAmount <= 0.009 : totalRemainingAmount > 0.009)

  const campaignNotes = (applicableLoyaltyOffers || [])
    .filter(offer => {
      const isApplied = (offer.applicationMode === 'auto' && loyaltyDecisionMap[offer.campaignId] !== 'skipped') ||
                        (offer.campaignId === appliedLoyaltyCampaignId);
      return isApplied && offer.actionType === 'write_customer_note' && offer.customerNote;
    })
    .map(offer => offer.customerNote);
  const displayOrderNote = [orderNote, ...campaignNotes].filter(Boolean).join(' | ');

  return (
    <>
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.72)', backdropFilter:'blur(4px)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:18 }}>
        <div className="touch-modal" style={{ width:1180, maxWidth:'98vw', maxHeight:'94vh', overflow:'hidden', background:'#071035', border:'1px solid rgba(255,255,255,.12)', borderRadius:24, boxShadow:'0 30px 90px rgba(0,0,0,.58)', display:'flex', flexDirection:'column' }}>
          <div style={{ padding:'18px 20px', borderBottom:'1px solid rgba(255,255,255,.08)', display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16 }}>
            <div>
              <div style={{ fontSize:'1.2rem', fontWeight:900, color:'#fff' }}>{UI_TEXT.paymentTitle}</div>
              <div style={{ fontSize:'.8rem', color:'#93c5fd', marginTop:6 }}>{orderLabel}</div>
              {displayOrderNote && <div style={{ fontSize:' .76rem', color:'#cbd5e1', marginTop:8 }}>{'Sipari\u015f Notu: '}{displayOrderNote}</div>}
            </div>
            <button onClick={onClose} style={{ width:36, height:36, borderRadius:99, border:'none', background:'rgba(255,255,255,.08)', color:'#fff', cursor:'pointer', fontSize:'1.2rem' }}>{UI_TEXT.close}</button>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'minmax(340px,1fr) minmax(460px,1.1fr)', flex:1, minHeight:0 }}>
            <div style={{ borderRight:'1px solid rgba(255,255,255,.08)', padding:18, display:'flex', flexDirection:'column', gap:14, minHeight:0 }}>
              <div style={{ display:'grid', gridTemplateColumns:'minmax(0, 1fr)', gap:10 }}>
                <div style={{ position:'relative', minHeight:56, borderRadius:18, border:'1px solid rgba(255,255,255,.12)', background:'rgba(255,255,255,.03)', padding:4, overflow:'hidden' }}>
                  <div style={{
                    position:'absolute',
                    top:4,
                    bottom:4,
                    left:4,
                    width:'calc((100% - 8px) / 3)',
                    borderRadius:14,
                    background:scope === 'all'
                      ? 'linear-gradient(135deg, rgba(251,191,36,.24), rgba(245,158,11,.14))'
                      : scope === 'selected'
                        ? 'linear-gradient(135deg, rgba(56,189,248,.24), rgba(59,130,246,.14))'
                        : 'linear-gradient(135deg, rgba(167,139,250,.24), rgba(124,58,237,.14))',
                    border:`1px solid ${scope === 'all' ? 'rgba(251,191,36,.44)' : scope === 'selected' ? 'rgba(56,189,248,.4)' : 'rgba(167,139,250,.42)'}`,
                    boxShadow:scope === 'all'
                      ? '0 10px 30px rgba(245,158,11,.16)'
                      : scope === 'selected'
                        ? '0 10px 30px rgba(59,130,246,.16)'
                        : '0 10px 30px rgba(124,58,237,.16)',
                    transform:scope === 'all'
                      ? 'translateX(0)'
                      : scope === 'selected'
                        ? 'translateX(calc(100% + 4px))'
                        : 'translateX(calc(200% + 8px))',
                    transition:'transform .22s ease, background .22s ease, border-color .22s ease',
                  }} />
                  <div style={{ position:'relative', zIndex:1, display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:4, height:'100%' }}>
                    <button
                      type="button"
                      onClick={() => handleScopeChange('all')}
                      style={{ minHeight:48, border:'none', background:'transparent', color:scope === 'all' ? '#fde68a' : '#cbd5e1', fontWeight:900, fontSize:'.98rem', cursor:busy || splitFlowStarted ? 'not-allowed' : 'pointer', opacity:busy ? 0.6 : 1 }}
                    >
                      {'T\u00fcm\u00fc'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleScopeChange('selected')}
                      style={{ minHeight:48, border:'none', background:'transparent', color:scope === 'selected' ? '#dbeafe' : '#cbd5e1', fontWeight:900, fontSize:'.98rem', cursor:busy || splitFlowStarted ? 'not-allowed' : 'pointer', opacity:busy ? 0.6 : 1 }}
                    >
                      {'Se\u00e7ili Olanlar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleScopeChange('split')}
                      style={{ minHeight:48, border:'none', background:'transparent', color:scope === 'split' ? '#ede9fe' : '#cbd5e1', fontWeight:900, fontSize:'.98rem', cursor:busy || splitFlowStarted ? 'not-allowed' : 'pointer', opacity:busy ? 0.6 : 1 }}
                    >
                      {'B\u00f6l'}
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0, 1fr))', gap:10 }}>
                <div style={{ padding:'14px 16px', borderRadius:16, background:'rgba(255,255,255,.04)' }}>
                  <div style={{ fontSize:' .74rem', color:'#94a3b8', textTransform:'uppercase', letterSpacing:' .08em' }}>{'Kalan Sipari\u015f'}</div>
                  <div style={{ fontSize:'1.5rem', color:'#fbbf24', fontWeight:900, marginTop:4 }}>{fmt(totalUnpaid)}{UI_TEXT.tlSuffix}</div>
                </div>
                <div style={{ padding:'14px 16px', borderRadius:16, background:'rgba(255,255,255,.04)' }}>
                  <div style={{ fontSize:' .74rem', color:'#94a3b8', textTransform:'uppercase', letterSpacing:' .08em' }}>{'Se\u00e7ili Tutar'}</div>
                  <div style={{ fontSize:'1.5rem', color:'#fff', fontWeight:900, marginTop:4 }}>{fmt(targetBaseTotal)}{UI_TEXT.tlSuffix}</div>
                </div>
                <div style={{ padding:'14px 16px', borderRadius:16, background:'rgba(16,185,129,.12)' }}>
                  <div style={{ fontSize:' .74rem', color:'#86efac', textTransform:'uppercase', letterSpacing:' .08em' }}>{splitPlan ? 'Se\u00e7ili Pay' : 'Kalan'}</div>
                  <div style={{ fontSize:'1.5rem', color:'#fbbf24', fontWeight:900, marginTop:4 }}>{fmt(splitPlan ? currentDueAmount : totalRemainingAmount)}{UI_TEXT.tlSuffix}</div>
                </div>
              </div>

              {(scope === 'split' || splitPlan || splitCountInput) && (
                <div style={{ padding:14, borderRadius:16, background:'rgba(167,139,250,.1)', border:'1px solid rgba(167,139,250,.24)', display:'flex', flexDirection:'column', gap:10 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center' }}>
                    <div>
                      <div style={{ color:'#e9d5ff', fontWeight:900 }}>{'B\u00f6lme Ak\u0131\u015f\u0131'}</div>
                      <div style={{ color:'#cbd5e1', fontSize:'.78rem', marginTop:4 }}>
                        {splitPlan && splitPlan.totalParts > 0
                          ? `${selectedSplitSlots.length || 0} pay se\u00e7ili. \u00d6nerilen toplam ${fmt(currentDueAmount)}${UI_TEXT.tlSuffix}`
                          : 'Sipari\u015fi ka\u00e7a b\u00f6lece\u011finizi sayisal olarak girin.'}
                      </div>
                    </div>
                    {(scope === 'split' || splitPlan) && (
                      <button
                        onClick={abortSplitFlow}
                        disabled={busy || splitHasCollectedPayment}
                        title={splitHasCollectedPayment ? 'B\u00f6lme ak\u0131\u015f\u0131nda tahsilat ba\u015flad\u0131ktan sonra vazge\u00e7ilemez.' : 'B\u00f6lme ak\u0131\u015f\u0131ndan \u00e7\u0131k.'}
                        style={{ padding:'10px 12px', borderRadius:10, border:'1px solid rgba(255,255,255,.12)', background:'transparent', color:busy || splitHasCollectedPayment ? '#64748b' : '#cbd5e1', cursor:busy || splitHasCollectedPayment ? 'not-allowed' : 'pointer' }}
                      >
                        {'Vazge\u00e7'}
                      </button>
                    )}
                  </div>

                  {splitPlan?.totalParts > 0 && splitPreviewAmounts.length > 0 && (
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(96px, 1fr))', gap:10 }}>
                      {splitPreviewAmounts.map((amount, index) => (
                        <button
                          key={`${index}_${amount}`}
                          type="button"
                          onClick={() => toggleSplitSlot(index)}
                          style={{
                            minHeight:62,
                            borderRadius:16,
                            border:`1px solid ${selectedSplitSlots.includes(index) ? 'rgba(251,191,36,.62)' : 'rgba(132,204,22,.45)'}`,
                            background:selectedSplitSlots.includes(index)
                              ? 'linear-gradient(135deg, rgba(251,191,36,.24), rgba(245,158,11,.16))'
                              : 'rgba(101,163,13,.22)',
                            display:'grid',
                            placeItems:'center',
                            color:selectedSplitSlots.includes(index) ? '#fef3c7' : '#d9f99d',
                            fontWeight:900,
                            fontSize:'1.05rem',
                            cursor:'pointer',
                            boxShadow:selectedSplitSlots.includes(index) ? '0 12px 28px rgba(245,158,11,.16)' : 'none',
                          }}
                        >
                          <div style={{ display:'grid', gap:4, textAlign:'center' }}>
                            <div style={{ fontSize:'.72rem', opacity:.82 }}>{`${index + 1}. pay`}</div>
                            <div>{fmt(amount)}{UI_TEXT.tlSuffix}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {splitPlan?.totalParts > 0 && (
                    <div style={{ color:'#dbeafe', fontSize:'.76rem', lineHeight:1.55 }}>
                      {splitSelectionMissing
                        ? 'Kart secerek hangi paylarin odeme adimina alinacagini belirleyin.'
                        : currentDraftDelta > 0.009
                          ? `Bu adimda onerilenden ${fmt(currentDraftDelta)}${UI_TEXT.tlSuffix} fazla tahsil ediliyor. Kalan kutular yeniden bolunecek.`
                          : draftPaidAmount > 0 && currentDraftRemaining > 0.009
                            ? `Bu adimda ${fmt(currentDraftRemaining)}${UI_TEXT.tlSuffix} daha az tahsil edilmis olacak. Odemeyi tamamlarsaniz kalan kutular yeniden bolunecek.`
                            : 'Bir veya birden fazla pay secip odemeyi o toplam uzerinden tamamlayabilirsiniz.'}
                    </div>
                  )}
                </div>
              )}

              <div style={{ flex:1, minHeight:0, overflowY:'auto', display:'flex', flexDirection:'column', gap:10 }}>
                {displayItems.length === 0 ? (
                    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', border:'1px dashed rgba(255,255,255,.12)', borderRadius:18, color:'#64748b', fontWeight:700 }}>{'\u00d6deme bekleyen kalem kalmad\u0131'}</div>
                ) : displayItems.map(item => {
                  const itemKey = scope === 'selected' ? item.id : getPaymentGroupId(item)
                  const isSelected = scope === 'selected' && effectiveSelectedIds.includes(item.id)
                  const linePricing = displayItemDiscountMap.get(String(itemKey))
                  const lineTotal = roundMoney(getCartLineTotal(item))
                  const hasLineDiscount = (linePricing?.lineDiscountAmount || 0) > 0.009
                  const itemCommonStyle = {
                    width:'100%',
                    textAlign:'left',
                    padding:'12px 14px',
                    borderRadius:14,
                    border:`1px solid ${scope === 'selected' && isSelected ? 'rgba(251,191,36,.45)' : 'rgba(255,255,255,.08)'}`,
                    background:scope === 'selected' && isSelected ? 'rgba(251,191,36,.1)' : 'rgba(255,255,255,.03)',
                    color:'#fff',
                  }

                  const content = (
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
                      <div style={{ display:'flex', gap:10 }}>
                        {scope === 'selected' && (
                          <div style={{ width:22, height:22, borderRadius:6, marginTop:2, border:`1px solid ${isSelected ? '#fbbf24' : 'rgba(255,255,255,.2)'}`, background:isSelected ? '#fbbf24' : 'transparent', color:isSelected ? '#0f172a' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'.78rem', fontWeight:900 }}>{'\u2713'}</div>
                        )}
                        <div>
                          <div style={{ fontWeight:800, fontSize:'.9rem' }}>{getCartLineLabel(item)}</div>
                          {item.isGift && (
                            <div style={{ fontSize:'.72rem', color:'#34d399', marginTop:4 }}>🎁 {item.giftCampaignName} hediyesi</div>
                          )}
                          {!item.isGift && item.note && <div style={{ fontSize:'.72rem', color:'#34d399', marginTop:4 }}>Not: {item.note}</div>}
                        </div>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        {item.isGift ? (
                          <>
                            <div style={{ fontSize:'.7rem', color:'#94a3b8', textDecoration:'line-through' }}>{fmt(roundMoney((item.originalUnitPrice || 0) * (item.qty || 1)))}{UI_TEXT.tlSuffix}</div>
                            <div style={{ fontWeight:900, color:'#34d399' }}>0{UI_TEXT.tlSuffix}</div>
                            <div style={{ fontSize:'.72rem', color:'#94a3b8' }}>Adet: {item.qty}</div>
                          </>
                        ) : (
                          <>
                            {hasLineDiscount && (
                              <div style={{ fontSize:'.7rem', color:'#94a3b8', textDecoration:'line-through' }}>{fmt(lineTotal)}{UI_TEXT.tlSuffix}</div>
                            )}
                            <div style={{ fontWeight:900, color:'#fbbf24' }}>{fmt(hasLineDiscount ? linePricing.lineTotalAfterDiscount : lineTotal)}{UI_TEXT.tlSuffix}</div>
                            <div style={{ fontSize:'.72rem', color:'#94a3b8' }}>Adet: {item.qty}</div>
                            {hasLineDiscount && (
                              <div style={{ fontSize:'.72rem', color:'#fca5a5', marginTop:4 }}>
                                {appliedLoyaltyCampaign ? appliedLoyaltyCampaign.campaignName : 'Indirim'}: -{fmt(linePricing.lineDiscountAmount)}{UI_TEXT.tlSuffix}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )

                  if (scope !== 'selected') {
                    return (
                      <div key={itemKey} style={itemCommonStyle}>
                        {content}
                      </div>
                    )
                  }

                  return (
                    <button key={itemKey} onClick={() => toggleItem(item.id)} style={{ ...itemCommonStyle, cursor:'pointer' }}>
                      {content}
                    </button>
                  )
                })}
              </div>

              <div style={{ borderTop:'1px solid rgba(255,255,255,.08)', paddingTop:14, display:'flex', flexDirection:'column', gap:10, minHeight:150 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ fontWeight:900, color:'#fff' }}>{'Tamamlanan Ad\u0131mlar'}</div>
                  <div style={{ fontSize:'.75rem', color:'#94a3b8' }}>{fmt(completedPaidAmount)}{UI_TEXT.tlSuffix}</div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:8, overflowY:'auto' }}>
                  {completedSteps.length === 0 ? (
                    <div style={{ color:'#64748b', fontSize:' .8rem' }}>{'Hen\u00fcz tamamlanan ad\u0131m yok'}</div>
                  ) : completedSteps.map(step => (
                    <div key={step.id} style={{ padding:'10px 12px', borderRadius:12, background:'rgba(16,185,129,.12)', border:'1px solid rgba(16,185,129,.2)' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', gap:10 }}>
                        <div style={{ fontWeight:800, color:'#d1fae5' }}>{step.title}</div>
                        <div style={{ fontWeight:900, color:'#34d399' }}>{fmt(step.amount)}{UI_TEXT.tlSuffix}</div>
                      </div>
                      <div style={{ fontSize:'.72rem', color:'#cbd5e1', marginTop:6 }}>{step.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ padding:18, display:'flex', flexDirection:'column', gap:14, minHeight:0, overflowY:'auto' }}>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0, 1fr))', gap:10 }}>
                <div style={{ padding:'14px 16px', borderRadius:16, background:'rgba(255,255,255,.04)' }}>
                  <div style={{ fontSize:' .74rem', color:'#94a3b8', textTransform:'uppercase' }}>{'\u0130ndirim'}</div>
                  <div style={{ fontSize:'1.7rem', fontWeight:900, color:'#fecaca', marginTop:4 }}>{fmt(discountAmount)}{UI_TEXT.tlSuffix}</div>
                </div>
                <div style={{ padding:'14px 16px', borderRadius:16, background:'rgba(255,255,255,.04)' }}>
                  <div style={{ fontSize:'.74rem', color:'#94a3b8', textTransform:'uppercase' }}>Toplam Tahsilat</div>
                  <div style={{ fontSize:'1.7rem', fontWeight:900, color:'#fff', marginTop:4 }}>{fmt(totalPaidAmount)}{UI_TEXT.tlSuffix}</div>
                </div>
                <div style={{ padding:'14px 16px', borderRadius:16, background:'rgba(16,185,129,.12)' }}>
                  <div style={{ fontSize:'.74rem', color:'#86efac', textTransform:'uppercase' }}>Genel Kalan</div>
                  <div style={{ fontSize:'1.7rem', fontWeight:900, color:'#fbbf24', marginTop:4 }}>{fmt(totalRemainingAmount)}{UI_TEXT.tlSuffix}</div>
                </div>
              </div>

              {linkedLoyaltyCustomer ? (
                <div style={{
                  padding: 14,
                  borderRadius: 18,
                  border: '1px solid rgba(34,197,94,.24)',
                  background: 'rgba(20,83,45,.24)',
                  display: 'grid',
                  gap: 12,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ color: '#86efac', fontSize: '.74rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                        Sadakat musteri baglantisi
                      </div>
                      <div style={{ marginTop: 6, color: '#fff', fontWeight: 900, fontSize: '1rem' }}>
                        {linkedLoyaltyCustomer.customerName}
                      </div>
                      <div style={{ marginTop: 6, color: '#cbd5e1', fontSize: '.8rem', lineHeight: 1.55 }}>
                        {`${linkedLoyaltyCustomer.phone || 'Telefon bilgisi yok'}${(linkedLoyaltyCustomer.customerCategoryIds || []).length > 0 ? ` • ${(linkedLoyaltyCustomer.customerCategoryIds || []).length} kategori uyeligi` : ''}`}
                      </div>
                      <PreparedAdvantageRows preparedAdvantage={linkedPreparedAdvantage} tone="light" />
                    </div>
                  </div>
                </div>
              ) : null}

              <LoyaltyCheckoutPrompt
                pendingCampaign={pendingLoyaltyCampaign}
                appliedCampaign={appliedLoyaltyCampaign}
                onApply={() => handleApplyLoyaltyCampaign()}
                onSkip={handleSkipLoyaltyCampaign}
                onClear={handleClearAppliedLoyaltyCampaign}
                disabled={busy || totalPaidAmount > 0.009}
              />

              {splitSetupPending ? (
                <div style={{ display:'grid', gap:12, background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.08)', borderRadius:18, padding:18 }}>
                  <div style={{ minHeight:182, borderRadius:20, border:'1px solid rgba(255,255,255,.1)', background:'rgba(255,255,255,.02)', display:'grid', placeItems:'center', textAlign:'center', padding:'18px 22px' }}>
                    <div style={{ display:'grid', gap:14 }}>
                      <div style={{ fontSize:'2rem', fontWeight:900, color:'#fff' }}>{'\u00d6deme Ka\u00e7a B\u00f6l\u00fcnecek'}</div>
                      <div style={{ color:'#cbd5e1', fontSize:'.92rem' }}>{'Numerik tuslarla kisi sayisini girin. Bu asamada diger odeme alanlari pasiftir.'}</div>
                      <div style={{ fontSize:'3rem', fontWeight:900, color:'#c4b5fd', letterSpacing:'.04em' }}>{splitCountInput || '-'}</div>
                    </div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 160px', gap:10 }}>
                    <button onClick={clearSplitCountInput} style={{ minHeight:52, borderRadius:12, border:'1px solid rgba(255,255,255,.12)', background:'transparent', color:'#cbd5e1', fontWeight:800, cursor:'pointer' }}>Temizle</button>
                    <button onClick={startSplitFlow} disabled={!splitCountInput || parseInt(splitCountInput, 10) < 2} style={{ minHeight:52, borderRadius:12, border:'none', background:!splitCountInput || parseInt(splitCountInput, 10) < 2 ? 'rgba(255,255,255,.1)' : 'linear-gradient(135deg,#8b5cf6,#6366f1)', color:!splitCountInput || parseInt(splitCountInput, 10) < 2 ? '#64748b' : '#fff', fontWeight:900, cursor:!splitCountInput || parseInt(splitCountInput, 10) < 2 ? 'not-allowed' : 'pointer' }}>{'Ba\u015flat'}</button>
                  </div>
                </div>
              ) : (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.08)', borderRadius:18, padding:14 }}>
                  <div>
                    <div style={{ fontSize:' .78rem', fontWeight:800, color:'#cbd5e1', marginBottom:8 }}>{'\u0130ndirim'}</div>
                    <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                      <button onClick={() => !manualDiscountLocked && setDiscountMode(discountMode === 'percent' ? null : 'percent')} disabled={manualDiscountLocked} style={{ flex:1, padding:'10px 0', borderRadius:10, cursor:manualDiscountLocked ? 'not-allowed' : 'pointer', border:`1px solid ${discountMode === 'percent' ? '#fbbf24' : 'rgba(255,255,255,.12)'}`, background:discountMode === 'percent' ? 'rgba(251,191,36,.15)' : 'transparent', color:manualDiscountLocked ? '#64748b' : (discountMode === 'percent' ? '#fbbf24' : '#cbd5e1'), fontWeight:800 }}>{'% \u0130ndir'}</button>
                      <button onClick={() => !manualDiscountLocked && setDiscountMode(discountMode === 'amount' ? null : 'amount')} disabled={manualDiscountLocked} style={{ flex:1, padding:'10px 0', borderRadius:10, cursor:manualDiscountLocked ? 'not-allowed' : 'pointer', border:`1px solid ${discountMode === 'amount' ? '#38bdf8' : 'rgba(255,255,255,.12)'}`, background:discountMode === 'amount' ? 'rgba(56,189,248,.15)' : 'transparent', color:manualDiscountLocked ? '#64748b' : (discountMode === 'amount' ? '#38bdf8' : '#cbd5e1'), fontWeight:800 }}>{'Tutar \u0130ndir'}</button>
                    </div>
                    <input value={discountValue} onChange={e => setDiscountValue(e.target.value)} placeholder={discountMode === 'percent' ? 'Oran gir...' : 'Tutar gir...'} disabled={!discountMode || manualDiscountLocked} style={{ width:'100%', background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.12)', borderRadius:12, padding:'12px 14px', color:'#fff', outline:'none' }} />
                  </div>

                  <div>
                    <div style={{ fontSize:' .78rem', fontWeight:800, color:'#cbd5e1', marginBottom:8 }}>{'Tutar Giri\u015fi'}</div>
                    <div style={{ border:'1px solid rgba(255,255,255,.1)', background:'rgba(15,23,42,.55)', borderRadius:14, padding:'14px 16px', textAlign:'right', fontSize:'2rem', fontWeight:900, color:'#fff', minHeight:68 }}>{amountInput || '0'}</div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0, 1fr))', gap:8, marginTop:8 }}>
                      <button onClick={setFullAmount} style={{ minHeight:48, borderRadius:12, border:'none', background:'linear-gradient(135deg,#f59e0b,#fbbf24)', color:'#111827', fontWeight:900, cursor:'pointer' }}>{'Tamam\u0131'}</button>
                      <button onClick={clearAmountInput} style={{ minHeight:48, borderRadius:12, border:'1px solid rgba(255,255,255,.12)', background:'transparent', color:'#cbd5e1', fontWeight:800, cursor:'pointer' }}>Temizle</button>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0, 1fr))', gap:8 }}>
                {['1','2','3','4','5','6','7','8','9','00','0','.'].map(key => (
                  <button key={key} onClick={() => pushKey(key)} disabled={splitSetupPending && key === '.'} style={{ minHeight:52, borderRadius:12, border:'1px solid rgba(255,255,255,.1)', background:splitSetupPending && key === '.' ? 'rgba(255,255,255,.02)' : 'rgba(255,255,255,.04)', color:splitSetupPending && key === '.' ? '#475569' : '#fff', fontSize:'1.1rem', fontWeight:900, cursor:splitSetupPending && key === '.' ? 'not-allowed' : 'pointer' }}>{key}</button>
                ))}
                <button onClick={() => pushKey('backspace')} style={{ minHeight:48, borderRadius:12, border:'1px solid rgba(255,255,255,.1)', background:'rgba(248,113,113,.12)', color:'#fecaca', fontWeight:800, cursor:'pointer' }}>Sil</button>
                <button onClick={() => pushKey('clear')} style={{ minHeight:48, borderRadius:12, border:'1px solid rgba(255,255,255,.1)', background:'rgba(148,163,184,.12)', color:'#cbd5e1', fontWeight:800, cursor:'pointer' }}>C</button>
              </div>

              <div style={{ padding:'12px 14px', borderRadius:14, background:'rgba(96,165,250,.09)', border:'1px solid rgba(96,165,250,.18)', color:'#dbeafe', fontSize:'.78rem', lineHeight:1.5 }}>
                {splitPlan
                  ? 'Secili pay kartlarina tiklayin. Tutar yazmadan odeme tipi secilirse secili pay toplami baz alinir; eksik ya da fazla odeme alinabilir ve kalan kutular otomatik yeniden bolunur.'
                  : 'Tutar yazmadan odeme tipi secilirse kalan tutarin tamami tahsil edilir.'}
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0, 1fr))', gap:10 }}>
                {paymentMethods.map(method => (
                  <button key={method.value} onClick={() => handleMethodClick(method)} disabled={busy || targetItems.length === 0 || splitPaymentLocked} style={{ minHeight:56, borderRadius:14, border:'none', background:busy || targetItems.length === 0 || splitPaymentLocked ? 'rgba(255,255,255,.08)' : `linear-gradient(135deg, ${method.color}, rgba(255,255,255,.12))`, color:busy || targetItems.length === 0 || splitPaymentLocked ? '#64748b' : '#fff', fontWeight:900, cursor:busy || targetItems.length === 0 || splitPaymentLocked ? 'not-allowed' : 'pointer' }}>{method.label}</button>
                ))}
                <button onClick={() => setShowOtherPayments(prev => !prev)} disabled={busy || targetItems.length === 0 || splitPaymentLocked} style={{ minHeight:56, borderRadius:14, border:'1px solid rgba(251,191,36,.28)', background:busy || targetItems.length === 0 || splitPaymentLocked ? 'rgba(255,255,255,.08)' : 'rgba(251,191,36,.12)', color:busy || targetItems.length === 0 || splitPaymentLocked ? '#64748b' : '#fde68a', fontWeight:900, cursor:busy || targetItems.length === 0 || splitPaymentLocked ? 'not-allowed' : 'pointer' }}>{'Di\u011fer \u00d6demeler'}</button>
                <button onClick={commitCurrentDraft} disabled={splitCommitDisabled} style={{ minHeight:56, borderRadius:14, border:'none', background:splitCommitDisabled ? 'rgba(255,255,255,.08)' : 'linear-gradient(135deg,#f59e0b,#fbbf24)', color:splitCommitDisabled ? '#64748b' : '#111827', fontWeight:900, cursor:splitCommitDisabled ? 'not-allowed' : 'pointer' }}>{'\u00d6de'}</button>
              </div>

              {showOtherPayments && (
                <div style={{ padding:14, borderRadius:16, background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.08)', display:'grid', gridTemplateColumns:'repeat(3, minmax(0, 1fr))', gap:10 }}>
                  {otherPaymentMethods.map(method => (
                    <button key={method.value} onClick={() => handleMethodClick(method)} disabled={busy || targetItems.length === 0 || splitPaymentLocked} style={{ minHeight:52, borderRadius:12, border:'none', background:busy || targetItems.length === 0 || splitPaymentLocked ? 'rgba(255,255,255,.08)' : `linear-gradient(135deg, ${method.color}, rgba(255,255,255,.12))`, color:busy || targetItems.length === 0 || splitPaymentLocked ? '#64748b' : '#fff', fontWeight:900, cursor:busy || targetItems.length === 0 || splitPaymentLocked ? 'not-allowed' : 'pointer' }}>{method.label}</button>
                  ))}
                  <button onClick={() => setShowDebtModal(true)} disabled={debtDisabled || splitPaymentLocked} style={{ minHeight:52, borderRadius:12, border:'1px solid rgba(251,191,36,.28)', background:debtDisabled || splitPaymentLocked ? 'rgba(255,255,255,.08)' : 'rgba(251,191,36,.12)', color:debtDisabled || splitPaymentLocked ? '#64748b' : '#fde68a', fontWeight:900, cursor:debtDisabled || splitPaymentLocked ? 'not-allowed' : 'pointer' }}>{'Bor\u00e7land\u0131r'}</button>
                </div>
              )}

              <div style={{ border:'1px solid rgba(255,255,255,.08)', borderRadius:16, overflow:'hidden', background:'rgba(255,255,255,.03)' }}>
                <div style={{ padding:'12px 14px', borderBottom:'1px solid rgba(255,255,255,.08)', display:'flex', justifyContent:'space-between', color:'#fff', fontWeight:800 }}>
                  <span>{'Bu Ad\u0131m\u0131n \u00d6demeleri'}</span>
                  <span>{fmt(draftPaidAmount)}{UI_TEXT.tlSuffix}</span>
                </div>
                <div style={{ padding:12, display:'flex', flexDirection:'column', gap:8 }}>
                  {draftPayments.length === 0 ? (
                    <div style={{ color:'#64748b', fontSize:' .8rem' }}>{'Hen\u00fcz \u00f6deme eklenmedi'}</div>
                  ) : draftPayments.map(payment => (
                    <div key={payment.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px', borderRadius:12, background:'rgba(255,255,255,.04)' }}>
                      <span style={{ color:'#e2e8f0', fontWeight:700 }}>{payment.label}</span>
                      <span style={{ color:'#fbbf24', fontWeight:900 }}>{fmt(payment.amount)}{UI_TEXT.tlSuffix}</span>
                    </div>
                  ))}
                </div>
              </div>

              {autoCloseText && <div style={{ padding:'12px 14px', borderRadius:14, background:'rgba(16,185,129,.16)', border:'1px solid rgba(16,185,129,.22)', color:'#d1fae5', fontWeight:800 }}>{autoCloseText}</div>}
            </div>
          </div>
        </div>
      </div>

      {showDebtModal && (
        <DebtSaveModalSafe
          amount={targetNetTotal}
          onOpenCustomers={onOpenCustomers}
          onClose={() => setShowDebtModal(false)}
          onConfirm={async debtPayload => {
            await finalizeCurrentSelection([{ id: uid(), method: 'borc', label: 'Borc Kaydi', amount: targetNetTotal }], 'debt', debtPayload)
            setShowDebtModal(false)
          }}
        />
      )}

      <PosCustomerLinkModal
        open={showLoyaltyLinkModal}
        branchId={branchId}
        branchName={branchName}
        registerNo={registerNo}
        registerLabel={registerLabel}
        linkedCustomer={linkedLoyaltyCustomer}
        onCustomerLinked={customer => {
          setLinkedLoyaltyCustomer(customer)
          setShowLoyaltyLinkModal(false)
        }}
        onClearCustomer={() => {
          setLinkedLoyaltyCustomer(null)
          setShowLoyaltyLinkModal(false)
        }}
        onClose={closeLoyaltyLinkModal}
      />
    </>
  )
}

function PosOrderHubPanel({ branchId, branchName }) {
  const [orders, setOrders] = useState([])
  const [linesByOrder, setLinesByOrder] = useState({})
  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const loadOrders = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const scopeQuery = query => {
        if (branchId) return query.eq('branch_id', branchId)
        if (branchName) return query.eq('branch_name', branchName)
        return query
      }
      const [salesResult, posTablesResult, openTicketSettingsResult] = await Promise.all([
        scopeQuery(db
          .from('sales')
          .select('id,sale_no,sale_datetime,source,status,source_channel_type,sales_channel_name,customer_name,branch_id,branch_name,kds_status,gross_total_after_discount,order_note,kiosk_table_number,fulfillment_type,promised_at,kds_release_at,delivery_address_snapshot')
          .in('status', ['completed', 'cancelled'])
          .is('deleted_at', null)
          .order('sale_datetime', { ascending: false })
          .limit(160)),
        db.from('pos_tables').select('id,branch_id,table_name,table_number').is('deleted_at', null).eq('is_active', true),
        db.from('settings').select('value').eq('key', OPEN_TABLE_TICKETS_SETTING_KEY).maybeSingle(),
      ])

      let { data, error: salesError } = salesResult
      if (salesError && isMissingCallCenterScheduleColumn(salesError)) {
        const legacyResult = await scopeQuery(db
          .from('sales')
          .select('id,sale_no,sale_datetime,source,status,source_channel_type,sales_channel_name,customer_name,branch_id,branch_name,kds_status,gross_total_after_discount,order_note,kiosk_table_number')
          .in('status', ['completed', 'cancelled'])
          .is('deleted_at', null)
          .order('sale_datetime', { ascending: false })
          .limit(160))
        data = legacyResult.data || []
        salesError = legacyResult.error || null
      }
      if (salesError) throw salesError
      if (posTablesResult.error) throw posTablesResult.error
      if (openTicketSettingsResult.error) throw openTicketSettingsResult.error

      const normalizedSales = normalizeLegacyCallCenterOrders(data || []).map(normalizeOrderHubSale)
      const posTableMap = new Map((posTablesResult.data || []).map(table => [String(table.id), table]))
      const openTicketState = openTicketSettingsResult.data?.value && typeof openTicketSettingsResult.data.value === 'object'
        ? openTicketSettingsResult.data.value
        : {}
      const openTicketRows = Object.entries(openTicketState || {}).flatMap(([ticketBranchId, branchTickets]) => {
        if (branchId && String(ticketBranchId) !== String(branchId)) return []
        return Object.entries(branchTickets || {}).flatMap(([tableKey, ticket]) => {
          const cart = Array.isArray(ticket?.cart) ? ticket.cart : []
          if (!cart.length && !String(ticket?.orderNote || '').trim()) return []
          const mappedTable = posTableMap.get(String(tableKey))
          const fallbackTable = resolveTableRecordSafe([], tableKey)
          const tableLabel = mappedTable?.table_name || mappedTable?.table_number || fallbackTable?.label || `Masa ${tableKey}`
          return [normalizeOrderHubOpenTicket({
            branchId: ticketBranchId,
            branchName: branchName || '',
            tableKey,
            tableLabel,
            ticket,
          })]
        })
      })
      const nextOrders = [...openTicketRows, ...normalizedSales]
        .sort((left, right) => new Date(right.updatedAt || right.sale_datetime || 0) - new Date(left.updatedAt || left.sale_datetime || 0))
      setOrders(nextOrders)
      const saleIds = nextOrders.filter(order => order.kind === 'sale').map(order => order.id).filter(Boolean)
      const nextLinesByOrder = {}

      if (saleIds.length) {
        let lineResult = await db
          .from('sale_lines')
          .select('id,sale_id,line_no,product_name,qty,line_gross_after_discount,kds_completed')
          .in('sale_id', saleIds)
          .order('line_no', { ascending: true })
        if (lineResult.error && String(lineResult.error?.message || '').toLowerCase().includes('kds_completed')) {
          const legacyLineResult = await db
            .from('sale_lines')
            .select('id,sale_id,line_no,product_name,qty,line_gross_after_discount')
            .in('sale_id', saleIds)
            .order('line_no', { ascending: true })
          lineResult = {
            ...legacyLineResult,
            data: (legacyLineResult.data || []).map(line => ({ ...line, kds_completed: false })),
          }
        }
        if (lineResult.error) throw lineResult.error
        ;(lineResult.data || []).forEach(line => {
          if (!nextLinesByOrder[line.sale_id]) nextLinesByOrder[line.sale_id] = []
          nextLinesByOrder[line.sale_id].push(line)
        })
      }

      openTicketRows.forEach(order => {
        nextLinesByOrder[order.id] = (order.cart_snapshot || []).map((item, index) => ({
          id: `${order.id}:${index}`,
          sale_id: order.id,
          line_no: index + 1,
          product_name: item?.product_name || item?.prod?.name || item?.name || 'Urun',
          qty: Number(item?.qty || 1),
          line_gross_after_discount: Number(item?.total || ((item?.qty || 1) * (item?.unitPrice || item?.unit_price || 0))),
          kds_completed: false,
        }))
      })

      setLinesByOrder(nextLinesByOrder)
    } catch (loadError) {
      setError(loadError?.message || 'Siparisler yuklenemedi.')
    } finally {
      setLoading(false)
    }
  }, [branchId, branchName])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  const filteredOrders = useMemo(() => (
    orders.filter(order => {
      if (sourceFilter !== 'all' && getOrderHubSourceMeta(order).group !== sourceFilter) return false
      if (statusFilter !== 'all' && getOrderHubStatusMeta(order).label !== statusFilter) return false
      return true
    })
  ), [orders, sourceFilter, statusFilter])

  const sourceOptions = useMemo(() => {
    const seen = new Map()
    orders.forEach(order => {
      const meta = getOrderHubSourceMeta(order)
      if (!seen.has(meta.group)) seen.set(meta.group, meta.label)
    })
    return Array.from(seen.entries()).map(([value, label]) => ({ value, label }))
  }, [orders])

  const selectedOrder = filteredOrders.find(order => order.id === selectedOrderId) || filteredOrders[0] || null
  const selectedLines = selectedOrder ? linesByOrder[selectedOrder.id] || [] : []

  return (
    <div style={{ height: '100%', minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(360px, .85fr)', gap: 16 }}>
      <div style={{ minHeight: 0, borderRadius: 24, border: '1px solid rgba(148,163,184,.14)', background: 'rgba(15,23,42,.48)', overflow: 'hidden', display: 'grid', gridTemplateRows: 'auto 1fr' }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,.08)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div>
            <div style={{ color: '#fff', fontWeight: 900, fontSize: '1.08rem' }}>Siparisler</div>
            <div style={{ color: '#94a3b8', fontSize: '.78rem', marginTop: 4 }}>POS icinde tum siparis kanallarini izle.</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            <select value={sourceFilter} onChange={event => setSourceFilter(event.target.value)} style={{ minHeight:40, borderRadius:12, border:'1px solid rgba(255,255,255,.12)', background:'rgba(255,255,255,.05)', color:'#e2e8f0', padding:'0 12px' }}>
              <option value="all">Tum Kanallar</option>
              {sourceOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} style={{ minHeight:40, borderRadius:12, border:'1px solid rgba(255,255,255,.12)', background:'rgba(255,255,255,.05)', color:'#e2e8f0', padding:'0 12px' }}>
              <option value="all">Tum Durumlar</option>
              <option value="Bekliyor">Bekliyor</option>
              <option value="Acik">Acik</option>
              <option value="Kapali">Kapali</option>
              <option value="Iptal">Iptal</option>
            </select>
            <button type="button" className="touch-btn" onClick={loadOrders} style={{ minHeight: 40, padding: '0 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', color: '#cbd5e1', fontWeight: 800, cursor: 'pointer' }}>
              <i className={`fa-solid ${loading ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`} />
            </button>
          </div>
        </div>
        <div style={{ minHeight: 0, overflowY: 'auto', padding: 14, display: 'grid', gap: 10, alignContent: 'start' }}>
          {error && <div style={{ color: '#fecaca', background: 'rgba(127,29,29,.28)', border: '1px solid rgba(248,113,113,.2)', borderRadius: 14, padding: 14, fontWeight: 800 }}>{error}</div>}
          {!error && filteredOrders.length === 0 && !loading && <div style={{ minHeight: 220, display: 'grid', placeItems: 'center', color: '#94a3b8', fontWeight: 800 }}>Gosterilecek siparis yok.</div>}
          {filteredOrders.map(order => {
            const meta = getOrderHubStatusMeta(order)
            const sourceMeta = getOrderHubSourceMeta(order)
            const selected = selectedOrder?.id === order.id
            return (
              <button key={order.id} type="button" onClick={() => setSelectedOrderId(order.id)} style={{ textAlign: 'left', borderRadius: 18, border: `1px solid ${selected ? 'rgba(251,191,36,.42)' : 'rgba(148,163,184,.14)'}`, background: selected ? 'rgba(251,191,36,.12)' : 'rgba(15,23,42,.62)', padding: 14, cursor: 'pointer', display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ color: '#fff', fontWeight: 900 }}>{order.customer_name || order.table_label || 'Kayit'}</div>
                  <span style={{ padding: '5px 9px', borderRadius: 999, background: meta.bg, color: meta.color, fontWeight: 900, fontSize: '.72rem' }}>{meta.label}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, color: '#cbd5e1', fontSize: '.8rem' }}>
                  <span>{sourceMeta.label} - {getOrderHubFlowLabel(order)} - {getOrderHubTimingLabel(order)}</span>
                  <strong style={{ color: '#fbbf24' }}>{fmt(order.gross_total_after_discount)} TL</strong>
                </div>
                <div style={{ color: '#94a3b8', fontSize: '.76rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getOrderHubSummary(order)}</div>
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ minHeight: 0, borderRadius: 24, border: '1px solid rgba(148,163,184,.14)', background: 'rgba(15,23,42,.58)', overflow: 'hidden', display: 'grid', gridTemplateRows: 'auto 1fr' }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
          <div style={{ color: '#fff', fontWeight: 900 }}>Siparis Detayi</div>
          <div style={{ color: '#94a3b8', fontSize: '.78rem', marginTop: 4 }}>/call-center listesi ayrica korunuyor.</div>
        </div>
        <div style={{ minHeight: 0, overflowY: 'auto', padding: 16, display: 'grid', gap: 14, alignContent: 'start' }}>
          {!selectedOrder ? (
            <div style={{ color: '#94a3b8', fontWeight: 800 }}>Listeden siparis secin.</div>
          ) : (
            <>
              <div style={{ display: 'grid', gap: 8, color: '#e2e8f0', fontSize: '.84rem' }}>
                <div><strong style={{ color: '#fff' }}>{selectedOrder.sale_no || selectedOrder.id.slice(0, 8)}</strong></div>
                <div>{selectedOrder.customer_name || selectedOrder.table_label || '-'}</div>
                <div>{getOrderHubSourceMeta(selectedOrder).label} - {getOrderHubFlowLabel(selectedOrder)}</div>
                <div>{getOrderHubTimingLabel(selectedOrder)}</div>
                <div style={{ color: '#94a3b8', lineHeight: 1.5 }}>{getOrderHubSummary(selectedOrder)}</div>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {selectedLines.map(line => (
                  <div key={line.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, padding: 12, borderRadius: 14, background: line.kds_completed ? 'rgba(34,197,94,.10)' : 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
                    <div style={{ color: '#fff', fontWeight: 800 }}>{line.qty}x {line.product_name}</div>
                    <div style={{ color: '#fbbf24', fontWeight: 900 }}>{fmt(line.line_gross_after_discount)} TL</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function POSInner({ forcedActiveStaff = null, onStaffLogout = null, triggerPinLogin = null } = {}) {
  const navigate = useNavigate()
  const {
    scope,
    branchId: workspaceBranchId,
    branchName: workspaceBranchName,
    loadingBranches,
  } = useWorkspace()
  const branchLocked = isBranchScopedScope(scope) && !!workspaceBranchId
  const initialLayoutDirectory = useMemo(
    () => extractTableDirectoryFromLayoutValue(readLocalLayoutSnapshot()),
    [],
  )
  const lastTableTicketsSignatureRef = useRef('')
  const resolveBootChannel = useCallback((current, nextChannels = []) => {
    const posFocusedChannels = nextChannels.filter(c => isQuickSaleChannel(c) || isPickupChannel(c))
    if (current && nextChannels.some(channel => channel.id === current)) return current
    const quickSaleChannel = nextChannels.find(isQuickSaleChannel)
    if (quickSaleChannel?.id) return quickSaleChannel.id
    if (posFocusedChannels.length) return posFocusedChannels[0].id
    return nextChannels[0]?.id || current || ''
  }, [])
  const tablePersistenceHydratedRef = useRef(false)
  const favoritePersistenceHydratedRef = useRef(false)
  const {
    categories,
    products,
    channels,
    taxes,
    branchContexts,
    comboDefinitions,
    optionGroupDefs,
    loading,
    catalogLoading,
    loadingProgress,
    loadingStage,
    activeMainCat,
    activeSubCat,
    activeChannel,
    selectedBranchId,
    resolvedBranchId,
    selectedBranchContext,
    visibleBranchName,
    setActiveMainCat,
    setActiveSubCat,
    setActiveChannel,
    setSelectedBranchId,
  } = useUnifiedPosCatalogBootstrap({
    modeLabel: 'POS',
    branchLocked,
    workspaceBranchId,
    workspaceBranchName,
    loadingBranches,
    readRememberedBranchId: readPosBranchId,
    readRememberedChannelId: readPosChannelId,
    categorySelect: POS_CATEGORY_BOOT_SELECT,
    productSelect: POS_PRODUCT_BOOT_SELECT,
    resolveNextChannel: resolveBootChannel,
  })

  const [cart, setCart]               = useState([])
  const [modal, setModal]             = useState(null) // {type:'opts'|'odeme', item?}
  const [toast, setToast]             = useState(null)
  const [masaNo, setMasaNo]           = useState('01')
  const [selectedTableKey, setSelectedTableKey] = useState('')
  const [searchQ, setSearchQ]         = useState('')
  const [showPrices, setShowPrices]   = useState(true)
  const [orderNote, setOrderNote]     = useState('')
  const [guestCounts, setGuestCounts] = useState(DEFAULT_GUEST_COUNTS)
  const [activeSpecialView, setActiveSpecialView] = useState(null)
  const [favoriteOrderIds, setFavoriteOrderIds] = useState(() => readLocalFavoriteOrderSnapshot())
  const [favoriteProductIds, setFavoriteProductIds] = useState(() => readLocalFavoriteProductIdsSnapshot())
  const [favoriteEditMode, setFavoriteEditMode] = useState(false)
  const [layoutTableDirectory, setLayoutTableDirectory] = useState(() => initialLayoutDirectory)
  const [tableTickets, setTableTickets] = useState(() => readLocalOpenTableTicketsSnapshot(initialLayoutDirectory))
  const [showTableLayout, setShowTableLayout] = useState(false)
  const [tableCatalog, setTableCatalog] = useState({ halls: [], sections: [], tables: [] })
  const [tableCatalogLoading, setTableCatalogLoading] = useState(false)
  const activeStaff = forcedActiveStaff
  const [loyaltyCampaignCatalog, setLoyaltyCampaignCatalog] = useState([])
  const [saleTemplates, setSaleTemplates] = useState([])
  const [loyaltyCampaignLoading, setLoyaltyCampaignLoading] = useState(false)
  const [loyaltyCampaignError, setLoyaltyCampaignError] = useState('')
  const [manualTriggeredCampaignIds, setManualTriggeredCampaignIds] = useState([])

  // Sipariş öncesi müşteri tanımlama (POS ana ekranı)
  const [preOrderLinkedCustomer, setPreOrderLinkedCustomer] = useState(null)
  const [showPreOrderCustomerLink, setShowPreOrderCustomerLink] = useState(false)
  const [manualCouponCode, setManualCouponCode] = useState('')

  // Toast helper
  function showToast(msg, color='#10b981') {
    setToast({msg, color})
    setTimeout(() => setToast(null), 2800)
  }

  function handleManualTriggerToggle(campaign = {}) {
    const campaignId = String(campaign?.id || '').trim()
    if (!campaignId) return

    const alreadyTriggered = manualTriggeredCampaignIds.includes(campaignId)
    setManualTriggeredCampaignIds(prev => (
      prev.includes(campaignId)
        ? prev.filter(id => id !== campaignId)
        : [...prev, campaignId]
    ))
    showToast(
      alreadyTriggered
        ? `${campaign.name || 'Kampanya'} manuel tetiklemeden cikarildi`
        : `${campaign.name || 'Kampanya'} tetiklemeye hazir`,
      alreadyTriggered ? '#94a3b8' : '#38bdf8',
    )
  }

  async function hasRemoteSale(localId) {
    if (!localId) return false

    const { data: salesRow, error: salesError } = await db
      .from('sales')
      .select('id')
      .eq('local_id', localId)
      .maybeSingle()

    if (!salesError && salesRow?.id) return true

    const { data: legacyRow, error: legacyError } = await db
      .from('pos_sales')
      .select('local_id')
      .eq('local_id', localId)
      .maybeSingle()

    return !legacyError && legacyRow?.local_id === localId
  }

  const categoryById = useMemo(
    () => new Map(categories.map(cat => [cat.id, cat])),
    [categories]
  )
  const comboMenuCategoryId = useMemo(
    () => resolveComboMenuCategoryId(categories),
    [categories]
  )
  const taxById = useMemo(
    () => new Map(taxes.map(tax => [tax.id, tax])),
    [taxes]
  )
  const branchTicketKey = selectedBranchContext?.branchId || 'default'
  const normalizedTableTickets = useMemo(
    () => normalizeAllTableTickets(tableTickets, layoutTableDirectory),
    [tableTickets, layoutTableDirectory]
  )
  const branchTableTickets = normalizedTableTickets[branchTicketKey] || {}
  const currentTable = useMemo(
    () => resolveTableRecord(layoutTableDirectory, selectedTableKey || masaNo),
    [layoutTableDirectory, selectedTableKey, masaNo]
  )
  const currentTableKey = currentTable?.tableKey || ''
  const currentTableLabel = currentTable?.label || `Masa ${currentTable?.masaNo || normalizeMasaNo(masaNo)}`
  const currentTableDisplayNo = currentTable?.masaNo || normalizeMasaNo(masaNo)
  const tableTransferOptions = useMemo(
    () => buildTableDirectory(layoutTableDirectory, branchTableTickets, currentTableKey),
    [layoutTableDirectory, branchTableTickets, currentTableKey]
  )
  const strictTableLayoutOptions = useMemo(
    () => buildTableDirectory(layoutTableDirectory, branchTableTickets, currentTableKey, {
      includeFallbackTickets: false,
      includeCurrentFallback: false,
    }),
    [layoutTableDirectory, branchTableTickets, currentTableKey]
  )
  const emptyTableOptions = useMemo(
    () => tableTransferOptions.filter(table => !table.occupied),
    [tableTransferOptions]
  )
  const masaSalesChannel = useMemo(
    () => channels.find(isMasaChannel) || null,
    [channels]
  )
  const quickSaleChannel = useMemo(
    () => channels.find(isQuickSaleChannel) || null,
    [channels]
  )
  const pickupChannel = useMemo(
    () => channels.find(isPickupChannel) || null,
    [channels]
  )
  const headerChannels = useMemo(
    () => channels.filter(isPrimaryPosSalesChannel),
    [channels]
  )
  const isMasaMode = Boolean(masaSalesChannel?.id && activeChannel === masaSalesChannel.id)
  const isTableLayoutView = isMasaMode && showTableLayout
  const currentTableTicket = useMemo(
    () => sanitizeOpenTicket(currentTableKey ? branchTableTickets[currentTableKey] : null),
    [branchTableTickets, currentTableKey]
  )
  const activeTableOptions = useMemo(
    () => tableTransferOptions.filter(table => table.occupied),
    [tableTransferOptions]
  )
  const activeTablesByFloor = useMemo(() => {
    const grouped = new Map()

    activeTableOptions.forEach(table => {
      const ticket = sanitizeOpenTicket(branchTableTickets[table.tableKey])
      const floorName = table.floorName || 'Diger'
      const tables = grouped.get(floorName) || []
      tables.push({
        ...table,
        coverCount: getGuestCoverCount(ticket.guestCounts),
        totalAmount: roundMoney(ticket.cart.reduce((sum, item) => sum + getCartLineTotal(item), 0)),
      })
      grouped.set(floorName, tables)
    })

    return Array.from(grouped.entries()).map(([floorName, tables]) => ({ floorName, tables }))
  }, [activeTableOptions, branchTableTickets])
  const tableLayoutSections = useMemo(() => {
    const grouped = new Map()
    const floorOrder = []
    const rememberFloor = floorName => {
      const safeFloorName = floorName || 'Diger'
      if (!floorOrder.includes(safeFloorName)) floorOrder.push(safeFloorName)
      if (!grouped.has(safeFloorName)) grouped.set(safeFloorName, [])
      return safeFloorName
    }

    const layoutTableKeys = new Set(
      (layoutTableDirectory || [])
        .map(table => String(table?.tableKey || '').trim())
        .filter(Boolean)
    )

    strictTableLayoutOptions
      .filter(table => layoutTableKeys.has(String(table?.tableKey || '').trim()))
      .forEach(table => {
        const ticket = sanitizeOpenTicket(branchTableTickets[table.tableKey])
        const floorName = rememberFloor(table.floorName || 'Diger')
        const occupied = hasOpenTicketContent(ticket)
        grouped.get(floorName).push({
          ...table,
          occupied,
          coverCount: getGuestCoverCount(ticket.guestCounts),
          totalAmount: roundMoney(ticket.cart.reduce((sum, item) => sum + getCartLineTotal(item), 0)),
          status: occupied ? 'occupied' : 'empty',
        })
      })

    return floorOrder
      .map(floorName => ({
        floorName,
        tables: (grouped.get(floorName) || []).sort((left, right) => {
          const leftNum = parseInt(left.masaNo, 10)
          const rightNum = parseInt(right.masaNo, 10)
          if (Number.isFinite(leftNum) && Number.isFinite(rightNum) && leftNum !== rightNum) {
            return leftNum - rightNum
          }
          return String(left.label || left.masaNo).localeCompare(String(right.label || right.masaNo), 'tr')
        }),
      }))
      .filter(group => group.tables.length > 0)
  }, [layoutTableDirectory, strictTableLayoutOptions, branchTableTickets])
  const hasSelectedActiveTable = isMasaMode && Boolean(currentTableKey) && hasOpenTicketContent(currentTableTicket)
  const activeCart = isMasaMode ? currentTableTicket.cart : cart
  const activeOrderNote = isMasaMode ? currentTableTicket.orderNote : orderNote
  const activeGuestCounts = isMasaMode ? currentTableTicket.guestCounts : guestCounts

  const normalizedProducts = useMemo(() => {
    const productMap = new Map(products.map(prod => [String(prod.id), prod]))
    const comboProducts = (comboDefinitions || [])
      .filter(combo => combo?.active !== false && !combo?.deleted)
      .map(combo => {
        const form = combo?.form || {}
        const groups = Array.isArray(combo?.groups) ? combo.groups : []
        const pricingStrategy = form.pricingStrategy || 'set-price'
        const channelPrices = channels.map(channel => {
          const baseTotal = groups.reduce((sum, group) => {
            const primary = productMap.get(String(group?.primaryItemId || ''))
            return sum + getChannelBasePrice(primary, channel.id)
          }, 0)
          const config = combo?.channelConfig?.[String(channel.id)] || {}
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
            channel_id: channel.id,
            price: roundMoney(price),
            active: config.active !== false,
          }
        })

        return {
          id: `combo-${combo.id}`,
          comboDefinitionId: String(combo.id),
          sku: combo.sku || form.sku || '',
          name: combo.name || form.name || 'Combo Menu',
          short_name: combo.shortName || form.shortName || '',
          category_id: comboMenuCategoryId || form.catId || combo.catId || null,
          standard_price: channelPrices[0]?.price || Number(form.defaultComboPrice) || 0,
          channel_prices: channelPrices,
          is_combo_menu: true,
          pos_color: form.pos_color || '#7c3aed',
          pos_text_color: form.pos_text_color || '#ffffff',
          pos_badge: 'Combo',
          pos_image: form.pos_image || null,
          channel_image: form.channel_image || null,
          channel_description: form.channel_description || '',
          image_url: form.channel_image || form.pos_image || null,
        }
      })

    return [
      ...products.map(prod => ({
        ...prod,
        category_id: getProductCategoryId(prod),
        image_url: prod.image_url || prod.channel_image || prod.pos_image || null,
      })),
      ...comboProducts,
    ]
  }, [products, comboDefinitions, channels, comboMenuCategoryId])

  useEffect(() => {
    let cancelled = false

    async function hydrateUiPreferences() {
      try {
        const nextFavoriteProductIds = await hydrateFavoriteProductIdsFromDb()
        if (cancelled) return
        setFavoriteProductIds(current => sameStringList(current, nextFavoriteProductIds) ? current : nextFavoriteProductIds)

        const nextFavoriteOrderIds = await hydrateFavoriteOrderFromDb(nextFavoriteProductIds)
        if (cancelled) return
        setFavoriteOrderIds(current => sameStringList(current, nextFavoriteOrderIds) ? current : nextFavoriteOrderIds)

        await hydrateVoidLogsFromDb()
      } catch (error) {
        if (!cancelled) {
          console.error('POS UI preference hydrate failed', error)
        }
      } finally {
        if (!cancelled) {
          favoritePersistenceHydratedRef.current = true
        }
      }
    }

    function handleFavoriteProductIdsUpdated(event) {
      const nextValue = Array.isArray(event?.detail?.value) ? event.detail.value : []
      setFavoriteProductIds(current => sameStringList(current, nextValue) ? current : nextValue)
    }

    function handleFavoriteOrderUpdated(event) {
      const nextValue = Array.isArray(event?.detail?.value) ? event.detail.value : []
      setFavoriteOrderIds(current => sameStringList(current, nextValue) ? current : nextValue)
    }

    hydrateUiPreferences()
    window.addEventListener(FAVORITE_PRODUCT_IDS_UPDATED_EVENT, handleFavoriteProductIdsUpdated)
    window.addEventListener(FAVORITE_ORDER_UPDATED_EVENT, handleFavoriteOrderUpdated)

    return () => {
      cancelled = true
      window.removeEventListener(FAVORITE_PRODUCT_IDS_UPDATED_EVENT, handleFavoriteProductIdsUpdated)
      window.removeEventListener(FAVORITE_ORDER_UPDATED_EVENT, handleFavoriteOrderUpdated)
    }
  }, [])

  useEffect(() => {
    if (!favoritePersistenceHydratedRef.current) return
    const persistTimer = window.setTimeout(() => {
      persistFavoriteProductIdsToDb(favoriteProductIds).catch(error => {
        console.error('POS favorite products persist failed', error)
      })
    }, 250)

    return () => window.clearTimeout(persistTimer)
  }, [favoriteProductIds])

  useEffect(() => {
    writePosChannelId(activeChannel)
  }, [activeChannel])

  useEffect(() => {
    writePosBranchId(resolvedBranchId)
  }, [resolvedBranchId])

  useEffect(() => {
    let cancelled = false

    async function hydrateTablePersistence() {
      try {
        const nextLayoutValue = await hydrateTableLayoutFromDb()
        if (cancelled) return
        const nextLayoutTables = extractTableDirectoryFromLayoutValue(nextLayoutValue)
        setLayoutTableDirectory(nextLayoutTables)

        const nextTickets = await hydrateOpenTableTicketsFromDb(nextLayoutTables)
        if (cancelled) return
        lastTableTicketsSignatureRef.current = JSON.stringify(nextTickets || {})
        setTableTickets(nextTickets)
      } catch (error) {
        if (!cancelled) {
          console.error('POS table persistence hydrate failed', error)
        }
      } finally {
        if (!cancelled) {
          tablePersistenceHydratedRef.current = true
        }
      }
    }

    hydrateTablePersistence()
    return () => { cancelled = true }
  }, [])

  // Masa katalogu DB'den yukle (Garson gibi)
  useEffect(() => {
    if (!resolvedBranchId) return
    let cancelled = false
    setTableCatalogLoading(true)
    loadTableManagementCatalog(resolvedBranchId)
      .then(nextCatalog => {
        if (!cancelled) setTableCatalog(nextCatalog)
      })
      .catch(error => {
        if (!cancelled) console.error('POS table catalog load failed', error)
      })
      .finally(() => {
        if (!cancelled) setTableCatalogLoading(false)
      })
    return () => { cancelled = true }
  }, [resolvedBranchId])

  useEffect(() => {
    function reloadLayoutFromDb() {
      hydrateTableLayoutFromDb()
        .then(layoutValue => {
          const nextLayoutTables = extractTableDirectoryFromLayoutValue(layoutValue)
          setLayoutTableDirectory(nextLayoutTables)
        })
        .catch(error => {
          console.error('POS table layout refresh failed', error)
        })
    }

    function reloadTicketsFromDb(event) {
      if (isPersistenceEventFromCurrentTab(event)) return
      hydrateOpenTableTicketsFromDb(layoutTableDirectory)
        .then(nextTickets => {
          const nextSignature = JSON.stringify(nextTickets || {})
          lastTableTicketsSignatureRef.current = nextSignature
          setTableTickets(currentTickets => (
            JSON.stringify(currentTickets || {}) === nextSignature ? currentTickets : nextTickets
          ))
        })
        .catch(error => {
          console.error('POS open tickets refresh failed', error)
        })
    }

    window.addEventListener(TABLE_LAYOUT_UPDATED_EVENT, reloadLayoutFromDb)
    window.addEventListener(OPEN_TABLE_TICKETS_UPDATED_EVENT, reloadTicketsFromDb)
    return () => {
      window.removeEventListener(TABLE_LAYOUT_UPDATED_EVENT, reloadLayoutFromDb)
      window.removeEventListener(OPEN_TABLE_TICKETS_UPDATED_EVENT, reloadTicketsFromDb)
    }
  }, [layoutTableDirectory])

  useEffect(() => {
    setTableTickets(currentTickets => {
      const nextTickets = normalizeAllTableTickets(currentTickets, layoutTableDirectory)
      return JSON.stringify(nextTickets) === JSON.stringify(currentTickets) ? currentTickets : nextTickets
    })
  }, [layoutTableDirectory])

  useEffect(() => {
    if (!tablePersistenceHydratedRef.current) return
    const nextSignature = JSON.stringify(normalizeAllTableTickets(tableTickets, layoutTableDirectory))
    if (nextSignature === lastTableTicketsSignatureRef.current) return
    const persistTimer = window.setTimeout(() => {
      persistOpenTableTicketsToDb(tableTickets, layoutTableDirectory)
        .then(normalizedState => {
          lastTableTicketsSignatureRef.current = JSON.stringify(normalizedState || {})
        })
        .catch(error => {
          console.error('POS open tickets persist failed', error)
        })
    }, 300)

    return () => window.clearTimeout(persistTimer)
  }, [tableTickets, layoutTableDirectory])

  useEffect(() => {
    if (!isMasaMode || activeTableOptions.length === 0) return
    if (currentTableKey && activeTableOptions.some(table => table.tableKey === currentTableKey)) return
    const nextTable = activeTableOptions[0]
    setSelectedTableKey(nextTable.tableKey)
    setMasaNo(nextTable.masaNo)
  }, [isMasaMode, activeTableOptions, currentTableKey])

  useEffect(() => {
    if (isMasaMode) {
      setShowTableLayout(true)
      return
    }
    setShowTableLayout(false)
    setSelectedTableKey('')
  }, [isMasaMode])

  useEffect(() => {
    if (!channels.length) return
    const currentChannel = channels.find(channel => channel.id === activeChannel) || null
    if (channels.length > 0) {
      const qsChannel = channels.find(isQuickSaleChannel)
      const currentCh = channels.find(c => c.id === activeChannel)
      
      // Eger aktif kanal yoksa veya masa kanali seciliyse (POS modunda hizli satis onceliklidir), hizli satisa zorla
      if (qsChannel && (!currentCh || isMasaChannel(currentCh))) {
        setActiveChannel(qsChannel.id)
        setShowTableLayout(false)
      } else if (!activeChannel) {
        setActiveChannel(channels[0].id)
      }
    }
  }, [channels, activeChannel])

  useEffect(() => {
    if (!branchLocked || !workspaceBranchId) return
    setSelectedBranchId(current => (current === workspaceBranchId ? current : workspaceBranchId))
  }, [branchLocked, workspaceBranchId])

  const loadLoyaltyCampaigns = useCallback(async ({ background = false, preferFresh = false } = {}) => {
    if (!background) setLoyaltyCampaignLoading(true)
    try {
      const snapshot = await loadCachedRuntimeLoyaltyCampaignCatalog({
        branchId: selectedBranchContext?.branchId || '',
        branchName: selectedBranchContext?.branchName || '',
        preferFresh,
      })
      setLoyaltyCampaignCatalog(snapshot?.campaigns || [])
      setSaleTemplates(snapshot?.saleTemplates || [])
      const schemaIssueText = (snapshot?.issues || []).filter(Boolean).join(' | ')

      if (snapshot?.stale) {
        setLoyaltyCampaignError(schemaIssueText || 'Canli loyalty baglantisi gecici olarak kullanilamadi. Son senkron kampanya listesi gosteriliyor.')
        return
      }

      if (snapshot?.databaseUnavailable) {
        setLoyaltyCampaignError('Loyalty veri kaynagina su anda ulasilamiyor.')
        return
      }

      if (snapshot?.schemaReady === false) {
        setLoyaltyCampaignError(schemaIssueText || 'Loyalty tablolarinin yapisi henuz hazir degil.')
        return
      }

      setLoyaltyCampaignError('')
    } catch (error) {
      setLoyaltyCampaignCatalog([])
      setSaleTemplates([])
      setLoyaltyCampaignError(error?.message || 'Loyalty kampanyalari yuklenemedi.')
    } finally {
      if (!background) setLoyaltyCampaignLoading(false)
    }
  }, [selectedBranchContext?.branchId, selectedBranchContext?.branchName])

  useEffect(() => {
    loadLoyaltyCampaigns({ background: false, preferFresh: false })
  }, [loadLoyaltyCampaigns])

  useEffect(() => {
    // 30 dakikada bir otomatik güncelleme (Production modu için)
    // Test aşamasında otomatik güncelleme istenmediği için pasif bırakılmıştır.
    const AUTO_REFRESH_ENABLED = false;
    let refreshTimer = null;
    
    if (AUTO_REFRESH_ENABLED) {
      refreshTimer = setInterval(() => {
        loadLoyaltyCampaigns({ background: true, preferFresh: true })
      }, 30 * 60 * 1000)
    }

    return () => {
      if (refreshTimer) clearInterval(refreshTimer)
    }
  }, [loadLoyaltyCampaigns])

  const effectiveFavoriteIds = useMemo(() => {
    const ids = new Set(favoriteProductIds.map(value => String(value)))
    normalizedProducts.forEach(product => {
      if (product?.is_favorite) ids.add(String(product.id))
    })
    return ids
  }, [normalizedProducts, favoriteProductIds])

  useEffect(() => {
    if (!favoritePersistenceHydratedRef.current) return
    const persistTimer = window.setTimeout(() => {
      persistFavoriteOrderToDb(favoriteOrderIds, Array.from(effectiveFavoriteIds)).catch(error => {
        console.error('POS favorite order persist failed', error)
      })
    }, 250)

    return () => window.clearTimeout(persistTimer)
  }, [favoriteOrderIds, effectiveFavoriteIds])

  useEffect(() => {
    const currentFavoriteIds = normalizedProducts
      .filter(prod => effectiveFavoriteIds.has(String(prod.id)))
      .map(prod => prod.id)
    setFavoriteOrderIds(prev => [
      ...prev.filter(id => currentFavoriteIds.includes(id)),
      ...currentFavoriteIds.filter(id => !prev.includes(id)),
    ])
  }, [normalizedProducts, effectiveFavoriteIds])

  useEffect(() => {
    if (activeSpecialView !== 'favorites' && favoriteEditMode) {
      setFavoriteEditMode(false)
    }
  }, [activeSpecialView, favoriteEditMode])

  const categoryProductCoverage = useMemo(() => {
    const coveredIds = new Set()
    normalizedProducts.forEach(prod => {
      let currentId = prod.category_id
      while (currentId) {
        coveredIds.add(currentId)
        currentId = categoryById.get(currentId)?.parent_id || null
      }
    })
    return coveredIds
  }, [normalizedProducts, categoryById])

  function categoryHasProducts(catId) {
    return categoryProductCoverage.has(catId)
  }

  const assignedCategoryIds = useMemo(
    () => new Set(normalizedProducts.map(prod => prod.category_id).filter(Boolean)),
    [normalizedProducts]
  )

  const mainCategoryIds = useMemo(() => {
    const mainIds = new Set()
    assignedCategoryIds.forEach(catId => {
      let current = categoryById.get(catId) || null
      let last = current
      while (current?.parent_id) {
        const parent = categoryById.get(current.parent_id)
        if (!parent) break
        last = parent
        current = parent
      }
      if (last?.id) mainIds.add(last.id)
    })
    return mainIds
  }, [assignedCategoryIds, categoryById])

  const assignedCategories = useMemo(
    () => categories.filter(cat => assignedCategoryIds.has(cat.id)),
    [categories, assignedCategoryIds]
  )
  const visibleMainCategories = useMemo(
    () => categories.filter(cat => mainCategoryIds.has(cat.id)),
    [categories, mainCategoryIds]
  )
  const renderedMainCategories = useMemo(
    () => (visibleMainCategories.length ? visibleMainCategories : assignedCategories),
    [visibleMainCategories, assignedCategories]
  )
  const subCategories = useMemo(
    () => (activeMainCat
      ? categories.filter(cat => cat.parent_id === activeMainCat && categoryProductCoverage.has(cat.id))
      : []),
    [activeMainCat, categories, categoryProductCoverage]
  )
  const hasRenderableCategories = renderedMainCategories.length > 0
  const activeFilterCat = searchQ
    ? null
    : hasRenderableCategories
      ? (subCategories.length ? (activeSubCat || subCategories[0]?.id) : activeMainCat)
      : null
  const activeCatIds = useMemo(
    () => (activeFilterCat ? new Set(getDescIds(categories, activeFilterCat)) : null),
    [categories, activeFilterCat]
  )
  const favoriteOrderMap = useMemo(
    () => new Map(favoriteOrderIds.map((id, index) => [id, index])),
    [favoriteOrderIds]
  )
  const normalizedSearch = searchQ.trim().toLowerCase()
  const isCategoryNavigationActive = activeSpecialView !== 'favorites' && activeSpecialView !== 'campaigns'

  const filteredProds = useMemo(() => {
    const filtered = normalizedProducts.filter(p => {
        if (activeSpecialView === 'favorites' && !effectiveFavoriteIds.has(String(p.id))) return false
        const catOk = isCategoryNavigationActive ? (!activeCatIds || activeCatIds.has(p.category_id)) : true
        const qOk = !normalizedSearch || p.name.toLowerCase().includes(normalizedSearch)
        return catOk && qOk
      })
    if (activeSpecialView !== 'favorites') return filtered
    return filtered.sort((a, b) => {
        const aIndex = favoriteOrderMap.get(a.id)
        const bIndex = favoriteOrderMap.get(b.id)
        const safeA = aIndex == null ? Number.MAX_SAFE_INTEGER : aIndex
        const safeB = bIndex == null ? Number.MAX_SAFE_INTEGER : bIndex
        if (safeA !== safeB) return safeA - safeB
        return (a.name || '').localeCompare(b.name || '', 'tr')
      })
  }, [normalizedProducts, activeSpecialView, activeCatIds, normalizedSearch, favoriteOrderMap, effectiveFavoriteIds, isCategoryNavigationActive])

  useEffect(() => {
    if (searchQ) return
    if (activeSpecialView === 'favorites' || activeSpecialView === 'campaigns') {
      setActiveMainCat(null)
      setActiveSubCat(null)
      return
    }
    if (!renderedMainCategories.length) {
      setActiveMainCat(null)
      setActiveSubCat(null)
      return
    }

    const mainVisible = renderedMainCategories.some(cat => cat.id === activeMainCat)
    if (!mainVisible) {
      const firstMain = renderedMainCategories[0]
      const firstChildren = categories.filter(cat => cat.parent_id === firstMain.id && categoryHasProducts(cat.id))
      setActiveMainCat(firstMain.id)
      setActiveSubCat(firstChildren[0]?.id || firstMain.id)
      return
    }

    if (subCategories.length > 0 && !subCategories.some(cat => cat.id === activeSubCat)) {
      setActiveSubCat(subCategories[0].id)
    }
  }, [searchQ, activeSpecialView, renderedMainCategories, activeMainCat, activeSubCat, subCategories, categories])

  function handleMainCategoryClick(catId) {
    const children = categories.filter(cat => cat.parent_id === catId)
    setActiveSpecialView(null)
    setActiveMainCat(catId)
    setActiveSubCat(children[0]?.id || catId)
  }

  function handleSubCategoryClick(catId) {
    setActiveSpecialView(null)
    setActiveSubCat(catId)
  }

  function moveFavoriteProduct(productId, direction) {
    const favoriteIds = normalizedProducts
      .filter(prod => effectiveFavoriteIds.has(String(prod.id)))
      .map(prod => prod.id)
    setFavoriteOrderIds(prev => {
      const ordered = [
        ...prev.filter(id => favoriteIds.includes(id)),
        ...favoriteIds.filter(id => !prev.includes(id)),
      ]
      const currentIndex = ordered.indexOf(productId)
      const targetIndex = currentIndex + direction
      if (currentIndex === -1 || targetIndex < 0 || targetIndex >= ordered.length) return ordered
      const next = [...ordered]
      const [picked] = next.splice(currentIndex, 1)
      next.splice(targetIndex, 0, picked)
      return next
    })
  }

  function continueProductSelection(prod) {
    if (!activeChannel) {
      showToast('Satis kanali hazirlaniyor', '#f59e0b')
      return
    }
    const comboDefinition = findComboDefinitionForProduct(prod, comboDefinitions)
    const comboChannelConfig = comboDefinition?.channelConfig?.[String(activeChannel)] || null
    if (comboDefinition && comboChannelConfig?.active !== false) {
      setModal({ type: 'combo', item: prod, comboDefinition })
      return
    }

    const portions  = parseJ(prod.portions, [])
    const optGroups = parseJ(prod.option_groups, [])
    const hasOpts   = portions.length > 0 || optGroups.some(g => (g.options||[]).length > 0)

    if (hasOpts) {
      setModal({ type: 'opts', item: prod })
    } else {
      const price = getChannelBasePrice(prod, activeChannel)
      addToCart(prod, null, [], price)
    }
  }

  function handleStaffLogout() {
    onStaffLogout?.()
  }

  function handleOpenGarsonScreen() {
    onStaffLogout?.()
    writePosStaffSession(POS_STAFF_SESSION_KEY, null)
    writePosStaffSession(GARSON_STAFF_SESSION_KEY, null)
    navigate('/garson')
  }

  const updateCurrentTableTicket = useCallback((updater) => {
    if (!currentTableKey) return
    if (!selectedBranchContext?.branchId) return

    setTableTickets(prev => {
      const normalizedState = normalizeAllTableTickets(prev, layoutTableDirectory)
      const currentBranchTickets = { ...(normalizedState[branchTicketKey] || {}) }
      const currentTicket = sanitizeOpenTicket(currentBranchTickets[currentTableKey])
      const nextPartial = typeof updater === 'function' ? updater(currentTicket) : updater
      const nextTicket = sanitizeOpenTicket({
        ...currentTicket,
        ...nextPartial,
        ownerId: activeStaff?.id || currentTicket.ownerId || '',
        ownerName: activeStaff?.name || currentTicket.ownerName || '',
        updatedAt: new Date().toISOString(),
      })

      if (hasOpenTicketContent(nextTicket)) currentBranchTickets[currentTableKey] = nextTicket
      else delete currentBranchTickets[currentTableKey]

      if (Object.keys(currentBranchTickets).length === 0) {
        const nextState = { ...normalizedState }
        delete nextState[branchTicketKey]
        return nextState
      }

      return {
        ...normalizedState,
        [branchTicketKey]: currentBranchTickets,
      }
    })
  }, [selectedBranchContext?.branchId, branchTicketKey, currentTableKey, activeStaff, layoutTableDirectory])

  function setActiveOrderNoteValue(value) {
    if (isMasaMode) {
      updateCurrentTableTicket(ticket => ({
        ...ticket,
        orderNote: value,
      }))
      return
    }
    setOrderNote(value)
  }
  function handleProdClick(prod) {
    if (!activeStaff) {
      triggerPinLogin?.()
      return
    }
    continueProductSelection(prod)
  }

  function addToCart(prod, portion, options, unitPrice) {
    const portKey = portion?.id || ''
    const optKey  = (options||[]).map(o=>o.name).sort().join(',')
    const cartKey = `${prod.id}_${portKey}_${optKey}`
    const posOwnerId = getPosTableOwnerId(activeStaff)
    const posOwnerName = activeStaff?.name || ''

    if (isMasaMode) {
      if (!hasOpenTicketContent(currentTableTicket)) {
        showToast('Once listeden aktif bir masa secin', '#ef4444')
        return
      }

      updateCurrentTableTicket(ticket => {
        const ex = ticket.cart.find(item => item.cartKey === cartKey && canPosUserEditTableItem(item, activeStaff))
        const nextCart = ex
          ? ticket.cart.map(item => item.id === ex.id ? { ...item, qty: item.qty + 1 } : item)
          : [...ticket.cart, {
              cartKey, prod, portion, options: options || [], unitPrice, qty: 1,
              note: '',
              id: uid(),
              entrySource: 'pos_masa',
              posOwnerId,
              posOwnerName,
            }]

        return {
          ...ticket,
          cart: nextCart,
        }
      })
      showToast(`${prod.name} ${currentTableLabel} hesabina eklendi`)
      return
    }

    setCart(prev => {
      const ex = prev.find(i => i.cartKey === cartKey)
      if (ex) return prev.map(i => i.cartKey===cartKey ? {...i, qty:i.qty+1} : i)
      return [...prev, {
        cartKey, prod, portion, options: options||[], unitPrice, qty: 1,
        note: '',
        id: uid()
      }]
    })
    showToast(`${prod.name} eklendi`)
  }

  function addComboToCart(prod, comboBundle, unitPrice, cartKeySuffix) {
    const cartKey = `${prod.id}_combo_${cartKeySuffix || comboBundle?.signature || uid()}`
    const posOwnerId = getPosTableOwnerId(activeStaff)
    const posOwnerName = activeStaff?.name || ''

    if (isMasaMode) {
      if (!hasOpenTicketContent(currentTableTicket)) {
        showToast('Once listeden aktif bir masa secin', '#ef4444')
        return
      }

      updateCurrentTableTicket(ticket => {
        const ex = ticket.cart.find(item => item.cartKey === cartKey && canPosUserEditTableItem(item, activeStaff))
        const nextCart = ex
          ? ticket.cart.map(item => item.id === ex.id ? { ...item, qty: item.qty + 1 } : item)
          : [...ticket.cart, {
              cartKey,
              prod,
              portion: null,
              options: [],
              comboBundle,
              unitPrice,
              qty: 1,
              note: '',
              id: uid(),
              entrySource: 'pos_masa',
              posOwnerId,
              posOwnerName,
            }]

        return {
          ...ticket,
          cart: nextCart,
        }
      })
      showToast(`${prod.name} ${currentTableLabel} hesabina eklendi`)
      return
    }

    setCart(prev => {
      const ex = prev.find(item => item.cartKey === cartKey)
      if (ex) return prev.map(item => item.cartKey === cartKey ? { ...item, qty: item.qty + 1 } : item)
      return [...prev, {
        cartKey,
        prod,
        portion: null,
        options: [],
        comboBundle,
        unitPrice,
        qty: 1,
        note: '',
        id: uid(),
      }]
    })
    showToast(`${prod.name} combo olarak eklendi`)
  }

  function updateCartItem(itemId, updates) {
    if (isMasaMode) {
      updateCurrentTableTicket(ticket => ({
        ...ticket,
        cart: ticket.cart.map(item => item.id === itemId ? { ...item, ...updates } : item),
      }))
      return
    }
    setCart(prev => prev.map(item => item.id === itemId ? { ...item, ...updates } : item))
  }

  function updateQty(itemId, delta) {
    if (isMasaMode) {
      const targetItem = currentTableTicket.cart.find(item => item.id === itemId)
      if (!targetItem) return

      if (delta < 0 && !canPosUserEditTableItem(targetItem, activeStaff)) {
        showToast('POS sadece kendi ekledigi urunu silebilir', '#ef4444')
        return
      }

      updateCurrentTableTicket(ticket => ({
        ...ticket,
        cart: (() => {
          if (delta > 0 && !canPosUserEditTableItem(targetItem, activeStaff)) {
            const ownMatch = ticket.cart.find(item => (
              item.id !== targetItem.id
              && item.cartKey === targetItem.cartKey
              && canPosUserEditTableItem(item, activeStaff)
            ))

            if (ownMatch) {
              return ticket.cart.map(item => item.id === ownMatch.id ? { ...item, qty: item.qty + 1 } : item)
            }

            return [
              ...ticket.cart,
              {
                ...targetItem,
                id: uid(),
                qty: 1,
                entrySource: 'pos_masa',
                posOwnerId: getPosTableOwnerId(activeStaff),
                posOwnerName: activeStaff?.name || '',
              },
            ]
          }

          return ticket.cart
            .map(item => item.id === itemId ? { ...item, qty: item.qty + delta } : item)
            .filter(item => item.qty > 0)
        })(),
      }))
      return
    }
    setCart(prev => {
      const next = prev.map(i => i.id===itemId ? {...i, qty:i.qty+delta} : i)
        .filter(i => i.qty > 0)
      return next
    })
  }


  const activeChannelName = channels.find(channel => channel.id === activeChannel)?.name || 'H\u0131zl\u0131 Sat\u0131\u015f'
  const channelName = activeChannelName || 'H\u0131zl\u0131 Sat\u0131\u015f'
  const isCallCenterMode = false
  const cartTotal = useMemo(
    () => roundMoney(activeCart.reduce((sum, item) => sum + getCartLineTotal(item), 0)),
    [activeCart]
  )
  const runtimeLoyaltyChannel = isMasaMode ? 'masa' : 'pos'
  const runtimeLoyaltyChannelLabel = getRuntimeChannelLabel(runtimeLoyaltyChannel)
  const activeSaleTableRef = isMasaMode ? currentTableLabel : normalizeMasaNo(masaNo)
  const loyaltyTriggerContextKey = `${selectedBranchContext?.branchId || ''}|${runtimeLoyaltyChannel}|${activeSaleTableRef || ''}`
  const [loyaltyCampaignPreview, setLoyaltyCampaignPreview] = useState({
    visibleCampaigns: [],
    applicableOffers: [],
    walletReadiness: null,
  })
  const [acknowledgedWarningCampaignIds, setAcknowledgedWarningCampaignIds] = useState(new Set())
  const activeWarningOffer = useMemo(() => {
    const offers = loyaltyCampaignPreview.applicableOffers || []
    const selectedCampaignId = String(preOrderLinkedCustomer?.selectedCampaignId || '').trim()
    return offers.find(
      offer => offer.actionType === 'warning_message' &&
      (offer.applicationMode === 'auto' || offer.campaignId === selectedCampaignId) &&
      !acknowledgedWarningCampaignIds.has(String(offer.campaignId))
    )
  }, [loyaltyCampaignPreview.applicableOffers, preOrderLinkedCustomer?.selectedCampaignId, acknowledgedWarningCampaignIds])

  const matchedCouponOffer = useMemo(() => {
    if (!manualCouponCode) return null
    return (loyaltyCampaignPreview?.applicableOffers || []).find(offer => 
      String(offer.selectedCouponCode || '').trim().toUpperCase() === String(manualCouponCode).trim().toUpperCase() ||
      String(offer.decisionContext?.selectedCouponCode || '').trim().toUpperCase() === String(manualCouponCode).trim().toUpperCase()
    )
  }, [loyaltyCampaignPreview?.applicableOffers, manualCouponCode])

  useEffect(() => {
    setAcknowledgedWarningCampaignIds(new Set())
  }, [preOrderLinkedCustomer?.customerId, activeCart.length === 0])
  const selectedLoyaltyProgramId = useMemo(() => {
    const selectedCampaignId = String(preOrderLinkedCustomer?.selectedCampaignId || '').trim()
    const selectedCampaign = loyaltyCampaignPreview.visibleCampaigns.find(campaign => (
      String(campaign.id || '') === selectedCampaignId
    ))
    if (selectedCampaign?.programId) return String(selectedCampaign.programId).trim()

    const candidateProgramIds = [
      ...new Set(
        (loyaltyCampaignCatalog || [])
          .map(campaign => String(campaign.programId || campaign.program_id || '').trim())
          .filter(Boolean),
      ),
    ]
    return candidateProgramIds.length === 1 ? candidateProgramIds[0] : ''
  }, [loyaltyCampaignCatalog, loyaltyCampaignPreview.visibleCampaigns, preOrderLinkedCustomer?.selectedCampaignId])
  const preOrderPreparedAdvantage = useMemo(
    () => resolvePreparedLoyaltyAdvantage(preOrderLinkedCustomer, loyaltyCampaignCatalog),
    [preOrderLinkedCustomer, loyaltyCampaignCatalog],
  )
  const visibleLoyaltyCampaigns = loyaltyCampaignPreview.visibleCampaigns

  useEffect(() => {
    let ignore = false
    const customerContext = preOrderLinkedCustomer
      ? {
          customerId: preOrderLinkedCustomer.customerId,
          customerName: preOrderLinkedCustomer.customerName,
          customerCategoryIds: preOrderLinkedCustomer.customerCategoryIds || [],
          customerCreatedAt: preOrderLinkedCustomer.customerCreatedAt || preOrderLinkedCustomer.created_at || null,
          customerFirstOrderAt: preOrderLinkedCustomer.customerFirstOrderAt || preOrderLinkedCustomer.first_order_at || null,
          tierPointsMultiplier: preOrderLinkedCustomer.tierPointsMultiplier || preOrderLinkedCustomer.pointsMultiplier || preOrderLinkedCustomer.points_multiplier || 1,
        }
      : {}
    const syncFallback = evaluateRuntimeOrderCampaigns(loyaltyCampaignCatalog, {
      runtimeChannel: runtimeLoyaltyChannel,
      orderTotal: cartTotal,
      customerContext,
      selectedCampaignId: preOrderLinkedCustomer?.selectedCampaignId || '',
      manuallyTriggeredCampaignIds: preOrderLinkedCustomer?.selectedCampaignIds || manualTriggeredCampaignIds,
      selectedCouponCode: preOrderLinkedCustomer?.selectedCouponCode || manualCouponCode || '',
      cartLines: activeCart,
      saleTemplates,
    })

    ;(async () => {
      try {
        const evaluated = await evaluateRuntimeOrderCampaignsAsync(loyaltyCampaignCatalog, {
          runtimeChannel: runtimeLoyaltyChannel,
          orderTotal: cartTotal,
          customerContext,
          selectedCampaignId: preOrderLinkedCustomer?.selectedCampaignId || '',
          manuallyTriggeredCampaignIds: preOrderLinkedCustomer?.selectedCampaignIds || manualTriggeredCampaignIds,
          selectedCouponCode: preOrderLinkedCustomer?.selectedCouponCode || manualCouponCode || '',
          programId: selectedLoyaltyProgramId,
          cartLines: activeCart,
          saleTemplates,
        })
        if (ignore) return
        setLoyaltyCampaignPreview(evaluated)
      } catch {
        if (ignore) return
        setLoyaltyCampaignPreview({
          ...syncFallback,
          walletReadiness: null,
        })
      }
    })()

    return () => { ignore = true }
  }, [
    loyaltyCampaignCatalog,
    runtimeLoyaltyChannel,
    cartTotal,
    preOrderLinkedCustomer,
    manualTriggeredCampaignIds,
    selectedLoyaltyProgramId,
    activeCart,
    saleTemplates,
    manualCouponCode,
  ])

  useEffect(() => {
    setManualTriggeredCampaignIds([])
  }, [loyaltyTriggerContextKey])

  useEffect(() => {
    if (activeCart.length > 0) return
    setManualTriggeredCampaignIds(prev => (prev.length > 0 ? [] : prev))
  }, [activeCart.length])

  const activeCoverCount = useMemo(
    () => getGuestCoverCount(activeGuestCounts),
    [activeGuestCounts]
  )
  const editingCartItem = modal?.type === 'edit-item'
    ? activeCart.find(item => item.id === modal.itemId) || null
    : null
  const noteCartItem = modal?.type === 'item-note'
    ? activeCart.find(item => item.id === modal.itemId) || null
    : null

  function clearQuickSaleState() {
    setCart([])
    setOrderNote('')
    setGuestCounts(DEFAULT_GUEST_COUNTS)
  }

  function clearCurrentTableTicket() {
    updateCurrentTableTicket(() => ({
      cart: [],
      orderNote: '',
      guestCounts: DEFAULT_GUEST_COUNTS,
    }))
  }

  function clearActiveSaleState() {
    if (isMasaMode) {
      clearCurrentTableTicket()
      return
    }
    clearQuickSaleState()
  }

  function applyRemainingItemsAfterPayment(nextCart) {
    if (isMasaMode) {
      if (nextCart.length > 0) {
        updateCurrentTableTicket(ticket => ({
          ...ticket,
          cart: nextCart,
        }))
        return
      }

      clearCurrentTableTicket()
      return
    }

    setCart(nextCart)
    if (nextCart.length === 0) {
      setOrderNote('')
      setGuestCounts(DEFAULT_GUEST_COUNTS)
    }
  }

  function updateGuestCount(type) {
    if (isMasaMode) {
      updateCurrentTableTicket(ticket => ({
        ...ticket,
        guestCounts: {
          ...ticket.guestCounts,
          [type]: Math.max(0, (parseInt(ticket?.guestCounts?.[type], 10) || 0) + 1),
        },
      }))
      return
    }

    setGuestCounts(current => ({
      ...current,
      [type]: Math.max(0, (parseInt(current?.[type], 10) || 0) + 1),
    }))
  }

  function resetGuestCount(type) {
    if (isMasaMode) {
      updateCurrentTableTicket(ticket => ({
        ...ticket,
        guestCounts: {
          ...ticket.guestCounts,
          [type]: 0,
        },
      }))
      return
    }

    setGuestCounts(current => ({
      ...current,
      [type]: 0,
    }))
  }

  function moveQuickSaleToTable(targetTableKey) {
    const targetKey = resolveTableKey(layoutTableDirectory, targetTableKey)
    const targetTable = resolveTableRecord(layoutTableDirectory, targetKey)
    const masaSalesChannel = channels.find(channel => normalizeChannelName(channel?.name) === 'masa') || null
    if (!selectedBranchContext?.branchId) {
      showToast('Siparisi aktarmak icin once sube secin', '#ef4444')
      return
    }
    if (cart.length === 0) {
      showToast('Masaya aktarim icin sepette urun olmali', '#ef4444')
      return
    }
    if (!masaSalesChannel?.id) {
      showToast('Masaya aktarim icin "Masa" satis kanali tanimli olmali', '#ef4444')
      return
    }
    if (!targetKey) {
      showToast('Aktarim icin hedef masa secin', '#ef4444')
      return
    }

    const existingTargetTicket = sanitizeOpenTicket(branchTableTickets[targetKey])
    if (hasOpenTicketContent(existingTargetTicket)) {
      showToast(`${targetTable.label} artik dolu gorunuyor`, '#ef4444')
      return
    }

    const convertedCart = cloneCartItemsForTransfer(cart).map(item => ({
      ...item,
      unitPrice: getCartItemUnitPriceForChannel(item, masaSalesChannel.id, item.unitPrice),
      entrySource: 'pos_masa',
      posOwnerId: getPosTableOwnerId(activeStaff),
      posOwnerName: activeStaff?.name || '',
    }))

    const nextTicket = {
      cart: convertedCart,
      orderNote: orderNote || '',
      guestCounts: normalizeGuestCounts(guestCounts),
      ownerId: activeStaff?.id || '',
      ownerName: activeStaff?.name || '',
      updatedAt: new Date().toISOString(),
    }

    setTableTickets(prev => {
      const normalizedState = normalizeAllTableTickets(prev, layoutTableDirectory)
      return {
        ...normalizedState,
        [branchTicketKey]: {
          ...(normalizedState[branchTicketKey] || {}),
          [targetKey]: nextTicket,
        },
      }
    })

    clearQuickSaleState()
    setModal(null)
    showToast(`Siparis ${targetTable.label} icine masa fiyatlariyla aktarildi`, '#38bdf8')
  }

  function clearOrderWithReason(reason) {
    if (isMasaMode) {
      showToast('POS uzerinden masa hesabindan urun silinemez', '#ef4444')
      return
    }
    if (!reason) {
      showToast(UI_TEXT.orderDeleteReasonRequired, '#ef4444')
      return
    }

    appendVoidLogToDb({
      id: uid(),
      masa_no: activeSaleTableRef,
      reason,
      order_note: activeOrderNote,
      cover_count: activeCoverCount,
      female_guest_count: activeGuestCounts.women,
      male_guest_count: activeGuestCounts.men,
      child_guest_count: activeGuestCounts.children,
      total: cartTotal,
      items: expandCartItemsForPayload(activeCart).map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        qty: item.qty,
        portion: item.portion,
        options: item.options,
        note: item.note || '',
      })),
      created_at: new Date().toISOString(),
    })

    clearQuickSaleState()
    setModal(null)
    showToast(UI_TEXT.orderDeleted, '#ef4444')
  }

  function getFavoriteProducts(list) {
    return list.filter(prod => effectiveFavoriteIds.has(String(prod.id)))
  }

  function toggleFavoriteProduct(product) {
    const productId = String(product?.id || '')
    if (!productId) return

    setFavoriteProductIds(current => (
      current.includes(productId)
        ? current.filter(id => id !== productId)
        : [...current, productId]
    ))
  }

  function buildNormalizedSalePayload({ localId, items, payments, discountType, discountValue, discountAmount, total, customer = null, orderNote = null }) {
    const saleDate = new Date().toISOString()
    const paymentTotal = roundMoney(payments.reduce((sum, payment) => sum + (parseFloat(payment?.amount) || 0), 0))
    const expandedItems = flattenCartItems(items)
    const grossBefore = roundMoney(expandedItems.reduce((sum, item) => sum + getCartLineTotal(item), 0))
    const safeDiscountAmount = roundMoney(discountAmount || 0)
    const channelName = activeChannelName || 'H\u0131zl\u0131 Sat\u0131\u015f'
    const branchCtx = selectedBranchContext
    const safeGuestCounts = normalizeGuestCounts(activeGuestCounts)
    const coverCount = getGuestCoverCount(safeGuestCounts)
    if (!branchCtx?.branchId) throw new Error('Sat\u0131\u015f almadan \u00f6nce \u015fube se\u00e7melisiniz')

    let allocatedDiscount = 0
    const lines = expandedItems.map((item, index) => {
      const qty = parseFloat(item?.qty) || 0
      const lineBefore = roundMoney(getCartLineTotal(item))
      const channelPrice = parseJ(item?.prod?.channel_prices, []).find(x => x.channel_id === activeChannel && x.active)
      const tax = taxById.get(channelPrice?.tax_id) || null
      const taxRate = parseFloat(tax?.rate) || 0
      const category = categoryById.get(item?.prod?.category_id || getProductCategoryId(item?.prod)) || null

      let topCategory = category
      while (topCategory?.parent_id) {
        const parent = categoryById.get(topCategory.parent_id)
        if (!parent) break
        topCategory = parent
      }

      const lineDiscount = index === expandedItems.length - 1
        ? roundMoney(safeDiscountAmount - allocatedDiscount)
        : roundMoney(grossBefore > 0 ? (lineBefore / grossBefore) * safeDiscountAmount : 0)

      allocatedDiscount = roundMoney(allocatedDiscount + lineDiscount)

      const lineAfter = roundMoney(lineBefore - lineDiscount)
      const unitAfter = qty > 0 ? roundMoney(lineAfter / qty) : 0
      const netAfter = taxRate > 0 ? roundMoney(lineAfter / (1 + taxRate / 100)) : lineAfter
      const unitCost = roundMoney(calcRecipeUnitCost(item?.prod, activeChannel, item?.portion?.id || null))
      const lineCost = roundMoney(unitCost * qty)

      return {
        line_no: index + 1,
        product_id: toDbUuidOrNull(item?.prod?.id),
        product_name: item?.prod?.name || '',
        product_sku: item?.prod?.sku || null,
        top_category_id: toDbUuidOrNull(topCategory?.id),
        top_category_name: topCategory?.name || null,
        sub_category_id: toDbUuidOrNull(category?.id),
        sub_category_name: category?.name || null,
        portion_id: item?.portion?.id || null,
        portion_name: item?.portion?.name || null,
        options_json: (item?.options || []).map(option => ({ id: option?.id || null, name: option?.name || '' })),
        options_summary: (item?.options || []).map(option => option?.name).filter(Boolean).join(' + ') || null,
        line_note: item?.note || null,
        qty,
        unit_gross_before_discount: roundMoney(item?.unitPrice || 0),
        line_gross_before_discount: lineBefore,
        discount_allocated_amount: lineDiscount,
        unit_gross_after_discount: unitAfter,
        line_gross_after_discount: lineAfter,
        tax_id: toDbUuidOrNull(channelPrice?.tax_id),
        tax_name: tax?.name || null,
        tax_rate: taxRate,
        line_net_after_discount: netAfter,
        unit_cost_snapshot: unitCost,
        line_cost_total: lineCost,
        sales_channel_id: toDbUuidOrNull(activeChannel),
        sales_channel_name: channelName,
        branch_id: toDbUuidOrNull(branchCtx?.branchId),
        branch_name: branchCtx?.branchName || null,
        sale_datetime: saleDate,
      }
    })

    return {
      header: {
        local_id: localId,
        sale_datetime: saleDate,
        source: 'pos',
        source_channel_type: isMasaMode ? 'masa' : 'hizli_satis',
        sales_channel_id: toDbUuidOrNull(activeChannel),
        sales_channel_name: channelName,
        company_id: toDbUuidOrNull(branchCtx?.companyId),
        company_name: branchCtx?.companyName || null,
        legal_entity_id: toDbUuidOrNull(branchCtx?.legalEntityId),
        legal_entity_name: branchCtx?.legalEntityName || null,
        org_unit_id: toDbUuidOrNull(branchCtx?.orgUnitId),
        org_unit_name: branchCtx?.orgUnitName || null,
        branch_id: toDbUuidOrNull(branchCtx?.branchId),
        branch_name: branchCtx?.branchName || null,
        table_no: activeSaleTableRef,
        customer_id: toDbUuidOrNull(customer?.id),
        customer_name: customer?.name || null,
        cashier_id: null,
        cashier_name: activeStaff?.name || null,
        personnel_id: activeStaff?.id || null,
        personnel_name: activeStaff?.name || null,
        cover_count: coverCount,
        female_guest_count: safeGuestCounts.women,
        male_guest_count: safeGuestCounts.men,
        child_guest_count: safeGuestCounts.children,
        order_note: orderNote !== null ? orderNote : (activeOrderNote || null),
        currency_code: 'TRY',
        gross_total_before_discount: grossBefore,
        discount_type: discountType || null,
        discount_value: parseFloat(discountValue) || 0,
        discount_amount: safeDiscountAmount,
        gross_total_after_discount: roundMoney(total),
        net_total_after_discount: roundMoney(lines.reduce((sum, line) => sum + line.line_net_after_discount, 0)),
        cost_total: roundMoney(lines.reduce((sum, line) => sum + line.line_cost_total, 0)),
        payment_total: paymentTotal,
        change_amount: 0,
        status: 'completed',
      },
      lines,
      payments: payments.map(payment => ({
        payment_method: payment?.method || 'bilinmiyor',
        payment_method_label: payment?.label || payment?.method || 'Bilinmiyor',
        amount: roundMoney(payment?.amount || 0),
        reference_no: null,
      })),
    }
  }


  async function legacyCompleteSale(odemeYontemi, alinanMiktar) {
    const safeGuestCounts = normalizeGuestCounts(activeGuestCounts)
    const saleData = {
      local_id:     dbUuid(),
      masa_no:      activeSaleTableRef,
      channel_id:   toDbUuidOrNull(activeChannel),
      personnel_id: activeStaff?.id || null,
      personnel_name: activeStaff?.name || null,
      cover_count:  getGuestCoverCount(safeGuestCounts),
      female_guest_count: safeGuestCounts.women,
      male_guest_count: safeGuestCounts.men,
      child_guest_count: safeGuestCounts.children,
      odeme:        odemeYontemi,
      alinan:       alinanMiktar,
      toplam:       cartTotal,
      items:        expandCartItemsForPayload(activeCart).map(i => ({
        product_id:  i.product_id,
        product_name:i.product_name,
        portion:     i.portion,
        options:     i.options,
        note:        i.note || '',
        order_note:  activeOrderNote || '',
        unit_price:  i.unit_price,
        qty:         i.qty,
        total:       i.total,
      })),
      tarih:        new Date().toISOString(),
      synced:       false,
    }


    const { error: _posErr } = await db.from('pos_sales').upsert({
      local_id:   saleData.local_id,
      masa_no:    saleData.masa_no,
      channel_id: saleData.channel_id,
      cover_count: saleData.cover_count ?? 0,
      female_guest_count: saleData.female_guest_count ?? 0,
      male_guest_count: saleData.male_guest_count ?? 0,
      child_guest_count: saleData.child_guest_count ?? 0,
      odeme:      saleData.odeme,
      alinan:     saleData.alinan,
      toplam:     saleData.toplam,
      items:      saleData.items,
      tarih:      saleData.tarih,
    }, { onConflict: 'local_id' })
    if (_posErr) throw _posErr

    clearActiveSaleState()
    setModal(null)
    showToast('Sat\u0131\u015f tamamland\u0131!', '#10b981')
  }


  async function persistSaleBatch({ items, payments, discountType, discountValue, discountAmount, total, loyaltyCampaign, customer = null }) {
    if (!selectedBranchContext?.branchId) {
        throw new Error('\u015eube se\u00e7ilmeden sat\u0131\u015f kaydedilemez')
    }
    const safeGuestCounts = normalizeGuestCounts(activeGuestCounts)
    const paidTotal = payments.reduce((sum, payment) => sum + payment.amount, 0)
    const paymentType = payments.length === 1 ? payments[0].method : 'karma'
    const localId = dbUuid()
    const saleLoyaltySnapshot = createSaleLoyaltySnapshot(loyaltyCampaign)
    const saleLoyaltyFields = buildSaleLoyaltyFields(saleLoyaltySnapshot, discountAmount)

    const campaignNotes = [];
    if (loyaltyCampaign?.actionType === 'write_customer_note' && loyaltyCampaign?.customerNote) {
      campaignNotes.push(loyaltyCampaign.customerNote);
    }
    const finalOrderNote = [activeOrderNote, ...campaignNotes].filter(Boolean).join('\n');

    const normalizedSale = buildNormalizedSalePayload({
      localId,
      items,
      payments,
      discountType,
      discountValue,
      discountAmount,
      total,
      customer,
      orderNote: finalOrderNote,
    })
    const legacyItems = buildLegacySaleItemsSnapshot(
      expandCartItemsForPayload(items),
      discountAmount,
      saleLoyaltySnapshot,
      finalOrderNote,
    )
    const persistedSalesHeader = attachLoyaltyToSaleHeader(normalizedSale.header, saleLoyaltySnapshot, discountAmount)
    const persistedSalesLines = attachLoyaltyToSaleLines(normalizedSale.lines, saleLoyaltySnapshot, discountAmount)
    const saleData = {
      local_id: localId,
      masa_no: activeSaleTableRef,
      channel_id: toDbUuidOrNull(activeChannel),
      personnel_id: activeStaff?.id || null,
      personnel_name: activeStaff?.name || null,
      cover_count: getGuestCoverCount(safeGuestCounts),
      female_guest_count: safeGuestCounts.women,
      male_guest_count: safeGuestCounts.men,
      child_guest_count: safeGuestCounts.children,
      odeme: paymentType,
      alinan: paidTotal,
      toplam: total,
      items: legacyItems,
      tarih: new Date().toISOString(),
      synced: false,
      payment_breakdown: payments.map(payment => ({ method: payment.method, amount: payment.amount })),
      discount_type: discountType || null,
      discount_value: parseFloat(discountValue) || 0,
      discount_amount: discountAmount || 0,
      sales_header: persistedSalesHeader,
      sales_lines: persistedSalesLines,
      sale_payments: normalizedSale.payments,
      ...saleLoyaltyFields,
    }
    let salesResult = await db
      .from('sales')
      .upsert({ ...persistedSalesHeader, updated_at: new Date().toISOString() }, { onConflict: 'local_id' })
      .select('id')
      .single()
    if (salesResult.error && isLoyaltyPersistenceColumnError(salesResult.error)) {
      salesResult = await db
        .from('sales')
        .upsert({ ...normalizedSale.header, updated_at: new Date().toISOString() }, { onConflict: 'local_id' })
        .select('id')
        .single()
    }
    const { data: salesRow, error: salesError } = salesResult
    if (salesError) throw salesError

    if (salesRow?.id) {
      const saleId = salesRow.id
      const { error: delLinesErr } = await db.from('sale_lines').delete().eq('sale_id', saleId)
      if (delLinesErr) throw delLinesErr
      if (Array.isArray(normalizedSale.lines) && normalizedSale.lines.length > 0) {
        let insertLinesResult = await db
          .from('sale_lines')
          .insert(persistedSalesLines.map(line => ({ ...line, sale_id: saleId })))
        if (insertLinesResult.error && isLoyaltyPersistenceColumnError(insertLinesResult.error)) {
          insertLinesResult = await db
            .from('sale_lines')
            .insert(normalizedSale.lines.map(line => ({ ...line, sale_id: saleId })))
        }
        const { error: insLinesErr } = insertLinesResult
        if (insLinesErr) throw insLinesErr
      }
      const { error: delPayErr } = await db.from('sale_payments').delete().eq('sale_id', saleId)
      if (delPayErr) throw delPayErr
      if (Array.isArray(normalizedSale.payments) && normalizedSale.payments.length > 0) {
        const { error: insPayErr } = await db
          .from('sale_payments')
          .insert(normalizedSale.payments.map(payment => ({ ...payment, sale_id: saleId })))
        if (insPayErr) throw insPayErr
      }

      await postSaleLoyaltyValueLedger({
        saleId,
        saleHeader: { ...persistedSalesHeader, id: saleId },
        saleLines: persistedSalesLines,
        customer,
        loyaltyCampaign: saleLoyaltySnapshot,
        selectedCouponCode: customer?.selectedCouponCode || manualCouponCode || '',
        sourceChannel: isMasaMode ? 'masa' : 'pos',
      })
    }

    const legacyBasePayload = {
      local_id:   saleData.local_id,
      masa_no:    saleData.masa_no,
      channel_id: saleData.channel_id,
      cover_count: saleData.cover_count || 0,
      female_guest_count: saleData.female_guest_count || 0,
      male_guest_count: saleData.male_guest_count || 0,
      child_guest_count: saleData.child_guest_count || 0,
      odeme:      saleData.odeme,
      alinan:     saleData.alinan,
      toplam:     saleData.toplam,
      items:      saleData.items,
      tarih:      saleData.tarih,
    }
    let legacyResult = await db.from('pos_sales').upsert({
      ...legacyBasePayload,
      ...saleLoyaltyFields,
    }, { onConflict: 'local_id' })
    if (legacyResult.error && isLoyaltyPersistenceColumnError(legacyResult.error)) {
      legacyResult = await db.from('pos_sales').upsert(legacyBasePayload, { onConflict: 'local_id' })
    }
    const { error: legacyErr } = legacyResult
    if (legacyErr) throw legacyErr
  }

  async function completeSaleGroup({ items, payments, discountType, discountValue, discountAmount, total, loyaltyCampaign, customer = null }) {
    try {
      await persistSaleBatch({ items, payments, discountType, discountValue, discountAmount, total, loyaltyCampaign, customer })
      const nextCart = applyPaidItemsToCart(activeCart, items)
      applyRemainingItemsAfterPayment(nextCart)
      if (nextCart.length === 0) {
        window.setTimeout(() => setModal(null), 2000)
      }
      showToast('\u00d6deme al\u0131nd\u0131', '#10b981')
      return { success: true }
    } catch (error) {
      showToast(error?.message || '\u00d6deme kaydedilemedi', '#ef4444')
      return { success: false }
    }
  }

  async function saveDebtSaleGroup({ items, payments, discountType, discountValue, discountAmount, total, debt, loyaltyCampaign, customer = null }) {
    let debtMovementId = null
    let previousDebt = null

    try {
      if (!debt?.customer?.id) {
        showToast('M\u00fc\u015fteri se\u00e7ilmeden bor\u00e7 kayd\u0131 yap\u0131lamaz', '#ef4444')
        return { success: false }
      }
      const { data: movementRow, error: movementError } = await db
        .from('cari_hareketler')
        .insert({
          musteri_id: debt.customer.id,
          tur: 'borc',
          tutar: total,
          aciklama: debt.note?.trim() || 'POS \u00fczerinden bor\u00e7 kayd\u0131',
          tarih: new Date().toISOString().split('T')[0],
          neden: 'POS Bor\u00e7 Kayd\u0131',
          personel_adi: activeStaff?.name || null,
        })
        .select('id')
        .single()
      if (movementError) throw movementError

      debtMovementId = movementRow?.id || null
      previousDebt = parseFloat(debt.customer.toplam_borc) || 0

      const { error: customerError } = await db
        .from('musteriler')
        .update({ toplam_borc: previousDebt + total })
        .eq('id', debt.customer.id)
      if (customerError) throw customerError

      const saleCustomer = customer?.id
        ? customer
        : debt?.customer?.id
          ? {
              id: debt.customer.id,
              name: debt.customer.ad_soyad || '',
            }
          : null

      await persistSaleBatch({
        items,
        payments,
        discountType,
        discountValue,
        discountAmount,
        total,
        loyaltyCampaign,
        customer: saleCustomer,
      })
      const nextCart = applyPaidItemsToCart(activeCart, items)
      applyRemainingItemsAfterPayment(nextCart)
      if (nextCart.length === 0) {
        window.setTimeout(() => setModal(null), 2000)
      }
      showToast('Sipari\u015f borca kaydedildi', '#f59e0b')
      return { success: true }
    } catch (error) {
      if (previousDebt !== null) {
        await db.from('musteriler').update({ toplam_borc: previousDebt }).eq('id', debt.customer.id)
      }
      if (debtMovementId) {
        await db.from('cari_hareketler').delete().eq('id', debtMovementId)
      }
      showToast(error?.message || 'Bor\u00e7 kayd\u0131 yap\u0131lamad\u0131', '#ef4444')
      return { success: false }
    }
  }

  function getProdPrice(prod) {
    const price = getChannelBasePrice(prod, activeChannel)
    return price > 0 ? price : null
  }

  if (isCallCenterMode) {
    return (
      <div style={{ position:'fixed', inset:0, background:'#00003a', display:'flex', fontFamily:"'Roboto',sans-serif", userSelect:'none', overflow:'hidden' }}>
        {toast && (
          <div style={{ position:'fixed', top:20, right:20, zIndex:200, background:toast.color, color:'#fff', padding:'12px 20px', borderRadius:12, fontWeight:800, fontSize:'.9rem', display:'flex', alignItems:'center', gap:8, boxShadow:`0 8px 24px ${toast.color}55` }}>
            <span>{'\u2713'}</span>{toast.msg}
          </div>
        )}
        <div style={{ width:280, background:'#0a0f44', borderRight:'1px solid rgba(255,255,255,.08)', display:'flex', flexDirection:'column', flexShrink:0, padding:16, gap:14 }}>
          <div style={{ color:'#fff', fontWeight:900, fontSize:'1rem', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{visibleBranchName}</div>
          {activeStaff && (
            <button type="button" onClick={handleStaffLogout} style={{ width:'100%', minHeight:58, borderRadius:16, border:'1px solid rgba(56,189,248,.18)', background:'rgba(56,189,248,.09)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'0 14px', cursor:'pointer' }}>
              <span style={{ fontWeight:900, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{activeStaff.name}</span>
              <i className="fa-solid fa-right-from-bracket" style={{ color:'#fca5a5' }} />
            </button>
          )}
          <div style={{ borderRadius:18, padding:16, background:'rgba(251,191,36,.10)', border:'1px solid rgba(251,191,36,.18)', color:'#fde68a', display:'grid', gap:8 }}>
            <div style={{ fontWeight:900 }}>Call Center Paneli</div>
            <div style={{ color:'#cbd5e1', fontSize:'.82rem', lineHeight:1.55 }}>Bu sekmede urun girisi yapilmaz. Call center tarafindan olusturulan acik siparisler ve KDS durumlari izlenir.</div>
          </div>
          <button type="button" onClick={() => navigate('/call-center')} style={{ minHeight:46, borderRadius:14, border:'none', background:'linear-gradient(135deg,#f59e0b,#fbbf24)', color:'#111827', fontWeight:900, cursor:'pointer' }}>
            CallCenter sayfasini ac
          </button>
        </div>
        <div style={{ flex:1, display:'flex', flexDirection:'column', padding:'18px 20px', overflow:'hidden' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18, gap:12 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ fontSize:'1.4rem', fontWeight:900, color:'#fff' }}>Call Center Siparis Paneli</div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              {headerChannels.length > 0 && (
                <div style={{ display:'flex', gap:6 }}>
                  {headerChannels.map(ch => (
                    <button className="touch-btn" key={ch.id} onClick={() => {
                      const nextIsMasaMode = normalizeChannelName(ch.name) === 'masa'
                      setActiveChannel(ch.id)
                      setShowTableLayout(nextIsMasaMode)
                    }} style={{ minHeight:44, padding:'8px 16px', borderRadius:99, border:`1px solid ${activeChannel===ch.id?'#fbbf24':'rgba(255,255,255,.15)'}`, background:activeChannel===ch.id?'rgba(251,191,36,.15)':'transparent', color:activeChannel===ch.id?'#fbbf24':'#94a3b8', fontWeight:700, fontSize:'.78rem', cursor:'pointer', transition:'.15s' }}>{ch.name}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div style={{ flex:1, minHeight:0 }}>
            <PosOrderHubPanel branchId={selectedBranchContext?.branchId || resolvedBranchId || ''} branchName={selectedBranchContext?.branchName || visibleBranchName || ''} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      position:'fixed',inset:0,background:'#00003a',
      display:'flex',fontFamily:"'Roboto',sans-serif",
      userSelect:'none',overflow:'hidden'
    }}>

      {toast && (
        <div style={{
          position:'fixed',top:20,right:20,zIndex:200,
          background:toast.color,color:'#fff',
          padding:'12px 20px',borderRadius:12,fontWeight:800,fontSize:'.9rem',
          display:'flex',alignItems:'center',gap:8,
          boxShadow:`0 8px 24px ${toast.color}55`,
          animation:'slideIn .3s ease'
        }}>
          <span>{'\u2713'}</span>{toast.msg}
        </div>
      )}


      {activeSpecialView !== 'orders' && (
        <div style={{
          width:280,background:'#0a0f44',borderRight:'1px solid rgba(255,255,255,.08)',
          display:'flex',flexDirection:'column',flexShrink:0,
          boxShadow:'4px 0 24px rgba(0,0,0,.3)'
        }}>
        <div style={{display:'grid',gap:12,padding:'0 16px',marginBottom:12}}>
          <div style={{fontSize:'1rem',fontWeight:900,color:'#fff',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
            {visibleBranchName}
          </div>

          {activeStaff ? (
            <button
              type="button"
              onClick={handleStaffLogout}
              style={{
                width:'100%',
                minHeight:58,
                borderRadius:16,
                border:'1px solid rgba(56,189,248,.18)',
                background:'rgba(56,189,248,.09)',
                color:'#fff',
                display:'flex',
                alignItems:'center',
                justifyContent:'space-between',
                gap:12,
                padding:'0 14px',
                cursor:'pointer',
              }}
            >
              <span style={{fontWeight:900,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                {activeStaff.name}
              </span>
              <span style={{
                width:38,
                height:38,
                borderRadius:12,
                display:'inline-flex',
                alignItems:'center',
                justifyContent:'center',
                background:'rgba(127,29,29,.28)',
                border:'1px solid rgba(248,113,113,.28)',
                color:'#fca5a5',
                flexShrink:0,
              }}>
                <i className="fa-solid fa-right-from-bracket" />
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => triggerPinLogin?.()}
              style={{
                width:'100%',
                minHeight:58,
                borderRadius:16,
                border:'1px dashed rgba(56,189,248,.3)',
                background:'rgba(56,189,248,.04)',
                color:'#7dd3fc',
                display:'flex',
                alignItems:'center',
                justifyContent:'center',
                gap:8,
                padding:'0 14px',
                cursor:'pointer',
                fontWeight:900,
                fontSize:'.9rem',
                transition:'all .15s ease'
              }}
            >
              <i className="fa-solid fa-user-lock" />
              <span>Personel Girişi</span>
            </button>
          )}

          <div style={{display:'grid',gridTemplateColumns:'1fr 56px 1fr',gap:8,alignItems:'center'}}>
            <button className="touch-btn" onClick={() => setModal({ type:'order-note' })} style={{
              minHeight:42,padding:'8px 10px',borderRadius:12,border:'1px solid rgba(255,255,255,.12)',
              background:activeOrderNote ? 'rgba(16,185,129,.12)' : 'rgba(255,255,255,.04)',
              color:activeOrderNote ? '#34d399' : '#cbd5e1',fontWeight:700,fontSize:'.76rem',cursor:'pointer'
            }}>
              <i className="fa-regular fa-note-sticky" style={{marginRight:6}} />
              {UI_TEXT.orderNote}
            </button>

            <input
              value={isMasaMode ? currentTableDisplayNo : masaNo}
              onChange={e => {
                if (!isMasaMode) setMasaNo(e.target.value.replace(/\D/g, '').slice(0, 3))
              }}
              onBlur={e => {
                if (!isMasaMode) setMasaNo(normalizeMasaNo(e.target.value))
              }}
              readOnly={isMasaMode}
              style={{
                width:'100%',
                minHeight:42,
                background:'rgba(255,255,255,.1)',
                border:'1px solid rgba(255,255,255,.15)',
                borderRadius:10,
                padding:'0 8px',
                color:'#fbbf24',
                fontWeight:900,
                fontSize:'1.08rem',
                textAlign:'center',
                outline:'none',
              }}
            />

            <button
              className="touch-btn"
              onClick={() => !isMasaMode && cart.length > 0 && setModal({ type:'move-table' })}
              disabled={isMasaMode || cart.length === 0}
              style={{
                minHeight:42,padding:'8px 10px',borderRadius:12,border:'1px solid rgba(255,255,255,.12)',
                background:!isMasaMode && cart.length > 0 ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,.06)',
                color:!isMasaMode && cart.length > 0 ? '#cbd5e1' : '#64748b',
                fontWeight:700,fontSize:'.76rem',
                cursor:!isMasaMode && cart.length > 0 ? 'pointer' : 'not-allowed'
              }}
            >
              <i className="fa-solid fa-arrow-right-arrow-left" style={{marginRight:6}} />
              {UI_TEXT.moveTable}
            </button>
          </div>

          <div style={{
            padding:'14px 14px 12px',
            borderRadius:16,
            background:'rgba(255,255,255,.03)',
            border:'1px solid rgba(255,255,255,.08)',
          }}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3, minmax(0, 1fr))',gap:8}}>
              {GUEST_META.map(guest => (
                <div key={guest.key} style={{display:'grid',justifyItems:'center',gap:6}}>
                  <button
                    type="button"
                    className="touch-btn"
                    title={guest.label}
                    onClick={() => updateGuestCount(guest.key)}
                    style={{
                      width:'100%',
                      minHeight:48,
                      borderRadius:14,
                      border:`1px solid ${guest.color}44`,
                      background:`${guest.color}18`,
                      color:guest.color,
                      display:'flex',
                      alignItems:'center',
                      justifyContent:'center',
                      cursor:'pointer',
                      fontSize:'1rem',
                    }}
                  >
                    <i className={`fa-solid ${guest.icon}`} />
                  </button>
                  <button
                    type="button"
                    className="touch-btn"
                    title={activeGuestCounts[guest.key] > 0 ? `${guest.label} sayisini sifirla` : guest.label}
                    onClick={() => resetGuestCount(guest.key)}
                    disabled={activeGuestCounts[guest.key] <= 0}
                    style={{
                      minWidth:42,
                      minHeight:28,
                      borderRadius:999,
                      border:'1px solid rgba(255,255,255,.12)',
                      background:'rgba(255,255,255,.04)',
                      textAlign:'center',
                      color:'#fff',
                      fontWeight:900,
                      fontSize:'.84rem',
                      cursor:activeGuestCounts[guest.key] > 0 ? 'pointer' : 'default',
                      opacity: activeGuestCounts[guest.key] > 0 ? 1 : .7,
                    }}
                  >
                    {activeGuestCounts[guest.key]}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {isTableLayoutView && hasSelectedActiveTable && (
            <button
              type="button"
              className="touch-btn"
              onClick={() => setShowTableLayout(false)}
              style={{
                width:'100%',
                minHeight:46,
                borderRadius:12,
                border:'1px solid rgba(251,191,36,.26)',
                background:'linear-gradient(135deg, rgba(251,191,36,.18), rgba(245,158,11,.2))',
                color:'#fbbf24',
                fontWeight:900,
                fontSize:'.82rem',
                cursor:'pointer',
              }}
            >
              Duzenle
            </button>
          )}
        </div>

        <div style={{flex:1,overflowY:'auto',padding:'10px',display:'flex',flexDirection:'column',gap:7}}>
          {activeCart.length === 0 ? (
            <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',
              justifyContent:'center',color:'rgba(255,255,255,.2)',gap:10,padding:20}}>
              <div style={{fontSize:'2.5rem'}}><i className="fa-regular fa-clipboard" /></div>
              <div style={{fontWeight:700,fontSize:'.9rem'}}>
                {isMasaMode
                  ? (hasSelectedActiveTable ? 'Masa Hesabi Bos' : activeTableOptions.length > 0 ? 'Listeden Masa Secin' : 'Aktif Masa Yok')
                  : 'Adisyon Bo\u015f'}
              </div>
            </div>
          ) : activeCart.map(item => {
            const comboChildren = item.comboBundle?.displayLines || []
            const subParts = item.comboBundle
              ? []
              : [
                  item.portion?.name,
                  ...(item.options||[]).map(o=>o.name)
                ].filter(Boolean)
            const cartColors = pickButtonColors(item.prod)
            const cartImage = item.prod?.pos_image || item.prod?.image_url || null
            const canRemoveThisItem = !isMasaMode || canPosUserEditTableItem(item, activeStaff)

            return (
              <div key={item.id} style={{
                background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.06)',
                borderRadius:12,padding:'10px 12px'
              }}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
                  <div style={{display:'flex',gap:10,flex:1,paddingRight:8}}>
                    <div style={{
                      width:42,height:42,borderRadius:10,background:cartColors.bg,
                      display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,overflow:'hidden'
                    }}>
                      {cartImage
                        ? <img src={cartImage} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                        : <i className="fa-solid fa-utensils" style={{fontSize:'1rem',color:cartColors.text}}/>}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,color:'#fff',fontSize:'.88rem',lineHeight:1.3}}>
                        {item.prod?.name || item.name}
                      </div>
                      {!!comboChildren.length && (
                        <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
                          {comboChildren.map(line => (
                            <div key={line.id} style={{ fontSize: '.68rem', color: '#cbd5e1', lineHeight: 1.45, paddingLeft: 10 }}>
                              <div>{line.title}</div>
                              {line.subtitle && <div style={{ color: '#94a3b8' }}>{line.subtitle}</div>}
                            </div>
                          ))}
                        </div>
                      )}
                      {subParts.length > 0 && (
                        <div style={{fontSize:'.68rem',color:'#a5b4fc',marginTop:3,lineHeight:1.4}}>
                          {subParts.join(' - ')}
                        </div>
                      )}
                      {item.note && (
                        <div style={{fontSize:'.68rem',color:'#34d399',marginTop:4,lineHeight:1.4}}>
                          <i className="fa-regular fa-note-sticky" style={{marginRight:4}} />
                          {item.note}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{textAlign:'right',flexShrink:0}}>
                    <div style={{fontWeight:900,color:'#fbbf24',fontSize:'.95rem'}}>
                      {fmt(item.unitPrice * item.qty) + ' \u20BA'}
                    </div>
                    <div style={{fontSize:'.65rem',color:'#64748b'}}>
                      {fmt(item.unitPrice) + ' \u20BA / br'}
                    </div>
                  </div>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',
                  borderTop:'1px solid rgba(255,255,255,.05)',paddingTop:8,gap:8}}>
                  <div style={{display:'flex',alignItems:'center',gap:2}}>
                    <button className="touch-btn" onClick={() => setModal({ type:'item-note', itemId:item.id })}
                      style={{background:'none',border:'none',color:item.note ? '#34d399' : '#94a3b8',cursor:'pointer',
                        fontSize:'.78rem',padding:'8px 10px',minHeight:44,minWidth:44}}>
                      <i className="fa-regular fa-note-sticky" />
                    </button>
                    {!isMasaMode && !item.comboBundle && (item.portion || (item.options || []).length > 0) && (
                      <button className="touch-btn" onClick={() => setModal({ type:'edit-item', itemId:item.id })}
                        style={{background:'none',border:'none',color:'#60a5fa',cursor:'pointer',
                          fontSize:'.78rem',padding:'8px 10px',minHeight:44,minWidth:44}}>
                        <i className="fa-solid fa-pen-to-square" />
                      </button>
                    )}
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'44px 44px 44px',
                    background:'#fff',borderRadius:8,overflow:'hidden',
                    border:'1px solid rgba(148,163,184,.28)',boxShadow:'0 4px 12px rgba(15,23,42,.16)'}}>
                    <button
                      className="touch-btn"
                      onClick={() => canRemoveThisItem && updateQty(item.id, -1)}
                      disabled={!canRemoveThisItem}
                      title={canRemoveThisItem ? 'Azalt veya sil' : 'Bu urun POS tarafindan silinemez'}
                      style={{background:'transparent',border:'none',borderRight:'1px solid rgba(148,163,184,.35)',
                        color:canRemoveThisItem ? (item.qty <= 1 ? '#ef4444' : '#111827') : '#94a3b8',
                        cursor:canRemoveThisItem ? 'pointer' : 'not-allowed',
                        opacity: canRemoveThisItem ? 1 : 0.75,
                        width:44,height:40,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'.9rem',fontWeight:900}}>
                      {canRemoveThisItem
                        ? (item.qty <= 1 ? <i className="fa-regular fa-trash-can" /> : '\u2212')
                        : <i className="fa-solid fa-lock" />}
                    </button>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'center',
                      minWidth:44,height:40,fontWeight:900,color:'#111827',fontSize:'.98rem',
                      borderRight:'1px solid rgba(148,163,184,.35)'}}>
                      {item.qty}
                    </div>
                    <button className="touch-btn" onClick={() => updateQty(item.id, 1)}
                      style={{background:'transparent',border:'none',color:'#22c55e',cursor:'pointer',
                        width:44,height:40,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1rem',fontWeight:900}}>+</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{padding:'16px 18px',background:'#05082b',borderTop:'1px solid rgba(255,255,255,.05)'}}>
          {activeOrderNote && (
            <div style={{
              marginBottom:12,padding:'10px 12px',borderRadius:12,
              background:'rgba(16,185,129,.1)',border:'1px solid rgba(16,185,129,.2)',
              color:'#d1fae5',fontSize:'.76rem',lineHeight:1.45
            }}>
              <strong style={{display:'block',marginBottom:3}}>{UI_TEXT.orderNote}</strong>
              {activeOrderNote}
            </div>
          )}
          {/* Sipariş öncesi müşteri tanımlama bandı */}
          {preOrderLinkedCustomer ? (
            <div style={{
              marginBottom:10,display:'flex',alignItems:'center',justifyContent:'space-between',
              padding:'8px 12px',borderRadius:11,gap:8,
              background:'rgba(20,83,45,.26)',border:'1px solid rgba(34,197,94,.24)',
            }}>
              <div style={{minWidth:0}}>
                <div style={{fontSize:'.64rem',fontWeight:900,color:'#86efac',textTransform:'uppercase',letterSpacing:'.06em'}}>Müşteri</div>
                <div style={{fontWeight:800,color:'#d1fae5',fontSize:'.82rem',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {preOrderLinkedCustomer.customerName || 'Müşteri bağlı'}
                </div>
                <PreparedAdvantageRows preparedAdvantage={preOrderPreparedAdvantage} />
              </div>
              <div style={{display:'flex',gap:6,flexShrink:0}}>
                <button type="button" onClick={() => setShowPreOrderCustomerLink(true)}
                  style={{minHeight:32,padding:'0 9px',borderRadius:8,border:'1px solid rgba(34,197,94,.3)',background:'rgba(34,197,94,.1)',color:'#86efac',fontWeight:800,fontSize:'.7rem',cursor:'pointer'}}>
                  Değiştir
                </button>
                <button type="button" onClick={() => { setPreOrderLinkedCustomer(null); setManualCouponCode(''); }}
                  style={{width:32,height:32,borderRadius:8,border:'1px solid rgba(255,255,255,.1)',background:'rgba(255,255,255,.05)',color:'#94a3b8',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'.74rem'}}>
                  <i className="fa-solid fa-times" />
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setShowPreOrderCustomerLink(true)}
              style={{
                width:'100%',minHeight:38,marginBottom:10,borderRadius:11,
                border:'1px solid rgba(56,189,248,.2)',background:'rgba(56,189,248,.06)',
                color:'#7dd3fc',fontWeight:800,fontSize:'.76rem',cursor:'pointer',
                display:'flex',alignItems:'center',justifyContent:'center',gap:8,
              }}>
              <i className="fa-solid fa-user-tag" />
              {'Müşteri Tanı (Kampanya)'}
            </button>
          )}

          {/* Kupon Kodu Giriş Bandı */}
          <div style={{
            marginBottom: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            width: '100%'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              width: '100%'
            }}>
              <div style={{
                flex: 1,
                position: 'relative',
                display: 'flex',
                alignItems: 'center'
              }}>
                <i className="fa-solid fa-ticket" style={{
                  position: 'absolute',
                  left: 12,
                  color: manualCouponCode ? '#fbbf24' : 'rgba(255,255,255,.3)',
                  fontSize: '.85rem'
                }} />
                <input
                  type="text"
                  placeholder="Kupon Kodu Girin"
                  value={manualCouponCode}
                  onChange={(e) => setManualCouponCode(e.target.value.toUpperCase())}
                  style={{
                    width: '100%',
                    minHeight: 38,
                    padding: '0 12px 0 32px',
                    borderRadius: 11,
                    border: '1px solid rgba(255,255,255,.08)',
                    background: 'rgba(255,255,255,.04)',
                    color: '#f8fafc',
                    fontSize: '.78rem',
                    fontWeight: 700,
                    outline: 'none',
                    transition: 'all 0.15s ease',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'rgba(251,191,36,.4)';
                    e.target.style.background = 'rgba(255,255,255,.07)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'rgba(255,255,255,.08)';
                    e.target.style.background = 'rgba(255,255,255,.04)';
                  }}
                />
                {manualCouponCode && (
                  <button
                    type="button"
                    onClick={() => setManualCouponCode('')}
                    style={{
                      position: 'absolute',
                      right: 8,
                      background: 'transparent',
                      border: 'none',
                      color: 'rgba(255,255,255,.4)',
                      cursor: 'pointer',
                      fontSize: '.74rem'
                    }}
                  >
                    <i className="fa-solid fa-times" />
                  </button>
                )}
              </div>
            </div>
            {manualCouponCode && (
              <div style={{ paddingLeft: 6, fontSize: '.72rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                {matchedCouponOffer ? (
                  <span style={{ color: '#4ade80', fontWeight: 800 }}>
                    <i className="fa-solid fa-circle-check" /> Kupon uygulandı: {matchedCouponOffer.campaignName} (-{fmt(matchedCouponOffer.discountAmount)} ₺)
                  </span>
                ) : (
                  <span style={{ color: '#f87171', fontWeight: 700 }}>
                    <i className="fa-solid fa-circle-exclamation" /> Kupon doğrulanıyor veya koşullar uymuyor...
                  </span>
                )}
              </div>
            )}
          </div>

          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginBottom:14}}>
            <span style={{color:'#a5b4fc',fontWeight:700,fontSize:'.8rem',
              textTransform:'uppercase',letterSpacing:'.08em'}}>Toplam</span>
            <div style={{lineHeight:1}}>
              <span style={{fontSize:'1rem',color:'#fbbf24',fontWeight:700}}>{'\u20BA'}</span>
              <span style={{fontSize:'1.7rem',fontWeight:900,color:'#fbbf24'}}>{fmt(cartTotal)}</span>
            </div>
          </div>
          <div style={{display:'flex',alignItems:'stretch',gap:10}}>
            <button
              onClick={() => !isMasaMode && activeCart.length > 0 && setModal({ type:'clear-order' })}
              disabled={isMasaMode || activeCart.length === 0}
              style={{
                width:52,borderRadius:12,border:'1px solid rgba(239,68,68,.28)',
                background:!isMasaMode && activeCart.length > 0 ? 'rgba(239,68,68,.12)' : 'rgba(255,255,255,.08)',
                color:!isMasaMode && activeCart.length > 0 ? '#f87171' : 'rgba(248,113,113,.35)',
                fontWeight:900,fontSize:'1rem',cursor:!isMasaMode && activeCart.length > 0 ? 'pointer' : 'not-allowed',
                display:'flex',alignItems:'center',justifyContent:'center',transition:'.15s'
              }}>
              <i className="fa-regular fa-trash-can" />
            </button>
            <button
              onClick={() => {
                if (!activeStaff) {
                  triggerPinLogin?.()
                  return
                }
                if (activeCart.length > 0) {
                  setModal({ type:'odeme', cartSnapshot: activeCart.map(item => ({ ...item })) })
                }
              }}
              disabled={activeCart.length === 0}
              style={{
                flex:1,padding:'12px 10px',borderRadius:12,border:'none',
                background:activeCart.length>0?'linear-gradient(135deg,#f59e0b,#fbbf24)':'rgba(255,255,255,.08)',
                color:activeCart.length>0?'#0f172a':'rgba(255,255,255,.3)',
                fontWeight:900,fontSize:'.88rem',cursor:activeCart.length>0?'pointer':'not-allowed',
                display:'flex',alignItems:'center',justifyContent:'center',gap:8,
                textTransform:'uppercase',letterSpacing:'.03em',transition:'.15s',whiteSpace:'nowrap'
              }}>
              {'Sipari\u015fi Tamamla'}
            </button>
          </div>
        </div>
        </div>
      )}

      <div style={{flex:1,display:'flex',flexDirection:'column',padding:'18px 20px',
        background:'radial-gradient(ellipse at top right, rgba(99,102,241,.06) 0%, transparent 60%)',
        overflow:'hidden'}}>


        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18,gap:12}}>

          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{fontSize:'1.4rem',fontWeight:900,color:'#fff'}}>
              {isTableLayoutView ? 'Masalar' : activeSpecialView === 'orders' ? 'Siparisler' : 'Men\u00fc'}
            </div>
            <button className="touch-btn" onClick={() => setModal({ type:'stock-out' })} style={{
              minHeight:38,padding:'0 14px',borderRadius:99,border:'1px solid rgba(255,255,255,.12)',
              background:'rgba(255,255,255,.05)',color:'#cbd5e1',fontWeight:800,fontSize:'.74rem',cursor:'pointer',
              display:'flex',alignItems:'center',gap:8
            }}>
              <i className="fa-solid fa-ban" />
              {UI_TEXT.stockOutList}
            </button>
          </div>

          <div style={{display:'flex',alignItems:'center',gap:10}}>

            <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
              <div style={{
                display:'grid',
                gridTemplateColumns:'repeat(2, minmax(0, 1fr))',
                minWidth:212,
                borderRadius:999,
                border:'1px solid rgba(255,255,255,.15)',
                background:'rgba(255,255,255,.04)',
                padding:4,
              }}>
                {[quickSaleChannel, pickupChannel].filter(Boolean).map(channel => {
                  const active = activeChannel === channel.id
                  return (
                    <button
                      className="touch-btn"
                      key={channel.id}
                    onClick={() => {
                      setActiveChannel(channel.id)
                      setShowTableLayout(false)
                      setActiveSpecialView(null)
                    }}
                      style={{
                        minHeight:46,
                        minWidth:100,
                        padding:'8px 12px',
                        borderRadius:999,
                        border:'none',
                        background:active ? 'rgba(251,191,36,.16)' : 'transparent',
                        color:active ? '#fbbf24' : '#94a3b8',
                        fontWeight:900,
                        fontSize:'.78rem',
                        cursor:'pointer',
                        transition:'.15s',
                        boxShadow:active ? '0 10px 24px rgba(251,191,36,.12)' : 'none',
                      }}
                    >
                      {channel.name}
                    </button>
                  )
                })}
              </div>

              {masaSalesChannel && (
                <button
                  className="touch-btn"
                  onClick={() => {
                    setActiveChannel(masaSalesChannel.id)
                    setShowTableLayout(true)
                    setActiveSpecialView(null)
                  }}
                  style={{
                    minHeight:46,
                    minWidth:112,
                    padding:'8px 18px',
                    borderRadius:999,
                    border:`1px solid ${activeChannel===masaSalesChannel.id?'#fbbf24':'rgba(255,255,255,.15)'}`,
                    background:activeChannel===masaSalesChannel.id?'rgba(251,191,36,.15)':'transparent',
                    color:activeChannel===masaSalesChannel.id?'#fbbf24':'#94a3b8',
                    fontWeight:900,
                    fontSize:'.82rem',
                    cursor:'pointer',
                    transition:'.15s',
                    whiteSpace:'nowrap',
                  }}
                >
                  {masaSalesChannel.name}
                </button>
              )}

              <button
                className="touch-btn"
                onClick={() => {
                  setShowTableLayout(false)
                  setSearchQ('')
                  setActiveMainCat(null)
                  setActiveSubCat(null)
                  setActiveSpecialView('orders')
                }}
                style={{
                  minHeight:46,
                  minWidth:128,
                  padding:'8px 18px',
                  borderRadius:999,
                  border:`1px solid ${activeSpecialView === 'orders' ? '#fbbf24' : 'rgba(245,158,11,.26)'}`,
                  background:activeSpecialView === 'orders' ? 'rgba(251,191,36,.15)' : 'rgba(245,158,11,.08)',
                  color:activeSpecialView === 'orders' ? '#fbbf24' : '#fde68a',
                  fontWeight:900,
                  fontSize:'.82rem',
                  cursor:'pointer',
                  transition:'.15s',
                  whiteSpace:'nowrap',
                }}
              >
                Siparişler
              </button>
            </div>

            <button className="touch-btn" onClick={handleOpenGarsonScreen} style={{
              minHeight:44,padding:'8px 16px',borderRadius:99,border:'1px solid rgba(96,165,250,.3)',
              background:'rgba(96,165,250,.12)',color:'#bfdbfe',fontWeight:800,fontSize:'.78rem',
              cursor:'pointer',transition:'.15s',display:'flex',alignItems:'center',gap:8,whiteSpace:'nowrap'
            }}>
              <i className="fa-solid fa-user-tie" />
              {'Garson Ekrani'}
            </button>

            {!isTableLayoutView && activeSpecialView !== 'orders' && (
              <button className="touch-btn" onClick={() => setShowPrices(v => !v)} style={{
              minHeight:44,padding:'8px 14px',borderRadius:99,border:'1px solid rgba(255,255,255,.15)',
              background:showPrices ? 'rgba(16,185,129,.12)' : 'rgba(255,255,255,.06)',
              color:showPrices ? '#34d399' : '#cbd5e1',fontWeight:800,fontSize:'.76rem',
              cursor:'pointer',transition:'.15s',whiteSpace:'nowrap'
            }}>
              {showPrices ? 'Fiyatlar\u0131 Gizle' : 'Fiyatlar\u0131 G\u00f6ster'}
              </button>
            )}

            {!isTableLayoutView && activeSpecialView !== 'orders' && (
              <div style={{position:'relative'}}>
              <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',
                color:'rgba(255,255,255,.3)',fontSize:'.8rem'}}><i className="fa-solid fa-magnifying-glass" /></span>
              <input value={searchQ} onChange={e=>{
                const nextValue = e.target.value
                setSearchQ(nextValue)
                if (nextValue) {
                  setActiveMainCat(null)
                  setActiveSubCat(null)
                } else if (renderedMainCategories.length) {
                  handleMainCategoryClick(renderedMainCategories[0].id)
                }
              }}
                placeholder={UI_TEXT.searchPlaceholder}
                style={{background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.12)',
                  borderRadius:10,padding:'8px 12px 8px 32px',color:'#fff',fontSize:'.85rem',
                  width:180,outline:'none'}}/>
              </div>
            )}

          </div>
        </div>

        {/* Kategoriler */}
        {!searchQ && !isTableLayoutView && activeSpecialView !== 'orders' && (
          <div style={{display:'flex',flexDirection:'column',gap:10,paddingBottom:14,flexShrink:0}}>

            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(120px, 1fr))',gap:8}}>
              <button className="touch-btn touch-card" onClick={() => {
                setActiveSpecialView('favorites')
                setSearchQ('')
                setActiveMainCat(null)
                setActiveSubCat(null)
              }} style={{
                minHeight:58,padding:'10px 14px',borderRadius:14,
                border:`1.5px solid ${activeSpecialView === 'favorites' ? '#fbbf24' : 'rgba(255,255,255,.08)'}`,
                background:activeSpecialView === 'favorites' ? 'rgba(251,191,36,.15)' : 'rgba(255,255,255,.04)',
                color:activeSpecialView === 'favorites' ? '#fbbf24' : '#cbd5e1',
                fontWeight:800,fontSize:'.84rem',cursor:'pointer',transition:'.15s',textAlign:'center'
              }}>
                <i className="fa-solid fa-star" style={{marginRight:6}} />
              {UI_TEXT.favorites}
              </button>
              <button className="touch-btn touch-card" onClick={() => {
                setActiveSpecialView('campaigns')
                setSearchQ('')
                setActiveMainCat(null)
                setActiveSubCat(null)
              }} style={{
                minHeight:58,padding:'10px 14px',borderRadius:14,
                border:`1.5px solid ${activeSpecialView === 'campaigns' ? '#38bdf8' : 'rgba(255,255,255,.08)'}`,
                background:activeSpecialView === 'campaigns' ? 'rgba(56,189,248,.14)' : 'rgba(255,255,255,.04)',
                color:activeSpecialView === 'campaigns' ? '#7dd3fc' : '#cbd5e1',
                fontWeight:800,fontSize:'.84rem',cursor:'pointer',transition:'.15s',textAlign:'center'
              }}>
                <i className="fa-solid fa-badge-percent" style={{marginRight:6}} />
                {UI_TEXT.loyaltyCampaigns}
                {visibleLoyaltyCampaigns.length > 0 ? ` (${visibleLoyaltyCampaigns.length})` : ''}
              </button>
              {renderedMainCategories.map(cat => {
                const isActive = isCategoryNavigationActive && activeMainCat === cat.id
                return (
                  <button className="touch-btn touch-card" key={cat.id} onClick={() => handleMainCategoryClick(cat.id)} style={{
                    minHeight:58,padding:'10px 14px',borderRadius:14,
                    border:`1.5px solid ${isActive ? (cat.text_color || '#fbbf24') : 'rgba(255,255,255,.08)'}`,
                    background:isActive ? (cat.bg || '#fbbf24') : 'rgba(255,255,255,.04)',
                    color:isActive ? (cat.text_color || '#0f172a') : '#cbd5e1',
                    fontWeight:isActive ? 800 : 700,fontSize:'.84rem',
                    cursor:'pointer',transition:'.15s',textAlign:'center'
                  }}>
                    {cat.name}
                  </button>
                )
              })}
            </div>

            {isCategoryNavigationActive && subCategories.length > 0 && (
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(110px, 1fr))',gap:8}}>
                {subCategories.map(cat => {
                  const isActive = isCategoryNavigationActive && activeSubCat === cat.id
                  return (
                    <button className="touch-btn touch-card" key={cat.id} onClick={() => handleSubCategoryClick(cat.id)} style={{
                      minHeight:54,padding:'10px 12px',borderRadius:12,
                      border:`1.5px solid ${isActive ? (cat.text_color || '#fbbf24') : 'rgba(255,255,255,.08)'}`,
                      background:isActive ? (cat.bg || 'rgba(255,255,255,.12)') : 'rgba(255,255,255,.03)',
                      color:isActive ? (cat.text_color || '#0f172a') : '#a5b4fc',
                      fontWeight:isActive ? 800 : 600,fontSize:'.8rem',
                      cursor:'pointer',transition:'.15s',textAlign:'center'
                    }}>
                      {cat.name}
                    </button>
                  )
                })}
              </div>
            )}

            {activeSpecialView === 'favorites' && (
              <div style={{display:'flex',justifyContent:'flex-end',gap:10}}>
                <button className="touch-btn" onClick={() => setFavoriteEditMode(v => !v)} style={{
                  minHeight:44,minWidth:44,padding:'0 16px',borderRadius:12,border:'1px solid rgba(255,255,255,.12)',
                  background:favoriteEditMode ? 'rgba(251,191,36,.14)' : 'rgba(255,255,255,.04)',
                  color:favoriteEditMode ? '#fbbf24' : '#cbd5e1',fontWeight:800,cursor:'pointer'
                }}>
                  {favoriteEditMode ? 'D\u00fczenleme Bitti' : 'Favorileri D\u00fczenle'}
                </button>
                <button className="touch-btn" onClick={() => setModal({ type:'favorite-picker' })} style={{
                  minHeight:44,minWidth:44,padding:'0 16px',borderRadius:12,border:'1px solid rgba(255,255,255,.12)',
                  background:'rgba(255,255,255,.04)',color:'#cbd5e1',fontWeight:800,cursor:'pointer'
                }}>
                  + {UI_TEXT.addFavorite}
                </button>
              </div>
            )}
          </div>
        )}


        {isTableLayoutView ? (
          <div style={{ flex:1, minHeight:0, paddingBottom:20 }}>
            <div style={{
              width:'100%',
              height:'100%',
              minHeight:0,
              borderRadius:24,
              padding:14,
              background:'rgba(4,8,28,.44)',
              border:'1px solid rgba(148,163,184,.12)',
              overflowY:'auto',
              display:'grid',
              alignContent:'start',
              gap:14,
            }}>
              <PosTableLayoutFromCatalog
                tableCatalog={tableCatalog}
                tableCatalogLoading={tableCatalogLoading}
                occupiedTableKeys={Object.keys(branchTableTickets)}
                coverCountByTable={Object.fromEntries(
                  Object.entries(branchTableTickets).map(([key, ticket]) => [key, getGuestCoverCount(ticket?.guestCounts)])
                )}
                currentTableKey={currentTableKey}
                onSelectTable={(selection) => {
                  const nextTableKey = typeof selection === 'string'
                    ? selection
                    : (selection?.tableKey || '')
                  const nextMasaNo = typeof selection === 'string'
                    ? selection
                    : (selection?.masaNo || selection?.label || '')
                  setSelectedTableKey(nextTableKey)
                  setMasaNo(nextMasaNo)
                }}
              />
            </div>
          </div>
        ) : activeSpecialView === 'orders' ? (
          <div style={{ flex:1, minHeight:0, paddingBottom:20 }}>
            <div style={{
              width:'100%',
              height:'100%',
              minHeight:0,
              borderRadius:24,
              padding:14,
              background:'rgba(4,8,28,.44)',
              border:'1px solid rgba(148,163,184,.12)',
              overflow:'hidden',
            }}>
              <PosOrderHubPanel
                branchId={selectedBranchContext?.branchId || resolvedBranchId || ''}
                branchName={selectedBranchContext?.branchName || visibleBranchName || ''}
              />
            </div>
          </div>
        ) : activeSpecialView === 'campaigns' ? (
          <div style={{ flex:1, minHeight:0, paddingBottom:20 }}>
            <div style={{
              width:'100%',
              height:'100%',
              minHeight:0,
              borderRadius:24,
              padding:14,
              background:'rgba(4,8,28,.44)',
              border:'1px solid rgba(148,163,184,.12)',
              overflowY:'auto',
              display:'grid',
              alignContent:'start',
              gap:14,
            }}>
              <div style={{
                display:'flex',
                justifyContent:'space-between',
                alignItems:'flex-start',
                gap:14,
                padding:'14px 16px',
                borderRadius:18,
                border:'1px solid rgba(56,189,248,.18)',
                background:'rgba(8,47,73,.26)',
              }}>
                <div style={{ display:'grid', gap:6 }}>
                  <div style={{ color:'#f8fafc', fontWeight:900, fontSize:'1rem' }}>Aktif Loyalty Kampanyalari</div>
                  <div style={{ color:'#bae6fd', fontSize:'.8rem', lineHeight:1.55 }}>
                    {runtimeLoyaltyChannelLabel} kanalinda gecerli kampanyalar. Mevcut sepet toplami {fmt(cartTotal)}{UI_TEXT.tlSuffix}.
                  </div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:8, minWidth:120 }}>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ color:'#7dd3fc', fontWeight:900, fontSize:'1.3rem' }}>{visibleLoyaltyCampaigns.length}</div>
                    <div style={{ color:'#94a3b8', fontSize:'.74rem', textTransform:'uppercase', letterSpacing:'.08em' }}>Aktif Kayit</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadLoyaltyCampaigns({ background: false, preferFresh: true })}
                    disabled={loyaltyCampaignLoading}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(56,189,248,.3)',
                      background: 'rgba(56,189,248,.1)',
                      color: '#7dd3fc',
                      fontSize: '0.74rem',
                      fontWeight: '800',
                      cursor: loyaltyCampaignLoading ? 'default' : 'pointer',
                      transition: 'all 0.2s ease',
                      outline: 'none',
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={(e) => {
                      if (loyaltyCampaignLoading) return;
                      e.currentTarget.style.background = 'rgba(56,189,248,.2)';
                      e.currentTarget.style.borderColor = '#38bdf8';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(56,189,248,.1)';
                      e.currentTarget.style.borderColor = 'rgba(56,189,248,.3)';
                    }}
                  >
                    <i className={`fa-solid fa-rotate${loyaltyCampaignLoading ? ' fa-spin' : ''}`} />
                    {loyaltyCampaignLoading ? 'Guncelleniyor...' : 'Guncelle'}
                  </button>
                </div>
              </div>

              <LoyaltyCampaignCatalog
                campaigns={visibleLoyaltyCampaigns}
                loading={loyaltyCampaignLoading}
                errorText={loyaltyCampaignError}
                emptyText={`${runtimeLoyaltyChannelLabel} kanalinda aktif loyalty kampanyasi bulunamadi.`}
                onManualTriggerToggle={handleManualTriggerToggle}
              />
            </div>
          </div>
        ) : (
        <div style={{
          flex:1,overflowY:'auto',scrollbarWidth:'none',
          display:'grid',
          gridTemplateColumns:'repeat(auto-fill, 124px)',
          gridAutoRows:'148px',
          gap:10,alignContent:'start',justifyContent:'start',paddingBottom:20,paddingRight:4
        }}>
          {catalogLoading || !activeChannel ? (
            <div style={{gridColumn:'1/-1',textAlign:'center',padding:'60px 20px',
              color:'rgba(255,255,255,.45)',fontWeight:700}}>
              {!activeChannel ? 'Satis kanali baglaniyor...' : 'Urun katalogu arka planda yukleniyor...'}
            </div>
          ) : filteredProds.length === 0 ? (
            <div style={{gridColumn:'1/-1',textAlign:'center',padding:'60px 20px',
              color:'rgba(255,255,255,.2)',fontWeight:700}}>
              {searchQ ? UI_TEXT.noSearchResult : UI_TEXT.noProductsInCategory}
            </div>
          ) : filteredProds.map(prod => {
            const price  = getProdPrice(prod)
            const hasopts = parseJ(prod.portions,[]).length > 0 ||
              parseJ(prod.option_groups,[]).some(g=>(g.options||[]).length>0)
            const colors = pickButtonColors(prod)
            const productImage = prod.pos_image || prod.image_url || null
            const productLabel = prod.short_name || prod.name
            const favoriteIndex = filteredProds.findIndex(item => item.id === prod.id)
            const canMoveUp = activeSpecialView === 'favorites' && favoriteEditMode && favoriteIndex > 0
            const canMoveDown = activeSpecialView === 'favorites' && favoriteEditMode && favoriteIndex < filteredProds.length - 1

            return (
              <button className="touch-btn touch-card" key={prod.id} onClick={() => handleProdClick(prod)} style={{
                background:productImage ? '#0b123f' : colors.bg,
                border:`1px solid ${colors.text}22`,
                borderRadius:18,padding:0,
                cursor:'pointer',display:'flex',flexDirection:'column',
                alignItems:'stretch',justifyContent:'space-between',
                minHeight:148,height:148,position:'relative',overflow:'hidden',
                transition:'all .15s',textAlign:'center',
                boxShadow:`inset 0 0 0 1px ${colors.text}10`
              }}
              onMouseEnter={e=>{
                e.currentTarget.style.filter='brightness(1.05)'
                e.currentTarget.style.borderColor=colors.text
                e.currentTarget.style.transform='translateY(-2px)'
              }}
              onMouseLeave={e=>{
                e.currentTarget.style.filter='brightness(1)'
                e.currentTarget.style.borderColor=`${colors.text}22`
                e.currentTarget.style.transform='translateY(0)'
              }}>
                {activeSpecialView === 'favorites' && favoriteEditMode && (
                  <div style={{position:'absolute',top:10,left:10,zIndex:3,display:'flex',flexDirection:'column',gap:6}}>
                    <button className="touch-btn" onClick={e => { e.stopPropagation(); moveFavoriteProduct(prod.id, -1) }} disabled={!canMoveUp} style={{
                      width:28,height:28,borderRadius:99,border:'none',
                      background:canMoveUp ? 'rgba(15,23,42,.72)' : 'rgba(15,23,42,.28)',
                      color:canMoveUp ? '#fff' : 'rgba(255,255,255,.35)',cursor:canMoveUp ? 'pointer' : 'not-allowed',
                      display:'flex',alignItems:'center',justifyContent:'center'
                    }}>
                      <i className="fa-solid fa-chevron-up" style={{fontSize:'.72rem'}} />
                    </button>
                    <button className="touch-btn" onClick={e => { e.stopPropagation(); moveFavoriteProduct(prod.id, 1) }} disabled={!canMoveDown} style={{
                      width:28,height:28,borderRadius:99,border:'none',
                      background:canMoveDown ? 'rgba(15,23,42,.72)' : 'rgba(15,23,42,.28)',
                      color:canMoveDown ? '#fff' : 'rgba(255,255,255,.35)',cursor:canMoveDown ? 'pointer' : 'not-allowed',
                      display:'flex',alignItems:'center',justifyContent:'center'
                    }}>
                      <i className="fa-solid fa-chevron-down" style={{fontSize:'.72rem'}} />
                    </button>
                  </div>
                )}
                {hasopts && (
                  <div style={{position:'absolute',top:10,right:10,width:28,height:28,
                    background:'rgba(255,255,255,.22)',backdropFilter:'blur(6px)',borderRadius:99,
                    color:'#fff',fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',
                    boxShadow:'0 4px 10px rgba(0,0,0,.18)',zIndex:2}}>
                    <i className="fa-solid fa-gear" style={{fontSize:'.75rem'}}/>
                  </div>
                )}
                <div style={{
                  flex:1,position:'relative',display:'flex',alignItems:'center',justifyContent:'center',
                  padding:productImage ? 0 : '10px 10px'
                }}>
                  {productImage ? (
                    <>
                      <img src={productImage} alt="" style={{
                        width:'100%',height:'100%',objectFit:'cover',display:'block'
                      }}/>
                      <div style={{
                        position:'absolute',inset:0,
                        background:'linear-gradient(180deg, rgba(7,12,45,0) 0%, rgba(7,12,45,.06) 58%, rgba(7,12,45,.22) 100%)'
                      }}/>
                      <div style={{
                        position:'absolute',left:0,right:0,bottom:0,
                        padding:'8px 8px 10px',
                        background:'linear-gradient(180deg, rgba(7,12,45,0) 0%, rgba(7,12,45,.42) 34%, rgba(7,12,45,.82) 100%)',
                        color:colors.text,display:'flex',flexDirection:'column',justifyContent:'flex-end',gap:2
                      }}>
                        <div style={{fontWeight:800,fontSize:'.76rem',
                          lineHeight:1.15,maxWidth:'100%',overflow:'hidden',
                          textOverflow:'ellipsis',display:'-webkit-box',
                          WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>
                          {productLabel}
                        </div>
                        {showPrices && (
                          <div style={{fontWeight:900,fontSize:'.82rem'}}>
                            {price !== null ? (fmt(price) + UI_TEXT.tlSuffix) : (hasopts ? UI_TEXT.priced : UI_TEXT.dash)}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div style={{
                      width:'100%',height:'100%',
                      color:colors.text,padding:'0 10px',
                      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:6
                    }}>
                      <div style={{fontWeight:800,fontSize:'.9rem',lineHeight:1.18,
                        maxWidth:'100%',overflow:'hidden',textOverflow:'ellipsis',
                        display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical'}}>
                        {productLabel}
                      </div>
                      {showPrices && (
                        <div style={{fontWeight:900,fontSize:'.88rem'}}>
                          {price !== null ? (fmt(price) + UI_TEXT.tlSuffix) : (hasopts ? UI_TEXT.priced : UI_TEXT.dash)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
        )}
      </div>


      {modal?.type === 'opts' && (
        <OptionsModalSafe
          item={modal.item}
          channelId={activeChannel}
          onConfirm={({portion, options, unitPrice}) => {
            addToCart(modal.item, portion, options, unitPrice)
            setModal(null)
          }}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.type === 'combo' && (
        <ComboBuilderModal
          comboProduct={modal.item}
          comboDefinition={modal.comboDefinition}
          saleItems={products}
          optionGroupDefs={optionGroupDefs}
          channelId={activeChannel}
          onConfirm={({ unitPrice, comboBundle, cartKeySuffix }) => {
            addComboToCart(modal.item, comboBundle, unitPrice, cartKeySuffix)
            setModal(null)
          }}
          onClose={() => setModal(null)}
        />
      )}

      {editingCartItem && (
        <OptionsModalSafe
          item={editingCartItem.prod}
          channelId={activeChannel}
          initialPortionId={editingCartItem.portion?.id || null}
          initialOptions={editingCartItem.options || []}
          confirmLabel={UI_TEXT.editCartItem}
          onConfirm={({ portion, options, unitPrice }) => {
            const nextCartKey = `${editingCartItem.prod.id}_${portion?.id || ''}_${(options || []).map(o => o.name).sort().join(',')}`
            const applyEdit = prev => {
              const existingMatch = prev.find(item => item.id !== editingCartItem.id && item.cartKey === nextCartKey)

              if (existingMatch) {
                return prev
                  .filter(item => item.id !== editingCartItem.id)
                  .map(item => item.id === existingMatch.id
                    ? {
                        ...item,
                        qty: item.qty + editingCartItem.qty,
                        note: item.note || editingCartItem.note || '',
                      }
                    : item)
              }

              return prev.map(item => item.id === editingCartItem.id
                ? { ...item, portion, options, unitPrice, cartKey: nextCartKey }
                : item)
            }

            if (isMasaMode) {
              updateCurrentTableTicket(ticket => ({
                ...ticket,
                cart: applyEdit(ticket.cart),
              }))
            } else {
              setCart(prev => applyEdit(prev))
            }
            setModal(null)
            showToast(UI_TEXT.itemUpdated, '#10b981')
          }}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.type === 'odeme' && (
        <OdemeModalFlow
          cart={modal.cartSnapshot || activeCart}
          orderNote={activeOrderNote}
          masaNo={activeSaleTableRef}
          channelName={activeChannelName}
          branchId={selectedBranchContext?.branchId || ''}
          branchName={selectedBranchContext?.branchName || ''}
          registerNo="1"
          registerLabel="POS 1"
          loyaltyCampaigns={loyaltyCampaignCatalog}
          manuallyTriggeredCampaignIds={manualTriggeredCampaignIds}
          runtimeLoyaltyChannel={runtimeLoyaltyChannel}
          externalLinkedCustomer={preOrderLinkedCustomer}
          saleTemplates={saleTemplates}
          onConfirm={completeSaleGroup}
          onSaveDebt={saveDebtSaleGroup}
          onOpenCustomers={() => navigate('/musteriler')}
          onClose={() => setModal(null)}
          manualCouponCode={manualCouponCode}
          selectedLoyaltyProgramId={selectedLoyaltyProgramId}
        />
      )}

      <PosCustomerLinkModal
        open={showPreOrderCustomerLink}
        branchId={selectedBranchContext?.branchId || ''}
        branchName={selectedBranchContext?.branchName || ''}
        registerNo="1"
        registerLabel="POS 1"
        linkedCustomer={preOrderLinkedCustomer}
        onCustomerLinked={customer => {
          setPreOrderLinkedCustomer(customer)
          setShowPreOrderCustomerLink(false)
        }}
        onClearCustomer={() => setPreOrderLinkedCustomer(null)}
        onClose={() => setShowPreOrderCustomerLink(false)}
      />

      {noteCartItem && (
        <NoteModalSafe
          title={`${UI_TEXT.itemNote}: ${noteCartItem.prod.name}`}
          initialValue={noteCartItem.note || ''}
          placeholder="Bu \u00fcr\u00fcn i\u00e7in \u00f6zel not yaz\u0131n"
          onConfirm={(value) => {
            updateCartItem(noteCartItem.id, { note: value })
            setModal(null)
            showToast(UI_TEXT.noteSaved, '#10b981')
          }}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.type === 'order-note' && (
        <NoteModalSafe
          title={UI_TEXT.orderNote}
          initialValue={activeOrderNote}
          placeholder="T\u00fcm sipari\u015f i\u00e7in not yaz\u0131n"
          onConfirm={(value) => {
            setActiveOrderNoteValue(value)
            setModal(null)
            showToast(UI_TEXT.noteSaved, '#10b981')
          }}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.type === 'clear-order' && (
        <ClearOrderModalSafe
          onConfirm={clearOrderWithReason}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.type === 'move-table' && (
        <MoveToTableModalSafe
          tableOptions={emptyTableOptions}
          onConfirm={moveQuickSaleToTable}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.type === 'stock-out' && (
        <InfoModalSafe
          title={UI_TEXT.stockOutList}
          message={UI_TEXT.featurePending}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.type === 'favorite-picker' && (
        <FavoriteProductsModal
          title={UI_TEXT.addFavorite}
          products={normalizedProducts}
          selectedIds={Array.from(effectiveFavoriteIds)}
          onToggle={toggleFavoriteProduct}
          onClose={() => setModal(null)}
        />
      )}

      {activeWarningOffer && (
        <InfoModalSafe
          title={activeWarningOffer.campaignName || "Kampanya Uyarısı"}
          message={
            <div>
              <div style={{ marginBottom: 12 }}>{activeWarningOffer.warningMessage}</div>
              {activeWarningOffer.customerOffer && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12, color: '#f59e0b', fontWeight: 'bold' }}>
                  <strong>Müşteriye Sunulacak Teklif:</strong> {activeWarningOffer.customerOffer}
                </div>
              )}
            </div>
          }
          onClose={() => {
            setAcknowledgedWarningCampaignIds(prev => {
              const next = new Set(prev)
              next.add(String(activeWarningOffer.campaignId))
              return next
            })
          }}
        />
      )}

      {loading && (
        <div style={{
          position:'fixed',
          inset:0,
          zIndex:150,
          background:'rgba(2,6,23,.56)',
          backdropFilter:'blur(3px)',
          display:'flex',
          alignItems:'center',
          justifyContent:'center',
          padding:24,
        }}>
          <div style={{
            width:'min(440px, 92vw)',
            borderRadius:24,
            border:'1px solid rgba(148,163,184,.22)',
            background:'linear-gradient(180deg, rgba(15,23,42,.96), rgba(15,23,42,.88))',
            boxShadow:'0 24px 80px rgba(2,6,23,.55)',
            padding:'28px 26px',
            display:'grid',
            gap:18,
            textAlign:'center',
          }}>
            <div style={{display:'grid',gap:8}}>
              <div style={{fontSize:'.82rem',fontWeight:900,letterSpacing:'.08em',textTransform:'uppercase',color:'#93c5fd'}}>
                {visibleBranchName}
              </div>
              <div style={{fontSize:'1.5rem',fontWeight:900,color:'#fff'}}>
                {'POS verileri hazirlaniyor'}
              </div>
              <div style={{color:'#94a3b8',fontSize:'.96rem'}}>
                {loadingStage}
              </div>
            </div>

            <div style={{display:'grid',gap:10}}>
              <div style={{
                height:14,
                borderRadius:999,
                overflow:'hidden',
                background:'rgba(255,255,255,.08)',
                border:'1px solid rgba(255,255,255,.08)',
              }}>
                <div style={{
                  height:'100%',
                  width:`${Math.max(4, loadingProgress)}%`,
                  borderRadius:999,
                  background:'linear-gradient(90deg,#f59e0b,#fbbf24)',
                  boxShadow:'0 0 24px rgba(251,191,36,.35)',
                  transition:'width .35s ease',
                }} />
              </div>
              <div style={{fontSize:'2.2rem',fontWeight:900,color:'#fbbf24',fontVariantNumeric:'tabular-nums'}}>
                {`%${Math.max(1, loadingProgress)}`}
              </div>
            </div>
          </div>
        </div>
      )}

      {!loading && !selectedBranchContext && branchContexts.length > 0 && !branchLocked && (
        <BranchSelectModal
          branches={branchContexts}
          selectedId={selectedBranchId}
          onSelect={branchId => setSelectedBranchId(branchId)}
        />
      )}

      <style>{`
        *{box-sizing:border-box}
        ::-webkit-scrollbar{display:none}
        @keyframes slideIn{from{transform:translateX(20px);opacity:0}to{transform:translateX(0);opacity:1}}
        .hide-scrollbar{-ms-overflow-style:none;scrollbar-width:none}
        .hide-scrollbar::-webkit-scrollbar{display:none}
        .touch-btn{
          touch-action:manipulation;
          -webkit-tap-highlight-color:transparent;
        }
        .touch-card{
          will-change:transform,filter;
        }
        .touch-btn:active,.touch-card:active{
          transform:scale(.98);
          filter:brightness(.96);
        }
        @media (pointer: coarse){
          .touch-modal{max-width:min(560px,96vw)}
        }
      `}</style>
    </div>
  )
}

export default function POS() {
  const { branchId, branchName } = useWorkspace()

  return (
    <POSRuntimeBoundary>
      <StaffPinGate
        storageKey={POS_STAFF_SESSION_KEY}
        branchId={branchId || ''}
        branchName={branchName || ''}
        title="POS Personel Girisi"
        subtitle="Urun eklemek icin personel PIN'i ile giris yapin."
      >
        {(activeStaff, helpers) => (
          <UnifiedPosStaffScreen
            mode="pos"
            activeStaff={activeStaff}
            onStaffLogout={helpers?.logout}
            showGarsonSwitch
            renderPos={sharedProps => (
              <POSInner
                forcedActiveStaff={sharedProps.activeStaff}
                onStaffLogout={sharedProps.onStaffLogout}
                triggerPinLogin={helpers?.triggerPinLogin}
              />
            )}
          />
        )}
      </StaffPinGate>
    </POSRuntimeBoundary>
  )
}
