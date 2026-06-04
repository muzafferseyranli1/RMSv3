const fs = require('fs');
const path = 'src/components/pages/FormSubmissions.jsx';
let content = fs.readFileSync(path, 'utf8');

// Normalize line endings to LF
const originalLineEndings = content.includes('\r\n') ? '\r\n' : '\n';
content = content.replace(/\r\n/g, '\n');

// Helper to replace exactly once
function replaceOnce(target, replacement, description) {
  if (!content.includes(target)) {
    console.error(`Error: Target for "${description}" not found in file.`);
    process.exit(1);
  }
  content = content.replace(target, replacement);
  console.log(`Success: "${description}" applied.`);
}

// 1. FORM_TYPE_MAP definition below STATUS_MAP
const statusMapTarget = `const STATUS_MAP = {
  draft: { label: 'Taslak', color: '#94a3b8', bg: 'rgba(148,163,184,.15)' },
  syncing: { label: 'Senkronize Ediliyor', color: '#f59e0b', bg: 'rgba(245,158,11,.15)' },
  completed: { label: 'Tamamlandı', color: '#10b981', bg: 'rgba(16,185,129,.15)' },
  anomaly: { label: 'Anomali', color: '#ef4444', bg: 'rgba(239,68,68,.15)' },
}`;
const statusMapRep = `${statusMapTarget}

const FORM_TYPE_MAP = {
  inspection: { label: 'Denetim Formu', icon: 'fa-file-shield' },
  checklist: { label: 'Checklist', icon: 'fa-list-check' },
  customer_survey: { label: 'Müşteri Anketi', icon: 'fa-comments' },
  personnel_survey: { label: 'Personel Anketi', icon: 'fa-users' },
  notification_form: { label: 'Bildirim Formu', icon: 'fa-bell' },
}`;
replaceOnce(statusMapTarget, statusMapRep, 'FORM_TYPE_MAP');

// 2. Add SearchableMultiSelect component definition right above export default function FormSubmissions
const exportTarget = `export default function FormSubmissions() {`;
const searchableMultiSelectComponent = `const SearchableMultiSelect = ({ items, selectedList, onChange, placeholder }) => {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedIds = (selectedList || []).map(item => String(item.id))

  const filtered = (items || []).filter(item => 
    item.name?.toLowerCase().includes(search.toLowerCase()) ||
    (item.sku && item.sku?.toLowerCase().includes(search.toLowerCase()))
  )

  const handleToggle = (item) => {
    const list = selectedList ? [...selectedList] : []
    const idx = list.findIndex(x => String(x.id) === String(item.id))
    if (idx > -1) {
      list.splice(idx, 1)
    } else {
      list.push({ id: item.id, name: item.name })
    }
    onChange(list)
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', minWidth: 220, maxWidth: 300 }}>
      <div 
        onClick={() => setOpen(prev => !prev)}
        style={{ 
          minHeight: 36, border: '1px solid var(--border)', borderRadius: 8, padding: '5px 8px',
          display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', background: 'var(--surface)',
          cursor: 'pointer', fontSize: '.8rem', justifyContent: 'space-between'
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, flex: 1 }}>
          {(selectedList || []).length === 0 && <span style={{ color: 'var(--text-muted)' }}>{placeholder}</span>}
          {(selectedList || []).map((item) => (
            <span 
              key={item.id} 
              style={{ 
                background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', padding: '2px 6px', 
                borderRadius: 6, fontSize: '.72rem', display: 'inline-flex', alignItems: 'center', gap: 4,
                border: '1px solid rgba(139,92,246,0.2)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {item.name}
              <i 
                className="fa-solid fa-xmark" 
                style={{ cursor: 'pointer', opacity: 0.6 }}
                onClick={() => handleToggle(item)}
              />
            </span>
          ))}
        </div>
        <i className={\`fa-solid \${open ? 'fa-chevron-up' : 'fa-chevron-down'}\`} style={{ color: 'var(--text-muted)', fontSize: '.75rem', marginLeft: 6 }} />
      </div>

      {open && (
        <div style={{ 
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, 
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, 
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 200, overflowY: 'auto', zIndex: 1000 
        }}>
          <div style={{ padding: 6, position: 'sticky', top: 0, background: 'var(--surface)', borderBottom: '1px solid var(--border)', zIndex: 10 }}>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Ara..."
              className="f-input"
              style={{ padding: '4px 8px', fontSize: '.75rem', width: '100%', background: 'var(--surface-2)' }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div style={{ padding: 4 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '8px 10px', fontSize: '.78rem', color: 'var(--text-muted)', textAlign: 'center' }}>Sonuç bulunamadı</div>
            ) : (
              filtered.map(item => {
                const isSelected = selectedIds.includes(String(item.id))
                return (
                  <div
                    key={item.id}
                    onClick={() => handleToggle(item)}
                    style={{ 
                      padding: '6px 10px', cursor: 'pointer', borderRadius: 4, fontSize: '.78rem', 
                      display: 'flex', alignItems: 'center', gap: 8,
                      background: isSelected ? 'rgba(139,92,246,0.05)' : 'transparent',
                      color: isSelected ? '#8b5cf6' : 'var(--text)'
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) e.currentTarget.style.background = 'var(--surface-2)'
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <input 
                      type="checkbox" 
                      checked={isSelected} 
                      readOnly 
                      style={{ pointerEvents: 'none', accentColor: '#8b5cf6' }} 
                    />
                    <span style={{ fontWeight: isSelected ? 700 : 500 }}>{item.name}</span>
                    {item.sku && <span style={{ fontSize: '.7rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>({item.sku})</span>}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function FormSubmissions() {`;
replaceOnce(exportTarget, searchableMultiSelectComponent, 'SearchableMultiSelect Component');

// 3. Add dynamic list states
const answersTarget = `  const [answers, setAnswers] = useState([])
  const [activeNotes, setActiveNotes] = useState({})`;
const answersRep = `  const [answers, setAnswers] = useState([])
  const [stockItems, setStockItems] = useState([])
  const [saleItems, setSaleItems] = useState([])
  const [semiItems, setSemiItems] = useState([])
  const [loadingDbItems, setLoadingDbItems] = useState(false)
  const [activeNotes, setActiveNotes] = useState({})`;
replaceOnce(answersTarget, answersRep, 'Answers State hooks expansion');

// 4. Add fetchDbItemsForForm and update startFillForm
const fillFormTarget = `  // ─── Fill Form Logic ───
  const startFillForm = (templateId) => {
    setFillTemplateId(templateId)
    const template = getTemplate(templateId)
    if (!template) return toast('Şablon bulunamadı', 'error')`;
const fillFormRep = `  const fetchDbItemsForForm = async (template) => {
    let hasStock = false
    let hasSale = false
    let hasSemi = false

    for (const section of (template.schema_json?.sections || [])) {
      for (const field of (section.fields || [])) {
        if (field.type === 'stock_item_select') hasStock = true
        if (field.type === 'sale_item_select') hasSale = true
        if (field.type === 'semi_product_select') hasSemi = true
      }
    }

    if (!hasStock && !hasSale && !hasSemi) return

    setLoadingDbItems(true)
    try {
      const promises = []
      if (hasStock) {
        promises.push(
          db.from('stock_items')
            .select('id,name,sku')
            .is('deleted_at', null)
            .order('name')
            .then(res => setStockItems(res.data || []))
        )
      }
      if (hasSale) {
        promises.push(
          db.from('sale_items')
            .select('id,name,sku')
            .is('deleted_at', null)
            .order('name')
            .then(res => setSaleItems(res.data || []))
        )
      }
      if (hasSemi) {
        promises.push(
          db.from('semi_items')
            .select('id,name,sku')
            .is('deleted_at', null)
            .order('name')
            .then(res => setSemiItems(res.data || []))
        )
      }
      await Promise.all(promises)
    } catch (err) {
      console.error('Failed to fetch DB items for form:', err)
      toast('Öğeler yüklenirken hata oluştu', 'error')
    } finally {
      setLoadingDbItems(false)
    }
  }

  // ─── Fill Form Logic ───
  const startFillForm = (templateId) => {
    setFillTemplateId(templateId)
    const template = getTemplate(templateId)
    if (!template) return toast('Şablon bulunamadı', 'error')

    fetchDbItemsForForm(template)`;
replaceOnce(fillFormTarget, fillFormRep, 'fetchDbItemsForForm addition & invocation');

// 5. Questionnaire inputs rendering update
const selectFieldTarget = `                        {field.type === 'select' && (
                          <div className="sel-wrap" style={{ width: 150 }}>
                            <select
                              value={answer?.value || ''}
                              onChange={e => updateAnswer(field.id, e.target.value)}
                              className="f-input"
                              style={{ padding: '6px 10px', fontSize: '.8rem' }}
                            >
                              <option value="">Seçiniz</option>
                              {(field.options || []).map((opt, i) => {
                                const val = typeof opt === 'object' ? opt.label : opt
                                return <option key={i} value={val}>{val}</option>
                              })}
                            </select>
                          </div>
                        )}`;
const selectFieldRep = `${selectFieldTarget}

                        {field.type === 'date' && (
                          <input
                            type="date"
                            value={answer?.value || ''}
                            onChange={e => updateAnswer(field.id, e.target.value)}
                            className="f-input"
                            style={{ width: 150, padding: '6px 10px', fontSize: '.8rem' }}
                          />
                        )}

                        {field.type === 'stock_item_select' && (
                          <SearchableMultiSelect 
                            items={stockItems}
                            selectedList={answer?.value || []}
                            onChange={val => updateAnswer(field.id, val)}
                            placeholder="Stok Malı Seçin..."
                          />
                        )}

                        {field.type === 'sale_item_select' && (
                          <SearchableMultiSelect 
                            items={saleItems}
                            selectedList={answer?.value || []}
                            onChange={val => updateAnswer(field.id, val)}
                            placeholder="Satış Malı Seçin..."
                          />
                        )}

                        {field.type === 'semi_product_select' && (
                          <SearchableMultiSelect 
                            items={semiItems}
                            selectedList={answer?.value || []}
                            onChange={val => updateAnswer(field.id, val)}
                            placeholder="Yarı Mamul Seçin..."
                          />
                        )}

                        {field.type === 'branch_select' && (
                          <SearchableMultiSelect 
                            items={branches}
                            selectedList={answer?.value || []}
                            onChange={val => updateAnswer(field.id, val)}
                            placeholder="Şube Seçin..."
                          />
                        )}`;
replaceOnce(selectFieldTarget, selectFieldRep, 'Questionnaire Input Elements');

// 6. Section 1 answers value formatting in details drawer (40 spaces)
const section1Target = `                                        let displayValue = String(ans.value ?? '—')
                                        if (ans.value === true) displayValue = 'Evet'
                                        if (ans.value === false) displayValue = 'Hayır'`;
const section1Rep = `                                        let displayValue = String(ans.value ?? '—')
                                        if (ans.value === true) displayValue = 'Evet'
                                        if (ans.value === false) displayValue = 'Hayır'
                                        if (field.type === 'stock_item_select' || field.type === 'sale_item_select' || field.type === 'semi_product_select' || field.type === 'branch_select') {
                                          if (Array.isArray(ans.value)) {
                                            displayValue = ans.value.map(item => item.name).join(', ') || '—'
                                          } else {
                                            displayValue = '—'
                                          }
                                        }
                                        if (field.type === 'date' && ans.value) {
                                          const parts = String(ans.value).split('-')
                                          if (parts.length === 3) {
                                            displayValue = \`\${parts[2]}.\${parts[1]}.\${parts[0]}\`
                                          }
                                        }`;
replaceOnce(section1Target, section1Rep, 'Section 1 displayValue formatting');

// 7. Section 2 answers value formatting (fallback loop) (30 / 32 spaces)
const section2Target = `                              {(Array.isArray(selectedSub.answers_json) ? selectedSub.answers_json : []).map((ans, i) => {
                                let displayValue = String(ans.value ?? '—')
                                if (ans.value === true) displayValue = 'Evet'
                                if (ans.value === false) displayValue = 'Hayır'`;
const section2Rep = `                              {(Array.isArray(selectedSub.answers_json) ? selectedSub.answers_json : []).map((ans, i) => {
                                const field = template?.schema_json?.sections?.flatMap(s => s.fields || [])?.find(f => f.id === ans.field_id)
                                let displayValue = String(ans.value ?? '—')
                                if (ans.value === true) displayValue = 'Evet'
                                if (ans.value === false) displayValue = 'Hayır'
                                if (field && (field.type === 'stock_item_select' || field.type === 'sale_item_select' || field.type === 'semi_product_select' || field.type === 'branch_select')) {
                                  if (Array.isArray(ans.value)) {
                                    displayValue = ans.value.map(item => item.name).join(', ') || '—'
                                  } else {
                                    displayValue = '—'
                                  }
                                }
                                if (field && field.type === 'date' && ans.value) {
                                  const parts = String(ans.value).split('-')
                                  if (parts.length === 3) {
                                    displayValue = \`\${parts[2]}.\${parts[1]}.\${parts[0]}\`
                                  }
                                }`;
replaceOnce(section2Target, section2Rep, 'Section 2 displayValue formatting');

// 8. Section 3 answers value formatting (PDF overlay table body loop) (22 spaces)
const section3Target = `                      let displayValue = String(ans.value ?? '—')
                      if (ans.value === true) displayValue = field.type === 'checkbox' ? '☑' : 'Evet'
                      if (ans.value === false) displayValue = field.type === 'checkbox' ? '☐' : 'Hayır'`;
const section3Rep = `                      let displayValue = String(ans.value ?? '—')
                      if (ans.value === true) displayValue = field.type === 'checkbox' ? '☑' : 'Evet'
                      if (ans.value === false) displayValue = field.type === 'checkbox' ? '☐' : 'Hayır'
                      if (field.type === 'stock_item_select' || field.type === 'sale_item_select' || field.type === 'semi_product_select' || field.type === 'branch_select') {
                        if (Array.isArray(ans.value)) {
                          displayValue = ans.value.map(item => item.name).join(', ') || '—'
                        } else {
                          displayValue = '—'
                        }
                      }
                      if (field.type === 'date' && ans.value) {
                        const parts = String(ans.value).split('-')
                        if (parts.length === 3) {
                          displayValue = \`\${parts[2]}.\${parts[1]}.\${parts[0]}\`
                        }
                      }`;
replaceOnce(section3Target, section3Rep, 'Section 3 displayValue formatting');

// 9. Implement score calculation for dynamic select fields in calculateFieldScore
const scoreCalcTarget = `  if (field.type === 'rating' || field.type === 'rating_10' || field.type === 'slider' || field.type === 'nps') {
    const val = Number(value) || 0
    const divisor = field.type === 'rating' ? 5 : 10
    return Math.min((val / divisor) * maxPoints, maxPoints)
  }`;
const scoreCalcRep = `${scoreCalcTarget}
  if (field.type === 'stock_item_select' || field.type === 'sale_item_select' || field.type === 'semi_product_select' || field.type === 'branch_select') {
    return (Array.isArray(value) && value.length > 0) ? maxPoints : 0
  }`;
replaceOnce(scoreCalcTarget, scoreCalcRep, 'calculateFieldScore dynamic fields support');

// 10. Update template options to map labels dynamically in Fill Form dropdown
const templateOptionsTarget = `        const templateOptions = activeTemplates.map(t => ({
          value: t.id,
          label: t.title,
          meta: t.form_type === 'checklist' ? 'Checklist' : (t.form_type === 'inspection' ? 'Denetim' : 'Müşteri Anketi'),
          icon: t.form_type === 'checklist' ? 'fa-list-check' : (t.form_type === 'inspection' ? 'fa-file-shield' : 'fa-comments'),
        }))`;
const templateOptionsRep = `        const templateOptions = activeTemplates.map(t => {
          const typeInfo = FORM_TYPE_MAP[t.form_type] || { label: 'Form', icon: 'fa-file' }
          return {
            value: t.id,
            label: t.title,
            meta: typeInfo.label,
            icon: typeInfo.icon,
          }
        })`;
replaceOnce(templateOptionsTarget, templateOptionsRep, 'Dropdown template options labels mapping');

// 11. Print Preview headers update
const previewHeaderTarget = `          {template?.form_type === 'checklist' ? 'Kontrol Listesi Önizleme' : 'Denetim Raporu Önizleme'}`;
const previewHeaderRep = `          {template?.form_type === 'checklist' ? 'Kontrol Listesi Önizleme' : (template?.form_type === 'notification_form' ? 'Bildirim Formu Önizleme' : (template?.form_type === 'customer_survey' || template?.form_type === 'personnel_survey' ? 'Anket Raporu Önizleme' : 'Denetim Raporu Önizleme'))}`;
replaceOnce(previewHeaderTarget, previewHeaderRep, 'Print preview header dynamic type title');

const reportHeaderTarget = `              {isCriticalFailed ? 'KRİTİK HATA RAPORU' : (template?.form_type === 'checklist' ? 'KONTROL LİSTESİ' : 'DENETİM RAPORU')}`;
const reportHeaderRep = `              {isCriticalFailed ? 'KRİTİK HATA RAPORU' : (template?.form_type === 'checklist' ? 'KONTROL LİSTESİ' : (template?.form_type === 'notification_form' ? 'BİLDİRİM FORMU RAPORU' : (template?.form_type === 'customer_survey' || template?.form_type === 'personnel_survey' ? 'ANKET RAPORU' : 'DENETİM RAPORU')))}`;
replaceOnce(reportHeaderTarget, reportHeaderRep, 'Report print header dynamic title');

const qResultsHeaderTarget = `            {template?.form_type === 'checklist' ? 'KONTROL LİSTESİ SORULARI VE YANITLAR' : 'DENETİM SORULARI VE YANITLAR'}`;
const qResultsHeaderRep = `            {template?.form_type === 'checklist' ? 'KONTROL LİSTESİ SORULARI VE YANITLAR' : (template?.form_type === 'notification_form' ? 'BİLDİRİM FORMU SORULARI VE YANITLAR' : (template?.form_type === 'customer_survey' || template?.form_type === 'personnel_survey' ? 'ANKET SORULARI VE YANITLAR' : 'DENETİM SORULARI VE YANITLAR'))}`;
replaceOnce(qResultsHeaderTarget, qResultsHeaderRep, 'Questions table header dynamic title');

// 12. Conditionally hide points / percentages when form_type !== 'inspection'
// A. Table item rendering in submissions list:
const scoreCircleTarget = `                      {/* Score Circle / Checklist Icon */}
                      <div style={{
                        width: 44, height: 44, borderRadius: 12, border: '2px solid',
                        borderColor: isChecklist ? '#8b5cf6' : scoreColor,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, flexDirection: 'column',
                        background: isChecklist ? 'rgba(139,92,246,0.06)' : undefined
                      }}>
                        {isChecklist ? (
                          <i className="fa-solid fa-list-check" style={{ color: '#8b5cf6', fontSize: '1.1rem' }} />
                        ) : (
                          <>
                            <div style={{ fontSize: '.85rem', fontWeight: 900, color: scoreColor }}>
                              {sub.score_percentage != null ? Math.round(sub.score_percentage) : '—'}
                            </div>
                            <div style={{ fontSize: '.5rem', color: 'var(--text-muted)' }}>%</div>
                          </>
                        )}
                      </div>`;
const scoreCircleRep = `                      {/* Score Circle / Checklist Icon */}
                      {(() => {
                        const hasScoring = tpl?.form_type === 'inspection'
                        const typeInfo = FORM_TYPE_MAP[tpl?.form_type] || { label: 'Form', icon: 'fa-file' }
                        return (
                          <div style={{
                            width: 44, height: 44, borderRadius: 12, border: '2px solid',
                            borderColor: !hasScoring ? '#8b5cf6' : scoreColor,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, flexDirection: 'column',
                            background: !hasScoring ? 'rgba(139,92,246,0.06)' : undefined
                          }}>
                            {!hasScoring ? (
                              <i className={\`fa-solid \${typeInfo.icon}\`} style={{ color: '#8b5cf6', fontSize: '1.1rem' }} />
                            ) : (
                              <>
                                <div style={{ fontSize: '.85rem', fontWeight: 900, color: scoreColor }}>
                                  {sub.score_percentage != null ? Math.round(sub.score_percentage) : '—'}
                                </div>
                                <div style={{ fontSize: '.5rem', color: 'var(--text-muted)' }}>%</div>
                              </>
                            )}
                          </div>
                        )
                      })()}`;
replaceOnce(scoreCircleTarget, scoreCircleRep, 'Score Circle dynamic icon / hide score in submissions list');

// B. Details drawer Hero Header score ring:
const ringTarget = `                      {/* Score Ring / Checklist Icon */}
                      {isChecklist ? (
                        <div style={{ flexShrink: 0, textAlign: 'center' }}>
                          <div style={{
                            width: 88, height: 88, borderRadius: '50%',
                            border: \`4px solid #8b5cf6\`,
                            boxShadow: \`0 0 24px rgba(139,92,246,0.35), inset 0 0 24px rgba(139,92,246,0.11)\`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: \`rgba(139,92,246,0.11)\`
                          }}>
                            <i className="fa-solid fa-list-check" style={{ color: '#8b5cf6', fontSize: '2rem' }} />
                          </div>
                          <div style={{ fontSize: '.72rem', color: 'rgba(255,255,255,0.4)', marginTop: 6, fontWeight: 600 }}>
                            Kontrol Listesi
                          </div>
                        </div>
                      ) : (
                        <div style={{ flexShrink: 0, textAlign: 'center' }}>
                          <div style={{
                            width: 88, height: 88, borderRadius: '50%',
                            border: \`4px solid \${accentColor}\`,
                            boxShadow: \`0 0 24px \${accentColor}55, inset 0 0 24px \${accentColor}11\`,
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            background: \`\${accentColor}11\`
                          }}>
                            <div style={{ fontSize: '1.7rem', fontWeight: 900, color: accentColor, lineHeight: 1 }}>
                              {selectedSub.score_percentage != null ? Math.round(selectedSub.score_percentage) : '—'}
                            </div>
                            <div style={{ fontSize: '.65rem', color: accentColor, fontWeight: 700, opacity: 0.8 }}>PUAN%</div>
                          </div>
                          <div style={{ fontSize: '.72rem', color: 'rgba(255,255,255,0.4)', marginTop: 6, fontWeight: 600 }}>
                            {selectedSub.total_score ?? '—'}/{selectedSub.max_possible_score ?? '—'} p
                          </div>
                        </div>
                      )}`;
const ringRep = `                      {/* Score Ring / Checklist Icon */}
                      {(() => {
                        const hasScoring = template?.form_type === 'inspection'
                        const typeInfo = FORM_TYPE_MAP[template?.form_type] || { label: 'Form', icon: 'fa-file' }
                        return !hasScoring ? (
                          <div style={{ flexShrink: 0, textAlign: 'center' }}>
                            <div style={{
                              width: 88, height: 88, borderRadius: '50%',
                              border: \`4px solid #8b5cf6\`,
                              boxShadow: \`0 0 24px rgba(139,92,246,0.35), inset 0 0 24px rgba(139,92,246,0.11)\`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: \`rgba(139,92,246,0.11)\`
                            }}>
                              <i className={\`fa-solid \${typeInfo.icon}\`} style={{ color: '#8b5cf6', fontSize: '2rem' }} />
                            </div>
                            <div style={{ fontSize: '.72rem', color: 'rgba(255,255,255,0.4)', marginTop: 6, fontWeight: 600 }}>
                              {typeInfo.label}
                            </div>
                          </div>
                        ) : (
                          <div style={{ flexShrink: 0, textAlign: 'center' }}>
                            <div style={{
                              width: 88, height: 88, borderRadius: '50%',
                              border: \`4px solid \${accentColor}\`,
                              boxShadow: \`0 0 24px \${accentColor}55, inset 0 0 24px \${accentColor}11\`,
                              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                              background: \`\${accentColor}11\`
                            }}>
                              <div style={{ fontSize: '1.7rem', fontWeight: 900, color: accentColor, lineHeight: 1 }}>
                                {selectedSub.score_percentage != null ? Math.round(selectedSub.score_percentage) : '—'}
                              </div>
                              <div style={{ fontSize: '.65rem', color: accentColor, fontWeight: 700, opacity: 0.8 }}>PUAN%</div>
                            </div>
                            <div style={{ fontSize: '.72rem', color: 'rgba(255,255,255,0.4)', marginTop: 6, fontWeight: 600 }}>
                              {selectedSub.total_score ?? '—'}/{selectedSub.max_possible_score ?? '—'} p
                            </div>
                          </div>
                        )
                      })()}`;
replaceOnce(ringTarget, ringRep, 'Score ring dynamic icon / hide score in Details Drawer');

// C. Details Drawer: update accentColor and gradientBg checks
const detailAccentTarget = `              const isChecklist = template?.form_type === 'checklist'
              const isCritical = !isChecklist && !!selectedSub.metadata?.failed_critical
              const scoreNum = Number(selectedSub.score_percentage) || 0
              const isGood = !isChecklist && !isCritical && scoreNum >= 70
              const hasAnomaly = !isChecklist && (selectedSub.metadata?.anomalies?.length || 0) > 0
              const accentColor = isChecklist ? '#8b5cf6' : (isCritical ? '#ef4444' : (isGood ? '#10b981' : '#f59e0b'))
              const gradientBg = isChecklist
                ? 'linear-gradient(135deg, #120c1f 0%, #1e1336 50%, #120c1f 100%)'
                : isCritical
                  ? 'linear-gradient(135deg, #1a0808 0%, #2d0f0f 50%, #1e0a0a 100%)'
                  : isGood
                    ? 'linear-gradient(135deg, #071a12 0%, #0d2e1e 50%, #091a12 100%)'
                    : 'linear-gradient(135deg, #1a1208 0%, #2d2010 50%, #1a1208 100%)'`;
const detailAccentRep = `              const hasScoring = template?.form_type === 'inspection'
              const isCritical = hasScoring && !!selectedSub.metadata?.failed_critical
              const scoreNum = Number(selectedSub.score_percentage) || 0
              const isGood = hasScoring && !isCritical && scoreNum >= 70
              const hasAnomaly = hasScoring && (selectedSub.metadata?.anomalies?.length || 0) > 0
              const accentColor = !hasScoring ? '#8b5cf6' : (isCritical ? '#ef4444' : (isGood ? '#10b981' : '#f59e0b'))
              const gradientBg = !hasScoring
                ? 'linear-gradient(135deg, #120c1f 0%, #1e1336 50%, #120c1f 100%)'
                : isCritical
                  ? 'linear-gradient(135deg, #1a0808 0%, #2d0f0f 50%, #1e0a0a 100%)'
                  : isGood
                    ? 'linear-gradient(135deg, #071a12 0%, #0d2e1e 50%, #091a12 100%)'
                    : 'linear-gradient(135deg, #1a1208 0%, #2d2010 50%, #1a1208 100%)'`;
replaceOnce(detailAccentTarget, detailAccentRep, 'Detail drawer header background colors scoring dependencies');

// D. Details drawer Section Header points:
const detailsSectionPointsTarget = `                                      {!isChecklist && sectionMaxPoints > 0 && (
                                        <span style={{ fontSize: '.72rem', fontWeight: 800, color: sectionPercentage >= 70 ? '#10b981' : '#ef4444', background: sectionPercentage >= 70 ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', padding: '3px 10px', borderRadius: 99 }}>
                                          {sectionScoredPoints}/{sectionMaxPoints} — %{sectionPercentage}
                                        </span>
                                      )}`;
const detailsSectionPointsRep = `                                      {template?.form_type === 'inspection' && sectionMaxPoints > 0 && (
                                        <span style={{ fontSize: '.72rem', fontWeight: 800, color: sectionPercentage >= 70 ? '#10b981' : '#ef4444', background: sectionPercentage >= 70 ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', padding: '3px 10px', borderRadius: 99 }}>
                                          {sectionScoredPoints}/{sectionMaxPoints} — %{sectionPercentage}
                                        </span>
                                      )}`;
replaceOnce(detailsSectionPointsTarget, detailsSectionPointsRep, 'Details drawer section header points visibility');

// E. Details drawer row points badge:
const detailsRowPointsTarget = `                                                {!isChecklist && scoreText && (
                                                  <span style={{ fontSize: '.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: score === 0 ? 'rgba(239,68,68,0.1)' : score < field.max_points ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)', color: score === 0 ? '#ef4444' : score < field.max_points ? '#f59e0b' : '#10b981' }}>
                                                    {scoreText}
                                                  </span>
                                                )}`;
const detailsRowPointsRep = `                                                {template?.form_type === 'inspection' && scoreText && (
                                                  <span style={{ fontSize: '.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: score === 0 ? 'rgba(239,68,68,0.1)' : score < field.max_points ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)', color: score === 0 ? '#ef4444' : score < field.max_points ? '#f59e0b' : '#10b981' }}>
                                                    {scoreText}
                                                  </span>
                                                )}`;
replaceOnce(detailsRowPointsTarget, detailsRowPointsRep, 'Details drawer row points visibility');

// F. PDF Print Preview: Score & Verdict Card visibility:
const verdictCardTarget = `        {/* Score & Verdict Card */}
        {template?.form_type !== 'checklist' && (`;
const verdictCardRep = `        {/* Score & Verdict Card */}
        {template?.form_type === 'inspection' && (`;
replaceOnce(verdictCardTarget, verdictCardRep, 'PDF Print verdict card visibility');

// G. PDF Print Preview: Section points visibility:
const pdfSectionPointsTarget = `                  {template?.form_type !== 'checklist' && sectionMaxPoints > 0 && (
                    <span style={{ fontSize: '.75rem', color: '#64748b', fontWeight: 700 }}>
                      {sectionScoredPoints}/{sectionMaxPoints} <span style={{ color: '#4f46e5' }}>%{sectionPercentage}</span>
                    </span>
                  )}`;
const pdfSectionPointsRep = `                  {template?.form_type === 'inspection' && sectionMaxPoints > 0 && (
                    <span style={{ fontSize: '.75rem', color: '#64748b', fontWeight: 700 }}>
                      {sectionScoredPoints}/{sectionMaxPoints} <span style={{ color: '#4f46e5' }}>%{sectionPercentage}</span>
                    </span>
                  )}`;
replaceOnce(pdfSectionPointsTarget, pdfSectionPointsRep, 'PDF Print section points visibility');

// H. PDF Print Preview: Table Columns width & header:
const pdfTableColumnTarget = `                      <th style={{ padding: '8px 12px', fontWeight: 700, color: '#475569', width: template?.form_type === 'checklist' ? '30%' : '20%' }}>Yanıt</th>
                      {template?.form_type !== 'checklist' && (
                        <th style={{ padding: '8px 12px', fontWeight: 700, color: '#475569', width: '15%', textAlign: 'center' }}>Puan</th>
                      )}`;
const pdfTableColumnRep = `                      <th style={{ padding: '8px 12px', fontWeight: 700, color: '#475569', width: template?.form_type !== 'inspection' ? '30%' : '20%' }}>Yanıt</th>
                      {template?.form_type === 'inspection' && (
                        <th style={{ padding: '8px 12px', fontWeight: 700, color: '#475569', width: '15%', textAlign: 'center' }}>Puan</th>
                      )}`;
replaceOnce(pdfTableColumnTarget, pdfTableColumnRep, 'PDF Print table column widths and headers');

// I. PDF Print Preview: Table Row points cell:
const pdfTableRowCellTarget = `                          {template?.form_type !== 'checklist' && (
                            <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: isNeg ? '#ef4444' : '#475569' }}>
                              {ptsAwarded} / {field.max_points}
                            </td>
                          )}`;
const pdfTableRowCellRep = `                          {template?.form_type === 'inspection' && (
                            <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: isNeg ? '#ef4444' : '#475569' }}>
                              {ptsAwarded} / {field.max_points}
                            </td>
                          )}`;
replaceOnce(pdfTableRowCellTarget, pdfTableRowCellRep, 'PDF Print row points cell visibility');

// J. Report Modal Section Success Percent:
const reportSectionTarget = `                          {secAvg?.avg !== null && (
                            <span style={{ background: 'rgba(139,92,246,0.1)', padding: '3px 8px', borderRadius: 6, fontSize: '.75rem', fontWeight: 800 }}>
                              Ortalama Başarı: %{Math.round(secAvg.avg)}
                            </span>
                          )}`;
const reportSectionRep = `                          {reportResults.template.form_type === 'inspection' && secAvg?.avg !== null && (
                            <span style={{ background: 'rgba(139,92,246,0.1)', padding: '3px 8px', borderRadius: 6, fontSize: '.75rem', fontWeight: 800 }}>
                              Ortalama Başarı: %{Math.round(secAvg.avg)}
                            </span>
                          )}`;
replaceOnce(reportSectionTarget, reportSectionRep, 'Report modal section success rate visibility');

const reportPrintSectionTarget = `                              <td style={{ padding: '8px 4px', textAlign: 'right' }}>
                                {secAvg?.avg !== null ? \`%\${Math.round(secAvg.avg)}\` : '—'}
                              </td>`;
const reportPrintSectionRep = `                              <td style={{ padding: '8px 4px', textAlign: 'right' }}>
                                {reportResults.template.form_type === 'inspection' && secAvg?.avg !== null ? \`%\${Math.round(secAvg.avg)}\` : '—'}
                              </td>`;
replaceOnce(reportPrintSectionTarget, reportPrintSectionRep, 'Report modal print-only section success rate visibility');

// Restore line endings
if (originalLineEndings === '\r\n') {
  content = content.replace(/\n/g, '\r\n');
}

fs.writeFileSync(path, content, 'utf8');
console.log('FormSubmissions.jsx updated successfully with all edits.');
