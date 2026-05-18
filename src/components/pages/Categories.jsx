import { useCallback, useEffect, useMemo, useState } from 'react'
import { db } from '@/lib/db'
import { useToast } from '@/hooks/useToast'
import Header from '@/components/layout/Header'
import Modal from '@/components/ui/Modal'
import AddButton from '@/components/ui/AddButton'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import CategoryHierarchyView from '@/components/ui/CategoryHierarchyView'
import { DEFAULT_ACCOUNT_CHART, normalizeAccountChart } from '@/lib/accountChart'
import {
  buildStockCategoryAccountOptions,
  createChartAccountMap,
  resolveLegacyAccountingFields,
} from '@/lib/categoryAccounting'
import { readSettingValue } from '@/lib/settingsStore'

const COLORS = [
  { bg: '#fef3c7', text: '#92400e', label: 'Amber' },
  { bg: '#d1fae5', text: '#065f46', label: 'Yesil' },
  { bg: '#dbeafe', text: '#1e40af', label: 'Mavi' },
  { bg: '#ede9fe', text: '#5b21b6', label: 'Mor' },
  { bg: '#fce7f3', text: '#9d174d', label: 'Pembe' },
  { bg: '#fee2e2', text: '#991b1b', label: 'Kirmizi' },
  { bg: '#f1f5f9', text: '#475569', label: 'Slate' },
]

const EMPTY_FORM = {
  name: '',
  parent_id: '',
  bg: COLORS[0].bg,
  text_color: COLORS[0].text,
  sku_mask: '',
  append_type: '',
  append_len: 4,
  description: '',
  acc_cat: '',
  acc_code: '',
  expense_account_id: '',
}

const EMPTY_SYSTEM_MASK = {
  mask: '',
  appendType: '',
  appendLen: 4,
}

function resolveMask(mask) {
  if (!mask) return ''
  const now = new Date()
  const yyyy = String(now.getFullYear())
  return String(mask)
    .toUpperCase()
    .replace(/YYYY/g, yyyy)
    .replace(/YY/g, yyyy.slice(2))
    .replace(/AA/g, String(now.getMonth() + 1).padStart(2, '0'))
    .replace(/GG/g, String(now.getDate()).padStart(2, '0'))
}

function genSku(mask, appendType, appendLen) {
  const len = Number.parseInt(appendLen, 10) || 0
  if (!mask && (!appendType || !len)) return '-'

  const resolved = resolveMask(mask || '')
  const pools = {
    sayi: '7319462508',
    harf: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
    karisik: '7A3C9M2P5R8T',
  }

  const pool = pools[appendType] || ''
  const suffix = pool
    ? Array.from({ length: len }, (_, index) => pool[index % pool.length]).join('')
    : ''

  return resolved + suffix
}

function appendLabel(type, len) {
  if (!type || !len) return 'Sabit maske'
  const labelMap = {
    sayi: 'Hane sayi',
    harf: 'Hane harf',
    karisik: 'Hane karisik',
  }
  return `${len} ${labelMap[type] || 'ek'}`
}

function buildTree(items, parentId = null) {
  return items
    .filter(item => (item.parent_id || null) === parentId)
    .map(item => ({
      ...item,
      children: buildTree(items, item.id),
    }))
}

function filterTree(nodes, predicate) {
  return nodes.reduce((accumulator, node) => {
    const children = filterTree(node.children || [], predicate)
    if (predicate(node) || children.length > 0) {
      accumulator.push({ ...node, children })
    }
    return accumulator
  }, [])
}

function flattenTree(nodes, collapsedMap, depth = 0, forceExpanded = false, rows = []) {
  nodes.forEach(node => {
    const hasChildren = (node.children || []).length > 0
    rows.push({ node, depth, hasChildren })
    if (hasChildren && (forceExpanded || !collapsedMap[node.id])) {
      flattenTree(node.children, collapsedMap, depth + 1, forceExpanded, rows)
    }
  })
  return rows
}

function getDescendantIds(items, id) {
  const children = items.filter(item => item.parent_id === id)
  return [id, ...children.flatMap(child => getDescendantIds(items, child.id))]
}

function getDepth(items, id) {
  const current = items.find(item => item.id === id)
  if (!current) return 0
  return current.parent_id ? getDepth(items, current.parent_id) + 1 : 0
}

function matchesSearch(category, searchValue, accountMap, parentMap) {
  const query = String(searchValue || '').trim().toLowerCase()
  if (!query) return true

  const parentName = parentMap.get(category.parent_id)?.name || ''
  const accountName = accountMap.get(category.expense_account_id)?.name || ''
  const fields = [
    category.name,
    category.description,
    category.sku_mask,
    category.acc_cat,
    category.acc_code,
    parentName,
    accountName,
  ]

  return fields.some(field => String(field || '').toLowerCase().includes(query))
}

function escapeCsv(value) {
  const text = String(value ?? '')
  if (text.includes('"') || text.includes(',') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function downloadCsv(rows) {
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `stok-kategorileri-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function buildExportRows(rows, parentMap, accountMap) {
  return [
    [
      'Kategori',
      'Ust Kategori',
      'Seviye',
      'Durum',
      'SKU Kurali',
      'Muhasebe Kategorisi',
      'Muhasebe Kodu',
      'Bagli Maliyet Hesabi',
      'Aciklama',
    ].join(','),
    ...rows.map(({ node, depth }) => {
      const skuPreview = genSku(node.sku_mask, node.append_type, node.append_len)
      const accountName = accountMap.get(node.expense_account_id)?.name || ''
      return [
        escapeCsv(node.name),
        escapeCsv(parentMap.get(node.parent_id)?.name || ''),
        depth,
        escapeCsv(node.deleted_at ? 'Silinmis' : 'Aktif'),
        escapeCsv(skuPreview === '-' ? '' : skuPreview),
        escapeCsv(node.acc_cat || ''),
        escapeCsv(node.acc_code || ''),
        escapeCsv(accountName),
        escapeCsv(node.description || ''),
      ].join(',')
    }),
  ]
}

function ColorSwatch({ bg, text, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 34,
        height: 34,
        borderRadius: 10,
        border: active ? `2px solid ${text}` : '1px solid #dbe2ea',
        background: bg,
        cursor: 'pointer',
        boxShadow: active ? `0 0 0 2px ${bg}` : 'none',
      }}
      title={bg}
    />
  )
}

function TableEmpty({ icon, text }) {
  return (
    <div className="empty" style={{ padding: 48 }}>
      <i className={`fa-solid ${icon}`} />
      <p>{text}</p>
    </div>
  )
}

export default function Categories() {
  const toast = useToast()
  const [categories, setCategories] = useState([])
  const [chartAccounts, setChartAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [collapsedMap, setCollapsedMap] = useState({})
  const [searchValue, setSearchValue] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [systemMask, setSystemMask] = useState(EMPTY_SYSTEM_MASK)
  const [systemMaskModal, setSystemMaskModal] = useState(false)
  const [systemMaskForm, setSystemMaskForm] = useState(EMPTY_SYSTEM_MASK)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState(null)
  const [preselectedParentId, setPreselectedParentId] = useState(null)
  const [confirmRecord, setConfirmRecord] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)

    const [categoryResult, systemMaskResult, accountChartValue] = await Promise.all([
      db.from('categories').select('*').order('name'),
      db.from('settings').select('value').eq('key', 'default_sku_mask').maybeSingle(),
      readSettingValue('account_chart', DEFAULT_ACCOUNT_CHART),
    ])

    if (categoryResult.error) {
      toast(`Kategoriler yuklenemedi: ${categoryResult.error.message}`, 'error')
      setCategories([])
    } else {
      setCategories(categoryResult.data || [])
    }

    if (systemMaskResult.error && systemMaskResult.error.code !== 'PGRST116') {
      toast(`Varsayilan SKU maski okunamadi: ${systemMaskResult.error.message}`, 'error')
      setSystemMask(EMPTY_SYSTEM_MASK)
    } else {
      setSystemMask({
        mask: systemMaskResult.data?.value?.mask || '',
        appendType: systemMaskResult.data?.value?.appendType || '',
        appendLen: systemMaskResult.data?.value?.appendLen || 4,
      })
    }

    setChartAccounts(normalizeAccountChart(accountChartValue, DEFAULT_ACCOUNT_CHART))
    setLoading(false)
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const accountMap = useMemo(() => createChartAccountMap(chartAccounts), [chartAccounts])
  const accountOptions = useMemo(() => buildStockCategoryAccountOptions(chartAccounts), [chartAccounts])
  const parentMap = useMemo(() => new Map(categories.map(category => [category.id, category])), [categories])
  const deletedCount = useMemo(() => categories.filter(category => category.deleted_at).length, [categories])

  const filteredCategories = useMemo(() => {
    if (statusFilter === 'deleted') return categories.filter(category => category.deleted_at)
    if (statusFilter === 'all') return categories
    return categories.filter(category => !category.deleted_at)
  }, [categories, statusFilter])

  const visibleTree = useMemo(() => {
    const tree = buildTree(filteredCategories)
    if (!searchValue.trim()) return tree
    return filterTree(tree, category => matchesSearch(category, searchValue, accountMap, parentMap))
  }, [accountMap, filteredCategories, parentMap, searchValue])

  const visibleRows = useMemo(
    () => flattenTree(visibleTree, collapsedMap, 0, Boolean(searchValue.trim())),
    [collapsedMap, searchValue, visibleTree],
  )

  const categorySkuPreview = useMemo(
    () => genSku(form.sku_mask, form.append_type, form.append_len),
    [form.append_len, form.append_type, form.sku_mask],
  )

  const systemSkuPreview = useMemo(
    () => genSku(systemMaskForm.mask, systemMaskForm.appendType, systemMaskForm.appendLen),
    [systemMaskForm.appendLen, systemMaskForm.appendType, systemMaskForm.mask],
  )

  const systemMaskLabel = useMemo(() => {
    const preview = genSku(systemMask.mask, systemMask.appendType, systemMask.appendLen)
    if (preview === '-') return 'Tanimli degil'
    return `${preview} | ${appendLabel(systemMask.appendType, systemMask.appendLen)}`
  }, [systemMask.appendLen, systemMask.appendType, systemMask.mask])

  const parentOptions = useMemo(() => {
    const excludedIds = editId ? getDescendantIds(categories, editId) : []
    return categories
      .filter(category => !category.deleted_at)
      .filter(category => !excludedIds.includes(category.id))
      .map(category => ({
        id: category.id,
        name: category.name,
        depth: getDepth(categories, category.id),
      }))
      .sort((left, right) => left.name.localeCompare(right.name, 'tr'))
  }, [categories, editId])

  const selectedAccount = accountMap.get(form.expense_account_id) || null

  function setFormField(key, value) {
    setForm(current => ({ ...current, [key]: value }))
  }

  function toggleNode(id) {
    setCollapsedMap(current => ({ ...current, [id]: !current[id] }))
  }

  function collapseAll() {
    const nextState = {}
    categories.filter(category => category.parent_id).forEach(category => {
      nextState[category.id] = true
    })
    setCollapsedMap(nextState)
  }

  function expandAll() {
    setCollapsedMap({})
  }

  function openAdd(parentId = '') {
    setForm({ ...EMPTY_FORM, parent_id: parentId || '' })
    setEditId(null)
    setPreselectedParentId(parentId || null)
    setModalOpen(true)
  }

  function openEdit(category) {
    setForm({
      name: category.name || '',
      parent_id: category.parent_id || '',
      bg: category.bg || COLORS[0].bg,
      text_color: category.text_color || COLORS[0].text,
      sku_mask: category.sku_mask || '',
      append_type: category.append_type || '',
      append_len: category.append_len || 4,
      description: category.description || '',
      acc_cat: category.acc_cat || '',
      acc_code: category.acc_code || '',
      expense_account_id: category.expense_account_id || '',
    })
    setEditId(category.id)
    setPreselectedParentId(null)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setForm(EMPTY_FORM)
    setEditId(null)
    setPreselectedParentId(null)
  }

  function openSystemMaskModal() {
    setSystemMaskForm({
      mask: systemMask.mask || '',
      appendType: systemMask.appendType || '',
      appendLen: systemMask.appendLen || 4,
    })
    setSystemMaskModal(true)
  }

  function closeSystemMaskModal() {
    setSystemMaskModal(false)
    setSystemMaskForm(EMPTY_SYSTEM_MASK)
  }

  function handleExpenseAccountChange(accountId) {
    const selected = accountMap.get(accountId) || null
    const legacy = resolveLegacyAccountingFields(selected, 'Maliyet')

    setForm(current => ({
      ...current,
      expense_account_id: accountId,
      acc_cat: legacy.accCat,
      acc_code: legacy.accCode,
    }))
  }

  async function saveCategory() {
    if (!form.name.trim()) {
      toast('Kategori adi zorunludur', 'error')
      return
    }

    const payload = {
      name: form.name.trim(),
      parent_id: form.parent_id || null,
      bg: form.bg,
      text_color: form.text_color,
      sku_mask: form.sku_mask.trim() || null,
      append_type: form.append_type || null,
      append_len: Number.parseInt(form.append_len, 10) || 4,
      description: form.description.trim() || null,
      acc_cat: form.acc_cat.trim() || null,
      acc_code: form.acc_code.trim() || null,
      expense_account_id: form.expense_account_id || null,
    }

    if (editId) {
      const { error } = await db.from('categories').update(payload).eq('id', editId)
      if (error) {
        toast(`Kategori guncellenemedi: ${error.message}`, 'error')
        return
      }
      toast(`"${payload.name}" guncellendi`, 'success')
    } else {
      const { error } = await db.from('categories').insert(payload)
      if (error) {
        toast(`Kategori eklenemedi: ${error.message}`, 'error')
        return
      }
      toast(`"${payload.name}" eklendi`, 'success')
    }

    closeModal()
    load()
  }

  async function saveSystemMask() {
    const payload = {
      key: 'default_sku_mask',
      value: {
        mask: systemMaskForm.mask.trim(),
        appendType: systemMaskForm.appendType || '',
        appendLen: Number.parseInt(systemMaskForm.appendLen, 10) || 4,
      },
    }

    const { error } = await db.from('settings').upsert(payload)
    if (error) {
      toast(`Varsayilan SKU maski kaydedilemedi: ${error.message}`, 'error')
      return
    }

    toast('Varsayilan SKU maski kaydedildi', 'success')
    closeSystemMaskModal()
    load()
  }

  async function removeCategory(category) {
    const { error } = await db
      .from('categories')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', category.id)

    if (error) {
      toast(`Kategori silinemedi: ${error.message}`, 'error')
    } else {
      toast(`"${category.name}" silindi`, 'info')
      load()
    }

    setConfirmRecord(null)
  }

  async function restoreCategory(category) {
    const { error } = await db
      .from('categories')
      .update({ deleted_at: null })
      .eq('id', category.id)

    if (error) {
      toast(`Kategori geri alinamadi: ${error.message}`, 'error')
      return
    }

    toast(`"${category.name}" geri alindi`, 'success')
    load()
  }

  function exportVisibleRows() {
    if (visibleRows.length === 0) {
      toast('Disa aktarilacak kategori bulunamadi', 'info')
      return
    }

    downloadCsv(buildExportRows(visibleRows, parentMap, accountMap))
    toast('Kategori listesi CSV olarak indirildi', 'success')
  }

  return (
    <div className="page-enter">
      <Header
        title="Stok Mali Kategori Yonetimi"
        subtitle="Hiyerarsik kategori listesi, SKU kurallari ve muhasebe baglari tek ekranda yonetilir."
        actions={(
          <>
            <button className="btn-o" onClick={openSystemMaskModal}>
              <i className="fa-solid fa-barcode" /> Varsayilan SKU
            </button>
            <button className="btn-o" onClick={exportVisibleRows}>
              <i className="fa-solid fa-file-export" /> Disa Aktar
            </button>
            <AddButton onClick={() => openAdd('')} label="Yeni Kategori" />
          </>
        )}
      />

      <div className="card" style={{ marginBottom: 16, padding: 14 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(320px, 1.6fr) minmax(180px, .7fr) auto',
            gap: 12,
            alignItems: 'end',
          }}
        >
          <div>
            <label className="f-label">Arama</label>
            <input
              className="f-input"
              value={searchValue}
              onChange={event => setSearchValue(event.target.value)}
              placeholder="Kategori, ust kategori, SKU, muhasebe kodu veya aciklama ara"
            />
          </div>

          <div>
            <label className="f-label">Durum</label>
            <div className="sel-wrap">
              <select className="f-input" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
                <option value="active">Aktif kayitlar</option>
                <option value="all">Tum kayitlar</option>
                {deletedCount > 0 && <option value="deleted">Silinmis kayitlar</option>}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn-o" type="button" onClick={expandAll}>
              <i className="fa-solid fa-expand" /> Tumunu Ac
            </button>
            <button className="btn-o" type="button" onClick={collapseAll}>
              <i className="fa-solid fa-compress" /> Tumunu Kapat
            </button>
          </div>
        </div>

        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
            fontSize: '.8rem',
            color: '#64748b',
          }}
        >
          <span>Gorunen kayit: <strong style={{ color: '#0f172a' }}>{visibleRows.length}</strong></span>
          <span>Varsayilan SKU: <strong style={{ color: '#0f172a' }}>{systemMaskLabel}</strong></span>
        </div>
      </div>

      <CategoryHierarchyView
        tree={visibleTree}
        loading={loading}
        emptyText={searchValue.trim() ? 'Arama sonucunda kategori bulunamadi' : 'Bu filtreye uygun kategori bulunamadi'}
        sectionTitle="Hiyerarsi"
        sectionSubtitle="Stok mali kategori baglari, SKU kurallari ve muhasebe baglari"
        collapsedMap={collapsedMap}
        onToggle={toggleNode}
        onEdit={openEdit}
        onAddChild={openAdd}
        onDelete={setConfirmRecord}
        onRestore={restoreCategory}
        genSku={genSku}
        appendLabel={appendLabel}
        systemMask={systemMask}
        accountLabel="Bagli Maliyet Hesabi"
        accountChipLabel="Maliyet hesabi"
        getAccountName={node => accountMap.get(node.expense_account_id)?.name || ''}
        loadingText="Yukleniyor..."
      />

      <div className="card" style={{ overflow: 'hidden', padding: 0, display: 'none' }}>
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontSize: '.92rem', fontWeight: 800, color: '#0f172a' }}>Kategori Listesi</div>
            <div style={{ fontSize: '.78rem', color: '#64748b', marginTop: 4 }}>
              Ayni sayfada liste, alt kategori akisi ve duzenleme aksiyonlari tutulur.
            </div>
          </div>
          <div style={{ fontSize: '.78rem', color: '#64748b' }}>
            {statusFilter === 'deleted' ? 'Silinmis kayitlar gorunuyor' : statusFilter === 'all' ? 'Tum kayitlar gorunuyor' : 'Aktif kayitlar gorunuyor'}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
            <i className="fa-solid fa-spinner fa-spin" /> Yukleniyor...
          </div>
        ) : visibleRows.length === 0 ? (
          <TableEmpty
            icon="fa-tags"
            text={searchValue.trim() ? 'Arama sonucunda kategori bulunamadi' : 'Bu filtreye uygun kategori bulunamadi'}
          />
        ) : (
          <table className="tbl" style={{ width: '100%', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '34%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '6%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Kategori</th>
                <th style={{ textAlign: 'left' }}>Ust Kategori</th>
                <th style={{ textAlign: 'left' }}>SKU Kurali</th>
                <th style={{ textAlign: 'left' }}>Muhasebe</th>
                <th style={{ textAlign: 'left' }}>Aciklama</th>
                <th style={{ textAlign: 'center' }}>Islem</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(({ node, depth, hasChildren }) => {
                const parentName = parentMap.get(node.parent_id)?.name || 'Kok kategori'
                const preview = genSku(node.sku_mask, node.append_type, node.append_len)
                const systemPreview = genSku(systemMask.mask, systemMask.appendType, systemMask.appendLen)
                const usesSystemMask = preview === '-' && systemPreview !== '-'
                const accountName = accountMap.get(node.expense_account_id)?.name || ''

                return (
                  <tr key={node.id} className={node.deleted_at ? 'deleted' : ''}>
                    <td style={{ textAlign: 'left' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: depth * 18 }}>
                        {hasChildren ? (
                          <button
                            type="button"
                            className="ico-btn"
                            onClick={() => toggleNode(node.id)}
                            title={collapsedMap[node.id] ? 'Dali ac' : 'Dali kapat'}
                            style={{ width: 28, height: 28 }}
                          >
                            <i className={`fa-solid fa-chevron-${collapsedMap[node.id] ? 'right' : 'down'}`} />
                          </button>
                        ) : (
                          <span style={{ width: 28, display: 'inline-block' }} />
                        )}

                        <span
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: 999,
                            background: node.bg || COLORS[0].bg,
                            border: `1px solid ${node.text_color || COLORS[0].text}33`,
                            flexShrink: 0,
                          }}
                        />

                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, color: '#0f172a' }}>{node.name}</span>
                            <span className="badge bgr">Seviye {depth + 1}</span>
                            {node.deleted_at && <span className="badge br">Silinmis</span>}
                          </div>
                          {hasChildren && (
                            <div style={{ marginTop: 3, fontSize: '.75rem', color: '#64748b' }}>
                              {(node.children || []).length} alt kategori
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td style={{ textAlign: 'left' }}>
                      <div style={{ fontWeight: 600, color: '#334155' }}>{parentName}</div>
                    </td>

                    <td style={{ textAlign: 'left' }}>
                      {preview !== '-' ? (
                        <div style={{ display: 'grid', gap: 4 }}>
                          <span className="badge bg">Kategori kurali</span>
                          <div style={{ fontFamily: 'monospace', fontSize: '.82rem', color: '#0f172a' }}>{preview}</div>
                          <div style={{ fontSize: '.74rem', color: '#64748b' }}>{appendLabel(node.append_type, node.append_len)}</div>
                        </div>
                      ) : usesSystemMask ? (
                        <div style={{ display: 'grid', gap: 4 }}>
                          <span className="badge ba">Sistem varsayilani</span>
                          <div style={{ fontFamily: 'monospace', fontSize: '.82rem', color: '#0f172a' }}>{systemPreview}</div>
                          <div style={{ fontSize: '.74rem', color: '#64748b' }}>
                            {appendLabel(systemMask.appendType, systemMask.appendLen)}
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>Tanimli degil</span>
                      )}
                    </td>

                    <td style={{ textAlign: 'left' }}>
                      {node.acc_code || accountName ? (
                        <div style={{ display: 'grid', gap: 4 }}>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{accountName || 'Bagli hesap'}</div>
                          <div style={{ fontSize: '.76rem', color: '#64748b' }}>
                            {[node.acc_cat, node.acc_code].filter(Boolean).join(' / ') || 'Kod bagli degil'}
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>Bagli hesap yok</span>
                      )}
                    </td>

                    <td style={{ textAlign: 'left', color: '#475569' }}>
                      {node.description || <span style={{ color: '#94a3b8' }}>Aciklama yok</span>}
                    </td>

                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        {!node.deleted_at && depth < 9 && (
                          <button className="ico-btn" title="Alt kategori ekle" onClick={() => openAdd(node.id)}>
                            <i className="fa-solid fa-plus" />
                          </button>
                        )}
                        {!node.deleted_at && (
                          <button className="ico-btn edit" title="Duzenle" onClick={() => openEdit(node)}>
                            <i className="fa-solid fa-pen" />
                          </button>
                        )}
                        {node.deleted_at ? (
                          <button
                            className="ico-btn"
                            title="Geri al"
                            onClick={() => restoreCategory(node)}
                            style={{ color: '#16a34a', background: '#dcfce7' }}
                          >
                            <i className="fa-solid fa-rotate-left" />
                          </button>
                        ) : (
                          <button className="ico-btn del" title="Sil" onClick={() => setConfirmRecord(node)}>
                            <i className="fa-solid fa-trash" />
                          </button>
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

      <Modal
        open={modalOpen}
        onClose={closeModal}
        width={760}
        title={editId ? 'Kategori Duzenle' : preselectedParentId ? 'Alt Kategori Ekle' : 'Yeni Kategori'}
        subtitle="Detaylar ayni ekran akisini bozmadan modal icinde yonetilir."
        footer={(
          <>
            <button className="btn-g" onClick={closeModal}>Iptal</button>
            <button className="btn-p" onClick={saveCategory}>
              <i className="fa-solid fa-check" /> Kaydet
            </button>
          </>
        )}
      >
        <div style={{ display: 'grid', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .9fr', gap: 14 }}>
            <div>
              <label className="f-label">Kategori Adi <span style={{ color: '#dc2626' }}>*</span></label>
              <input
                className="f-input"
                value={form.name}
                onChange={event => setFormField('name', event.target.value)}
                placeholder="Orn. Donuk Urunler"
              />
            </div>

            <div>
              <label className="f-label">Ust Kategori</label>
              <div className="sel-wrap">
                <select
                  className="f-input"
                  value={form.parent_id || ''}
                  onChange={event => setFormField('parent_id', event.target.value || '')}
                >
                  <option value="">Kok kategori</option>
                  {parentOptions.map(option => (
                    <option key={option.id} value={option.id}>
                      {'-- '.repeat(option.depth + 1)} {option.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
            <div style={{ fontSize: '.82rem', fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>Renk ve gorunum</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {COLORS.map(color => (
                <ColorSwatch
                  key={color.bg}
                  bg={color.bg}
                  text={color.text}
                  active={form.bg === color.bg}
                  onClick={() => {
                    setFormField('bg', color.bg)
                    setFormField('text_color', color.text)
                  }}
                />
              ))}
            </div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 12,
                background: form.bg,
                color: form.text_color,
                fontWeight: 700,
              }}
            >
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  background: form.text_color,
                  opacity: 0.9,
                }}
              />
              {form.name.trim() || 'Kategori onizleme'}
            </div>
          </div>

          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16, display: 'grid', gap: 14 }}>
            <div style={{ fontSize: '.82rem', fontWeight: 800, color: '#0f172a' }}>SKU kurali</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr .6fr', gap: 12 }}>
              <div>
                <label className="f-label">SKU Mask</label>
                <input
                  className="f-input"
                  value={form.sku_mask}
                  onChange={event => setFormField('sku_mask', event.target.value.toUpperCase())}
                  placeholder="Orn. STK-YYYY-AA-"
                />
                <p className="f-hint">YYYY, YY, AA ve GG tarih tokenlari desteklenir.</p>
              </div>

              <div>
                <label className="f-label">Sonuna Ekle</label>
                <div className="sel-wrap">
                  <select
                    className="f-input"
                    value={form.append_type}
                    onChange={event => setFormField('append_type', event.target.value)}
                  >
                    <option value="">Yok</option>
                    <option value="sayi">Hane sayi</option>
                    <option value="harf">Hane harf</option>
                    <option value="karisik">Hane karisik</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="f-label">Hane</label>
                <input
                  className="f-input"
                  type="number"
                  min="1"
                  max="20"
                  value={form.append_len}
                  onChange={event => setFormField('append_len', event.target.value)}
                />
              </div>
            </div>

            <div
              style={{
                border: '1px solid #fde68a',
                background: '#fffbeb',
                borderRadius: 12,
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <i className="fa-solid fa-barcode" style={{ color: '#d97706' }} />
              <div>
                <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#92400e', textTransform: 'uppercase' }}>SKU Onizleme</div>
                <div style={{ fontFamily: 'monospace', fontSize: '.92rem', fontWeight: 800, color: '#0f172a', marginTop: 3 }}>
                  {categorySkuPreview}
                </div>
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16, display: 'grid', gap: 14 }}>
            <div style={{ fontSize: '.82rem', fontWeight: 800, color: '#0f172a' }}>Muhasebe ve aciklama</div>

            <div>
              <label className="f-label">Bagli Maliyet Hesabi</label>
              <div className="sel-wrap">
                <select
                  className="f-input"
                  value={form.expense_account_id}
                  onChange={event => handleExpenseAccountChange(event.target.value)}
                >
                  <option value="">Hesap secin...</option>
                  {accountOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <p className="f-hint">Kategoriye bagli stok maliyeti secilen hesaba akar.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr .8fr', gap: 12 }}>
              <div>
                <label className="f-label">Secili Hesap</label>
                <input
                  className="f-input"
                  value={selectedAccount?.name || ''}
                  readOnly
                  placeholder="Hesap secildiginde burada gorunur"
                  style={{ background: '#f8fafc', color: '#64748b' }}
                />
              </div>
              <div>
                <label className="f-label">Muhasebe Kategorisi</label>
                <input
                  className="f-input"
                  value={form.acc_cat}
                  readOnly
                  placeholder="Secilen hesaptan gelir"
                  style={{ background: '#f8fafc', color: '#64748b' }}
                />
              </div>
              <div>
                <label className="f-label">Muhasebe Kodu</label>
                <input
                  className="f-input"
                  value={form.acc_code}
                  readOnly
                  placeholder="Secilen hesaptan gelir"
                  style={{ background: '#f8fafc', color: '#64748b' }}
                />
              </div>
            </div>

            <div>
              <label className="f-label">Aciklama</label>
              <textarea
                className="f-input"
                rows={3}
                value={form.description}
                onChange={event => setFormField('description', event.target.value)}
                placeholder="Kategoriye dair operasyonel not"
                style={{ resize: 'vertical', minHeight: 92 }}
              />
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={systemMaskModal}
        onClose={closeSystemMaskModal}
        width={620}
        title="Varsayilan SKU Maski"
        subtitle="Kategori bazinda maske tanimli degilse sistem bu kurali kullanir."
        footer={(
          <>
            <button className="btn-g" onClick={closeSystemMaskModal}>Iptal</button>
            <button className="btn-p" onClick={saveSystemMask}>
              <i className="fa-solid fa-floppy-disk" /> Kaydet
            </button>
          </>
        )}
      >
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr .6fr', gap: 12 }}>
            <div>
              <label className="f-label">Sabit Prefix</label>
              <input
                className="f-input"
                value={systemMaskForm.mask}
                onChange={event => setSystemMaskForm(current => ({ ...current, mask: event.target.value.toUpperCase() }))}
                placeholder="Orn. STK-YYYY-AA-"
              />
            </div>

            <div>
              <label className="f-label">Sonuna Ekle</label>
              <div className="sel-wrap">
                <select
                  className="f-input"
                  value={systemMaskForm.appendType}
                  onChange={event => setSystemMaskForm(current => ({ ...current, appendType: event.target.value }))}
                >
                  <option value="">Yok</option>
                  <option value="sayi">Hane sayi</option>
                  <option value="harf">Hane harf</option>
                  <option value="karisik">Hane karisik</option>
                </select>
              </div>
            </div>

            <div>
              <label className="f-label">Hane</label>
              <input
                className="f-input"
                type="number"
                min="1"
                max="20"
                value={systemMaskForm.appendLen}
                onChange={event => setSystemMaskForm(current => ({ ...current, appendLen: event.target.value }))}
              />
            </div>
          </div>

          <div
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: '14px 16px',
              background: '#f8fafc',
              display: 'flex',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Onizleme</div>
              <div style={{ marginTop: 4, fontFamily: 'monospace', fontSize: '.94rem', fontWeight: 800, color: '#0f172a' }}>
                {systemSkuPreview}
              </div>
            </div>
            <div style={{ fontSize: '.78rem', color: '#64748b' }}>
              {appendLabel(systemMaskForm.appendType, systemMaskForm.appendLen)}
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmRecord}
        title={`"${confirmRecord?.name}" silinsin mi?`}
        desc="Kategori soft delete ile pasife alinacak. Gerekirse Tum kayitlar veya Silinmis kayitlar gorunumunden geri alinabilir."
        onConfirm={() => removeCategory(confirmRecord)}
        onCancel={() => setConfirmRecord(null)}
      />
    </div>
  )
}
