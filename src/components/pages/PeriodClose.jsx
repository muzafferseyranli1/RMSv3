import { useEffect, useState, useCallback } from 'react'
import { db } from '@/lib/db'
import { useToast } from '@/hooks/useToast'
import Header from '@/components/layout/Header'

// ── Helpers ──────────────────────────────────────────────────
function getAllBranches(tree) {
  const r = []
  function walk(n) {
    for (const x of n||[]) {
      if (x.type==='sube') r.push({ id:x.id, name:x.name })
      walk(x.children||[])
    }
  }
  walk(tree); return r
}

function daysDiff(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr+'T00:00:00')
  const now = new Date(); now.setHours(0,0,0,0)
  return Math.floor((now - d) / 86400000)
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr+'T00:00:00').toLocaleDateString('tr-TR')
}

// ── Şube Seçici (üst kontrol bar) ────────────────────────────
// filteredBranches: tabloda gösterilecek şubeler (şablon seçiliyse o şablon, yoksa tümü)
// selected: işaretli şube id'leri
function BranchSelectorBar({ branches, branchTemplates, selected, onChange, onFilterChange }) {
  const [selTpl, setSelTpl] = useState('')

  function parseBranchIds(tpl) {
    const ids = Array.isArray(tpl.branch_ids) ? tpl.branch_ids
      : (typeof tpl.branch_ids === 'string' ? JSON.parse(tpl.branch_ids||'[]') : [])
    return ids.filter(id => branches.some(b => b.id === id))
  }

  function handleTemplateChange(tplId) {
    setSelTpl(tplId)
    if (!tplId) {
      onFilterChange(branches) // tümü
      onChange([])
    } else {
      const tpl = branchTemplates.find(t => t.id === tplId)
      if (!tpl) return
      const validIds = parseBranchIds(tpl)
      onFilterChange(branches.filter(b => validIds.includes(b.id)))
      onChange(validIds) // hepsini işaretle
    }
  }

  const displayCount = selTpl
    ? (branchTemplates.find(t=>t.id===selTpl) ? parseBranchIds(branchTemplates.find(t=>t.id===selTpl)).length : 0)
    : branches.length

  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, flexWrap:'wrap' }}>
      {branchTemplates.length > 0 && (
        <div className="sel-wrap" style={{ flex:'1 1 240px', minWidth:180 }}>
          <select className="f-input" value={selTpl}
            onChange={e => handleTemplateChange(e.target.value)}
            style={{ fontSize:'.82rem' }}>
            <option value="">Şablondan seç…</option>
            {branchTemplates.map(t => {
              const cnt = parseBranchIds(t).length
              return <option key={t.id} value={t.id}>{t.name} ({cnt} şube)</option>
            })}
          </select>
        </div>
      )}
      <button className="btn-o" style={{ fontSize:'.78rem' }}
        onClick={() => { onChange(branches.map(b=>b.id)); setSelTpl(''); onFilterChange(branches) }}>
        <i className="fa-solid fa-check-double"/> Tümünü Seç
      </button>
      <button className="btn-o" style={{ fontSize:'.78rem', color:'#dc2626', borderColor:'#fecaca' }}
        onClick={() => { onChange([]); setSelTpl(''); onFilterChange(branches) }}>
        <i className="fa-solid fa-xmark"/> Temizle
      </button>
      <span style={{ fontSize:'.75rem', color:'#94a3b8', marginLeft:'auto' }}>
        {selected.length} / {displayCount} şube seçili
      </span>
    </div>
  )
}

// ── Dönem Kapanışı Tab ────────────────────────────────────────
function PeriodCloseTab({ branches, branchTemplates, records, onSave }) {
  const toast = useToast()
  const [selected, setSelected]         = useState([])
  const [filteredBranches, setFiltered] = useState(branches)
  const [closeDate, setCloseDate]       = useState('')
  const [saving, setSaving]             = useState(false)

  useEffect(() => { setFiltered(branches) }, [branches])

  // Her şubenin son dönem kapanış kaydı
  function getRecord(branchId) {
    return records
      .filter(r => r.type === 'period_close' && r.branch_id === branchId)
      .sort((a,b) => String(b.close_date).localeCompare(String(a.close_date)))[0] || null
  }

  // Min tarih: seçili şubelerin en son dönem kapanış tarihi
  const minDate = selected.reduce((max, id) => {
    const rec = getRecord(id)
    if (!rec) return max
    return rec.close_date > max ? rec.close_date : max
  }, '')

  async function handleClose() {
    if (!closeDate) { toast('Dönem kapanış tarihi seçin', 'error'); return }
    if (minDate && closeDate <= minDate) { toast('Tarih son kapanıştan eski olamaz', 'error'); return }
    if (selected.length === 0) { toast('En az bir şube seçin', 'error'); return }
    setSaving(true)
    const rows = selected.map(id => ({
      branch_id: id,
      branch_name: branches.find(b=>b.id===id)?.name || id,
      type: 'period_close',
      close_date: closeDate,
      created_at: new Date().toISOString(),
    }))
    const { error } = await db.from('branch_period_locks').insert(rows)
    setSaving(false)
    if (error) { toast('Hata: '+error.message, 'error'); return }
    toast(`${selected.length} şube için dönem kapatıldı ✅`, 'success')
    setCloseDate('')
    onSave()
  }

  return (
    <div style={{ display:'grid', gap:16 }}>
      <BranchSelectorBar
        branches={branches} branchTemplates={branchTemplates}
        selected={selected} onChange={setSelected}
        onFilterChange={setFiltered}
      />

      {/* Tablo */}
      <div className="card" style={{ overflow:'hidden' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>ŞUBE</th>
              <th style={{ textAlign:'center' }}>SON DÖNEM KAPANIŞ TARİHİ</th>
              <th style={{ textAlign:'center' }}>SON KAPANIŞTAN GEÇEN SÜRE</th>
              <th style={{ textAlign:'center', width:220 }}>DÖNEM KAPANACAK ŞUBELERİ SEÇİN</th>
            </tr>
          </thead>
          <tbody>
            {filteredBranches.map(b => {
              const rec  = getRecord(b.id)
              const days = rec ? daysDiff(rec.close_date) : null
              const sel  = selected.includes(b.id)
              return (
                <tr key={b.id} style={{ background: sel ? '#fff7ed' : 'transparent' }}>
                  <td style={{ fontWeight:600, color:'#0f172a' }}>{b.name}</td>
                  <td style={{ textAlign:'center', color:'#475569' }}>
                    {rec ? formatDate(rec.close_date) : <span style={{ color:'#cbd5e1' }}>—</span>}
                  </td>
                  <td style={{ textAlign:'center' }}>
                    {days !== null ? (
                      <span style={{ display:'inline-flex', alignItems:'center', gap:5,
                        fontWeight:700, color: days > 30 ? '#dc2626' : '#475569' }}>
                        {days} gün
                        {days > 30 && <i className="fa-solid fa-triangle-exclamation" style={{ color:'#dc2626' }}/>}
                      </span>
                    ) : <span style={{ color:'#cbd5e1' }}>—</span>}
                  </td>
                  <td style={{ textAlign:'center' }}>
                    <input type="checkbox" checked={sel}
                      onChange={() => setSelected(prev => sel ? prev.filter(x=>x!==b.id) : [...prev, b.id])}
                      style={{ width:18, height:18, cursor:'pointer', accentColor:'#f97316' }}/>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Dönem Kapanış Tarihi + Buton */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:16, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <label style={{ fontSize:'.85rem', fontWeight:700, color:'#dc2626' }}>Dönem Kapanış Tarihi</label>
          <input type="date" className="f-input" style={{ width:160 }}
            value={closeDate} onChange={e=>setCloseDate(e.target.value)}
            min={minDate || undefined}/>
          {minDate && (
            <span style={{ fontSize:'.72rem', color:'#94a3b8', background:'#f1f5f9',
              padding:'4px 8px', borderRadius:6, maxWidth:160, lineHeight:1.4 }}>
              Bu tarih son kapanış tarihinden daha eski olamaz
            </span>
          )}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button className="btn-p" style={{ background:'#f97316', borderColor:'#f97316' }}
            onClick={handleClose} disabled={saving}>
            {saving ? <i className="fa-solid fa-spinner fa-spin"/> : <i className="fa-solid fa-lock"/>}
            {' '}Dönemi Kapat
          </button>
          <div style={{ fontSize:'.72rem', color:'#dc2626', background:'#fff7ed',
            border:'1px solid #fed7aa', padding:'6px 10px', borderRadius:6,
            maxWidth:200, lineHeight:1.5 }}>
            Dikkat dönemi kapattıktan sonra bu tarihten geriye dönük işlem yapamazsınız
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Geçici Kilit Tab ──────────────────────────────────────────
function PreLockTab({ branches, branchTemplates, records, onSave }) {
  const toast = useToast()
  const [filteredBranches, setFiltered] = useState(branches)
  const [lockDate, setLockDate]         = useState('')
  const [showFilter, setShowFilter]     = useState('all') // 'all' | 'locked'
  const [saving, setSaving]             = useState(false)

  useEffect(() => { setFiltered(branches) }, [branches])

  // Başlangıçta kilitli şubeler seçili gelsin
  function getActiveLock(branchId) {
    return records
      .filter(r => r.type === 'pre_lock' && r.active !== false && r.branch_id === branchId)
      .sort((a,b) => String(b.close_date).localeCompare(String(a.close_date)))[0] || null
  }
  const initialSelected = branches.filter(b => getActiveLock(b.id)).map(b => b.id)
  const [selected, setSelected] = useState(initialSelected)

  // records değişince selected'ı güncelle
  useEffect(() => {
    setSelected(branches.filter(b => {
      return records.some(r => r.type === 'pre_lock' && r.active !== false && r.branch_id === b.id)
    }).map(b => b.id))
  }, [records, branches])

  // Her şubenin geçerli ön kilit kaydı
  function getLock(branchId) {
    return records
      .filter(r => r.type === 'pre_lock' && r.active !== false && r.branch_id === branchId)
      .sort((a,b) => String(b.close_date).localeCompare(String(a.close_date)))[0] || null
  }

  const lockedBranches = filteredBranches.filter(b => getLock(b.id))
  const displayBranches = showFilter === 'locked' ? lockedBranches : filteredBranches

  // Min tarih: seçili şubelerin son dönem kapanış
  function getPeriodClose(branchId) {
    return records
      .filter(r => r.type === 'period_close' && r.branch_id === branchId)
      .sort((a,b) => String(b.close_date).localeCompare(String(a.close_date)))[0] || null
  }

  const minDate = selected.reduce((max, id) => {
    const rec = getPeriodClose(id)
    if (!rec) return max
    return rec.close_date > max ? rec.close_date : max
  }, '')

  async function handleLock() {
    if (selected.length === 0 && filteredBranches.length === 0) { toast('Şube seçin', 'error'); return }
    setSaving(true)

    // Şu an kilitli şubeleri bul
    const currentlyLocked = branches.filter(b => {
      const locks = records.filter(r => r.type === 'pre_lock' && r.active !== false && r.branch_id === b.id)
      return locks.length > 0
    }).map(b => b.id)

    // Yeni kilitlenecek şubeler (selected'da var, şu an kilitli değil)
    const toAdd = selected.filter(id => !currentlyLocked.includes(id))

    // Kilidi kaldırılacak şubeler (şu an kilitli ama selected'da yok)
    const toRemove = currentlyLocked.filter(id => !selected.includes(id))

    let hasError = false

    // Kilidi kaldır — active=false yap
    if (toRemove.length > 0) {
      const lockIdsToRemove = []
      for (const id of toRemove) {
        const lock = records.find(r => r.branch_id === id && r.type === 'pre_lock' && r.active !== false)
        if (lock?.id) {
          lockIdsToRemove.push(lock.id)
        }
      }

      if (lockIdsToRemove.length > 0) {
        const { error } = await db.from('branch_period_locks')
          .update({ active: false }).in('id', lockIdsToRemove)
        if (error) { hasError = true; toast('Kilit kaldırma hatası: '+error.message, 'error') }
      }
    }

    // Yeni kilit ekle
    if (toAdd.length > 0) {
      if (!lockDate) { toast('Yeni şubeler için ön kilit tarihi seçin', 'error'); setSaving(false); return }
      const rows = toAdd.map(id => ({
        branch_id: id,
        branch_name: branches.find(b=>b.id===id)?.name || id,
        type: 'pre_lock',
        close_date: lockDate,
        active: true,
        created_at: new Date().toISOString(),
      }))
      const { error } = await db.from('branch_period_locks').insert(rows)
      if (error) { hasError = true; toast('Kilit ekleme hatası: '+error.message, 'error') }
    }

    setSaving(false)
    if (!hasError) {
      const msgs = []
      if (toAdd.length)    msgs.push(`${toAdd.length} şube kilitlendi`)
      if (toRemove.length) msgs.push(`${toRemove.length} şubenin kilidi kaldırıldı`)
      toast((msgs.join(', ') || 'Değişiklik yok') + ' ✅', 'success')
      setLockDate('')
    }
    onSave()
  }

  return (
    <div style={{ display:'grid', gap:16 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <div style={{ flex:1 }}>
          <BranchSelectorBar
            branches={branches} branchTemplates={branchTemplates}
            selected={selected} onChange={setSelected}
            onFilterChange={setFiltered}
          />
        </div>
        {/* C: Kilitli / Tümü toggle */}
        <div style={{ display:'flex', alignItems:'center', gap:8, background:'#f1f5f9',
          borderRadius:8, padding:'4px 8px' }}>
          {[['all','Tümünü Göster'],['locked','Kilitli Şubeler']].map(([v,l]) => (
            <button key={v} onClick={()=>setShowFilter(v)}
              style={{ padding:'5px 12px', fontSize:'.78rem', fontWeight:700,
                borderRadius:6, border:'none', cursor:'pointer',
                background: showFilter===v ? '#6366f1' : 'transparent',
                color: showFilter===v ? '#fff' : '#64748b' }}>
              {l}{v==='locked' && lockedBranches.length>0 && (
                <span style={{ marginLeft:5, background:'#dc2626', color:'#fff',
                  borderRadius:99, fontSize:'.65rem', padding:'1px 5px' }}>
                  {lockedBranches.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tablo */}
      <div className="card" style={{ overflow:'hidden' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>ŞUBE</th>
              <th style={{ textAlign:'center' }}>ÖN KİLİTLİ ŞUBELER</th>
              <th style={{ textAlign:'center' }}>GEÇERLİ ÖN KİLİT TARİHİ</th>
            </tr>
          </thead>
          <tbody>
            {displayBranches.map(b => {
              const lock = getLock(b.id)
              const sel  = selected.includes(b.id)
              return (
                <tr key={b.id}>
                  <td style={{ fontWeight:600, color:'#0f172a' }}>{b.name}</td>
                  <td style={{ textAlign:'center' }}>
                    <input type="checkbox" checked={sel}
                      onChange={() => setSelected(prev => sel ? prev.filter(x=>x!==b.id) : [...prev, b.id])}
                      style={{ width:18, height:18, cursor:'pointer', accentColor:'#f97316' }}/>
                  </td>
                  <td style={{ textAlign:'center' }}>
                    {lock
                      ? <span style={{ fontWeight:700, color:'#dc2626' }}>{formatDate(lock.close_date)}</span>
                      : <span style={{ color:'#cbd5e1' }}>—</span>
                    }
                  </td>
                </tr>
              )
            })}
            {displayBranches.length === 0 && (
              <tr><td colSpan={3} style={{ textAlign:'center', padding:'30px', color:'#94a3b8' }}>
                Kilitli şube yok
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Ön Kilit Tarihi + Buton */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:16, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <label style={{ fontSize:'.85rem', fontWeight:700, color:'#dc2626' }}>Ön Kilit Tarihi</label>
          <input type="date" className="f-input" style={{ width:160 }}
            value={lockDate} onChange={e=>setLockDate(e.target.value)}
            min={minDate || undefined}/>
          {minDate && (
            <span style={{ fontSize:'.72rem', color:'#94a3b8', background:'#f1f5f9',
              padding:'4px 8px', borderRadius:6, maxWidth:160, lineHeight:1.4 }}>
              Bu tarih son kapanış tarihinden daha eski olamaz
            </span>
          )}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button className="btn-p" style={{ background:'#f97316', borderColor:'#f97316' }}
            onClick={handleLock} disabled={saving}>
            {saving ? <i className="fa-solid fa-spinner fa-spin"/> : <i className="fa-solid fa-clock-rotate-left"/>}
            {' '}Ön Kilit Bilgilerini Güncelle
          </button>
          <div style={{ fontSize:'.72rem', color:'#dc2626', background:'#fff7ed',
            border:'1px solid #fed7aa', padding:'6px 10px', borderRadius:6,
            maxWidth:220, lineHeight:1.5 }}>
            Değişiklik yaptığınız şubeler, belirtilen tarihten öncesinde işlem yapamaz.
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────
export default function PeriodClose() {
  const [tab, setTab]                     = useState(0)
  const [branches, setBranches]           = useState([])
  const [branchTemplates, setBranchTpls]  = useState([])
  const [records, setRecords]             = useState([])
  const [loading, setLoading]             = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data:ct }, { data:tpls }, { data:recs }] = await Promise.all([
      db.from('settings').select('value').eq('key','company_tree').single(),
      db.from('branch_templates').select('*').order('name'),
      db.from('branch_period_locks').select('*').order('created_at', { ascending:false }),
    ])
    setBranches(getAllBranches(ct?.value||[]))
    setBranchTpls(tpls||[])
    setRecords(recs||[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const TABS = [
    { label:'Dönem Kapanışı', icon:'fa-calendar-xmark' },
    { label:'Geçici Kilit',   icon:'fa-lock' },
  ]

  return (
    <div>
      <Header title="Dönem Kapanışı" subtitle="Şube bazlı dönem yönetimi"/>

      {/* Tab bar */}
      <div style={{ display:'flex', gap:4, background:'#f1f5f9', borderRadius:12,
        padding:4, marginBottom:20, width:'fit-content' }}>
        {TABS.map((t,i) => (
          <button key={i} onClick={()=>setTab(i)}
            style={{ padding:'8px 20px', fontSize:'.85rem', fontWeight:700,
              borderRadius:9, border:'none', cursor:'pointer', transition:'all .15s',
              background: tab===i ? '#fff' : 'transparent',
              color: tab===i ? '#0f172a' : '#64748b',
              boxShadow: tab===i ? '0 1px 6px rgba(0,0,0,.08)' : 'none',
              display:'flex', alignItems:'center', gap:7 }}>
            <i className={`fa-solid ${t.icon}`} style={{ fontSize:'.8rem' }}/>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#94a3b8' }}>
          <i className="fa-solid fa-spinner fa-spin" style={{ fontSize:'1.5rem' }}/>
        </div>
      ) : tab === 0 ? (
        <PeriodCloseTab
          branches={branches} branchTemplates={branchTemplates}
          records={records} onSave={load}
        />
      ) : (
        <PreLockTab
          branches={branches} branchTemplates={branchTemplates}
          records={records} onSave={load}
        />
      )}
    </div>
  )
}
