function tonePalette(tone = 'muted') {
  if (tone === 'success') {
    return {
      border: 'rgba(52,211,153,.24)',
      background: 'rgba(16,185,129,.10)',
      labelBg: 'rgba(16,185,129,.18)',
      labelColor: '#6ee7b7',
    }
  }

  if (tone === 'warning') {
    return {
      border: 'rgba(251,191,36,.28)',
      background: 'rgba(245,158,11,.10)',
      labelBg: 'rgba(245,158,11,.16)',
      labelColor: '#fcd34d',
    }
  }

  return {
    border: 'rgba(148,163,184,.18)',
    background: 'rgba(15,23,42,.44)',
    labelBg: 'rgba(148,163,184,.14)',
    labelColor: '#cbd5e1',
  }
}

export default function LoyaltyCampaignCatalog({
  campaigns = [],
  loading = false,
  errorText = '',
  emptyText = 'Aktif kampanya bulunamadi.',
  onManualTriggerToggle = null,
}) {
  const nonBlockingWarning = !loading && campaigns.length > 0 ? errorText : ''

  if (loading) {
    return (
      <div style={{
        minHeight: 220,
        borderRadius: 20,
        border: '1px solid rgba(148,163,184,.14)',
        background: 'rgba(15,23,42,.36)',
        display: 'grid',
        placeItems: 'center',
        color: '#94a3b8',
        fontWeight: 800,
      }}>
        Loyalty kampanyalari yukleniyor...
      </div>
    )
  }

  if (errorText && campaigns.length === 0) {
    return (
      <div style={{
        minHeight: 180,
        borderRadius: 20,
        border: '1px solid rgba(248,113,113,.28)',
        background: 'rgba(127,29,29,.18)',
        color: '#fecaca',
        padding: 18,
        lineHeight: 1.6,
        fontWeight: 700,
      }}>
        {errorText}
      </div>
    )
  }

  if (!campaigns.length) {
    return (
      <div style={{
        minHeight: 220,
        borderRadius: 20,
        border: '1px dashed rgba(148,163,184,.18)',
        background: 'rgba(15,23,42,.30)',
        display: 'grid',
        placeItems: 'center',
        color: '#94a3b8',
        fontWeight: 800,
        textAlign: 'center',
        padding: 20,
      }}>
        {emptyText}
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {nonBlockingWarning ? (
        <div style={{
          borderRadius: 18,
          border: '1px solid rgba(251,191,36,.28)',
          background: 'rgba(120,53,15,.18)',
          color: '#fde68a',
          padding: '14px 16px',
          lineHeight: 1.55,
          fontSize: '.82rem',
          fontWeight: 700,
        }}>
          {nonBlockingWarning}
        </div>
      ) : null}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: 12,
        alignContent: 'start',
      }}>
        {campaigns.map(campaign => {
          const palette = tonePalette(campaign.statusTone)
          return (
            <div
              key={campaign.id}
              style={{
                borderRadius: 18,
                border: `1px solid ${palette.border}`,
                background: palette.background,
                padding: 14,
                display: 'grid',
                gap: 10,
                minHeight: 180,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <div style={{ color: '#fff', fontWeight: 900, fontSize: '.94rem', lineHeight: 1.35 }}>
                      {campaign.name || 'Adsiz kampanya'}
                    </div>
                    {campaign.isCustomerSelected && (
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: 999,
                        background: 'rgba(251,191,36,.18)',
                        border: '1px solid rgba(251,191,36,.36)',
                        color: '#fbbf24',
                        fontSize: '.66rem',
                        fontWeight: 900,
                        whiteSpace: 'nowrap',
                        letterSpacing: '.04em',
                      }}>
                        ★ Müşteri Seçimi
                      </span>
                    )}
                  </div>
                  <div style={{ marginTop: 4, color: '#93c5fd', fontSize: '.74rem', fontWeight: 800 }}>
                    Oncelik #{campaign.priority || 0}
                  </div>
                </div>
                <span style={{
                  padding: '5px 10px',
                  borderRadius: 999,
                  background: palette.labelBg,
                  color: palette.labelColor,
                  fontSize: '.72rem',
                  fontWeight: 900,
                  whiteSpace: 'nowrap',
                }}>
                  {campaign.statusLabel}
                </span>
              </div>

                <div style={{ color: '#cbd5e1', fontSize: '.8rem', lineHeight: 1.55 }}>
                {campaign.description || campaign.requirementLabel || 'Detay belirtilmedi.'}
              </div>

              <div style={{ display: 'grid', gap: 6, marginTop: 'auto' }}>
                {campaign.manualTriggerRequired && typeof onManualTriggerToggle === 'function' ? (
                  <button
                    type="button"
                    onClick={event => {
                      event.stopPropagation()
                      onManualTriggerToggle(campaign)
                    }}
                    style={{
                      border: 'none',
                      borderRadius: 12,
                      padding: '10px 12px',
                      background: campaign.manualTriggerArmed ? 'rgba(34,197,94,.18)' : 'rgba(59,130,246,.18)',
                      color: campaign.manualTriggerArmed ? '#86efac' : '#93c5fd',
                      fontSize: '.76rem',
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                  >
                    {campaign.manualTriggerArmed ? 'Tetiklemeyi kaldir' : 'Manuel tetikle'}
                  </button>
                ) : null}
                <div style={{ color: '#e2e8f0', fontSize: '.77rem', fontWeight: 800 }}>
                  Odul: <span style={{ color: '#fbbf24' }}>{campaign.offer?.offerLabel || 'Manuel uygulama / takip'}</span>
                </div>
                <div style={{ color: '#94a3b8', fontSize: '.74rem', lineHeight: 1.45 }}>
                  Kosul: {campaign.requirementLabel || 'Ek kosul yok'}
                </div>
                <div style={{ color: '#94a3b8', fontSize: '.74rem', lineHeight: 1.45 }}>
                  Hedef: {campaign.audienceLabel || 'Tum musteriler'}
                </div>
                <div style={{ color: '#94a3b8', fontSize: '.74rem', lineHeight: 1.45 }}>
                  Akis: {campaign.applicationModeLabel || 'Kasiyere sor'}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginTop: 2 }}>
                  <span style={{ color: '#93c5fd', fontSize: '.72rem', fontWeight: 800 }}>
                    {campaign.channelLabel}
                  </span>
                  <span style={{ color: '#cbd5e1', fontSize: '.72rem', fontWeight: 700 }}>
                    {campaign.runtimeReason || ''}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
