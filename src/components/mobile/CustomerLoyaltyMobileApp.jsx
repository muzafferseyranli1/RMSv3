import { useEffect, useMemo, useState } from 'react'
import { loadCustomerAppConfig, getDefaultAppConfig } from '@/lib/customerMobileAppConfig'
import {
  buildCustomerMobileViewModel,
  bindCouponToCustomer,
  formatMobileDate,
  formatMobileMoney,
  formatMobileNumber,
  formatMobileRelativeDateLabel,
  loadCustomerMobileSnapshot,
  loadCustomerRoster,
  pickDefaultCustomer,
  getActiveReferralPrograms,
  checkReferralEligibility,
  generateReferralCode,
  validateReferralCode,
  applyReferralCode,
  getReferrerCodes,
  registerCustomer,
} from '@/lib/mobileCustomerApp'
import {
  clearStoredMobileCustomer,
  normalizeStoredMobileCustomer,
  readStoredMobileCustomer,
  searchMobileCustomers,
  writeStoredMobileCustomer,
} from '@/lib/mobileCustomerIdentity'
import {
  linkCustomerToPosLoyaltySession,
  loadCustomerLoyaltyCategoryIds,
  readPosLoyaltyLinkSession,
  selectCampaignInPosLoyaltySession,
} from '@/lib/posCustomerLink'
import {
  linkCustomerToKioskSession,
  readKioskLoyaltyLinkSession,
  selectCampaignInKioskLoyaltySession,
} from '@/lib/kioskSettings'

const TAB_ITEMS = [
  { key: 'home', label: 'Ana Sayfa', icon: 'fa-house' },
  { key: 'card', label: 'Kartim', icon: 'fa-id-card' },
  { key: 'coupons', label: 'Kuponlarim', icon: 'fa-ticket' },
  { key: 'campaigns', label: 'Kampanyalar', icon: 'fa-bullhorn' },
  { key: 'account', label: 'Hesabim', icon: 'fa-user' },
]

const ACCOUNT_VIEWS = [
  { key: 'activity', label: 'Puan ve Hareketler' },
  { key: 'tier', label: 'Seviye / Tier' },
  { key: 'profile', label: 'Profil' },
]

function cardStyle(background = '#fff', border = 'rgba(148,163,184,.16)') {
  return {
    borderRadius: 20,
    border: `1px solid ${border}`,
    background,
    boxShadow: '0 16px 36px rgba(15,23,42,.06)',
  }
}

function badgeStyle(background, color) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    borderRadius: 999,
    background,
    color,
    fontSize: '.72rem',
    fontWeight: 800,
  }
}

function getCouponStatusMeta(status) {
  switch (status) {
    case 'reserved': return { label: 'Ayrildi', background: '#eff6ff', color: '#1d4ed8' }
    case 'used': return { label: 'Kullanildi', background: '#f1f5f9', color: '#475569' }
    case 'expired': return { label: 'Suresi doldu', background: '#fff7ed', color: '#c2410c' }
    case 'cancelled': return { label: 'Iptal', background: '#fef2f2', color: '#b91c1c' }
    default: return { label: 'Kullanima hazir', background: '#ecfdf5', color: '#166534' }
  }
}

function getCampaignBucketLabel(bucket) {
  switch (bucket) {
    case 'personalized': return 'Sana ozel'
    case 'upcoming': return 'Yakinda'
    case 'ending': return 'Bitmek uzere'
    default: return 'Herkese acik'
  }
}

function getTransactionLabel(type) {
  switch (type) {
    case 'earn': return 'Puan kazanimi'
    case 'burn': return 'Puan kullanimi'
    case 'campaign_bonus': return 'Kampanya bonusu'
    case 'welcome_bonus': return 'Hos geldin bonusu'
    case 'birthday_bonus': return 'Dogum gunu bonusu'
    case 'frequency_reward': return 'Frekans odulu'
    case 'card_load': return 'Bakiye yukleme'
    case 'card_spend': return 'Bakiye harcama'
    default: return type || 'Sadakat hareketi'
  }
}

function getTransactionValue(item) {
  if (item.wallet_type === 'stored_value') {
    const amount = Number(item.monetary_amount || 0)
    return {
      text: `${amount > 0 ? '+' : ''}${formatMobileMoney(amount)} TL`,
      color: amount > 0 ? '#166534' : amount < 0 ? '#b91c1c' : '#475569',
    }
  }
  const delta = Number(item.points_delta || 0)
  return {
    text: `${delta > 0 ? '+' : ''}${formatMobileNumber(delta)} puan`,
    color: delta > 0 ? '#166534' : delta < 0 ? '#b91c1c' : '#475569',
  }
}

function buildQrMatrix(seed) {
  const chars = String(seed || 'RMSLOYALTY').split('')
  return Array.from({ length: 11 }, (_, row) => (
    Array.from({ length: 11 }, (_, col) => {
      const char = chars[(row * 5 + col * 3) % chars.length] || 'R'
      const value = char.charCodeAt(0) + row * 13 + col * 17
      const finder = (
        (row < 3 && col < 3) ||
        (row < 3 && col > 7) ||
        (row > 7 && col < 3)
      )
      return finder || value % 4 <= 1
    })
  ))
}

function SummaryTile({ label, value, hint, color = '#0f172a' }) {
  return (
    <div style={{ ...cardStyle('#fff'), padding: 14, display: 'grid', gap: 6 }}>
      <div style={{ fontSize: '.72rem', color: '#64748b', fontWeight: 800 }}>{label}</div>
      <div style={{ fontSize: '1.1rem', color, fontWeight: 900 }}>{value}</div>
      {hint ? <div style={{ fontSize: '.72rem', color: '#94a3b8', lineHeight: 1.5 }}>{hint}</div> : null}
    </div>
  )
}

function CouponCard({ coupon }) {
  const statusMeta = getCouponStatusMeta(coupon.status)
  return (
    <div style={{ ...cardStyle('#fff'), padding: 14, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 900, color: '#0f172a' }}>{coupon.seriesName}</div>
          <div style={{ marginTop: 4, color: '#f97316', fontWeight: 800, fontSize: '.82rem' }}>{coupon.benefitText}</div>
        </div>
        <span style={badgeStyle(statusMeta.background, statusMeta.color)}>{statusMeta.label}</span>
      </div>
      <div style={{ color: '#475569', fontSize: '.78rem', lineHeight: 1.6 }}>{coupon.ruleText}</div>
      <div style={{ display: 'grid', gap: 4, color: '#64748b', fontSize: '.76rem' }}>
        <div>Kanal: {coupon.channelLabel}</div>
        <div>Tarih: {formatMobileDate(coupon.issuedAt, { day: '2-digit', month: 'short' })}</div>
        <div>Son kullanim: {formatMobileDate(coupon.expiresAt, { day: '2-digit', month: 'short' })}</div>
      </div>
    </div>
  )
}

function CampaignCard({ campaign }) {
  return (
    <div style={{ ...cardStyle('#fff'), padding: 14, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 900, color: '#0f172a' }}>{campaign.name || 'Kampanya'}</div>
          <div style={{ marginTop: 4, color: '#64748b', fontSize: '.78rem', lineHeight: 1.55 }}>
            {campaign.description || 'Sadakat programina bagli kampanya.'}
          </div>
        </div>
        <span style={badgeStyle(campaign.personalized ? '#fee2e2' : '#eff6ff', campaign.personalized ? '#be123c' : '#1d4ed8')}>
          {getCampaignBucketLabel(campaign.bucket)}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span style={badgeStyle('rgba(15,23,42,.06)', '#475569')}>
          <i className="fa-solid fa-store" />
          {campaign.mobileEligible ? 'Mobil uyumlu' : 'Kanal sinirli'}
        </span>
        <span style={badgeStyle('rgba(15,23,42,.06)', '#475569')}>
          <i className="fa-solid fa-clock" />
          {campaign.activeNow ? 'Aktif' : 'Planli'}
        </span>
      </div>
      <div style={{ color: '#64748b', fontSize: '.76rem' }}>
        Baslangic: {formatMobileDate(campaign.startsAt, { day: '2-digit', month: 'short' })} •
        Bitis: {formatMobileDate(campaign.endsAt, { day: '2-digit', month: 'short' })}
      </div>
    </div>
  )
}

function LinkSelectionPill({ active, label, meta, onClick, accent = '#fb7185' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        borderRadius: 16,
        border: `1px solid ${active ? `${accent}55` : 'rgba(148,163,184,.18)'}`,
        background: active ? `${accent}12` : '#fff',
        padding: '12px 12px',
        textAlign: 'left',
        display: 'grid',
        gap: 4,
        cursor: 'pointer',
      }}
    >
      <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '.8rem' }}>{label}</div>
      {meta ? <div style={{ color: '#64748b', fontSize: '.72rem', lineHeight: 1.5 }}>{meta}</div> : null}
    </button>
  )
}

function LinkBanner({
  sessionState,
  selectionState,
  onSelectCampaign,
  onSelectCoupon,
  onConnect,
}) {
  if (!sessionState?.session && !sessionState?.loading && !sessionState?.errorText) return null

  if (sessionState.loading) {
    return (
      <div style={{ ...cardStyle('rgba(255,255,255,.96)', 'rgba(148,163,184,.16)'), padding: 12, color: '#475569', fontSize: '.78rem' }}>
        <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />
        Baglanti oturumu okunuyor...
      </div>
    )
  }

  if (sessionState.errorText) {
    return (
      <div style={{ ...cardStyle('rgba(254,242,242,.96)', 'rgba(248,113,113,.24)'), padding: 12, color: '#991b1b', fontSize: '.78rem', lineHeight: 1.6 }}>
        {sessionState.errorText}
      </div>
    )
  }

  const session = sessionState.session
  const isKiosk = sessionState.channel === 'kiosk'
  const label = isKiosk
    ? (session.kioskStationName || 'Kiosk')
    : (session.registerLabel || 'POS')
  const linked = session.status === 'linked'
  const selectedCampaign = selectionState?.campaigns.find(item => String(item.id) === String(selectionState.selectedCampaignId || '')) || null
  const selectedCoupon = selectionState?.coupons.find(item => (
    String(item.code || '').toUpperCase() === String(selectionState.selectedCouponId || '').toUpperCase()
    || String(item.id || '') === String(selectionState.selectedCouponId || '')
  )) || null
  const expiresLabel = session?.expiresAt
    ? formatMobileDate(session.expiresAt, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })
    : '-'

  return (
    <div style={{ ...cardStyle(linked ? 'rgba(236,253,245,.96)' : 'rgba(255,247,237,.96)', linked ? 'rgba(34,197,94,.24)' : 'rgba(251,191,36,.24)'), padding: 14, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '.7rem', fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase', color: linked ? '#15803d' : '#c2410c' }}>
            {isKiosk ? 'Kiosk baglantisi' : 'POS baglantisi'}
          </div>
          <div style={{ marginTop: 4, fontWeight: 900, color: '#0f172a' }}>{label}</div>
          <div style={{ marginTop: 4, fontSize: '.76rem', color: '#64748b' }}>{session.branchName || 'Sube'}</div>
        </div>
        <span style={badgeStyle(linked ? '#dcfce7' : '#ffedd5', linked ? '#166534' : '#c2410c')}>
          {linked ? 'Tanitildi' : 'Bekliyor'}
        </span>
      </div>
      <div style={{ color: '#475569', fontSize: '.78rem', lineHeight: 1.6 }}>
        {sessionState.statusText || (
          linked
            ? 'Bu cihazdaki hesap oturuma tanitildi. Siparise kiosk ya da kasadan devam edebilirsiniz.'
            : 'Bu QR, kiosk veya POS tarafinda uretilir; kamera kullanmadan telefonunda acilir. Buradan hesabinizi tanitip hangi avantajla devam edeceginizi secebilirsiniz.'
        )}
      </div>
      {!linked ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ ...cardStyle('rgba(255,255,255,.82)', 'rgba(251,191,36,.16)'), padding: 12, display: 'grid', gap: 8 }}>
            <div style={{ fontWeight: 900, color: '#0f172a' }}>Oturum ozeti</div>
            <div style={{ display: 'grid', gap: 4, color: '#475569', fontSize: '.76rem', lineHeight: 1.55 }}>
              <div>Sube: <strong>{session.branchName || 'Sube'}</strong></div>
              <div>Hedef: <strong>{label}</strong></div>
              <div>Kanal: <strong>{isKiosk ? 'Kiosk' : 'POS / Kasa'}</strong></div>
              <div>Son gecerlilik: <strong>{expiresLabel}</strong></div>
            </div>
          </div>

          {selectionState?.campaigns?.length ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontWeight: 900, color: '#0f172a', fontSize: '.82rem' }}>Bu baglanti icin kampanya sec</div>
              <div style={{ color: '#64748b', fontSize: '.74rem', lineHeight: 1.55 }}>
                Secim zorunlu degil. Kiosk veya POS kamerayla QR okumaz; bu secim telefondan oturuma yazilir.
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <LinkSelectionPill
                  active={!selectionState.selectedCampaignId}
                  label="Kampanya secmeden devam et"
                  meta="Kasada veya kioskte genel uygunluk kurallari degerlendirilir."
                  onClick={() => onSelectCampaign('')}
                  accent="#f97316"
                />
                {selectionState.campaigns.slice(0, 4).map(campaign => (
                  <LinkSelectionPill
                    key={campaign.id}
                    active={String(selectionState.selectedCampaignId || '') === String(campaign.id)}
                    label={campaign.name || 'Kampanya'}
                    meta={`${campaign.personalized ? 'Sana ozel' : 'Genel'} • ${campaign.description || 'Siparis sirasinda uygulanabilir kampanya'}`}
                    onClick={() => onSelectCampaign(String(campaign.id))}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {selectionState?.coupons?.length ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontWeight: 900, color: '#0f172a', fontSize: '.82rem' }}>Kupon ekle</div>
              <div style={{ display: 'grid', gap: 8 }}>
                <LinkSelectionPill
                  active={!selectionState.selectedCouponId}
                  label="Kupon secmeden devam et"
                  meta="Kuponu sonra kasada veya kioskte ayrica kullanabilirsin."
                  onClick={() => onSelectCoupon('')}
                  accent="#ea580c"
                />
                {selectionState.coupons.slice(0, 4).map(coupon => (
                  <LinkSelectionPill
                    key={coupon.id}
                    active={
                      String(selectionState.selectedCouponId || '').toUpperCase() === String(coupon.code || '').toUpperCase()
                      || String(selectionState.selectedCouponId || '') === String(coupon.id || '')
                    }
                    label={`${coupon.seriesName} ${coupon.code ? `• ${coupon.code}` : ''}`}
                    meta={`${coupon.benefitText} • ${coupon.channelLabel}`}
                    onClick={() => onSelectCoupon(String(coupon.code || coupon.id || ''))}
                    accent="#ea580c"
                  />
                ))}
              </div>
            </div>
          ) : null}

          {(selectedCampaign || selectedCoupon) ? (
            <div style={{ ...cardStyle('rgba(255,255,255,.82)', 'rgba(251,191,36,.18)'), padding: 12, display: 'grid', gap: 6 }}>
              <div style={{ fontWeight: 900, color: '#0f172a', fontSize: '.8rem' }}>Bu oturuma yazilacak secim</div>
              <div style={{ color: '#475569', fontSize: '.76rem', lineHeight: 1.55 }}>
                {selectedCampaign ? `Kampanya: ${selectedCampaign.name || 'Kampanya'}` : 'Kampanya secilmedi'}
                <br />
                {selectedCoupon ? `Kupon: ${selectedCoupon.code || selectedCoupon.seriesName}` : 'Kupon secilmedi'}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {!linked ? (
        <button
          type="button"
          onClick={onConnect}
          disabled={sessionState.linking}
          style={{
            minHeight: 42,
            borderRadius: 14,
            border: 'none',
            background: 'linear-gradient(135deg,#f97316,#fb7185)',
            color: '#fff',
            fontWeight: 900,
            cursor: sessionState.linking ? 'wait' : 'pointer',
            opacity: sessionState.linking ? 0.7 : 1,
          }}
        >
          {sessionState.linking ? 'Hesap tanitiliyor...' : (isKiosk ? 'Kioska hesabimi tanit' : 'Kasaya hesabimi tanit')}
        </button>
      ) : null}
    </div>
  )
}

function MobileHomeDashboard({ model, appConfig, onNavigate, onOrderAction }) {
  const { branding, homeButtons } = appConfig
  const bgImage = branding.backgroundImageUrl
  const logo = branding.logoUrl
  const primaryColor = branding.primaryColor || '#be185d'
  const bodyBgColor = branding.bodyBackgroundColor || '#f8fafc'
  const bodyBgImage = branding.bodyBackgroundImageUrl

  function handleButtonPress(btn) {
    switch (btn.type) {
      case 'phone':
        if (btn.config?.phoneNumber) window.open(`tel:${btn.config.phoneNumber}`, '_self')
        break
      case 'weblink':
        if (btn.config?.url) window.open(btn.config.url, '_blank')
        break
      case 'order':
        onOrderAction(btn)
        break
      case 'app_page':
        if (btn.config?.pageKey) onNavigate(btn.config.pageKey)
        break
      default:
        break
    }
  }

  return (
    <div style={{ display: 'grid', gap: 0 }}>
      {/* Hero area with background image, logo, welcome */}
      <div style={{
        position: 'relative',
        minHeight: 260,
        background: bgImage
          ? `linear-gradient(180deg, rgba(0,0,0,.45) 0%, rgba(0,0,0,.65) 100%), url(${bgImage}) center/cover no-repeat`
          : `linear-gradient(150deg, ${branding.headerGradient?.[0] || '#111827'} 0%, ${branding.headerGradient?.[1] || '#312e81'} 45%, ${branding.headerGradient?.[2] || '#f97316'} 100%)`,
        borderRadius: '0 0 28px 28px',
        padding: '20px 20px 24px',
        display: 'grid',
        gap: 12,
        alignContent: 'end',
        color: '#fff',
      }}>
        {/* Top row: points badge + QR icon */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'absolute', top: 16, left: 20, right: 20 }}>
          <div style={{
            display: 'flex', gap: 8, alignItems: 'center',
          }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 999,
              background: 'rgba(255,255,255,.18)', backdropFilter: 'blur(8px)',
              color: '#fff', fontSize: '.74rem', fontWeight: 800,
            }}>
              <i className="fa-solid fa-star" style={{ color: '#fbbf24' }} />
              {model.pointBalance > 0 ? `${model.pointBalance} Puan` : 'Sadakat'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button type="button" style={{ width: 38, height: 38, borderRadius: 12, border: 'none', background: 'rgba(255,255,255,.15)', backdropFilter: 'blur(8px)', color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
              <i className="fa-solid fa-qrcode" />
            </button>
          </div>
        </div>

        {/* Logo */}
        {logo ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 32 }}>
            <img src={logo} alt={branding.companyName || ''} style={{ maxHeight: 72, maxWidth: 180, objectFit: 'contain', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,.3))' }} />
          </div>
        ) : branding.companyName ? (
          <div style={{ textAlign: 'center', paddingTop: 32, fontSize: '1.6rem', fontWeight: 900, textShadow: '0 2px 8px rgba(0,0,0,.4)' }}>
            {branding.companyName}
          </div>
        ) : null}

        {/* Welcome banner */}
        <div style={{
          borderRadius: 14,
          background: primaryColor,
          padding: '10px 18px',
          textAlign: 'center',
          fontWeight: 800,
          fontSize: '.88rem',
          boxShadow: '0 4px 16px rgba(0,0,0,.25)',
        }}>
          {branding.welcomeText || 'Hoş Geldiniz'}, {model.displayName}
        </div>
      </div>

      {/* Body area with customizable background */}
      <div style={{
        background: bodyBgImage
          ? `url(${bodyBgImage}) center/cover no-repeat fixed`
          : bodyBgColor,
        minHeight: 'calc(100svh - 260px)',
      }}>
        {/* 4 Action Buttons - 2x2 grid */}
        <div style={{ padding: '20px 16px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {(homeButtons || []).slice(0, 4).map(btn => (
            <button
              key={btn.id}
              type="button"
              onClick={() => handleButtonPress(btn)}
              style={{
                minHeight: 120,
                borderRadius: 20,
                border: '1px solid rgba(148,163,184,.12)',
                background: 'linear-gradient(145deg, #1a1a2e, #16213e)',
                color: '#fff',
                display: 'grid',
                gap: 10,
                justifyItems: 'center',
                alignContent: 'center',
                padding: 16,
                cursor: 'pointer',
                boxShadow: '0 8px 24px rgba(0,0,0,.18)',
                transition: 'transform .15s ease, box-shadow .15s ease',
              }}
            >
              <span style={{
                width: 46, height: 46, borderRadius: 14,
                background: 'rgba(255,255,255,.1)',
                display: 'grid', placeItems: 'center',
                fontSize: '1.15rem',
              }}>
                <i className={`fa-solid ${btn.icon || 'fa-circle'}`} />
              </span>
              <span style={{ fontSize: '.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                {btn.label}
              </span>
            </button>
          ))}
        </div>

        {/* Quick summary tiles */}
        <div style={{ padding: '0 16px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div style={{ borderRadius: 16, background: 'rgba(255,255,255,.85)', backdropFilter: 'blur(8px)', border: '1px solid rgba(148,163,184,.12)', padding: '12px 10px', textAlign: 'center', boxShadow: '0 4px 12px rgba(15,23,42,.05)' }}>
            <div style={{ fontSize: '.68rem', color: '#64748b', fontWeight: 800 }}>Puan</div>
            <div style={{ marginTop: 4, fontSize: '1rem', fontWeight: 900, color: '#0f172a' }}>{model.pointBalance > 0 ? model.pointBalance : '0'}</div>
          </div>
          <div style={{ borderRadius: 16, background: 'rgba(255,255,255,.85)', backdropFilter: 'blur(8px)', border: '1px solid rgba(148,163,184,.12)', padding: '12px 10px', textAlign: 'center', boxShadow: '0 4px 12px rgba(15,23,42,.05)' }}>
            <div style={{ fontSize: '.68rem', color: '#64748b', fontWeight: 800 }}>Kupon</div>
            <div style={{ marginTop: 4, fontSize: '1rem', fontWeight: 900, color: '#0f172a' }}>{model.activeCoupons.length}</div>
          </div>
          <div style={{ borderRadius: 16, background: 'rgba(255,255,255,.85)', backdropFilter: 'blur(8px)', border: '1px solid rgba(148,163,184,.12)', padding: '12px 10px', textAlign: 'center', boxShadow: '0 4px 12px rgba(15,23,42,.05)' }}>
            <div style={{ fontSize: '.68rem', color: '#64748b', fontWeight: 800 }}>Seviye</div>
            <div style={{ marginTop: 4, fontSize: '.78rem', fontWeight: 900, color: '#7c3aed' }}>{model.tierSnapshot.currentTier?.name || 'Üyelik'}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function OrderTypeModal({ visible, onClose, orderButtonConfig }) {
  if (!visible) return null
  const deliveryUrl = orderButtonConfig?.config?.deliveryUrl || ''
  const enableTableOrder = orderButtonConfig?.config?.enableTableOrder !== false

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(15,23,42,.5)', display: 'grid', alignItems: 'end' }}>
      <div style={{ borderRadius: '24px 24px 0 0', background: '#fff', padding: '24px 20px 32px', display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 900, fontSize: '1.05rem', color: '#0f172a' }}>Sipariş Türü</div>
          <button type="button" onClick={onClose} style={{ width: 36, height: 36, borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
        <div style={{ color: '#64748b', fontSize: '.82rem', lineHeight: 1.6 }}>
          Siparişinizi nasıl almak istersiniz?
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          {deliveryUrl ? (
            <button
              type="button"
              onClick={() => { window.open(deliveryUrl, '_blank'); onClose() }}
              style={{
                minHeight: 64, borderRadius: 18, border: '1px solid rgba(148,163,184,.14)',
                background: 'linear-gradient(135deg, #f97316, #ea580c)',
                color: '#fff', fontWeight: 900, fontSize: '.88rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                boxShadow: '0 4px 16px rgba(249,115,22,.25)',
              }}
            >
              <i className="fa-solid fa-motorcycle" style={{ fontSize: '1.1rem' }} />
              Adrese Teslim
            </button>
          ) : null}
          {enableTableOrder ? (
            <button
              type="button"
              onClick={() => onClose('table_order')}
              style={{
                minHeight: 64, borderRadius: 18, border: '1px solid rgba(148,163,184,.14)',
                background: 'linear-gradient(135deg, #0f172a, #1e293b)',
                color: '#fff', fontWeight: 900, fontSize: '.88rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                boxShadow: '0 4px 16px rgba(15,23,42,.2)',
              }}
            >
              <i className="fa-solid fa-qrcode" style={{ fontSize: '1.1rem' }} />
              Masadan Sipariş
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function HomeScreen({ model, onOpen }) {
  const featuredCampaign = model.campaigns.find(item => item.bucket === 'personalized' && item.activeNow) || model.campaigns[0]
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ ...cardStyle('linear-gradient(150deg, #111827 0%, #312e81 45%, #f97316 100%)', 'rgba(255,255,255,.08)'), padding: 18, color: '#fff', display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '.76rem', letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.72)', fontWeight: 800 }}>
              Sadakat uyeligi aktif
            </div>
            <div style={{ marginTop: 8, fontSize: '1.34rem', fontWeight: 900 }}>Merhaba {model.displayName}</div>
            <div style={{ marginTop: 6, color: 'rgba(255,255,255,.82)', fontSize: '.82rem', lineHeight: 1.6 }}>
              Uygulamada gor, kasada kullan, kioska tanit, masada hesaba islet.
            </div>
          </div>
          <span style={badgeStyle('rgba(255,255,255,.14)', '#fff')}>
            <i className="fa-solid fa-crown" />
            {model.tierSnapshot.currentTier?.name || 'Uyelik'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
          <div>
            <div style={{ fontSize: '.72rem', color: 'rgba(255,255,255,.68)' }}>Puan</div>
            <div style={{ marginTop: 4, fontWeight: 900 }}>{formatMobileNumber(model.pointBalance)}</div>
          </div>
          <div>
            <div style={{ fontSize: '.72rem', color: 'rgba(255,255,255,.68)' }}>Bakiye</div>
            <div style={{ marginTop: 4, fontWeight: 900 }}>{formatMobileMoney(model.storedValueBalance)} TL</div>
          </div>
          <div>
            <div style={{ fontSize: '.72rem', color: 'rgba(255,255,255,.68)' }}>Kupon</div>
            <div style={{ marginTop: 4, fontWeight: 900 }}>{model.activeCoupons.length}</div>
          </div>
        </div>

        {featuredCampaign ? (
          <div style={{ ...cardStyle('rgba(255,255,255,.12)', 'rgba(255,255,255,.08)'), padding: 12 }}>
            <div style={{ fontSize: '.7rem', fontWeight: 900, color: '#fdba74', textTransform: 'uppercase', letterSpacing: '.08em' }}>
              One cikan kampanya
            </div>
            <div style={{ marginTop: 6, fontWeight: 900 }}>{featuredCampaign.name}</div>
            <div style={{ marginTop: 4, color: 'rgba(255,255,255,.8)', fontSize: '.76rem', lineHeight: 1.5 }}>
              {featuredCampaign.description || 'Sadakat uyelerine acik kampanya.'}
            </div>
          </div>
        ) : null}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
        {[
          { key: 'card', label: 'Kartim', icon: 'fa-id-card', color: '#1d4ed8' },
          { key: 'coupons', label: 'Kupon', icon: 'fa-ticket', color: '#ea580c' },
          { key: 'activity', label: 'Hareket', icon: 'fa-clock-rotate-left', color: '#047857' },
          { key: 'tier', label: 'Tier', icon: 'fa-layer-group', color: '#7c3aed' },
        ].map(action => (
          <button
            key={action.key}
            type="button"
            onClick={() => onOpen(action.key)}
            style={{ ...cardStyle('#fff'), border: 'none', padding: '14px 10px', display: 'grid', gap: 8, justifyItems: 'center', cursor: 'pointer' }}
          >
            <span style={{ width: 40, height: 40, borderRadius: 14, display: 'grid', placeItems: 'center', background: `${action.color}14`, color: action.color }}>
              <i className={`fa-solid ${action.icon}`} />
            </span>
            <span style={{ fontSize: '.7rem', fontWeight: 800, color: '#0f172a' }}>{action.label}</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <SummaryTile label="Mevcut seviye" value={model.tierSnapshot.currentTier?.name || 'Uyelik'} hint={model.tierSnapshot.remainingLabel} color="#7c3aed" />
        <SummaryTile label="Favori sube" value={model.homeBranchName} hint={`Son hareket: ${formatMobileRelativeDateLabel(model.latestActivityDate)}`} color="#1d4ed8" />
      </div>

      <div style={{ ...cardStyle('#fff'), padding: 14, display: 'grid', gap: 10 }}>
        <div style={{ fontWeight: 900, color: '#0f172a' }}>Hizli aksiyonlar</div>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ color: '#475569', fontSize: '.8rem' }}>QR ile hesabini kasada goster.</div>
          <div style={{ color: '#475569', fontSize: '.8rem' }}>Kioskta kampanyani baglayip siparise devam et.</div>
          <div style={{ color: '#475569', fontSize: '.8rem' }}>Masa/POS kanalinda kupon ve puan avantajlarini kullan.</div>
        </div>
      </div>
    </div>
  )
}

function CardScreen({ model }) {
  const matrix = buildQrMatrix(model.memberCode)
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ ...cardStyle('linear-gradient(145deg,#0f172a,#1e293b)', 'rgba(255,255,255,.08)'), padding: 18, color: '#fff', display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '.72rem', letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.7)', fontWeight: 800 }}>
              Sadakat kartim
            </div>
            <div style={{ marginTop: 8, fontSize: '1.2rem', fontWeight: 900 }}>{model.customer.ad_soyad || 'Musteri'}</div>
            <div style={{ marginTop: 4, color: 'rgba(255,255,255,.78)', fontSize: '.8rem' }}>
              {model.tierSnapshot.currentTier?.name || 'Uyelik seviyesi'}
            </div>
          </div>
          <span style={badgeStyle('rgba(255,255,255,.14)', '#fff')}>
            <i className="fa-solid fa-star" />
            {model.memberCode}
          </span>
        </div>

        <div style={{ display: 'grid', placeItems: 'center' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(11, 1fr)', gap: 4, padding: 12, borderRadius: 18, background: '#fff' }}>
            {matrix.flatMap((row, rowIndex) => row.map((active, colIndex) => (
              <span
                key={`${rowIndex}-${colIndex}`}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: active ? '#0f172a' : 'rgba(226,232,240,.8)',
                }}
              />
            )))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div style={{ fontSize: '.72rem', color: 'rgba(255,255,255,.7)' }}>Puan bakiyesi</div>
            <div style={{ marginTop: 4, fontWeight: 900 }}>{formatMobileNumber(model.pointBalance)} puan</div>
          </div>
          <div>
            <div style={{ fontSize: '.72rem', color: 'rgba(255,255,255,.7)' }}>Cuzdan</div>
            <div style={{ marginTop: 4, fontWeight: 900 }}>{formatMobileMoney(model.storedValueBalance)} TL</div>
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle('#fff'), padding: 14, color: '#475569', fontSize: '.8rem', lineHeight: 1.65 }}>
        Bu kart POS, kiosk ve masa kanalinda ayni musteriyi tanitmak icin kullanilir. Uye numarasi ve QR alanini kasada gostermeniz yeterlidir.
      </div>
    </div>
  )
}

function CouponsScreen({ model, onAddCoupon }) {
  const [couponCode, setCouponCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState({ text: '', type: '' })

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!couponCode.trim()) return
    setLoading(true)
    setMessage({ text: '', type: '' })
    try {
      await onAddCoupon(couponCode)
      setMessage({ text: 'Kupon hesabınıza başarıyla tanımlandı!', type: 'success' })
      setCouponCode('')
    } catch (err) {
      setMessage({ text: err.message || 'Kupon eklenirken bir hata oluştu.', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Kupon Ekleme Formu */}
      <form onSubmit={handleSubmit} style={{ ...cardStyle('#fff'), padding: 16, display: 'grid', gap: 10 }}>
        <div style={{ fontWeight: 900, color: '#0f172a', fontSize: '0.88rem' }}>Yeni Kupon Ekle</div>
        <div style={{ fontSize: '.76rem', color: '#64748b', lineHeight: 1.5 }}>
          Sahip olduğunuz kupon kodunu buraya girerek hesabınızla eşleştirebilirsiniz.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value)}
            placeholder="Kupon Kodu (Örn: SAVE20)"
            style={{
              flex: 1,
              minHeight: 40,
              borderRadius: 12,
              border: '1px solid rgba(148,163,184,.22)',
              background: '#fff',
              color: '#0f172a',
              padding: '0 12px',
              fontSize: '0.82rem',
              fontWeight: 700,
              textTransform: 'uppercase'
            }}
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !couponCode.trim()}
            style={{
              minWidth: 80,
              minHeight: 40,
              borderRadius: 12,
              border: 'none',
              background: 'linear-gradient(135deg,#f97316,#ea580c)',
              color: '#fff',
              fontWeight: 900,
              cursor: loading || !couponCode.trim() ? 'not-allowed' : 'pointer',
              opacity: loading || !couponCode.trim() ? 0.6 : 1,
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6
            }}
          >
            {loading ? (
              <i className="fa-solid fa-spinner fa-spin" />
            ) : (
              <>
                <i className="fa-solid fa-plus" />
                Ekle
              </>
            )}
          </button>
        </div>
        {message.text && (
          <div style={{
            fontSize: '.74rem',
            fontWeight: 700,
            color: message.type === 'success' ? '#166534' : '#b91c1c',
            background: message.type === 'success' ? '#ecfdf5' : '#fef2f2',
            padding: '8px 12px',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}>
            <i className={message.type === 'success' ? 'fa-solid fa-circle-check' : 'fa-solid fa-triangle-exclamation'} />
            {message.text}
          </div>
        )}
      </form>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <SummaryTile label="Aktif kupon" value={String(model.activeCoupons.length)} hint="Kullanima hazir veya ayrilmis" color="#ea580c" />
        <SummaryTile label="Yakinda bitecek" value={String(model.expiringCoupons.length)} hint="7 gun icinde sonlanir" color="#dc2626" />
      </div>

      {model.activeCoupons.length ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontWeight: 900, color: '#0f172a' }}>Aktif kuponlar</div>
          {model.activeCoupons.map(coupon => <CouponCard key={coupon.id} coupon={coupon} />)}
        </div>
      ) : null}

      {model.expiringCoupons.length ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontWeight: 900, color: '#0f172a' }}>Yakinda bitecekler</div>
          {model.expiringCoupons.map(coupon => <CouponCard key={`exp-${coupon.id}`} coupon={coupon} />)}
        </div>
      ) : null}

      {model.passiveCoupons.length ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontWeight: 900, color: '#0f172a' }}>Gecmis ve pasif kuponlar</div>
          {model.passiveCoupons.map(coupon => <CouponCard key={`pass-${coupon.id}`} coupon={coupon} />)}
        </div>
      ) : (
        <div style={{ ...cardStyle('#fff'), padding: 14, color: '#64748b', fontSize: '.8rem' }}>
          Pasif kupon gecmisi bulunmuyor.
        </div>
      )}
    </div>
  )
}

function CampaignsScreen({ model }) {
  const personalized = model.campaigns.filter(item => item.bucket === 'personalized')
  const publicCampaigns = model.campaigns.filter(item => item.bucket === 'public')
  const upcoming = model.campaigns.filter(item => item.bucket === 'upcoming')
  const ending = model.campaigns.filter(item => item.bucket === 'ending')

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {[
        { title: 'Sana ozel kampanyalar', items: personalized },
        { title: 'Herkese acik kampanyalar', items: publicCampaigns },
        { title: 'Yakinda baslayacaklar', items: upcoming },
        { title: 'Bitmek uzere olanlar', items: ending },
      ].map(group => (
        <div key={group.title} style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontWeight: 900, color: '#0f172a' }}>{group.title}</div>
          {group.items.length ? (
            group.items.map(campaign => <CampaignCard key={campaign.id} campaign={campaign} />)
          ) : (
            <div style={{ ...cardStyle('#fff'), padding: 14, color: '#64748b', fontSize: '.8rem' }}>
              Bu bolumde gosterilecek kampanya bulunmuyor.
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function AccountScreen({
  model,
  accountView,
  onChange,
  activePrograms = [],
  referralCodesByProgram = {},
  onTriggerReload,
}) {
  const [copiedCode, setCopiedCode] = useState('')
  const [retroCode, setRetroCode] = useState('')
  const [retroLoading, setRetroLoading] = useState(false)
  const [retroError, setRetroError] = useState('')
  const [retroSuccess, setRetroSuccess] = useState('')
  const [genLoading, setGenLoading] = useState({})
  const [genError, setGenError] = useState({})

  const handleCopy = (code) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code)
      setTimeout(() => setCopiedCode(''), 2000)
    })
  }

  const handleApplyRetroCode = async () => {
    setRetroError('')
    setRetroSuccess('')
    if (!retroCode.trim()) {
      setRetroError('Lütfen bir davet kodu girin.')
      return
    }
    setRetroLoading(true)
    try {
      const valRes = await validateReferralCode(model.customer.id, retroCode)
      if (valRes.isValid) {
        await applyReferralCode(model.customer.id, valRes)
        setRetroSuccess(`Referans başarıyla uygulandı! ${valRes.referrerName} tarafından davet edildiniz.`)
        setRetroCode('')
        if (onTriggerReload) {
          onTriggerReload()
        }
      }
    } catch (err) {
      setRetroError(err.message || 'Doğrulama veya uygulama sırasında hata oluştu.')
    } finally {
      setRetroLoading(false)
    }
  }

  const handleGenerateCode = async (programId) => {
    setGenError(prev => ({ ...prev, [programId]: '' }))
    setGenLoading(prev => ({ ...prev, [programId]: true }))
    try {
      await generateReferralCode(model.customer.id, programId)
      if (onTriggerReload) {
        onTriggerReload()
      }
    } catch (err) {
      setGenError(prev => ({ ...prev, [programId]: err.message || 'Kod üretilirken bir hata oluştu.' }))
    } finally {
      setGenLoading(prev => ({ ...prev, [programId]: false }))
    }
  }

  // Retrospective eligibility logic
  const orderCount = Number(model.customer.total_order_count ?? model.customer.siparis_sayisi ?? 0)
  const createdAt = model.customer.created_at ? new Date(model.customer.created_at) : new Date()
  const daysDiff = (new Date().getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
  const isRetrospectiveEligible = !model.customer.referred_by_customer_id && orderCount === 0 && daysDiff <= 7

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
        {ACCOUNT_VIEWS.map(view => {
          const active = view.key === accountView
          return (
            <button
              key={view.key}
              type="button"
              onClick={() => onChange(view.key)}
              style={{
                minHeight: 40,
                padding: '0 14px',
                borderRadius: 999,
                border: '1px solid rgba(148,163,184,.18)',
                background: active ? '#0f172a' : '#fff',
                color: active ? '#fff' : '#475569',
                fontWeight: 800,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {view.label}
            </button>
          )
        })}
      </div>

      {accountView === 'activity' ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {model.transactions.length ? model.transactions.map(item => {
            const valueMeta = getTransactionValue(item)
            return (
              <div key={item.id} style={{ ...cardStyle('#fff'), padding: 14, display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 900, color: '#0f172a' }}>{getTransactionLabel(item.transaction_type)}</div>
                    <div style={{ marginTop: 4, color: '#64748b', fontSize: '.76rem' }}>
                      {formatMobileDate(item.occurred_at, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} • {item.source_channel || item.branch_name || 'Loyalty'}
                    </div>
                  </div>
                  <div style={{ fontWeight: 900, color: valueMeta.color }}>{valueMeta.text}</div>
                </div>
                <div style={{ color: '#475569', fontSize: '.78rem', lineHeight: 1.55 }}>
                  {item.note || item.source_type || item.source_ref_no || 'Kampanya / puan hareketi kaydi'}
                </div>
              </div>
            )
          }) : (
            <div style={{ ...cardStyle('#fff'), padding: 14, color: '#64748b', fontSize: '.8rem' }}>
              Henuz puan veya cüzdan hareketi bulunmuyor.
            </div>
          )}
        </div>
      ) : null}

      {accountView === 'tier' ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ ...cardStyle('#fff'), padding: 16, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '.72rem', color: '#7c3aed', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em' }}>Mevcut seviye</div>
                <div style={{ marginTop: 6, fontSize: '1.18rem', fontWeight: 900, color: '#0f172a' }}>{model.tierSnapshot.currentTier?.name || 'Uyelik'}</div>
              </div>
              <span style={badgeStyle('#f3e8ff', '#7c3aed')}>{Math.max(0, Number(model.tierSnapshot.progressRatio || 0))}%</span>
            </div>
            <div style={{ height: 10, borderRadius: 999, background: '#ede9fe', overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(0, Math.min(100, Number(model.tierSnapshot.progressRatio || 0)))}%`, height: '100%', background: 'linear-gradient(90deg,#8b5cf6,#ec4899)' }} />
            </div>
            <div style={{ color: '#475569', fontSize: '.8rem', lineHeight: 1.6 }}>
              {model.tierSnapshot.progressLabel} • {model.tierSnapshot.remainingLabel}
            </div>
          </div>
          <div style={{ ...cardStyle('#fff'), padding: 16, display: 'grid', gap: 8 }}>
            <div style={{ fontWeight: 900, color: '#0f172a' }}>Seviye avantajlari</div>
            <div style={{ color: '#475569', fontSize: '.8rem' }}>Kampanyalarda oncelikli gorunurluk</div>
            <div style={{ color: '#475569', fontSize: '.8rem' }}>POS ve kioskta hizli musteri tanima</div>
            <div style={{ color: '#475569', fontSize: '.8rem' }}>Kupon, bonus ve frekans odullerine erisim</div>
          </div>
        </div>
      ) : null}

      {accountView === 'profile' ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {/* Retrospective Referral Entry */}
          {isRetrospectiveEligible && (
            <div style={{ ...cardStyle('linear-gradient(135deg, #fffbeb, #fef3c7)', '#fde68a'), padding: 16, display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: '1.2rem', color: '#d97706' }}><i className="fa-solid fa-gift" /></span>
                <div style={{ fontWeight: 900, color: '#92400e', fontSize: '.86rem' }}>Beni Kim Davet Etti?</div>
              </div>
              <div style={{ color: '#b45309', fontSize: '.76rem', lineHeight: 1.45 }}>
                Sizi davet eden bir arkadaşınızın referans kodunu girerek hoş geldin ödül puanınızı hemen kazanabilirsiniz.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={retroCode}
                  onChange={e => setRetroCode(e.target.value)}
                  placeholder="Ornek: REF-XXXXXX"
                  disabled={retroLoading}
                  style={{
                    flex: 1,
                    minHeight: 38,
                    borderRadius: 10,
                    border: '1px solid #fcd34d',
                    background: '#fff',
                    color: '#0f172a',
                    padding: '0 10px',
                    fontSize: '.8rem',
                    fontWeight: 700,
                  }}
                />
                <button
                  type="button"
                  onClick={handleApplyRetroCode}
                  disabled={retroLoading}
                  style={{
                    minWidth: 80,
                    borderRadius: 10,
                    border: 'none',
                    background: '#d97706',
                    color: '#fff',
                    fontWeight: 800,
                    fontSize: '.76rem',
                    cursor: 'pointer',
                    opacity: retroLoading ? 0.7 : 1,
                  }}
                >
                  {retroLoading ? 'Uygulanıyor' : 'Uygula'}
                </button>
              </div>
              {retroError && <div style={{ color: '#b91c1c', fontSize: '.74rem', fontWeight: 700 }}>{retroError}</div>}
              {retroSuccess && <div style={{ color: '#15803d', fontSize: '.74rem', fontWeight: 700 }}>{retroSuccess}</div>}
            </div>
          )}

          {/* Active Referral Programs Invitations & Codes */}
          {activePrograms.map(program => {
            const eligibility = checkReferralEligibility(model.customer, program)
            if (!eligibility.eligible) return null

            const programCodes = referralCodesByProgram[program.id] || []
            const config = program.config_json || {}
            const isUniqueMultiple = program.mode === 'unique_multiple'
            const isLimitMode = program.mode === 'single_reusable_limit'
            const isDateMode = program.mode === 'single_reusable_date'
            const pError = genError[program.id]
            const pLoading = genLoading[program.id]

            return (
              <div key={program.id} style={{ ...cardStyle('#fff'), padding: 16, display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: '1.2rem', color: '#be185d' }}><i className="fa-solid fa-users" /></span>
                    <div style={{ fontWeight: 900, color: '#0f172a', fontSize: '.86rem' }}>{program.name || 'Arkadaşlarını Davet Et'}</div>
                  </div>
                  <span style={badgeStyle('rgba(190,24,93,.12)', '#be185d')}>Aktif</span>
                </div>

                <div style={{ fontSize: '.74rem', color: '#64748b', background: '#f8fafc', padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(148,163,184,.08)' }}>
                  <i className="fa-solid fa-info-circle" style={{ marginRight: 6, color: '#8b5cf6' }} />
                  Kazanım Kriteri: {program.success_criteria === 'registration' ? 'Arkadaşınız üye olduğunda' : `Arkadaşınız üye olup en az ${program.success_purchase_count || 1} sipariş verdiğinde`}
                </div>

                {isUniqueMultiple ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ color: '#475569', fontSize: '.76rem', lineHeight: 1.45 }}>
                      Arkadaşlarınızla paylaşabileceğiniz tek kullanımlık benzersiz davet kodları oluşturun.
                    </div>
                    
                    {programCodes.length > 0 && (
                      <div style={{ display: 'grid', gap: 8 }}>
                        {programCodes.map(row => {
                          const isCopied = copiedCode === row.referral_code
                          return (
                            <div
                              key={row.id}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '8px 12px',
                                borderRadius: 12,
                                background: '#f8fafc',
                                border: '1px solid rgba(148,163,184,.12)',
                              }}
                            >
                              <div>
                                <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '.84rem', color: '#0f172a' }}>
                                  {row.referral_code}
                                </div>
                                <div style={{ fontSize: '.68rem', color: '#64748b', marginTop: 2 }}>
                                  {row.is_used ? (
                                    <span>Kullanıldı ({formatMobileDate(row.used_at, { day: '2-digit', month: 'short' })})</span>
                                  ) : (
                                    <span>Kullanıma hazır</span>
                                  )}
                                </div>
                              </div>
                              
                              {!row.is_used && (
                                <button
                                  type="button"
                                  onClick={() => handleCopy(row.referral_code)}
                                  style={{
                                    padding: '5px 10px',
                                    borderRadius: 8,
                                    border: 'none',
                                    background: isCopied ? '#10b981' : '#e2e8f0',
                                    color: isCopied ? '#fff' : '#475569',
                                    fontWeight: 800,
                                    fontSize: '.7rem',
                                    cursor: 'pointer',
                                  }}
                                >
                                  {isCopied ? 'Kopyalandı!' : 'Kopyala'}
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {programCodes.length < (config.max_unique_codes || 4) ? (
                      <div style={{ display: 'grid', gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => handleGenerateCode(program.id)}
                          disabled={pLoading}
                          style={{
                            minHeight: 38,
                            borderRadius: 12,
                            border: 'none',
                            background: 'linear-gradient(135deg, #be185d, #db2777)',
                            color: '#fff',
                            fontWeight: 950,
                            fontSize: '.78rem',
                            cursor: 'pointer',
                            opacity: pLoading ? 0.7 : 1,
                          }}
                        >
                          {pLoading ? 'Kod Üretiliyor...' : 'Yeni Davet Kodu Üret'}
                        </button>
                        <div style={{ color: '#64748b', fontSize: '.7rem', textAlign: 'center' }}>
                          Limit: {programCodes.length} / {config.max_unique_codes || 4} kod üretildi.
                        </div>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', color: '#ef4444', fontSize: '.72rem', fontWeight: 800 }}>
                        Maksimum davet kodu üretme limitine ulaştınız.
                      </div>
                    )}
                    {pError && <div style={{ color: '#b91c1c', fontSize: '.74rem', fontWeight: 700, textAlign: 'center' }}>{pError}</div>}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ color: '#475569', fontSize: '.76rem', lineHeight: 1.45 }}>
                      Aşağıdaki davet kodunu arkadaşlarınızla sınırsızca paylaşabilirsiniz.
                    </div>

                    {model.customer.referral_code ? (
                      <div
                        style={{
                          padding: 14,
                          borderRadius: 16,
                          background: 'linear-gradient(145deg, #f8fafc, #f1f5f9)',
                          border: '1px solid rgba(148,163,184,.14)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '.72rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>Davet Kodunuz</div>
                          <div style={{ marginTop: 4, fontFamily: 'monospace', fontWeight: 900, fontSize: '1.25rem', color: '#be185d' }}>{model.customer.referral_code}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopy(model.customer.referral_code)}
                          style={{
                            minHeight: 36,
                            padding: '0 14px',
                            borderRadius: 10,
                            border: 'none',
                            background: copiedCode === model.customer.referral_code ? '#10b981' : '#be185d',
                            color: '#fff',
                            fontWeight: 900,
                            fontSize: '.74rem',
                            cursor: 'pointer',
                          }}
                        >
                          {copiedCode === model.customer.referral_code ? 'Kopyalandı' : 'Kopyala'}
                        </button>
                      </div>
                    ) : (
                      <div style={{ color: '#64748b', fontSize: '.78rem', fontStyle: 'italic', textAlign: 'center' }}>
                        Davet kodunuz hazırlanıyor...
                      </div>
                    )}

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 14px',
                        borderRadius: 12,
                        background: '#fcf6f8',
                        border: '1px solid rgba(190,24,93,.08)',
                        fontSize: '.76rem',
                      }}
                    >
                      <span style={{ color: '#475569', fontWeight: 800 }}>Başarılı Davet Sayısı:</span>
                      <span style={{ color: '#be185d', fontWeight: 900, fontSize: '.84rem' }}>
                        {model.referredCount}
                        {isLimitMode && (
                          <span style={{ color: '#64748b', fontWeight: 700, fontSize: '.76rem' }}>
                            {' '}
                            / {config.max_redemptions_per_referrer || 4}
                          </span>
                        )}
                      </span>
                    </div>

                    {isDateMode && (
                      <div style={{ fontSize: '.7rem', color: '#64748b', textAlign: 'center' }}>
                        Geçerlilik: {config.valid_from ? formatMobileDate(config.valid_from, { day: '2-digit', month: 'short' }) : 'Başlangıç yok'} - {config.valid_until ? formatMobileDate(config.valid_until, { day: '2-digit', month: 'short' }) : 'Bitiş yok'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          <div style={{ ...cardStyle('#fff'), padding: 16, display: 'grid', gap: 10 }}>
            <div style={{ fontWeight: 900, color: '#0f172a' }}>Musteri bilgileri</div>
            <div style={{ color: '#475569', fontSize: '.8rem' }}>Ad Soyad: {model.customer.ad_soyad || '-'}</div>
            <div style={{ color: '#475569', fontSize: '.8rem' }}>Telefon: {(model.customer.telefon_ulke || '') + (model.customer.telefon || '') || '-'}</div>
            <div style={{ color: '#475569', fontSize: '.8rem' }}>E-posta: {model.customer.email || '-'}</div>
            <div style={{ color: '#475569', fontSize: '.8rem' }}>Dogum gunu: {formatMobileDate(model.customer.birth_date, { day: '2-digit', month: 'long' })}</div>
            <div style={{ color: '#475569', fontSize: '.8rem' }}>Favori sube: {model.homeBranchName}</div>
          </div>
          <div style={{ ...cardStyle('#fff'), padding: 16, display: 'grid', gap: 8 }}>
            <div style={{ fontWeight: 900, color: '#0f172a' }}>Iletisim tercihleri</div>
            <div style={{ color: '#475569', fontSize: '.8rem' }}>SMS: {model.customer.sms_opt_in ? 'Acik' : 'Kapali'}</div>
            <div style={{ color: '#475569', fontSize: '.8rem' }}>E-posta: {model.customer.email_opt_in ? 'Acik' : 'Kapali'}</div>
            <div style={{ color: '#475569', fontSize: '.8rem' }}>Push / kampanya: {model.customer.push_opt_in ? 'Acik' : 'Kapali'}</div>
          </div>
          <div style={{ ...cardStyle('#fff'), padding: 16, display: 'grid', gap: 8 }}>
            <div style={{ fontWeight: 900, color: '#0f172a' }}>Kategori ve etiketler</div>
            {model.profileTags.length ? model.profileTags.map(tag => (
              <span key={tag} style={badgeStyle('#f1f5f9', '#475569')}>{tag}</span>
            )) : (
              <div style={{ color: '#64748b', fontSize: '.8rem' }}>Ekstra musteri etiketi yok.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function LoginScreen({
  loading,
  searchText,
  onSearchTextChange,
  onSearch,
  matches,
  quickCustomers,
  statusText,
  errorText,
  onSelectCustomer,
}) {
  const [isSignup, setIsSignup] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [refCode, setRefCode] = useState('')
  const [signupLoading, setSignupLoading] = useState(false)
  const [signupError, setSignupError] = useState('')

  async function handleRegister() {
    setSignupError('')
    if (!name.trim()) {
      setSignupError('Ad Soyad alanı zorunludur.')
      return
    }
    if (!phone.trim()) {
      setSignupError('Telefon alanı zorunludur.')
      return
    }
    setSignupLoading(true)
    try {
      const newCust = await registerCustomer(name, phone, email, refCode)
      onSelectCustomer(newCust)
    } catch (err) {
      setSignupError(err.message || 'Kayıt sırasında bir hata oluştu.')
    } finally {
      setSignupLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100svh', background: 'linear-gradient(180deg, #fff7f5 0%, #ffffff 16%, #f8fafc 100%)', display: 'grid', gridTemplateRows: 'auto 1fr' }}>
      <div style={{ padding: '24px 18px 14px', display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '.72rem', color: '#fb7185', fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase' }}>
              SuitableRMS Loyalty
            </div>
            <div style={{ marginTop: 4, fontSize: '1.12rem', color: '#0f172a', fontWeight: 900 }}>
              {isSignup ? 'Yeni Uye Ol' : 'Musteri girisi'}
            </div>
          </div>
          <span style={badgeStyle('rgba(251,113,133,.12)', '#be185d')}>
            <i className="fa-solid fa-mobile-screen" />
            Mobil
          </span>
        </div>

        <div style={{ ...cardStyle('linear-gradient(145deg,#111827,#312e81)', 'rgba(255,255,255,.08)'), padding: 16, color: '#fff', display: 'grid', gap: 8 }}>
          <div style={{ fontSize: '.76rem', fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.72)' }}>
            Bu cihazdaki aktif hesap
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 900 }}>
            {isSignup ? 'Hemen kayit ol ve kazan' : 'Sadakat hesabinla devam et'}
          </div>
          <div style={{ fontSize: '.82rem', lineHeight: 1.6, color: 'rgba(255,255,255,.82)' }}>
            {isSignup
              ? 'Sadakat programına katılarak özel fırsatlar, kuponlar ve sürpriz hediyeler kazanmaya hemen başlayabilirsiniz.'
              : 'Telefon hesabini hatirlar. Sonraki QR okutmalarinda kiosk ve POS seni ayni musteri olarak taniyabilir.'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '0 4px', marginTop: 4 }}>
          <button
            type="button"
            onClick={() => setIsSignup(false)}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: 12,
              border: 'none',
              background: !isSignup ? 'linear-gradient(145deg, #0f172a, #1e293b)' : 'transparent',
              color: !isSignup ? '#fff' : '#64748b',
              fontWeight: 800,
              fontSize: '.82rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Giris Yap
          </button>
          <button
            type="button"
            onClick={() => setIsSignup(true)}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: 12,
              border: 'none',
              background: isSignup ? 'linear-gradient(145deg, #be185d, #db2777)' : 'transparent',
              color: isSignup ? '#fff' : '#64748b',
              fontWeight: 800,
              fontSize: '.82rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Yeni Kayit
          </button>
        </div>
      </div>

      <div style={{ overflowY: 'auto', padding: '0 18px 18px', display: 'grid', gap: 14, alignContent: 'start' }}>
        {!isSignup ? (
          <>
            <div style={{ ...cardStyle('#fff'), padding: 14, display: 'grid', gap: 10 }}>
              <div style={{ fontWeight: 900, color: '#0f172a' }}>Telefon, uye no veya ad soyad ile bul</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={searchText}
                  onChange={event => onSearchTextChange(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter') onSearch() }}
                  placeholder="Ornek: 0532..., RMS-1042, Ayse Yilmaz"
                  style={{ flex: 1, minHeight: 46, borderRadius: 14, border: '1px solid rgba(148,163,184,.16)', background: '#fff', color: '#0f172a', padding: '0 14px' }}
                />
                <button
                  type="button"
                  onClick={onSearch}
                  disabled={loading}
                  style={{ minWidth: 92, minHeight: 46, borderRadius: 14, border: 'none', background: '#0f172a', color: '#fff', fontWeight: 900, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1 }}
                >
                  {loading ? 'Araniyor' : 'Bul'}
                </button>
              </div>
              {statusText ? <div style={{ color: '#0369a1', fontSize: '.78rem' }}>{statusText}</div> : null}
              {errorText ? <div style={{ color: '#b91c1c', fontSize: '.78rem' }}>{errorText}</div> : null}
              {matches.length ? matches.map(customer => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => onSelectCustomer(customer)}
                  style={{ ...cardStyle('#fff7f5', 'rgba(251,113,133,.18)'), padding: 14, display: 'grid', gap: 4, textAlign: 'left', cursor: 'pointer' }}
                >
                  <div style={{ fontWeight: 900, color: '#0f172a' }}>{customer.ad_soyad || 'Isimsiz Musteri'}</div>
                  <div style={{ color: '#64748b', fontSize: '.76rem' }}>
                    {customer.loyalty_member_no || ((customer.telefon_ulke || '') + (customer.telefon || '')) || '-'}
                  </div>
                </button>
              )) : null}
            </div>

            {quickCustomers.length ? (
              <div style={{ ...cardStyle('#fff'), padding: 14, display: 'grid', gap: 10 }}>
                <div style={{ fontWeight: 900, color: '#0f172a' }}>Hizli secim</div>
                {quickCustomers.map(customer => (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => onSelectCustomer(customer)}
                    style={{ borderRadius: 16, border: '1px solid rgba(148,163,184,.14)', background: '#fff', color: '#0f172a', padding: '12px 14px', textAlign: 'left', cursor: 'pointer' }}
                  >
                    <div style={{ fontWeight: 800 }}>{customer.ad_soyad || 'Isimsiz Musteri'}</div>
                    <div style={{ marginTop: 4, color: '#64748b', fontSize: '.76rem' }}>
                      {customer.loyalty_member_no || ((customer.telefon_ulke || '') + (customer.telefon || '')) || 'Uye'}
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div style={{ ...cardStyle('#fff'), padding: 16, display: 'grid', gap: 12 }}>
            <div style={{ fontWeight: 900, color: '#0f172a', fontSize: '1rem' }}>Uyelik Formu</div>
            
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontSize: '.74rem', color: '#475569', fontWeight: 800 }}>Ad Soyad *</label>
              <input
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="Ornek: Ahmet Yilmaz"
                style={{ minHeight: 44, borderRadius: 12, border: '1px solid rgba(148,163,184,.2)', background: '#fff', color: '#0f172a', padding: '0 12px', fontSize: '.84rem' }}
              />
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontSize: '.74rem', color: '#475569', fontWeight: 800 }}>Telefon Numarasi *</label>
              <input
                value={phone}
                onChange={event => setPhone(event.target.value)}
                placeholder="Ornek: 05321234567"
                style={{ minHeight: 44, borderRadius: 12, border: '1px solid rgba(148,163,184,.2)', background: '#fff', color: '#0f172a', padding: '0 12px', fontSize: '.84rem' }}
              />
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontSize: '.74rem', color: '#475569', fontWeight: 800 }}>E-posta Adresi (Istege Bagli)</label>
              <input
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="Ornek: ahmet@mail.com"
                style={{ minHeight: 44, borderRadius: 12, border: '1px solid rgba(148,163,184,.2)', background: '#fff', color: '#0f172a', padding: '0 12px', fontSize: '.84rem' }}
              />
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontSize: '.74rem', color: '#be185d', fontWeight: 900 }}>Davet / Referans Kodu (Istege Bagli)</label>
              <input
                value={refCode}
                onChange={event => setRefCode(event.target.value)}
                placeholder="Ornek: REF-XXXXXX"
                style={{ minHeight: 44, borderRadius: 12, border: '1px solid rgba(251,113,133,.4)', background: '#fff', color: '#0f172a', padding: '0 12px', fontSize: '.84rem', fontWeight: 700 }}
              />
            </div>

            {signupError ? <div style={{ color: '#b91c1c', fontSize: '.78rem', fontWeight: 700 }}>{signupError}</div> : null}

            <button
              type="button"
              onClick={handleRegister}
              disabled={signupLoading}
              style={{
                marginTop: 6,
                minHeight: 46,
                borderRadius: 14,
                border: 'none',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: '#fff',
                fontWeight: 900,
                cursor: signupLoading ? 'wait' : 'pointer',
                opacity: signupLoading ? 0.7 : 1,
                boxShadow: '0 4px 12px rgba(16,185,129,.2)'
              }}
            >
              {signupLoading ? 'Uye Kaydi Yapiliyor...' : 'Kaydet ve Aramiza Katil'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function PhoneChrome({
  children,
  standalone = false,
}) {
  if (standalone) {
    return (
      <div style={{ width: 'min(100%, 430px)', minHeight: '100svh', background: '#fff' }}>
        {children}
      </div>
    )
  }

  return (
    <div
      style={{
        width: 'min(100%, 390px)',
        minHeight: 780,
        borderRadius: 36,
        background: 'linear-gradient(180deg, rgba(255,255,255,.96), rgba(248,250,252,.98)), radial-gradient(circle at top right, rgba(251,113,133,.22), transparent 30%)',
        border: '1px solid rgba(148,163,184,.28)',
        boxShadow: '0 32px 80px rgba(15,23,42,.16)',
        padding: 18,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 128,
          height: 26,
          borderRadius: 999,
          background: '#0f172a',
          opacity: 0.96,
        }}
      />
      {children}
    </div>
  )
}

function AppViewport({
  model,
  activeTab,
  accountView,
  onTabChange,
  onAccountViewChange,
  onLogout,
  sessionState,
  selectionState,
  onSelectCampaign,
  onSelectCoupon,
  onConnectLink,
  onAddCoupon,
  standalone = false,
  activePrograms = [],
  referralCodesByProgram = {},
  onTriggerReload,
  appConfig,
  onOrderAction,
}) {
  return (
    <div style={{
      minHeight: standalone ? '100svh' : '100%',
      borderRadius: standalone ? 0 : 26,
      background: 'linear-gradient(180deg, #fff7f5 0%, #ffffff 16%, #f8fafc 100%)',
      border: standalone ? 'none' : '1px solid rgba(226,232,240,.9)',
      display: 'grid',
      gridTemplateRows: 'auto auto 1fr auto',
      overflow: 'hidden',
    }}>
      {!standalone && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#0f172a', fontSize: '.82rem', fontWeight: 800, padding: '26px 18px 10px' }}>
          <span>{new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(new Date())}</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#64748b' }}>
            <i className="fa-solid fa-signal" />
            <i className="fa-solid fa-wifi" />
            <i className="fa-solid fa-battery-three-quarters" />
          </div>
        </div>
      )}

      {standalone ? (
        <div style={{ padding: '0 18px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '1rem', fontWeight: 900, color: '#0f172a' }}>
            {TAB_ITEMS.find(item => item.key === activeTab)?.label || 'Ana Sayfa'}
          </div>
          <button
            type="button"
            onClick={onLogout}
            style={{
              minHeight: 34, padding: '0 12px', borderRadius: 999,
              border: '1px solid rgba(148,163,184,.18)', background: '#fff',
              color: '#475569', fontWeight: 800, cursor: 'pointer',
            }}
          >
            <i className="fa-solid fa-right-from-bracket" style={{ marginRight: 6 }} />
            Çıkış
          </button>
        </div>
      ) : (
        <div style={{ padding: '0 18px 12px', display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '.72rem', color: '#fb7185', fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase' }}>
                SuitableRMS Loyalty
              </div>
              <div style={{ marginTop: 4, fontSize: '1.08rem', color: '#0f172a', fontWeight: 900 }}>
                {TAB_ITEMS.find(item => item.key === activeTab)?.label || 'Musteri'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={badgeStyle('rgba(251,113,133,.12)', '#be185d')}>
                <i className="fa-solid fa-qrcode" />
                Kasada goster
              </span>
              <button
                type="button"
                onClick={onLogout}
                style={{
                  minHeight: 34,
                  padding: '0 12px',
                  borderRadius: 999,
                  border: '1px solid rgba(148,163,184,.18)',
                  background: '#fff',
                  color: '#475569',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Cikis
              </button>
            </div>
          </div>

          <LinkBanner
            sessionState={sessionState}
            selectionState={selectionState}
            onSelectCampaign={onSelectCampaign}
            onSelectCoupon={onSelectCoupon}
            onConnect={onConnectLink}
          />

          {!model.schemaReady || model.errorText ? (
            <div style={{ ...cardStyle('rgba(255,247,237,.96)', 'rgba(251,146,60,.28)'), padding: 12, fontSize: '.74rem', color: '#9a3412', lineHeight: 1.55 }}>
              {!model.schemaReady ? `Canli loyalty tablosu eksik: ${model.missingTables.join(', ') || 'bilinmiyor'}.` : null}
              {model.errorText ? ` ${model.errorText}` : ''}
            </div>
          ) : null}
        </div>
      )}

      <div style={{ overflowY: 'auto', padding: '0 18px 18px', display: 'grid', gap: 14, alignContent: 'start' }}>
        {activeTab === 'home' ? (
          standalone
            ? <MobileHomeDashboard
                model={model}
                appConfig={appConfig}
                onNavigate={target => {
                  if (['campaigns', 'coupons', 'card', 'account'].includes(target)) {
                    onTabChange(target === 'card' ? 'card' : target === 'coupons' ? 'coupons' : target === 'campaigns' ? 'campaigns' : 'account')
                  }
                }}
                onOrderAction={onOrderAction}
              />
            : <HomeScreen model={model} onOpen={target => {
                if (target === 'card') onTabChange('card')
                if (target === 'coupons') onTabChange('coupons')
                if (target === 'activity') {
                  onTabChange('account')
                  onAccountViewChange('activity')
                }
                if (target === 'tier') {
                  onTabChange('account')
                  onAccountViewChange('tier')
                }
              }} />
        ) : null}
        {activeTab === 'card' ? <CardScreen model={model} /> : null}
        {activeTab === 'coupons' ? <CouponsScreen model={model} onAddCoupon={onAddCoupon} /> : null}
        {activeTab === 'campaigns' ? <CampaignsScreen model={model} /> : null}
        {activeTab === 'account' ? (
          <AccountScreen
            model={model}
            accountView={accountView}
            onChange={onAccountViewChange}
            activePrograms={activePrograms}
            referralCodesByProgram={referralCodesByProgram}
            onTriggerReload={onTriggerReload}
          />
        ) : null}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6, padding: '10px 10px 12px', borderTop: '1px solid rgba(148,163,184,.18)', background: 'rgba(255,255,255,.94)', backdropFilter: 'blur(10px)' }}>
        {TAB_ITEMS.map(item => {
          const active = item.key === activeTab
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onTabChange(item.key)}
              style={{
                borderRadius: 16,
                border: 'none',
                background: active ? 'linear-gradient(145deg, rgba(251,113,133,.16), rgba(249,115,22,.14))' : 'transparent',
                color: active ? '#be185d' : '#64748b',
                padding: '8px 4px',
                display: 'grid',
                gap: 6,
                justifyItems: 'center',
                cursor: 'pointer',
              }}
            >
              <i className={`fa-solid ${item.icon}`} />
              <span style={{ fontSize: '.66rem', fontWeight: 800 }}>{item.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function CustomerLoyaltyMobileApp({
  mode = 'embedded',
  linkSession = null,
}) {
  const isStandalone = mode === 'standalone'
  const [customers, setCustomers] = useState([])
  const [selectedCustomerId, setSelectedCustomerId] = useState(() => readStoredMobileCustomer()?.id || '')
  const [snapshot, setSnapshot] = useState(null)
  const [activePrograms, setActivePrograms] = useState([])
  const [referralCodesByProgram, setReferralCodesByProgram] = useState({})
  const [reloadTrigger, setReloadTrigger] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingText, setLoadingText] = useState('Musteri profili hazirlaniyor...')
  const [errorText, setErrorText] = useState('')
  const [activeTab, setActiveTab] = useState('home')
  const [accountView, setAccountView] = useState('activity')
  const [searchText, setSearchText] = useState('')
  const [searchMatches, setSearchMatches] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchStatusText, setSearchStatusText] = useState('')
  const [searchErrorText, setSearchErrorText] = useState('')
  const [sessionState, setSessionState] = useState({
    channel: linkSession?.channel || '',
    session: null,
    loading: Boolean(linkSession?.token),
    linking: false,
    statusText: '',
    errorText: '',
  })
  const [lastLinkKey, setLastLinkKey] = useState('')
  const [selectedLinkCampaignId, setSelectedLinkCampaignId] = useState('')
  const [selectedLinkCouponId, setSelectedLinkCouponId] = useState('')
  const [appConfig, setAppConfig] = useState(getDefaultAppConfig())
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [activeOrderButton, setActiveOrderButton] = useState(null)
  const [showTableOrderEntry, setShowTableOrderEntry] = useState(false)
  const [tableNumberInput, setTableNumberInput] = useState('')

  useEffect(() => {
    let active = true

    async function loadCustomers() {
      setLoading(true)
      setErrorText('')
      setLoadingText(isStandalone ? 'Mobil hesaplar hazirlaniyor...' : 'Loyalty musterileri yukleniyor...')

      try {
        const roster = await loadCustomerRoster()
        if (!active) return
        setCustomers(roster)
        if (!isStandalone && !selectedCustomerId) {
          const defaultCustomer = pickDefaultCustomer(roster)
          if (defaultCustomer?.id) setSelectedCustomerId(defaultCustomer.id)
          else if (roster[0]?.id) setSelectedCustomerId(roster[0].id)
        }
      } catch (error) {
        if (!active) return
        setErrorText(error?.message || 'Musteri listesi okunamadi.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadCustomers()
    return () => { active = false }
  }, [isStandalone])

  useEffect(() => {
    let active = true
    loadCustomerAppConfig().then(config => {
      if (active) setAppConfig(config)
    }).catch(() => {})
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!linkSession?.token) {
      setSessionState({
        channel: '',
        session: null,
        loading: false,
        linking: false,
        statusText: '',
        errorText: '',
      })
      return
    }

    let active = true

    async function loadLinkState() {
      setSessionState(current => ({
        ...current,
        channel: linkSession.channel || '',
        loading: true,
        errorText: '',
      }))
      try {
        const nextSession = linkSession.channel === 'kiosk'
          ? await readKioskLoyaltyLinkSession(linkSession.token)
          : await readPosLoyaltyLinkSession(linkSession.token)
        if (!active) return
        setSessionState({
          channel: linkSession.channel || '',
          session: nextSession,
          loading: false,
          linking: false,
          statusText: nextSession?.status === 'linked' ? 'Bu oturumda musteri tanitimi tamamlanmis.' : '',
          errorText: nextSession ? '' : 'Bu baglanti bulunamadi veya suresi doldu.',
        })
        setSelectedLinkCampaignId(String(nextSession?.selectedCampaignId || ''))
        setSelectedLinkCouponId(String(nextSession?.selectedCouponCode || ''))
      } catch (error) {
        if (!active) return
        setSessionState({
          channel: linkSession.channel || '',
          session: null,
          loading: false,
          linking: false,
          statusText: '',
          errorText: error?.message || 'Baglanti okunamadi.',
        })
      }
    }

    loadLinkState()
    return () => { active = false }
  }, [linkSession?.channel, linkSession?.token])

  useEffect(() => {
    if (!selectedCustomerId) {
      setSnapshot(null)
      setLoading(false)
      return
    }

    let active = true

    async function loadSnapshot() {
      setLoading(true)
      setErrorText('')
      setLoadingText('Sadakat cuzdanı ve kampanyalar okunuyor...')
      try {
        const result = await loadCustomerMobileSnapshot(selectedCustomerId)
        if (!active) return
        setSnapshot(result)
        writeStoredMobileCustomer(normalizeStoredMobileCustomer(result.customer))

        // Load referral data
        try {
          const programs = await getActiveReferralPrograms()
          if (active) {
            setActivePrograms(programs)
          }
          const nextCodesByProgram = {}
          for (const program of programs) {
            const eligibility = checkReferralEligibility(result.customer, program)
            if (eligibility.eligible) {
              if (program.mode === 'unique_multiple') {
                const codes = await getReferrerCodes(selectedCustomerId, program.id)
                nextCodesByProgram[program.id] = codes
              } else if (!result.customer.referral_code) {
                // Auto generate single reusable code
                await generateReferralCode(selectedCustomerId, program.id)
                const updatedResult = await loadCustomerMobileSnapshot(selectedCustomerId)
                if (active) {
                  result.customer = updatedResult.customer
                  setSnapshot(updatedResult)
                  writeStoredMobileCustomer(normalizeStoredMobileCustomer(updatedResult.customer))
                }
              }
            }
          }
          if (active) {
            setReferralCodesByProgram(nextCodesByProgram)
          }
        } catch (refError) {
          console.error('Error loading referral info:', refError)
        }
      } catch (error) {
        if (!active) return
        if (isStandalone) {
          clearStoredMobileCustomer()
          setSelectedCustomerId('')
          setSnapshot(null)
          setSearchErrorText(error?.message || 'Musteri hesabi acilamadi.')
        } else {
          setErrorText(error?.message || 'Musteri sadakat verisi okunamadi.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    loadSnapshot()
    return () => { active = false }
  }, [isStandalone, selectedCustomerId, reloadTrigger])

  const model = useMemo(() => (
    snapshot ? buildCustomerMobileViewModel(snapshot) : null
  ), [snapshot])

  const quickCustomers = useMemo(() => customers.slice(0, 6), [customers])

  function activateCustomer(customer) {
    const normalized = normalizeStoredMobileCustomer(customer)
    if (!normalized?.id) return
    writeStoredMobileCustomer(normalized)
    setSelectedCustomerId(normalized.id)
    setSearchText('')
    setSearchMatches([])
      setSearchStatusText(`${normalized.ad_soyad || 'Musteri'} aktif hesaba alindi.`)
    setSearchErrorText('')
    setErrorText('')
    setActiveTab('home')
    setAccountView('activity')
  }

  function handleSimulationSelect(customerId) {
    setSelectedCustomerId(customerId)
    const customer = customers.find(item => String(item.id) === String(customerId))
    if (customer) writeStoredMobileCustomer(normalizeStoredMobileCustomer(customer))
  }

  async function handleSearch() {
    const query = searchText.trim()
    if (!query) {
      setSearchMatches([])
      setSearchStatusText('')
      setSearchErrorText('Aramak icin bir bilgi girin.')
      return
    }
    setSearching(true)
    setSearchStatusText('')
    setSearchErrorText('')
    try {
      const matches = await searchMobileCustomers(query)
      setSearchMatches(matches)
      if (!matches.length) setSearchStatusText('Eslesen musteri bulunamadi.')
    } catch (error) {
      setSearchMatches([])
      setSearchErrorText(error?.message || 'Musteri aramasi basarisiz.')
    } finally {
      setSearching(false)
    }
  }

  function handleLogout() {
    clearStoredMobileCustomer()
    setSelectedCustomerId('')
    setSnapshot(null)
    setActiveTab('home')
    setAccountView('activity')
    setSearchMatches([])
    setSearchText('')
    setSearchErrorText('')
    setSearchStatusText('Bu cihazdaki aktif hesap kapatildi.')
    setLastLinkKey('')
    setSessionState(current => ({
      ...current,
      linking: false,
      errorText: '',
      statusText: current.session ? 'Yeni giriste baglanti bu ekrandan devam eder.' : '',
    }))
  }

  const linkSelectionState = useMemo(() => {
    if (!model) {
      return {
        campaigns: [],
        coupons: [],
        selectedCampaignId: selectedLinkCampaignId,
        selectedCouponId: selectedLinkCouponId,
      }
    }

    const campaigns = model.campaigns
      .filter(item => item.activeNow && (item.personalized || item.bucket === 'public' || item.bucket === 'ending'))
      .sort((left, right) => {
        const leftScore = Number(left.personalized) * 10 + Number(left.bucket === 'ending') * 5 - Number(!left.mobileEligible)
        const rightScore = Number(right.personalized) * 10 + Number(right.bucket === 'ending') * 5 - Number(!right.mobileEligible)
        return rightScore - leftScore
      })

    return {
      campaigns,
      coupons: model.activeCoupons || [],
      selectedCampaignId: selectedLinkCampaignId,
      selectedCouponId: selectedLinkCouponId,
    }
  }, [model, selectedLinkCampaignId, selectedLinkCouponId])

  function handleSelectLinkCampaign(campaignId) {
    setSelectedLinkCampaignId(String(campaignId || ''))
  }

  function handleSelectLinkCoupon(couponId) {
    setSelectedLinkCouponId(String(couponId || ''))
  }

  async function connectLinkSession() {
    if (!linkSession?.token || !snapshot?.customer || !sessionState.session) return

    const selectedCampaign = linkSelectionState.campaigns.find(item => String(item.id) === String(selectedLinkCampaignId || '')) || null
    const selectedCoupon = linkSelectionState.coupons.find(item => String(item.code || '') === String(selectedLinkCouponId || '').toUpperCase()
      || String(item.id || '') === String(selectedLinkCouponId || '')) || null

    setSessionState(current => ({
      ...current,
      linking: true,
      errorText: '',
      statusText: 'Hesabiniz baglanti oturumuna tanitiliyor...',
    }))

    try {
      if (linkSession.channel === 'kiosk') {
        await selectCampaignInKioskLoyaltySession(linkSession.token, {
          campaignId: selectedCampaign?.id || '',
          campaignName: selectedCampaign?.name || '',
          couponCode: selectedCoupon?.code || '',
          couponLabel: selectedCoupon?.seriesName || '',
        })
        const customerCategoryIds = await loadCustomerLoyaltyCategoryIds(
          {
            branchId: sessionState.session.branchId || '',
            branchName: sessionState.session.branchName || '',
          },
          snapshot.customer.id,
        )
        await linkCustomerToKioskSession(linkSession.token, snapshot.customer, {
          customerCategoryIds,
          selectedCouponCode: selectedCoupon?.code || '',
          selectedCouponLabel: selectedCoupon?.seriesName || '',
        })
        const nextSession = await readKioskLoyaltyLinkSession(linkSession.token)
        setSessionState({
          channel: linkSession.channel,
          session: nextSession,
          loading: false,
          linking: false,
          statusText: `${snapshot.customer.ad_soyad || 'Musteri'} kiosk oturumuna tanitildi.${selectedCampaign ? ` Kampanya: ${selectedCampaign.name}.` : ''}${selectedCoupon ? ` Kupon: ${selectedCoupon.code || selectedCoupon.seriesName}.` : ''}`,
          errorText: '',
        })
      } else {
        await selectCampaignInPosLoyaltySession(linkSession.token, {
          campaignId: selectedCampaign?.id || '',
          campaignName: selectedCampaign?.name || '',
          couponCode: selectedCoupon?.code || '',
          couponLabel: selectedCoupon?.seriesName || '',
        })
        const nextSession = await linkCustomerToPosLoyaltySession(linkSession.token, snapshot.customer, {
          selectedCampaignId: selectedCampaign?.id || '',
          selectedCampaignName: selectedCampaign?.name || '',
          selectedCouponCode: selectedCoupon?.code || '',
          selectedCouponLabel: selectedCoupon?.seriesName || '',
        })
        setSessionState({
          channel: linkSession.channel,
          session: nextSession,
          loading: false,
          linking: false,
          statusText: `${snapshot.customer.ad_soyad || 'Musteri'} kasa oturumuna tanitildi.${selectedCampaign ? ` Kampanya: ${selectedCampaign.name}.` : ''}${selectedCoupon ? ` Kupon: ${selectedCoupon.code || selectedCoupon.seriesName}.` : ''}`,
          errorText: '',
        })
      }
      setLastLinkKey(`${linkSession.channel}:${linkSession.token}:${snapshot.customer.id}`)
    } catch (error) {
      setSessionState(current => ({
        ...current,
        loading: false,
        linking: false,
        statusText: '',
        errorText: error?.message || 'Baglanti tamamlanamadi.',
      }))
    }
  }

  async function handleAddCoupon(couponCode) {
    if (!selectedCustomerId) throw new Error('Müşteri seçilmemiş.')
    await bindCouponToCustomer(selectedCustomerId, couponCode)
    const result = await loadCustomerMobileSnapshot(selectedCustomerId)
    setSnapshot(result)
  }

  function renderBody() {
    if (loading) {
      return (
        <div style={{
          minHeight: isStandalone ? '100svh' : '100%',
          borderRadius: isStandalone ? 0 : 26,
          background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
          border: isStandalone ? 'none' : '1px solid rgba(226,232,240,.9)',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          textAlign: 'center',
        }}>
          <div style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 18, background: 'rgba(251,113,133,.12)', color: '#fb7185', display: 'grid', placeItems: 'center', fontSize: '1.3rem' }}>
              <i className="fa-solid fa-spinner fa-spin" />
            </div>
            <div style={{ fontWeight: 900, color: '#0f172a' }}>Musteri uygulamasi hazirlaniyor</div>
            <div style={{ fontSize: '.8rem', color: '#64748b', lineHeight: 1.6 }}>{loadingText}</div>
          </div>
        </div>
      )
    }

    if (!selectedCustomerId) {
      return (
        <LoginScreen
          loading={searching}
          searchText={searchText}
          onSearchTextChange={setSearchText}
          onSearch={handleSearch}
          matches={searchMatches}
          quickCustomers={quickCustomers}
          statusText={searchStatusText}
          errorText={searchErrorText}
          onSelectCustomer={activateCustomer}
        />
      )
    }

    if (errorText) {
      return (
        <div style={{
          minHeight: isStandalone ? '100svh' : '100%',
          borderRadius: isStandalone ? 0 : 26,
          background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
          border: isStandalone ? 'none' : '1px solid rgba(226,232,240,.9)',
          padding: 24,
          display: 'grid',
          alignContent: 'center',
          gap: 14,
          textAlign: 'center',
        }}>
          <div style={{ width: 60, height: 60, margin: '0 auto', borderRadius: 18, background: 'rgba(239,68,68,.12)', color: '#dc2626', display: 'grid', placeItems: 'center', fontSize: '1.5rem' }}>
            <i className="fa-solid fa-triangle-exclamation" />
          </div>
          <div style={{ fontWeight: 900, color: '#0f172a' }}>Musteri sadakat ekrani acilamadi</div>
          <div style={{ fontSize: '.82rem', color: '#64748b', lineHeight: 1.6 }}>{errorText}</div>
        </div>
      )
    }

    if (!model) return null

    return (
      <AppViewport
        model={model}
        activeTab={activeTab}
        accountView={accountView}
        onTabChange={next => {
          setActiveTab(next)
          if (next !== 'account') setAccountView('activity')
        }}
        onAccountViewChange={setAccountView}
        onLogout={handleLogout}
        sessionState={sessionState}
        selectionState={linkSelectionState}
        onSelectCampaign={handleSelectLinkCampaign}
        onSelectCoupon={handleSelectLinkCoupon}
        onConnectLink={() => { void connectLinkSession() }}
        onAddCoupon={handleAddCoupon}
        standalone={isStandalone}
        activePrograms={activePrograms}
        referralCodesByProgram={referralCodesByProgram}
        onTriggerReload={() => setReloadTrigger(prev => prev + 1)}
        appConfig={appConfig}
        onOrderAction={(btn) => {
          setActiveOrderButton(btn)
          setShowOrderModal(true)
        }}
      />
    )
  }

  if (isStandalone) {
    return (
      <div style={{
        minHeight: '100svh',
        width: '100%',
        maxWidth: 430,
        margin: '0 auto',
        background: '#f8fafc',
        position: 'relative',
      }}>
        {renderBody()}
        <OrderTypeModal
          visible={showOrderModal}
          onClose={(action) => {
            setShowOrderModal(false)
            if (action === 'table_order') setShowTableOrderEntry(true)
          }}
          orderButtonConfig={activeOrderButton}
        />
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {customers.length > 0 ? (
        <div className="card" style={{ padding: 18, borderColor: 'rgba(251,113,133,.22)', background: 'linear-gradient(135deg, rgba(251,113,133,.09), rgba(255,255,255,.98))' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '.76rem', color: '#be185d', fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase' }}>
                Musteri Simulasyonu
              </div>
              <div style={{ marginTop: 8, color: '#475569', fontSize: '.9rem', lineHeight: 1.65 }}>
                Telefon ici deneyim canli musteri ve loyalty verilerini okur. Bu secici yalnizca admin simulasyonunda gorunur.
              </div>
            </div>
            <div style={{ minWidth: 260 }}>
              <select
                className="f-input"
                value={selectedCustomerId || ''}
                onChange={event => handleSimulationSelect(event.target.value)}
                style={{ background: '#fff', fontWeight: 700 }}
              >
                {customers.map(customer => (
                  <option key={customer.id} value={customer.id}>
                    {customer.ad_soyad} {customer.loyalty_member_no ? `- ${customer.loyalty_member_no}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <PhoneChrome>{renderBody()}</PhoneChrome>
      </div>
    </div>
  )
}
