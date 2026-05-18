export default function LoyaltyCheckoutPrompt({
  pendingCampaign = null,
  appliedCampaign = null,
  onApply,
  onSkip,
  onClear,
  disabled = false,
}) {
  if (!pendingCampaign && !appliedCampaign) return null

  if (appliedCampaign) {
    const appliedAutomatically = appliedCampaign.applicationMode === 'auto'
    return (
      <div style={{
        padding: '14px 16px',
        borderRadius: 16,
        border: '1px solid rgba(16,185,129,.26)',
        background: 'rgba(16,185,129,.12)',
        display: 'grid',
        gap: 10,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div>
            <div style={{ color: '#d1fae5', fontWeight: 900 }}>{appliedCampaign.campaignName}</div>
            <div style={{ color: '#a7f3d0', fontSize: '.78rem', marginTop: 4 }}>
              Loyalty kampanyasi odemeye {appliedAutomatically ? 'otomatik' : 'manuel'} baglandi: {appliedCampaign.offerLabel}
            </div>
          </div>
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            style={{
              minHeight: 40,
              padding: '0 14px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,.12)',
              background: disabled ? 'rgba(255,255,255,.08)' : 'rgba(15,23,42,.38)',
              color: disabled ? '#64748b' : '#e2e8f0',
              fontWeight: 800,
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            {appliedAutomatically ? 'Bu Sipariste Kaldir' : 'Kampanyayi Kaldir'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      padding: '14px 16px',
      borderRadius: 16,
      border: '1px solid rgba(251,191,36,.30)',
      background: 'rgba(245,158,11,.10)',
      display: 'grid',
      gap: 10,
    }}>
      <div>
        <div style={{ color: '#fde68a', fontWeight: 900 }}>Loyalty kontrolu gerekiyor</div>
        <div style={{ color: '#fde68a', fontSize: '.78rem', marginTop: 4, lineHeight: 1.55 }}>
          Transaction kapanmadan once uygulanabilir kampanya bulundu. Bu siparis icin `{pendingCampaign.campaignName}` kampanyasi {pendingCampaign.offerLabel.toLowerCase()} olarak uygulanabilir.
        </div>
        <div style={{ color: '#fcd34d', fontSize: '.74rem', marginTop: 6 }}>
          Kosul: {pendingCampaign.conditionLabel || 'Ek kosul yok'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onApply}
          disabled={disabled}
          style={{
            minHeight: 48,
            padding: '0 16px',
            borderRadius: 12,
            border: 'none',
            background: disabled ? 'rgba(255,255,255,.08)' : 'linear-gradient(135deg,#f59e0b,#fbbf24)',
            color: disabled ? '#64748b' : '#111827',
            fontWeight: 900,
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          Kampanyayi Uygula
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={disabled}
          style={{
            minHeight: 48,
            padding: '0 16px',
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,.12)',
            background: disabled ? 'rgba(255,255,255,.08)' : 'rgba(15,23,42,.34)',
            color: disabled ? '#64748b' : '#e2e8f0',
            fontWeight: 800,
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          Bu Sipariste Atla
        </button>
      </div>
    </div>
  )
}
