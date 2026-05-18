import { useEffect, useMemo, useState } from 'react'
import { buildPosTableQrPayload, getQrMenuBaseUrl } from '@/lib/posQrService'

function overlayStyle() {
  return {
    position: 'fixed',
    inset: 0,
    zIndex: 620,
    background: 'rgba(2,6,23,.82)',
    padding: 24,
    overflowY: 'auto',
  }
}

function cardStyle() {
  return {
    borderRadius: 18,
    border: '1px solid rgba(148,163,184,.16)',
    background: '#fff',
    padding: 18,
    display: 'grid',
    gap: 10,
    breakInside: 'avoid',
  }
}

export default function TableQrPrintModal({
  open,
  branchName,
  branchId,
  records = [],
  title = 'QR Yazdir',
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
          nextMap[record.id] = await QRCodeLib.toDataURL(record.payload, { width: 320, margin: 1 })
        }
        if (!cancelled) setQrMap(nextMap)
      } catch (loadError) {
        if (!cancelled) setError(loadError?.message || 'QR gorselleri hazirlanamadi.')
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
      <div style={{ width: 'min(1180px, 100%)', margin: '0 auto', borderRadius: 24, background: '#020617', border: '1px solid rgba(148,163,184,.16)', padding: 20, display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div>
            <div style={{ color: '#fbbf24', fontSize: '.74rem', fontWeight: 900, letterSpacing: '.12em', textTransform: 'uppercase' }}>QR Baski</div>
            <div style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 900, marginTop: 6 }}>{title}</div>
            <div style={{ color: '#94a3b8', fontSize: '.84rem', marginTop: 4 }}>{branchName || 'Sube'}</div>
          </div>
          <div className="table-qr-print-actions" style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="touch-btn" onClick={() => window.print()}>PDF / Yazdir</button>
            <button type="button" className="touch-btn" onClick={onClose}>Kapat</button>
          </div>
        </div>

        {error && (
          <div style={{ borderRadius: 14, border: '1px solid rgba(248,113,113,.28)', background: 'rgba(127,29,29,.28)', color: '#fecaca', padding: '12px 14px' }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#cbd5e1' }}>
            <i className="fa-solid fa-spinner fa-spin" /> QR kartlari hazirlaniyor...
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            {normalizedRecords.map(record => (
              <div key={record.id} style={cardStyle()}>
                <div style={{ color: '#0f172a', fontSize: '1rem', fontWeight: 900 }}>{record.tableName || 'Masa'}</div>
                <div style={{ color: '#475569', fontSize: '.82rem' }}>
                  {record.hallName || 'Salon'} {record.sectionName ? `/ ${record.sectionName}` : ''}
                </div>
                <div style={{ color: '#0f172a', fontWeight: 700, fontSize: '.88rem' }}>Masa No: {record.tableNumber || '-'}</div>
                <div style={{ display: 'flex', justifyContent: 'center', padding: 6 }}>
                  {qrMap[record.id]
                    ? <img src={qrMap[record.id]} alt={`${record.tableName} QR`} style={{ width: 180, height: 180, objectFit: 'contain' }} />
                    : <div style={{ width: 180, height: 180, borderRadius: 16, background: '#e2e8f0' }} />}
                </div>
                <div style={{ color: '#64748b', fontSize: '.72rem', lineHeight: 1.45, wordBreak: 'break-all' }}>{record.payload}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .table-qr-print-root, .table-qr-print-root * { visibility: visible !important; }
          .table-qr-print-root { position: absolute !important; inset: 0 !important; background: #fff !important; padding: 0 !important; }
          .table-qr-print-root > div { width: 100% !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; background: #fff !important; }
          .table-qr-print-actions { display: none !important; }
        }
      `}</style>
    </div>
  )
}
