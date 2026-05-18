import { useCallback, useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import Modal from '@/components/ui/Modal'
import { useAuth } from '@/context/AuthContext'
import { db } from '@/lib/db'
import { useToast } from '@/hooks/useToast'
import { logActivity } from '@/lib/activityLogger'
import {
  DOC_KIND_OPTIONS,
  formatDate,
  formatDateTime,
  formatMoney,
  formatQty,
  parseJsonValue,
} from '@/lib/branchPurchasing'

const STATUS_FILTERS = [
  { key: 'all', label: 'Tum siparisler' },
  { key: 'updated', label: 'Degistirildi' },
  { key: 'cancelled', label: 'Iptal edildi' },
  { key: 'ready', label: 'Sevk bekleyen' },
  { key: 'awaiting_receipt', label: 'Mal kabul bekleniyor' },
  { key: 'received_full', label: 'Tam kabul' },
  { key: 'received_partial', label: 'Kismi kabul' },
]

const CONSOLIDATION_MODES = [
  { key: 'branch_product', label: 'Sube > Urun' },
  { key: 'product_branch', label: 'Urun > Sube' },
  { key: 'product_total', label: 'Konsolide urun' },
]
const ALL_SUPPLIERS_KEY = '__all__'

function getOrderMeta(order) {
  const parsed = parseJsonValue(order?.meta, {})
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
  return {}
}

function getSupplierChangeNotice(order) {
  const meta = getOrderMeta(order)
  const notice = parseJsonValue(meta?.supplier_change_notice, meta?.supplier_change_notice || null)
  if (notice && typeof notice === 'object' && !Array.isArray(notice)) return notice
  return null
}

function classifySupplierOrder(order) {
  const status = String(order?.status || '')
  const meta = getOrderMeta(order)
  const changeNotice = getSupplierChangeNotice(order)
  const sent = Boolean(meta.supplier_marked_sent || meta.supplier_sent_at)
  if (status === 'cancelled') return 'cancelled'
  if (changeNotice?.kind === 'updated') return 'updated'
  if (status === 'received') return 'received_full'
  if (status === 'partially_received') return 'received_partial'
  if (status === 'submitted' && sent) return 'awaiting_receipt'
  if (status === 'submitted') return 'ready'
  return 'other'
}

function groupConsolidationRows({ orders, lines, mode }) {
  const orderMap = new Map(orders.map(order => [order.id, order]))
  const rows = new Map()

  for (const line of lines) {
    const order = orderMap.get(line.order_id)
    if (!order) continue
    const product = line.item_name || line.item_sku || 'Urun yok'
    const branch = order.branch_name || 'Sube yok'
    const qty = Number(line.ordered_qty || 0)
    const amount = Number(line.line_total || 0)

    let key = ''
    let primary = ''
    let secondary = ''
    if (mode === 'product_branch') {
      key = `${product}__${branch}`
      primary = product
      secondary = branch
    } else if (mode === 'product_total') {
      key = product
      primary = product
      secondary = 'Tum subeler'
    } else {
      key = `${branch}__${product}`
      primary = branch
      secondary = product
    }

    const current = rows.get(key) || {
      key,
      primary,
      secondary,
      qty: 0,
      amount: 0,
      orderCount: 0,
    }
    current.qty += qty
    current.amount += amount
    current.orderCount += 1
    rows.set(key, current)
  }

  return [...rows.values()].sort((a, b) => {
    const left = `${a.primary} ${a.secondary}`
    const right = `${b.primary} ${b.secondary}`
    return left.localeCompare(right, 'tr')
  })
}

function StatusBadge({ bucket }) {
  const map = {
    updated: { label: 'Degistirildi', color: '#9a3412', bg: '#ffedd5' },
    cancelled: { label: 'Iptal edildi', color: '#991b1b', bg: '#fee2e2' },
    ready: { label: 'Sevk bekleyen', color: '#1d4ed8', bg: '#dbeafe' },
    awaiting_receipt: { label: 'Mal kabul bekleniyor', color: '#0f766e', bg: '#ccfbf1' },
    received_full: { label: 'Tam kabul', color: '#166534', bg: '#dcfce7' },
    received_partial: { label: 'Kismi kabul', color: '#92400e', bg: '#fef3c7' },
    other: { label: 'Bilgi', color: '#475569', bg: '#e2e8f0' },
  }
  const safe = map[bucket] || map.other
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '4px 10px',
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

export default function SupplierOrderPanel() {
  const toast = useToast()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState([])
  const [orderLines, setOrderLines] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [search, setSearch] = useState('')
  const [selectedSupplier, setSelectedSupplier] = useState(ALL_SUPPLIERS_KEY)
  const [statusFilter, setStatusFilter] = useState('all')
  const [consolidationMode, setConsolidationMode] = useState('branch_product')
  const [detailOrderId, setDetailOrderId] = useState('')
  const [dispatchOrder, setDispatchOrder] = useState(null)
  const [dispatchDraft, setDispatchDraft] = useState(null)
  const [dispatchSaving, setDispatchSaving] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')

  const loadBase = useCallback(async () => {
    setLoading(true)
    try {
      const [ordersResult, linesResult, suppliersResult] = await Promise.all([
        db.from('purchase_orders').select('*').is('deleted_at', null).order('order_date', { ascending: false }).order('created_at', { ascending: false }),
        db.from('purchase_order_lines').select('*').is('deleted_at', null).order('line_no'),
        db.from('suppliers').select('id,name').eq('active', true).order('name'),
      ])
      if (ordersResult.error) throw ordersResult.error
      if (linesResult.error) throw linesResult.error
      if (suppliersResult.error) throw suppliersResult.error
      setOrders(ordersResult.data || [])
      setOrderLines(linesResult.data || [])
      setSuppliers(suppliersResult.data || [])
    } catch (error) {
      toast(`Tedarikci panel verisi yuklenemedi: ${error?.message || 'Bilinmeyen hata'}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadBase()
  }, [loadBase])

  const visibleOrders = useMemo(() => {
    const text = search.trim().toLowerCase()
    return orders.filter(order => {
      const bucket = classifySupplierOrder(order)
      if (!['updated', 'cancelled', 'ready', 'awaiting_receipt', 'received_full', 'received_partial'].includes(bucket)) return false
      if (selectedSupplier !== ALL_SUPPLIERS_KEY && String(order.supplier_id || '') !== String(selectedSupplier)) return false
      if (statusFilter !== 'all' && bucket !== statusFilter) return false
      if (!text) return true
      const supplierName = suppliers.find(item => item.id === order.supplier_id)?.name || order.supplier_name || ''
      return [order.order_no, order.branch_name, supplierName, order.flow_name, order.description]
        .join(' ')
        .toLowerCase()
        .includes(text)
    })
  }, [orders, selectedSupplier, statusFilter, search, suppliers])

  const statusCounts = useMemo(() => {
    const counts = { all: 0, updated: 0, cancelled: 0, ready: 0, awaiting_receipt: 0, received_full: 0, received_partial: 0 }
    for (const order of orders) {
      const bucket = classifySupplierOrder(order)
      if (!counts[bucket] && bucket !== 'ready') continue
      if (['updated', 'cancelled', 'ready', 'awaiting_receipt', 'received_full', 'received_partial'].includes(bucket)) {
        counts.all += 1
        counts[bucket] += 1
      }
    }
    return counts
  }, [orders])

  const visibleOrderIds = useMemo(() => new Set(visibleOrders.map(order => order.id)), [visibleOrders])
  const visibleLines = useMemo(() => orderLines.filter(line => visibleOrderIds.has(line.order_id)), [orderLines, visibleOrderIds])
  const selectedOrder = useMemo(() => visibleOrders.find(order => order.id === detailOrderId) || null, [visibleOrders, detailOrderId])
  const selectedOrderLines = useMemo(
    () => orderLines.filter(line => line.order_id === detailOrderId).sort((a, b) => Number(a.line_no || 0) - Number(b.line_no || 0)),
    [orderLines, detailOrderId],
  )

  const consolidationOrders = useMemo(
    () => visibleOrders.filter(order => classifySupplierOrder(order) === 'ready'),
    [visibleOrders],
  )
  const consolidationOrderIds = useMemo(() => new Set(consolidationOrders.map(order => order.id)), [consolidationOrders])
  const consolidationLines = useMemo(
    () => visibleLines.filter(line => consolidationOrderIds.has(line.order_id)),
    [visibleLines, consolidationOrderIds],
  )
  const consolidationRows = useMemo(
    () => groupConsolidationRows({ orders: consolidationOrders, lines: consolidationLines, mode: consolidationMode }),
    [consolidationOrders, consolidationLines, consolidationMode],
  )

  function openDispatchModal(order) {
    setDispatchOrder(order)
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    setDispatchDraft({
      delivered_on: today,
      delivered_at: time,
      doc_kind: 'irsaliye',
      doc_date: today,
      doc_no: '',
      note: '',
      explanation: '',
      shipment_match: 'full',
    })
  }

  async function saveDispatch() {
    if (!dispatchOrder || !dispatchDraft) return
    setDispatchSaving(true)
    try {
      const meta = getOrderMeta(dispatchOrder)
      const nextMeta = {
        ...meta,
        supplier_marked_sent: true,
        supplier_sent_at: new Date().toISOString(),
        supplier_dispatch_variance: dispatchDraft.shipment_match === 'variance',
        supplier_change_notice: null,
        supplier_dispatch: {
          delivered_on: dispatchDraft.delivered_on || null,
          delivered_at: dispatchDraft.delivered_at || null,
          doc_kind: dispatchDraft.doc_kind || null,
          doc_date: dispatchDraft.doc_date || null,
          doc_no: dispatchDraft.doc_no?.trim() || null,
          note: dispatchDraft.note?.trim() || null,
          explanation: dispatchDraft.explanation?.trim() || null,
          shipment_match: dispatchDraft.shipment_match,
        },
      }

      const { error } = await db
        .from('purchase_orders')
        .update({ meta: nextMeta, updated_at: new Date().toISOString() })
        .eq('id', dispatchOrder.id)
      if (error) throw error

      await logActivity({
        user,
        actionType: 'purchase_order_update',
        route: '/supplier-order-panel',
        entityType: 'purchase_order',
        entityId: dispatchOrder.id,
        metadata: { action: 'supplier_dispatch_marked', shipment_match: dispatchDraft.shipment_match },
      })

      toast('Sevk bildirimi kaydedildi. Siparis mal kabul bekleniyor durumuna alindi.', 'success')
      setDispatchOrder(null)
      setDispatchDraft(null)
      await loadBase()
    } catch (error) {
      toast(`Sevk kaydi basarisiz: ${error?.message || 'Bilinmeyen hata'}`, 'error')
    } finally {
      setDispatchSaving(false)
    }
  }

  async function sendSupplierNote() {
    if (!selectedOrder || !noteDraft.trim()) return
    const meta = getOrderMeta(selectedOrder)
    const notes = Array.isArray(meta.supplier_notes) ? [...meta.supplier_notes] : []
    notes.push({
      id: `${Date.now()}`,
      text: noteDraft.trim(),
      created_at: new Date().toISOString(),
      created_by: user?.email || user?.id || 'supplier-user',
    })

    try {
      const { error } = await db
        .from('purchase_orders')
        .update({ meta: { ...meta, supplier_notes: notes }, updated_at: new Date().toISOString() })
        .eq('id', selectedOrder.id)
      if (error) throw error
      setNoteDraft('')
      toast('Siparis notu gonderildi.', 'success')
      await loadBase()
    } catch (error) {
      toast(`Not kaydedilemedi: ${error?.message || 'Bilinmeyen hata'}`, 'error')
    }
  }

  return (
    <div>
      <Header title="Tedarikci Siparis Paneli" subtitle="Tedarikci siparislerini sevk eder, not gonderir ve sevkiyat durumunu takip eder" />

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 12 }}>
          <input className="f-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Siparis no, sube, tedarikci veya akis ara..." />
          <select className="f-input" value={selectedSupplier} onChange={event => setSelectedSupplier(event.target.value)}>
            <option value={ALL_SUPPLIERS_KEY}>Tum tedarikciler</option>
            {suppliers.map(supplier => (
              <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {STATUS_FILTERS.map(filter => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setStatusFilter(filter.key)}
                style={{
                  border: `1.5px solid ${statusFilter === filter.key ? '#2563eb' : '#e2e8f0'}`,
                  background: statusFilter === filter.key ? '#eff6ff' : '#fff',
                  color: statusFilter === filter.key ? '#1d4ed8' : '#475569',
                  borderRadius: 999,
                  padding: '8px 14px',
                  fontWeight: 700,
                  fontSize: '.8rem',
                  cursor: 'pointer',
                }}
              >
                {filter.label} ({statusCounts[filter.key] || 0})
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden', marginBottom: 16 }}>
        {loading ? <div style={{ padding: 32, color: '#64748b' }}>Yukleniyor...</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
              <thead><tr style={{ background: '#f8fafc' }}>
                {['Siparis No', 'Sube', 'Aciklama', 'Durum', 'Teslim', 'Adet', 'Tutar', ''].map(label => <th key={label} style={{ padding: '12px 14px', borderBottom: '1px solid #e2e8f0', textAlign: ['Sube', 'Aciklama'].includes(label) ? 'left' : 'right', color: '#475569' }}>{label}</th>)}
              </tr></thead>
              <tbody>
                {visibleOrders.map(order => {
                  const bucket = classifySupplierOrder(order)
                  const meta = getOrderMeta(order)
                  const dispatch = meta.supplier_dispatch || {}
                  const changeNotice = getSupplierChangeNotice(order)
                  return (
                    <tr key={order.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800 }}>{order.order_no}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'left' }}>{order.branch_name || '-'}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'left', color: '#475569' }}>{order.description || '-'}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'grid', gap: 4, justifyItems: 'end' }}>
                          <StatusBadge bucket={bucket} />
                          {changeNotice?.kind === 'updated' && (
                            <span style={{ fontSize: '.72rem', color: '#9a3412', fontWeight: 800 }}>
                              Merkez siparisi degistirdi
                            </span>
                          )}
                          {bucket === 'cancelled' && (
                            <span style={{ fontSize: '.72rem', color: '#991b1b', fontWeight: 800 }}>
                              Bu siparis iptal edildi
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        {dispatch?.delivered_on ? formatDateTime(dispatch.delivered_on, dispatch.delivered_at || '') : (order.delivery_date ? formatDateTime(order.delivery_date, order.delivery_time || '') : '-')}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#0f766e' }}>{formatQty(order.total_qty)}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800 }}>₺{formatMoney(order.total_amount)}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button className="btn-o" onClick={() => setDetailOrderId(order.id)}>Detay</button>
                        {(bucket === 'ready' || bucket === 'updated') && <button className="btn-p" onClick={() => openDispatchModal(order)}>Sevk Et</button>}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ fontWeight: 800, color: '#0f172a' }}>Konsolidasyon (yalnizca sevk bekleyen siparisler)</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {CONSOLIDATION_MODES.map(mode => (
              <button key={mode.key} type="button" onClick={() => setConsolidationMode(mode.key)} style={{ border: `1.5px solid ${consolidationMode === mode.key ? '#0f766e' : '#e2e8f0'}`, background: consolidationMode === mode.key ? '#ecfeff' : '#fff', color: consolidationMode === mode.key ? '#0f766e' : '#475569', borderRadius: 999, padding: '8px 12px', fontWeight: 700, fontSize: '.78rem', cursor: 'pointer' }}>
                {mode.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
            <thead><tr style={{ background: '#f8fafc' }}><th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Kirilm 1</th><th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Kirilm 2</th><th style={{ padding: '10px 12px', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Adet</th><th style={{ padding: '10px 12px', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Tutar</th></tr></thead>
            <tbody>
              {consolidationRows.map(row => (
                <tr key={row.key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px' }}>{row.primary}</td>
                  <td style={{ padding: '10px 12px' }}>{row.secondary}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{formatQty(row.qty)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800 }}>₺{formatMoney(row.amount)}</td>
                </tr>
              ))}
              {consolidationRows.length === 0 && <tr><td colSpan={4} style={{ padding: 18, textAlign: 'center', color: '#94a3b8' }}>Konsolidasyon icin uygun siparis bulunmuyor.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={!!selectedOrder} onClose={() => setDetailOrderId('')} title={selectedOrder ? `Siparis Detayi - ${selectedOrder.order_no}` : 'Siparis Detayi'} width={1000} flex footer={<button className="btn-o" onClick={() => setDetailOrderId('')}>Kapat</button>}>
        {selectedOrder && (
          <div style={{ display: 'grid', gap: 14 }}>
            {(() => {
              const bucket = classifySupplierOrder(selectedOrder)
              const notice = getSupplierChangeNotice(selectedOrder)
              if (bucket === 'cancelled') {
                return (
                  <div style={{ border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 10, padding: '10px 12px', color: '#991b1b', fontWeight: 800, fontSize: '.82rem' }}>
                    Siparis merkez tarafindan iptal edildi. Gecmise donuk bilgi amacli goruntulenir.
                  </div>
                )
              }
              if (notice?.kind === 'updated') {
                return (
                  <div style={{ border: '1px solid #fed7aa', background: '#fff7ed', borderRadius: 10, padding: '10px 12px', color: '#9a3412', fontWeight: 800, fontSize: '.82rem' }}>
                    Siparis merkez tarafindan degistirildi. Guncel satirlari kontrol edin.
                  </div>
                )
              }
              return null
            })()}
            <div style={{ color: '#64748b', fontSize: '.82rem' }}>{selectedOrder.branch_name || '-'} • {selectedOrder.flow_name || '-'} • {formatDate(selectedOrder.order_date)}</div>
            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
                <thead><tr style={{ background: '#f8fafc' }}><th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #e2e8f0' }}>Urun</th><th style={{ textAlign: 'right', padding: '10px 12px', borderBottom: '1px solid #e2e8f0' }}>Adet</th><th style={{ textAlign: 'right', padding: '10px 12px', borderBottom: '1px solid #e2e8f0' }}>Birim Fiyat</th><th style={{ textAlign: 'right', padding: '10px 12px', borderBottom: '1px solid #e2e8f0' }}>Tutar</th></tr></thead>
                <tbody>
                  {selectedOrderLines.map((line, index) => <tr key={line.id || index} style={{ borderBottom: '1px solid #f1f5f9' }}><td style={{ padding: '10px 12px' }}>{line.item_name || '-'}</td><td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{formatQty(line.ordered_qty)}</td><td style={{ padding: '10px 12px', textAlign: 'right' }}>₺{formatMoney(line.unit_price)}</td><td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800 }}>₺{formatMoney(line.line_total)}</td></tr>)}
                </tbody>
              </table>
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
              <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>Siparis Notu Gonder</div>
              <textarea className="f-input" rows={3} value={noteDraft} onChange={event => setNoteDraft(event.target.value)} placeholder="Siparisi verene iletilecek not..." />
              <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn-p" onClick={sendSupplierNote}>Notu Gonder</button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!dispatchOrder} onClose={() => { if (!dispatchSaving) { setDispatchOrder(null); setDispatchDraft(null) } }} title={dispatchOrder ? `Sevk Et - ${dispatchOrder.order_no}` : 'Sevk Et'} width={760} flex footer={<><button className="btn-o" onClick={() => { setDispatchOrder(null); setDispatchDraft(null) }} disabled={dispatchSaving}>Vazgec</button><button className="btn-p" onClick={saveDispatch} disabled={dispatchSaving}>{dispatchSaving ? 'Kaydediliyor...' : 'Sevk Bildirimi Kaydet'}</button></>}>
        {dispatchDraft && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label className="f-label">Teslim Tarihi</label><input className="f-input" type="date" value={dispatchDraft.delivered_on} onChange={e => setDispatchDraft(prev => ({ ...prev, delivered_on: e.target.value }))} /></div>
              <div><label className="f-label">Teslim Saati</label><input className="f-input" type="time" value={dispatchDraft.delivered_at} onChange={e => setDispatchDraft(prev => ({ ...prev, delivered_at: e.target.value }))} /></div>
            </div>
            <div><label className="f-label">Sevk Belgesi</label><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{DOC_KIND_OPTIONS.map(option => <button key={option.value} type="button" onClick={() => setDispatchDraft(prev => ({ ...prev, doc_kind: option.value }))} style={{ border: `1.5px solid ${dispatchDraft.doc_kind === option.value ? '#16a34a' : '#e2e8f0'}`, background: dispatchDraft.doc_kind === option.value ? '#f0fdf4' : '#fff', color: dispatchDraft.doc_kind === option.value ? '#166534' : '#475569', borderRadius: 12, padding: '8px 10px', fontWeight: 700, fontSize: '.78rem', cursor: 'pointer' }}>{option.label}</button>)}</div></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label className="f-label">Belge Tarihi</label><input className="f-input" type="date" value={dispatchDraft.doc_date} onChange={e => setDispatchDraft(prev => ({ ...prev, doc_date: e.target.value }))} /></div>
              <div><label className="f-label">Belge No</label><input className="f-input" value={dispatchDraft.doc_no} maxLength={16} onChange={e => setDispatchDraft(prev => ({ ...prev, doc_no: e.target.value }))} placeholder="En fazla 16 karakter" /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label className="f-label">Not</label><input className="f-input" value={dispatchDraft.note} onChange={e => setDispatchDraft(prev => ({ ...prev, note: e.target.value }))} placeholder="Opsiyonel not" /></div>
              <div><label className="f-label">Aciklama</label><input className="f-input" value={dispatchDraft.explanation} onChange={e => setDispatchDraft(prev => ({ ...prev, explanation: e.target.value }))} placeholder="Opsiyonel aciklama" /></div>
            </div>
            <div>
              <label className="f-label">Gonderim Durumu</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => setDispatchDraft(prev => ({ ...prev, shipment_match: 'full' }))} style={{ border: `1.5px solid ${dispatchDraft.shipment_match === 'full' ? '#16a34a' : '#e2e8f0'}`, background: dispatchDraft.shipment_match === 'full' ? '#f0fdf4' : '#fff', color: dispatchDraft.shipment_match === 'full' ? '#166534' : '#475569', borderRadius: 12, padding: '8px 12px', fontWeight: 700, fontSize: '.78rem', cursor: 'pointer' }}>Siparis tam gonderildi</button>
                <button type="button" onClick={() => setDispatchDraft(prev => ({ ...prev, shipment_match: 'variance' }))} style={{ border: `1.5px solid ${dispatchDraft.shipment_match === 'variance' ? '#dc2626' : '#e2e8f0'}`, background: dispatchDraft.shipment_match === 'variance' ? '#fef2f2' : '#fff', color: dispatchDraft.shipment_match === 'variance' ? '#991b1b' : '#475569', borderRadius: 12, padding: '8px 12px', fontWeight: 700, fontSize: '.78rem', cursor: 'pointer' }}>Siparis eksik/fazla gonderildi</button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
