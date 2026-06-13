import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '@/components/layout/Header'
import { useToast } from '@/hooks/useToast'
import { buildApiUrl } from '@/lib/db'
import { useWorkspace } from '@/context/WorkspaceContext'

export default function WmsDashboard() {
  const toast = useToast()
  const navigate = useNavigate()
  const { currentBranch } = useWorkspace()
  const branchId = currentBranch?.id

  const [loading, setLoading] = useState(false)
  const [metrics, setMetrics] = useState({
    pending_mal_kabul: 0,
    open_putaway: 0,
    open_pick: 0,
    exceptions: 0,
    failed_scans: 0,
    evidence_upload_failures: 0,
    capacity_exceeded_shipments: 0,
    missing_pkg_dimensions: 0,
    shipped_today: 0,
    quarantine_items: 0,
    missing_vehicle_capacities: 0
  })

  const loadMetrics = useCallback(async () => {
    if (!branchId) return
    setLoading(true)
    try {
      const res = await fetch(buildApiUrl(`/api/wms/dashboard/metrics?branch_id=${branchId}`))
      const json = await res.json()
      if (json.error) {
        throw new Error(json.error.message || 'Metrikler yüklenirken hata oluştu.')
      }
      if (json.data) {
        setMetrics(json.data)
      }
    } catch (err) {
      toast(err.message || 'Bağlantı hatası.', 'error')
    } finally {
      setLoading(false)
    }
  }, [branchId, toast])

  useEffect(() => {
    loadMetrics()
  }, [loadMetrics])

  return (
    <div className="container-fluid" style={{ minHeight: '100vh', paddingBottom: 60, backgroundColor: '#0f172a', color: '#f8fafc' }}>
      <style>{`
        .wms-dash-card {
          background: rgba(30, 41, 59, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          padding: 24px;
          backdrop-filter: blur(12px);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          cursor: pointer;
          position: relative;
          overflow: hidden;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
        }
        .wms-dash-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0; height: 3px;
          background: transparent;
          transition: all 0.3s ease;
        }
        .wms-dash-card:hover {
          transform: translateY(-5px);
          background: rgba(30, 41, 59, 0.9);
          box-shadow: 0 10px 20px -5px rgba(0,0,0,0.3);
        }
        .wms-dash-card.active-tasks:hover {
          border-color: rgba(96, 165, 250, 0.4);
          box-shadow: 0 0 15px rgba(59, 130, 246, 0.15);
        }
        .wms-dash-card.active-tasks::before {
          background: linear-gradient(90deg, #3b82f6, #60a5fa);
        }
        .wms-dash-card.errors:hover {
          border-color: rgba(248, 113, 113, 0.4);
          box-shadow: 0 0 15px rgba(239, 68, 68, 0.15);
        }
        .wms-dash-card.errors::before {
          background: linear-gradient(90deg, #ef4444, #f87171);
        }
        .wms-dash-card.warnings:hover {
          border-color: rgba(251, 191, 36, 0.4);
          box-shadow: 0 0 15px rgba(245, 158, 11, 0.15);
        }
        .wms-dash-card.warnings::before {
          background: linear-gradient(90deg, #f59e0b, #fbbf24);
        }
        .wms-dash-card.status-ok:hover {
          border-color: rgba(52, 211, 153, 0.4);
          box-shadow: 0 0 15px rgba(16, 185, 129, 0.15);
        }
        .wms-dash-card.status-ok::before {
          background: linear-gradient(90deg, #10b981, #34d399);
        }
        .glow-icon {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.4rem;
          margin-bottom: 16px;
          background: rgba(255,255,255,0.05);
          transition: all 0.3s ease;
        }
        .wms-dash-card:hover .glow-icon {
          transform: scale(1.1);
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
            <i className="fa-solid fa-gauge-high" style={{ color: '#10b981' }} />
            WMS Operasyon Paneli
          </h1>
          <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '0.9rem' }}>
            Depo operasyonel sağlığı, hatalar, bekleyen görevler ve master veri kalitesi
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: 8, fontSize: '0.85rem', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)' }}>
            Depo: <span style={{ color: '#38bdf8', fontWeight: 600 }}>{currentBranch?.name || 'Seçilmedi'}</span>
          </div>
          <button
            onClick={loadMetrics}
            disabled={loading}
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
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            <i className={`fa-solid fa-rotate ${loading ? 'spin-icon' : ''}`} />
            Yenile
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <h3 style={{ fontSize: '1.2rem', fontWeight: 600, color: '#94a3b8', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <i className="fa-solid fa-list-check" style={{ color: '#3b82f6' }} /> Aktif Görevler & Akışlar
      </h3>
      <div className="row g-4 mb-5">
        
        {/* KPI: Pending Mal Kabul */}
        <div className="col-12 col-md-6 col-lg-3">
          <div className="wms-dash-card active-tasks" onClick={() => navigate('/depo-mal-kabul')}>
            <div className="glow-icon" style={{ color: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
              <i className="fa-solid fa-truck-ramp-box" />
            </div>
            <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#f8fafc' }}>
              {metrics.pending_mal_kabul}
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#e2e8f0', marginTop: 4 }}>
              Bekleyen Mal Kabul
            </div>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 4 }}>
              Mal kabul bekleyen onaylı satın alma siparişleri.
            </div>
            <div style={{ marginTop: 16, fontSize: '0.8rem', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: 4 }}>
              Mal Kabul Ekranına Git <i className="fa-solid fa-arrow-right" />
            </div>
          </div>
        </div>

        {/* KPI: Open Putaway */}
        <div className="col-12 col-md-6 col-lg-3">
          <div className="wms-dash-card active-tasks" onClick={() => navigate('/depo-wms-tasks')}>
            <div className="glow-icon" style={{ color: '#60a5fa', backgroundColor: 'rgba(96, 165, 250, 0.1)' }}>
              <i className="fa-solid fa-arrow-down-to-bracket" />
            </div>
            <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#f8fafc' }}>
              {metrics.open_putaway}
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#e2e8f0', marginTop: 4 }}>
              Açık Yerleştirme (Putaway)
            </div>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 4 }}>
              Atama bekleyen veya devam eden putaway görevleri.
            </div>
            <div style={{ marginTop: 16, fontSize: '0.8rem', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: 4 }}>
              Putaway Görevlerine Git <i className="fa-solid fa-arrow-right" />
            </div>
          </div>
        </div>

        {/* KPI: Open Pick */}
        <div className="col-12 col-md-6 col-lg-3">
          <div className="wms-dash-card active-tasks" onClick={() => navigate('/depo-wms-tasks')}>
            <div className="glow-icon" style={{ color: '#a78bfa', backgroundColor: 'rgba(167, 139, 250, 0.1)' }}>
              <i className="fa-solid fa-dolly" />
            </div>
            <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#f8fafc' }}>
              {metrics.open_pick}
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#e2e8f0', marginTop: 4 }}>
              Açık Toplama (Pick)
            </div>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 4 }}>
              Atama bekleyen veya devam eden sipariş toplama görevleri.
            </div>
            <div style={{ marginTop: 16, fontSize: '0.8rem', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: 4 }}>
              Pick Görevlerine Git <i className="fa-solid fa-arrow-right" />
            </div>
          </div>
        </div>

        {/* KPI: Exceptions */}
        <div className="col-12 col-md-6 col-lg-3">
          <div className="wms-dash-card errors" onClick={() => navigate('/depo-wms-tasks')}>
            <div className="glow-icon" style={{ color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
              <i className="fa-solid fa-circle-exclamation" />
            </div>
            <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#f8fafc' }}>
              {metrics.exceptions}
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#e2e8f0', marginTop: 4 }}>
              Exception Görevleri
            </div>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 4 }}>
              Uyuşmazlık, kayıp ürün veya hasar nedeniyle askıya alınanlar.
            </div>
            <div style={{ marginTop: 16, fontSize: '0.8rem', color: '#f87171', display: 'flex', alignItems: 'center', gap: 4 }}>
              Hatalı Görevleri İncele <i className="fa-solid fa-arrow-right" />
            </div>
          </div>
        </div>

      </div>

      <h3 style={{ fontSize: '1.2rem', fontWeight: 600, color: '#94a3b8', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <i className="fa-solid fa-mobile-screen-button" style={{ color: '#ec4899' }} /> Mobil Terminaller & Hatalar
      </h3>
      <div className="row g-4 mb-5">

        {/* KPI: Failed Scans */}
        <div className="col-12 col-md-6">
          <div className="wms-dash-card errors" onClick={() => navigate('/wms-reports?tab=logs')}>
            <div className="glow-icon" style={{ color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
              <i className="fa-solid fa-barcode" />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: '2.2rem', fontWeight: 800 }}>{metrics.failed_scans}</span>
              <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Olay</span>
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#e2e8f0', marginTop: 4 }}>
              Android Barkod Okuma Hataları
            </div>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 4 }}>
              El terminallerinden gönderilen yanlış veya tanımsız barkod okutma denemeleri.
            </div>
            <div style={{ marginTop: 16, fontSize: '0.8rem', color: '#f87171', display: 'flex', alignItems: 'center', gap: 4 }}>
              Olay Günlüklerine Git <i className="fa-solid fa-arrow-right" />
            </div>
          </div>
        </div>

        {/* KPI: Upload Failures */}
        <div className="col-12 col-md-6">
          <div className="wms-dash-card errors" onClick={() => navigate('/wms-reports?tab=logs')}>
            <div className="glow-icon" style={{ color: '#f87171', backgroundColor: 'rgba(248, 113, 113, 0.1)' }}>
              <i className="fa-solid fa-cloud-arrow-up" />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: '2.2rem', fontWeight: 800 }}>{metrics.evidence_upload_failures}</span>
              <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Hata</span>
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#e2e8f0', marginTop: 4 }}>
              Görsel Kanıt Yükleme Hataları
            </div>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 4 }}>
              El terminellerinde hasar/farklılık kanıtı yüklerken oluşan ağ veya sunucu hataları.
            </div>
            <div style={{ marginTop: 16, fontSize: '0.8rem', color: '#f87171', display: 'flex', alignItems: 'center', gap: 4 }}>
              Olay Günlüklerini İncele <i className="fa-solid fa-arrow-right" />
            </div>
          </div>
        </div>

      </div>

      <h3 style={{ fontSize: '1.2rem', fontWeight: 600, color: '#94a3b8', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <i className="fa-solid fa-circle-exclamation" style={{ color: '#f59e0b' }} /> Master Veri & Kapasite Limit Uyarıları
      </h3>
      <div className="row g-4 mb-5">

        {/* KPI: Capacity Exceeded */}
        <div className="col-12 col-md-4">
          <div className="wms-dash-card warnings" onClick={() => navigate('/depo-orders')}>
            <div className="glow-icon" style={{ color: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)' }}>
              <i className="fa-solid fa-weight-hanging" />
            </div>
            <div style={{ fontSize: '2.2rem', fontWeight: 800 }}>
              {metrics.capacity_exceeded_shipments}
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#e2e8f0', marginTop: 4 }}>
              Aşırı Yüklü Sevkiyatlar
            </div>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 4 }}>
              Atanmış aracın hacim veya ağırlık limitlerini aşan taslak sevkiyatlar.
            </div>
            <div style={{ marginTop: 16, fontSize: '0.8rem', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 4 }}>
              Sevk Konsoluna Git <i className="fa-solid fa-arrow-right" />
            </div>
          </div>
        </div>

        {/* KPI: Missing Vehicle Capacity */}
        <div className="col-12 col-md-4">
          <div className="wms-dash-card warnings" onClick={() => navigate('/wms-vehicles')}>
            <div className="glow-icon" style={{ color: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)' }}>
              <i className="fa-solid fa-truck" />
            </div>
            <div style={{ fontSize: '2.2rem', fontWeight: 800 }}>
              {metrics.missing_vehicle_capacities}
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#e2e8f0', marginTop: 4 }}>
              Kapasitesiz Aktif Araçlar
            </div>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 4 }}>
              Maksimum hacim veya ağırlık parametreleri girilmemiş aktif araç tanımları.
            </div>
            <div style={{ marginTop: 16, fontSize: '0.8rem', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 4 }}>
              Araç Tanımlarına Git <i className="fa-solid fa-arrow-right" />
            </div>
          </div>
        </div>

        {/* KPI: Missing Pkg Dimensions */}
        <div className="col-12 col-md-4">
          <div className="wms-dash-card warnings" onClick={() => navigate('/wms-stock-params')}>
            <div className="glow-icon" style={{ color: '#fbbf24', backgroundColor: 'rgba(251, 191, 36, 0.1)' }}>
              <i className="fa-solid fa-box-open" />
            </div>
            <div style={{ fontSize: '2.2rem', fontWeight: 800 }}>
              {metrics.missing_pkg_dimensions}
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#e2e8f0', marginTop: 4 }}>
              Eksik Paket Boyutlu Ürünler
            </div>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 4 }}>
              Desi/Ağırlık hesaplamaları için paket ölçüleri girilmemiş stok kalemleri.
            </div>
            <div style={{ marginTop: 16, fontSize: '0.8rem', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 4 }}>
              Stok Parametrelerine Git <i className="fa-solid fa-arrow-right" />
            </div>
          </div>
        </div>

      </div>

      <h3 style={{ fontSize: '1.2rem', fontWeight: 600, color: '#94a3b8', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <i className="fa-solid fa-chart-line" style={{ color: '#10b981' }} /> Stok & Sevkiyat Sağlığı
      </h3>
      <div className="row g-4">

        {/* KPI: Shipped Today */}
        <div className="col-12 col-md-6">
          <div className="wms-dash-card status-ok" onClick={() => navigate('/depo-orders')}>
            <div className="glow-icon" style={{ color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
              <i className="fa-solid fa-circle-check" />
            </div>
            <div style={{ fontSize: '2.2rem', fontWeight: 800 }}>
              {metrics.shipped_today}
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#e2e8f0', marginTop: 4 }}>
              Bugün Gönderilen Sevkiyatlar
            </div>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 4 }}>
              Bugün başarıyla 'Yolda' (in_transit) durumuna alınan sevkiyatlar.
            </div>
            <div style={{ marginTop: 16, fontSize: '0.8rem', color: '#34d399', display: 'flex', alignItems: 'center', gap: 4 }}>
              Sevkiyat Akışlarını İzle <i className="fa-solid fa-arrow-right" />
            </div>
          </div>
        </div>

        {/* KPI: Quarantine Items */}
        <div className="col-12 col-md-6">
          <div className="wms-dash-card status-ok" onClick={() => navigate('/wms-quality')}>
            <div className="glow-icon" style={{ color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
              <i className="fa-solid fa-shield-virus" />
            </div>
            <div style={{ fontSize: '2.2rem', fontWeight: 800 }}>
              {metrics.quarantine_items}
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#e2e8f0', marginTop: 4 }}>
              Karantinadaki Ürün Çeşitliliği
            </div>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 4 }}>
              Mevcut kalite kontrol hold/quarantine durumunda tutulan farklı ürün adedi.
            </div>
            <div style={{ marginTop: 16, fontSize: '0.8rem', color: '#34d399', display: 'flex', alignItems: 'center', gap: 4 }}>
              Kalite Karantina Yönetimine Git <i className="fa-solid fa-arrow-right" />
            </div>
          </div>
        </div>

      </div>

    </div>
  )
}
