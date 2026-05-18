import { useMemo, useState } from 'react'

function sortProducts(products) {
  return [...products].sort((left, right) => (
    (left?.name || '').localeCompare(right?.name || '', 'tr')
  ))
}

export default function FavoriteProductsModal({
  title = 'Favori Ekle',
  products = [],
  selectedIds = [],
  onToggle,
  onClose,
}) {
  const [searchQ, setSearchQ] = useState('')
  const selectedIdSet = useMemo(
    () => new Set((selectedIds || []).map(value => String(value))),
    [selectedIds]
  )

  const filteredProducts = useMemo(() => {
    const normalizedSearch = searchQ.trim().toLocaleLowerCase('tr-TR')
    const list = products.filter(product => {
      if (!normalizedSearch) return true
      return String(product?.name || '').toLocaleLowerCase('tr-TR').includes(normalizedSearch)
    })

    return sortProducts(list).sort((left, right) => {
      const leftSelected = selectedIdSet.has(String(left?.id || ''))
      const rightSelected = selectedIdSet.has(String(right?.id || ''))
      if (leftSelected !== rightSelected) return leftSelected ? -1 : 1
      return 0
    })
  }, [products, searchQ, selectedIdSet])

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(2,6,23,.74)', zIndex:150, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div className="touch-modal" style={{ width:560, maxWidth:'96vw', maxHeight:'90vh', background:'#0b1249', border:'1px solid rgba(255,255,255,.12)', borderRadius:22, boxShadow:'0 30px 80px rgba(0,0,0,.55)', overflow:'hidden', display:'flex', flexDirection:'column' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 20px', borderBottom:'1px solid rgba(255,255,255,.08)' }}>
          <div>
            <div style={{ color:'#fff', fontWeight:900, fontSize:'1.1rem' }}>{title}</div>
            <div style={{ color:'#94a3b8', fontSize:'.82rem', marginTop:4 }}>
              Secili urunler favoriler ekraninda en ustte gorunur.
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ width:36, height:36, borderRadius:999, border:'none', background:'rgba(255,255,255,.08)', color:'#fff', cursor:'pointer' }}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div style={{ padding:'16px 20px', borderBottom:'1px solid rgba(255,255,255,.08)', display:'grid', gap:12 }}>
          <div style={{ position:'relative' }}>
            <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'rgba(255,255,255,.32)', fontSize:'.8rem' }}>
              <i className="fa-solid fa-magnifying-glass" />
            </span>
            <input
              value={searchQ}
              onChange={event => setSearchQ(event.target.value)}
              placeholder="Favorilere eklenecek urunu ara..."
              style={{ width:'100%', background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.12)', borderRadius:12, padding:'12px 14px 12px 34px', color:'#fff', outline:'none' }}
            />
          </div>
          <div style={{ color:'#cbd5e1', fontSize:'.82rem' }}>
            {selectedIds.length} urun secili
          </div>
        </div>

        <div style={{ padding:'12px 20px 18px', overflowY:'auto', display:'grid', gap:10 }}>
          {filteredProducts.length === 0 ? (
            <div style={{ padding:'28px 12px', textAlign:'center', color:'rgba(255,255,255,.45)', fontWeight:700 }}>
              Eslesen urun bulunamadi.
            </div>
          ) : filteredProducts.map(product => {
            const isSelected = selectedIdSet.has(String(product?.id || ''))
            return (
              <button
                key={product.id}
                type="button"
                onClick={() => onToggle?.(product)}
                style={{
                  border:'1px solid rgba(255,255,255,.1)',
                  borderRadius:16,
                  background:isSelected ? 'rgba(251,191,36,.14)' : 'rgba(255,255,255,.04)',
                  color:'#fff',
                  cursor:'pointer',
                  padding:'14px 16px',
                  display:'flex',
                  alignItems:'center',
                  justifyContent:'space-between',
                  gap:12,
                  textAlign:'left',
                }}
              >
                <div style={{ minWidth:0 }}>
                  <div style={{ fontWeight:800, color:'#fff' }}>{product.name}</div>
                  <div style={{ marginTop:4, color:'rgba(226,232,240,.64)', fontSize:'.78rem' }}>
                    {product.short_name || product.sku || 'Satis mali'}
                  </div>
                </div>
                <span style={{
                  minWidth:34,
                  height:34,
                  borderRadius:999,
                  display:'inline-flex',
                  alignItems:'center',
                  justifyContent:'center',
                  background:isSelected ? 'rgba(251,191,36,.22)' : 'rgba(255,255,255,.08)',
                  color:isSelected ? '#fbbf24' : '#94a3b8',
                  flexShrink:0,
                }}>
                  <i className={`fa-solid ${isSelected ? 'fa-star' : 'fa-plus'}`} />
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
