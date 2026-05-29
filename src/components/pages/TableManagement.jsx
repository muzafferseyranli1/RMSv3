import React, { useEffect, useMemo, useState } from 'react'
import TreeExplorer, { findTreeNode, getTreeExpandableIds } from '@/components/ui/TreeExplorer'
import TableQrPrintModal from '@/components/pos/TableQrPrintModal'
import { buildPosTableQrPayload, getQrMenuBaseUrl } from '@/lib/posQrService'
import { useWorkspace } from '@/context/WorkspaceContext'
import Header from '@/components/layout/Header'
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
import { useToast } from '@/hooks/useToast'

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
    <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h3 style={{ margin: 0, fontWeight: 800, color: '#0f172a' }}>
        {isEdit ? 'Kaydı Düzenle' : 'Yeni Kayıt'}
      </h3>

      {(editor.kind === 'hall' || editor.kind === 'section') && (
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: '.9rem' }}>
            {editor.kind === 'hall' ? 'Salon Adı' : 'Bölge Adı'}
          </label>
          <input className="f-input" value={form.name || ''} onChange={event => onChange('name', event.target.value)} />
        </div>
      )}

      {editor.kind === 'hall' && (
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: '.9rem' }}>Kod</label>
          <input className="f-input" value={form.code || ''} onChange={event => onChange('code', event.target.value)} />
        </div>
      )}

      {isTable && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: '.9rem' }}>Masa Adı</label>
            <input className="f-input" value={form.tableName || ''} onChange={event => onChange('tableName', event.target.value)} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: '.9rem' }}>Masa Numarası</label>
            <input className="f-input" value={form.tableNumber || ''} onChange={event => onChange('tableNumber', event.target.value)} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: '.9rem' }}>Masa Kodu</label>
            <input className="f-input" value={form.tableCode || ''} onChange={event => onChange('tableCode', event.target.value)} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: '.9rem' }}>Masa Tipi</label>
            <select className="f-input" value={form.tableType || 'round'} onChange={event => onChange('tableType', event.target.value)}>
              <option value="round">Yuvarlak</option>
              <option value="square">Kare</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: '.9rem' }}>Kapasite</label>
            <input className="f-input" value={form.capacity || ''} onChange={event => onChange('capacity', event.target.value)} type="number" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: '.9rem' }}>Durum</label>
            <select className="f-input" value={form.status || 'active'} onChange={event => onChange('status', event.target.value)}>
              <option value="active">Aktif</option>
              <option value="inactive">Pasif</option>
            </select>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 16 }}>
        <button type="button" className="btn-o" onClick={onCancel}>İptal</button>
        <button type="button" className="btn-p" disabled={saving} onClick={onSubmit}>
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
      <div className="card" style={{ padding: 24, minHeight: 260, color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Soldaki ağaçtan salon, bölge veya masa seçin.
      </div>
    )
  }

  if (node.entityType === 'hall') {
    return (
      <div className="card" style={{ padding: 24, display: 'grid', gap: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontWeight: 800, fontSize: '1.25rem', color: '#0f172a' }}>{node.hall.name || 'Salon'}</h3>
          <p style={{ margin: '4px 0 0', color: '#64748b' }}>Kod: {node.hall.code || '-'}</p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" className="btn-p" onClick={() => onOpenEditor('edit-hall', node)}>Salon Düzenle</button>
          <button type="button" className="btn-o" style={{ color: '#8b5cf6', borderColor: '#8b5cf6' }} onClick={() => onOpenEditor('create-section', node)}>Altına Bölge Ekle</button>
          <button type="button" className="btn-o" style={{ color: '#f59e0b', borderColor: '#f59e0b' }} onClick={() => onPrintGroup('hall', node)}>Salon QR Yazdır</button>
          <button type="button" className="btn-o" style={{ color: '#ef4444', borderColor: '#ef4444' }} onClick={() => onArchive(node)}>Arşivle</button>
        </div>
      </div>
    )
  }

  if (node.entityType === 'section') {
    return (
      <div className="card" style={{ padding: 24, display: 'grid', gap: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontWeight: 800, fontSize: '1.25rem', color: '#0f172a' }}>{node.section.name || 'Bölge'}</h3>
          <p style={{ margin: '4px 0 0', color: '#64748b' }}>Bağlı Salon: {node.parentLabel || '-'}</p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" className="btn-p" onClick={() => onOpenEditor('edit-section', node)}>Bölge Düzenle</button>
          <button type="button" className="btn-o" style={{ color: '#8b5cf6', borderColor: '#8b5cf6' }} onClick={() => onOpenEditor('create-table', node)}>Altına Masa Ekle</button>
          <button type="button" className="btn-o" style={{ color: '#f59e0b', borderColor: '#f59e0b' }} onClick={() => onPrintGroup('section', node)}>Bölge QR Yazdır</button>
          <button type="button" className="btn-o" style={{ color: '#ef4444', borderColor: '#ef4444' }} onClick={() => onArchive(node)}>Arşivle</button>
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
    <div className="card" style={{ padding: 24, display: 'grid', gap: 16 }}>
      <div>
        <h3 style={{ margin: 0, fontWeight: 800, fontSize: '1.25rem', color: '#0f172a' }}>{node.table.table_name || node.table.table_number || 'Masa'}</h3>
        <p style={{ margin: '4px 0 0', color: '#64748b' }}>Masa No: {node.table.table_number || '-'}</p>
        <p style={{ margin: '4px 0 0', color: '#64748b' }}>Tip: {node.table.table_type === 'square' ? 'Kare' : 'Yuvarlak'} / Kapasite: {node.table.capacity || '-'}</p>
        <p style={{ margin: '4px 0 0', fontWeight: 700, color: node.table.status === 'active' ? '#10b981' : '#ef4444' }}>
          Durum: {node.table.status === 'active' ? 'Aktif' : 'Pasif'}
        </p>
      </div>
      <div style={{ padding: 12, background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 8, fontSize: '.85rem', color: '#64748b', wordBreak: 'break-all' }}>
        {qrPayload}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" className="btn-p" onClick={() => onOpenEditor('edit-table', node)}>Masa Düzenle</button>
        <button type="button" className="btn-o" style={{ color: '#38bdf8', borderColor: '#38bdf8' }} onClick={() => onRegenerateQr(node)}>QR Yenile</button>
        <button type="button" className="btn-o" style={{ color: '#10b981', borderColor: '#10b981' }} onClick={() => onPrintSingle(node)}>QR Yazdır</button>
        <button type="button" className="btn-o" style={{ color: '#ef4444', borderColor: '#ef4444' }} onClick={() => onArchive(node)}>Arşivle</button>
      </div>
    </div>
  )
}

export default function TableManagement() {
  const { branchId, branch } = useWorkspace()
  const { addToast } = useToast()
  
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
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
    if (!branchId) return
    let cancelled = false

    setLoading(true)

    refreshCatalog()
      .catch(loadError => {
        if (!cancelled) addToast({ title: 'Hata', description: loadError?.message || 'Masa kataloğu yüklenemedi.', type: 'error' })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [branchId])

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
        if (!parentSection?.id) throw new Error('Masa eklemek için önce bölge seçin.')
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
      addToast({ title: 'Başarılı', description: 'Kayıt güncellendi.', type: 'success' })
    } catch (saveError) {
      addToast({ title: 'Hata', description: saveError?.message || 'Kayıt kaydedilemedi.', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function handleArchive(node) {
    if (!node) return
    const confirmed = window.confirm('Seçili kayıt arşivlensin mi?')
    if (!confirmed) return
    
    try {
      if (node.entityType === 'hall') await archiveHall(node.hall.id, branchId)
      else if (node.entityType === 'section') await archiveSection(node.section.id, branchId)
      else await archiveTable(node.table.id, branchId)
      await refreshCatalog()
      addToast({ title: 'Başarılı', description: 'Kayıt arşive alındı.', type: 'success' })
    } catch (archiveError) {
      addToast({ title: 'Hata', description: archiveError?.message || 'Kayıt arşivlenemedi.', type: 'error' })
    }
  }

  async function handleRegenerateQr(node) {
    if (!node?.table?.id) return
    
    try {
      const nextTable = await regenerateTableQr(node.table.id, branchId)
      await refreshCatalog(`table:${nextTable.id}`)
      addToast({ title: 'Başarılı', description: 'QR yenilendi.', type: 'success' })
    } catch (qrError) {
      addToast({ title: 'Hata', description: qrError?.message || 'QR yenilenemedi.', type: 'error' })
    }
  }

  function openPrint(scope, node) {
    const titleMap = {
      table: 'Tek Masa QR',
      section: 'Bölge QR Yazdır',
      hall: 'Salon QR Yazdır',
      branch: 'Şube QR Yazdır',
    }
    setPrintState({
      open: true,
      title: titleMap[scope] || 'QR Yazdır',
      records: buildPrintRecords(scope, node, catalog),
    })
  }

  return (
    <div>
      <Header
        title="Masa Düzeni"
        subtitle={`${branch?.name || 'Şube'} için salon, bölge ve masaları yönetin`}
        actions={
          <div style={{ display: 'flex', gap: 12 }}>
            <button type="button" className="btn-o" style={{ color: '#f59e0b', borderColor: '#f59e0b' }} onClick={() => openPrint('branch', selectedDecoratedNode)}>
              Toplu QR Yazdır
            </button>
            <button type="button" className="btn-p" onClick={() => openEditor('create-hall')}>
              <i className="fa-solid fa-plus" style={{ marginRight: 8 }} />
              Salon Ekle
            </button>
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: editor ? '380px minmax(0, 1fr)' : '380px minmax(0, 1fr)', gap: 24, marginTop: 24, alignItems: 'start' }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <TreeExplorer
            nodes={treeWithParents}
            loading={loading}
            emptyText="Bu şube için kayıt bulunamadı."
            sectionTitle="Ağaç Görünümü"
            sectionSubtitle="Salon > Bölge > Masa"
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
          />
        </div>

        <div style={{ display: 'grid', gap: 24 }}>
          {editor ? (
            <EditorForm
              editor={editor}
              form={form}
              saving={saving}
              onChange={(field, value) => setForm(current => ({ ...current, [field]: value }))}
              onCancel={closeEditor}
              onSubmit={handleSave}
            />
          ) : (
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
        </div>
      </div>

      <TableQrPrintModal
        open={printState.open}
        title={printState.title}
        branchName={branch?.name}
        branchId={branchId}
        records={printState.records}
        onClose={() => setPrintState({ open: false, title: '', records: [] })}
      />
    </div>
  )
}
