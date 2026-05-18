function formatMoney(value) {
  const number = Number(value || 0)
  return `₺${number.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatPercent(value) {
  if (value == null) return '—'
  const number = Number(value || 0) * 100
  return `%${number.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`
}

function MetricCard({ label, value, accent, hint }) {
  return (
    <div className="card" style={{ padding: 16, background: '#fff' }}>
      <div style={{ fontSize: '.74rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em' }}>
        {label}
      </div>
      <div style={{ marginTop: 8, fontSize: '1.2rem', fontWeight: 900, color: accent }}>
        {value}
      </div>
      {hint ? (
        <div style={{ marginTop: 8, color: '#64748b', fontSize: '.78rem', lineHeight: 1.5 }}>
          {hint}
        </div>
      ) : null}
    </div>
  )
}

function DetailRow({ row, baseRevenue }) {
  const isNegative = row.mode === 'contra'
  const signedAmount = isNegative ? -Math.abs(Number(row.amount || 0)) : Number(row.amount || 0)

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1.2fr) 140px 100px',
        gap: 10,
        alignItems: 'center',
        padding: '10px 14px',
        borderBottom: '1px solid #f1f5f9',
        background: '#fff',
      }}
    >
      <div style={{ fontWeight: 700, color: '#0f172a' }}>{row.label}</div>
      <div style={{ color: '#64748b', fontSize: '.82rem', lineHeight: 1.4 }}>
        {row.accountLabels?.length ? row.accountLabels.join(', ') : 'Hesap baglantisi bekleniyor'}
      </div>
      <div style={{ textAlign: 'right', fontWeight: 800, color: isNegative ? '#dc2626' : '#0f172a' }}>
        {formatMoney(signedAmount)}
      </div>
      <div style={{ textAlign: 'right', fontSize: '.82rem', fontWeight: 800, color: isNegative ? '#dc2626' : '#475569' }}>
        {formatPercent(baseRevenue ? signedAmount / baseRevenue : null)}
      </div>
    </div>
  )
}

function SummaryRow({ row }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 140px 100px',
        gap: 10,
        alignItems: 'center',
        padding: '12px 14px',
        background: row.emphasis ? '#fee2e2' : '#fef3c7',
        borderTop: '1px solid rgba(180,83,9,.14)',
      }}
    >
      <div style={{ fontWeight: 900, color: row.emphasis ? '#991b1b' : '#92400e' }}>{row.label}</div>
      <div style={{ textAlign: 'right', fontWeight: 900, color: row.emphasis ? '#991b1b' : '#92400e' }}>
        {formatMoney(row.amount)}
      </div>
      <div style={{ textAlign: 'right', fontWeight: 900, color: row.emphasis ? '#991b1b' : '#92400e' }}>
        {formatPercent(row.ratio)}
      </div>
    </div>
  )
}

function SectionHeader({ title }) {
  return (
    <div
      style={{
        padding: '10px 14px',
        background: 'linear-gradient(135deg,#b91c1c,#dc2626)',
        color: '#fff',
        fontWeight: 900,
        letterSpacing: '.06em',
        textTransform: 'uppercase',
      }}
    >
      {title}
    </div>
  )
}

export default function PnLPreviewPanel({ preview, title = 'P&L Raporu Ornegi', subtitle = '' }) {
  if (!preview) return null

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <div style={{ fontSize: '.78rem', fontWeight: 800, color: '#64748b', letterSpacing: '.08em', textTransform: 'uppercase' }}>
          {title}
        </div>
        {subtitle ? (
          <div style={{ marginTop: 6, color: '#475569', fontSize: '.84rem', lineHeight: 1.6 }}>
            {subtitle}
          </div>
        ) : null}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <MetricCard label="Net Gelir" value={formatMoney(preview.totals.revenueTotal)} accent="#1d4ed8" />
        <MetricCard label="Brut Kar" value={formatMoney(preview.totals.grossProfit)} accent="#0f766e" />
        <MetricCard label="Isletme Kar/Zarar" value={formatMoney(preview.totals.operatingProfit)} accent={preview.totals.operatingProfit < 0 ? '#b91c1c' : '#7c3aed'} />
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1.2fr) 140px 100px',
            gap: 10,
            padding: '12px 14px',
            background: '#0f172a',
            color: '#e2e8f0',
            fontSize: '.74rem',
            fontWeight: 800,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
          }}
        >
          <div>P&L Kalemi</div>
          <div>Hesap Cizelgesi Karsiligi</div>
          <div style={{ textAlign: 'right' }}>Tutar</div>
          <div style={{ textAlign: 'right' }}>Net %</div>
        </div>

        {preview.blocks.map(block => (
          <div key={block.id}>
            <SectionHeader title={block.title} />
            {block.rows.map(row => (
              <DetailRow key={row.id} row={row} baseRevenue={preview.baseRevenue} />
            ))}
            {block.summaryRows.map(row => (
              <SummaryRow key={row.id} row={row} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
