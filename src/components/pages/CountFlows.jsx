import { useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useToast } from '@/hooks/useToast'
import { db } from '@/lib/db'
import AddButton from '@/components/ui/AddButton'
import {
  COUNT_FLOWS_TABLE,
  COUNT_MONTH_ORDINALS,
  COUNT_WEEKDAYS,
  countFlowFromRow,
  countFlowToRow,
  createCountFlowDraft,
  mergeCountFlowLists,
  normalizeCountFlow,
  readCountFlows,
  writeCountFlows,
} from '@/lib/countFlowConfig'
import {
  buildCountFlowProductPreview,
  describeCountSchedule,
  describeCountScope,
  getAllBranchesFromTree,
  parseMaybeArray,
  resolveFlowBranchIds,
  sortCountFlows,
} from '@/lib/countFlowUtils'

const SCHEDULE_OPTIONS = [
  { value: 'daily', label: 'Her gün', icon: 'fa-calendar-day', color: '#2563eb', bg: 'rgba(37,99,235,.12)' },
  { value: 'weekly', label: 'Haftalık', icon: 'fa-calendar-week', color: '#7c3aed', bg: 'rgba(124,58,237,.12)' },
  { value: 'monthly', label: 'Aylık', icon: 'fa-calendar', color: '#d97706', bg: 'rgba(217,119,6,.12)' },
]

function SectionCard({ title, subtitle, children }) {
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, background: '#fff' }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 800, color: '#0f172a' }}>{title}</div>
        {subtitle ? <div style={{ marginTop: 4, fontSize: '.78rem', color: '#64748b' }}>{subtitle}</div> : null}
      </div>
      {children}
    </div>
  )
}

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
      <span>
        <span style={{ display: 'block', fontSize: '.84rem', fontWeight: 700, color: '#0f172a' }}>{label}</span>
        {hint ? <span style={{ display: 'block', marginTop: 3, fontSize: '.75rem', color: '#64748b' }}>{hint}</span> : null}
      </span>
    </label>
  )
}

function Chip({ children, bg = '#eff6ff', color = '#1d4ed8' }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: bg, color, fontSize: '.74rem', fontWeight: 700 }}>
      {children}
    </span>
  )
}

function sanitizeBranchSelections(selections) {
  const normalizedSelections = (selections || []).map(item => ({
    ...item,
    id: String(item.id),
    type: item.type === 'template' ? 'template' : 'branch',
    branchIds: item.type === 'template' ? (item.branchIds || []).map(id => String(id)) : [],
  }))

  const coveredBranchIds = new Set(
    normalizedSelections
      .filter(item => item.type === 'template')
      .flatMap(item => item.branchIds)
  )

  return normalizedSelections.filter(item => item.type === 'template' || !coveredBranchIds.has(String(item.id)))
}

function buildFlowFormState(flow) {
  const initialForm = normalizeCountFlow(flow || createCountFlowDraft())
  return {
    ...initialForm,
    branches: {
      ...initialForm.branches,
      selections: sanitizeBranchSelections(initialForm.branches?.selections || []),
    },
  }
}

function BranchSelection({ branches, templates, value, onChange }) {
  const sanitizedValue = sanitizeBranchSelections(value)
  const selectedTemplateBranchIds = new Set(
    sanitizedValue
      .filter(item => item.type === 'template')
      .flatMap(item => item.branchIds || [])
      .map(id => String(id))
  )

  function toggleBranch(branch) {
    const branchId = String(branch.id)
    if (selectedTemplateBranchIds.has(branchId)) return

    const next = sanitizedValue.some(item => item.type === 'branch' && item.id === branchId)
      ? sanitizedValue.filter(item => !(item.type === 'branch' && item.id === branchId))
      : [...sanitizedValue, { id: branchId, type: 'branch', name: branch.name, branchIds: [] }]
    onChange(sanitizeBranchSelections(next))
  }

  function toggleTemplate(template) {
    const branchIds = parseMaybeArray(template.branch_ids).map(id => String(id))
    const templateId = String(template.id)
    const next = sanitizedValue.some(item => item.type === 'template' && item.id === templateId)
      ? sanitizedValue.filter(item => !(item.type === 'template' && item.id === templateId))
      : [
          ...sanitizedValue.filter(item => !(item.type === 'branch' && branchIds.includes(String(item.id)))),
          { id: templateId, type: 'template', name: template.name, branchIds },
        ]
    onChange(sanitizeBranchSelections(next))
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div>
        <div style={{ fontSize: '.76rem', fontWeight: 800, color: '#64748b', marginBottom: 8 }}>Şube şablonları</div>
        <div style={{ display: 'grid', gap: 8, maxHeight: 140, overflowY: 'auto', paddingRight: 4 }}>
          {templates.map(template => {
            const checked = sanitizedValue.some(item => item.type === 'template' && item.id === String(template.id))
            return (
              <label key={template.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.84rem', color: '#0f172a' }}>
                <input type="checkbox" checked={checked} onChange={() => toggleTemplate(template)} />
                {template.name}
              </label>
            )
          })}
        </div>
      </div>

      <div>
        <div style={{ fontSize: '.76rem', fontWeight: 800, color: '#64748b', marginBottom: 8 }}>Şubeler</div>
        <div style={{ display: 'grid', gap: 8, maxHeight: 170, overflowY: 'auto', paddingRight: 4 }}>
          {branches.map(branch => {
            const branchId = String(branch.id)
            const checked = sanitizedValue.some(item => item.type === 'branch' && item.id === branchId)
            const disabled = selectedTemplateBranchIds.has(branchId)
            return (
              <label key={branch.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.84rem', color: disabled ? '#94a3b8' : '#0f172a' }}>
                <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleBranch(branch)} />
                <span>{branch.name}</span>
              </label>
            )
          })}
        </div>
        {selectedTemplateBranchIds.size > 0 ? (
          <div style={{ marginTop: 8, fontSize: '.74rem', color: '#64748b' }}>
            Seçili şube şablonlarına dahil olan şubeler burada tekrar seçilemez. Şablonlar arası ortak şubeler tek kayıt olarak değerlendirilir.
          </div>
        ) : null}
      </div>
    </div>
  )
}

function NamedItemSelector({ items, value, onChange, placeholder }) {
  const [search, setSearch] = useState('')
  const filteredItems = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('tr-TR')
    if (!normalized) return items
    return items.filter(item => String(item.name || '').toLocaleLowerCase('tr-TR').includes(normalized))
  }, [items, search])

  function toggleItem(item) {
    const id = String(item.id)
    const exists = value.some(entry => entry.id === id)
    onChange(exists ? value.filter(entry => entry.id !== id) : [...value, { id, name: String(item.name || ''), sku: item.sku ? String(item.sku) : '' }])
  }

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, background: '#fff' }}>
      <input className="f-input" value={search} onChange={event => setSearch(event.target.value)} placeholder={placeholder} style={{ marginBottom: 10 }} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {value.length === 0 ? <span style={{ fontSize: '.77rem', color: '#94a3b8' }}>Henüz seçim yapılmadı.</span> : null}
        {value.map(item => <Chip key={item.id}>{item.name}</Chip>)}
      </div>
      <div style={{ display: 'grid', gap: 8, maxHeight: 170, overflowY: 'auto', paddingRight: 4 }}>
        {filteredItems.map(item => {
          const checked = value.some(entry => entry.id === String(item.id))
          return (
            <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.84rem', color: '#0f172a' }}>
              <input type="checkbox" checked={checked} onChange={() => toggleItem(item)} />
              <span style={{ flex: 1 }}>{item.name}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

function ScheduleEditor({ value, onChange }) {
  function setField(key, nextValue) {
    onChange({ ...value, [key]: nextValue })
  }

  function toggleWeekday(day) {
    setField('weekdays', value.weekdays.includes(day) ? value.weekdays.filter(item => item !== day) : [...value.weekdays, day])
  }

  function toggleMonthDay(day) {
    setField('monthlyDays', value.monthlyDays.includes(day) ? value.monthlyDays.filter(item => item !== day) : [...value.monthlyDays, day])
  }

  function updateRule(index, patch) {
    setField('monthlyWeekdayRules', value.monthlyWeekdayRules.map((rule, ruleIndex) => (
      ruleIndex === index ? { ...rule, ...patch } : rule
    )))
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {SCHEDULE_OPTIONS.map(option => {
          const active = value.frequency === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setField('frequency', option.value)}
              style={{ border: `1.5px solid ${active ? option.color : '#e2e8f0'}`, background: active ? option.bg : '#fff', color: active ? option.color : '#475569', borderRadius: 10, padding: '9px 12px', fontSize: '.82rem', fontWeight: 800, cursor: 'pointer' }}
            >
              <i className={`fa-solid ${option.icon}`} style={{ marginRight: 6 }} />
              {option.label}
            </button>
          )
        })}
      </div>

      <div>
        <label className="f-label">Başlangıç saati</label>
        <input className="f-input" type="time" value={value.startTime} onChange={event => setField('startTime', event.target.value)} />
      </div>

      {value.frequency === 'weekly' ? (
        <div>
          <label className="f-label">Günler</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {COUNT_WEEKDAYS.map(day => {
              const checked = value.weekdays.includes(day)
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleWeekday(day)}
                  style={{ border: `1px solid ${checked ? '#6366f1' : '#e2e8f0'}`, background: checked ? '#eef2ff' : '#fff', color: checked ? '#4338ca' : '#475569', borderRadius: 999, padding: '7px 11px', fontSize: '.78rem', fontWeight: 700, cursor: 'pointer' }}
                >
                  {day}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {value.frequency === 'monthly' ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className={value.monthlyMode === 'days' ? 'btn-p' : 'btn-o'} onClick={() => setField('monthlyMode', 'days')}>Ayın günleri</button>
            <button type="button" className={value.monthlyMode === 'weekday' ? 'btn-p' : 'btn-o'} onClick={() => setField('monthlyMode', 'weekday')}>Ayın haftası</button>
          </div>

          {value.monthlyMode === 'days' ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {[1, 5, 10, 15, 20, 25, 28, 30, 'last'].map(day => {
                const checked = value.monthlyDays.includes(day)
                return (
                  <button
                    key={String(day)}
                    type="button"
                    onClick={() => toggleMonthDay(day)}
                    style={{ border: `1px solid ${checked ? '#d97706' : '#e2e8f0'}`, background: checked ? 'rgba(217,119,6,.12)' : '#fff', color: checked ? '#b45309' : '#475569', borderRadius: 999, padding: '7px 11px', fontSize: '.78rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    {day === 'last' ? 'Ay sonu' : `${day}. gün`}
                  </button>
                )
              })}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {value.monthlyWeekdayRules.map((rule, index) => (
                <div key={`${rule.ordinal}-${rule.weekday}-${index}`} style={{ display: 'flex', gap: 8 }}>
                  <select className="f-input" value={rule.ordinal} onChange={event => updateRule(index, { ordinal: event.target.value })}>
                    {COUNT_MONTH_ORDINALS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                  <select className="f-input" value={rule.weekday} onChange={event => updateRule(index, { weekday: event.target.value })}>
                    {COUNT_WEEKDAYS.map(day => <option key={day} value={day}>{day}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

function ProductModeEditor({ value, stockItems, categories, stockTemplates, onChange }) {
  function setField(key, nextValue) {
    onChange({ ...value, [key]: nextValue })
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {[
          ['moving', 'Hareket gören ürünler'],
          ['all', 'Tüm ürünler'],
          ['manual', 'Tek tek seçim'],
          ['category', 'Kategori bazlı'],
          ['template', 'Şablon bazlı'],
        ].map(([mode, label]) => {
          const active = value.mode === mode
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setField('mode', mode)}
              style={{ border: `1px solid ${active ? '#2563eb' : '#e2e8f0'}`, background: active ? '#eff6ff' : '#fff', color: active ? '#1d4ed8' : '#475569', borderRadius: 999, padding: '8px 12px', fontSize: '.78rem', fontWeight: 700, cursor: 'pointer' }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {value.mode === 'moving' ? (
        <div>
          <label className="f-label">Son kaç gün hareketi olan ürünler?</label>
          <input className="f-input" type="number" min="1" max="365" value={value.movementDays} onChange={event => setField('movementDays', Number(event.target.value || 30))} />
        </div>
      ) : null}

      {value.mode === 'manual' ? <NamedItemSelector items={stockItems} value={value.selectedStocks} onChange={next => setField('selectedStocks', next)} placeholder="Ürün ara" /> : null}
      {value.mode === 'category' ? <NamedItemSelector items={categories} value={value.selectedCategories} onChange={next => setField('selectedCategories', next)} placeholder="Kategori ara" /> : null}
      {value.mode === 'template' ? <NamedItemSelector items={stockTemplates} value={value.selectedTemplates} onChange={next => setField('selectedTemplates', next)} placeholder="Şablon ara" /> : null}
    </div>
  )
}

function FlowForm({ flow, branches, branchTemplates, stockItems, stockTemplates, categories, onSave, onCancel, storageMode }) {
  const toast = useToast()
  const [form, setForm] = useState(() => buildFlowFormState(flow))

  useEffect(() => {
    setForm(buildFlowFormState(flow))
  }, [flow])

  function setField(key, nextValue) {
    setForm(current => ({ ...current, [key]: nextValue }))
  }

  function validate() {
    if (!form.name.trim()) {
      toast('Akış adı zorunludur.', 'error')
      return false
    }
    if (!form.branches.allBranches && form.branches.selections.length === 0) {
      toast('En az bir şube veya şablon seçmelisiniz.', 'error')
      return false
    }
    if (form.schedule.frequency === 'weekly' && form.schedule.weekdays.length === 0) {
      toast('Haftalık akış için en az bir gün seçmelisiniz.', 'error')
      return false
    }
    if (form.products.mode === 'manual' && form.products.selectedStocks.length === 0) {
      toast('Tek tek seçim modunda en az bir ürün seçmelisiniz.', 'error')
      return false
    }
    if (form.products.mode === 'category' && form.products.selectedCategories.length === 0) {
      toast('Kategori bazlı modda en az bir kategori seçmelisiniz.', 'error')
      return false
    }
    if (form.products.mode === 'template' && form.products.selectedTemplates.length === 0) {
      toast('Şablon bazlı modda en az bir şablon seçmelisiniz.', 'error')
      return false
    }
    return true
  }

  async function handleSave() {
    if (!validate()) return
    await onSave({
      ...form,
      branches: {
        ...form.branches,
        selections: sanitizeBranchSelections(form.branches.selections),
      },
    })
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <SectionCard title="Temel bilgiler" subtitle={`Depolama: ${storageMode === 'database' ? 'Veritabanı' : 'Lokal taslak'}`}>
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <label className="f-label">Akış adı</label>
            <input className="f-input" value={form.name} onChange={event => setField('name', event.target.value)} placeholder="Örn: Günlük içecek sayımı" />
          </div>
          <div>
            <label className="f-label">Açıklama</label>
            <textarea className="f-input" rows="3" value={form.description} onChange={event => setField('description', event.target.value)} placeholder="Şube ekibi için kısa kullanım notu" />
          </div>
          <Toggle checked={form.active} onChange={checked => setField('active', checked)} label="Akış aktif olsun" hint="Aktif akışlar şube sayım ekranında listelenir." />
        </div>
      </SectionCard>

      <SectionCard title="1. Şube kapsamı" subtitle="Bu akışın hangi şubelerde görüneceğini belirleyin.">
        <div style={{ display: 'grid', gap: 14 }}>
          <Toggle checked={form.branches.allBranches} onChange={checked => setField('branches', { ...form.branches, allBranches: checked, selections: checked ? [] : form.branches.selections })} label="Tüm şubelerde kullan" hint="İşaretlenirse aşağıdaki özel seçimler temizlenir." />
          {!form.branches.allBranches ? <BranchSelection branches={branches} templates={branchTemplates} value={form.branches.selections} onChange={next => setField('branches', { ...form.branches, selections: next })} /> : null}
        </div>
      </SectionCard>

      <SectionCard title="2. Takvim" subtitle="Sayımın hangi gün ve saatte açılacağını tanımlayın.">
        <ScheduleEditor value={form.schedule} onChange={next => setField('schedule', next)} />
      </SectionCard>

      <SectionCard title="3. Ürün kapsamı" subtitle="Şube sayım ekranında hangi ürünlerin listeleneceğini belirleyin.">
        <ProductModeEditor value={form.products} stockItems={stockItems} categories={categories} stockTemplates={stockTemplates} onChange={next => setField('products', next)} />
      </SectionCard>

      <SectionCard title="Operasyon notları" subtitle="Şube kullanımı için yardımcı beklentiler.">
        <div style={{ display: 'grid', gap: 10 }}>
          <Toggle checked={form.notes.mobileEntry} onChange={checked => setField('notes', { ...form.notes, mobileEntry: checked })} label="Mobil giriş öncelikli" hint="Sayımın mobilde daha sık kullanılacağını belirtir." />
          <Toggle checked={form.notes.printableForm} onChange={checked => setField('notes', { ...form.notes, printableForm: checked })} label="Yazdırılabilir form beklensin" hint="İstenirse daha sonra çıktı tarafı bu nota göre geliştirilebilir." />
        </div>
      </SectionCard>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button type="button" className="btn-o" onClick={onCancel}>Vazgeç</button>
        <button type="button" className="btn-p" onClick={handleSave}>Kaydet</button>
      </div>
    </div>
  )
}

function ModalShell({ title, subtitle, width = 'min(96vw, 860px)', onClose, children, footer }) {
  return (
    <div className="modal-bg open">
      <div className="modal-box" style={{ width, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>{title}</h2>
              {subtitle ? <p style={{ margin: '4px 0 0', fontSize: '.82rem', color: '#94a3b8' }}>{subtitle}</p> : null}
            </div>
            <button className="ico-btn" onClick={onClose} style={{ fontSize: '1rem', color: '#64748b' }}>
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        </div>
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
          {children}
        </div>
        {footer ? <div style={{ padding: 16, borderTop: '1px solid #e2e8f0', background: '#fff' }}>{footer}</div> : null}
      </div>
    </div>
  )
}

function DetailContent({ flow, branches, stockItems, stockTemplates, storageMode, onEdit, onDelete, onRestore }) {
  const scheduleOption = SCHEDULE_OPTIONS.find(option => option.value === flow.schedule.frequency)
  const branchIds = resolveFlowBranchIds(flow, branches)
  const branchNames = flow.branches.allBranches
    ? branches.map(branch => branch.name)
    : branches.filter(branch => branchIds.includes(String(branch.id))).map(branch => branch.name)
  const productPreview = buildCountFlowProductPreview(flow, stockItems, stockTemplates)

  return (
    <>
      <div style={{ padding: '18px 18px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontSize: '1rem', fontWeight: 900, color: '#0f172a' }}>{flow.name}</div>
            <Chip bg={flow.active ? '#dcfce7' : '#f1f5f9'} color={flow.active ? '#166534' : '#64748b'}>{flow.active ? 'Aktif' : 'Pasif'}</Chip>
            {flow.deletedAt ? <Chip bg="#fee2e2" color="#b91c1c">Silinmiş</Chip> : null}
          </div>
          {flow.description ? <div style={{ marginTop: 6, fontSize: '.78rem', color: '#64748b' }}>{flow.description}</div> : null}
          <div style={{ marginTop: 6, fontSize: '.74rem', color: '#94a3b8' }}>Depolama: {storageMode === 'database' ? 'Veritabanı' : 'Lokal taslak'}</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {!flow.deletedAt ? (
            <>
              <button className="ico-btn edit" onClick={onEdit}><i className="fa-solid fa-pen" /></button>
              <button className="ico-btn del" onClick={onDelete}><i className="fa-solid fa-trash" /></button>
            </>
          ) : (
            <button className="btn-o" onClick={onRestore}>Geri Al</button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 16, padding: 18 }}>
        <SectionCard title="Şube kapsamı" subtitle={flow.branches.allBranches ? 'Tüm şubeler seçildi' : `${branchIds.length} şube kapsanıyor`}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {branchNames.length === 0 ? <span style={{ fontSize: '.78rem', color: '#94a3b8' }}>Seçim yok</span> : branchNames.map(name => <Chip key={name}>{name}</Chip>)}
          </div>
        </SectionCard>

        <SectionCard title="Takvim" subtitle={describeCountSchedule(flow.schedule)}>
          <div style={{ display: 'grid', gap: 10 }}>
            <Chip bg={scheduleOption?.bg || '#eff6ff'} color={scheduleOption?.color || '#1d4ed8'}>{scheduleOption?.label || 'Tanımsız'}</Chip>
            <div style={{ fontSize: '.82rem', color: '#475569' }}>Başlangıç saati: <strong>{flow.schedule.startTime}</strong></div>
          </div>
        </SectionCard>

        <SectionCard title="Ürün kapsamı" subtitle={describeCountScope(flow.products)}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {productPreview.length === 0 ? <span style={{ fontSize: '.78rem', color: '#94a3b8' }}>Önizleme ürünü yok</span> : productPreview.map(item => <Chip key={item.id} bg="#f8fafc" color="#475569">{item.name}</Chip>)}
          </div>
        </SectionCard>
      </div>
    </>
  )
}

export default function CountFlows() {
  const toast = useToast()
  const [flows, setFlows] = useState([])
  const [branches, setBranches] = useState([])
  const [branchTemplates, setBranchTemplates] = useState([])
  const [stockItems, setStockItems] = useState([])
  const [stockTemplates, setStockTemplates] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [storageMode, setStorageMode] = useState('database')
  const [infoMessage, setInfoMessage] = useState('')
  const [search, setSearch] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)
  const [editingFlow, setEditingFlow] = useState(null)
  const [selectedFlowId, setSelectedFlowId] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState('')

  useEffect(() => {
    let ignore = false

    async function load() {
      setLoading(true)
      const localFlows = readCountFlows()
      const [settingsResult, branchTemplatesResult, stockItemsResult, stockTemplatesResult, categoriesResult, flowsResult] = await Promise.all([
        db.from('settings').select('value').eq('key', 'company_tree').single(),
        db.from('branch_templates').select('*').is('deleted_at', null).order('name'),
        db.from('stock_items').select('id,name,sku,cat_l1,cat_l2,cat_l3,cat_l4,cat_l5').is('deleted_at', null).order('name'),
        db.from('stock_templates').select('id,name,stock_ids').is('deleted_at', null).order('name'),
        db.from('categories').select('id,name').is('deleted_at', null).order('name'),
        db.from(COUNT_FLOWS_TABLE).select('*').order('updated_at', { ascending: false }),
      ])

      if (ignore) return

      setBranches(getAllBranchesFromTree(settingsResult.data?.value || []))
      setBranchTemplates(branchTemplatesResult.data || [])
      setStockItems(stockItemsResult.data || [])
      setStockTemplates(stockTemplatesResult.data || [])
      setCategories(categoriesResult.data || [])

      if (flowsResult.error) {
        setStorageMode('local')
        setFlows(sortCountFlows(localFlows))
        setInfoMessage('`count_flows` tablosu okunamadı. Akışlar lokal taslak modunda gösteriliyor.')
      } else {
        const databaseFlows = (flowsResult.data || []).map(countFlowFromRow)
        const mergedFlows = mergeCountFlowLists(databaseFlows, localFlows)
        setStorageMode('database')
        setFlows(sortCountFlows(mergedFlows))
        setInfoMessage('Sayım akışları yüklendi. Aktif akışlar şube sayım ekranında kullanılır.')
      }

      setLoading(false)
    }

    load()
    return () => {
      ignore = true
    }
  }, [])

  function persistLocal(nextFlows, message) {
    const normalized = sortCountFlows(writeCountFlows(nextFlows))
    setFlows(normalized)
    setStorageMode('local')
    setInfoMessage(message)
  }

  async function saveFlow(nextFlow) {
    const normalized = normalizeCountFlow({ ...nextFlow, updatedAt: new Date().toISOString() })

    if (storageMode === 'database') {
      const payload = countFlowToRow(normalized)
      const query = flows.some(item => item.id === normalized.id)
        ? db.from(COUNT_FLOWS_TABLE).update(payload).eq('id', normalized.id).select('*').single()
        : db.from(COUNT_FLOWS_TABLE).insert(payload).select('*').single()

      const { data, error } = await query
      if (!error && data) {
        const saved = countFlowFromRow(data)
        setFlows(current => sortCountFlows([saved, ...current.filter(item => item.id !== saved.id)]))
        setSelectedFlowId('')
        setEditingFlow(null)
        toast('Sayım akışı kaydedildi.', 'success')
        return
      }
    }

    persistLocal([normalized, ...flows.filter(item => item.id !== normalized.id)], 'Veritabanı kaydı yapılamadı. Akış lokal taslak olarak saklandı.')
    setSelectedFlowId('')
    setEditingFlow(null)
    toast('Sayım akışı lokal olarak kaydedildi.', 'success')
  }

  async function softDelete(id) {
    if (storageMode === 'database') {
      const { data, error } = await db.from(COUNT_FLOWS_TABLE).update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id).select('*').single()
      if (!error && data) {
        const saved = countFlowFromRow(data)
        setFlows(current => sortCountFlows([saved, ...current.filter(item => item.id !== saved.id)]))
        setConfirmDeleteId('')
        setSelectedFlowId(current => current === id ? '' : current)
        setEditingFlow(current => current?.id === id ? null : current)
        toast('Sayım akışı silindi.', 'info')
        return
      }
    }

    persistLocal(flows.map(flow => flow.id === id ? { ...flow, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : flow), 'Silme işlemi lokal taslak kayıtları üzerinde yapıldı.')
    setConfirmDeleteId('')
    setSelectedFlowId(current => current === id ? '' : current)
    setEditingFlow(current => current?.id === id ? null : current)
    toast('Sayım akışı silindi.', 'info')
  }

  async function restoreFlow(id) {
    if (storageMode === 'database') {
      const { data, error } = await db.from(COUNT_FLOWS_TABLE).update({ deleted_at: null, updated_at: new Date().toISOString() }).eq('id', id).select('*').single()
      if (!error && data) {
        const saved = countFlowFromRow(data)
        setFlows(current => sortCountFlows([saved, ...current.filter(item => item.id !== saved.id)]))
        toast('Sayım akışı geri alındı.', 'success')
        return
      }
    }

    persistLocal(flows.map(flow => flow.id === id ? { ...flow, deletedAt: null, updatedAt: new Date().toISOString() } : flow), 'Geri alma işlemi lokal taslak kayıtları üzerinde yapıldı.')
    toast('Sayım akışı geri alındı.', 'success')
  }

  function openAddFlow() {
    setSelectedFlowId('')
    setEditingFlow(createCountFlowDraft())
  }

  function openEditFlow(flow) {
    setSelectedFlowId('')
    setEditingFlow(flow)
  }

  function openDetailFlow(flow) {
    setEditingFlow(null)
    setSelectedFlowId(flow.id)
  }

  const visibleFlows = showDeleted ? flows : flows.filter(flow => !flow.deletedAt)
  const filteredFlows = visibleFlows.filter(flow => {
    const normalizedSearch = search.trim().toLocaleLowerCase('tr-TR')
    if (!normalizedSearch) return true
    return [
      flow.name,
      flow.description,
      describeCountSchedule(flow.schedule),
      describeCountScope(flow.products),
      ...resolveFlowBranchIds(flow, branches).map(id => branches.find(branch => String(branch.id) === String(id))?.name || ''),
    ].some(value => String(value || '').toLocaleLowerCase('tr-TR').includes(normalizedSearch))
  })

  const scheduleCounts = useMemo(() => ({
    daily: filteredFlows.filter(flow => flow.schedule.frequency === 'daily').length,
    weekly: filteredFlows.filter(flow => flow.schedule.frequency === 'weekly').length,
    monthly: filteredFlows.filter(flow => flow.schedule.frequency === 'monthly').length,
  }), [filteredFlows])

  const selectedFlow = flows.find(flow => flow.id === selectedFlowId) || null
  const selectedScheduleOption = selectedFlow ? SCHEDULE_OPTIONS.find(option => option.value === selectedFlow.schedule.frequency) : null

  return (
    <div className="page-enter">
      <Header
        title="Sayım Akışları"
        subtitle="Şube sayım planlarını oluşturun. Aktif akışlar Şube İşlemleri > Sayım ekranında listelenir."
        actions={
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '.83rem', fontWeight: 600, color: showDeleted ? '#dc2626' : '#64748b', background: showDeleted ? '#fee2e2' : '#f1f5f9', padding: '7px 14px', borderRadius: 10, userSelect: 'none' }}>
              <label className="tog" onClick={event => event.stopPropagation()}>
                <input type="checkbox" checked={showDeleted} onChange={event => setShowDeleted(event.target.checked)} />
                <span className="tog-sl" />
              </label>
              Silinmişleri göster
            </label>
            <AddButton onClick={openAddFlow} label="Yeni Akış" />
          </>
        }
      />

      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ padding: '10px 12px', borderRadius: 12, background: storageMode === 'database' ? '#eff6ff' : '#fffbeb', color: storageMode === 'database' ? '#1d4ed8' : '#92400e', fontSize: '.82rem', lineHeight: 1.6 }}>
            {infoMessage || (storageMode === 'database' ? 'Sayım akışları veritabanında tutuluyor.' : 'Sayım akışları lokal taslak modunda tutuluyor.')}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
              <i className="fa-solid fa-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '.8rem' }} />
              <input className="f-input" placeholder="Akış adı, şube veya ürün kapsamı ara" value={search} onChange={event => setSearch(event.target.value)} style={{ paddingLeft: 34 }} />
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Chip bg="#f1f5f9" color="#475569">{filteredFlows.length} akış</Chip>
              {SCHEDULE_OPTIONS.map(option => (
                <Chip key={option.value} bg={option.bg} color={option.color}>{option.label}: {scheduleCounts[option.value]}</Chip>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />
            Sayım akışları yükleniyor...
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Akış</th>
                <th>Takvim</th>
                <th>Şubeler</th>
                <th>Ürün Kapsamı</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filteredFlows.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty">
                      <i className="fa-solid fa-clipboard-list" />
                      <p>{search ? 'Arama sonucu bulunamadı' : 'Henüz sayım akışı tanımlanmadı'}</p>
                    </div>
                  </td>
                </tr>
              ) : filteredFlows.map(flow => {
                const scheduleOption = SCHEDULE_OPTIONS.find(option => option.value === flow.schedule.frequency)
                const branchIds = resolveFlowBranchIds(flow, branches)
                const branchNames = flow.branches.allBranches
                  ? branches.map(branch => branch.name)
                  : branches.filter(branch => branchIds.includes(String(branch.id))).map(branch => branch.name)
                const productPreview = buildCountFlowProductPreview(flow, stockItems, stockTemplates)
                const updatedLabel = flow.updatedAt ? new Date(flow.updatedAt).toLocaleDateString('tr-TR') : '—'
                const branchSummary = branchNames.length === 0 ? 'Seçim yok' : `${branchNames.slice(0, 2).join(', ')}${branchNames.length > 2 ? ` +${branchNames.length - 2}` : ''}`

                return (
                  <tr key={flow.id} className={flow.deletedAt ? 'deleted' : ''} onClick={() => openDetailFlow(flow)} style={{ cursor: 'pointer', opacity: flow.deletedAt ? 0.68 : 1 }}>
                    <td style={{ minWidth: 220 }}>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{flow.name}</div>
                      {flow.description ? <div style={{ marginTop: 4, fontSize: '.74rem', color: '#64748b' }}>{flow.description}</div> : null}
                    </td>

                    <td style={{ minWidth: 180 }}>
                      <div style={{ display: 'grid', gap: 6 }}>
                        <Chip bg={scheduleOption?.bg || '#eff6ff'} color={scheduleOption?.color || '#1d4ed8'}>{scheduleOption?.label || 'Tanımsız'}</Chip>
                        <div style={{ fontSize: '.76rem', color: '#475569' }}>{describeCountSchedule(flow.schedule)}</div>
                        <div style={{ fontSize: '.72rem', color: '#94a3b8' }}>Başlangıç: {flow.schedule.startTime}</div>
                      </div>
                    </td>

                    <td style={{ minWidth: 170 }}>
                      <div style={{ display: 'grid', gap: 6 }}>
                        <div style={{ fontSize: '.82rem', fontWeight: 700, color: '#0f172a' }}>{flow.branches.allBranches ? `Tüm şubeler (${branches.length})` : `${branchIds.length} şube`}</div>
                        <div style={{ fontSize: '.74rem', color: '#64748b' }}>{branchSummary}</div>
                      </div>
                    </td>

                    <td style={{ minWidth: 230 }}>
                      <div style={{ display: 'grid', gap: 6 }}>
                        <div style={{ fontSize: '.82rem', fontWeight: 700, color: '#0f172a' }}>{describeCountScope(flow.products)}</div>
                        {productPreview.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {productPreview.slice(0, 3).map(item => <Chip key={item.id} bg="#f8fafc" color="#475569">{item.name}</Chip>)}
                            {productPreview.length > 3 ? <Chip bg="#f1f5f9" color="#64748b">+{productPreview.length - 3}</Chip> : null}
                          </div>
                        ) : (
                          <div style={{ fontSize: '.74rem', color: '#94a3b8' }}>Önizleme ürünü yok</div>
                        )}
                      </div>
                    </td>

                    <td style={{ minWidth: 130 }}>
                      <div style={{ display: 'grid', gap: 6 }}>
                        <Chip bg={flow.active ? '#dcfce7' : '#f1f5f9'} color={flow.active ? '#166534' : '#64748b'}>{flow.active ? 'Aktif' : 'Pasif'}</Chip>
                        {flow.deletedAt ? <Chip bg="#fee2e2" color="#b91c1c">Silinmiş</Chip> : <span style={{ fontSize: '.72rem', color: '#94a3b8' }}>Güncelleme: {updatedLabel}</span>}
                      </div>
                    </td>

                    <td>
                      <div style={{ display: 'flex', gap: 6 }} onClick={event => event.stopPropagation()}>
                        {flow.deletedAt ? (
                          <button className="btn-o" onClick={() => restoreFlow(flow.id)}>Geri Al</button>
                        ) : (
                          <>
                            <button className="ico-btn edit" onClick={() => openEditFlow(flow)}><i className="fa-solid fa-pen" /></button>
                            <button className="ico-btn del" onClick={() => setConfirmDeleteId(flow.id)}><i className="fa-solid fa-trash" /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {selectedFlow ? (
        <ModalShell
          title="Sayım Akışı Detayı"
          subtitle={selectedFlow.name}
          width="min(92vw, 760px)"
          onClose={() => setSelectedFlowId('')}
          footer={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: '.78rem', color: '#94a3b8' }}>Depolama: {storageMode === 'database' ? 'Veritabanı' : 'Lokal taslak'}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-o" onClick={() => setSelectedFlowId('')}>Kapat</button>
                {selectedFlow.deletedAt ? (
                  <button className="btn-o" onClick={() => restoreFlow(selectedFlow.id)}>Geri Al</button>
                ) : (
                  <>
                    <button className="btn-o" onClick={() => openEditFlow(selectedFlow)}>Düzenle</button>
                    <button type="button" className="btn-o" style={{ color: '#b91c1c', borderColor: '#fecaca', background: '#fff7f7' }} onClick={() => setConfirmDeleteId(selectedFlow.id)}>Sil</button>
                  </>
                )}
              </div>
            </div>
          }
        >
          {selectedFlow.description ? <div style={{ marginBottom: 14, fontSize: '.84rem', color: '#64748b' }}>{selectedFlow.description}</div> : null}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <Chip bg={selectedFlow.active ? '#dcfce7' : '#f1f5f9'} color={selectedFlow.active ? '#166534' : '#64748b'}>{selectedFlow.active ? 'Aktif' : 'Pasif'}</Chip>
            {selectedFlow.deletedAt ? <Chip bg="#fee2e2" color="#b91c1c">Silinmiş</Chip> : null}
            <Chip bg={selectedScheduleOption?.bg || '#eff6ff'} color={selectedScheduleOption?.color || '#1d4ed8'}>{describeCountSchedule(selectedFlow.schedule)}</Chip>
          </div>
          <div style={{ margin: '-18px' }}>
            <DetailContent flow={selectedFlow} branches={branches} stockItems={stockItems} stockTemplates={stockTemplates} storageMode={storageMode} onEdit={() => openEditFlow(selectedFlow)} onDelete={() => setConfirmDeleteId(selectedFlow.id)} onRestore={() => restoreFlow(selectedFlow.id)} />
          </div>
        </ModalShell>
      ) : null}

      {editingFlow !== null ? (
        <ModalShell
          title={editingFlow?.id ? 'Sayım Akışı Düzenle' : 'Yeni Sayım Akışı'}
          subtitle="Liste ekranından açılan masaüstü detay penceresi"
          onClose={() => setEditingFlow(null)}
        >
          <FlowForm flow={editingFlow?.id ? editingFlow : null} branches={branches} branchTemplates={branchTemplates} stockItems={stockItems} stockTemplates={stockTemplates} categories={categories} onSave={saveFlow} onCancel={() => setEditingFlow(null)} storageMode={storageMode} />
        </ModalShell>
      ) : null}

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Bu sayım akışı silinsin mi?"
        desc="Silinen akışlar geri alınabilir. Şube ekranında artık önerilmez."
        onConfirm={() => softDelete(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId('')}
      />
    </div>
  )
}
