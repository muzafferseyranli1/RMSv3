import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

function normalize(value) {
  return value == null ? '' : String(value)
}

export default function SearchableSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Seçin...',
  searchPlaceholder = 'Ara...',
  clearLabel = 'Seçimi temizle',
  noResultsLabel = 'Eşleşen sonuç bulunamadı',
  disabled = false,
  allowClear = true,
  maxHeight = 260,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef()
  const menuRef = useRef()
  const inputRef = useRef()
  const [menuStyle, setMenuStyle] = useState(null)

  useEffect(() => {
    function handlePointerDown(event) {
      const target = event.target
      const clickedInsideTrigger = wrapRef.current && wrapRef.current.contains(target)
      const clickedInsideMenu = menuRef.current && menuRef.current.contains(target)
      if (!clickedInsideTrigger && !clickedInsideMenu) {
        setOpen(false)
      }
    }

    function handleEscape(event) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setQuery('')
    inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return undefined

    function updateMenuPosition() {
      if (!wrapRef.current) return
      const rect = wrapRef.current.getBoundingClientRect()
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0
      const belowSpace = viewportHeight - rect.bottom - 12
      const aboveSpace = rect.top - 12
      const shouldOpenUpward = belowSpace < 240 && aboveSpace > belowSpace
      const resolvedMaxHeight = Math.max(140, Math.min(maxHeight, shouldOpenUpward ? aboveSpace : belowSpace))

      setMenuStyle({
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        top: shouldOpenUpward ? 'auto' : rect.bottom + 3,
        bottom: shouldOpenUpward ? viewportHeight - rect.top + 3 : 'auto',
        maxHeight: resolvedMaxHeight,
        zIndex: 10060,
      })
    }

    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)

    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [open, maxHeight])

  const selectedOption = useMemo(
    () => options.find(option => normalize(option.value) === normalize(value)) || null,
    [options, value]
  )

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return options
    return options.filter(option => {
      const haystack = [
        option.label,
        option.selectedLabel,
        option.description,
        option.searchText,
        option.meta,
        option.group,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [options, query])

  function handleSelect(nextValue, optionDisabled = false) {
    if (disabled || optionDisabled) return
    onChange(nextValue)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <div
        onClick={() => !disabled && setOpen(current => !current)}
        style={{
          border: `1.5px solid ${open ? '#fbbf24' : '#c4cdd9'}`,
          borderRadius: 8,
          padding: '7px 30px 7px 10px',
          fontSize: '.83rem',
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: disabled ? '#f8fafc' : '#fff',
          minHeight: 36,
          display: 'flex',
          alignItems: 'center',
          position: 'relative',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,.06)',
          color: selectedOption ? '#0f172a' : '#94a3b8',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
        }}
      >
        {selectedOption ? selectedOption.selectedLabel || selectedOption.label : placeholder}
        <i
          className="fa-solid fa-chevron-down"
          style={{
            position: 'absolute',
            right: 9,
            top: '50%',
            transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`,
            color: '#94a3b8',
            fontSize: '.6rem',
            transition: 'transform .15s',
            pointerEvents: 'none',
          }}
        />
      </div>

      {open && menuStyle && createPortal(
        <div
          ref={menuRef}
          style={{
            ...menuStyle,
            background: '#fff',
            border: '1.5px solid #e2e8f0',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,.13)',
            minWidth: 180,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '7px 10px',
              borderBottom: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
            }}
          >
            <i className="fa-solid fa-magnifying-glass" style={{ color: '#94a3b8', fontSize: '.75rem', flexShrink: 0 }} />
            <input
              ref={inputRef}
              value={query}
              onChange={event => setQuery(event.target.value)}
              onClick={event => event.stopPropagation()}
              placeholder={searchPlaceholder}
              style={{
                border: 'none',
                outline: 'none',
                fontSize: '.82rem',
                flex: 1,
                background: 'transparent',
                color: '#0f172a',
              }}
            />
            {query && (
              <button
                type="button"
                onClick={event => {
                  event.stopPropagation()
                  setQuery('')
                  inputRef.current?.focus()
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  fontSize: '.75rem',
                  padding: 0,
                }}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            )}
          </div>

          <div style={{ maxHeight: menuStyle.maxHeight, overflowY: 'auto' }}>
            {allowClear && normalize(value) && (
              <div
                onClick={() => handleSelect('')}
                style={{
                  padding: '7px 12px',
                  cursor: 'pointer',
                  fontSize: '.78rem',
                  color: '#94a3b8',
                  borderBottom: '1px solid #f8fafc',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <i className="fa-solid fa-xmark" style={{ fontSize: '.65rem' }} />
                {clearLabel}
              </div>
            )}

            {filteredOptions.length ? (
              filteredOptions.map((option, index) => {
                const isSelected = normalize(option.value) === normalize(value)
                const prevGroup = index > 0 ? filteredOptions[index - 1]?.group : null
                const showGroup = option.group && option.group !== prevGroup

                return (
                  <div key={`${option.group || 'group'}-${normalize(option.value) || index}`}>
                    {showGroup && (
                      <div
                        style={{
                          padding: '5px 12px 3px',
                          fontSize: '.65rem',
                          fontWeight: 800,
                          color: '#94a3b8',
                          letterSpacing: '.1em',
                          textTransform: 'uppercase',
                          background: '#f8fafc',
                          borderTop: index === 0 ? 'none' : '1px solid #f1f5f9',
                          borderBottom: '1px solid #f1f5f9',
                        }}
                      >
                        {option.group}
                      </div>
                    )}

                    <div
                      onClick={() => handleSelect(option.value, option.disabled)}
                      style={{
                        padding: `8px 12px 8px ${12 + (option.indent || 0) * 16}px`,
                        cursor: option.disabled ? 'not-allowed' : 'pointer',
                        background: isSelected ? '#fffbeb' : 'transparent',
                        borderBottom: '1px solid #f8fafc',
                        opacity: option.disabled ? 0.45 : 1,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {option.icon ? (
                          <i className={`fa-solid ${option.icon}`} style={{ color: isSelected ? '#d97706' : '#94a3b8', fontSize: '.72rem', flexShrink: 0 }} />
                        ) : null}
                        <span style={{ flex: 1, color: isSelected ? '#92400e' : '#0f172a', fontWeight: isSelected ? 700 : 500 }}>
                          {option.label}
                        </span>
                        {option.meta ? (
                          <span
                            style={{
                              fontSize: '.68rem',
                              color: isSelected ? '#b45309' : '#94a3b8',
                              background: isSelected ? '#fef3c7' : '#f1f5f9',
                              padding: '1px 6px',
                              borderRadius: 999,
                              flexShrink: 0,
                            }}
                          >
                            {option.meta}
                          </span>
                        ) : null}
                      </div>
                      {option.description ? (
                        <div style={{ fontSize: '.72rem', color: '#64748b', marginTop: 3, paddingInlineEnd: 6 }}>
                          {option.description}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              })
            ) : (
              <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '.82rem' }}>
                <i className="fa-solid fa-magnifying-glass" style={{ marginBottom: 6, display: 'block' }} />
                {noResultsLabel}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
