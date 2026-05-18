import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  linkCustomerToKioskSession,
  readKioskLoyaltyLinkSession,
  selectCampaignInKioskLoyaltySession,
} from '@/lib/kioskSettings'
import {
  evaluateRuntimeOrderCampaigns,
  loadRuntimeLoyaltyCampaignCatalog,
} from '@/lib/posLoyalty'
import { loadCustomerLoyaltyCategoryIds } from '@/lib/posCustomerLink'
import { db } from '@/lib/db'

export default function KioskLoyaltyLink() {
  const { token } = useParams()
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [phone, setPhone] = useState('')
  const [matches, setMatches] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [status, setStatus] = useState('')
  const [errorText, setErrorText] = useState('')
  const [linking, setLinking] = useState(false)
  const [linked, setLinked] = useState(false)

  // Kampanya seçimi
  const [campaignList, setCampaignList] = useState([])
  const [campaignsLoading, setCampaignsLoading] = useState(false)
  const [selectedCampaignId, setSelectedCampaignId] = useState('')
  const [selectedCampaignName, setSelectedCampaignName] = useState('')
  const [customerCategoryIds, setCustomerCategoryIds] = useState([])

  useEffect(() => {
    let ignore = false
    ;(async () => {
      const next = await readKioskLoyaltyLinkSession(token)
      if (!ignore) {
        setSession(next)
        setLoading(false)
      }
    })()
    return () => { ignore = true }
  }, [token])

  // Müşteri seçilince kampanyaları yükle
  useEffect(() => {
    if (!selectedCustomer?.id || !session) return
    if (!session.branchId && !session.branchName) return
    loadPersonalCampaigns()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomer?.id, session?.token])

  async function loadPersonalCampaigns() {
    setCampaignsLoading(true)
    setCampaignList([])
    try {
      const [catalog, categoryIds] = await Promise.all([
        loadRuntimeLoyaltyCampaignCatalog({ branchId: session.branchId, branchName: session.branchName }),
        loadCustomerLoyaltyCategoryIds({ branchId: session.branchId, branchName: session.branchName }, selectedCustomer.id),
      ])
      setCustomerCategoryIds(categoryIds || [])
      const evaluated = evaluateRuntimeOrderCampaigns(catalog.campaigns || [], {
        runtimeChannel: 'kiosk',
        customerContext: {
          customerId: String(selectedCustomer.id),
          customerName: selectedCustomer.ad_soyad || '',
          customerCategoryIds: categoryIds || [],
        },
      })
      const personal = evaluated.visibleCampaigns.filter(
        c => c.audienceType !== 'all' && c.audienceMatched && c.audienceSupported,
      )
      setCampaignList(personal)
    } catch {
      // Sessizce devam et
    } finally {
      setCampaignsLoading(false)
    }
  }

  async function search() {
    const cleaned = phone.replace(/\D/g, '')
    if (!cleaned) return
    const { data } = await db
      .from('musteriler')
      .select('id,ad_soyad,telefon,telefon_ulke')
      .is('deleted_at', null)
      .like('telefon', `%${cleaned}%`)
      .limit(10)
    setMatches(data || [])
    if (!data?.length) setErrorText('Eşleşen müşteri bulunamadı.')
    else setErrorText('')
  }

  function pickCustomer(customer) {
    setSelectedCustomer(customer)
    setMatches([])
    setSelectedCampaignId('')
    setSelectedCampaignName('')
    setCustomerCategoryIds([])
    setStatus('')
    setErrorText('')
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

  async function connect() {
    if (!selectedCustomer) return
    setLinking(true)
    setErrorText('')
    try {
      if (selectedCampaignId) {
        await selectCampaignInKioskLoyaltySession(token, { campaignId: selectedCampaignId, campaignName: selectedCampaignName })
      }
      await linkCustomerToKioskSession(token, selectedCustomer, { customerCategoryIds })
      setLinked(true)
      setStatus(`${selectedCustomer.ad_soyad} hesabı kiyoska bağlandı${selectedCampaignName ? ` — ${selectedCampaignName}` : ''}.`)
    } catch (err) {
      setErrorText(err?.message || 'Bağlantı başarısız.')
    } finally {
      setLinking(false)
    }
  }

  if (loading) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#020617', color: '#cbd5e1' }}>Yükleniyor...</div>
  }

  if (!session) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#020617', color: '#fca5a5', padding: 24, textAlign: 'center' }}>Bu QR oturumu bulunamadı veya süresi doldu.</div>
  }

  if (linked) {
    return (
      <div style={{ minHeight: '100svh', background: 'linear-gradient(180deg,#020617,#0f172a)', color: '#f8fafc', display: 'grid', placeItems: 'center', padding: 20 }}>
        <div style={{ width: 'min(400px, 100%)', display: 'grid', gap: 16, textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 999, background: 'rgba(34,197,94,.2)', border: '1px solid rgba(34,197,94,.36)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', color: '#34d399', margin: '0 auto' }}>
            <i className="fa-solid fa-check" />
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 900 }}>Bağlandı</div>
          <div style={{ color: '#86efac', fontWeight: 800 }}>{selectedCustomer?.ad_soyad}</div>
          {selectedCampaignName ? (
            <div style={{ padding: '10px 14px', borderRadius: 14, background: 'rgba(245,158,11,.12)', border: '1px solid rgba(251,191,36,.28)', color: '#fde68a', fontWeight: 800 }}>
              ★ {selectedCampaignName}
            </div>
          ) : null}
          <div style={{ color: '#94a3b8', fontSize: '.84rem', lineHeight: 1.6 }}>
            Kiyosk ekranından siparişinize devam edebilirsiniz.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100svh', background: 'linear-gradient(180deg,#020617,#0f172a)', color: '#f8fafc', padding: '20px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: 420, display: 'grid', gap: 14 }}>

        {/* Başlık */}
        <div style={{ textAlign: 'center', paddingTop: 12, paddingBottom: 4 }}>
          <div style={{ fontSize: '.68rem', fontWeight: 900, letterSpacing: '.14em', textTransform: 'uppercase', color: '#fbbf24' }}>Kiyosk Sadakat</div>
          <div style={{ marginTop: 8, fontSize: '1.4rem', fontWeight: 900 }}>Hesabınızı Bağlayın</div>
          <div style={{ marginTop: 6, color: '#94a3b8', fontSize: '.82rem' }}>{session.branchName || 'Şube'} • {session.kioskStationName || 'Kiyosk'}</div>
        </div>

        {/* Müşteri arama */}
        {!selectedCustomer && (
          <div style={{ borderRadius: 20, border: '1px solid rgba(148,163,184,.16)', background: 'rgba(15,23,42,.80)', padding: 18, display: 'grid', gap: 14 }}>
            <div style={{ fontSize: '.74rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase' }}>Telefon ile Ara</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && search()}
                placeholder="Telefon numaranız"
                style={{ flex: 1, minHeight: 48, borderRadius: 12, border: '1px solid rgba(148,163,184,.16)', background: 'rgba(15,23,42,.95)', color: '#fff', padding: '0 14px' }}
              />
              <button onClick={search} style={{ minHeight: 48, padding: '0 18px', borderRadius: 12, border: 'none', background: '#f59e0b', color: '#111827', fontWeight: 900, cursor: 'pointer' }}>Ara</button>
            </div>
            {errorText && <div style={{ color: '#fca5a5', fontSize: '.8rem' }}>{errorText}</div>}
            <div style={{ display: 'grid', gap: 10 }}>
              {matches.map(customer => (
                <button key={customer.id} onClick={() => pickCustomer(customer)}
                  style={{ borderRadius: 16, border: '1px solid rgba(148,163,184,.12)', background: 'rgba(15,23,42,.82)', color: '#fff', padding: '12px 14px', textAlign: 'left', cursor: 'pointer' }}>
                  <div style={{ fontWeight: 800 }}>{customer.ad_soyad}</div>
                  <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>{customer.telefon_ulke || ''}{customer.telefon || ''}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Seçili müşteri */}
        {selectedCustomer && (
          <div style={{ borderRadius: 20, border: '1px solid rgba(56,189,248,.22)', background: 'rgba(8,47,73,.36)', padding: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: '.68rem', fontWeight: 900, color: '#7dd3fc', textTransform: 'uppercase' }}>Seçili Hesap</div>
              <div style={{ marginTop: 4, fontWeight: 900, fontSize: '1rem' }}>{selectedCustomer.ad_soyad}</div>
              <div style={{ color: '#94a3b8', fontSize: '.8rem', marginTop: 3 }}>{selectedCustomer.telefon_ulke || ''}{selectedCustomer.telefon || ''}</div>
            </div>
            <button onClick={() => { setSelectedCustomer(null); setCampaignList([]); setSelectedCampaignId(''); setSelectedCampaignName(''); setCustomerCategoryIds([]) }}
              style={{ minHeight: 36, padding: '0 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.06)', color: '#94a3b8', fontWeight: 800, fontSize: '.76rem', cursor: 'pointer', flexShrink: 0 }}>
              Değiştir
            </button>
          </div>
        )}

        {/* Kampanya Seçimi */}
        {selectedCustomer && (
          <div style={{ borderRadius: 20, border: '1px solid rgba(251,191,36,.2)', background: 'rgba(15,23,42,.82)', padding: 18, display: 'grid', gap: 14 }}>
            <div>
              <div style={{ fontSize: '.74rem', fontWeight: 900, color: '#fbbf24', textTransform: 'uppercase' }}>Kampanyalarınız</div>
              <div style={{ marginTop: 6, color: '#cbd5e1', fontSize: '.8rem', lineHeight: 1.5 }}>
                İsterseniz bir kampanya seçin. Seçim zorunlu değildir.
              </div>
            </div>

            {campaignsLoading ? (
              <div style={{ color: '#94a3b8', fontSize: '.82rem', textAlign: 'center' }}>
                <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />
                Yükleniyor...
              </div>
            ) : campaignList.length === 0 ? (
              <div style={{ color: '#64748b', fontSize: '.8rem', lineHeight: 1.6 }}>
                Size özel kampanya bulunamadı. Genel kampanyalar değerlendirilecek.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {campaignList.map(c => {
                  const isSelected = selectedCampaignId === String(c.id)
                  return (
                    <button key={c.id} type="button" onClick={() => toggleCampaign(c)}
                      style={{
                        textAlign: 'left', borderRadius: 14,
                        border: `1px solid ${isSelected ? 'rgba(251,191,36,.5)' : 'rgba(148,163,184,.14)'}`,
                        background: isSelected ? 'rgba(245,158,11,.14)' : 'rgba(15,23,42,.6)',
                        color: '#fff', padding: '12px 14px', cursor: 'pointer', display: 'grid', gap: 5,
                      }}>
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
                      {c.offer?.offerLabel && <div style={{ color: '#fbbf24', fontSize: '.78rem', paddingLeft: 26 }}>{c.offer.offerLabel}</div>}
                      {c.description && <div style={{ color: '#94a3b8', fontSize: '.76rem', paddingLeft: 26 }}>{c.description}</div>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Bağlan butonu */}
        {selectedCustomer && (
          <button onClick={connect} disabled={linking}
            style={{ minHeight: 52, borderRadius: 14, border: 'none', background: linking ? 'rgba(255,255,255,.08)' : 'linear-gradient(135deg,#f59e0b,#fbbf24)', color: linking ? '#64748b' : '#111827', fontWeight: 900, fontSize: '1rem', cursor: linking ? 'not-allowed' : 'pointer' }}>
            {linking ? 'Bağlanıyor...' : selectedCampaignId ? `Bağla — ${selectedCampaignName}` : 'Kiyoska Bağla'}
          </button>
        )}

        {status && (
          <div style={{ padding: '10px 14px', borderRadius: 14, background: 'rgba(20,83,45,.2)', border: '1px solid rgba(34,197,94,.2)', color: '#bbf7d0', fontWeight: 800, fontSize: '.82rem' }}>
            {status}
          </div>
        )}

        {errorText && !matches.length && (
          <div style={{ padding: '10px 14px', borderRadius: 14, background: 'rgba(127,29,29,.22)', border: '1px solid rgba(248,113,113,.22)', color: '#fecaca', fontWeight: 800, fontSize: '.82rem' }}>
            {errorText}
          </div>
        )}
      </div>
    </div>
  )
}
