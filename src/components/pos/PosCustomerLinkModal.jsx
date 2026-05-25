import { useEffect, useRef, useState } from 'react'
import {
  createPosLoyaltyLinkSession,
  getPosLoyaltyLinkUrl,
  loadCustomerLoyaltyCategoryIds,
  readPosLoyaltyLinkSession,
} from '@/lib/posCustomerLink'
import { db } from '@/lib/db'
import {
  lookupCustomerByQrCode,
  revertExpiredCouponReservations,
} from '@/lib/mobileCustomerApp'

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

  // QR tab state (Scanner)
  const [scanValue, setScanValue] = useState('')
  const [qrSearching, setQrSearching] = useState(false)
  const [qrError, setQrError] = useState('')
  const [qrStatus, setQrStatus] = useState('')
  const [sampleCustomers, setSampleCustomers] = useState([])
  const scanInputRef = useRef(null)

  // Modal kapanınca temizle
  useEffect(() => {
    if (!open) {
      setTab('search')
      setSearchText('')
      setMatches([])
      setSearchStatus('')
      setSearchError('')
      setScanValue('')
      setQrError('')
      setQrStatus('')
    }
  }, [open])

  // QR tab aktif olduğunda auto-focus & load sample customers
  useEffect(() => {
    if (open && tab === 'qr') {
      db.from('musteriler')
        .select('id, ad_soyad, telefon, loyalty_member_no')
        .is('deleted_at', null)
        .not('loyalty_member_no', 'is', null)
        .limit(4)
        .then(({ data }) => {
          if (data) setSampleCustomers(data)
        })
        .catch(() => {})
      
      setTimeout(() => {
        if (scanInputRef.current) scanInputRef.current.focus()
      }, 150)
    }
  }, [open, tab])

  // Refocus input if cashier clicks elsewhere in QR tab
  const handleRefocusScan = () => {
    if (open && tab === 'qr' && scanInputRef.current) {
      scanInputRef.current.focus()
    }
  }

  async function handleScanCode(code) {
    if (!code || !code.trim()) return
    setQrSearching(true)
    setQrError('')
    setQrStatus('Müşteri bulunuyor...')
    try {
      const customer = await lookupCustomerByQrCode(code)
      if (!customer) {
        setQrError('QR/Kart ile eşleşen müşteri bulunamadı.')
        setQrStatus('')
        return
      }

      await revertExpiredCouponReservations(customer.id)
      const categoryIds = await loadCustomerLoyaltyCategoryIds(
        { branchId, branchName },
        customer.id,
      )

      // Fetch selections
      const { data: customerRow } = await db
        .from('musteriler')
        .select('metadata')
        .eq('id', customer.id)
        .maybeSingle()
      
      const metadata = customerRow?.metadata && typeof customerRow.metadata === 'object' ? customerRow.metadata : {}
      const selectedCampaignIds = Array.isArray(metadata.selectedCampaignIds) ? metadata.selectedCampaignIds : []
      const selectedCampaignId = selectedCampaignIds[0] || ''

      const { data: reservedCoupons } = await db
        .from('loyalty_coupons')
        .select('code')
        .eq('customer_id', customer.id)
        .eq('redemption_status', 'reserved')
        .is('deleted_at', null)
      const couponCodes = reservedCoupons?.map(c => c.code).join(',') || ''
      const couponLabel = reservedCoupons?.map(c => c.code).join(', ') || ''

      setQrStatus(`${customer.ad_soyad || 'Müşteri'} başarıyla bağlandı.`)
      
      onCustomerLinked?.({
        customerId: String(customer.id),
        customerName: customer.ad_soyad || '',
        phone: `${customer.telefon_ulke || ''}${customer.telefon || ''}`,
        customerCategoryIds: categoryIds || [],
        selectedCampaignId,
        selectedCampaignIds,
        selectedCouponCode: couponCodes,
        selectedCouponLabel: couponLabel,
        customerCreatedAt: customer.created_at || null,
        customerFirstOrderAt: customer.first_order_at || null,
      })
      setScanValue('')
    } catch (err) {
      setQrError(err?.message || 'Bağlantı hatası.')
      setQrStatus('')
    } finally {
      setQrSearching(false)
    }
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
      await revertExpiredCouponReservations(customer.id)
      const categoryIds = await loadCustomerLoyaltyCategoryIds(
        { branchId, branchName },
        customer.id,
      )

      // Fetch selections
      const { data: customerRow } = await db
        .from('musteriler')
        .select('metadata')
        .eq('id', customer.id)
        .maybeSingle()
      
      const metadata = customerRow?.metadata && typeof customerRow.metadata === 'object' ? customerRow.metadata : {}
      const selectedCampaignIds = Array.isArray(metadata.selectedCampaignIds) ? metadata.selectedCampaignIds : []
      const selectedCampaignId = selectedCampaignIds[0] || ''

      const { data: reservedCoupons } = await db
        .from('loyalty_coupons')
        .select('code')
        .eq('customer_id', customer.id)
        .eq('redemption_status', 'reserved')
        .is('deleted_at', null)
      const couponCodes = reservedCoupons?.map(c => c.code).join(',') || ''
      const couponLabel = reservedCoupons?.map(c => c.code).join(', ') || ''

      onCustomerLinked?.({
        customerId: String(customer.id),
        customerName: customer.ad_soyad || '',
        phone: `${customer.telefon_ulke || ''}${customer.telefon || ''}`,
        customerCategoryIds: categoryIds || [],
        selectedCampaignId,
        selectedCampaignIds,
        selectedCouponCode: couponCodes,
        selectedCouponLabel: couponLabel,
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
              {/* QR / Kart Okut */}
              <div style={{ display: 'grid', gap: 14 }} onClick={handleRefocusScan}>
                <div style={{ color: '#94a3b8', fontSize: '.8rem', lineHeight: 1.6 }}>
                  Müşterinin mobil uygulamasındaki sadakat QR kodunu tarayıcıya okutun veya üye numarasını girin.
                </div>

                {/* Hidden/focused Scan Receiver input */}
                <input
                  ref={scanInputRef}
                  type="text"
                  value={scanValue}
                  onChange={(e) => setScanValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleScanCode(scanValue)}
                  onBlur={handleRefocusScan}
                  placeholder="Okutulan kod..."
                  style={{
                    position: 'absolute',
                    opacity: 0,
                    pointerEvents: 'none',
                  }}
                />

                {/* Modern Scanner Animation Box */}
                <div style={{
                  borderRadius: 20,
                  border: '1px solid rgba(56,189,248,.18)',
                  background: 'rgba(7,10,19,.9)',
                  minHeight: 180,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 16,
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  {/* Laser Sweeper animation */}
                  <div style={{
                    position: 'absolute',
                    left: 0, right: 0, height: 3,
                    background: 'linear-gradient(90deg, transparent, #38bdf8, transparent)',
                    boxShadow: '0 0 10px #38bdf8, 0 0 20px #38bdf8',
                    animation: 'laserSweep 3s infinite linear'
                  }} />
                  
                  <i className="fa-solid fa-qrcode" style={{ color: 'rgba(56,189,248,.15)', fontSize: 72 }} />
                  
                  <div style={{ marginTop: 10, color: 'rgba(56,189,248,.8)', fontSize: '.76rem', fontWeight: 900, letterSpacing: '.06em' }}>
                    TARAYICI BEKLENİYOR
                  </div>
                </div>

                {/* Manual entry fallback */}
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ fontSize: '.76rem', fontWeight: 800, color: '#94a3b8' }}>Manuel Kod Girişi</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={scanValue}
                      onChange={(e) => setScanValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleScanCode(scanValue)}
                      placeholder="Ör. RMS-12345678"
                      style={{
                        flex: 1, minHeight: 40, borderRadius: 10,
                        border: '1px solid rgba(148,163,184,.16)',
                        background: 'rgba(15,23,42,.95)',
                        color: '#fff', padding: '0 12px', fontSize: '.85rem',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleScanCode(scanValue)}
                      disabled={qrSearching || !scanValue.trim()}
                      style={{
                        minHeight: 40, padding: '0 14px', borderRadius: 10, border: 'none',
                        background: qrSearching || !scanValue.trim() ? 'rgba(255,255,255,.08)' : '#38bdf8',
                        color: qrSearching || !scanValue.trim() ? '#64748b' : '#082f49',
                        fontWeight: 900, cursor: qrSearching || !scanValue.trim() ? 'not-allowed' : 'pointer',
                        fontSize: '.85rem'
                      }}
                    >
                      Tanımla
                    </button>
                  </div>
                </div>

                {qrError ? (
                  <div style={{ color: '#fca5a5', fontSize: '.8rem', padding: '8px 12px', borderRadius: 10, background: 'rgba(127,29,29,.18)', border: '1px solid rgba(248,113,113,.2)' }}>
                    {qrError}
                  </div>
                ) : null}

                {qrStatus ? (
                  <div style={{ color: '#bbf7d0', fontSize: '.8rem', padding: '8px 12px', borderRadius: 10, background: 'rgba(20,83,45,.18)', border: '1px solid rgba(34,197,94,.2)' }}>
                    {qrStatus}
                  </div>
                ) : null}

                {/* Hızlı simülasyon test paneli */}
                {sampleCustomers.length > 0 && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,.07)', paddingTop: 12 }}>
                    <div style={{ color: '#64748b', fontSize: '.7rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                      Test Simülasyonu (Tıklayın)
                    </div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {sampleCustomers.map(cust => (
                        <button
                          key={cust.id}
                          type="button"
                          onClick={() => handleScanCode(cust.loyalty_member_no || cust.telefon)}
                          style={{
                            padding: '8px 12px', background: 'rgba(255,255,255,.03)',
                            border: '1px solid rgba(255,255,255,.05)', borderRadius: 10,
                            color: '#cbd5e1', fontSize: '.78rem', cursor: 'pointer',
                            textAlign: 'left', display: 'flex', justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                        >
                          <strong style={{ color: '#fff' }}>{cust.ad_soyad}</strong>
                          <span style={{ color: '#64748b', fontSize: '.72rem' }}>{cust.loyalty_member_no || cust.telefon}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <style>{`
                @keyframes laserSweep {
                  0% { top: 0%; }
                  50% { top: 100%; }
                  100% { top: 0%; }
                }
              `}</style>
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
