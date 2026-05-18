import { useState, useRef, useEffect } from 'react'

/**
 * StockSearchSelect — Arama destekli stok/yarımamul seçici
 * Props:
 *   value        — seçili item id
 *   onChange     — (id) => void
 *   stockItems   — [{id, name, sku, unit}]
 *   semiItems    — [{id, name, sku, unit}]
 *   disabled     — bool
 */
export default function StockSearchSelect({ value, onChange, stockItems = [], semiItems = [], disabled = false, compact = false }) {
  const [open, setOpen]     = useState(false)
  const [query, setQuery]   = useState('')
  const wrapRef             = useRef()
  const inputRef            = useRef()

  // Dışarı tıklanınca kapat
  useEffect(() => {
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Açılınca input'a odaklan
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus()
      setQuery('')
    }
  }, [open])

  const allItems = [
    ...stockItems.map(x => ({ ...x, _type: 'stock' })),
    ...semiItems.map(x => ({ ...x, _type: 'semi' })),
  ]

  const selected = allItems.find(x => x.id === value)

  const q = query.toLowerCase()
  const filtStock = stockItems.filter(x => !q || x.name.toLowerCase().includes(q) || (x.sku||'').toLowerCase().includes(q))
  const filtSemi  = semiItems.filter(x  => !q || x.name.toLowerCase().includes(q) || (x.sku||'').toLowerCase().includes(q))

  function select(id) {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      {/* Trigger */}
      <div
        onClick={() => !disabled && setOpen(o => !o)}
        style={{
          border: compact ? `1px solid ${open ? '#cbd5e1' : 'transparent'}` : `1.5px solid ${open ? '#fbbf24' : '#c4cdd9'}`,
          borderRadius: compact ? 0 : 8,
          padding: compact ? '4px 22px 4px 6px' : '7px 30px 7px 10px',
          fontSize: compact ? '.78rem' : '.83rem',
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: disabled ? '#f8fafc' : compact ? 'transparent' : '#fff',
          minHeight: compact ? 28 : 36,
          display: 'flex',
          alignItems: 'center',
          userSelect: 'none', position: 'relative',
          color: selected ? (selected._type === 'semi' ? '#7c3aed' : '#0f172a') : '#94a3b8',
          fontStyle: selected?._type === 'semi' ? 'italic' : 'normal',
          boxShadow: compact ? 'none' : 'inset 0 1px 3px rgba(0,0,0,.06)',
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        }}>
        {selected
          ? <>{selected._type === 'semi' && <span style={{ marginRight: 4, color: '#7c3aed' }}>⬡</span>}{selected.name}</>
          : 'Seçin…'
        }
        <i className="fa-solid fa-chevron-down" style={{
          position: 'absolute', right: compact ? 6 : 9, top: '50%', transform: `translateY(-50%) rotate(${open?180:0}deg)`,
          color: '#94a3b8', fontSize: '.6rem', transition: 'transform .15s', pointerEvents: 'none'
        }}/>
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: 'calc(100% + 3px)',
          background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,.13)', zIndex: 999, overflow: 'hidden'
        }}>
          {/* Arama */}
          <div style={{ padding: '7px 10px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 7 }}>
            <i className="fa-solid fa-magnifying-glass" style={{ color: '#94a3b8', fontSize: '.75rem', flexShrink: 0 }}/>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onClick={e => e.stopPropagation()}
              placeholder="Ara…"
              style={{
                border: 'none', outline: 'none', fontSize: '.82rem',
                flex: 1, background: 'transparent', color: '#0f172a'
              }}
            />
            {query && (
              <button onClick={e => { e.stopPropagation(); setQuery('') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '.75rem', padding: 0 }}>
                <i className="fa-solid fa-xmark"/>
              </button>
            )}
          </div>

          {/* Liste */}
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {/* Temizle seçeneği */}
            {value && (
              <div onClick={() => select('')}
                style={{ padding: '7px 12px', cursor: 'pointer', fontSize: '.78rem', color: '#94a3b8',
                  borderBottom: '1px solid #f8fafc', display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={e => e.currentTarget.style.background='#fef2f2'}
                onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                <i className="fa-solid fa-xmark" style={{ fontSize: '.65rem' }}/> Seçimi Temizle
              </div>
            )}

            {/* Stok Malları */}
            {filtStock.length > 0 && (
              <>
                <div style={{ padding: '5px 12px 3px', fontSize: '.65rem', fontWeight: 800,
                  color: '#94a3b8', letterSpacing: '.1em', textTransform: 'uppercase',
                  background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                  Stok Malları ({filtStock.length})
                </div>
                {filtStock.map(x => (
                  <div key={x.id} onClick={() => select(x.id)}
                    style={{
                      padding: '7px 12px', cursor: 'pointer', fontSize: '.82rem',
                      background: x.id === value ? '#fffbeb' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      borderBottom: '1px solid #f8fafc',
                    }}
                    onMouseEnter={e => { if (x.id !== value) e.currentTarget.style.background='#f8fafc' }}
                    onMouseLeave={e => { if (x.id !== value) e.currentTarget.style.background='transparent' }}>
                    <span style={{ fontWeight: x.id === value ? 700 : 400, color: '#0f172a' }}>{x.name}</span>
                    {x.sku && <span style={{ fontSize: '.68rem', color: '#94a3b8', background: '#f1f5f9',
                      padding: '1px 6px', borderRadius: 4, marginLeft: 6, flexShrink: 0 }}>{x.sku}</span>}
                  </div>
                ))}
              </>
            )}

            {/* Yarımamul */}
            {filtSemi.length > 0 && (
              <>
                <div style={{ padding: '5px 12px 3px', fontSize: '.65rem', fontWeight: 800,
                  color: '#7c3aed', letterSpacing: '.1em', textTransform: 'uppercase',
                  background: '#fdf4ff', borderBottom: '1px solid #f3e8ff',
                  borderTop: filtStock.length > 0 ? '2px solid #e2e8f0' : 'none' }}>
                  ⬡ Yarımamul ({filtSemi.length})
                </div>
                {filtSemi.map(x => (
                  <div key={x.id} onClick={() => select(x.id)}
                    style={{
                      padding: '7px 12px', cursor: 'pointer', fontSize: '.82rem',
                      background: x.id === value ? '#ede9fe' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      borderBottom: '1px solid #f8fafc',
                      color: '#6d28d9', fontStyle: 'italic',
                    }}
                    onMouseEnter={e => { if (x.id !== value) e.currentTarget.style.background='#fdf4ff' }}
                    onMouseLeave={e => { if (x.id !== value) e.currentTarget.style.background='transparent' }}>
                    <span style={{ fontWeight: x.id === value ? 700 : 400 }}>⬡ {x.name}</span>
                    {x.sku && <span style={{ fontSize: '.68rem', color: '#a78bfa', background: '#ede9fe',
                      padding: '1px 6px', borderRadius: 4, marginLeft: 6, flexShrink: 0 }}>{x.sku}</span>}
                  </div>
                ))}
              </>
            )}

            {/* Sonuç yok */}
            {filtStock.length === 0 && filtSemi.length === 0 && (
              <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '.82rem' }}>
                <i className="fa-solid fa-magnifying-glass" style={{ marginBottom: 6, display: 'block' }}/>
                "{query}" için sonuç bulunamadı
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
