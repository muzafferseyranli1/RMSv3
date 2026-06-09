import { useCallback, useEffect, useState } from 'react'
import { db } from '@/lib/db'
import { useToast } from '@/hooks/useToast'
import Header from '@/components/layout/Header'
import Modal from '@/components/ui/Modal'
import AddButton from '@/components/ui/AddButton'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

const TEMPLATE_META = {
  branch: {
    table: 'branch_templates',
    idField: 'branch_ids',
    tabLabel: 'Şube Şablonları',
    singularLabel: 'Şube',
    itemLabel: 'Şubeler',
    emptyTypeLabel: 'şube',
    icon: 'fa-store',
    tagBg: '#e0f2fe',
    tagColor: '#0369a1',
    namePlaceholder: 'ör. Anadolu Yakası Şubeleri',
    selectPlaceholder: 'Şube seçin…',
    emptyMsg: 'Şirket kuruluşunda henüz şube tanımlanmadı',
  },
  stock: {
    table: 'stock_templates',
    idField: 'stock_ids',
    tabLabel: 'Stok Malı Şablonları',
    singularLabel: 'Stok Malı',
    itemLabel: 'Stok Malları',
    emptyTypeLabel: 'stok malı',
    icon: 'fa-cube',
    tagBg: '#d1fae5',
    tagColor: '#065f46',
    namePlaceholder: 'ör. Temel Mutfak Malzemeleri',
    selectPlaceholder: 'Stok malı seçin…',
    emptyMsg: 'Henüz stok malı eklenmedi',
  },
  sale: {
    table: 'sale_templates',
    idField: 'sale_ids',
    tabLabel: 'Satış Malı Şablonları',
    singularLabel: 'Satış Malı',
    itemLabel: 'Satış Malları',
    emptyTypeLabel: 'satış malı',
    icon: 'fa-tag',
    tagBg: '#ffedd5',
    tagColor: '#c2410c',
    namePlaceholder: 'ör. Kafe İçecek Menüsü',
    selectPlaceholder: 'Satış malı seçin…',
    emptyMsg: 'Henüz satış malı eklenmedi',
  },
}

function getAllBranches(tree) {
  const result = []

  function walk(nodes) {
    for (const node of nodes || []) {
      if (node.type === 'sube' || node.type === 'anadepo' || node.type === 'mutfak' || node.type === 'uretim') result.push({ id: node.id, name: node.name })
      walk(node.children || [])
    }
  }

  walk(tree)
  return result
}

function MultiSelect({ items, selected, onChange, placeholder, emptyMsg, labelKey = 'name' }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = items.filter(item =>
    !search || item[labelKey].toLowerCase().includes(search.toLowerCase())
  )
  const allChecked = filtered.length > 0 && filtered.every(item => selected.includes(item.id))

  function toggle(id) {
    onChange(selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id])
  }

  function toggleAll() {
    onChange(allChecked ? [] : filtered.map(item => item.id))
  }

  return (
    <div style={{ position: 'relative' }}>
      <div
        onClick={() => {
          setOpen(value => !value)
          setSearch('')
        }}
        style={{
          border: `1.5px solid ${open ? '#fbbf24' : '#c4cdd9'}`,
          borderRadius: 10,
          padding: '9px 36px 9px 12px',
          cursor: 'pointer',
          fontSize: '.855rem',
          color: '#374151',
          background: '#fff',
          minHeight: 40,
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 4,
          userSelect: 'none',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,.06)',
        }}
      >
        {selected.length === 0 ? (
          <span style={{ color: '#94a3b8' }}>{placeholder}</span>
        ) : (
          selected.map(id => {
            const item = items.find(entry => entry.id === id)
            return item ? (
              <span
                key={id}
                style={{
                  background: '#e0f2fe',
                  color: '#0369a1',
                  borderRadius: 99,
                  padding: '2px 8px',
                  fontSize: '.74rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {item[labelKey]}
                <span
                  onClick={event => {
                    event.stopPropagation()
                    toggle(id)
                  }}
                  style={{ cursor: 'pointer', opacity: 0.6 }}
                >
                  ×
                </span>
              </span>
            ) : null
          })
        )}
      </div>
      <i
        className="fa-solid fa-chevron-down"
        style={{
          position: 'absolute',
          right: 12,
          top: 14,
          color: '#94a3b8',
          fontSize: '.65rem',
          pointerEvents: 'none',
        }}
      />

      {open && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 'calc(100% + 4px)',
            background: '#fff',
            border: '1.5px solid #e2e8f0',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,.12)',
            zIndex: 199,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '8px 10px',
              borderBottom: '1px solid #f1f5f9',
              display: 'flex',
              gap: 6,
            }}
          >
            <i
              className="fa-solid fa-search"
              style={{ color: '#94a3b8', fontSize: '.75rem', alignSelf: 'center' }}
            />
            <input
              className="f-input"
              placeholder="Ara…"
              value={search}
              onChange={event => setSearch(event.target.value)}
              style={{
                padding: '6px 10px',
                fontSize: '.83rem',
                border: 'none',
                outline: 'none',
                boxShadow: 'none',
                flex: 1,
              }}
              onClick={event => event.stopPropagation()}
            />
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {items.length === 0 ? (
              <div style={{ padding: 14, textAlign: 'center', fontSize: '.8rem', color: '#94a3b8' }}>
                {emptyMsg}
              </div>
            ) : (
              <>
                {!search && (
                  <div
                    onClick={event => {
                      event.stopPropagation()
                      toggleAll()
                    }}
                    style={{
                      padding: '9px 14px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      fontSize: '.83rem',
                      borderBottom: '2px solid #e2e8f0',
                      background: '#f8fafc',
                      fontWeight: 700,
                    }}
                  >
                    <Checkbox checked={allChecked} />
                    <span style={{ color: '#374151' }}>Tümünü Seç</span>
                    <span
                      style={{
                        marginLeft: 'auto',
                        fontSize: '.72rem',
                        color: '#94a3b8',
                        fontWeight: 500,
                      }}
                    >
                      {items.length} öğe
                    </span>
                  </div>
                )}
                {filtered.length === 0 ? (
                  <div style={{ padding: 14, textAlign: 'center', fontSize: '.8rem', color: '#94a3b8' }}>
                    Sonuç bulunamadı
                  </div>
                ) : (
                  filtered.map(item => {
                    const checked = selected.includes(item.id)
                    return (
                      <div
                        key={item.id}
                        onClick={event => {
                          event.stopPropagation()
                          toggle(item.id)
                        }}
                        style={{
                          padding: '9px 14px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          fontSize: '.83rem',
                          borderBottom: '1px solid #f8fafc',
                          background: checked ? '#fffbeb' : 'transparent',
                        }}
                      >
                        <Checkbox checked={checked} />
                        <span style={{ fontWeight: checked ? 700 : 500, color: '#0f172a' }}>
                          {item[labelKey]}
                        </span>
                      </div>
                    )
                  })
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Checkbox({ checked }) {
  return (
    <div
      style={{
        width: 16,
        height: 16,
        borderRadius: 4,
        flexShrink: 0,
        transition: '.12s',
        border: `2px solid ${checked ? '#f59e0b' : '#cbd5e1'}`,
        background: checked ? '#f59e0b' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {checked && <i className="fa-solid fa-check" style={{ color: '#fff', fontSize: '.55rem' }} />}
    </div>
  )
}

function TplCard({ tpl, selectedIds, onEdit, onDelete, tagBg, tagColor, icon, items, idKey = 'id', nameKey = 'name' }) {
  const names = selectedIds
    .map(id => items.find(item => item[idKey] === id)?.[nameKey])
    .filter(Boolean)

  return (
    <div className="card" style={{ padding: '16px 18px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              background: tagBg,
              borderRadius: 10,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <i className={`fa-solid ${icon}`} style={{ color: tagColor, fontSize: '.85rem' }} />
          </div>
          <div>
            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '.9rem' }}>{tpl.name}</div>
            {tpl.description && (
              <div style={{ fontSize: '.75rem', color: '#94a3b8', marginTop: 2 }}>{tpl.description}</div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          <button className="ico-btn edit" onClick={() => onEdit(tpl)}>
            <i className="fa-solid fa-pen" />
          </button>
          <button className="ico-btn del" onClick={() => onDelete(tpl)}>
            <i className="fa-solid fa-trash" />
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {names.length === 0 ? (
          <span style={{ fontSize: '.78rem', color: '#94a3b8', fontStyle: 'italic' }}>Öğe seçilmedi</span>
        ) : (
          names.map((name, index) => (
            <span
              key={`${name}-${index}`}
              style={{
                background: tagBg,
                color: tagColor,
                borderRadius: 99,
                padding: '2px 10px',
                fontSize: '.74rem',
                fontWeight: 700,
              }}
            >
              {name}
            </span>
          ))
        )}
      </div>
    </div>
  )
}

export default function Templates() {
  const toast = useToast()
  const [tab, setTab] = useState('branch')
  const [branchTpls, setBranchTpls] = useState([])
  const [stockTpls, setStockTpls] = useState([])
  const [saleTpls, setSaleTpls] = useState([])
  const [branches, setBranches] = useState([])
  const [stockItems, setStockItems] = useState([])
  const [saleItems, setSaleItems] = useState([])
  const [loading, setLoading] = useState(true)

  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', ids: [] })
  const [editId, setEditId] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const meta = TEMPLATE_META[tab]

  const load = useCallback(async () => {
    setLoading(true)

    const [
      { data: branchTemplates },
      { data: stockTemplates },
      { data: saleTemplates },
      { data: companyTree },
      { data: stockList },
      { data: saleList },
    ] = await Promise.all([
      db.from('branch_templates').select('*').order('name'),
      db.from('stock_templates').select('*').order('name'),
      db.from('sale_templates').select('*').order('name'),
      db.from('settings').select('value').eq('key', 'company_tree').single(),
      db.from('stock_items').select('id, name').order('name'),
      db.from('sale_items').select('id, name, deleted_at').order('name'),
    ])

    setBranchTpls(branchTemplates || [])
    setStockTpls(stockTemplates || [])
    setSaleTpls(saleTemplates || [])
    setBranches(getAllBranches(companyTree?.value || []))
    setStockItems(stockList || [])
    setSaleItems((saleList || []).filter(item => !item.deleted_at))
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const templatesByTab = {
    branch: branchTpls,
    stock: stockTpls,
    sale: saleTpls,
  }

  const itemOptionsByTab = {
    branch: branches,
    stock: stockItems,
    sale: saleItems,
  }

  function openAdd() {
    setForm({ name: '', description: '', ids: [] })
    setEditId(null)
    setModal(true)
  }

  function openEdit(tpl) {
    setForm({
      name: tpl.name,
      description: tpl.description || '',
      ids: tpl[meta.idField] || [],
    })
    setEditId(tpl.id)
    setModal(true)
  }

  function closeModal() {
    setModal(false)
    setForm({ name: '', description: '', ids: [] })
    setEditId(null)
  }

  async function save() {
    if (!form.name.trim()) {
      toast('Şablon adı zorunludur', 'error')
      return
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      [meta.idField]: form.ids,
    }

    if (editId) {
      const { error } = await db.from(meta.table).update(payload).eq('id', editId)
      if (error) {
        toast('Hata: ' + error.message, 'error')
        return
      }
      toast('Şablon güncellendi', 'success')
    } else {
      const { error } = await db.from(meta.table).insert(payload)
      if (error) {
        toast('Hata: ' + error.message, 'error')
        return
      }
      toast(`"${payload.name}" eklendi`, 'success')
    }

    closeModal()
    load()
  }

  async function remove(tpl) {
    const { error } = await db.from(meta.table).delete().eq('id', tpl.id)
    if (error) {
      toast('Silinemedi: ' + error.message, 'error')
    } else {
      toast(`"${tpl.name}" silindi`, 'info')
      load()
    }
    setConfirm(null)
  }

  function setField(key, value) {
    setForm(current => ({ ...current, [key]: value }))
  }

  const templates = templatesByTab[tab]
  const selectItems = itemOptionsByTab[tab]

  return (
    <div className="page-enter">
      <Header
        title="Şablonlar"
        subtitle="Şube, stok malı ve satış malı gruplarını şablon olarak kaydedin"
        actions={
          <AddButton onClick={openAdd} label="Şablon Ekle" />
        }
      />

      <div
        style={{
          display: 'flex',
          gap: 2,
          background: '#f1f5f9',
          borderRadius: 10,
          padding: 3,
          marginBottom: 18,
          width: 'fit-content',
        }}
      >
        {Object.entries(TEMPLATE_META).map(([key, value]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '8px 18px',
              border: 'none',
              borderRadius: 8,
              fontSize: '.83rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: '.15s',
              background: tab === key ? '#fff' : 'transparent',
              color: tab === key ? '#0f172a' : '#64748b',
              boxShadow: tab === key ? '0 1px 6px rgba(0,0,0,.08)' : 'none',
            }}
          >
            <i className={`fa-solid ${value.icon}`} style={{ marginRight: 6 }} />
            {value.tabLabel}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
          <i className="fa-solid fa-spinner fa-spin" /> Yükleniyor…
        </div>
      ) : templates.length === 0 ? (
        <div className="empty" style={{ minHeight: 300 }}>
          <i className={`fa-solid ${meta.icon}`} />
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#334155' }}>
            Henüz {meta.emptyTypeLabel} şablonu yok
          </div>
          <p style={{ fontSize: '.85rem' }}>Şablon Ekle butonuyla yeni şablon oluşturun</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {templates.map(tpl => (
            <TplCard
              key={tpl.id}
              tpl={tpl}
              selectedIds={tpl[meta.idField] || []}
              onEdit={openEdit}
              onDelete={setConfirm}
              tagBg={meta.tagBg}
              tagColor={meta.tagColor}
              icon={meta.icon}
              items={selectItems}
            />
          ))}
        </div>
      )}

      <Modal
        open={modal}
        onClose={closeModal}
        width={500}
        title={editId ? 'Şablonu Düzenle' : `Yeni ${meta.singularLabel} Şablonu`}
        footer={
          <>
            <button className="btn-g" onClick={closeModal}>
              İptal
            </button>
            <button className="btn-p" onClick={save}>
              <i className="fa-solid fa-check" /> Kaydet
            </button>
          </>
        }
      >
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <label className="f-label">
              Şablon Adı <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              className="f-input"
              value={form.name}
              onChange={event => setField('name', event.target.value)}
              placeholder={meta.namePlaceholder}
            />
          </div>
          <div>
            <label className="f-label">Açıklama</label>
            <input
              className="f-input"
              value={form.description}
              onChange={event => setField('description', event.target.value)}
              placeholder="Şablon hakkında kısa açıklama…"
            />
          </div>
          <div>
            <label className="f-label">{meta.itemLabel}</label>
            <MultiSelect
              items={selectItems}
              selected={form.ids}
              onChange={ids => setField('ids', ids)}
              placeholder={meta.selectPlaceholder}
              emptyMsg={meta.emptyMsg}
            />
            {form.ids.length > 0 && <p className="f-hint">{form.ids.length} öğe seçildi</p>}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        title={`"${confirm?.name}" silinsin mi?`}
        desc="Bu şablon kalıcı olarak silinecektir."
        onConfirm={() => remove(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
