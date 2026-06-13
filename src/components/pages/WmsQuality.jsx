import { useCallback, useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import Modal from '@/components/ui/Modal'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { useToast } from '@/hooks/useToast'
import { db, resolveImageUrl } from '@/lib/db'
import { useWorkspace } from '@/context/WorkspaceContext'

// ─── Helpers ────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  hold:     { label: 'Karantina (Hold)', color: '#dc2626', bg: 'rgba(220,38,38,.12)', icon: 'fa-lock' },
  released: { label: 'Kabul Edildi',     color: '#16a34a', bg: 'rgba(22,163,74,.12)',  icon: 'fa-unlock' },
  rejected: { label: 'Reddedildi/İade',  color: '#ea580c', bg: 'rgba(234,88,12,.12)',  icon: 'fa-circle-xmark' },
  scrapped: { label: 'Hurdaya Ayrıldı', color: '#64748b', bg: 'rgba(100,116,139,.12)', icon: 'fa-trash' },
}

function StatusBadge({ value }) {
  const cfg = STATUS_CONFIG[value] || { label: value, color: '#64748b', bg: 'rgba(100,116,139,.12)', icon: 'fa-question' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.color}33`,
      borderRadius: 99, padding: '4px 10px',
      fontSize: '.75rem', fontWeight: 700,
    }}>
      <i className={`fa-solid ${cfg.icon}`} />
      {cfg.label}
    </span>
  )
}

function getAllAnadepoFromTree(tree) {
  const result = []
  function walk(nodes) {
    for (const n of nodes || []) {
      if (n.type === 'anadepo' && n.id && n.name) result.push({ id: String(n.id), name: n.name })
      walk(n.children || [])
    }
  }
  walk(tree)
  return result
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function WmsQuality() {
  const toast = useToast()
  const { branches: workspaceBranches } = useWorkspace()

  const [holds, setHolds] = useState([])
  const [depots, setDepots] = useState([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [filterDepot, setFilterDepot] = useState('')
  const [filterStatus, setFilterStatus] = useState('hold')
  const [search, setSearch] = useState('')

  // Resolution Modal
  const [resolveModal, setResolveModal] = useState(false)
  const [selectedHold, setSelectedHold] = useState(null)
  const [actionType, setActionType] = useState('') // 'release', 'reject', 'scrap'
  const [resolutionReason, setResolutionReason] = useState('')
  const [resolving, setResolving] = useState(false)

  // Image Preview Modal
  const [previewImage, setPreviewImage] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: holdsData }, { data: ct }] = await Promise.all([
        db.from('v_warehouse_quality_holds').select('*').order('created_at', { ascending: false }),
        db.from('settings').select('value').eq('key', 'company_tree').single(),
      ])
      setHolds(holdsData || [])
      setDepots(getAllAnadepoFromTree(ct?.value || []))
    } catch (e) {
      toast('Kalite kayıtları yüklenemedi: ' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  // Filtered holds
  const filtered = useMemo(() => {
    return holds.filter(h => {
      if (filterDepot && h.branch_id !== filterDepot) return false
      if (filterStatus && filterStatus !== 'all' && h.status !== filterStatus) return false
      if (search) {
        const q = search.toLowerCase()
        const matchItem = (h.stock_item_name || '').toLowerCase().includes(q)
        const matchSku = (h.stock_item_sku || '').toLowerCase().includes(q)
        const matchLot = (h.lot_number || '').toLowerCase().includes(q)
        if (!matchItem && !matchSku && !matchLot) return false
      }
      return true
    })
  }, [holds, filterDepot, filterStatus, search])

  function openResolve(hold, type) {
    setSelectedHold(hold)
    setActionType(type)
    setResolutionReason('')
    setResolveModal(true)
  }

  async function handleResolveSubmit(e) {
    e.preventDefault()
    if (!resolutionReason.trim()) {
      toast('Lütfen işlem gerekçesini/notunu yazın.', 'error')
      return
    }

    setResolving(true)
    try {
      // Call resolved RPC function
      const { data, error } = await db.rpc('resolve_warehouse_quality_hold', {
        p_hold_id: selectedHold.id,
        p_action: actionType,
        p_reason: resolutionReason.trim(),
        p_personnel_id: null // Optionally passed from login staff if integrated, null defaults safely
      })

      if (error) throw error

      if (data?.success) {
        toast(`Stok başarıyla ${actionType === 'release' ? 'kabul edildi (released)' : actionType === 'reject' ? 'iade edildi (rejected)' : 'hurdaya ayrıldı (scrapped)'}.`, 'success')
        setResolveModal(false)
        load()
      } else {
        throw new Error('Bir sorun oluştu.')
      }
    } catch (err) {
      toast('İşlem başarısız: ' + err.message, 'error')
    } finally {
      setResolving(false)
    }
  }

  return (
    <div className="container" style={{ padding: '24px 0' }}>
      <Header
        title="Kalite & Karantina Yönetimi"
        subtitle="Karantina altındaki stokların durumunu inceleyin, kabul edin, iade veya imha kararı verin."
      />

      {/* Filter Bar */}
      <div className="card" style={{ padding: 20, marginBottom: 24, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
        <div style={{ flex: '1 1 200px' }}>
          <label className="f-label">Depo Seçimi</label>
          <select
            className="f-input"
            value={filterDepot}
            onChange={e => setFilterDepot(e.target.value)}
          >
            <option value="">Tüm Depolar</option>
            {depots.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <div style={{ flex: '1 1 200px' }}>
          <label className="f-label">Durum Filtresi</label>
          <select
            className="f-input"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
          >
            <option value="all">Tüm Durumlar</option>
            <option value="hold">Karantina (Hold)</option>
            <option value="released">Kabul Edilenler (Released)</option>
            <option value="rejected">Reddedilenler (Rejected)</option>
            <option value="scrapped">Hurdaya Ayrılanlar (Scrapped)</option>
          </select>
        </div>

        <div style={{ flex: '2 1 300px' }}>
          <label className="f-label">Ürün Adı, SKU veya Lot Numarası Ara</label>
          <div style={{ position: 'relative' }}>
            <input
              className="f-input"
              style={{ paddingLeft: 36 }}
              placeholder="Filtrelemek için yazın..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          </div>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>
            <i className="fa-solid fa-spinner fa-spin fa-2x" style={{ marginBottom: 12 }} />
            <div>Kalite kayıtları yükleniyor...</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
            <i className="fa-solid fa-shield-circle-check fa-3x" style={{ marginBottom: 16, color: '#cbd5e1' }} />
            <div style={{ fontSize: '1rem', fontWeight: 600 }}>Kayıt Bulunamadı</div>
            <div style={{ fontSize: '.85rem' }}>Seçilen filtrelere uyan herhangi bir kalite hold kaydı yoktur.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '14px 16px', fontSize: '.76rem', fontWeight: 700, color: '#475569' }}>ÜRÜN / SKU</th>
                  <th style={{ padding: '14px 16px', fontSize: '.76rem', fontWeight: 700, color: '#475569' }}>DEPO</th>
                  <th style={{ padding: '14px 16px', fontSize: '.76rem', fontWeight: 700, color: '#475569' }}>LOKASYON / LPN</th>
                  <th style={{ padding: '14px 16px', fontSize: '.76rem', fontWeight: 700, color: '#475569' }}>LOT / SKT</th>
                  <th style={{ padding: '14px 16px', fontSize: '.76rem', fontWeight: 700, color: '#475569', textAlign: 'right' }}>MİKTAR</th>
                  <th style={{ padding: '14px 16px', fontSize: '.76rem', fontWeight: 700, color: '#475569' }}>DURUM</th>
                  <th style={{ padding: '14px 16px', fontSize: '.76rem', fontWeight: 700, color: '#475569' }}>KANIT / SEBEP</th>
                  <th style={{ padding: '14px 16px', fontSize: '.76rem', fontWeight: 700, color: '#475569', textAlign: 'right' }}>İŞLEM</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => {
                  const hasPhoto = !!row.evidence_photo_url
                  const isPending = row.status === 'hold'

                  return (
                    <tr key={row.id} style={{ borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' }}>
                      {/* Product */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '.85rem' }}>{row.stock_item_name}</div>
                        <div style={{ color: '#64748b', fontSize: '.76rem' }}>SKU: {row.stock_item_sku || '—'}</div>
                      </td>

                      {/* Depot */}
                      <td style={{ padding: '14px 16px', fontSize: '.8rem', color: '#334155' }}>
                        {row.branch_name || '—'}
                      </td>

                      {/* Location / LPN */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontSize: '.8rem', fontWeight: 600, color: '#334155' }}>
                          <i className="fa-solid fa-map-location-dot" style={{ color: '#94a3b8', marginRight: 6 }} />
                          {row.location_address || '—'}
                        </div>
                        {row.lpn_code && (
                          <div style={{ fontSize: '.74rem', color: '#64748b', marginTop: 2 }}>
                            <i className="fa-solid fa-pallet" style={{ color: '#b45309', marginRight: 6 }} />
                            {row.lpn_code}
                          </div>
                        )}
                      </td>

                      {/* Lot / Expiration Date */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontSize: '.8rem', fontWeight: 600, color: '#334155' }}>Lot: {row.lot_number || '—'}</div>
                        {row.expiration_date && (
                          <div style={{ fontSize: '.74rem', color: '#dc2626', marginTop: 2, fontWeight: 500 }}>
                            <i className="fa-solid fa-calendar-times" style={{ marginRight: 4 }} />
                            SKT: {row.expiration_date}
                          </div>
                        )}
                      </td>

                      {/* Quantity */}
                      <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 700, fontSize: '.9rem', color: '#1e293b' }}>
                        {Number(row.hold_qty).toLocaleString('tr-TR')} <span style={{ fontSize: '.74rem', color: '#64748b', fontWeight: 500 }}>{row.stock_item_unit}</span>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '14px 16px' }}>
                        <StatusBadge value={row.status} />
                      </td>

                      {/* Evidence / Reason */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {hasPhoto && (
                            <div
                              onClick={() => setPreviewImage(resolveImageUrl(row.evidence_photo_url))}
                              style={{
                                width: 40, height: 40, borderRadius: 8, overflow: 'hidden',
                                border: '1px solid #cbd5e1', cursor: 'pointer', flexShrink: 0,
                                background: '#f1f5f9', position: 'relative'
                              }}
                              title="Fotoğrafı Büyüt"
                            >
                              <img
                                src={resolveImageUrl(row.evidence_photo_url)}
                                alt="Kanıt"
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            </div>
                          )}
                          <div style={{ fontSize: '.78rem', color: '#475569', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.reason}>
                            {row.reason || '—'}
                          </div>
                        </div>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        {isPending ? (
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="f-button"
                              onClick={() => openResolve(row, 'release')}
                              style={{
                                padding: '6px 10px', fontSize: '.76rem', background: '#22c55e', color: '#fff',
                                display: 'inline-flex', alignItems: 'center', gap: 4
                              }}
                            >
                              <i className="fa-solid fa-check" /> Kabul Et
                            </button>
                            <button
                              type="button"
                              className="f-button"
                              onClick={() => openResolve(row, 'reject')}
                              style={{
                                padding: '6px 10px', fontSize: '.76rem', background: '#f97316', color: '#fff',
                                display: 'inline-flex', alignItems: 'center', gap: 4
                              }}
                            >
                              <i className="fa-solid fa-reply" /> İade Et
                            </button>
                            <button
                              type="button"
                              className="f-button"
                              onClick={() => openResolve(row, 'scrap')}
                              style={{
                                padding: '6px 10px', fontSize: '.76rem', background: '#dc2626', color: '#fff',
                                display: 'inline-flex', alignItems: 'center', gap: 4
                              }}
                            >
                              <i className="fa-solid fa-trash-can" /> Hurda Et
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: '.76rem', color: '#94a3b8', fontStyle: 'italic' }}>
                            {row.released_at ? `${new Date(row.released_at).toLocaleDateString('tr-TR')} Çözüldü` : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Action Resolution Modal */}
      {resolveModal && selectedHold && (
        <Modal
          title={`${actionType === 'release' ? 'Kalite Onay & Kabul' : actionType === 'reject' ? 'Tedarikçi İade Kararı' : 'Hurdaya Ayırma Kararı'}`}
          onClose={() => setResolveModal(false)}
        >
          <form onSubmit={handleResolveSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#f8fafc', padding: 12, borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '.8rem' }}>
              <div style={{ marginBottom: 4 }}><strong>Ürün:</strong> {selectedHold.stock_item_name}</div>
              <div style={{ marginBottom: 4 }}><strong>Lot:</strong> {selectedHold.lot_number || '—'}</div>
              <div><strong>Miktar:</strong> {Number(selectedHold.hold_qty).toLocaleString('tr-TR')} {selectedHold.stock_item_unit}</div>
            </div>

            <div>
              <label className="f-label">İşlem Gerekçesi / Karar Notu (Zorunlu)</label>
              <textarea
                className="f-input"
                style={{ minHeight: 80 }}
                placeholder="Bu karar için teknik gerekçeleri yazın..."
                value={resolutionReason}
                onChange={e => setResolutionReason(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                type="button"
                className="f-button"
                style={{ background: '#e2e8f0', color: '#475569' }}
                onClick={() => setResolveModal(false)}
                disabled={resolving}
              >
                Vazgeç
              </button>
              <button
                type="submit"
                className="f-button"
                style={{
                  background: actionType === 'release' ? '#22c55e' : actionType === 'reject' ? '#f97316' : '#dc2626',
                  color: '#fff'
                }}
                disabled={resolving}
              >
                {resolving ? (
                  <span><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }} /> İşleniyor...</span>
                ) : (
                  'Kararı Kaydet'
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <Modal title="Kanıt Fotoğrafı" onClose={() => setPreviewImage(null)}>
          <div style={{ textAlign: 'center', background: '#000', borderRadius: 8, padding: 8, overflow: 'hidden' }}>
            <img
              src={previewImage}
              alt="Evidence Fullsize"
              style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', display: 'block', margin: '0 auto' }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button
              type="button"
              className="f-button"
              onClick={() => setPreviewImage(null)}
              style={{ background: '#64748b', color: '#fff' }}
            >
              Kapat
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
