/**
 * WmsInternalTransfer.jsx
 * Depo içi lokasyon / LPN taşıma ekranı.
 *
 * - Kaynak ve hedef lokasyon + LPN seçilir.
 * - Tek stok kalemine ait miktarın tamamı veya bir kısmı taşınabilir.
 * - İki inventory_movements satırı yazılır (transfer_out → transfer_in).
 * - Her çift aynı `wms_transfer_pair_id` (UUID) ile işaretlenir.
 * - branch_id kilitlenidir; her iki hareket de aynı depoya yazılır.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import SearchableSelect from '@/components/ui/SearchableSelect'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/hooks/useToast'
import { db } from '@/lib/db'
import { useWorkspace } from '@/context/WorkspaceContext'

// ─── Helpers ────────────────────────────────────────────────────────────────

function createUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

function nowIso() {
  return new Date().toISOString()
}

function safeNum(v, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function formatAddress(loc) {
  if (!loc) return '—'
  const parts = [
    loc.zone_code,
    loc.aisle ? `K${loc.aisle}` : null,
    loc.rack  ? `R${loc.rack}`  : null,
    loc.level ? `S${loc.level}` : null,
    loc.bin   ? `G${loc.bin}`   : null,
  ].filter(Boolean)
  return parts.join('-') || loc.id || '—'
}

function docNo() {
  const now = new Date()
  const d = now.toISOString().slice(0, 10).replaceAll('-', '')
  const t = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  return `WIT-${d}${t}`
}

// ─── Main Component ──────────────────────────────────────────────────────────

const EMPTY_FORM = {
  stockItemId: '',
  quantity: '',
  srcLocationId: '',
  srcLpnId: '',
  dstLocationId: '',
  dstLpnId: '',
  lotNumber: '',
  expirationDate: '',
  note: '',
  movementDate: new Date().toISOString().slice(0, 10),
  movementTime: `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`,
}

export default function WmsInternalTransfer() {
  const toast = useToast()
  const { branchId: workspaceBranchId, branchName: workspaceBranchName, scope } = useWorkspace()

  // Data
  const [locations, setLocations] = useState([])
  const [lpns, setLpns] = useState([])
  const [stockItems, setStockItems] = useState([])
  const [loading, setLoading] = useState(true)

  // History
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Form
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // Source balance
  const [srcBalance, setSrcBalance] = useState(null)
  const [srcBalanceLoading, setSrcBalanceLoading] = useState(false)

  const isWmsMode = scope === 'anadepo'
  const branchId = workspaceBranchId || null

  // ─── Load master data ────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: locData }, { data: lpnData }, { data: itemData }] = await Promise.all([
        db.from('warehouse_locations')
          .select('id,zone_code,aisle,rack,level,bin,branch_id')
          .eq('is_active', true)
          .order('zone_code'),
        db.from('warehouse_lpns')
          .select('id,lpn_code,branch_id,location_id')
          .eq('status', 'active')
          .order('lpn_code'),
        db.from('stock_items')
          .select('id,name,sku,unit')
          .is('deleted_at', null)
          .order('name'),
      ])
      setLocations((locData || []).filter(l => !branchId || l.branch_id === branchId))
      setLpns((lpnData || []).filter(l => !branchId || l.branch_id === branchId))
      setStockItems(itemData || [])
    } catch (e) {
      toast('Veriler yüklenemedi: ' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [branchId, toast])

  useEffect(() => { load() }, [load])

  // ─── Load history ────────────────────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      let q = db
        .from('inventory_movements')
        .select('id,item_name,quantity,direction,movement_at,location_id,lpn_id,notes,meta,source_doc_no')
        .eq('source_doc_type', 'wms_internal_transfer')
        .is('deleted_at', null)
        .eq('is_cancelled', false)
        .order('movement_at', { ascending: false })
        .limit(200)

      if (branchId) q = q.eq('branch_id', branchId)

      const { data, error } = await q
      if (error) throw error

      // Group by wms_transfer_pair_id
      const pairs = new Map()
      for (const row of data || []) {
        const pairId = row.meta?.wms_transfer_pair_id || row.source_doc_no || row.id
        if (!pairs.has(pairId)) {
          pairs.set(pairId, { pairId, rows: [], movement_at: row.movement_at })
        }
        pairs.get(pairId).rows.push(row)
      }
      setHistory(Array.from(pairs.values()).sort((a, b) => new Date(b.movement_at) - new Date(a.movement_at)))
    } catch (e) {
      toast('Geçmiş yüklenemedi: ' + e.message, 'error')
    } finally {
      setHistoryLoading(false)
    }
  }, [branchId, toast])

  useEffect(() => { if (!loading) loadHistory() }, [loading, loadHistory])

  // ─── Source balance lookup ────────────────────────────────────────────────

  useEffect(() => {
    if (!form.stockItemId || !form.srcLocationId) {
      setSrcBalance(null)
      return
    }

    let cancelled = false
    setSrcBalanceLoading(true)

    async function fetchBalance() {
      try {
        let q = db
          .from('inventory_movements')
          .select('quantity,direction')
          .eq('stock_item_id', form.stockItemId)
          .eq('location_id', form.srcLocationId)
          .is('deleted_at', null)
          .eq('is_cancelled', false)

        if (form.srcLpnId) q = q.eq('lpn_id', form.srcLpnId)
        else q = q.is('lpn_id', null)

        if (branchId) q = q.eq('branch_id', branchId)

        const { data, error } = await q
        if (error) throw error
        if (cancelled) return

        let total = 0
        for (const m of data || []) {
          const qty = safeNum(m.quantity)
          total += m.direction === 'in' ? qty : -qty
        }
        setSrcBalance(total)
      } catch {
        setSrcBalance(null)
      } finally {
        if (!cancelled) setSrcBalanceLoading(false)
      }
    }

    fetchBalance()
    return () => { cancelled = true }
  }, [form.stockItemId, form.srcLocationId, form.srcLpnId, branchId])

  // ─── Derived options ──────────────────────────────────────────────────────

  const locationOptions = useMemo(() =>
    locations.map(l => ({ value: l.id, label: formatAddress(l) }))
  , [locations])

  const lpnForSrc = useMemo(() =>
    lpns
      .filter(l => !form.srcLocationId || l.location_id === form.srcLocationId)
      .map(l => ({ value: l.id, label: l.lpn_code }))
  , [lpns, form.srcLocationId])

  const lpnForDst = useMemo(() =>
    lpns
      .filter(l => !form.dstLocationId || l.location_id === form.dstLocationId)
      .map(l => ({ value: l.id, label: l.lpn_code }))
  , [lpns, form.dstLocationId])

  const stockItemOptions = useMemo(() =>
    stockItems.map(s => ({
      value: s.id,
      label: s.name,
      description: [s.sku ? `SKU: ${s.sku}` : '', s.unit ? `Birim: ${s.unit}` : ''].filter(Boolean).join(' | '),
      meta: 'Stok',
      icon: 'fa-boxes-stacked',
    }))
  , [stockItems])

  const selectedItem = useMemo(() =>
    stockItems.find(s => s.id === form.stockItemId) || null
  , [stockItems, form.stockItemId])

  // ─── Form helpers ─────────────────────────────────────────────────────────

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function resetForm() {
    setForm({
      ...EMPTY_FORM,
      movementDate: new Date().toISOString().slice(0, 10),
      movementTime: `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`,
    })
    setSrcBalance(null)
  }

  // ─── Submit ───────────────────────────────────────────────────────────────

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.stockItemId) { toast('Stok kalemi seçin', 'error'); return }
    if (!form.srcLocationId) { toast('Kaynak lokasyon seçin', 'error'); return }
    if (!form.dstLocationId) { toast('Hedef lokasyon seçin', 'error'); return }
    if (form.srcLocationId === form.dstLocationId && form.srcLpnId === form.dstLpnId) {
      toast('Kaynak ve hedef aynı olamaz', 'error'); return
    }
    const qty = safeNum(form.quantity)
    if (qty <= 0) { toast('Geçerli bir miktar girin', 'error'); return }
    if (srcBalance !== null && qty > srcBalance + 0.0001) {
      toast(`Kaynak lokasyonda yeterli stok yok (mevcut: ${srcBalance})`, 'error'); return
    }

    setSaving(true)
    try {
      const pairId = createUuid()
      const docno = docNo()
      const movementAt = `${form.movementDate}T${form.movementTime || '00:00'}:00`
      const now = nowIso()

      // Read branch-level balance for unit cost
      let { data: prevData } = await db
        .from('inventory_movements')
        .select('avg_unit_cost_after,unit_cost,balance_qty_after,balance_total_cost_after')
        .eq('stock_item_id', form.stockItemId)
        .is('deleted_at', null)
        .eq('is_cancelled', false)
        .order('movement_at', { ascending: false })
        .order('ledger_seq', { ascending: false })
        .limit(1)

      if (branchId) {
        const { data: bd } = await db
          .from('inventory_movements')
          .select('avg_unit_cost_after,unit_cost,balance_qty_after,balance_total_cost_after')
          .eq('stock_item_id', form.stockItemId)
          .eq('branch_id', branchId)
          .is('deleted_at', null)
          .eq('is_cancelled', false)
          .order('movement_at', { ascending: false })
          .order('ledger_seq', { ascending: false })
          .limit(1)
        if (bd?.length) prevData = bd
      }

      const prev = prevData?.[0] || null
      const avgCost = safeNum(prev?.avg_unit_cost_after ?? prev?.unit_cost)
      const prevQty = safeNum(prev?.balance_qty_after)
      const prevTotalCost = safeNum(prev?.balance_total_cost_after)

      const outQty = prevQty - qty
      const outTotalCost = prevTotalCost - qty * avgCost
      const inQty = outQty + qty
      const inTotalCost = outTotalCost + qty * avgCost

      const baseMeta = {
        wms_transfer_pair_id: pairId,
        src_location_id: form.srcLocationId,
        src_lpn_id: form.srcLpnId || null,
        dst_location_id: form.dstLocationId,
        dst_lpn_id: form.dstLpnId || null,
        lot_number: form.lotNumber || null,
        expiration_date: form.expirationDate || null,
      }

      const outRow = {
        item_type: 'stock_item',
        stock_item_id: form.stockItemId,
        item_name: selectedItem?.name || '',
        item_sku: selectedItem?.sku || null,
        unit: selectedItem?.unit || null,
        branch_id: branchId || null,
        branch_name: workspaceBranchName || null,
        movement_type: 'transfer_out',
        source_doc_type: 'wms_internal_transfer',
        source_doc_no: docno,
        direction: 'out',
        movement_at: movementAt,
        quantity: qty,
        unit_cost: avgCost,
        total_cost: qty * avgCost,
        avg_unit_cost_after: avgCost,
        balance_qty_after: outQty,
        balance_total_cost_after: outTotalCost,
        calc_status: 'calculated',
        location_id: form.srcLocationId,
        lpn_id: form.srcLpnId || null,
        lot_number: form.lotNumber || null,
        expiration_date: form.expirationDate || null,
        notes: form.note || null,
        meta: { ...baseMeta, wms_side: 'out' },
        updated_at: now,
      }

      const inRow = {
        ...outRow,
        movement_type: 'transfer_in',
        direction: 'in',
        balance_qty_after: inQty,
        balance_total_cost_after: inTotalCost,
        location_id: form.dstLocationId,
        lpn_id: form.dstLpnId || null,
        meta: { ...baseMeta, wms_side: 'in' },
      }

      const { error } = await db.from('inventory_movements').insert([outRow, inRow])
      if (error) throw error

      // Best-effort recalc
      try { await db.rpc('process_inventory_recalc_jobs', { p_limit: 100 }) } catch { /* ignore */ }

      toast('Lokasyon taşıması kaydedildi ✓', 'success')
      resetForm()
      loadHistory()
    } catch (err) {
      toast('Kayıt hatası: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (!isWmsMode) {
    return (
      <div className="page-enter">
        <Header title="Depo İçi Lokasyon Taşıma" subtitle="Bu ekran yalnızca Ana Depo modunda kullanılabilir." />
        <div className="card" style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
          <i className="fa-solid fa-lock" style={{ fontSize: 28, marginBottom: 12, display: 'block' }} />
          <div>Ana Depo (WMS) kapsamında açın.</div>
        </div>
      </div>
    )
  }

  const srcLocLabel = locations.find(l => l.id === form.srcLocationId) ? formatAddress(locations.find(l => l.id === form.srcLocationId)) : null
  const dstLocLabel = locations.find(l => l.id === form.dstLocationId) ? formatAddress(locations.find(l => l.id === form.dstLocationId)) : null

  return (
    <div className="page-enter">
      <Header
        title="Depo İçi Lokasyon Taşıma"
        subtitle="Aynı depo içinde lokasyon / LPN arası stok hareketi"
      />

      {loading ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
          <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: 24, marginBottom: 12, display: 'block' }} />
          Yükleniyor…
        </div>
      ) : (
        <>
          {/* ── Form ────────────────────────────────────────────────────── */}
          <form onSubmit={handleSubmit}>
            <div className="card" style={{ padding: 20, marginBottom: 14 }}>
              <p style={{ fontSize: '.72rem', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 16 }}>
                <i className="fa-solid fa-arrows-left-right" style={{ marginRight: 6 }} />
                Taşıma Bilgileri
              </p>

              {/* Stock item */}
              <div style={{ marginBottom: 14 }}>
                <label className="f-label">Stok Kalemi <span style={{ color: '#ef4444' }}>*</span></label>
                <SearchableSelect
                  value={form.stockItemId}
                  onChange={v => { set('stockItemId', v); setSrcBalance(null) }}
                  options={stockItemOptions}
                  placeholder="Stok kalemi seçin…"
                />
              </div>

              {/* Date / Time */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label className="f-label">Tarih</label>
                  <input className="f-input" type="date" value={form.movementDate} onChange={e => set('movementDate', e.target.value)} />
                </div>
                <div>
                  <label className="f-label">Saat</label>
                  <input className="f-input" type="time" value={form.movementTime} onChange={e => set('movementTime', e.target.value)} />
                </div>
              </div>

              {/* Source / Destination */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 14 }}>
                {/* Source */}
                <div style={{ background: '#fef3c7', borderRadius: 10, padding: 14, border: '1px solid #fde68a' }}>
                  <p style={{ fontSize: '.72rem', fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 10 }}>
                    <i className="fa-solid fa-arrow-up-from-bracket" style={{ marginRight: 6 }} />Kaynak
                  </p>
                  <div style={{ marginBottom: 10 }}>
                    <label className="f-label">Lokasyon <span style={{ color: '#ef4444' }}>*</span></label>
                    <SearchableSelect
                      value={form.srcLocationId}
                      onChange={v => { set('srcLocationId', v); set('srcLpnId', '') }}
                      options={locationOptions}
                      placeholder="Lokasyon seçin…"
                    />
                  </div>
                  <div>
                    <label className="f-label">LPN / Palet</label>
                    <SearchableSelect
                      value={form.srcLpnId}
                      onChange={v => set('srcLpnId', v)}
                      options={lpnForSrc}
                      placeholder="İsteğe bağlı…"
                    />
                  </div>
                  {/* Balance indicator */}
                  {form.stockItemId && form.srcLocationId && (
                    <div style={{ marginTop: 10, padding: '6px 10px', background: '#fff', borderRadius: 8, border: '1px solid #fde68a', fontSize: '.79rem', fontWeight: 700 }}>
                      {srcBalanceLoading
                        ? <><i className="fa-solid fa-spinner fa-spin" /> Bakiye sorgulanıyor…</>
                        : srcBalance === null
                          ? <span style={{ color: '#94a3b8' }}>Bakiye bilgisi yok</span>
                          : <span style={{ color: srcBalance > 0 ? '#166534' : '#b91c1c' }}>
                              Mevcut: {srcBalance.toLocaleString('tr-TR', { maximumFractionDigits: 4 })} {selectedItem?.unit || ''}
                            </span>
                      }
                    </div>
                  )}
                </div>

                {/* Destination */}
                <div style={{ background: 'rgba(99,102,241,.06)', borderRadius: 10, padding: 14, border: '1px solid #c7d2fe' }}>
                  <p style={{ fontSize: '.72rem', fontWeight: 800, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 10 }}>
                    <i className="fa-solid fa-arrow-down-to-bracket" style={{ marginRight: 6 }} />Hedef
                  </p>
                  <div style={{ marginBottom: 10 }}>
                    <label className="f-label">Lokasyon <span style={{ color: '#ef4444' }}>*</span></label>
                    <SearchableSelect
                      value={form.dstLocationId}
                      onChange={v => { set('dstLocationId', v); set('dstLpnId', '') }}
                      options={locationOptions}
                      placeholder="Lokasyon seçin…"
                    />
                  </div>
                  <div>
                    <label className="f-label">LPN / Palet</label>
                    <SearchableSelect
                      value={form.dstLpnId}
                      onChange={v => set('dstLpnId', v)}
                      options={lpnForDst}
                      placeholder="İsteğe bağlı…"
                    />
                  </div>
                </div>
              </div>

              {/* Quantity, lot, expiry, note */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 2fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label className="f-label">Miktar <span style={{ color: '#ef4444' }}>*</span></label>
                  <input className="f-input" type="number" min="0.001" step="any" value={form.quantity}
                    onChange={e => set('quantity', e.target.value)}
                    placeholder="0.00" />
                </div>
                <div>
                  <label className="f-label">Lot No</label>
                  <input className="f-input" value={form.lotNumber} onChange={e => set('lotNumber', e.target.value)} placeholder="İsteğe bağlı" />
                </div>
                <div>
                  <label className="f-label">SKT</label>
                  <input className="f-input" type="date" value={form.expirationDate} onChange={e => set('expirationDate', e.target.value)} />
                </div>
                <div>
                  <label className="f-label">Not</label>
                  <input className="f-input" value={form.note} onChange={e => set('note', e.target.value)} placeholder="İsteğe bağlı not" />
                </div>
              </div>

              {/* Preview */}
              {form.stockItemId && form.srcLocationId && form.dstLocationId && safeNum(form.quantity) > 0 && (
                <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, fontSize: '.82rem', color: '#166534', marginBottom: 14 }}>
                  <i className="fa-solid fa-circle-check" style={{ marginRight: 6 }} />
                  <strong>{selectedItem?.name}</strong> — {safeNum(form.quantity).toLocaleString('tr-TR', { maximumFractionDigits: 4 })} {selectedItem?.unit || ''}
                  {' '}şuradan: <strong>{srcLocLabel || '?'}</strong>
                  {' '}→ şuraya: <strong>{dstLocLabel || '?'}</strong>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn-g" onClick={resetForm}>Temizle</button>
                <button type="submit" className="btn-p" disabled={saving}>
                  {saving ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-arrow-right-arrow-left" />}
                  {' '}Taşımayı Kaydet
                </button>
              </div>
            </div>
          </form>

          {/* ── History ─────────────────────────────────────────────────── */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '.92rem' }}>Taşıma Geçmişi</div>
                <div style={{ fontSize: '.75rem', color: '#64748b', marginTop: 2 }}>Son 100 taşıma çifti</div>
              </div>
              <button className="btn-o" style={{ fontSize: '.78rem' }} onClick={loadHistory} disabled={historyLoading}>
                {historyLoading ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-rotate-right" />}
              </button>
            </div>

            {historyLoading ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}><i className="fa-solid fa-spinner fa-spin" /></div>
            ) : history.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: '.85rem' }}>Henüz taşıma kaydı yok.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['Tarih', 'Ürün', 'Miktar', 'Kaynak Lok.', 'Hedef Lok.', 'Not'].map((h, i) => (
                      <th key={i} style={{ padding: '8px 14px', textAlign: 'left', fontSize: '.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 100).map(pair => {
                    const outRow = pair.rows.find(r => r.direction === 'out') || pair.rows[0]
                    const meta = outRow?.meta || {}
                    const srcLoc = locations.find(l => l.id === meta.src_location_id)
                    const dstLoc = locations.find(l => l.id === meta.dst_location_id)
                    return (
                      <tr key={pair.pairId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '9px 14px', color: '#475569' }}>
                          {outRow?.movement_at ? new Date(outRow.movement_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                        <td style={{ padding: '9px 14px', fontWeight: 700, color: '#0f172a' }}>{outRow?.item_name || '—'}</td>
                        <td style={{ padding: '9px 14px', fontWeight: 700, color: '#166534' }}>
                          {safeNum(outRow?.quantity).toLocaleString('tr-TR', { maximumFractionDigits: 4 })}
                        </td>
                        <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: '.78rem', color: '#b45309' }}>
                          {srcLoc ? formatAddress(srcLoc) : (meta.src_location_id ? meta.src_location_id.slice(0, 8) + '…' : '—')}
                        </td>
                        <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: '.78rem', color: '#4338ca' }}>
                          {dstLoc ? formatAddress(dstLoc) : (meta.dst_location_id ? meta.dst_location_id.slice(0, 8) + '…' : '—')}
                        </td>
                        <td style={{ padding: '9px 14px', color: '#64748b', fontSize: '.75rem' }}>{outRow?.notes || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
