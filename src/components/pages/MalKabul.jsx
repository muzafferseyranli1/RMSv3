import { useCallback, useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import Modal from '@/components/ui/Modal'
import { useAuth } from '@/context/AuthContext'
import { useWorkspace } from '@/context/WorkspaceContext'
import { db } from '@/lib/db'
import { useToast } from '@/hooks/useToast'
import { logActivity } from '@/lib/activityLogger'
import { isBranchScopedScope } from '@/lib/workspace'
import {
  applyBranchFilter,
  asUuidOrNull,
  branchMatchesRecord,
  buildBalanceMap,
  buildInventoryBalanceRows,
  buildLatestPurchasePriceMap,
  DOC_KIND_OPTIONS,
  findBranchById,
  formatDate,
  formatMoney,
  formatQty,
  getAllBranches,
  getCompanyDefaults,
  getStoredBranchId,
  nextDocumentNo,
  parseJsonValue,
  safeDocNo,
  summarizeLines,
  todayStr,
} from '@/lib/branchPurchasing'

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

function DocKindField({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {DOC_KIND_OPTIONS.map(option => {
        const active = value === option.value
        return (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            style={{
              border: `1.5px solid ${active ? '#16a34a' : '#e2e8f0'}`,
              background: active ? '#f0fdf4' : '#fff',
              color: active ? '#166534' : '#475569',
              borderRadius: 12,
              padding: '9px 12px',
              fontWeight: 700,
              fontSize: '.82rem',
              cursor: 'pointer',
            }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function ReceiptEditorModal({
  open,
  title,
  subtitle,
  draft,
  stockOptions,
  manualMode,
  onClose,
  onSave,
}) {
  const toast = useToast()
  const [form, setForm] = useState(null)
  const [lines, setLines] = useState([])
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [addStockId, setAddStockId] = useState('')

  useEffect(() => {
    if (!open) return
    setForm(draft?.form || null)
    setLines((draft?.lines || []).map(line => ({ ...line })))
    setSearch('')
    setAddStockId('')
  }, [open, draft])

  if (!open || !form) return null

  const summary = summarizeLines(lines, form.vat_rate)
  const filteredOptions = stockOptions.filter(item => {
    if (lines.some(line => line.stock_item_id === item.id)) return false
    if (!search.trim()) return true
    const text = search.trim().toLowerCase()
    return [item.name, item.sku].filter(Boolean).join(' ').toLowerCase().includes(text)
  })

  function setFormValue(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function updateLine(lineId, key, value) {
    setLines(prev => prev.map(line => {
      if (line.id !== lineId && line.line_no !== lineId && line.stock_item_id !== lineId) return line
      const next = { ...line, [key]: value }
      const qty = Number(next.received_qty || 0)
      const unitPrice = Number(next.unit_price || 0)
      const vatRate = Number(next.vat_rate ?? form.vat_rate ?? 0.1)
      next.line_total = Number((qty * unitPrice).toFixed(4))
      next.line_total_vat_inc = Number((next.line_total * (1 + vatRate)).toFixed(4))
      return next
    }))
  }

  function addManualLine() {
    const stock = stockOptions.find(item => item.id === addStockId)
    if (!stock) {
      toast('Eklenecek stok mali secin', 'error')
      return
    }
    const qty = 0
    const unitPrice = Number(stock.purchase_price || 0)
    const vatRate = Number(form.vat_rate || 0.1)
    setLines(prev => [
      ...prev,
      {
        line_no: prev.length + 1,
        stock_item_id: stock.id,
        item_name: stock.name,
        item_sku: stock.sku || '',
        unit: stock.unit || '',
        suggested_qty: 0,
        ordered_qty: 0,
        calculated_need: 0,
        received_qty: qty,
        unit_price: unitPrice,
        vat_rate: vatRate,
        line_total: Number((qty * unitPrice).toFixed(4)),
        line_total_vat_inc: Number((qty * unitPrice * (1 + vatRate)).toFixed(4)),
        meta: {},
      },
    ])
    setAddStockId('')
  }

  async function save() {
    if (!form.supplier_id) {
      toast('Tedarikci secimi zorunludur', 'error')
      return
    }
    if (manualMode && !form.description?.trim()) {
      toast('Manuel mal kabulde aciklama zorunludur', 'error')
      return
    }
    if (form.doc_kind === 'belgesiz' && !form.explanation?.trim()) {
      toast('Belgesiz kabulde aciklama zorunludur', 'error')
      return
    }
    if (form.doc_kind !== 'belgesiz') {
      if (!form.doc_date) {
        toast('Belge tarihi zorunludur', 'error')
        return
      }
      if (!form.doc_no) {
        toast('Belge numarasi zorunludur', 'error')
        return
      }
    }
    const usableLines = lines.filter(line => Number(line.received_qty || 0) > 0)
    if (!usableLines.length) {
      toast('Teslim alinan miktari sifirdan buyuk en az bir satir girin', 'error')
      return
    }

    setSaving(true)
    try {
      await onSave({ form, lines: usableLines })
      onClose()
    } catch (error) {
      toast(error?.message || 'Mal kabul kaydedilemedi', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={1180}
      flex
      title={title}
      subtitle={subtitle}
      footer={(
        <>
          <button className="btn-o" onClick={onClose} disabled={saving}>Kapat</button>
          <button className="btn-p" onClick={save} disabled={saving}>
            {saving
              ? <><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }} />Kaydediliyor...</>
              : <><i className="fa-solid fa-check" style={{ marginRight: 6 }} />Mal Kabulu Kaydet ve Stoga Isle</>}
          </button>
        </>
      )}
    >
      <div style={{ display: 'grid', gap: 16 }}>
        {Array.isArray(form.supplier_notes) && form.supplier_notes.length > 0 && (
          <div style={{ border: '1px solid #bfdbfe', background: '#eff6ff', borderRadius: 12, padding: '10px 12px', display: 'grid', gap: 8 }}>
            <div style={{ color: '#1e40af', fontWeight: 800, fontSize: '.8rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Tedarikci Notu
            </div>
            {form.supplier_notes.slice(0, 3).map(note => (
              <div key={note.id || note.created_at} style={{ fontSize: '.82rem', color: '#1e3a8a' }}>
                {note.text || '-'}
                <div style={{ fontSize: '.72rem', color: '#64748b', marginTop: 2 }}>
                  {note.created_at ? new Date(note.created_at).toLocaleString('tr-TR') : ''}
                </div>
              </div>
            ))}
          </div>
        )}

        {form.supplier_dispatch_variance && (
          <div style={{ border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 12, padding: '10px 12px', color: '#991b1b', fontWeight: 700, fontSize: '.82rem' }}>
            Dikkat bu sevkiyat siparisinizden farkli gonderildi, kontrol et.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12 }}>
          <SummaryCard label="Siparis Toplami" value={`₺${formatMoney(summary.subtotal)}`} hint={`${formatQty(summary.totalQty)} kabul miktari`} />
          <SummaryCard label="Planlanan Teslim" value={form.planned_delivery_date ? formatDate(form.planned_delivery_date) : '—'} bg="#eff6ff" color="#1d4ed8" />
          <SummaryCard label="Teslim Tarihi" value={form.delivered_on ? formatDate(form.delivered_on) : '—'} hint={form.delivered_at || 'Saat girilmedi'} bg="#ecfeff" color="#0f766e" />
          <SummaryCard label="Belge Tipi" value={DOC_KIND_OPTIONS.find(option => option.value === form.doc_kind)?.label || '—'} bg="#fffbeb" color="#92400e" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12 }}>
          <div>
            <label className="f-label">Tedarikci</label>
            <select className="f-input" value={form.supplier_id} onChange={e => setFormValue('supplier_id', e.target.value)}>
              <option value="">Secin...</option>
              {form.suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </select>
          </div>
          <div>
            <label className="f-label">Teslim Tarihi</label>
            <input className="f-input" type="date" value={form.delivered_on} onChange={e => setFormValue('delivered_on', e.target.value)} />
          </div>
          <div>
            <label className="f-label">Teslim Saati</label>
            <input className="f-input" type="time" value={form.delivered_at} onChange={e => setFormValue('delivered_at', e.target.value)} />
          </div>
          <div>
            <label className="f-label">Belge No</label>
            <input className="f-input" value={form.doc_no} onChange={e => setFormValue('doc_no', safeDocNo(e.target.value))} placeholder="En fazla 16 karakter" />
          </div>
        </div>

        <div>
          <label className="f-label">Sevk Belgesi</label>
          <DocKindField value={form.doc_kind} onChange={value => setFormValue('doc_kind', value)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <label className="f-label">Belge Tarihi</label>
            <input className="f-input" type="date" value={form.doc_date} onChange={e => setFormValue('doc_date', e.target.value)} />
          </div>
          <div>
            <label className="f-label">Not</label>
            <input className="f-input" value={form.note} onChange={e => setFormValue('note', e.target.value)} placeholder="Teslim alan personel notu" />
          </div>
          <div>
            <label className="f-label">Aciklama</label>
            <input className="f-input" value={form.explanation} onChange={e => setFormValue('explanation', e.target.value)} placeholder="Belgesiz kabulde zorunlu" />
          </div>
        </div>

        <div>
          <label className="f-label">Aciklama</label>
          <input className="f-input" value={form.description} onChange={e => setFormValue('description', e.target.value)} placeholder="Siparis veya teslim aciklamasi" />
        </div>

        {manualMode && (
          <div className="card" style={{ padding: 16, background: '#f8fafc', border: '1px dashed #cbd5e1' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px 140px', gap: 10 }}>
              <input className="f-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Stok mali ara..." />
              <select className="f-input" value={addStockId} onChange={e => setAddStockId(e.target.value)}>
                <option value="">Secin...</option>
                {filteredOptions.map(item => (
                  <option key={item.id} value={item.id}>{item.name}{item.sku ? ` • ${item.sku}` : ''}</option>
                ))}
              </select>
              <button className="btn-p" onClick={addManualLine}>
                <i className="fa-solid fa-plus" /> Mal Ekle
              </button>
            </div>
          </div>
        )}

        <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Stok Mali Adi', 'SKU', 'Birim', 'Siparis Onerisi', 'Siparis', 'Ihtiyac', 'Teslim Alinan', 'Birim Fiyati', 'Tutar', 'KDV Dahil'].map(label => (
                    <th key={label} style={{ padding: '10px 12px', textAlign: label === 'Stok Mali Adi' ? 'left' : 'right', borderBottom: '1px solid #e2e8f0', color: '#475569', whiteSpace: 'nowrap' }}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={line.id || line.stock_item_id || index} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 12px', minWidth: 220, fontWeight: 700, color: '#0f172a' }}>{line.item_name}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#64748b' }}>{line.item_sku || '—'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#64748b' }}>{line.unit || '—'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#0f766e', fontWeight: 700 }}>{formatQty(line.suggested_qty)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#1d4ed8', fontWeight: 700 }}>{formatQty(line.ordered_qty)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#475569', fontWeight: 700 }}>{formatQty(line.calculated_need)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <input className="f-input" type="number" step="any" min="0" value={line.received_qty} onChange={e => updateLine(line.id || line.stock_item_id || line.line_no, 'received_qty', e.target.value)} style={{ width: 120, marginLeft: 'auto', textAlign: 'right', fontWeight: 700 }} />
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <input className="f-input" type="number" step="any" min="0" value={line.unit_price} onChange={e => updateLine(line.id || line.stock_item_id || line.line_no, 'unit_price', e.target.value)} style={{ width: 120, marginLeft: 'auto', textAlign: 'right', fontWeight: 700 }} />
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>₺{formatMoney(line.line_total)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#166534' }}>₺{formatMoney(line.line_total_vat_inc)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function stockVisibleInBranch(item, branchId) {
  const locations = parseJsonValue(item?.location, [])
  if (!locations.length) return true
  const ids = new Set()
  for (const row of locations) {
    if (row?.type === 'branch' && row.id) ids.add(row.id)
    if (row?.type === 'template') {
      for (const id of row.branchIds || []) ids.add(id)
    }
  }
  return ids.has(branchId)
}

function getOrderMeta(order) {
  const parsed = parseJsonValue(order?.meta, {})
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
  return {}
}

function getSupplierDispatch(order) {
  const meta = getOrderMeta(order)
  const dispatch = parseJsonValue(meta?.supplier_dispatch, meta?.supplier_dispatch || {})
  if (dispatch && typeof dispatch === 'object' && !Array.isArray(dispatch)) return dispatch
  return {}
}

function hasSupplierDispatchVariance(order) {
  const meta = getOrderMeta(order)
  const dispatch = getSupplierDispatch(order)
  return Boolean(
    meta?.supplier_dispatch_variance ||
    dispatch?.shipment_match === 'variance',
  )
}

function getSupplierNotes(order) {
  const meta = getOrderMeta(order)
  const list = Array.isArray(meta?.supplier_notes) ? meta.supplier_notes.filter(Boolean) : []
  return list.sort((left, right) => String(right?.created_at || '').localeCompare(String(left?.created_at || '')))
}

export default function MalKabul() {
  const toast = useToast()
  const { user } = useAuth()
  const { scope, branchId: workspaceBranchId } = useWorkspace()
  const branchLocked = isBranchScopedScope(scope) && !!workspaceBranchId
  const [loading, setLoading] = useState(true)
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const [orders, setOrders] = useState([])
  const [orderLines, setOrderLines] = useState([])
  const [receipts, setReceipts] = useState([])
  const [receiptLines, setReceiptLines] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [stockItems, setStockItems] = useState([])
  const [branches, setBranches] = useState([])
  const [taxes, setTaxes] = useState([])
  const [companyTreeValue, setCompanyTreeValue] = useState([])
  const [selectedBranch, setSelectedBranch] = useState('')
  const [balanceRows, setBalanceRows] = useState([])
  const [purchaseMovementRows, setPurchaseMovementRows] = useState([])
  const [search, setSearch] = useState('')
  const [editorState, setEditorState] = useState(null)
  const selectedBranchRecord = useMemo(
    () => findBranchById(branches, selectedBranch),
    [branches, selectedBranch],
  )

  const companyDefaults = useMemo(
    () => getCompanyDefaults(companyTreeValue, taxes),
    [companyTreeValue, taxes],
  )

  const loadBase = useCallback(async () => {
    setLoading(true)
    try {
      const [
        ordersResult,
        linesResult,
        receiptsResult,
        receiptLinesResult,
        suppliersResult,
        stockItemsResult,
        taxesResult,
        settingsResult,
      ] = await Promise.all([
        db.from('purchase_orders').select('*').is('deleted_at', null).order('delivery_date', { ascending: true }).order('created_at', { ascending: false }),
        db.from('purchase_order_lines').select('*').is('deleted_at', null).order('line_no'),
        db.from('purchase_receipts').select('*').is('deleted_at', null).order('delivered_on', { ascending: false }).order('created_at', { ascending: false }),
        db.from('purchase_receipt_lines').select('*').is('deleted_at', null),
        db.from('suppliers').select('id,name').eq('active', true).order('name'),
        db.from('stock_items').select('id,name,sku,unit,purchase_price,location').is('deleted_at', null).order('name'),
        db.from('taxes').select('id,name,rate').order('rate'),
        db.from('settings').select('value').eq('key', 'company_tree').single(),
      ])

      if (ordersResult.error) throw ordersResult.error
      if (linesResult.error) throw linesResult.error
      if (receiptsResult.error) throw receiptsResult.error
      if (receiptLinesResult.error) throw receiptLinesResult.error
      if (suppliersResult.error) throw suppliersResult.error
      if (stockItemsResult.error) throw stockItemsResult.error
      if (taxesResult.error) throw taxesResult.error
      if (settingsResult.error) throw settingsResult.error

      const nextBranches = getAllBranches(settingsResult.data?.value)
      const rememberedBranch = branchLocked ? workspaceBranchId : getStoredBranchId()
      const initialBranch = nextBranches.find(branch => branch.id === rememberedBranch)?.id || nextBranches[0]?.id || ''

      setOrders(ordersResult.data || [])
      setOrderLines(linesResult.data || [])
      setReceipts(receiptsResult.data || [])
      setReceiptLines(receiptLinesResult.data || [])
      setSuppliers(suppliersResult.data || [])
      setStockItems(stockItemsResult.data || [])
      setTaxes(taxesResult.data || [])
      setCompanyTreeValue(settingsResult.data?.value || [])
      setBranches(nextBranches)
      setSelectedBranch(prev => (
        branchLocked
          ? (nextBranches.find(branch => branch.id === workspaceBranchId)?.id || initialBranch)
          : (prev || initialBranch)
      ))
    } catch (error) {
      toast(`Mal kabul verileri yuklenemedi: ${error?.message || 'Bilinmeyen hata'}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [branchLocked, toast, workspaceBranchId])

  const loadInventory = useCallback(async branchId => {
    const branch = findBranchById(branches, branchId)
    if (!branch) {
      setBalanceRows([])
      setPurchaseMovementRows([])
      return
    }
    setInventoryLoading(true)
    try {
      const movementQuery = applyBranchFilter(
        db
          .from('inventory_movements')
          .select('stock_item_id,unit_cost,movement_at,ledger_seq,branch_id,branch_name,movement_type,balance_qty_after,balance_total_cost_after,avg_unit_cost_after')
          .eq('item_type', 'stock_item')
          .is('deleted_at', null)
          .eq('is_cancelled', false)
          .order('movement_at', { ascending: false })
          .order('ledger_seq', { ascending: false })
          .limit(5000),
        branch,
      )

      const movementResult = await movementQuery
      if (movementResult.error) throw movementResult.error

      const movementRows = movementResult.data || []
      setBalanceRows(buildInventoryBalanceRows(movementRows))
      setPurchaseMovementRows(movementRows.filter(row => row.movement_type === 'purchase_receipt'))
    } catch (error) {
      toast(`Stok bakiyeleri okunamadi: ${error?.message || 'Bilinmeyen hata'}`, 'error')
    } finally {
      setInventoryLoading(false)
    }
  }, [branches, toast])

  useEffect(() => {
    loadBase()
  }, [loadBase])

  useEffect(() => {
    if (!selectedBranch) return
    loadInventory(selectedBranch)
  }, [selectedBranch, loadInventory])

  useEffect(() => {
    if (!branchLocked || !workspaceBranchId) return
    setSelectedBranch(current => (current === workspaceBranchId ? current : workspaceBranchId))
  }, [branchLocked, workspaceBranchId])

  const receivedByOrderLine = useMemo(() => {
    return receiptLines.reduce((map, line) => {
      if (!line.order_line_id) return map
      map.set(line.order_line_id, (map.get(line.order_line_id) || 0) + Number(line.received_qty || 0))
      return map
    }, new Map())
  }, [receiptLines])

  const branchOrders = useMemo(() => (
    orders.filter(order =>
      branchMatchesRecord(order, selectedBranchRecord) &&
      ['submitted', 'partially_received'].includes(order.status),
    )
  ), [orders, selectedBranchRecord])

  const filteredOrders = useMemo(() => {
    const text = search.trim().toLowerCase()
    return branchOrders.filter(order => {
      if (!text) return true
      const supplier = suppliers.find(item => item.id === order.supplier_id)?.name || order.supplier_name || ''
      return [order.order_no, order.flow_name, order.description, supplier]
        .join(' ')
        .toLowerCase()
        .includes(text)
    })
  }, [branchOrders, search, suppliers])

  const summary = useMemo(() => {
    return filteredOrders.reduce((acc, order) => {
      acc.count += 1
      acc.total += Number(order.total_amount || 0)
      acc.qty += Number(order.total_qty || 0)
      return acc
    }, { count: 0, total: 0, qty: 0 })
  }, [filteredOrders])

  function buildOrderDraft(order) {
    const today = todayStr()
    const vatRate = Number(companyDefaults.purchaseVatRate || 0.1)
    const supplierDispatch = getSupplierDispatch(order)
    const supplierDispatchVariance = hasSupplierDispatchVariance(order)
    const supplierNotes = getSupplierNotes(order)
    const lines = orderLines
      .filter(line => line.order_id === order.id)
      .map(line => {
        const alreadyReceived = Number(receivedByOrderLine.get(line.id) || 0)
        const remaining = Math.max(Number(line.ordered_qty || 0) - alreadyReceived, 0)
        const unitPrice = Number(line.unit_price || 0)
        return {
          order_line_id: line.id,
          stock_item_id: line.stock_item_id,
          item_name: line.item_name,
          item_sku: line.item_sku || '',
          unit: line.unit || '',
          suggested_qty: Number(line.suggested_qty || 0),
          ordered_qty: Number(line.ordered_qty || 0),
          calculated_need: Number(line.calculated_need || 0),
          received_qty: remaining,
          unit_price: unitPrice,
          vat_rate: vatRate,
          line_total: Number((remaining * unitPrice).toFixed(4)),
          line_total_vat_inc: Number((remaining * unitPrice * (1 + vatRate)).toFixed(4)),
          meta: line.meta || {},
        }
      })

    return {
      form: {
        receipt_no: nextDocumentNo('MK', today, receipts.map(receipt => receipt.receipt_no)),
        order_id: order.id,
        order_no: order.order_no,
        flow_name: order.flow_name || '',
        supplier_id: order.supplier_id,
        description: order.description || '',
        planned_delivery_date: order.delivery_date || '',
        delivered_on: supplierDispatch.delivered_on || today,
        delivered_at: supplierDispatch.delivered_at || '',
        doc_kind: supplierDispatch.doc_kind || 'irsaliye',
        doc_date: supplierDispatch.doc_date || today,
        doc_no: supplierDispatch.doc_no || '',
        note: supplierDispatch.note || '',
        explanation: supplierDispatch.explanation || '',
        supplier_dispatch_variance: supplierDispatchVariance,
        supplier_notes: supplierNotes,
        vat_rate: vatRate,
        suppliers,
      },
      lines,
    }
  }

  function buildManualDraft() {
    const today = todayStr()
    const vatRate = Number(companyDefaults.purchaseVatRate || 0.1)
    return {
      form: {
        receipt_no: nextDocumentNo('MK', today, receipts.map(receipt => receipt.receipt_no)),
        order_id: null,
        order_no: '',
        flow_name: '',
        supplier_id: '',
        description: '',
        planned_delivery_date: '',
        delivered_on: today,
        delivered_at: '',
        doc_kind: 'irsaliye',
        doc_date: today,
        doc_no: '',
        note: '',
        explanation: '',
        vat_rate: vatRate,
        suppliers,
      },
      lines: [],
    }
  }

  async function persistReceipt({ form, lines }) {
    const supplier = suppliers.find(item => item.id === form.supplier_id)
    const branch = selectedBranchRecord
    const balanceMap = buildBalanceMap(balanceRows)
    const totals = summarizeLines(lines, form.vat_rate)

    const receiptPayload = {
      receipt_no: form.receipt_no,
      order_id: form.order_id || null,
      order_no: form.order_no || null,
      branch_id: asUuidOrNull(branch?.id),
      branch_name: branch?.name || '',
      supplier_id: form.supplier_id,
      supplier_name: supplier?.name || '',
      flow_name: form.flow_name || null,
      description: form.description?.trim() || null,
      planned_delivery_date: form.planned_delivery_date || null,
      delivered_on: form.delivered_on,
      delivered_at: form.delivered_at || null,
      doc_kind: form.doc_kind,
      doc_date: form.doc_date || null,
      doc_no: form.doc_no || null,
      note: form.note?.trim() || null,
      explanation: form.explanation?.trim() || null,
      status: 'completed',
      total_qty: totals.totalQty,
      subtotal: totals.subtotal,
      total_amount: totals.subtotal,
      total_amount_vat_inc: totals.totalVatIncluded,
      meta: {},
    }

    const { data: receiptRow, error: receiptError } = await db
      .from('purchase_receipts')
      .insert(receiptPayload)
      .select('*')
      .single()
    if (receiptError) throw receiptError

    const linePayloads = lines.map((line, index) => ({
      receipt_id: receiptRow.id,
      order_id: form.order_id || null,
      order_line_id: line.order_line_id || null,
      stock_item_id: line.stock_item_id,
      item_name: line.item_name,
      item_sku: line.item_sku || '',
      unit: line.unit || '',
      suggested_qty: Number(line.suggested_qty || 0),
      ordered_qty: Number(line.ordered_qty || 0),
      calculated_need: Number(line.calculated_need || 0),
      received_qty: Number(line.received_qty || 0),
      unit_price: Number(line.unit_price || 0),
      vat_rate: Number(line.vat_rate ?? form.vat_rate ?? 0.1),
      line_total: Number(line.line_total || (Number(line.received_qty || 0) * Number(line.unit_price || 0))),
      line_total_vat_inc: Number(line.line_total_vat_inc || (Number(line.line_total || 0) * (1 + Number(line.vat_rate ?? form.vat_rate ?? 0.1)))),
      notes: null,
      meta: {},
      line_no: index + 1,
    }))

    const { data: insertedLines, error: lineInsertError } = await db
      .from('purchase_receipt_lines')
      .insert(linePayloads)
      .select('*')
    if (lineInsertError) {
      await db.from('purchase_receipts').delete().eq('id', receiptRow.id)
      throw lineInsertError
    }

    const currentBalances = new Map(balanceMap)
    const movementRows = insertedLines.map(line => {
      const previous = currentBalances.get(line.stock_item_id)
      const prevQty = Number(previous?.balance_qty_after || 0)
      const prevTotalCost = Number(previous?.balance_total_cost_after || 0)
      const receivedQty = Number(line.received_qty || 0)
      const totalCost = Number(line.line_total || 0)
      const nextQty = prevQty + receivedQty
      const nextTotalCost = prevTotalCost + totalCost
      const nextAvg = nextQty > 0 ? nextTotalCost / nextQty : Number(line.unit_price || 0)

      currentBalances.set(line.stock_item_id, {
        balance_qty_after: nextQty,
        balance_total_cost_after: nextTotalCost,
        avg_unit_cost_after: nextAvg,
      })

      return {
        item_type: 'stock_item',
        stock_item_id: line.stock_item_id,
        semi_item_id: null,
        item_name: line.item_name,
        item_sku: line.item_sku || null,
        unit: line.unit || null,
        branch_id: asUuidOrNull(branch?.id),
        branch_name: branch?.name || '',
        movement_type: 'purchase_receipt',
        source_doc_type: 'purchase_receipt',
        direction: 'in',
        movement_at: `${form.delivered_on}T${form.delivered_at || '00:00'}:00`,
        quantity: receivedQty,
        source_doc_id: receiptRow.id,
        source_doc_line_id: line.id,
        source_doc_no: receiptRow.receipt_no,
        source_doc_ref: receiptRow.order_no || receiptRow.doc_no || null,
        supplier_id: form.supplier_id,
        unit_cost: Number(line.unit_price || 0),
        total_cost: totalCost,
        avg_unit_cost_after: nextAvg,
        balance_qty_after: nextQty,
        balance_total_cost_after: nextTotalCost,
        calc_status: 'calculated',
        notes: form.note?.trim() || null,
        meta: {
          doc_kind: form.doc_kind,
          doc_no: form.doc_no || null,
          order_id: form.order_id || null,
          order_no: form.order_no || null,
        },
      }
    })

    const { data: insertedMovements, error: movementError } = await db
      .from('inventory_movements')
      .insert(movementRows)
      .select('id,source_doc_line_id')
    if (movementError) {
      await db.from('purchase_receipt_lines').delete().eq('receipt_id', receiptRow.id)
      await db.from('purchase_receipts').delete().eq('id', receiptRow.id)
      throw movementError
    }

    for (const movement of insertedMovements || []) {
      await db
        .from('purchase_receipt_lines')
        .update({ inventory_movement_id: movement.id })
        .eq('id', movement.source_doc_line_id)
    }

    await db
      .from('purchase_receipts')
      .update({ inventory_posted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', receiptRow.id)

    if (form.order_id) {
      const previousLines = receiptLines.filter(line => line.order_id === form.order_id)
      const receivedTotals = new Map()
      for (const line of previousLines) {
        if (!line.order_line_id) continue
        receivedTotals.set(line.order_line_id, (receivedTotals.get(line.order_line_id) || 0) + Number(line.received_qty || 0))
      }
      for (const line of insertedLines) {
        if (!line.order_line_id) continue
        receivedTotals.set(line.order_line_id, (receivedTotals.get(line.order_line_id) || 0) + Number(line.received_qty || 0))
      }

      const relatedOrderLines = orderLines.filter(line => line.order_id === form.order_id)
      const fullyReceived = relatedOrderLines.every(line => (receivedTotals.get(line.id) || 0) >= Number(line.ordered_qty || 0))

      await db
        .from('purchase_orders')
        .update({
          status: fullyReceived ? 'received' : 'partially_received',
          updated_at: new Date().toISOString(),
        })
        .eq('id', form.order_id)

      await logActivity({
        user,
        actionType: 'purchase_order_update',
        route: '/mal-kabul',
        entityType: 'purchase_order',
        entityId: form.order_id,
        metadata: {
          source: 'purchase_receipt',
          status: fullyReceived ? 'received' : 'partially_received',
          receipt_id: receiptRow.id,
        },
      })
    }

    const { error: recalcError } = await db.rpc('process_inventory_recalc_jobs', { p_limit: 200 })
    if (recalcError) {
      toast(`Mal kabul kaydedildi ama maliyet recalc calismadi: ${recalcError.message}`, 'info')
    }

    await logActivity({
      user,
      actionType: 'purchase_receipt_create',
      route: '/mal-kabul',
      entityType: 'purchase_receipt',
      entityId: receiptRow.id,
      metadata: {
        branch_id: branch?.id || null,
        supplier_id: form.supplier_id,
        order_id: form.order_id || null,
        line_count: insertedLines.length,
        total_amount: totals.subtotal,
      },
    })

    toast('Mal kabul kaydedildi ve stok guncellendi', 'success')
    await loadBase()
    await loadInventory(selectedBranch)
  }

  const visibleStockItems = useMemo(() => {
    const priceMap = buildLatestPurchasePriceMap(purchaseMovementRows, asUuidOrNull(selectedBranchRecord?.id) || '')
    return stockItems
      .filter(item => stockVisibleInBranch(item, selectedBranch))
      .map(item => ({
        ...item,
        purchase_price: priceMap.get(item.id) || Number(item.purchase_price || 0),
      }))
  }, [stockItems, purchaseMovementRows, selectedBranch, selectedBranchRecord])

  return (
    <div>
      <Header
        title="Mal Kabul"
        subtitle={`${selectedBranchRecord?.name || 'Sube secin'} subesi`}
        actions={(
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select
              className="f-input"
              value={selectedBranch}
              onChange={e => setSelectedBranch(e.target.value)}
              style={{ minWidth: 220 }}
              disabled={branchLocked}
            >
              {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
            <button className="btn-o" onClick={() => { loadBase(); loadInventory(selectedBranch) }}>
              <i className="fa-solid fa-rotate-right" /> Yenile
            </button>
            <button className="btn-p" onClick={() => setEditorState({
              type: 'manual',
              title: 'Manuel Mal Kabul',
              subtitle: `${selectedBranchRecord?.name || 'Sube'} • Siparis disi kabul`,
              draft: buildManualDraft(),
            })}>
              <i className="fa-solid fa-plus" /> Manuel Mal Kabul
            </button>
          </div>
        )}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12, marginBottom: 16 }}>
        <SummaryCard label="Bekleyen Siparis" value={summary.count} />
        <SummaryCard label="Toplam Adet" value={formatQty(summary.qty)} bg="#ecfeff" color="#0f766e" />
        <SummaryCard label="Toplam Tutar" value={`₺${formatMoney(summary.total)}`} bg="#eef2ff" color="#4338ca" />
        <SummaryCard label="Son Mal Kabul" value={receipts[0]?.receipt_no || '—'} hint={receipts[0]?.delivered_on ? formatDate(receipts[0].delivered_on) : 'Kayit yok'} bg="#fffbeb" color="#92400e" />
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ position: 'relative', maxWidth: 420 }}>
          <i className="fa-solid fa-magnifying-glass" style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#94a3b8',
            fontSize: '.82rem',
          }} />
          <input className="f-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Siparis no, akis, aciklama veya tedarikci ara..." style={{ paddingLeft: 34 }} />
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '1.4rem' }} />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1rem' }}>Mal kabule dusen siparis bulunmuyor</div>
            <p style={{ color: '#94a3b8', marginTop: 6 }}>Siparis verildi durumundaki kayitlar burada listelenir.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Siparis No', 'Is Akisi Tanimi', 'Aciklama', 'Siparis Teslim Tarihi', 'Siparis Teslim Saati', 'Toplam Adet', 'Toplam Tutar', 'Kabul', ''].map(label => (
                    <th key={label} style={{ padding: '12px 14px', borderBottom: '1px solid #e2e8f0', textAlign: label === 'Aciklama' || label === 'Is Akisi Tanimi' ? 'left' : 'right', color: '#475569', whiteSpace: 'nowrap' }}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map(order => {
                  const overdue = order.delivery_date && order.delivery_date < todayStr()
                  const supplierDispatchVariance = hasSupplierDispatchVariance(order)
                  return (
                    <tr key={order.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>{order.order_no}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 700, color: '#334155' }}>{order.flow_name || '—'}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'left', color: '#64748b' }}>{order.description || '—'}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: overdue ? '#b91c1c' : '#334155', fontWeight: 700 }}>
                        {order.delivery_date ? formatDate(order.delivery_date) : '—'}{overdue ? ' • Gecikti' : ''}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: overdue ? '#b91c1c' : '#334155', fontWeight: 700 }}>{order.delivery_time || '—'}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#0f766e' }}>{formatQty(order.total_qty)}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>₺{formatMoney(order.total_amount)}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: order.status === 'partially_received' ? '#92400e' : '#1d4ed8', fontWeight: 700 }}>
                        <div style={{ display: 'grid', gap: 4, justifyItems: 'end' }}>
                          <span>{order.status === 'partially_received' ? 'Kismi kabul acik' : 'Bekliyor'}</span>
                          {supplierDispatchVariance && (
                            <span style={{ fontSize: '.72rem', color: '#b91c1c', fontWeight: 800 }}>
                              Dikkat: Sevkiyat siparisten farkli gonderildi.
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <button className="btn-o" onClick={() => setEditorState({
                          type: 'order',
                          order,
                          title: `Mal Kabul • ${order.order_no}`,
                          subtitle: `${order.flow_name || 'Siparis'} • ${suppliers.find(item => item.id === order.supplier_id)?.name || order.supplier_name || 'Tedarikci'}`,
                          draft: buildOrderDraft(order),
                        })}>
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

      <ReceiptEditorModal
        open={!!editorState}
        title={editorState?.title}
        subtitle={editorState?.subtitle}
        draft={editorState?.draft}
        stockOptions={visibleStockItems}
        manualMode={editorState?.type === 'manual'}
        onClose={() => setEditorState(null)}
        onSave={persistReceipt}
      />
    </div>
  )
}
