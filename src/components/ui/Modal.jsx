import React, { useEffect } from 'react'

export default function Modal({ open, onClose, title, subtitle, children, footer, width = 600, flex = false, tabs }) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <div className={`modal-bg ${open ? 'open' : ''}`}>
      <div className="modal-box" style={{ width, ...(flex ? { display:'flex', flexDirection:'column', maxHeight:'90vh', minHeight: '560px' } : {}) }}>
        <div className="modal-head">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <h2 style={{ fontSize:'1.05rem', fontWeight:800, color:'#0f172a', margin:0 }}>{title}</h2>
              {subtitle && <p style={{ fontSize:'.75rem', color:'#94a3b8', margin:'3px 0 0' }}>{subtitle}</p>}
            </div>
            <button className="ico-btn" onClick={onClose} style={{ fontSize:'1rem', color:'#64748b' }}>
              <i className="fa-solid fa-xmark"/>
            </button>
          </div>
          {tabs && <div style={{ marginTop:12 }}>{tabs}</div>}
        </div>
        <div className="modal-body" style={flex ? { flex:1, overflowY:'auto' } : {}}>
          {children}
        </div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}
