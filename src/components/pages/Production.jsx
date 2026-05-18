import { useEffect, useState, useCallback } from 'react'
import { db } from '@/lib/db'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useToast } from '@/hooks/useToast'
import Header from '@/components/layout/Header'
import AddButton from '@/components/ui/AddButton'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { applyBranchFilter, asUuidOrNull, branchMatchesRecord, isBranchIncluded } from '@/lib/branchPurchasing'

function calcUnitCost(recipeRows, outputQty) {
  if (!recipeRows?.length || !outputQty) return 0
  const total = recipeRows.reduce((sum, row) => {
    const used = (parseFloat(row.qty) || 0) * (1 + (parseFloat(row.waste_pct) || 0) / 100)
    return sum + (parseFloat(row.cost) || 0) * used
  }, 0)
  return total / outputQty
}

function calcRowUsage(row, outputQty, produceQty) {
  const perOutput = (parseFloat(row.qty) || 0) * (1 + (parseFloat(row.waste_pct) || 0) / 100)
  const totalNeeded = (perOutput / outputQty) * produceQty
  const totalCost = totalNeeded * (parseFloat(row.cost) || 0)
  return { perOutput, totalNeeded, totalCost }
}

function parseJ(value, fallback) {
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

function semiVisibleInBranch(item, branchId) {
  if (!branchId) return false
  const locations = parseJ(item?.location, [])
  if (!locations.length) return true
  return isBranchIncluded(locations, branchId)
}

function balanceKey(itemType, stockItemId, semiItemId, branchId) {
  return `${itemType}:${stockItemId || ''}:${semiItemId || ''}:${branchId || ''}`
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

function ProductionModal({ open, onClose, onSave, semiItems, stockItems, decimalPlaces }) {
  const [semiId, setSemiId] = useState('')
  const [produceQty, setProduceQty] = useState('')
  const [salePrice, setSalePrice] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (open) {
      setSemiId('')
      setProduceQty('')
      setSalePrice('')
      setNotes('')
    }
  }, [open])

  const semi = semiItems.find(s => s.id === semiId)
  const outputQty = parseFloat(semi?.recipe_output_qty) || 1
  const rows = semi?.recipe_rows || []
  const unitCost = calcUnitCost(rows, outputQty)
  const qty = parseFloat(produceQty) || 0

  function handleSave() {
    if (!semiId || !qty || qty <= 0) return
    onSave({
      semi_item_id: semiId,
      produce_qty: qty,
      unit_cost: unitCost,
      sale_price: parseFloat(salePrice) || 0,
      notes: notes.trim() || null,
      recipe_rows: rows,
      recipe_output_qty: outputQty,
    })
  }

  if (!open) return null

  return (
    <div className="modal-bg open">
      <div className="modal-box" style={{ width: 'min(96vw, 780px)', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'linear-gradient(135deg,#f59e0b,#d97706)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <i className="fa-solid fa-industry" style={{ color: '#fff', fontSize: '.9rem' }} />
            </div>
            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
              Uretim Kaydi Girisi
            </h2>
          </div>
          <button className="ico-btn" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>

        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'grid', gap: 20 }}>
          <div>
            <label className="f-label">Yarimamul Secimi <span style={{ color: '#ef4444' }}>*</span></label>
            <div className="sel-wrap">
              <select className="f-input" value={semiId} onChange={e => setSemiId(e.target.value)}>
                <option value="">Yarimamul secin...</option>
                {semiItems.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.recipe_output_qty ? ` - ${s.recipe_output_qty} ${s.recipe_output_unit || 'adet'} cikti` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {semi && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontSize: '.7rem', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
                    Recete Cikti Birimi
                  </div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#78350f' }}>
                    {outputQty} {semi.recipe_output_unit || 'adet'}
                  </div>
                </div>
                <div style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontSize: '.7rem', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
                    Birim Basina Maliyet
                  </div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1e3a8a', fontFamily: 'monospace' }}>
                    {unitCost.toFixed(decimalPlaces)} TL
                  </div>
                </div>
                <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontSize: '.7rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
                    Hammadde Satiri
                  </div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#14532d' }}>
                    {rows.length} malzeme
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label className="f-label">Uretilen Miktar ({semi.recipe_output_unit || 'adet'}) <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    className="f-input"
                    type="number"
                    min="0.001"
                    step="any"
                    value={produceQty}
                    onChange={e => setProduceQty(e.target.value)}
                    placeholder={`or: ${outputQty}`}
                  />
                  {qty > 0 && (
                    <p style={{ fontSize: '.72rem', color: '#6366f1', margin: '4px 0 0', fontWeight: 600 }}>
                      Toplam maliyet: {(unitCost * qty).toFixed(decimalPlaces)} TL
                    </p>
                  )}
                </div>
                <div>
                  <label className="f-label">Satis / Sevk Fiyati (TL)</label>
                  <input
                    className="f-input"
                    type="number"
                    min="0"
                    step="any"
                    value={salePrice}
                    onChange={e => setSalePrice(e.target.value)}
                    placeholder={unitCost > 0 ? `Min. ${unitCost.toFixed(decimalPlaces)}` : '0.00'}
                  />
                  <p style={{ fontSize: '.72rem', color: '#94a3b8', margin: '4px 0 0' }}>
                    Diger subelere sevk / cari fatura fiyati
                  </p>
                </div>
              </div>

              {rows.length > 0 && (
                <div>
                  <p style={{ fontSize: '.72rem', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 8px' }}>
                    <i className="fa-solid fa-calculator" style={{ marginRight: 5 }} />
                    Receteye Gore Kullanilacak Hammadde
                  </p>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: '.78rem', width: '100%' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc' }}>
                          <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700, color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>Stok Mali</th>
                          <th style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>Birim Basina</th>
                          <th style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 700, color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>Birim</th>
                          <th style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>Birim Maliyeti</th>
                          {qty > 0 && (
                            <>
                              <th style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#6366f1', borderBottom: '2px solid #e2e8f0', borderLeft: '2px solid #e2e8f0' }}>Toplam Kullanim</th>
                              <th style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#6366f1', borderBottom: '2px solid #e2e8f0' }}>Toplam Maliyet</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, i) => {
                          const si = stockItems.find(s => s.id === row.stock_item_id)
                          const { perOutput, totalNeeded, totalCost } = calcRowUsage(row, outputQty, qty)
                          return (
                            <tr key={row.id || i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                              <td style={{ padding: '7px 10px', fontWeight: 600, color: '#0f172a' }}>
                                {si?.name || row.stock_item_id}
                              </td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'monospace', color: '#334155' }}>
                                {perOutput.toFixed(4)}
                              </td>
                              <td style={{ padding: '7px 10px', textAlign: 'center', color: '#64748b' }}>
                                {row.unit}
                              </td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'monospace', color: '#2563eb' }}>
                                {(parseFloat(row.cost) || 0).toFixed(decimalPlaces)} TL
                              </td>
                              {qty > 0 && (
                                <>
                                  <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#6366f1', borderLeft: '2px solid #e2e8f0' }}>
                                    {totalNeeded.toFixed(4)} {row.unit}
                                  </td>
                                  <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#dc2626' }}>
                                    {totalCost.toFixed(decimalPlaces)} TL
                                  </td>
                                </>
                              )}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div>
                <label className="f-label">Not (istege bagli)</label>
                <input className="f-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Uretim notu..." />
              </div>
            </>
          )}
        </div>

        <div className="modal-foot" style={{ justifyContent: 'space-between' }}>
          <button className="btn-g" onClick={onClose}>Iptal</button>
          <button
            className="btn-p"
            onClick={handleSave}
            disabled={!semiId || !qty || qty <= 0}
            style={{ opacity: (!semiId || !qty || qty <= 0) ? .5 : 1 }}
          >
            <i className="fa-solid fa-check" /> Uretimi Kaydet ve Stoka At
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Production() {
  const toast = useToast()
  const { branchId, branchName, loadingBranches } = useWorkspace()
  const [records, setRecords] = useState([])
  const [semiItems, setSemiItems] = useState([])
  const [stockItems, setStockItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [search, setSearch] = useState('')
  const [decimalPlaces, setDecimalPlaces] = useState(2)
  const [showDeleted, setShowDeleted] = useState(false)

  const load = useCallback(async () => {
    if (loadingBranches) return
    setLoading(true)
    if (!branchId) {
      setRecords([])
      setSemiItems([])
      setStockItems([])
      setLoading(false)
      return
    }

    const [{ data: rec }, { data: semi }, { data: stock }, { data: ct }] = await Promise.all([
      db.from('production_records').select('*').order('created_at', { ascending: false }),
      db.from('semi_items').select('*').is('deleted_at', null).eq('setting_active', true).order('name'),
      db.from('stock_items').select('id,name,sku,unit').is('deleted_at', null).order('name'),
      db.from('settings').select('value').eq('key', 'company_tree').single(),
    ])
    const branchScope = { id: branchId, name: branchName }
    setRecords((rec || []).filter(record => branchMatchesRecord(record, branchScope)))
    setSemiItems((semi || []).filter(item => semiVisibleInBranch(item, branchId)))
    setStockItems(stock || [])

    function findDecimal(nodes) {
      for (const n of nodes || []) {
        if (n.type === 'sirket' && n.decimalPlaces !== undefined) return n.decimalPlaces
        const r = findDecimal(n.children || [])
        if (r !== null) return r
      }
      return null
    }

    const dp = findDecimal(ct?.value || [])
    if (dp !== null) setDecimalPlaces(parseInt(dp, 10) || 2)
    setLoading(false)
  }, [branchId, branchName, loadingBranches])

  useEffect(() => { load() }, [load])

  async function handleSave({ semi_item_id, produce_qty, unit_cost, sale_price, notes, recipe_rows, recipe_output_qty }) {
    if (!branchId) {
      toast('Uretim icin once baglam subesi secilmeli', 'error')
      return
    }

    const producedAt = new Date().toISOString()
    const semi = semiItems.find(item => item.id === semi_item_id)
    if (!semi) {
      toast('Yarimamul bulunamadi', 'error')
      return
    }
    if (!semiVisibleInBranch(semi, branchId)) {
      toast('Bu yarimamul secili sube icin kullanilamiyor', 'error')
      return
    }
    const stockIds = Array.from(new Set((recipe_rows || []).map(row => row?.stock_item_id).filter(Boolean)))
    const currentBalances = new Map()

    const [{ data: stockBalanceRows, error: stockBalanceError }, { data: semiBalanceRows, error: semiBalanceError }] = await Promise.all([
      stockIds.length
        ? applyBranchFilter(
            db
              .from('inventory_current_balances')
              .select('*')
              .eq('item_type', 'stock_item')
              .in('stock_item_id', stockIds),
            { id: branchId, name: branchName },
          )
        : Promise.resolve({ data: [], error: null }),
      applyBranchFilter(
        db
          .from('inventory_current_balances')
          .select('*')
          .eq('item_type', 'semi_item')
          .eq('semi_item_id', semi_item_id),
        { id: branchId, name: branchName },
      ),
    ])

    if (stockBalanceError) {
      toast('Stok bakiyeleri okunamadi: ' + stockBalanceError.message, 'error')
      return
    }
    if (semiBalanceError) {
      toast('Yarimamul bakiyesi okunamadi: ' + semiBalanceError.message, 'error')
      return
    }

    ;(stockBalanceRows || []).forEach(row => currentBalances.set(balanceKey(row.item_type, row.stock_item_id, row.semi_item_id, row.branch_id), row))
    ;(semiBalanceRows || []).forEach(row => currentBalances.set(balanceKey(row.item_type, row.stock_item_id, row.semi_item_id, row.branch_id), row))

    const { data: productionRecord, error: recErr } = await db
      .from('production_records')
      .insert({
        branch_id: asUuidOrNull(branchId),
        branch_name: branchName || null,
        semi_item_id,
        produce_qty,
        unit_cost,
        sale_price: sale_price || null,
        total_cost: unit_cost * produce_qty,
        notes,
        status: 'completed',
        produced_at: producedAt,
      })
      .select()
      .single()

    if (recErr) {
      toast('Uretim kaydi hatasi: ' + recErr.message, 'error')
      return
    }

    const movementRows = []
    let consumedTotalCost = 0

    for (const row of recipe_rows || []) {
      if (!row?.stock_item_id) continue
      const stock = stockItems.find(item => item.id === row.stock_item_id)
      if (!stock) continue

      const usage = calcRowUsage(row, recipe_output_qty, produce_qty)
      const key = balanceKey('stock_item', row.stock_item_id, null, branchId)
      const prev = currentBalances.get(key) || null
      const prevQty = parseFloat(prev?.balance_qty_after) || 0
      const prevTotalCost = parseFloat(prev?.balance_total_cost_after) || 0
      const prevAvgCost = parseFloat(prev?.avg_unit_cost_after) || 0
      const movementUnitCost = prevAvgCost > 0 ? prevAvgCost : (parseFloat(row.cost) || 0)
      const movementTotalCost = movementUnitCost * usage.totalNeeded
      const nextQty = prevQty - usage.totalNeeded
      const nextTotalCost = prevTotalCost - movementTotalCost
      const nextAvgCost = nextQty > 0 ? (nextTotalCost / nextQty) : movementUnitCost

      consumedTotalCost += movementTotalCost

      movementRows.push({
        item_type: 'stock_item',
        stock_item_id: row.stock_item_id,
        semi_item_id: null,
        item_name: stock.name,
        item_sku: stock.sku || null,
        unit: stock.unit || row.unit || null,
        branch_id: branchId,
        branch_name: branchName,
        movement_type: 'production_consumption',
        source_doc_type: 'production',
        direction: 'out',
        movement_at: producedAt,
        quantity: usage.totalNeeded,
        source_doc_id: productionRecord.id,
        production_record_id: productionRecord.id,
        semi_recipe_row_id: row.id || null,
        unit_cost: movementUnitCost,
        total_cost: movementTotalCost,
        avg_unit_cost_after: nextAvgCost,
        balance_qty_after: nextQty,
        balance_total_cost_after: nextTotalCost,
        calc_status: 'calculated',
        notes,
        meta: {
          semi_item_id,
          semi_item_name: semi.name,
          waste_pct: parseFloat(row.waste_pct) || 0,
          recipe_output_qty,
        },
      })

      currentBalances.set(key, {
        item_type: 'stock_item',
        stock_item_id: row.stock_item_id,
        semi_item_id: null,
        branch_id: branchId,
        balance_qty_after: nextQty,
        balance_total_cost_after: nextTotalCost,
        avg_unit_cost_after: nextAvgCost,
      })
    }

    const semiKey = balanceKey('semi_item', null, semi_item_id, branchId)
    const prevSemi = currentBalances.get(semiKey) || null
    const prevSemiQty = parseFloat(prevSemi?.balance_qty_after) || 0
    const prevSemiTotalCost = parseFloat(prevSemi?.balance_total_cost_after) || 0
    const outputUnitCost = produce_qty > 0 ? (consumedTotalCost / produce_qty) : unit_cost
    const outputTotalCost = outputUnitCost * produce_qty
    const nextSemiQty = prevSemiQty + produce_qty
    const nextSemiTotalCost = prevSemiTotalCost + outputTotalCost
    const nextSemiAvgCost = nextSemiQty > 0 ? (nextSemiTotalCost / nextSemiQty) : outputUnitCost

    movementRows.push({
      item_type: 'semi_item',
      stock_item_id: null,
      semi_item_id,
      item_name: semi.name,
      item_sku: semi.sku || null,
      unit: semi.recipe_output_unit || null,
      branch_id: branchId,
      branch_name: branchName,
      movement_type: 'production_output',
      source_doc_type: 'production',
      direction: 'in',
      movement_at: producedAt,
      quantity: produce_qty,
      source_doc_id: productionRecord.id,
      production_record_id: productionRecord.id,
      unit_cost: outputUnitCost,
      total_cost: outputTotalCost,
      avg_unit_cost_after: nextSemiAvgCost,
      balance_qty_after: nextSemiQty,
      balance_total_cost_after: nextSemiTotalCost,
      calc_status: 'calculated',
      notes,
      meta: {
        semi_item_id,
        semi_item_name: semi.name,
        consumed_total_cost: consumedTotalCost,
      },
    })

    const { error: movementError } = await db.from('inventory_movements').insert(movementRows)
    if (movementError) {
      await db.from('production_records').delete().eq('id', productionRecord.id)
      toast('Envanter hareketleri yazilamadi: ' + movementError.message, 'error')
      return
    }

    const { error: recalcError } = await db.rpc('process_inventory_recalc_jobs', { p_limit: 200 })
    if (recalcError) {
      toast('Uretim kaydi yazildi ama yeniden maliyetlendirme calismadi: ' + recalcError.message, 'error')
      setModal(false)
      load()
      return
    }

    toast('Uretim kaydedildi, stok guncellendi', 'success')
    setModal(false)
    load()
  }

  async function handleDelete(item) {
    const { error } = await db.from('production_records').update({ deleted_at: new Date().toISOString() }).eq('id', item.id)
    if (error) {
      toast('Hata: ' + error.message, 'error')
      return
    }
    toast('Kayit silindi.', 'info')
    setConfirm(null)
    load()
  }

  const filtered = records.filter(r => {
    if (!r) return false
    if (!showDeleted && r.deleted_at) return false
    const semi = semiItems.find(s => s.id === r.semi_item_id)
    return !search || semi?.name?.toLowerCase().includes(search.toLowerCase())
  })

  return (
    <div>
      <Header
        title="Uretim"
        subtitle={`${branchName || 'Secili sube'} icin ${records.length} uretim kaydi`}
        actions={(
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label className="tog">
              <input type="checkbox" checked={showDeleted} onChange={e => setShowDeleted(e.target.checked)} />
              <span className="tog-sl" />
            </label>
            <span style={{ fontSize: '.8rem', color: '#64748b', whiteSpace: 'nowrap' }}>Silinmisleri goster</span>
            <AddButton onClick={() => setModal(true)} label="Üretim Kaydı Ekle" />
          </div>
        )}
      />

      <div style={{ position: 'relative', maxWidth: 400, marginBottom: 16 }}>
        <i
          className="fa-solid fa-magnifying-glass"
          style={{
            position: 'absolute',
            left: 11,
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#94a3b8',
            fontSize: '.85rem',
            pointerEvents: 'none',
          }}
        />
        <input
          className="f-input"
          placeholder="Yarimamul adi ile ara..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ paddingLeft: 32 }}
        />
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
            <i className="fa-solid fa-spinner fa-spin" /> Yukleniyor...
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 50 }}>#</th>
                <th>YARIMAMUL</th>
                <th style={{ textAlign: 'right' }}>URETILEN</th>
                <th style={{ textAlign: 'right' }}>BIRIM MALIYET</th>
                <th style={{ textAlign: 'right' }}>TOPLAM MALIYET</th>
                <th style={{ textAlign: 'right' }}>SATIS FIYATI</th>
                <th>TARIH</th>
                <th>NOT</th>
                <th style={{ width: 60 }}>ISLEM</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <div style={{ padding: '40px 0', textAlign: 'center', color: '#94a3b8' }}>
                      <i className="fa-solid fa-industry" style={{ fontSize: '2rem', marginBottom: 10, display: 'block' }} />
                      <p style={{ margin: 0 }}>Henuz uretim kaydi yok</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.map((r, idx) => {
                const semi = semiItems.find(s => s.id === r.semi_item_id)
                return (
                  <tr key={r.id} style={{ opacity: r.deleted_at ? .5 : 1 }}>
                    <td style={{ color: '#94a3b8', fontWeight: 600 }}>{idx + 1}</td>
                    <td style={{ fontWeight: 700, color: '#0f172a' }}>{semi?.name || '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                      {r.produce_qty} {semi?.recipe_output_unit || 'adet'}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', color: '#2563eb' }}>
                      {(parseFloat(r.unit_cost) || 0).toFixed(decimalPlaces)} TL
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#dc2626' }}>
                      {(parseFloat(r.total_cost) || 0).toFixed(decimalPlaces)} TL
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', color: '#16a34a', fontWeight: 700 }}>
                      {r.sale_price ? `${parseFloat(r.sale_price).toFixed(decimalPlaces)} TL` : '—'}
                    </td>
                    <td style={{ color: '#64748b', fontSize: '.8rem' }}>{formatDate(r.produced_at)}</td>
                    <td style={{ color: '#94a3b8', fontSize: '.78rem', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.notes || '—'}
                    </td>
                    <td>
                      {r.deleted_at ? (
                        <button
                          className="ico-btn"
                          title="Geri Al"
                          style={{ color: '#16a34a', background: '#d1fae5' }}
                          onClick={async () => {
                            await db.from('production_records').update({ deleted_at: null }).eq('id', r.id)
                            load()
                          }}
                        >
                          <i className="fa-solid fa-rotate-left" />
                        </button>
                      ) : (
                        <button className="ico-btn del" onClick={() => setConfirm(r)}>
                          <i className="fa-solid fa-trash" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <ProductionModal
        open={modal}
        onClose={() => setModal(false)}
        onSave={handleSave}
        semiItems={semiItems}
        stockItems={stockItems}
        decimalPlaces={decimalPlaces}
      />

      <ConfirmDialog
        open={!!confirm}
        title="Uretim kaydi silinsin mi?"
        message={confirm ? `Bu kayit silinmis olarak isaretlenecek: ${semiItems.find(s => s.id === confirm.semi_item_id)?.name || 'Yarimamul'}` : ''}
        onCancel={() => setConfirm(null)}
        onConfirm={() => handleDelete(confirm)}
      />
    </div>
  )
}
