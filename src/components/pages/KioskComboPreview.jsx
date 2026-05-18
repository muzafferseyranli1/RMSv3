import { useMemo, useState } from 'react'

const CANVAS_W = 480
const CANVAS_H = 854

const SAMPLE_CATEGORIES = [
  { id: 'menus', name: 'Menuler', image: '', short: 'MN' },
  { id: 'burgers', name: 'Burgerler', image: '', short: 'BG' },
  { id: 'drinks', name: 'Icecekler', image: '', short: 'IC' },
  { id: 'desserts', name: 'Tatlilar', image: '', short: 'TT' },
]

const SAMPLE_PRODUCTS = [
  { id: 'combo-demo', categoryId: 'menus', name: 'Combo Menu Deneme', description: 'Burger + yan urun + icecek + sos secimi', price: 400, combo: true, image: '' },
  { id: 'classic-menu', categoryId: 'menus', name: 'Klasik Menu', description: 'Tek urunlu basit menu ornegi', price: 320, combo: false, image: '' },
  { id: 'double-burger', categoryId: 'burgers', name: 'Double Smash', description: 'Cift kofte burger', price: 290, combo: false, image: '' },
  { id: 'cola', categoryId: 'drinks', name: 'Cola 330ml', description: 'Soguk icecek', price: 55, combo: false, image: '' },
]

const GROUP_STEPS = [
  {
    id: 'burger',
    title: 'Burger Secimi',
    helper: 'Bir ana urun secin',
    type: 'group',
    choices: [
      { id: 'burger-1', name: 'Acili Tavuk Burger', tag: 'Ana Urun', delta: 0 },
      { id: 'burger-2', name: 'Citir Tavuk Burger', tag: 'Alternatif', delta: 0 },
      { id: 'burger-3', name: 'Double Smash Burger', tag: 'Alternatif', delta: 19 },
    ],
  },
  {
    id: 'side',
    title: 'Yan Urun Secimi',
    helper: 'Bir yan urun secin',
    type: 'group',
    choices: [
      { id: 'side-1', name: 'Patates Kizartmasi Kucuk', tag: 'Ana Urun', delta: 0 },
      { id: 'side-2', name: 'Patates Kizartmasi Buyuk', tag: 'Alternatif', delta: 10 },
      { id: 'side-3', name: 'Sogan Halkasi', tag: 'Alternatif', delta: 12 },
    ],
  },
  {
    id: 'drink',
    title: 'Icecek Secimi',
    helper: 'Bir icecek secin',
    type: 'group',
    choices: [
      { id: 'drink-1', name: 'Su 500ml', tag: 'Ana Urun', delta: 0 },
      { id: 'drink-2', name: 'Coca-Cola 330ml', tag: 'Alternatif', delta: 0 },
      { id: 'drink-3', name: 'Fuse Tea', tag: 'Alternatif', delta: 5 },
    ],
  },
  {
    id: 'sauce',
    title: 'Sos Secimi',
    helper: 'Gruba bagli secenek grubu ornegi',
    type: 'options',
    min: 1,
    max: 2,
    choices: [
      { id: 'sauce-1', name: 'BBQ Sos', price: 5 },
      { id: 'sauce-2', name: 'Ketcap', price: 0 },
      { id: 'sauce-3', name: 'Hardal', price: 0 },
      { id: 'sauce-4', name: 'Dublex Mayonez', price: 15 },
    ],
  },
  {
    id: 'combo-extra',
    title: 'Combo Secenek Grubu',
    helper: 'Tum combo icin sonda gelen secim',
    type: 'options',
    min: 0,
    max: 1,
    choices: [
      { id: 'combo-extra-1', name: 'Islak Mendil Ekle', price: 0 },
      { id: 'combo-extra-2', name: 'Extra Sos Paketi', price: 10 },
    ],
  },
]

function fmt(n) {
  return `${(parseFloat(n) || 0).toFixed(2)} TL`
}

function useCanvasScale(targetW, targetH) {
  const widthScale = typeof window === 'undefined' ? 1 : window.innerWidth / targetW
  const heightScale = typeof window === 'undefined' ? 1 : window.innerHeight / targetH
  return Math.min(widthScale, heightScale, 1)
}

function cardSurface(color = '#ffffff') {
  return {
    background: color,
    border: '1px solid rgba(15,23,42,.08)',
    boxShadow: '0 18px 36px rgba(15,23,42,.08)',
  }
}

function CategoryButton({ category, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...cardSurface(active ? '#fff7ed' : '#fff'),
        borderRadius: 18,
        minHeight: 94,
        padding: 8,
        cursor: 'pointer',
        display: 'grid',
        gap: 8,
        alignContent: 'start',
        border: active ? '1px solid rgba(245,158,11,.42)' : '1px solid rgba(15,23,42,.08)',
      }}
    >
      <div style={{ aspectRatio: '1 / 1', borderRadius: 14, background: active ? 'rgba(245,158,11,.16)' : 'linear-gradient(135deg,#fff4d4,#f8fafc)', display: 'grid', placeItems: 'center', fontWeight: 900, color: active ? '#92400e' : '#8a5a00' }}>
        {category.short}
      </div>
      <div style={{ fontSize: '.66rem', lineHeight: 1.15, fontWeight: 800, color: '#0f172a', textAlign: 'center' }}>{category.name}</div>
    </button>
  )
}

function ProductCard({ product, onOpenCombo }) {
  return (
    <button
      type="button"
      onClick={() => product.combo && onOpenCombo()}
      style={{
        ...cardSurface('#fff'),
        minHeight: 154,
        borderRadius: 22,
        padding: 12,
        display: 'grid',
        gridTemplateRows: '88px auto auto',
        gap: 10,
        textAlign: 'left',
        cursor: product.combo ? 'pointer' : 'default',
        border: product.combo ? '1px solid rgba(245,158,11,.22)' : '1px solid rgba(15,23,42,.08)',
      }}
    >
      <div style={{ borderRadius: 18, background: product.combo ? 'linear-gradient(135deg,#fff0bf,#fde68a)' : 'linear-gradient(135deg,#eef2ff,#e2e8f0)', display: 'grid', placeItems: 'center', color: '#334155', fontWeight: 900, fontSize: '.82rem' }}>
        {product.combo ? 'Combo Menu' : 'Urun'}
      </div>
      <div>
        <div style={{ fontWeight: 900, color: '#0f172a', fontSize: '.88rem', lineHeight: 1.15 }}>{product.name}</div>
        <div style={{ marginTop: 6, color: '#64748b', fontSize: '.74rem', lineHeight: 1.35 }}>{product.description}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ color: '#0f172a', fontWeight: 900, fontSize: '.96rem' }}>{fmt(product.price)}</div>
        {product.combo ? <span style={{ fontSize: '.68rem', color: '#92400e', background: '#fff7ed', borderRadius: 999, padding: '4px 8px', fontWeight: 800 }}>Secimli</span> : null}
      </div>
    </button>
  )
}

function KioskComboPreviewModal({ open, onClose }) {
  const [stepIndex, setStepIndex] = useState(0)
  const [selected, setSelected] = useState(() => ({
    burger: 'burger-1',
    side: 'side-1',
    drink: 'drink-2',
    sauce: ['sauce-1'],
    'combo-extra': [],
  }))

  const step = GROUP_STEPS[stepIndex]

  const summary = useMemo(() => {
    return GROUP_STEPS.map((item, index) => {
      if (item.type === 'group') {
        const current = item.choices.find(choice => choice.id === selected[item.id])
        return {
          title: item.title,
          values: current ? [current.name] : [],
          active: index === stepIndex,
          complete: Boolean(current),
        }
      }
      const ids = selected[item.id] || []
      return {
        title: item.title,
        values: item.choices.filter(choice => ids.includes(choice.id)).map(choice => choice.name),
        active: index === stepIndex,
        complete: ids.length >= item.min,
      }
    })
  }, [selected, stepIndex])

  if (!open) return null

  const canAdvance = step.type === 'group'
    ? Boolean(selected[step.id])
    : (selected[step.id] || []).length >= step.min && (selected[step.id] || []).length <= step.max

  const summaryLines = summary
    .flatMap(item => item.values.map(value => ({ value, active: item.active })))
    .filter(item => item.value)

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(2,6,23,.56)',
        backdropFilter: 'blur(10px)',
        zIndex: 50,
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        padding: '108px 0 12px 52px',
      }}
    >
      <div style={{ position: 'relative', width: 334, minHeight: 0 }}>
        <div
          style={{
            position: 'absolute',
            left: -96,
            top: 134,
            width: 78,
            minHeight: 236,
            maxHeight: 304,
            borderRadius: 22,
            background: 'linear-gradient(180deg,rgba(82,82,82,.94) 0%, rgba(15,23,42,.98) 42%, rgba(2,6,23,1) 100%)',
            boxShadow: '0 18px 32px rgba(15,23,42,.2)',
            padding: '14px 10px',
            display: 'grid',
            alignContent: 'start',
            gap: 8,
            overflow: 'auto',
          }}
        >
          {summaryLines.length === 0 ? (
            <div style={{ color: '#cbd5e1', fontSize: '.68rem', lineHeight: 1.28, fontWeight: 700 }}>
              Secim bekleniyor
            </div>
          ) : (
            summaryLines.map((item, index) => (
              <div
                key={`${item.value}-${index}`}
                style={{
                  color: item.active ? '#fde68a' : '#f8fafc',
                  fontSize: '.68rem',
                  lineHeight: 1.24,
                  fontWeight: item.active ? 900 : 800,
                }}
              >
                {item.value}
              </div>
            ))
          )}
        </div>

        <div
          style={{
            width: 334,
            maxHeight: 618,
            borderRadius: 28,
            overflow: 'hidden',
            background: '#fff',
            boxShadow: '0 30px 80px rgba(2,6,23,.28)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
            <div>
              <div style={{ fontSize: '.96rem', fontWeight: 900, color: '#0f172a' }}>Combo menu deneme</div>
              <div style={{ marginTop: 4, fontSize: '.68rem', color: '#64748b' }}>Kiosk replikasi uzerinde combo secim tasarimi</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                width: 38,
                height: 38,
                borderRadius: 999,
                border: '1px solid #e2e8f0',
                background: '#fff',
                cursor: 'pointer',
                color: '#475569',
              }}
            >
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        </div>

        <div style={{ padding: 12, background: '#fff' }}>
          <div style={{ width: '100%', height: 126, borderRadius: 22, overflow: 'hidden', marginBottom: 12, background: 'linear-gradient(135deg,#c2410c 0%, #f59e0b 28%, #fef3c7 60%, #84cc16 100%)', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(255,255,255,.14),transparent 38%)' }} />
            <div style={{ position: 'absolute', left: 14, right: 14, top: 14, height: 20, borderRadius: 999, background: 'rgba(255,248,220,.92)' }} />
            <div style={{ position: 'absolute', left: 12, right: 12, top: 34, bottom: 16, borderRadius: 18, background: 'linear-gradient(135deg,rgba(132,204,22,.72),rgba(239,68,68,.42))' }} />
            <div style={{ position: 'absolute', left: 32, right: 56, top: 54, height: 26, borderRadius: 999, background: 'rgba(239,68,68,.84)' }} />
          </div>

          <div style={{ fontSize: '1rem', fontWeight: 900, color: '#0f172a', marginBottom: 12 }}>Acili Tavuk Burger</div>

          <div style={{ maxHeight: 348, overflow: 'auto' }}>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: 14 }}>
              <div style={{ display: 'grid', gap: 10 }}>
                {step.choices.map(choice => {
                  const active = step.type === 'group'
                    ? selected[step.id] === choice.id
                    : (selected[step.id] || []).includes(choice.id)

                  return (
                    <button
                      key={choice.id}
                      type="button"
                      onClick={() => {
                        if (step.type === 'group') {
                          setSelected(current => ({ ...current, [step.id]: choice.id }))
                          return
                        }
                        setSelected(current => {
                          const currentIds = current[step.id] || []
                          const exists = currentIds.includes(choice.id)
                          if (exists) return { ...current, [step.id]: currentIds.filter(id => id !== choice.id) }
                          if (step.max === 1) return { ...current, [step.id]: [choice.id] }
                          if (currentIds.length >= step.max) return current
                          return { ...current, [step.id]: [...currentIds, choice.id] }
                        })
                      }}
                      style={{
                        borderRadius: 14,
                        border: `1px solid ${active ? '#f59e0b' : '#e2e8f0'}`,
                        background: active ? '#fffbeb' : '#fff',
                        padding: '12px 14px',
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                            <span style={{ fontWeight: 900, color: '#0f172a', fontSize: '.9rem' }}>{choice.name}</span>
                          </div>
                          {((step.type === 'group' && Number(choice.delta) > 0) || (step.type !== 'group' && Number(choice.price) > 0)) && (
                            <div style={{ fontSize: '.72rem', color: '#f59e0b', fontWeight: 800 }}>
                              +{fmt(step.type === 'group' ? choice.delta : choice.price)}
                            </div>
                          )}
                        </div>
                        <div
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 999,
                            border: `2px solid ${active ? '#f59e0b' : '#cbd5e1'}`,
                            background: active ? '#f59e0b' : '#fff',
                            color: '#fff',
                            display: 'grid',
                            placeItems: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {active ? <i className="fa-solid fa-check" style={{ fontSize: '.68rem' }} /> : null}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: 12, borderTop: '1px solid #e2e8f0', background: '#fff', display: 'grid', gridTemplateColumns: '42px 36px 42px 1fr auto', alignItems: 'center', gap: 10 }}>
          <button type="button" style={{ width: 36, height: 36, borderRadius: 999, border: '1px solid #dbe2ea', background: '#fff', color: '#64748b', cursor: 'pointer', fontWeight: 900 }}>-</button>
          <div style={{ textAlign: 'center', fontWeight: 900, color: '#0f172a' }}>1</div>
          <button type="button" style={{ width: 36, height: 36, borderRadius: 999, border: 'none', background: '#f59e0b', color: '#fff', cursor: 'pointer', fontWeight: 900 }}>+</button>
          <div style={{ fontSize: '1rem', fontWeight: 900, color: '#0f172a', textAlign: 'center' }}>300.00 TL</div>
          <button
            type="button"
            onClick={() => {
              if (stepIndex < GROUP_STEPS.length - 1) setStepIndex(current => current + 1)
              else onClose()
            }}
            disabled={!canAdvance}
            style={{
              minHeight: 46,
              padding: '0 20px',
              borderRadius: 999,
              border: 'none',
              background: canAdvance ? '#f59e0b' : '#cbd5e1',
              color: '#fff',
              fontWeight: 900,
              cursor: canAdvance ? 'pointer' : 'default',
            }}
          >
            {stepIndex < GROUP_STEPS.length - 1 ? 'Ilerle' : 'Sepete ekle'}
          </button>
        </div>
      </div>
      </div>
    </div>
  )
}

export default function KioskComboPreview() {
  const scale = useCanvasScale(CANVAS_W, CANVAS_H)
  const [selectedCategoryId, setSelectedCategoryId] = useState('menus')
  const [comboModalOpen, setComboModalOpen] = useState(true)

  const products = useMemo(
    () => SAMPLE_PRODUCTS.filter(item => item.categoryId === selectedCategoryId),
    [selectedCategoryId]
  )

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(circle at top,#172554 0%,#0f172a 42%,#020617 100%)', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'center center', width: CANVAS_W, height: CANVAS_H }}>
        <div style={{ width: CANVAS_W, height: CANVAS_H, borderRadius: 36, overflow: 'hidden', position: 'relative', background: 'linear-gradient(180deg,#fffaf0 0%,#f8fafc 100%)', boxShadow: '0 40px 120px rgba(2,6,23,.42)' }}>
          <div style={{ position: 'absolute', inset: 0, padding: '18px 18px 110px', display: 'grid', gridTemplateRows: 'auto auto 1fr', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '1.42rem', fontWeight: 900, color: '#0f172a' }}>Kiosk Combo Preview</div>
                <div style={{ marginTop: 4, fontSize: '.78rem', color: '#64748b' }}>Canli kiosk yerine once bu replikada tasarim calisalim</div>
              </div>
              <div style={{ padding: '10px 12px', borderRadius: 999, background: '#fff', border: '1px solid rgba(15,23,42,.08)', color: '#92400e', fontWeight: 800, fontSize: '.74rem' }}>
                Replica
              </div>
            </div>

            <div style={{ ...cardSurface('linear-gradient(135deg,#fff1bf,#fde68a)'), borderRadius: 24, padding: 16, background: 'linear-gradient(135deg,#fff1bf,#fde68a)' }}>
              <div style={{ fontSize: '.74rem', fontWeight: 900, letterSpacing: '.1em', textTransform: 'uppercase', color: '#92400e' }}>Tasarim Calisma Alani</div>
              <div style={{ marginTop: 8, fontSize: '1.14rem', lineHeight: 1.2, fontWeight: 900, color: '#0f172a' }}>Combo secim akisini kiosk dilinde burada deneyebiliriz</div>
              <div style={{ marginTop: 8, fontSize: '.78rem', color: '#7c2d12', lineHeight: 1.5 }}>Sonraki adimda bu replikadaki modal ve secim yogunlugunu birlikte sadeleştirip gercek kioska aktaririz.</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '92px minmax(0,1fr)', gap: 14, minHeight: 0 }}>
              <div style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
                {SAMPLE_CATEGORIES.map(category => (
                  <CategoryButton key={category.id} category={category} active={selectedCategoryId === category.id} onClick={() => setSelectedCategoryId(category.id)} />
                ))}
              </div>

              <div style={{ minHeight: 0, overflow: 'auto', display: 'grid', alignContent: 'start', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {products.map(product => (
                    <ProductCard key={product.id} product={product} onOpenCombo={() => setComboModalOpen(true)} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div style={{ position: 'absolute', left: 18, right: 18, bottom: 18, background: '#0f172a', borderRadius: 24, padding: 14, color: '#fff', boxShadow: '0 28px 60px rgba(2,6,23,.28)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: '.74rem', color: '#94a3b8' }}>Sepet Onizleme</div>
                <div style={{ fontWeight: 900 }}>Combo menu deneme</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: '#fbbf24', fontWeight: 900, fontSize: '1.02rem' }}>400.00 TL</div>
                <div style={{ fontSize: '.72rem', color: '#94a3b8' }}>1 urun</div>
              </div>
            </div>
            <div style={{ fontSize: '.75rem', color: '#cbd5e1', lineHeight: 1.55 }}>
              Double Smash Burger<br />
              Patates Kizartmasi Buyuk<br />
              Su 500ml
            </div>
          </div>

          <KioskComboPreviewModal open={comboModalOpen} onClose={() => setComboModalOpen(false)} />
        </div>
      </div>
    </div>
  )
}
