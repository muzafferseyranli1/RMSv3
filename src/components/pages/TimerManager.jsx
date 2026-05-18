import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '@/lib/db'
import { useToast } from '@/hooks/useToast'
import Header from '@/components/layout/Header'
import AddButton from '@/components/ui/AddButton'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

// ─── Sabitler ────────────────────────────────────────────────────────────────

const UNITS = [
  { value: 'dakika', label: 'Dakika', mins: 1      },
  { value: 'saat',   label: 'Saat',   mins: 60     },
  { value: 'gun',    label: 'Gün',    mins: 1440   },
  { value: 'hafta',  label: 'Hafta',  mins: 10080  },
  { value: 'ay',     label: 'Ay',     mins: 43200  },
]

const ROW_TYPES = [
  { value: 'sale_item',  label: 'Satış Malı', icon: 'fa-utensils', color: '#fb923c', bg: 'rgba(251,146,60,.15)'  },
  { value: 'stock_item', label: 'Stok Malı',  icon: 'fa-cube',     color: '#34d399', bg: 'rgba(52,211,153,.15)'  },
  { value: 'bakim',      label: 'Bakım',      icon: 'fa-wrench',   color: '#a78bfa', bg: 'rgba(167,139,250,.15)' },
  { value: 'diger',      label: 'Diğer',      icon: 'fa-ellipsis', color: '#64748b', bg: 'rgba(100,116,139,.15)' },
]

const STATUS_FILTERS = [
  { value: 'all',     label: 'Tümü'          },
  { value: 'active',  label: 'Devam Eden'    },
  { value: 'expired', label: 'Süresi Dolan'  },
]

// ─── Yardımcı ────────────────────────────────────────────────────────────────

function toMinutes(value, unit) {
  const u = UNITS.find(u => u.value === unit)
  return parseFloat(value || 0) * (u?.mins || 1)
}

function formatRemaining(remainingMs) {
  if (remainingMs <= 0) return { text: 'Süresi Doldu', short: 'Süresi Doldu', expired: true }
  const totalSec = Math.floor(remainingMs / 1000)
  const days  = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  const mins  = Math.floor((totalSec % 3600) / 60)
  const secs  = totalSec % 60

  // Uzun format
  const longParts = []
  if (days  > 0) longParts.push(`${days} gün`)
  if (hours > 0) longParts.push(`${hours} saat`)
  if (mins  > 0) longParts.push(`${mins} dk`)
  if (longParts.length === 0) longParts.push(`${secs} sn`)
  const text = longParts.join(' ')

  // Kısa format (2+ parça varsa kısalt)
  const shortParts = []
  if (days  > 0) shortParts.push(`${days}g`)
  if (hours > 0) shortParts.push(`${hours}s`)
  if (mins  > 0) shortParts.push(`${mins}dk`)
  if (shortParts.length === 0) shortParts.push(`${secs}sn`)
  const short = shortParts.length > 1 ? shortParts.join(' ') : text

  return { text, short, expired: false }
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

// ─── Aranabilir Dropdown ─────────────────────────────────────────────────────

function SearchableSelect({ items, value, onChange, placeholder = 'Seçin…' }) {
  const [open, setOpen]     = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef()

  const filtered = items.filter(i =>
    i.label.toLowerCase().includes(search.toLowerCase()) ||
    (i.sub || '').toLowerCase().includes(search.toLowerCase())
  )
  const selected = items.find(i => i.value === value)

  useEffect(() => {
    function close(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', zIndex: 10 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', border: `1.5px solid ${open ? '#6366f1' : '#e2e8f0'}`,
          borderRadius: 10, background: '#fff', cursor: 'pointer',
          fontSize: '.88rem', minHeight: 44, transition: 'border-color .15s',
          userSelect: 'none'
        }}
      >
        <span style={{ color: selected ? '#1e293b' : '#94a3b8', fontWeight: selected ? 500 : 400,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected
            ? <>{selected.label}{selected.sub && <span style={{ color: '#94a3b8', marginLeft: 8, fontSize: '.78rem' }}>({selected.sub})</span>}</>
            : placeholder}
        </span>
        <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'}`}
          style={{ fontSize: '.65rem', color: '#94a3b8', flexShrink: 0, marginLeft: 8 }}/>
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 9999,
          background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 12,
          boxShadow: '0 12px 32px rgba(0,0,0,.14)', overflow: 'hidden'
        }}>
          <div style={{ padding: '8px 8px 6px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ position: 'relative' }}>
              <i className="fa-solid fa-magnifying-glass" style={{
                position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                fontSize: '.72rem', color: '#94a3b8', pointerEvents: 'none'
              }}/>
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Ara…"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  border: '1.5px solid #e2e8f0', borderRadius: 8,
                  padding: '7px 10px 7px 30px', fontSize: '.83rem', outline: 'none',
                  transition: 'border-color .15s'
                }}
                onFocus={e => e.target.style.borderColor = '#6366f1'}
                onBlur={e  => e.target.style.borderColor = '#e2e8f0'}
              />
            </div>
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 220 }}>
            {filtered.length === 0
              ? <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '.83rem' }}>Sonuç bulunamadı</div>
              : filtered.map(item => (
                <div
                  key={item.value}
                  onMouseDown={e => { e.preventDefault(); onChange(item.value); setOpen(false); setSearch('') }}
                  style={{
                    padding: '10px 14px', cursor: 'pointer', fontSize: '.85rem',
                    background: item.value === value ? '#eff6ff' : 'transparent',
                    color:      item.value === value ? '#3b82f6' : '#1e293b',
                    borderLeft: `3px solid ${item.value === value ? '#3b82f6' : 'transparent'}`,
                    transition: 'background .1s'
                  }}
                  onMouseEnter={e => { if (item.value !== value) e.currentTarget.style.background = '#f8fafc' }}
                  onMouseLeave={e => { if (item.value !== value) e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ fontWeight: item.value === value ? 700 : 500 }}>{item.label}</div>
                  {item.sub && <div style={{ fontSize: '.73rem', color: '#94a3b8', marginTop: 1 }}>{item.sub}</div>}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sayaç Kartı ─────────────────────────────────────────────────────────────

function TimerCard({ timer, saleItems, stockItems, types, now, onDelete, onRestart, timerNum }) {
  const startedAt   = new Date(timer.started_at).getTime()
  const endAt       = startedAt + timer.duration_minutes * 60000
  const remainingMs = endAt - now
  const pct         = remainingMs <= 0
    ? 100
    : Math.min(100, Math.max(0, ((timer.duration_minutes * 60000 - remainingMs) / (timer.duration_minutes * 60000)) * 100))
  const rem         = formatRemaining(remainingMs)
  const rt           = ROW_TYPES.find(r => r.value === timer.row_type) || ROW_TYPES[0]
  const typeName     = types.find(t => t.id === timer.type_id)?.name || ''

  let itemName = '', itemSub = ''
  if (timer.row_type === 'sale_item') {
    const si = saleItems.find(x => x.id === timer.sale_item_id)
    itemName = si?.name || '—'; itemSub = si?.sku || ''
  } else if (timer.row_type === 'stock_item') {
    const sk = stockItems.find(x => x.id === timer.stock_item_id)
    itemName = sk?.name || '—'; itemSub = sk?.sku || ''
  } else {
    itemName = timer.bakim_name || '—'
  }

  const barColor = rem.expired ? '#ef4444'
    : pct < 50 ? '#22c55e' : pct < 75 ? '#f59e0b' : pct < 90 ? '#fb923c' : '#ef4444'

  return (
    <div style={{
      background: '#fff', borderRadius: 14,
      border: `3px solid ${barColor}`,
      padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12,
      boxShadow: `0 4px 16px ${barColor}33`,
    }}>
      {/* Başlık satırı */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          background: rt.bg, color: rt.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.9rem' }}>
          <i className={`fa-solid ${rt.icon}`}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '.9rem', color: '#1e293b', lineHeight: 1.3,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {itemName}
          </div>
          {itemSub && <div style={{ fontSize: '.72rem', color: '#94a3b8', marginTop: 1 }}>{itemSub}</div>}
          <div style={{ display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
            <span style={{ background: rt.bg, color: rt.color, fontSize: '.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 5 }}>
              {rt.label}
            </span>
            {typeName && (
              <span style={{ background: '#f0f9ff', color: '#0284c7', fontSize: '.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 5 }}>
                {typeName}
              </span>
            )}
          </div>
        </div>

        {/* Numara badge */}
        <div style={{
          width: 44, height: 52, borderRadius: 8, flexShrink: 0,
          border: `3px solid ${barColor}`,
          background: rem.expired ? '#fff5f5' : '#fffff0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 2px 8px ${barColor}55`,
          position: 'relative', overflow: 'hidden'
        }}>
          {/* Sarı zemin efekti */}
          <div style={{
            position: 'absolute', inset: 0,
            background: rem.expired ? '#fee2e2' : '#fef08a',
            opacity: .7
          }}/>
          <span style={{
            position: 'relative', zIndex: 1,
            fontSize: timerNum > 99 ? '1rem' : timerNum > 9 ? '1.3rem' : '1.7rem',
            fontWeight: 900, color: '#1e293b', lineHeight: 1,
            fontVariantNumeric: 'tabular-nums'
          }}>{timerNum}</span>
        </div>

        <button onClick={() => onDelete(timer)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1',
            padding: 4, borderRadius: 6, flexShrink: 0, fontSize: '.8rem', transition: 'color .15s' }}
          onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
          onMouseLeave={e => e.currentTarget.style.color = '#cbd5e1'}>
          <i className="fa-solid fa-trash"/>
        </button>
      </div>

      {/* Gradient progress bar */}
      <div>
        <div style={{
          height: 18, borderRadius: 99, background: '#e2e8f0',
          overflow: 'hidden', position: 'relative',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,.1)'
        }}>
          {/* Tam gradient zemin (yeşil→sarı→turuncu→kırmızı) */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to right, #22c55e 0%, #f59e0b 50%, #fb923c 75%, #ef4444 100%)',
            opacity: .18
          }}/>
          {/* Dolu kısım */}
          <div style={{
            position: 'absolute', top: 0, left: 0, bottom: 0,
            width: `${pct}%`,
            background: `linear-gradient(to right, #22c55e 0%, #f59e0b 50%, #fb923c 80%, #ef4444 100%)`,
            backgroundSize: `${pct > 0 ? (100 / pct) * 100 : 100}% 100%`,
            borderRadius: 99,
            transition: 'width 1s linear',
            boxShadow: `2px 0 6px ${barColor}88`
          }}/>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
          <span style={{ fontSize: '.67rem', color: '#94a3b8' }}>Başlangıç: {fmtDate(timer.started_at)}</span>
          <span style={{ fontSize: '.67rem', color: '#94a3b8' }}>Bitiş: {fmtDate(new Date(endAt).toISOString())}</span>
        </div>
      </div>

      {/* Kalan süre — büyük gösterge */}
      <div style={{
        background: rem.expired ? '#fef2f2' : '#f8fafc',
        borderRadius: 12, padding: '14px 18px',
        border: `1.5px solid ${rem.expired ? '#fecaca' : barColor + '44'}`,
      }}>
        {/* Üst satır: ikon + süre + % */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: rem.expired ? '#fee2e2' : barColor + '18',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <i className={`fa-solid ${rem.expired ? 'fa-circle-xmark' : 'fa-hourglass-half'}`}
              style={{ color: rem.expired ? '#ef4444' : barColor, fontSize: '1.2rem' }}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '.7rem', color: '#94a3b8', fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase' }}>
              Kalan Süre
            </div>
            <div style={{
              fontSize: '1.2rem', fontWeight: 900,
              color: rem.expired ? '#ef4444' : '#1e293b',
              letterSpacing: '-.02em', marginTop: 1,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
            }}>
              {rem.short}
            </div>
          </div>
          {!rem.expired && (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '.67rem', color: '#94a3b8', marginBottom: 2 }}>Tamamlanan</div>
              <div style={{
                fontSize: '1.1rem', fontWeight: 900, color: barColor,
                background: barColor + '15', padding: '2px 10px', borderRadius: 8
              }}>
                {Math.round(pct)}%
              </div>
            </div>
          )}
        </div>

        {/* Süresi dolunca butonlar — kutu içinde */}
        {rem.expired && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              onClick={() => onRestart(timer)}
              style={{
                flex: 1, border: '1.5px solid #6366f1', borderRadius: 9,
                padding: '8px 0', cursor: 'pointer', fontSize: '.8rem', fontWeight: 700,
                background: '#eff6ff', color: '#4f46e5',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'all .15s'
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#6366f1'; e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.color = '#4f46e5' }}>
              <i className="fa-solid fa-rotate-right"/> Baştan Başlat
            </button>
            <button
              onClick={() => onDelete(timer)}
              style={{
                flex: 1, border: '1.5px solid #fecaca', borderRadius: 9,
                padding: '8px 0', cursor: 'pointer', fontSize: '.8rem', fontWeight: 700,
                background: '#fef2f2', color: '#ef4444',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'all .15s'
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#ef4444' }}>
              <i className="fa-solid fa-trash"/> Sil
            </button>
          </div>
        )}
      </div>

      {timer.note && (
        <div style={{ fontSize: '.78rem', color: '#64748b', fontStyle: 'italic',
          borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
          <i className="fa-solid fa-note-sticky" style={{ marginRight: 5, color: '#94a3b8' }}/>
          {timer.note}
        </div>
      )}
    </div>
  )
}

// ─── Liste Satırı ─────────────────────────────────────────────────────────────

function TimerRow({ timer, saleItems, stockItems, types, now, onDelete, onRestart, idx }) {
  const startedAt   = new Date(timer.started_at).getTime()
  const endAt       = startedAt + timer.duration_minutes * 60000
  const remainingMs = endAt - now
  const pct         = remainingMs <= 0
    ? 100
    : Math.min(100, Math.max(0, ((timer.duration_minutes * 60000 - remainingMs) / (timer.duration_minutes * 60000)) * 100))
  const rem         = formatRemaining(remainingMs)
  const rt           = ROW_TYPES.find(r => r.value === timer.row_type) || ROW_TYPES[0]
  const typeName     = types.find(t => t.id === timer.type_id)?.name || '—'

  let itemName = ''
  if (timer.row_type === 'sale_item')       itemName = saleItems.find(x => x.id === timer.sale_item_id)?.name  || '—'
  else if (timer.row_type === 'stock_item') itemName = stockItems.find(x => x.id === timer.stock_item_id)?.name || '—'
  else                                      itemName = timer.bakim_name || '—'

  const barColor = rem.expired ? '#ef4444' : pct < 50 ? '#22c55e' : pct < 75 ? '#f59e0b' : pct < 90 ? '#fb923c' : '#ef4444'

  return (
    <tr style={{
      background: rem.expired ? '#fff5f5' : idx % 2 === 0 ? '#fff' : '#f8fafc',
      borderBottom: '1px solid #f1f5f9',
      borderLeft: `4px solid ${barColor}`
    }}>
      <td style={{ padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 26, height: 26, borderRadius: 7, background: rt.bg, color: rt.color,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '.7rem' }}>
            <i className={`fa-solid ${rt.icon}`}/>
          </span>
          <span style={{ fontSize: '.83rem', fontWeight: 600, color: '#1e293b' }}>{itemName}</span>
        </div>
      </td>
      <td style={{ padding: '10px 14px', fontSize: '.78rem', color: '#64748b' }}>{typeName}</td>
      <td style={{ padding: '10px 14px', minWidth: 160 }}>
        {/* Gradient bar */}
        <div style={{ height: 12, borderRadius: 99, background: '#e2e8f0', overflow: 'hidden', marginBottom: 4, position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, #22c55e, #f59e0b, #fb923c, #ef4444)', opacity: .15 }}/>
          <div style={{
            position: 'absolute', top: 0, left: 0, bottom: 0, width: `${pct}%`,
            background: 'linear-gradient(to right, #22c55e 0%, #f59e0b 50%, #fb923c 80%, #ef4444 100%)',
            backgroundSize: `${pct > 0 ? (100/pct)*100 : 100}% 100%`,
            borderRadius: 99, transition: 'width 1s linear'
          }}/>
        </div>
        <div style={{ fontSize: '.72rem', color: '#94a3b8', fontWeight: 700 }}>{Math.round(pct)}% tamamlandı</div>
      </td>
      <td style={{ padding: '10px 14px', fontSize: '.83rem', fontWeight: 700, color: rem.expired ? '#ef4444' : '#1e293b', whiteSpace: 'nowrap' }}>
        {rem.expired
          ? <><i className="fa-solid fa-circle-xmark" style={{ color: '#ef4444', marginRight: 5 }}/>Süresi Doldu</>
          : <><i className="fa-solid fa-hourglass-half" style={{ color: barColor, marginRight: 5 }}/>{rem.short}</>
        }
      </td>
      <td style={{ padding: '10px 14px', fontSize: '.72rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
        {fmtDate(new Date(endAt).toISOString())}
      </td>
      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
        {rem.expired ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => onRestart(timer)}
              style={{
                border: '1.5px solid #6366f1', borderRadius: 7, padding: '5px 10px',
                cursor: 'pointer', fontSize: '.75rem', fontWeight: 700,
                background: '#eff6ff', color: '#4f46e5',
                display: 'flex', alignItems: 'center', gap: 5, transition: 'all .15s'
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#6366f1'; e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.color = '#4f46e5' }}>
              <i className="fa-solid fa-rotate-right"/>
              Tekrarla
            </button>
            <button onClick={() => onDelete(timer)}
              style={{
                border: '1.5px solid #fecaca', borderRadius: 7, padding: '5px 10px',
                cursor: 'pointer', fontSize: '.75rem', fontWeight: 700,
                background: '#fef2f2', color: '#ef4444',
                display: 'flex', alignItems: 'center', gap: 5, transition: 'all .15s'
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#ef4444' }}>
              <i className="fa-solid fa-trash"/>
              Sil
            </button>
          </div>
        ) : (
          <button onClick={() => onDelete(timer)}
            style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7,
              width: 30, height: 30, cursor: 'pointer', color: '#ef4444', fontSize: '.65rem' }}>
            <i className="fa-solid fa-trash"/>
          </button>
        )}
      </td>
    </tr>
  )
}

// ─── Ana Bileşen ─────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  row_type: 'sale_item',
  sale_item_id: '', stock_item_id: '', bakim_name: '',
  type_id: '',
  dur_value: '', dur_unit: 'gun',
  use_target_date: false,
  target_date: '',
  started_at: '', note: ''
}

export default function TimerManager() {
  const navigate = useNavigate()
  const toast = useToast()
  const [timers, setTimers]         = useState([])
  const [types, setTypes]           = useState([])
  const [defs, setDefs]             = useState([])
  const [saleItems, setSaleItems]   = useState([])
  const [stockItems, setStockItems] = useState([])
  const [loading, setLoading]       = useState(true)
  const [viewMode, setViewMode]     = useState('card')
  const [statusFilter, setStatusFilter] = useState('all')
  const [now, setNow]               = useState(Date.now())

  const [modal, setModal]           = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [saving, setSaving]         = useState(false)
  const [step, setStep]             = useState(0)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [prefillInfo, setPrefillInfo] = useState(null)

  // Tick her 10s
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10000)
    return () => clearInterval(id)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: tm }, { data: ty }, { data: df }, { data: si }, { data: sk }] = await Promise.all([
      db.from('time_tracking_timers').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
      db.from('time_tracking_types').select('*').is('deleted_at', null).order('sort_order'),
      db.from('time_tracking_defs').select('*').is('deleted_at', null),
      db.from('sale_items').select('id,name,sku').is('deleted_at', null).order('name'),
      db.from('stock_items').select('id,name,sku').is('deleted_at', null).order('name'),
    ])
    setTimers(tm || [])
    setTypes(ty || [])
    setDefs(df || [])
    setSaleItems(si || [])
    setStockItems(sk || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── Ön tanım kontrolü ─────────────────────────────────────────────────────
  function checkPrefill(row_type, item_id, type_id, allDefs, allTypes) {
    if (!item_id || !type_id) { setPrefillInfo(null); return null }
    let def = null
    if (row_type === 'sale_item')  def = allDefs.find(d => d.row_type === 'sale_item'  && d.sale_item_id  === item_id)
    if (row_type === 'stock_item') def = allDefs.find(d => d.row_type === 'stock_item' && d.stock_item_id === item_id)
    const cell     = def?.times?.[type_id]
    const typeName = allTypes.find(t => t.id === type_id)?.name || ''
    if (cell?.value) {
      setPrefillInfo({ found: true, value: String(cell.value), unit: cell.unit || 'gun', typeName })
      return { value: String(cell.value), unit: cell.unit || 'gun' }
    }
    setPrefillInfo({ found: false, typeName })
    return null
  }

  // ── Modal aç ──────────────────────────────────────────────────────────────
  function openModal() {
    setForm({ ...EMPTY_FORM, type_id: types[0]?.id || '', started_at: '' })
    setPrefillInfo(null)
    setStep(0)
    setModal(true)
  }

  // ── Adım geçişleri ─────────────────────────────────────────────────────────
  function goStep1() { setStep(1) }

  function goStep2() {
    const { row_type, sale_item_id, stock_item_id, bakim_name, type_id } = form
    if (row_type === 'sale_item'  && !sale_item_id)                            { toast('Satış malı seçin', 'error'); return }
    if (row_type === 'stock_item' && !stock_item_id)                           { toast('Stok malı seçin', 'error'); return }
    if ((row_type === 'bakim' || row_type === 'diger') && !bakim_name.trim()) { toast('Ad girin', 'error'); return }

    const item_id = row_type === 'sale_item' ? sale_item_id : stock_item_id
    const pf = checkPrefill(row_type, item_id, type_id, defs, types)
    if (pf) setForm(f => ({ ...f, dur_value: pf.value, dur_unit: pf.unit }))
    setStep(2)
  }

  // ── Öğe seçilince ─────────────────────────────────────────────────────────
  function handleItemSelect(field, val) {
    const updatedForm = { ...form, [field]: val }
    setForm(updatedForm)
    const item_id = field === 'sale_item_id' ? val : field === 'stock_item_id' ? val : null
    if (item_id && form.type_id) {
      checkPrefill(form.row_type, item_id, form.type_id, defs, types)
    }
  }

  // ── Sayacı başlat ─────────────────────────────────────────────────────────
  async function startTimer() {
    const { row_type, sale_item_id, stock_item_id, bakim_name, type_id,
            dur_value, dur_unit, use_target_date, target_date, started_at, note } = form

    // started_at doluysa kullanıcı manuel girmiş → parse et. Boşsa tam bu an.
    const startMs = started_at ? new Date(started_at).getTime() : Date.now()

    let duration_minutes

    if (use_target_date) {
      if (!target_date) { toast('Hedef tarih ve saat girin', 'error'); return }
      const targetMs = new Date(target_date).getTime()
      if (targetMs <= startMs) { toast('Hedef tarih, başlangıç tarihinden sonra olmalı', 'error'); return }
      duration_minutes = Math.round((targetMs - startMs) / 60000)
    } else {
      if (!dur_value || parseFloat(dur_value) <= 0) { toast('Geçerli bir süre girin', 'error'); return }
      duration_minutes = toMinutes(dur_value, dur_unit)
    }

    if (duration_minutes < 1) { toast('Süre en az 1 dakika olmalı', 'error'); return }

    setSaving(true)
    const { error } = await db.from('time_tracking_timers').insert({
      row_type,
      sale_item_id:  row_type === 'sale_item'  ? sale_item_id  : null,
      stock_item_id: row_type === 'stock_item' ? stock_item_id : null,
      bakim_name:    (row_type === 'bakim' || row_type === 'diger') ? bakim_name.trim() : null,
      type_id:       type_id || null,
      duration_minutes,
      started_at:    new Date(startMs).toISOString(),
      note:          note.trim() || null,
    })
    setSaving(false)
    if (error) { toast('Hata: ' + error.message, 'error'); return }
    setModal(false)
    toast('Sayaç başlatıldı! 🕐', 'success')
    load()
  }

  // ── Sil ───────────────────────────────────────────────────────────────────
  async function deleteTimer(id) {
    await db.from('time_tracking_timers').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    toast('Sayaç silindi', 'info'); setConfirmDel(null); load()
  }

  // ── Baştan Başlat ─────────────────────────────────────────────────────────
  async function restartTimer(timer) {
    const now_ = new Date().toISOString()
    const { error } = await db.from('time_tracking_timers').insert({
      row_type:          timer.row_type,
      sale_item_id:      timer.sale_item_id,
      stock_item_id:     timer.stock_item_id,
      bakim_name:        timer.bakim_name,
      type_id:           timer.type_id,
      duration_minutes:  timer.duration_minutes,
      started_at:        now_,
      note:              timer.note,
    })
    if (error) { toast('Hata: ' + error.message, 'error'); return }
    // Eskisini sil
    await db.from('time_tracking_timers').update({ deleted_at: now_ }).eq('id', timer.id)
    toast('Sayaç yeniden başlatıldı! 🔄', 'success')
    load()
  }

  // ── Filtre & özet ─────────────────────────────────────────────────────────
  const activeCount  = timers.filter(t => new Date(t.started_at).getTime() + t.duration_minutes * 60000 > now).length
  const expiredCount = timers.length - activeCount
  const filtered = timers
    .filter(t => {
      if (statusFilter === 'all') return true
      const expired = new Date(t.started_at).getTime() + t.duration_minutes * 60000 <= now
      return statusFilter === 'expired' ? expired : !expired
    })
    .sort((a, b) => {
      const pctOf = t => {
        const endAt      = new Date(t.started_at).getTime() + t.duration_minutes * 60000
        const remMs      = endAt - now
        if (remMs <= 0) return 100
        return Math.min(100, Math.max(0, ((t.duration_minutes * 60000 - remMs) / (t.duration_minutes * 60000)) * 100))
      }
      return pctOf(b) - pctOf(a)
    })

  // ── Öğe seçenekleri ───────────────────────────────────────────────────────
  const itemOptions =
    form.row_type === 'sale_item'  ? saleItems.map(x  => ({ value: x.id, label: x.name, sub: x.sku })) :
    form.row_type === 'stock_item' ? stockItems.map(x => ({ value: x.id, label: x.name, sub: x.sku })) :
    []

  // ── Adım çubuğu ───────────────────────────────────────────────────────────
  const StepBar = () => (
    <div style={{ display: 'flex', marginBottom: 24 }}>
      {['Tip Seç', 'Öğe Seç', 'Süre & Başlat'].map((label, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
            {i > 0 && <div style={{ flex: 1, height: 2.5, background: step > i - 1 ? '#6366f1' : '#e2e8f0', transition: 'background .25s' }}/>}
            <div style={{
              width: 28, height: 28, borderRadius: 99, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '.72rem', fontWeight: 700,
              background: step >= i ? '#6366f1' : '#e2e8f0',
              color: step >= i ? '#fff' : '#94a3b8',
              transition: 'all .25s'
            }}>
              {step > i ? <i className="fa-solid fa-check"/> : i + 1}
            </div>
            {i < 2 && <div style={{ flex: 1, height: 2.5, background: step > i ? '#6366f1' : '#e2e8f0', transition: 'background .25s' }}/>}
          </div>
          <span style={{ fontSize: '.68rem', fontWeight: step === i ? 700 : 500, color: step >= i ? '#6366f1' : '#94a3b8' }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="page-enter">
      <Header
        title="Zaman Sayaçları"
        subtitle="Ürün, bakım ve diğer işlemler için geri sayım sayaçları"
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-g" style={{ fontSize: '.83rem' }} onClick={() => navigate('/time-tracking/timers/presets')}>
              <i className="fa-solid fa-sliders"/> Ön Ayarlar
            </button>
            <AddButton onClick={openModal} label="Yeni Zaman Sayacı Ekle" />
          </div>
        }
      />

      {/* Özet kartlar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Toplam',        value: timers.length,  icon: 'fa-stopwatch',      color: '#6366f1', bg: '#f0f0ff' },
          { label: 'Devam Eden',    value: activeCount,    icon: 'fa-hourglass-half', color: '#22c55e', bg: '#f0fdf4' },
          { label: 'Süresi Dolan', value: expiredCount,   icon: 'fa-circle-xmark',   color: '#ef4444', bg: '#fef2f2' },
        ].map(s => (
          <div key={s.label} style={{
            background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 12,
            padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12, minWidth: 150
          }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: s.bg, color: s.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.9rem' }}>
              <i className={`fa-solid ${s.icon}`}/>
            </div>
            <div>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#1e293b', lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: '.72rem', color: '#94a3b8', marginTop: 2 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Araç çubuğu */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 3, background: '#f1f5f9', borderRadius: 9, padding: 3 }}>
          {STATUS_FILTERS.map(sf => (
            <button key={sf.value} onClick={() => setStatusFilter(sf.value)}
              style={{
                border: 'none', borderRadius: 7, padding: '6px 14px', cursor: 'pointer',
                fontSize: '.79rem', fontWeight: statusFilter === sf.value ? 700 : 500,
                background: statusFilter === sf.value ? '#fff' : 'transparent',
                color: statusFilter === sf.value ? '#1e293b' : '#64748b',
                boxShadow: statusFilter === sf.value ? '0 1px 4px rgba(0,0,0,.08)' : 'none',
                transition: 'all .15s'
              }}>
              {sf.label}
              {sf.value !== 'all' && (
                <span style={{ marginLeft: 5, background: '#e2e8f0', borderRadius: 99, padding: '1px 6px', fontSize: '.7rem', fontWeight: 700 }}>
                  {sf.value === 'active' ? activeCount : expiredCount}
                </span>
              )}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 3, background: '#f1f5f9', borderRadius: 9, padding: 3 }}>
          {[{ mode: 'card', icon: 'fa-grip' }, { mode: 'list', icon: 'fa-list' }].map(v => (
            <button key={v.mode} onClick={() => setViewMode(v.mode)}
              style={{
                border: 'none', borderRadius: 7, width: 34, height: 34, cursor: 'pointer',
                background: viewMode === v.mode ? '#fff' : 'transparent',
                color: viewMode === v.mode ? '#6366f1' : '#94a3b8',
                boxShadow: viewMode === v.mode ? '0 1px 4px rgba(0,0,0,.08)' : 'none',
                transition: 'all .15s', fontSize: '.85rem'
              }}>
              <i className={`fa-solid ${v.icon}`}/>
            </button>
          ))}
        </div>
      </div>

      {/* İçerik */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
          <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '1.5rem' }}/>
          <div style={{ marginTop: 10, fontSize: '.85rem' }}>Yükleniyor…</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: '#f1f5f9',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: '1.6rem' }}>
            <i className="fa-regular fa-clock"/>
          </div>
          <div style={{ fontWeight: 700, color: '#64748b', marginBottom: 6 }}>
            {statusFilter === 'all' ? 'Henüz sayaç eklenmedi' : 'Bu filtrede sayaç yok'}
          </div>
          {statusFilter === 'all' && (
            <button className="btn-p" style={{ fontSize: '.83rem', marginTop: 8 }} onClick={openModal}>
              <i className="fa-solid fa-plus"/> İlk Sayacı Ekle
            </button>
          )}
        </div>
      ) : viewMode === 'card' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {filtered.map(t => (
            <TimerCard key={t.id} timer={t}
              saleItems={saleItems} stockItems={stockItems}
              types={types} now={now} onDelete={setConfirmDel}
              onRestart={restartTimer}
              timerNum={timers.findIndex(x => x.id === t.id) + 1}/>
          ))}
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0' }}>
                {['Öğe', 'Tür', 'İlerleme', 'Kalan Süre', 'Bitiş', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left',
                    fontSize: '.72rem', fontWeight: 700, color: '#64748b',
                    letterSpacing: '.04em', textTransform: 'uppercase' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, i) => (
                <TimerRow key={t.id} timer={t} idx={i}
                  saleItems={saleItems} stockItems={stockItems}
                  types={types} now={now}
                  onDelete={setConfirmDel}
                  onRestart={restartTimer}/>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal ── */}
      <Modal open={modal} onClose={() => setModal(false)} width={600} flex
        title="Yeni Zaman Sayacı"
        footer={
          step === 2
            ? <>
                <button className="btn-g" onClick={() => setStep(1)}>← Geri</button>
                <button className="btn-p" onClick={startTimer} disabled={saving}>
                  {saving
                    ? <><i className="fa-solid fa-spinner fa-spin"/> Başlatılıyor…</>
                    : <><i className="fa-solid fa-play"/> Sayacı Başlat &raquo;</>}
                </button>
              </>
            : <>
                <button className="btn-g" onClick={() => { if (step === 0) setModal(false); else setStep(s => s - 1) }}>
                  {step === 0 ? 'İptal' : '← Geri'}
                </button>
                <button className="btn-p" onClick={step === 0 ? goStep1 : goStep2}>İleri →</button>
              </>
        }>

        <StepBar/>

        {/* ─ Adım 0: Tip Seç ─ */}
        {step === 0 && (
          <div style={{ display: 'grid', gap: 20 }}>
            <div>
              <label className="f-label" style={{ marginBottom: 10, display: 'block' }}>Sayaç Tipi</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {ROW_TYPES.map(rt => (
                  <label key={rt.value} style={{ cursor: 'pointer' }}>
                    <input type="radio" name="row_type_modal" value={rt.value}
                      checked={form.row_type === rt.value}
                      onChange={() => setForm(f => ({
                        ...f, row_type: rt.value,
                        sale_item_id: '', stock_item_id: '', bakim_name: ''
                      }))}
                      style={{ display: 'none' }}/>
                    <div style={{
                      padding: '16px 14px', borderRadius: 12, textAlign: 'center',
                      border: `2px solid ${form.row_type === rt.value ? rt.color : '#e2e8f0'}`,
                      background: form.row_type === rt.value ? rt.bg : '#fafafa',
                      transition: 'all .15s', cursor: 'pointer'
                    }}>
                      <i className={`fa-solid ${rt.icon}`}
                        style={{ fontSize: '1.4rem', color: rt.color, marginBottom: 8, display: 'block' }}/>
                      <div style={{ fontSize: '.85rem', fontWeight: 700,
                        color: form.row_type === rt.value ? rt.color : '#64748b' }}>
                        {rt.label}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {types.length > 0 && (
              <div>
                <label className="f-label">Sayaç Türü (Sütun)</label>
                <div className="sel-wrap">
                  <select className="f-input" value={form.type_id}
                    onChange={e => setForm(f => ({ ...f, type_id: e.target.value }))}>
                    <option value="">— Seçin (isteğe bağlı) —</option>
                    {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div style={{ fontSize: '.72rem', color: '#94a3b8', marginTop: 5 }}>
                  ör. SKT, Raf Ömrü — Ön Ayarlar ekranında oluşturduğunuz sütunlar
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─ Adım 1: Öğe Seç ─ */}
        {step === 1 && (
          <div style={{ display: 'grid', gap: 18 }}>
            {(form.row_type === 'sale_item' || form.row_type === 'stock_item') ? (
              <div>
                <label className="f-label">
                  {form.row_type === 'sale_item' ? 'Satış Malı' : 'Stok Malı'}
                  <span style={{ color: '#ef4444' }}> *</span>
                </label>
                <SearchableSelect
                  items={itemOptions}
                  value={form.row_type === 'sale_item' ? form.sale_item_id : form.stock_item_id}
                  onChange={val => handleItemSelect(
                    form.row_type === 'sale_item' ? 'sale_item_id' : 'stock_item_id',
                    val
                  )}
                  placeholder={form.row_type === 'sale_item' ? 'Satış malı seçin veya arayın…' : 'Stok malı seçin veya arayın…'}
                />
              </div>
            ) : (
              <div>
                <label className="f-label">
                  {form.row_type === 'bakim' ? 'Bakım Adı' : 'Tanım Adı'}
                  <span style={{ color: '#ef4444' }}> *</span>
                </label>
                <input className="f-input" value={form.bakim_name}
                  onChange={e => setForm(f => ({ ...f, bakim_name: e.target.value }))}
                  placeholder={form.row_type === 'bakim' ? 'ör. Klima filtre değişimi…' : 'Serbest giriş yapın…'}
                  style={{ fontSize: '.88rem' }}/>
              </div>
            )}

            {prefillInfo && (
              <div style={{
                background: prefillInfo.found ? '#f0fdf4' : '#fff7ed',
                border: `1px solid ${prefillInfo.found ? '#bbf7d0' : '#fed7aa'}`,
                borderRadius: 10, padding: '12px 16px', fontSize: '.82rem',
                color: prefillInfo.found ? '#166534' : '#92400e',
                display: 'flex', gap: 10, alignItems: 'flex-start'
              }}>
                <i className={`fa-solid ${prefillInfo.found ? 'fa-circle-check' : 'fa-circle-info'}`}
                  style={{ marginTop: 1, flexShrink: 0 }}/>
                {prefillInfo.found
                  ? <span>
                      <strong>{prefillInfo.typeName}</strong> ön tanımı bulundu:{' '}
                      <strong>{prefillInfo.value} {UNITS.find(u => u.value === prefillInfo.unit)?.label}</strong>.
                      Sonraki adımda değiştirebilirsiniz.
                    </span>
                  : <span>
                      <strong>{prefillInfo.typeName}</strong> için ön tanım yok.
                      Süreyi sonraki adımda manuel gireceksiniz.
                    </span>
                }
              </div>
            )}
          </div>
        )}

        {/* ─ Adım 2: Süre & Başlat ─ */}
        {step === 2 && (
          <div style={{ display: 'grid', gap: 18 }}>

            {/* Başlangıç zamanı */}
            <div>
              <label className="f-label">Başlangıç Zamanı</label>
              <input className="f-input" type="datetime-local" value={form.started_at}
                onChange={e => setForm(f => ({ ...f, started_at: e.target.value }))}/>
              <div style={{ fontSize: '.72rem', color: '#94a3b8', marginTop: 5 }}>
                Boş bırakırsanız "Sayacı Başlat" butonuna bastığınız an kullanılır
              </div>
            </div>

            {/* Hedef tarih checkbox */}
            <div style={{
              background: form.use_target_date ? '#fdf4ff' : '#f8fafc',
              border: `1.5px solid ${form.use_target_date ? '#d946ef' : '#e2e8f0'}`,
              borderRadius: 12, padding: '14px 16px', transition: 'all .2s'
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                <div style={{
                  width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                  border: `2px solid ${form.use_target_date ? '#d946ef' : '#cbd5e1'}`,
                  background: form.use_target_date ? '#d946ef' : '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all .15s'
                }}>
                  {form.use_target_date && <i className="fa-solid fa-check" style={{ fontSize: '.6rem', color: '#fff' }}/>}
                </div>
                <input type="checkbox" checked={form.use_target_date}
                  onChange={e => setForm(f => ({ ...f, use_target_date: e.target.checked, target_date: '', dur_value: '', dur_unit: 'gun' }))}
                  style={{ display: 'none' }}/>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '.85rem', color: form.use_target_date ? '#86198f' : '#475569' }}>
                    <i className="fa-solid fa-calendar-check" style={{ marginRight: 6, color: form.use_target_date ? '#d946ef' : '#94a3b8' }}/>
                    Hedef tarih ve saat girin
                  </div>
                  <div style={{ fontSize: '.72rem', color: '#94a3b8', marginTop: 2 }}>
                    İşaretlenirse daha önce yapılan ön tanımlar yok sayılır, hedef tarihe göre geri sayım başlar
                  </div>
                </div>
              </label>

              {form.use_target_date && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #f0abfc' }}>
                  <label className="f-label" style={{ color: '#86198f' }}>
                    Hedef Tarih ve Saat <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input className="f-input" type="datetime-local"
                    value={form.target_date}
                    min={form.started_at}
                    onChange={e => setForm(f => ({ ...f, target_date: e.target.value }))}
                    style={{ borderColor: '#d946ef' }}/>
                  {form.target_date && form.started_at && (() => {
                    const startMs  = new Date(form.started_at).getTime()
                    const targetMs = new Date(form.target_date).getTime()
                    const mins     = Math.round((targetMs - startMs) / 60000)
                    if (mins <= 0) return (
                      <div style={{ fontSize: '.75rem', color: '#ef4444', marginTop: 5, fontWeight: 600 }}>
                        <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 4 }}/>
                        Hedef tarih, başlangıç tarihinden sonra olmalı
                      </div>
                    )
                    const rem = formatRemaining(mins)
                    return (
                      <div style={{ fontSize: '.75rem', color: '#86198f', marginTop: 5, fontWeight: 600 }}>
                        <i className="fa-solid fa-hourglass-half" style={{ marginRight: 4 }}/>
                        Geri sayım süresi: <strong>{rem.text}</strong> ({mins.toLocaleString('tr-TR')} dakika)
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>

            {/* Süre girişi — hedef tarih seçilmemişse göster */}
            {!form.use_target_date && (
              <div>
                <label className="f-label">Süre <span style={{ color: '#ef4444' }}>*</span></label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <input className="f-input" type="number" min="0.1" step="any"
                    value={form.dur_value}
                    onChange={e => setForm(f => ({ ...f, dur_value: e.target.value }))}
                    placeholder="ör. 7"
                    style={{ flex: '0 0 140px', fontSize: '.9rem' }}/>
                  <div className="sel-wrap" style={{ flex: 1 }}>
                    <select className="f-input" value={form.dur_unit}
                      onChange={e => setForm(f => ({ ...f, dur_unit: e.target.value }))}>
                      {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                    </select>
                  </div>
                </div>
                {form.dur_value && parseFloat(form.dur_value) > 0 && (
                  <div style={{ fontSize: '.75rem', color: '#6366f1', marginTop: 5, fontWeight: 600 }}>
                    = {toMinutes(form.dur_value, form.dur_unit).toLocaleString('tr-TR')} dakika
                  </div>
                )}
              </div>
            )}

            {/* Tahmini bitiş (süre modunda) */}
            {!form.use_target_date && form.dur_value && parseFloat(form.dur_value) > 0 && form.started_at && (
              <div style={{
                background: '#eff6ff', border: '1px solid #bfdbfe',
                borderRadius: 10, padding: '12px 16px', fontSize: '.82rem', color: '#1d4ed8'
              }}>
                <i className="fa-solid fa-flag-checkered" style={{ marginRight: 8 }}/>
                <strong>Tahmini bitiş:</strong>{' '}
                {fmtDate(new Date(
                  new Date(form.started_at).getTime() + toMinutes(form.dur_value, form.dur_unit) * 60000
                ).toISOString())}
              </div>
            )}

            {/* Not */}
            <div>
              <label className="f-label">Not (isteğe bağlı)</label>
              <input className="f-input" value={form.note}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                placeholder="ör. 2. kat deposu, parti no: 2024-03…"/>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!confirmDel}
        title="Bu sayaç silinsin mi?"
        message="Sayaç kalıcı olarak kaldırılacak."
        onConfirm={() => deleteTimer(confirmDel.id)}
        onCancel={() => setConfirmDel(null)}/>
    </div>
  )
}
