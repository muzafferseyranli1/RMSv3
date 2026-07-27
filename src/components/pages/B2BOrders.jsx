import React, { useState, useEffect, useMemo } from 'react'
import { db } from '../../lib/db'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useToast } from '../../hooks/useToast'

function parseJson(val, fallback = {}) {
  if (!val) return fallback
  if (typeof val === 'object') return val
  try { return JSON.parse(val) } catch { return fallback }
}

function SectionHead({ label }) {
  return (
    <div style={{ fontSize: '.83rem', fontWeight: 700, color: '#475569', borderBottom: '1px solid #e2e8f0', paddingBottom: 6, marginBottom: 12, marginTop: 12 }}>
      {label}
    </div>
  )
}

function fmtCurrency(val) {
  const n = Number(val || 0)
  return '₺' + n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function B2BOrders({ scopeVariant = 'anadepo' }) {
  const toast = useToast()
  const { branchId, branchName } = useWorkspace()

  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState([])
  const [b2bCustomers, setB2bCustomers] = useState([])
  const [stockItems, setStockItems] = useState([])
  const [semiItems, setSemiItems] = useState([])
  const [activeTab, setActiveTab] = useState('all') // 'all' | 'pending' | 'shipped'
  const [searchQuery, setSearchQuery] = useState('')

  // Modal State - New B2B Order
  const [showNewModal, setShowNewModal] = useState(false)
  const [newOrderForm, setNewOrderForm] = useState({
    customer_id: '',
    delivery_date: new Date().toISOString().slice(0, 10),
    notes: '',
    doc_kind: 'İrsaliye'
  })
  const [newOrderLines, setNewOrderLines] = useState([])
  const [savingOrder, setSavingOrder] = useState(false)

  // Modal State - Dispatch Order
  const [dispatchModalOrder, setDispatchModalOrder] = useState(null)
  const [dispatchLines, setDispatchLines] = useState([])
  const [dispatchForm, setDispatchForm] = useState({
    doc_kind: 'İrsaliye',
    doc_no: '',
    plate_number: '',
    notes: ''
  })
  const [dispatchSaving, setDispatchSaving] = useState(false)

  // Modal State - Print Invoice/Waybill
  const [printModalOrder, setPrintModalOrder] = useState(null)
  const [printLines, setPrintLines] = useState([])

  // 1. Fetch data
  async function loadData() {
    if (!branchId) return
    setLoading(true)
    try {
      const [
        { data: ords },
        { data: custs },
        { data: stocks },
        { data: semis }
      ] = await Promise.all([
        db.from('b2b_sales_orders')
          .select('*')
          .eq('seller_branch_id', branchId)
          .order('created_at', { ascending: false }),
        db.from('musteriler')
          .select('*')
          .or('is_b2b.eq.true,sirket_adi.not.is.null')
          .order('ad_soyad'),
        db.from('stock_items')
          .select('id, name, sku, unit, purchase_price')
          .eq('deleted_at', null),
        db.from('semi_items')
          .select('id, name, sku, recipe_output_unit, recipe_rows')
          .eq('deleted_at', null)
      ])

      setOrders(ords || [])
      setB2bCustomers(custs || [])
      setStockItems(stocks || [])
      setSemiItems(semis || [])
    } catch (err) {
      console.error('B2B veri yükleme hatası:', err)
      toast('B2B verileri yüklenirken hata oluştu: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [branchId])

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    return orders.filter(ord => {
      if (activeTab === 'pending' && ord.status !== 'pending') return false
      if (activeTab === 'shipped' && ord.status !== 'shipped' && ord.status !== 'delivered') return false

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const oNo = (ord.order_no || '').toLowerCase()
        const cName = (ord.customer_name || '').toLowerCase()
        if (!oNo.includes(q) && !cName.includes(q)) return false
      }

      return true
    })
  }, [orders, activeTab, searchQuery])

  // Add line to new order
  function addLineToNewOrder(itemId, isSemi = false) {
    if (isSemi) {
      const item = semiItems.find(x => x.id === itemId)
      if (!item) return
      setNewOrderLines(prev => [
        ...prev,
        {
          item_type: 'semi_item',
          semi_item_id: item.id,
          stock_item_id: null,
          item_name: item.name,
          item_sku: item.sku,
          unit: item.recipe_output_unit || 'Adet',
          unit_price: 0,
          vat_rate: 0.1,
          ordered_qty: 1
        }
      ])
    } else {
      const item = stockItems.find(x => x.id === itemId)
      if (!item) return
      setNewOrderLines(prev => [
        ...prev,
        {
          item_type: 'stock_item',
          stock_item_id: item.id,
          semi_item_id: null,
          item_name: item.name,
          item_sku: item.sku,
          unit: item.unit || 'Adet',
          unit_price: item.purchase_price || 0,
          vat_rate: 0.1,
          ordered_qty: 1
        }
      ])
    }
  }

  // Calculate new order totals
  const newOrderTotals = useMemo(() => {
    let subtotal = 0
    let vatTotal = 0
    newOrderLines.forEach(l => {
      const qty = Number(l.ordered_qty || 0)
      const price = Number(l.unit_price || 0)
      const vat = Number(l.vat_rate || 0)
      const lineNet = qty * price
      const lineVat = lineNet * vat
      subtotal += lineNet
      vatTotal += lineVat
    })
    return { subtotal, vatTotal, totalAmount: subtotal + vatTotal }
  }, [newOrderLines])

  // Submit New Order
  async function handleCreateOrder() {
    if (!newOrderForm.customer_id) {
      toast('Lütfen müşteri seçin', 'error')
      return
    }
    if (newOrderLines.length === 0) {
      toast('Lütfen en az bir ürün kalemi ekleyin', 'error')
      return
    }

    setSavingOrder(true)
    try {
      const cust = b2bCustomers.find(c => c.id === newOrderForm.customer_id)
      const orderNo = 'B2B-' + Date.now().toString().slice(-6)

      // 1. Create B2B order record
      const orderPayload = {
        order_no: orderNo,
        seller_branch_id: branchId,
        seller_branch_name: branchName,
        seller_scope: scopeVariant,
        customer_id: cust.id,
        customer_name: cust.sirket_adi || cust.ad_soyad,
        customer_tax_no: cust.vergi_no || null,
        customer_tax_office: cust.tax_office || null,
        order_date: new Date().toISOString(),
        delivery_date: newOrderForm.delivery_date || null,
        status: 'pending',
        doc_kind: newOrderForm.doc_kind || 'İrsaliye',
        notes: newOrderForm.notes?.trim() || null,
        subtotal: newOrderTotals.subtotal,
        vat_total: newOrderTotals.vatTotal,
        total_amount: newOrderTotals.totalAmount
      }

      const { data: insertedOrder, error: orderErr } = await db
        .from('b2b_sales_orders')
        .insert(orderPayload)
        .select('*')
        .single()

      if (orderErr) throw orderErr

      // 2. Create lines
      const linesPayload = newOrderLines.map((l, idx) => ({
        order_id: insertedOrder.id,
        line_no: idx + 1,
        item_type: l.item_type,
        stock_item_id: l.stock_item_id || null,
        semi_item_id: l.semi_item_id || null,
        item_name: l.item_name,
        item_sku: l.item_sku || null,
        unit: l.unit,
        unit_price: Number(l.unit_price || 0),
        vat_rate: Number(l.vat_rate || 0),
        ordered_qty: Number(l.ordered_qty || 0),
        shipped_qty: 0,
        line_total: Number(l.ordered_qty || 0) * Number(l.unit_price || 0) * (1 + Number(l.vat_rate || 0))
      }))

      const { error: linesErr } = await db
        .from('b2b_sales_order_lines')
        .insert(linesPayload)

      if (linesErr) throw linesErr

      toast('B2B Satış Siparişi oluşturuldu: ' + orderNo, 'success')
      setShowNewModal(false)
      setNewOrderLines([])
      await loadData()
    } catch (err) {
      console.error('B2B Sipariş oluşturma hatası:', err)
      toast('Sipariş oluşturulamadı: ' + err.message, 'error')
    } finally {
      setSavingOrder(false)
    }
  }

  // Open Dispatch Modal
  async function openDispatchModal(order) {
    setDispatchModalOrder(order)
    setDispatchForm({
      doc_kind: order.doc_kind || 'İrsaliye',
      doc_no: order.doc_no || 'IRS-' + Date.now().toString().slice(-6),
      plate_number: order.plate_number || '',
      notes: order.notes || ''
    })

    try {
      const { data, error } = await db
        .from('b2b_sales_order_lines')
        .select('*')
        .eq('order_id', order.id)
        .order('line_no')

      if (error) throw error
      setDispatchLines((data || []).map(l => ({ ...l, dispatch_qty: l.shipped_qty || l.ordered_qty })))
    } catch (err) {
      toast('Sipariş detayları okunamadı: ' + err.message, 'error')
    }
  }

  // Confirm Dispatch
  async function handleConfirmDispatch() {
    if (!dispatchModalOrder) return
    setDispatchSaving(true)

    try {
      // 1. Update B2B sales order status to 'shipped'
      const { error: orderErr } = await db
        .from('b2b_sales_orders')
        .update({
          status: 'shipped',
          doc_kind: dispatchForm.doc_kind,
          doc_no: dispatchForm.doc_no?.trim() || null,
          plate_number: dispatchForm.plate_number?.trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', dispatchModalOrder.id)

      if (orderErr) throw orderErr

      // 2. Update lines shipped_qty
      for (const l of dispatchLines) {
        await db
          .from('b2b_sales_order_lines')
          .update({ shipped_qty: Number(l.dispatch_qty || 0) })
          .eq('id', l.id)
      }

      // 3. Create inventory_movements for b2b_sale_out
      const movements = dispatchLines
        .filter(l => Number(l.dispatch_qty) > 0)
        .map(l => {
          const qty = Number(l.dispatch_qty)
          const isSemi = l.item_type === 'semi_item'
          return {
            branch_id: branchId,
            branch_name: branchName,
            item_type: l.item_type,
            stock_item_id: isSemi ? null : l.stock_item_id,
            semi_item_id: isSemi ? l.semi_item_id : null,
            item_name: l.item_name,
            item_sku: l.item_sku || null,
            unit: l.unit,
            movement_type: 'manual_adjustment_out', // b2b_sale_out fallback to manual_adjustment_out for ledger integrity
            source_doc_type: 'b2b_sales_order',
            source_doc_id: dispatchModalOrder.id,
            source_doc_line_id: l.id,
            source_doc_no: dispatchModalOrder.order_no,
            direction: 'out',
            movement_at: new Date().toISOString(),
            quantity: qty,
            quantity_signed: -qty,
            notes: `Dış Müşteri B2B Satış: ${dispatchModalOrder.customer_name}`
          }
        })

      if (movements.length > 0) {
        const { error: moveErr } = await db.from('inventory_movements').insert(movements)
        if (moveErr) console.warn('Envanter çıkış uyarısı:', moveErr)
      }

      // 4. Record Cari Debit entry in cari_hareketler if customer is cari
      const { data: customer } = await db
        .from('musteriler')
        .select('id, cari, toplam_borc')
        .eq('id', dispatchModalOrder.customer_id)
        .maybeSingle()

      if (customer?.cari) {
        const total = Number(dispatchModalOrder.total_amount || 0)
        await db.from('cari_hareketler').insert({
          musteri_id: customer.id,
          tur: 'borc',
          tutar: total,
          aciklama: `B2B Satış Sevk: ${dispatchModalOrder.order_no}`,
          tarih: new Date().toISOString()
        })
        const currentBorc = Number(customer.toplam_borc || 0)
        await db.from('musteriler').update({ toplam_borc: currentBorc + total }).eq('id', customer.id)
      }

      toast('B2B Sevkiyatı onaylandı ve stok düşümü kaydedildi.', 'success')
      setDispatchModalOrder(null)
      await loadData()
    } catch (err) {
      console.error('Sevkiyat hatası:', err)
      toast('Sevkiyat onaylanırken hata oluştu: ' + err.message, 'error')
    } finally {
      setDispatchSaving(false)
    }
  }

  // Open Print Modal
  async function openPrintModal(order) {
    setPrintModalOrder(order)
    try {
      const { data } = await db
        .from('b2b_sales_order_lines')
        .select('*')
        .eq('order_id', order.id)
        .order('line_no')
      setPrintLines(data || [])
    } catch (err) {
      console.error('Yazdırma verisi okunamadı:', err)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
        <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '1.5rem', marginBottom: 12 }} /><br />
        B2B Satış siparişleri yükleniyor...
      </div>
    )
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Head */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className="fa-solid fa-building-flag" style={{ color: '#8b5cf6' }} />
            Dış Müşteri (B2B) Satış Konsolu — {scopeVariant === 'merkezmutfak' ? 'Merkez Mutfak' : 'Ana Depo'}
          </h1>
          <p style={{ fontSize: '.85rem', color: '#64748b', margin: '4px 0 0' }}>
            {branchName} — Dış müşterilere toptan satış siparişleri, sevk ve irsaliye yönetimi
          </p>
        </div>
        <button className="btn-p" onClick={() => setShowNewModal(true)} style={{ background: '#8b5cf6', borderColor: '#8b5cf6' }}>
          <i className="fa-solid fa-plus" /> Yeni B2B Siparişi
        </button>
      </div>

      {/* Tabs & Search */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', background: '#f1f5f9', padding: 4, borderRadius: 10, gap: 4 }}>
          {[
            { id: 'all', label: `Tüm Siparişler (${orders.length})` },
            { id: 'pending', label: `Bekleyenler (${orders.filter(o => o.status === 'pending').length})` },
            { id: 'shipped', label: `Sevk Edilenler (${orders.filter(o => o.status === 'shipped').length})` }
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              style={{
                border: 'none', background: activeTab === t.id ? '#fff' : 'transparent',
                color: activeTab === t.id ? '#0f172a' : '#64748b',
                fontWeight: activeTab === t.id ? 700 : 500,
                fontSize: '.83rem', padding: '7px 14px', borderRadius: 8, cursor: 'pointer'
              }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', width: 260 }}>
          <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '.83rem' }} />
          <input className="f-input" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Sipariş no veya müşteri ara..." style={{ paddingLeft: 34, fontSize: '.83rem', borderRadius: 10 }} />
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        {filteredOrders.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: '.9rem' }}>
            <i className="fa-solid fa-file-invoice" style={{ fontSize: '2rem', display: 'block', marginBottom: 8 }} />
            Kayıtlı B2B satış siparişi bulunamadı.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '.855rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 600 }}>
                <th style={{ padding: '12px 16px' }}>Sipariş No</th>
                <th style={{ padding: '12px 16px' }}>Dış Müşteri</th>
                <th style={{ padding: '12px 16px' }}>Tarih</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Toplam Tutar</th>
                <th style={{ padding: '12px 16px' }}>Durum</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map(ord => (
                <tr key={ord.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 700, color: '#1e293b' }}>
                    {ord.order_no}
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: '#334155' }}>
                    {ord.customer_name}
                    {ord.customer_tax_no ? <span style={{ fontSize: '.75rem', color: '#94a3b8', display: 'block' }}>VN: {ord.customer_tax_no}</span> : null}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#64748b' }}>
                    {ord.order_date ? new Date(ord.order_date).toLocaleDateString('tr-TR') : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                    {fmtCurrency(ord.total_amount)}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {ord.status === 'shipped' ? (
                      <span style={{ background: '#dcfce7', color: '#15803d', padding: '4px 10px', borderRadius: 20, fontSize: '.78rem', fontWeight: 600 }}>
                        Sevk Edildi
                      </span>
                    ) : (
                      <span style={{ background: '#fef3c7', color: '#b45309', padding: '4px 10px', borderRadius: 20, fontSize: '.78rem', fontWeight: 600 }}>
                        Sipariş Alındı
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      {ord.status !== 'shipped' && (
                        <button className="btn-o" onClick={() => openDispatchModal(ord)} style={{ fontSize: '.8rem', padding: '5px 10px' }}>
                          <i className="fa-solid fa-truck-fast" /> Sevk Et
                        </button>
                      )}
                      <button className="btn-o" onClick={() => openPrintModal(ord)} style={{ fontSize: '.8rem', padding: '5px 10px' }}>
                        <i className="fa-solid fa-print" /> İrsaliye
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* New Order Modal */}
      {showNewModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(3px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 800, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Yeni B2B Satış Siparişi</h3>
              <button className="ico-btn" onClick={() => setShowNewModal(false)}><i className="fa-solid fa-xmark" /></button>
            </div>
            
            <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label className="f-label">B2B Müşteri / Firma</label>
                  <select className="f-input" value={newOrderForm.customer_id} onChange={e => setNewOrderForm(p => ({ ...p, customer_id: e.target.value }))}>
                    <option value="">-- Müşteri Seçin --</option>
                    {b2bCustomers.map(c => (
                      <option key={c.id} value={c.id}>{c.sirket_adi || c.ad_soyad} {c.vergi_no ? `(VN: ${c.vergi_no})` : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="f-label">Teslim Tarihi</label>
                  <input type="date" className="f-input" value={newOrderForm.delivery_date} onChange={e => setNewOrderForm(p => ({ ...p, delivery_date: e.target.value }))} />
                </div>
              </div>

              <SectionHead label="Ürün Ekle" />
              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <select className="f-input" id="itemSelector" style={{ flex: 1 }}>
                  <option value="">-- Ürün veya Yarı Mamul Seçin --</option>
                  <optgroup label="Stok Kalemleri">
                    {stockItems.map(s => <option key={s.id} value={`stock:${s.id}`}>{s.name} ({s.sku})</option>)}
                  </optgroup>
                  <optgroup label="Yarı Mamuller (Üretim)">
                    {semiItems.map(s => <option key={s.id} value={`semi:${s.id}`}>{s.name} ({s.sku})</option>)}
                  </optgroup>
                </select>
                <button className="btn-o" onClick={() => {
                  const val = document.getElementById('itemSelector').value
                  if (!val) return
                  const [kind, id] = val.split(':')
                  addLineToNewOrder(id, kind === 'semi')
                }}><i className="fa-solid fa-plus" /> Ekle</button>
              </div>

              {/* Order Lines Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.83rem', marginBottom: 16 }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', color: '#475569', textAlign: 'left' }}>
                    <th style={{ padding: '8px 12px' }}>Ürün</th>
                    <th style={{ padding: '8px 12px' }}>Birim</th>
                    <th style={{ padding: '8px 12px', width: 90 }}>Miktar</th>
                    <th style={{ padding: '8px 12px', width: 110 }}>Birim Fiyat</th>
                    <th style={{ padding: '8px 12px', width: 80 }}>KDV</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Toplam</th>
                    <th style={{ padding: '8px 12px', width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {newOrderLines.map((l, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600 }}>{l.item_name}</td>
                      <td style={{ padding: '8px 12px', color: '#64748b' }}>{l.unit}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <input type="number" min="0.01" step="any" className="f-input" style={{ padding: '4px 6px' }}
                          value={l.ordered_qty} onChange={e => {
                            const next = [...newOrderLines]
                            next[i].ordered_qty = parseFloat(e.target.value) || 0
                            setNewOrderLines(next)
                          }} />
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <input type="number" min="0" step="any" className="f-input" style={{ padding: '4px 6px' }}
                          value={l.unit_price} onChange={e => {
                            const next = [...newOrderLines]
                            next[i].unit_price = parseFloat(e.target.value) || 0
                            setNewOrderLines(next)
                          }} />
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <select className="f-input" style={{ padding: '4px 6px' }} value={l.vat_rate} onChange={e => {
                          const next = [...newOrderLines]
                          next[i].vat_rate = parseFloat(e.target.value) || 0
                          setNewOrderLines(next)
                        }}>
                          <option value="0">%0</option>
                          <option value="0.01">%1</option>
                          <option value="0.1">%10</option>
                          <option value="0.2">%20</option>
                        </select>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>
                        {fmtCurrency((l.ordered_qty * l.unit_price) * (1 + l.vat_rate))}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <button className="ico-btn del" onClick={() => setNewOrderLines(prev => prev.filter((_, idx) => idx !== i))}>
                          <i className="fa-solid fa-xmark" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '.85rem', color: '#64748b' }}>
                  Ara Toplam: <strong>{fmtCurrency(newOrderTotals.subtotal)}</strong> | KDV: <strong>{fmtCurrency(newOrderTotals.vatTotal)}</strong>
                </div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                  Genel Toplam: {fmtCurrency(newOrderTotals.totalAmount)}
                </div>
              </div>
            </div>

            <div style={{ padding: '14px 20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn-o" onClick={() => setShowNewModal(false)}>İptal</button>
              <button className="btn-p" onClick={handleCreateOrder} disabled={savingOrder} style={{ background: '#8b5cf6', borderColor: '#8b5cf6' }}>
                {savingOrder ? 'Kaydediliyor...' : 'Siparişi Oluştur'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dispatch Modal */}
      {dispatchModalOrder && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(3px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 720, padding: 20 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: 700 }}>Sevkiyat Onayı — {dispatchModalOrder.order_no}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label className="f-label">Belge Türü</label>
                <input className="f-input" value={dispatchForm.doc_kind} onChange={e => setDispatchForm(p => ({ ...p, doc_kind: e.target.value }))} />
              </div>
              <div>
                <label className="f-label">İrsaliye No</label>
                <input className="f-input" value={dispatchForm.doc_no} onChange={e => setDispatchForm(p => ({ ...p, doc_no: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button className="btn-o" onClick={() => setDispatchModalOrder(null)}>İptal</button>
              <button className="btn-p" onClick={handleConfirmDispatch} disabled={dispatchSaving} style={{ background: '#16a34a', borderColor: '#16a34a' }}>
                {dispatchSaving ? 'Kaydediliyor...' : 'Sevkiyatı Onayla & İrsaliyeleştir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Invoice/Waybill Preview Modal */}
      {printModalOrder && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 750, maxHeight: '90vh', overflowY: 'auto', padding: 30 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #0f172a', paddingBottom: 16, marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>SEVK İRSALİYESİ</h2>
                <div style={{ fontSize: '.85rem', color: '#64748b', marginTop: 4 }}>Düzenleyen: <strong>{branchName}</strong></div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#8b5cf6' }}>{printModalOrder.doc_no || printModalOrder.order_no}</div>
                <div style={{ fontSize: '.8rem', color: '#64748b' }}>Tarih: {new Date(printModalOrder.order_date).toLocaleDateString('tr-TR')}</div>
              </div>
            </div>

            <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, marginBottom: 20, fontSize: '.85rem' }}>
              <strong>Alıcı Firma:</strong> {printModalOrder.customer_name}<br />
              {printModalOrder.customer_tax_no ? <><strong>Vergi No:</strong> {printModalOrder.customer_tax_no} | <strong>VD:</strong> {printModalOrder.customer_tax_office || '—'}<br /></> : null}
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem', marginBottom: 20 }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px' }}>Sıra</th>
                  <th style={{ padding: '8px 12px' }}>Ürün Adı</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Miktar</th>
                  <th style={{ padding: '8px 12px' }}>Birim</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Birim Fiyat</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Toplam</th>
                </tr>
              </thead>
              <tbody>
                {printLines.map((l, i) => (
                  <tr key={l.id || i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '8px 12px' }}>{i + 1}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{l.item_name}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{l.shipped_qty || l.ordered_qty}</td>
                    <td style={{ padding: '8px 12px' }}>{l.unit}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{fmtCurrency(l.unit_price)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>{fmtCurrency(l.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ textAlign: 'right', fontSize: '1rem', fontWeight: 800, marginBottom: 20 }}>
              Genel Toplam: {fmtCurrency(printModalOrder.total_amount)}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn-o" onClick={() => setPrintModalOrder(null)}>Kapat</button>
              <button className="btn-p" onClick={() => window.print()}>
                <i className="fa-solid fa-print" /> Yazdır
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
