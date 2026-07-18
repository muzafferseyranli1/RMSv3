import React, { useState, useEffect, useMemo } from 'react'
import { db } from '../../lib/db'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useToast } from '../../hooks/useToast'

function SectionHead({ label }) {
  return (
    <div style={{ fontSize: '.83rem', fontWeight: 700, color: '#475569', borderBottom: '1px solid #e2e8f0', paddingBottom: 6, marginBottom: 12, marginTop: 12 }}>
      {label}
    </div>
  )
}

function parseJson(val, fallback = {}) {
  if (!val) return fallback
  if (typeof val === 'object') return val
  try { return JSON.parse(val) } catch { return fallback }
}

export default function MutfakOrders() {
  const toast = useToast()
  const { branchId, branchName, branches } = useWorkspace()

  const [loading, setLoading] = useState(true)
  const [kitchenSupplier, setKitchenSupplier] = useState(null)
  const [orders, setOrders] = useState([])
  const [activeTab, setActiveTab] = useState('pending') // 'pending' | 'sent' | 'all'
  const [searchQuery, setSearchQuery] = useState('')
  const [stockItemsMap, setStockItemsMap] = useState(new Map())
  const [semiItemsMap, setSemiItemsMap] = useState(new Map())

  // Modal State
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [orderLines, setOrderLines] = useState([])
  const [dispatchSaving, setDispatchSaving] = useState(false)
  const [dispatchForm, setDispatchForm] = useState({
    delivered_on: new Date().toISOString().slice(0, 10),
    doc_kind: 'İrsaliye',
    doc_no: '',
    plate_number: '',
    note: ''
  })

  // 1. Fetch kitchen supplier record for current branch
  useEffect(() => {
    async function loadKitchenSupplier() {
      if (!branchId) return
      try {
        const { data, error } = await db
          .from('suppliers')
          .select('*')
          .eq('supplier_kind', 'internal_kitchen')
          .eq('source_branch_id', branchId)
          .eq('active', true)
          .maybeSingle()

        if (error) throw error
        setKitchenSupplier(data)
      } catch (err) {
        console.error('Mutfak tedarikçi kaydı okunamadı:', err)
        toast('Mutfak tedarikçi kaydı alınamadı: ' + err.message, 'error')
      }
    }
    loadKitchenSupplier()
  }, [branchId])

  // 2. Load stock items and semi items for item info lookup
  useEffect(() => {
    async function loadItemMaps() {
      try {
        const [{ data: stocks }, { data: semis }] = await Promise.all([
          db.from('stock_items').select('id, name, sku, unit'),
          db.from('semi_items').select('id, name, sku, recipe_output_unit')
        ])

        const sMap = new Map()
        ;(stocks || []).forEach(s => sMap.set(s.id, s))
        setStockItemsMap(sMap)

        const smMap = new Map()
        ;(semis || []).forEach(s => smMap.set(s.id, s))
        setSemiItemsMap(smMap)
      } catch (err) {
        console.error('Stok/Yarı mamul eşleşme verisi alınamadı:', err)
      }
    }
    loadItemMaps()
  }, [])

  // 3. Fetch incoming orders for this kitchen
  async function fetchOrders() {
    if (!kitchenSupplier?.id) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data, error } = await db
        .from('purchase_orders')
        .select('*')
        .eq('supplier_id', kitchenSupplier.id)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })

      if (error) throw error
      setOrders(data || [])
    } catch (err) {
      console.error('Mutfak siparişleri yüklenemedi:', err)
      toast('Siparişler yüklenirken hata oluştu: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (kitchenSupplier?.id) {
      fetchOrders()
    }
  }, [kitchenSupplier?.id])

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    return orders.filter(ord => {
      const meta = parseJson(ord.meta, {})
      const isSent = Boolean(meta.supplier_marked_sent || meta.supplier_sent_at)

      if (activeTab === 'pending' && isSent) return false
      if (activeTab === 'sent' && !isSent) return false

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const orderNo = String(ord.order_no || '').toLowerCase()
        const bName = String(ord.branch_name || '').toLowerCase()
        if (!orderNo.includes(q) && !bName.includes(q)) return false
      }

      return true
    })
  }, [orders, activeTab, searchQuery])

  // Order Counts
  const counts = useMemo(() => {
    let pending = 0
    let sent = 0
    orders.forEach(ord => {
      const meta = parseJson(ord.meta, {})
      if (meta.supplier_marked_sent || meta.supplier_sent_at) {
        sent++
      } else {
        pending++
      }
    })
    return { pending, sent, total: orders.length }
  }, [orders])

  // Open Dispatch Modal
  async function openDispatchModal(order) {
    setSelectedOrder(order)
    setDispatchForm({
      delivered_on: new Date().toISOString().slice(0, 10),
      doc_kind: 'İrsaliye',
      doc_no: '',
      plate_number: '',
      note: ''
    })

    // Fetch Order Lines
    try {
      const { data, error } = await db
        .from('purchase_order_lines')
        .select('*')
        .eq('order_id', order.id)
        .order('line_no', { ascending: true })

      if (error) throw error

      const mappedLines = (data || []).map(line => {
        const stockItem = stockItemsMap.get(line.stock_item_id)
        const semiItem = semiItemsMap.get(line.semi_item_id)
        const name = stockItem?.name || semiItem?.name || line.item_name || 'Ürün'
        const unit = stockItem?.unit || semiItem?.recipe_output_unit || line.unit || 'Adet'

        return {
          ...line,
          item_display_name: name,
          unit_display: unit,
          dispatch_qty: line.approved_qty ?? line.ordered_qty ?? 0
        }
      })

      setOrderLines(mappedLines)
    } catch (err) {
      console.error('Sipariş kalemleri yüklenemedi:', err)
      toast('Sipariş detayları alınamadı: ' + err.message, 'error')
    }
  }

  // Handle Dispatch Submit
  async function handleConfirmDispatch() {
    if (!selectedOrder) return
    setDispatchSaving(true)

    try {
      const meta = parseJson(selectedOrder.meta, {})
      const nextMeta = {
        ...meta,
        supplier_marked_sent: true,
        supplier_sent_at: new Date().toISOString(),
        supplier_dispatch: {
          delivered_on: dispatchForm.delivered_on || null,
          doc_kind: dispatchForm.doc_kind || null,
          doc_no: dispatchForm.doc_no?.trim() || null,
          plate_number: dispatchForm.plate_number?.trim() || null,
          note: dispatchForm.note?.trim() || null
        }
      }

      // 1. Update purchase_orders record
      const { error: orderErr } = await db
        .from('purchase_orders')
        .update({ meta: nextMeta, updated_at: new Date().toISOString() })
        .eq('id', selectedOrder.id)

      if (orderErr) throw orderErr

      // 2. Insert inventory_movements for kitchen stock exit (transfer_out)
      const movementRows = orderLines
        .filter(l => Number(l.dispatch_qty) > 0)
        .map(l => {
          const qty = Number(l.dispatch_qty)
          const isSemi = Boolean(l.semi_item_id)
          return {
            branch_id: branchId,
            branch_name: branchName,
            item_type: isSemi ? 'semi_item' : 'stock_item',
            stock_item_id: isSemi ? null : l.stock_item_id,
            semi_item_id: isSemi ? l.semi_item_id : null,
            item_name: l.item_display_name,
            item_sku: l.item_sku || null,
            unit: l.unit_display,
            movement_type: 'transfer_out',
            source_doc_type: 'purchase_order',
            source_doc_id: selectedOrder.id,
            source_doc_line_id: l.id,
            source_doc_no: selectedOrder.order_no,
            direction: 'out',
            movement_at: new Date().toISOString(),
            quantity: qty,
            quantity_signed: -qty,
            counterparty_branch_id: selectedOrder.branch_id,
            counterparty_branch_name: selectedOrder.branch_name,
            notes: `Şubeye Sevk: ${selectedOrder.branch_name || ''}`
          }
        })

      if (movementRows.length > 0) {
        const { error: moveErr } = await db
          .from('inventory_movements')
          .insert(movementRows)

        if (moveErr) console.warn('Envanter çıkış kaydı oluşturulurken uyarı:', moveErr)
      }

      toast('Sevkiyat başarıyla onaylandı ve stok çıkışı kaydedildi.', 'success')
      setSelectedOrder(null)
      await fetchOrders()
    } catch (err) {
      console.error('Sevk işlemi başarısız:', err)
      toast('Sevkiyat onaylanırken hata oluştu: ' + err.message, 'error')
    } finally {
      setDispatchSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
        <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '1.5rem', marginBottom: 12 }} /><br />
        Merkez Mutfak siparişleri yükleniyor...
      </div>
    )
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Head */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className="fa-solid fa-kitchen-set" style={{ color: '#c2410c' }} />
            Merkez Mutfak Sevk Konsolu
          </h1>
          <p style={{ fontSize: '.85rem', color: '#64748b', margin: '4px 0 0' }}>
            {branchName} — Şubelerden gelen ikmal taleplerinin sevkiyat yönetimi
          </p>
        </div>
        <button className="btn-o" onClick={fetchOrders} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="fa-solid fa-rotate-right" /> Yenile
        </button>
      </div>

      {/* Warning if no internal_kitchen supplier synced */}
      {!kitchenSupplier && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: '12px 16px', borderRadius: 10, color: '#991b1b', marginBottom: 20, fontSize: '.875rem' }}>
          <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 8 }} />
          Bu merkez mutfağa bağlı sistem üretimi tedarikçi kaydı bulunamadı. Lütfen Şirket Kuruluşu ekranından kaydedildiğinden emin olun.
        </div>
      )}

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 24 }}>
        <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', padding: '14px 18px', borderRadius: 12 }}>
          <div style={{ fontSize: '.78rem', fontWeight: 600, color: '#d97706', textTransform: 'uppercase' }}>Sevkiyat Bekleyen</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#b45309', marginTop: 4 }}>{counts.pending} <span style={{ fontSize: '.9rem', fontWeight: 500 }}>sipariş</span></div>
        </div>
        <div style={{ background: '#f0fdf4', border: '1px solid #dcfce7', padding: '14px 18px', borderRadius: 12 }}>
          <div style={{ fontSize: '.78rem', fontWeight: 600, color: '#16a34a', textTransform: 'uppercase' }}>Sevk Edilen</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#15803d', marginTop: 4 }}>{counts.sent} <span style={{ fontSize: '.9rem', fontWeight: 500 }}>sipariş</span></div>
        </div>
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '14px 18px', borderRadius: 12 }}>
          <div style={{ fontSize: '.78rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Toplam Talep</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#334155', marginTop: 4 }}>{counts.total} <span style={{ fontSize: '.9rem', fontWeight: 500 }}>sipariş</span></div>
        </div>
      </div>

      {/* Filters & Tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        {/* Tabs */}
        <div style={{ display: 'flex', background: '#f1f5f9', padding: 4, borderRadius: 10, gap: 4 }}>
          {[
            { id: 'pending', label: `Bekleyen Talepler (${counts.pending})` },
            { id: 'sent', label: `Sevk Edilenler (${counts.sent})` },
            { id: 'all', label: `Tümü (${counts.total})` }
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              style={{
                border: 'none', background: activeTab === t.id ? '#fff' : 'transparent',
                color: activeTab === t.id ? '#0f172a' : '#64748b',
                fontWeight: activeTab === t.id ? 700 : 500,
                fontSize: '.83rem', padding: '7px 14px', borderRadius: 8,
                cursor: 'pointer', boxShadow: activeTab === t.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all .15s'
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', width: 260 }}>
          <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '.83rem' }} />
          <input className="f-input" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Şube veya sipariş no ara..." style={{ paddingLeft: 34, fontSize: '.83rem', borderRadius: 10 }} />
        </div>
      </div>

      {/* Orders List */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        {filteredOrders.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: '.9rem' }}>
            <i className="fa-solid fa-inbox" style={{ fontSize: '2rem', display: 'block', marginBottom: 8 }} />
            Bu görünümde listelenecek sipariş bulunamadı.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '.855rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 600 }}>
                <th style={{ padding: '12px 16px' }}>Sipariş No</th>
                <th style={{ padding: '12px 16px' }}>Talep Eden Şube</th>
                <th style={{ padding: '12px 16px' }}>Tarih</th>
                <th style={{ padding: '12px 16px' }}>Durum</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map(ord => {
                const meta = parseJson(ord.meta, {})
                const isSent = Boolean(meta.supplier_marked_sent || meta.supplier_sent_at)
                const dispatchInfo = meta.supplier_dispatch

                return (
                  <tr key={ord.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: '#1e293b' }}>
                      {ord.order_no || '—'}
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#334155' }}>
                      <i className="fa-solid fa-store" style={{ marginRight: 6, color: '#6366f1' }} />
                      {ord.branch_name || 'Şube'}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#64748b' }}>
                      {ord.order_date ? new Date(ord.order_date).toLocaleDateString('tr-TR') : '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {isSent ? (
                        <span style={{ background: '#dcfce7', color: '#15803d', padding: '4px 10px', borderRadius: 20, fontSize: '.78rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <i className="fa-solid fa-check" /> Sevk Edildi
                        </span>
                      ) : (
                        <span style={{ background: '#fef3c7', color: '#b45309', padding: '4px 10px', borderRadius: 20, fontSize: '.78rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <i className="fa-solid fa-clock" /> Sevkiyat Bekliyor
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button className="btn-o" onClick={() => openDispatchModal(ord)} style={{ fontSize: '.8rem', padding: '5px 12px' }}>
                        <i className={`fa-solid ${isSent ? 'fa-eye' : 'fa-truck-fast'}`} style={{ marginRight: 4 }} />
                        {isSent ? 'Görüntüle' : 'Sevk Et'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Dispatch Modal */}
      {selectedOrder && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(3px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 720, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            
            {/* Modal Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                  Sipariş Sevkiyat Onayı — {selectedOrder.order_no}
                </h3>
                <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: 2 }}>
                  Talep Eden Şube: <strong>{selectedOrder.branch_name}</strong>
                </div>
              </div>
              <button className="ico-btn" onClick={() => setSelectedOrder(null)}><i className="fa-solid fa-xmark" /></button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
              <SectionHead label="Sipariş Kalemleri" />
              
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.83rem', marginBottom: 20 }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', color: '#475569', textAlign: 'left' }}>
                    <th style={{ padding: '8px 12px' }}>Ürün Adı</th>
                    <th style={{ padding: '8px 12px' }}>Birim</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Talep Miktarı</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Sevk Edilecek Miktar</th>
                  </tr>
                </thead>
                <tbody>
                  {orderLines.map((line, i) => (
                    <tr key={line.id || i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1e293b' }}>
                        {line.item_display_name}
                      </td>
                      <td style={{ padding: '8px 12px', color: '#64748b' }}>{line.unit_display}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#475569' }}>
                        {line.ordered_qty ?? '—'}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          className="f-input"
                          style={{ width: 90, textAlign: 'right', padding: '4px 8px', fontSize: '.83rem' }}
                          value={line.dispatch_qty}
                          onChange={e => {
                            const val = parseFloat(e.target.value) || 0
                            const next = [...orderLines]
                            next[i].dispatch_qty = val
                            setOrderLines(next)
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <SectionHead label="Sevk Bilgileri" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label className="f-label">Teslim / Sevk Tarihi</label>
                  <input type="date" className="f-input" value={dispatchForm.delivered_on}
                    onChange={e => setDispatchForm(p => ({ ...p, delivered_on: e.target.value }))} />
                </div>
                <div>
                  <label className="f-label">Belge Türü</label>
                  <input className="f-input" value={dispatchForm.doc_kind} placeholder="Örn: İrsaliye"
                    onChange={e => setDispatchForm(p => ({ ...p, doc_kind: e.target.value }))} />
                </div>
                <div>
                  <label className="f-label">İrsaliye / Belge No</label>
                  <input className="f-input" value={dispatchForm.doc_no} placeholder="Örn: IRS-2026-001"
                    onChange={e => setDispatchForm(p => ({ ...p, doc_no: e.target.value }))} />
                </div>
                <div>
                  <label className="f-label">Araç Plakası</label>
                  <input className="f-input" value={dispatchForm.plate_number} placeholder="Örn: 34 ABC 123"
                    onChange={e => setDispatchForm(p => ({ ...p, plate_number: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="f-label">Sevkiyat Notu</label>
                <input className="f-input" value={dispatchForm.note} placeholder="Varsa teslimat notu..."
                  onChange={e => setDispatchForm(p => ({ ...p, note: e.target.value }))} />
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn-o" onClick={() => setSelectedOrder(null)}>Kapat</button>
              <button className="btn-p" onClick={handleConfirmDispatch} disabled={dispatchSaving} style={{ background: '#c2410c', borderColor: '#c2410c' }}>
                {dispatchSaving ? <><i className="fa-solid fa-spinner fa-spin" /> Kaydediliyor...</> : <><i className="fa-solid fa-truck-fast" /> Sevkiyatı Onayla ve Sevk Et</>}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
