import { useEffect, useMemo, useState } from 'react'
import TreeExplorer, { findTreeNode, getTreeExpandableIds } from '@/components/ui/TreeExplorer'
import TableQrPrintModal from '@/components/pos/TableQrPrintModal'
import { buildPosTableQrPayload, getQrMenuBaseUrl } from '@/lib/posQrService'
import {
  archiveHall,
  archiveSection,
  archiveTable,
  createHall,
  createSection,
  createTable,
  loadTableManagementCatalog,
  regenerateTableQr,
  updateHall,
  updateSection,
  updateTable,
} from '@/lib/posTableCatalogService'

function panelStyle() {
  return {
    borderRadius: 18,
    border: '1px solid rgba(148,163,184,.16)',
    background: 'rgba(15,23,42,.78)',
    padding: 16,
  }
}

function fieldStyle() {
  return {
    width: '100%',
    minHeight: 42,
    borderRadius: 12,
    border: '1px solid rgba(148,163,184,.24)',
    background: 'rgba(255,255,255,.04)',
    color: '#fff',
    padding: '0 12px',
    outline: 'none',
  }
}

function actionButtonStyle(color = '#fbbf24') {
  return {
    minHeight: 38,
    borderRadius: 12,
    border: '1px solid rgba(148,163,184,.18)',
    background: 'rgba(255,255,255,.04)',
    color,
    fontWeight: 800,
    padding: '0 12px',
    cursor: 'pointer',
  }
}

function getNodeMeta(node) {
  if (node.entityType === 'hall') {
    return { icon: 'fa-warehouse', color: '#38bdf8' }
  }
  if (node.entityType === 'section') {
    return { icon: 'fa-folder-tree', color: '#a78bfa' }
  }
  return { icon: 'fa-utensils', color: '#fbbf24' }
}

function buildPrintRecords(scope, node, catalog) {
  if (!node) return []
  const hallsById = new Map((catalog.halls || []).map(item => [item.id, item]))
  const sectionsById = new Map((catalog.sections || []).map(item => [item.id, item]))
  const tables = (catalog.tables || []).filter(table => table.status === 'active' && table.is_active !== false)

  const normalizeRecord = table => ({
    id: table.id,
    hallName: hallsById.get(table.hall_id)?.name || '',
    sectionName: sectionsById.get(table.section_id)?.name || '',
    tableName: table.table_name || '',
    tableNumber: table.table_number || '',
    tableType: table.table_type || 'round',
    qrToken: table.qr_token || '',
    qrPayloadVersion: table.qr_payload_version || 1,
  })

  if (scope === 'table' && node.table) return [normalizeRecord(node.table)]
  if (scope === 'section' && node.section) {
    return tables.filter(table => table.section_id === node.section.id).map(normalizeRecord)
  }
  if (scope === 'hall' && node.hall) {
    return tables.filter(table => table.hall_id === node.hall.id).map(normalizeRecord)
  }
  return tables.map(normalizeRecord)
}

function EditorForm({
  editor,
  form,
  saving,
  onChange,
  onCancel,
  onSubmit,
}) {
  if (!editor) return null

  const isTable = editor.kind === 'table'
  const isEdit = editor.mode === 'edit'

  return (
    <div style={{ ...panelStyle(), display: 'grid', gap: 12 }}>
      <div style={{ color: '#fff', fontWeight: 900, fontSize: '1rem' }}>
        {isEdit ? 'Kaydi Duzenle' : 'Yeni Kayit'}
      </div>

      {(editor.kind === 'hall' || editor.kind === 'section') && (
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ color: '#cbd5e1', fontSize: '.8rem', fontWeight: 700 }}>{editor.kind === 'hall' ? 'Salon Adi' : 'Bolge Adi'}</span>
          <input value={form.name || ''} onChange={event => onChange('name', event.target.value)} style={fieldStyle()} />
        </label>
      )}

      {editor.kind === 'hall' && (
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ color: '#cbd5e1', fontSize: '.8rem', fontWeight: 700 }}>Kod</span>
          <input value={form.code || ''} onChange={event => onChange('code', event.target.value)} style={fieldStyle()} />
        </label>
      )}

      {isTable && (
        <>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ color: '#cbd5e1', fontSize: '.8rem', fontWeight: 700 }}>Masa Adi</span>
            <input value={form.tableName || ''} onChange={event => onChange('tableName', event.target.value)} style={fieldStyle()} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ color: '#cbd5e1', fontSize: '.8rem', fontWeight: 700 }}>Masa Numarasi</span>
            <input value={form.tableNumber || ''} onChange={event => onChange('tableNumber', event.target.value)} style={fieldStyle()} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ color: '#cbd5e1', fontSize: '.8rem', fontWeight: 700 }}>Masa Tipi</span>
            <select value={form.tableType || 'round'} onChange={event => onChange('tableType', event.target.value)} style={fieldStyle()}>
              <option value="round">Yuvarlak</option>
              <option value="square">Kare</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ color: '#cbd5e1', fontSize: '.8rem', fontWeight: 700 }}>Masa Kodu</span>
            <input value={form.tableCode || ''} onChange={event => onChange('tableCode', event.target.value)} style={fieldStyle()} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ color: '#cbd5e1', fontSize: '.8rem', fontWeight: 700 }}>Kapasite</span>
            <input value={form.capacity || ''} onChange={event => onChange('capacity', event.target.value)} style={fieldStyle()} inputMode="numeric" />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ color: '#cbd5e1', fontSize: '.8rem', fontWeight: 700 }}>Durum</span>
            <select value={form.status || 'active'} onChange={event => onChange('status', event.target.value)} style={fieldStyle()}>
              <option value="active">Aktif</option>
              <option value="inactive">Pasif</option>
            </select>
          </label>
        </>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" style={actionButtonStyle('#cbd5e1')} onClick={onCancel}>Iptal</button>
        <button type="button" style={actionButtonStyle('#fbbf24')} disabled={saving} onClick={onSubmit}>
          {saving ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
      </div>
    </div>
  )
}

function TableNodeDetail({
  node,
  branchId,
  onOpenEditor,
  onArchive,
  onRegenerateQr,
  onPrintSingle,
  onPrintGroup,
}) {
  if (!node) {
    return (
      <div style={{ ...panelStyle(), minHeight: 260, color: '#94a3b8' }}>
        Soldaki agactan salon, bolge veya masa secin.
      </div>
    )
  }

  if (node.entityType === 'hall') {
    return (
      <div style={{ ...panelStyle(), display: 'grid', gap: 12 }}>
        <div style={{ color: '#fff', fontWeight: 900, fontSize: '1.02rem' }}>{node.hall.name || 'Salon'}</div>
        <div style={{ color: '#94a3b8', fontSize: '.84rem' }}>Kod: {node.hall.code || '-'}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={actionButtonStyle('#38bdf8')} onClick={() => onOpenEditor('edit-hall', node)}>Salon Duzenle</button>
          <button type="button" style={actionButtonStyle('#a78bfa')} onClick={() => onOpenEditor('create-section', node)}>Altina Bolge Ekle</button>
          <button type="button" style={actionButtonStyle('#fbbf24')} onClick={() => onPrintGroup('hall', node)}>Salon QR Yazdir</button>
          <button type="button" style={actionButtonStyle('#f87171')} onClick={() => onArchive(node)}>Arsivle</button>
        </div>
      </div>
    )
  }

  if (node.entityType === 'section') {
    return (
      <div style={{ ...panelStyle(), display: 'grid', gap: 12 }}>
        <div style={{ color: '#fff', fontWeight: 900, fontSize: '1.02rem' }}>{node.section.name || 'Bolge'}</div>
        <div style={{ color: '#94a3b8', fontSize: '.84rem' }}>Bagli salon: {node.parentLabel || '-'}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={actionButtonStyle('#38bdf8')} onClick={() => onOpenEditor('edit-section', node)}>Bolge Duzenle</button>
          <button type="button" style={actionButtonStyle('#a78bfa')} onClick={() => onOpenEditor('create-table', node)}>Altina Masa Ekle</button>
          <button type="button" style={actionButtonStyle('#fbbf24')} onClick={() => onPrintGroup('section', node)}>Bolge QR Yazdir</button>
          <button type="button" style={actionButtonStyle('#f87171')} onClick={() => onArchive(node)}>Arsivle</button>
        </div>
      </div>
    )
  }

  const qrPayload = buildPosTableQrPayload({
    branchId,
    tableId: node.table.id,
    tableToken: node.table.qr_token,
    version: node.table.qr_payload_version || 1,
    baseUrl: getQrMenuBaseUrl(),
  })

  return (
      <div style={{ ...panelStyle(), display: 'grid', gap: 12 }}>
      <div style={{ color: '#fff', fontWeight: 900, fontSize: '1.02rem' }}>{node.table.table_name || node.table.table_number || 'Masa'}</div>
      <div style={{ color: '#cbd5e1', fontSize: '.88rem' }}>Masa No: {node.table.table_number || '-'}</div>
      <div style={{ color: '#cbd5e1', fontSize: '.88rem' }}>Tip: {node.table.table_type === 'square' ? 'Kare' : 'Yuvarlak'} / Kapasite: {node.table.capacity || '-'}</div>
      <div style={{ color: node.table.status === 'active' ? '#86efac' : '#fca5a5', fontSize: '.86rem', fontWeight: 800 }}>
        Durum: {node.table.status === 'active' ? 'Aktif' : 'Pasif'}
      </div>
      <div style={{ color: '#94a3b8', fontSize: '.82rem', lineHeight: 1.5, wordBreak: 'break-all' }}>{qrPayload}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" style={actionButtonStyle('#38bdf8')} onClick={() => onOpenEditor('edit-table', node)}>Masa Duzenle</button>
        <button type="button" style={actionButtonStyle('#fbbf24')} onClick={() => onRegenerateQr(node)}>QR Yenile</button>
        <button type="button" style={actionButtonStyle('#22c55e')} onClick={() => onPrintSingle(node)}>QR Yazdir</button>
        <button type="button" style={actionButtonStyle('#f87171')} onClick={() => onArchive(node)}>Arsivle</button>
      </div>
    </div>
  )
}

export default function TableManagementModal({
  open,
  branchId,
  branchName,
  onClose,
  embedded = false,
}) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [catalog, setCatalog] = useState({ halls: [], sections: [], tables: [], tree: [] })
  const [selectedId, setSelectedId] = useState('')
  const [expandedIds, setExpandedIds] = useState([])
  const [editor, setEditor] = useState(null)
  const [form, setForm] = useState({})
  const [printState, setPrintState] = useState({ open: false, title: '', records: [] })

  const refreshCatalog = async (preferredSelectedId = '') => {
    const nextCatalog = await loadTableManagementCatalog(branchId)
    setCatalog(nextCatalog)
    setExpandedIds(getTreeExpandableIds(nextCatalog.tree))
    setSelectedId(preferredSelectedId || nextCatalog.tree[0]?.id || '')
  }

  useEffect(() => {
    if (!open || !branchId) return
    let cancelled = false

    setLoading(true)
    setError('')

    refreshCatalog()
      .catch(loadError => {
        if (!cancelled) setError(loadError?.message || 'Masa katalogu yuklenemedi.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, branchId])

  const selectedNode = useMemo(() => findTreeNode(catalog.tree, selectedId), [catalog.tree, selectedId])

  const treeWithParents = useMemo(() => {
    const attach = (nodes, parentLabel = '') => (
      (nodes || []).map(node => ({
        ...node,
        parentLabel,
        children: attach(node.children || [], node.label),
      }))
    )
    return attach(catalog.tree)
  }, [catalog.tree])

  const selectedDecoratedNode = useMemo(() => findTreeNode(treeWithParents, selectedId), [treeWithParents, selectedId])

  function openEditor(mode, node = null) {
    setError('')
    setNotice('')
    if (mode === 'create-hall') {
      setEditor({ mode, kind: 'hall', node: null })
      setForm({ name: '', code: '' })
      return
    }
    if (mode === 'edit-hall') {
      setEditor({ mode, kind: 'hall', node })
      setForm({ name: node?.hall?.name || '', code: node?.hall?.code || '' })
      return
    }
    if (mode === 'create-section') {
      setEditor({ mode, kind: 'section', node })
      setForm({ name: '' })
      return
    }
    if (mode === 'edit-section') {
      setEditor({ mode, kind: 'section', node })
      setForm({ name: node?.section?.name || '' })
      return
    }
    if (mode === 'create-table') {
      setEditor({ mode, kind: 'table', node })
      setForm({ tableName: '', tableNumber: '', tableType: 'round', tableCode: '', capacity: '', status: 'active' })
      return
    }
    if (mode === 'edit-table') {
      setEditor({ mode, kind: 'table', node })
      setForm({
        tableName: node?.table?.table_name || '',
        tableNumber: node?.table?.table_number || '',
        tableType: node?.table?.table_type || 'round',
        tableCode: node?.table?.table_code || '',
        capacity: node?.table?.capacity ?? '',
        status: node?.table?.status || 'active',
      })
    }
  }

  function closeEditor() {
    setEditor(null)
    setForm({})
  }

  async function handleSave() {
    if (!editor) return
    setSaving(true)
    setError('')
    setNotice('')

    try {
      let nextSelectedId = selectedId

      if (editor.mode === 'create-hall') {
        const hall = await createHall({ branchId, name: form.name, code: form.code })
        nextSelectedId = `hall:${hall.id}`
      } else if (editor.mode === 'edit-hall') {
        const hall = await updateHall(editor.node.hall.id, { branchId, name: form.name, code: form.code })
        nextSelectedId = `hall:${hall.id}`
      } else if (editor.mode === 'create-section') {
        const section = await createSection({ branchId, hallId: editor.node.hall.id, name: form.name })
        nextSelectedId = `section:${section.id}`
      } else if (editor.mode === 'edit-section') {
        const section = await updateSection(editor.node.section.id, { branchId, name: form.name })
        nextSelectedId = `section:${section.id}`
      } else if (editor.mode === 'create-table') {
        const parentSection = editor.node?.section
        if (!parentSection?.id) throw new Error('Masa eklemek icin once bolge secin.')
        const table = await createTable({
          branchId,
          hallId: parentSection.hall_id,
          sectionId: parentSection.id,
          tableName: form.tableName,
          tableNumber: form.tableNumber,
          tableType: form.tableType,
          tableCode: form.tableCode,
          capacity: form.capacity,
          status: form.status,
        })
        nextSelectedId = `table:${table.id}`
      } else if (editor.mode === 'edit-table') {
        const table = await updateTable(editor.node.table.id, {
          branchId,
          tableName: form.tableName,
          tableNumber: form.tableNumber,
          tableType: form.tableType,
          tableCode: form.tableCode,
          capacity: form.capacity,
          status: form.status,
        })
        nextSelectedId = `table:${table.id}`
      }

      await refreshCatalog(nextSelectedId)
      closeEditor()
      setNotice('Kayit guncellendi.')
    } catch (saveError) {
      setError(saveError?.message || 'Kayit kaydedilemedi.')
    } finally {
      setSaving(false)
    }
  }

  async function handleArchive(node) {
    if (!node) return
    const confirmed = window.confirm('Secili kayit arsivlensin mi?')
    if (!confirmed) return
    setError('')
    setNotice('')
    try {
      if (node.entityType === 'hall') await archiveHall(node.hall.id, branchId)
      else if (node.entityType === 'section') await archiveSection(node.section.id, branchId)
      else await archiveTable(node.table.id, branchId)
      await refreshCatalog()
      setNotice('Kayit arsive alindi.')
    } catch (archiveError) {
      setError(archiveError?.message || 'Kayit arsivlenemedi.')
    }
  }

  async function handleRegenerateQr(node) {
    if (!node?.table?.id) return
    setError('')
    setNotice('')
    try {
      const nextTable = await regenerateTableQr(node.table.id, branchId)
      await refreshCatalog(`table:${nextTable.id}`)
      setNotice('QR yenilendi.')
    } catch (qrError) {
      setError(qrError?.message || 'QR yenilenemedi.')
    }
  }

  function openPrint(scope, node) {
    const titleMap = {
      table: 'Tek Masa QR',
      section: 'Bolge QR Yazdir',
      hall: 'Salon QR Yazdir',
      branch: 'Sube QR Yazdir',
    }
    setPrintState({
      open: true,
      title: titleMap[scope] || 'QR Yazdir',
      records: buildPrintRecords(scope, node, catalog),
    })
  }

  if (!open) return null

  const outerStyle = embedded
    ? { minHeight: '100vh', background: '#f5f5f5', padding: 22 }
    : { position: 'fixed', inset: 0, zIndex: 550, background: 'rgba(2,6,23,.72)', padding: 24, overflowY: 'auto' }

  const innerStyle = embedded
    ? { width: '100%', borderRadius: 24, background: '#020617', border: '1px solid rgba(148,163,184,.16)', padding: 20, display: 'grid', gap: 16 }
    : { width: 'min(1240px, 100%)', margin: '0 auto', borderRadius: 24, background: '#020617', border: '1px solid rgba(148,163,184,.16)', padding: 20, display: 'grid', gap: 16 }

  return (
    <>
      <div style={outerStyle}>
        <div style={innerStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div>
              <div style={{ color: '#fbbf24', fontSize: '.74rem', fontWeight: 900, letterSpacing: '.12em', textTransform: 'uppercase' }}>Masa Yonetimi</div>
              <div style={{ color: '#fff', fontSize: '1.35rem', fontWeight: 900, marginTop: 6 }}>{branchName || 'Sube'}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" style={actionButtonStyle('#38bdf8')} onClick={() => openEditor('create-hall')}>Salon Ekle</button>
              <button type="button" style={actionButtonStyle('#fbbf24')} onClick={() => openPrint('branch', selectedDecoratedNode)}>Toplu QR Yazdir</button>
              {onClose && <button type="button" style={actionButtonStyle('#cbd5e1')} onClick={onClose}>Kapat</button>}
            </div>
          </div>

          {error && (
            <div style={{ borderRadius: 14, border: '1px solid rgba(248,113,113,.28)', background: 'rgba(127,29,29,.28)', color: '#fecaca', padding: '12px 14px' }}>
              {error}
            </div>
          )}

          {notice && (
            <div style={{ borderRadius: 14, border: '1px solid rgba(74,222,128,.26)', background: 'rgba(21,128,61,.24)', color: '#dcfce7', padding: '12px 14px' }}>
              {notice}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: editor ? 'minmax(0, 1.7fr) minmax(320px, .9fr) minmax(320px, .9fr)' : 'minmax(0, 1.7fr) minmax(320px, .9fr)', gap: 18 }}>
            <TreeExplorer
              nodes={treeWithParents}
              loading={loading}
              emptyText="Bu sube icin salon, bolge veya masa kaydi bulunamadi."
              sectionTitle="Masa Agaci"
              sectionSubtitle="Salon > Bolge > Masa"
              selectedId={selectedId}
              expandedIds={expandedIds}
              onSelect={node => setSelectedId(node.id)}
              onToggle={nodeId => {
                setExpandedIds(current => (
                  current.includes(nodeId)
                    ? current.filter(id => id !== nodeId)
                    : [...current, nodeId]
                ))
              }}
              onExpandAll={() => setExpandedIds(getTreeExpandableIds(treeWithParents))}
              onCollapseAll={() => setExpandedIds([])}
              getNodeMeta={getNodeMeta}
              renderDetail={() => (
                <TableNodeDetail
                  node={selectedDecoratedNode}
                  branchId={branchId}
                  onOpenEditor={openEditor}
                  onArchive={handleArchive}
                  onRegenerateQr={handleRegenerateQr}
                  onPrintSingle={node => openPrint('table', node)}
                  onPrintGroup={openPrint}
                />
              )}
              detailEmptyTitle="Node secin"
              detailEmptyText="Soldaki agactan bir kayit secerek sag panelde detaylarini gorebilirsiniz."
              detailMinWidth={360}
            />

            {editor && (
              <EditorForm
                editor={editor}
                form={form}
                saving={saving}
                onChange={(field, value) => setForm(current => ({ ...current, [field]: value }))}
                onCancel={closeEditor}
                onSubmit={handleSave}
              />
            )}
          </div>
        </div>
      </div>

      <TableQrPrintModal
        open={printState.open}
        title={printState.title}
        branchName={branchName}
        branchId={branchId}
        records={printState.records}
        onClose={() => setPrintState({ open: false, title: '', records: [] })}
      />
    </>
  )
}
