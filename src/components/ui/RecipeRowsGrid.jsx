import StockSearchSelect from '@/components/ui/StockSearchSelect'

const UNIT_SHORT = {
  adet: 'ad',
  gram: 'gr',
  kilogram: 'kg',
  mililitre: 'ml',
  litre: 'lt',
  santilitre: 'cl',
  porsiyon: 'por',
}

function getUnitShort(unit) {
  const normalized = String(unit || '').toLowerCase()
  return UNIT_SHORT[normalized] || normalized.substring(0, 2) || '-'
}

function summarizeChannels(selectedIds, activeChannels) {
  const selected = activeChannels.filter(channel => (selectedIds || []).includes(channel.id))
  if (selected.length === 0) return 'Sec...'
  if (selected.length === activeChannels.length && activeChannels.length > 0) return 'Tumu'
  return selected.map(channel => channel.name.substring(0, 1)).join(',')
}

function cellStyle(extra = {}) {
  return {
    padding: '0',
    borderRight: '1px solid #e2e8f0',
    borderBottom: '1px solid #f1f5f9',
    verticalAlign: 'middle',
    background: '#fff',
    ...extra,
  }
}

function inputStyle(extra = {}) {
  return {
    width: '100%',
    height: 28,
    border: '1px solid transparent',
    borderRadius: 0,
    padding: '4px 6px',
    fontSize: '.76rem',
    fontWeight: 600,
    background: 'transparent',
    color: '#334155',
    boxSizing: 'border-box',
    outline: 'none',
    ...extra,
  }
}

function normalizeDecimalInput(value) {
  return String(value ?? '').replace(',', '.').replace(/[^\d.]/g, '')
}

function formatDecimal(value, digits = 4) {
  const normalized = Number.parseFloat(String(value ?? '').replace(',', '.'))
  if (!Number.isFinite(normalized)) return (0).toFixed(digits)
  return normalized.toFixed(digits)
}

export default function RecipeRowsGrid({
  title = 'Recete Satirlari',
  itemLabel = 'Malzeme',
  rows = [],
  activeChannels = [],
  activePorts = [],
  stockItems = [],
  semiItems = [],
  onAddRow,
  onRemoveRow,
  onUpdateRow,
  onToggleRowArray,
  onSelectItem,
  getRowItemValue,
  calcUsed,
  calcCost,
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="fa-solid fa-calculator" style={{ color: '#6366f1', fontSize: '.76rem' }} />
          <span style={{ fontWeight: 800, fontSize: '.72rem', color: '#6366f1', textTransform: 'uppercase', letterSpacing: '.08em' }}>{title}</span>
          {rows.length > 0 && (
            <span style={{ color: '#4f46e5', fontSize: '.72rem', fontWeight: 800 }}>
              {rows.length}
            </span>
          )}
        </div>
        <button className="btn-p" style={{ fontSize: '.78rem', padding: '8px 12px' }} onClick={onAddRow}>
          <i className="fa-solid fa-plus" /> Satir Ekle
        </button>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: 10, border: '1.5px dashed #e2e8f0', fontSize: '.83rem' }}>
          Henuz recete satiri yok. "Satir Ekle" ile baslayin.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 840, borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: '.76rem' }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <th style={{ width: 32, padding: '6px 6px', textAlign: 'center', color: '#64748b', fontWeight: 700, borderRight: '1px solid #e2e8f0', borderBottom: '2px solid #e2e8f0' }}>#</th>
                <th style={{ width: 168, padding: '6px 10px', textAlign: 'left', color: '#64748b', fontWeight: 700, borderRight: '1px solid #e2e8f0', borderBottom: '2px solid #e2e8f0' }}>{itemLabel}</th>
                <th style={{ width: 40, padding: '6px 6px', textAlign: 'left', color: '#64748b', fontWeight: 700, borderRight: '1px solid #e2e8f0', borderBottom: '2px solid #e2e8f0' }}>Br</th>
                <th style={{ width: 88, padding: '6px 8px', textAlign: 'left', color: '#64748b', fontWeight: 700, borderRight: '1px solid #e2e8f0', borderBottom: '2px solid #e2e8f0' }}>Sat. Kan.</th>
                <th style={{ width: 88, padding: '6px 8px', textAlign: 'left', color: '#64748b', fontWeight: 700, borderRight: '1px solid #e2e8f0', borderBottom: '2px solid #e2e8f0' }}>Boyut</th>
                <th style={{ width: 84, padding: '6px 8px', textAlign: 'right', color: '#475569', fontWeight: 700, borderRight: '1px solid #e2e8f0', borderBottom: '2px solid #e2e8f0', borderLeft: '1px solid #e2e8f0' }}>Kul.</th>
                <th style={{ width: 84, padding: '6px 8px', textAlign: 'right', color: '#475569', fontWeight: 700, borderRight: '1px solid #e2e8f0', borderBottom: '2px solid #e2e8f0', borderLeft: '1px solid #e2e8f0' }}>Birim</th>
                <th style={{ width: 56, padding: '6px 8px', textAlign: 'right', color: '#475569', fontWeight: 700, borderRight: '1px solid #e2e8f0', borderBottom: '2px solid #e2e8f0', borderLeft: '1px solid #e2e8f0' }}>Fire %</th>
                <th style={{ width: 78, padding: '6px 8px', textAlign: 'right', color: '#475569', fontWeight: 700, borderRight: '1px solid #e2e8f0', borderBottom: '2px solid #e2e8f0', borderLeft: '1px solid #e2e8f0' }}>Kul.*</th>
                <th style={{ width: 78, padding: '6px 8px', textAlign: 'right', color: '#475569', fontWeight: 700, borderRight: '1px solid #e2e8f0', borderBottom: '2px solid #e2e8f0', borderLeft: '1px solid #e2e8f0' }}>Maliyet</th>
                <th style={{ width: 28, padding: '6px 4px', borderBottom: '2px solid #e2e8f0' }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const used = calcUsed(row.qty, row.waste_pct)
                const cost = calcCost(row.cost, used)
                const portionValue = (row.portions || [])[0] || '__standart__'
                const channelText = summarizeChannels(row.channels, activeChannels)

                return (
                  <tr key={row.id} style={{ borderBottom: '1px solid #f1f5f9', background: index % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={cellStyle({ textAlign: 'center', color: '#94a3b8', fontWeight: 700 })}>{index + 1}</td>
                    <td style={cellStyle()}>
                      <div style={{ padding: '2px 4px' }}>
                        <StockSearchSelect
                          value={getRowItemValue(row)}
                          onChange={value => onSelectItem(index, value)}
                          stockItems={stockItems}
                          semiItems={semiItems}
                          compact
                        />
                      </div>
                    </td>
                    <td style={cellStyle({ padding: '6px 8px', fontSize: '.75rem', color: '#64748b', fontWeight: 600 })}>{getUnitShort(row.unit)}</td>
                    <td style={cellStyle()}>
                      <details style={{ position: 'relative' }} className="ch-select">
                        <summary style={{ ...inputStyle({ listStyle: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }) }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{channelText}</span>
                          <i className="fa-solid fa-chevron-down" style={{ fontSize: '.6rem', color: '#94a3b8' }} />
                        </summary>
                        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 50, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: 6, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 150, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', marginTop: 2 }}>
                          {activeChannels.map(channel => (
                            <label key={channel.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.72rem', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={(row.channels || []).includes(channel.id)}
                                onChange={() => onToggleRowArray(index, 'channels', channel.id)}
                                style={{ accentColor: '#6366f1', width: 12, height: 12 }}
                              />
                              {channel.name}
                            </label>
                          ))}
                        </div>
                      </details>
                    </td>
                    <td style={cellStyle()}>
                      <select
                        className="f-input"
                        style={inputStyle({ cursor: 'pointer' })}
                        value={portionValue}
                        onChange={event => onUpdateRow(index, 'portions', [event.target.value])}
                      >
                        <option value="__standart__">Standart</option>
                        {activePorts.map(portion => (
                          <option key={portion.id} value={portion.id}>{portion.name}</option>
                        ))}
                      </select>
                    </td>
                    <td style={cellStyle()}>
                      <input
                        className="f-input"
                        type="text"
                        inputMode="decimal"
                        style={inputStyle({ textAlign: 'right', fontFamily: 'monospace', letterSpacing: 0 })}
                        value={row.qty}
                        onChange={event => onUpdateRow(index, 'qty', normalizeDecimalInput(event.target.value))}
                        onBlur={event => onUpdateRow(index, 'qty', formatDecimal(event.target.value))}
                      />
                    </td>
                    <td style={cellStyle()}>
                      <input
                        className="f-input"
                        type="text"
                        inputMode="decimal"
                        style={inputStyle({ textAlign: 'right', fontFamily: 'monospace', letterSpacing: 0 })}
                        value={row.cost}
                        onChange={event => onUpdateRow(index, 'cost', normalizeDecimalInput(event.target.value))}
                        onBlur={event => onUpdateRow(index, 'cost', formatDecimal(event.target.value))}
                      />
                    </td>
                    <td style={cellStyle()}>
                      <div style={{ position: 'relative' }}>
                        <input
                          className="f-input"
                          type="text"
                          inputMode="decimal"
                          style={inputStyle({ textAlign: 'right', paddingRight: 18 })}
                          value={row.waste_pct}
                          onChange={event => onUpdateRow(index, 'waste_pct', normalizeDecimalInput(event.target.value))}
                        />
                        <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: '.65rem', color: '#94a3b8' }}>%</span>
                      </div>
                    </td>
                    <td style={cellStyle({ padding: '6px 8px', textAlign: 'right', borderLeft: '1px solid #e2e8f0' })}>
                      <span style={{ fontFamily: 'monospace', fontSize: '.8rem', fontWeight: 800, color: '#2563eb' }}>{used}</span>
                    </td>
                    <td style={cellStyle({ padding: '6px 8px', textAlign: 'right', borderLeft: '1px solid #e2e8f0' })}>
                      <span style={{ fontFamily: 'monospace', fontSize: '.8rem', fontWeight: 800, color: '#2563eb' }}>{cost}</span>
                    </td>
                    <td style={cellStyle({ textAlign: 'center', borderRight: 'none' })}>
                      <button className="ico-btn del" style={{ width: 22, height: 22, border: 'none', background: 'transparent', boxShadow: 'none' }} onClick={() => onRemoveRow(index)}>
                        <i className="fa-solid fa-trash" style={{ fontSize: '.65rem' }} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
