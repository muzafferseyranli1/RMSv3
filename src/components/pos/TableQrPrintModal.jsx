import { useEffect, useMemo, useState } from 'react'
import { buildPosTableQrPayload, getQrMenuBaseUrl } from '@/lib/posQrService'

function overlayStyle() {
  return {
    position: 'fixed',
    inset: 0,
    zIndex: 620,
    background: 'rgba(15,23,42,.6)',
    padding: 24,
    overflowY: 'auto',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start'
  }
}

function cardStyle() {
  return {
    borderRadius: 16,
    border: '1px solid #e2e8f0',
    background: '#fff',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    breakInside: 'avoid',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
  }
}

export default function TableQrPrintModal({
  open,
  branchName,
  branchId,
  records = [],
  title = 'QR Yazdır',
  onClose,
}) {
  const [qrMap, setQrMap] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const normalizedRecords = useMemo(() => (
    (records || []).map(record => ({
      id: String(record?.id || ''),
      hallName: String(record?.hallName || '').trim(),
      sectionName: String(record?.sectionName || '').trim(),
      tableName: String(record?.tableName || '').trim(),
      tableNumber: String(record?.tableNumber || '').trim(),
      tableToken: String(record?.qrToken || '').trim(),
      payload: buildPosTableQrPayload({
        branchId,
        tableId: record?.id,
        tableToken: record?.qrToken,
        version: record?.qrPayloadVersion || 1,
        baseUrl: getQrMenuBaseUrl(),
      }),
    }))
  ), [records, branchId])

  useEffect(() => {
    if (!open || normalizedRecords.length === 0) {
      setQrMap({})
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')

    ;(async () => {
      try {
        const qrModule = await import('qrcode')
        const QRCodeLib = qrModule?.default || qrModule
        const nextMap = {}
        for (const record of normalizedRecords) {
          nextMap[record.id] = await QRCodeLib.toDataURL(record.payload, { width: 300, margin: 1, errorCorrectionLevel: 'M' })
        }
        if (!cancelled) setQrMap(nextMap)
      } catch (loadError) {
        if (!cancelled) setError(loadError?.message || 'QR görselleri hazırlanamadı.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, normalizedRecords])

  if (!open) return null

  return (
    <div className="table-qr-print-root" style={overlayStyle()}>
      <div className="print-container" style={{ width: '100%', maxWidth: 1100, background: '#fff', borderRadius: 24, padding: 32, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>{title}</h2>
            <p style={{ margin: '4px 0 0', color: '#64748b' }}>{branchName || 'Şube'}</p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button type="button" className="btn-o" onClick={onClose}>Kapat</button>
            <button type="button" className="btn-p" onClick={() => window.print()}>
              <i className="fa-solid fa-print" style={{ marginRight: 8 }} />
              Yazdır
            </button>
          </div>
        </div>

        {error && (
          <div className="no-print" style={{ padding: 16, background: '#fef2f2', border: '1px solid #fecaca', color: '#ef4444', borderRadius: 12, marginBottom: 24 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="no-print" style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '2rem', marginBottom: 12 }} />
            <p>QR kartları hazırlanıyor...</p>
          </div>
        ) : (
          <div className="print-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20 }}>
            {normalizedRecords.map(record => (
              <div key={record.id} className="print-card" style={cardStyle()}>
                <div style={{ textAlign: 'center', paddingBottom: 8, borderBottom: '1px dashed #e2e8f0' }}>
                  <div style={{ color: '#0f172a', fontSize: '1.1rem', fontWeight: 900 }}>{record.tableName || 'Masa'}</div>
                  <div style={{ color: '#64748b', fontSize: '.8rem', marginTop: 2 }}>
                    {record.hallName || 'Salon'} {record.sectionName ? `/ ${record.sectionName}` : ''}
                  </div>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
                  {qrMap[record.id]
                    ? <img src={qrMap[record.id]} alt={`${record.tableName} QR`} style={{ width: 160, height: 160 }} />
                    : <div style={{ width: 160, height: 160, borderRadius: 12, background: '#f1f5f9' }} />}
                </div>
                
                <div style={{ textAlign: 'center', color: '#0f172a', fontWeight: 800, fontSize: '.9rem' }}>
                  Masa No: {record.tableNumber || '-'}
                </div>
                <div className="no-print" style={{ color: '#94a3b8', fontSize: '.65rem', lineHeight: 1.3, wordBreak: 'break-all', textAlign: 'center', marginTop: 4 }}>
                  {record.payload}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 1cm;
          }
          body {
            background: #fff;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * {
            visibility: hidden;
          }
          .table-qr-print-root, .table-qr-print-root * {
            visibility: visible;
          }
          .table-qr-print-root {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            height: auto;
            background: #fff !important;
            padding: 0 !important;
            overflow: visible !important;
          }
          .print-container {
            width: 100% !important;
            max-width: none !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            border-radius: 0 !important;
          }
          .no-print {
            display: none !important;
          }
          .print-grid {
            display: grid !important;
            /* A4 width is roughly 21cm. 3 columns with gap should fit perfectly */
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 1cm !important;
            width: 100% !important;
          }
          .print-card {
            border: 2px solid #cbd5e1 !important;
            border-radius: 12px !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            padding: 0.5cm !important;
          }
        }
      `}</style>
    </div>
  )
}
