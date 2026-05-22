import { useEffect, useRef, useState } from 'react'
import {
  createPosLoyaltyLinkSession,
  getPosLoyaltyLinkUrl,
  loadCustomerLoyaltyCategoryIds,
  readPosLoyaltyLinkSession,
} from '@/lib/posCustomerLink'
import { db } from '@/lib/db'

const QR_POLL_INTERVAL_MS = 3000

export default function PosCustomerLinkModal({
  open = false,
  branchId = '',
  branchName = '',
  registerNo = '1',
  registerLabel = 'POS 1',
  linkedCustomer = null,
  onCustomerLinked,
  onClearCustomer,
  onClose,
}) {
  const [tab, setTab] = useState('search')

  // Doğrudan arama state
  const [searchText, setSearchText] = useState('')
  const [matches, setMatches] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchStatus, setSearchStatus] = useState('')
  const [searchError, setSearchError] = useState('')
  const [loadingCategories, setLoadingCategories] = useState(false)

  // QR tab state
  const [qrSession, setQrSession] = useState(null)
  const [qrUrl, setQrUrl] = useState('')
  const [qrLinkUrl, setQrLinkUrl] = useState('')
  const [qrError, setQrError] = useState('')
  const [qrStatus, setQrStatus] = useState('')
  const [qrInitialized, setQrInitialized] = useState(false)
  const qrPollRef = useRef(null)
  const qrActiveRef = useRef(false)

  // Modal kapanınca temizle
  useEffect(() => {
    if (!open) {
      stopQrPolling()
      setTab('search')
      setSearchText('')
      setMatches([])
      setSearchStatus('')
      setSearchError('')
      setQrSession(null)
      setQrUrl('')
      setQrLinkUrl('')
      setQrError('')
      setQrStatus('')
      setQrInitialized(false)
    }
  }, [open])

  // QR tab aktif olduğunda oturumu başlat
  useEffect(() => {
    if (open && tab === 'qr' && !qrInitialized) {
      setQrInitialized(true)
      initQrSession()
    }
    if (tab !== 'qr') {
      stopQrPolling()
    }
  }, [open, tab, qrInitialized])

  // Temizleme
  useEffect(() => () => {
    stopQrPolling()
  }, [])

  function stopQrPolling() {
    qrActiveRef.current = false
    if (qrPollRef.current) {
      clearInterval(qrPollRef.current)
      qrPollRef.current = null
    }
  }

  async function initQrSession() {
    setQrError('')
    setQrStatus('QR hazırlanıyor...')
    setQrUrl('')
    setQrLinkUrl('')
    try {
      const session = await createPosLoyaltyLinkSession({
        branchId,
        branchName,
        registerNo,
        registerLabel,
        timeoutSec: 300,
      })
      setQrSession(session)
      const qrModule = await import('qrcode')
      const QRLib = qrModule?.default || qrModule
      const linkUrl = getPosLoyaltyLinkUrl(session.token)
      const dataUrl = await QRLib.toDataURL(linkUrl, { width: 360, margin: 1 })
      setQrUrl(dataUrl)
      setQrLinkUrl(linkUrl)
      setQrStatus('')
      startQrPolling(session.token)
    } catch (err) {
      setQrError(err?.message || 'QR oluşturulamadı.')
      setQrStatus('')
    }
  }

  function startQrPolling(token) {
    stopQrPolling()
    qrActiveRef.current = true
    qrPollRef.current = setInterval(async () => {
      if (!qrActiveRef.current) return
      try {
        const next = await readPosLoyaltyLinkSession(token)
        if (!next || next.status === 'expired' || next.status === 'consumed') {
          stopQrPolling()
          return
        }
        if (next.status === 'linked' && next.customerId) {
          stopQrPolling()
          setQrStatus(`${next.customerName || 'Müşteri'} bağlandı.`)
          onCustomerLinked?.({
            customerId: next.customerId,
            customerName: next.customerName,
            phone: next.phone,
            customerCategoryIds: next.customerCategoryIds || [],
            selectedCampaignId: next.selectedCampaignId || '',
            selectedCampaignName: next.selectedCampaignName || '',
            customerCreatedAt: next.customerCreatedAt || null,
            customerFirstOrderAt: next.customerFirstOrderAt || null,
          })
        }
      } catch {
        // poll hatalarını sessizce geç
      }
    }, QR_POLL_INTERVAL_MS)
  }

  async function refreshQr() {
    stopQrPolling()
    setQrSession(null)
    setQrUrl('')
    setQrLinkUrl('')
    setQrStatus('')
    setQrError('')
    setQrInitialized(false)
    // bir sonraki render döngüsünde useEffect tetiklenir
    setTimeout(() => setQrInitialized(false), 0)
    initQrSession()
  }

  async function searchCustomers() {
    const query = searchText.trim()
    if (!query) { setMatches([]); return }
    setSearching(true)
    setSearchError('')
    setSearchStatus('')
    try {
      const digits = query.replace(/\D/g, '')
      let req = db
        .from('musteriler')
        .select('id,ad_soyad,telefon,telefon_ulke,created_at,first_order_at')
        .is('deleted_at', null)
        .limit(15)
      req = digits.length >= 3
        ? req.like('telefon', `%${digits}%`)
        : req.ilike('ad_soyad', `%${query}%`)
      const { data, error } = await req
      if (error) throw error
      setMatches(data || [])
      if (!(data?.length)) setSearchError('Eşleşen müşteri bulunamadı.')
    } catch (err) {
      setSearchError(err?.message || 'Arama başarısız.')
    } finally {
      setSearching(false)
    }
  }

  async function handleSelectCustomer(customer) {
    setLoadingCategories(true)
    setSearchStatus(`${customer.ad_soyad || 'Müşteri'} yükleniyor...`)
    setSearchError('')
    try {
      const categoryIds = await loadCustomerLoyaltyCategoryIds(
        { branchId, branchName },
        customer.id,
      )
      onCustomerLinked?.({
        customerId: String(customer.id),
        customerName: customer.ad_soyad || '',
        phone: `${customer.telefon_ulke || ''}${customer.telefon || ''}`,
        customerCategoryIds: categoryIds || [],
        customerCreatedAt: customer.created_at || null,
        customerFirstOrderAt: customer.first_order_at || null,
      })
      setMatches([])
      setSearchText('')
      setSearchStatus(`${customer.ad_soyad || 'Müşteri'} bağlandı.`)
    } catch (err) {
      setSearchError(err?.message || 'Müşteri yüklenemedi.')
    } finally {
      setLoadingCategories(false)
    }
  }

  if (!open) return null

  const isLinked = Boolean(linkedCustomer?.customerId)

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(2,6,23,.80)',
      zIndex: 220,
      display: 'grid',
      placeItems: 'center',
      padding: 20,
    }}>
      <div style={{
        width: 'min(500px, 100%)',
        borderRadius: 24,
        border: '1px solid rgba(148,163,184,.18)',
        background: 'linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98))',
        boxShadow: '0 28px 72px rgba(0,0,0,.52)',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '90vh',
        overflow: 'hidden',
      }}>
        {/* Başlık */}
        <div style={{ padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,.07)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <div style={{ fontSize: '.72rem', fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase', color: '#fbbf24' }}>
                Sadakat
              </div>
              <div style={{ marginTop: 4, fontSize: '1.1rem', fontWeight: 900, color: '#fff' }}>
                Müşteri Tanımlama
              </div>
              <div style={{ marginTop: 4, color: '#94a3b8', fontSize: '.78rem', lineHeight: 1.5 }}>
                Sipariş alınmadan önce müşteri tanımlanırsa kişisel kampanyalar aktif olur.
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                width: 38, height: 38, borderRadius: 999,
                border: '1px solid rgba(255,255,255,.12)',
                background: 'rgba(255,255,255,.06)',
                color: '#fff', cursor: 'pointer', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <i className="fa-solid fa-times" />
            </button>
          </div>

          {/* Bağlı müşteri göstergesi */}
          {isLinked ? (
            <div style={{
              marginTop: 12,
              padding: '10px 12px',
              borderRadius: 12,
              background: 'rgba(20,83,45,.28)',
              border: '1px solid rgba(34,197,94,.26)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '.68rem', fontWeight: 900, color: '#86efac', textTransform: 'uppercase' }}>Bağlı Müşteri</div>
                <div style={{ fontWeight: 900, color: '#d1fae5', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {linkedCustomer.customerName || 'İsimsiz müşteri'}
                </div>
                {linkedCustomer.phone ? (
                  <div style={{ fontSize: '.76rem', color: '#86efac', marginTop: 2 }}>{linkedCustomer.phone}</div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClearCustomer}
                style={{
                  minHeight: 34, padding: '0 10px', borderRadius: 9,
                  border: '1px solid rgba(255,255,255,.12)',
                  background: 'rgba(255,255,255,.06)',
                  color: '#94a3b8', fontWeight: 800, fontSize: '.74rem', cursor: 'pointer', flexShrink: 0,
                }}
              >
                Kaldır
              </button>
            </div>
          ) : null}
        </div>

        {/* Sekme çubuğu */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,.07)', flexShrink: 0 }}>
          {[
            { key: 'search', label: 'Kasiyer Ara', icon: 'fa-solid fa-magnifying-glass' },
            { key: 'qr', label: 'QR ile Tanı', icon: 'fa-solid fa-qrcode' },
          ].map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              style={{
                flex: 1,
                padding: '12px 16px',
                border: 'none',
                borderBottom: tab === t.key ? '2px solid #fbbf24' : '2px solid transparent',
                background: 'transparent',
                color: tab === t.key ? '#fbbf24' : '#64748b',
                fontWeight: tab === t.key ? 900 : 700,
                fontSize: '.8rem',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                transition: '.15s',
              }}
            >
              <i className={t.icon} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Sekme içerikleri */}
        <div style={{ overflowY: 'auto', flex: 1, padding: 18, display: 'grid', gap: 14 }}>
          {tab === 'search' ? (
            <>
              {/* Kasiyer doğrudan arama */}
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontSize: '.76rem', fontWeight: 800, color: '#94a3b8' }}>Telefon veya müşteri adı</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && searchCustomers()}
                    placeholder="Ör. 555... veya Ahmet"
                    style={{
                      flex: 1, minHeight: 46, borderRadius: 12,
                      border: '1px solid rgba(148,163,184,.16)',
                      background: 'rgba(15,23,42,.95)',
                      color: '#fff', padding: '0 14px', fontSize: '.9rem',
                    }}
                  />
                  <button
                    type="button"
                    onClick={searchCustomers}
                    disabled={searching || !searchText.trim()}
                    style={{
                      minHeight: 46, padding: '0 16px', borderRadius: 12, border: 'none',
                      background: searching || !searchText.trim() ? 'rgba(255,255,255,.08)' : '#38bdf8',
                      color: searching || !searchText.trim() ? '#64748b' : '#082f49',
                      fontWeight: 900, cursor: searching || !searchText.trim() ? 'not-allowed' : 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    {searching ? '...' : <i className="fa-solid fa-magnifying-glass" />}
                  </button>
                </div>
              </div>

              {searchError ? (
                <div style={{ color: '#fca5a5', fontSize: '.8rem', padding: '8px 12px', borderRadius: 10, background: 'rgba(127,29,29,.18)', border: '1px solid rgba(248,113,113,.2)' }}>
                  {searchError}
                </div>
              ) : null}

              {searchStatus ? (
                <div style={{ color: '#bbf7d0', fontSize: '.8rem', padding: '8px 12px', borderRadius: 10, background: 'rgba(20,83,45,.18)', border: '1px solid rgba(34,197,94,.2)' }}>
                  {searchStatus}
                </div>
              ) : null}

              {loadingCategories ? (
                <div style={{ color: '#cbd5e1', fontSize: '.8rem', textAlign: 'center', padding: 8 }}>
                  Kampanya kategorileri yükleniyor...
                </div>
              ) : null}

              <div style={{ display: 'grid', gap: 8 }}>
                {matches.map(customer => (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => handleSelectCustomer(customer)}
                    disabled={loadingCategories}
                    style={{
                      textAlign: 'left',
                      borderRadius: 14,
                      border: '1px solid rgba(148,163,184,.12)',
                      background: 'rgba(15,23,42,.82)',
                      color: '#fff',
                      padding: '12px 14px',
                      cursor: loadingCategories ? 'wait' : 'pointer',
                      display: 'grid',
                      gap: 3,
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>{customer.ad_soyad || 'İsimsiz müşteri'}</div>
                    <div style={{ color: '#94a3b8', fontSize: '.78rem' }}>
                      {customer.telefon_ulke || ''}{customer.telefon || 'Telefon yok'}
                    </div>
                  </button>
                ))}
              </div>

              {!matches.length && !searching && !searchError ? (
                <div style={{ color: '#475569', fontSize: '.8rem', lineHeight: 1.6 }}>
                  Müşteri aramak için telefon numarası (3+ hane) veya isim girin.
                </div>
              ) : null}
            </>
          ) : (
            <>
              {/* QR ile Tanı */}
              <div style={{ display: 'grid', gap: 14 }}>
                <div style={{ color: '#94a3b8', fontSize: '.8rem', lineHeight: 1.6 }}>
                  Musteriye bu QR'i gosterin. Fiziksel telefon gerekmiyorsa ayni mobil loyalty simulasyonunu alttaki linkle dogrudan acabilirsiniz.
                </div>

                <div style={{
                  borderRadius: 20,
                  border: '1px solid rgba(148,163,184,.14)',
                  background: 'rgba(255,255,255,.03)',
                  minHeight: 220,
                  display: 'grid',
                  placeItems: 'center',
                  padding: 16,
                }}>
                  {qrStatus && !qrUrl ? (
                    <div style={{ color: '#94a3b8', fontWeight: 700 }}>{qrStatus}</div>
                  ) : qrUrl ? (
                    <img src={qrUrl} alt="QR kod" style={{ width: '100%', maxWidth: 220, height: 'auto' }} />
                  ) : qrError ? (
                    <div style={{ color: '#fca5a5', textAlign: 'center', padding: 8 }}>{qrError}</div>
                  ) : (
                    <div style={{ color: '#475569' }}>QR hazırlanıyor...</div>
                  )}
                </div>

                {qrSession ? (
                  <div style={{ padding: '10px 12px', borderRadius: 14, background: 'rgba(56,189,248,.08)', border: '1px solid rgba(56,189,248,.16)' }}>
                    <div style={{ color: '#7dd3fc', fontSize: '.7rem', fontWeight: 900, textTransform: 'uppercase' }}>Bağlantı kodu</div>
                    <div style={{ marginTop: 4, color: '#fff', fontWeight: 900, wordBreak: 'break-all', fontSize: '.82rem' }}>
                      {qrSession.token}
                    </div>
                    <div style={{ marginTop: 6, color: '#94a3b8', fontSize: '.72rem' }}>
                      QR okutulursa musteri app'i acilir. Gerekirse bu kod mobil uygulamadaki giris ekraninda manuel de kullanilabilir.
                    </div>
                    {qrLinkUrl ? (
                      <a
                        href={qrLinkUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          marginTop: 10,
                          minHeight: 40,
                          borderRadius: 12,
                          background: 'rgba(56,189,248,.12)',
                          color: '#7dd3fc',
                          fontWeight: 900,
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
                ) : null}

                {qrStatus && qrUrl ? (
                  <div style={{ padding: '10px 12px', borderRadius: 14, background: 'rgba(20,83,45,.2)', border: '1px solid rgba(34,197,94,.24)', color: '#bbf7d0', fontWeight: 800, fontSize: '.82rem' }}>
                    {qrStatus}
                  </div>
                ) : null}

                {qrError ? (
                  <button
                    type="button"
                    onClick={refreshQr}
                    style={{
                      minHeight: 42, borderRadius: 12, border: '1px solid rgba(255,255,255,.12)',
                      background: 'rgba(255,255,255,.06)', color: '#e2e8f0',
                      fontWeight: 800, cursor: 'pointer',
                    }}
                  >
                    QR'ı Yenile
                  </button>
                ) : qrUrl ? (
                  <button
                    type="button"
                    onClick={refreshQr}
                    style={{
                      minHeight: 40, borderRadius: 12, border: '1px solid rgba(255,255,255,.08)',
                      background: 'transparent', color: '#64748b',
                      fontWeight: 700, fontSize: '.76rem', cursor: 'pointer',
                    }}
                  >
                    Yeni QR Oluştur
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>

        {/* Alt kısım */}
        <div style={{
          padding: '14px 18px',
          borderTop: '1px solid rgba(255,255,255,.07)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 10,
          flexShrink: 0,
        }}>
          {isLinked ? (
            <button
              type="button"
              onClick={onClose}
              style={{
                minHeight: 44, padding: '0 20px', borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg,#f59e0b,#fbbf24)',
                color: '#111827', fontWeight: 900, cursor: 'pointer',
              }}
            >
              Tamam
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              style={{
                minHeight: 44, padding: '0 20px', borderRadius: 12,
                border: '1px solid rgba(255,255,255,.12)',
                background: 'rgba(255,255,255,.06)',
                color: '#e2e8f0', fontWeight: 800, cursor: 'pointer',
              }}
            >
              Müşterisiz Devam
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
