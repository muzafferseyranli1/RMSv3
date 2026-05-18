export default function ConfirmDialog({ open, title, desc, onConfirm, onCancel }) {
  return (
    <div className={`modal-bg modal-sm ${open ? 'open' : ''}`}>
      <div className="modal-box" style={{ width: 360 }}>
        <div className="modal-body" style={{ textAlign:'center', paddingTop:28, paddingBottom:28 }}>
          <div style={{ width:52, height:52, background:'#fee2e2', borderRadius:14, margin:'0 auto 14px',
            display:'flex', alignItems:'center', justifyContent:'center' }}>
            <i className="fa-solid fa-triangle-exclamation" style={{ color:'#dc2626', fontSize:'1.3rem' }}/>
          </div>
          <h3 style={{ fontSize:'1rem', fontWeight:800, color:'#0f172a', margin:'0 0 8px' }}>
            {title || 'Silmek istediğinizden emin misiniz?'}
          </h3>
          <p style={{ fontSize:'.83rem', color:'#64748b', margin:'0 0 22px' }}>
            {desc || 'Silinen kayıt geri alınabilir. Yetkili kişi "Silinmişleri göster" seçeneğinden geri yükleyebilir.'}
          </p>
          <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
            <button className="btn-o" onClick={onCancel}>Vazgeç</button>
            <button onClick={onConfirm} style={{ background:'#dc2626', color:'#fff', fontWeight:700,
              borderRadius:10, padding:'9px 18px', fontSize:'.855rem', cursor:'pointer', border:'none',
              display:'inline-flex', alignItems:'center', gap:7 }}>
              <i className="fa-solid fa-trash"/> Sil
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
