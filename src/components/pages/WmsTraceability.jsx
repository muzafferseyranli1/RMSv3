import { useCallback, useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import { useToast } from '@/hooks/useToast'
import { db } from '@/lib/db'

// ─── Helpers ────────────────────────────────────────────────────────────────

const MOVEMENT_TYPE_LABELS = {
  purchase_receipt: 'Mal Kabul (Tedarikçi Girişi)',
  transfer_in:      'Transfer Girişi (Depodan Gelen)',
  transfer_out:     'Transfer Çıkışı (Sevk Edilen)',
  sale_consumption: 'Satış Tüketimi',
  waste_consumption:'Zayi / Hurda Çıkışı',
  manual_adjustment_in:  'Manuel Stok Düzeltme Girişi',
  manual_adjustment_out: 'Manuel Stok Düzeltme Çıkışı',
  stock_count_gain: 'Sayım Fazlası Girişi',
  stock_count_loss: 'Sayım Eksiği Çıkışı',
}

const EVENT_TYPE_LABELS = {
  scan_item:     'Ürün Barkodu Okutuldu',
  scan_location: 'Lokasyon Barkodu Okutuldu',
  scan_lpn:      'LPN (Palet) Barkodu Okutuldu',
  qty_confirm:   'Miktar Doğrulandı',
  completed:     'Görev Başarıyla Tamamlandı',
  exception:     'Hata / Sorun Kaydedildi',
  cancelled:     'Görev İptal Edildi',
  assigned:      'Görev Personele Atandı',
  started:       'Görev Başlatıldı',
}

function getEventLabel(type) {
  return EVENT_TYPE_LABELS[type] || type
}

function getMovementLabel(type) {
  return MOVEMENT_TYPE_LABELS[type] || type
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function WmsTraceability() {
  const toast = useToast()
  
  // Search state
  const [lotSearch, setLotSearch] = useState('')
  const [activeLot, setActiveLot] = useState('')
  const [searching, setSearching] = useState(false)

  // Report data states
  const [movements, setMovements] = useState([])
  const [androidEvents, setAndroidEvents] = useState([])
  const [personnelMap, setPersonnelMap] = useState(new Map())

  // Load personnel records to translate personnel_id to full names
  const loadPersonnel = useCallback(async () => {
    try {
      const { data, error } = await db.from('settings').select('value').eq('key', 'personnel_records').single()
      if (error) throw error
      
      const map = new Map()
      const records = data?.value || []
      for (const p of records) {
        if (p.id) {
          map.set(p.id, `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.pinCode || p.id)
        }
      }
      setPersonnelMap(map)
    } catch (e) {
      console.warn('Personnel records could not be loaded for naming mapping:', e.message)
    }
  }, [])

  useEffect(() => {
    loadPersonnel()
  }, [loadPersonnel])

  const handleSearch = async (e) => {
    if (e) e.preventDefault()
    
    const term = lotSearch.trim()
    if (!term) {
      toast('Lütfen geçerli bir lot numarası girin.', 'error')
      return
    }

    setSearching(true)
    try {
      // 1. Fetch movements via RPC
      const { data: movData, error: movError } = await db.rpc('get_lot_movements_report', { p_lot_number: term })
      if (movError) throw movError

      // 2. Fetch Android execution events via RPC
      const { data: eventData, error: eventError } = await db.rpc('get_lot_android_events', { p_lot_number: term })
      if (eventError) throw eventError

      setMovements(movData || [])
      setAndroidEvents(eventData || [])
      setActiveLot(term)
      
      if (!movData || movData.length === 0) {
        toast('Girilen lot numarasına ait herhangi bir hareket bulunamadı.', 'warning')
      } else {
        toast('İzlenebilirlik raporu başarıyla yüklendi.', 'success')
      }
    } catch (err) {
      toast('Rapor yükleme hatası: ' + err.message, 'error')
    } finally {
      setSearching(false)
    }
  }

  // Aggregate lot distribution across branches (Recall list)
  const branchRecallSummary = useMemo(() => {
    const summary = new Map()
    
    // We trace receiving branches by filtering IN direction movements that are transfer_in or purchase_receipt
    for (const m of movements) {
      if (m.direction === 'in' && (m.movement_type === 'transfer_in' || m.movement_type === 'purchase_receipt')) {
        const key = m.branch_id
        const current = summary.get(key) || {
          branch_name: m.branch_name,
          received_qty: 0,
          unit: m.unit,
          first_received_at: m.movement_at,
          last_received_at: m.movement_at
        }
        
        current.received_qty += Number(m.quantity || 0)
        if (new Date(m.movement_at) < new Date(current.first_received_at)) {
          current.first_received_at = m.movement_at
        }
        if (new Date(m.movement_at) > new Date(current.last_received_at)) {
          current.last_received_at = m.movement_at
        }
        
        summary.set(key, current)
      }
    }
    
    return Array.from(summary.values()).sort((a, b) => b.received_qty - a.received_qty)
  }, [movements])

  // Group task events by task for the timeline view
  const groupedTasks = useMemo(() => {
    const tasks = new Map()
    for (const ev of androidEvents) {
      const taskId = ev.task_id
      if (!tasks.has(taskId)) {
        tasks.set(taskId, {
          id: taskId,
          task_type: ev.task_type,
          description: ev.task_description,
          events: []
        })
      }
      tasks.get(taskId).events.push(ev)
    }
    return Array.from(tasks.values())
  }, [androidEvents])

  // Get general product details from the first movement record
  const lotInfo = useMemo(() => {
    if (movements.length === 0) return null
    const first = movements[0]
    return {
      product_name: first.item_name,
      sku: first.item_sku,
      unit: first.unit,
      expiration_date: first.expiration_date
    }
  }, [movements])

  function exportRecallCSV() {
    if (branchRecallSummary.length === 0) return
    const headers = ['Şube Adı', 'Miktar', 'Birim', 'İlk Alım Tarihi', 'Son Alım Tarihi']
    const rows = branchRecallSummary.map(s => [
      s.branch_name,
      s.received_qty,
      s.unit,
      new Date(s.first_received_at).toLocaleString('tr-TR'),
      new Date(s.last_received_at).toLocaleString('tr-TR')
    ])
    
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n')
      
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `Lot_${activeLot}_Geri_Cagirma_Raporu.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="container" style={{ padding: '24px 0' }}>
      <Header
        title="Lot & SKT İzlenebilirlik Raporu"
        subtitle="Hangi ürün lotunun hangi şubelere ulaştığını takip edin, mobil cihaz tarama geçmişini ve geri çağırma listelerini oluşturun."
      />

      {/* Search Bar */}
      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 300px' }}>
            <label className="f-label">Lot Numarası Girin</label>
            <div style={{ position: 'relative' }}>
              <input
                className="f-input"
                style={{ paddingLeft: 36 }}
                placeholder="Örn: LOT-2026-A veya SKT/Lot no..."
                value={lotSearch}
                onChange={e => setLotSearch(e.target.value)}
                required
              />
              <i className="fa-solid fa-barcode" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            </div>
          </div>
          <button
            type="submit"
            className="f-button"
            style={{ minHeight: 42, background: '#2563eb', color: '#fff', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 8 }}
            disabled={searching}
          >
            {searching ? (
              <>
                <i className="fa-solid fa-spinner fa-spin" />
                Sorgulanıyor...
              </>
            ) : (
              <>
                <i className="fa-solid fa-route" />
                İzini Sür
              </>
            )}
          </button>
        </form>
      </div>

      {activeLot && lotInfo && (
        <>
          {/* Lot Info summary */}
          <div className="card" style={{ padding: 20, marginBottom: 24, background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <span style={{ fontSize: '.76rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', tracking: '0.05em' }}>Sorgulanan Lot</span>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', margin: '4px 0 8px 0' }}>
                  {activeLot}
                </h2>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: '.84rem', color: '#475569' }}>
                  <div><strong>Ürün:</strong> {lotInfo.product_name}</div>
                  <div><strong>SKU:</strong> {lotInfo.sku || '—'}</div>
                  {lotInfo.expiration_date && (
                    <div style={{ color: '#dc2626', fontWeight: 600 }}>
                      <i className="fa-solid fa-calendar-times" style={{ marginRight: 4 }} />
                      <strong>SKT:</strong> {lotInfo.expiration_date}
                    </div>
                  )}
                </div>
              </div>
              {branchRecallSummary.length > 0 && (
                <button
                  type="button"
                  className="f-button"
                  onClick={exportRecallCSV}
                  style={{ background: '#0d9488', color: '#fff', fontSize: '.8rem', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <i className="fa-solid fa-file-csv" style={{ fontSize: '1rem' }} />
                  Geri Çağırma Listesi (CSV)
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }} className="traceability-grid">
            
            {/* Left: Distribution & Recall List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              
              {/* Branch summary list */}
              <div className="card" style={{ padding: 20 }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="fa-solid fa-circle-exclamation" style={{ color: '#ea580c' }} />
                  Şube Dağılım & Geri Çağırma Listesi (Recall)
                </h3>
                {branchRecallSummary.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: '.8rem' }}>
                    Bu lot numarasına ait herhangi bir şube teslimatı bulunamadı.
                  </div>
                ) : (
                  <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '.8rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1.5px solid #cbd5e1', color: '#475569' }}>
                        <th style={{ padding: '8px 12px', fontWeight: 700 }}>Şube Adı</th>
                        <th style={{ padding: '8px 12px', fontWeight: 700, textAlign: 'right' }}>Toplam Teslim</th>
                        <th style={{ padding: '8px 12px', fontWeight: 700 }}>İlk Giriş</th>
                        <th style={{ padding: '8px 12px', fontWeight: 700 }}>Son Giriş</th>
                      </tr>
                    </thead>
                    <tbody>
                      {branchRecallSummary.map((s, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1e293b' }}>{s.branch_name}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>
                            {s.received_qty.toLocaleString('tr-TR')} {s.unit}
                          </td>
                          <td style={{ padding: '10px 12px', color: '#64748b' }}>{new Date(s.first_received_at).toLocaleDateString('tr-TR')}</td>
                          <td style={{ padding: '10px 12px', color: '#64748b' }}>{new Date(s.last_received_at).toLocaleDateString('tr-TR')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Complete Inventory Movements History */}
              <div className="card" style={{ padding: 20 }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="fa-solid fa-clock-rotate-left" style={{ color: '#2563eb' }} />
                  Detaylı Stok Hareket Defteri (Ledger)
                </h3>
                <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                  <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '.76rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1.5px solid #cbd5e1', color: '#475569', position: 'sticky', top: 0, background: '#fff' }}>
                        <th style={{ padding: '8px 8px', fontWeight: 700 }}>Tarih</th>
                        <th style={{ padding: '8px 8px', fontWeight: 700 }}>Şube / Depo</th>
                        <th style={{ padding: '8px 8px', fontWeight: 700 }}>İşlem Tipi</th>
                        <th style={{ padding: '8px 8px', fontWeight: 700, textAlign: 'right' }}>Miktar</th>
                        <th style={{ padding: '8px 8px', fontWeight: 700 }}>Lokasyon / LPN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.map((m, idx) => {
                        const isOut = m.direction === 'out'
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '8px 8px', color: '#64748b' }}>{new Date(m.movement_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                            <td style={{ padding: '8px 8px', fontWeight: 500, color: '#334155' }}>
                              {m.branch_name} {m.warehouse_name ? `(${m.warehouse_name})` : ''}
                            </td>
                            <td style={{ padding: '8px 8px' }}>
                              <span style={{
                                color: isOut ? '#b91c1c' : '#15803d',
                                fontWeight: 600,
                              }}>
                                {getMovementLabel(m.movement_type)}
                              </span>
                            </td>
                            <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 700, color: isOut ? '#b91c1c' : '#15803d' }}>
                              {isOut ? '-' : '+'}{Number(m.quantity).toLocaleString('tr-TR')} {m.unit}
                            </td>
                            <td style={{ padding: '8px 8px', color: '#475569' }}>
                              {m.location_address && m.location_address !== '—' && (
                                <div><i className="fa-solid fa-map-location-dot" style={{ opacity: 0.5, marginRight: 4 }} />{m.location_address}</div>
                              )}
                              {m.lpn_code && (
                                <div style={{ fontSize: '.7rem', color: '#b45309' }}><i className="fa-solid fa-pallet" style={{ opacity: 0.5, marginRight: 4 }} />{m.lpn_code}</div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

            {/* Right: Android Execution & Scan Timeline */}
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fa-solid fa-mobile-screen-button" style={{ color: '#10b981' }} />
                Android Tarama & Görev İcra Zaman Çizelgesi
              </h3>

              {groupedTasks.length === 0 ? (
                <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: '.8rem' }}>
                  <i className="fa-solid fa-barcode fa-2x" style={{ marginBottom: 12, color: '#e2e8f0' }} />
                  <div>Mobil cihaz tarama verisi bulunamadı.</div>
                  <div style={{ fontSize: '.74rem', marginTop: 4 }}>Bu lot, Android WMS modülü ile işlem görmemiş olabilir.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24, borderLeft: '2px solid #e2e8f0', paddingLeft: 20, marginLeft: 10 }}>
                  {groupedTasks.map((t, tIdx) => (
                    <div key={t.id} style={{ position: 'relative' }}>
                      
                      {/* Node Bullet */}
                      <span style={{
                        position: 'absolute', left: -29, top: 4,
                        width: 16, height: 16, borderRadius: '50%',
                        background: t.task_type === 'pick' ? '#6366f1' : '#10b981',
                        border: '4px solid #fff', boxShadow: '0 0 0 2px #e2e8f0'
                      }} />

                      {/* Task Info */}
                      <div style={{ marginBottom: 12 }}>
                        <span style={{
                          fontSize: '.68rem', fontWeight: 700, textTransform: 'uppercase',
                          color: t.task_type === 'pick' ? '#6366f1' : '#10b981',
                          background: t.task_type === 'pick' ? 'rgba(99,102,241,.1)' : 'rgba(16,185,129,.1)',
                          padding: '2px 8px', borderRadius: 4
                        }}>
                          {t.task_type === 'pick' ? 'Toplama (Pick)' : 'Yerleştirme (Putaway)'}
                        </span>
                        <div style={{ fontSize: '.85rem', fontWeight: 700, color: '#1e293b', marginTop: 6 }}>
                          {t.description || `${t.task_type} Görevi`}
                        </div>
                      </div>

                      {/* Event details within the task */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {t.events.map((ev, eIdx) => {
                          const staffName = personnelMap.get(ev.personnel_id) || ev.personnel_id || 'Bilinmeyen Personel'
                          const isComplete = ev.event_type === 'completed'
                          const isException = ev.event_type === 'exception'

                          return (
                            <div key={ev.event_id} style={{
                              background: isComplete ? '#f0fdf4' : isException ? '#fef2f2' : '#f8fafc',
                              border: `1px solid ${isComplete ? '#bbf7d0' : isException ? '#fecaca' : '#e2e8f0'}`,
                              borderRadius: 10, padding: '10px 12px', fontSize: '.76rem'
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                <strong style={{ color: isComplete ? '#15803d' : isException ? '#b91c1c' : '#334155' }}>
                                  {getEventLabel(ev.event_type)}
                                </strong>
                                <span style={{ color: '#94a3b8', fontSize: '.68rem' }}>
                                  {new Date(ev.created_at).toLocaleTimeString('tr-TR')}
                                </span>
                              </div>

                              <div style={{ color: '#475569', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <div>
                                  <i className="fa-solid fa-user" style={{ marginRight: 6, opacity: 0.6 }} />
                                  <strong>Personel:</strong> {staffName}
                                </div>
                                {ev.terminal_id && (
                                  <div>
                                    <i className="fa-solid fa-mobile-button" style={{ marginRight: 6, opacity: 0.6 }} />
                                    <strong>Cihaz (Terminal):</strong> {ev.terminal_id}
                                  </div>
                                )}
                                {ev.barcode_scanned && (
                                  <div>
                                    <i className="fa-solid fa-barcode" style={{ marginRight: 6, opacity: 0.6 }} />
                                    <strong>Okutulan Barkod:</strong> <code style={{ background: '#e2e8f0', padding: '1px 4px', borderRadius: 4 }}>{ev.barcode_scanned}</code>
                                  </div>
                                )}
                                {ev.payload && Object.keys(ev.payload).length > 0 && (
                                  <div style={{
                                    marginTop: 4, paddingTop: 4, borderTop: '1px dashed #cbd5e1',
                                    fontSize: '.7rem', color: '#64748b'
                                  }}>
                                    <strong>Detaylar:</strong> {JSON.stringify(ev.payload)}
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>

                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </>
      )}

      {!activeLot && !searching && (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
          <i className="fa-solid fa-circle-info fa-2x" style={{ marginBottom: 12, color: '#cbd5e1' }} />
          <div>Lütfen izlenebilirlik durumunu sorgulamak için yukarıya bir Lot / SKT numarası girin.</div>
        </div>
      )}
    </div>
  )
}
