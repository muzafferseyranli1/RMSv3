import { getPosLoyaltyLinkUrl } from '@/lib/posCustomerLink'

export default function PosLoyaltyLinkModal({
  open = false,
  session = null,
  qrUrl = '',
  customer = null,
  errorText = '',
  statusText = '',
  onClose,
  onClearCustomer,
}) {
  if (!open) return null
  const linkUrl = session?.token ? getPosLoyaltyLinkUrl(session.token) : ''

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(2,6,23,.76)',
      zIndex: 220,
      display: 'grid',
      placeItems: 'center',
      padding: 20,
    }}>
      <div style={{
        width: 'min(520px, 100%)',
        borderRadius: 28,
        border: '1px solid rgba(148,163,184,.16)',
        background: 'linear-gradient(180deg, rgba(15,23,42,.98), rgba(2,6,23,.98))',
        boxShadow: '0 32px 80px rgba(0,0,0,.48)',
        padding: 22,
        display: 'grid',
        gap: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '.76rem', fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase', color: '#fbbf24' }}>
              Kampanya Uygula
            </div>
            <div style={{ marginTop: 6, fontSize: '1.35rem', fontWeight: 900, color: '#fff' }}>
              QR ile musteri tani
            </div>
            <div style={{ marginTop: 8, color: '#cbd5e1', lineHeight: 1.6, fontSize: '.86rem' }}>
              Musteri QR okutunca tam ekran mobil loyalty uygulamasi acilir. Hesabini tanitinca bu POS oturumu musteri kimligini ve uygun sadakat avantajlarini gorur.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,.12)',
              background: 'rgba(255,255,255,.06)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            X
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 230px) minmax(0, 1fr)', gap: 16 }}>
          <div style={{
            borderRadius: 22,
            border: '1px solid rgba(148,163,184,.16)',
            background: 'rgba(255,255,255,.03)',
            minHeight: 250,
            display: 'grid',
            placeItems: 'center',
            padding: 16,
          }}>
            {qrUrl ? (
              <img src={qrUrl} alt="POS loyalty QR" style={{ width: '100%', maxWidth: 210, height: 'auto', objectFit: 'contain' }} />
            ) : (
              <div style={{ color: '#64748b', textAlign: 'center', lineHeight: 1.6 }}>QR hazirlaniyor...</div>
            )}
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ padding: '12px 14px', borderRadius: 18, background: 'rgba(56,189,248,.10)', border: '1px solid rgba(56,189,248,.16)' }}>
              <div style={{ color: '#7dd3fc', fontSize: '.74rem', fontWeight: 900, textTransform: 'uppercase' }}>POS oturumu</div>
              <div style={{ marginTop: 6, color: '#fff', fontWeight: 900 }}>{session?.registerLabel || 'POS 1'}</div>
              <div style={{ marginTop: 4, color: '#cbd5e1', fontSize: '.82rem' }}>{session?.branchName || 'Sube bilgisi yok'}</div>
            </div>

            <div style={{ padding: '12px 14px', borderRadius: 18, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(148,163,184,.16)' }}>
              <div style={{ color: '#94a3b8', fontSize: '.74rem', fontWeight: 900, textTransform: 'uppercase' }}>Manuel kod</div>
              <div style={{ marginTop: 6, color: '#fff', fontWeight: 900, wordBreak: 'break-all' }}>{session?.token || '-'}</div>
              <div style={{ marginTop: 6, color: '#94a3b8', fontSize: '.76rem', lineHeight: 1.5 }}>
                Bu akista fiziksel telefon gerekmiyor. Istersen QR yerine dogrudan mobil simulasyon linkini acabilirsin.
              </div>
              {linkUrl ? (
                <a
                  href={linkUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    marginTop: 10,
                    minHeight: 40,
                    borderRadius: 12,
                    background: 'rgba(56,189,248,.12)',
                    color: '#7dd3fc',
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 14px',
                    textDecoration: 'none',
                  }}
                >
                  Mobil simulasyonu ac
                </a>
              ) : null}
            </div>

            <div style={{
              padding: '12px 14px',
              borderRadius: 18,
              background: customer ? 'rgba(22,163,74,.16)' : 'rgba(15,23,42,.82)',
              border: `1px solid ${customer ? 'rgba(34,197,94,.26)' : 'rgba(148,163,184,.16)'}`,
            }}>
              <div style={{ color: customer ? '#86efac' : '#94a3b8', fontSize: '.74rem', fontWeight: 900, textTransform: 'uppercase' }}>
                Bagli musteri
              </div>
              <div style={{ marginTop: 6, color: '#fff', fontWeight: 900 }}>
                {customer?.customerName || 'Baglanti bekleniyor...'}
              </div>
              {customer?.phone ? (
                <div style={{ marginTop: 4, color: customer ? '#bbf7d0' : '#cbd5e1', fontSize: '.8rem' }}>{customer.phone}</div>
              ) : null}
              {Array.isArray(customer?.customerCategoryIds) && customer.customerCategoryIds.length > 0 ? (
                <div style={{ marginTop: 8, color: '#d1fae5', fontSize: '.76rem' }}>
                  Kategori sayisi: {customer.customerCategoryIds.length}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {statusText ? (
          <div style={{ padding: '12px 14px', borderRadius: 16, background: 'rgba(22,163,74,.14)', border: '1px solid rgba(34,197,94,.24)', color: '#bbf7d0', fontWeight: 800 }}>
            {statusText}
          </div>
        ) : null}

        {errorText ? (
          <div style={{ padding: '12px 14px', borderRadius: 16, background: 'rgba(127,29,29,.22)', border: '1px solid rgba(248,113,113,.24)', color: '#fecaca', fontWeight: 800 }}>
            {errorText}
          </div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ color: '#94a3b8', fontSize: '.78rem', lineHeight: 1.6 }}>
            Musteri baglandiginda kategori, kampanya ve loyalty haklari odeme ekraninda kullanilabilir hale gelir.
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {customer ? (
              <button
                type="button"
                onClick={onClearCustomer}
                style={{
                  minHeight: 44,
                  padding: '0 14px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,.12)',
                  background: 'rgba(255,255,255,.06)',
                  color: '#e2e8f0',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Musteri Bagini Kaldir
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              style={{
                minHeight: 44,
                padding: '0 16px',
                borderRadius: 12,
                border: 'none',
                background: 'linear-gradient(135deg,#f59e0b,#fbbf24)',
                color: '#111827',
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              Kapat
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
