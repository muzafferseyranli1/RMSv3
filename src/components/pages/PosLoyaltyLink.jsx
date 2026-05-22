import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  extractPosLoyaltyToken,
  linkCustomerToPosLoyaltySession,
  loadCustomerLoyaltyCategoryIds,
  readPosLoyaltyLinkSession,
} from '@/lib/posCustomerLink'
import {
  evaluateRuntimeOrderCampaigns,
  loadRuntimeLoyaltyCampaignCatalog,
} from '@/lib/posLoyalty'
import { db } from '@/lib/db'

const MOBILE_CUSTOMER_CACHE_KEY = 'suitable_mobile_loyalty_customer_v1'

function normalizeStoredCustomer(value) {
  if (!value?.id) return null
  return {
    id: String(value.id || ''),
    ad_soyad: String(value.ad_soyad || value.name || ''),
    telefon: String(value.telefon || ''),
    telefon_ulke: String(value.telefon_ulke || ''),
    email: String(value.email || ''),
    created_at: value.created_at || value.customerCreatedAt || null,
    first_order_at: value.first_order_at || value.customerFirstOrderAt || null,
  }
}

function readStoredCustomer() {
  try {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(MOBILE_CUSTOMER_CACHE_KEY)
    return normalizeStoredCustomer(raw ? JSON.parse(raw) : null)
  } catch {
    return null
  }
}

function writeStoredCustomer(customer) {
  try {
    if (typeof window === 'undefined') return
    if (customer) window.localStorage.setItem(MOBILE_CUSTOMER_CACHE_KEY, JSON.stringify(customer))
    else window.localStorage.removeItem(MOBILE_CUSTOMER_CACHE_KEY)
  } catch {
    // Best-effort.
  }
}

export default function PosLoyaltyLink() {
  const navigate = useNavigate()
  const { token: routeToken = '' } = useParams()
  const [tokenInput, setTokenInput] = useState(routeToken)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(Boolean(routeToken))
  const [errorText, setErrorText] = useState('')
  const [statusText, setStatusText] = useState('')
  const [activeCustomer, setActiveCustomer] = useState(() => readStoredCustomer())
  const [searchText, setSearchText] = useState('')
  const [matches, setMatches] = useState([])
  const [searching, setSearching] = useState(false)
  const [linking, setLinking] = useState(false)
  const [step, setStep] = useState(routeToken ? 'connect' : 'identify')
  // step: 'identify' | 'connect' | 'done'

  // Kampanya seçimi
  const [campaignList, setCampaignList] = useState([])
  const [campaignsLoading, setCampaignsLoading] = useState(false)
  const [campaignsError, setCampaignsError] = useState('')
  const [selectedCampaignId, setSelectedCampaignId] = useState('')
  const [selectedCampaignName, setSelectedCampaignName] = useState('')

  useEffect(() => {
    setTokenInput(routeToken || '')
    if (routeToken) setStep('connect')
  }, [routeToken])

  useEffect(() => {
    let ignore = false
    async function loadSession() {
      if (!routeToken) { setSession(null); setLoading(false); return }
      setLoading(true)
      setErrorText('')
      try {
        const next = await readPosLoyaltyLinkSession(routeToken)
        if (ignore) return
        setSession(next)
        if (!next) setErrorText('Bu bağlantı bulunamadı veya süresi doldu.')
        else if (next.status === 'linked') setStep('done')
      } catch (err) {
        if (ignore) return
        setSession(null)
        setErrorText(err?.message || 'Bağlantı okunamadı.')
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    loadSession()
    return () => { ignore = true }
  }, [routeToken])

  // Müşteri ve session hazır olunca kampanyaları yükle
  useEffect(() => {
    if (!activeCustomer?.id || !session) return
    if (!session.branchId && !session.branchName) return
    loadPersonalCampaigns()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCustomer?.id, session?.token])

  async function loadPersonalCampaigns() {
    setCampaignsLoading(true)
    setCampaignsError('')
    setCampaignList([])
    try {
      const [catalog, categoryIds] = await Promise.all([
        loadRuntimeLoyaltyCampaignCatalog({ branchId: session.branchId, branchName: session.branchName }),
        loadCustomerLoyaltyCategoryIds({ branchId: session.branchId, branchName: session.branchName }, activeCustomer.id),
      ])
      const evaluated = evaluateRuntimeOrderCampaigns(catalog.campaigns || [], {
        customerContext: {
          customerId: String(activeCustomer.id),
          customerName: activeCustomer.ad_soyad || '',
          customerCategoryIds: categoryIds || [],
          customerCreatedAt: activeCustomer.created_at || null,
          customerFirstOrderAt: activeCustomer.first_order_at || null,
        },
      })
      // Sadece müşteriye özel (hedef kitleli) kampanyaları göster — audienceType: 'all' değil
      const personal = evaluated.visibleCampaigns.filter(
        c => c.audienceType !== 'all' && c.audienceMatched && c.audienceSupported,
      )
      setCampaignList(personal)
    } catch {
      setCampaignsError('Kampanyalar yüklenemedi.')
    } finally {
      setCampaignsLoading(false)
    }
  }

  const isLinked = session?.status === 'linked' && Boolean(session?.customerId)
  const normalizedTokenInput = useMemo(() => extractPosLoyaltyToken(tokenInput), [tokenInput])

  async function searchCustomers() {
    const query = searchText.trim()
    if (!query) { setMatches([]); return }
    setSearching(true)
    setStatusText('')
    setErrorText('')
    try {
      const digits = query.replace(/\D/g, '')
      let req = db.from('musteriler').select('id,ad_soyad,telefon,telefon_ulke,email,created_at,first_order_at').is('deleted_at', null).limit(12)
      req = digits.length >= 3 ? req.like('telefon', `%${digits}%`) : req.ilike('ad_soyad', `%${query}%`)
      const { data, error } = await req
      if (error) throw error
      setMatches(data || [])
      if (!data?.length) setStatusText('Eşleşen müşteri bulunamadı.')
    } catch (err) {
      setMatches([])
      setErrorText(err?.message || 'Arama başarısız.')
    } finally {
      setSearching(false)
    }
  }

  function rememberCustomer(customer) {
    const normalized = normalizeStoredCustomer(customer)
    setActiveCustomer(normalized)
    writeStoredCustomer(normalized)
    setMatches([])
    setSearchText('')
    setStatusText(`${normalized?.ad_soyad || 'Müşteri'} seçildi.`)
    setSelectedCampaignId('')
    setSelectedCampaignName('')
    if (routeToken) setStep('connect')
  }

  function clearRememberedCustomer() {
    setActiveCustomer(null)
    writeStoredCustomer(null)
    setStep('identify')
    setStatusText('')
    setCampaignList([])
    setSelectedCampaignId('')
    setSelectedCampaignName('')
  }

  function toggleCampaign(campaign) {
    if (selectedCampaignId === String(campaign.id)) {
      setSelectedCampaignId('')
      setSelectedCampaignName('')
    } else {
      setSelectedCampaignId(String(campaign.id))
      setSelectedCampaignName(campaign.name || '')
    }
  }

  function openManualToken() {
    if (!normalizedTokenInput) { setErrorText('Bağlantı kodu veya linki girin.'); return }
    navigate(`/pos-loyalty-link/${normalizedTokenInput}`)
  }

  async function connectCustomer() {
    if (!routeToken) { openManualToken(); return }
    if (!activeCustomer?.id) { setErrorText('Önce bir müşteri seçin.'); return }
    setLinking(true)
    setErrorText('')
    setStatusText('')
    try {
      const next = await linkCustomerToPosLoyaltySession(routeToken, activeCustomer, {
        selectedCampaignId,
        selectedCampaignName,
      })
      setSession(next)
      setStep('done')
      setStatusText(`${activeCustomer.ad_soyad || 'Müşteri'} hesabı ${next?.registerLabel || 'kasaya'} bağlandı.`)
    } catch (err) {
      setErrorText(err?.message || 'Bağlantı güncellenemedi.')
    } finally {
      setLinking(false)
    }
  }

  // ── Ortak stiller ────────────────────────────────────────────────────
  const card = (border = 'rgba(148,163,184,.16)', bg = 'rgba(15,23,42,.80)') => ({
    borderRadius: 20,
    border: `1px solid ${border}`,
    background: bg,
    padding: 18,
    display: 'grid',
    gap: 14,
  })

  return (
    <div style={{
      minHeight: '100svh',
      background: 'radial-gradient(circle at 30% 0%, rgba(245,158,11,.14) 0%, transparent 42%), linear-gradient(180deg,#020617,#0f172a)',
      color: '#f8fafc',
      padding: '20px 16px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    }}>
      <div style={{ width: '100%', maxWidth: 420, display: 'grid', gap: 14 }}>

        {/* Logo / başlık */}
        <div style={{ textAlign: 'center', paddingTop: 12, paddingBottom: 4 }}>
          <div style={{ fontSize: '.68rem', fontWeight: 900, letterSpacing: '.14em', textTransform: 'uppercase', color: '#fbbf24' }}>
            Sadakat Bağlantısı
          </div>
          <div style={{ marginTop: 8, fontSize: '1.5rem', fontWeight: 900 }}>
            {step === 'done' ? 'Bağlantı Tamamlandı' : 'Kampanya Bağla'}
          </div>
          <div style={{ marginTop: 6, color: '#94a3b8', fontSize: '.82rem', lineHeight: 1.6 }}>
            {step === 'done'
              ? 'Kasiyerde kampanya avantajlarınız aktif hale geldi.'
              : 'Kasiyerdeki kampanyaları aktifleştirmek için hesabınızı bağlayın.'}
          </div>
        </div>

        {/* STEP: Tamamlandı */}
        {step === 'done' && (
          <div style={card('rgba(34,197,94,.28)', 'rgba(20,83,45,.36)')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 999,
                background: 'rgba(34,197,94,.2)', border: '1px solid rgba(34,197,94,.36)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.3rem', color: '#34d399', flexShrink: 0,
              }}>
                <i className="fa-solid fa-check" />
              </div>
              <div>
                <div style={{ fontWeight: 900, color: '#d1fae5', fontSize: '1rem' }}>
                  {session?.customerName || activeCustomer?.ad_soyad || 'Hesabınız bağlandı'}
                </div>
                <div style={{ marginTop: 4, color: '#86efac', fontSize: '.8rem' }}>
                  {session?.registerLabel || 'Kasa'} • {session?.branchName || 'Şube bilgisi yok'}
                </div>
              </div>
            </div>
            {selectedCampaignName ? (
              <div style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(245,158,11,.12)', border: '1px solid rgba(251,191,36,.28)' }}>
                <div style={{ fontSize: '.68rem', fontWeight: 900, color: '#fbbf24', textTransform: 'uppercase' }}>Seçili Kampanya</div>
                <div style={{ marginTop: 4, color: '#fde68a', fontWeight: 800, fontSize: '.86rem' }}>{selectedCampaignName}</div>
              </div>
            ) : null}
            <div style={{ color: '#a7f3d0', fontSize: '.8rem', lineHeight: 1.6 }}>
              Kampanyalarınız değerlendiriliyor. Kasiyere ödeme yapmak için hazır olduğunuzu bildirin.
            </div>
          </div>
        )}

        {/* STEP: Aktif adımlar */}
        {step !== 'done' && (
          <>
            {/* Seçili müşteri */}
            {activeCustomer ? (
              <div style={card('rgba(56,189,248,.22)', 'rgba(8,47,73,.36)')}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '.68rem', fontWeight: 900, color: '#7dd3fc', textTransform: 'uppercase' }}>Seçili Hesap</div>
                    <div style={{ marginTop: 4, fontWeight: 900, fontSize: '1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {activeCustomer.ad_soyad || 'İsimsiz'}
                    </div>
                    <div style={{ marginTop: 3, color: '#94a3b8', fontSize: '.8rem' }}>
                      {activeCustomer.telefon_ulke || ''}{activeCustomer.telefon || ''}
                    </div>
                  </div>
                  <button type="button" onClick={clearRememberedCustomer}
                    style={{ minHeight: 36, padding: '0 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.06)', color: '#94a3b8', fontWeight: 800, fontSize: '.76rem', cursor: 'pointer', flexShrink: 0 }}>
                    Değiştir
                  </button>
                </div>

                {/* Bağlantı kodu giriş (token yoksa) */}
                {!routeToken ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ fontSize: '.74rem', fontWeight: 800, color: '#7dd3fc' }}>Kasiyerdeki bağlantı kodu</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        value={tokenInput}
                        onChange={e => setTokenInput(e.target.value)}
                        placeholder="Kodu veya linki girin"
                        style={{ flex: 1, minHeight: 46, borderRadius: 12, border: '1px solid rgba(148,163,184,.16)', background: 'rgba(15,23,42,.95)', color: '#fff', padding: '0 14px' }}
                      />
                      <button type="button" onClick={openManualToken} disabled={!normalizedTokenInput}
                        style={{ minHeight: 46, padding: '0 16px', borderRadius: 12, border: 'none', background: !normalizedTokenInput ? 'rgba(255,255,255,.08)' : 'linear-gradient(135deg,#f59e0b,#fbbf24)', color: !normalizedTokenInput ? '#64748b' : '#111827', fontWeight: 900, cursor: !normalizedTokenInput ? 'not-allowed' : 'pointer' }}>
                        Git
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Müşteri arama */}
            {!activeCustomer && (
              <div style={card()}>
                <div>
                  <div style={{ fontSize: '.74rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase' }}>Hesap Ara</div>
                  <div style={{ marginTop: 6, color: '#cbd5e1', fontSize: '.82rem', lineHeight: 1.5 }}>
                    Telefon numaranız veya adınızla kayıtlı hesabınızı bulun.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && searchCustomers()}
                    placeholder="Tel veya isim"
                    style={{ flex: 1, minHeight: 48, borderRadius: 12, border: '1px solid rgba(148,163,184,.16)', background: 'rgba(15,23,42,.95)', color: '#fff', padding: '0 14px' }}
                  />
                  <button type="button" onClick={searchCustomers} disabled={searching || !searchText.trim()}
                    style={{ minHeight: 48, padding: '0 18px', borderRadius: 12, border: 'none', background: searching || !searchText.trim() ? 'rgba(255,255,255,.08)' : '#38bdf8', color: searching || !searchText.trim() ? '#64748b' : '#082f49', fontWeight: 900, cursor: searching || !searchText.trim() ? 'not-allowed' : 'pointer' }}>
                    {searching ? '...' : 'Ara'}
                  </button>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {matches.map(customer => (
                    <button key={customer.id} type="button" onClick={() => rememberCustomer(customer)}
                      style={{ textAlign: 'left', borderRadius: 14, border: '1px solid rgba(148,163,184,.12)', background: 'rgba(15,23,42,.7)', color: '#fff', padding: '12px 14px', cursor: 'pointer', display: 'grid', gap: 3 }}>
                      <div style={{ fontWeight: 800 }}>{customer.ad_soyad || 'İsimsiz'}</div>
                      <div style={{ color: '#94a3b8', fontSize: '.78rem' }}>{customer.telefon_ulke || ''}{customer.telefon || ''}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Kampanya Seçimi — müşteri ve session hazırsa göster */}
            {activeCustomer && routeToken && session && !loading && (
              <div style={card('rgba(251,191,36,.2)', 'rgba(15,23,42,.82)')}>
                <div>
                  <div style={{ fontSize: '.74rem', fontWeight: 900, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    Kampanyalarınız
                  </div>
                  <div style={{ marginTop: 6, color: '#cbd5e1', fontSize: '.8rem', lineHeight: 1.5 }}>
                    Kasada uygulanmasını istediğiniz kampanyayı seçin. Seçim zorunlu değildir.
                  </div>
                </div>

                {campaignsLoading ? (
                  <div style={{ color: '#94a3b8', fontSize: '.82rem', textAlign: 'center', padding: '8px 0' }}>
                    <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />
                    Kampanyalar yükleniyor...
                  </div>
                ) : campaignsError ? (
                  <div style={{ color: '#fca5a5', fontSize: '.8rem' }}>{campaignsError}</div>
                ) : campaignList.length === 0 ? (
                  <div style={{ color: '#64748b', fontSize: '.8rem', lineHeight: 1.6 }}>
                    Bu kasa için size özel tanımlanmış kampanya bulunamadı.
                    Genel kampanyalar otomatik olarak değerlendirilecek.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {campaignList.map(c => {
                      const isSelected = selectedCampaignId === String(c.id)
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggleCampaign(c)}
                          style={{
                            textAlign: 'left',
                            borderRadius: 14,
                            border: `1px solid ${isSelected ? 'rgba(251,191,36,.5)' : 'rgba(148,163,184,.14)'}`,
                            background: isSelected ? 'rgba(245,158,11,.14)' : 'rgba(15,23,42,.6)',
                            color: '#fff',
                            padding: '12px 14px',
                            cursor: 'pointer',
                            display: 'grid',
                            gap: 5,
                          }}
                        >
                          <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{
                              width: 18, height: 18, borderRadius: 999, flexShrink: 0,
                              border: `2px solid ${isSelected ? '#fbbf24' : 'rgba(148,163,184,.3)'}`,
                              background: isSelected ? '#fbbf24' : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {isSelected && <i className="fa-solid fa-check" style={{ color: '#111827', fontSize: '.55rem' }} />}
                            </span>
                            {c.name || 'Kampanya'}
                          </div>
                          {c.offer?.offerLabel ? (
                            <div style={{ color: '#fbbf24', fontSize: '.78rem', paddingLeft: 26 }}>{c.offer.offerLabel}</div>
                          ) : null}
                          {c.description ? (
                            <div style={{ color: '#94a3b8', fontSize: '.76rem', lineHeight: 1.45, paddingLeft: 26 }}>{c.description}</div>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                )}

                {selectedCampaignId && (
                  <div style={{ fontSize: '.76rem', color: '#a7f3d0', padding: '8px 12px', borderRadius: 10, background: 'rgba(20,83,45,.18)', border: '1px solid rgba(34,197,94,.2)' }}>
                    <i className="fa-solid fa-star" style={{ color: '#fbbf24', marginRight: 6, fontSize: '.7rem' }} />
                    <strong>{selectedCampaignName}</strong> seçildi. Ödeme adımında öncelikli olarak değerlendirilecek.
                  </div>
                )}
              </div>
            )}

            {/* Kasa bağlantısı durumu */}
            {loading ? (
              <div style={card()}>
                <div style={{ textAlign: 'center', color: '#94a3b8' }}>Kasa bağlantısı yükleniyor...</div>
              </div>
            ) : session && !isLinked ? (
              <div style={card('rgba(96,165,250,.2)', 'rgba(15,23,42,.7)')}>
                <div style={{ fontSize: '.7rem', fontWeight: 900, color: '#7dd3fc', textTransform: 'uppercase' }}>Kasa</div>
                <div style={{ fontWeight: 900 }}>{session.registerLabel || 'POS'}</div>
                <div style={{ color: '#94a3b8', fontSize: '.8rem' }}>{session.branchName || 'Şube bilgisi yok'}</div>
              </div>
            ) : null}

            {/* Bağlan butonu */}
            {activeCustomer && routeToken && (
              <button type="button" onClick={connectCustomer} disabled={linking}
                style={{ minHeight: 52, borderRadius: 14, border: 'none', background: linking ? 'rgba(255,255,255,.08)' : 'linear-gradient(135deg,#f59e0b,#fbbf24)', color: linking ? '#64748b' : '#111827', fontWeight: 900, fontSize: '1rem', cursor: linking ? 'not-allowed' : 'pointer' }}>
                {linking ? 'Bağlanıyor...' : selectedCampaignId ? `Hesabımı Bağla — ${selectedCampaignName}` : 'Hesabımı Bağla'}
              </button>
            )}
          </>
        )}

        {/* Durum/hata mesajları */}
        {statusText ? (
          <div style={{ padding: '10px 14px', borderRadius: 14, background: 'rgba(20,83,45,.2)', border: '1px solid rgba(34,197,94,.2)', color: '#bbf7d0', fontWeight: 800, fontSize: '.82rem' }}>
            {statusText}
          </div>
        ) : null}

        {errorText ? (
          <div style={{ padding: '10px 14px', borderRadius: 14, background: 'rgba(127,29,29,.22)', border: '1px solid rgba(248,113,113,.22)', color: '#fecaca', fontWeight: 800, fontSize: '.82rem' }}>
            {errorText}
          </div>
        ) : null}

        {/* Alt bilgi */}
        <div style={{ textAlign: 'center', color: '#334155', fontSize: '.72rem', paddingTop: 8, paddingBottom: 20, lineHeight: 1.6 }}>
          Hesabınız bu cihazda geçici olarak hatırlanır.
          {activeCustomer ? (
            <button type="button" onClick={clearRememberedCustomer}
              style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '.72rem', textDecoration: 'underline', marginLeft: 4 }}>
              Temizle
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
