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
    <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, borderLeft: '4px solid #f5a623', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
      <h3 style={{ margin: 0, fontWeight: 800, fontSize: '1.5rem', color: '#111111' }}>
        {isEdit ? 'Kaydı Düzenle' : 'Yeni Kayıt'}
      </h3>

      {(editor.kind === 'hall' || editor.kind === 'section') && (
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: '.9rem', color: '#111111' }}>
            {editor.kind === 'hall' ? 'Salon Adı' : 'Bölge Adı'}
          </label>
          <input className="f-input" value={form.name || ''} onChange={event => onChange('name', event.target.value)} />
        </div>
      )}

      {editor.kind === 'hall' && (
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: '.9rem', color: '#111111' }}>Kod</label>
          <input className="f-input" value={form.code || ''} onChange={event => onChange('code', event.target.value)} />
        </div>
      )}

      {isTable && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: '.9rem', color: '#111111' }}>Masa Adı</label>
            <input className="f-input" value={form.tableName || ''} onChange={event => onChange('tableName', event.target.value)} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: '.9rem', color: '#111111' }}>Masa Numarası</label>
            <input className="f-input" value={form.tableNumber || ''} onChange={event => onChange('tableNumber', event.target.value)} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: '.9rem', color: '#111111' }}>Masa Kodu</label>
            <input className="f-input" value={form.tableCode || ''} onChange={event => onChange('tableCode', event.target.value)} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: '.9rem', color: '#111111' }}>Masa Tipi</label>
            <select className="f-input" value={form.tableType || 'round'} onChange={event => onChange('tableType', event.target.value)}>
              <option value="round">Yuvarlak</option>
              <option value="square">Kare</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: '.9rem', color: '#111111' }}>Kapasite</label>
            <input className="f-input" value={form.capacity || ''} onChange={event => onChange('capacity', event.target.value)} type="number" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: '.9rem', color: '#111111' }}>Durum</label>
            <select className="f-input" value={form.status || 'active'} onChange={event => onChange('status', event.target.value)}>
              <option value="active">Aktif</option>
              <option value="inactive">Pasif</option>
            </select>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', marginTop: 16 }}>
        <button type="button" className="btn-o table-mgmt-btn" style={{ padding: '10px 24px' }} onClick={onCancel}>İptal</button>
        <button type="button" className="btn-p table-mgmt-btn" style={{ padding: '10px 24px', background: '#f5a623', borderColor: '#f5a623', color: '#fff' }} disabled={saving} onClick={onSubmit}>
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
  const badgeStyle = (color) => ({
    width: 48,
    height: 48,
    borderRadius: '12px',
    background: color,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: '1.25rem',
    flexShrink: 0,
  })

  const cardContainerStyle = { padding: 24, display: 'flex', flexDirection: 'column', gap: 20, borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }

  if (!node) {
    return (
      <div className="card" style={{ ...cardContainerStyle, minHeight: 320, alignItems: 'center', justifyContent: 'center' }}>
        <i className="fa-solid fa-sitemap" style={{ fontSize: 56, color: '#888888', marginBottom: 16 }} />
        <h3 style={{ margin: 0, color: '#111111', fontSize: '1.25rem', fontWeight: 700 }}>Bir salon, bölge veya masa seçin</h3>
        <p style={{ margin: '8px 0 0', color: '#888888', textAlign: 'center' }}>Sol panelden bir öğeye tıklayarak detaylarını görüntüleyin veya düzenleyin.</p>
      </div>
    )
  }

  if (node.entityType === 'hall') {
    return (
      <div className="card" style={cardContainerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={badgeStyle('#38bdf8')}>
            <i className="fa-solid fa-warehouse" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontWeight: 800, fontSize: '1.5rem', color: '#111111' }}>{node.hall.name || 'Salon'}</h3>
            <p style={{ margin: '4px 0 0', color: '#888888' }}>Kod: {node.hall.code || '-'}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button type="button" className="btn-p table-mgmt-btn" style={{ background: '#f5a623', borderColor: '#f5a623', color: '#fff' }} onClick={() => onOpenEditor('edit-hall', node)}>Salon Düzenle</button>
            <button type="button" className="btn-o table-mgmt-btn" style={{ color: '#a78bfa', borderColor: '#a78bfa' }} onClick={() => onOpenEditor('create-section', node)}>Altına Bölge Ekle</button>
            <button type="button" className="btn-o table-mgmt-btn" style={{ color: '#38bdf8', borderColor: '#38bdf8' }} onClick={() => onPrintGroup('hall', node)}>QR Yazdır</button>
          </div>
          <button type="button" className="btn-o table-mgmt-btn" style={{ color: '#ef4444', borderColor: '#ef4444', padding: '6px 12px', fontSize: '0.85rem' }} onClick={() => onArchive(node)}>Arşivle</button>
        </div>
      </div>
    )
  }

  if (node.entityType === 'section') {
    return (
      <div className="card" style={cardContainerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={badgeStyle('#a78bfa')}>
            <i className="fa-solid fa-folder-tree" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontWeight: 800, fontSize: '1.5rem', color: '#111111' }}>{node.section.name || 'Bölge'}</h3>
            <p style={{ margin: '4px 0 0', color: '#888888' }}>Bağlı Salon: {node.parentLabel || '-'}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button type="button" className="btn-p table-mgmt-btn" style={{ background: '#f5a623', borderColor: '#f5a623', color: '#fff' }} onClick={() => onOpenEditor('edit-section', node)}>Bölge Düzenle</button>
            <button type="button" className="btn-o table-mgmt-btn" style={{ color: '#a78bfa', borderColor: '#a78bfa' }} onClick={() => onOpenEditor('create-table', node)}>Altına Masa Ekle</button>
            <button type="button" className="btn-o table-mgmt-btn" style={{ color: '#38bdf8', borderColor: '#38bdf8' }} onClick={() => onPrintGroup('section', node)}>QR Yazdır</button>
          </div>
          <button type="button" className="btn-o table-mgmt-btn" style={{ color: '#ef4444', borderColor: '#ef4444', padding: '6px 12px', fontSize: '0.85rem' }} onClick={() => onArchive(node)}>Arşivle</button>
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

  const copyToClipboard = () => {
    navigator.clipboard.writeText(qrPayload)
  }

  const isActive = node.table.status === 'active'

  return (
    <div className="card" style={cardContainerStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={badgeStyle('#f5a623')}>
          <i className="fa-solid fa-utensils" />
        </div>
        <div>
          <h3 style={{ margin: 0, fontWeight: 800, fontSize: '1.5rem', color: '#111111' }}>{node.table.table_name || node.table.table_number || 'Masa'}</h3>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <span style={{ background: '#f1f5f9', color: '#334155', padding: '4px 8px', borderRadius: 6, fontSize: '0.8rem', fontWeight: 600 }}>🔢 No: {node.table.table_number || '-'}</span>
            <span style={{ background: '#f1f5f9', color: '#334155', padding: '4px 8px', borderRadius: 6, fontSize: '0.8rem', fontWeight: 600 }}>👥 {node.table.capacity || '-'} Kişi</span>
            <span style={{ background: isActive ? '#dcfce7' : '#fee2e2', color: isActive ? '#166534' : '#991b1b', padding: '4px 8px', borderRadius: 6, fontSize: '0.8rem', fontWeight: 600 }}>
              {isActive ? '🟢 Aktif' : '🔴 Pasif'}
            </span>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', borderRadius: 8, padding: '12px 16px', gap: 12 }}>
        <code style={{ flex: 1, fontSize: '.85rem', color: '#111111', wordBreak: 'break-all', fontFamily: 'monospace' }}>
          {qrPayload}
        </code>
        <button type="button" onClick={copyToClipboard} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#888888', padding: 4 }} title="Kopyala">
          <i className="fa-regular fa-copy" style={{ fontSize: '1.1rem' }} />
        </button>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" className="btn-p table-mgmt-btn" style={{ background: '#f5a623', borderColor: '#f5a623', color: '#fff' }} onClick={() => onOpenEditor('edit-table', node)}>Düzenle</button>
          <button type="button" className="btn-o table-mgmt-btn" style={{ color: '#a78bfa', borderColor: '#a78bfa' }} onClick={() => onRegenerateQr(node)}>QR Yenile</button>
          <button type="button" className="btn-o table-mgmt-btn" style={{ color: '#38bdf8', borderColor: '#38bdf8' }} onClick={() => onPrintSingle(node)}>QR Yazdır</button>
        </div>
        <button type="button" className="btn-o table-mgmt-btn" style={{ color: '#ef4444', borderColor: '#ef4444', padding: '6px 12px', fontSize: '0.85rem' }} onClick={() => onArchive(node)}>Arşivle</button>
      </div>
    </div>
  )
}

export default function TableManagement() {
  const { branchId, branch } = useWorkspace()
  const toast = useToast()
  
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
        if (!cancelled) toast(loadError?.message || 'Masa kataloğu yüklenemedi.', 'error')
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
      toast('Kayıt güncellendi.', 'success')
    } catch (saveError) {
      toast(saveError?.message || 'Kayıt kaydedilemedi.', 'error')
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
      toast('Kayıt arşive alındı.', 'success')
    } catch (archiveError) {
      toast(archiveError?.message || 'Kayıt arşivlenemedi.', 'error')
    }
  }

  async function handleRegenerateQr(node) {
    if (!node?.table?.id) return
    
    try {
      const nextTable = await regenerateTableQr(node.table.id, branchId)
      await refreshCatalog(`table:${nextTable.id}`)
      toast('QR yenilendi.', 'success')
    } catch (qrError) {
      toast(qrError?.message || 'QR yenilenemedi.', 'error')
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
      <style>{`
        .table-mgmt-btn {
          transition: transform 0.15s ease;
        }
        .table-mgmt-btn:hover {
          transform: translateY(-1px);
        }
        .tree-breadcrumb-header {
          background: #fef3c7;
          color: #b45309;
          padding: 8px 16px;
          font-size: 0.85rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .tree-panel-wrap > div > .flex.justify-between,
        .tree-panel-wrap .tree-explorer-header {
          display: none !important;
        }
      `}</style>
      <Header
        title="Masa Düzeni"
        subtitle={`${branch?.name || 'Şube'} için salon, bölge ve masaları yönetin`}
        actions={
          <div style={{ display: 'flex', gap: 12 }}>
            <button type="button" className="btn-o table-mgmt-btn" style={{ color: '#111111', borderColor: '#e2e8f0', padding: '8px 12px' }} title="Toplu QR Yazdır" onClick={() => openPrint('branch', selectedDecoratedNode)}>
              <i className="fa-solid fa-print" />
            </button>
            <button type="button" className="btn-p table-mgmt-btn" style={{ background: '#f5a623', borderColor: '#f5a623', color: '#fff' }} onClick={() => openEditor('create-hall')}>
              <i className="fa-solid fa-plus" style={{ marginRight: 8 }} />
              Salon Ekle
            </button>
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '480px minmax(0, 1fr)', gap: 20, marginTop: 24, alignItems: 'start' }}>
        <div className="card tree-panel-wrap" style={{ padding: 0, overflow: 'hidden', minHeight: 'calc(100vh - 180px)', background: '#f8fafc', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
          <div className="tree-breadcrumb-header">
            <span>AĞAÇ GÖRÜNÜMÜ &bull; Salon &gt; Bölge &gt; Masa</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button type="button" onClick={() => setExpandedIds(getTreeExpandableIds(treeWithParents))} title="Tümünü Aç" style={{ background: 'transparent', border: 'none', color: '#b45309', cursor: 'pointer', padding: 4 }}>
                <i className="fa-solid fa-expand-alt" />
              </button>
              <button type="button" onClick={() => setExpandedIds([])} title="Tümünü Kapat" style={{ background: 'transparent', border: 'none', color: '#b45309', cursor: 'pointer', padding: 4 }}>
                <i className="fa-solid fa-compress-alt" />
              </button>
            </div>
          </div>
          <div style={{ padding: '8px 0' }}>
            <TreeExplorer
              nodes={treeWithParents}
              loading={loading}
              emptyText="Bu şube için kayıt bulunamadı."
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
              getNodeMeta={getNodeMeta}
            />
          </div>
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
