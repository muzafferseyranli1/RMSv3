import { useCallback, useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useAuth } from '@/context/AuthContext'
import { db } from '@/lib/db'
import { useToast } from '@/hooks/useToast'
import { logActivity } from '@/lib/activityLogger'
import {
  ORDER_STATUS_META,
  asUuidOrNull,
  branchMatchesRecord,
  findBranchById,
  formatDate,
  formatDateTime,
  formatMoney,
  formatQty,
  getAllBranches,
  getFlowDates,
  getOrderWarnings,
  parseJsonValue,
  summarizeLines,
} from '@/lib/branchPurchasing'

const ALL_FILTER_KEY = '__all__'

const STATUS_FILTERS = [
  { key: 'all', label: 'Tum siparisler' },
  { key: 'approval', label: 'Onay bekliyor' },
  { key: 'submitted', label: 'Tedarikciye gitti' },
  { key: 'in_transit', label: 'Yolda' },
  { key: 'receiving', label: 'Mal kabulde' },
  { key: 'delivered', label: 'Teslim edildi' },
]

const MANAGER_STATUS_META = {
  approval: { label: 'Onay bekliyor', color: '#92400e', bg: '#fef3c7' },
  submitted: { label: 'Tedarikciye gitti', color: '#1d4ed8', bg: '#dbeafe' },
  in_transit: { label: 'Yolda', color: '#7c2d12', bg: '#ffedd5' },
  receiving: { label: 'Mal kabulde', color: '#0f766e', bg: '#ccfbf1' },
  delivered: { label: 'Teslim edildi', color: '#166534', bg: '#dcfce7' },
}

const CONSOLIDATION_MODES = [
  { key: 'branch_supplier', label: 'Sube > Tedarikci' },
  { key: 'supplier_branch', label: 'Tedarikci > Sube' },
  { key: 'stock_branch', label: 'Stok Mali > Sube' },
]

function SummaryCard({ label, value, hint, color, bg }) {
  return (
    <div style={{ padding: 14, borderRadius: 14, border: '1px solid #e2e8f0', background: bg || '#fff' }}>
      <div style={{ fontSize: '.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.18rem', fontWeight: 800, color: color || '#0f172a', marginTop: 6 }}>
        {value}
      </div>
      {hint && <div style={{ fontSize: '.76rem', color: '#94a3b8', marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

function Badge({ meta }) {
  const safe = meta || ORDER_STATUS_META.pending_action
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '3px 10px',
      borderRadius: 999,
      background: safe.bg,
      color: safe.color,
      fontSize: '.74rem',
      fontWeight: 700,
      whiteSpace: 'nowrap',
    }}>
      {safe.label}
    </span>
  )
}

function toDateOnly(value) {
  if (!value) return ''
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/)
    if (match) return match[1]
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function buildLocalDeadline(dateValue, timeValue) {
  const safeDate = toDateOnly(dateValue)
  const safeTime = String(timeValue || '').slice(0, 5)
  if (!safeDate || !/^\d{2}:\d{2}$/.test(safeTime)) return null
  const deadline = new Date(`${safeDate}T${safeTime}:00`)
  return Number.isNaN(deadline.getTime()) ? null : deadline
}

function formatDeadline(deadline) {
  if (!(deadline instanceof Date) || Number.isNaN(deadline.getTime())) return '—'
  return deadline.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getOrderMeta(order) {
  const parsed = parseJsonValue(order?.meta, {})
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
  return {}
}

function getManagerChangeHistory(order) {
  const meta = getOrderMeta(order)
  const history = parseJsonValue(meta?.manager_change_history, meta?.manager_change_history || [])
  if (!Array.isArray(history)) return []
  return history
    .filter(Boolean)
    .sort((left, right) => String(right?.changed_at || '').localeCompare(String(left?.changed_at || '')))
}

function buildLineDiffEntries(previousLines, nextLines) {
  const prevMap = new Map((previousLines || []).map(line => [
    String(line.stock_item_id || line.line_no || line.id),
    line,
  ]))
  const nextMap = new Map((nextLines || []).map(line => [
    String(line.stock_item_id || line.line_no || line.id),
    line,
  ]))

  const keys = new Set([...prevMap.keys(), ...nextMap.keys()])
  const changes = []

  for (const key of keys) {
    const before = prevMap.get(key) || null
    const after = nextMap.get(key) || null

    if (!before && after) {
      changes.push({
        type: 'added',
        item_name: after.item_name || '',
        item_sku: after.item_sku || '',
        line_no: Number(after.line_no || 0),
        before: null,
        after: {
          ordered_qty: Number(after.ordered_qty || 0),
          unit_price: Number(after.unit_price || 0),
          line_total: Number(after.line_total || 0),
        },
      })
      continue
    }

    if (before && !after) {
      changes.push({
        type: 'removed',
        item_name: before.item_name || '',
        item_sku: before.item_sku || '',
        line_no: Number(before.line_no || 0),
        before: {
          ordered_qty: Number(before.ordered_qty || 0),
          unit_price: Number(before.unit_price || 0),
          line_total: Number(before.line_total || 0),
        },
        after: null,
      })
      continue
    }

    const beforeQty = Number(before?.ordered_qty || 0)
    const afterQty = Number(after?.ordered_qty || 0)
    const beforePrice = Number(before?.unit_price || 0)
    const afterPrice = Number(after?.unit_price || 0)
    const beforeTotal = Number(before?.line_total || 0)
    const afterTotal = Number(after?.line_total || 0)

    if (beforeQty !== afterQty || beforePrice !== afterPrice || beforeTotal !== afterTotal) {
      changes.push({
        type: 'updated',
        item_name: after?.item_name || before?.item_name || '',
        item_sku: after?.item_sku || before?.item_sku || '',
        line_no: Number(after?.line_no || before?.line_no || 0),
        before: {
          ordered_qty: beforeQty,
          unit_price: beforePrice,
          line_total: beforeTotal,
        },
        after: {
          ordered_qty: afterQty,
          unit_price: afterPrice,
          line_total: afterTotal,
        },
      })
    }
  }

  return changes
    .sort((left, right) => Number(left.line_no || 0) - Number(right.line_no || 0))
}

function isSupplierMarkedSent(order) {
  const meta = getOrderMeta(order)
  return Boolean(
    meta.supplier_marked_sent ||
    meta.supplier_sent ||
    meta.supplier_shipped ||
    meta.shipped ||
    meta.dispatched ||
    meta.dispatch_confirmed ||
    meta.shipped_at ||
    meta.dispatched_at ||
    meta.supplier_sent_at ||
    meta.supplier_delivery_notice_at,
  )
}

function buildDeliveryNote(order, flow) {
  const details = getFlowDates(flow, order?.order_date)
  const deliveryDate = order?.delivery_date || details.deliveryDate || ''
  const deliveryTime = String(order?.delivery_time || details.deliveryTime || '').slice(0, 5)
  if (!deliveryDate && !deliveryTime) return 'Teslim tarihi yok'
  return `Teslim: ${formatDateTime(deliveryDate, deliveryTime)}`
}

function buildPermissionSummary(permission) {
  if (!permission) return '—'
  const parts = []
  if (permission.canApprove) parts.push('Duzenle / onayla')
  if (permission.canEdit && permission.orderStatus === 'submitted') parts.push('Duzenleme acik')
  if (permission.canCancel) parts.push('Iptal acik')
  if (!parts.length) {
    if (permission.orderStatus === 'awaiting_approval') return 'Sadece goruntule'
    if (permission.supplierMarkedSent) return 'Mal kabul sureci'
    if (permission.orderStatus === 'submitted') return 'Sure doldu'
    if (permission.orderStatus === 'partially_received' || permission.orderStatus === 'received') return 'Mal kabul sureci'
    if (permission.orderStatus === 'cancelled') return 'Iptal edildi'
    return 'Bilgi'
  }
  return parts.join(' • ')
}

function computeManagerPermissions(order, flow) {
  const orderStatus = String(order?.status || '')
  const supplierMarkedSent = isSupplierMarkedSent(order)
  const editDeadline = flow?.allow_edit ? buildLocalDeadline(order?.order_date, flow?.edit_cutoff_hour || flow?.cutoff_hour) : null
  const cancelDeadline = flow?.allow_cancel ? buildLocalDeadline(order?.order_date, flow?.cancel_cutoff_hour || flow?.cutoff_hour) : null
  const now = new Date()
  const editWindowOpen = !!editDeadline && now <= editDeadline
  const cancelWindowOpen = !!cancelDeadline && now <= cancelDeadline

  return {
    orderStatus,
    supplierMarkedSent,
    editDeadline,
    cancelDeadline,
    canApprove: orderStatus === 'awaiting_approval',
    canEdit: !supplierMarkedSent && (orderStatus === 'awaiting_approval' || (orderStatus === 'submitted' && editWindowOpen)),
    canCancel: !supplierMarkedSent && orderStatus === 'submitted' && cancelWindowOpen,
    editWindowOpen,
    cancelWindowOpen,
  }
}

function classifyManagerOrder(order, flow) {
  const status = String(order?.status || '')
  const permission = computeManagerPermissions(order, flow)
  const awaitingManagerApproval = status === 'awaiting_approval'
    && (Boolean(order?.needs_manager_approval) || String(order?.manager_approval_status || '') === 'pending')

  if (awaitingManagerApproval) {
    return {
      bucket: 'approval',
      permission,
      badgeMeta: MANAGER_STATUS_META.approval,
      statusNote: '',
    }
  }

  if (status === 'submitted') {
    if (permission.supplierMarkedSent) {
      return {
        bucket: 'receiving',
        permission,
        badgeMeta: MANAGER_STATUS_META.receiving,
        statusNote: '',
      }
    }
    if (permission.canEdit || permission.canCancel) {
      return {
        bucket: 'submitted',
        permission,
        badgeMeta: MANAGER_STATUS_META.submitted,
        statusNote: '',
      }
    }
    return {
      bucket: 'in_transit',
      permission,
      badgeMeta: MANAGER_STATUS_META.in_transit,
      statusNote: buildDeliveryNote(order, flow),
    }
  }

  if (status === 'partially_received' || status === 'received') {
    return {
      bucket: 'delivered',
      permission,
      badgeMeta: MANAGER_STATUS_META.delivered,
      statusNote: '',
    }
  }

  return {
    bucket: 'other',
    permission,
    badgeMeta: ORDER_STATUS_META[status] || ORDER_STATUS_META.pending_action,
    statusNote: '',
  }
}

function toPurchaseOrderLinePayload(line, orderId) {
  return {
    order_id: orderId,
    line_no: Number(line.line_no || 1),
    stock_item_id: asUuidOrNull(line.stock_item_id),
    item_name: line.item_name || '',
    item_sku: line.item_sku || '',
    unit: line.unit || '',
    current_stock: Number(line.current_stock || 0),
    planned_delivery_date: line.planned_delivery_date || null,
    next_order_date: line.next_order_date || null,
    next_delivery_date: line.next_delivery_date || null,
    calculated_need: Number(line.calculated_need || 0),
    suggested_qty: Number(line.suggested_qty || 0),
    ordered_qty: Number(line.ordered_qty || 0),
    price_source: line.price_source || null,
    unit_price: Number(line.unit_price || 0),
    line_total: Number(line.line_total || 0),
    contract_id: asUuidOrNull(line.contract_id),
    notes: line.notes?.trim?.() || null,
    meta: line.meta || {},
  }
}

function buildConsolidationRows({ orders, orderLines, supplierMap, mode }) {
  const orderMap = new Map((orders || []).map(order => [order.id, order]))
  const grouped = new Map()

  for (const line of orderLines || []) {
    const order = orderMap.get(line.order_id)
    if (!order) continue

    const branchName = order.branch_name || 'Sube belirtilmemis'
    const supplierName = supplierMap.get(order.supplier_id) || order.supplier_name || 'Tedarikci belirtilmemis'
    const stockName = line.item_name || 'Stok mali belirtilmemis'
    const lineQty = Number(line.ordered_qty || 0)
    const lineAmount = Number(line.line_total || (lineQty * Number(line.unit_price || 0)))

    let key = ''
    let primaryLabel = ''
    let secondaryLabel = ''
    let extraLabel = ''

    if (mode === 'supplier_branch') {
      key = `${supplierName}__${branchName}`
      primaryLabel = supplierName
      secondaryLabel = branchName
      extraLabel = stockName
    } else if (mode === 'stock_branch') {
      key = `${stockName}__${branchName}`
      primaryLabel = stockName
      secondaryLabel = branchName
      extraLabel = supplierName
    } else {
      key = `${branchName}__${supplierName}`
      primaryLabel = branchName
      secondaryLabel = supplierName
      extraLabel = stockName
    }

    const current = grouped.get(key) || {
      primaryLabel,
      secondaryLabel,
      extraLabels: new Set(),
      orderIds: new Set(),
      stockIds: new Set(),
      supplierNames: new Set(),
      totalQty: 0,
      totalAmount: 0,
    }

    if (extraLabel) current.extraLabels.add(extraLabel)
    if (line.stock_item_id) current.stockIds.add(line.stock_item_id)
    if (supplierName) current.supplierNames.add(supplierName)
    current.orderIds.add(order.id)
    current.totalQty += lineQty
    current.totalAmount += lineAmount
    grouped.set(key, current)
  }

  return [...grouped.values()]
    .map(row => ({
      primaryLabel: row.primaryLabel,
      secondaryLabel: row.secondaryLabel,
      orderCount: row.orderIds.size,
      stockCount: row.stockIds.size,
      supplierSummary: row.supplierNames.size === 1
        ? [...row.supplierNames][0]
        : `${row.supplierNames.size} tedarikci`,
      extraSummary: row.extraLabels.size === 0
        ? '—'
        : row.extraLabels.size === 1
          ? [...row.extraLabels][0]
          : `${row.extraLabels.size} farkli kalem`,
      totalQty: row.totalQty,
      totalAmount: row.totalAmount,
    }))
    .sort((left, right) => {
      const primaryCompare = left.primaryLabel.localeCompare(right.primaryLabel, 'tr')
      if (primaryCompare !== 0) return primaryCompare
      return left.secondaryLabel.localeCompare(right.secondaryLabel, 'tr')
    })
}

function PurchasingOrderModal({
  open,
  order,
  lines,
  flow,
  supplier,
  onClose,
  onSaveAction,
  onCancelOrder,
}) {
  const toast = useToast()
  const [draftLines, setDraftLines] = useState([])
  const [actionNote, setActionNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setDraftLines((lines || []).map(line => ({ ...line })))
    setActionNote(order?.notes || '')
  }, [open, lines, order])

  if (!open || !order) return null

  const statusView = classifyManagerOrder(order, flow)
  const permission = statusView.permission
  const summary = summarizeLines(draftLines)
  const details = getFlowDates(flow, order.order_date)
  const editable = permission.canEdit
  const canApprove = permission.canApprove
  const canCancel = permission.canCancel
  const changeHistory = getManagerChangeHistory(order)

  function updateLine(lineId, key, value) {
    setDraftLines(prev => prev.map(line => {
      if (line.id !== lineId && line.line_no !== lineId) return line
      const next = { ...line, [key]: value }
      const qty = Number(next.ordered_qty || 0)
      const price = Number(next.unit_price || 0)
      next.line_total = Number((qty * price).toFixed(4))
      next.meta = { ...(next.meta || {}), warnings: getOrderWarnings(next, qty) }
      return next
    }))
  }

  async function runAction(action) {
    setSaving(true)
    try {
      await onSaveAction({
        order,
        action,
        lines: draftLines,
        actionNote,
      })
      onClose()
    } catch (error) {
      toast(error?.message || 'Siparis kaydedilemedi', 'error')
    } finally {
      setSaving(false)
    }
  }

  const footer = (
    <>
      <button className="btn-o" onClick={onClose} disabled={saving}>Kapat</button>
      {editable && (
        <button className="btn-o" onClick={() => runAction('manager_update')} disabled={saving}>
          {saving ? 'Kaydediliyor...' : 'Degisiklikleri Kaydet'}
        </button>
      )}
      {canApprove && (
        <button className="btn-p" onClick={() => runAction('approve')} disabled={saving}>
          {saving
            ? <><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }} />Kaydediliyor...</>
            : <><i className="fa-solid fa-check" style={{ marginRight: 6 }} />Onayla ve Gonder</>}
        </button>
      )}
      {canCancel && (
        <button
          className="btn-o"
          onClick={() => onCancelOrder({ order, reason: actionNote })}
          disabled={saving}
          style={{ color: '#b91c1c', borderColor: '#fecaca' }}
        >
          <i className="fa-solid fa-ban" /> Iptal Et
        </button>
      )}
    </>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={1220}
      flex
      title={order.order_no}
      subtitle={`${order.branch_name || 'Sube'} • ${supplier?.name || order.supplier_name || 'Tedarikci'} • ${flow?.name || order.flow_name || 'Siparis Akisi'}`}
      footer={footer}
    >
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <Badge meta={statusView.badgeMeta} />
          {statusView.statusNote && (
            <span style={{ padding: '3px 10px', borderRadius: 999, background: '#fff7ed', color: '#9a3412', fontSize: '.74rem', fontWeight: 700 }}>
              {statusView.statusNote}
            </span>
          )}
          {order.needs_manager_approval && (
            <span style={{ padding: '3px 10px', borderRadius: 999, background: '#fef3c7', color: '#92400e', fontSize: '.74rem', fontWeight: 700 }}>
              Yonetici onayi gerekiyor
            </span>
          )}
          <span style={{ padding: '3px 10px', borderRadius: 999, background: '#eef2ff', color: '#4338ca', fontSize: '.74rem', fontWeight: 700 }}>
            Son siparis saati: {details.cutoffTime || '—'}
          </span>
          {flow?.allow_edit && (
            <span style={{
              padding: '3px 10px',
              borderRadius: 999,
              background: permission.editWindowOpen ? '#ecfeff' : '#f8fafc',
              color: permission.editWindowOpen ? '#0f766e' : '#64748b',
              fontSize: '.74rem',
              fontWeight: 700,
            }}>
              Duzenleme son: {formatDeadline(permission.editDeadline)}
            </span>
          )}
          {flow?.allow_cancel && (
            <span style={{
              padding: '3px 10px',
              borderRadius: 999,
              background: permission.cancelWindowOpen ? '#fff7ed' : '#f8fafc',
              color: permission.cancelWindowOpen ? '#c2410c' : '#64748b',
              fontSize: '.74rem',
              fontWeight: 700,
            }}>
              Iptal son: {formatDeadline(permission.cancelDeadline)}
            </span>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12 }}>
          <SummaryCard label="Siparis Toplami" value={`₺${formatMoney(summary.subtotal)}`} hint={`${formatQty(summary.totalQty)} toplam miktar`} />
          <SummaryCard label="Sube" value={order.branch_name || '—'} bg="#eff6ff" color="#1d4ed8" />
          <SummaryCard label="Teslim" value={details.deliveryDate ? formatDate(details.deliveryDate) : '—'} hint={details.deliveryTime ? `${details.deliveryTime} planli` : 'Saat tanimi yok'} bg="#ecfeff" color="#0f766e" />
          <SummaryCard label="Durum" value={statusView.badgeMeta?.label || ORDER_STATUS_META[order.status]?.label || order.status || '—'} hint={buildPermissionSummary(permission)} bg="#fffbeb" color="#92400e" />
        </div>

        <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Stok Mali Adi', 'SKU', 'Birim', 'Mevcut Stok', 'Hesaplanan Ihtiyac', 'Siparis Onerisi', 'Siparis', 'Birim Fiyati', 'Tutar'].map(label => (
                    <th key={label} style={{ padding: '10px 12px', textAlign: label === 'Stok Mali Adi' ? 'left' : 'right', borderBottom: '1px solid #e2e8f0', color: '#475569', whiteSpace: 'nowrap' }}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {draftLines.map(line => {
                  const lineId = line.id || line.line_no
                  const warnings = parseJsonValue(line.meta?.warnings, line.meta?.warnings || [])
                  const contractLocked = line.price_source === 'contract'
                  return (
                    <tr key={lineId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 12px', minWidth: 240 }}>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{line.item_name}</div>
                        {warnings.length > 0 && (
                          <div style={{ fontSize: '.68rem', color: '#b45309', marginTop: 4 }}>
                            {warnings.join(' • ')}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#64748b' }}>{line.item_sku || '—'}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#64748b' }}>{line.unit || '—'}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#0f766e' }}>{formatQty(line.current_stock)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#1d4ed8' }}>{formatQty(line.calculated_need)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#0f766e' }}>{formatQty(line.suggested_qty)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <input
                          className="f-input"
                          type="number"
                          step="any"
                          min="0"
                          value={line.ordered_qty}
                          disabled={!editable}
                          onChange={event => updateLine(lineId, 'ordered_qty', event.target.value)}
                          style={{ width: 120, marginLeft: 'auto', textAlign: 'right', fontWeight: 700 }}
                        />
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <input
                          className="f-input"
                          type="number"
                          step="any"
                          min="0"
                          value={line.unit_price}
                          disabled={!editable || contractLocked}
                          onChange={event => updateLine(lineId, 'unit_price', event.target.value)}
                          style={{ width: 120, marginLeft: 'auto', textAlign: 'right', fontWeight: 700 }}
                        />
                        <div style={{ fontSize: '.65rem', color: contractLocked ? '#7c3aed' : '#94a3b8', marginTop: 4 }}>
                          {line.price_source === 'contract'
                            ? `Kontrat: ${line.meta?.contract_no || 'aktif'}`
                            : line.price_source === 'last_receipt'
                              ? 'Son mal kabul fiyati'
                              : 'Stok karti fiyati'}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>
                        ₺{formatMoney(line.line_total)}
                      </td>
                    </tr>
                  )
                })}
                {draftLines.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>
                      Sipariş satırı bulunamadı (geçmiş kayıt olabilir).
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 14, background: '#f8fafc' }}>
          <div style={{ fontSize: '.82rem', fontWeight: 800, color: '#334155', marginBottom: 10 }}>
            Değişiklik Geçmişi (Satır Bazlı)
          </div>
          {changeHistory.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: '.8rem' }}>Kayıtlı değişiklik bulunmuyor.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {changeHistory.slice(0, 10).map(entry => (
                <div key={entry.id || entry.changed_at} style={{ border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', padding: 10 }}>
                  <div style={{ fontSize: '.74rem', color: '#475569', fontWeight: 700 }}>
                    {entry.action === 'cancel' ? 'İptal' : 'Güncelleme'} • {entry.changed_by || 'kullanıcı'} • {entry.changed_at ? new Date(entry.changed_at).toLocaleString('tr-TR') : ''}
                  </div>
                  {entry.note && <div style={{ fontSize: '.76rem', color: '#64748b', marginTop: 4 }}>Not: {entry.note}</div>}
                  {Array.isArray(entry.line_changes) && entry.line_changes.length > 0 && (
                    <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
                      {entry.line_changes.slice(0, 6).map((row, idx) => (
                        <div key={`${row.item_sku || row.item_name}-${idx}`} style={{ fontSize: '.74rem', color: '#334155' }}>
                          <strong>{row.item_name || 'Satır'}</strong> ({row.item_sku || 'SKU yok'}) •
                          {' '}Adet: {formatQty(row.before?.ordered_qty || 0)} → {formatQty(row.after?.ordered_qty || 0)} •
                          {' '}Fiyat: ₺{formatMoney(row.before?.unit_price || 0)} → ₺{formatMoney(row.after?.unit_price || 0)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 16 }}>
          <div>
            <label className="f-label">Islem Notu</label>
            <textarea
              className="f-input"
              rows={4}
              value={actionNote}
              onChange={event => setActionNote(event.target.value)}
              placeholder="Degisiklik veya iptal nedeni gerekiyorsa burada belirtin"
              style={{ resize: 'vertical' }}
            />
          </div>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, background: '#f8fafc' }}>
            <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '.08em' }}>
              Yetki Durumu
            </div>
            <div style={{ display: 'grid', gap: 10, marginTop: 14, fontSize: '.84rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                <span>Duzenleme</span>
                <strong style={{ color: editable ? '#0f766e' : '#64748b' }}>{editable ? 'Acik' : 'Kapali'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                <span>Iptal</span>
                <strong style={{ color: canCancel ? '#c2410c' : '#64748b' }}>{canCancel ? 'Acik' : 'Kapali'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                <span>Onay</span>
                <strong>{canApprove ? 'Bekliyor' : 'Gerekli degil'}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default function PurchasingManager() {
  const toast = useToast()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState([])
  const [orderLines, setOrderLines] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [flows, setFlows] = useState([])
  const [branches, setBranches] = useState([])
  const [selectedBranch, setSelectedBranch] = useState(ALL_FILTER_KEY)
  const [selectedSupplier, setSelectedSupplier] = useState(ALL_FILTER_KEY)
  const [statusFilter, setStatusFilter] = useState('all')
  const [consolidationMode, setConsolidationMode] = useState('branch_supplier')
  const [search, setSearch] = useState('')
  const [detailOrderId, setDetailOrderId] = useState('')
  const [confirmCancel, setConfirmCancel] = useState(null)
  const [selectedApprovalOrderIds, setSelectedApprovalOrderIds] = useState([])
  const [bulkApproveLoading, setBulkApproveLoading] = useState(false)

  const loadBase = useCallback(async () => {
    setLoading(true)
    try {
      const [ordersResult, linesResult, suppliersResult, flowsResult, settingsResult] = await Promise.all([
        db.from('purchase_orders').select('*').is('deleted_at', null).order('order_date', { ascending: false }).order('created_at', { ascending: false }),
        db.from('purchase_order_lines').select('*').is('deleted_at', null).order('line_no'),
        db.from('suppliers').select('id,name').eq('active', true).order('name'),
        db.from('order_flows').select('*').is('deleted_at', null).order('name'),
        db.from('settings').select('value').eq('key', 'company_tree').single(),
      ])

      if (ordersResult.error) throw ordersResult.error
      if (linesResult.error) throw linesResult.error
      if (suppliersResult.error) throw suppliersResult.error
      if (flowsResult.error) throw flowsResult.error
      if (settingsResult.error) throw settingsResult.error

      setOrders(ordersResult.data || [])
      setOrderLines(linesResult.data || [])
      setSuppliers(suppliersResult.data || [])
      setFlows(flowsResult.data || [])
      setBranches(getAllBranches(settingsResult.data?.value))
    } catch (error) {
      toast(`Satinalma yoneticisi verileri yuklenemedi: ${error?.message || 'Bilinmeyen hata'}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadBase()
  }, [loadBase])

  const supplierMap = useMemo(
    () => new Map((suppliers || []).map(supplier => [supplier.id, supplier.name])),
    [suppliers],
  )

  const flowMap = useMemo(
    () => new Map((flows || []).map(flow => [flow.id, flow])),
    [flows],
  )

  const baseOrders = useMemo(() => {
    const selectedBranchRecord = selectedBranch === ALL_FILTER_KEY
      ? null
      : findBranchById(branches, selectedBranch)
    const text = search.trim().toLowerCase()

    return (orders || []).filter(order => {
      if (selectedBranchRecord && !branchMatchesRecord(order, selectedBranchRecord)) return false
      if (selectedSupplier !== ALL_FILTER_KEY && String(order.supplier_id || '') !== String(selectedSupplier)) return false
      if (!text) return true
      const supplierName = supplierMap.get(order.supplier_id) || order.supplier_name || ''
      const haystack = [
        order.order_no,
        order.flow_name,
        order.description,
        supplierName,
        order.branch_name,
      ].join(' ').toLowerCase()
      return haystack.includes(text)
    })
  }, [orders, branches, selectedBranch, selectedSupplier, search, supplierMap])

  const filterMeta = useMemo(
    () => STATUS_FILTERS.find(item => item.key === statusFilter) || STATUS_FILTERS[0],
    [statusFilter],
  )

  const managerStatusByOrderId = useMemo(() => {
    const map = new Map()
    for (const order of baseOrders) {
      const flow = flowMap.get(order.flow_id) || null
      map.set(order.id, classifyManagerOrder(order, flow))
    }
    return map
  }, [baseOrders, flowMap])

  const filteredOrders = useMemo(() => {
    if (filterMeta.key === 'all') return baseOrders
    return baseOrders.filter(order => managerStatusByOrderId.get(order.id)?.bucket === filterMeta.key)
  }, [baseOrders, filterMeta, managerStatusByOrderId])

  const selectableApprovalOrderIds = useMemo(
    () => filteredOrders
      .filter(order => managerStatusByOrderId.get(order.id)?.bucket === 'approval')
      .map(order => order.id),
    [filteredOrders, managerStatusByOrderId],
  )

  const allSelectableApprovalsSelected = useMemo(
    () => selectableApprovalOrderIds.length > 0
      && selectableApprovalOrderIds.every(id => selectedApprovalOrderIds.includes(id)),
    [selectableApprovalOrderIds, selectedApprovalOrderIds],
  )

  const consolidationOrders = useMemo(
    () => filteredOrders.filter(order => order.status !== 'cancelled'),
    [filteredOrders],
  )

  const consolidationOrderIds = useMemo(
    () => new Set(consolidationOrders.map(order => order.id)),
    [consolidationOrders],
  )

  const consolidationLines = useMemo(
    () => orderLines.filter(line => consolidationOrderIds.has(line.order_id)),
    [orderLines, consolidationOrderIds],
  )

  const consolidationRows = useMemo(
    () => buildConsolidationRows({
      orders: consolidationOrders,
      orderLines: consolidationLines,
      supplierMap,
      mode: consolidationMode,
    }),
    [consolidationOrders, consolidationLines, supplierMap, consolidationMode],
  )

  const summary = useMemo(() => {
    return filteredOrders.reduce((acc, order) => {
      const statusView = managerStatusByOrderId.get(order.id)
      acc.count += 1
      acc.total += Number(order.total_amount || 0)
      acc.qty += Number(order.total_qty || 0)
      if (statusView?.bucket === 'approval') acc.awaitingApproval += 1
      if (statusView?.bucket === 'submitted') acc.submitted += 1
      if (statusView?.bucket === 'in_transit') acc.inTransit += 1
      if (statusView?.bucket === 'receiving') acc.receiving += 1
      if (statusView?.bucket === 'delivered') acc.delivered += 1
      return acc
    }, {
      count: 0,
      total: 0,
      qty: 0,
      awaitingApproval: 0,
      submitted: 0,
      inTransit: 0,
      receiving: 0,
      delivered: 0,
    })
  }, [filteredOrders, managerStatusByOrderId])

  const tabCounts = useMemo(() => {
    return STATUS_FILTERS.reduce((acc, filter) => {
      acc[filter.key] = filter.key === 'all'
        ? baseOrders.length
        : baseOrders.filter(order => managerStatusByOrderId.get(order.id)?.bucket === filter.key).length
      return acc
    }, {})
  }, [baseOrders, managerStatusByOrderId])

  const selectedOrder = useMemo(
    () => orders.find(order => String(order.id) === String(detailOrderId)) || null,
    [orders, detailOrderId],
  )

  const selectedOrderLines = useMemo(
    () => orderLines
      .filter(line => String(line.order_id) === String(detailOrderId))
      .sort((left, right) => Number(left.line_no || 0) - Number(right.line_no || 0)),
    [orderLines, detailOrderId],
  )

  useEffect(() => {
    const allowed = new Set(selectableApprovalOrderIds)
    setSelectedApprovalOrderIds(prev => prev.filter(id => allowed.has(id)))
  }, [selectableApprovalOrderIds])

  async function persistOrder({ order, action, lines, actionNote }) {
    const cleanedLines = (lines || []).map((line, index) => {
      const qty = Number(line.ordered_qty || 0)
      const unitPrice = Number(line.unit_price || 0)
      return {
        ...line,
        line_no: index + 1,
        ordered_qty: qty,
        unit_price: unitPrice,
        line_total: Number((qty * unitPrice).toFixed(4)),
        meta: {
          ...(line.meta || {}),
          warnings: getOrderWarnings(line, qty),
        },
      }
    })

    const totals = summarizeLines(cleanedLines)
    let nextStatus = order.status
    let managerApprovalStatus = order.manager_approval_status || 'not_required'
    let submittedAt = order.submitted_at || null

    if (action === 'approve') {
      nextStatus = 'submitted'
      managerApprovalStatus = order.needs_manager_approval ? 'approved' : 'not_required'
      submittedAt = order.submitted_at || new Date().toISOString()
    }

    const { data: previousLines = [], error: previousLinesError } = await db
      .from('purchase_order_lines')
      .select('*')
      .eq('order_id', order.id)
      .order('line_no')
    if (previousLinesError) throw previousLinesError

    const currentMeta = getOrderMeta(order)
    const wasSentToSupplier = order.status === 'submitted' || Boolean(order.submitted_at)
    const shouldMarkSupplierUpdate = action !== 'approve' && wasSentToSupplier
    const nextMeta = shouldMarkSupplierUpdate
      ? {
        ...currentMeta,
        supplier_change_notice: {
          kind: 'updated',
          changed_at: new Date().toISOString(),
          changed_by: user?.email || user?.id || 'center-manager',
          note: actionNote?.trim?.() || null,
        },
      }
      : currentMeta

    let finalMeta = nextMeta
    const lineDiffEntries = buildLineDiffEntries(previousLines, cleanedLines)
    const noteChanged = String(order.notes || '').trim() !== String(actionNote || '').trim()
    const totalsChanged = Number(order.total_qty || 0) !== totals.totalQty || Number(order.total_amount || 0) !== totals.subtotal
    const changedForHistory = lineDiffEntries.length > 0 || noteChanged || totalsChanged

    if (action !== 'approve' && changedForHistory) {
      const previousHistory = Array.isArray(currentMeta.manager_change_history)
        ? currentMeta.manager_change_history.filter(Boolean)
        : []
      const historyEntry = {
        id: `mgr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        action: 'update',
        changed_at: new Date().toISOString(),
        changed_by: user?.email || user?.id || 'center-manager',
        note: actionNote?.trim() || null,
        line_changes: lineDiffEntries,
      }
      finalMeta = {
        ...nextMeta,
        manager_change_history: [historyEntry, ...previousHistory].slice(0, 60),
      }
    }

    const payload = {
      status: nextStatus,
      manager_approval_status: managerApprovalStatus,
      total_qty: totals.totalQty,
      subtotal: totals.subtotal,
      total_amount: totals.subtotal,
      notes: actionNote?.trim() || null,
      submitted_at: submittedAt,
      suggestion_refreshed_at: order.suggestion_refreshed_at || new Date().toISOString(),
      meta: finalMeta,
      updated_at: new Date().toISOString(),
    }

    const previousOrderPayload = {
      status: order.status,
      manager_approval_status: order.manager_approval_status || 'not_required',
      total_qty: Number(order.total_qty || 0),
      subtotal: Number(order.subtotal || 0),
      total_amount: Number(order.total_amount || 0),
      notes: order.notes || null,
      submitted_at: order.submitted_at || null,
      suggestion_refreshed_at: order.suggestion_refreshed_at || null,
      meta: order.meta || {},
      updated_at: order.updated_at || null,
    }

    try {
      const { error: orderError } = await db.from('purchase_orders').update(payload).eq('id', order.id)
      if (orderError) throw orderError

      const { error: deleteLinesError } = await db.from('purchase_order_lines').delete().eq('order_id', order.id)
      if (deleteLinesError) throw deleteLinesError

      if (cleanedLines.length > 0) {
        const { error: insertLinesError } = await db
          .from('purchase_order_lines')
          .insert(cleanedLines.map(line => toPurchaseOrderLinePayload(line, order.id)))
        if (insertLinesError) throw insertLinesError
      }
    } catch (error) {
      await db.from('purchase_orders').update(previousOrderPayload).eq('id', order.id)

      if (previousLines.length > 0) {
        await db
          .from('purchase_order_lines')
          .insert(previousLines.map(({ id, created_at, updated_at, ...line }) => line))
      }

      throw error
    }

    await logActivity({
      user,
      actionType: 'purchase_order_update',
      route: '/purchasing',
      entityType: 'purchase_order',
      entityId: order.id,
      metadata: {
        action,
        status: nextStatus,
        manager_approval_status: managerApprovalStatus,
        total_qty: totals.totalQty,
        total_amount: totals.subtotal,
        supplier_notified: shouldMarkSupplierUpdate,
      },
    })

    toast(
      action === 'approve'
        ? 'Siparis onaylandi ve tedarikciye gonderildi'
        : 'Siparis guncellendi',
      'success',
    )

    await loadBase()
  }

  async function cancelOrder({ order, reason }) {
    if (!reason?.trim()) {
      toast('Iptal nedeni zorunludur', 'error')
      return
    }

    try {
      const currentMeta = getOrderMeta(order)
      const previousHistory = Array.isArray(currentMeta.manager_change_history)
        ? currentMeta.manager_change_history.filter(Boolean)
        : []
      const cancelHistoryEntry = {
        id: `mgr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        action: 'cancel',
        changed_at: new Date().toISOString(),
        changed_by: user?.email || user?.id || 'center-manager',
        note: reason.trim(),
        line_changes: [],
      }
      const wasSentToSupplier = order.status === 'submitted' || Boolean(order.submitted_at)
      const nextMeta = wasSentToSupplier
        ? {
          ...currentMeta,
          supplier_change_notice: {
            kind: 'cancelled',
            changed_at: new Date().toISOString(),
            changed_by: user?.email || user?.id || 'center-manager',
            note: reason.trim(),
          },
          manager_change_history: [cancelHistoryEntry, ...previousHistory].slice(0, 60),
        }
        : {
          ...currentMeta,
          manager_change_history: [cancelHistoryEntry, ...previousHistory].slice(0, 60),
        }

      const { error } = await db
        .from('purchase_orders')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_reason: reason.trim(),
          notes: reason.trim(),
          meta: nextMeta,
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id)
      if (error) throw error

      await logActivity({
        user,
        actionType: 'purchase_order_delete',
        route: '/purchasing',
        entityType: 'purchase_order',
        entityId: order.id,
        metadata: {
          action: 'cancel',
          reason: reason.trim(),
          supplier_notified: wasSentToSupplier,
        },
      })

      toast('Siparis iptal edildi', 'success')
      setDetailOrderId('')
      await loadBase()
    } catch (error) {
      toast(`Siparis iptal edilemedi: ${error?.message || 'Bilinmeyen hata'}`, 'error')
    }
  }

  async function approveSelectedOrders() {
    if (selectedApprovalOrderIds.length === 0) {
      toast('Onaylanacak siparis secin', 'error')
      return
    }

    const targetOrders = filteredOrders.filter(order => selectedApprovalOrderIds.includes(order.id))
    if (targetOrders.length === 0) {
      toast('Secili siparis bulunamadi', 'error')
      return
    }

    setBulkApproveLoading(true)
    try {
      const submittedAt = new Date().toISOString()
      for (const order of targetOrders) {
        const { error } = await db
          .from('purchase_orders')
          .update({
            status: 'submitted',
            manager_approval_status: order.needs_manager_approval ? 'approved' : 'not_required',
            submitted_at: order.submitted_at || submittedAt,
            updated_at: new Date().toISOString(),
          })
          .eq('id', order.id)
        if (error) throw error

        await logActivity({
          user,
          actionType: 'purchase_order_update',
          route: '/purchasing',
          entityType: 'purchase_order',
          entityId: order.id,
          metadata: {
            action: 'approve',
            source: 'bulk_approve',
            status: 'submitted',
          },
        })
      }

      toast(`${targetOrders.length} siparis onaylandi ve tedarikciye gonderildi`, 'success')
      setSelectedApprovalOrderIds([])
      await loadBase()
    } catch (error) {
      toast(`Toplu onay basarisiz: ${error?.message || 'Bilinmeyen hata'}`, 'error')
    } finally {
      setBulkApproveLoading(false)
    }
  }

  return (
    <div>
      <Header
        title="Satinalma Yoneticisi"
        subtitle="Subelerden gelen tum siparisleri merkezde gosterir, onaylar ve konsolide eder"
        actions={(
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="btn-p"
              onClick={approveSelectedOrders}
              disabled={bulkApproveLoading || selectedApprovalOrderIds.length === 0}
            >
              {bulkApproveLoading ? 'Onaylaniyor...' : `Secilenleri Onayla (${selectedApprovalOrderIds.length})`}
            </button>
            <button className="btn-o" onClick={loadBase}>
              <i className="fa-solid fa-rotate-right" /> Yenile
            </button>
          </div>
        )}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 12, marginBottom: 16 }}>
        <SummaryCard label="Gorunen Siparis" value={summary.count} />
        <SummaryCard label="Onay Bekleyen" value={summary.awaitingApproval} bg="#fff7ed" color="#c2410c" />
        <SummaryCard label="Tedarikciye Giden" value={summary.submitted} bg="#eff6ff" color="#1d4ed8" />
        <SummaryCard label="Yolda" value={summary.inTransit} bg="#fff7ed" color="#9a3412" />
        <SummaryCard label="Toplam Tutar" value={`₺${formatMoney(summary.total)}`} hint={`${formatQty(summary.qty)} toplam miktar`} bg="#ecfeff" color="#0f766e" />
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 220px 220px', gap: 12 }}>
          <div style={{ position: 'relative' }}>
            <i className="fa-solid fa-magnifying-glass" style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#94a3b8',
              fontSize: '.82rem',
            }} />
            <input
              className="f-input"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Siparis no, sube, akis, aciklama veya tedarikci ara..."
              style={{ paddingLeft: 34 }}
            />
          </div>
          <select className="f-input" value={selectedBranch} onChange={event => setSelectedBranch(event.target.value)}>
            <option value={ALL_FILTER_KEY}>Tum subeler</option>
            {branches.map(branch => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
          <select className="f-input" value={selectedSupplier} onChange={event => setSelectedSupplier(event.target.value)}>
            <option value={ALL_FILTER_KEY}>Tum tedarikciler</option>
            {suppliers.map(supplier => (
              <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          {STATUS_FILTERS.map(filter => {
            const active = statusFilter === filter.key
            return (
              <button
                key={filter.key}
                type="button"
                onClick={() => setStatusFilter(filter.key)}
                style={{
                  border: `1.5px solid ${active ? '#2563eb' : '#e2e8f0'}`,
                  background: active ? '#eff6ff' : '#fff',
                  color: active ? '#1d4ed8' : '#475569',
                  borderRadius: 999,
                  padding: '8px 14px',
                  fontWeight: 700,
                  fontSize: '.8rem',
                  cursor: 'pointer',
                }}
              >
                {filter.label} ({tabCounts[filter.key] || 0})
              </button>
            )
          })}
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden', marginBottom: 16 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '1.4rem' }} />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1rem' }}>Goruntulenecek siparis yok</div>
            <p style={{ color: '#94a3b8', marginTop: 6 }}>Secili filtrelere uyan siparis bulunamadi.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ padding: '12px 10px', borderBottom: '1px solid #e2e8f0', textAlign: 'center', color: '#475569', width: 34 }}>
                    <input
                      type="checkbox"
                      checked={allSelectableApprovalsSelected}
                      onChange={event => {
                        if (event.target.checked) {
                          setSelectedApprovalOrderIds(selectableApprovalOrderIds)
                        } else {
                          setSelectedApprovalOrderIds([])
                        }
                      }}
                      disabled={selectableApprovalOrderIds.length === 0}
                    />
                  </th>
                  {['Siparis No', 'Sube', 'Tedarikci', 'Is Akisi', 'Son Siparis Saati', 'Yetkiler', 'Durum', 'Toplam Adet', 'Toplam Tutar', ''].map(label => (
                    <th key={label} style={{ padding: '12px 14px', borderBottom: '1px solid #e2e8f0', textAlign: ['Sube', 'Tedarikci', 'Is Akisi'].includes(label) ? 'left' : 'right', color: '#475569', whiteSpace: 'nowrap' }}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map(order => {
                  const flow = flowMap.get(order.flow_id) || null
                  const supplierName = supplierMap.get(order.supplier_id) || order.supplier_name || '—'
                  const statusView = managerStatusByOrderId.get(order.id) || classifyManagerOrder(order, flow)
                  const permission = statusView.permission
                  const selectable = statusView.bucket === 'approval'
                  const checked = selectedApprovalOrderIds.includes(order.id)
                  return (
                    <tr key={order.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                        {selectable ? (
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={event => {
                              setSelectedApprovalOrderIds(prev => {
                                if (event.target.checked) return [...new Set([...prev, order.id])]
                                return prev.filter(id => id !== order.id)
                              })
                            }}
                          />
                        ) : null}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>{order.order_no}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 700, color: '#334155' }}>{order.branch_name || '—'}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'left', color: '#475569' }}>{supplierName}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'left', color: '#64748b' }}>{order.flow_name || flow?.name || '—'}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: '#334155' }}>
                        {formatDateTime(order.order_date, order.cutoff_at || flow?.cutoff_hour)}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'grid', gap: 4 }}>
                          <span style={{ fontWeight: 700, color: '#334155' }}>{buildPermissionSummary(permission)}</span>
                          {permission.editDeadline && (
                            <span style={{ fontSize: '.7rem', color: '#64748b' }}>Duzenleme: {formatDeadline(permission.editDeadline)}</span>
                          )}
                          {permission.cancelDeadline && (
                            <span style={{ fontSize: '.7rem', color: '#64748b' }}>Iptal: {formatDeadline(permission.cancelDeadline)}</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'grid', gap: 4, justifyItems: 'end' }}>
                          <Badge meta={statusView.badgeMeta} />
                          {statusView.statusNote && (
                            <span style={{ fontSize: '.7rem', color: '#64748b' }}>{statusView.statusNote}</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#0f766e' }}>{formatQty(order.total_qty)}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>₺{formatMoney(order.total_amount)}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <button className="btn-o" onClick={() => setDetailOrderId(String(order.id))}>
                          Islem Yap
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '.9rem', fontWeight: 800, color: '#0f172a' }}>Konsolidasyon</div>
            <div style={{ fontSize: '.78rem', color: '#64748b', marginTop: 4 }}>
              Gorunen siparisler, iptal edilenler haric secili kirilimda toplanir.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {CONSOLIDATION_MODES.map(mode => {
              const active = consolidationMode === mode.key
              return (
                <button
                  key={mode.key}
                  type="button"
                  onClick={() => setConsolidationMode(mode.key)}
                  style={{
                    border: `1.5px solid ${active ? '#0f766e' : '#e2e8f0'}`,
                    background: active ? '#ecfeff' : '#fff',
                    color: active ? '#0f766e' : '#475569',
                    borderRadius: 999,
                    padding: '8px 14px',
                    fontWeight: 700,
                    fontSize: '.8rem',
                    cursor: 'pointer',
                  }}
                >
                  {mode.label}
                </button>
              )
            })}
          </div>
        </div>

        {consolidationRows.length === 0 ? (
          <div style={{ padding: 20, border: '1px dashed #cbd5e1', borderRadius: 14, textAlign: 'center', color: '#94a3b8' }}>
            Konsolidasyon icin uygun satir bulunmuyor.
          </div>
        ) : (
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ padding: '12px 14px', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                      {consolidationMode === 'supplier_branch'
                        ? 'Tedarikci'
                        : consolidationMode === 'stock_branch'
                          ? 'Stok Mali'
                          : 'Sube'}
                    </th>
                    <th style={{ padding: '12px 14px', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                      {consolidationMode === 'supplier_branch'
                        ? 'Sube'
                        : consolidationMode === 'stock_branch'
                          ? 'Sube'
                          : 'Tedarikci'}
                    </th>
                    <th style={{ padding: '12px 14px', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                      {consolidationMode === 'stock_branch' ? 'Tedarikci' : 'Kalem Ozeti'}
                    </th>
                    <th style={{ padding: '12px 14px', borderBottom: '1px solid #e2e8f0', textAlign: 'right', color: '#475569' }}>Siparis</th>
                    <th style={{ padding: '12px 14px', borderBottom: '1px solid #e2e8f0', textAlign: 'right', color: '#475569' }}>
                      {consolidationMode === 'stock_branch' ? 'Toplam Adet' : 'Stok Kalemi'}
                    </th>
                    <th style={{ padding: '12px 14px', borderBottom: '1px solid #e2e8f0', textAlign: 'right', color: '#475569' }}>Toplam Miktar</th>
                    <th style={{ padding: '12px 14px', borderBottom: '1px solid #e2e8f0', textAlign: 'right', color: '#475569' }}>Toplam Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  {consolidationRows.map((row, index) => (
                    <tr key={`${row.primaryLabel}-${row.secondaryLabel}-${index}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>{row.primaryLabel}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'left', color: '#334155' }}>{row.secondaryLabel}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'left', color: '#64748b' }}>
                        {consolidationMode === 'stock_branch' ? row.supplierSummary : row.extraSummary}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#475569' }}>{row.orderCount}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#1d4ed8' }}>
                        {consolidationMode === 'stock_branch' ? formatQty(row.totalQty) : row.stockCount}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#0f766e' }}>{formatQty(row.totalQty)}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>₺{formatMoney(row.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <PurchasingOrderModal
        open={!!selectedOrder}
        order={selectedOrder}
        lines={selectedOrderLines}
        flow={flowMap.get(selectedOrder?.flow_id) || null}
        supplier={suppliers.find(item => item.id === selectedOrder?.supplier_id) || null}
        onClose={() => setDetailOrderId('')}
        onSaveAction={persistOrder}
        onCancelOrder={payload => setConfirmCancel(payload)}
      />

      <ConfirmDialog
        open={!!confirmCancel}
        title="Siparis iptal edilsin mi?"
        desc="Iptal nedeni, siparis detayindaki islem notundan okunur. Iptal edilen siparisler sube siparisleri ve Mal Kabul ekranindan duser."
        onCancel={() => setConfirmCancel(null)}
        onConfirm={async () => {
          const payload = confirmCancel
          setConfirmCancel(null)
          await cancelOrder(payload)
        }}
      />
    </div>
  )
}

