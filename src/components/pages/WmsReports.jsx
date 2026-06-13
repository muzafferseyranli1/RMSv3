import React, { useState, useEffect, useCallback } from 'react'
import { db, buildApiUrl } from '@/lib/db'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useToast } from '@/hooks/useToast'

export default function WmsReports() {
  const toast = useToast()
  const { currentBranch } = useWorkspace()
  const branchId = currentBranch?.id

  const [activeTab, setActiveTab] = useState('stock') // stock, lpn, logs, performance, expiry
  const [loading, setLoading] = useState(false)

  // Report Metrics state
  const [reportMetrics, setReportMetrics] = useState({
    stock_distribution: { available: 0, reserved: 0, quarantine: 0, putaway_pending: 0 },
    location_occupancy: { total: 0, occupied: 0, rate: 0 },
    expiry_approaching: [],
    vehicle_usage: [],
    fill_rate: [],
    late_shipments: [],
    personnel_performance: [],
    missing_pkg_dimensions: [],
    missing_vehicle_capacities: []
  })

  // LPN Search state
  const [lpnQuery, setLpnQuery] = useState('')
  const [lpnLoading, setLpnLoading] = useState(false)
  const [lpnData, setLpnData] = useState(null) // { lpn, contents, history }

  // Scan Logs state
  const [logsLoading, setLogsLoading] = useState(false)
  const [scanLogs, setScanLogs] = useState([])

  // Load Main Metrics
  const loadMetrics = useCallback(async () => {
    if (!branchId) return
    setLoading(true)
    try {
      const res = await fetch(buildApiUrl(`/api/wms/reports/metrics?branch_id=${branchId}`))
      const json = await res.json()
      if (json.error) {
        throw new Error(json.error.message || 'Rapor metrikleri alınamadı.')
      }
      if (json.data) {
        setReportMetrics(json.data)
      }
    } catch (err) {
      toast(err.message || 'Bağlantı hatası.', 'error')
    } finally {
      setLoading(false)
    }
  }, [branchId, toast])

  // Load Scan logs
  const loadScanLogs = useCallback(async () => {
    if (!branchId) return
    setLogsLoading(true)
    try {
      const res = await fetch(buildApiUrl(`/api/wms/reports/task-events?branch_id=${branchId}&limit=100`))
      const json = await res.json()
      if (json.error) {
        throw new Error(json.error.message || 'Olay günlükleri alınamadı.')
      }
      if (json.data) {
        setScanLogs(json.data)
      }
    } catch (err) {
      toast(err.message || 'Günlük yükleme hatası.', 'error')
    } finally {
      setLogsLoading(false)
    }
  }, [branchId, toast])

  // LPN Detail Query
  const searchLpn = async (e) => {
    if (e) e.preventDefault()
    if (!branchId || !lpnQuery.trim()) return
    setLpnLoading(true)
    setLpnData(null)
    try {
      const res = await fetch(buildApiUrl(`/api/wms/reports/lpn-details?branch_id=${branchId}&query=${encodeURIComponent(lpnQuery.trim())}`))
      const json = await res.json()
      if (json.error) {
        throw new Error(json.error.message || 'LPN detayları sorgulanamadı.')
      }
      if (json.data) {
        setLpnData(json.data)
      }
    } catch (err) {
      toast(err.message || 'LPN bulunamadı veya ağ hatası.', 'error')
    } finally {
      setLpnLoading(false)
    }
  }

  useEffect(() => {
    if (branchId) {
      loadMetrics()
      if (activeTab === 'logs') {
        loadScanLogs()
      }
    }
  }, [branchId, activeTab, loadMetrics, loadScanLogs])

  return (
    <div className="container-fluid" style={{ minHeight: '100vh', paddingBottom: 60, backgroundColor: '#0f172a', color: '#f8fafc' }}>
      <style>{`
        .reports-tab-btn {
          background: transparent;
          border: none;
          color: #94a3b8;
          padding: 12px 20px;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .reports-tab-btn:hover {
          color: #f8fafc;
        }
        .reports-tab-btn.active {
          color: #10b981;
          border-bottom: 2px solid #10b981;
        }
        .wms-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 8px;
        }
        .wms-table th {
          background: rgba(15, 23, 42, 0.6);
          color: #94a3b8;
          font-weight: 600;
          text-align: left;
          padding: 12px 16px;
          font-size: 0.85rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .wms-table td {
          padding: 12px 16px;
          font-size: 0.9rem;
          color: #e2e8f0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .wms-table tr:hover td {
          background: rgba(255, 255, 255, 0.02);
        }
        .glass-card {
          background: rgba(30, 41, 59, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          padding: 24px;
          backdrop-filter: blur(12px);
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          margin-bottom: 24px;
        }
        .spin-icon {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
      `}</style>

      {/* Header section override for Dark Theme compatibility */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 700, margin: 0, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className="fa-solid fa-chart-pie" style={{ color: '#6366f1' }} />
            WMS Operasyon Raporları
          </h1>
          <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '0.9rem' }}>
            Stok dağılımı, lokasyon dolulukları, el terminali scan logları ve teslimat kapasite analizleri
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: 8, fontSize: '0.85rem', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)' }}>
            Depo: <span style={{ color: '#38bdf8', fontWeight: 600 }}>{currentBranch?.name || 'Seçilmedi'}</span>
          </div>
          <button
            onClick={activeTab === 'logs' ? loadScanLogs : loadMetrics}
            disabled={loading || logsLoading}
            className="btn"
            style={{
              background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#f8fafc',
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer'
            }}
          >
            <i className={`fa-solid fa-rotate ${loading || logsLoading ? 'spin-icon' : ''}`} />
            Raporu Yenile
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 24, overflowX: 'auto' }}>
        <button className={`reports-tab-btn ${activeTab === 'stock' ? 'active' : ''}`} onClick={() => setActiveTab('stock')}>
          <i className="fa-solid fa-cubes" /> Stok & Doluluk
        </button>
        <button className={`reports-tab-btn ${activeTab === 'lpn' ? 'active' : ''}`} onClick={() => setActiveTab('lpn')}>
          <i className="fa-solid fa-pallet" /> LPN İzleme
        </button>
        <button className={`reports-tab-btn ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}>
          <i className="fa-solid fa-terminal" /> Olay Günlükleri (Scan)
        </button>
        <button className={`reports-tab-btn ${activeTab === 'performance' ? 'active' : ''}`} onClick={() => setActiveTab('performance')}>
          <i className="fa-solid fa-truck-fast" /> Performans & Sevkiyat
        </button>
        <button className={`reports-tab-btn ${activeTab === 'expiry' ? 'active' : ''}`} onClick={() => setActiveTab('expiry')}>
          <i className="fa-solid fa-hourglass-half" /> SKT Yaklaşanlar
        </button>
      </div>

      {/* Loading Overlay */}
      {(loading) && (
        <div style={{ padding: '40px 0', textSelf: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <i className="fa-solid fa-circle-notch spin-icon" style={{ fontSize: '2.5rem', color: '#10b981' }} />
          <p style={{ color: '#94a3b8' }}>Veriler yükleniyor...</p>
        </div>
      )}

      {/* Tab Contents */}
      {!loading && (
        <div>
          {/* TAB 1: Stock & Occupancy */}
          {activeTab === 'stock' && (
            <div>
              <div className="row g-4 mb-4">
                {/* Stock distribution breakdown */}
                <div className="col-12 col-md-6">
                  <div className="glass-card" style={{ height: '100%' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#94a3b8', marginBottom: 20 }}>
                      <i className="fa-solid fa-chart-simple" style={{ color: '#3b82f6', marginRight: 8 }} /> Stok Dağılım Durumu
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8 }}>
                        <span style={{ color: '#34d399', fontWeight: 500 }}><i className="fa-solid fa-check-double mr-2" /> Kullanılabilir (Available)</span>
                        <span style={{ fontSize: '1.2rem', fontWeight: 700 }}>{reportMetrics.stock_distribution.available.toLocaleString()} Adet</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8 }}>
                        <span style={{ color: '#fb923c', fontWeight: 500 }}><i className="fa-solid fa-lock mr-2" /> Rezerve (Reserved)</span>
                        <span style={{ fontSize: '1.2rem', fontWeight: 700 }}>{reportMetrics.stock_distribution.reserved.toLocaleString()} Adet</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8 }}>
                        <span style={{ color: '#f87171', fontWeight: 500 }}><i className="fa-solid fa-biohazard mr-2" /> Karantina (Quarantine)</span>
                        <span style={{ fontSize: '1.2rem', fontWeight: 700 }}>{reportMetrics.stock_distribution.quarantine.toLocaleString()} Adet</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8 }}>
                        <span style={{ color: '#60a5fa', fontWeight: 500 }}><i className="fa-solid fa-boxes-packing mr-2" /> Yerleştirme Bekleyen (Putaway Pending)</span>
                        <span style={{ fontSize: '1.2rem', fontWeight: 700 }}>{reportMetrics.stock_distribution.putaway_pending.toLocaleString()} Adet</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Location occupancy rate */}
                <div className="col-12 col-md-6">
                  <div className="glass-card" style={{ height: '100%' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#94a3b8', marginBottom: 20 }}>
                      <i className="fa-solid fa-map-location-dot" style={{ color: '#10b981', marginRight: 8 }} /> Depo Lokasyon Doluluk Oranı
                    </h3>
                    <div style={{ textAlign: 'center', padding: '16px 0' }}>
                      <div style={{ fontSize: '3rem', fontWeight: 800, color: '#10b981' }}>
                        %{reportMetrics.location_occupancy.rate}
                      </div>
                      <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: 4 }}>
                        Toplam {reportMetrics.location_occupancy.total} aktif lokasyondan {reportMetrics.location_occupancy.occupied} adedi dolu.
                      </p>
                      <div style={{ width: '100%', height: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 6, marginTop: 24, overflow: 'hidden' }}>
                        <div style={{ width: `${reportMetrics.location_occupancy.rate}%`, height: '100%', background: 'linear-gradient(90deg, #10b981, #3b82f6)', borderRadius: 6 }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Master Data Issues warnings */}
              <div className="row g-4">
                <div className="col-12 col-md-6">
                  <div className="glass-card">
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#fbbf24', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <i className="fa-solid fa-box" /> Eksik Paket Boyutlu Ürünler ({reportMetrics.missing_pkg_dimensions.length})
                    </h3>
                    <div style={{ maxHeight: 250, overflowY: 'auto' }}>
                      <table className="wms-table">
                        <thead>
                          <tr>
                            <th>SKU</th>
                            <th>Ürün Adı</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportMetrics.missing_pkg_dimensions.length === 0 ? (
                            <tr>
                              <td colSpan="2" style={{ textAlign: 'center', color: '#94a3b8' }}>Uyumsuz ürün bulunmamaktadır.</td>
                            </tr>
                          ) : (
                            reportMetrics.missing_pkg_dimensions.map(p => (
                              <tr key={p.id}>
                                <td style={{ fontFamily: 'monospace', color: '#38bdf8' }}>{p.sku}</td>
                                <td>{p.name}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="col-12 col-md-6">
                  <div className="glass-card">
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#fbbf24', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <i className="fa-solid fa-truck" /> Kapasitesi Olmayan Aktif Araçlar ({reportMetrics.missing_vehicle_capacities.length})
                    </h3>
                    <div style={{ maxHeight: 250, overflowY: 'auto' }}>
                      <table className="wms-table">
                        <thead>
                          <tr>
                            <th>Plaka No</th>
                            <th>Araç Kodu</th>
                            <th>Gösterim Adı</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportMetrics.missing_vehicle_capacities.length === 0 ? (
                            <tr>
                              <td colSpan="3" style={{ textAlign: 'center', color: '#94a3b8' }}>Uyumsuz araç bulunmamaktadır.</td>
                            </tr>
                          ) : (
                            reportMetrics.missing_vehicle_capacities.map(v => (
                              <tr key={v.id}>
                                <td style={{ fontWeight: 'bold' }}>{v.plate_number || '—'}</td>
                                <td style={{ fontFamily: 'monospace', color: '#38bdf8' }}>{v.vehicle_code}</td>
                                <td>{v.display_name || '—'}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: LPN Tracing */}
          {activeTab === 'lpn' && (
            <div>
              <div className="glass-card">
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#94a3b8', marginBottom: 16 }}>
                  <i className="fa-solid fa-magnifying-glass" style={{ marginRight: 8 }} /> LPN Sorgula ve Hareket Geçmişi İzle
                </h3>
                <form onSubmit={searchLpn} style={{ display: 'flex', gap: 12 }}>
                  <input
                    type="text"
                    className="f-input"
                    style={{ flex: 1, backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '10px 16px' }}
                    placeholder="LPN barkodunu veya kimliğini girin (örn: LPN-001)..."
                    value={lpnQuery}
                    onChange={e => setLpnQuery(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={lpnLoading}
                    style={{ padding: '10px 24px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    {lpnLoading ? <i className="fa-solid fa-circle-notch spin-icon" /> : <i className="fa-solid fa-search" />}
                    Sorgula
                  </button>
                </form>
              </div>

              {lpnLoading && (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <i className="fa-solid fa-circle-notch spin-icon" style={{ fontSize: '2rem', color: '#10b981' }} />
                  <p style={{ color: '#94a3b8', marginTop: 12 }}>LPN verileri sorgulanıyor...</p>
                </div>
              )}

              {lpnData && (
                <div>
                  {/* LPN Info and Current Contents */}
                  <div className="row g-4 mb-4">
                    <div className="col-12 col-md-4">
                      <div className="glass-card" style={{ height: '100%' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#38bdf8', marginBottom: 16 }}>
                          <i className="fa-solid fa-circle-info mr-2" /> LPN Bilgisi
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <div>
                            <span style={{ color: '#94a3b8', fontSize: '0.8rem', display: 'block' }}>LPN Kodu</span>
                            <span style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: 'monospace' }}>{lpnData.lpn.lpn_code}</span>
                          </div>
                          <div>
                            <span style={{ color: '#94a3b8', fontSize: '0.8rem', display: 'block' }}>Durum</span>
                            <span style={{
                              padding: '2px 8px', borderRadius: 4, fontSize: '0.8rem', fontWeight: 600,
                              background: lpnData.lpn.status === 'empty' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                              color: lpnData.lpn.status === 'empty' ? '#ef4444' : '#10b981'
                            }}>
                              {lpnData.lpn.status === 'empty' ? 'Boş' : 'Dolu/Kullanımda'}
                            </span>
                          </div>
                          <div>
                            <span style={{ color: '#94a3b8', fontSize: '0.8rem', display: 'block' }}>Konum (Lokasyon ID)</span>
                            <span style={{ fontSize: '1rem', fontWeight: 600 }}>{lpnData.lpn.location_id || 'Tanımsız / Alanda'}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="col-12 col-md-8">
                      <div className="glass-card" style={{ height: '100%' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#10b981', marginBottom: 16 }}>
                          <i className="fa-solid fa-box-open mr-2" /> Mevcut LPN İçeriği
                        </h3>
                        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                          <table className="wms-table">
                            <thead>
                              <tr>
                                <th>SKU</th>
                                <th>Ürün Adı</th>
                                <th>Miktar</th>
                                <th>Birim</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lpnData.contents.length === 0 ? (
                                <tr>
                                  <td colSpan="4" style={{ textAlign: 'center', color: '#94a3b8' }}>LPN içinde stok bulunmamaktadır.</td>
                                </tr>
                              ) : (
                                lpnData.contents.map(c => (
                                  <tr key={c.stock_item_id}>
                                    <td style={{ fontFamily: 'monospace', color: '#38bdf8' }}>{c.product_sku}</td>
                                    <td>{c.product_name}</td>
                                    <td style={{ fontWeight: 600 }}>{c.qty}</td>
                                    <td>{c.product_unit || 'Adet'}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* LPN history */}
                  <div className="glass-card">
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#a78bfa', marginBottom: 16 }}>
                      <i className="fa-solid fa-timeline mr-2" /> Tarihsel LPN Stok Hareketleri
                    </h3>
                    <div style={{ overflowX: 'auto' }}>
                      <table className="wms-table">
                        <thead>
                          <tr>
                            <th>Tarih</th>
                            <th>İşlem Tipi</th>
                            <th>Yön</th>
                            <th>Ürün (SKU)</th>
                            <th>Miktar</th>
                            <th>Lokasyon</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lpnData.history.length === 0 ? (
                            <tr>
                              <td colSpan="6" style={{ textAlign: 'center', color: '#94a3b8' }}>Hareket geçmişi bulunamadı.</td>
                            </tr>
                          ) : (
                            lpnData.history.map(h => (
                              <tr key={h.id}>
                                <td>{new Date(h.movement_at).toLocaleString()}</td>
                                <td>
                                  <span style={{
                                    padding: '2px 8px', borderRadius: 4, fontSize: '0.8rem',
                                    backgroundColor: 'rgba(255,255,255,0.05)', color: '#e2e8f0'
                                  }}>
                                    {h.movement_type}
                                  </span>
                                </td>
                                <td>
                                  <span style={{
                                    fontWeight: 600, fontSize: '0.8rem',
                                    color: h.direction === 'in' ? '#10b981' : '#ef4444'
                                  }}>
                                    {h.direction === 'in' ? 'GİRİŞ (+)' : 'ÇIKIŞ (-)'}
                                  </span>
                                </td>
                                <td>{h.product_name} (<span style={{ fontFamily: 'monospace' }}>{h.product_sku}</span>)</td>
                                <td style={{ fontWeight: 600 }}>{h.quantity}</td>
                                <td>
                                  {h.zone_code ? `${h.zone_code}-${h.aisle || ''}${h.rack || ''}${h.level || ''}` : '—'}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {!lpnLoading && !lpnData && (
                <div style={{ textAlign: 'center', padding: '60px 0', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 16 }}>
                  <i className="fa-solid fa-pallet" style={{ fontSize: '3rem', color: '#475569', marginBottom: 16 }} />
                  <p style={{ color: '#94a3b8' }}>LPN detayını ve hareket geçmişini görmek için yukarıdan sorgulama yapın.</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Scan Logs (Android logs) */}
          {activeTab === 'logs' && (
            <div className="glass-card">
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#94a3b8', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span><i className="fa-solid fa-terminal mr-2" style={{ color: '#ec4899' }} /> Android Scan ve Hata Günlükleri (Son 100 Olay)</span>
                <button
                  onClick={loadScanLogs}
                  disabled={logsLoading}
                  className="btn"
                  style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', padding: '4px 10px', fontSize: '0.8rem', borderRadius: 4 }}
                >
                  {logsLoading ? <i className="fa-solid fa-circle-notch spin-icon" /> : <i className="fa-solid fa-rotate" />}
                  Yenile
                </button>
              </h3>

              {logsLoading ? (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <i className="fa-solid fa-circle-notch spin-icon" style={{ fontSize: '2rem', color: '#10b981' }} />
                  <p style={{ color: '#94a3b8', marginTop: 12 }}>Günlükler çekiliyor...</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="wms-table">
                    <thead>
                      <tr>
                        <th>Tarih / Zaman</th>
                        <th>Olay Tipi</th>
                        <th>Terminal ID</th>
                        <th>Versiyon</th>
                        <th>Personel</th>
                        <th>Görev / Barkod</th>
                        <th>Detay / Payload</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scanLogs.length === 0 ? (
                        <tr>
                          <td colSpan="7" style={{ textAlign: 'center', color: '#94a3b8' }}>Olay günlüğü bulunamadı.</td>
                        </tr>
                      ) : (
                        scanLogs.map(log => {
                          const payloadObj = typeof log.payload === 'string' ? JSON.parse(log.payload) : (log.payload || {})
                          const appVersion = payloadObj.app_version || '1.0'
                          return (
                            <tr key={log.id}>
                              <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{new Date(log.created_at).toLocaleString()}</td>
                              <td>
                                <span style={{
                                  padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600,
                                  backgroundColor: log.event_type.includes('failed') ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                                  color: log.event_type.includes('failed') ? '#ef4444' : '#10b981'
                                }}>
                                  {log.event_type}
                                </span>
                              </td>
                              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{log.terminal_id || 'TERMINAL-01'}</td>
                              <td>{appVersion}</td>
                              <td>{log.personnel_id || 'Bilinmeyen'}</td>
                              <td>
                                <div style={{ fontSize: '0.85rem' }}>{log.task_description || 'Genel WMS İşlemi'}</div>
                                {log.barcode_scanned && (
                                  <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#94a3b8' }}>
                                    Barkod: {log.barcode_scanned}
                                  </div>
                                )}
                              </td>
                              <td>
                                <div style={{ maxHeight: 100, overflowY: 'auto', maxWidth: 250 }}>
                                  <pre style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8', whiteSpace: 'pre-wrap' }}>
                                    {JSON.stringify(payloadObj, null, 2)}
                                  </pre>
                                </div>
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: Deliveries & Performance */}
          {activeTab === 'performance' && (
            <div>
              {/* Top: Capacity and Performance Grid */}
              <div className="row g-4 mb-4">
                
                {/* Personnel Task Completion times */}
                <div className="col-12 col-md-6">
                  <div className="glass-card" style={{ height: '100%' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#38bdf8', marginBottom: 16 }}>
                      <i className="fa-solid fa-user-clock mr-2" /> Personel Görev Süre Performansı
                    </h3>
                    <div style={{ overflowY: 'auto', maxHeight: 300 }}>
                      <table className="wms-table">
                        <thead>
                          <tr>
                            <th>Personel</th>
                            <th>Görev Türü</th>
                            <th>Tamamlanan Görev</th>
                            <th>Ort. Süre (Dk)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportMetrics.personnel_performance.length === 0 ? (
                            <tr>
                              <td colSpan="4" style={{ textAlign: 'center', color: '#94a3b8' }}>Veri bulunmamaktadır.</td>
                            </tr>
                          ) : (
                            reportMetrics.personnel_performance.map((p, idx) => (
                              <tr key={idx}>
                                <td style={{ fontWeight: 500 }}>{p.personnel}</td>
                                <td>
                                  <span style={{
                                    padding: '2px 6px', borderRadius: 4, fontSize: '0.75rem',
                                    backgroundColor: p.task_type === 'pick' ? 'rgba(167, 139, 250, 0.15)' : 'rgba(96, 165, 250, 0.15)',
                                    color: p.task_type === 'pick' ? '#a78bfa' : '#60a5fa'
                                  }}>
                                    {p.task_type}
                                  </span>
                                </td>
                                <td style={{ fontWeight: 600 }}>{p.completed_count}</td>
                                <td style={{ color: '#10b981', fontWeight: 600 }}>{p.avg_duration_minutes} dk</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Shipment fill-rate */}
                <div className="col-12 col-md-6">
                  <div className="glass-card" style={{ height: '100%' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#10b981', marginBottom: 16 }}>
                      <i className="fa-solid fa-percent mr-2" /> Sevkiyat Gerçekleşme (Fill-Rate) Oranları
                    </h3>
                    <div style={{ overflowY: 'auto', maxHeight: 300 }}>
                      <table className="wms-table">
                        <thead>
                          <tr>
                            <th>Sevkiyat No</th>
                            <th>Talep Edilen</th>
                            <th>Gönderilen</th>
                            <th>Fill-Rate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportMetrics.fill_rate.length === 0 ? (
                            <tr>
                              <td colSpan="4" style={{ textAlign: 'center', color: '#94a3b8' }}>Veri bulunmamaktadır.</td>
                            </tr>
                          ) : (
                            reportMetrics.fill_rate.map(fr => {
                              const ordered = parseFloat(fr.total_ordered) || 0
                              const shipped = parseFloat(fr.total_shipped) || 0
                              const rate = ordered > 0 ? parseFloat((shipped / ordered * 100).toFixed(1)) : 0
                              return (
                                <tr key={fr.id}>
                                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{fr.shipment_no}</td>
                                  <td>{ordered}</td>
                                  <td>{shipped}</td>
                                  <td style={{ fontWeight: 'bold', color: rate >= 95 ? '#10b981' : rate >= 80 ? '#fbbf24' : '#ef4444' }}>
                                    %{rate}
                                  </td>
                                </tr>
                              )
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

              </div>

              {/* Bottom: Vehicles capacity & late shipments */}
              <div className="row g-4">
                
                {/* Vehicle capacity details */}
                <div className="col-12 col-md-6">
                  <div className="glass-card">
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#fbbf24', marginBottom: 16 }}>
                      <i className="fa-solid fa-scale-balanced mr-2" /> Araç Kapasite Kullanımları (Desi & Kg)
                    </h3>
                    <div style={{ overflowY: 'auto', maxHeight: 300 }}>
                      <table className="wms-table">
                        <thead>
                          <tr>
                            <th>Araç Plaka</th>
                            <th>Sevkiyat</th>
                            <th>Hacim (Desi)</th>
                            <th>Ağırlık (Kg)</th>
                            <th>Durum</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportMetrics.vehicle_usage.length === 0 ? (
                            <tr>
                              <td colSpan="5" style={{ textAlign: 'center', color: '#94a3b8' }}>Veri bulunmamaktadır.</td>
                            </tr>
                          ) : (
                            reportMetrics.vehicle_usage.map(u => {
                              const cap = u.capacity_details || {}
                              const volRate = cap.vehicle_max_volume_m3 > 0 ? ((cap.total_volume_m3 / cap.vehicle_max_volume_m3) * 100).toFixed(1) : 0
                              const wtRate = cap.vehicle_max_weight_kg > 0 ? ((cap.total_weight_kg / cap.vehicle_max_weight_kg) * 100).toFixed(1) : 0
                              return (
                                <tr key={u.id}>
                                  <td style={{ fontWeight: 'bold' }}>{u.plate_number}</td>
                                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{u.shipment_no}</td>
                                  <td>
                                    <div>{(cap.total_volume_m3 || 0).toFixed(2)} / {(cap.vehicle_max_volume_m3 || 0).toFixed(1)} m³</div>
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>%{volRate} Dolu</div>
                                  </td>
                                  <td>
                                    <div>{(cap.total_weight_kg || 0).toFixed(1)} / {(cap.vehicle_max_weight_kg || 0).toFixed(0)} kg</div>
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>%{wtRate} Dolu</div>
                                  </td>
                                  <td>
                                    <span style={{
                                      padding: '2px 8px', borderRadius: 4, fontSize: '0.8rem', fontWeight: 600,
                                      backgroundColor: cap.is_exceeded ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                                      color: cap.is_exceeded ? '#ef4444' : '#10b981'
                                    }}>
                                      {cap.is_exceeded ? 'LİMİT AŞILDI' : 'UYGUN'}
                                    </span>
                                  </td>
                                </tr>
                              )
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Late shipments */}
                <div className="col-12 col-md-6">
                  <div className="glass-card">
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#f87171', marginBottom: 16 }}>
                      <i className="fa-solid fa-hourglass-alert mr-2" /> Gecikmiş / Geç Sevkiyat Analizi
                    </h3>
                    <div style={{ overflowY: 'auto', maxHeight: 300 }}>
                      <table className="wms-table">
                        <thead>
                          <tr>
                            <th>Sevkiyat No</th>
                            <th>Talep No</th>
                            <th>Termin Tarihi</th>
                            <th>Durum / Sevk Tarihi</th>
                            <th>Gecikme</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportMetrics.late_shipments.length === 0 ? (
                            <tr>
                              <td colSpan="5" style={{ textAlign: 'center', color: '#94a3b8' }}>Gecikmiş sevkiyat bulunmamaktadır.</td>
                            </tr>
                          ) : (
                            reportMetrics.late_shipments.map(ls => (
                              <tr key={ls.id}>
                                <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{ls.shipment_no}</td>
                                <td>{ls.order_no}</td>
                                <td>{new Date(ls.delivery_date).toLocaleDateString()}</td>
                                <td>
                                  <div>{ls.status === 'in_transit' ? 'Sevk Edildi' : 'Depoda Bekliyor'}</div>
                                  {ls.shipped_at && (
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                      {new Date(ls.shipped_at).toLocaleDateString()}
                                    </div>
                                  )}
                                </td>
                                <td>
                                  <span style={{
                                    padding: '2px 8px', borderRadius: 4, fontSize: '0.8rem', fontWeight: 600,
                                    backgroundColor: ls.is_late ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                                    color: ls.is_late ? '#ef4444' : '#10b981'
                                  }}>
                                    {ls.is_late ? `${ls.delay_days} Gün Gecikti` : 'Termininde'}
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* TAB 5: Expiry Approaching Stock */}
          {activeTab === 'expiry' && (
            <div className="glass-card">
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#94a3b8', marginBottom: 16 }}>
                <i className="fa-solid fa-hourglass-half mr-2" style={{ color: '#f59e0b' }} /> Son Kullanma Tarihi (SKT) Yaklaşan Stoklar
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table className="wms-table">
                  <thead>
                    <tr>
                      <th>Ürün SKU</th>
                      <th>Stok Kalemi Adı</th>
                      <th>Lokasyon</th>
                      <th>LPN Kodu</th>
                      <th>Lot Numarası</th>
                      <th>Son Kullanma Tarihi</th>
                      <th>Kullanılabilir Stok</th>
                      <th>Kalan Gün</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportMetrics.expiry_approaching.length === 0 ? (
                      <tr>
                        <td colSpan="8" style={{ textAlign: 'center', color: '#94a3b8' }}>Yaklaşan SKT verisi bulunmamaktadır.</td>
                      </tr>
                    ) : (
                      reportMetrics.expiry_approaching.map((item, idx) => {
                        const days = item.days_to_expiry
                        const statusColor = days < 30 ? '#ef4444' : days < 90 ? '#fbbf24' : '#e2e8f0'
                        return (
                          <tr key={idx}>
                            <td style={{ fontFamily: 'monospace', color: '#38bdf8' }}>{item.product_sku}</td>
                            <td style={{ fontWeight: 500 }}>{item.product_name}</td>
                            <td>{`${item.zone_code}-${item.aisle || ''}${item.rack || ''}${item.level || ''}`}</td>
                            <td style={{ fontFamily: 'monospace' }}>{item.lpn_code || '—'}</td>
                            <td style={{ fontFamily: 'monospace' }}>{item.lot_number || '—'}</td>
                            <td>{new Date(item.expiration_date).toLocaleDateString()}</td>
                            <td style={{ fontWeight: 600 }}>{item.pickable_qty}</td>
                            <td style={{ fontWeight: 'bold', color: statusColor }}>
                              {days < 0 ? `SKT Geçti (${Math.abs(days)} gün)` : `${days} Gün`}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
